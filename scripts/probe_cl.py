#!/usr/bin/env python3
"""PROBE: why did the archetype scraper get 0 decks from tournament 568 (Japan
Championships) while the analysis scraper got 315 rows? Inspect the standings
page structure vs what _scrape_single_tournament expects (table.striped rows
with img.pokemon in cell 3, digit placement in cell 1)."""
import re, urllib.request
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", "Accept-Language": "en"}


def get(u):
    try:
        return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=40).read().decode("utf-8", "replace")
    except Exception as e:
        return f"__ERR__ {e}"


for path in ("/tournaments/568", "/tournaments/568/standings", "/tournaments/568/decks"):
    url = "https://limitlesstcg.com" + path
    html = get(url)
    print(f"\n==== {url} ====")
    if html.startswith("__ERR__"):
        print(" ", html)
        continue
    print("  len:", len(html))
    print("  has 'table' 'striped':", ("striped" in html), "| class=\"pokemon\" count:", html.count('class="pokemon"'))
    # first striped table
    tm = re.search(r'<table[^>]*class="[^"]*striped[^"]*"[^>]*>(.*?)</table>', html, re.S)
    if not tm:
        print("  no table.striped found")
        # show any <table ...> classes present
        print("  tables present:", re.findall(r'<table[^>]*>', html)[:4])
        # show links to decklists (how analysis scraper might find decks)
        print("  /decklist links:", len(re.findall(r'href="[^"]*decklist[^"]*"', html)), "| ?deck= links:", len(re.findall(r'href="[^"]*[?&]deck', html)))
        continue
    rows = re.findall(r"<tr\b.*?</tr>", tm.group(1), re.S)
    print("  striped table rows:", len(rows))
    shown = 0
    for r in rows:
        if '<th' in r:
            continue
        cells = re.findall(r"<td\b[^>]*>(.*?)</td>", r, re.S)
        if len(cells) < 4:
            continue
        placement = re.sub(r"<[^>]+>", "", cells[0]).strip()
        poke = re.findall(r'class="pokemon"[^>]*alt="([^"]+)"', r)
        print(f"    row: cells={len(cells)} placement={placement!r} pokemon={poke[:4]}")
        shown += 1
        if shown >= 5:
            break
