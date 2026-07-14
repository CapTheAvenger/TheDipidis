#!/usr/bin/env python3
"""PROBE (temporary): confirm series/locale existence + rough size on the
play.pokemon.com image CDN — TIGHT and GENTLE (few requests, well spaced).

Already established: bare GET -> full ~1 MB PNG, no hotlink protection, de-de
works, filename encodes the card number. A full enumeration keeps tripping AWS
rate-limiting (403), so instead of scanning every number we SAMPLE a handful of
numbers per series/locale to confirm the pattern holds broadly. The friend's bot
can iterate 1..N (stop at first 404, back off on 403) at run time.

Pattern:
  https://d1wx537rtdixyy.cloudfront.net/expansions/series{N}/{locale}/OP_Prize_SE{N}_{LANG}_{num}-2x.png
"""
import sys
import time
import urllib.error
import urllib.request

CF = "https://d1wx537rtdixyy.cloudfront.net"
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
TIMEOUT = 15
DELAY = 0.6           # generous spacing to stay under the rate limit
SAMPLES = [1, 5, 10, 20, 30]   # probe these card numbers per series/locale


def out(msg):
    print(msg, flush=True)


def url_for(s, loc, lang, n):
    return f"{CF}/expansions/series{s}/{loc}/OP_Prize_SE{s}_{lang}_{n}-2x.png"


def check(url):
    try:
        req = urllib.request.Request(url, headers={"Range": "bytes=0-7"})
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return r.status, r.read(8).startswith(PNG_MAGIC)
    except urllib.error.HTTPError as e:
        return e.code, False
    except Exception:  # noqa: BLE001
        return None, False


def main():
    out("== play.pokemon.com CDN sample probe (gentle) ==")
    out(f"   sampling card numbers {SAMPLES} per series/locale\n")
    for s in [7, 8, 9, 1, 2, 3, 4, 5, 6]:
        for loc, lang in (("de-de", "DE"), ("en-us", "EN")):
            marks = []
            for n in SAMPLES:
                st, ispng = check(url_for(s, loc, lang, n))
                if st in (200, 206) and ispng:
                    marks.append(f"{n}:OK")
                elif st == 403:
                    marks.append(f"{n}:403")
                    time.sleep(1.5)
                else:
                    marks.append(f"{n}:{st}")
                time.sleep(DELAY)
            out(f"SE{s:<2} {loc}: " + "  ".join(marks))
    out("\nLegend: OK=PNG present, 404=no such number, 403=rate-limited(retry)")
    out(f"Sample URL: {url_for(9, 'de-de', 'DE', 1)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
