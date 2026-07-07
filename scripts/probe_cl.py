#!/usr/bin/env python3
"""PROBE: run the REAL archetype-scraper code against tournament 568 to see
what _scrape_single_tournament returns (and whether get_tournament_by_id
resolves it). Reproduces exactly what the weekly run did."""
import os, sys, traceback

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for p in (os.path.join(ROOT, "backend", "core"), os.path.join(ROOT, "backend", "scrapers")):
    sys.path.insert(0, p)

try:
    import city_league_archetype_scraper as cl
    print("import OK")
except Exception:
    traceback.print_exc()
    sys.exit(0)

try:
    info = cl.get_tournament_by_id("568")
    print("get_tournament_by_id(568) ->", info)
    if info:
        rows = cl._scrape_single_tournament(info)
        print("scrape_single_tournament rows:", len(rows))
        for r in rows[:8]:
            print("   ", r.get("placement"), "|", r.get("archetype"))
        # archetype distribution
        from collections import Counter
        c = Counter(r["archetype"] for r in rows)
        print("distinct archetypes:", len(c))
        print("top:", c.most_common(8))
except Exception:
    traceback.print_exc()
