#!/usr/bin/env python3
"""Scrape pokemonproxies.com card image URLs into a static lookup map.

Background:
    pokemonproxies.com used to host card images under a predictable
    URL: ``/images/cards/sets/<Folder>/<prefix>-<NNN>-<Name>.png``.
    We mapped JP-only Champions sets (M3, M4) onto that scheme directly
    in code. Sometime before 2026-06-14 the site rebuilt on Vite and
    switched to ``/assets/<prefix>-<NNN>-<Name>-<HASH>.png`` where the
    hash is a Vite content-hash — pure per-file, NOT derivable from
    the card metadata alone. Algorithmic URL construction is therefore
    no longer possible.

    This script scrapes the site once and dumps every JP-card URL it
    can find into ``data/pokemonproxies_url_map.json`` keyed by
    ``<SET>_<NUMBER>`` (e.g. ``M5_23``). Backend (prepare_card_data.py)
    and frontend (js/app-profile-deck-builder.js) read the same file.

Discovery strategy:
    The site is a SPA, so simple top-down HTML scraping might miss
    routes that need JS. We try multiple discovery paths and merge:

      1. Fetch the homepage and grep the inlined Vite bundle JSON / JS
         for any ``/assets/<prefix>-<num>-<name>-<hash>.png`` strings.
         Vite typically inlines a manifest in the HTML or in the main
         JS chunk, so a regex pass over those payloads tends to pick
         up the full asset list.
      2. Walk every internal anchor link found on the homepage one
         level deep. Each card detail page tends to render the image
         tag directly, which we then capture.
      3. (Fallback) hit a couple of well-known set-listing endpoints
         (``/sets``, ``/cards``, ``/m5``) just in case the SPA exposes
         them as static routes.

Output format::

    {
      "_meta": {
        "scraped_at": "2026-06-14T17:30:00Z",
        "source":     "pokemonproxies.com",
        "entry_count": 81,
        "set_breakdown": { "M5": 81, ... }
      },
      "urls": {
        "M5_23": "https://www.pokemonproxies.com/assets/5a-023-Manectric-UWQu1Mvp.png",
        "M5_1":  "https://www.pokemonproxies.com/assets/5a-001-Tropius-AB12cd34.png"
      }
    }

Fail-soft:
    *   Network or parse failure  → keep the existing map; exit 0
        with a ``::warning::`` line (same pattern as the rest of the
        weekly batch).
    *   Empty result (0 URLs found) → ALSO keep the existing map and
        warn. We never overwrite a populated map with an empty one
        because that would silently delete every JP-proxy URL the
        next time the site has a hiccup.

Usage::

    python3 scripts/scrape_pokemonproxies_urls.py            # full scrape
    python3 scripts/scrape_pokemonproxies_urls.py --dry-run  # print diff, do not write
    python3 scripts/scrape_pokemonproxies_urls.py --debug    # noisy logging
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from typing import Dict, Iterable, List, Optional, Tuple
from urllib.parse import urljoin, urlparse

BASE_URL    = "https://www.pokemonproxies.com"
USER_AGENT  = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36"


def _resolve_output_path() -> str:
    """Same data_dir resolution the other scrapers use, so
    prepare_card_data.SYNC_PATTERNS finds the file and copies it back
    from backend/core/data/ to project-root data/. Falls back to a
    plain data/ when run outside the backend tree (e.g. local debug).
    """
    try:
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "core"))
        from card_scraper_shared import get_data_dir       # type: ignore
        return os.path.join(get_data_dir(), "pokemonproxies_url_map.json")
    except Exception:                                       # noqa: BLE001
        return os.path.join("data", "pokemonproxies_url_map.json")


OUTPUT_PATH = _resolve_output_path()

# Prefix → Pokémon Champions set code. The scraper sees a filename
# like ``5a-023-Manectric-UWQu1Mvp.png`` and needs to know that ``5a``
# means M5. Mapping confirmed historically:
#   3a → M3 (Munikis Zero, retired — intl POR shipped)
#   4a → M4 (Chaos Rising, retired — intl set shipped)
#   5a → M5 (current JP-only set, 2026-05-22)
# When a new JP-only Champions set drops, add its prefix here.
PREFIX_TO_SET = {
    "3a": "M3",
    "4a": "M4",
    "5a": "M5",
}

# Regex that picks the asset URL pattern out of any chunk of text:
#   /assets/<prefix>-<NNN>-<Name>-<hash>.png
# where <prefix> is one of the codes in PREFIX_TO_SET. Captures the
# prefix, padded card number, name (URL-safe word chars + dashes /
# underscores) and the hash. ``re.IGNORECASE`` is not used because
# Vite hashes are case-sensitive — a flipped case would point at a
# different asset.
_ASSET_RE = re.compile(
    r"/assets/("
    + "|".join(re.escape(p) for p in PREFIX_TO_SET)
    + r")-(\d{1,3})-([A-Za-z0-9_]+)-([A-Za-z0-9_-]+)\.png"
)

# Well-known static routes worth poking at as a fallback. Most SPA
# routes 200 with a shared HTML shell that won't help us, but the
# routes themselves can show up in the linked sitemap / pre-rendered
# pages of some Vite setups.
FALLBACK_PATHS = ["/", "/cards", "/sets", "/m5", "/m4", "/m3"]


# ─────────────────────────── HTTP helper ───────────────────────────


def _build_session():
    """Return a session that knows how to bypass the site's
    Cloudflare protection. Prefers cloudscraper; falls back to
    requests when unavailable so the script at least starts up."""
    try:
        import cloudscraper                # type: ignore
        return cloudscraper.create_scraper(
            browser={"browser": "chrome", "platform": "linux"},
        )
    except ImportError:
        import requests                    # type: ignore
        s = requests.Session()
        s.headers.update({"User-Agent": USER_AGENT})
        return s


def _fetch(session, url: str, debug: bool = False) -> Optional[str]:
    try:
        resp = session.get(url, timeout=20)
        if debug:
            print(f"  [fetch] {resp.status_code} {url}", file=sys.stderr)
        if resp.status_code != 200:
            return None
        return resp.text
    except Exception as e:    # noqa: BLE001 — any error → treat as miss
        if debug:
            print(f"  [fetch] EXC {url}: {e}", file=sys.stderr)
        return None


# ─────────────────────────── parsing ─────────────────────────────


def extract_urls(text: str) -> List[Tuple[str, str, str, str, str]]:
    """Pull every ``/assets/<prefix>-<num>-<name>-<hash>.png`` substring
    out of ``text`` and return them as a list of
    ``(prefix, number_padded, name_token, hash_token, full_relative_url)``.
    The same URL can match multiple times in a single payload (Vite
    typically prints a manifest twice — preload + main bundle); dedup
    is the caller's job."""
    out = []
    for m in _ASSET_RE.finditer(text or ""):
        prefix, num, name_token, hash_token = m.group(1), m.group(2), m.group(3), m.group(4)
        # Re-emit number padded to 3 digits so it matches the key
        # format the consumers (prepare_card_data, deck builder) use.
        out.append((prefix, num.zfill(3), name_token, hash_token, m.group(0)))
    return out


