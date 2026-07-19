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
import json
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


def http_get(url, retries=5):
    """GET with backoff on 403/429 — CloudFront rate-limits bursts of datacenter
    traffic, so a throttled request must be retried after a pause rather than
    treated as a hard failure."""
    backoff = [8, 20, 45, 90, 150]
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (403, 429) and attempt < retries - 1:
                wait = backoff[min(attempt, len(backoff) - 1)]
                log(f"    {e.code} on {url.rsplit('/', 1)[-1]} — backing off {wait}s "
                    f"(attempt {attempt + 1}/{retries})")
                time.sleep(wait)
                continue
            raise
        except urllib.error.URLError as e:
            last = e
            if attempt < retries - 1:
                time.sleep(backoff[min(attempt, len(backoff) - 1)])
                continue
            raise
    if last:
        raise last
    raise RuntimeError("unreachable")


def gallery_pdf_urls(locale):
    """Return {series_int: pdf_url} scraped from the locale's main gallery page.

    The single main gallery page already lists every currently-served series'
    card-list PDF, so we fetch just that one page per locale — hammering the
    per-series filter pages only re-triggers the CDN's rate limit for no gain.
    """
    urls = {}
    page = f"{PLAY}/{locale}/rewards/gallery/"
    try:
        html = http_get(page).decode("utf-8", "replace")
    except Exception as e:  # noqa: BLE001
        log(f"::warning::gallery fetch failed {page}: {e}")
        return urls
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


def _norm_name(s):
    """Normalise a card name for the Cardmarket join: drop the '[Ability | Attack]'
    suffix Cardmarket appends, unify apostrophes, collapse whitespace."""
    s = (s or "").lower().split("[")[0]
    s = s.replace("’", "'").replace("‘", "'").replace("`", "'")
    return re.sub(r"\s+", " ", s).strip()


