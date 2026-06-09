#!/usr/bin/env python3
"""Per-Decklist Scraper.

Reads each tournament on limitlesstcg.com, walks the standings table
ROW BY ROW (not just the aggregated /decks/list/<id> link collection
the old JH scraper uses), and writes ONE CSV row per
(tournament × player × card) — preserving per-decklist resolution
that the existing pipeline aggregates away.

Why this exists:
  - The current pipeline aggregates card stats per archetype-per-
    tournament: 21 Slowking decklists at Turin collapse to a single
    "Slowking @ Turin" stats row. The deckbuilder's Most-Consistency
    output, the Past-Meta "best successful list" display, and the
    user's "weight 2nd-place > 100th-place" spec all need
    per-decklist resolution. Without it, the algorithm has to guess.

What's preserved:
  - tournament_id (labs 4-digit canonical, joins with
    labs_tournament_decks.csv + player_continuity.csv)
  - place (per row)
  - player_name (per row)
  - deck_archetype + deck_slug (canonical labels)
  - record (W-L-T per row)
  - per-card count IN THIS SPECIFIC LIST

Output: data/tournament_decklists_per_player.csv
Schema (header row):
  tournament_id, tournament_name, tournament_date, meta,
  place, player_name, deck_archetype, deck_slug,
  wins, losses, ties,
  card_name, card_identifier, set_code, set_number,
  count, type, is_ace_spec, scraped_at

Usage:
  python backend/scrapers/per_decklist_scraper.py
  python backend/scrapers/per_decklist_scraper.py --tournament-url <url>
  python backend/scrapers/per_decklist_scraper.py --from-tournament-id 530
  python backend/scrapers/per_decklist_scraper.py --resume   # skip tids
                                                              # already in
                                                              # the output

Network notes:
  - One fetch per tournament page (?show=2000 to skip pagination).
  - One fetch per UNIQUE decklist URL (multiple players sharing an
    identical list resolve to the same /decks/list/<id> and we cache
    the deck so we only pay for the fetch once).
  - Cloudscraper handles Cloudflare. Default 1.0 s delay between
    requests is a polite citizen rate.
"""

import argparse
import csv
import json
import logging
import os
import re
import sys
import time
from collections import OrderedDict
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.normpath(os.path.join(_SCRIPT_DIR, '..', '..'))
_CORE_DIR = os.path.join(_SCRIPT_DIR, '..', 'core')
if _CORE_DIR not in sys.path:
    sys.path.insert(0, _CORE_DIR)
if _SCRIPT_DIR not in sys.path:
    sys.path.insert(0, _SCRIPT_DIR)

from card_scraper_shared import (
    setup_console_encoding,
    fetch_page_bs4,
    setup_logging,
    get_data_dir,
    fix_mojibake,
    CardDatabaseLookup,
    extract_cards_from_decklist_soup,
)

# Reuse the JH scraper's name → labs-tid resolver + format/meta derivation
# so per-decklist rows carry the same canonical labels as the existing
# aggregated pipeline. No code duplication, no drift risk.
from tournament_scraper_JH import (
    get_tournament_info,
    _resolve_labs_tournament_id,
    _parse_iso_date,
    _derive_meta_from_date_JH,
    _clean_deck_name,
    normalize_tournament_format,
)

setup_console_encoding()
logger = setup_logging("per_decklist_scraper")

BASE_URL = "https://limitlesstcg.com"
TOURNAMENTS_INDEX_URL = f"{BASE_URL}/tournaments"
DEFAULT_DELAY = 1.0
OUTPUT_FILE = "tournament_decklists_per_player.csv"

# Standings table header synonyms — labs / limitless have used variants
# across versions. Defensive: search the synonym list against each
# header text, take the first match.
_HEADER_SYNONYMS = {
    'place':    ['place', 'rank', 'pos', 'position', '#'],
    'player':   ['player', 'name', 'username'],
    'country':  ['country', 'cc', 'flag'],
    'deck':     ['deck', 'archetype', 'list'],
    'wins':     ['wins', 'w'],
    'losses':   ['losses', 'l'],
    'ties':     ['ties', 't', 'draws', 'd'],
    'record':   ['record', 'w-l-t', 'record (w-l-t)'],
}