def merge_into_map(
    urls_map: Dict[str, str],
    found: Iterable[Tuple[str, str, str, str, str]],
    base_url: str,
) -> int:
    """Add each ``(prefix, number, name, hash, rel_url)`` tuple to the
    output dict keyed by ``<SET>_<NUMBER>``. Returns the number of
    NEW (or changed) entries — useful for the dry-run diff."""
    changed = 0
    for prefix, number, _name, _hash, rel in found:
        set_code = PREFIX_TO_SET.get(prefix)
        if not set_code:
            continue
        try:
            n = str(int(number))                  # strip leading zeros
        except ValueError:
            continue
        key = f"{set_code}_{n}"
        full_url = urljoin(base_url, rel)
        prev = urls_map.get(key)
        if prev != full_url:
            urls_map[key] = full_url
            changed += 1
    return changed


# ────────────────────────── discovery ────────────────────────────


def discover_internal_links(html: str, base_url: str) -> List[str]:
    """Collect distinct internal (same-host) anchor hrefs out of an
    HTML fragment. Used for the one-level-deep BFS that walks card
    detail pages."""
    base_host = urlparse(base_url).netloc
    hrefs = re.findall(r'href\s*=\s*["\']([^"\']+)["\']', html or "")
    out = []
    seen = set()
    for h in hrefs:
        if h.startswith(("mailto:", "tel:", "javascript:", "#")):
            continue
        url = urljoin(base_url, h)
        host = urlparse(url).netloc
        if host and host != base_host:
            continue
        # Drop fragments — same page, different anchor.
        url = url.split("#", 1)[0]
        if not url or url in seen:
            continue
        seen.add(url)
        out.append(url)
    return out


