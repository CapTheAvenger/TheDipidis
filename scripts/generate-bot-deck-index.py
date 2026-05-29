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


MIN_INCLUSION_PCT       = 30.0  # below this we call the card a tech / brick
HARD_DECK_SIZE          = 60    # PTCG hard cap
ENERGY_MAX              = 12    # safety cap for basic energy counts after rounding
MAX_TECH_CARDS          = 10    # how many tech options the bot's second image shows
TECH_INCLUSION_MIN_PCT  = 5.0   # below this is noise (single rogue list etc.)
MAX_MATCHUPS            = 15    # how many top opponents the matchup matrix surfaces
MIN_MATCHUP_GAMES       = 2     # below this is noise (lone result from one tournament)

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


def _clean_set_number(num: str) -> str:
    """Drop scraper-tail query strings like '?translate=en' off set numbers.

    The city-league scraper occasionally folds a URL fragment into the
    set_number field; left in place, that breaks every downstream
    consumer that uses (set, number) as a key — including the card-art
    prefetcher and the bot's image lookup.
    """
    if not num:
        return ''
    s = str(num).strip()
    if '?' in s:
        s = s.split('?', 1)[0]
    return s


def _read_ace_spec_names(site_dir: str) -> set[str]:
    """Set of lowercased Ace-Spec card names from ace_specs.json.

    The CSV's `is_ace_spec` column is "No" for every row right now
    (scraper hasn't been retagging since the format change); we
    fall back to this static list to flag entries in the generated
    decklists. Returns an empty set on any error so the deck data
    still builds even when the list is missing.
    """
    path = os.path.join(site_dir, 'data', 'ace_specs.json')
    try:
        with open(path, encoding='utf-8') as f:
            data = json.load(f)
        return {str(n).strip().lower() for n in (data.get('ace_specs') or []) if n}
    except Exception as exc:
        print(f'warn: ace_specs.json unreadable: {exc}', file=sys.stderr)
        return set()


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


def _card_from_row(r: dict, count: int, ace_spec_names: set[str] | None) -> dict:
    """Materialise a row → bot-side card object, shared by deck + tech lists."""
    card_name = r.get('card_name') or ''
    card_type = r.get('type') or ''
    is_ace_spec = str(r.get('is_ace_spec') or '').strip().lower() in ('yes', 'true', '1')
    if not is_ace_spec and ace_spec_names and card_name.strip().lower() in ace_spec_names:
        is_ace_spec = True
    return {
        'name': card_name,
        'set': (r.get('set_code') or '').strip().upper(),
        'number': _clean_set_number(r.get('set_number')),
        'count': count,
        'type': card_type,
        'bucket': _classify_card_type(card_type, card_name),
        'ace_spec': is_ace_spec,
        # image_url is the only source of truth that handles the
        # /tpci vs /tpc + _R_EN_LG vs _R_JP_LG + zero-padded number
        # variations correctly. The prefetcher uses it directly;
        # the bot uses (set, number) to look up the saved file.
        'image_url': (r.get('image_url') or '').strip(),
        # Usage stats: how many decks include the card and how many
        # copies they run on average. The bot overlays these onto each
        # tile so users can see "82 % play 3.4 copies on average" at a
        # glance.
        'inclusion_pct': round(_parse_eu(r.get('percentage_in_archetype')), 1),
        'avg_count':     round(_parse_eu(r.get('average_count')), 2),
    }


