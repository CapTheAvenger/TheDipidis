#!/usr/bin/env python3
"""PROBE: M5 card name<->number map. Dump raw structure + confirm the 6 cards."""
import re, urllib.request
UA={"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36","Accept-Language":"en"}
def fetch(u):
    try:
        return urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=45).read().decode("utf-8","replace")
    except Exception as e:
        return f"__ERR__ {e}"

page=fetch("https://limitlesstcg.com/cards/jp/M5")
print("==== raw window around M5/39 ====")
i=page.find('/cards/jp/M5/39"')
print(page[max(0,i-120):i+260] if i>=0 else "not found")

print("\n==== all (number, name) from set page ====")
# Try common Limitless pattern: data-tooltip / title / alt / span with name
pairs=[]
for m in re.finditer(r'/cards/jp/M5/(\d+)"', page):
    num=m.group(1)
    # window after the anchor
    w=page[m.end():m.end()+400]
    name=''
    for pat in (r'alt="([^"]+)"', r'title="([^"]+)"', r'>\s*([A-Za-z][A-Za-z0-9 .\'\-]{2,30})\s*<'):
        mm=re.search(pat,w)
        if mm: name=mm.group(1).strip(); break
    pairs.append((int(num),name))
seen=set()
for n,nm in sorted(pairs):
    if n in seen: continue
    seen.add(n)
    print(f"  #{n:>3} | {nm}")

print("\n==== confirm specific cards via card pages ====")
for n in (6,34,39):
    cp=fetch(f"https://limitlesstcg.com/cards/jp/M5/{n}")
    t=re.search(r'<title>(.*?)</title>', cp, re.S)
    h=re.search(r'<h1[^>]*>(.*?)</h1>', cp, re.S)
    tt=re.sub(r'\s+',' ',re.sub(r'<[^>]+>','',(t.group(1) if t else ''))).strip()
    hh=re.sub(r'\s+',' ',re.sub(r'<[^>]+>','',(h.group(1) if h else ''))).strip()
    print(f"  M5/{n}: title={tt!r} h1={hh!r}")
