#!/usr/bin/env python3
"""PROBE (temporary): does championsbattledata's summary.primary.abilities
return the MEGA's fixed ability for mega forms? Check a few (incl. new M-B
megas not in the otterlyclueless roster). Short output, run from CI."""
import json, urllib.request
UA={"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"}
def get(u): return urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=40).read()
for slug in ("mega-charizard-y","mega-dragonite","mega-pyroar","mega-malamar","mega-sceptile","pelipper"):
    try:
        j=json.loads(get(f"https://championsbattledata.com/api/pokemon/{slug}"))
        prim=(j.get("summary") or {}).get("primary") or {}
        print(f"{slug}: name={prim.get('pokemon_name')} abilities={prim.get('abilities')!r} hidden={prim.get('hidden_ability')!r}")
    except Exception as e:
        print(f"{slug}: ERR {e}")
print("done")
