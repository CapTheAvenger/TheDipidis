#!/usr/bin/env python3
"""Generate data/bot-deck-index.json for the Telegram bot.

For each archetype the bot can offer (currently only Current Meta;
City League + Past Meta come in later phases), we build an
approximated "stock" 60-card decklist by:

  1. Sorting the archetype's cards by `percentage_in_archetype`
     (= what share of decks in that archetype run this card)
     descending — high-inclusion cards land first.
  2. Rounding `average_count` to the nearest integer for each card
     (this is the avg copies in decks THAT include the card, so
     it's exactly what a player would put in their list).
  3. Dropping anything that drops below a 30 % inclusion floor —
     those are bricks / tech picks that aren't part of the stock
     archetype.
  4. Trimming or padding the list to land near 60 — see _trim_to_60.

The result is what a top player would call the "standard" version
of the archetype: not optimal for any one matchup, but the cards a
viewer expects to see when they hear "show me a Dragapult Dusknoir
list".

Source files consumed:
  • _site/data/current_meta_card_data.csv  — per-archetype card stats
  • _site/data/format_window.json          — current rotation key

Output:
  • _site/data/bot-deck-index.json         — read by the bot at
    runtime to power the deck picker
"""

from __future__ import annotations

import csv
import json
import os
import re
import sys
from collections import defaultdict
from typing import Iterable


MIN_INCLUSION_PCT = 30.0     # below this we call the card a tech / brick
HARD_DECK_SIZE     = 60       # PTCG hard cap
ENERGY_MAX         = 12       # safety cap for basic energy counts after rounding


def _parse_eu(value: str) -> float:
    """Parse the EU-locale numeric strings the scraper writes (',' decimal)."""
    if value is None or value == '':
        return 0.0
    try:
        return float(str(value).replace(',', '.'))
    except ValueError:
        return 0.0


def _slugify(name: str) -> str:
    s = name.lower().strip()
    s = re.sub(r"['’]", '', s)            # strip apostrophes
    s = re.sub(r'[^a-z0-9]+', '-', s)         # everything else → dash
    s = re.sub(r'-+', '-', s).strip('-')
    return s or 'unknown'


def _read_format_key(site_dir: str) -> str:
    """oldest_legal_set + '-' + current_set from format_window.json."""
    path = os.path.join(site_dir, 'data', 'format_window.json')
    try:
        with open(path, encoding='utf-8') as f:
            data = json.load(f)
        oldest = data.get('oldest_legal_set')
        current = data.get('current_set')
        if oldest and current:
            return f'{oldest}-{current}'
    except Exception as exc:  # pragma: no cover — diagnostics only
        print(f'warn: format_window.json unreadable: {exc}', file=sys.stderr)
    return 'TEF-CRI'


def _is_basic_energy(card_name: str, card_type: str) -> bool:
    """Round-cap exception: a deck can run 12 Fire Energy if it wants."""
    if (card_type or '').strip().startswith('Basic Energy'):
        return True
    return bool(re.match(r'^(Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal|Fairy|Dragon) Energy\b', (card_name or '').strip()))


def _build_deck(rows: Iterable[dict]) -> list[dict]:
    """Pick the stock 60-card list for one archetype.

    Hill-climbing approach: sort by inclusion desc, round avg_count,
    accumulate until we hit 60. If we overshoot, drop trailing
    low-inclusion cards. If we undershoot, the deck is just thin —
    we surface it as-is rather than padding with random fillers.
    """
    sorted_rows = sorted(
        rows,
        key=lambda r: (
            -_parse_eu(r.get('percentage_in_archetype')),
            -_parse_eu(r.get('average_count')),
        ),
    )

    deck: list[dict] = []
    total = 0
    for r in sorted_rows:
        pct = _parse_eu(r.get('percentage_in_archetype'))
        if pct < MIN_INCLUSION_PCT:
            break
        avg = _parse_eu(r.get('average_count'))
        count = round(avg)
        if count <= 0:
            # Promote cards that are nearly always in the deck even if
            # the rounded count is 0 — better to surface "Boss's Orders 1"
            # than to silently drop it.
            if pct >= 75:
                count = max(1, round(avg + 0.49))
            else:
                continue

        # Cap to 4 unless it's basic energy (special-energy lines like
        # "Reversal Energy" still hit the 4-cap so they don't blow up
        # the list if the scraper mis-parses an outlier).
        card_name = r.get('card_name') or ''
        card_type = r.get('type') or ''
        if _is_basic_energy(card_name, card_type):
            count = min(count, ENERGY_MAX)
        else:
            count = min(count, 4)

        if total + count > HARD_DECK_SIZE:
            # Truncate the last card so we land exactly at 60. Skips
            # trailing cards entirely if the truncation would zero them.
            count = HARD_DECK_SIZE - total
            if count <= 0:
                break

        deck.append({
            'name': card_name,
            'set': r.get('set_code') or '',
            'number': r.get('set_number') or '',
            'count': count,
            'type': card_type,
        })
        total += count
        if total >= HARD_DECK_SIZE:
            break

    return deck


def _build_current_meta(site_dir: str, format_key: str) -> dict:
    csv_path = os.path.join(site_dir, 'data', 'current_meta_card_data.csv')
    if not os.path.exists(csv_path):
        print(f'warn: {csv_path} missing, skipping current-meta', file=sys.stderr)
        return {}

    grouped: dict[str, list[dict]] = defaultdict(list)
    with open(csv_path, encoding='utf-8-sig') as f:
        for row in csv.DictReader(f, delimiter=';'):
            arch = (row.get('archetype') or '').strip()
            if not arch or arch.lower() == 'other':
                continue
            grouped[arch].append(row)

    out: dict[str, dict] = {}
    for arch, rows in grouped.items():
        deck = _build_deck(rows)
        if not deck:
            continue
        card_count = sum(c['count'] for c in deck)
        out[arch] = {
            'format_key': format_key,
            'card_count': card_count,
            'card_count_unique': len(deck),
            'cards': deck,
        }
    return out


def main(argv: list[str]) -> int:
    site_dir = argv[1] if len(argv) > 1 else '_site'
    version_stamp = argv[2] if len(argv) > 2 else ''
    if not os.path.isdir(site_dir):
        print(f'error: site dir not found: {site_dir}', file=sys.stderr)
        return 1

    format_key = _read_format_key(site_dir)
    print(f'Current rotation key: {format_key}')

    current_meta = _build_current_meta(site_dir, format_key)
    print(f'  current-meta: {len(current_meta)} decks')

    # Merge per-source dicts into a single deck-keyed index. Phase 3a
    # only has current-meta; past-tef-por and city-league hook in
    # later (next sessions) so the structure already supports them.
    decks_by_key: dict[str, dict] = {}
    for arch, payload in current_meta.items():
        key = _slugify(arch)
        if key not in decks_by_key:
            decks_by_key[key] = {'key': key, 'name': arch, 'sources': {}}
        decks_by_key[key]['sources']['current-meta'] = payload

    # Sort decks for the bot's picker — alphabetical for now, the bot
    # may resort by share or popularity later.
    ordered = dict(sorted(decks_by_key.items(), key=lambda kv: kv[1]['name'].lower()))

    out = {
        'generated_at': version_stamp,
        'sources': {
            'current-meta': {
                'label': 'Current Meta',
                'format_key': format_key,
                'deck_count': len(current_meta),
            },
        },
        'decks': ordered,
    }

    out_path = os.path.join(site_dir, 'data', 'bot-deck-index.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f'✓ wrote {out_path} ({os.path.getsize(out_path) / 1024:.1f} KB, {len(ordered)} decks)')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
