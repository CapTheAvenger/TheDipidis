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

# Sets deliberately kept out of sets.json — mirrors SUPERSEDED_SETS in
# backend/core/prepare_card_data.py and INTENTIONALLY_UNORDERED_SETS in
# backend/core/update_sets.py. M3 is fully superseded by POR.
INTENTIONALLY_UNORDERED_SETS = {"M3"}

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
                     "cardmarket_url", "last_updated", "price_status"],
        "purpose": "Per-print market prices consumed by the site and the bot. "
                   "price_status distinguishes ok / no_trend / stale / no_data — "
                   "eur_price alone cannot: Cardmarket publishes trend 0 to mean "
                   "'no trend computable', including on an 85 EUR card.",
    },
}

# Inputs that must keep refreshing; stale means a fetch job died quietly.
# Age is measured from the file's last GIT COMMIT, never its mtime: CI checks out
# with fetch-depth 1, which stamps every file with the clone time, so an
# mtime-based check reads 0 days for everything and can never fire. (That was a
# real dead check here — the detector for silent job death was itself silently
# dead.)
FRESHNESS = {
    "price_guide_6.json": 3,       # Cardmarket publishes daily
    "products_singles_6.json": 10,
    "cardmarket_id_mapping.csv": 3,
    "price_data.csv": 3,
    "cardmarket_card_images.csv": 14,      # weekly job
    "prizepack_official_images.csv": 14,   # weekly job
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


def _last_commit_date(path):
    """Date of the file's most recent commit, or None if git can't tell us.

    Deliberately not os.path.getmtime — see the note on FRESHNESS.
    """
    import subprocess  # noqa: PLC0415
    try:
        out = subprocess.run(
            ["git", "log", "-1", "--format=%cI", "--", path],
            cwd=ROOT, capture_output=True, text=True, timeout=20)
        stamp = (out.stdout or "").strip()
        return dt.date.fromisoformat(stamp[:10]) if stamp else None
    except Exception:  # noqa: BLE001
        return None


def check_freshness(findings):
    today = dt.date.today()
    for fn, max_age in FRESHNESS.items():
        p = os.path.join(DATA, fn)
        if not os.path.exists(p):
            findings.append(("WARN", f"input missing: data/{fn}"))
            continue
        committed = _last_commit_date(p)
        if committed is None:
            findings.append(("WARN",
                             f"could not read git history for data/{fn} — freshness "
                             f"unchecked (is this a shallow clone without history?)"))
            continue
        age = (today - committed).days
        if age > max_age:
            findings.append(("WARN",
                             f"data/{fn} last changed {age} days ago (expected <= "
                             f"{max_age}) — a refresh job may have died silently"))


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


def check_set_order(findings):
    """The current set must have an order number.

    sets.json / sets_metadata.json are generated by update_sets.py from two
    independent scrapes of limitlesstcg.com, and only one of them has to
    fail for a new set to vanish. That is what happened to PBL: the
    release-date scrape found it (format_window.json says current_set=PBL,
    released 2026-07-17) while the order scrape fell back to the hardcoded
    dict, so sets.json came out byte-identical to FALLBACK_SET_ORDER with
    no PBL entry. Order 0 means prepare_card_data bins every card of the
    set into the legacy chunk — invisible to the Deck Builder — and the
    frontend sorts it last.

    Nothing failed loudly, so this is a pure invariant check: whatever
    format_window.json calls the current set must exist in sets.json with
    an order at or above the standard-rotation boundary.
    """
    fw_path = os.path.join(DATA, "format_window.json")
    sets_path = os.path.join(DATA, "sets.json")
    if not (os.path.exists(fw_path) and os.path.exists(sets_path)):
        findings.append(("WARN", "format_window.json or sets.json missing — "
                                 "cannot verify the current set has an order"))
        return
    try:
        with open(fw_path, encoding="utf-8") as f:
            fw = json.load(f)
        with open(sets_path, encoding="utf-8") as f:
            order = json.load(f)
    except Exception as e:  # noqa: BLE001
        findings.append(("WARN", f"could not read set order files: {e}"))
        return

    # Not "is it the highest order": EN and JP share one order axis but rotate
    # independently, so the JP current set is legitimately below the newest EN
    # set. What must hold is that it is inside the standard window — below that
    # boundary prepare_card_data bins it out of the standard chunk.
    # Mirrors STANDARD_MIN_ORDER in backend/core/prepare_card_data.py.
    standard_min = 136
    for field, region in (("current_set", "EN"), ("current_set_jp", "JP")):
        code = (fw.get(field) or "").strip().upper()
        if not code:
            continue
        if code in INTENTIONALLY_UNORDERED_SETS:
            continue
        if code not in order:
            findings.append(("CRITICAL",
                             f"{region} current set {code} has NO entry in sets.json — "
                             f"its cards land in the legacy chunk and the Deck Builder "
                             f"cannot see them; update_sets.py's order scrape fell back"))
        elif order[code] < standard_min:
            findings.append(("CRITICAL",
                             f"{region} current set {code} has order {order[code]}, below the "
                             f"standard boundary {standard_min} — its cards are binned out of "
                             f"the standard chunk the Deck Builder reads"))


def ace_guard_prints():
    """{card name: ["SET NUM", ...]} — prints in all_cards_database.csv whose
    name is on the canonical ACE SPEC list (data/ace_specs.json) AND whose
    rarity passes the frontend's collision guard (rarity not exactly
    common/uncommon/rare — meta-binder.js isAceSpecRow).

    Why this exists: the binder's ACE detection is a NAME lookup guarded by
    rarity, verified to have 0 false positives today (old Master Ball prints
    are Uncommon, old Computer Search prints are Rare — both excluded). That
    guarantee silently breaks the day a set prints a non-ACE Ultra Rare
    with an ACE name. Baseline-diff per project rule: report the change,
    don't judge it."""
    ace_path = os.path.join(DATA, "ace_specs.json")
    if not os.path.exists(ace_path):
        return None
    try:
        with open(ace_path, encoding="utf-8") as f:
            names = {str(n).strip().lower() for n in json.load(f).get("ace_specs", []) if str(n).strip()}
    except Exception:  # noqa: BLE001
        return None
    if not names:
        return None
    guard = {"common", "uncommon", "rare"}
    out = {}
    for r in read_csv(os.path.join(DATA, "all_cards_database.csv")):
        name = (col(r, "name_en") or col(r, "name")).lower()
        if name not in names:
            continue
        if col(r, "rarity").lower() in guard:
            continue
        out.setdefault(name, []).append(f"{col(r, 'set')} {col(r, 'number')}".strip())
    return {k: sorted(v) for k, v in sorted(out.items())}


def check_ace_guard(findings, cur, base):
    if cur is None or base is None:
        return
    for name in sorted(set(cur) | set(base)):
        added = sorted(set(cur.get(name, [])) - set(base.get(name, [])))
        removed = sorted(set(base.get(name, [])) - set(cur.get(name, [])))
        if added:
            findings.append(("WARN",
                             f"ACE-name '{name}' has new guard-passing print(s) {added} — "
                             f"verify they really are ACE SPECs (a non-ACE Ultra Rare "
                             f"reprint would now wrongly bypass the binder threshold)"))
        if removed:
            findings.append(("WARN",
                             f"ACE-name '{name}' lost guard-passing print(s) {removed} — "
                             f"card DB or ace_specs.json changed"))


def price_integrity():
    """Signals that would have caught the 2026-06-04 price swap regression
    (OBF 223 <-> 228: two idProducts exchanged INSIDE a set — row counts and
    set coverage never moved, so no existing check could see it).

    Returns {nonempty_eur_price, match_methods: {method_family: n},
             duplicate_idproducts}. All diffed against the baseline — a
    changed number is REPORTED, never repaired."""
    out = {'nonempty_eur_price': 0, 'match_methods': {}, 'duplicate_idproducts': 0}
    price_path = os.path.join(DATA, "price_data.csv")
    if os.path.exists(price_path):
        out['nonempty_eur_price'] = sum(
            1 for r in read_csv(price_path) if col(r, 'eur_price'))
    map_path = os.path.join(DATA, "cardmarket_id_mapping.csv")
    if os.path.exists(map_path):
        methods = collections.Counter()
        ids = collections.Counter()
        for r in read_csv(map_path):
            m = col(r, 'match_method')
            # Family only: 'priced-by-date(4<->5)' fluctuates per run.
            methods[m.split('(')[0]] += 1
            pid = col(r, 'cardmarket_product_id')
            if pid:
                ids[pid] += 1
        out['match_methods'] = dict(methods)
        out['duplicate_idproducts'] = sum(1 for n in ids.values() if n > 1)
    return out


def check_price_integrity(findings, cur, base):
    if not base:
        return
    prev_prices = base.get('nonempty_eur_price', 0)
    if prev_prices and cur['nonempty_eur_price'] < prev_prices * 0.98:
        findings.append(("CRITICAL",
                         f"filled eur_price values dropped {prev_prices} -> "
                         f"{cur['nonempty_eur_price']} — a merge/mapping change is "
                         f"silently blanking prices"))
    base_methods = base.get('match_methods', {})
    for fam in set(cur['match_methods']) | set(base_methods):
        a, b = base_methods.get(fam, 0), cur['match_methods'].get(fam, 0)
        if a and abs(b - a) > max(50, a * 0.05):
            findings.append(("WARN",
                             f"mapping method '{fam}' count moved {a} -> {b} — "
                             f"verify the mapper change is intentional"))
    prev_dupes = base.get('duplicate_idproducts')
    if prev_dupes is not None and cur['duplicate_idproducts'] > prev_dupes:
        findings.append(("WARN",
                         f"idProduct assigned to multiple prints: "
                         f"{prev_dupes} -> {cur['duplicate_idproducts']} rows — "
                         f"two of our cards now claim the same product"))


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
    ace = ace_guard_prints()
    price = price_integrity()

    findings = []
    check_schema(findings)
    check_freshness(findings)
    check_set_order(findings)
    check_shrink(findings, rows, base_rows)
    if first_run:
        print("First run — recording baseline; change-based checks start next run.")
    else:
        check_coverage(findings, cov, base_cov)
        check_ace_guard(findings, ace, baseline.get("ace_guard_prints"))
        check_price_integrity(findings, price, baseline.get("price_integrity"))

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
                "ace_guard_prints": ace,
                "price_integrity": price,
            }, f, ensure_ascii=False, indent=1, sort_keys=True)
        print(f"  Baseline updated -> {BASELINE}")

    return 1 if (args.strict and crit) else 0


if __name__ == "__main__":
    sys.exit(main())
