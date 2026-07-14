#!/usr/bin/env python3
"""PROBE (temporary): verify the play.pokemon.com rewards-gallery image CDN.

Lead: https://d1wx537rtdixyy.cloudfront.net/expansions/series9/de-de/OP_Prize_SE9_DE_1-2x.png
Pattern guess:
  https://d1wx537rtdixyy.cloudfront.net/expansions/series{N}/{locale}/OP_Prize_SE{N}_{LANG}_{num}-2x.png
  locale=de-de|en-us, LANG=DE|EN, num=collector number.

We must answer three things and finish fast (threaded, bounded work):
  1. HOTLINK: does the lead image load with NO Referer? (embeddable if yes)
     Also compare a bare request (no UA at all) vs a cross-origin Referer.
  2. REAL PNG: are the bytes a PNG (magic), not an error page?
  3. COVERAGE: for every series 1-9 x {de-de, en-us}, how many card numbers
     exist — found via a threaded scan of 1..MAX with an "all remaining are
     404" early stop, so populated series don't cost 60 sequential round-trips.

Prints a flushed table. No output files. Run in CI (open network).
"""
import concurrent.futures as cf
import sys
import urllib.error
import urllib.request

CF = "https://d1wx537rtdixyy.cloudfront.net"
UA = {"User-Agent": ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                     "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")}
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
TIMEOUT = 8
MAX_N = 40          # scan 1..MAX_N per series/locale
WORKERS = 12


def out(msg):
    print(msg, flush=True)


def url_for(s, loc, lang, n):
    return f"{CF}/expansions/series{s}/{loc}/OP_Prize_SE{s}_{lang}_{n}-2x.png"


def check(url, headers=None):
    """Return (status, content_type, is_png). status None on network error."""
    hdrs = dict(headers if headers is not None else UA, **{"Range": "bytes=0-7"})
    try:
        req = urllib.request.Request(url, headers=hdrs)
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            body = r.read(8)
            return r.status, r.headers.get("Content-Type", ""), body.startswith(PNG_MAGIC)
    except urllib.error.HTTPError as e:
        return e.code, "", False
    except Exception as e:  # noqa: BLE001
        return None, str(e)[:50], False


def hotlink_report():
    lead = url_for(9, "de-de", "DE", 1)
    out("== hotlink / reachability test on lead URL ==")
    out(f"  URL: {lead}")
    variants = {
        "no headers at all": {},
        "browser UA, NO referer": dict(UA),
        "browser UA + cross-origin referer (example.com)":
            dict(UA, **{"Referer": "https://example.com/"}),
        "browser UA + cardmarket referer":
            dict(UA, **{"Referer": "https://www.cardmarket.com/"}),
    }
    for label, hdrs in variants.items():
        st, ct, ispng = check(lead, headers=hdrs)
        out(f"  [{label}] -> status={st} png={ispng} ct={ct!r}")
    out("")


def scan_series(s, loc, lang):
    """Threaded scan of 1..MAX_N; return sorted list of numbers that are PNGs."""
    found = []
    ct_seen = None
    with cf.ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futs = {ex.submit(check, url_for(s, loc, lang, n)): n
                for n in range(1, MAX_N + 1)}
        for fut in cf.as_completed(futs):
            n = futs[fut]
            st, ct, ispng = fut.result()
            if st in (200, 206) and ispng:
                found.append(n)
                if ct_seen is None:
                    ct_seen = ct
    return sorted(found), ct_seen


def main():
    hotlink_report()
    out("== coverage scan (browser UA, NO referer, 1..%d per series) ==" % MAX_N)
    total = 0
    for s in [7, 8, 9, 1, 2, 3, 4, 5, 6]:
        for loc, lang in (("de-de", "DE"), ("en-us", "EN")):
            found, ct = scan_series(s, loc, lang)
            total += len(found)
            if found:
                lo, hi = found[0], found[-1]
                contiguous = (found == list(range(lo, hi + 1)))
                out(f"SE{s:<2} {loc}: {len(found):>3} imgs "
                    f"(num {lo}-{hi}, contiguous={contiguous}, ct={ct!r})")
            else:
                out(f"SE{s:<2} {loc}: none")
    out(f"TOTAL PNGs that loaded (no Referer): {total}")
    out(f"NOTE: scan capped at n={MAX_N}; a series reporting {MAX_N} may have more.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
