#!/usr/bin/env python3
"""Auto-generate beginner-friendly strategy explanations for the
Side Quest Champions teams via the Claude API.

Pipeline position: runs in champions-replica-scrape.yml right after
the scraper refreshes data/champions_replica_teams.json. For every
team that is NEW or whose Pokémon data CHANGED since the last run,
one Claude API call produces a bilingual (de + en) strategy guide
aimed at complete beginners. Results are cached in
data/champions_team_strategies.json keyed by replica code, so an
unchanged team costs zero API calls on subsequent runs.

The frontend (js/app-side-quest.js) shows the cached strategies via
an info button on each team card — no manual step anywhere.

Fail-soft policy (matches the rest of the scrape pipeline):
  * ANTHROPIC_API_KEY missing      → warning, exit 0, cache untouched
  * anthropic SDK not installed    → warning, exit 0
  * individual team generation
    fails (API error / bad JSON)   → warning, team skipped, next run
                                     retries it; successes still saved
  * 3 consecutive failures         → abort the loop (likely systemic:
                                     quota, outage), keep successes

Usage:
    python3 scripts/generate_team_strategies.py [TEAMS_JSON] [STRATEGIES_JSON]

Defaults: data/champions_replica_teams.json and
data/champions_team_strategies.json relative to the repo root (cwd).
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

MODEL = 'claude-opus-4-8'
MAX_TOKENS = 6000           # both languages in one response
MAX_GENERATIONS_PER_RUN = 25  # cost guard: full first run is ~20 teams
MAX_CONSECUTIVE_FAILURES = 3

# Bump this whenever SYSTEM_PROMPT changes in a way that should
# refresh EXISTING guides — cached entries with an older version
# regenerate on the next run even if the team itself is unchanged.
# v2: moves/abilities/items always bilingual "Deutsch (English)" /
#     "English (Deutsch)" (user request 2026-06-12).
# v4 (2026-06-13): full name+effect coverage for moves + items + a
#     new abilities reference. User-reported pilot still had English
#     names for Acrobatics / Thunderbolt / Hydro Pump / Blizzard /
#     Earth Power / Sucker Punch / Earthquake / Dragon Claw / Gale
#     Wings / Snow Warning / Defiant — none of which were in the v3
#     reference, so the model correctly refused to translate them and
#     left the English name only. v4 ships the full vocabulary that
#     appears in the 20 current top teams (~100 moves, ~35 abilities,
#     ~30 items), AND relaxes the system prompt to let Claude use its
#     training-knowledge for well-known Pokémon-localisation NAMES
#     when sure — strict no-guessing rule still applies to MECHANIC
#     values (turns, percents, conditions). Also drops the hardcoded
#     NEVER_MEGA_SPECIES list: Champions adds Mega Stones for many
#     species that have no Mega in mainline (Glimmoranite for Glimmora,
#     Chandelurite for Chandelure, …), so the heuristic was wrong.
#     Mega-form legitimacy now derives purely from whether the held
#     item is flagged as 'Mega-Stein:' in the items reference.
PROMPT_VERSION = 4

DEFAULT_TEAMS_PATH = os.path.join('data', 'champions_replica_teams.json')
DEFAULT_STRATEGIES_PATH = os.path.join('data', 'champions_team_strategies.json')
DEFAULT_MOVES_REF_PATH = os.path.join('data', 'champions_moves_reference.json')
DEFAULT_ITEMS_REF_PATH = os.path.join('data', 'champions_items_reference.json')
DEFAULT_ABILITIES_REF_PATH = os.path.join('data', 'champions_abilities_reference.json')

# Entries for teams that dropped off the top-N list are kept (teams
# rotate back in), but the cache is bounded: when it exceeds this,
# the oldest absent entries get evicted.
MAX_CACHE_ENTRIES = 80


# ─────────────────────────── pure helpers ───────────────────────────
# (everything below up to the API section is unit-tested without
#  network access — see tests/python/test_generate_team_strategies.py)

def team_hash(team: Dict[str, Any]) -> str:
    """Stable content hash over the gameplay-relevant team data.

    Only fields that change the *strategy* feed the hash: the six
    Pokémon with item/ability/moves/EVs/nature. Cosmetic fields
    (rank, date_shared, team_name) don't trigger a regeneration.
    """
    mons = []
    for p in team.get('pokemon') or []:
        mons.append({
            'name':    (p.get('name') or '').strip(),
            'item':    (p.get('item') or '').strip(),
            'ability': (p.get('ability') or '').strip(),
            'tera':    (p.get('tera_type') or '').strip(),
            'evs':     (p.get('evs') or '').strip(),
            'nature':  (p.get('nature') or '').strip(),
            'moves':   [str(m).strip() for m in (p.get('moves') or [])],
        })
    blob = json.dumps(mons, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(blob.encode('utf-8')).hexdigest()[:16]


def teams_needing_generation(
    teams: List[Dict[str, Any]],
    cache: Dict[str, Any],
    prompt_version: int = PROMPT_VERSION,
) -> List[Dict[str, Any]]:
    """Teams with no cached strategy, a stale team_hash, or a guide
    generated under an older SYSTEM_PROMPT version."""
    strategies = cache.get('strategies') or {}
    todo = []
    for team in teams:
        code = team.get('replica_code') or ''
        if not code or not team.get('pokemon'):
            continue
        entry = strategies.get(code)
        if (not entry
                or entry.get('team_hash') != team_hash(team)
                or entry.get('prompt_version') != prompt_version):
            todo.append(team)
    return todo


def prune_cache(
    cache: Dict[str, Any],
    current_codes: List[str],
    max_entries: int = MAX_CACHE_ENTRIES,
) -> int:
    """Evict the oldest entries that are no longer on the team list
    once the cache exceeds `max_entries`. Returns eviction count."""
    strategies = cache.get('strategies') or {}
    if len(strategies) <= max_entries:
        return 0
    current = set(current_codes)
    absent = [
        (entry.get('generated_at') or '', code)
        for code, entry in strategies.items()
        if code not in current
    ]
    absent.sort()  # ISO timestamps sort chronologically
    evicted = 0
    for _, code in absent:
        if len(strategies) <= max_entries:
            break
        del strategies[code]
        evicted += 1
    return evicted


def extract_json(text: str) -> Optional[Dict[str, Any]]:
    """Parse the first JSON object out of a model response.

    Tolerates surrounding prose and ```json fences. Returns None if
    nothing parseable is found.
    """
    if not text:
        return None
    # Strip code fences if present
    fence = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', text, re.DOTALL)
    candidates = [fence.group(1)] if fence else []
    # Fall back to the outermost brace span
    start = text.find('{')
    end = text.rfind('}')
    if start != -1 and end > start:
        candidates.append(text[start:end + 1])
    for cand in candidates:
        try:
            obj = json.loads(cand)
            if isinstance(obj, dict):
                return obj
        except (json.JSONDecodeError, ValueError):
            continue
    return None


def validate_strategy(obj: Any) -> Tuple[bool, str]:
    """Check the generated object has both languages with the
    required sections. Returns (ok, reason_if_not)."""
    if not isinstance(obj, dict):
        return False, 'not a dict'
    for lang in ('de', 'en'):
        block = obj.get(lang)
        if not isinstance(block, dict):
            return False, f'missing "{lang}" block'
        if not (block.get('overview') or '').strip():
            return False, f'{lang}.overview empty'
        roles = block.get('roles')
        if not isinstance(roles, list) or not roles:
            return False, f'{lang}.roles empty'
        for r in roles:
            if not isinstance(r, dict) or not r.get('name') or not r.get('role'):
                return False, f'{lang}.roles entry malformed'
        plan = block.get('game_plan')
        if not isinstance(plan, list) or len(plan) < 2:
            return False, f'{lang}.game_plan too short'
        tips = block.get('tips')
        if tips is not None and not isinstance(tips, list):
            return False, f'{lang}.tips not a list'
    return True, ''


# ─────────────────── Factual grounding (v3) ───────────────────────
# References for moves + items are loaded once from JSON. Both files
# carry an English `key` and a German `de_name`; lookups are normalized
# (lowercase, stripped) and try BOTH fields so deck JSON written in
# either language matches. The matched entries become a "Verbindliche
# Fakten"-Block in the system prompt — the model is instructed to cite
# those mechanics verbatim and not invent its own. Stops the v2-pilot
# error class (wrong Tailwind duration, missing burn-mechanic detail).

def _norm_lookup(s: str) -> str:
    return (s or '').strip().lower()


def load_reference(path: str) -> Dict[str, Any]:
    """Load a JSON reference file. Returns {} on any error (missing
    file, parse error). The generator runs without references in that
    case — same as before v3, just no facts-block injection."""
    if not os.path.isfile(path):
        return {}
    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def build_lookup_index(ref: Dict[str, Any], collection_key: str) -> Dict[str, Tuple[str, Dict[str, Any]]]:
    """Index every reference entry by both its English key and German
    name (lowercase). Value is `(canonical_english_key, entry_dict)`
    so the caller can render a stable label."""
    out: Dict[str, Tuple[str, Dict[str, Any]]] = {}
    entries = ref.get(collection_key) or {}
    for canonical, entry in entries.items():
        if not isinstance(entry, dict):
            continue
        out[_norm_lookup(canonical)] = (canonical, entry)
        de_name = entry.get('de_name')
        if de_name:
            out[_norm_lookup(de_name)] = (canonical, entry)
    return out


def collect_team_facts(
    team: Dict[str, Any],
    moves_idx: Dict[str, Tuple[str, Dict[str, Any]]],
    items_idx: Dict[str, Tuple[str, Dict[str, Any]]],
    abilities_idx: Optional[Dict[str, Tuple[str, Dict[str, Any]]]] = None,
) -> Dict[str, List[Tuple[str, Dict[str, Any]]]]:
    """Walk the team's Pokémon, collect every move / item / ability
    that has a reference entry. Deduplicated by canonical English key,
    ordered by first appearance in the team — keeps the facts block
    compact and deterministic for caching."""
    moves_seen: Dict[str, Tuple[str, Dict[str, Any]]] = {}
    items_seen: Dict[str, Tuple[str, Dict[str, Any]]] = {}
    abilities_seen: Dict[str, Tuple[str, Dict[str, Any]]] = {}
    abilities_idx = abilities_idx or {}
    for p in team.get('pokemon') or []:
        item_name = (p.get('item') or '').strip()
        if item_name:
            hit = items_idx.get(_norm_lookup(item_name))
            if hit and hit[0] not in items_seen:
                items_seen[hit[0]] = hit
        ability_name = (p.get('ability') or '').strip()
        if ability_name:
            hit = abilities_idx.get(_norm_lookup(ability_name))
            if hit and hit[0] not in abilities_seen:
                abilities_seen[hit[0]] = hit
        for m in p.get('moves') or []:
            move_name = (m or '').strip()
            if not move_name:
                continue
            hit = moves_idx.get(_norm_lookup(move_name))
            if hit and hit[0] not in moves_seen:
                moves_seen[hit[0]] = hit
    return {
        'moves':     list(moves_seen.values()),
        'items':     list(items_seen.values()),
        'abilities': list(abilities_seen.values()),
    }


def format_facts_block(facts: Dict[str, List[Tuple[str, Dict[str, Any]]]]) -> str:
    """Render the collected facts as the prompt-injection block. Empty
    string when nothing matched (no harm done, just no grounding)."""
    abilities = facts.get('abilities') or []
    if not facts['moves'] and not facts['items'] and not abilities:
        return ''
    lines: List[str] = []
    lines.append('=== VERBINDLICHE FAKTEN für diesen Team-Guide ===')
    lines.append('Diese Mechaniken UND die offiziellen deutsch/englischen Namen')
    lines.append('stammen aus der internen Referenz-Datenbank.')
    lines.append('NUTZE genau diese Effekte (Rundenzahl, %, Bedingungen) im')
    lines.append('Guide — erfinde NIEMALS abweichende MECHANIK-WERTE.')
    lines.append('Verwende für JEDE Erwähnung das zweisprachige Schema')
    lines.append('"<Deutscher Name> (<English Name>)" wie unten gelistet.')
    lines.append('')
    if facts['moves']:
        lines.append('-- Attacken --')
        for canonical, entry in facts['moves']:
            de = entry.get('de_name') or canonical
            acc = entry.get('accuracy')
            acc_str = f' [Genauigkeit {acc}%]' if acc is not None else ''
            lines.append(f"• {de} ({canonical}){acc_str}: {entry.get('effect', '')}")
        lines.append('')
    if abilities:
        lines.append('-- Fähigkeiten --')
        for canonical, entry in abilities:
            de = entry.get('de_name') or canonical
            lines.append(f"• {de} ({canonical}): {entry.get('effect', '')}")
        lines.append('')
    if facts['items']:
        lines.append('-- Items --')
        for canonical, entry in facts['items']:
            de = entry.get('de_name') or canonical
            lines.append(f"• {de} ({canonical}): {entry.get('effect', '')}")
        lines.append('')
    lines.append('=== Ende Faktenblock ===')
    return '\n'.join(lines)


# ─────────────────── Hallucination guard (v3) ─────────────────────
# Post-generation validator that catches the failure modes the user
# flagged in the v2 pilot. Each guard returns (ok, reason) so the
# generator can log WHY a strategy was rejected; rejected strategies
# are NOT cached so the next run retries them.

# Form prefixes that signal a Pokémon is in its Mega/Alolan/etc.
# form on the actual team sheet. The team JSON spells these out as
# the species name (e.g. "Charizard-Mega-Y"), so we check the species
# field for the prefix — not the move list.
FORM_PREFIXES_RE = re.compile(
    r'\b(Mega|Alolan|Galarian|Hisuian|Paldean|Primal|Origin|Ultra)\b',
    re.IGNORECASE,
)


def _team_pokemon_names(team: Dict[str, Any]) -> List[str]:
    return [(p.get('name') or '').strip() for p in team.get('pokemon') or [] if p.get('name')]


def _team_pokemon_forms(team: Dict[str, Any]) -> Dict[str, str]:
    """Return {base_species_lower: form_prefix_or_empty}. So a team
    that lists 'Charizard-Mega-Y' produces {'charizard': 'mega'} —
    used to verify whether the model can legitimately call this mon
    'Mega Charizard' in prose."""
    forms: Dict[str, str] = {}
    for n in _team_pokemon_names(team):
        parts = [p for p in re.split(r'[-\s]+', n) if p]
        if not parts:
            continue
        # Look for a form-prefix anywhere in the name
        form = ''
        species_parts = []
        for part in parts:
            if FORM_PREFIXES_RE.fullmatch(part) and not form:
                form = part.lower()
            else:
                species_parts.append(part)
        species = ' '.join(species_parts).lower().strip()
        # First mention wins per species — covers rare double-variants
        forms.setdefault(species, form)
    return forms


# Note (v4, 2026-06-13): the previous NEVER_MEGA_SPECIES hardcode was
# wrong. Pokémon Champions ships Mega Stones for many species that
# have no Mega in the mainline games (Glimmoranite for Glimmora,
# Chandelurite for Chandelure, Drampanite for Drampa, …). Mega
# legitimacy is now derived ENTIRELY from whether the held item is
# tagged 'Mega-Stein:' in the items reference — no static species
# list. _team_legitimate_mega_species() below does the lookup.


def _team_legitimate_mega_species(team: Dict[str, Any]) -> set:
    """Lowercase species names that the team can legitimately call
    'Mega <X>' in prose. A species qualifies if:
      (a) its team-JSON name already carries a 'Mega' / 'Mega-Y'
          form prefix (e.g. 'Charizard-Mega-Y'), OR
      (b) its held item is a known Mega Stone whose ref-entry
          effect starts with 'Mega-Stein:' (and does NOT contain
          'EXISTIERT NICHT' — that flags our deliberate trap entries
          for items that don't actually exist, e.g. 'Glimmorite').

    Mega-evolution is triggered by the item mid-battle, so a pre-Mega
    species name + a real Mega-Stone item is a perfectly legitimate
    'Mega <X>' mention in the guide.
    """
    _ensure_references_loaded()
    items_idx = _ITEMS_IDX or {}
    legit: set = set()
    for n in _team_pokemon_names(team):
        # (a) name already carries the Mega prefix
        parts = re.split(r'[-\s]+', n)
        has_mega = any(p.lower() == 'mega' for p in parts)
        species = ' '.join(p for p in parts if p.lower() != 'mega').lower().strip()
        # Also store under the bare first word, so 'Charizard-Mega-Y'
        # → 'charizard' AND 'charizard y' both work for matching.
        if has_mega:
            legit.add(species)
            if parts and parts[0].lower() != 'mega':
                legit.add(parts[0].lower())
    for p in team.get('pokemon') or []:
        item = (p.get('item') or '').strip()
        if not item:
            continue
        hit = items_idx.get(_norm_lookup(item))
        if not hit:
            continue
        eff = (hit[1].get('effect') or '')
        if 'EXISTIERT NICHT' in eff:
            continue
        # The item is a Mega Stone when its effect starts with the
        # 'Mega-Stein' marker. Parenthetical notes between the marker
        # and the colon ('Mega-Stein (Champions-exklusiv):') still
        # count — the v4 items reference flags the Champions-exclusive
        # stones that way.
        eff_lower = eff.lower().lstrip()
        if eff_lower.startswith('mega-stein'):
            species = (p.get('name') or '').strip().lower()
            if species:
                legit.add(species)
                # First word too (e.g. "Charizard" for "Charizard-Mega-Y").
                legit.add(species.split('-', 1)[0].split(' ', 1)[0])
    return {s for s in legit if s}


# Patterns the guard scans for. Each captures the SPECIES name in
# group 1. Covered:
#   English / pre-Mega:    "Mega Charizard", "Mega-Charizard"
#   German post-position:  "Charizard mega-entwickeln", "X mega werden",
#                          "Lass X Mega werden"
# Bare "<Species> Mega" without a verb is intentionally NOT matched —
# German imperatives like "Schick Mega Whimsicott vor" produced false
# positives on the leading verb. The verb-suffixed German forms are
# unambiguous enough to keep.
_SPECIES_TOKEN = r"[A-ZÄÖÜ][a-zäöüßéí'\-]+(?:[\s-][A-ZÄÖÜ][a-zäöüßéí'\-]+)?"
_MEGA_PATTERNS = [
    re.compile(rf"\bMega[\s-]+({_SPECIES_TOKEN})\b"),
    re.compile(rf"\blass(?:t)?\s+({_SPECIES_TOKEN})\s+mega", re.IGNORECASE),
    re.compile(rf"\b({_SPECIES_TOKEN})\s+mega[\s-]?(?:entwickel|werden|evolv|geht|evolviert)",
               re.IGNORECASE),
]


# German imperative / sentence-starter words that LOOK capitalised but
# aren't Pokémon names. Used to suppress false positives in the
# "<Species> mega …" pattern where a sentence like "Lass Charizard mega
# werden" would otherwise capture "Lass Charizard" as the species.
_GERMAN_STOPWORDS = {
    'lass', 'lasst', 'schick', 'schickt', 'bring', 'bringt', 'setz', 'setzt',
    'geh', 'wechsl', 'wechsle', 'wechsel', 'wähl', 'wähle', 'nimm', 'nimmt',
    'spiel', 'spiele', 'spielt', 'nutz', 'nutze', 'hol', 'hole', 'mach',
    'macht', 'spar', 'tausch', 'starte', 'starten', 'dann', 'dabei', 'danach',
    'direkt', 'deshalb', 'wenn', 'sobald', 'falls', 'denn', 'weil',
}


def find_hallucinated_megas(text: str, team: Dict[str, Any]) -> List[str]:
    """Scan the strategy text for 'Mega <Species>' or 'X mega-entwickeln'
    claims that aren't backed by the actual team sheet.

    The guard is asymmetric on purpose:
      • A Mega claim about a species in NEVER_MEGA_SPECIES is ALWAYS
        flagged — that's the Glimmora-class hallucination the user
        reported and a hard false-negative is unacceptable.
      • A Mega claim about a TEAM species that lacks a mega-stone item
        AND isn't in NEVER_MEGA gets flagged ('im Team nicht Mega').
      • A Mega claim about a species NOT on the team is silently
        ignored — the false-positive rate on unknown capitalised tokens
        (German verbs, trainer titles) outweighs the rare case where
        the model invents a wholly out-of-team Mega mention.
    """
    legit = _team_legitimate_mega_species(team)
    team_species = {_norm_lookup(n).split('-')[0].split(' ')[0] for n in _team_pokemon_names(team)}
    team_species.update(_norm_lookup(n) for n in _team_pokemon_names(team))
    offenders: List[str] = []
    for pat in _MEGA_PATTERNS:
        for match in pat.finditer(text):
            species_phrase = match.group(1).strip().lower()
            # Strip trailing descriptors like 'ex', 'form', 'y', 'x'.
            species_phrase = re.sub(r'\b(ex|form|y|x)\s*$', '', species_phrase).strip()
            if not species_phrase:
                continue
            # Drop the leading word if it's a German imperative — keeps
            # "Lass Charizard" → "charizard", not "lass charizard".
            first_word = species_phrase.split(' ', 1)[0]
            if first_word in _GERMAN_STOPWORDS:
                rest = species_phrase[len(first_word):].strip()
                species_phrase = rest
                if not species_phrase:
                    continue
            # Skip phrases that are themselves stop-words.
            if species_phrase in {'form', 'mega', 'phase', 'attacke', 'angriff'}:
                continue
            if species_phrase in _GERMAN_STOPWORDS:
                continue
            # Legitimate Mega-mention → fine.
            if species_phrase in legit:
                continue
            # Team species without a mega-stone item — flag. Champions
            # has Mega Stones for many unexpected species, so a
            # blanket NEVER_MEGA list would false-positive (Glimmora,
            # Chandelure, Drampa etc. all have Mega Stones here). We
            # only flag when the species IS on this specific team
            # and ISN'T holding a Mega-Stein item.
            if species_phrase in team_species or species_phrase.split(' ')[0] in team_species:
                offenders.append(f"Mega {species_phrase} (im Team nicht Mega, kein Mega-Stein)")
                continue
            # Unknown capitalised token → silently ignore (likely a
            # German verb / trainer prefix / proper noun, not a
            # hallucinated Pokémon name).
    seen: set = set()
    uniq: List[str] = []
    for o in offenders:
        if o not in seen:
            seen.add(o)
            uniq.append(o)
    return uniq


# Parenthetical English name in the bilingual "Deutsch (English)" form.
_PAREN_EN_RE = re.compile(r"\(([A-Za-z][A-Za-z0-9 '\-\.]+?)\)")


def _german_prose(obj: Dict[str, Any]) -> str:
    b = obj.get('de') or {}
    parts: List[str] = [b.get('overview') or '']
    for r in b.get('roles') or []:
        parts.append(r.get('role') or '')
    parts.extend(b.get('game_plan') or [])
    parts.extend(b.get('tips') or [])
    return '\n'.join(parts)


def find_offteam_moves(obj: Dict[str, Any], team: Dict[str, Any]) -> List[str]:
    """Enforce prompt rule #2: the guide must not attribute a move to the
    team that no team Pokémon actually runs.

    Only the GERMAN guide is scanned. There the bilingual form is
    "<Deutsch> (<English>)", so the parenthetical is the English canonical
    name and we can match it against the English move keys precisely. (The
    English guide's parenthetical is the German name, which collides with
    de_name aliases like 'Felswurf' -> 'Rock Tomb' and produced a false
    positive in testing.) We only accept a hit when the matched key equals
    the canonical English name (`key == hit[0]`), never a de_name alias.

    Unlike abilities/items this needs no Mega-stone resolution — a Mega form
    changes ability/stats but never gains a move. Validated against all 20
    live strategies: zero false positives (matches the 2026-06-15 audit's
    finding of zero genuine hallucinations).
    """
    _ensure_references_loaded()
    moves_idx = _MOVES_IDX or {}
    team_moves: set = set()
    for p in team.get('pokemon') or []:
        for m in p.get('moves') or []:
            key = _norm_lookup(m)
            hit = moves_idx.get(key)
            if hit:
                team_moves.add(hit[0].lower())
            team_moves.add(key)
    offenders: List[str] = []
    seen: set = set()
    for match in _PAREN_EN_RE.finditer(_german_prose(obj)):
        key = _norm_lookup(match.group(1))
        hit = moves_idx.get(key)
        if not hit or key != hit[0].lower():
            continue  # unknown token, or a de_name alias — skip
        canon = hit[0].lower()
        if canon in team_moves or canon in seen:
            continue
        seen.add(canon)
        offenders.append(hit[0])
    return offenders


# Coverage below this fraction means the model had to improvise un-grounded
# names/effects for most of the team — surfaced as a ::warning:: per run.
REFERENCE_COVERAGE_WARN = 0.5


def reference_coverage(team: Dict[str, Any]) -> float:
    """Fraction of the team's moves + items + abilities that have a
    reference entry (i.e. are grounded). Low coverage flags exactly the
    teams where the model must lean on training knowledge."""
    _ensure_references_loaded()
    moves_idx = _MOVES_IDX or {}
    items_idx = _ITEMS_IDX or {}
    abilities_idx = _ABILITIES_IDX or {}
    total = 0
    covered = 0
    for p in team.get('pokemon') or []:
        for m in p.get('moves') or []:
            if (m or '').strip():
                total += 1
                covered += 1 if moves_idx.get(_norm_lookup(m)) else 0
        for value, idx in ((p.get('item'), items_idx), (p.get('ability'), abilities_idx)):
            if (value or '').strip():
                total += 1
                covered += 1 if idx.get(_norm_lookup(value)) else 0
    return (covered / total) if total else 1.0


def validate_strategy_facts(obj: Dict[str, Any], team: Dict[str, Any]) -> Tuple[bool, str]:
    """Run the hallucination guards across the generated strategy.
    Returns (ok, reason): invented Mega forms (rule #1) and off-team moves
    (rule #2). A failure logs a warning and is not cached, so the next run
    retries."""
    # Concatenate every prose field across both languages.
    prose_parts: List[str] = []
    for lang in ('de', 'en'):
        block = obj.get(lang) or {}
        prose_parts.append(block.get('overview') or '')
        for r in block.get('roles') or []:
            prose_parts.append(r.get('role') or '')
        prose_parts.extend(block.get('game_plan') or [])
        prose_parts.extend(block.get('tips') or [])
    blob = '\n'.join(prose_parts)

    bad_megas = find_hallucinated_megas(blob, team)
    if bad_megas:
        return False, 'hallucinated Mega forms: ' + '; '.join(bad_megas)

    offteam = find_offteam_moves(obj, team)
    if offteam:
        return False, 'off-team moves (not on any team Pokémon): ' + '; '.join(offteam)
    return True, ''


def format_team_for_prompt(team: Dict[str, Any]) -> str:
    """Render the team as compact plain text for the user message."""
    lines = [
        f"Team: {team.get('team_name') or '?'}",
        f"Turnier: {team.get('tournament') or '?'}"
        + (f" · Trainer: {team['trainer']}" if team.get('trainer') else ''),
    ]
    for p in team.get('pokemon') or []:
        moves = ', '.join(p.get('moves') or [])
        bits = [p.get('name') or '?']
        if p.get('item'):
            bits.append(f"@ {p['item']}")
        if p.get('ability'):
            bits.append(f"[{p['ability']}]")
        if p.get('nature'):
            bits.append(f"({p['nature']})")
        if p.get('tera_type'):
            bits.append(f"Tera: {p['tera_type']}")
        lines.append(f"- {' '.join(bits)}")
        if p.get('evs'):
            lines.append(f"  EVs: {p['evs']}")
        if moves:
            lines.append(f"  Attacken: {moves}")
    return '\n'.join(lines)


SYSTEM_PROMPT_BASE = """\
Du bist ein erfahrener Pokémon-VGC-Coach (Doppelkämpfe, Pokémon Champions). \
Deine Aufgabe: einem blutigen Anfänger erklären, wie ein Turnier-Team \
gespielt wird — ohne Fachjargon, und wo ein Fachbegriff unvermeidbar ist \
(z. B. "Rückenwind/Tailwind", "Intimidate"), erkläre ihn in einem Halbsatz.

GENAUIGKEITS-REGELN (höchste Priorität — Verstöße führen dazu, dass der \
ganze Guide verworfen und neu generiert wird):

1. Erfinde KEINE Mega-Formen. Ein Pokémon ist nur dann "Mega <X>", wenn \
   das Team-JSON es genau so listet (z. B. "Charizard-Mega-Y") ODER das \
   getragene Item ein Mega-Stein ist, der im Faktenblock unten mit \
   "Mega-Stein:" gekennzeichnet ist. Hinweis: Pokémon Champions hat \
   eigene Mega-Steine für viele Pokémon, die in den Hauptspielen keine \
   Mega-Form haben (z. B. Mortipotit für Glimmora, Lichtelit für Chandelure, \
   Frosdedjeit für Froslass). Lies also den Faktenblock — verlass dich \
   nicht auf "weiß ich aus den Hauptspielen".

2. Behaupte KEINE Attacken oder Fähigkeiten, die nicht im Team-JSON stehen. \
   Wenn ein Pokémon keine Flächenattacke hat, redet der Guide auch nicht \
   von "Flächenschaden mit diesem Pokémon".

3. MECHANIK-WERTE (Rundenzahl, %, KP-Anteil, Bedingungen) zitierst du \
   AUSSCHLIESSLICH aus dem Faktenblock unten. Wenn eine Attacke/Item/ \
   Fähigkeit DORT nicht aufgeführt ist, lass die exakte Zahl weg — \
   niemals 2 Runden / 50 % / 1/8 KP raten. NIE "Rückenwind macht euer \
   Team 2 Runden lang schneller" schreiben, wenn die Quelle "4 Runden" sagt.

Stil:
- Deutsch: Du-Form, einfach, freundlich, konkret. Englisch: ebenso einfach.
- Kurze Sätze. Keine Floskeln, kein Marketing-Ton.
- Konkrete Handlungsempfehlungen ("Schicke X und Y zuerst ins Feld, weil …"),
  nicht abstrakte Theorie.
- Bei wichtigen Status-Attacken / Fähigkeiten nennst du den konkreten Effekt
  EINMAL kurz aus dem Faktenblock (z. B. "Irrlicht (Will-O-Wisp) verbrennt
  das Ziel — es verliert 1/16 KP pro Runde und sein physischer Angriff
  wird halbiert"). Das ist die Tiefe, die Anfänger brauchen.
- Wenn das Team eine Mega-Entwicklung hat: erkläre kurz, wann man sie nutzt.

ZWEISPRACHIGE BENENNUNG (zwingend für JEDE Erwähnung):
- Im deutschen Guide schreibst du IMMER "<Deutscher Name> (<English Name>)"
  für jede Attacke, Fähigkeit und jedes Item — beim ersten UND bei jeder
  weiteren Erwähnung. Beispiele: "Rückenwind (Tailwind)", "Bedroher
  (Intimidate)", "Donnerblitz (Thunderbolt)", "Prunusbeere (Sitrus Berry)".
- Im englischen Guide spiegelbildlich: "<English Name> (<Deutscher Name>)".
- Wenn der Begriff im Faktenblock unten steht, verwende EXAKT den dortigen
  deutschen Namen — keine eigene Übersetzung, kein Synonym.
- Wenn der Begriff NICHT im Faktenblock steht, verwende die offizielle
  deutsche Pokémon-Lokalisierung aus deinem Wissen (Acrobatics = Akrobatik,
  Thunderbolt = Donnerblitz, Earthquake = Erdbeben, Snow Warning =
  Diamantstaub, Gale Wings = Mutwind usw.) — solange du dir bei der
  Standard-Pokémon-Übersetzung sicher bist. NUR wenn du wirklich keinen
  offiziellen deutschen Namen kennst, schreibe nur den englischen Namen.
  NIEMALS eine Mechanik dazuerfinden — das gilt unabhängig.
- Pokémon-Namen (Charizard, Iono, Glimmora …) bleiben unverändert wie im
  Team-JSON, keine Übersetzung.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt, exakt in diesem Schema \
(kein Markdown, kein Text davor oder danach):

{
  "de": {
    "overview": "2-3 Sätze: Was will dieses Team grundsätzlich erreichen?",
    "roles": [
      {"name": "<Pokémon-Name exakt wie in den Teamdaten>", "role": "1-2 Sätze: Job dieses Pokémon im Team"}
    ],
    "game_plan": ["Schritt 1: …", "Schritt 2: …", "Schritt 3: …"],
    "tips": ["2-4 kurze Anfänger-Tipps (typische Fehler, Lead-Wahl, wann zurückziehen)"]
  },
  "en": { gleiche Struktur, gleiche Inhalte auf Englisch }
}

Die "roles"-Liste enthält genau ein Objekt pro Pokémon des Teams, in der \
Reihenfolge der Teamdaten."""


def build_system_prompt(facts_block: str) -> str:
    """Stitch the base prompt with the per-team facts block. Empty
    block (no reference hits) just appends a no-facts hint instead of
    a real block — keeps the structure deterministic for the model."""
    if not facts_block:
        return SYSTEM_PROMPT_BASE + (
            '\n\n=== Faktenblock ===\n'
            '(Für dieses Team liegen keine Referenz-Einträge vor. '
            'Halte dich strikt an die Genauigkeits-Regeln oben und '
            'verzichte auf konkrete Mechanik-Zahlen.)'
        )
    return SYSTEM_PROMPT_BASE + '\n\n' + facts_block


# Back-compat alias for older tests that import SYSTEM_PROMPT directly.
SYSTEM_PROMPT = SYSTEM_PROMPT_BASE


# Module-level caches for the reference indices — loaded once per
# process. Tests can monkey-patch the *_IDX globals directly.
_MOVES_REF: Optional[Dict[str, Any]] = None
_ITEMS_REF: Optional[Dict[str, Any]] = None
_ABILITIES_REF: Optional[Dict[str, Any]] = None
_MOVES_IDX: Optional[Dict[str, Tuple[str, Dict[str, Any]]]] = None
_ITEMS_IDX: Optional[Dict[str, Tuple[str, Dict[str, Any]]]] = None
_ABILITIES_IDX: Optional[Dict[str, Tuple[str, Dict[str, Any]]]] = None


def _ensure_references_loaded(
    moves_path: str = DEFAULT_MOVES_REF_PATH,
    items_path: str = DEFAULT_ITEMS_REF_PATH,
    abilities_path: str = DEFAULT_ABILITIES_REF_PATH,
) -> None:
    global _MOVES_REF, _ITEMS_REF, _ABILITIES_REF, _MOVES_IDX, _ITEMS_IDX, _ABILITIES_IDX
    if _MOVES_IDX is None:
        _MOVES_REF = load_reference(moves_path)
        _MOVES_IDX = build_lookup_index(_MOVES_REF, 'moves')
    if _ITEMS_IDX is None:
        _ITEMS_REF = load_reference(items_path)
        _ITEMS_IDX = build_lookup_index(_ITEMS_REF, 'items')
    if _ABILITIES_IDX is None:
        _ABILITIES_REF = load_reference(abilities_path)
        _ABILITIES_IDX = build_lookup_index(_ABILITIES_REF, 'abilities')


# ─────────────────────────── API section ───────────────────────────

def generate_for_team(client: Any, team: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """One Claude API call → validated bilingual strategy dict, or None.

    v3: looks up every move + item on the team in the local reference
    DB, builds a per-team facts block, and injects it into the system
    prompt. Then runs both the structural validator (schema check) and
    the factual validator (Mega-form hallucination guard). A factual
    failure logs a warning and returns None — same handling as a JSON
    parse failure, so the next run retries.
    """
    _ensure_references_loaded()
    facts = collect_team_facts(
        team,
        _MOVES_IDX or {},
        _ITEMS_IDX or {},
        _ABILITIES_IDX or {},
    )
    facts_block = format_facts_block(facts)
    system_prompt = build_system_prompt(facts_block)

    # Surface the grounding gap: a low coverage means most of this team's
    # moves/items/abilities have no reference entry, so the model has to
    # improvise their names/effects from training knowledge — exactly where
    # hallucinations creep in. Worth a per-rotation ::warning:: so the
    # reference files can be topped up.
    cov = reference_coverage(team)
    if cov < REFERENCE_COVERAGE_WARN:
        print(f"    ::warning::low reference coverage {cov:.0%} for team "
              f"{team.get('team_name') or team.get('replica_code') or '?'} — "
              f"model must improvise un-grounded names/effects for the rest")

    user_msg = (
        "Erkläre die Strategie dieses Pokémon-Champions-Teams für einen "
        "absoluten Anfänger:\n\n" + format_team_for_prompt(team)
    )
    # NB: temperature is intentionally NOT set. The request uses extended
    # thinking (thinking={'type': 'adaptive'}), which requires temperature=1 —
    # a low temperature would be rejected by the API. The factual guards
    # (Mega + off-team-move validators) are the lever against drift here, not
    # sampling temperature.
    with client.messages.stream(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        thinking={'type': 'adaptive'},
        system=system_prompt,
        messages=[{'role': 'user', 'content': user_msg}],
    ) as stream:
        message = stream.get_final_message()
    text = ''.join(
        block.text for block in message.content
        if getattr(block, 'type', '') == 'text'
    )
    obj = extract_json(text)
    ok, reason = validate_strategy(obj)
    if not ok:
        print(f"    ::warning::invalid strategy payload ({reason})")
        return None
    fact_ok, fact_reason = validate_strategy_facts(obj, team)
    if not fact_ok:
        print(f"    ::warning::factual guard rejected strategy ({fact_reason})")
        return None
    return obj


def main(argv: List[str]) -> int:
    teams_path = argv[1] if len(argv) > 1 else DEFAULT_TEAMS_PATH
    strategies_path = argv[2] if len(argv) > 2 else DEFAULT_STRATEGIES_PATH

    api_key = os.environ.get('ANTHROPIC_API_KEY', '').strip()
    if not api_key:
        print('::warning::ANTHROPIC_API_KEY not set — skipping strategy '
              'generation (add it as a repo Actions secret to enable).')
        return 0

    try:
        import anthropic
    except ImportError:
        print('::warning::anthropic SDK not installed — skipping strategy '
              'generation (it is listed in requirements.txt).')
        return 0

    try:
        with open(teams_path, 'r', encoding='utf-8') as f:
            teams_data = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        print(f'::warning::cannot read {teams_path}: {e}')
        return 0

    teams = teams_data.get('teams') or []
    if not teams:
        print('No teams in input — nothing to do.')
        return 0

    cache: Dict[str, Any] = {'_meta': {}, 'strategies': {}}
    if os.path.isfile(strategies_path):
        try:
            with open(strategies_path, 'r', encoding='utf-8') as f:
                loaded = json.load(f)
            if isinstance(loaded, dict):
                cache = loaded
                cache.setdefault('strategies', {})
        except (OSError, json.JSONDecodeError) as e:
            print(f'::warning::strategy cache unreadable, rebuilding: {e}')

    todo = teams_needing_generation(teams, cache)
    print(f'{len(teams)} teams on the list · {len(todo)} need generation '
          f'· {len(teams) - len(todo)} cached')

    if len(todo) > MAX_GENERATIONS_PER_RUN:
        print(f'::warning::capping generations at {MAX_GENERATIONS_PER_RUN} '
              f'this run ({len(todo)} pending); the rest follow tomorrow.')
        todo = todo[:MAX_GENERATIONS_PER_RUN]

    if todo:
        # Line-buffer stdout so per-team progress streams to the
        # Actions log even when callers forget `python -u`. Without
        # this, a 20-team run looks like 20 minutes of nothing
        # followed by a wall of output at the end.
        try:
            sys.stdout.reconfigure(line_buffering=True)
        except (AttributeError, OSError):
            pass
        client = anthropic.Anthropic(api_key=api_key)
        consecutive_failures = 0
        generated = 0
        for team in todo:
            code = team['replica_code']
            name = team.get('team_name') or code
            print(f'  generating: {name} ({code}) …', flush=True)
            try:
                strategy = generate_for_team(client, team)
            except anthropic.APIStatusError as e:
                print(f'    ::warning::API error {e.status_code} for {code}')
                strategy = None
            except anthropic.APIError as e:
                print(f'    ::warning::API error for {code}: {e}')
                strategy = None
            if strategy is None:
                consecutive_failures += 1
                if consecutive_failures >= MAX_CONSECUTIVE_FAILURES:
                    print(f'::warning::{consecutive_failures} consecutive '
                          'failures — aborting this run, keeping successes.')
                    break
                continue
            consecutive_failures = 0
            generated += 1
            cache['strategies'][code] = {
                'team_hash': team_hash(team),
                'prompt_version': PROMPT_VERSION,
                'team_name': team.get('team_name') or '',
                'generated_at': datetime.now(timezone.utc)
                                        .strftime('%Y-%m-%dT%H:%M:%SZ'),
                'model': MODEL,
                'de': strategy['de'],
                'en': strategy['en'],
            }
        print(f'Generated {generated}/{len(todo)} strategies.')
        if generated == 0:
            # No new content, no cache change worth writing — unless
            # pruning is due, handled below either way.
            pass

    current_codes = [t.get('replica_code') or '' for t in teams]
    evicted = prune_cache(cache, current_codes)
    if evicted:
        print(f'Pruned {evicted} stale cache entries.')

    cache['_meta'] = {
        'generated_by': 'scripts/generate_team_strategies.py',
        'model': MODEL,
        'last_run': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'strategy_count': len(cache['strategies']),
    }
    tmp = strategies_path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)
        f.write('\n')
    os.replace(tmp, strategies_path)
    print(f'Wrote {strategies_path} ({len(cache["strategies"])} strategies).')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
