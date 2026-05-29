#!/usr/bin/env python3
"""Pre-fetch card art for every (set, number) the bot deck index references.

Reads `_site/data/bot-deck-index.json`, walks every deck/source/card,
dedupes by (set_code, set_number), and downloads each card image from
the Limitless CDN. Images are resized to a fixed tile size and saved
as PNG into `_site/data/card-art/{SET}_{NUM}.png` so the Telegram bot
can pull them from thedipidis.app instead of hitting the CDN per
request (which risks rate-limits and adds CDN-round-trip latency).

Cards that already exist in the output directory are skipped — handy
for re-runs and (later) for restored CI cache.
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

# Tile size used by the bot's deck-grid composite. 250×350 is the
# largest size that comfortably fits a 4-column grid inside Telegram's
# photo width without forcing the client to up-scale. Cards are 63×88mm
# (ratio 0.716) so this keeps the original aspect.
TILE_W = 250
TILE_H = 350

# Limitless CDN URL template. The "_R_EN_LG" suffix is what the scraper
# already records in the CSVs — it gives a ~400–600 px LG (large)
# render that downsamples cleanly to the tile size.
CDN_TEMPLATE = (
    'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/{set}/{set}_{num}_R_EN_LG.png'
)

FETCH_TIMEOUT_S = 20
HTTP_USER_AGENT = 'thedipidis-bot-prefetch/0.1 (+https://thedipidis.app)'
MAX_PARALLEL = 8     # be polite — concurrent enough to stay fast


def _collect_card_keys(index_path: str) -> list[tuple[str, str]]:
    with open(index_path, encoding='utf-8') as f:
        idx = json.load(f)
    seen: set[tuple[str, str]] = set()
    for deck in (idx.get('decks') or {}).values():
        for src in (deck.get('sources') or {}).values():
            for card in src.get('cards') or []:
                set_code = (card.get('set') or '').strip().upper()
                number = (card.get('number') or '').strip()
                if set_code and number:
                    seen.add((set_code, number))
    return sorted(seen)


def _fetch_one(set_code: str, number: str, out_dir: str) -> tuple[str, str, bool, str]:
    """Returns (set, num, success, message)."""
    out_path = os.path.join(out_dir, f'{set_code}_{number}.png')
    if os.path.exists(out_path) and os.path.getsize(out_path) > 0:
        return (set_code, number, True, 'cached')

    url = CDN_TEMPLATE.format(set=set_code, num=number)
    try:
        resp = requests.get(
            url,
            timeout=FETCH_TIMEOUT_S,
            headers={'User-Agent': HTTP_USER_AGENT},
        )
        if resp.status_code != 200:
            return (set_code, number, False, f'HTTP {resp.status_code}')
        img = Image.open(io.BytesIO(resp.content)).convert('RGBA')
        # LANCZOS gives the cleanest downsample for typography on the
        # cards; cheap enough at this scale.
        img = img.resize((TILE_W, TILE_H), Image.LANCZOS)
        img.save(out_path, format='PNG', optimize=True)
        return (set_code, number, True, f'{os.path.getsize(out_path) // 1024} KB')
    except Exception as exc:  # broad — we want to keep going on isolated failures
        return (set_code, number, False, f'err: {exc}')


def main(argv: list[str]) -> int:
    site_dir = argv[1] if len(argv) > 1 else '_site'
    index_path = os.path.join(site_dir, 'data', 'bot-deck-index.json')
    out_dir = os.path.join(site_dir, 'data', 'card-art')
    if not os.path.exists(index_path):
        print(f'error: {index_path} missing — run generate-bot-deck-index.py first', file=sys.stderr)
        return 1
    os.makedirs(out_dir, exist_ok=True)

    keys = _collect_card_keys(index_path)
    print(f'unique cards to ensure: {len(keys)}')

    t0 = time.time()
    ok = 0
    fail = 0
    cached = 0
    with cf.ThreadPoolExecutor(max_workers=MAX_PARALLEL) as pool:
        futures = [pool.submit(_fetch_one, s, n, out_dir) for s, n in keys]
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
    return 0 if fail < len(keys) // 2 else 2


if __name__ == '__main__':
    sys.exit(main(sys.argv))
