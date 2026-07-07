#!/usr/bin/env python3
"""PROBE: extract pokemonproxies card-image index from the Vite JS bundle.
Vite bakes hashed asset filenames (e.g. 5a-037-Dhelmise-BMPrMgp-.png) into the
bundle, so parsing it gives every (setcode-number-name -> asset) mapping."""
import re, urllib.request
UA={"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"}
def get(u):
    return urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=45).read().decode("utf-8","replace")

home=get("https://www.pokemonproxies.com/")
m=re.search(r'src="(/assets/index-[^"]+\.js)"', home)
bundle="https://www.pokemonproxies.com"+m.group(1)
print("bundle:", bundle)
js=get(bundle)
print("bundle len:", len(js))

# asset filenames: <code>-<3digits>-<Name...>-<hash>-.png  (hash is alnum)
pat=re.compile(r"([0-9a-z]{1,4}-\d{3}-[A-Za-z0-9'.()\-]+?-[A-Za-z0-9]{5,10}-?\.png)")
found=sorted(set(pat.findall(js)))
print("total asset pngs found:", len(found))

# histogram of code prefixes
from collections import Counter
codes=Counter(f.split('-',1)[0] for f in found)
print("codes:", dict(sorted(codes.items(), key=lambda kv:-kv[1])))

print("\n== all 5a (M5) entries ==")
for f in found:
    if f.startswith('5a-'):
        print("  ", f)
