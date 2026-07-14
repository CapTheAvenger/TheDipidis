#!/usr/bin/env python3
"""PROBE (temporary): map coverage of the play.pokemon.com image CDN — GENTLY.

Established already (diagnose pass): a bare GET with no headers returns the full
PNG (200, image/png, ~1 MB). The CDN is NOT hotlink-protected. Earlier blanket
403s were AWS rate-limiting our own aggressive scans, so this pass is deliberately
slow: sequential, throttled, and it distinguishes a real 404 (number doesn't
exist) from a 403 (rate-limit) so we never mistake throttling for "missing".

Pattern:
  https://d1wx537rtdixyy.cloudfront.net/expansions/series{N}/{locale}/OP_Prize_SE{N}_{LANG}_{num}-2x.png
  locale=de-de|en-us, LANG=DE|EN, num=collector number (1..).

Goal: for each series 1-9 x {de-de, en-us}, list which card numbers exist so the
friend's bot can iterate 1..N. Prints a table. No output files.
"""
import sys
import time
import urllib.error
import urllib.request

CF = "https://d1wx537rtdixyy.cloudfront.net"
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
TIMEOUT = 15
DELAY = 0.35        # polite gap between requests (stay under the WAF rate limit)
MAX_N = 45
STOP_AFTER_404 = 4  # consecutive genuine 404s -> end of series


def out(msg):
    print(msg, flush=True)


def url_for(s, loc, lang, n):
    return f"{CF}/expansions/series{s}/{loc}/OP_Prize_SE{s}_{lang}_{n}-2x.png"


def check(url):
    """Return status int (200/206/403/404/...) or None; and is_png bool."""
    try:
        req = urllib.request.Request(url, headers={"Range": "bytes=0-7"})
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            body = r.read(8)
            return r.status, body.startswith(PNG_MAGIC)
    except urllib.error.HTTPError as e:
        return e.code, False
    except Exception:  # noqa: BLE001
        return None, False


def scan(s, loc, lang):
    found, misses, rate_limited = [], 0, 0
    for n in range(1, MAX_N + 1):
        st, ispng = check(url_for(s, loc, lang, n))
        if st in (200, 206) and ispng:
            found.append(n)
            misses = 0
        elif st == 403:
            rate_limited += 1
            time.sleep(2.0)  # back off; do NOT count as a miss
        else:  # 404 or other -> treat as "not present"
            misses += 1
            if misses >= STOP_AFTER_404 and (found or n > 6):
                break
        time.sleep(DELAY)
    return found, rate_limited


def main():
    out("== play.pokemon.com CDN coverage (throttled, bare requests) ==")
    total = 0
    for s in [7, 8, 9, 1, 2, 3, 4, 5, 6]:
        for loc, lang in (("de-de", "DE"), ("en-us", "EN")):
            found, rl = scan(s, loc, lang)
            total += len(found)
            note = f" [rate-limited {rl}x]" if rl else ""
            if found:
                lo, hi = found[0], found[-1]
                contiguous = (found == list(range(lo, hi + 1)))
                one = url_for(s, loc, lang, lo)
                out(f"SE{s:<2} {loc}: {len(found):>3} imgs (num {lo}-{hi}, "
                    f"contiguous={contiguous}){note}  e.g. {one}")
            else:
                out(f"SE{s:<2} {loc}: none{note}")
    out(f"TOTAL images found: {total}")
    out(f"NOTE: scan capped at n={MAX_N}; a series reporting up to {MAX_N} may have more.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
