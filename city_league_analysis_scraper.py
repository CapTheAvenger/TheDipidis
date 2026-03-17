#!/usr/bin/env python3
"""
City League Analysis Scraper - FAST EDITION
===========================================
- Multithreaded deck fetching (concurrent.futures).
- Cloudscraper to bypass Cloudflare blocks on limitlesstcg.com.
- BeautifulSoup4 for robust HTML parsing instead of fragile Regex.
- Professional logging integrated.
"""

import os
import sys
import json
import time
import logging
import threading
import concurrent.futures
from datetime import datetime, timedelta
from collections import defaultdict
import re

try:
    import cloudscraper
    from bs4 import BeautifulSoup
except ImportError:
    print("FEHLER: Es fehlen Bibliotheken! Bitte installiere sie mit:")
    print("pip install cloudscraper beautifulsoup4")
    sys.exit(1)

# Import shared scraper utilities
from card_scraper_shared import (
    setup_console_encoding, get_app_path, get_data_dir, CardDatabaseLookup, 
    aggregate_card_data, save_to_csv, fetch_page, normalize_archetype_name,
    load_scraped_ids, save_scraped_ids
)

# Fix Windows console encoding for Unicode characters
setup_console_encoding()

# ============================================================================
# LOGGING SETUP
# ============================================================================
data_dir = get_data_dir()
os.makedirs(data_dir, exist_ok=True)
log_file = os.path.join(data_dir, 'city_league_scraper.log')

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[
        logging.FileHandler(log_file, encoding='utf-8'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# Try to import city_league_module for tournament scraping
try:
    import city_league_archetype_scraper as city_league_module
    _city_league_available = True
except ImportError as e:
    city_league_module = None
    _city_league_available = False
    logger.warning(f"City League Module not available: {e}")

# ============================================================================
# TOURNAMENT TRACKING (Incremental Scraping)
# ============================================================================
def get_scraped_tournaments_file() -> str:
    return os.path.join(get_data_dir(), 'city_league_analysis_scraped.json')

def load_scraped_tournaments() -> set:
    return load_scraped_ids(get_scraped_tournaments_file())

def save_scraped_tournaments(tournament_ids: set) -> None:
    save_scraped_ids(get_scraped_tournaments_file(), tournament_ids, 'scraped_tournament_ids')

# ============================================================================
# SETTINGS
# ============================================================================
DEFAULT_SETTINGS = {
    "sources": {
        "city_league": {
            "enabled": True,
            "start_date": "24.01.2026",
            "end_date": "auto",
            "max_decklists_per_league": 16,
            "max_tournaments": 0,
            "additional_tournament_ids": [],
            "max_workers": 5,
            "request_timeout": 20,
            "max_retries": 2,
            "retry_delay": 1.0
        }
    },
    "output_file": "city_league_analysis.csv",
    "append_mode": True,
    "delay_between_requests": 1.5,
    "_comment": "Scrapes City League tournaments and extracts card data by archetype."
}

def load_settings() -> dict:
    app_path = get_app_path()
    settings_path = os.path.join(app_path, 'city_league_analysis_settings.json')
    
    if os.path.exists(settings_path):
        try:
            with open(settings_path, 'r', encoding='utf-8-sig') as f:
                settings = json.load(f)
                logger.info("Settings loaded successfully")
                
                # Merge defaults
                for key, value in DEFAULT_SETTINGS.items():
                    if key not in settings:
                        settings[key] = value
                if 'sources' in DEFAULT_SETTINGS:
                    settings.setdefault('sources', {})
                    for source_key, source_defaults in DEFAULT_SETTINGS['sources'].items():
                        settings['sources'].setdefault(source_key, {})
                        for s_key, s_val in source_defaults.items():
                            if s_key not in settings['sources'][source_key]:
                                settings['sources'][source_key][s_key] = s_val
                return settings
        except Exception as e:
            logger.error(f"Error loading settings: {e}")
            return DEFAULT_SETTINGS.copy()
    else:
        logger.info("Settings file not found. Creating new file with defaults.")
        with open(settings_path, 'w', encoding='utf-8') as f:
            json.dump(DEFAULT_SETTINGS, f, indent=4)
        return DEFAULT_SETTINGS.copy()

def resolve_date_range(start_date: str, end_date: str):
    try:
        start_dt = datetime.strptime(start_date, "%d.%m.%Y")
    except Exception:
        start_dt = datetime.now() - timedelta(days=30)
    
    if end_date == "auto":
        end_dt = datetime.now() - timedelta(days=2)
    else:
        try:
            end_dt = datetime.strptime(end_date, "%d.%m.%Y")
        except Exception:
            end_dt = datetime.now() - timedelta(days=2)
            
    return start_dt, end_dt

def parse_limitless_tournament_date(date_str: str):
    """Parses Limitless date formats like '15 Mar 26' or '15th March 2026'."""
    if not date_str:
        return None
    raw = str(date_str).strip()
    if not raw:
        return None
    try:
        return datetime.strptime(raw, "%d %b %y")
    except ValueError:
        try:
            clean_date = re.sub(r'(\d+)(st|nd|rd|th)', r'\1', raw, flags=re.IGNORECASE)
            return datetime.strptime(clean_date.strip(), "%d %B %Y")
        except ValueError:
            return None

def to_iso_week_period(date_str: str) -> str:
    """Converts a tournament date string to ISO week period (YYYY-Www)."""
    dt = parse_limitless_tournament_date(date_str)
    if not dt:
        return "Unknown-Week"
    iso_year, iso_week, _ = dt.isocalendar()
    return f"{iso_year}-W{iso_week:02d}"

def extract_tournament_date_from_html(tournament_html: str, fallback_date: str = "") -> str:
    """Extract tournament date from tournament page (Limitless infobox/header)."""
    if not tournament_html:
        return fallback_date

    soup = BeautifulSoup(tournament_html, 'html.parser')

    for info in soup.select('.infobox-line'):
        text = info.get_text(' ', strip=True)
        if not text:
            continue
        candidate = text.split('•')[0].strip()
        if parse_limitless_tournament_date(candidate):
            return candidate

    for elem in soup.select('.tournament-header time, .tournament-header .date'):
        candidate = elem.get_text(' ', strip=True)
        if parse_limitless_tournament_date(candidate):
            return candidate

    if parse_limitless_tournament_date(fallback_date):
        return fallback_date
    return fallback_date or ""

# ============================================================================
# CLOUDSCRAPER MULTITHREADING SETUP
# ============================================================================
_thread_local = threading.local()

def _get_scraper() -> cloudscraper.CloudScraper:
    if not hasattr(_thread_local, "scraper"):
        _thread_local.scraper = cloudscraper.create_scraper(browser={'browser': 'chrome', 'platform': 'windows', 'mobile': False})
    return _thread_local.scraper

def safe_fetch_html(url: str, timeout: int, retries: int, retry_delay: float) -> str:
    """Laedt HTML via Cloudscraper fuer Main-Threads (Turnierseiten)."""
    scraper = _get_scraper()
    for attempt in range(1, retries + 2):
        try:
            resp = scraper.get(url, timeout=timeout)
            resp.raise_for_status()
            return resp.text
        except Exception as e:
            if attempt <= retries:
                logger.debug(f"Fetch failed (attempt {attempt}/{retries+1}): {url}. Retrying in {retry_delay}s...")
                time.sleep(retry_delay)
            else:
                logger.warning(f"Failed to fetch {url} after {retries+1} attempts: {e}")
    return ""

# ============================================================================
# PARSING LOGIC (BeautifulSoup)
# ============================================================================
def extract_cards_from_deck_html(deck_html: str, card_db: CardDatabaseLookup) -> list:
    """
    Extrahiert Karten mit 100%iger Genauigkeit bei Set-Erkennung.
    Priorität für Pokémon-Karten:
    1. href-Link (/cards/twm/128 -> TWM 128)
    2. data-set/data-number Attribute
    3. <span class=\"set\"> oder <span class=\"card-set\">
    Für Trainer/Energy: CardDB Lookup
    """
    soup = BeautifulSoup(deck_html, 'html.parser')
    cards = []
    
    for column in soup.select('.decklist-column'):
        heading_elem = column.select_one('.decklist-column-heading')
        if not heading_elem:
            continue
            
        category = heading_elem.get_text(strip=True).lower()
        
        # Bestimme Kartentyp (Pokémon erkennen über inverse Logik)
        is_trainer = 'trainer' in category
        is_energy = 'energy' in category
        is_pokemon = not is_trainer and not is_energy
        
        for card_div in column.select('.decklist-card'):
            count_elem = card_div.select_one('.card-count')
            name_elem = card_div.select_one('.card-name')
            
            if not count_elem or not name_elem:
                continue
                
            try:
                count = int(count_elem.get_text(strip=True))
                card_name = name_elem.get_text(strip=True)
            except ValueError:
                continue
            
            set_code, set_number = "", ""
            
            if is_pokemon:
                # METHODE 1: Aus href-Link extrahieren (höchste Priorität)
                link_elem = card_div.find('a', href=True) or name_elem.find('a', href=True)
                if link_elem:
                    href = link_elem.get('href', '')
                    # Pattern: /cards/SET/NUMBER oder /cards/format/SET/NUMBER
                    parts = href.split('/cards/')[-1].split('/')
                    if len(parts) >= 3:
                        set_code, set_number = parts[1].upper(), parts[2]
                    elif len(parts) == 2:
                        set_code, set_number = parts[0].upper(), parts[1]
                
                # METHODE 2: data-set/data-number Attribute
                if not set_code or not set_number:
                    set_code = card_div.get('data-set', '').strip().upper()
                    set_number = card_div.get('data-number', '').strip()
                
                # METHODE 3: <span class="set"> oder <span class="card-set">
                if not set_code or not set_number:
                    set_span = card_div.find('span', class_=['set', 'card-set'])
                    if set_span:
                        set_text = set_span.get_text(strip=True)
                        import re as re_module
                        match = re_module.match(r'([A-Z0-9]+)[\s-]+([0-9]+)', set_text, re_module.IGNORECASE)
                        if match:
                            set_code, set_number = match.group(1).upper(), match.group(2)
                
                # Nur wenn Set gefunden wurde, Karte hinzufügen
                if set_code and set_number:
                    cards.append({
                        'name': card_name,
                        'count': count,
                        'set_code': set_code,
                        'set_number': set_number
                    })
            else:
                # Trainer oder Energy: CardDB Lookup
                latest_card = card_db.get_latest_low_rarity_version(card_name)
                if latest_card:
                    cards.append({
                        'name': card_name,
                        'count': count,
                        'set_code': latest_card.set_code,
                        'set_number': latest_card.number
                    })
    return cards

def _fetch_single_deck(deck_url: str, deck_name: str, tournament_date: str, card_db, timeout: int) -> dict:
    """Worker Funktion fuer Multithreading."""
    scraper = _get_scraper()
    try:
        response = scraper.get(deck_url, timeout=timeout)
        response.raise_for_status()
        
        cards = extract_cards_from_deck_html(response.text, card_db)
        if cards:
            return {
                'archetype': normalize_archetype_name(deck_name),
                'cards': cards,
                'source': 'City League',
                'tournament_date': tournament_date,
                'date': tournament_date
            }
    except Exception as e:
        logger.debug(f"Decklist error ({deck_url}): {e}")
    return None

def process_tournament_decklists(
    tournament_html: str,
    max_decklists: int,
    tournament_info: dict,
    request_timeout: int,
    max_workers: int,
    card_db: CardDatabaseLookup
) -> list:
    tournament_date = tournament_info.get('date') or tournament_info.get('date_str', '')
    soup = BeautifulSoup(tournament_html, 'html.parser')
    deck_tasks = []
    
    rows = [tr for tr in soup.select('table tr') if tr.find('td')]
    for row in rows:
        # Archetype Name
        img_tags = row.select('img.pokemon')
        deck_name = ' '.join(img['alt'].title() for img in img_tags if img.has_attr('alt')) or "Unknown"
        
        # Link finden
        link_tag = row.select_one('a[href*="/decks/list/"]')
        if not link_tag:
            icon = row.select_one('i.fa-list-alt')
            if icon:
                link_tag = icon.find_parent('a')
                
        if link_tag and link_tag.has_attr('href'):
            href = link_tag['href']
            deck_url = href if href.startswith('http') else f"https://limitlesstcg.com{href}"
            deck_tasks.append((deck_url, deck_name))
            
    deck_tasks = deck_tasks[:max_decklists]
    if not deck_tasks:
        return []
        
    logger.info(f"   Starte Download von {len(deck_tasks)} Decks (Multithreading)...")
    
    decks = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_deck = {
            executor.submit(_fetch_single_deck, url, name, tournament_date, card_db, request_timeout): url 
            for url, name in deck_tasks
        }
        
        for future in concurrent.futures.as_completed(future_to_deck):
            result = future.result()
            if result:
                decks.append(result)
                
    return decks

# ============================================================================
# MAIN ORCHESTRATION
# ============================================================================
def scrape_city_league(settings: dict, card_db: CardDatabaseLookup) -> list:
    logger.info("="*60)
    logger.info("SCRAPING CITY LEAGUE DATA")
    logger.info("="*60)
    
    config = settings.get('sources', {}).get('city_league', {})
    
    if not config.get('enabled', False):
        logger.info("City League disabled in settings - skipping")
        return []
    
    start_dt, end_dt = resolve_date_range(config.get('start_date', '24.01.2026'), config.get('end_date', 'auto'))
    logger.info(f"Date range: {start_dt.strftime('%d.%m.%Y')} to {end_dt.strftime('%d.%m.%Y')}")
    
    if not _city_league_available:
        logger.error("City League module not available")
        return []
        
    logger.info("Lade Turnier-Liste...")
    tournaments = city_league_module.get_tournaments_in_date_range("jp", start_dt, end_dt)
    
    additional_ids = config.get('additional_tournament_ids', [])
    if additional_ids:
        logger.info(f"Lade {len(additional_ids)} zusaetzliche Turniere via ID...")
        for tid in additional_ids:
            try:
                t_info = city_league_module.get_tournament_by_id(str(tid))
                if t_info:
                    tournaments.append(t_info)
            except Exception as e:
                logger.warning(f"Fehler bei zusaetzlichem Turnier {tid}: {e}")

    if not tournaments:
        logger.info("Keine Turniere gefunden.")
        return []

    max_tournaments = config.get('max_tournaments', 0)
    if max_tournaments > 0:
        tournaments = tournaments[:max_tournaments]

    scraped_ids = load_scraped_tournaments()
    new_tournaments = [t for t in tournaments if str(t.get('tournament_id') or t.get('id', '')) not in scraped_ids]
    
    skipped = len(tournaments) - len(new_tournaments)
    tournaments = new_tournaments
    
    logger.info(f"Zu verarbeiten: {len(tournaments)} neue Turniere (Uebersprungen: {skipped})")
    
    if not tournaments:
        logger.info("Alle Turniere wurden bereits verarbeitet!")
        return []

    all_decks = []
    newly_scraped_ids = set()
    total = len(tournaments)
    
    max_decklists = config.get('max_decklists_per_league', 16)
    max_workers = config.get('max_workers', 5)
    request_timeout = config.get('request_timeout', 20)
    max_retries = config.get('max_retries', 2)
    retry_delay = config.get('retry_delay', 1.0)
    delay_between = settings.get('delay_between_requests', 1.5)

    for i, tournament in enumerate(tournaments, 1):
        t_id = str(tournament.get('tournament_id') or tournament.get('id', 'unknown'))
        t_name = tournament.get('shop') or tournament.get('name') or 'Tournament'
        t_date = tournament.get('date') or tournament.get('date_str') or ''
        tournament['date'] = t_date
        
        logger.info(f"[{i}/{total}] Lade {t_name} (ID: {t_id}, Datum: {t_date or 'n/a'})")
        
        t_url = tournament.get('url', '')
        if not t_url:
            continue
        
        html = safe_fetch_html(t_url, request_timeout, max_retries, retry_delay)
        if not html:
            continue

        extracted_tournament_date = extract_tournament_date_from_html(html, t_date)
        tournament['date'] = extracted_tournament_date
        tournament['date_str'] = extracted_tournament_date
        
        decklists = process_tournament_decklists(
            html, max_decklists, tournament, request_timeout, max_workers, card_db
        )
        
        logger.info(f"   {len(decklists)} Decks extrahiert.")
        all_decks.extend(decklists)
        newly_scraped_ids.add(t_id)
        
        time.sleep(delay_between)

    logger.info(f"Insgesamt {len(all_decks)} Decks aus der City League gesammelt.")
    
    if newly_scraped_ids:
        save_scraped_tournaments(scraped_ids | newly_scraped_ids)
        logger.info(f"{len(newly_scraped_ids)} neue Turnier-IDs gespeichert.")

    return all_decks

def main():
    logger.info("=" * 60)
    logger.info("CITY LEAGUE ANALYSIS SCRAPER")
    logger.info("=" * 60)
    
    settings = load_settings()
    
    logger.info("Lade einheitliche Karten-Datenbank...")
    try:
        card_db = CardDatabaseLookup() 
    except Exception as e:
        logger.error(f"Konnte Karten-Datenbank nicht laden: {e}")
        return
        
    if not card_db.cards:
        logger.error("Karten-Datenbank ist leer!")
        return
        
    all_decks = scrape_city_league(settings, card_db)
    
    if not all_decks:
        logger.info("Keine Decks gefunden/verarbeitet.")
        return
        
    for deck in all_decks:
        deck['meta'] = 'City League'
        if 'date' not in deck:
            deck['date'] = deck.get('tournament_date', '')
        
    logger.info(f"Aggregiere Karten-Daten von {len(all_decks)} Decks...")
    aggregated_data = aggregate_card_data(all_decks, card_db, group_by_tournament_date=True)
    
    output_file = settings.get('output_file', 'city_league_analysis.csv')
    append_mode = settings.get('append_mode', True)
    
    save_to_csv(aggregated_data, output_file, append_mode=append_mode)
    
    logger.info("="*60)
    logger.info("SCRAPING KOMPLETT!")
    logger.info("="*60)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logger.warning("Scraper durch Benutzer abgebrochen.")
    except Exception as e:
        logger.critical(f"Unerwarteter Fehler: {e}", exc_info=True)
    finally:
        pass
