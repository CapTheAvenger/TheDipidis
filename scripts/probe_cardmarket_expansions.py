#!/usr/bin/env python3
"""Read-only probe: can we get Cardmarket's idExpansion -> expansion_code?

Two questions, both unanswerable from the dev sandbox (no route to
cardmarket.com — a bare curl there returns 000 even for the URL the weekly job
downloads successfully, so any "not found" measured locally is meaningless).

  Q1  Does the public productCatalog bucket publish an EXPANSION list next to
      the product lists the weekly job already downloads? If it does, the
      sister project's idExpansion -> code gap closes exactly and completely,
      and every derived code in cm_expansions.csv becomes checkable against a
      real source instead of inferred from our own TCG set codes.

  Q2  For the codes we DO derive (code_source=tcg, from the dominant TCG set
      code of an expansion's singles), does the S3 image URL actually resolve?
      data/_consumers.md currently calls these "high-confidence candidates …
      still worth confirming against the image URL". This turns that into a
      measurement: per expansion, one real idProduct, one GET, JPEG magic
      bytes checked.

Nothing is written and nothing is repaired — the output is a report. Run it
from CI (workflow_dispatch) and read the job log.

Cardmarket's image S3 is hotlink-protected: it needs a browser User-Agent AND
a cardmarket.com Referer, only answers GET (not HEAD), and returns a bogus
Content-Type, so the only trustworthy signal is the JPEG magic number.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import random
import sys
import time
import urllib.error
import urllib.request

BUCKET = "https://downloads.s3.cardmarket.com/"

# Paths to try for an expansion list. The three known-good product/price files
# are included as CONTROLS: if those fail too, the run measured the network,
# not Cardmarket, and every other line in the report is meaningless.
CANDIDATES = [
    ("CONTROL products_singles",    "productCatalog/productList/products_singles_6.json"),
    ("CONTROL products_nonsingles", "productCatalog/productList/products_nonsingles_6.json"),
    ("CONTROL price_guide",         "productCatalog/priceGuide/price_guide_6.json"),
    ("expansionList/expansions_6",  "productCatalog/expansionList/expansions_6.json"),
    ("expansionList/expansion_6",   "productCatalog/expansionList/expansion_6.json"),
    ("expansionList/expansions",    "productCatalog/expansionList/expansions.json"),
    ("expansions/expansions_6",     "productCatalog/expansions/expansions_6.json"),
    ("productList/expansions_6",    "productCatalog/productList/expansions_6.json"),
    ("productList/expansion_6",     "productCatalog/productList/expansion_6.json"),
    ("expansionList/6",             "productCatalog/expansionList/6.json"),
    ("metacardList",                "productCatalog/metacardList/metacards_6.json"),
    ("categoryList",                "productCatalog/categoryList/categories_6.json"),
]

BROWSER_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
IMG_URL = "https://product-images.s3.cardmarket.com/51/{code}/{idp}/{idp}.jpg"


def _get(url, headers=None, timeout=25):
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, b""
    except Exception as e:  # noqa: BLE001
        return f"ERR {type(e).__name__}", b""


def probe_bucket():
    print("=" * 72)
    print("Q1  Is there an expansion list in the public productCatalog bucket?")
    print("=" * 72)
    found = []
    controls_ok = 0
    for label, path in CANDIDATES:
        url = BUCKET + path
        # Range request: we only need to know it exists and see its shape.
        status, body = _get(url, {"Range": "bytes=0-2000", "User-Agent": BROWSER_UA})
        ok = status in (200, 206)
        if label.startswith("CONTROL"):
            controls_ok += bool(ok)
        print(f"  {str(status):>6}  {label:<28} {path}")
        if ok and not label.startswith("CONTROL"):
            found.append((label, url, body))
        time.sleep(0.4)

    print(f"\n  controls reachable: {controls_ok}/3")
    if controls_ok == 0:
        print("  ::error::All three known-good files failed — this run measured the")
        print("  network, not Cardmarket. Every result above is meaningless.")
        return None
    if not found:
        print("\n  No expansion list found at any probed path. The code must keep")
        print("  coming from our own derivation (see Q2).")
        return None

    for label, url, body in found:
        print(f"\n  --- {label} — first bytes ---")
        print("  " + body[:600].decode("utf-8", "replace").replace("\n", "\n  "))
    return found


def probe_images(limit, seed):
    print()
    print("=" * 72)
    print("Q2  Do our derived expansion codes actually resolve on the image S3?")
    print("=" * 72)

    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data = os.path.join(here, "data")
    with open(os.path.join(data, "cm_expansions.csv"), encoding="utf-8-sig", newline="") as f:
        exps = [r for r in csv.DictReader(f) if r["expansion_code"].strip()]
    with open(os.path.join(data, "products_singles_6.json"), encoding="utf-8") as f:
        singles = json.load(f)["products"]

    # One real idProduct per expansion — the URL needs a product that exists.
    first_product = {}
    for p in singles:
        first_product.setdefault(p["idExpansion"], p["idProduct"])

    rows = [r for r in exps if int(r["id_expansion"]) in first_product]
    random.Random(seed).shuffle(rows)
    # Always include the pps rows: they are the ones already verified, so they
    # double as a positive control for the request headers themselves.
    pps = [r for r in rows if r["code_source"] == "pps"][:4]
    rest = [r for r in rows if r["code_source"] != "pps"][:max(0, limit - len(pps))]
    sample = pps + rest

    headers = {"User-Agent": BROWSER_UA, "Referer": "https://www.cardmarket.com/",
               "Accept": "image/avif,image/webp,image/*,*/*;q=0.8"}
    ok = bad = 0
    failures = []
    print(f"  sampling {len(sample)} expansions ({len(pps)} pps controls)\n")
    for r in sample:
        ie = int(r["id_expansion"])
        code = r["expansion_code"].strip()
        idp = first_product[ie]
        status, body = _get(IMG_URL.format(code=code, idp=idp), headers)
        # Trust the magic bytes, not the Content-Type (Cardmarket sends
        # multerS3.AUTO_CONTENT_TYPE, which is not the real type).
        is_jpeg = body[:2] == b"\xff\xd8"
        verdict = "OK " if is_jpeg else "MISS"
        if is_jpeg:
            ok += 1
        else:
            bad += 1
            failures.append((code, ie, r["code_source"], r["name"][:34], status))
        print(f"  {verdict} {str(status):>6} {code:<10} id_exp={ie:<6} "
              f"src={r['code_source']:<4} {r['name'][:34]}")
        # Pace: this bucket throttles bulk access from datacenter IPs.
        time.sleep(0.6)

    print(f"\n  resolved: {ok}/{len(sample)}   failed: {bad}")
    if failures:
        print("\n  Codes that did NOT resolve — these are the ones to fix or blank:")
        for code, ie, src, name, status in failures:
            print(f"    {code:<10} id_exp={ie:<6} src={src:<4} status={status}  {name}")
    return ok, bad


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--images", type=int, default=40,
                    help="how many expansions to image-check (default 40; paced 0.6s apart)")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--skip-images", action="store_true")
    args = ap.parse_args(argv[1:])

    probe_bucket()
    if not args.skip_images:
        probe_images(args.images, args.seed)
    print("\nDone. Nothing was written — this probe is read-only.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
