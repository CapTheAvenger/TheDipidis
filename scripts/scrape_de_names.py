#!/usr/bin/env python3
"""
Scrape authoritative German↔English NAME maps from the German wikis and
write data/de_name_overrides.json. Used by build_champions_resources.py
as the highest-confidence German-name source (above PokeAPI and the
hand-verified files), so names stay correct + current automatically.

Sources (both reachable from GitHub Actions — NOT from the locked-down
build sandbox, so this only runs in CI):
  • Moves: PokeWiki "Liste der Attackennamen in anderen Sprachen" via the
    MediaWiki API (wikitext table; cells may read "OLD (vor <gen>) NEW
    (ab <gen>)" → we take the current / "ab" name).
  • Items: pokemonexperte.de/items/ (HTML <li><a>DE</a> (EN)</li>; the
    page is windows-1252 encoded).

Fail-soft: if a source can't be fetched/parsed, that section is left
empty and the caller keeps the previously-committed overrides.
"""

import json
import os
import re
import urllib.request

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36"}
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "de_name_overrides.json")
POKEWIKI_API = ("https://www.pokewiki.de/api.php?action=parse&format=json&prop=wikitext"
                "&page=Liste_der_Attackennamen_in_anderen_Sprachen")
POKEMONEXPERTE = "https://pokemonexperte.de/items/"


def fetch(url, timeout=40):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()


def _clean(c):
    c = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", c)   # [[a|b]] -> b
    c = re.sub(r"\{\{[^}]*\}\}", "", c)
    c = re.sub(r"<[^>]+>", "", c)
    return c


def _current(cell):
    """Take the current name from an "OLD (vor) NEW (ab)" cell."""
    cell = _clean(cell)
    if "(ab" in cell:
        cur = cell.split("(ab")[0].split(")")[-1]
        return cur.strip(" .,\n\t")
    cell = re.sub(r"\(vor[^)]*\)?", "", cell)
    return cell.strip(" .,\n\t")


def scrape_moves():
    out = {}
    try:
        wt = json.loads(fetch(POKEWIKI_API).decode("utf-8", "replace"))["parse"]["wikitext"]["*"]
    except Exception as e:
        print("  moves: fetch/parse failed:", e)
        return out
    for row in wt.split("\n|-"):
        cells = re.split(r"\|\||\n\|", row)
        cells = [_current(c.lstrip("|")) for c in cells if c.strip() and not c.lstrip().startswith("!")]
        cells = [c for c in cells if c]
        if len(cells) >= 2:
            de, en = cells[0], cells[1]
            if de and en and len(en) < 40 and re.fullmatch(r"[A-Za-z0-9 .,'\-:!]+", en) and not de.startswith("{"):
                out[en] = de
    print(f"  moves: {len(out)} pairs")
    return out


def scrape_items():
    out = {}
    try:
        html = fetch(POKEMONEXPERTE).decode("cp1252", "replace")
    except Exception as e:
        print("  items: fetch failed:", e)
        return out
    for m in re.finditer(r"<li>\s*<a[^>]*>([^<]+)</a>\s*\(([^)]+)\)\s*</li>", html):
        de, en = m.group(1).strip(), m.group(2).strip()
        if de and en and len(en) < 40 and re.fullmatch(r"[A-Za-z0-9 .,'\-:!]+", en):
            out[en] = de
    print(f"  items: {len(out)} pairs")
    return out


def main():
    print("Scraping German name maps …")
    moves = scrape_moves()
    items = scrape_items()

    prev = {}
    if os.path.exists(OUT):
        try:
            prev = json.load(open(OUT, encoding="utf-8"))
        except Exception:
            prev = {}

    # Fail-soft: keep the previous section if a scrape returned nothing.
    if not moves:
        moves = prev.get("moves", {})
        print("  moves: kept previous (scrape empty)")
    if not items:
        items = prev.get("items", {})
        print("  items: kept previous (scrape empty)")

    out = {
        "_meta": {
            "description": "Authoritative DE↔EN name maps (move/item) for "
                           "build_champions_resources.py. Current in-game German names.",
            "sources": {"moves": "PokeWiki (Liste der Attackennamen in anderen Sprachen)",
                        "items": "pokemonexperte.de/items"},
            "counts": {"moves": len(moves), "items": len(items)},
        },
        "moves": dict(sorted(moves.items())),
        "items": dict(sorted(items.items())),
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=0)
    print(f"Wrote {OUT}  (moves={len(moves)}, items={len(items)})")


if __name__ == "__main__":
    main()
