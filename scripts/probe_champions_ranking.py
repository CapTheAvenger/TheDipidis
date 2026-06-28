#!/usr/bin/env python3
"""PROBE: is the MEGA's ability anywhere in championsbattledata's response
for a mega slug? Dump summary.forms + any ability-ish field. Short output."""
import json, urllib.request
UA={"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"}
def get(u): return urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=40).read()
for slug in ("mega-charizard-y","mega-pyroar","mega-blaziken"):
    j=json.loads(get(f"https://championsbattledata.com/api/pokemon/{slug}"))
    summ=j.get("summary") or {}
    print(f"\n=== {slug} ===")
    print("summary keys:", list(summ.keys()))
    forms=summ.get("forms")
    if isinstance(forms,list):
        for f in forms:
            print("  form:", {k:f.get(k) for k in ('form_name','saved_name','abilities','hidden_ability','form_kind') if k in f})
    # grep whole json for 'Drought'/'Speed Boost' (expected mega abilities)
    raw=json.dumps(j)
    for kw in ("Drought","Speed Boost","mega_ability","megaAbility"):
        if kw.lower() in raw.lower(): print("  contains:", kw)
print("\ndone")
