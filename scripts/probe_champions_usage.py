#!/usr/bin/env python3
"""PROBE (temporary): dump championsbattledata.com's battleSummary block and
the raw Singles battle-data CSV for Pelipper, so we can build a reliable
usage parser. Verified the Singles nature split (Modest ~52% / Timid ~24%)
matches the in-game analysis (53.9% / 23.4%).

Prints structure only — writes nothing. Run from CI.
"""

import json
import urllib.request
import urllib.error

BASE = "https://championsbattledata.com"
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/124 Safari/537.36",
      "Accept": "application/json,text/csv,*/*"}


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=45) as r:
        return r.status, r.headers.get("Content-Type", ""), r.read()


def main():
    # 1) Full battleSummary for Pelipper.
    url = f"{BASE}/api/pokemon/pelipper"
    print(f"=== {url} ===")
    _, _, body = get(url)
    j = json.loads(body.decode("utf-8", "replace"))
    summary = j.get("summary", {})
    bs = summary.get("battleSummary")
    print(f"battleSummary type={type(bs).__name__}")
    print(json.dumps(bs, indent=1)[:3500])

    # 2) Raw battle-data CSV assets (the ground-truth distributions).
    for item in j.get("battleDataCsvs", []):
        path = item.get("path")
        fmt = item.get("format")
        season = item.get("season")
        asset = f"{BASE}/{path}"
        print(f"\n=== CSV {season}/{fmt}: {asset} ===")
        try:
            st, ct, cb = get(asset)
            txt = cb.decode("utf-8", "replace")
            print(f"  status={st} ct={ct} bytes={len(cb)}")
            lines = txt.splitlines()
            print(f"  rows={len(lines)}")
            for ln in lines[:18]:
                print(f"   {ln[:200]}")
        except urllib.error.HTTPError as e:
            print(f"  HTTP {e.code}")
        except Exception as e:  # noqa: BLE001
            print(f"  ERR {type(e).__name__}: {e}")

    # 3) metadata CSV asset.
    meta_path = j.get("metadataCsv")
    if isinstance(meta_path, str) and meta_path.endswith(".csv"):
        asset = f"{BASE}/{meta_path}"
        print(f"\n=== metadata CSV: {asset} ===")
        try:
            st, ct, cb = get(asset)
            txt = cb.decode("utf-8", "replace")
            print(f"  status={st} ct={ct} bytes={len(cb)}")
            for ln in txt.splitlines()[:18]:
                print(f"   {ln[:200]}")
        except Exception as e:  # noqa: BLE001
            print(f"  ERR {type(e).__name__}: {e}")

    # 4) Enumeration: is there a master manifest / sitemap of all slugs?
    for label, u in [
        ("sitemap.xml", f"{BASE}/sitemap.xml"),
        ("assets manifest", f"{BASE}/pokemon_champions_assets/battle_data/Singles/"),
        ("pokemon-list asset", f"{BASE}/pokemon_champions_assets/pokemon_list.json"),
    ]:
        print(f"\n=== {label}: {u} ===")
        try:
            st, ct, cb = get(u)
            print(f"  status={st} ct={ct} bytes={len(cb)} first200={cb[:200]!r}")
        except urllib.error.HTTPError as e:
            print(f"  HTTP {e.code}")
        except Exception as e:  # noqa: BLE001
            print(f"  ERR {type(e).__name__}: {e}")

    print("\n=== done ===")


if __name__ == "__main__":
    main()
