#!/usr/bin/env python3
"""PROBE (final): HEAD-verify the LG image URLs the site will build for the
5 resolved Dunkelnacht/M5 cards (Poltchageist 5, Sinistcha 6, Shuppet 31,
Banette 32, Dhelmise 37)."""
import urllib.request, urllib.error
UA={"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"}
def head(u):
    try:
        r=urllib.request.urlopen(urllib.request.Request(u,headers=UA,method="HEAD"),timeout=30)
        return f"{r.status} {r.headers.get('Content-Type')}"
    except urllib.error.HTTPError as e:
        return f"HTTP {e.code}"
    except Exception as e:
        return f"ERR {e}"
base="https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_{}_R_JP_LG.png"
for n,who in [(5,"Poltchageist/Mortcha"),(6,"Sinistcha/Fatalitcha"),(31,"Shuppet"),(32,"Banette"),(37,"Dhelmise/Moruda")]:
    u=base.format(n)
    print(f"  M5 {n:>2} {who:22} -> {head(u)}")
