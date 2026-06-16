#!/usr/bin/env python3
"""Cross-pipeline tournament-coverage reconciliation.

Companion to scripts/sanity_check_data.py. That script guards against EMPTY
or truncated files (row-count thresholds). This one guards against a subtler
failure the row-count gate can't see: a tournament that was scraped on one
surface but never propagated to the files the tabs actually read — the files
are full, just missing a tournament.

Concretely: every in-person major in the current format's labs file
(``labs_tournament_decks_<FMT>.csv``) should also appear in the current
format's cards file (``tournament_cards_data_cards_<FMT>.csv``). When it
doesn't — as happened with NAIC (in labs as id 0070, absent from the cards
chunk for weeks) — we emit a GitHub ``::warning::`` so it shows up on the run
page on day one instead of being noticed by eye weeks later.

Matching is by normalised tournament DATE (labs writes ISO ``2026-06-12``;
cards writes the ordinal ``12th June 2026``) plus a fuzzy name check, because
the two surfaces name the same event differently ("Special Event Turin" vs
"Special Event Turin – Limitless"). Only majors at/above MAJOR_MIN_PLAYERS
and older than the grace period are checked, so a tournament that finished a
day ago (and simply hasn't propagated yet) never trips a false alarm.

Exit-code policy (matches sanity_check_data.py — soft by default):
    0  → ran successfully, regardless of how many gaps were found (gaps are
         surfaced as ``::warning::`` lines for the build summary)
    1  → script error (missing format_window.json etc.), OR any gap found
         when --strict is given (for local/manual verification)

Usage:
    python3 scripts/reconcile_tournament_coverage.py [DATA_DIR] [--strict] \
        [--grace-days N]
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
from datetime import datetime, timedelta

SEMI = ";"
COMMA = ","

# Ignore tiny local events that may legitimately live on one surface only.
MAJOR_MIN_PLAYERS = 200


def _parse_date(raw: str):
    """Accept ISO 'YYYY-MM-DD' and English-ordinal '12th June 2026'."""
    raw = (raw or "").strip()
    if not raw:
        return None
    try:
        return datetime.strptime(raw, "%Y-%m-%d")
    except ValueError:
        pass
    m = re.match(r"(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})", raw)
    if not m:
        return None
    try:
        return datetime.strptime(
            f"{m.group(1)} {m.group(2)[:3]} {m.group(3)}", "%d %b %Y"
        )
    except ValueError:
        return None


def _norm_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


def _distinct_tournaments(path: str, delimiter: str):
    """{tournament_id: (name, date_obj, players)} for a tournament CSV."""
    out: dict[str, tuple] = {}
    if not os.path.isfile(path):
        return out
    with open(path, encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh, delimiter=delimiter):
            tid = (row.get("tournament_id") or "").strip()
            if not tid or tid in out:
                continue
            try:
                players = int(float(row.get("total_players") or 0))
            except ValueError:
                players = 0
            out[tid] = (
                (row.get("tournament_name") or "").strip(),
                _parse_date(row.get("tournament_date") or ""),
                players,
            )
    return out


def find_coverage_gaps(data_dir: str, grace_days: int) -> list[str]:
    """Return human-readable gap descriptions (empty list = all covered).

    Raises FileNotFoundError if format_window.json is missing/unreadable.
    """
    fw_path = os.path.join(data_dir, "format_window.json")
    with open(fw_path, encoding="utf-8-sig") as fh:
        fw = json.load(fh)
    current = (fw.get("current_set") or "").strip().upper()
    oldest = (fw.get("oldest_legal_set") or "").strip().upper()
    if not current or not oldest:
        raise ValueError("format_window.json lacks current_set/oldest_legal_set")
    fmt = f"{oldest}-{current}"

    labs_path = os.path.join(data_dir, f"labs_tournament_decks_{fmt}.csv")
    cards_path = os.path.join(data_dir, f"tournament_cards_data_cards_{fmt}.csv")
    if not os.path.isfile(labs_path):
        # No labs file for the current format yet (just after rotation) →
        # nothing to reconcile against.
        return []

    labs = _distinct_tournaments(labs_path, COMMA)
    cards = _distinct_tournaments(cards_path, SEMI)

    cards_names = {_norm_name(n) for (n, _d, _p) in cards.values()}
    cards_by_date: dict = {}
    for name, dobj, _players in cards.values():
        if dobj:
            cards_by_date.setdefault(dobj.date(), []).append(_norm_name(name))

    cutoff = datetime.utcnow() - timedelta(days=grace_days)
    gaps: list[str] = []
    for tid, (name, dobj, players) in sorted(labs.items()):
        if players < MAJOR_MIN_PLAYERS:
            continue
        if dobj is None or dobj > cutoff:
            continue  # too fresh / undated — give the cards pipeline time
        norm = _norm_name(name)
        same_day = cards_by_date.get(dobj.date(), [])
        matched = (
            any(norm in c or c in norm for c in same_day)
            or any(norm in c or c in norm for c in cards_names)
        )
        if not matched:
            gaps.append(
                f"{fmt}: labs major '{name}' ({dobj.date()}, {players} players, "
                f"id {tid}) is missing from tournament_cards_data_cards_{fmt}.csv"
            )
    return gaps


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("data_dir", nargs="?", default="data")
    ap.add_argument("--grace-days", type=int, default=3,
                    help="Only flag majors older than this many days (default 3).")
    ap.add_argument("--strict", action="store_true",
                    help="Exit 1 when a gap is found (for local verification).")
    args = ap.parse_args(argv[1:])

    data_dir = os.path.abspath(args.data_dir)
    if not os.path.isdir(data_dir):
        print(f"::error::data dir not found: {data_dir}", file=sys.stderr)
        return 1

    try:
        gaps = find_coverage_gaps(data_dir, args.grace_days)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"::error::reconciliation could not run: {exc}", file=sys.stderr)
        return 1

    if not gaps:
        print("Tournament coverage reconciliation: OK (no gaps)")
        return 0

    print(f"Tournament coverage reconciliation: {len(gaps)} gap(s) found")
    for g in gaps:
        print(f"  - {g}")
        print(f"::warning::Tournament coverage gap — {g}")
    return 1 if args.strict else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
