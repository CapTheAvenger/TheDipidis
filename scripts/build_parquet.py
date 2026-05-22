#!/usr/bin/env python3
"""
Build city_league_analysis.parquet from data/city_league_analysis.csv.

Called by the Weekly Full Update workflow after the CSV has been
finalized. Converts the CSV to Parquet for efficient DuckDB-WASM
queries in the browser.

CSV dialect (matters!)
----------------------
The city-league scraper writes a DE-locale CSV:
  - semicolon-separated (sep=';')
  - comma decimals (decimal=',')  →  "4,0" parses as 4.0, not str
  - UTF-8 with BOM (encoding='utf-8-sig')

The earlier version of this script omitted these — pandas defaulted
to comma-separated and read the whole row as a single string column.
The resulting Parquet had 1 column where the column name was the
full 22-column header and every cell was the full row string,
which made downstream DuckDB queries useless.

Usage:
    python scripts/build_parquet.py

Output:
    data/city_league_analysis.parquet
"""

import os
import sys

import pandas as pd

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
INPUT_CSV = os.path.join(DATA_DIR, "city_league_analysis.csv")
OUTPUT_PARQUET = os.path.join(DATA_DIR, "city_league_analysis.parquet")


def build_parquet():
    if not os.path.exists(INPUT_CSV):
        print(f"[build_parquet] ERROR: {INPUT_CSV} not found", file=sys.stderr)
        sys.exit(1)

    print(f"[build_parquet] Reading {INPUT_CSV} ...")
    # Let pandas infer numeric types so DuckDB queries can SUM/AVG
    # properly. `dtype=str` would force everything to large_string
    # which kills predicate-pushdown on numeric columns.
    df = pd.read_csv(
        INPUT_CSV,
        sep=";",
        decimal=",",
        encoding="utf-8-sig",
        low_memory=False,
    )
    print(f"[build_parquet] Rows: {len(df):,}  Cols: {len(df.columns)}")

    os.makedirs(DATA_DIR, exist_ok=True)

    print(f"[build_parquet] Writing {OUTPUT_PARQUET} ...")
    # Snappy: ~3× faster decompress than gzip in the browser worker,
    # ~3× smaller than raw CSV. DuckDB-WASM strongly prefers it over
    # Zstd (single-threaded decode in the WASM bundle).
    df.to_parquet(OUTPUT_PARQUET, index=False, engine="pyarrow", compression="snappy")

    csv_mb = os.path.getsize(INPUT_CSV) / 1_048_576
    pq_mb = os.path.getsize(OUTPUT_PARQUET) / 1_048_576
    ratio = csv_mb / pq_mb if pq_mb else 0
    print(f"[build_parquet] Done.  {csv_mb:.1f} MB CSV → {pq_mb:.2f} MB Parquet  ({ratio:.1f}× smaller)")


if __name__ == "__main__":
    build_parquet()
