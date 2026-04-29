#!/usr/bin/env python3
"""
Limitless Labs Major Tournament Scraper
Scrapes deck share data from labs.limitlesstcg.com for use in the Meta Call feature.

Output files (in project /data/):
  labs_tournaments.json        – index of scraped tournaments with metadata
  labs_tournament_decks.csv   – per-deck data rows across all tournaments

Usage examples:
  # All tournaments:
  python labs_tournament_scraper.py

  # Only from a specific date onwards:
  python labs_tournament_scraper.py --from-date 2025-01-01

  # Only regional + international:
  python labs_tournament_scraper.py --tournament-type regional international

  # Single tournament by ID:
  python labs_tournament_scraper.py --tournament-id 0061

  # Combine filters:
  python labs_tournament_scraper.py --from-date 2025-09-01 --tournament-type regional international worlds
"""

import argparse
import csv
import json
import os
import re
import sys
import time
from datetime import datetime
from typing import Dict, List, Optional, Tuple

# Resolve project root so the scraper can be run from any working directory
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.normpath(os.path.join(_SCRIPT_DIR, '..', '..'))
_CORE_DIR = os.path.join(_SCRIPT_DIR, '..', 'core')
if _CORE_DIR not in sys.path:
    sys.path.insert(0, _CORE_DIR)

from card_scraper_shared import (
    setup_console_encoding,
    fetch_page_bs4,
    setup_logging,
    load_settings,
    get_data_dir,
)

setup_console_encoding()
logger = setup_logging("labs_tournament_scraper")

BASE_URL    = "https://labs.limitlesstcg.com"
DEFAULT_DELAY = 1.5  # seconds between requests

TOURNAMENT_TYPES = {"regional", "international", "special", "worlds"}

DEFAULT_SETTINGS = {
    "from_date": None,
    "tournament_types": None,
    "delay": DEFAULT_DELAY,
    "overwrite": False,
}

def _get_data_dir() -> str:
    try:
        return get_data_dir()
    except Exception:
        return os.path.join(_PROJECT_ROOT, "data")


# ── Date helpers ──────────────────────────────────────────────────────────────

def _parse_date(raw: str) -> Optional[datetime]:
    """Parse date strings like 'April 4–5, 2026', 'April 4, 2026', 'Apr 4 2026'."""
    if not raw:
        return None
    # Strip range suffix: "–5" or "-5"
    # Repair mojibake first so the en-dash matches the range pattern.
    cleaned_input = _fix_mojibake(raw)
    # Strip the second half of a date range. Two flavours occur in the
    # wild on Limitless:
    #   "April 25\u201326, 2026"            (same month \u2014 strip "\u201326")
    #   "February 27\u2013March 1, 2026"    (cross-month \u2014 strip "\u2013March 1")
    # The combined regex tolerates an optional month-name word between
    # the dash and the trailing digits.
    cleaned = re.sub(r'[\u2013\u2014\-]\s*[A-Za-z]*\s*\d+', '', cleaned_input).strip()
    cleaned = ' '.join(cleaned.split())
    for fmt in ('%B %d, %Y', '%b %d, %Y', '%B %d %Y', '%b %d %Y'):
        try:
            return datetime.strptime(cleaned, fmt)
        except ValueError:
            continue
    logger.debug("Could not parse date: %r (cleaned: %r)", raw, cleaned)
    return None


def _fix_mojibake(s: str) -> str:
    """Repair Latin-1-decoded-as-UTF-8 mojibake. No-op when already clean UTF-8.

    Used both for tournament names AND the inline date strings on the labs
    index page \u2014 they come over the wire as UTF-8 but BeautifulSoup feeds
    them back as Latin-1-misdecoded chars when the upstream HTML headers
    omit a charset (which is the labs index's behaviour as of 2026-04).
    """
    if not s:
        return s
    try:
        return s.encode('latin1').decode('utf-8')
    except (UnicodeDecodeError, UnicodeEncodeError):
        return s


# Month-name pattern used to locate the date NavigableString anywhere
# inside a tournament link. Tolerates both full ("April") and 3-letter
# ("Apr") forms; case-insensitive.
_DATE_TEXT_RE = re.compile(
    r'\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|'
    r'Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|'
    r'Dec(?:ember)?)\s+\d',
    re.I,
)


# ── Tournament list ───────────────────────────────────────────────────────────

def _extract_tournament_type(img_src: str) -> str:
    """Derive tournament type from the logo image filename."""
    filename = img_src.rsplit('/', 1)[-1].replace('.png', '').lower()
    return filename if filename in TOURNAMENT_TYPES else 'other'


