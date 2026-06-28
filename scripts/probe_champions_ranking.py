#!/usr/bin/env python3
"""PROBE (temporary): find whether championsbattledata.com exposes an
AGGREGATE usage ranking (which Pokémon are most-used overall, per format /
season — the in-game "Pokémon" ranking screen: Knakrack #1, Salmagnis #2 …).

The per-Pokémon CSVs only carry within-mon distributions; column_position is
a layout index, not a usage rank. So we look for: (a) a usage rate / rank
field inside each mon's `summary.battleSummary`, and (b) any list/ranking
endpoint. Prints structure only. Run from CI.
"""

import json
import re
import urllib.request
import urllib.error

BASE = "https://championsbattledata.com"
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/124 Safari/537.36",
      "Accept": "application/json,text/html,*/*"}


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=45) as r:
        return r.status, r.headers.get("Content-Type", ""), r.read()


def show(label, url):
    print(f"\n=== {label} ===\n{url}")
    try:
        st, ct, body = get(url)
    except urllib.error.HTTPError as e:
        print(f"  HTTP {e.code}")
        return None, None
    except Exception as e:  # noqa: BLE001
        print(f"  ERR {type(e).__name__}: {e}")
        return None, None
    print(f"  status={st} ct={ct} bytes={len(body)}")
    return ct, body


def main():
    # (a) Full battleSummary for one Pokémon — does it carry an overall
    #     usage rate / rank for the mon itself?
    ct, body = show("api/pokemon/pelipper", f"{BASE}/api/pokemon/pelipper")
    if body:
        j = json.loads(body.decode("utf-8", "replace"))
        summ = j.get("summary", {})
        bs = summ.get("battleSummary")
        print("  summary keys:", list(summ.keys()))
        print("  battleSummary type:", type(bs).__name__)
        s = json.dumps(bs)
        # surface any usage/rank/percentage-looking keys
        for kw in ("usage", "rank", "rate", "pick", "percent", "popularity", "count", "total"):
            for m in re.finditer(rf'"([^"]*{kw}[^"]*)"\s*:\s*([^,{{}}\[\]]+)', s, re.I):
                print(f"    {m.group(1)} = {m.group(2)[:40]}")
        print("  battleSummary (first 700):", s[:700])

    # (b) Candidate list / ranking endpoints.
    for label, url in [
        ("api/rankings", f"{BASE}/api/rankings"),
        ("api/ranking", f"{BASE}/api/ranking"),
        ("api/usage/doubles", f"{BASE}/api/usage/doubles"),
        ("api/pokemon (list)", f"{BASE}/api/pokemon"),
        ("api/pokemons", f"{BASE}/api/pokemons"),
        ("api/leaderboard", f"{BASE}/api/leaderboard"),
        ("api/stats", f"{BASE}/api/stats"),
        ("api/home", f"{BASE}/api/home"),
        ("usage_list asset", f"{BASE}/pokemon_champions_assets/usage.json"),
        ("rankings asset", f"{BASE}/pokemon_champions_assets/rankings.json"),
        ("metadata index", f"{BASE}/pokemon_champions_assets/metadata.json"),
    ]:
        ct, body = show(label, url)
        if body and ct and "json" in ct.lower():
            txt = body.decode("utf-8", "replace")
            try:
                j = json.loads(txt)
                if isinstance(j, list):
                    print(f"  JSON list len={len(j)} first={json.dumps(j[0])[:250] if j else ''}")
                elif isinstance(j, dict):
                    print(f"  JSON keys={list(j.keys())[:25]}")
            except Exception:
                print(f"  (json parse failed) first200={txt[:200]!r}")

    # (c) Does the SPA homepage reference a usage/ranking data file in its JS?
    ct, body = show("homepage", f"{BASE}/")
    if body:
        html = body.decode("utf-8", "replace")
        for m in set(re.findall(r'(/[A-Za-z0-9_./-]*(?:usage|rank|stat|pokemon)[A-Za-z0-9_./-]*\.(?:json|js))', html, re.I)):
            print("  ref:", m)
        for m in set(re.findall(r'(/assets/[A-Za-z0-9_./-]+\.js)', html)):
            print("  jsbundle:", m)

    print("\n=== done ===")


if __name__ == "__main__":
    main()
