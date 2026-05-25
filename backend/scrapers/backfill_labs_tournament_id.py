"""One-time migration: backfill labs_tournament_id into the existing
tournament_cards_data_overview.csv by cross-referencing against the
labs_tournament_decks_*.csv files already in data/.

Why this exists:
  - tournament_scraper_JH.py writes overview rows from
    limitlesstcg.com (3-digit tournament_id), labs_tournament_scraper.py
    writes labs CSV rows from labs.limitlesstcg.com (4-digit padded
    tournament_id). The two ID schemas don't align, so the Past Meta
    UI and Meta Call frontend can't cross-reference rows between the
    two sources without resolving by name + date at runtime.
  - From now on save_csv_files writes a 'labs_tournament_id' column
    for new rows. This script adds the same column to historical
    overview rows so the frontend can rely on it across the board.

Idempotent. Re-running is a no-op if every row already has a value.

Usage:
  python3 backend/scrapers/backfill_labs_tournament_id.py
  python3 backend/scrapers/backfill_labs_tournament_id.py --dry-run
"""

import argparse
import csv
import os
import re
import sys
from datetime import datetime

# Allow `from backend.scrapers...` even when launched from repo root or
# from inside backend/scrapers/.
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(ROOT, "data")
OVERVIEW_CSV = os.path.join(DATA_DIR, "tournament_cards_data_overview.csv")


_US_STATE_CODES = {
    'al','ak','az','ar','ca','co','ct','de','fl','ga','hi','id','il','in','ia',
    'ks','ky','la','me','md','ma','mi','mn','ms','mo','mt','ne','nv','nh','nj',
    'nm','ny','nc','nd','oh','ok','or','pa','ri','sc','sd','tn','tx','ut','vt',
    'va','wa','wv','wi','wy','dc',
}

def normalize_tournament_name(name: str) -> str:
    """Must mirror tournament_scraper_JH._normalize_tournament_name_for_match.
    Any divergence breaks the cross-reference."""
    s = (name or "").lower()
    s = re.sub(r'[–—\-]', ' ', s)
    s = re.sub(r'\b(championships?|limitless|regional|special event|international|world|stadium|tcg)\b', ' ', s)
    s = re.sub(r'[^a-z0-9]+', ' ', s)
    tokens = [tok for tok in s.split() if tok not in _US_STATE_CODES]
    return ' '.join(tokens)


def parse_iso_date(date_str: str) -> str:
    raw = (date_str or "").strip()
    if not raw:
        return ""
    if re.match(r'^\d{4}-\d{2}-\d{2}', raw):
        return raw[:10]
    cleaned = re.sub(r'(\d+)(st|nd|rd|th)', r'\1', raw, flags=re.IGNORECASE)
    for fmt in ("%d %B %Y", "%d %b %Y", "%B %d %Y", "%b %d %Y"):
        try:
            return datetime.strptime(cleaned, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return raw


def build_lookup():
    """(normalized_name, iso_date) → labs_tournament_id"""
    lookup = {}
    for fname in sorted(os.listdir(DATA_DIR)):
        if not (fname.startswith("labs_tournament_decks_") and fname.endswith(".csv")):
            continue
        path = os.path.join(DATA_DIR, fname)
        with open(path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                tid = (row.get("tournament_id") or "").strip()
                name = (row.get("tournament_name") or "").strip()
                date_str = (row.get("tournament_date") or "").strip()
                if not tid or not name:
                    continue
                key = (normalize_tournament_name(name), parse_iso_date(date_str))
                if key not in lookup:
                    lookup[key] = tid
    return lookup


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true", help="Report what would change, write nothing.")
    args = ap.parse_args()

    if not os.path.exists(OVERVIEW_CSV):
        print(f"ERROR: {OVERVIEW_CSV} not found", file=sys.stderr)
        sys.exit(1)

    lookup = build_lookup()
    print(f"Indexed {len(lookup)} (name, date) → labs_tid pairs from labs CSVs")

    # Read overview, ensure utf-8-sig BOM is preserved
    with open(OVERVIEW_CSV, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f, delimiter=";")
        rows = list(reader)
        fieldnames = list(reader.fieldnames or [])

    if "labs_tournament_id" not in fieldnames:
        fieldnames.append("labs_tournament_id")

    matched = 0
    already = 0
    missing = 0
    for r in rows:
        current = (r.get("labs_tournament_id") or "").strip()
        if current:
            already += 1
            continue
        name = r.get("tournament_name", "")
        date_str = r.get("tournament_date", "")
        key = (normalize_tournament_name(name), parse_iso_date(date_str))
        labs_tid = lookup.get(key, "")
        r["labs_tournament_id"] = labs_tid
        if labs_tid:
            matched += 1
        else:
            missing += 1

    total = len(rows)
    print(f"Overview rows: {total}")
    print(f"  already had labs_tournament_id: {already}")
    print(f"  newly matched: {matched}")
    print(f"  unmatched (left blank): {missing}")

    if args.dry_run:
        print("\nDry-run — no changes written.")
        # Print first 5 unmatched for sanity check
        unmatched = [r for r in rows if not (r.get("labs_tournament_id") or "").strip()]
        if unmatched:
            print("\nFirst 5 unmatched tournaments:")
            for r in unmatched[:5]:
                print(f"  tid={r.get('tournament_id'):<5} {r.get('tournament_date'):<25} {r.get('tournament_name')[:60]}")
        return

    with open(OVERVIEW_CSV, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=";")
        writer.writeheader()
        writer.writerows(rows)
    print(f"\nWrote {OVERVIEW_CSV}")


if __name__ == "__main__":
    main()
