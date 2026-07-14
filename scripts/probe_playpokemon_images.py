#!/usr/bin/env python3
"""PROBE (temporary): diagnose the 403 on the play.pokemon.com image CDN.

First pass showed the lead URL returns 403 to GitHub runners for every header
combo we tried (no headers, browser UA, cross-origin referer, cardmarket
referer). This pass figures out WHY by:
  - trying the CDN's OWN origin as Referer/Origin (play.pokemon.com) — the most
    likely hotlink lock,
  - sending a full real-browser header set (Sec-Fetch-*, Accept-Language, etc.),
  - a plain GET with no Range (in case Range is what trips a WAF),
  - printing the 403 response BODY (first ~400 chars) + key headers, which for
    AWS WAF / CloudFront / S3 reveals the block reason (WAF, geo, signed-URL…).
Run in CI (open network). No output files.
"""
import sys
import urllib.error
import urllib.request

LEAD = "https://d1wx537rtdixyy.cloudfront.net/expansions/series9/de-de/OP_Prize_SE9_DE_1-2x.png"

BROWSER = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"),
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Sec-Fetch-Dest": "image",
    "Sec-Fetch-Mode": "no-cors",
    "Sec-Fetch-Site": "same-origin",
}


def attempt(label, headers, use_range=True, method="GET"):
    hdrs = dict(headers)
    if use_range:
        hdrs["Range"] = "bytes=0-63"
    print(f"\n--- {label} ---", flush=True)
    print(f"    headers: {sorted(hdrs.keys())}", flush=True)
    try:
        req = urllib.request.Request(LEAD, headers=hdrs, method=method)
        with urllib.request.urlopen(req, timeout=15) as r:
            body = r.read(64)
            ispng = body.startswith(b"\x89PNG\r\n\x1a\n")
            print(f"    -> {r.status} png={ispng} ct={r.headers.get('Content-Type','')!r} "
                  f"len={r.headers.get('Content-Length','?')}", flush=True)
            for h in ("Via", "X-Cache", "Server", "X-Amz-Cf-Pop"):
                if r.headers.get(h):
                    print(f"       {h}: {r.headers.get(h)}", flush=True)
    except urllib.error.HTTPError as e:
        body = b""
        try:
            body = e.read()[:400]
        except Exception:  # noqa: BLE001
            pass
        print(f"    -> HTTP {e.code} {e.reason}", flush=True)
        for h in ("Via", "X-Cache", "Server", "X-Amz-Cf-Pop", "X-Amzn-Waf-Action",
                  "Content-Type", "X-Amz-Cf-Id"):
            v = e.headers.get(h) if e.headers else None
            if v:
                print(f"       {h}: {v}", flush=True)
        snippet = body.decode("utf-8", "replace").replace("\n", " ")
        print(f"       body[:400]: {snippet}", flush=True)
    except Exception as e:  # noqa: BLE001
        print(f"    -> ERROR {type(e).__name__}: {str(e)[:120]}", flush=True)


def main():
    print(f"== diagnose 403 on: {LEAD} ==", flush=True)
    attempt("bare GET, no headers, no range", {}, use_range=False)
    attempt("browser headers, Range, same-origin only (no referer)", BROWSER)
    attempt("browser + Referer play.pokemon.com",
            dict(BROWSER, **{"Referer": "https://play.pokemon.com/"}))
    attempt("browser + Referer + Origin play.pokemon.com",
            dict(BROWSER, **{"Referer": "https://play.pokemon.com/",
                             "Origin": "https://play.pokemon.com"}))
    attempt("browser + Referer de-de gallery page",
            dict(BROWSER, **{"Referer": "https://play.pokemon.com/de-de/rewards/gallery/"}))
    attempt("browser + Sec-Fetch-Site cross-site + play referer",
            dict(BROWSER, **{"Sec-Fetch-Site": "cross-site",
                             "Referer": "https://play.pokemon.com/"}))
    attempt("HEAD with browser + play referer",
            dict(BROWSER, **{"Referer": "https://play.pokemon.com/"}),
            use_range=False, method="HEAD")
    return 0


if __name__ == "__main__":
    sys.exit(main())
