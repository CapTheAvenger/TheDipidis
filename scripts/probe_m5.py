#!/usr/bin/env python3
"""PROBE: full M5 (Abyss Eye) number->name map via each card page's og:title
(English). We need the M5 numbers for: Dhelmise(Moruda), Shuppet, Banette,
Poltchageist(Mortcha), Sinistcha(Fatalitcha), and the Gwynn trainer."""
import re, urllib.request, time
UA={"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36","Accept-Language":"en"}
def fetch(u):
    try:
        return urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=30).read().decode("utf-8","replace")
    except Exception as e:
        return f"__ERR__ {e}"

# One full page to locate the English name field.
print("==== M5/39 field scan ====")
p=fetch("https://limitlesstcg.com/cards/jp/M5/39")
for pat in [r'<meta property="og:title" content="([^"]+)"', r'<meta name="twitter:title" content="([^"]+)"',
            r'data-tooltip="([^"]+)"', r'<title>(.*?)</title>']:
    m=re.search(pat,p,re.S)
    print(f"  {pat[:30]:32} -> {m.group(1).strip() if m else None}")

print("\n==== M5 number -> name (all 81) ====")
for n in range(1,82):
    p=fetch(f"https://limitlesstcg.com/cards/jp/M5/{n}")
    if p.startswith('__ERR__'):
        print(f"  #{n:>3} | {p}"); continue
    og=re.search(r'<meta property="og:title" content="([^"]+)"',p)
    ti=re.search(r'<title>(.*?)</title>',p,re.S)
    label=(og.group(1) if og else (ti.group(1) if ti else '')).strip()
    label=re.sub(r'\s*[–-]\s*Limitless.*$','',label).strip()
    print(f"  #{n:>3} | {label}")
