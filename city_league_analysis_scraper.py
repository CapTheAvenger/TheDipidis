#!/usr/bin/env python3
"""
City League Analysis Scraper - REVISED
======================================
Scrapes Japanese City League tournament decks and extracts card usage by archetype.

Structure:
1. Fetch City League events from limitlesstcg.com (JP tournaments)
2. Extract deck lists from each tournament (max 16 per league)
3. Parse cards from each deck HTML
4. Aggregate card counts by archetype
5. Output structured CSV

Combines ChatGPT structure + proven limitlesstcg.com scraping logic
"""

import os
import sys
import json
import re
import time
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Tuple
from collections import defaultdict

# Fix Windows console encoding for Unicode characters (✓, ×, •, etc.)
if sys.platform == 'win32':
    if hasattr(sys.stdout, 'reconfigure'):
        try:
            sys.stdout.reconfigure(encoding='utf-8')
        except Exception:
            pass
    if hasattr(sys.stderr, 'reconfigure'):
        try:
            sys.stderr.reconfigure(encoding='utf-8')
        except Exception:
            pass

# Import shared scraper utilities
from card_scraper_shared import (
    get_app_path, get_data_dir, CardDatabaseLookup, 
    aggregate_card_data, save_to_csv, fetch_page, normalize_archetype_name
)

# Try to import city_league_module for tournament scraping
try:
    import city_league_archetype_scraper as city_league_module
    _city_league_available = True
except Exception as e:
    city_league_module = None
    _city_league_available = False


# ============================================================================
# TOURNAMENT TRACKING (Incremental Scraping)
# ============================================================================

def get_scraped_tournaments_file() -> str:
    """Get path to scraped tournaments tracking file."""
    data_dir = get_data_dir()
    return os.path.join(data_dir, 'city_league_analysis_scraped.json')


def load_scraped_tournaments() -> set:
    """Load set of already scraped tournament IDs."""
    tracking_file = get_scraped_tournaments_file()
    
    if not os.path.exists(tracking_file):
        return set()
    
    try:
        with open(tracking_file, 'r', encoding='utf-8-sig') as f:
            data = json.load(f)
            return set(data.get('scraped_tournament_ids', []))
    except Exception as e:
        print(f"Warning: Could not load scraped tournaments: {e}")
        return set()


def save_scraped_tournaments(tournament_ids: set) -> None:
    """Save set of scraped tournament IDs to tracking file."""
    tracking_file = get_scraped_tournaments_file()
    
    try:
        data = {
            'scraped_tournament_ids': sorted(list(tournament_ids)),
            'last_updated': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        }
        with open(tracking_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Warning: Could not save scraped tournaments: {e}")


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
            "request_timeout": 20,
            "max_retries": 2,
            "retry_delay": 1.0
        }
    },
    "output_file": "city_league_analysis.csv",
    "append_mode": True,
    "delay_between_requests": 1.5,
    "_comment": "Scrapes City League tournaments and extracts card data by archetype. append_mode=True keeps old tournament dates when adding new data."
}


def load_settings() -> Dict:
    """Load settings from city_league_analysis_settings.json."""
    app_path = get_app_path()
    settings_path = os.path.join(app_path, 'city_league_analysis_settings.json')
    
    print(f"Loading settings from: {settings_path}")
    
    if os.path.exists(settings_path):
        try:
            with open(settings_path, 'r', encoding='utf-8') as f:
                settings = json.load(f)
                print(f"Settings loaded successfully")
                for key, value in DEFAULT_SETTINGS.items():
                    if key not in settings:
                        settings[key] = value
                # Deep-merge nested source defaults
                if 'sources' in DEFAULT_SETTINGS:
                    settings.setdefault('sources', {})
                    for source_key, source_defaults in DEFAULT_SETTINGS['sources'].items():
                        settings['sources'].setdefault(source_key, {})
                        for s_key, s_val in source_defaults.items():
                            if s_key not in settings['sources'][source_key]:
                                settings['sources'][source_key][s_key] = s_val
                return settings
        except (json.JSONDecodeError, IOError) as e:
            print(f"Error loading settings: {e}")
            return DEFAULT_SETTINGS.copy()
    else:
        print(f"Settings file not found. Creating new file with defaults.")
        with open(settings_path, 'w', encoding='utf-8') as f:
            json.dump(DEFAULT_SETTINGS, f, indent=4)
        return DEFAULT_SETTINGS.copy()