def _find_col(headers_lc: List[str], key: str) -> Optional[int]:
    """Discover a column index by trying any synonym for `key`."""
    syns = _HEADER_SYNONYMS.get(key, [key])
    for syn in syns:
        for i, h in enumerate(headers_lc):
            h_clean = h.strip(' #').strip()
            if h_clean == syn:
                return i
    return None


def _parse_record(text: str) -> Tuple[int, int, int]:
    """'7-2-0' / '7 - 2 - 0' → (7, 2, 0). '7-2' → (7, 2, 0). Empty → (0,0,0)."""
    if not text:
        return (0, 0, 0)
    m = re.match(r'(\d+)\s*-\s*(\d+)(?:\s*-\s*(\d+))?', text.strip())
    if not m:
        return (0, 0, 0)
    return (int(m.group(1)), int(m.group(2)), int(m.group(3) or 0))


def parse_standings_rows(tournament_url: str) -> List[Dict]:
    """Walk the tournament standings table on limitlesstcg.com and
    return one dict per row: { place, player_name, deck_id, deck_name,
    wins, losses, ties }.

    Multiple players can map to the same deck_id when they ran
    identical lists — caller deduplicates the deck fetch via cache.

    Defensive: header columns are discovered by text, not index. If
    the deck-link column is missing on a row (rare), that row is
    skipped with a warning so a single malformed row doesn't kill the
    whole tournament."""
    fetch_url = f"{tournament_url.rstrip('/')}?show=2000"
    logger.info("  Fetching standings: %s", fetch_url)
    soup = fetch_page_bs4(fetch_url)
    if not soup:
        logger.warning("    Standings fetch failed")
        return []

    # The tournament page typically has multiple tables; the standings
    # table is the one with /decks/list/ links in body rows. Iterate
    # candidates to find it.
    standings_table = None
    for table in soup.select('table'):
        if table.find('a', href=re.compile(r'^/decks/list/')):
            standings_table = table
            break
    if not standings_table:
        logger.warning("    No standings table with /decks/list/ links")
        return []

    header_cells = standings_table.select('thead th') or standings_table.select('tr:first-child th')
    headers_lc = [th.get_text(strip=True).lower() for th in header_cells]
    if not headers_lc:
        logger.warning("    Standings table has no <th> headers — schema unknown")
        return []

    col_place   = _find_col(headers_lc, 'place')
    col_player  = _find_col(headers_lc, 'player')
    col_record  = _find_col(headers_lc, 'record')
    col_wins    = _find_col(headers_lc, 'wins')
    col_losses  = _find_col(headers_lc, 'losses')
    col_ties    = _find_col(headers_lc, 'ties')
    col_deck    = _find_col(headers_lc, 'deck')

    if col_place is None:
        col_place = 0  # standings tables put the # column first

    rows_out: List[Dict] = []
    for tr in standings_table.select('tbody tr') or standings_table.select('tr'):
        cells = tr.find_all('td')
        if not cells or len(cells) <= col_place:
            continue

        place_text = cells[col_place].get_text(strip=True)
        m = re.match(r'\d+', place_text)
        if not m:
            continue
        place = int(m.group())

        player_name = ''
        if col_player is not None and col_player < len(cells):
            player_name = fix_mojibake(cells[col_player].get_text(strip=True))

        # Decklist link can be in any cell; look for /decks/list/<id>
        deck_link = None
        for c in cells:
            a = c.find('a', href=re.compile(r'^/decks/list/'))
            if a:
                deck_link = a
                break
        if not deck_link:
            # Player dropped / didn't share a list — happens at the
            # tail of the standings. Skip without warning (expected).
            continue
        deck_id = deck_link['href'].rsplit('/', 1)[-1]
        deck_name_raw = deck_link.get_text(strip=True) or ''
        deck_name = _clean_deck_name(deck_name_raw)

        wins = losses = ties = 0
        if col_record is not None and col_record < len(cells):
            wins, losses, ties = _parse_record(cells[col_record].get_text(strip=True))
        else:
            if col_wins is not None and col_wins < len(cells):
                wins, _, _ = _parse_record(cells[col_wins].get_text(strip=True))
            if col_losses is not None and col_losses < len(cells):
                _, losses, _ = _parse_record(cells[col_losses].get_text(strip=True))
            if col_ties is not None and col_ties < len(cells):
                _, _, ties = _parse_record(cells[col_ties].get_text(strip=True))

        rows_out.append({
            'place':       place,
            'player_name': player_name,
            'deck_id':     deck_id,
            'deck_name':   deck_name,
            'deck_url':    f"{BASE_URL}/decks/list/{deck_id}",
            'wins':        wins,
            'losses':      losses,
            'ties':        ties,
        })

    logger.info("    → %d standings rows captured", len(rows_out))
    return rows_out


