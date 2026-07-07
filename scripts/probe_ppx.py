#!/usr/bin/env python3
"""PROBE: understand pokemonproxies.com — is the example asset reachable, is
there an index/API/manifest listing cards (set+number -> asset URL), and how
are sets named (M5 == '5a'?)."""
import re, urllib.request, urllib.error, json
UA={"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36","Accept-Language":"en"}
def get(u, raw=False):
    try:
        r=urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=30)
        b=r.read()
        return (b if raw else b.decode("utf-8","replace")), r.status, dict(r.headers)
    except urllib.error.HTTPError as e:
        return f"HTTP {e.code}", e.code, {}
    except Exception as e:
        return f"ERR {e}", 0, {}

def head(u):
    try:
        r=urllib.request.urlopen(urllib.request.Request(u,headers=UA,method="HEAD"),timeout=25)
        return f"{r.status} {r.headers.get('Content-Type')} {r.headers.get('Content-Length')}"
    except urllib.error.HTTPError as e:
        return f"HTTP {e.code}"
    except Exception as e:
        return f"ERR {e}"

print("== example asset HEAD ==")
print(" ", head("https://www.pokemonproxies.com/assets/5a-037-Dhelmise-BMPrMgp-.png"))
print("== old /images scheme HEAD (M3/M5) ==")
for u in ["https://pokemonproxies.com/images/m5/37.png","https://www.pokemonproxies.com/images/m5/37.png"]:
    print(" ", head(u))

print("\n== homepage ==")
html,st,hdr=get("https://www.pokemonproxies.com/")
print("status", st, "len", len(html) if isinstance(html,str) else html)
if isinstance(html,str):
    scripts=re.findall(r'<script[^>]+src="([^"]+)"', html)
    print("scripts:")
    for s in scripts[:20]: print("   ", s)
    # inline references to api/json/assets
    for kw in ("/api", ".json", "assets/", "supabase", "firebase", "cards"):
        hits=sorted(set(re.findall(r'["\'](/?[^"\']*'+re.escape(kw)+r'[^"\']*)["\']', html)))[:8]
        if hits:
            print(f"refs {kw}:")
            for h in hits: print("   ", h)

print("\n== try likely data endpoints ==")
for u in ["https://www.pokemonproxies.com/api/cards","https://www.pokemonproxies.com/cards.json",
          "https://www.pokemonproxies.com/data/cards.json","https://www.pokemonproxies.com/sitemap.xml"]:
    body,st,hdr=get(u)
    print(f"  {st:>4} {hdr.get('Content-Type','')} {u}  {(''+body[:120]) if isinstance(body,str) else ''}")