def _build_deck(rows: Iterable[dict], ace_spec_names: set[str] | None = None) -> tuple[list[dict], list[dict]]:
    """Return (main_deck, tech_cards) for one archetype.

    Main deck:
      Hill-climbing — sort by inclusion desc, round avg_count, accumulate
      until we hit 60. Once the inclusion-% floor is crossed we stop
      adding new cards but we don't give up on the 60-card target:
      a top-up pass bumps high-inclusion cards toward their 4-of cap
      (priority = how much the original avg got rounded down) and, if
      we're still short, pads the trailing basic energy line. That's
      the standard way a stock list balances to 60 in practice.

    Tech cards:
      Whatever sits between TECH_INCLUSION_MIN_PCT (5 %) and the main-deck
      floor (30 %), capped at MAX_TECH_CARDS, sorted by inclusion desc.
      Counts are still average-rounded so the user sees "this is the
      typical copy-count when somebody runs it".
    """
    sorted_rows = sorted(
        rows,
        key=lambda r: (
            -_parse_eu(r.get('percentage_in_archetype')),
            -_parse_eu(r.get('average_count')),
        ),
    )

    deck: list[dict] = []
    round_loss: dict[int, float] = {}  # index-in-deck → (avg - count); positive = rounded down
    total = 0
    sub_floor_rows: list[dict] = []
    for r in sorted_rows:
        pct = _parse_eu(r.get('percentage_in_archetype'))
        if pct < MIN_INCLUSION_PCT:
            sub_floor_rows.append(r)
            continue
        avg = _parse_eu(r.get('average_count'))
        count = round(avg)
        if count <= 0:
            if pct >= 75:
                count = max(1, round(avg + 0.49))
            else:
                continue

        card_name = r.get('card_name') or ''
        card_type = r.get('type') or ''
        if _is_basic_energy(card_name, card_type):
            count = min(count, ENERGY_MAX)
        else:
            count = min(count, 4)

        if total + count > HARD_DECK_SIZE:
            count = HARD_DECK_SIZE - total
            if count <= 0:
                continue

        idx = len(deck)
        deck.append(_card_from_row(r, count, ace_spec_names))
        round_loss[idx] = avg - count
        total += count
        if total >= HARD_DECK_SIZE:
            break

    # Top-up pass: most stock lists land 1-2 cards shy of 60 because of
    # the round() truncation. Bump the cards we rounded down the most
    # first (preserves the "this card is typically a 4-of" intuition),
    # then bump anything else up to the 4-of cap, and finally pad the
    # last basic energy line if a deficit somehow survives.
    if total < HARD_DECK_SIZE:
        ranked = sorted(range(len(deck)), key=lambda i: round_loss.get(i, 0), reverse=True)
        deficit = HARD_DECK_SIZE - total
        for i in ranked:
            if deficit <= 0:
                break
            card = deck[i]
            cap = ENERGY_MAX if card['bucket'] == 'basic-energy' else 4
            room = cap - card['count']
            if room <= 0:
                continue
            bump = min(room, deficit)
            card['count'] += bump
            deficit -= bump
        if deficit > 0:
            # Last resort: drop the deficit into the existing basic-
            # energy line. Most decks have one, so this is rare.
            energy = next((c for c in deck if c['bucket'] == 'basic-energy'), None)
            if energy:
                energy['count'] += deficit
                deficit = 0
        if deficit > 0:
            # No basic energy line at all — accept the under-60 count
            # rather than inventing a card. Surface it in the unique
            # count so the bot can show "59 Karten" honestly.
            pass

    # Tech cards: anything below the 30 % floor down to the 5 % noise
    # threshold, top N by inclusion.
    tech: list[dict] = []
    for r in sub_floor_rows:
        pct = _parse_eu(r.get('percentage_in_archetype'))
        if pct < TECH_INCLUSION_MIN_PCT:
            continue
        avg = _parse_eu(r.get('average_count'))
        count = max(1, round(avg))
        card_name = r.get('card_name') or ''
        card_type = r.get('type') or ''
        if not _is_basic_energy(card_name, card_type):
            count = min(count, 4)
        tech.append(_card_from_row(r, count, ace_spec_names))
        if len(tech) >= MAX_TECH_CARDS:
            break

    # Re-sort the main deck into the user's preferred reading order;
    # tech cards stay inclusion-sorted so the most-played option is
    # first.
    deck.sort(key=lambda c: TYPE_BUCKET_INDEX.get(c.get('bucket'), 99))
    return deck, tech


