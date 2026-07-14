#!/usr/bin/env python3
"""Build data/prizepack_official_images.csv — official Play! Pokémon Prize Pack
Series card images (play.pokemon.com rewards gallery, hosted on CloudFront).

Why: pokemontcg.io lacks the Play!-stamped Prize Pack (PPS) variants. The Pokémon
Company's own rewards gallery serves them, publicly and WITHOUT hotlink
protection, at a constructible CloudFront URL. Each series' official PDF card
list gives — IN GALLERY ORDER — every card's German name and its ORIGINAL
international print (set code + collector number). The PDF line index equals the
gallery image number (verified: SE9 line 19 = Mega-Dragoran-ex = image _19).

So from the PDFs we can emit, per PPS card:
  series, gallery_number, set_code, set_number, name_de, name_en, image_url_de/en

The set_code+set_number is the join key to our own card database (that's how the
site identifies a print), so these official images can be offered as the PPS
"international print" of a card.

Source discovery (READ-ONLY, official public assets):
  https://play.pokemon.com/{de-de,en-us}/rewards/gallery/   (Next.js page)
    -> links per-series PDF card lists on CloudFront (P-number prefix varies, so
       we scrape the hrefs rather than guess)
  https://d1wx537rtdixyy.cloudfront.net/expansions/series{N}/{loc}/OP_Prize_SE{N}_{LANG}_{num}-2x.png

Politeness: CloudFront rate-limits bulk scraping from datacenter IPs, so requests
are spaced out. A single gentle pass (a couple of pages + a few PDFs) is fine.
"""
import argparse
import csv
import io
import os
import re
import sys
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(os.path.dirname(HERE), "data")

