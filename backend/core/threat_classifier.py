"""Threat + counter classifier for Pokémon TCG cards.

Stage 2 of the meta-aware tech-card feature. Pure-python module with no
side effects: takes a parsed entry from ``data/pokemon_card_effects.json``
and returns the categories of disruption it represents (threats) and/or
mitigates (counters).

The classifier is intentionally conservative: each category is gated by
patterns that have been validated against the live effect-text corpus
(see backend/tools/build_threat_intel.py for the orchestrator that uses
these). False positives waste a tech slot, false negatives leave the
user unprotected — we lean toward false negatives because the user can
always override the auto-build manually.

Categories
----------
- ``retreat_lock``    — opponent's attack/ability prevents the
                        defending Pokémon from retreating (e.g. Yveltal
                        MEG 88 Clutch). Counter: cards that switch the
                        Active (Switch / Switch Cart / Escape Rope /
                        Guzma / Mallow & Lana / Tate & Liza family).

- ``hand_disruption`` — opponent's card forces you to shuffle / discard
                        your hand (Iono, Marnie, Roxanne, Judge). Counter:
                        cards that re-fill the hand (Iono itself, Lillie's
                        Determination, Judge — symmetrical refreshers).

- ``bench_damage``    — opponent's attack does damage to YOUR benched
                        Pokémon (Kleavor VSTAR Axe Break, Larry's
                        Staraptor Feathery Strike, etc.). Counter:
                        Bench-Barrier abilities (Manaphy LOR/CRZ-GG,
                        Mr. Mime BKT/GEN, Dugtrio CG, Shaymin DRI).

- ``ability_lock``    — opponent's ability nullifies your abilities
                        (Garbodor LOR Trash Heap, Path to the Peak as
                        stadium, etc.). No clean counter pattern yet
                        (would need stadium-removal detection) — left
                        in for completeness; orchestrator skips it
                        until a counter pattern lands.

Usage
-----
    from threat_classifier import classify_card

    entry = effects_db["MEG|88"]
    tags = classify_card(entry)
    # tags == {"threats": ["retreat_lock"], "counters": []}
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Mapping, Optional, Set, Tuple


# ---------------------------------------------------------------------------
# Threat patterns
# ---------------------------------------------------------------------------

# Each entry: (compiled regex, scope) where scope in:
#   "attack.text"   — match against any attacks[*].text
#   "ability.text"  — match against any abilities[*].text
#   "rule.text"     — match against any rules[*]
#   "all.text"      — match against attack.text ∪ ability.text ∪ rule.text
THREAT_PATTERNS: Dict[str, List[Tuple[re.Pattern, str]]] = {
    "retreat_lock": [
        (re.compile(r"\b(?:can'?t|cannot)\s+retreat\b", re.IGNORECASE), "attack.text"),
        (re.compile(r"\b(?:can'?t|cannot)\s+retreat\b", re.IGNORECASE), "ability.text"),
    ],
    "hand_disruption": [
        # Iono / Marnie family — "Each player shuffles their hand …"
        (re.compile(r"each\s+player\s+shuffles\s+(?:their\s+)?hand", re.IGNORECASE), "rule.text"),
        # Roxanne / Judge family — "Each player … into their deck and draws N"
        (re.compile(r"each\s+player\s+shuffles\s+(?:their\s+)?hand\s+into\s+(?:their\s+)?deck", re.IGNORECASE), "rule.text"),
        # Targeted discards from opponent's hand (Lusamine, Rocket's Crooked Scientist,
        # Team Yell's Cheer, etc.).
        (re.compile(r"discard.*\d+.*card.*from\s+(?:your\s+)?opponent'?s\s+hand", re.IGNORECASE), "rule.text"),
        (re.compile(r"discard.*\d+.*card.*from\s+(?:your\s+)?opponent'?s\s+hand", re.IGNORECASE), "attack.text"),
    ],
    "bench_damage": [
        # Attacks that hit benched Pokémon directly. Wide pattern; the
        # orchestrator filters by meta-share so only popular bench-damage
        # decks surface as active threats.
        (re.compile(
            r"damage\s+to\s+(?:\d+\s+of\s+|each\s+of\s+)?your\s+opponent'?s\s+benched\s+pok[ée]mon",
            re.IGNORECASE,
        ), "attack.text"),
    ],
    "ability_lock": [
        # Garbodor "Trash Heap" wording: "Each Pokémon (both yours and
        # your opponent's) … has no Abilities".
        (re.compile(r"(?:each|every|all).*pok[ée]mon.*(?:has|have)\s+no\s+abilit", re.IGNORECASE), "ability.text"),
        # Stadium / item form: "Pokémon … in play … have no Abilities"
        (re.compile(r"pok[ée]mon.*in\s+play.*(?:has|have)\s+no\s+abilit", re.IGNORECASE), "rule.text"),
    ],
}


# ---------------------------------------------------------------------------
# Counter patterns
# ---------------------------------------------------------------------------

# Counter cards are typically Trainers (Supporters / Items) or have a
# specific Ability. Their patterns generally trigger on the trainer
# rule text (.card-text-section) or the ability text.
COUNTER_PATTERNS: Dict[str, List[Tuple[re.Pattern, str]]] = {
    "retreat_lock": [
        # Switch / Switch Cart / Escape Rope / Guzma / Mallow & Lana /
        # Tate & Liza — anything that swaps the Active with a Bench
        # Pokémon. Restricted via card_type to Supporter/Item/Tool.
        (re.compile(r"switch\s+(?:your\s+)?active\s+pok[ée]mon\s+with\s+(?:1\s+of\s+)?your\s+benched", re.IGNORECASE), "rule.text"),
        # Guzma-style: "Switch ... your opponent's Active Pokémon ..." —
        # also gets us out of retreat lock (we re-position)
        (re.compile(r"switch\s+your\s+opponent'?s\s+active", re.IGNORECASE), "rule.text"),
    ],
    "hand_disruption": [
        # Symmetrical refreshers (Iono itself, Marnie, Judge — playing
        # them un-bricks our own hand, even if it disrupts opponent too)
        (re.compile(r"each\s+player\s+shuffles\s+(?:their\s+)?hand", re.IGNORECASE), "rule.text"),
        # Targeted refreshers (Lillie's Determination — "shuffle your
        # hand into your deck and draw N cards")
        (re.compile(r"shuffle\s+your\s+hand\s+into\s+your\s+deck\s+and\s+draw", re.IGNORECASE), "rule.text"),
    ],
    "bench_damage": [
        # Manaphy / Mr. Mime / Shaymin / Dugtrio — Bench Barrier ability
        (re.compile(r"prevent\s+all\s+damage.*to\s+your\s+benched\s+pok[ée]mon", re.IGNORECASE), "ability.text"),
    ],
    "ability_lock": [
        # No clean text pattern yet — would need to detect stadium /
        # tool removal coupled with the lock source. Left empty so the
        # orchestrator surfaces ability_lock as a known-but-uncovered
        # threat without auto-injecting a (wrong) counter.
    ],
}


# ---------------------------------------------------------------------------
# Card-type gates — which card types are eligible for which categories
# ---------------------------------------------------------------------------

# Threats can come from any card type (most are Pokémon attacks; some
# rare ones are Trainer effects e.g. Pokégear-style draw disruption).
THREAT_TYPE_GATE: Dict[str, Optional[Set[str]]] = {
    "retreat_lock": None,           # any card with the pattern
    "hand_disruption": None,
    "bench_damage": None,
    "ability_lock": None,
}

# Counters are mostly Trainers. We restrict to avoid false positives
# from random Pokémon that happen to mention "switch" in flavour text.
COUNTER_TYPE_GATE: Dict[str, Optional[Set[str]]] = {
    "retreat_lock": {"Item", "Supporter", "Tool", "Stadium"},
    "hand_disruption": {"Item", "Supporter"},
    "bench_damage": None,           # Manaphy etc. are Pokémon abilities
    "ability_lock": None,
}


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------

# Strings to exclude from rule-text matching — Limitless leaks the
# illustrator credit into .card-text-section on some pages.
_NOISE_PREFIXES = ("illus.", "illustrated by", "no.")


def _gather_text(entry: Mapping[str, Any], scope: str) -> str:
    """Concatenate the text fields matching ``scope`` into one blob."""
    if not entry:
        return ""
    parts: List[str] = []
    if scope in ("attack.text", "all.text"):
        for at in entry.get("attacks", []) or []:
            t = (at or {}).get("text") or ""
            if t:
                parts.append(t)
    if scope in ("ability.text", "all.text"):
        for ab in entry.get("abilities", []) or []:
            t = (ab or {}).get("text") or ""
            if t:
                parts.append(t)
    if scope in ("rule.text", "all.text"):
        for r in entry.get("rules", []) or []:
            if not r:
                continue
            low = r.strip().lower()
            if any(low.startswith(p) for p in _NOISE_PREFIXES):
                continue
            parts.append(r)
    return " \n ".join(parts)


def _normalize_card_type(raw: str) -> str:
    """Map Limitless's verbose card_type into the gate vocabulary.
    The scraper sometimes records "Basic" / "Stage 1" instead of
    "Pokemon" because it picks the most-specific token from the
    "Basic Pokémon" type row; treat those as Pokémon."""
    s = (raw or "").strip()
    if not s:
        return ""
    low = s.lower()
    if low in ("basic", "stage 1", "stage 2", "v", "vmax", "vstar", "ex", "tag team", "break"):
        return "Pokemon"
    return s


def classify_card(entry: Mapping[str, Any]) -> Dict[str, List[str]]:
    """Return ``{"threats": [...], "counters": [...]}`` for ``entry``.

    Both lists are deterministic (sorted) and unique. Empty entry or
    entry without any text returns ``{"threats": [], "counters": []}``.
    """
    if not entry:
        return {"threats": [], "counters": []}

    card_type = _normalize_card_type(entry.get("card_type", ""))

    threats: Set[str] = set()
    for category, patterns in THREAT_PATTERNS.items():
        gate = THREAT_TYPE_GATE.get(category)
        if gate is not None and card_type and card_type not in gate:
            continue
        for regex, scope in patterns:
            blob = _gather_text(entry, scope)
            if blob and regex.search(blob):
                threats.add(category)
                break

    counters: Set[str] = set()
    for category, patterns in COUNTER_PATTERNS.items():
        if not patterns:
            continue
        gate = COUNTER_TYPE_GATE.get(category)
        if gate is not None and card_type and card_type not in gate:
            continue
        for regex, scope in patterns:
            blob = _gather_text(entry, scope)
            if blob and regex.search(blob):
                counters.add(category)
                break

    return {
        "threats": sorted(threats),
        "counters": sorted(counters),
    }


def classify_database(effects_db: Mapping[str, Mapping[str, Any]]) -> Dict[str, Dict[str, List[str]]]:
    """Bulk classifier. Returns ``{card_id: {"threats": [...], "counters": [...]}}``
    only for cards that have at least one threat or counter tag — keeps
    the result compact. ``card_id`` keys are passed through unchanged."""
    result: Dict[str, Dict[str, List[str]]] = {}
    for cid, entry in (effects_db or {}).items():
        tags = classify_card(entry or {})
        if tags["threats"] or tags["counters"]:
            result[cid] = tags
    return result


__all__ = [
    "THREAT_PATTERNS",
    "COUNTER_PATTERNS",
    "classify_card",
    "classify_database",
]
