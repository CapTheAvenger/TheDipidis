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
import io
import json
import os
import sys
import time

import requests
from PIL import Image

TILE_W = 250
TILE_H = 350

FETCH_TIMEOUT_S = 20
HTTP_USER_AGENT = 'thedipidis-bot-prefetch/0.2 (+https://thedipidis.app)'
MAX_PARALLEL = 8

# Fallback template — used only when the deck index didn't carry an
# image_url for a card (very-new sets the scraper hasn't backfilled
# yet). The 03d pad matches Limitless' EN-side naming for /tpci/.
EN_FALLBACK_TEMPLATE = (
    'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/{set}/{set}_{num:0>3}_R_EN_LG.png'
)


def _clean_number(num: str) -> str:
    if not num:
        return ''
    s = str(num).strip()
    if '?' in s:
        s = s.split('?', 1)[0]
    return s


def _collect_cards(index_path: str) -> list[dict]:
    """Return a list of unique cards keyed by (set, number) with their image URL."""
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
    return [
        {'set': s, 'number': n, 'url': u or EN_FALLBACK_TEMPLATE.format(set=s, num=n)}
        for (s, n), u in seen.items()
    ]


def _fetch_one(card: dict, out_dir: str) -> tuple[str, str, bool, str]:
    set_code, number, url = card['set'], card['number'], card['url']
    out_path = os.path.join(out_dir, f'{set_code}_{number}.png')
    if os.path.exists(out_path) and os.path.getsize(out_path) > 0:
        return (set_code, number, True, 'cached')
    try:
        resp = requests.get(
            url,
            timeout=FETCH_TIMEOUT_S,
            headers={'User-Agent': HTTP_USER_AGENT},
        )
        if resp.status_code != 200:
            return (set_code, number, False, f'HTTP {resp.status_code}')
        img = Image.open(io.BytesIO(resp.content)).convert('RGBA')
        img = img.resize((TILE_W, TILE_H), Image.LANCZOS)
        img.save(out_path, format='PNG', optimize=True)
        return (set_code, number, True, f'{os.path.getsize(out_path) // 1024} KB')
    except Exception as exc:
        return (set_code, number, False, f'err: {exc}')


def main(argv: list[str]) -> int:
    site_dir = argv[1] if len(argv) > 1 else '_site'
    index_path = os.path.join(site_dir, 'data', 'bot-deck-index.json')
    out_dir = os.path.join(site_dir, 'data', 'card-art')
    if not os.path.exists(index_path):
        print(f'error: {index_path} missing — run generate-bot-deck-index.py first', file=sys.stderr)
        return 1
    os.makedirs(out_dir, exist_ok=True)

    cards = _collect_cards(index_path)
    print(f'unique cards to ensure: {len(cards)}')

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