def _read_matchups(site_dir: str, format_key: str) -> dict[str, list[dict]]:
    """Read labs_tournament_matchups_{FORMAT}.csv → {archetype: [matchups]}.

    Each archetype's matchup list is the day_filter='overall' rows
    keyed under `my_deck_name`, sorted by sample size (vs_count) desc,
    capped at MAX_MATCHUPS so the rendered table fits a phone screen
    in monospace. Win-rate stays as a raw float; the bot decides the
    🟢/🔴 colour cut-offs at render time.

    Returns an empty dict on any error so the rest of the deck index
    still builds when the labs file is missing for a rotation we
    haven't backfilled yet.
    """
    path = os.path.join(site_dir, 'data', f'labs_tournament_matchups_{format_key}.csv')
    out: dict[str, list[dict]] = defaultdict(list)
    if not os.path.exists(path):
        print(f'warn: {path} missing — no matchups for {format_key}', file=sys.stderr)
        return out
    try:
        with open(path, encoding='utf-8-sig') as f:
            for row in csv.DictReader(f):
                if (row.get('day_filter') or '').strip() != 'overall':
                    continue
                my_name = (row.get('my_deck_name') or '').strip()
                opp_name = (row.get('opponent_deck_name') or '').strip()
                if not my_name or not opp_name:
                    continue
                try:
                    games = int(row.get('vs_count') or 0)
                except (ValueError, TypeError):
                    continue
                if games < MIN_MATCHUP_GAMES:
                    continue
                try:
                    win_pct = float(row.get('vs_win_pct') or 0)
                except (ValueError, TypeError):
                    win_pct = 0.0
                out[my_name].append({
                    'opponent': opp_name,
                    'games': games,
                    'win_pct': round(win_pct, 1),
                })
    except Exception as exc:  # pragma: no cover — diagnostics only
        print(f'warn: matchup parse failed for {format_key}: {exc}', file=sys.stderr)
        return defaultdict(list)

    for arch in out:
        out[arch].sort(key=lambda m: -m['games'])
        del out[arch][MAX_MATCHUPS:]
    return out


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


def _build_current_meta(site_dir: str, format_key: str, ranking: dict[str, dict],
                         ace_spec_names: set[str], matchups: dict[str, list[dict]]) -> dict:
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
        deck, tech = _build_deck(rows, ace_spec_names)
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
            'tech_cards': tech,
            'matchups': matchups.get(arch, []),
        }
    return out


# Minimum number of sample decks (aggregated across tournaments / periods)
# required before we'll build a stock list for an archetype. Below this
# the inclusion percentages get statistically meaningless — a single
# rogue list can drag a niche card above the 30 % floor.
MIN_ARCHETYPE_SAMPLE_DECKS = 5


