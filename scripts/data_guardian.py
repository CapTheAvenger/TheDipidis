#!/usr/bin/env python3
"""Data guardian — checks the data pipeline's health and REPORTS. Never repairs.

Why report-only: this data drives prices and card identity. A silently "fixed"
mapping is worse than a reported hole — a wrong price looks correct, a missing
one is obviously missing. So every finding here becomes a human-readable report;
nothing is auto-corrected.

Why baseline-diff instead of absolute thresholds: measured against the live repo,
"every set below 90% mapped" flags 62 of 153 sets, and "recent expansion without
an expansion_code" flags 93 — nearly all of them long-standing, legitimately
unmappable (old promos, Japanese-only sets). Absolute thresholds here are pure
noise. What actually signals a problem is CHANGE:

  * a set that is NEW and doesn't map            <- the PBL failure of 2026-07
  * a set whose coverage DROPS                   <- scraper/mapper regression
  * a consumer file that suddenly SHRINKS        <- upstream fetch broke
  * a consumer file missing required columns     <- contract break for consumers
  * inputs that stopped refreshing               <- silent job failure

State lives in data/_guardian_baseline.json. The daily job commits the updated
baseline so "changed since yesterday" stays meaningful.

Exit code is always 0 unless --strict: findings are reported, not enforced, so a
data hole never blocks an unrelated pipeline.
"""
import argparse
import collections
import csv
import datetime as dt
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")
BASELINE = os.path.join(DATA, "_guardian_baseline.json")

# ── Consumer contract ────────────────────────────────────────────────────────
# The files other projects (the tcg-exclusive-radar mirror + bot) read from this
# repo. Documented for humans in data/_consumers.md; this dict is the machine
# -readable source of truth the schema check runs against. Adding a column is
# safe; removing/renaming one breaks a consumer, so it is reported loudly.
CONSUMERS = {
    "cardmarket_id_mapping.csv": {
        "required": ["set", "number", "cardmarket_product_id", "match_method", "base_name"],
        "purpose": "(set, number) -> Cardmarket idProduct. The join key for prices.",
    },
    "cm_expansions.csv": {
        "required": ["id_expansion", "expansion_code", "name", "release_date",
                     "code_source", "n_singles"],
        "purpose": "Cardmarket idExpansion -> expansion_code + set name (image paths, set catalogue).",
    },
    "cardmarket_card_images.csv": {
        "required": ["idProduct", "id_category", "expansion_code", "id_expansion",
                     "number", "name_en", "name_de", "image_url", "stamped_image_url"],
        "purpose": "Prize Pack singles -> Cardmarket S3 image + official CloudFront stamped image.",
    },
    "prizepack_official_images.csv": {
        "required": ["series", "gallery_number", "set_code", "set_number",
                     "name_de", "name_en", "image_url_de", "image_url_en"],
        "purpose": "Prize Pack card -> official play.pokemon.com image + its original print.",
    },
    "price_data.csv": {
        "required": ["name", "set", "number", "eur_price", "eur_low",
                     "cardmarket_url", "last_updated"],
        "purpose": "Per-print market prices consumed by the site and the bot.",
    },
}

# Inputs that must keep refreshing; stale means a fetch job died quietly.
FRESHNESS = {
    "price_guide_6.json": 3,       # Cardmarket publishes daily
    "products_singles_6.json": 10,
    "cardmarket_id_mapping.csv": 3,
    "price_data.csv": 3,
}

COVERAGE_DROP_PP = 10.0   # percentage points a set may lose before we flag it
SHRINK_PCT = 10.0         # % of rows a consumer file may lose before we flag it
MIN_CARDS_FOR_COVERAGE = 5


