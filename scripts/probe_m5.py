#!/usr/bin/env python3
"""PROBE: M5 set on Limitless JP — confirm identity, list cards (number+name),
and capture the EXACT card image URL (code / zero-padding / suffix)."""
import re, urllib.request, urllib.error
UA={"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36","Accept-Language":"en"}
def fetch(u):
    try:
        return urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=45).read().decode("utf-8","replace")
    except Exception as e:
        return f"__ERR__ {e}"
def head(u):
    try:
        r=urllib.request.urlopen(urllib.request.Request(u,headers=UA,method="HEAD"),timeout=30)
        return f"{r.status} {r.headers.get('Content-Type')}"
    except urllib.error.HTTPError as e:
        return f"HTTP {e.code}"
    except Exception as e:
        return f"ERR {e}"

# 1) Index: show only Mega-era / M-prefixed sets so we can confirm the slug/name.
idx=fetch("https://limitlesstcg.com/cards/jp")
print("==== M-era sets in JP index ====")
if idx.startswith("__ERR__"): print(idx)
else:
    for m in re.finditer(r'href="(/cards/jp/([^"/?]+))"[^>]*>(.*?)</a>', idx, re.S):
        slug,txt=m.group(2),re.sub(r"<[^>]+>","",m.group(3)).strip()
        if re.match(r'^M\d', slug) or 'mega' in txt.lower():
            print(f"  {slug:8} | {txt}")

# 2) The M5 set page — parse each card row: number + name + image URL.
print("\n==== M5 set page ====")
page=fetch("https://limitlesstcg.com/cards/jp/M5")
if page.startswith("__ERR__"):
    print(page)
else:
    # find <a href="/cards/jp/M5/NN"> ... name ... and any img src
    for m in re.finditer(r'href="/cards/jp/M5/(\d+)"[^>]*>(.*?)</a>', page, re.S):
        num=m.group(1); inner=m.group(2)
        img=re.search(r'src="([^"]+)"', inner)
        name=re.sub(r"<[^>]+>"," ",inner)
        name=re.sub(r"\s+"," ",name).strip()[:40]
        print(f"  #{num:>3} | {name:40} | {img.group(1) if img else '-'}")
    # also dump any raw CDN image URLs seen on the page (reveals exact pattern)
    cdn=sorted(set(re.findall(r'https://limitlesstcg[^"\' ]+M5[^"\' ]+', page)))
    print("  --- sample CDN urls ---")
    for u in cdn[:5]: print("   ", u)

# 3) HEAD-test the URL the site would BUILD (unpadded) vs padded, for Moruda(39).
print("\n==== CDN URL format test (Moruda=39) ====")
for u in [
  "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_39_R_JP_LG.png",
  "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_039_R_JP_LG.png",
]:
    print(f"  {head(u):14} {u}")
