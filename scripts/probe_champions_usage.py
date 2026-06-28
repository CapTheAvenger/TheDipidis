#!/usr/bin/env python3
"""PROBE (temporary): dump the structure of championsbattledata.com's JSON
API so we can build a reliable per-Pokémon usage parser. Verified earlier
that /api/pokemon/<slug> returns nature splits matching the in-game usage
analysis (Pelipper Modest ~52% / Timid ~24% ≈ in-game 53.9% / 23.4%).

Prints structure only — writes nothing. Run from CI.
"""

import json
import urllib.request
import urllib.error

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
        status, ct, body = get(url)
    except urllib.error.HTTPError as e:
        print(f"  HTTP {e.code}")
        return None
    except Exception as e:  # noqa: BLE001
        print(f"  ERR {type(e).__name__}: {e}")
        return None
    print(f"  status={status} ct={ct} bytes={len(body)}")
    return body


def dump_pokemon(slug):
    body = show(f"api/pokemon/{slug}", f"https://championsbattledata.com/api/pokemon/{slug}")
    if not body:
        return
    j = json.loads(body.decode("utf-8", "replace"))
    print(f"  top keys: {list(j.keys())}")
    print(f"  name={j.get('name')} battleName={j.get('battleName')} slug={j.get('slug')}")

    summary = j.get("summary")
    print(f"  summary type={type(summary).__name__}")
    if isinstance(summary, dict):
        print(f"  summary keys: {list(summary.keys())}")
        print(f"  summary (trunc): {json.dumps(summary)[:800]}")

    meta = j.get("metadataCsv")
    if isinstance(meta, str):
        print(f"  metadataCsv (first 600): {meta[:600]!r}")

    bdc = j.get("battleDataCsvs")
    print(f"  battleDataCsvs type={type(bdc).__name__}")
    if isinstance(bdc, dict):
        for k, v in bdc.items():
            print(f"   --- format key: {k} ---")
            if isinstance(v, str):
                lines = v.splitlines()
                for ln in lines[:8]:
                    print(f"      {ln[:160]}")
            else:
                print(f"      (value type {type(v).__name__}): {json.dumps(v)[:300]}")
    elif isinstance(bdc, list):
        print(f"  list len={len(bdc)}")
        for it in bdc[:4]:
            print(f"   item keys: {list(it.keys()) if isinstance(it,dict) else type(it).__name__}")
            print(f"   item (trunc): {json.dumps(it)[:400]}")


def main():
    dump_pokemon("pelipper")
    # How do we enumerate all Pokémon / find season+format labels?
    for label, url in [
        ("api/pokemon index", "https://championsbattledata.com/api/pokemon"),
        ("api/pokedex",       "https://championsbattledata.com/api/pokedex"),
        ("api/meta",          "https://championsbattledata.com/api/meta"),
        ("api/formats",       "https://championsbattledata.com/api/formats"),
        ("api/usage",         "https://championsbattledata.com/api/usage"),
        ("api/seasons",       "https://championsbattledata.com/api/seasons"),
        ("api/pokemon-list",  "https://championsbattledata.com/api/pokemon-list"),
    ]:
        b = show(label, url)
        if b:
            txt = b.decode("utf-8", "replace")
            try:
                j = json.loads(txt)
                if isinstance(j, list):
                    print(f"  list len={len(j)} first={json.dumps(j[0])[:200] if j else '[]'}")
                elif isinstance(j, dict):
                    print(f"  keys={list(j.keys())[:30]}")
            except Exception:
                print(f"  (not json) first 200: {txt[:200]!r}")
    print("\n=== done ===")


if __name__ == "__main__":
    main()
