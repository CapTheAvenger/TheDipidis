#!/usr/bin/env python3
"""PROBE (temporary): test whether the in-game Pokémon Champions usage
analysis (per-Pokémon nature / EV / item breakdown shown inside the game)
is reachable from CI via a public mirror, and whether any source matches
the in-game figures (Pelipper most-used nature = Modest/Mäßig ~53.9%).

This writes nothing to data/. It only prints findings to stdout so we can
read them from the Actions job log and decide on a real pipeline.

Run from CI (open egress + browser UA). Locally these hosts 403.
"""

import json
import re
import sys
import urllib.request
import urllib.error

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/124 Safari/537.36",
      "Accept": "text/html,application/json,*/*",
      "Accept-Language": "en-US,en;q=0.9,de;q=0.8"}

# Candidate pages. We try a Pelipper-specific page where one exists, plus
# a season usage index. We look for: reachability, embedded JSON
# (__NEXT_DATA__ / application/json), and any nature breakdown.
CANDIDATES = [
    ("pokechamdb pelipper",     "https://pokechamdb.com/en/pokemon/pelipper"),
    ("championsbattledata peli","https://championsbattledata.com/pokemon/pelipper"),
    # Try a few alternate path shapes for championsbattledata's JSON API.
    ("cbd api pelipper a",      "https://championsbattledata.com/api/pokemon/pelipper"),
    ("cbd api pelipper b",      "https://championsbattledata.com/_next/data/pelipper.json"),
    ("pokechamdb de pelipper",  "https://pokechamdb.com/de/pokemon/pelipper"),
]

NATURE_WORDS = ["modest", "mäßig", "massig", "timid", "scheu", "nature", "wesen"]


def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=45) as r:
        body = r.read()
        ct = r.headers.get("Content-Type", "")
        return r.status, ct, body


def analyze(label, url):
    print(f"\n=== {label} ===")
    print(f"URL: {url}")
    try:
        status, ct, body = fetch(url)
    except urllib.error.HTTPError as e:
        print(f"  HTTP {e.code} {e.reason}")
        return
    except Exception as e:  # noqa: BLE001
        print(f"  ERR {type(e).__name__}: {e}")
        return
    text = body.decode("utf-8", "replace")
    low = text.lower()
    print(f"  status={status} content-type={ct} bytes={len(body)}")

    # Embedded JSON islands (Next.js, JSON-LD, inline application/json).
    has_next = "__next_data__" in low
    has_appjson = 'application/json' in low
    print(f"  __NEXT_DATA__={has_next}  inline application/json={has_appjson}")

    # Nature-word hits — does the page even mention natures?
    hits = {w: low.count(w) for w in NATURE_WORDS if w in low}
    print(f"  nature-word hits: {hits or 'NONE'}")

    # If it's JSON, show top-level shape.
    if ct and "json" in ct.lower():
        try:
            j = json.loads(text)
            if isinstance(j, dict):
                print(f"  JSON keys: {list(j.keys())[:20]}")
            elif isinstance(j, list):
                print(f"  JSON list len={len(j)} first={json.dumps(j[0])[:300] if j else '[]'}")
        except Exception as e:  # noqa: BLE001
            print(f"  (claims json but parse failed: {e})")

    # Pull the largest __NEXT_DATA__ / application/json blob and probe it
    # for a nature breakdown + percentages near 'pelipper'.
    for m in re.finditer(r'<script[^>]*type="application/json"[^>]*>(.*?)</script>',
                         text, re.S | re.I):
        blob = m.group(1)
        bl = blob.lower()
        if any(w in bl for w in NATURE_WORDS):
            print(f"  >> JSON island with nature data ({len(blob)} bytes)")
            # surface a small window around the first nature word
            for w in ("modest", "mäßig", "timid", "scheu"):
                i = bl.find(w)
                if i >= 0:
                    print(f"     ...{blob[max(0,i-80):i+80]!r}")
                    break
            break

    # Dump every inline application/json blob (championsbattledata uses
    # these to ship the usage record) and surface nature-related content.
    blobs = re.findall(r'<script[^>]*type="application/json"[^>]*>(.*?)</script>',
                       text, re.S | re.I)
    for bi, blob in enumerate(blobs):
        bl = blob.lower()
        if any(w in bl for w in NATURE_WORDS) or "ev" in bl[:200]:
            print(f"  >> json-blob[{bi}] {len(blob)}b; sample:")
            i = max((bl.find(w) for w in NATURE_WORDS if w in bl), default=0)
            print(f"     {blob[max(0,i-120):i+400]}")

    # Strip tags and pull "<Nature> ... <pct>%" pairs from visible text —
    # works for pokechamdb's server-rendered nature table.
    plain = re.sub(r"<[^>]+>", " ", text)
    plain = re.sub(r"\s+", " ", plain)
    natures = ["Adamant","Modest","Timid","Jolly","Bold","Calm","Careful",
               "Impish","Relaxed","Sassy","Brave","Quiet","Gentle","Hasty",
               "Naive","Lonely","Mild","Rash","Naughty","Bashful","Hardy",
               "Mäßig","Scheu","Hart","Froh","Kühn","Sanft","Pfiffig"]
    found_pairs = []
    for nat in natures:
        for m in re.finditer(re.escape(nat), plain):
            seg = plain[m.start():m.start()+40]
            pm = re.search(r"(\d{1,3}(?:[.,]\d+)?)\s*%", seg)
            if pm:
                found_pairs.append((nat, pm.group(1)))
    # de-dup, keep order
    seen = set(); uniq = []
    for p in found_pairs:
        if p not in seen:
            seen.add(p); uniq.append(p)
    if uniq:
        print(f"  NATURE %: {uniq[:12]}")


def main():
    for label, url in CANDIDATES:
        analyze(label, url)
    print("\n=== done ===")


if __name__ == "__main__":
    main()
