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

# Card-type bucket order for the decklist export, matching how players
# expect to read a list: Pokémon first, then trainers grouped by sub-
# type, then energies. Within each bucket cards keep their inclusion-
# percentage order (most-included first).
TYPE_BUCKETS = [
    'pokemon',
    'supporter',
    'item',
    'tool',
    'stadium',
    'special-energy',
    'basic-energy',
]
TYPE_BUCKET_INDEX = {b: i for i, b in enumerate(TYPE_BUCKETS)}


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


def _classify_card_type(card_type: str, card_name: str) -> str:
    """Map the CSV's free-form `type` value into one of our 7 buckets.

    The CSV uses Pokémon TCG canonical labels — "Basic" / "Stage 1" /
    "Stage 2" for Pokémon evolution stages, "Item" / "Supporter" /
    "Tool" / "Stadium" for trainers, "Basic Energy" / "Special Energy"
    for energies — so straight string-matching gets us there.
    """
    t = (card_type or '').strip()
    if 'Basic Energy' in t:
        return 'basic-energy'
    if 'Special Energy' in t:
        return 'special-energy'
    if t == 'Supporter':
        return 'supporter'
    if t == 'Tool' or 'Pokémon Tool' in t or 'Pokemon Tool' in t:
        return 'tool'
    if t == 'Stadium':
        return 'stadium'
    if t == 'Item':
        return 'item'
    # Pokémon stages (Basic / Stage 1 / Stage 2 / etc.) plus the empty
    # string default — Pokémon is the safe fallback because anything
    # we don't recognise tends to be a Pokémon variant the scraper
    # added (BREAK, V-UNION, etc.).
    return 'pokemon'


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
            'bucket': _classify_card_type(card_type, card_name),
        })
        total += count
        if total >= HARD_DECK_SIZE:
            break

    # Re-sort cards into the user's preferred reading order:
    # Pokémon → Supporter → Item → Tool → Stadium → Special Energy →
    # Basic Energy. Within each bucket the original
    # inclusion-percentage order is preserved by using a stable sort
    # keyed only on the bucket index.
    deck.sort(key=lambda c: TYPE_BUCKET_INDEX.get(c.get('bucket'), 99))
    return deck


def _read_share_ranking(site_dir: str) -> dict[str, dict]:
    """Read limitless_online_decks_comparison.csv → {archetype_name:
    {rank, share_pct, count, winrate_pct}}.

    Source of truth for ordering the bot's deck picker — same numbers
    the Current Meta tab on thedipidis.app shows in its "rank 1 …"
    column. Falls back to empty if the file is missing; archetypes
    without a rank then sort to the bottom.
    """
    path = os.path.join(site_dir, 'data', 'limitless_online_decks_comparison.csv')
    out: dict[str, dict] = {}
    if not os.path.exists(path):
        return out
    try:
        with open(path, encoding='utf-8-sig') as f:
            for row in csv.DictReader(f, delimiter=';'):
                name = (row.get('deck_name') or '').strip()
                if not name:
                    continue
                rank_raw = row.get('new_rank') or row.get('old_rank') or ''
                try:
                    rank = int(rank_raw)
                except (ValueError, TypeError):
                    continue
                out[name] = {
                    'rank': rank,
                    'share_pct': _parse_eu(row.get('new_share') or row.get('old_share')),
                    'count': int(row.get('new_count') or row.get('old_count') or 0),
                    'winrate_pct': _parse_eu(row.get('new_winrate') or row.get('old_winrate')),
                }
    except Exception as exc:  # pragma: no cover
        print(f'warn: share-ranking parse failed: {exc}', file=sys.stderr)
    return out


def _build_current_meta(site_dir: str, format_key: str, ranking: dict[str, dict]) -> dict:
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
        share_info = ranking.get(arch) or {}
        out[arch] = {
            'format_key': format_key,
            'card_count': card_count,
            'card_count_unique': len(deck),
            'rank': share_info.get('rank'),
            'share_pct': share_info.get('share_pct'),
            'count': share_info.get('count'),
            'winrate_pct': share_info.get('winrate_pct'),
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

    ranking = _read_share_ranking(site_dir)
    print(f'  share ranking: {len(ranking)} decks')

    current_meta = _build_current_meta(site_dir, format_key, ranking)
    print(f'  current-meta:  {len(current_meta)} decks')

    # Merge per-source dicts into a single deck-keyed index. Phase 3a
    # only has current-meta; past-tef-por and city-league hook in
    # later (next sessions) so the structure already supports them.
    decks_by_key: dict[str, dict] = {}
    for arch, payload in current_meta.items():
        key = _slugify(arch)
        if key not in decks_by_key:
            decks_by_key[key] = {
                'key': key,
                'name': arch,
                # Top-level rank pulled from current-meta so the bot can
                # sort without inspecting every source. Falls back to a
                # high sentinel for archetypes the share data doesn't
                # know about, which keeps them at the bottom of the list.
                'rank': payload.get('rank') or 9999,
                'share_pct': payload.get('share_pct'),
                'sources': {},
            }
        decks_by_key[key]['sources']['current-meta'] = payload

    # Sort decks for the bot's picker by current-meta rank (1 = most
    # played). Ties (and unranked archetypes) break alphabetically.
    ordered = dict(sorted(
        decks_by_key.items(),
        key=lambda kv: (kv[1].get('rank') or 9999, kv[1]['name'].lower()),
    ))

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
