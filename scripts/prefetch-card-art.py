#!/usr/bin/env python3
"""Pre-fetch card art for every card the bot deck index references.

Reads `_site/data/bot-deck-index.json`, walks every deck/source/card,
dedupes by (set_code, set_number), and downloads each card's image
from the URL the scraper recorded in `image_url`. Using image_url
directly handles every quirk the URL-template approach kept tripping
on:

  • EN sets live under `/tpci/{SET}/{SET}_{NUM_PADDED3}_R_EN_LG.png`
    where the number is zero-padded to 3 digits.
  • JP sets live under `/tpc/{SET}/{SET}_{NUM}_R_JP_LG.png` with a
    different parent path AND no padding.
  • Old set-codes (LOR, PAR, PAF) appear in M3 city-league rows even
    though the local set list is a couple rotations newer.

Saved files are keyed by `{SET}_{NUMBER}.png` — both fields cleaned
(no query strings, uppercased set) so the bot's lookup is
deterministic regardless of which URL pattern was used to fetch.
Cards already present in the output directory are skipped, which
keeps re-runs (and future CI cache restore) fast.
"""

from __future__ import annotations

import concurrent.futures as cf
import csv
import io
import json
import os
import sys
import time
from collections import defaultdict

import requests
from PIL import Image

TILE_W = 250
TILE_H = 350

FETCH_TIMEOUT_S = 20
HTTP_USER_AGENT = 'thedipidis-bot-prefetch/0.3 (+https://thedipidis.app)'
MAX_PARALLEL = 8

# Fallback template — used only when the deck index didn't carry an
# image_url for a card (very-new sets the scraper hasn't backfilled
# yet). The 03d pad matches Limitless' EN-side naming for /tpci/.
EN_FALLBACK_TEMPLATE = (
    'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/{set}/{set}_{num:0>3}_R_EN_LG.png'
)


def _en_url_for(set_code: str, number: str) -> str:
    try:
        padded = f'{int(number):03d}'
    except (ValueError, TypeError):
        padded = number
    return EN_FALLBACK_TEMPLATE.format(set=set_code, num=padded)


def _clean_number(num: str) -> str:
    if not num:
        return ''
    s = str(num).strip()
    if '?' in s:
        s = s.split('?', 1)[0]
    return s


def _read_alt_print_urls(site_dir: str) -> dict[tuple[str, str], list[str]]:
    """Build (set, num) → [alt EN URLs] from all_cards_database.csv.

    Limitless occasionally has the primary print URL we recorded
    return a 404 — usually because the file just isn't on the CDN for
    that specific print variant. The `international_prints` column
    lists every print of the same card across sets (e.g. "WHT-143,
    WHT-62"), so when the primary fails we can fall back to whichever
    alternative print actually has artwork on the CDN. Saved file
    still uses the primary (set, num) as its key, so the bot's lookup
    doesn't have to know any of this.
    """
    path = os.path.join(site_dir, 'data', 'all_cards_database.csv')
    alt: dict[tuple[str, str], list[str]] = defaultdict(list)
    if not os.path.exists(path):
        return alt
    try:
        with open(path, encoding='utf-8') as f:
            for row in csv.DictReader(f):
                set_code = (row.get('set') or '').strip().upper()
                num = (row.get('number') or '').strip()
                if not set_code or not num:
                    continue
                # international_prints is a quote-wrapped comma list:
                # "WHT-143,WHT-62"  →  [(WHT,143), (WHT,62)]
                intl = (row.get('international_prints') or '').strip().strip('"')
                for code in intl.split(','):
                    code = code.strip()
                    if '-' not in code:
                        continue
                    alt_set, alt_num = code.split('-', 1)
                    alt_set = alt_set.strip().upper()
                    alt_num = alt_num.strip()
                    if not alt_set or not alt_num:
                        continue
                    if (alt_set, alt_num) == (set_code, num):
                        continue  # self-reference
                    alt[(set_code, num)].append(_en_url_for(alt_set, alt_num))
    except Exception as exc:  # pragma: no cover
        print(f'warn: alt-print map failed: {exc}', file=sys.stderr)
    return alt


