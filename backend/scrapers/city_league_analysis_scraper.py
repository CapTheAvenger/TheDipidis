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
    from bs4 import BeautifulSoup
except ImportError:
    print("FEHLER: beautifulsoup4 fehlt! pip install beautifulsoup4")
    sys.exit(1)

# Import shared scraper utilities
from backend.core.card_scraper_shared import (
    setup_console_encoding, CardDatabaseLookup, 
    aggregate_card_data, save_to_csv, fetch_page, normalize_archetype_name,
    load_scraped_ids, save_scraped_ids, resolve_date_range,
    safe_fetch_html, setup_logging, load_settings, parse_tournament_date,
    extract_cards_from_decklist_soup
)
from backend.settings import get_data_path, get_config_path

# Fix Windows console encoding for Unicode characters
setup_console_encoding()

# ============================================================================
# LOGGING SETUP
# ============================================================================
logger = setup_logging("city_league_scraper")

# Try to import city_league_module for tournament scraping
try:
    from backend.scrapers import city_league_archetype_scraper as city_league_module
    _city_league_available = True
except ImportError as e:
    city_league_module = None
    _city_league_available = False
    logger.warning("City League Module not available: %s", e)

# ============================================================================
# TOURNAMENT TRACKING (Incremental Scraping)
# ============================================================================
def get_scraped_tournaments_file() -> str:
    return str(get_data_path('city_league_analysis_scraped.json'))

from typing import Set, Dict, List, Any

def load_scraped_tournaments() -> Set[str]:
    return load_scraped_ids(get_scraped_tournaments_file())

def save_scraped_tournaments(tournament_ids: Set[str]) -> None:
    save_scraped_ids(get_scraped_tournaments_file(), tournament_ids, 'scraped_tournament_ids')

# ============================================================================
# SETTINGS
# ============================================================================
DEFAULT_SETTINGS: Dict[str, Any] = {
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

def _load_settings() -> Dict[str, Any]:
    return load_settings(
        "city_league_analysis_settings.json", DEFAULT_SETTINGS,
        deep_merge_keys=["sources"], create_if_missing=True
    )

# parse_tournament_date imported from card_scraper_shared

def to_iso_week_period(date_str: str) -> str:
    """Converts a tournament date string to ISO week period (YYYY-Www)."""
    dt = parse_tournament_date(date_str)
    if not dt:
        return "Unknown-Week"
    iso_year, iso_week, _ = dt.isocalendar()
    return f"{iso_year}-W{iso_week:02d}"

def extract_tournament_date_from_html(tournament_html: str, fallback_date: str = "") -> str:
    """Extract tournament date from tournament page (Limitless infobox/header)."""
    if not tournament_html:
        return fallback_date

    soup = BeautifulSoup(tournament_html, 'lxml')

    for info in soup.select('.infobox-line'):
        text = info.get_text(' ', strip=True)
        if not text:
            continue
        candidate = text.split('•')[0].strip()
        if parse_tournament_date(candidate):
            return candidate

    for elem in soup.select('.tournament-header time, .tournament-header .date'):
        candidate = elem.get_text(' ', strip=True)
        if parse_tournament_date(candidate):
            return candidate

    if parse_tournament_date(fallback_date):
        return fallback_date
    return fallback_date or ""

# safe_fetch_html imported from card_scraper_shared

# ============================================================================
# PARSING LOGIC (BeautifulSoup)
# ============================================================================
def extract_cards_from_deck_html(deck_html: str, card_db: CardDatabaseLookup) -> List[Any]:
    """Delegate to shared extraction in card_scraper_shared."""
    soup = BeautifulSoup(deck_html, 'lxml')
    return extract_cards_from_decklist_soup(soup, card_db)

def _fetch_single_deck(deck_url: str, deck_name: str, tournament_date: str, tournament_id: str, card_db, timeout: int) -> dict:
    """Worker Funktion fuer Multithreading."""
    try:
        html = safe_fetch_html(deck_url, timeout)
        if not html:
            return None
        
        cards = extract_cards_from_deck_html(html, card_db)
        if cards:
            return {
                'archetype': normalize_archetype_name(deck_name),
                'cards': cards,
                'source': 'City League',
                'tournament_id': tournament_id,
                'tournament_date': tournament_date,
                'date': tournament_date
            }
    except Exception as e:
        logger.debug("Decklist error (%s): %s", deck_url, e)
    return None

def process_tournament_decklists(
    tournament_html: str,
    max_decklists: int,
    tournament_info: Dict[str, Any],
    request_timeout: int,
    max_workers: int,
    card_db: CardDatabaseLookup
) -> List[Dict[str, Any]]:
    tournament_date = tournament_info.get('date') or tournament_info.get('date_str', '')
    soup = BeautifulSoup(tournament_html, 'lxml')
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
        
    logger.info("   Starte Download von %s Decks (Multithreading)...", len(deck_tasks))
    
    decks = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        tournament_id = str(tournament_info.get('tournament_id') or tournament_info.get('id') or '').strip()
        future_to_deck = {
            executor.submit(_fetch_single_deck, url, name, tournament_date, tournament_id, card_db, request_timeout): url 
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
        logger.info("Lade %s zusaetzliche Turniere via ID...", len(additional_ids))
        for tid in additional_ids:
            try:
                t_info = city_league_module.get_tournament_by_id(str(tid))
                if t_info:
                    tournaments.append(t_info)
            except Exception as e:
                logger.warning("Fehler bei zusaetzlichem Turnier %s: %s", tid, e)

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
    
    logger.info("Zu verarbeiten: %s neue Turniere (Uebersprungen: %s)", len(tournaments), skipped)
    
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
        
        logger.info("   %s Decks extrahiert.", len(decklists))
        all_decks.extend(decklists)
        newly_scraped_ids.add(t_id)
        
        time.sleep(delay_between)

    logger.info("Insgesamt %s Decks aus der City League gesammelt.", len(all_decks))
    
    if newly_scraped_ids:
        save_scraped_tournaments(scraped_ids | newly_scraped_ids)
        logger.info("%s neue Turnier-IDs gespeichert.", len(newly_scraped_ids))

    return all_decks

def main():
    logger.info("=" * 60)
    logger.info("CITY LEAGUE ANALYSIS SCRAPER")
    logger.info("=" * 60)
    
    settings = _load_settings()
    
    logger.info("Lade einheitliche Karten-Datenbank...")
    try:
        card_db = CardDatabaseLookup() 
    except Exception as e:
        logger.error("Konnte Karten-Datenbank nicht laden: %s", e)
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
        
    logger.info("Aggregiere Karten-Daten von %s Decks...", len(all_decks))
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