def fetch_decklist_cards_and_title(deck_url: str, card_db: CardDatabaseLookup) -> Tuple[List[Dict], str]:
    """Fetch /decks/list/<id> and return (cards, deck_title).

    cards: list of { card_name, set_code, set_number, count, type,
    is_ace_spec } via the existing shared extractor. Returns ([], '')
    on fetch failure.

    deck_title: the archetype label scraped from the page's
    .decklist-title element — the SAME source the JH aggregator uses,
    so labels stay canonical across pipelines. The standings-table
    link text doesn't carry the archetype name (just "View" or blank),
    which is why the first 2026-06-09 backfill produced 78k rows with
    deck_archetype = '' everywhere."""
    soup = fetch_page_bs4(deck_url)
    if not soup:
        logger.warning("    Decklist fetch failed: %s", deck_url)
        return ([], '')
    title_elem = soup.select_one('.decklist-title')
    raw_title = title_elem.get_text(strip=True) if title_elem else ''
    title = _clean_deck_name(raw_title) if raw_title else ''
    return (extract_cards_from_decklist_soup(soup, card_db), title)


def load_tournament_index_from_jh_state() -> List[Dict]:
    """Read tournament_jh_scraped.json + tournament_jh_settings.json
    to reconstruct the set of tournaments the JH scraper has seen.
    Returns a list of { id, url } records that mirrors what the JH
    scraper iterates."""
    data_dir = get_data_dir()
    path = os.path.join(data_dir, 'tournament_jh_scraped.json')
    if not os.path.exists(path):
        return []
    try:
        with open(path, encoding='utf-8') as f:
            blob = json.load(f)
    except Exception as e:
        logger.error("Failed to parse %s: %s", path, e)
        return []
    ids = blob.get('scraped_tournament_ids', [])
    if not isinstance(ids, list):
        return []
    return [
        {'id': str(t).strip(), 'url': f"{BASE_URL}/tournaments/{t}"}
        for t in ids if str(t).strip().isdigit()
    ]


def load_tournament_metadata_lookup() -> Dict[str, Dict]:
    """Build { limitless_tid: {date_iso, meta} } from
    tournament_cards_data_overview.csv so we can pre-filter
    tournaments by date / meta WITHOUT having to fetch each one's
    page first. The overview file is written by the JH scraper —
    every tournament the index walked is in there with its
    canonicalised metadata.

    Returns {} when the overview file is missing — caller treats
    that as "no metadata, can't pre-filter, fetch all"."""
    data_dir = get_data_dir()
    path = os.path.join(data_dir, 'tournament_cards_data_overview.csv')
    if not os.path.exists(path):
        return {}
    # English-ordinal date parser — same shape as the JH scraper helper
    import re as _re
    months = {'january':1,'february':2,'march':3,'april':4,'may':5,'june':6,
              'july':7,'august':8,'september':9,'october':10,'november':11,'december':12}
    def parse_eng_ord(s: str) -> str:
        if not s:
            return ''
        m = _re.match(r'(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)\s+(\d{4})', s.strip())
        if not m:
            return ''
        mn = m.group(2).lower()
        if mn not in months:
            return ''
        try:
            d = datetime(int(m.group(3)), months[mn], int(m.group(1)))
            return d.strftime('%Y-%m-%d')
        except ValueError:
            return ''
    out: Dict[str, Dict] = {}
    # The overview CSV uses ';' separator (JH legacy)
    try:
        with open(path, encoding='utf-8-sig') as f:
            reader = csv.DictReader(f, delimiter=';')
            for r in reader:
                tid = (r.get('tournament_id') or '').strip()
                if not tid:
                    continue
                out[tid] = {
                    'date_iso': parse_eng_ord(r.get('tournament_date', '')),
                    'meta':     (r.get('format') or '').strip(),
                    'name':     (r.get('tournament_name') or '').strip(),
                    'players':  (r.get('players') or '').strip(),
                }
    except Exception as e:
        logger.warning("Could not parse overview CSV: %s", e)
        return {}
    return out