def discover_bundle_urls(html: str, base_url: str) -> List[str]:
    """Find every ``<script src="...">`` and ``<link rel="modulepreload"
    href="...">`` URL in ``html`` and return absolute URLs. Vite splits
    the app into module chunks — the main bundle plus per-route
    chunks. We download all of them and grep for ``/assets/*.png``
    strings because that's where the SPA's asset paths actually live
    (the static HTML only holds the bootstrap shell)."""
    base_host = urlparse(base_url).netloc
    out = []
    seen = set()
    # Script tags carry both the entry point and (often) inline-
    # preloaded chunks.
    for m in re.finditer(r'<script[^>]+src\s*=\s*["\']([^"\']+\.js)["\']', html or ""):
        href = m.group(1)
        url = urljoin(base_url, href)
        if urlparse(url).netloc in (base_host, ""):
            if url not in seen:
                seen.add(url); out.append(url)
    # Vite emits <link rel="modulepreload" href="/assets/Chunk-XXX.js">
    # for code-split routes — these usually carry the per-route
    # asset URLs we need.
    for m in re.finditer(
        r'<link[^>]+rel\s*=\s*["\']modulepreload["\'][^>]+href\s*=\s*["\']([^"\']+)["\']',
        html or "",
    ):
        href = m.group(1)
        url = urljoin(base_url, href)
        if urlparse(url).netloc in (base_host, ""):
            if url not in seen:
                seen.add(url); out.append(url)
    return out


def run_scrape(debug: bool = False) -> Dict[str, str]:
    """Top-level scrape. Returns a (possibly empty) ``key → URL`` map.
    Caller decides whether to persist it (e.g. only on non-empty)."""
    session = _build_session()
    urls_map: Dict[str, str] = {}

    # Phase 1: hit every fallback path. The homepage almost always
    # carries the Vite manifest inline, and the other paths cost
    # us only a few requests but sometimes pick up SSR'd images we
    # would otherwise miss.
    fetched: List[Tuple[str, str]] = []          # (path, html)
    for path in FALLBACK_PATHS:
        url = urljoin(BASE_URL, path)
        text = _fetch(session, url, debug=debug)
        if text:
            fetched.append((url, text))
        time.sleep(0.4)

    initial_count = 0
    for url, text in fetched:
        found = extract_urls(text)
        initial_count += len(found)
        merge_into_map(urls_map, found, BASE_URL)
    if debug:
        print(f"  [phase1] homepage + fallback paths: {initial_count} raw matches, "
              f"{len(urls_map)} unique keys", file=sys.stderr)

    # Phase 2: walk one level deep from the homepage. Many SPAs render
    # the card grid lazily — the per-card detail route has the image
    # tag baked in.
    if fetched:
        home_html = fetched[0][1]
        links = discover_internal_links(home_html, BASE_URL)
        if debug:
            print(f"  [phase2] {len(links)} internal links to inspect", file=sys.stderr)
        for link in links[:200]:                  # cap so we don't DoS the host
            text = _fetch(session, link, debug=False)
            if not text:
                continue
            merge_into_map(urls_map, extract_urls(text), BASE_URL)
            time.sleep(0.25)

    # Phase 3: Vite SPA bundle inspection. The user-reported empty
    # scrape from the 2026-06-14 weekly run was caused by
    # pokemonproxies.com being a Vite SPA — its homepage HTML is just
    # ``<div id="app"></div>`` plus a script tag. The actual asset
    # URLs live as string literals inside the compiled JS bundles
    # (Vite inlines the asset path table for runtime resolution).
    # Download every <script src> and <link rel=modulepreload> the
    # homepage references and grep them with the same regex.
    if fetched:
        home_url, home_html = fetched[0]
        bundles = discover_bundle_urls(home_html, home_url)
        if debug:
            print(f"  [phase3] {len(bundles)} JS bundles to inspect", file=sys.stderr)
        bundle_matches = 0
        for url in bundles[:50]:                  # cap; SPAs rarely emit more
            text = _fetch(session, url, debug=debug)
            if not text:
                continue
            found = extract_urls(text)
            bundle_matches += len(found)
            merge_into_map(urls_map, found, BASE_URL)
            time.sleep(0.2)
        if debug:
            print(f"  [phase3] {bundle_matches} raw matches in JS bundles "
                  f"→ {len(urls_map)} total unique keys", file=sys.stderr)

    return urls_map


