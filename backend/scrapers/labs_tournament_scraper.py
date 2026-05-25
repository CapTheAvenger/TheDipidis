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
from datetime import datetime, timezone
from typing import Dict, List, Optional, Set, Tuple

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
    fix_mojibake,
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


# ── Per-meta split helpers (2026-05-24) ──────────────────────────────────────
#
# Without these the scraper re-pulls every tournament from labs.* on every
# weekly run — wasteful for closed metas (their data is frozen). The split
# mirrors the pattern tournament_cards_data_cards_<META>.csv uses:
#
#   data/labs_tournament_decks_<META>.csv      — frozen per closed meta
#   data/labs_tournament_matchups_<META>.csv   — frozen per closed meta
#   data/labs_tournament_decks.csv             — monolith for Meta Call (reassembled)
#   data/labs_tournament_matchups.csv          — monolith for Meta Call (reassembled)
#
# At run start: rebuild monoliths from chunks.
# Skip rule:  tournament with meta != current_meta AND id already in monolith → skip
# At run end: split monoliths back into per-meta chunks.

_META_DATE_LOOKUP: Optional[List[Tuple[datetime, datetime, str]]] = None


def _load_meta_date_lookup() -> List[Tuple[datetime, datetime, str]]:
    """Build (min_date, max_date, meta_key) tuples from
    tournament_cards_manifest.json's chunk_dates. Sorted by date-range width
    ASCENDING — narrower windows take precedence when overlaps exist (the
    historic SVI-ASC chunk e.g. spans 22 months because tournaments tagged
    with that format are scattered; the narrower BRS-TWM / BRS-SFA windows
    within that span are the correct answer for those dates)."""
    global _META_DATE_LOOKUP
    if _META_DATE_LOOKUP is not None:
        return _META_DATE_LOOKUP

    out: List[Tuple[datetime, datetime, str]] = []
    manifest_path = os.path.join(_get_data_dir(), 'tournament_cards_manifest.json')
    if not os.path.isfile(manifest_path):
        # Try project-root fallback (workflow seed step may not have copied it yet)
        manifest_path = os.path.join(_PROJECT_ROOT, 'data', 'tournament_cards_manifest.json')
    if not os.path.isfile(manifest_path):
        _META_DATE_LOOKUP = []
        return _META_DATE_LOOKUP
    try:
        with open(manifest_path, 'r', encoding='utf-8') as f:
            manifest = json.load(f)
        chunk_dates = manifest.get('chunk_dates', {})
        for chunk_name, dates in chunk_dates.items():
            meta = chunk_name.replace('tournament_cards_data_cards_', '').replace('.csv', '')
            mn = dates.get('min_date', '')
            mx = dates.get('max_date', '')
            if not mn or not mx:
                continue
            try:
                d_min = datetime.strptime(mn, '%Y-%m-%d')
                d_max = datetime.strptime(mx, '%Y-%m-%d')
            except ValueError:
                continue
            out.append((d_min, d_max, meta))
    except (json.JSONDecodeError, OSError):
        out = []

    # Narrower first
    out.sort(key=lambda r: (r[1] - r[0]).days)
    _META_DATE_LOOKUP = out
    return _META_DATE_LOOKUP


def _derive_meta_from_date(date_iso: str) -> str:
    """Map a tournament_date (ISO 'YYYY-MM-DD') to its meta key.
    Returns '' when no chunk's date-range contains the date — caller can
    then default to the current_set (from format_window.json) or skip."""
    if not date_iso:
        return ''
    try:
        d = datetime.strptime(date_iso, '%Y-%m-%d')
    except ValueError:
        return ''
    for d_min, d_max, meta in _load_meta_date_lookup():
        if d_min <= d <= d_max:
            return meta
    return ''


def _current_meta_key() -> str:
    """Read format_window.json and return the current set code (e.g. 'CRI').
    Caller pairs this with the previous set to derive the full meta key
    when needed; for now we use it just to determine which tournaments
    are CURRENT (re-scrape every run) vs CLOSED (skip if already scraped)."""
    try:
        fw_path = os.path.join(_get_data_dir(), 'format_window.json')
        if not os.path.isfile(fw_path):
            fw_path = os.path.join(_PROJECT_ROOT, 'data', 'format_window.json')
        if not os.path.isfile(fw_path):
            return ''
        with open(fw_path, 'r', encoding='utf-8') as f:
            fw = json.load(f)
        return str(fw.get('current_set') or '').strip().upper()
    except (OSError, json.JSONDecodeError):
        return ''


def _list_labs_chunk_paths(prefix: str) -> List[str]:
    """Return all data/<prefix>_<META>.csv paths (project-root data/ dir)."""
    data_dir = _get_data_dir()
    paths: List[str] = []
    if not os.path.isdir(data_dir):
        return paths
    for fname in sorted(os.listdir(data_dir)):
        if fname.startswith(f'{prefix}_') and fname.endswith('.csv'):
            paths.append(os.path.join(data_dir, fname))
    return paths


