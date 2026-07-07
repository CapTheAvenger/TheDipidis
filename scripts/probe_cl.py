#!/usr/bin/env python3
"""PROBE: dump 568 standings table cell-by-cell via bs4 to see why
_scrape_single_tournament (which reads pokemon from cells[2]) gets 0 rows."""
import os, sys, traceback
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for p in (os.path.join(ROOT, "backend", "core"), os.path.join(ROOT, "backend", "scrapers")):
    sys.path.insert(0, p)
import city_league_archetype_scraper as cl

soup = cl.fetch_page_bs4("https://limitlesstcg.com/tournaments/568")
tables = soup.select("table.striped")
print("num table.striped:", len(tables))
for ti, table in enumerate(tables):
    trs = table.find_all("tr")
    print(f"\n== table[{ti}] rows={len(trs)} ==")
    shown = 0
    for row in trs:
        if row.find("th"):
            continue
        cells = row.find_all("td")
        if not cells:
            continue
        desc = []
        for ci, c in enumerate(cells):
            pk = c.select("img.pokemon")
            alts = [i.get("alt") for i in pk]
            txt = c.get_text(strip=True)[:18]
            desc.append(f"[{ci}]{'PKMN'+str(alts) if alts else repr(txt)}")
        print("  ", " ".join(desc))
        shown += 1
        if shown >= 3:
            break
    if ti >= 2:
        break
