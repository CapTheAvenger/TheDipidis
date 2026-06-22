#!/usr/bin/env python3
"""Refresh data/champions_roster_extra.json — the Champions roster
additions that aren't yet in the otterlyclueless M-A dataset (e.g. the
Regulation M-B Pokémon + new Mega Evolutions). The Pokédex build reads
this file and resolves each name's stats/types from Smogon.

Base species come from pokebase.app's Champions dex (the live list of
which Pokémon are in the game). The new Mega Evolutions are a curated
list from official M-B coverage. Every entry is kept only if it resolves
in the committed Smogon data (data/pokemon_battle_data.json), so a bad
scrape can never inject an unbacked Pokémon.

Network: pokebase blocks generic bots locally; this runs in CI with a
browser User-Agent. Fail-soft — the caller keeps the committed JSON.
"""

import json
import os
import re
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SMOGON_PATH = os.path.join(ROOT, "data", "pokemon_battle_data.json")
OUT = os.path.join(ROOT, "data", "champions_roster_extra.json")
POKEBASE = "https://pokebase.app/pokemon-champions/pokemon"
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/124 Safari/537.36"}

# New Mega Evolutions introduced in Regulation M-B (Smogon keys). From
# official coverage (pokemon.com / Serebii / Game8). Megas are rarely
# discoverable from a dex list, so they stay curated; add to this list
# when a future regulation introduces more.
NEW_MEGAS = [
    "Sceptile-Mega", "Blaziken-Mega", "Swampert-Mega", "Mawile-Mega",
    "Metagross-Mega", "Staraptor-Mega", "Scolipede-Mega", "Scrafty-Mega",
    "Eelektross-Mega", "Pyroar-Mega", "Malamar-Mega", "Barbaracle-Mega",
    "Dragalge-Mega", "Falinks-Mega", "Raichu-Mega-X", "Raichu-Mega-Y",
]


def slug_to_smogon(slug):
    """pokebase slug → Smogon species name. 'ninetales-alola' →
    'Ninetales-Alola'; 'kommo-o' → 'Kommo-o' (the trailing 'o' stays
    lowercase as it's part of the name, not a form)."""
    parts = slug.split("-")
    out = [parts[0].capitalize()]
    for p in parts[1:]:
        out.append("o" if p == "o" else p.capitalize())
    return "-".join(out)


def main():
    smogon = json.load(open(SMOGON_PATH, encoding="utf-8"))
    try:
        req = urllib.request.Request(POKEBASE, headers=UA)
        html = urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "replace")
        slugs = sorted(set(re.findall(r"/pokemon-champions/pokemon/([a-z0-9-]+)", html)))
    except Exception as e:  # noqa: BLE001
        print(f"ERROR fetching pokebase: {e}", file=sys.stderr)
        return 1

    base = []
    for s in slugs:
        if s.startswith("page-"):        # JS chunk filename, not a Pokémon
            continue
        nm = slug_to_smogon(s)
        if nm in smogon and "baseStats" in smogon[nm]:
            base.append(nm)
    if len(base) < 40:
        print(f"ERROR: only {len(base)} base species parsed — refusing to overwrite",
              file=sys.stderr)
        return 1

    megas = [m for m in NEW_MEGAS if m in smogon]
    # Stable, de-duplicated key list (base first, then megas).
    seen, keys = set(), []
    for k in base + megas:
        if k not in seen:
            seen.add(k)
            keys.append(k)

    out = {
        "_meta": {
            "description": "Champions roster additions not in the otterlyclueless "
                           "M-A dataset. Base species from pokebase.app Champions dex; "
                           "new Mega Evolutions from official M-B coverage. Stats/types "
                           "resolved from Smogon; German names from PokéAPI.",
            "sources": [POKEBASE, "official M-B Mega coverage", "Smogon (pokemon-showdown)"],
            "base_count": len(base),
            "mega_count": len(megas),
        },
        "smogonKeys": keys,
    }
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"Wrote {OUT} — {len(base)} base + {len(megas)} mega = {len(keys)} keys")
    return 0


if __name__ == "__main__":
    sys.exit(main())