def read_csv(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def col(row, name):
    return (row.get(name) or "").strip()


def set_coverage():
    """{set_code: (mapped, total, pct)} — how much of each set has a Cardmarket id."""
    db = collections.Counter()
    for r in read_csv(os.path.join(DATA, "all_cards_database.csv")):
        s = col(r, "set").upper()
        if s:
            db[s] += 1
    mapped = collections.Counter()
    for r in read_csv(os.path.join(DATA, "cardmarket_id_mapping.csv")):
        s = col(r, "set").upper()
        if s:
            mapped[s] += 1
    out = {}
    for s, total in db.items():
        if total < MIN_CARDS_FOR_COVERAGE:
            continue
        m = mapped.get(s, 0)
        out[s] = (m, total, round(100.0 * m / total, 1))
    return out


def file_rows():
    """{filename: row_count} for the consumer files that exist."""
    out = {}
    for fn in CONSUMERS:
        p = os.path.join(DATA, fn)
        if os.path.exists(p):
            out[fn] = len(read_csv(p))
    return out


def check_schema(findings):
    for fn, spec in CONSUMERS.items():
        p = os.path.join(DATA, fn)
        if not os.path.exists(p):
            findings.append(("CRITICAL", f"consumer file missing: data/{fn}"))
            continue
        with open(p, encoding="utf-8-sig", newline="") as f:
            header = csv.DictReader(f).fieldnames or []
        missing = [c for c in spec["required"] if c not in header]
        if missing:
            findings.append(("CRITICAL",
                             f"data/{fn} lost required column(s) {missing} — this breaks consumers"))


def check_freshness(findings):
    today = dt.date.today()
    for fn, max_age in FRESHNESS.items():
        p = os.path.join(DATA, fn)
        if not os.path.exists(p):
            findings.append(("WARN", f"input missing: data/{fn}"))
            continue
        age = (today - dt.date.fromtimestamp(os.path.getmtime(p))).days
        if age > max_age:
            findings.append(("WARN",
                             f"data/{fn} is {age} days old (expected <= {max_age}) — "
                             f"a refresh job may have died silently"))


def check_coverage(findings, cov, base_cov):
    for s, (m, total, pct) in sorted(cov.items()):
        prev = base_cov.get(s)
        if prev is None:
            # A set we've never seen before. Unmapped-on-arrival is exactly the
            # PBL case: the set exists in our card DB but never reached Cardmarket.
            if pct < 90.0:
                findings.append(("CRITICAL",
                                 f"NEW set {s} mapped only {m}/{total} ({pct}%) — "
                                 f"new sets normally reach >90%; check the mapper's "
                                 f"set->idExpansion step"))
            continue
        drop = prev[2] - pct
        if drop >= COVERAGE_DROP_PP:
            findings.append(("CRITICAL",
                             f"set {s} coverage dropped {prev[2]}% -> {pct}% "
                             f"({prev[0]}/{prev[1]} -> {m}/{total}) — likely a regression"))
    gone = [s for s in base_cov if s not in cov]
    if gone:
        findings.append(("WARN", f"set(s) disappeared from the card DB: {sorted(gone)}"))


def check_shrink(findings, rows, base_rows):
    for fn, n in sorted(rows.items()):
        prev = base_rows.get(fn)
        if not prev:
            continue
        if n < prev * (1 - SHRINK_PCT / 100.0):
            findings.append(("CRITICAL",
                             f"data/{fn} shrank {prev} -> {n} rows "
                             f"({100.0*(prev-n)/prev:.0f}% fewer) — upstream fetch likely failed"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--update-baseline", action="store_true",
                    help="write the current state to the baseline after reporting")
    ap.add_argument("--strict", action="store_true",
                    help="exit 1 if any CRITICAL finding (default: always exit 0)")
    args = ap.parse_args()

    baseline = {}
    if os.path.exists(BASELINE):
        try:
            with open(BASELINE, encoding="utf-8") as f:
                baseline = json.load(f)
        except Exception as e:  # noqa: BLE001
            print(f"::warning::could not read baseline ({e}) — treating as first run")

    base_cov = {k: tuple(v) for k, v in baseline.get("set_coverage", {}).items()}
    base_rows = baseline.get("file_rows", {})
    first_run = not baseline

    cov = set_coverage()
    rows = file_rows()

    findings = []
    check_schema(findings)
    check_freshness(findings)
    check_shrink(findings, rows, base_rows)
    if first_run:
        print("First run — recording baseline; change-based checks start next run.")
    else:
        check_coverage(findings, cov, base_cov)

    crit = [f for lvl, f in findings if lvl == "CRITICAL"]
    warn = [f for lvl, f in findings if lvl == "WARN"]

    print(f"\nData guardian — {len(cov)} sets, {len(rows)} consumer files checked")
    print(f"  CRITICAL: {len(crit)} | WARN: {len(warn)}")
    for f in crit:
        print(f"::error::{f}")
    for f in warn:
        print(f"::warning::{f}")
    if not findings:
        print("  All checks passed — no action needed.")

    # Report only. Nothing above ever edits the data it inspects.
    if args.update_baseline:
        with open(BASELINE, "w", encoding="utf-8") as f:
            json.dump({
                "generated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
                "set_coverage": {k: list(v) for k, v in sorted(cov.items())},
                "file_rows": rows,
            }, f, ensure_ascii=False, indent=1, sort_keys=True)
        print(f"  Baseline updated -> {BASELINE}")

    return 1 if (args.strict and crit) else 0


if __name__ == "__main__":
    sys.exit(main())
