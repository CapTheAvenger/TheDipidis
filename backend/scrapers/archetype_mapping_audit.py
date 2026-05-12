#!/usr/bin/env python3
"""Archetype Mapping Auditor (Predictor 5.3 — deferred item from PR #78).

Cross-checks deck naming across the three sources the meta-call predictor
relies on:

  - archetype_icons.json    : visual icon vocabulary (522 archetypes)
  - labs_tournament_decks.csv : tournament truth (Limitless major scrapes)
  - limitless_online_decks.csv : online ladder cumulative shares

Produces ``data/_archetype_mapping_gaps.json`` which downstream tools can
read to surface naming gaps proactively (currently the user discovers them
post-hoc by comparing predictor output to LA-stream graphics — see the LA
"Mega Starmie ex" / "Lopunny Dudunsparce" coverage incidents in the PR #78
discussion).

Run::

    python3 backend/scrapers/archetype_mapping_audit.py

Exits 0 even when gaps are found (it's diagnostic, not a hard gate); but
prints a short summary and writes the JSON for follow-up.
"""
from __future__ import annotations

import csv
import json
import sys
from pathlib import Path
from datetime import datetime

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = REPO_ROOT / "data"

ICONS_PATH = DATA_DIR / "archetype_icons.json"
LABS_PATH = DATA_DIR / "labs_tournament_decks.csv"
ONLINE_PATH = DATA_DIR / "limitless_online_decks.csv"
OUTPUT_PATH = DATA_DIR / "_archetype_mapping_gaps.json"

# Decks ranked below this threshold in the online cumulative CSV are
# typically hidden in the predictor's display ("—" in Online %). Major
# decks falling below the threshold are *coverage gaps* — visible in
# the user's tournament data but invisible in their predictor read.
ONLINE_DISPLAY_RANK_CUTOFF = 20

# Minimum brought share at a recent major to qualify a deck as
# "predictor-relevant" for the cross-source comparison.
LABS_SIGNIFICANT_D1_PLAYERS = 10


def load_icon_archetypes() -> set[str]:
    with ICONS_PATH.open() as f:
        icons = json.load(f)
    archetypes = icons.get("archetypes", {})
    return set(archetypes.keys()) if isinstance(archetypes, dict) else set(archetypes)


def load_labs_data() -> dict[str, dict]:
    """Returns map deck_name -> {slug, d1_players, last_tournament, tids}."""
    decks: dict[str, dict] = {}
    with LABS_PATH.open() as f:
        for row in csv.DictReader(f):
            name = row["deck_name"]
            if not name or name == "Other":
                continue
            d1 = int(row.get("day1_players", "0") or 0)
            tid = (row.get("tournament_id", "") or "").strip()
            tdate = (row.get("tournament_date", "") or "").strip()
            slug = (row.get("deck_slug", "") or "").strip()
            entry = decks.setdefault(name, {
                "slug": slug,
                "max_d1": 0,
                "tids": [],
                "last_tournament": "",
            })
            entry["max_d1"] = max(entry["max_d1"], d1)
            entry["tids"].append(tid)
            if tdate and tdate > entry["last_tournament"]:
                entry["last_tournament"] = tdate
    return decks


def load_online_data() -> dict[str, dict]:
    """Returns map deck_name -> {rank, share}."""
    decks: dict[str, dict] = {}
    with ONLINE_PATH.open(encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter=";")
        for row in reader:
            # The header in some CSVs has a BOM-prefix on the first column
            name = (row.get("deck_name") or row.get("﻿deck_name") or "").strip()
            if not name:
                continue
            try:
                rank = int(row.get("rank", "0") or 0)
                share = float((row.get("share_numeric", "0") or "0").replace(",", "."))
            except ValueError:
                continue
            decks[name] = {"rank": rank, "share": share}
    return decks


def find_synonym_pairs(archetypes: set[str]) -> list[tuple[str, str]]:
    """Detect suspected synonyms — names that match after stripping ex/
    Mega/family-prefix markers. E.g. ``Mega Starmie`` vs ``Mega Starmie ex``."""
    pairs: list[tuple[str, str]] = []
    by_norm: dict[str, list[str]] = {}
    for name in archetypes:
        norm = name.replace(" ex", "").replace(" EX", "").lower().strip()
        by_norm.setdefault(norm, []).append(name)
    for norm, group in by_norm.items():
        if len(group) > 1:
            for i in range(len(group)):
                for j in range(i + 1, len(group)):
                    pairs.append((group[i], group[j]))
    return pairs


