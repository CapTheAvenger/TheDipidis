#!/usr/bin/env python3
"""PROBE: confirm the archetype-scraper fix — 568 should now yield ~32 rows."""
import os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for p in (os.path.join(ROOT, "backend", "core"), os.path.join(ROOT, "backend", "scrapers")):
    sys.path.insert(0, p)
import city_league_archetype_scraper as cl
from collections import Counter

info = cl.get_tournament_by_id("568")
rows = cl._scrape_single_tournament(info)
print("rows:", len(rows))
c = Counter(r["archetype"] for r in rows)
print("distinct archetypes:", len(c))
for arch, n in c.most_common(12):
    print(f"   {n:2}x {arch}")