def resolve_date_range(start_date: str, end_date: str) -> Tuple[datetime, datetime]:
    """Resolve date range from string format (DD.MM.YYYY or 'auto')."""
    try:
        start_dt = datetime.strptime(start_date, "%d.%m.%Y")
    except:
        start_dt = datetime.now() - timedelta(days=30)
    
    if end_date == "auto":
        end_dt = datetime.now() - timedelta(days=2)
    else:
        try:
            end_dt = datetime.strptime(end_date, "%d.%m.%Y")
        except:
            end_dt = datetime.now() - timedelta(days=2)
    
    return start_dt, end_dt


def safe_fetch(url: str, timeout: int, retries: int, retry_delay: float) -> str:
    """Fetch a URL with retries and a configurable timeout."""
    attempts = retries + 1
    for attempt in range(1, attempts + 1):
        print(f"  Fetching: {url} (attempt {attempt}/{attempts})", flush=True)
        html = fetch_page(url, timeout=timeout)
        if html:
            return html
        print(f"  [WARN] Fetch failed (attempt {attempt}/{attempts}): {url}")
        time.sleep(retry_delay)
    return ""


def fetch_city_league_tournaments(start_dt: datetime, end_dt: datetime) -> List[Dict[str, Any]]:
    """
    Fetch City League tournaments from limitlesstcg.com for given date range.
    Uses city_league_module to get tournament list.
    """
    if not _city_league_available or not city_league_module:
        print("ERROR: City League module not available")
        return []
    
    print("Fetching City League tournaments...")
    tournaments = city_league_module.get_tournaments_in_date_range("jp", start_dt, end_dt, 1.5)
    print(f"Found {len(tournaments)} tournaments in date range")
    
    return tournaments


def extract_cards_from_deck_html(deck_html: str, card_db: CardDatabaseLookup) -> List[Dict[str, Any]]:
    """
    Extract Pokemon, Trainer, and Energy cards from a deck HTML page.
    Returns list of cards with: name, count, set_code, set_number
    """
    cards = []
    
    # ========== POKEMON CARDS ==========
    pokemon_section = re.search(
        r'<div class="decklist-column-heading">Pokémon[^<]*</div>(.*?)(?=<div class="decklist-column-heading"|$)',
        deck_html, re.DOTALL | re.IGNORECASE
    )
    
    if pokemon_section:
        pokemon_cards = re.findall(
            r'<div[^>]+class="decklist-card"[^>]+data-set="([^"]+)"[^>]+data-number="([^"]+)"[^>]*>.*?'
            r'<span class="card-count">([^<]+)</span>\s*<span class="card-name">([^<]+)</span>',
            pokemon_section.group(1), re.DOTALL | re.IGNORECASE
        )
        
        for set_code, set_number, count, card_name in pokemon_cards:
            cards.append({
                'name': card_name.strip(),
                'count': int(float(count)),
                'set_code': set_code.strip(),
                'set_number': set_number.strip()
            })
    
    # ========== TRAINER CARDS ==========
    trainer_section = re.search(
        r'<div class="decklist-column-heading">Trainer[^<]*</div>(.*?)(?=<div class="decklist-column-heading"|$)',
        deck_html, re.DOTALL | re.IGNORECASE
    )
    
    if trainer_section:
        trainer_cards = re.findall(
            r'<div[^>]+class="decklist-card"[^>]*>.*?<span class="card-count">([^<]+)</span>\s*<span class="card-name">([^<]+)</span>',
            trainer_section.group(1), re.DOTALL | re.IGNORECASE
        )
        
        for count, card_name in trainer_cards:
            card_name = card_name.strip()
            latest_card = card_db.get_latest_low_rarity_version(card_name)
            if latest_card:
                cards.append({
                    'name': card_name,
                    'count': int(float(count)),
                    'set_code': latest_card.set_code,
                    'set_number': latest_card.number
                })
    
    # ========== ENERGY CARDS ==========
    energy_section = re.search(
        r'<div class="decklist-column-heading">Energy[^<]*</div>(.*?)(?=<div class="decklist-column"|$)',
        deck_html, re.DOTALL | re.IGNORECASE
    )
    
    if energy_section:
        energy_cards = re.findall(
            r'<div[^>]+class="decklist-card"[^>]*>.*?<span class="card-count">([^<]+)</span>\s*<span class="card-name">([^<]+)</span>',
            energy_section.group(1), re.DOTALL | re.IGNORECASE
        )
        
        for count, card_name in energy_cards:
            card_name = card_name.strip()
            latest_card = card_db.get_latest_low_rarity_version(card_name)
            if latest_card:
                cards.append({
                    'name': card_name,
                    'count': int(float(count)),
                    'set_code': latest_card.set_code,
                    'set_number': latest_card.number
                })
    
    return cards