def _reassemble_labs_monolith(prefix: str, header: List[str]) -> List[Dict]:
    """Concatenate all per-meta chunk rows into a single list. Used at the
    start of a run to learn which tournament_ids are already scraped (so
    we can skip closed-meta re-scrapes)."""
    rows: List[Dict] = []
    for chunk_path in _list_labs_chunk_paths(prefix):
        try:
            with open(chunk_path, 'r', encoding='utf-8-sig', newline='') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    # Defensive: backfill any missing keys with empty string
                    norm = {k: row.get(k, '') for k in header}
                    rows.append(norm)
        except OSError as e:
            logger.warning("Could not read %s: %s", chunk_path, e)
    return rows


def _split_labs_by_meta(rows: List[Dict], prefix: str, header: List[str]) -> Dict[str, int]:
    """Write rows back to per-meta chunks (data/<prefix>_<META>.csv).
    `meta` column on each row drives the bucket. Rows with empty meta
    are bucketed under '_unsorted' so they don't get silently dropped."""
    data_dir = _get_data_dir()
    os.makedirs(data_dir, exist_ok=True)
    by_meta: Dict[str, List[Dict]] = {}
    for row in rows:
        meta = (row.get('meta') or '').strip() or '_unsorted'
        by_meta.setdefault(meta, []).append(row)
    counts: Dict[str, int] = {}
    for meta, bucket in by_meta.items():
        out_path = os.path.join(data_dir, f'{prefix}_{meta}.csv')
        with open(out_path, 'w', encoding='utf-8', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=header, extrasaction='ignore')
            writer.writeheader()
            writer.writerows(bucket)
        counts[meta] = len(bucket)
        logger.info("  → %s: %d rows", os.path.basename(out_path), len(bucket))
    return counts


# ── ID-walk discovery (backfill — 2026-05-24) ────────────────────────────────
#
# The labs index page only lists the most-recent tournaments. To backfill
# historical labs IDs (0001..0066) we walk the ID space and probe each
# /standings page. 200 OK → tournament exists, 404 → skip.
# Used with the --id-range CLI flag.

def discover_tournament_ids_by_walk(from_id: int, to_id: int, delay: float = 0.5) -> List[str]:
    """Probe sequential 4-digit IDs and return those that have a /standings
    page. Used for historical backfill when the labs index doesn't list
    older tournaments."""
    found: List[str] = []
    logger.info("Walking labs tournament IDs %04d..%04d (probing /standings)", from_id, to_id)
    for n in range(from_id, to_id + 1):
        tid = str(n).zfill(4)
        soup = fetch_page_bs4(f"{BASE_URL}/{tid}/standings")
        if soup:
            found.append(tid)
            logger.info("  [%s] exists", tid)
        time.sleep(delay)
    logger.info("Walk complete — %d tournaments found in range", len(found))
    return found


# ── Date helpers ──────────────────────────────────────────────────────────────

def _parse_date(raw: str) -> Optional[datetime]:
    """Parse date strings like 'April 4–5, 2026', 'April 4, 2026', 'Apr 4 2026'."""
    if not raw:
        return None
    # Repair mojibake first so the en-dash matches the range pattern.
    cleaned_input = fix_mojibake(raw)
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


