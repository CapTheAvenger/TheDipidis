#!/usr/bin/env python3
"""Scrape the list of items actually available in Pokémon Champions from
Serebii's Champions items page and write data/champions_available_items.json.

Why: the otterlyclueless dataset (used for the Look-up / Nachschlagen tab)
carries the full held-item list (~583), but Champions only makes a subset
of those usable. Serebii's Champions items page is the reliable, current
list of what's actually in the game; we intersect against it so the web
"Champions only" filter can hide items that aren't available yet.

Network: Serebii blocks generic bots locally; this runs in CI (open
egress) with a browser User-Agent. Fail-soft — on any error the caller
keeps the committed JSON.

Output: { "_meta": {...}, "items": ["Big Root", "Choice Scarf", ...] }
(English item names exactly as Serebii lists them, minus the "ItemDex"
nav link). Item-name matching in the build is normalisation-tolerant.
"""

import json
import os
import re
import sys
import urllib.request

URL = "https://www.serebii.net/pokemonchampions/items.shtml"
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/124 Safari/537.36"}

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "data", "champions_available_items.json")


def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=40) as r:
        if r.status != 200:
            raise RuntimeError(f"HTTP {r.status}")
        return r.read().decode("utf-8", "replace")


def parse_items(html):
    # Serebii links each item to /itemdex/<name>.shtml — the anchor text is
    # the display name. The first such link is the "ItemDex" breadcrumb.
    rx = re.compile(r'href="/itemdex/[^"]*"[^>]*>([^<]+)</a>', re.I)
    out, seen = [], set()
    for m in rx.findall(html):
        name = re.sub(r"\s+", " ", m).strip()
        if not name or name.lower() == "itemdex":
            continue
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(name)
    return out


def main():
    try:
        html = fetch(URL)
        items = parse_items(html)
    except Exception as e:  # noqa: BLE001 — fail-soft for CI
        print(f"ERROR scraping Champions items: {e}", file=sys.stderr)
        return 1
    if len(items) < 50:
        print(f"ERROR: only {len(items)} items parsed — refusing to overwrite",
              file=sys.stderr)
        return 1
    out = {
        "_meta": {
            "source": URL,
            "description": "Items available in Pokémon Champions (English names, "
                           "exactly as listed by Serebii's Champions items page).",
            "count": len(items),
        },
        "items": items,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"Wrote {OUT} — {len(items)} Champions items")
    return 0


if __name__ == "__main__":
    sys.exit(main())