# ──────────────────────────── io ─────────────────────────────────


def load_existing(path: str) -> Dict[str, str]:
    if not os.path.isfile(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            return data.get("urls") or {}
    except (OSError, json.JSONDecodeError):
        pass
    return {}


def write_map(path: str, urls_map: Dict[str, str]) -> None:
    """Atomic write. Reorders keys lexicographically by (set, number)
    so the file diff is stable run-to-run."""
    def _key(k: str) -> Tuple[str, int]:
        try:
            s, n = k.split("_", 1)
            return (s, int(n))
        except ValueError:
            return (k, 0)

    sorted_urls = {k: urls_map[k] for k in sorted(urls_map, key=_key)}

    from collections import Counter
    breakdown = dict(Counter(k.split("_", 1)[0] for k in sorted_urls))

    payload = {
        "_meta": {
            "scraped_at":   datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "source":       BASE_URL,
            "entry_count":  len(sorted_urls),
            "set_breakdown": breakdown,
            "_note": (
                "Generated by scripts/scrape_pokemonproxies_urls.py. "
                "Maps Pokemon Champions JP-only card keys "
                "(<SET>_<NUMBER>) to the full image URL on "
                "pokemonproxies.com. The CDN URLs carry a Vite content "
                "hash, so this map is the only way to find them — do "
                "not hand-edit; regenerate via the script."
            ),
        },
        "urls": sorted_urls,
    }
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.replace(tmp, path)


# ─────────────────────────── entry ───────────────────────────────


def main(argv: List[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n", 1)[0])
    ap.add_argument("--dry-run", action="store_true",
                    help="Print the diff vs. the existing map; do not write.")
    ap.add_argument("--debug", action="store_true",
                    help="Print per-URL fetch lines on stderr.")
    args = ap.parse_args(argv[1:])

    existing = load_existing(OUTPUT_PATH)
    print(f"Existing map: {len(existing)} entries")

    try:
        scraped = run_scrape(debug=args.debug)
    except Exception as e:                       # noqa: BLE001
        print(f"::warning::pokemonproxies scrape failed: {e}", file=sys.stderr)
        print("Keeping existing map untouched.")
        return 0

    print(f"Scraped:      {len(scraped)} entries")

    if not scraped:
        print("::warning::pokemonproxies scrape returned 0 URLs — "
              "site structure may have changed. Keeping existing map.")
        return 0

    new_keys = set(scraped) - set(existing)
    changed_urls = {k for k in (set(scraped) & set(existing)) if scraped[k] != existing[k]}
    print(f"New keys:     {len(new_keys)}  "
          f"Changed URLs: {len(changed_urls)}")

    if args.dry_run:
        print("(dry-run — not writing)")
        for k in sorted(new_keys)[:8]:
            print(f"  + {k}  →  {scraped[k]}")
        for k in sorted(changed_urls)[:8]:
            print(f"  ~ {k}")
        return 0

    if not new_keys and not changed_urls and existing:
        # Same data — still rewrite for the scraped_at timestamp so
        # the freshness gate downstream is happy. But skip the noise.
        write_map(OUTPUT_PATH, scraped)
        print(f"No data changes; refreshed timestamp on {OUTPUT_PATH}.")
        return 0

    write_map(OUTPUT_PATH, scraped)
    print(f"Wrote {OUTPUT_PATH} ({len(scraped)} entries).")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