def _aggregate_per_archetype_cards(rows: Iterable[dict], scope_key: str) -> list[dict]:
    """Roll per-tournament / per-period card rows into one row per (archetype, card).

    The TEF-POR tournament dump and the M3 city-league dump both store
    one row per (tournament-or-period, archetype, card). The inclusion
    stats on each row are scoped to that single tournament/period, so
    summing them naively would over-count `total_decks_in_archetype`
    (it's repeated once per card row inside the same group).

    Strategy:
      • For each (archetype, scope_value) we sample the
        total_decks_in_archetype field exactly once — those become the
        denominator for the aggregated inclusion percentage.
      • Per (archetype, card_identifier) we accumulate total_count and
        deck_inclusion_count across all scopes.
      • At the end we recompute percentage_in_archetype and
        average_count from the aggregated sums and emit rows that look
        identical to the current-meta CSV — so _build_deck() can
        consume them without modification.

    `scope_key` picks which column delineates a sample group
    (tournament_id for the regional dump, period for city-league).
    """
    arch_decks_per_scope: dict[tuple[str, str], int] = {}
    agg: dict[tuple[str, str], dict] = {}

    for r in rows:
        arch = (r.get('archetype') or '').strip()
        card_id = (r.get('card_identifier') or '').strip()
        if not arch or not card_id:
            continue
        scope = (r.get(scope_key) or '').strip()
        # Record this scope's total decks for the archetype once. Inside
        # one (archetype, scope) group every row carries the same value,
        # so the last-write-wins assignment lands on a single number.
        decks_here = int(_parse_eu(r.get('total_decks_in_archetype')))
        if decks_here > 0:
            arch_decks_per_scope[(arch, scope)] = decks_here

        key = (arch, card_id)
        slot = agg.get(key)
        if slot is None:
            slot = agg[key] = {
                'archetype': arch,
                'card_name': r.get('card_name') or '',
                'card_identifier': card_id,
                'set_code': r.get('set_code') or '',
                'set_number': r.get('set_number') or '',
                'type': r.get('type') or '',
                'is_ace_spec': r.get('is_ace_spec') or 'No',
                'image_url': r.get('image_url') or '',
                '_total_count': 0,
                '_inclusion_count': 0,
            }
        # The first non-empty image_url wins — later rows from other
        # tournaments occasionally have it blank.
        if not slot['image_url'] and r.get('image_url'):
            slot['image_url'] = r.get('image_url')
        slot['_total_count']     += int(_parse_eu(r.get('total_count')))
        slot['_inclusion_count'] += int(_parse_eu(r.get('deck_inclusion_count')))

    arch_total_decks: dict[str, int] = defaultdict(int)
    for (arch, _scope), decks in arch_decks_per_scope.items():
        arch_total_decks[arch] += decks

    out: list[dict] = []
    for (arch, _card_id), slot in agg.items():
        total_decks = arch_total_decks.get(arch, 0)
        inclusion = slot['_inclusion_count']
        if total_decks <= 0 or inclusion <= 0:
            continue
        pct = inclusion / total_decks * 100
        avg = slot['_total_count'] / inclusion
        out.append({
            'archetype': arch,
            'card_name': slot['card_name'],
            'card_identifier': slot['card_identifier'],
            'set_code': slot['set_code'],
            'set_number': slot['set_number'],
            'type': slot['type'],
            'is_ace_spec': slot['is_ace_spec'],
            'image_url': slot['image_url'],
            # EU-locale decimal so _parse_eu downstream sees what it expects.
            'percentage_in_archetype': f'{pct:.2f}'.replace('.', ','),
            'average_count':           f'{avg:.2f}'.replace('.', ','),
            'total_decks_in_archetype': str(total_decks),
        })
    return out


def _build_from_tournament_cards(
    csv_path: str,
    format_key: str,
    ace_spec_names: set[str],
    scope_key: str,
    matchups: dict[str, list[dict]] | None = None,
) -> dict:
    """Aggregate a tournament/period card dump and emit per-archetype stock lists."""
    if not os.path.exists(csv_path):
        print(f'warn: {csv_path} missing, skipping', file=sys.stderr)
        return {}

    with open(csv_path, encoding='utf-8-sig') as f:
        raw_rows = list(csv.DictReader(f, delimiter=';'))

    aggregated = _aggregate_per_archetype_cards(raw_rows, scope_key=scope_key)

    grouped: dict[str, list[dict]] = defaultdict(list)
    for r in aggregated:
        arch = r['archetype']
        if arch.lower() == 'other':
            continue
        grouped[arch].append(r)

    out: dict[str, dict] = {}
    for arch, arch_rows in grouped.items():
        # Every row inside a group carries the aggregated total — pick
        # any one. Filter long-tail archetypes that don't have enough
        # samples to produce a meaningful stock list.
        sample_decks = int(arch_rows[0].get('total_decks_in_archetype') or '0')
        if sample_decks < MIN_ARCHETYPE_SAMPLE_DECKS:
            continue
        deck, tech = _build_deck(arch_rows, ace_spec_names)
        if not deck:
            continue
        out[arch] = {
            'format_key': format_key,
            'card_count': sum(c['count'] for c in deck),
            'card_count_unique': len(deck),
            'sample_decks': sample_decks,
            'cards': deck,
            'tech_cards': tech,
            'matchups': (matchups or {}).get(arch, []),
        }
    return out


# Past-meta format is hard-coded to TEF-POR for now: that's the EN set
# pair the scraper dumped under tournament_cards_data_cards_TEF-POR.csv,
# and city_league_analysis_M3.csv is its JP counterpart. When the next
# rotation lands we'll either rename these files or read the prior
# format from format_window.json.
PAST_META_FORMAT_KEY = 'TEF-POR'