def _load_cached_tournament_index() -> List[Dict]:
    """Load labs_tournaments.json — the previously-scraped tournament
    index. Used as a fallback when the live index page is blocked."""
    cache_path = os.path.join(_get_data_dir(), 'labs_tournaments.json')
    if not os.path.isfile(cache_path):
        return []
    try:
        with open(cache_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        if not isinstance(data, list):
            return []
        # Defensive: ensure each row has the keys downstream expects
        out: List[Dict] = []
        for row in data:
            if not isinstance(row, dict):
                continue
            tid = str(row.get('tournament_id') or '').strip()
            if not tid:
                continue
            out.append({
                'tournament_id'  : tid,
                'tournament_name': row.get('tournament_name', f'Tournament {tid}'),
                'tournament_date': row.get('tournament_date', ''),
                'tournament_type': row.get('tournament_type', 'regional'),
                'country'        : row.get('country', ''),
            })
        return out
    except (json.JSONDecodeError, OSError) as e:
        logger.warning("Could not load cached tournament index: %s", e)
        return []


def _filter_cached_tournaments(
    rows: List[Dict],
    from_date: Optional[datetime],
    tournament_types: Optional[List[str]],
) -> List[Dict]:
    """Re-apply the date/type filters scrape_tournament_list normally
    enforces — needed when the cached list bypasses them."""
    out: List[Dict] = []
    for r in rows:
        if tournament_types and r.get('tournament_type') not in tournament_types:
            continue
        if from_date:
            d = _parse_date(r.get('tournament_date') or '')
            if d and d < from_date:
                continue
        out.append(r)
    return out


def scrape_tournament_list(
    from_date: Optional[datetime] = None,
    tournament_types: Optional[List[str]] = None,
) -> List[Dict]:
    """
    Fetch the main labs page and return a list of tournament dicts.
    Applies date and type filters when provided.

    Cache-fallback (2026-05-24): when the index fetch returns nothing
    (Cloudflare bot-detect blocking the root page), load the previously
    persisted labs_tournaments.json so per-tournament pages can still
    be attempted. This lets the scraper keep refreshing decks for known
    tournaments even when Limitless temporarily blocks the index page.
    """
    logger.info("Fetching tournament index from %s", BASE_URL)
    soup = fetch_page_bs4(BASE_URL)
    if not soup:
        logger.error("Failed to fetch tournament list — index page blocked")
        cached = _load_cached_tournament_index()
        if cached:
            logger.warning(
                "Falling back to %d cached tournaments from labs_tournaments.json",
                len(cached),
            )
            return _filter_cached_tournaments(cached, from_date, tournament_types)
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
        name = fix_mojibake(raw_name)

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

def _extract_meta_from_soup(soup, out: Dict[str, str]) -> None:
    """Pull tournament_name + tournament_date out of a /decks or /standings
    BeautifulSoup. Mutates `out` in place; only fills missing keys so the
    first source (usually /decks) wins on duplicates.

    Strategy for the date — three layered fallbacks, each tolerant of
    Limitless layout variations:
      1. Walk every NavigableString and try _DATE_TEXT_RE (the same
         permissive month-name pattern the index parser uses — full or
         abbreviated month, case-insensitive).
      2. Search the full body text for "Month Day[, Year]" (handles dates
         that sit inside elements with sibling text rather than alone).
      3. Last-ditch: look for an ISO YYYY-MM-DD anywhere in the body
         (some archive pages embed the start date as a data attribute or
         JSON blob rendered into the DOM).
    """
    from bs4 import NavigableString

    # Title: "Decks: Regional Championship Prague – Limitless Labs"
    title_el = soup.find('title')
    if title_el:
        title = title_el.get_text(strip=True)
        if 'Limitless' in title:
            head = title.rsplit('Limitless', 1)[0]
            head = head.rstrip(' \t–—-â\x80\x93\x94')
            head = re.sub(r'\s*[âÂ\x80-\x9f]+\s*$', '', head).strip()
            m = re.match(r'(?:Decks|Standings|Pairings|Metagame):\s*(.+)', head)
            cleaned = (m.group(1).strip() if m else head)
            cleaned = fix_mojibake(cleaned)
            if cleaned and not out.get('tournament_name'):
                out['tournament_name'] = cleaned
    h1 = soup.find('h1')
    if h1:
        h1_text = h1.get_text(strip=True)
        if h1_text:
            out['tournament_name'] = fix_mojibake(h1_text)

    if out.get('tournament_date'):
        return

    # 1. NavigableString walk (most reliable when the date sits in its
    # own element — the typical "April 25–26, 2026 • 1370 players" header).
    for el in soup.descendants:
        if isinstance(el, NavigableString):
            txt = str(el).strip()
            if txt and _DATE_TEXT_RE.search(txt):
                date_obj = _parse_date(txt)
                if date_obj:
                    out['tournament_date'] = date_obj.strftime('%Y-%m-%d')
                    return

    # 2. Full body scan with a broader regex (abbreviated months OK).
    body_text = soup.get_text(' ', strip=True)
    body_match = re.search(
        r'((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|'
        r'Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|'
        r'Dec(?:ember)?)\s+\d{1,2}(?:[–—\-]\d{1,2})?(?:,)?\s*(?:20\d{2})?)',
        body_text,
        re.I,
    )
    if body_match:
        date_obj = _parse_date(body_match.group(1))
        if date_obj:
            out['tournament_date'] = date_obj.strftime('%Y-%m-%d')
            return

    # 3. ISO date anywhere in the page (data attributes, JSON-LD, etc.)
    iso = re.search(r'\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b', body_text)
    if iso:
        out['tournament_date'] = iso.group(0)


def scrape_tournament_meta(tournament_id: str) -> Dict[str, str]:
    """Fetch the tournament's display name + date from its labs page.

    Used in --tournament-id and --id-range modes where the caller only
    knows the numeric ID. Tries /decks first; if the date can't be
    extracted (older archive pages sometimes render a stripped header),
    falls back to /standings as a second source. Returns {} when both
    pages 404 — the caller's defaults (e.g. "Tournament 0062") then stay.

    When the date can't be extracted from either page, logs a short body
    excerpt from each so we can see what's actually rendered (vs. the
    layout the parser expects) and iterate on the regexes.
    """
    out: Dict[str, str] = {}
    body_samples: List[str] = []  # for diagnostic logging on failure

    soup = fetch_page_bs4(f"{BASE_URL}/{tournament_id}/decks")
    if soup:
        _extract_meta_from_soup(soup, out)
        if 'tournament_date' not in out:
            body_samples.append('/decks: ' + soup.get_text(' ', strip=True)[:600])

    # Some historical tournaments (pre-2025) render /decks with no
    # parseable date in the header. /standings often still carries it.
    if 'tournament_date' not in out:
        soup_st = fetch_page_bs4(f"{BASE_URL}/{tournament_id}/standings")
        if soup_st:
            _extract_meta_from_soup(soup_st, out)
            if 'tournament_date' not in out:
                body_samples.append('/standings: ' + soup_st.get_text(' ', strip=True)[:600])

    if 'tournament_date' not in out and body_samples:
        for sample in body_samples:
            logger.warning("  [%s] no date in body — sample: %s", tournament_id, sample)

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
# percentages (Day-1 → Day-2 conversion). The mapping value is
# `(output_key, kind)` where kind is 'pct' (0..1 fraction) or 'int'.
#
# As of 2026-04, the live `/decks?conversion` page exposes only:
#     Deck | Day 1 | Day 2 | Conversion
# i.e. Day-1 player count, Day-2 player count, and the Day-1 → Day-2
# conversion rate. There is NO Top-8 / Top-16 / Top-32 conversion
# column on this page anymore (it may have existed historically — the
# old mappings were just dead matches and produced 0 for every row).
#
# Cut-performance amplification (= "did this deck overperform in the
# top cut") is therefore handled FRONTEND-SIDE in Predictor 4.4b
# (see js/app-meta-call.js _labsQualityByDeck) which derives the
# signal from `day2_share_pct / day1_share_pct`. The CSV column
# `top8_conv_rate` stays in the schema for backward compat but is
# expected to be 0 until/unless we add a standings-page scraper that
# counts each deck's Top-8 placements explicitly.
_CONV_HEADER_KEYS = {
    # Day-1 → Day-2 conversion view (only live conv-relevant columns).
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
    'meta',  # Per-meta split (2026-05-24) — derived from tournament_date via tournament_cards_manifest's chunk_dates
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


# ── Per-archetype matchup scraper (W3 Phase 7 — May 2026) ─────────────
# The screenshots labs.limitlesstcg.com surfaces per-archetype detail
# pages at /{tournament_id}/decks/{deck_slug} with a per-opponent table
# (count + win %). User flagged this for the Meta Call upgrade: Major
# matchup matrix gets 3× weight over the online proxy.
#
# Parser is intentionally defensive — selectors fall through multiple
# patterns because we synthesized the fixture from screenshots without
# fetching the live HTML (Cloudflare blocks WebFetch from the sandbox
# environment). The first real-world dry-run is the validation step:
# if a structural mismatch surfaces, fix forward.
MATCHUP_DAY_OVERALL = 'overall'
MATCHUP_DAY_DAY1 = 'day1'
MATCHUP_DAY_DAY2 = 'day2'
_MATCHUP_DAYS = (MATCHUP_DAY_OVERALL, MATCHUP_DAY_DAY1, MATCHUP_DAY_DAY2)

MATCHUP_CSV_HEADER = [
    'tournament_id',
    'tournament_name',
    'tournament_date',
    'tournament_type',
    'meta',                  # format key (e.g. TEF-POR) for downstream chunking
    'my_deck_slug',
    'my_deck_name',
    'my_deck_player_count',  # total players who brought this deck to the event
    'my_deck_total_wins',
    'my_deck_total_losses',
    'my_deck_total_ties',
    'my_deck_overall_win_pct',
    'opponent_deck_slug',
    'opponent_deck_name',
    'vs_count',              # games played vs this opponent in the day_filter
    'vs_win_pct',            # win % vs this opponent in the day_filter
    'day_filter',            # 'overall' | 'day1' | 'day2'
    'scraped_at',
]


def _parse_player_summary(soup) -> Dict[str, float]:
    """Extract the "{N} players: {W} wins - {L} losses - {T} ties ({WR}% WR)"
    summary line. Defensive — tries several elements and returns zeros on
    failure rather than raising.
    """
    out = {
        'player_count'  : 0,
        'total_wins'    : 0,
        'total_losses'  : 0,
        'total_ties'    : 0,
        'overall_win_pct': 0.0,
    }
    if not soup:
        return out
    # Search the whole page text — the summary is short and unmistakable
    text_blocks = []
    for el in soup.find_all(['p', 'div', 'h2', 'h3', 'span']):
        txt = el.get_text(' ', strip=True)
        if txt and 'players' in txt.lower() and 'wins' in txt.lower():
            text_blocks.append(txt)
    for txt in text_blocks:
        m = re.search(
            r'(\d[\d,]*)\s*players?\s*[:\-]\s*(\d[\d,]*)\s*wins?\s*[-–]\s*(\d[\d,]*)\s*losses?\s*[-–]\s*(\d[\d,]*)\s*ties?\s*\(([\d.,]+)\s*%',
            txt,
            re.IGNORECASE,
        )
        if m:
            out['player_count'] = _parse_int_count(m.group(1))
            out['total_wins'] = _parse_int_count(m.group(2))
            out['total_losses'] = _parse_int_count(m.group(3))
            out['total_ties'] = _parse_int_count(m.group(4))
            out['overall_win_pct'] = round(float(m.group(5).replace(',', '.')), 4)
            return out
    return out


def scrape_archetype_matchups(
    tournament_id: str,
    deck_slug: str,
    day_filter: str = MATCHUP_DAY_OVERALL,
) -> Dict:
    """
    Fetch labs.limitlesstcg.com/{tournament_id}/decks/{deck_slug} (with
    optional ?day1 / ?day2 query) and parse the per-opponent matchup
    table.

    Returns a dict:
      {
        'summary': { player_count, total_wins, ..., overall_win_pct },
        'matchups': [
          { 'opponent_slug', 'opponent_name', 'vs_count', 'vs_win_pct' },
          ...
        ],
        'day_filter': day_filter,
      }

    Returns empty matchups list on parse failure (caller decides whether
    to skip the row or treat as zero-sample).
    """
    if day_filter not in _MATCHUP_DAYS:
        day_filter = MATCHUP_DAY_OVERALL

    url = f"{BASE_URL}/{tournament_id}/decks/{deck_slug}"
    if day_filter != MATCHUP_DAY_OVERALL:
        url = f"{url}?{day_filter}"
    logger.info("    Fetching matchups %s", url)
    soup = fetch_page_bs4(url)
    if not soup:
        logger.warning("    Matchup fetch failed for %s", url)
        return {'summary': _parse_player_summary(None), 'matchups': [], 'day_filter': day_filter}

    summary = _parse_player_summary(soup)

    # Find the matchup table — prefer .data-table (matches the deck-list
    # scraper's selector) and fall back to any table whose header row
    # contains "Win %" / "#".
    table = soup.find('table', attrs={'class': re.compile(r'data-table')})
    if not table:
        for cand in soup.find_all('table'):
            header_txt = cand.get_text(' ', strip=True).lower()
            if 'win %' in header_txt or 'win%' in header_txt:
                table = cand
                break
    if not table:
        logger.debug("    No matchup table for %s/%s", tournament_id, deck_slug)
        return {'summary': summary, 'matchups': [], 'day_filter': day_filter}

    matchups: List[Dict] = []
    for row in table.select('tbody tr') if table.find('tbody') else table.find_all('tr')[1:]:
        cells = row.find_all('td')
        if len(cells) < 3:
            continue
        # Deck-name cell: prefer the one with an <a>; opponent slug is the
        # last segment of href.
        link = None
        name_cell_idx = None
        for idx, c in enumerate(cells):
            a = c.find('a')
            if a and a.get('href'):
                link = a
                name_cell_idx = idx
                break
        if not link or name_cell_idx is None:
            continue
        opp_name = link.get_text(strip=True)
        if not opp_name:
            continue
        opp_href = link.get('href', '')
        opp_slug = opp_href.rsplit('/', 1)[-1].split('?')[0] if opp_href else ''

        # Count + Win% are the two trailing numeric cells after the name
        # cell. Walk from the right so we don't depend on header order.
        trailing = cells[name_cell_idx + 1:]
        count_val = 0
        win_pct_val = 0.0
        for c in trailing:
            txt = c.get_text(strip=True)
            if '%' in txt and win_pct_val == 0.0:
                try:
                    win_pct_val = round(float(txt.replace('%', '').replace(',', '.').strip()), 4)
                except ValueError:
                    pass
            elif txt and count_val == 0 and not '%' in txt:
                count_val = _parse_int_count(txt)
        if count_val <= 0 and win_pct_val == 0.0:
            continue
        matchups.append({
            'opponent_slug': opp_slug,
            'opponent_name': opp_name,
            'vs_count'     : count_val,
            'vs_win_pct'   : win_pct_val,
        })

    return {'summary': summary, 'matchups': matchups, 'day_filter': day_filter}


def build_matchup_rows(
    tournament_meta: Dict,
    deck_summary: Dict,
    matchups_result: Dict,
) -> List[Dict]:
    """Combine tournament metadata + per-archetype matchup payload into
    CSV row dicts ready for save. `deck_summary` is the deck-list-derived
    row (player_count, win_pct, deck_name etc.) so we keep one CSV with
    everything needed for Meta Call aggregation."""
    rows: List[Dict] = []
    summary = matchups_result.get('summary') or {}
    day_filter = matchups_result.get('day_filter') or MATCHUP_DAY_OVERALL
    for m in matchups_result.get('matchups', []):
        rows.append({
            'tournament_id'         : tournament_meta.get('tournament_id', ''),
            'tournament_name'       : tournament_meta.get('tournament_name', ''),
            'tournament_date'       : tournament_meta.get('tournament_date', ''),
            'tournament_type'       : tournament_meta.get('tournament_type', ''),
            'meta'                  : tournament_meta.get('meta', ''),
            'my_deck_slug'          : deck_summary.get('deck_slug', ''),
            'my_deck_name'          : deck_summary.get('deck_name', ''),
            'my_deck_player_count'  : summary.get('player_count') or deck_summary.get('player_count', 0),
            'my_deck_total_wins'    : summary.get('total_wins', 0),
            'my_deck_total_losses'  : summary.get('total_losses', 0),
            'my_deck_total_ties'    : summary.get('total_ties', 0),
            'my_deck_overall_win_pct': summary.get('overall_win_pct') or deck_summary.get('win_pct', 0.0),
            'opponent_deck_slug'    : m.get('opponent_slug', ''),
            'opponent_deck_name'    : m.get('opponent_name', ''),
            'vs_count'              : m.get('vs_count', 0),
            'vs_win_pct'            : m.get('vs_win_pct', 0.0),
            'day_filter'            : day_filter,
            'scraped_at'            : datetime.now(timezone.utc).isoformat(),
        })
    return rows


def save_matchup_rows(matchup_rows: List[Dict], data_dir: Optional[str] = None) -> str:
    """Write matchup rows to data/labs_tournament_matchups.csv (append-or-replace
    semantics — caller decides). Returns the output path."""
    out_dir = data_dir or _get_data_dir()
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, 'labs_tournament_matchups.csv')
    with open(out_path, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=MATCHUP_CSV_HEADER, extrasaction='ignore')
        writer.writeheader()
        for row in matchup_rows:
            writer.writerow(row)
    logger.info("Wrote %d matchup rows → %s", len(matchup_rows), out_path)
    return out_path


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
    parser.add_argument(
        '--matchups', action='store_true',
        help='Second pass — fetch /{tid}/decks/{slug} per archetype and write '
             'data/labs_tournament_matchups.csv. Slow (one HTTP per deck per '
             'tournament). Default OFF.',
    )
    parser.add_argument(
        '--matchup-days', nargs='+',
        choices=list(_MATCHUP_DAYS), default=[MATCHUP_DAY_OVERALL],
        help='Which day filter(s) to scrape per archetype when --matchups is '
             'set (default: overall). Adds one HTTP per filter per deck.',
    )
    parser.add_argument(
        '--matchup-meta', metavar='META', default='',
        help='Format key to tag matchup rows with (e.g. TEF-POR). Useful for '
             'targeted per-format backfills.',
    )
    parser.add_argument(
        '--id-range', nargs=2, type=int, metavar=('FROM', 'TO'), default=None,
        help='Backfill historical tournaments by ID-walking labs.* /standings '
             'pages (e.g. --id-range 1 66 probes 0001..0066). Use this when '
             'the labs index page only lists recent tournaments and you need '
             'to seed older metas into the per-meta chunks.',
    )
    parser.add_argument(
        '--ignore-cache', action='store_true',
        help='Force-rescrape ALL discovered tournaments even if they belong to '
             'closed metas already present in per-meta chunks. Default skips '
             'closed-meta tournaments to save HTTP cost on weekly runs.',
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

    # ── Per-meta cache: rebuild monolith FIRST so ID-walk can prefer cached
    # meta over a fresh scrape_tournament_meta call (the labs /decks header
    # is sometimes JS-rendered so date extraction fails — preserving the
    # cached date avoids losing it on every run). Loaded once and shared
    # between the ID-walk pre-fill and the SKIP-frozen branch below.
    current_meta = _current_meta_key()
    existing_deck_rows = _reassemble_labs_monolith('labs_tournament_decks', CSV_FIELDS)
    existing_matchup_rows = _reassemble_labs_monolith('labs_tournament_matchups', MATCHUP_CSV_HEADER)
    seen_tids = {str(r.get('tournament_id') or '').strip() for r in existing_deck_rows}
    # tid → full meta dict (name, date, type, country, total_players).
    # First occurrence per tid wins (we only care that we have *some* known-
    # good values; chunks shouldn't disagree within a tid).
    cached_tournament_meta: Dict[str, Dict] = {}
    cached_player_counts: Dict[str, int] = {}
    for r in existing_deck_rows:
        tid_key = str(r.get('tournament_id') or '').strip()
        if not tid_key:
            continue
        if tid_key not in cached_tournament_meta:
            cached_tournament_meta[tid_key] = {
                'tournament_name': r.get('tournament_name') or '',
                'tournament_date': r.get('tournament_date') or '',
                'tournament_type': r.get('tournament_type') or 'regional',
                'country'        : r.get('country') or '',
            }
        try:
            cached_player_counts[tid_key] = max(
                cached_player_counts.get(tid_key, 0),
                int(r.get('total_players') or 0),
            )
        except (TypeError, ValueError):
            continue

    def _meta_from_cache_or_scrape(tid: str, fallback_type: str = 'regional') -> Dict[str, str]:
        """Use cached meta when we already have a non-empty date; only hit
        scrape_tournament_meta when the cache can't tell us the date. Saves
        a network round-trip per known tid AND preserves the cached date
        when the live parser can't read it from JS-rendered headers."""
        cached = cached_tournament_meta.get(tid) or {}
        if cached.get('tournament_date'):
            return {
                'tournament_name': cached.get('tournament_name') or f'Tournament {tid}',
                'tournament_date': cached['tournament_date'],
                'tournament_type': cached.get('tournament_type') or fallback_type,
                'country'        : cached.get('country') or '',
            }
        scraped = scrape_tournament_meta(tid)
        return {
            'tournament_name': scraped.get('tournament_name') or cached.get('tournament_name') or f'Tournament {tid}',
            'tournament_date': scraped.get('tournament_date') or '',
            'tournament_type': cached.get('tournament_type') or fallback_type,
            'country'        : cached.get('country') or '',
        }

    # ── Build tournament list ──────────────────────────────────────────────
    if args.tournament_id:
        # Single-tournament mode – skip the main page, but still fetch the
        # tournament's own page so we get the real name + date instead of
        # a placeholder "Tournament 0062" string flowing into the field
        # cards downstream.
        tid = args.tournament_id.zfill(4)
        meta = _meta_from_cache_or_scrape(tid, fallback_type='unknown')
        tournaments = [{
            'tournament_id'  : tid,
            'tournament_name': meta['tournament_name'],
            'tournament_date': meta['tournament_date'],
            'tournament_type': meta['tournament_type'],
            'country'        : meta['country'],
        }]
        logger.info("Single-tournament mode: %s (%s)",
                    tournaments[0]['tournament_name'],
                    tournaments[0]['tournament_date'] or 'date n/a')
    elif args.id_range:
        # Backfill mode — walk the labs ID space and probe each tournament's
        # /standings page. Used to seed historical metas (SVI-PFL, SVI-ASC
        # etc.) that no longer appear on the labs index page.
        from_id, to_id = args.id_range
        found_ids = discover_tournament_ids_by_walk(from_id, to_id, delay=min(delay, 0.5))
        tournaments = []
        for tid in found_ids:
            meta = _meta_from_cache_or_scrape(tid)
            tournaments.append({
                'tournament_id'  : tid,
                'tournament_name': meta['tournament_name'],
                'tournament_date': meta['tournament_date'],
                'tournament_type': meta['tournament_type'],
                'country'        : meta['country'],
            })
            # Only delay when we actually hit the network (cache hits are free)
            if not (cached_tournament_meta.get(tid) or {}).get('tournament_date'):
                time.sleep(delay)
    else:
        tournaments = scrape_tournament_list(
            from_date=from_date,
            tournament_types=tournament_types,
        )

    if not tournaments:
        logger.warning("No tournaments matched the given filters – nothing to do.")
        return

    logger.info(
        "Per-meta cache: %d tournaments already scraped across all chunks, current_set=%s",
        len(seen_tids), current_meta or '(unknown)',
    )

    # ── Scrape each tournament ─────────────────────────────────────────────
    all_deck_rows: List[Dict] = []
    tournaments_meta: List[Dict] = []
    scraped_at = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    skipped_frozen = 0
    rescraped_tids: Set[str] = set()

    for idx, t in enumerate(tournaments):
        tid = t['tournament_id']
        # Skip closed-meta tournaments that are already cached.
        # Use the cached date (not just t['tournament_date']) when computing
        # is_current — the live scrape may have returned an empty date for
        # JS-rendered pages, but the chunks still know the real value.
        cached_for_skip = cached_tournament_meta.get(tid) or {}
        effective_date = t.get('tournament_date') or cached_for_skip.get('tournament_date') or ''
        if not args.ignore_cache and tid in seen_tids:
            t_meta = _derive_meta_from_date(effective_date)
            # current_meta check: a current-meta tournament always re-scrapes
            # (data still updates as more rounds finish). Closed metas freeze.
            is_current = bool(current_meta) and bool(t_meta) and t_meta.endswith(current_meta)
            if not is_current:
                logger.info(
                    "[%d/%d] %s (%s) — SKIP (frozen, meta=%s, date=%s)",
                    idx + 1, len(tournaments), t['tournament_name'], tid,
                    t_meta or '?', effective_date or 'unknown',
                )
                skipped_frozen += 1
                # Preserve cached metadata in the index file so the next
                # weekly run still sees it (otherwise labs_tournaments.json
                # shrinks and the cache-fallback loses every previously-
                # known tournament).
                if cached_player_counts.get(tid):
                    t['total_players'] = cached_player_counts[tid]
                if effective_date and not t.get('tournament_date'):
                    t['tournament_date'] = effective_date
                if cached_for_skip.get('country') and not t.get('country'):
                    t['country'] = cached_for_skip['country']
                tournaments_meta.append(t)
                continue

        logger.info("[%d/%d] %s (%s)", idx + 1, len(tournaments), t['tournament_name'], tid)
        decks, total_players = scrape_tournament_decks(tid)
        t['total_players'] = total_players
        tournaments_meta.append(t)
        rescraped_tids.add(tid)

        # Derive meta for this tournament (uses ISO date).
        # When the date IS known but doesn't match any chunk window, treat
        # the tournament as brand-new in the current set and tag with
        # current_meta so the bucket exists.
        # When the date is EMPTY we used to fall back to current_meta too —
        # but that silently buried date-extraction failures inside the
        # current-meta chunk (3859 historical labs rows ended up in CRI
        # during the 2026-05-25 backfill because scrape_tournament_meta
        # couldn't read their date). Now empty-date rows land in
        # _unsorted instead, making the failure visible and recoverable.
        tdate = (t.get('tournament_date') or '').strip()
        deck_meta = _derive_meta_from_date(tdate)
        if not deck_meta and tdate and current_meta:
            deck_meta = current_meta

        for deck in decks:
            all_deck_rows.append({
                'tournament_id'  : tid,
                'tournament_name': t['tournament_name'],
                'tournament_date': t['tournament_date'],
                'tournament_type': t['tournament_type'],
                'country'        : t['country'],
                'total_players'  : total_players,
                'meta'           : deck_meta,
                'scraped_at'     : scraped_at,
                **deck,
            })

        # Polite delay between tournaments
        if idx < len(tournaments) - 1:
            time.sleep(delay)

    if skipped_frozen:
        logger.info("Frozen-meta cache: skipped %d tournaments (use --ignore-cache to force re-scrape)", skipped_frozen)

    # Merge new rows with existing (un-rescraped) rows so the per-meta
    # split contains the full historical archive.
    merged_deck_rows = [r for r in existing_deck_rows if str(r.get('tournament_id') or '').strip() not in rescraped_tids]
    merged_deck_rows.extend(all_deck_rows)

    # ── Save ───────────────────────────────────────────────────────────────
    if overwrite:
        overwrite_results(tournaments_meta, merged_deck_rows)
    else:
        save_results(tournaments_meta, merged_deck_rows)

    logger.info(
        "Done. %d tournaments, %d deck entries written.",
        len(tournaments_meta), len(all_deck_rows),
    )

    # ── Optional Phase B: per-archetype matchups ───────────────────────────
    # User-flagged 2026-05-24: labs exposes per-deck matchup matrices
    # (count + WR per opponent, with Day-2 filter). We scrape them as a
    # second pass to keep the main run fast and the matchup CSV optional
    # (Meta Call degrades gracefully when the file is absent).
    if args.matchups:
        matchup_rows: List[Dict] = []
        total_decks_for_matchups = len(all_deck_rows) * len(args.matchup_days)
        logger.info(
            "Matchup pass: scraping %d archetype-day combos (one HTTP each, ~%.1f min @ %ss delay)",
            total_decks_for_matchups,
            total_decks_for_matchups * delay / 60,
            delay,
        )
        # Index meta by tournament_id for fast lookup
        meta_by_tid = {t['tournament_id']: t for t in tournaments_meta}
        for d_idx, deck_row in enumerate(all_deck_rows):
            tid = deck_row['tournament_id']
            slug = deck_row.get('deck_slug', '')
            if not slug:
                continue
            tmeta = dict(meta_by_tid.get(tid, {}))
            # Per-meta tag derived from tournament_date (chunk dates lookup);
            # CLI --matchup-meta still wins as an explicit override.
            derived_meta = _derive_meta_from_date(tmeta.get('tournament_date') or '')
            if args.matchup_meta:
                tmeta['meta'] = args.matchup_meta
            elif derived_meta:
                tmeta['meta'] = derived_meta
            for day in args.matchup_days:
                logger.info(
                    "  [matchup %d/%d] %s · %s · %s",
                    d_idx + 1, len(all_deck_rows),
                    tid, slug, day,
                )
                try:
                    result = scrape_archetype_matchups(tid, slug, day_filter=day)
                    matchup_rows.extend(build_matchup_rows(tmeta, deck_row, result))
                except Exception as e:  # noqa: BLE001 — log + continue per-deck
                    logger.warning("    Matchup scrape failed for %s/%s/%s: %s", tid, slug, day, e)
                time.sleep(delay)

        # Merge new matchup rows with existing-chunk rows for tournaments
        # we did NOT re-scrape this run (frozen). Same dedup pattern as decks.
        merged_matchup_rows = [
            r for r in existing_matchup_rows
            if str(r.get('tournament_id') or '').strip() not in rescraped_tids
        ]
        merged_matchup_rows.extend(matchup_rows)
        save_matchup_rows(merged_matchup_rows)
        logger.info(
            "Matchup pass done. %d new rows + %d carried-over from chunks = %d total.",
            len(matchup_rows), len(merged_matchup_rows) - len(matchup_rows), len(merged_matchup_rows),
        )

    # ── Per-meta split (2026-05-24) ────────────────────────────────────────
    # Write the monolithic CSVs out to data/labs_tournament_decks_<META>.csv
    # and data/labs_tournament_matchups_<META>.csv so the next weekly run
    # can skip closed-meta tournaments via the cache logic above.
    logger.info("Per-meta split — decks:")
    _split_labs_by_meta(merged_deck_rows, 'labs_tournament_decks', CSV_FIELDS)
    if args.matchups:
        logger.info("Per-meta split — matchups:")
        _split_labs_by_meta(merged_matchup_rows, 'labs_tournament_matchups', MATCHUP_CSV_HEADER)


if __name__ == '__main__':
    main()
