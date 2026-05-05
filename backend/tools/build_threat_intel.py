"""Active-threats builder.

Cross-references the classifier output (backend/core/threat_classifier.py)
against the current meta to produce ``data/active_threats.json`` — a
small, frontend-consumable summary of which threats are actually live
right now and which counters exist for them.

Inputs (project-root ``data/``)
-------------------------------
- pokemon_card_effects.json   — per-card structured effect text
- current_meta_card_data.csv  — per-(archetype, card) meta-live rows
- limitless_online_decks.csv  — meta-share by archetype

Output
------
``data/active_threats.json``::

    {
      "generated_at": "2026-05-05T19:42:11Z",
      "format_window": "POR",
      "threats": {
        "retreat_lock": {
          "weighted_meta_share": 0.241,
          "cards": [
            {
              "card_id": "MEG|88",
              "card_name": "Yveltal",
              "archetypes": [
                { "archetype": "Dragapult Ex",      "share_in_archetype": 0.95, "meta_share": 0.068 },
                { "archetype": "Lucario Hariyama",  "share_in_archetype": 0.55, "meta_share": 0.060 }
              ]
            }
          ]
        }
      },
      "counters": {
        "retreat_lock": [
          { "card_id": "SVI|194", "card_name": "Switch" },
          { "card_id": "ASR|154", "card_name": "Switch Cart" }
        ]
      }
    }

The frontend tech-audit (Stage 3) reads this JSON, picks the threat
categories where ``weighted_meta_share`` exceeds a threshold, and
ensures the auto-built deck contains at least one card from the
matching ``counters`` list.

Standalone wrt scrapers (no bs4 / requests dependency).
"""
from __future__ import annotations

import csv
import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Mapping, Tuple

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(THIS_DIR)
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)
sys.path.insert(0, os.path.join(BACKEND_DIR, "core"))

from threat_classifier import classify_database  # type: ignore  # noqa: E402

DATA_DIR = os.path.join(PROJECT_ROOT, "data")
EFFECTS_JSON = os.path.join(DATA_DIR, "pokemon_card_effects.json")
META_CARD_CSV = os.path.join(DATA_DIR, "current_meta_card_data.csv")
ONLINE_DECKS_CSV = os.path.join(DATA_DIR, "limitless_online_decks.csv")
FORMAT_WINDOW_JSON = os.path.join(DATA_DIR, "format_window.json")
SETS_JSON = os.path.join(DATA_DIR, "sets.json")
OUTPUT_JSON = os.path.join(DATA_DIR, "active_threats.json")

# Current Standard rotation anchor — the lowest-numbered set still
# legal in the format. Matches the existing card_price_scraper
# `min_set` setting so legality logic stays consistent across the
# codebase. Bump this with FALLBACK_SET_ORDER when the next rotation
# drops the bottom set.
LEGAL_FORMAT_MIN_SET = "TEF"

# Promo / energy sets that are *additionally* legal even though their
# numeric ordering may sit below the rotation cutoff. Kept as a
# config knob: SVP/SVE were the carve-outs for the SV-era rotation
# (their indices are 128/129 < TEF=136), but in the current
# TEF-onwards rotation they are NOT legal — Iono SVP|124 / similar
# cards must NOT appear in the counter recommendations. Add MEP /
# next-era promos here when they become Standard-legal exceptions.
ALWAYS_LEGAL_SETS: frozenset = frozenset()

# Archetypes contributing less than this fraction of the meta are
# excluded from the threat aggregation. 0.5 % ≈ noise floor for
# Limitless Online (rank 30+ is below 1 % share each).
META_SHARE_FLOOR = 0.005

# Cards must appear in at least this fraction of an archetype's decks
# for that archetype to count as "running" the card. 25 % is the
# inclusion threshold the Predictor uses elsewhere.
INCLUSION_FLOOR = 0.25

# Minimum archetype meta share for a category to surface. A retreat-lock
# threat that lives in a 0.3 % deck doesn't warrant a tech slot.
CATEGORY_FLOOR = 0.02  # 2 %


