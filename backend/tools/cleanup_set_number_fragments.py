#!/usr/bin/env python3
"""
cleanup_set_number_fragments.py — one-shot cleanup for B-39.

The city_league scraper used to read set_number from a URL like
    /cards/M3/61?translate=en
without stripping the query string, so set_number ended up as
    61?translate=en
across 5329 rows in data/city_league_analysis*.csv. The downstream
join against all_cards_database.csv produces 0 matches for any such
row, so the card appears as "unknown" / no image in the UI.

The scraper itself is fixed in card_scraper_shared.py (B-39 hotfix),
so future weekly runs write clean rows. This script cleans up the
historical rows that are already committed.

Run from the repo root:
    python backend/tools/cleanup_set_number_fragments.py

It's idempotent — safe to re-run; rows without a '?' in set_number
are left alone. Writes atomically (temp file + os.replace) so a Ctrl-C
mid-write doesn't truncate the CSV.
"""
from __future__ import annotations

import csv
import os
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data"

TARGET_FILES = [
    "city_league_analysis.csv",
    "city_league_analysis_M3.csv",
]

# Columns that get URL-fragment-leakage. set_number is the primary
# culprit (B-39); card_identifier may also embed it.
COLUMNS_TO_CLEAN = ["set_number", "card_identifier"]


def strip_url_fragments(value: str) -> str:
    """Strip everything from '?' or '#' onwards. Idempotent."""
    if not isinstance(value, str) or not value:
        return value
    for sep in ("?", "#"):
        idx = value.find(sep)
        if idx >= 0:
            return value[:idx]
    return value


def clean_csv_file(path: Path) -> tuple[int, int]:
    """Return (rows_total, rows_cleaned)."""
    if not path.exists():
        print(f"  skip: {path.name} not found")
        return 0, 0

    # Detect delimiter from the first line — these CSVs are semicolon-separated
    # with BOM, but be defensive.
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        first_line = f.readline()
    delimiter = ";" if first_line.count(";") > first_line.count(",") else ","

    rows_total = 0
    rows_cleaned = 0

    # Write to a tempfile in the same dir, then os.replace — atomic on POSIX
    # and on NTFS for same-volume targets.
    fd, tmp_path_str = tempfile.mkstemp(
        prefix=path.name + ".cleanup.",
        dir=str(path.parent),
        suffix=".tmp",
    )
    tmp_path = Path(tmp_path_str)
    try:
        with os.fdopen(fd, "w", encoding="utf-8-sig", newline="") as out_fh, \
             path.open("r", encoding="utf-8-sig", newline="") as in_fh:
            reader = csv.DictReader(in_fh, delimiter=delimiter)
            if not reader.fieldnames:
                print(f"  skip: {path.name} has no header")
                tmp_path.unlink(missing_ok=True)
                return 0, 0
            writer = csv.DictWriter(
                out_fh, fieldnames=reader.fieldnames, delimiter=delimiter
            )
            writer.writeheader()
            for row in reader:
                rows_total += 1
                row_changed = False
                for col in COLUMNS_TO_CLEAN:
                    if col in row:
                        original = row[col]
                        cleaned = strip_url_fragments(original)
                        if cleaned != original:
                            row[col] = cleaned
                            row_changed = True
                if row_changed:
                    rows_cleaned += 1
                writer.writerow(row)

        os.replace(tmp_path, path)
    except BaseException:
        # Make sure we never leave a half-written tempfile behind.
        try:
            tmp_path.unlink(missing_ok=True)
        except Exception:
            pass
        raise

    print(f"  {path.name}: {rows_total} rows total, {rows_cleaned} cleaned")
    return rows_total, rows_cleaned


def main() -> int:
    print(f"Scanning {DATA_DIR} for URL-fragment leakage (B-39 cleanup)…")
    grand_total = 0
    grand_cleaned = 0
    for name in TARGET_FILES:
        rows, cleaned = clean_csv_file(DATA_DIR / name)
        grand_total += rows
        grand_cleaned += cleaned
    print(f"Done: {grand_cleaned} of {grand_total} rows cleaned across {len(TARGET_FILES)} files.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
