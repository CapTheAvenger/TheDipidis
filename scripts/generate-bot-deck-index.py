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
from datetime import datetime
from typing import Iterable


MIN_INCLUSION_PCT       = 30.0  # below this a card stays off the stock 60-card list
HARD_DECK_SIZE          = 60    # PTCG hard cap
ENERGY_MAX              = 12    # safety cap for basic energy counts after rounding
MAX_TECH_CARDS          = 10    # how many "next-in-line" alternatives the second image shows
MAX_MATCHUPS            = 15    # how many top opponents the matchup matrix surfaces
MIN_MATCHUP_GAMES       = 2     # below this is noise (lone result from one tournament)

# Blend tunables — kept in sync with Meta Call's matchup map
# (js/app-meta-call.js:21,22). The bot's current-meta matchup matrix
# blends Limitless online (base) with the labs major-tournament matrix
# (filtered to the active rotation) the same way Meta Call's
# getBaseMatchup does, so the numbers stay consistent across the
# bot, the website's deck-analysis surfaces, and the Meta Call
# predictor's internal matchup map.
#
# MAJOR_MATCHUP_WEIGHT = 3.0  → 3:1 Labs:Online = 75 % Labs / 25 % Online
# Bump to 4.0 for the 80 / 20 split documented in the original spec.
MAJOR_MATCHUP_WEIGHT    = 3.0
MAJOR_MATCHUP_MIN_GAMES = 10    # min combined labs sample per pair before the blend fires

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


# Limitless CDN puts EN prints under /tpci/{SET}/{SET}_{NUM:03d}_R_EN_LG.png
# and JP prints under /tpc/{SET}/{SET}_{NUM}_R_JP_LG.png. The scrapers
# occasionally tag a card with the JP URL even when the set code is
# clearly an EN three-letter set — happens around new-set rollouts
# where the EN print exists but the per-card metadata hasn't caught up.
# We rebuild the EN URL ourselves for those cases so the bot's deck
# images don't surface Japanese variants of cards that have an
# international print.
_JP_URL_RE = re.compile(r'(_JP_LG|/tpc/)')
_JP_SET_RE = re.compile(r'^(M\d|MP)')


def _normalize_image_url(image_url: str, set_code: str, set_number: str) -> str:
    if not image_url:
        return ''
    if not _JP_URL_RE.search(image_url):
        return image_url
    if not set_code or _JP_SET_RE.match(set_code):
        return image_url  # genuinely JP-only set (M3, MP1, ...)
    if not set_number:
        return image_url
    try:
        padded = f'{int(set_number):03d}'
    except (ValueError, TypeError):
        padded = set_number
    return (
        f'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/'
        f'tpci/{set_code}/{set_code}_{padded}_R_EN_LG.png'
    )


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


def _derive_oldest_legal_from_manifest(site_dir: str, current_set: str) -> str:
    """Fallback when format_window.json doesn't carry oldest_legal_set
    (legacy snapshots before that field was added). Read the chunk_dates
    manifest, find the most recent rotation key whose chunk window
    starts on-or-before the current_set's release, and take its
    OLDEST half ('TEF' out of 'TEF-POR'). Empty string when the
    manifest can't help — caller decides whether to error.
    """
    path = os.path.join(site_dir, 'data', 'tournament_cards_manifest.json')
    try:
        with open(path, encoding='utf-8') as f:
            manifest = json.load(f)
    except (OSError, json.JSONDecodeError):
        return ''
    # chunk_dates keys are 'tournament_cards_data_cards_<META>.csv';
    # extract just the <META> part and pick the most recent one whose
    # rotation ENDS with the previous set (= the one current_set rotated
    # in on top of).
    candidates = []
    for chunk_name, dates in (manifest.get('chunk_dates') or {}).items():
        meta = chunk_name.replace('tournament_cards_data_cards_', '').replace('.csv', '')
        try:
            max_date = datetime.strptime(dates.get('max_date', ''), '%Y-%m-%d')
        except ValueError:
            continue
        if '-' in meta:
            candidates.append((max_date, meta))
    if not candidates:
        return ''
    candidates.sort(reverse=True)  # newest max_date first
    # Newest chunk is the just-closed rotation; its OLDEST half becomes
    # the new rotation's oldest_legal_set after a set drops.
    newest_rotation = candidates[0][1]      # e.g. 'TEF-POR'
    return newest_rotation.split('-', 1)[0]  # 'TEF'