def load_existing_output(out_path: str) -> set:
    """Return set of limitless tournament IDs already in the output.
    We key on the limitless ID (not labs) because that's what we
    iterate. --resume skips these."""
    seen = set()
    if not os.path.exists(out_path):
        return seen
    try:
        with open(out_path, encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for r in reader:
                lid = r.get('limitless_tournament_id', '').strip()
                if lid:
                    seen.add(lid)
    except Exception as e:
        logger.warning("Could not parse existing output: %s", e)
    return seen


CSV_FIELDS = [
    'tournament_id',          # labs canonical (4-digit), '' if unmapped
    'limitless_tournament_id',  # 3-digit limitless internal
    'tournament_name',
    'tournament_date',        # ISO YYYY-MM-DD
    'meta',                   # e.g. TEF-CRI
    'place',
    'player_name',
    'deck_archetype',
    'deck_slug',              # the deck_id from /decks/list/<id>
    'wins',
    'losses',
    'ties',
    'card_name',
    'card_identifier',
    'set_code',
    'set_number',
    'count',
    'type',
    'is_ace_spec',
    'scraped_at',
]


def write_rows(rows: List[Dict], out_path: str, append: bool = True) -> None:
    """Append rows to the output CSV. Header written when file is new
    or when append=False."""
    write_header = (not append) or (not os.path.exists(out_path))
    mode = 'a' if append and os.path.exists(out_path) else 'w'
    with open(out_path, mode, newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        if write_header:
            writer.writeheader()
        for r in rows:
            # Restrict to known fields (writer would raise on extras)
            writer.writerow({k: r.get(k, '') for k in CSV_FIELDS})


def scrape_one_tournament(
    tournament: Dict,
    card_db: CardDatabaseLookup,
    delay: float = DEFAULT_DELAY,
) -> List[Dict]:
    """Scrape one tournament end-to-end and return the rows. Top-level
    flow:

      1. Fetch tournament metadata (name, date, format) via the
         existing JH helper.
      2. Walk standings rows.
      3. For each unique deck_id, fetch /decks/list/<id> ONCE
         (multiple players sharing an identical list reuse the
         cached card lookup).
      4. Emit one row per (player × card).
    """
    tid_lim = tournament['id']
    t_url = tournament['url']
    logger.info("Tournament %s — %s", tid_lim, t_url)

    info = get_tournament_info(t_url)
    t_name = info.get('name', '') or ''
    t_date_raw = info.get('date', '') or ''
    t_date_iso = _parse_iso_date(t_date_raw)

    # Meta: prefer the scraped format, fall back to date-based JH helper
    api_format = info.get('format') or ''
    if not api_format:
        api_format = _derive_meta_from_date_JH(t_date_iso or t_date_raw)
    meta = normalize_tournament_format(api_format) if api_format else ''

    # Resolve labs-canonical 4-digit tid (matches labs_tournament_decks
    # + player_continuity). Empty string when no mapping known.
    labs_tid = _resolve_labs_tournament_id(t_name, t_date_iso, tid_lim)

    rows_std = parse_standings_rows(t_url)
    if not rows_std:
        logger.info("  No standings rows for %s — skipping", tid_lim)
        return []

    # Group rows by deck_id so we fetch each unique decklist once
    by_deck_id: "OrderedDict[str, List[Dict]]" = OrderedDict()
    for r in rows_std:
        by_deck_id.setdefault(r['deck_id'], []).append(r)

    scraped_at = datetime.now(timezone.utc).isoformat()
    out_rows: List[Dict] = []
    for deck_id, players in by_deck_id.items():
        time.sleep(delay)
        cards, deck_title_from_page = fetch_decklist_cards_and_title(
            players[0]['deck_url'], card_db)
        if not cards:
            logger.warning("  Empty card list for deck_id=%s (%d players affected)",
                           deck_id, len(players))
            continue
        # The page-derived title is the canonical archetype label
        # (matches JH aggregator's .decklist-title source). Fall back
        # to the standings-table cell text only if the page didn't
        # supply a title — that text is usually "View" / blank but
        # better than nothing.
        archetype_label = deck_title_from_page or players[0].get('deck_name', '')
        for p in players:
            for c in cards:
                card_name = c.get('name', '') or c.get('card_name', '')
                set_code = c.get('set_code', '')
                set_number = c.get('card_number', '') or c.get('set_number', '')
                identifier = f"{set_code} {set_number}".strip()
                out_rows.append({
                    'tournament_id':             labs_tid,
                    'limitless_tournament_id':   tid_lim,
                    'tournament_name':           t_name,
                    'tournament_date':           t_date_iso,
                    'meta':                      meta,
                    'place':                     p['place'],
                    'player_name':               p['player_name'],
                    'deck_archetype':            archetype_label,
                    'deck_slug':                 deck_id,
                    'wins':                      p['wins'],
                    'losses':                    p['losses'],
                    'ties':                      p['ties'],
                    'card_name':                 card_name,
                    'card_identifier':           identifier,
                    'set_code':                  set_code,
                    'set_number':                set_number,
                    'count':                     c.get('count', 0),
                    'type':                      c.get('type', '') or c.get('card_type', ''),
                    'is_ace_spec':               'Yes' if c.get('is_ace_spec') else 'No',
                    'scraped_at':                scraped_at,
                })

    logger.info("  → %d per-(player × card) rows for tournament %s",
                len(out_rows), tid_lim)
    return out_rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--tournament-url', type=str,
                    help='Scrape a single tournament URL (skips index walk).')
    ap.add_argument('--tournament-id', type=str,
                    help='Limitless 3-digit tournament ID (alternative to --tournament-url).')
    ap.add_argument('--from-tournament-id', type=int, default=0,
                    help='Skip tournaments with limitless ID below this threshold.')
    ap.add_argument('--from-date', type=str, default='auto',
                    help='Skip tournaments dated before YYYY-MM-DD. Read from '
                         'tournament_cards_data_overview.csv — pre-filters BEFORE '
                         'any network fetch. Default "auto" reads '
                         'in_person_legal_date from data/format_window.json so '
                         'the scraper only pulls current-format tournaments '
                         '(no stale rotation data piles up). Pass an explicit '
                         'date (e.g. 2026-04-01) to backfill broader windows; '
                         'pass "" to disable the date filter entirely.')
    ap.add_argument('--meta', type=str, default='',
                    help='Comma-separated list of meta codes to scrape '
                         '(e.g. TEF-POR,TEF-CRI). Pre-filters via overview CSV.')
    ap.add_argument('--resume', action='store_true',
                    help='Skip tournaments already in the output CSV.')
    ap.add_argument('--delay', type=float, default=DEFAULT_DELAY,
                    help='Seconds between fetches.')
    ap.add_argument('--max-tournaments', type=int, default=0,
                    help='Stop after this many tournaments (0 = unlimited).')
    ap.add_argument('--output', default=OUTPUT_FILE,
                    help='Output CSV filename (relative to data_dir).')
    args = ap.parse_args()

    data_dir = get_data_dir()
    out_path = os.path.join(data_dir, args.output)

    try:
        card_db = CardDatabaseLookup()
    except Exception as e:
        logger.error("Card DB load failed: %s", e)
        return 1

    # Build the work list
    if args.tournament_url:
        # Single-URL mode — extract ID from URL tail
        tid = args.tournament_url.rstrip('/').rsplit('/', 1)[-1]
        work = [{'id': tid, 'url': args.tournament_url}]
    elif args.tournament_id:
        work = [{'id': args.tournament_id,
                 'url': f"{BASE_URL}/tournaments/{args.tournament_id}"}]
    else:
        work = load_tournament_index_from_jh_state()
        if not work:
            logger.error("No tournaments found via JH state. Pass --tournament-url "
                         "or --tournament-id for a single-shot run.")
            return 1

    # Apply pre-filters in order: --from-tournament-id, --from-date, --meta.
    # Date + meta read tournament_cards_data_overview.csv so we DON'T have
    # to fetch each tournament page just to discard it — the 109-tournament
    # backfill on 2026-06-09 hit the 90-min timeout precisely because every
    # tournament's standings page had to be fetched even when we wanted only
    # ~11 of them. With --from-date the discard is free.
    if args.from_tournament_id:
        before = len(work)
        work = [w for w in work if int(w['id']) >= args.from_tournament_id]
        logger.info("--from-tournament-id %d: %d → %d tournaments",
                    args.from_tournament_id, before, len(work))

    # Resolve "auto" sentinel from format_window.json — keeps the
    # scrape window pinned to the current format so old rotation
    # data (TEF-POR, SVI-ASC etc.) doesn't pile up in the output
    # after a format change. The maintainer can still pass an
    # explicit --from-date for backfills, or "" to skip the filter.
    if args.from_date == 'auto':
        fw_path = os.path.join(data_dir, 'format_window.json')
        if os.path.exists(fw_path):
            try:
                with open(fw_path, encoding='utf-8') as f:
                    fw = json.load(f)
                legal = (fw.get('in_person_legal_date') or '').strip()
                if legal:
                    args.from_date = legal
                    logger.info("--from-date auto → %s (in_person_legal_date "
                                "from format_window.json, current format: %s-%s)",
                                legal,
                                (fw.get('oldest_legal_set') or '').strip().upper(),
                                (fw.get('current_set') or '').strip().upper())
                else:
                    logger.warning("--from-date auto: format_window.json missing "
                                   "in_person_legal_date — disabling date filter.")
                    args.from_date = ''
            except Exception as e:
                logger.warning("--from-date auto: format_window.json unreadable "
                               "(%s) — disabling date filter.", e)
                args.from_date = ''
        else:
            logger.warning("--from-date auto: format_window.json not found at %s "
                           "— disabling date filter.", fw_path)
            args.from_date = ''

    overview = None
    if args.from_date or args.meta:
        overview = load_tournament_metadata_lookup()
        if not overview:
            logger.warning("Metadata pre-filter requested but overview CSV "
                           "missing/unreadable — falling back to per-fetch filter "
                           "(slower).")

    if args.from_date and overview:
        before = len(work)
        cutoff_iso = args.from_date.strip()
        kept = []
        for w in work:
            d = (overview.get(w['id']) or {}).get('date_iso', '')
            if not d:
                # No date metadata — keep it so we don't accidentally drop
                # tournaments the overview CSV missed (newer tournaments
                # the JH scraper just discovered). Per-fetch filter applies
                # downstream.
                kept.append(w)
                continue
            if d >= cutoff_iso:
                kept.append(w)
        work = kept
        logger.info("--from-date %s: %d → %d tournaments (using overview metadata)",
                    cutoff_iso, before, len(work))

    if args.meta and overview:
        wanted = {m.strip().upper() for m in args.meta.split(',') if m.strip()}
        before = len(work)
        kept = []
        for w in work:
            m = (overview.get(w['id']) or {}).get('meta', '').upper()
            if not m or m in wanted:
                kept.append(w)
        work = kept
        logger.info("--meta %s: %d → %d tournaments",
                    ','.join(sorted(wanted)), before, len(work))

    if args.resume:
        seen = load_existing_output(out_path)
        before = len(work)
        work = [w for w in work if w['id'] not in seen]
        logger.info("--resume: %d / %d tournaments already scraped, %d to fetch",
                    before - len(work), before, len(work))
    if args.max_tournaments:
        work = work[:args.max_tournaments]

    total_rows = 0
    for i, t in enumerate(work, 1):
        logger.info("[%d/%d] tid=%s", i, len(work), t['id'])
        try:
            rows = scrape_one_tournament(t, card_db, args.delay)
        except Exception as e:
            logger.exception("Unexpected failure for tid=%s: %s", t['id'], e)
            continue
        if rows:
            write_rows(rows, out_path, append=True)
            total_rows += len(rows)

    logger.info("Done — %d rows total → %s", total_rows, out_path)
    return 0


if __name__ == '__main__':
    sys.exit(main() or 0)
