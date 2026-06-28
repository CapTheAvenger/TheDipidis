#!/usr/bin/env python3
"""PROBE: does championsbattledata expose ABILITY DESCRIPTIONS (esp. for the
Champions-original abilities like 'Fire Mane')? Check the app.js bundle for
how abilities are rendered + try ability asset/endpoint paths."""
import re, json, urllib.request, urllib.error
BASE="https://championsbattledata.com"
UA={"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"}
def get(u):
    return urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=40).read()
def trygot(label,u):
    try:
        b=get(u); print(f"{label}: {u} -> {len(b)}b ct~", b[:1].hex()); return b
    except urllib.error.HTTPError as e: print(f"{label}: HTTP {e.code}")
    except Exception as e: print(f"{label}: ERR {e}")
    return None
# 1) app.js — how are abilities/descriptions wired?
js=get(f"{BASE}/app.js").decode("utf-8","replace")
print("app.js bytes:", len(js))
for kw in ("abilit","Fire Mane","ability_description","abilityText","/abilities","ROOT}/"):
    hits=[m.start() for m in re.finditer(re.escape(kw), js, re.I)][:3]
    for i in hits:
        print(f"  ~{kw!r}:", js[max(0,i-50):i+70].replace("\n"," "))
# 2) asset/endpoint guesses
for label,u in [
    ("abilities.json", f"{BASE}/pokemon_champions_assets/abilities.json"),
    ("abilities.csv",  f"{BASE}/pokemon_champions_assets/abilities.csv"),
    ("ability FireMane",f"{BASE}/pokemon_champions_assets/abilities/Fire Mane.csv"),
    ("metadata FireMane",f"{BASE}/pokemon_champions_assets/abilities/Fire%20Mane.json"),
    ("api ability",     f"{BASE}/api/ability/fire-mane"),
]:
    b=trygot(label,u)
    if b and (b[:1]==b'{' or b[:1]==b'[' or b'Fire' in b[:500] or b',' in b[:200]):
        print("   sample:", b[:300])
print("done")
