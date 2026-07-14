#!/usr/bin/env python3
"""PROBE (temporary): dump the __NEXT_DATA__ structure of the rewards gallery.

The gallery is a Next.js page with a __NEXT_DATA__ <script> blob that holds the
full reward list (series, number, name, image). We parse it and print the JSON
STRUCTURE (keys + one sample card + counts) so we can write a real builder that
needs only 1-2 requests (no CDN brute force).
"""
import json
import re
import sys
import urllib.request

PLAY = "https://play.pokemon.com"
UA = {"User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                     "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"),
      "Accept": "text/html", "Accept-Language": "de-DE,de;q=0.9"}


def out(m):
    print(m, flush=True)


def fetch_next_data(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=25) as r:
        html = r.read().decode("utf-8", "replace")
    m = re.search(r'<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not m:
        return None
    return json.loads(m.group(1))


def walk(node, path="", depth=0, max_depth=6):
    """Print the shape: dict keys, list lengths + first-item shape."""
    ind = "  " * depth
    if depth > max_depth:
        return
    if isinstance(node, dict):
        keys = list(node.keys())
        out(f"{ind}{path or '<root>'}: dict keys={keys[:25]}")
        for k in keys:
            v = node[k]
            if isinstance(v, (dict, list)):
                walk(v, f"{path}.{k}" if path else k, depth + 1, max_depth)
    elif isinstance(node, list):
        out(f"{ind}{path}: list len={len(node)}")
        if node:
            walk(node[0], path + "[0]", depth + 1, max_depth)


def main():
    url = f"{PLAY}/de-de/rewards/gallery/"
    out(f"== __NEXT_DATA__ structure of {url} ==")
    data = fetch_next_data(url)
    if data is None:
        out("!! no __NEXT_DATA__ found")
        return 1
    page_props = data.get("props", {}).get("pageProps", {})
    out(f"pageProps keys: {list(page_props.keys())}")
    walk(page_props, "pageProps", 0, 5)

    # Heuristic: find any list of dicts whose items mention 'series'/'image'/'number'
    out("\n== candidate card lists (list of dicts with image/number/name) ==")

    def scan(node, path=""):
        if isinstance(node, list) and node and isinstance(node[0], dict):
            keys = set().union(*[set(d.keys()) for d in node[:5] if isinstance(d, dict)])
            if keys & {"image", "imageUrl", "number", "cardNumber", "name", "title",
                       "series", "assets", "asset"}:
                out(f"\nLIST at {path}: len={len(node)} item_keys={sorted(keys)[:30]}")
                out("  sample[0]: " + json.dumps(node[0], ensure_ascii=False)[:800])
                if len(node) > 1:
                    out("  sample[1]: " + json.dumps(node[1], ensure_ascii=False)[:400])
        if isinstance(node, dict):
            for k, v in node.items():
                scan(v, f"{path}.{k}" if path else k)
        elif isinstance(node, list):
            for i, v in enumerate(node[:3]):
                scan(v, f"{path}[{i}]")

    scan(page_props, "pageProps")
    return 0


if __name__ == "__main__":
    sys.exit(main())
