#!/usr/bin/env python3
"""PROBE (temporary): find the data path championsbattledata's homepage uses
for its aggregate usage ranking. We already confirmed no /api/* ranking
route and no ranking/usage JSON/CSV asset exist, and the per-Pokémon record
carries no overall usage rate. So inspect the SPA's JS bundle for the real
endpoint/asset it fetches for the ranking. Output kept short. Run from CI.
"""

import re
import urllib.request
import urllib.error

BASE = "https://championsbattledata.com"
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/124 Safari/537.36"}


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=45) as r:
        return r.read()


def main():
    html = get(f"{BASE}/").decode("utf-8", "replace")
    print("homepage bytes:", len(html))
    # Every script/module/link the shell pulls in.
    srcs = re.findall(r'<(?:script|link)[^>]+(?:src|href)="([^"]+)"', html)
    js = [s for s in srcs if ".js" in s or "/assets/" in s or "/_app" in s]
    print("all srcs:", srcs)
    print("js-ish:", js)

    seen = set()
    for src in js:
        url = src if src.startswith("http") else (BASE + (src if src.startswith("/") else "/" + src))
        if url in seen:
            continue
        seen.add(url)
        try:
            body = get(url)
        except Exception as e:  # noqa: BLE001
            print(f"  bundle {url} ERR {e}")
            continue
        b = body.decode("utf-8", "replace")
        print(f"\n  bundle {url} ({len(b)} bytes)")
        # Endpoint/asset literals + any ranking/usage related path or word.
        paths = set(re.findall(r'["\'`](/(?:api|pokemon_champions_assets)/[A-Za-z0-9_./{}$:-]+)["\'`]', b))
        for kw in ("rank", "usage", "popular", "leaderboard", "trending", "topPokemon", "/api/"):
            for m in re.findall(rf'["\'`]([^"\'`]*{kw}[^"\'`]*)["\'`]', b, re.I):
                if len(m) < 80 and ("/" in m or kw.lower() in ("rank", "usage")):
                    paths.add(m)
        for p in sorted(paths)[:60]:
            print("    path:", p)

    print("\n=== done ===")


if __name__ == "__main__":
    main()