def _read_format_key(site_dir: str) -> str:
    """oldest_legal_set + '-' + current_set from format_window.json.

    Hardcoded 'TEF-CRI' fallback removed — that would silently misroute
    every downstream lookup once the next set rotates in and someone
    forgets to update the constant. When oldest_legal_set is missing
    from format_window.json we derive it from the chunk_dates manifest
    instead (the newest closed rotation's oldest half). When both
    paths fail we exit non-zero so the operator notices.
    """
    path = os.path.join(site_dir, 'data', 'format_window.json')
    try:
        with open(path, encoding='utf-8') as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError) as exc:
        print(f'error: format_window.json unreadable: {exc}', file=sys.stderr)
        sys.exit(1)
    current = (data.get('current_set') or '').strip().upper()
    if not current:
        print(
            'error: format_window.json missing current_set — '
            'update_sets.py needs to run first. Refusing to guess a rotation.',
            file=sys.stderr,
        )
        sys.exit(1)
    oldest = (data.get('oldest_legal_set') or '').strip().upper()
    if not oldest:
        oldest = _derive_oldest_legal_from_manifest(site_dir, current)
        if oldest:
            print(
                f'note: format_window.json had no oldest_legal_set; derived '
                f'{oldest!r} from tournament_cards_manifest.json',
                file=sys.stderr,
            )
    if not oldest:
        print(
            'error: oldest_legal_set is missing from format_window.json '
            'and could not be derived from the chunk_dates manifest. '
            'Refusing to guess a rotation key.',
            file=sys.stderr,
        )
        sys.exit(1)
    return f'{oldest}-{current}'


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
    set_code = (r.get('set_code') or '').strip().upper()
    set_number = _clean_set_number(r.get('set_number'))
    is_ace_spec = str(r.get('is_ace_spec') or '').strip().lower() in ('yes', 'true', '1')
    if not is_ace_spec and ace_spec_names and card_name.strip().lower() in ace_spec_names:
        is_ace_spec = True
    return {
        'name': card_name,
        'set': set_code,
        'number': set_number,
        'count': count,
        'type': card_type,
        'bucket': _classify_card_type(card_type, card_name),
        'ace_spec': is_ace_spec,
        # image_url is the only source of truth that handles the
        # /tpci vs /tpc + _R_EN_LG vs _R_JP_LG + zero-padded number
        # variations correctly. The prefetcher uses it directly;
        # the bot uses (set, number) to look up the saved file.
        # Mis-tagged JP URLs on EN-set cards are remapped to the EN
        # equivalent so the bot doesn't surface JP variants of cards
        # with an international print.
        'image_url': _normalize_image_url(
            (r.get('image_url') or '').strip(), set_code, set_number,
        ),
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
    not_added_rows: list[dict] = []  # everything that didn't make the stock 60
    for r in sorted_rows:
        pct = _parse_eu(r.get('percentage_in_archetype'))
        if pct < MIN_INCLUSION_PCT:
            not_added_rows.append(r)
            continue
        avg = _parse_eu(r.get('average_count'))
        count = round(avg)
        if count <= 0:
            if pct >= 75:
                count = max(1, round(avg + 0.49))
            else:
                not_added_rows.append(r)
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
                not_added_rows.append(r)
                continue

        idx = len(deck)
        deck.append(_card_from_row(r, count, ace_spec_names))
        round_loss[idx] = avg - count
        total += count
        # Don't break out of the loop when main fills up: rows after
        # this point can still feed the "next in line" tech list. The
        # `count <= 0` skip above handles the actual cap.

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

    # Tech cards = the top N cards (by inclusion %) that DIDN'T make
    # the stock 60. Reframes the second image as "what would I add
    # next / what are the live alternatives" instead of "what are
    # the rarely-played techs" — which is what the user actually
    # wants to see when scouting a meta-call. Ace-spec alternatives
    # fall out naturally because non-stock Ace Specs still rank by
    # inclusion among "tried it" lists.
    not_added_rows.sort(key=lambda r: -_parse_eu(r.get('percentage_in_archetype')))
    tech: list[dict] = []
    for r in not_added_rows:
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


def _read_major_matchups(site_dir: str, format_key: str) -> dict[str, dict[str, dict]]:
    """Aggregate the master labs CSV (all metas) into a per-pair WR map
    for ONE rotation.

    The master file is data/labs_tournament_matchups.csv — same file
    Meta Call reads (js/app-meta-call.js:3342). Each row carries a
    `meta` column (e.g. 'TEF-CRI'); rows from other rotations are
    skipped so the Lucario-vs-Dragapult rate from a SVI-JTG event
    doesn't bleed into the current format.

    Returns: {deck_name: {opponent_name: {'games': N, 'win_pct': X}}}
    where win_pct is the games-weighted mean across all rows that match
    (meta, my_deck_name, opponent_deck_name). The same shape is used
    later by the blend step's reverse lookup.
    """
    path = os.path.join(site_dir, 'data', 'labs_tournament_matchups.csv')
    if not os.path.exists(path):
        print(f'warn: {path} missing — no major-tournament blend', file=sys.stderr)
        return {}
    target_meta = format_key.strip().upper()
    agg: dict[str, dict[str, dict]] = {}
    rows_consumed = 0
    try:
        with open(path, encoding='utf-8-sig') as f:
            for row in csv.DictReader(f):
                if (row.get('day_filter') or 'overall').strip().lower() != 'overall':
                    continue
                meta = (row.get('meta') or '').strip().upper()
                if meta != target_meta:
                    continue
                deck = (row.get('my_deck_name') or '').strip()
                opp  = (row.get('opponent_deck_name') or '').strip()
                if not deck or not opp:
                    continue
                try:
                    games = int(row.get('vs_count') or 0)
                except (ValueError, TypeError):
                    continue
                if games <= 0:
                    continue
                try:
                    wp = float(str(row.get('vs_win_pct') or '0').replace(',', '.'))
                except (ValueError, TypeError):
                    continue
                bucket = agg.setdefault(deck, {}).setdefault(opp, {'games': 0, 'weighted_sum': 0.0})
                bucket['games'] += games
                bucket['weighted_sum'] += games * wp
                rows_consumed += 1
    except Exception as exc:  # pragma: no cover — diagnostics only
        print(f'warn: major matchup parse failed: {exc}', file=sys.stderr)
        return {}

    out: dict[str, dict[str, dict]] = {}
    pair_count = 0
    for deck in agg:
        out[deck] = {}
        for opp in agg[deck]:
            a = agg[deck][opp]
            out[deck][opp] = {
                'games': a['games'],
                'win_pct': a['weighted_sum'] / a['games'],
            }
            pair_count += 1
    print(f'  labs blend:    {rows_consumed} rows ({pair_count} pairs) for meta={target_meta}')
    return out


def _blend_matchups_with_majors(
    limitless_mu: dict[str, list[dict]],
    major_mu:     dict[str, dict[str, dict]],
) -> dict[str, list[dict]]:
    """Mutate-in-place blend of Limitless online matchups with the labs
    major matchups, mirroring Meta Call's getBaseMatchup logic.

    For each (deck, opponent) entry we already have from Limitless:
      • Look up the same pair in the major map (forward + reverse).
      • When the pair carries ≥MAJOR_MATCHUP_MIN_GAMES samples in labs,
        replace the win_pct with the weighted average
        (major × W + online × 1) / (W + 1), W = MAJOR_MATCHUP_WEIGHT.
      • Bump the displayed sample size to online + labs games so the
        sort order surfaces the most-evidenced matchups first.

    Pairs that exist only in labs (not in Limitless) are intentionally
    skipped: the Limitless universe defines which opponents are even
    listed, matching the website's panel which iterates Limitless rows.
    """
    blended_pairs = 0
    for deck, rows in limitless_mu.items():
        deck_majors = major_mu.get(deck, {})
        for entry in rows:
            opp = entry['opponent']
            major = deck_majors.get(opp)
            if not major or major['games'] < MAJOR_MATCHUP_MIN_GAMES:
                # Reverse lookup — if labs has only opponent-vs-deck,
                # invert it (their win % becomes our loss %).
                rev = major_mu.get(opp, {}).get(deck)
                if rev and rev['games'] >= MAJOR_MATCHUP_MIN_GAMES:
                    major = {'games': rev['games'], 'win_pct': 100.0 - rev['win_pct']}
                else:
                    major = None
            if not major:
                continue
            online_wr = entry['win_pct']
            blended = (
                major['win_pct'] * MAJOR_MATCHUP_WEIGHT + online_wr
            ) / (MAJOR_MATCHUP_WEIGHT + 1.0)
            entry['win_pct'] = round(blended, 1)
            entry['games']   = entry['games'] + major['games']
            entry['blended'] = True
            blended_pairs += 1
    print(f'  labs blend:    {blended_pairs} matchup pairs blended ({MAJOR_MATCHUP_WEIGHT:.0f}:1 labs:online, min {MAJOR_MATCHUP_MIN_GAMES} labs games)')
    return limitless_mu


def _read_limitless_matchups(site_dir: str) -> dict[str, list[dict]]:
    """Read limitless_online_decks_matchups.csv → {archetype: [matchups]}.

    This is the *current-meta* matchup source — same CSV the website's
    "Matchups vs Meta Call" panel (js/app-current-meta-analysis.js)
    reads, and the same one Meta Call uses as its base matchup map
    (js/app-meta-call.js). Pointing the bot at it keeps numbers
    consistent across all three surfaces: Limitless profile, website
    panel, Telegram matchup matrix.

    Schema (semicolon-delimited, EU decimal):
        deck_name;opponent;win_rate;record;total_games

    win_rate is a percentage string like "49,3"; record is "W - L - T";
    total_games is the int sample size. We trust total_games over the
    parsed-record sum because it matches Limitless's own display.
    """
    path = os.path.join(site_dir, 'data', 'limitless_online_decks_matchups.csv')
    out: dict[str, list[dict]] = defaultdict(list)
    if not os.path.exists(path):
        print(f'warn: {path} missing — no current-meta matchups', file=sys.stderr)
        return out
    try:
        with open(path, encoding='utf-8-sig') as f:
            for row in csv.DictReader(f, delimiter=';'):
                deck = (row.get('deck_name') or '').strip()
                opp  = (row.get('opponent') or '').strip()
                if not deck or not opp:
                    continue
                try:
                    games = int((row.get('total_games') or '0').strip())
                except (ValueError, TypeError):
                    continue
                if games < MIN_MATCHUP_GAMES:
                    continue
                wr_raw = (row.get('win_rate') or '0').replace(',', '.').replace('%', '').strip()
                try:
                    win_pct = float(wr_raw)
                except (ValueError, TypeError):
                    win_pct = 0.0
                out[deck].append({
                    'opponent': opp,
                    'games': games,
                    'win_pct': round(win_pct, 1),
                })
    except Exception as exc:  # pragma: no cover — diagnostics only
        print(f'warn: limitless matchup parse failed: {exc}', file=sys.stderr)
        return defaultdict(list)

    for arch in out:
        out[arch].sort(key=lambda m: -m['games'])
        del out[arch][MAX_MATCHUPS:]
    return out


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


def _fix_mojibake(s: str) -> str:
    """Repair Latin-1-decoded-as-UTF-8 mojibake. No-op when clean.

    Mirror of backend/core/card_scraper_shared.fix_mojibake without
    the import dependency — this script ships standalone in scripts/
    and we don't want to pull the whole backend module in just for
    one helper.

    Cheap fast-path: if the string doesn't contain 'Ã' or 'Â' (the
    two telltale bytes that always appear when Latin-1 multi-byte
    UTF-8 is double-decoded), it's clean and we return it unchanged.
    """
    if not s or ('Ã' not in s and 'Â' not in s):
        return s
    try:
        return s.encode('latin-1').decode('utf-8')
    except (UnicodeEncodeError, UnicodeDecodeError):
        return s


def _dedup_rows_by_identifier(rows: list[dict]) -> list[dict]:
    """Collapse rows with the same card_identifier within one
    archetype, summing the count columns and keeping the
    cleanest-encoded card_name.

    The current_meta scraper writes two rows for some cards (one per
    format variant — Meta Live vs Meta Play!), and the historical
    encoding bug above produced different name strings for the same
    POR 81 card. Without dedup, _build_deck() treats them as separate
    cards and emits both lines into the user-facing deck list
    (2026-06-09: 'Poké Pad' AND 'PokÃ© Pad' shown side by side).

    Sum-aggregate the inclusion stats per card so the downstream
    sort_by(percentage_in_archetype) still ranks the card correctly.
    """
    by_id: dict[str, dict] = {}
    for r in rows:
        ident = (r.get('card_identifier') or '').strip()
        if not ident:
            # No identifier → can't dedup; pass through unchanged so
            # we don't accidentally lose data.
            by_id[f'__noid__{len(by_id)}'] = dict(r)
            continue
        if ident not in by_id:
            by_id[ident] = dict(r)
            continue
        # Existing entry — merge counts, prefer the cleaner card_name.
        existing = by_id[ident]
        # Sum the count columns (total_count, deck_inclusion_count).
        for col in ('total_count', 'deck_inclusion_count'):
            try:
                existing[col] = str(
                    int(_parse_eu(existing.get(col, 0))) +
                    int(_parse_eu(r.get(col, 0)))
                )
            except (TypeError, ValueError):
                pass
        # average_count: weight by deck_inclusion_count so the merged
        # average reflects actual usage (= total_count / sum-of-incl).
        try:
            tot = int(_parse_eu(existing.get('total_count', 0)))
            inc = int(_parse_eu(existing.get('deck_inclusion_count', 0)))
            if inc > 0:
                existing['average_count'] = str(round(tot / inc, 2)).replace('.', ',')
        except (TypeError, ValueError):
            pass
        # Recompute percentage_in_archetype against the SUMMED total.
        # Meta Live and Meta Play! feed different scrape pools (ladder
        # vs tournament builds) — treating them as separate deck
        # populations and summing gives an accurate cross-pool
        # inclusion rate. Initial implementation used max() which gave
        # inclusion_pct = 190 % for cards that appeared in both pools
        # (2026-06-09 user report after first dedup landed).
        try:
            # Sum totals across the merged rows. We seed `existing` with
            # the first row's total on insert, so each merge step adds
            # exactly the new row's total once.
            new_total = int(_parse_eu(r.get('total_decks_in_archetype', 0)))
            cur_total = int(_parse_eu(existing.get('total_decks_in_archetype', 0)))
            t_use = cur_total + new_total
            inc   = int(_parse_eu(existing.get('deck_inclusion_count', 0)))
            if t_use > 0 and inc > 0:
                existing['total_decks_in_archetype'] = str(t_use)
                pct = min(inc / t_use * 100, 100.0)  # cap at 100, just in case
                existing['percentage_in_archetype']  = str(round(pct, 2)).replace('.', ',')
        except (TypeError, ValueError):
            pass
        # Prefer the cleaner card_name (no 'Ã' / 'Â' mojibake).
        cur_name = existing.get('card_name', '') or ''
        new_name = r.get('card_name', '') or ''
        cur_clean = ('Ã' not in cur_name) and ('Â' not in cur_name)
        new_clean = ('Ã' not in new_name) and ('Â' not in new_name)
        if new_clean and not cur_clean and new_name:
            existing['card_name'] = new_name
    return list(by_id.values())


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
            # Repair Latin-1-decoded-as-UTF-8 mojibake on the name
            # field so 'PokÃ© Pad' becomes 'Poké Pad'. This is the
            # same fix the backend's card_scraper_shared.fix_mojibake
            # applies — duplicated here so this standalone script
            # doesn't have to import the whole backend module.
            row['card_name'] = _fix_mojibake(row.get('card_name') or '')
            grouped[arch].append(row)
        # Per-archetype dedup by card_identifier. The Meta Live /
        # Meta Play! formats both feed into current_meta_card_data.csv,
        # and the encoding pipeline produced both 'Poké Pad' (UTF-8)
        # and 'PokÃ© Pad' (mojibake) rows for the same POR 81 card.
        # Without dedup, _build_deck emitted both as separate cards in
        # the user's deck list (2026-06-09 report). Mojibake-fix
        # above + dedup-by-identifier below catches both the wide
        # case (different names, same id) and the narrow case (same
        # card scraped twice via different paths).
        for arch in list(grouped.keys()):
            grouped[arch] = _dedup_rows_by_identifier(grouped[arch])

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
                # Repair Latin-1-decoded-as-UTF-8 mojibake on the name
                # ('PokÃ© Pad' → 'Poké Pad'). Defensive — current-meta
                # had it (see _build_current_meta dedup path) and
                # tournament_cards_data_*.csv could grow it under
                # future scraper changes.
                'card_name': _fix_mojibake(r.get('card_name') or ''),
                'card_identifier': card_id,
                'set_code': r.get('set_code') or '',
                'set_number': r.get('set_number') or '',
                'type': r.get('type') or '',
                'is_ace_spec': r.get('is_ace_spec') or 'No',
                'image_url': r.get('image_url') or '',
                '_total_count': 0,
                '_inclusion_count': 0,
            }
        else:
            # Subsequent rows can replace a mojibake'd name with a
            # clean one if the same card_identifier shows up clean
            # later in the iteration order.
            cur_name = slot.get('card_name', '') or ''
            new_name = _fix_mojibake(r.get('card_name') or '')
            cur_dirty = ('Ã' in cur_name) or ('Â' in cur_name)
            if cur_dirty and new_name and not (('Ã' in new_name) or ('Â' in new_name)):
                slot['card_name'] = new_name
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

    # Current-meta matchups follow Meta Call's getBaseMatchup logic
    # exactly: Limitless online is the base layer (one row per pair),
    # the master labs CSV filtered to the active rotation blends in
    # 3:1 (75 % labs / 25 % online) for any pair with ≥10 labs games.
    # The same constants drive Meta Call (MAJOR_MATCHUP_WEIGHT /
    # MAJOR_MATCHUP_MIN_GAMES in js/app-meta-call.js), so the bot's
    # numbers stay in lock-step with the predictor's internal map.
    # Past-meta stays on the per-format labs split — the website's
    # past-meta tab uses the same per-format files.
    current_matchups = _read_limitless_matchups(site_dir)
    major_matchups   = _read_major_matchups(site_dir, format_key)
    current_matchups = _blend_matchups_with_majors(current_matchups, major_matchups)
    past_matchups    = _read_matchups(site_dir, PAST_META_FORMAT_KEY)
    print(f'  matchups:      {len(current_matchups)} current (limitless+labs blend) / {len(past_matchups)} past (labs)')

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
