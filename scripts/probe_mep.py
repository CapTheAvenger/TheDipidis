#!/usr/bin/env python3
"""PROBE: is MEP 68 (Makuhita) real on Limitless, how big is the MEP set, and
why does our scrape only hold MEP 1-33? Read the set index + the card page."""
import re, urllib.request
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", "Accept-Language": "en"}
def get(u):
    try:
        return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=40).read().decode("utf-8", "replace")
    except Exception as e:
        return f"__ERR__ {e}"

print("==== MEP set index: https://limitlesstcg.com/cards/MEP ====")
h = get("https://limitlesstcg.com/cards/MEP")
if h.startswith("__ERR__"):
    print(" ", h)
else:
    # card links /cards/MEP/<n>
    nums = sorted(set(int(m) for m in re.findall(r'/cards/MEP/(\d+)', h)))
    print("  card numbers found:", len(nums), "min", (min(nums) if nums else '-'), "max", (max(nums) if nums else '-'))
    print("  numbers:", nums)
    ti = re.search(r'<title>(.*?)</title>', h, re.S)
    print("  set title:", re.sub(r'\s+',' ',re.sub('<[^>]+>','',ti.group(1))).strip() if ti else '-')

print("\n==== MEP/68 card page ====")
c = get("https://limitlesstcg.com/cards/MEP/68")
if c.startswith("__ERR__"):
    print(" ", c)
else:
    ti = re.search(r'<title>(.*?)</title>', c, re.S)
    print("  title:", re.sub(r'\s+',' ',re.sub('<[^>]+>','',ti.group(1))).strip() if ti else '-')
    img = re.search(r'https://limitlesstcg[^"\' ]+MEP[^"\' ]+\.png', c)
    print("  image:", img.group(0) if img else '-')

print("\n==== MEG/72 (main Makuhita) — its listed prints ====")
m = get("https://limitlesstcg.com/cards/MEG/72")
if not m.startswith("__ERR__"):
    ti = re.search(r'<title>(.*?)</title>', m, re.S)
    print("  title:", re.sub(r'\s+',' ',re.sub('<[^>]+>','',ti.group(1))).strip() if ti else '-')
    prints = sorted(set(re.findall(r'/cards/([A-Z0-9]+)/(\d+)', m)))
    print("  print links on page:", prints[:12])