def scrape_tournament_list(
    from_date: Optional[datetime] = None,
    tournament_types: Optional[List[str]] = None,
) -> List[Dict]:
    """
    Fetch the main labs page and return a list of tournament dicts.
    Applies date and type filters when provided.
    """
    logger.info("Fetching tournament index from %s", BASE_URL)
    soup = fetch_page_bs4(BASE_URL)
    if not soup:
        logger.error("Failed to fetch tournament list – check connectivity")
        return []

    tournaments: List[Dict] = []

    # Every tournament is an <a> linking to /XXXX/standings
    for link in soup.select('a[href]'):
        href = link.get('href', '')
        m = re.match(r'^/(\d+)/standings', href)
        if not m:
            continue
        tournament_id = m.group(1)

        # ── Name ──────────────────────────────────────────────────────────────
        # _fix_mojibake repairs UTF-8 served-as-Latin-1 corruption (e.g.
        # "QuerÃ©taro" → "Querétaro", "GdaÅsk" → "Gdańsk") on the index
        # page so the names downstream don't carry the mojibake all the
        # way into the field-card UI.
        name_el = link.find(attrs={'class': re.compile(r'font-bold')})
        raw_name = name_el.get_text(strip=True) if name_el else f'Tournament {tournament_id}'
        name = _fix_mojibake(raw_name)

        # ── Type logo (larger image) ──────────────────────────────────────────
        tournament_type = 'regional'
        all_imgs = link.find_all('img')
        flag_img = None
        for img in all_imgs:
            src = img.get('src', '')
            if 'tournaments' in src:
                tournament_type = _extract_tournament_type(src)
            if 'flags' in src:
                flag_img = img

        # ── Country code ──────────────────────────────────────────────────────
        country = ''
        if flag_img:
            country = flag_img.get('alt') or flag_img.get('title') or ''

        # ── Date ──────────────────────────────────────────────────────────────
        # Limitless changed the index HTML in 2026-04: the date now lives
        # inside an inner div ("flex gap-2 items-center") wrapped in an
        # outer div ("flex flex-col gap-1") that ALSO has class "flex...gap".
        # The previous selector grabbed the OUTER wrapper which has no
        # NavigableString date children — only nested <div>s. Result:
        # date_text was empty, _parse_date returned None, the date filter
        # short-circuited (None is falsy), and EVERY tournament leaked
        # through the filter.
        #
        # New strategy: walk all NavigableString descendants of the link
        # and grab the first one matching a month-name pattern. Resilient
        # to further HTML restructures as long as the date stays in
        # human-readable "Month D[, Y]" prose.
        from bs4 import NavigableString
        date_text = ''
        for el in link.descendants:
            if isinstance(el, NavigableString):
                txt = str(el).strip()
                if txt and _DATE_TEXT_RE.search(txt):
                    date_text = txt
                    break

        date_obj = _parse_date(date_text)
        date_str = date_obj.strftime('%Y-%m-%d') if date_obj else ''

        # ── Filters ───────────────────────────────────────────────────────────
        # Strict mode when from_date is set: a tournament with no parseable
        # date is excluded. Earlier this was silently let through, which
        # combined with a broken date parser meant the scraper hit every
        # major in the archive instead of just the recent ones. If the
        # parser breaks again, the user sees zero rows + a warning rather
        # than a silent multi-hour scrape.
        if from_date and not date_obj:
            logger.warning("Skip %s (%s) – no parseable date (raw: %r)",
                           name, tournament_id, date_text)
            continue
        if from_date and date_obj and date_obj < from_date:
            logger.debug("Skip %s (%s) – before %s", name, date_str, from_date.date())
            continue

        if tournament_types and tournament_type not in tournament_types:
            logger.debug("Skip %s – type %r not in filter", name, tournament_type)
            continue

        tournaments.append({
            'tournament_id'  : tournament_id,
            'tournament_name': name,
            'tournament_date': date_str,
            'tournament_type': tournament_type,
            'country'        : country,
        })
        logger.info("  [%s] %s – %s (%s, %s)", tournament_id, name, date_str, tournament_type, country)

    logger.info("Tournaments matched: %d", len(tournaments))
    return tournaments


# ── Deck data for one tournament ──────────────────────────────────────────────

