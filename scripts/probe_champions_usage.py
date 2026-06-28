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
    ("pokemon-zone pelipper",   "https://www.pokemon-zone.com/champions/pokemon/pelipper/"),
    ("pokemon-zone singles",    "https://www.pokemon-zone.com/champions/ranked-seasons/singles/"),
    ("championsbattledata home","https://championsbattledata.com/"),
    ("championsbattledata peli","https://championsbattledata.com/pokemon/pelipper"),
    ("pokechamdb pelipper",     "https://pokechamdb.com/en/pokemon/pelipper"),
    ("pokechamdb home",         "https://pokechamdb.com/en"),
    ("pikalytics pelipper",     "https://www.pikalytics.com/pokedex/championspreview/pelipper"),
    ("op.gg pelipper",          "https://op.gg/pokemon-champions/pokemon/pelipper"),
    ("pokeos stats-calc",       "https://www.pokeos.com/tools/stats-calc?game=champions"),
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

    # Percentages near a nature word in raw HTML (e.g. "53.9%").
    for w in ("modest", "mäßig", "timid", "scheu"):
        i = low.find(w)
        if i >= 0:
            window = text[max(0, i - 60):i + 60]
            pcts = re.findall(r"\d{1,3}[.,]\d%", window)
            print(f"  near '{w}': {window.strip()!r} pct={pcts}")
            break


def main():
    for label, url in CANDIDATES:
        analyze(label, url)
    print("\n=== done ===")


if __name__ == "__main__":
    main()
