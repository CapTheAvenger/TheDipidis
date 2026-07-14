#!/usr/bin/env python3
"""PROBE (temporary): find a MANIFEST for the play.pokemon.com rewards gallery.

Brute-forcing the CDN gets rate-limited, so before enumerating we look for a
single index/manifest that lists every reward (numbers + names + image paths):
  1. fetch the de-de gallery HTML and surface any JSON / api / manifest / .json
     references and inline data blobs,
  2. try a handful of guessed manifest URLs on the CDN and on play.pokemon.com.

Few requests, gentle. Prints findings; writes nothing.
"""
import re
import sys
import urllib.error
import urllib.request

CF = "https://d1wx537rtdixyy.cloudfront.net"
PLAY = "https://play.pokemon.com"
UA = {"User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                     "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"),
      "Accept": "*/*", "Accept-Language": "de-DE,de;q=0.9,en;q=0.8"}


def out(m):
    print(m, flush=True)


def get(url, limit=200000):
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, r.headers.get("Content-Type", ""), r.read(limit)
    except urllib.error.HTTPError as e:
        body = b""
        try:
            body = e.read()[:2000]
        except Exception:  # noqa: BLE001
            pass
        return e.code, (e.headers.get("Content-Type", "") if e.headers else ""), body
    except Exception as e:  # noqa: BLE001
        return None, f"ERR {type(e).__name__}: {str(e)[:80]}", b""


def show_json_head(label, url):
    st, ct, body = get(url)
    looks_json = body[:1].strip() in (b"{", b"[")
    out(f"\n[{label}] {url}")
    out(f"   -> {st} ct={ct!r} bytes={len(body)} json-ish={looks_json}")
    if looks_json:
        out("   head: " + body[:400].decode("utf-8", "replace").replace("\n", " "))


def main():
    out("== search gallery HTML for a data endpoint ==")
    for page in (f"{PLAY}/de-de/rewards/gallery/?filter=series9",
                 f"{PLAY}/de-de/rewards/gallery/"):
        st, ct, body = get(page)
        text = body.decode("utf-8", "replace")
        out(f"\nGALLERY {page}\n   -> {st} ct={ct!r} bytes={len(body)}")
        # surface references that look like data sources
        hits = set()
        for pat in (r'[\"\'][^\"\']*\.json[^\"\']*[\"\']',
                    r'[\"\'][^\"\']*/api/[^\"\']*[\"\']',
                    r'[\"\'][^\"\']*manifest[^\"\']*[\"\']',
                    r'https?://[a-z0-9.\-]*cloudfront\.net[^\"\']*',
                    r'[\"\']/expansions[^\"\']*[\"\']'):
            for m in re.findall(pat, text, flags=re.I):
                hits.add(m[:160])
        if hits:
            out("   references found:")
            for h in sorted(hits)[:40]:
                out("     " + h)
        else:
            out("   (no obvious json/api/manifest references in first bytes)")
        # inline __NEXT_DATA__ / window.__ style blobs
        for m in re.findall(r'<script[^>]*id=[\"\']__NEXT_DATA__[\"\'][^>]*>(.{0,300})',
                            text, flags=re.I | re.S):
            out("   __NEXT_DATA__ head: " + m.replace("\n", " ")[:300])

    out("\n== try guessed manifest URLs ==")
    for u in (
        f"{CF}/expansions/series9/de-de/manifest.json",
        f"{CF}/expansions/series9/de-de/index.json",
        f"{CF}/expansions/series9/manifest.json",
        f"{CF}/expansions/series9.json",
        f"{CF}/expansions/manifest.json",
        f"{CF}/expansions/index.json",
        f"{CF}/manifest.json",
        f"{CF}/expansions.json",
        f"{PLAY}/api/rewards/gallery?filter=series9",
        f"{PLAY}/de-de/api/rewards/gallery",
    ):
        show_json_head("manifest?", u)
    return 0


if __name__ == "__main__":
    sys.exit(main())