def scrape_tournament_meta(tournament_id: str) -> Dict[str, str]:
    """Fetch the tournament's display name + date from its labs page.

    Used in --tournament-id mode where the caller has only the numeric ID
    and not the metadata that scrape_tournament_list() collects from the
    main page. Falls back gracefully (empty strings) when fields can't
    be parsed — the caller's defaults (e.g. "Tournament 0062") then stay.
    """
    url = f"{BASE_URL}/{tournament_id}/decks"
    soup = fetch_page_bs4(url)
    if not soup:
        return {}
    # _fix_mojibake is now a module-level helper (see top of file). The
    # inline duplicate that used to live here was dropped to avoid the
    # two copies drifting out of sync.

    out: Dict[str, str] = {}
    # Title looks like "Decks: Regional Championship Prague – Limitless Labs".
    # Split on "Limitless" so we don't depend on the dash character (which
    # is sometimes mojibake'd to â\x80\x93 by upstream encoding mishaps).
    title_el = soup.find('title')
    if title_el:
        title = title_el.get_text(strip=True)
        if 'Limitless' in title:
            head = title.rsplit('Limitless', 1)[0]
            # Strip trailing dashes, mojibake bytes, whitespace.
            # Trailing dash representations: real en/em dash, ASCII dash,
            # and the mojibake'd UTF-8 bytes (â\x80\x93 or â\x80\x94).
            # Repeating rstrip handles "Prague â\x80\x93 " ending with
            # whitespace + bytes after the strip.
            head = head.rstrip(' \t–—-â\x80\x93\x94')
            head = re.sub(r'\s*[âÂ\x80-\x9f]+\s*$', '', head).strip()
            m = re.match(r'(?:Decks|Standings|Pairings|Metagame):\s*(.+)', head)
            cleaned = (m.group(1).strip() if m else head)
            cleaned = _fix_mojibake(cleaned)
            if cleaned:
                out['tournament_name'] = cleaned
    # H1 wins when present — usually the cleanest representation.
    h1 = soup.find('h1')
    if h1:
        h1_text = h1.get_text(strip=True)
        if h1_text:
            out['tournament_name'] = _fix_mojibake(h1_text)
    # The header strip after the H1 carries the date + player count, e.g.
    # "April 25–26, 2026 • 1370 players". Extract the date portion.
    body_text = soup.get_text(' ', strip=True)[:1500]
    date_match = re.search(
        r'((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d+(?:[–—\-]\d+)?,\s*\d{4})',
        body_text
    )
    if date_match:
        date_obj = _parse_date(date_match.group(1))
        if date_obj:
            out['tournament_date'] = date_obj.strftime('%Y-%m-%d')
    return out