def _collect_cards(index_path: str, alt_urls: dict[tuple[str, str], list[str]]) -> list[dict]:
    """Return a list of unique cards keyed by (set, number) with a fallback URL chain."""
    with open(index_path, encoding='utf-8') as f:
        idx = json.load(f)
    seen: dict[tuple[str, str], str] = {}
    for deck in (idx.get('decks') or {}).values():
        for src in (deck.get('sources') or {}).values():
            for card in src.get('cards') or []:
                set_code = (card.get('set') or '').strip().upper()
                number = _clean_number(card.get('number'))
                if not set_code or not number:
                    continue
                key = (set_code, number)
                # First non-empty image_url wins; later duplicates only
                # fill the slot if the previous entry didn't carry one.
                url = (card.get('image_url') or '').strip()
                if key not in seen or (not seen[key] and url):
                    seen[key] = url

    out = []
    for (s, n), u in seen.items():
        primary = u or _en_url_for(s, n)
        alts = alt_urls.get((s, n), [])
        # Build the fallback chain — primary first, then international
        # prints in whatever order the database gave us. Dedupe so a
        # repeated primary doesn't waste a retry.
        chain = [primary] + [a for a in alts if a != primary]
        out.append({'set': s, 'number': n, 'urls': chain})
    return out


def _fetch_one(card: dict, out_dir: str) -> tuple[str, str, bool, str]:
    set_code, number = card['set'], card['number']
    out_path = os.path.join(out_dir, f'{set_code}_{number}.png')
    if os.path.exists(out_path) and os.path.getsize(out_path) > 0:
        return (set_code, number, True, 'cached')

    last_err = 'no urls'
    for url in card.get('urls') or []:
        try:
            resp = requests.get(
                url,
                timeout=FETCH_TIMEOUT_S,
                headers={'User-Agent': HTTP_USER_AGENT},
            )
            if resp.status_code != 200:
                last_err = f'HTTP {resp.status_code}'
                continue
            img = Image.open(io.BytesIO(resp.content)).convert('RGBA')
            img = img.resize((TILE_W, TILE_H), Image.LANCZOS)
            img.save(out_path, format='PNG', optimize=True)
            size_kb = os.path.getsize(out_path) // 1024
            via = '' if url == card['urls'][0] else f' (alt #{card["urls"].index(url)})'
            return (set_code, number, True, f'{size_kb} KB{via}')
        except Exception as exc:
            last_err = f'err: {exc}'
            continue
    return (set_code, number, False, last_err)


def main(argv: list[str]) -> int:
    site_dir = argv[1] if len(argv) > 1 else '_site'
    index_path = os.path.join(site_dir, 'data', 'bot-deck-index.json')
    out_dir = os.path.join(site_dir, 'data', 'card-art')
    if not os.path.exists(index_path):
        print(f'error: {index_path} missing — run generate-bot-deck-index.py first', file=sys.stderr)
        return 1
    os.makedirs(out_dir, exist_ok=True)

    alt_urls = _read_alt_print_urls(site_dir)
    print(f'alt-print map: {len(alt_urls)} cards with at least one alternative')
    cards = _collect_cards(index_path, alt_urls)
    with_alts = sum(1 for c in cards if len(c['urls']) > 1)
    print(f'unique cards to ensure: {len(cards)} (of which {with_alts} carry alt URLs)')

    t0 = time.time()
    ok = 0
    fail = 0
    cached = 0
    with cf.ThreadPoolExecutor(max_workers=MAX_PARALLEL) as pool:
        futures = [pool.submit(_fetch_one, c, out_dir) for c in cards]
        for fut in cf.as_completed(futures):
            s, n, success, msg = fut.result()
            if not success:
                fail += 1
                print(f'  ✗ {s}/{n}: {msg}', file=sys.stderr)
            elif msg == 'cached':
                cached += 1
            else:
                ok += 1
    elapsed = time.time() - t0
    print(f'✓ done in {elapsed:.1f}s — {ok} fetched, {cached} cached, {fail} failed')
    # Don't fail the deploy on partial failures: missing tiles fall
    # back to placeholder boxes in the bot composite, the rest of
    # the deck still renders. Only abort if literally everything
    # failed (network outage, CDN block, etc.) so the bot doesn't
    # serve an entirely-placeholder image after deploy.
    if cards and fail == len(cards):
        print('error: every fetch failed — aborting deploy step', file=sys.stderr)
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
