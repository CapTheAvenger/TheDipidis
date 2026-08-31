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

# Formen, die pokebase zwar fuehrt, deren Slug aber nicht auf einen
# Smogon-Schluessel abbildet.
#
# BEFUND (31.08.2026): pokebase listet die drei Paldea-Tauros als
# "tauros-paldea-aqua-breed" / "tauros-paldea-blaze-breed"; daraus macht
# slug_to_smogon "Tauros-Paldea-Aqua-Breed", was Smogon nicht kennt
# ("Tauros-Paldea-Aqua"). Sie fielen deshalb still aus der Liste — und
# die Gefechtvariante kam ueber den otterlyclueless-Roster herein und
# trug den Namen aller drei.
#
# Wichtiger als der Fall selbst ist die Stelle: diese Datei wird von
# champions-replica-scrape.yml taeglich NEU geschrieben. Wer die
# Schluessel nur in data/champions_roster_extra.json eintraegt, verliert
# sie beim naechsten Lauf — mit rotem Test und angehaltenem Deploy.
# Kuratierte Zugaenge gehoeren hierher, wie NEW_MEGAS.
EXTRA_FORMEN = [
    "Tauros-Paldea-Blaze",   # pokebase: tauros-paldea-blaze-breed, Kampf/Feuer
    "Tauros-Paldea-Aqua",    # pokebase: tauros-paldea-aqua-breed,  Kampf/Wasser
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
    formen = [f for f in EXTRA_FORMEN if f in smogon]
    fehlend = [f for f in EXTRA_FORMEN if f not in smogon]
    if fehlend:
        print(f"WARN: kuratierte Formen ohne Smogon-Eintrag: {fehlend}", file=sys.stderr)
    # Stable, de-duplicated key list (base first, then megas, then forms).
    seen, keys = set(), []
    for k in base + megas + formen:
        if k not in seen:
            seen.add(k)
            keys.append(k)

    out = {
        "_meta": {
            "description": "Champions roster additions not in the otterlyclueless "
                           "M-A dataset. Base species from pokebase.app Champions dex; "
                           "new Mega Evolutions from official M-B coverage. Stats/types "
                           "resolved from Smogon; German names from PokéAPI. "
                           "Kuratierte Einzelformen (EXTRA_FORMEN in "
                           "scripts/scrape_champions_roster.py), deren pokebase-Slug "
                           "nicht auf einen Smogon-Schluessel abbildet, kommen zuletzt.",
            "sources": [POKEBASE, "official M-B Mega coverage", "Smogon (pokemon-showdown)"],
            "base_count": len(base),
            "mega_count": len(megas),
            "form_count": len(formen),
        },
        "smogonKeys": keys,
    }
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"Wrote {OUT} — {len(base)} base + {len(megas)} mega "
          f"+ {len(formen)} Formen = {len(keys)} keys")
    return 0


if __name__ == "__main__":
    sys.exit(main())