def scrape_tournament_decks(tournament_id: str) -> Tuple[List[Dict], int]:
    """
    Scrape the /decks page for a single tournament, then merge in
    conversion-rate data from /decks?conversion.

    Returns (deck_rows, total_player_count). Each deck dict is augmented
    with `top8_conv_rate`, `top16_conv_rate`, `top32_conv_rate` (0..1
    fractions; missing columns stay 0.0).
    """
    url = f"{BASE_URL}/{tournament_id}/decks"
    logger.info("  Fetching %s", url)
    soup = fetch_page_bs4(url)
    if not soup:
        logger.warning("  Failed to fetch %s", url)
        return [], 0

    table = soup.find('table', attrs={'class': re.compile(r'data-table')})
    if not table:
        logger.warning("  No data-table found for tournament %s", tournament_id)
        return [], 0

    decks: List[Dict] = []
    total_players = 0

    for row in table.select('tbody tr'):
        cells = row.find_all('td')
        if len(cells) < 5:
            continue

        # ── Cell 0: Pokémon images ─────────────────────────────────────────
        pokemon_names = [img.get('alt', '').strip()
                         for img in cells[0].find_all('img', class_='pokemon')]

        # ── Cell 1: Player count (players using this deck) ─────────────────
        count_text = cells[1].get_text(strip=True)
        try:
            player_count = int(count_text)
        except ValueError:
            logger.debug("  Skipping row – non-numeric count: %r", count_text)
            continue

        # ── Cell 2: Deck name + slug ───────────────────────────────────────
        deck_link = cells[2].find('a')
        if not deck_link:
            continue
        deck_name = deck_link.get_text(strip=True)
        deck_href = deck_link.get('href', '')
        deck_slug = deck_href.rsplit('/', 1)[-1]

        # ── Cell 3: Meta share % ───────────────────────────────────────────
        share_text = cells[3].get_text(strip=True).replace('%', '').strip()
        try:
            share_pct = round(float(share_text), 4)
        except ValueError:
            share_pct = 0.0

        # ── Cell 4: W-L-T record ──────────────────────────────────────────
        record_text = cells[4].get_text(strip=True)
        wins = losses = ties = 0
        rm = re.match(r'(\d+)\s*-\s*(\d+)\s*-\s*(\d+)', record_text)
        if rm:
            wins, losses, ties = int(rm.group(1)), int(rm.group(2)), int(rm.group(3))

        # ── Cell 5: Win % ─────────────────────────────────────────────────
        win_pct = 0.0
        if len(cells) > 5:
            wp_text = cells[5].get_text(strip=True).replace('%', '').strip()
            try:
                win_pct = round(float(wp_text), 4)
            except ValueError:
                pass

        total_players += player_count
        decks.append({
            'deck_name'      : deck_name,
            'deck_slug'      : deck_slug,
            'pokemon'        : ', '.join(pokemon_names),
            'player_count'   : player_count,
            'share_pct'      : share_pct,
            'wins'           : wins,
            'losses'         : losses,
            'ties'           : ties,
            'win_pct'        : win_pct,
            'top8_conv_rate' : 0.0,
            'top16_conv_rate': 0.0,
            'top32_conv_rate': 0.0,
            # Day-1 / Day-2 split (populated below from the per-day tabs).
            'day1_players'      : 0,
            'day1_share_pct'    : 0.0,
            'day1_wins'         : 0,
            'day1_losses'       : 0,
            'day1_ties'         : 0,
            'day1_win_pct'      : 0.0,
            'day2_players'      : 0,
            'day2_share_pct'    : 0.0,
            'day2_wins'         : 0,
            'day2_losses'       : 0,
            'day2_ties'         : 0,
            'day2_win_pct'      : 0.0,
            'day1_to_day2_conv' : 0.0,
        })

    # ── Merge in conversion-rate data ────────────────────────────────────
    conv_data = scrape_tournament_conversion(tournament_id)
    if conv_data:
        merged = 0
        for deck in decks:
            slug = deck['deck_slug']
            if slug in conv_data:
                deck.update(conv_data[slug])
                merged += 1
        logger.info("  → conv-rates merged for %d/%d decks", merged, len(decks))

    # ── Merge in Day-1 + Day-2 splits (separate tabs on labs) ────────────
    day1_data = scrape_tournament_day(tournament_id, 'day1')
    if day1_data:
        merged = 0
        for deck in decks:
            slug = deck['deck_slug']
            if slug in day1_data:
                d = day1_data[slug]
                deck['day1_players']   = d.get('player_count', 0)
                deck['day1_share_pct'] = d.get('share_pct', 0.0)
                deck['day1_wins']      = d.get('wins', 0)
                deck['day1_losses']    = d.get('losses', 0)
                deck['day1_ties']      = d.get('ties', 0)
                deck['day1_win_pct']   = d.get('win_pct', 0.0)
                merged += 1
        logger.info("  → Day-1 split merged for %d/%d decks", merged, len(decks))

    day2_data = scrape_tournament_day(tournament_id, 'day2')
    if day2_data:
        merged = 0
        for deck in decks:
            slug = deck['deck_slug']
            if slug in day2_data:
                d = day2_data[slug]
                deck['day2_players']   = d.get('player_count', 0)
                deck['day2_share_pct'] = d.get('share_pct', 0.0)
                deck['day2_wins']      = d.get('wins', 0)
                deck['day2_losses']    = d.get('losses', 0)
                deck['day2_ties']      = d.get('ties', 0)
                deck['day2_win_pct']   = d.get('win_pct', 0.0)
                merged += 1
        logger.info("  → Day-2 split merged for %d/%d decks", merged, len(decks))

    # Compute Day-1 → Day-2 conversion per deck. Conversion comes directly
    # from the labs Conversion tab when scrape_tournament_conversion ran;
    # if that didn't capture it but we have both day counts, derive it.
    for deck in decks:
        if deck['day1_to_day2_conv'] > 0:
            continue  # already captured from the conversion tab
        if deck['day1_players'] > 0 and deck['day2_players'] >= 0:
            deck['day1_to_day2_conv'] = round(deck['day2_players'] / deck['day1_players'], 4)

    logger.info("  → %d decks, %d total players", len(decks), total_players)
    return decks, total_players


# ── Conversion-rate page parser ──────────────────────────────────────────────

