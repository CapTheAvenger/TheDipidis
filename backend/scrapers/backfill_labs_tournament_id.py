#!/usr/bin/env python3
"""Fill in missing labs_tournament_id values on historical overview rows.

Why this exists: tournament_scraper_JH.save_csv_files() computes
``labs_tournament_id`` at WRITE time, so a row keeps whatever the resolver
returned on the day it was scraped. When the resolver improves — a new manual
override lands, or a labs tournament that had not been published yet appears —
the old rows are never revisited and keep an empty cell forever.

Measured on data/tournament_cards_data_overview.csv (111 rows):

    filled                                          64
    empty                                           47
      pre-labs-era (< 2024-09-14, unmappable)       38
      documented in intentionally_unmapped           4
      actually resolvable today                      5

REPORTS BY DEFAULT. ``--apply`` writes, and only ever into cells that are
currently EMPTY. It never overwrites an existing value and never invents an
override entry, because the only signal available for guessing one is the date
and the dates collide in this very dataset:

    cards 503 'Special Event Durban'       2025-05-24 -> labs that day: Portland
    cards 502 'Special Event Johannesburg' 2025-04-26 -> labs that day: Seville
    2026-05-23 carries two labs events (Melbourne 0066 and Lima 0067)

The first two are recorded in intentionally_unmapped as having NO labs entry.
A date-proximity auto-override would write two provably wrong mappings into a
file a human curated to prevent exactly that. New overrides stay a human
decision with a written reason — see CLAUDE.md, "report, don't silently
repair", and data/labs_tournament_id_overrides.json.

Usage:
    python3 backend/scrapers/backfill_labs_tournament_id.py            # report
    python3 backend/scrapers/backfill_labs_tournament_id.py --apply    # write
    python3 backend/scrapers/backfill_labs_tournament_id.py --strict   # exit 1
                                                       # if anything is fillable
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ROOT, "backend", "core"))

# labs.limitlesstcg.com only starts here; rows older than this can never have a
# labs id and must not be reported as a gap.
LABS_ERA_START = "2024-09-14"

OVERVIEW = "tournament_cards_data_overview.csv"
SEMI = ";"


def _data_dir(explicit=None):
    """Directory that actually holds the overview CSV.

    get_data_dir() resolves to backend/core/data, the scrapers' working copy,
    which only exists mid-run on a CI runner. The published copy lives in
    data/. Pick whichever one has the file rather than erroring on the first
    candidate — and if neither does, say so instead of reporting zero gaps
    against a directory that has no rows in it.
    """
    candidates = []
    if explicit:
        candidates.append(explicit)
    try:
        from card_scraper_shared import get_data_dir  # noqa: PLC0415
        candidates.append(get_data_dir())
    except Exception:  # noqa: BLE001
        pass
    candidates.append(os.path.join(ROOT, "data"))
    for d in candidates:
        if d and os.path.isfile(os.path.join(d, OVERVIEW)):
            return d
    raise FileNotFoundError(
        f"{OVERVIEW} not found in any of: {', '.join(c for c in candidates if c)}")


def _intentionally_unmapped(data_dir):
    path = os.path.join(data_dir, "labs_tournament_id_overrides.json")
    try:
        with open(path, encoding="utf-8-sig") as fh:
            blob = json.load(fh)
    except (OSError, json.JSONDecodeError):
        return set()
    entry = blob.get("intentionally_unmapped") or {}
    return set(map(str, entry.keys() if isinstance(entry, dict) else entry))


def _iso(date_str):
    from tournament_scraper_JH import _parse_iso_date  # noqa: PLC0415
    return _parse_iso_date(date_str)


def _point_resolver_at(data_dir):
    """Make the scraper's cached lookups read from OUR data dir.

    _load_labs_id_overrides() and _build_labs_id_lookup() both call
    get_data_dir(), which resolves to backend/core/data — the scrapers' working
    copy, which does not exist outside a CI run. Left alone they load 0
    overrides and index 0 tournaments, and every row then reports as
    "unresolved" no matter what the data says. That is a broken measurement,
    not a finding, so bind them to the directory we actually read.
    """
    import tournament_scraper_JH as jh  # noqa: PLC0415
    jh.get_data_dir = lambda *_a, **_k: data_dir
    jh._LABS_ID_OVERRIDES_CACHE = None
    jh._LABS_ID_LOOKUP_CACHE = None
    return jh


def analyse(data_dir):
    """(rows, fieldnames, fillable, pre_era, documented) — no side effects."""
    jh = _point_resolver_at(data_dir)
    _resolve_labs_tournament_id = jh._resolve_labs_tournament_id

    path = os.path.join(data_dir, OVERVIEW)
    with open(path, encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh, delimiter=SEMI)
        fieldnames = reader.fieldnames or []
        rows = list(reader)

    skip = _intentionally_unmapped(data_dir)
    fillable, pre_era, documented, unresolved = [], [], [], []

    for row in rows:
        if (row.get("labs_tournament_id") or "").strip():
            continue
        tid = (row.get("tournament_id") or "").strip()
        name = (row.get("tournament_name") or "").strip()
        date = (row.get("tournament_date") or "").strip()
        iso = _iso(date)
        if iso and iso < LABS_ERA_START:
            pre_era.append(tid)
            continue
        if tid in skip:
            documented.append(tid)
            continue
        resolved = _resolve_labs_tournament_id(name, date, tid)
        if resolved:
            fillable.append((row, tid, name, iso or date, resolved))
        else:
            unresolved.append((tid, name, iso or date))

    return rows, fieldnames, fillable, pre_era, documented, unresolved


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true",
                    help="write the resolved ids into empty cells (default: report only)")
    ap.add_argument("--strict", action="store_true",
                    help="exit 1 when anything is fillable or unresolved")
    ap.add_argument("--data-dir", default=None,
                    help="override the data directory (default: whichever of "
                         "backend/core/data or data/ holds the overview CSV)")
    args = ap.parse_args(argv[1:])

    try:
        data_dir = _data_dir(args.data_dir)
    except FileNotFoundError as exc:
        print(f"::error::backfill could not run: {exc}", file=sys.stderr)
        return 1
    print(f"data dir: {data_dir}")
    try:
        rows, fieldnames, fillable, pre_era, documented, unresolved = analyse(data_dir)
    except (OSError, ImportError) as exc:
        print(f"::error::backfill could not run: {exc}", file=sys.stderr)
        return 1

    print(f"labs_tournament_id backfill — {len(rows)} overview rows")
    print(f"  fillable now:            {len(fillable)}")
    print(f"  pre-labs-era (skipped):  {len(pre_era)}")
    print(f"  intentionally unmapped:  {len(documented)}")
    print(f"  still unresolved:        {len(unresolved)}")

    for _row, tid, name, date, resolved in fillable:
        print(f"    + {tid} '{name}' ({date}) -> {resolved}")
    for tid, name, date in unresolved:
        # Reported, never guessed: a resolvable-looking row with no match needs
        # a human override entry with a reason string.
        print(f"    ? {tid} '{name}' ({date}) — no match; add an override with a reason")
        print(f"::warning::labs id unresolved for cards tournament {tid} ('{name}', {date})")

    if fillable and args.apply:
        for row, _tid, _name, _date, resolved in fillable:
            row["labs_tournament_id"] = resolved
        path = os.path.join(data_dir, OVERVIEW)
        with open(path, "w", encoding="utf-8-sig", newline="") as fh:
            writer = csv.DictWriter(fh, fieldnames=fieldnames, delimiter=SEMI)
            writer.writeheader()
            writer.writerows(rows)
        print(f"  wrote {len(fillable)} id(s) into {OVERVIEW}")
    elif fillable:
        print("  (report only — pass --apply to write)")

    if args.strict and (fillable or unresolved):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
