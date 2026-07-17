#!/usr/bin/env python3
"""Build data/cm_expansions.csv — Cardmarket idExpansion → expansion_code + name.

Requested by the sister project (tcg-exclusive-radar #56). It has, per card,
idProduct + idCategory + the NUMERIC idExpansion, but the Cardmarket S3 image
path and its own set catalogue need the STRING expansion code + a set name — and
Cardmarket exposes neither to it (API dead, product-catalogue files 403 from its
IP, website bot-protected). We can reach the public catalogue, so we resolve:

  id_expansion, expansion_code, name, release_date, code_source, n_singles

Sources (READ-ONLY, all already in the repo / downloaded by the weekly job):
  data/products_singles_6.json     idProduct → idExpansion (where the cards are)
  data/products_nonsingles_6.json  idExpansion → sealed-product name + dateAdded
  data/cardmarket_id_mapping.csv   idProduct → TCG (set, number)

expansion_code resolution — IMPORTANT, this is what #56 got wrong:
  * We do NOT have a general Cardmarket "abbreviation" table. What we have is:
    - Play! Prize Pack expansions: the code is DERIVABLE from the spelled-out
      series in the booster name ("… Series Eight" → PPS8). Verified vs. the S3
      URLs (…/51/PPS8/… → HTTP 200), so code_source="pps".
    - Every other expansion: the dominant TCG/community set code of its singles
      (from cardmarket_id_mapping). For modern English sets Cardmarket's code
      equals that TCG code — verified against #56's own examples (PHF, BS) and
      DRI/MEG/PFL — so code_source="tcg". This covers the sets the project needs
      (everything from ~mid-2025 on). Treat these as high-confidence candidates:
      the mirror job should still confirm each against the S3 URL.
    - Older / Japanese / promo / "…: Additionals" expansions that aren't in the
      TCG mapping get NO code (blank) — we genuinely can't derive Cardmarket's
      abbreviation for those. They still get a name + date.
"""
import argparse
import collections
import csv
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(os.path.dirname(HERE), "data")

_WORDS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7,
    "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13,
    "fourteen": 14, "fifteen": 15, "sixteen": 16, "seventeen": 17, "eighteen": 18,
    "nineteen": 19, "twenty": 20,
}
# Trailing Cardmarket sealed-product-type words to strip to recover the set name.
_SEALED_SUFFIX = re.compile(
    r"\s+(Booster Box|Booster Bundle|Booster Pack|Booster|Build & Battle Box|"
    r"Build & Battle Stadium|Elite Trainer Box|Pokémon Center Elite Trainer Box|"
    r"Premium Collection|Collection Box|Sleeved Booster|Blister|Tin|Bundle)\b.*$",
    re.IGNORECASE)


def _load(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)


def _products(doc):
    return doc.get("products", doc) if isinstance(doc, dict) else doc


def clean_name(booster_name):
    n = _SEALED_SUFFIX.sub("", booster_name or "").strip()
    return n or (booster_name or "").strip()


def pps_code(name):
    m = re.search(r"prize pack series (\w+)", (name or "").lower())
    if m and m.group(1) in _WORDS:
        return "PPS%d" % _WORDS[m.group(1)]
    return ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(DATA, "cm_expansions.csv"))
    args = ap.parse_args()

    singles = _products(_load("products_singles_6.json"))
    nonsingles = _products(_load("products_nonsingles_6.json"))

    # idProduct → idExpansion, and singles count + earliest date per expansion
    exp_of_prod = {}
    n_singles = collections.Counter()
    date_by_exp = {}
    for p in singles:
        ie = p.get("idExpansion")
        if ie is None:
            continue
        exp_of_prod[str(p["idProduct"])] = ie
        n_singles[ie] += 1
        dt = p.get("dateAdded") or ""
        if dt and (ie not in date_by_exp or dt < date_by_exp[ie]):
            date_by_exp[ie] = dt

    # idExpansion → name (prefer a "Booster" product) + earliest date
    name_by_exp = {}
    for p in nonsingles:
        ie = p.get("idExpansion")
        if ie is None:
            continue
        nm = p.get("name") or ""
        cur = name_by_exp.get(ie, "")
        if not cur or ("Booster" in nm and "Booster" not in cur):
            name_by_exp[ie] = nm
        dt = p.get("dateAdded") or ""
        if dt and (ie not in date_by_exp or dt < date_by_exp[ie]):
            date_by_exp[ie] = dt

    # idExpansion → dominant TCG set code (from the id mapping)
    codes = collections.defaultdict(collections.Counter)
    path = os.path.join(DATA, "cardmarket_id_mapping.csv")
    if os.path.exists(path):
        with open(path, encoding="utf-8-sig") as f:
            for r in csv.DictReader(f):
                ie = exp_of_prod.get((r.get("cardmarket_product_id") or "").strip())
                s = (r.get("set") or "").strip()
                if ie and s:
                    codes[ie][s] += 1

    rows = []
    for ie in sorted(n_singles, key=lambda e: (-n_singles[e], e)):
        raw_name = name_by_exp.get(ie, "")
        code = pps_code(raw_name)
        src = "pps" if code else ""
        if not code and codes.get(ie):
            code = codes[ie].most_common(1)[0][0]
            src = "tcg"
        rows.append({
            "id_expansion": ie,
            "expansion_code": code,
            "name": clean_name(raw_name),
            "release_date": (date_by_exp.get(ie, "") or "")[:10],
            "code_source": src,
            "n_singles": n_singles[ie],
        })

    with_code = sum(1 for r in rows if r["expansion_code"])
    with_name = sum(1 for r in rows if r["name"])
    print(f"Expansions (with singles): {len(rows)} | with code: {with_code} "
          f"(pps={sum(1 for r in rows if r['code_source']=='pps')}, "
          f"tcg={sum(1 for r in rows if r['code_source']=='tcg')}) | with name: {with_name}")

    fields = ["id_expansion", "expansion_code", "name", "release_date",
              "code_source", "n_singles"]
    tmp = args.out + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)
    os.replace(tmp, args.out)
    print(f"Wrote {args.out} — {len(rows)} rows.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