# Column-header → output-key mapping. Limitless may use any subset; missing
# columns just stay at 0.0 in the deck dict. Header text is matched
# case-insensitively after stripping % signs and whitespace.
#
# Some columns hold integer player counts (Day 1 / Day 2), others hold
# percentages (Top-X conv rate, Day-1 → Day-2 conversion). The mapping
# value is `(output_key, kind)` where kind is 'pct' (0..1 fraction) or
# 'int' (raw count).
_CONV_HEADER_KEYS = {
    'top 8 conv':   ('top8_conv_rate',     'pct'),
    'top 8 rate':   ('top8_conv_rate',     'pct'),
    'top8 conv':    ('top8_conv_rate',     'pct'),
    'top 16 conv':  ('top16_conv_rate',    'pct'),
    'top 16 rate':  ('top16_conv_rate',    'pct'),
    'top16 conv':   ('top16_conv_rate',    'pct'),
    'top 32 conv':  ('top32_conv_rate',    'pct'),
    'top 32 rate':  ('top32_conv_rate',    'pct'),
    'top32 conv':   ('top32_conv_rate',    'pct'),
    # Day-1 → Day-2 conversion view. The "Conversion" tab on labs
    # exposes Day 1 / Day 2 player counts and the resulting Day-1→Day-2
    # rate as their own columns.
    'day 1':        ('day1_players',       'int'),
    'day1':         ('day1_players',       'int'),
    'day 2':        ('day2_players',       'int'),
    'day2':         ('day2_players',       'int'),
    'conversion':   ('day1_to_day2_conv',  'pct'),
}


def _parse_pct_to_fraction(txt: str) -> float:
    """'15.6%' / '15,6 %' / '0.156' → 0.156 (clipped to 0..1)."""
    if not txt:
        return 0.0
    cleaned = txt.replace('%', '').replace(',', '.').strip()
    try:
        v = float(cleaned)
    except ValueError:
        return 0.0
    # Heuristic: values > 1 are percentage points; convert to fraction.
    if v > 1.0:
        v = v / 100.0
    return max(0.0, min(1.0, round(v, 4)))


def _parse_int_count(txt: str) -> int:
    """'188' / '1,300' / '—' → integer (0 on failure)."""
    if not txt:
        return 0
    cleaned = txt.replace(',', '').replace('.', '').strip()
    if not cleaned or not cleaned.isdigit():
        return 0
    try:
        return int(cleaned)
    except ValueError:
        return 0


def scrape_tournament_conversion(tournament_id: str) -> Dict[str, Dict[str, float]]:
    """
    Fetch labs.limitlesstcg.com/{id}/decks?conversion and return
    { deck_slug: { 'top8_conv_rate': ..., 'day1_players': ..., 'day2_players': ...,
                   'day1_to_day2_conv': ..., ... } }.

    Defensive parser: discovers conversion columns from <th> headers.
    On first run logs the headers it found, so any unexpected column
    naming on a future tournament becomes visible. Returns empty dict
    on failure (caller treats missing data as 0.0).

    Output values are floats for percentages and ints for raw counts —
    the column kind comes from _CONV_HEADER_KEYS.
    """
    url = f"{BASE_URL}/{tournament_id}/decks?conversion"
    logger.info("    Fetching conversion: %s", url)
    soup = fetch_page_bs4(url)
    if not soup:
        logger.warning("    Conversion page fetch failed for %s — skipping", tournament_id)
        return {}

    table = soup.find('table', attrs={'class': re.compile(r'data-table')})
    if not table:
        logger.warning("    No conversion table found for %s", tournament_id)
        return {}

    # Map column index → (output key, kind) based on header text.
    headers_raw = [th.get_text(strip=True) for th in table.select('thead th')]
    logger.info("    Conversion headers: %s", headers_raw)
    col_keys: Dict[int, Tuple[str, str]] = {}
    for i, h in enumerate(headers_raw):
        norm = h.lower().replace('%', '').strip()
        for hint, mapping in _CONV_HEADER_KEYS.items():
            if hint in norm:
                col_keys[i] = mapping
                break

    if not col_keys:
        logger.warning(
            "    No recognised conversion columns in %s — headers were %s. "
            "Add the new header text to _CONV_HEADER_KEYS.", tournament_id, headers_raw
        )
        return {}
    logger.info("    Conversion column mapping: %s", {headers_raw[i]: m for i, m in col_keys.items()})

    out: Dict[str, Dict[str, float]] = {}
    for row in table.select('tbody tr'):
        cells = row.find_all('td')
        if len(cells) < max(col_keys.keys()) + 1:
            continue
        # Find the deck slug — the deck-name cell carries an <a href=".../deck-slug">.
        slug = ''
        for c in cells:
            a = c.find('a', href=True)
            if a and '/' in a['href']:
                slug = a['href'].rsplit('/', 1)[-1]
                if slug:
                    break
        if not slug:
            continue
        entry: Dict[str, float] = {}
        for idx, (key, kind) in col_keys.items():
            txt = cells[idx].get_text(strip=True)
            entry[key] = _parse_int_count(txt) if kind == 'int' else _parse_pct_to_fraction(txt)
        if entry:
            out[slug] = entry

    logger.info("    Conversion: %d decks parsed", len(out))
    return out


