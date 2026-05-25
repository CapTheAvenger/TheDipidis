"""Migration: strip price-tag suffixes from the 'archetype' column of
tournament_cards_data_cards_*.csv.

Background:
  - Limitless's main-site .decklist-title concatenates the deck-name and
    the USD/EUR price chips into a single text node; get_text() produced
    archetype values like "Crustle16.57$9.53€".
  - tournament_scraper_JH.py was patched (commit ac6d36c, 2026-05-23) to
    strip the suffix at scrape time via _clean_deck_name. 13 of the 14
    per-format card chunks were scraped BEFORE the patch and still carry
    the contamination — ~450 000 rows.
  - The frontend already strips at read time (app-past-meta.js
    sanitizePastMetaArchetypeName, app-meta-call.js stripPriceTag) so
    the bug is invisible to users, but the raw data stays dirty.

This script writes the strip into the actual CSV files so downstream
consumers see clean values. Idempotent — re-runs are a no-op once every
row is clean.

Usage:
  python3 backend/scrapers/clean_past_meta_archetypes.py
  python3 backend/scrapers/clean_past_meta_archetypes.py --dry-run
  python3 backend/scrapers/clean_past_meta_archetypes.py --format SVI-ASC
"""

import argparse
import csv
import glob
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(ROOT, "data")

# Same regex tournament_scraper_JH._clean_deck_name uses. Matches a
# trailing "<n>.<n>$<n>.<n>€" or "<n>,<n>$<n>,<n>€" (decimal commas
# possible) at the end of the archetype string. Keeping in sync with
# js/app-meta-call.js:stripPriceTag (regex form `\d+(?:[.,]\d+)?\$\d+(?:[.,]\d+)?€.*$`).
_PRICE_RE = re.compile(r'\s*\d+(?:[.,]\d+)?\s*\$\s*\d+(?:[.,]\d+)?\s*[€$]\s*$')


def clean(name: str) -> str:
    if not name:
        return name
    cleaned = _PRICE_RE.sub('', name).strip()
    return cleaned or name


def process_file(path: str, dry_run: bool) -> dict:
    """Rewrite the CSV with cleaned archetype values. Returns counters."""
    counts = {"total_rows": 0, "changed_rows": 0, "merged_rows": 0}

    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f, delimiter=";")
        fieldnames = reader.fieldnames or []
        rows = []
        # Dedupe key: every other field combined. After cleaning,
        # multiple cards-rows that originally differed only by price
        # suffix become identical — merge them by overwriting (last
        # wins; identical contents either way).
        seen_keys = {}
        for r in reader:
            counts["total_rows"] += 1
            original = r.get("archetype", "")
            cleaned = clean(original)
            if cleaned != original:
                counts["changed_rows"] += 1
                r["archetype"] = cleaned
            # Build a dedup key from every column except archetype's
            # original form (we want post-cleanup uniqueness).
            key = tuple((r.get(fn) or "") for fn in fieldnames)
            if key in seen_keys:
                counts["merged_rows"] += 1
                continue
            seen_keys[key] = True
            rows.append(r)

    if dry_run:
        return counts

    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=";")
        writer.writeheader()
        writer.writerows(rows)
    return counts


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true", help="Report only.")
    ap.add_argument("--format", help="Process a single format key (e.g. SVI-ASC).")
    args = ap.parse_args()

    if args.format:
        files = [os.path.join(DATA_DIR, f"tournament_cards_data_cards_{args.format}.csv")]
        files = [f for f in files if os.path.exists(f)]
        if not files:
            print(f"ERROR: tournament_cards_data_cards_{args.format}.csv not found", file=sys.stderr)
            sys.exit(1)
    else:
        files = sorted(glob.glob(os.path.join(DATA_DIR, "tournament_cards_data_cards_*.csv")))

    grand_total = 0
    grand_changed = 0
    grand_merged = 0
    for path in files:
        bn = os.path.basename(path)
        counts = process_file(path, args.dry_run)
        grand_total += counts["total_rows"]
        grand_changed += counts["changed_rows"]
        grand_merged += counts["merged_rows"]
        print(f"  {bn:<48} rows={counts['total_rows']:>6}  changed={counts['changed_rows']:>6}  merged={counts['merged_rows']:>6}")

    print(f"\nTOTAL  rows={grand_total}  changed={grand_changed}  merged={grand_merged}")
    if args.dry_run:
        print("(dry-run — no files modified)")


if __name__ == "__main__":
    main()