def process_tournament_decklists(
    tournament_html: str,
    max_decklists: int,
    tournament_info: Dict[str, Any],
    delay: float,
    request_timeout: int,
    max_retries: int,
    retry_delay: float,
    card_db: CardDatabaseLookup
) -> List[Dict[str, Any]]:
    """
    Process a single tournament's decklists.
    Extract deck links and names from tournament page, then fetch and parse each deck.
    """
    tournament_id = tournament_info.get('tournament_id') or tournament_info.get('id', 'unknown')
    tournament_date = tournament_info.get('date_str', '')
    decks = []
    
    # Find all table rows (structure: rank | pokemon images | name/points | link)
    rows = re.findall(r'<tr[^>]*>(.*?)</tr>', tournament_html, re.DOTALL | re.IGNORECASE)
    
    list_links = []
    deck_names = []
    
    for row in rows:
        if '<th' in row.lower():  # Skip header rows
            continue
        
        # Extract deck name from pokemon img alt attributes
        img_alts = re.findall(r'<img[^>]+class="pokemon"[^>]+alt="([^"]+)"', row, re.IGNORECASE)
        if img_alts:
            deck_name = ' '.join(word.title() for word in img_alts)
        else:
            deck_name = "Unknown"
        
        # Extract deck list link (supports multiple formats):
        # - /decks/list/jp/123 (Japanese tournaments)
        # - /decks/list/24428 (Champions League, special events)
        # - Links behind FontAwesome icons (<i class="fa-list-alt">)
        link_match = re.search(r'<a[^>]+href="(?:https://limitlesstcg\.com)?(/decks/list/(?:jp/)?(\d+))"', row)
        if not link_match:
            # Try alternative pattern: find fa-list-alt icon and extract href from parent <a> tag
            icon_match = re.search(r'<a[^>]+href="(/decks/list/(?:jp/)?(\d+))"[^>]*>.*?<i[^>]*fa-list-alt', row, re.DOTALL)
            if icon_match:
                link_match = icon_match
        
        if link_match:
            list_links.append(link_match.group(1))
            deck_names.append(deck_name)
    
    if not list_links:
        return decks
    
    # Limit to max decklists
    list_links = list_links[:max_decklists]
    deck_names = deck_names[:max_decklists]
    print(f"  Found {len(list_links)} decklist links", flush=True)
    
    # Process each decklist
    for list_url_suffix, deck_name in zip(list_links, deck_names):
        try:
            # Build absolute URL
            if list_url_suffix.startswith('http'):
                deck_url = list_url_suffix
            else:
                deck_url = f"https://limitlesstcg.com{list_url_suffix}"
            
            # Fetch deck HTML
            deck_html = safe_fetch(deck_url, request_timeout, max_retries, retry_delay)
            if not deck_html:
                continue
            
            # Extract cards
            cards = extract_cards_from_deck_html(deck_html, card_db)
            
            if cards:
                decks.append({
                    'archetype': normalize_archetype_name(deck_name),
                    'cards': cards,
                    'source': 'City League',
                    'tournament_date': tournament_date
                })
            
            time.sleep(0.3)
        
        except Exception as e:
            print(f"  [WARN] Decklist error (tournament {tournament_id}): {e}", flush=True)
            continue
    
    return decks


