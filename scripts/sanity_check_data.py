#!/usr/bin/env python3
"""Pre-commit data-quality gate for the weekly scraper batch.

AUDIT_DATA_PIPELINE.md F-D19 — the weekly workflow used to commit any
diff a scraper produced, including empty-header-only CSVs from a
Cloudflare escalation or similar source failure. This script enforces
a minimum-row threshold per critical CSV; below the threshold the file
is git-reverted (so the previous good snapshot survives) and the run
emits a `::warning::` instead of pushing garbage.

Files NOT listed below get a free pass — the gate is opt-in per file,
because half the CSVs in data/ are stable lookup tables (sets,
pokemon_sets_mapping, etc.) and don't need a watchdog.

Sommerpause-style intentional emptiness: set threshold = 0 to
opt-in the file as "watched" without enforcing a minimum. That keeps
the row in the table as documentation and surfaces a warning if a
future scrape DOES come back with data.

Usage:
    python3 scripts/sanity_check_data.py [DATA_DIR]

Defaults DATA_DIR to ./data/. Returns 0 always (the failure mode is
soft — we revert files and warn, never abort the workflow).

Exit-code policy:
    0  → ran successfully (regardless of how many reverts happened)
    1  → script bug (couldn't open data dir etc.) — propagates to CI
"""

from __future__ import annotations

import csv
import os
import subprocess
import sys
from typing import Dict

# Per-file minimum row count (excluding header). Tuned conservatively
# from the 2026-06-12 snapshot (AUDIT_DATA_PIPELINE.md scorecard) at
# ~50 % of observed row count so a normal weekly delta passes but a
# header-only output trips the guard.
#
# A threshold of 0 means "file is watched but allowed to be empty"
# (Sommerpause + similar) — we emit an info message but don't revert.
THRESHOLDS: Dict[str, int] = {
    # ── Online ladder + comparison: the predictor's `_shareList` source.
    'limitless_online_decks.csv':            50,    # 118 observed
    'limitless_online_decks_comparison.csv': 50,    # 118 observed
    'limitless_online_decks_matchups.csv':   500,   # 1128 observed

    # ── Online tournament dated cards: Latest Online · Typical Build
    # source on Deck Analysis (Global). Was at the centre of the
    # 2026-06 Mega Greninja "1 deck 120 cards" bug.
    'online_tournament_dated_cards.csv':     10_000,  # 26 601 observed
    'online_tournament_top8_decks.csv':      50,      # 108 observed
    'online_tournament_winners.csv':         20,      # 50 observed

    # ── Labs (major tournaments): Meta Call's empirical predictor.
    'labs_tournament_decks.csv':             2_000,   # 4 585 observed
    'labs_tournament_matchups.csv':          20_000,  # 44 458 observed

    # ── Current meta card data: the predictor's `_shareList` ground truth
    # for current-format archetype cards.
    'current_meta_card_data.csv':            2_000,   # 4 847 observed

    # ── Player continuity: Predictor 5.8 stickiness signal.
    'player_continuity.csv':                 2_000,   # 5 107 observed

    # ── Card master DB: 0-row would brick the Card Database tab.
    'all_cards_database.csv':                15_000,  # 20 248 observed
    'all_cards_merged.csv':                  15_000,  # 20 455 observed

    # ── Cardmarket prices: drives the price overlays.
    'price_data.csv':                        15_000,  # 20 242 observed
    'cardmarket_id_mapping.csv':             10_000,  # 17 220 observed

    # ── Per-decklist (Phase Y): currently only Turin is covered (see
    # F-D09). Threshold 0 = watch-but-allow-empty until the backfill
    # workflow lands; the moment any data appears we'll see it.
    'tournament_decklists_per_player.csv':   0,

    # ── City League Japan: in summer break as of 2026-06; the four
    # "current" CSVs are intentionally header-only. Threshold 0
    # documents the watch but doesn't revert.
    'city_league_analysis.csv':              0,
    'city_league_archetypes.csv':            0,
    'city_league_archetypes_comparison.csv': 0,
    'city_league_archetypes_deck_stats.csv': 0,
}


def count_csv_rows(path: str) -> int:
    """Count non-header rows in `path`. Returns -1 on read error."""
    try:
        with open(path, 'r', encoding='utf-8-sig', newline='') as f:
            # csv.reader handles any delimiter without sniffing — we
            # only care about row count, not field count
            first = f.readline()
            if not first:
                return 0
            return sum(1 for _ in f)
    except (OSError, UnicodeDecodeError):
        return -1


def git_checkout(path: str, repo_root: str) -> bool:
    """Restore `path` from HEAD. True on success."""
    try:
        rel = os.path.relpath(path, repo_root)
        res = subprocess.run(
            ['git', 'checkout', '--', rel],
            cwd=repo_root,
            capture_output=True, text=True, timeout=30,
        )
        return res.returncode == 0
    except (subprocess.SubprocessError, OSError):
        return False


def main(argv: list[str]) -> int:
    data_dir = argv[1] if len(argv) > 1 else 'data'
    repo_root = os.path.abspath(os.path.join(os.path.dirname(data_dir), '.'))
    data_dir_abs = os.path.abspath(data_dir)

    if not os.path.isdir(data_dir_abs):
        print(f'::error::data dir not found: {data_dir_abs}', file=sys.stderr)
        return 1

    reverts: list[str] = []
    watches: list[str] = []
    passes: list[str] = []

    print(f'Data sanity check: {len(THRESHOLDS)} files watched')
    print(f'  data_dir = {data_dir_abs}')
    print(f'  repo_root = {repo_root}')
    print()

    for fname, threshold in sorted(THRESHOLDS.items()):
        path = os.path.join(data_dir_abs, fname)
        if not os.path.isfile(path):
            print(f'  SKIP  {fname:55s} (file not on disk)')
            continue
        rows = count_csv_rows(path)
        if rows < 0:
            print(f'  SKIP  {fname:55s} (read error)')
            continue

        if threshold == 0:
            # Watch-only — log the row count for the build summary but
            # don't revert anything.
            watches.append(f'{fname}: {rows} rows (watch-only)')
            print(f'  WATCH {fname:55s} {rows:>8} rows  (threshold=0, watch-only)')
            continue

        if rows < threshold:
            # Revert the file from HEAD. The previous good snapshot
            # carries forward; the bad scrape gets dropped from this
            # commit's diff.
            ok = git_checkout(path, repo_root)
            tag = 'REVERTED' if ok else 'REVERT-FAILED'
            reverts.append(f'{fname}: {rows} < {threshold} → {tag}')
            print(f'  ❌ {fname:55s} {rows:>8} rows  (<{threshold}, {tag})')
            print(f'    ::warning::Data sanity: {fname} dropped below threshold '
                  f'({rows} < {threshold}); reverted to last good snapshot')
        else:
            passes.append(f'{fname}: {rows} rows')
            print(f'  ✓     {fname:55s} {rows:>8} rows  (≥{threshold})')

    print()
    print(f'Summary: {len(passes)} pass · {len(watches)} watch-only · {len(reverts)} revert')
    if reverts:
        print('Reverted files:')
        for r in reverts:
            print(f'  - {r}')

    # Always exit 0: the failure mode is "this file got rolled back",
    # not "the entire pipeline is broken". The reverts produce
    # ::warning:: lines that the workflow summary will surface.
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
