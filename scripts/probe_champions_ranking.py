#!/usr/bin/env python3
"""PROBE (temporary): is there a reliable per-Pokémon USAGE RATE / RANK?
(a) Dump championsbattledata's FULL battleSummary for Pelipper — look for a
    usage rate / rank / games-total field (the in-game page shows "9. Platz").
(b) Pokémon Zone — does it expose the in-game-ladder usage ranking (it 403'd
    before; retry with full browser headers + try its data/api routes)?
(c) Pikalytics — usage ranking (tournament-based, different from ladder).
Short output. Run from CI.
"""

import json
import re
import urllib.request
import urllib.error

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept": "text/html,application/json,application/xhtml+xml,*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://www.google.com/"}


def get(url, timeout=30):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.headers.get("Content-Type", ""), r.read()


def show(label, url):
    print(f"\n=== {label} ===\n{url}")
    try:
        st, ct, body = get(url)
        print(f"  status={st} ct={ct} bytes={len(body)}")
        return ct, body
    except urllib.error.HTTPError as e:
        print(f"  HTTP {e.code}")
    except Exception as e:  # noqa: BLE001
        print(f"  ERR {type(e).__name__}: {e}")
    return None, None


def main():
    # (a) championsbattledata full battleSummary — any usage/rank/total?
    ct, body = show("cbd Pelipper api", "https://championsbattledata.com/api/pokemon/pelipper")
    if body:
        j = json.loads(body.decode("utf-8", "replace"))
        bs = j.get("summary", {}).get("battleSummary")
        s = json.dumps(bs)
        print(f"  battleSummary {len(s)} chars; top-level keys:",
              list(bs.keys()) if isinstance(bs, dict) else type(bs).__name__)
        if isinstance(bs, dict):
            for season, fmts in bs.items():
                if isinstance(fmts, dict):
                    for fmt, blk in fmts.items():
                        if isinstance(blk, dict):
                            print(f"   {season}/{fmt} keys: {list(blk.keys())}")
        for kw in ("usage", "rank", "platz", "rate", "pick", "total", "games", "count", "battles"):
            hits = re.findall(rf'"([^"]*{kw}[^"]*)"\s*:\s*("?[^,{{}}\[\]"]{{0,30}})', s, re.I)
            if hits:
                print(f"   kw '{kw}':", hits[:6])

    # (b) Pokémon Zone — singles & doubles season usage + any json/data route.
    for label, url in [
        ("pz singles season", "https://www.pokemon-zone.com/champions/ranked-seasons/singles/"),
        ("pz pokemon list", "https://www.pokemon-zone.com/champions/pokemon/"),
        ("pz api usage", "https://www.pokemon-zone.com/api/champions/usage"),
        ("pz next data", "https://www.pokemon-zone.com/_next/data/index.json"),
    ]:
        ct, body = show(label, url)
        if body:
            txt = body.decode("utf-8", "replace")
            for nm in ("Garchomp", "Knakrack", "Dragapult", "Whimsicott", "usage", "rank"):
                if nm.lower() in txt.lower():
                    i = txt.lower().find(nm.lower())
                    print(f"   has '{nm}': ...{txt[max(0,i-40):i+60].strip()[:90]!r}")
                    break

    # (c) Pikalytics — champions usage ranking page.
    ct, body = show("pikalytics champions", "https://www.pikalytics.com/pokedex/championspreview")
    if body:
        txt = body.decode("utf-8", "replace")
        print("  has 'usage':", "usage" in txt.lower(), "| has 'Garchomp':", "garchomp" in txt.lower())

    print("\n=== done ===")


if __name__ == "__main__":
    main()
