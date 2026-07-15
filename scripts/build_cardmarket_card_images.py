#!/usr/bin/env python3
"""Build data/cardmarket_card_images.csv — Cardmarket Pokémon single → image URL.

A sister project (tcg-exclusive-radar) shows card images via pokemontcg.io, which
is missing the stamped variants — notably the Play! Pokémon Prize Pack Series
(PPS*). Cardmarket hosts the correct (stamped) images at a constructible S3 URL:

  https://product-images.s3.cardmarket.com/{idCategory}/{expansionCode}/{idProduct}/{idProduct}.jpg
  e.g. .../51/PPS8/864401/864401.jpg   (Team Rocket's Mewtwo ex, PPS8)

This script maps every Pokémon single (idCategory 51) in a code-known expansion to
that URL and writes a slim CSV keyed on idProduct (the join key the sister project
uses), keeping expansion_code + number as a set+number fallback.

Inputs (READ-ONLY — Cardmarket's public daily exports, already committed):
  data/products_singles_6.json      idProduct, idCategory, idExpansion, name (EN)
  data/products_nonsingles_6.json   booster names → expansion name per idExpansion
  data/cardmarket_id_mapping.csv    (tcg set, number) → idProduct  [for number, where present]
  data/cardmarket_expansion_codes.json  OPTIONAL { "<idExpansion>": "<CODE>" } override

Expansion codes:
  • PPS1..PPSn are DERIVED from the nonsingles booster names ("… Prize Pack Series
    Eight Booster" → PPS8; idExpansion 6425 → PPS8, matching the confirmed S3 URL).
  • Any idExpansion→code pairs in cardmarket_expansion_codes.json are merged in.
    Non-PPS Cardmarket codes are only exposed in the S3 image paths, so they can be
    dropped into that file (hand- or CI-populated) to widen coverage without code
    changes here.

Verification (network only; skipped offline / when --no-verify):
  HEAD a sample of URLs across every code group and log any non-200 / non-image.

Output CSV columns:
  idProduct,id_category,expansion_code,id_expansion,number,name_en,name_de,image_url

Mirroring note (for the sister project): the S3 bucket is hotlink-protected — a
bare request returns HTTP 403. Fetch with a browser User-Agent AND a
`Referer: https://www.cardmarket.com/` header (GET, not HEAD). Cardmarket also
stores a bogus `Content-Type: multerS3.AUTO_CONTENT_TYPE` on these objects, so do
NOT trust the header — the bytes are a normal JPEG (magic FF D8 FF). That is
exactly how the verify step below confirms the URLs.
"""

import argparse
import csv
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(os.path.dirname(HERE), "data")

S3_BASE = "https://product-images.s3.cardmarket.com"
POKEMON_SINGLE_CATEGORY = 51   # idCategory used in the S3 path for singles

# Spelled-out series numbers used in the booster names.
_WORDS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7,
    "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13,
    "fourteen": 14, "fifteen": 15, "sixteen": 16, "seventeen": 17, "eighteen": 18,
    "nineteen": 19, "twenty": 20,
}


def _load_json(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)


def _products(doc):
    """Cardmarket export is {version, createdAt, products:[…]}; tolerate a bare list."""
    return doc.get("products", doc) if isinstance(doc, dict) else doc


def derive_expansion_codes(nonsingles):
    """idExpansion -> code, derived from booster/display names.

    Only the Play! Prize Pack Series is derivable by name ("Series Eight" → PPS8);
    other sets need their Cardmarket abbreviation from the override file.
    """
    codes = {}
    for p in _products(nonsingles):
        m = re.search(r"prize pack series (\w+)", (p.get("name") or "").lower())
        if m and m.group(1) in _WORDS:
            codes[int(p["idExpansion"])] = "PPS%d" % _WORDS[m.group(1)]
    return codes