def scrape_city_league(settings: Dict[str, Any], card_db: CardDatabaseLookup) -> List[Dict[str, Any]]:
    """
    Main City League scraping orchestration.
    Fetch tournaments → process decklists → extract cards → return all decks
    """
    print("\n" + "="*60, flush=True)
    print("SCRAPING CITY LEAGUE DATA", flush=True)
    print("="*60, flush=True)
    
    config = settings.get('sources', {}).get('city_league', {})
    
    if not config.get('enabled', False):
        print("City League disabled in settings - skipping")
        return []
    
    start_date_str = config.get('start_date', '24.01.2026')
    end_date_str = config.get('end_date', 'auto')
    max_decklists = config.get('max_decklists_per_league', 16)
    max_tournaments = config.get('max_tournaments', 0)
    request_timeout = config.get('request_timeout', 20)
    max_retries = config.get('max_retries', 2)
    retry_delay = config.get('retry_delay', 1.0)
    delay = settings.get('delay_between_requests', 1.5)
    additional_ids = config.get('additional_tournament_ids', [])
    
    # Resolve date range
    start_dt, end_dt = resolve_date_range(start_date_str, end_date_str)
    print(f"Date range: {start_dt.strftime('%d.%m.%Y')} to {end_dt.strftime('%d.%m.%Y')}", flush=True)
    print(f"Max decklists per league: {max_decklists}", flush=True)
    if max_tournaments and max_tournaments > 0:
        print(f"Max tournaments: {max_tournaments}")
    if additional_ids:
        print(f"Additional tournaments: {', '.join(str(id) for id in additional_ids)}", flush=True)
    
    # Fetch tournaments
    tournaments = fetch_city_league_tournaments(start_dt, end_dt)
    
    # Add additional tournaments by ID (e.g., Champions League)
    if additional_ids and _city_league_available and city_league_module:
        print(f"\nFetching {len(additional_ids)} additional tournament(s) by ID...", flush=True)
        for tournament_id in additional_ids:
            try:
                tournament_info = city_league_module.get_tournament_by_id(
                    str(tournament_id),
                    delay
                )
                if tournament_info:
                    tournaments.append(tournament_info)
                    print(f"  ✓ Added tournament {tournament_id}", flush=True)
                else:
                    print(f"  ✗ Failed to fetch tournament {tournament_id}", flush=True)
            except Exception as e:
                print(f"  ✗ Error fetching tournament {tournament_id}: {e}", flush=True)
    
    if not tournaments:
        print("No tournaments found", flush=True)
        return []

    if max_tournaments and max_tournaments > 0:
        tournaments = tournaments[:max_tournaments]
        print(f"Limiting to {len(tournaments)} tournaments for this run")
    
    # Load already scraped tournaments for incremental scraping
    scraped_ids = load_scraped_tournaments()
    print(f"Found {len(scraped_ids)} already scraped tournaments", flush=True)
    
    # Filter out already scraped tournaments
    new_tournaments = []
    for t in tournaments:
        tid = str(t.get('tournament_id') or t.get('id', ''))
        if tid and tid not in scraped_ids:
            new_tournaments.append(t)
        elif tid:
            # Tournament already scraped, skip
            pass
    
    skipped_count = len(tournaments) - len(new_tournaments)
    tournaments = new_tournaments
    
    if skipped_count > 0:
        print(f"📊 Tournaments to scrape: {len(tournaments)} new (skipping {skipped_count} already scraped)", flush=True)
    else:
        print(f"📊 Tournaments to scrape: {len(tournaments)} (no previously scraped tournaments found)", flush=True)
    
    if not tournaments:
        print("All tournaments already scraped! No new data to collect.", flush=True)
        return []
    
    # Process each tournament
    all_decks = []
    newly_scraped_ids = set()
    total_tournaments = len(tournaments)
    print(f"\nStarting tournament processing for {total_tournaments} new tournaments...", flush=True)
    
    for i, tournament in enumerate(tournaments, 1):
        tournament_id = tournament.get('tournament_id') or tournament.get('id', 'unknown')
        tournament_name = (
            tournament.get('shop')
            or tournament.get('prefecture')
            or tournament.get('name')
            or tournament.get('location')
            or 'Tournament'
        )
        print(f"[{i}/{total_tournaments}] Processing {tournament_name} (ID: {tournament_id})", flush=True)
        
        try:
            tournament_url = tournament.get('url', '')
            if not tournament_url:
                print(f"  [WARN] Missing tournament URL (ID: {tournament_id})", flush=True)
                continue
            
            # Fetch tournament page
            html = safe_fetch(tournament_url, request_timeout, max_retries, retry_delay)
            if not html:
                print(f"  [WARN] Failed to fetch tournament page (ID: {tournament_id})", flush=True)
                continue
            print(f"  Tournament page size: {len(html)} chars", flush=True)
            
            # Process decklists
            decklists = process_tournament_decklists(
                html,
                max_decklists,
                tournament,
                delay,
                request_timeout,
                max_retries,
                retry_delay,
                card_db
            )
            print(f"  Extracted {len(decklists)} decklists", flush=True)
            all_decks.extend(decklists)
            
            # Track successfully scraped tournament
            newly_scraped_ids.add(str(tournament_id))
            
            time.sleep(delay)
        
        except Exception as e:
            print(f"  [WARN] Tournament error (ID: {tournament_id}): {e}", flush=True)
            continue
    
    print(f"✓ Collected {len(all_decks)} complete decks from City League", flush=True)
    
    # Save newly scraped tournament IDs
    if newly_scraped_ids:
        all_scraped_ids = scraped_ids | newly_scraped_ids
        save_scraped_tournaments(all_scraped_ids)
        print(f"✓ Saved {len(newly_scraped_ids)} new tournament IDs to tracking file", flush=True)
        print(f"  Total tracked tournaments: {len(all_scraped_ids)}", flush=True)
    
    return all_decks


