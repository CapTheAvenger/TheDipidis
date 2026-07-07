#!/usr/bin/env python3
"""PROBE: how does limitlesstcg.com encode the 'JS' (Japan Standard) format on
the main completed-tournaments listing, and what does tournament 568 look like?
Goal: reliably auto-detect JS majors to add to City-League additional IDs."""
import re, urllib.request
UA={"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36","Accept-Language":"en"}
def get(u):
    try:
        return urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=45).read().decode("utf-8","replace")
    except Exception as e:
        return f"__ERR__ {e}"

print("==== main completed listing (show=50) ====")
html=get("https://limitlesstcg.com/tournaments?show=50")
if html.startswith("__ERR__"):
    print(html)
else:
    # filter form: format <select> options
    for sel in re.finditer(r'<select[^>]*name="([^"]*)"[^>]*>(.*?)</select>', html, re.S):
        name=sel.group(1)
        opts=re.findall(r'<option[^>]*value="([^"]*)"[^>]*>(.*?)</option>', sel.group(2), re.S)
        if any(k in name.lower() for k in ("format","game","type")) or any('standard' in (o[1] or '').lower() for o in opts):
            print(f"  SELECT name={name}: {[ (v, re.sub('<[^>]+>','',t).strip()) for v,t in opts ][:20]}")
    # sample rows: dump raw HTML of first ~6 data rows to see the format column
    rows=[tr for tr in re.findall(r'<tr[^>]*>(.*?)</tr>', html, re.S)]
    print(f"  rows found: {len(rows)}")
    shown=0
    for r in rows:
        if '/tournaments/' not in r: continue
        # compact
        rc=re.sub(r'\s+',' ', r).strip()
        print("  ROW:", rc[:600])
        shown+=1
        if shown>=6: break

print("\n==== tournament 568 page (format + date) ====")
p=get("https://limitlesstcg.com/tournaments/568")
if p.startswith("__ERR__"):
    print(p)
else:
    t=re.search(r'<title>(.*?)</title>', p, re.S)
    print("  title:", re.sub(r'\s+',' ',re.sub('<[^>]+>','',t.group(1))).strip() if t else '-')
    # look for format label and date near the header
    for kw in ("Standard","Format","format","Japan","2026-06","Jun"):
        for m in re.finditer(re.escape(kw), p):
            seg=re.sub(r'\s+',' ',re.sub('<[^>]+>',' ',p[max(0,m.start()-60):m.start()+60])).strip()
            print(f"   [{kw}] …{seg}…"); break