PLAY = "https://play.pokemon.com"
CF = "https://d1wx537rtdixyy.cloudfront.net"
UA = {"User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                     "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")}
DELAY = 1.0  # spacing between CloudFront/gallery requests (stay under the WAF)

# "<name> <SETCODE> <NUM> <■ markers>"  — set code 2-4 uppercase letters, num digits.
LINE_RE = re.compile(r"^(?P<name>.+?)\s+(?P<set>[A-Z]{2,4})\s+(?P<num>\d{1,3})(?:\s*■)*\s*$")


def log(m):
    print(m, flush=True)


def http_get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read()


def gallery_pdf_urls(locale):
    """Return {series_int: pdf_url} scraped from the locale's gallery page(s)."""
    urls = {}
    pages = [f"{PLAY}/{locale}/rewards/gallery/"]
    # also hit per-series filters so archived series are covered if still linked
    pages += [f"{PLAY}/{locale}/rewards/gallery/?filter=series{s}" for s in range(1, 13)]
    seen_pages = set()
    for page in pages:
        if page in seen_pages:
            continue
        seen_pages.add(page)
        try:
            html = http_get(page).decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001
            log(f"::warning::gallery fetch failed {page}: {e}")
            time.sleep(DELAY)
            continue
        for href in re.findall(r"https://[^\s\"']+?\.pdf", html):
            m = re.search(r"/series(\d+)/", href)
            if m and "Card_List" in href:
                urls.setdefault(int(m.group(1)), href)
        time.sleep(DELAY)
    return urls


def parse_pdf_cards(pdf_bytes):
    """Return ordered list of (gallery_number, name, set_code, set_number)."""
    import pypdf  # noqa: PLC0415
    reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    text = "\n".join((p.extract_text() or "") for p in reader.pages)
    cards = []
    n = 0
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        m = LINE_RE.match(line)
        if not m:
            continue  # header/legend/footer line — skip, don't advance the counter
        n += 1
        cards.append((n, m.group("name").strip(), m.group("set"), m.group("num").lstrip("0") or "0"))
    return cards


def image_url(series, lang_loc, lang_code, gallery_number):
    return f"{CF}/expansions/series{series}/{lang_loc}/OP_Prize_SE{series}_{lang_code}_{gallery_number}-2x.png"


def build_series(series, pdf_de_url, pdf_en_url):
    """Fetch + parse DE and EN PDFs, join by (set,num), emit rows."""
    log(f"  SE{series}: DE {pdf_de_url}")
    de = parse_pdf_cards(http_get(pdf_de_url)); time.sleep(DELAY)
    en_by_key = {}
    if pdf_en_url:
        log(f"  SE{series}: EN {pdf_en_url}")
        en = parse_pdf_cards(http_get(pdf_en_url)); time.sleep(DELAY)
        for gn, name, sc, num in en:
            en_by_key[(sc, num)] = (gn, name)
    rows = []
    for gn, name_de, sc, num in de:
        en_gn, name_en = en_by_key.get((sc, num), (None, ""))
        # gallery number should agree across locales; warn if not
        if en_gn is not None and en_gn != gn:
            log(f"::warning::SE{series} {sc} {num}: gallery # DE={gn} EN={en_gn}")
        rows.append({
            "series": series,
            "gallery_number": gn,
            "set_code": sc,
            "set_number": num,
            "name_de": name_de,
            "name_en": name_en,
            "image_url_de": image_url(series, "de-de", "DE", gn),
            "image_url_en": image_url(series, "en-us", "EN", en_gn or gn),
        })
    log(f"  SE{series}: {len(rows)} cards")
    return rows


VERIFY_MAGIC = b"\x89PNG\r\n\x1a\n"


def verify_images(rows, per_series=2):
    """GET the first bytes of a couple images per series to confirm they load."""
    by_series = {}
    for r in rows:
        by_series.setdefault(r["series"], []).append(r)
    checked = ok = 0
    for series, group in sorted(by_series.items()):
        for r in group[:per_series]:
            checked += 1
            try:
                req = urllib.request.Request(r["image_url_de"], headers=dict(UA, **{"Range": "bytes=0-7"}))
                with urllib.request.urlopen(req, timeout=30) as resp:
                    if resp.status in (200, 206) and resp.read(8).startswith(VERIFY_MAGIC):
                        ok += 1
                    else:
                        log(f"::warning::image not PNG: {r['image_url_de']} ({resp.status})")
            except Exception as e:  # noqa: BLE001
                log(f"::warning::image fetch failed: {r['image_url_de']} — {e}")
            time.sleep(DELAY)
    return checked, ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-verify", action="store_true")
    ap.add_argument("--out", default=os.path.join(DATA, "prizepack_official_images.csv"))
    args = ap.parse_args()

    log("Discovering per-series PDF card lists…")
    de_pdfs = gallery_pdf_urls("de-de")
    en_pdfs = gallery_pdf_urls("en-us")
    series_list = sorted(de_pdfs)
    log(f"Series with a DE card-list PDF: {series_list}")
    if not series_list:
        log("::error::no PDF card lists discovered — gallery layout may have changed")
        return 1

    rows = []
    for s in series_list:
        try:
            rows.extend(build_series(s, de_pdfs[s], en_pdfs.get(s)))
        except Exception as e:  # noqa: BLE001
            log(f"::warning::SE{s} failed: {type(e).__name__}: {e}")

    rows.sort(key=lambda r: (r["series"], r["gallery_number"]))

    # sanity: SE9 #19 should be a Mega Dragonite/Dragoran
    for r in rows:
        if r["series"] == 9 and r["gallery_number"] == 19:
            log(f"sanity SE9 #19 -> {r['name_de']} / {r['name_en']} ({r['set_code']} {r['set_number']})")

    verified = "verification: skipped"
    if not args.no_verify and rows:
        checked, ok = verify_images(rows)
        verified = f"verification: {ok}/{checked} sample images are PNG"
        log(verified)

    fields = ["series", "gallery_number", "set_code", "set_number",
              "name_de", "name_en", "image_url_de", "image_url_en"]
    tmp = args.out + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)
    os.replace(tmp, args.out)
    from collections import Counter
    per = Counter(r["series"] for r in rows)
    log("Per-series counts: " + ", ".join(f"SE{s}={n}" for s, n in sorted(per.items())))
    log(f"Wrote {args.out} — {len(rows)} rows. {verified}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
