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
    cleaned = re.sub(r'[\u2013\u2014\-]\d+', '', raw).strip()
    cleaned = ' '.join(cleaned.split())
    for fmt in ('%B %d, %Y', '%b %d, %Y', '%B %d %Y', '%b %d %Y'):
        try:
            return datetime.strptime(cleaned, fmt)
        except ValueError:
            continue
    logger.debug("Could not parse date: %r", raw)
    return None


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
        name_el = link.find(attrs={'class': re.compile(r'font-bold')})
        name = name_el.get_text(strip=True) if name_el else f'Tournament {tournament_id}'

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

        # ── Date (navigable string sibling after flag image) ──────────────────
        date_text = ''
        # The date lives in the same div as the flag image
        date_div = link.find('div', attrs={'class': re.compile(r'flex.*gap')})
        if date_div:
            # Prefer raw text nodes (NavigableString) which are the date
            from bs4 import NavigableString
            for child in date_div.children:
                if isinstance(child, NavigableString):
                    txt = str(child).strip()
                    # Ignore single country codes that leak as text
                    if txt and not re.match(r'^[A-Z]{2}$', txt):
                        date_text = txt
                        break
            # Fallback: full text minus country code
            if not date_text:
                full = date_div.get_text(' ', strip=True)
                date_text = full.replace(country, '').strip()

        date_obj = _parse_date(date_text)
        date_str = date_obj.strftime('%Y-%m-%d') if date_obj else ''

        # ── Filters ───────────────────────────────────────────────────────────
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

    logger.info("  → %d decks, %d total players", len(decks), total_players)
    return decks, total_players


# ── Conversion-rate page parser ──────────────────────────────────────────────

# Column-header → output-key mapping. Limitless may use any subset; missing
# columns just stay at 0.0 in the deck dict. Header text is matched
# case-insensitively after stripping % signs and whitespace.
_CONV_HEADER_KEYS = {
    'top 8 conv':   'top8_conv_rate',
    'top 8 rate':   'top8_conv_rate',
    'top8 conv':    'top8_conv_rate',
    'top 16 conv':  'top16_conv_rate',
    'top 16 rate':  'top16_conv_rate',
    'top16 conv':   'top16_conv_rate',
    'top 32 conv':  'top32_conv_rate',
    'top 32 rate':  'top32_conv_rate',
    'top32 conv':   'top32_conv_rate',
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


def scrape_tournament_conversion(tournament_id: str) -> Dict[str, Dict[str, float]]:
    """
    Fetch labs.limitlesstcg.com/{id}/decks?conversion and return
    { deck_slug: { 'top8_conv_rate': ..., 'top16_conv_rate': ..., 'top32_conv_rate': ... } }.

    Defensive parser: discovers conversion columns from <th> headers.
    On first run logs the headers it found, so any unexpected column
    naming on a future tournament becomes visible. Returns empty dict
    on failure (caller treats missing data as 0.0).
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

    # Map column index → output key based on header text.
    headers_raw = [th.get_text(strip=True) for th in table.select('thead th')]
    logger.info("    Conversion headers: %s", headers_raw)
    col_keys: Dict[int, str] = {}
    for i, h in enumerate(headers_raw):
        norm = h.lower().replace('%', '').strip()
        for hint, key in _CONV_HEADER_KEYS.items():
            if hint in norm:
                col_keys[i] = key
                break

    if not col_keys:
        logger.warning(
            "    No recognised conversion columns in %s — headers were %s. "
            "Add the new header text to _CONV_HEADER_KEYS.", tournament_id, headers_raw
        )
        return {}
    logger.info("    Conversion column mapping: %s", {headers_raw[i]: k for i, k in col_keys.items()})

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
        for idx, key in col_keys.items():
            entry[key] = _parse_pct_to_fraction(cells[idx].get_text(strip=True))
        if entry:
            out[slug] = entry

    logger.info("    Conversion: %d decks parsed", len(out))
    return out


# ── Output ────────────────────────────────────────────────────────────────────

CSV_FIELDS = [
    'tournament_id', 'tournament_name', 'tournament_date',
    'tournament_type', 'country', 'total_players',
    'deck_name', 'deck_slug', 'pokemon',
    'player_count', 'share_pct',
    'wins', 'losses', 'ties', 'win_pct',
    'top8_conv_rate', 'top16_conv_rate', 'top32_conv_rate',
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
        # Single-tournament mode – skip the main page
        tournaments = [{
            'tournament_id'  : args.tournament_id.zfill(4),
            'tournament_name': f'Tournament {args.tournament_id}',
            'tournament_date': '',
            'tournament_type': 'unknown',
            'country'        : '',
        }]
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
