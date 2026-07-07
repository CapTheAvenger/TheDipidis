#!/usr/bin/env python3
"""PROBE: find the Japanese Mega set (Dunkelnacht / user-called "M5") on
Limitless, list its cards (number + name), and reveal the exact CDN image
URL pattern (code + zero-padding + suffix). No guessing — read the source."""
import re, urllib.request, urllib.error
UA={"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36","Accept-Language":"en"}
def fetch(u):
    try:
        return urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=45).read().decode("utf-8","replace")
    except Exception as e:
        return f"__ERR__ {e}"

# 1) Japanese set index — print set links so we can identify the right slug.
idx=fetch("https://limitlesstcg.com/cards/jp")
print("==== JP SET INDEX (links) ====")
if idx.startswith("__ERR__"):
    print(idx)
else:
    seen=set()
    for m in re.finditer(r'href="(/cards/jp/([^"/?]+))"[^>]*>(.*?)</a>', idx, re.S):
        href,slug,txt=m.group(1),m.group(2),re.sub(r"<[^>]+>","",m.group(3)).strip()
        if slug in seen: continue
        seen.add(slug)
        if txt:
            print(f"  {slug:12} | {txt}")