# Pre-compiled regex for the embedded deck-data JSON blob. The Day-1/Day-2
# pages render the OVERALL share in the visible table (so HTML-table
# parsing was wrong); the day-specific share + record live in a Vue/Nuxt
# data-blob inside the page where each deck appears as:
#   {"identifier":"...","name":"...","players":N,"day2s":M,"wins":...,
#    "losses":...,"ties":...,"records":"{\"1\":{...},\"2\":{...}}"}
# `players` is the Day-1 player count, `day2s` is the Day-2 player count.
# We match the records-block by spelling out its full nested shape so the
# inner braces don't trip a non-greedy `.*?` (which would stop at the first
# `}` and lose the per-day W-L-T entirely).
# Outer fields use single-level escaping (\"foo\":\"bar\"), but the
# `records` field is itself a JSON-string-inside-JSON-string, so its
# inner quotes are doubly escaped as \\\". Both levels are matched
# explicitly here so we never silently fall back to mangled data.
_DAY_BLOB_PATTERN = re.compile(
    r'\\"identifier\\":\\"(?P<id>.+?)\\".*?'
    r'\\"players\\":(?P<day1_players>\d+),'
    r'\\"day2s\\":(?P<day2_players>\d+),'
    r'\\"wins\\":\d+,'
    r'\\"losses\\":\d+,'
    r'\\"ties\\":\d+,'
    r'\\"records\\":\\"\{'
    r'\\\\\\"1\\\\\\":\{\\\\\\"wins\\\\\\":(?P<d1_w>\d+),\\\\\\"losses\\\\\\":(?P<d1_l>\d+),\\\\\\"ties\\\\\\":(?P<d1_t>\d+)\},'
    r'\\\\\\"2\\\\\\":\{\\\\\\"wins\\\\\\":(?P<d2_w>\d+),\\\\\\"losses\\\\\\":(?P<d2_l>\d+),\\\\\\"ties\\\\\\":(?P<d2_t>\d+)\}'
    r'\}\\"',
    re.DOTALL,
)


def scrape_tournament_day(tournament_id: str, day: str) -> Dict[str, Dict[str, float]]:
    """
    Fetch labs.limitlesstcg.com/{id}/decks?{day1|day2} and return
    { deck_slug: { 'player_count', 'share_pct', 'wins', 'losses',
                   'ties', 'win_pct' } }.

    `day` ∈ {'day1','day2'}. We parse the embedded JSON data-blob, NOT
    the rendered HTML table — the table only carries OVERALL stats and
    led PR #32 to write share_pct == day1_share_pct == day2_share_pct
    for every row. The blob has the real per-day player counts and records.

    Returns empty dict when the page is missing or the blob isn't found
    (small tournaments without a Day-2 cut won't have any Day-2 entries).
    """
    if day not in ('day1', 'day2'):
        return {}
    url = f"{BASE_URL}/{tournament_id}/decks?{day}"
    logger.info("    Fetching %s: %s", day, url)
    # Need the raw HTML to access the embedded JSON blob — fetch_page_bs4
    # parses to lxml/bs4 and we'd lose the script-context anyway.
    from card_scraper_shared import safe_fetch_html
    html = safe_fetch_html(url)
    if not html:
        logger.warning("    %s page fetch failed for %s — skipping", day, tournament_id)
        return {}

    matches = list(_DAY_BLOB_PATTERN.finditer(html))
    if not matches:
        logger.info("    No %s data blob for %s — small event, no day-2 cut, or page format changed", day, tournament_id)
        return {}

    # Compute totals for share normalisation. Tournaments without a Day-2
    # cut return all 0s for day2s — we then return an empty dict so the
    # caller knows there's nothing to merge.
    total_day1 = sum(int(m['day1_players']) for m in matches)
    total_day2 = sum(int(m['day2_players']) for m in matches)
    total = total_day1 if day == 'day1' else total_day2
    if total <= 0:
        logger.info("    %s: total players = 0 (event has no %s data)", day, day)
        return {}

    out: Dict[str, Dict[str, float]] = {}
    for m in matches:
        slug = m['id']
        if day == 'day1':
            player_count = int(m['day1_players'])
            wins   = int(m['d1_w'])
            losses = int(m['d1_l'])
            ties   = int(m['d1_t'])
        else:
            player_count = int(m['day2_players'])
            wins   = int(m['d2_w'])
            losses = int(m['d2_l'])
            ties   = int(m['d2_t'])
        if player_count <= 0:
            continue

        games   = wins + losses + ties
        # Limitless reports "Win %" as match-point percentage, not raw
        # win-rate: (wins×3 + ties) / (games×3). E.g. 24-41-6 = 36.62%
        # rather than 24/71 = 33.80%. Match the upstream formula so
        # Day-1/Day-2 numbers line up with what users see on labs.
        win_pct = round((wins * 3 + ties) / (games * 3) * 100, 4) if games > 0 else 0.0
        share_pct = round(player_count / total * 100, 4)

        out[slug] = {
            'player_count': player_count,
            'share_pct'   : share_pct,
            'wins'        : wins,
            'losses'      : losses,
            'ties'        : ties,
            'win_pct'     : win_pct,
        }

    logger.info("    %s: %d decks parsed (JSON blob, total %d players)", day, len(out), total)
    return out