def main() -> int:
    icons = load_icon_archetypes()
    labs = load_labs_data()
    online = load_online_data()

    significant_labs = {
        name: entry for name, entry in labs.items()
        if entry["max_d1"] >= LABS_SIGNIFICANT_D1_PLAYERS
    }

    icons_lower = {n.lower(): n for n in icons}
    online_lower = {n.lower(): n for n in online}

    # 1) Labs deck_name → archetype_icons mapping gaps
    missing_icons = [
        name for name in labs
        if name.lower() not in icons_lower
    ]

    # 2) Significant labs decks below online display cutoff
    coverage_gaps = []
    for name, entry in significant_labs.items():
        online_entry = online.get(name) or online_lower.get(name.lower(), {})
        rank = (online_entry or {}).get("rank")
        share = (online_entry or {}).get("share")
        if rank is None:
            coverage_gaps.append({
                "deck": name,
                "labs_max_d1": entry["max_d1"],
                "online_rank": None,
                "online_share": None,
                "reason": "absent_from_online_ladder",
            })
        elif rank > ONLINE_DISPLAY_RANK_CUTOFF:
            coverage_gaps.append({
                "deck": name,
                "labs_max_d1": entry["max_d1"],
                "online_rank": rank,
                "online_share": share,
                "reason": "below_display_cutoff",
            })

    # 3) Suspected synonyms in archetype_icons
    synonyms = find_synonym_pairs(icons)

    # 4) Decks that appear in both labs and online but with different naming
    # (e.g. "Mega Starmie" in online vs "Mega Starmie ex" / different slug).
    # Flag by checking labs slugs against deck name normalisation.
    naming_mismatch = []
    for name, entry in labs.items():
        slug = entry["slug"]
        if not slug:
            continue
        # A slug like "mega-starmie-ex" with a labs deck_name of "Mega
        # Starmie" suggests the labs entry is for the EX variant but
        # was merged with the non-EX in archetype_icons.
        slug_clean = slug.replace("-", " ").strip()
        if "ex" in slug_clean.split() and " ex" not in name.lower() + " ":
            naming_mismatch.append({
                "deck_name": name,
                "deck_slug": slug,
                "implies": f"{name} ex",
            })

    report = {
        "_meta": {
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "icons_total": len(icons),
            "labs_total": len(labs),
            "labs_significant": len(significant_labs),
            "online_total": len(online),
            "display_cutoff_rank": ONLINE_DISPLAY_RANK_CUTOFF,
            "min_labs_d1": LABS_SIGNIFICANT_D1_PLAYERS,
        },
        "missing_in_icons": sorted(missing_icons),
        "coverage_gaps": sorted(coverage_gaps, key=lambda d: -d["labs_max_d1"]),
        "suspected_synonyms": sorted(set(synonyms)),
        "naming_mismatch": naming_mismatch,
    }

    OUTPUT_PATH.write_text(json.dumps(report, indent=2, ensure_ascii=False))

    # Console summary
    print(f"Archetype mapping audit — {OUTPUT_PATH.relative_to(REPO_ROOT)}")
    print(f"  Icons: {len(icons)}, Labs: {len(labs)} ({len(significant_labs)} ≥{LABS_SIGNIFICANT_D1_PLAYERS} D1), Online: {len(online)}")
    print(f"  Missing in icons: {len(missing_icons)}")
    if missing_icons:
        for m in missing_icons[:5]:
            print(f"    - {m}")
    print(f"  Coverage gaps (significant labs decks below display cutoff): {len(coverage_gaps)}")
    for g in coverage_gaps[:8]:
        rk = g.get("online_rank")
        rk_s = f"rank {rk}" if rk else "absent"
        print(f"    - {g['deck']:<32} {g['labs_max_d1']:>3} D1 | online: {rk_s}")
    print(f"  Suspected synonyms in icons: {len(synonyms)}")
    for a, b in synonyms[:5]:
        print(f"    - {a!r} ≈ {b!r}")
    print(f"  Slug→name naming mismatch: {len(naming_mismatch)}")
    for nm in naming_mismatch[:5]:
        print(f"    - deck_name={nm['deck_name']!r} slug={nm['deck_slug']!r} implies={nm['implies']!r}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
