#!/usr/bin/env python3
"""PROBE (temporary): app.js renders a Pokémon table with row.rank + usage,
so championsbattledata HAS aggregate rank/usage data. It isn't a static
/api literal, so find the fetch URL(s) app.js uses. Dump every fetch()/URL/
.json/.csv reference with context. Run from CI; short output.
"""

import re
import urllib.request

BASE = "https://championsbattledata.com"
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/124 Safari/537.36"}


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=45).read()


def main():
    js = get(f"{BASE}/app.js").decode("utf-8", "replace")
    print("app.js bytes:", len(js))

    # Every fetch(...) call with a chunk of its argument.
    print("\n-- fetch() calls --")
    for m in re.finditer(r"fetch\s*\(([^;]{0,160})", js):
        print("  fetch(", m.group(1).replace("\n", " ")[:150])

    # Any URL-ish / path-ish literal (quotes or backticks) that looks like data.
    print("\n-- data-ish literals --")
    lits = re.findall(r"""[`'"]([^`'"]{3,120})[`'"]""", js)
    seen = set()
    for s in lits:
        low = s.lower()
        if any(k in low for k in (".json", ".csv", "/api", "assets", "${", "http")) \
           and not s.endswith((".svg", ".css", ".png", ".webmanifest")):
            if s not in seen:
                seen.add(s)
                print("  lit:", s[:120])

    # Context around the 'rank' table builder to see the data source variable.
    print("\n-- 'row.rank' context --")
    i = js.find("row.rank")
    if i >= 0:
        print("  ", js[max(0, i - 240):i + 80].replace("\n", " "))

    print("\n=== done ===")


if __name__ == "__main__":
    main()