def load_pps_cardmarket_products():
    """{(series_int, norm_name): idProduct} from cardmarket_card_images.csv."""
    path = os.path.join(DATA, "cardmarket_card_images.csv")
    out = {}
    if not os.path.exists(path):
        return out
    with open(path, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            code = (r.get("expansion_code") or "").strip()
            m = re.match(r"PPS(\d+)$", code)
            if not m:
                continue
            key = (int(m.group(1)), _norm_name(r.get("name_en")))
            out.setdefault(key, (r.get("idProduct") or "").strip())  # first wins
    return out


def load_price_guide():
    """{idProduct(str): {avg,low,trend}} from Cardmarket's daily price guide."""
    path = os.path.join(DATA, "price_guide_6.json")
    out = {}
    if not os.path.exists(path):
        return out
    with open(path, encoding="utf-8") as f:
        doc = json.load(f)
    for g in doc.get("priceGuides", []):
        out[str(g.get("idProduct"))] = {
            "avg": g.get("avg"), "low": g.get("low"), "trend": g.get("trend"),
        }
    return out


def _pick_price(guide):
    """Prefer the average (matches the site's 'Ø' display), fall back to trend/low."""
    for k in ("avg", "trend", "low"):
        v = guide.get(k)
        if isinstance(v, (int, float)) and v > 0:
            return round(float(v), 2)
    return None


# Cardmarket URL slugs for the Play! Prize Pack expansions are the series number
# spelled out ("Play! Pokémon Prize Pack Series Eight" -> ...-Series-Eight).
_SERIES_WORD = {
    1: "One", 2: "Two", 3: "Three", 4: "Four", 5: "Five", 6: "Six", 7: "Seven",
    8: "Eight", 9: "Nine", 10: "Ten", 11: "Eleven", 12: "Twelve", 13: "Thirteen",
    14: "Fourteen", 15: "Fifteen", 16: "Sixteen", 17: "Seventeen", 18: "Eighteen",
    19: "Nineteen", 20: "Twenty",
}


def _cm_slug(s):
    """Cardmarket product/expansion slug: strip accents (é→e), drop apostrophes,
    turn every other non-alphanumeric run into a single hyphen. Verified against a
    real product URL (Team-Rockets-Mewtwo-ex)."""
    import unicodedata  # noqa: PLC0415
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode("ascii")
    s = s.replace("'", "")
    s = re.sub(r"[^A-Za-z0-9]+", "-", s)
    return re.sub(r"-+", "-", s).strip("-")


def product_url(series, name_en, orig_set, orig_num):
    """Exact Cardmarket product page for a stamped Prize Pack print, e.g.
    .../Singles/Play-Pokemon-Prize-Pack-Series-Eight/Team-Rockets-Mewtwo-ex-PPS8DRI-081
    Slug = <name>-PPS<series><origSet>-<origNumber padded to 3>."""
    try:
        n = str(orig_num or "")
        num3 = n.zfill(3) if n.isdigit() else n
        exp = "Play-Pokemon-Prize-Pack-Series-" + _SERIES_WORD.get(int(series), str(series))
        prod = f"{_cm_slug(name_en)}-PPS{series}{str(orig_set or '').upper()}-{num3}"
        return f"https://www.cardmarket.com/en/Pokemon/Products/Singles/{exp}/{prod}"
    except Exception:  # noqa: BLE001
        from urllib.parse import quote_plus  # noqa: PLC0415
        return ("https://www.cardmarket.com/en/Pokemon/Products/Search?searchString="
                + quote_plus((name_en or "").split("[")[0].strip()))


def write_json_index(rows, path):
    """Emit { "SET-NUMBER": {series, num, de, en, names, idProduct, price, market_url} }.

    Joins each Prize Pack card to its Cardmarket product (by series + name) and the
    current price guide, so the site can show a market price + a buy link and treat
    the stamped print like any other card.
    """
    products = load_pps_cardmarket_products()
    prices = load_price_guide()
    matched = priced = 0

    index = {}
    for r in rows:
        key = f"{r['set_code'].upper()}-{r['set_number']}"
        entry = {  # later series overwrite -> newest stamped print wins
            "series": r["series"],
            "num": r["gallery_number"],
            "de": r["image_url_de"],
            "en": r["image_url_en"],
            "name_de": r["name_de"],
            "name_en": r["name_en"],
        }
        idp = products.get((int(r["series"]), _norm_name(r["name_en"])))
        if idp:
            matched += 1
            entry["idProduct"] = idp
            price = _pick_price(prices.get(idp, {}))
            if price is not None:
                priced += 1
                entry["price"] = price
            entry["market_url"] = product_url(
                r["series"], r["name_en"], r["set_code"], r["set_number"])
        index[key] = entry

    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    os.replace(tmp, path)
    log(f"Wrote {path} — {len(index)} keyed prints "
        f"({matched} matched to Cardmarket, {priced} with a price)")


def _rows_from_csv(path):
    with open(path, encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-verify", action="store_true")
    ap.add_argument("--refresh-prices", action="store_true",
                    help="rebuild the JSON (prices) from the existing CSV only — no "
                         "gallery/CDN fetch. For the daily price job.")
    ap.add_argument("--out", default=os.path.join(DATA, "prizepack_official_images.csv"))
    ap.add_argument("--json-out", default=os.path.join(DATA, "prizepack_official_images.json"))
    args = ap.parse_args()

    # Cheap daily path: refresh prices in the JSON from the committed CSV + the
    # (daily-updated) price guide. No CloudFront, so it never hits the rate limit.
    if args.refresh_prices:
        if not os.path.exists(args.out):
            log(f"::error::{args.out} missing — run the full build first")
            return 1
        rows = _rows_from_csv(args.out)
        if not rows:
            log("::error::CSV empty — nothing to refresh")
            return 1
        write_json_index(rows, args.json_out)
        return 0

    log("Discovering per-series PDF card lists…")
    de_pdfs = gallery_pdf_urls("de-de")
    en_pdfs = gallery_pdf_urls("en-us")
    gallery_series = sorted(de_pdfs)
    log(f"Series in the gallery: {gallery_series}")

    existing = _rows_from_csv(args.out) if os.path.exists(args.out) else []
    have_series = {int(r["series"]) for r in existing if str(r.get("series", "")).isdigit()}

    if not gallery_series and not existing:
        log("::error::no PDF card lists discovered and no existing data")
        return 1

    # A series' card list never changes once published, and we already have it
    # committed — so only fetch the PDFs for series we don't have yet. This stops
    # the weekly job from re-hitting the CloudFront rate limit (403) for data that
    # can't have changed, which was making it fail every week.
    new_series = [s for s in gallery_series if s not in have_series]
    log(f"Have series: {sorted(have_series)} | new to fetch: {new_series}")

    rows = list(existing)
    fetched_new = 0
    for s in new_series:
        try:
            new_rows = build_series(s, de_pdfs[s], en_pdfs.get(s))
            for r in new_rows:  # match the string typing of CSV-loaded rows
                r["series"] = str(r["series"])
                r["gallery_number"] = str(r["gallery_number"])
            rows.extend(new_rows)
            fetched_new += 1
        except Exception as e:  # noqa: BLE001
            log(f"::warning::SE{s} (new) fetch failed — will retry a future run: "
                f"{type(e).__name__}: {e}")

    # We only ever fail when there's genuinely nothing to write; a throttled
    # fetch of an already-known series is a no-op, not an error.
    if not rows:
        log("::error::no rows and no existing data to fall back to")
        return 1

    rows.sort(key=lambda r: (int(r["series"]), int(r["gallery_number"])))

    # sanity: SE9 #19 should be a Mega Dragonite/Dragoran
    for r in rows:
        if str(r["series"]) == "9" and str(r["gallery_number"]) == "19":
            log(f"sanity SE9 #19 -> {r['name_de']} / {r['name_en']} ({r['set_code']} {r['set_number']})")

    verified = "verification: skipped (no new series fetched)"
    if not args.no_verify and fetched_new:
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

    # Frontend index: keyed by "SET-NUMBER" (matching the site's card index) so
    # the SPA can offer the official Play!-stamped Prize Pack image as an
    # international print. Later series win on the rare set+number collision.
    write_json_index(rows, args.json_out)
    from collections import Counter
    per = Counter(int(r["series"]) for r in rows)
    log("Per-series counts: " + ", ".join(f"SE{s}={n}" for s, n in sorted(per.items())))
    log(f"Wrote {args.out} — {len(rows)} rows ({fetched_new} new series fetched). {verified}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
