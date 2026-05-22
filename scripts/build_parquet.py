#!/usr/bin/env python3
"""
Build city_league_analysis.parquet from data/city_league_analysis.csv.

Called by the Weekly Full Update workflow after the CSV has been
finalized. Converts the CSV to Parquet for efficient DuckDB-WASM
queries in the browser.

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
    df = pd.read_csv(INPUT_CSV, dtype=str, low_memory=False)
    print(f"[build_parquet] Rows: {len(df):,}  Columns: {list(df.columns)}")

    os.makedirs(DATA_DIR, exist_ok=True)

    print(f"[build_parquet] Writing {OUTPUT_PARQUET} ...")
    df.to_parquet(OUTPUT_PARQUET, index=False, engine="pyarrow", compression="snappy")

    size_mb = os.path.getsize(OUTPUT_PARQUET) / 1_048_576
    print(f"[build_parquet] Done. File size: {size_mb:.2f} MB")


if __name__ == "__main__":
    build_parquet()