def load_override_codes():
    path = os.path.join(DATA, "cardmarket_expansion_codes.json")
    if not os.path.exists(path):
        return {}
    try:
        with open(path, encoding="utf-8") as f:
            raw = json.load(f)
        # Keys may be str or int; values are the Cardmarket codes.
        return {int(k): str(v).strip() for k, v in raw.items() if str(v).strip()}
    except Exception as e:  # noqa: BLE001 — never let a bad override kill the build
        print(f"::warning::could not read cardmarket_expansion_codes.json: {e}")
        return {}


def load_numbers():
    """cardmarket_product_id -> collector number, from the existing id mapping."""
    path = os.path.join(DATA, "cardmarket_id_mapping.csv")
    out = {}
    if not os.path.exists(path):
        return out
    with open(path, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            pid = (row.get("cardmarket_product_id") or "").strip()
            num = (row.get("number") or "").strip()
            if pid and num:
                out[pid] = num
    return out


def image_url(id_category, code, id_product):
    return f"{S3_BASE}/{id_category}/{code}/{id_product}/{id_product}.jpg"


def _norm_name(s):
    """Normalise a card name for the Prize Pack join: drop the '[Ability | Attack]'
    suffix Cardmarket appends, unify apostrophes, collapse whitespace, lowercase."""
    s = (s or "").lower().split("[")[0]
    s = s.replace("’", "'").replace("‘", "'").replace("`", "'")
    return re.sub(r"\s+", " ", s).strip()


def load_stamped_urls():
    """(series_int, norm_name) -> German CloudFront stamped-image URL.

    Pulled from data/prizepack_official_images.csv, which resolves each Play!
    Pokémon Prize Pack card to its official (non-hotlink-protected) CloudFront
    image AND the in-gallery number the S3 path can't give us. Prefer the German
    (de-de/DE) URL; the sister project reads this column for the actual stamp.
    """
    path = os.path.join(DATA, "prizepack_official_images.csv")
    out = {}
    if not os.path.exists(path):
        print(f"::warning::{path} missing — stamped_image_url will be blank")
        return out
    with open(path, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            try:
                s = int(r["series"])
            except (KeyError, ValueError, TypeError):
                continue
            de = (r.get("image_url_de") or "").strip()
            if de:
                out.setdefault((s, _norm_name(r.get("name_en"))), de)
    return out


def build_rows(singles, codes, numbers, stamped=None):
    stamped = stamped or {}
    rows = []
    skipped_no_code = 0
    for p in _products(singles):
        id_exp = int(p.get("idExpansion") or 0)
        code = codes.get(id_exp)
        if not code:
            skipped_no_code += 1
            continue
        id_cat = int(p.get("idCategory") or POKEMON_SINGLE_CATEGORY)
        id_prod = str(p["idProduct"])
        name_en = p.get("name") or ""
        stamped_url = ""
        m = re.match(r"PPS(\d+)$", code)
        if m:
            stamped_url = stamped.get((int(m.group(1)), _norm_name(name_en)), "")
        rows.append({
            "idProduct": id_prod,
            "id_category": id_cat,
            "expansion_code": code,
            "id_expansion": id_exp,
            "number": numbers.get(id_prod, ""),
            "name_en": name_en,
            "name_de": "",   # Cardmarket's public export is English-only (see note)
            "image_url": image_url(id_cat, code, id_prod),
            # Official Play! Pokémon CloudFront stamped image (de-de) — directly
            # embeddable, unlike the hotlink-protected S3 image_url above.
            "stamped_image_url": stamped_url,
        })
    rows.sort(key=lambda r: (r["expansion_code"], int(r["idProduct"])))
    return rows, skipped_no_code


# The S3 bucket hotlink-protects the images: a bare request gets 403. A browser
# GET with a cardmarket.com Referer + a real UA is served normally — this is the
# request the sister project must use when mirroring. HEAD is rejected, so we GET
# only the first byte (Range) to confirm the object without downloading it.
VERIFY_HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"),
    "Referer": "https://www.cardmarket.com/",
    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
}


def verify_sample(rows, per_group=4, timeout=25):
    """GET (Range 0-0) a few URLs per expansion_code with browser headers.

    Returns (checked, ok, failures[]). Confirms the object exists and is an image
    without downloading it in full.
    """
    try:
        import urllib.request  # noqa: PLC0415
    except Exception:  # noqa: BLE001
        return 0, 0, []
    by_code = {}
    for r in rows:
        by_code.setdefault(r["expansion_code"], []).append(r)
    checked = ok = 0
    failures = []
    for code, group in sorted(by_code.items()):
        n = len(group)
        idxs = sorted(set([0, n // 3, (2 * n) // 3, n - 1]))[:per_group]
        for i in idxs:
            url = group[i]["image_url"]
            checked += 1
            try:
                headers = dict(VERIFY_HEADERS, **{"Range": "bytes=0-3"})
                req = urllib.request.Request(url, method="GET", headers=headers)
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    ct = resp.headers.get("Content-Type", "")
                    body = resp.read()
                    # Cardmarket stores a bogus Content-Type ("multerS3.AUTO_
                    # CONTENT_TYPE") on these objects, so trust the JPEG magic
                    # bytes, not the header. Accept a real image/* type too.
                    is_jpeg = body[:3] == b"\xff\xd8\xff"
                    if resp.status in (200, 206) and (is_jpeg or ct.startswith("image/")):
                        ok += 1
                    else:
                        failures.append((url, f"HTTP {resp.status} ct={ct} magic={body[:3].hex()}"))
            except Exception as e:  # noqa: BLE001
                failures.append((url, str(e)))
    return checked, ok, failures


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-verify", action="store_true", help="skip live URL checks")
    ap.add_argument("--out", default=os.path.join(DATA, "cardmarket_card_images.csv"))
    args = ap.parse_args()

    singles = _load_json("products_singles_6.json")
    nonsingles = _load_json("products_nonsingles_6.json")

    codes = derive_expansion_codes(nonsingles)
    codes.update(load_override_codes())        # overrides win / extend
    numbers = load_numbers()
    stamped = load_stamped_urls()

    rows, skipped = build_rows(singles, codes, numbers, stamped)

    # ── Coverage summary ─────────────────────────────────────────────────────
    from collections import Counter
    per_code = Counter(r["expansion_code"] for r in rows)
    pps = {c: n for c, n in per_code.items() if c.startswith("PPS")}
    print(f"Expansion codes known: {len(codes)} "
          f"(PPS: {sum(1 for c in codes.values() if str(c).startswith('PPS'))})")
    print(f"Rows: {len(rows)} across {len(per_code)} coded expansions "
          f"| singles skipped (no code): {skipped}")
    print("PPS coverage: " + ", ".join(f"{c}={n}" for c, n in sorted(pps.items())))
    with_num = sum(1 for r in rows if r["number"])
    print(f"Rows with collector number: {with_num}/{len(rows)}")
    with_stamp = sum(1 for r in rows if r.get("stamped_image_url"))
    print(f"Rows with stamped_image_url (CloudFront): {with_stamp}/{len(rows)}")

    verified_line = "verification: skipped (offline / --no-verify)"
    if not args.no_verify:
        checked, ok, failures = verify_sample(rows)
        if checked:
            verified_line = f"verification: {ok}/{checked} sampled URLs are 200 image/*"
            print(verified_line)
            for url, why in failures[:40]:
                print(f"::warning::image URL not OK: {url} — {why}")
        else:
            verified_line = "verification: no network (sample skipped)"
            print(verified_line)

    fields = ["idProduct", "id_category", "expansion_code", "id_expansion",
              "number", "name_en", "name_de", "image_url", "stamped_image_url"]
    tmp = args.out + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)
    os.replace(tmp, args.out)
    print(f"Wrote {args.out} — {len(rows)} rows. {verified_line}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
