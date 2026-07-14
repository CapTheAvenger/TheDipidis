#!/usr/bin/env python3
"""PROBE (temporary): verify the play.pokemon.com rewards-gallery image CDN.

Lead: https://d1wx537rtdixyy.cloudfront.net/expansions/series9/de-de/OP_Prize_SE9_DE_1-2x.png
Pattern guess:
  https://d1wx537rtdixyy.cloudfront.net/expansions/series{N}/{locale}/OP_Prize_SE{N}_{LANG}_{num}-2x.png
  locale=de-de|en-us, LANG=DE|EN, num=collector number.

Goal: confirm (a) images load WITHOUT a Referer (i.e. NOT hotlink-protected, so
they can be embedded directly), (b) which series/locales/numbers exist, (c) they
are real PNGs. Run in CI (open network); prints a coverage table. No output files.

Output is flushed per line so partial results survive a job timeout. Priority
series (7-9, per the user) are probed first.
"""
import sys
import urllib.error
import urllib.request

CF = "https://d1wx537rtdixyy.cloudfront.net"
# Deliberately NO Referer header — a 200 here proves the CDN is not hotlink-locked.
UA = {"User-Agent": ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                     "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")}
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
TIMEOUT = 8


def out(msg):
    print(msg, flush=True)


def check(url):
    """Return (status, content_type, is_png). status None on network error."""
    try:
        req = urllib.request.Request(url, headers=dict(UA, **{"Range": "bytes=0-7"}))
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            body = r.read(8)
            return r.status, r.headers.get("Content-Type", ""), body.startswith(PNG_MAGIC)
    except urllib.error.HTTPError as e:
        return e.code, "", False
    except Exception as e:  # noqa: BLE001
        return None, str(e)[:40], False


def probe_series(s, loc, lang, max_n=60, stop_after_misses=5):
    found, misses = [], 0
    sample_ct = None
    first_status = None
    for n in range(1, max_n + 1):
        url = f"{CF}/expansions/series{s}/{loc}/OP_Prize_SE{s}_{lang}_{n}-2x.png"
        st, ct, ispng = check(url)
        if n == 1:
            first_status = (st, ct)
        if st in (200, 206) and ispng:
            found.append(n); misses = 0
            if sample_ct is None:
                sample_ct = ct
        else:
            misses += 1
            if misses >= stop_after_misses and (found or n > 8):
                break
    return found, sample_ct, first_status


def main():
    out("== play.pokemon.com CDN probe (no Referer sent) ==")
    total = 0
    series_order = [7, 8, 9, 1, 2, 3, 4, 5, 6]
    for s in series_order:
        for loc, lang in (("de-de", "DE"), ("en-us", "EN")):
            found, ct, first = probe_series(s, loc, lang)
            total += len(found)
            if found:
                lo, hi = found[0], found[-1]
                contiguous = (found == list(range(lo, hi + 1)))
                one = f"{CF}/expansions/series{s}/{loc}/OP_Prize_SE{s}_{lang}_{lo}-2x.png"
                out(f"SE{s:<2} {loc}: {len(found):>3} imgs (num {lo}-{hi}, "
                    f"contiguous={contiguous}, ct={ct!r})  e.g. {one}")
            else:
                out(f"SE{s:<2} {loc}: none (first req -> {first})")
    out(f"TOTAL images that loaded (PNG, no Referer): {total}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