def _build_past_meta(site_dir: str, ace_spec_names: set[str], matchups: dict[str, list[dict]]) -> dict:
    return _build_from_tournament_cards(
        os.path.join(site_dir, 'data', f'tournament_cards_data_cards_{PAST_META_FORMAT_KEY}.csv'),
        format_key=PAST_META_FORMAT_KEY,
        ace_spec_names=ace_spec_names,
        scope_key='tournament_id',
        matchups=matchups,
    )


def _build_city_league(site_dir: str, ace_spec_names: set[str]) -> dict:
    # M3 = JP set code that maps to EN TEF-POR rotation; see
    # format_window.json _note for the cross-region mapping rationale.
    # No labs matchup data for city league — we'd need a JP-side dump
    # the scrapers don't produce yet, so matchups stay empty here.
    return _build_from_tournament_cards(
        os.path.join(site_dir, 'data', 'city_league_analysis_M3.csv'),
        format_key=PAST_META_FORMAT_KEY,
        ace_spec_names=ace_spec_names,
        scope_key='period',
    )


def _merge_source(decks_by_key: dict[str, dict], arch: str, payload: dict, source_key: str) -> None:
    """Attach an archetype payload under its source slot in the decks map.

    Past-meta and city-league archetypes that don't have a current-meta
    counterpart still get an entry — they slot to rank 9999 so the
    picker pushes them below all ranked decks, but they remain
    browsable via search / scroll.
    """
    key = _slugify(arch)
    bucket = decks_by_key.get(key)
    if bucket is None:
        bucket = decks_by_key[key] = {
            'key': key,
            'name': arch,
            'rank': 9999,
            'share_pct': None,
            'sources': {},
        }
    bucket['sources'][source_key] = payload


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

    ace_spec_names = _read_ace_spec_names(site_dir)
    print(f'  ace specs:     {len(ace_spec_names)} card names tagged')

    current_matchups = _read_matchups(site_dir, format_key)
    past_matchups    = _read_matchups(site_dir, PAST_META_FORMAT_KEY)
    print(f'  matchups:      {len(current_matchups)} current / {len(past_matchups)} past archetypes')

    current_meta = _build_current_meta(site_dir, format_key, ranking, ace_spec_names, current_matchups)
    print(f'  current-meta:  {len(current_meta)} decks')

    past_meta = _build_past_meta(site_dir, ace_spec_names, past_matchups)
    print(f'  past-tef-por:  {len(past_meta)} decks')

    city_league = _build_city_league(site_dir, ace_spec_names)
    print(f'  city-league:   {len(city_league)} decks')

    # Merge per-source dicts into a single deck-keyed index. Current
    # meta seeds the rank field; past-meta and city-league hang their
    # payloads off the same deck key and only seed entries for
    # archetypes the current meta doesn't already track.
    decks_by_key: dict[str, dict] = {}
    for arch, payload in current_meta.items():
        _merge_source(decks_by_key, arch, payload, 'current-meta')
        # Top-level rank pulled from current-meta so the bot can sort
        # without inspecting every source. Falls back to a high
        # sentinel for archetypes the share data doesn't know about,
        # which keeps them at the bottom of the list.
        decks_by_key[_slugify(arch)]['rank'] = payload.get('rank') or 9999
        decks_by_key[_slugify(arch)]['share_pct'] = payload.get('share_pct')

    for arch, payload in past_meta.items():
        _merge_source(decks_by_key, arch, payload, 'past-tef-por')

    for arch, payload in city_league.items():
        _merge_source(decks_by_key, arch, payload, 'city-league')

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
            'past-tef-por': {
                'label': 'Past Meta',
                'format_key': PAST_META_FORMAT_KEY,
                'deck_count': len(past_meta),
            },
            'city-league': {
                'label': 'City League',
                'format_key': PAST_META_FORMAT_KEY,
                'deck_count': len(city_league),
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