def _parse_share(raw: str) -> float:
    """Parse Limitless's two share columns into a 0..1 fraction.

    Both columns store percent values (so '0,86' for the column
    `share_numeric` is 0.86 % and should become 0.0086, not 0.86).
    Always divide by 100; strip a trailing '%' if present in the
    `share` text column.
    """
    if raw is None:
        return 0.0
    s = str(raw).strip().replace(",", ".").rstrip("%")
    if not s:
        return 0.0
    try:
        return float(s) / 100.0
    except ValueError:
        return 0.0


def load_set_order() -> Dict[str, int]:
    """Set-code → numeric ordering (higher = newer). Empty dict if
    sets.json is missing or unreadable."""
    if not os.path.isfile(SETS_JSON):
        return {}
    try:
        with open(SETS_JSON, "r", encoding="utf-8") as f:
            order_map = json.load(f)
    except Exception:
        return {}
    if not isinstance(order_map, dict):
        return {}
    return {k: int(v) for k, v in order_map.items() if isinstance(v, (int, float))}


def load_legal_set_codes(order_map: Dict[str, int]) -> Tuple[set, str]:
    """Return ``(legal_set_codes, format_label)`` for the current
    Standard rotation. ``legal_set_codes`` is the set of upper-case set
    codes whose numeric ordering >= LEGAL_FORMAT_MIN_SET, plus the
    promo/energy ALWAYS_LEGAL_SETS. Empty set + empty label if sets.json
    is missing or unreadable — caller falls back to no filtering."""
    if not order_map:
        return set(), ""
    cutoff = order_map.get(LEGAL_FORMAT_MIN_SET)
    if cutoff is None:
        return set(), ""
    legal = {s for s, idx in order_map.items() if idx >= cutoff}
    legal |= {s for s in ALWAYS_LEGAL_SETS if s in order_map}
    # Format label like "TEF-POR" using the highest-ordering legal set
    top_set = max((s for s in legal), key=lambda s: order_map.get(s, 0)) if legal else LEGAL_FORMAT_MIN_SET
    return legal, f"{LEGAL_FORMAT_MIN_SET}-{top_set}"


def load_format_code() -> str:
    try:
        with open(FORMAT_WINDOW_JSON, "r", encoding="utf-8") as f:
            return (json.load(f).get("current_set") or "").strip()
    except Exception:
        return ""


def load_effects_db() -> Dict[str, Dict[str, Any]]:
    if not os.path.isfile(EFFECTS_JSON):
        sys.exit(f"[build_threat_intel] {EFFECTS_JSON} missing — run pokemon_card_effects_scraper first.")
    with open(EFFECTS_JSON, "r", encoding="utf-8-sig") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        sys.exit("[build_threat_intel] effects JSON has unexpected shape (expected dict).")
    return data


def load_meta_share() -> Dict[str, float]:
    """archetype (lower) → meta share (0..1)."""
    out: Dict[str, float] = {}
    if not os.path.isfile(ONLINE_DECKS_CSV):
        return out
    with open(ONLINE_DECKS_CSV, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f, delimiter=";")
        for row in reader:
            name = (row.get("deck_name") or "").strip()
            if not name:
                continue
            # Prefer the numeric column; fall back to the percent string.
            share = _parse_share(row.get("share_numeric") or row.get("share") or "")
            if share <= 0:
                continue
            out[name.lower()] = share
    return out


def load_archetype_card_rows() -> List[Dict[str, str]]:
    if not os.path.isfile(META_CARD_CSV):
        return []
    rows: List[Dict[str, str]] = []
    with open(META_CARD_CSV, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f, delimiter=";")
        for row in reader:
            # Stick to the live (Limitless Online) snapshot — Meta Play!
            # rows are sparse for most archetypes and would skew shares
            # (see backend/tools/cleanup_current_meta_csv.py for context).
            if (row.get("meta") or "").strip() != "Meta Live":
                continue
            rows.append(row)
    return rows


def card_id(set_code: str, set_number: str) -> str:
    return f"{(set_code or '').strip().upper()}|{(set_number or '').strip()}"