# ============================================================================
# MAIN EXECUTION
# ============================================================================

def main():
    """Main scraper orchestration."""
    
    print("=" * 60)
    print("CITY LEAGUE ANALYSIS SCRAPER")
    print("=" * 60)
    
    # Load settings
    settings = load_settings()
    
    # Initialize Card Database (now uses unified CardDataManager)
    print("Loading unified card database (English + Japanese)...")
    try:
        card_db = CardDatabaseLookup()  # Auto-loads from CardDataManager
    except Exception as e:
        print(f"\nERROR: Could not load card database: {e}")
        print("Make sure CardDataManager and databases are properly configured.")
        print("To setup databases, run: python update_cards.py --type english --mode full")
        input("\nPress Enter to exit...")
        return
    
    if not card_db.cards:
        print("\nERROR: Failed to load card database!")
        input("\nPress Enter to exit...")
        return
    
    # Scrape City League
    all_decks = scrape_city_league(settings, card_db)
    
    if not all_decks:
        print("\nNo decks found. Please check your settings and try again.")
        input("\nPress Enter to exit...")
        return
    
    # Add meta field for tracking
    for deck in all_decks:
        deck['meta'] = 'City League'
    
    # Aggregate card data
    print(f"\nAggregating card data from {len(all_decks)} decks...")
    aggregated_data = aggregate_card_data(all_decks, card_db)
    
    # Save to CSV
    output_file = settings.get('output_file', 'city_league_analysis.csv')
    append_mode = settings.get('append_mode', True)
    save_to_csv(aggregated_data, output_file, append_mode=append_mode)
    
    print("\n" + "="*60)
    print("SCRAPING COMPLETE!")
    print("="*60)
    input("\nPress Enter to exit...")


if __name__ == "__main__":
    try:
        print("[START] City League Analysis starting...")
        main()
        print("\n[SUCCESS] Analysis completed successfully!")
    except KeyboardInterrupt:
        print("\n\n[INTERRUPTED] Analysis interrupted by user.")
    except Exception as e:
        print(f"\n[ERROR] Unexpected error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        input("\nPress Enter to exit...")