# ── Output ────────────────────────────────────────────────────────────────────

CSV_FIELDS = [
    'tournament_id', 'tournament_name', 'tournament_date',
    'tournament_type', 'country', 'total_players',
    'deck_name', 'deck_slug', 'pokemon',
    'player_count', 'share_pct',
    'wins', 'losses', 'ties', 'win_pct',
    'top8_conv_rate', 'top16_conv_rate', 'top32_conv_rate',
    # Day-1 / Day-2 split (added with Day-1+Day-2 tab scraping).
    # Existing rows get '' for these on schema-drift rewrites; the
    # frontend treats missing values as 0 and falls back to overall.
    'day1_players', 'day1_share_pct', 'day1_wins', 'day1_losses', 'day1_ties', 'day1_win_pct',
    'day2_players', 'day2_share_pct', 'day2_wins', 'day2_losses', 'day2_ties', 'day2_win_pct',
    'day1_to_day2_conv',
    'scraped_at',
]


def save_results(tournaments_meta: List[Dict], deck_rows: List[Dict]) -> None:
    data_dir = _get_data_dir()
    os.makedirs(data_dir, exist_ok=True)

    # Tournament index JSON
    json_path = os.path.join(data_dir, 'labs_tournaments.json')
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(tournaments_meta, f, indent=2, ensure_ascii=False)
    logger.info("Saved tournament index → %s", json_path)

    csv_path = os.path.join(data_dir, 'labs_tournament_decks.csv')
    # Detect schema drift — if the existing file lacks any of the current
    # CSV_FIELDS (e.g. after we added top8_conv_rate columns), we re-read
    # all existing rows and write the file back with the new schema before
    # appending. Missing fields default to '' so old data stays intact.
    existing_rows: List[Dict] = []
    if os.path.exists(csv_path):
        with open(csv_path, 'r', newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            file_fields = set(reader.fieldnames or [])
            schema_drift = not set(CSV_FIELDS).issubset(file_fields)
            if schema_drift:
                logger.info("CSV schema drift detected — rewriting %s with new columns", csv_path)
                existing_rows = list(reader)

    if existing_rows:
        # Schema-upgrade rewrite: existing + new in one shot.
        with open(csv_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=CSV_FIELDS, extrasaction='ignore')
            writer.writeheader()
            writer.writerows(existing_rows)
            writer.writerows(deck_rows)
        logger.info("Saved deck data → %s  (rewrote %d rows + %d new)",
                    csv_path, len(existing_rows), len(deck_rows))
    else:
        write_header = not os.path.exists(csv_path)
        with open(csv_path, 'a', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=CSV_FIELDS, extrasaction='ignore')
            if write_header:
                writer.writeheader()
            writer.writerows(deck_rows)
        logger.info("Saved deck data → %s  (%d new rows)", csv_path, len(deck_rows))


def overwrite_results(tournaments_meta: List[Dict], deck_rows: List[Dict]) -> None:
    data_dir = _get_data_dir()
    os.makedirs(data_dir, exist_ok=True)

    json_path = os.path.join(data_dir, 'labs_tournaments.json')
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(tournaments_meta, f, indent=2, ensure_ascii=False)
    logger.info("Overwrote tournament index → %s", json_path)

    csv_path = os.path.join(data_dir, 'labs_tournament_decks.csv')
    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(deck_rows)
    logger.info("Overwrote deck data → %s  (%d rows)", csv_path, len(deck_rows))


# ── CLI ───────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description='Scrape deck share data from labs.limitlesstcg.com',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        '--from-date', metavar='YYYY-MM-DD', default=None,
        help='Only include tournaments on or after this date',
    )
    parser.add_argument(
        '--tournament-id', metavar='ID', default=None,
        help='Scrape exactly one tournament by its numeric ID (e.g. 0061)',
    )
    parser.add_argument(
        '--tournament-type', nargs='+',
        choices=sorted(TOURNAMENT_TYPES),
        metavar='TYPE', default=None,
        help='Filter by type: regional, international, special, worlds (space-separated)',
    )
    parser.add_argument(
        '--delay', type=float, default=DEFAULT_DELAY, metavar='SEC',
        help=f'Delay between requests in seconds (default: {DEFAULT_DELAY})',
    )
    parser.add_argument(
        '--overwrite', action='store_true',
        help='Overwrite output files instead of appending to the CSV',
    )
    args = parser.parse_args()

    # ── Load settings (CLI args take priority over scraper_settings.json) ──
    cfg = load_settings("labs_tournament_scraper_settings.json", DEFAULT_SETTINGS)
    raw_from_date = args.from_date or cfg.get("from_date")
    tournament_types = args.tournament_type or cfg.get("tournament_types") or None
    delay = args.delay if args.delay != DEFAULT_DELAY else cfg.get("delay", DEFAULT_DELAY)
    overwrite = args.overwrite or cfg.get("overwrite", False)

    # ── Parse date filter ──────────────────────────────────────────────────
    from_date: Optional[datetime] = None
    if raw_from_date:
        try:
            fmt = '%Y-%m-%d' if '-' in str(raw_from_date) else '%d.%m.%Y'
            from_date = datetime.strptime(str(raw_from_date), fmt)
            logger.info("Date filter: on/after %s", raw_from_date)
        except ValueError:
            logger.error("Invalid from_date %r – use YYYY-MM-DD", raw_from_date)
            sys.exit(1)

    # ── Build tournament list ──────────────────────────────────────────────
    if args.tournament_id:
        # Single-tournament mode – skip the main page, but still fetch the
        # tournament's own page so we get the real name + date instead of
        # a placeholder "Tournament 0062" string flowing into the field
        # cards downstream.
        tid = args.tournament_id.zfill(4)
        meta = scrape_tournament_meta(tid)
        tournaments = [{
            'tournament_id'  : tid,
            'tournament_name': meta.get('tournament_name') or f'Tournament {args.tournament_id}',
            'tournament_date': meta.get('tournament_date') or '',
            'tournament_type': 'unknown',
            'country'        : '',
        }]
        logger.info("Single-tournament mode: %s (%s)",
                    tournaments[0]['tournament_name'],
                    tournaments[0]['tournament_date'] or 'date n/a')
    else:
        tournaments = scrape_tournament_list(
            from_date=from_date,
            tournament_types=tournament_types,
        )

    if not tournaments:
        logger.warning("No tournaments matched the given filters – nothing to do.")
        return

    # ── Scrape each tournament ─────────────────────────────────────────────
    all_deck_rows: List[Dict] = []
    tournaments_meta: List[Dict] = []
    scraped_at = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    for idx, t in enumerate(tournaments):
        tid = t['tournament_id']
        logger.info("[%d/%d] %s (%s)", idx + 1, len(tournaments), t['tournament_name'], tid)

        decks, total_players = scrape_tournament_decks(tid)
        t['total_players'] = total_players
        tournaments_meta.append(t)

        for deck in decks:
            all_deck_rows.append({
                'tournament_id'  : tid,
                'tournament_name': t['tournament_name'],
                'tournament_date': t['tournament_date'],
                'tournament_type': t['tournament_type'],
                'country'        : t['country'],
                'total_players'  : total_players,
                'scraped_at'     : scraped_at,
                **deck,
            })

        # Polite delay between tournaments
        if idx < len(tournaments) - 1:
            time.sleep(delay)

    # ── Save ───────────────────────────────────────────────────────────────
    if overwrite:
        overwrite_results(tournaments_meta, all_deck_rows)
    else:
        save_results(tournaments_meta, all_deck_rows)

    logger.info(
        "Done. %d tournaments, %d deck entries written.",
        len(tournaments_meta), len(all_deck_rows),
    )


if __name__ == '__main__':
    main()