def _set_of(card_id_str: str) -> str:
    """'MEG|88' → 'MEG'."""
    return (card_id_str or "").split("|", 1)[0].strip().upper()


def build() -> Dict[str, Any]:
    fmt = load_format_code() or "STANDARD"
    set_order = load_set_order()
    legal_sets, format_label = load_legal_set_codes(set_order)
    effects = load_effects_db()
    tags = classify_database(effects)
    print(f"[build_threat_intel] {len(tags)} cards classified across "
          f"{sum(1 for t in tags.values() if t['threats'])} threat-tagged + "
          f"{sum(1 for t in tags.values() if t['counters'])} counter-tagged.")
    if legal_sets:
        print(f"[build_threat_intel] legality cutoff: {LEGAL_FORMAT_MIN_SET} → "
              f"{len(legal_sets)} sets legal in format {format_label}")
    else:
        print("[build_threat_intel] WARNING: sets.json missing or unreadable — "
              "skipping legality filter")

    meta_share = load_meta_share()
    rows = load_archetype_card_rows()
    print(f"[build_threat_intel] meta-share archetypes: {len(meta_share)}, "
          f"meta card-rows: {len(rows)}")

    # ── Per-category threat aggregation ──
    # cat → cid → {card_name, archetypes: {archetype_lower → {…}}}
    threats_by_cat: Dict[str, Dict[str, Dict[str, Any]]] = defaultdict(lambda: defaultdict(dict))
    # cat → archetype_lower → max share_in_archetype across all cat cards
    cat_archetype_max_share: Dict[str, Dict[str, Tuple[float, float]]] = defaultdict(dict)

    threats_dropped_illegal = 0
    for row in rows:
        cid = card_id(row.get("set_code", ""), row.get("set_number", ""))
        tag = tags.get(cid)
        if not tag or not tag.get("threats"):
            continue
        # Legality gate — defensive; current_meta CSV should already be
        # rotation-clean, but a stale row could surface a threat from
        # a rotated-out set.
        if legal_sets and _set_of(cid) not in legal_sets:
            threats_dropped_illegal += 1
            continue
        archetype = (row.get("archetype") or "").strip()
        if not archetype:
            continue
        archetype_key = archetype.lower()
        ms = meta_share.get(archetype_key, 0.0)
        if ms < META_SHARE_FLOOR:
            continue
        try:
            deck_inc = int(row.get("deck_inclusion_count") or 0)
            tot = int(row.get("total_decks_in_archetype") or 0)
        except ValueError:
            continue
        if tot <= 0:
            continue
        share_in_archetype = deck_inc / tot
        if share_in_archetype < INCLUSION_FLOOR:
            continue

        for cat in tag["threats"]:
            entry = threats_by_cat[cat].setdefault(cid, {
                "card_name": (effects.get(cid) or {}).get("name") or row.get("card_name", "").strip(),
                "archetypes": {},
            })
            existing = entry["archetypes"].get(archetype_key)
            if existing is None or share_in_archetype > existing["share_in_archetype"]:
                entry["archetypes"][archetype_key] = {
                    "archetype": archetype,
                    "share_in_archetype": round(share_in_archetype, 4),
                    "meta_share": round(ms, 4),
                }
            # Per-archetype max inclusion across all category cards —
            # used to compute weighted_meta_share without double-counting
            # an archetype that runs two retreat-lock attackers.
            prev = cat_archetype_max_share[cat].get(archetype_key)
            if prev is None or share_in_archetype > prev[0]:
                cat_archetype_max_share[cat][archetype_key] = (share_in_archetype, ms)

    # ── Counters: pull names + IDs from the classifier output ──
    # Restrict to format-legal sets only — the user's deck builder won't
    # accept Iono PAL 185 / Switch Cart ASR 154 / Manaphy BRS 41 once
    # those sets rotate out, so listing them in the counters JSON would
    # leak illegal recommendations into the Stage 3 tech audit.
    counters_by_cat: Dict[str, List[Dict[str, str]]] = defaultdict(list)
    counters_dropped_illegal = 0
    for cid, tag in tags.items():
        for cat in tag.get("counters", []):
            entry = effects.get(cid) or {}
            if legal_sets and _set_of(cid) not in legal_sets:
                counters_dropped_illegal += 1
                continue
            counters_by_cat[cat].append({
                "card_id": cid,
                "card_name": (entry.get("name") or "").strip(),
                "card_type": (entry.get("card_type") or "").strip(),
            })
    # De-dupe by (card_name) — keep the highest-rotation print of each
    # counter so the JSON points at the version players actually run.
    # E.g. Switch has prints in PFL/MEG/MEW/SVI/CRZ/SSH/CES/SLG; we
    # surface only the newest legal one rather than all variants.
    for cat in list(counters_by_cat.keys()):
        by_name: Dict[str, Dict[str, str]] = {}
        for c in counters_by_cat[cat]:
            key = c["card_name"].lower()
            if not key:
                continue
            existing = by_name.get(key)
            if existing is None:
                by_name[key] = c
            else:
                # Prefer the higher set ordering (newer print)
                cur_idx = set_order.get(_set_of(c["card_id"]), -1)
                ex_idx = set_order.get(_set_of(existing["card_id"]), -1)
                if cur_idx > ex_idx:
                    by_name[key] = c
        counters_by_cat[cat] = sorted(by_name.values(), key=lambda x: x["card_name"])

    if counters_dropped_illegal:
        print(f"[build_threat_intel] dropped {counters_dropped_illegal} counter "
              f"prints from rotated-out sets")

    # ── Build the final shape, scoring + filtering by CATEGORY_FLOOR ──
    # weighted_meta_share is the fraction of the meta where the player
    # is reasonably likely to face this category — computed per archetype
    # as max(share_in_archetype) × archetype_meta_share, summed across
    # archetypes (no double-counting of cards in the same deck).
    out_threats: Dict[str, Any] = {}
    for cat, by_cid in threats_by_cat.items():
        cards: List[Dict[str, Any]] = []
        for cid, entry in by_cid.items():
            arch_list = sorted(
                entry["archetypes"].values(),
                key=lambda a: (-a["meta_share"], -a["share_in_archetype"]),
            )
            cards.append({
                "card_id": cid,
                "card_name": entry["card_name"],
                "archetypes": arch_list,
            })
        weighted_share = 0.0
        for archetype_key, (share, ms) in cat_archetype_max_share.get(cat, {}).items():
            weighted_share += share * ms
        weighted_share = round(weighted_share, 4)
        if weighted_share < CATEGORY_FLOOR and cat not in counters_by_cat:
            continue
        cards.sort(key=lambda c: c["card_name"])
        out_threats[cat] = {
            "weighted_meta_share": weighted_share,
            "cards": cards,
        }

    if threats_dropped_illegal:
        print(f"[build_threat_intel] dropped {threats_dropped_illegal} threat "
              f"rows from rotated-out sets (defensive)")

    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "format_window": fmt,
        "format_label": format_label or fmt,
        "legal_format_min_set": LEGAL_FORMAT_MIN_SET,
        "tuning": {
            "meta_share_floor": META_SHARE_FLOOR,
            "inclusion_floor": INCLUSION_FLOOR,
            "category_floor": CATEGORY_FLOOR,
        },
        "threats": out_threats,
        "counters": {k: v for k, v in counters_by_cat.items() if v},
    }
    return out


def save(payload: Mapping[str, Any]) -> None:
    os.makedirs(os.path.dirname(OUTPUT_JSON), exist_ok=True)
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2, sort_keys=False)


def main() -> None:
    payload = build()
    save(payload)
    threats = payload.get("threats", {})
    print(f"[build_threat_intel] wrote {OUTPUT_JSON}")
    for cat, info in threats.items():
        print(f"  {cat:18s} weighted_share={info['weighted_meta_share']:.3f}  "
              f"cards={len(info['cards'])}  counters={len(payload['counters'].get(cat, []))}")


if __name__ == "__main__":
    main()
