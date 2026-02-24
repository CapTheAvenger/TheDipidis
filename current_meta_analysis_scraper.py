#!/usr/bin/env python3
"""
Current Meta Analysis Scraper
=============================
Combines Limitless Online (Meta Live) and Play! Tournaments (Meta Play!).
Outputs card usage by archetype with shared aggregation logic.
"""

import os
import sys
import json
import re
import time
import urllib.request
from datetime import datetime
from typing import Dict, List, Any, Optional

from card_scraper_shared import (
    get_app_path,
    get_data_dir,
    CardDatabaseLookup,
    aggregate_card_data,
    save_to_csv,
    fetch_page,
    normalize_archetype_name,
    parse_copy_button_decklist
)

# ============================================================================
# TOURNAMENT TRACKING (Incremental Scraping for Meta Play!)
# ============================================================================

def get_scraped_meta_tournaments_file() -> str:
    """Get path to scraped tournaments tracking file."""
    data_dir = get_data_dir()
    return os.path.join(data_dir, 'current_meta_scraped_tournaments.json')


def load_scraped_meta_tournaments() -> set:
    """Load set of already scraped tournament IDs (for Meta Play!)."""
    tracking_file = get_scraped_meta_tournaments_file()
    
    if not os.path.exists(tracking_file):
        return set()
    
    try:
        with open(tracking_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return set(data.get('scraped_tournament_ids', []))
    except Exception as e:
        print(f"Warning: Could not load scraped tournaments: {e}", flush=True)
        return set()


def save_scraped_meta_tournaments(tournament_ids: set) -> None:
    """Save set of scraped tournament IDs to tracking file."""
    tracking_file = get_scraped_meta_tournaments_file()
    
    try:
        data = {
            'scraped_tournament_ids': sorted(list(tournament_ids)),
            'last_updated': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'total_tournaments': len(tournament_ids)
        }
        with open(tracking_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Warning: Could not save scraped tournaments: {e}", flush=True)

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

# Default settings
DEFAULT_SETTINGS: Dict[str, Any] = {
    "sources": {
        "limitless_online": {
            "enabled": True,
            "max_decks": 60,
            "max_lists_per_deck": 20,
            "delay_between_lists": 4.0,
            "delay_between_decks": 8.0,
            "format_filter": "PFL"
        },
        "tournaments": {
            "enabled": True,
            "start_date": "",
            "max_tournaments": 60,
            "max_decks_per_tournament": 256,
            "format_filter": ["Standard", "Standard (JP)"]
        }
    },
    "delay_between_requests": 3.0,
    "request_timeout": 20,
    "max_retries": 2,
    "retry_delay": 1.0,
    "append_mode": True,
    "output_file": "current_meta_card_data.csv",
    "_comment": "Combines Limitless Online (Meta Live) and Play! (Meta Play!). append_mode=True keeps old data."
}


def safe_fetch(url: str, timeout: int, retries: int, retry_delay: float) -> str:
    """Fetch a URL with retries and a configurable timeout."""
    attempts = retries + 1
    for attempt in range(1, attempts + 1):
        print(f"  Fetching: {url} (attempt {attempt}/{attempts})", flush=True)
        html = fetch_page(url, timeout=timeout)
        if html:
            return html
        print(f"  [WARN] Fetch failed (attempt {attempt}/{attempts}): {url}", flush=True)
        time.sleep(retry_delay)
    return ""


def load_settings() -> Dict[str, Any]:
    """Load settings from dist/current_meta_analysis_settings.json."""
    app_path = get_app_path()
    
    # Try dist/ folder first
    dist_path = os.path.join(app_path, "dist", "current_meta_analysis_settings.json")
    settings_path = dist_path if os.path.exists(dist_path) else os.path.join(app_path, "current_meta_analysis_settings.json")

    print(f"Loading settings from: {settings_path}", flush=True)

    if os.path.exists(settings_path):
        try:
            with open(settings_path, "r", encoding="utf-8") as f:
                settings = json.load(f)
                print("Settings loaded successfully", flush=True)
                for key, value in DEFAULT_SETTINGS.items():
                    if key not in settings:
                        settings[key] = value
                # Deep-merge nested source defaults
                if "sources" in DEFAULT_SETTINGS:
                    settings.setdefault("sources", {})
                    for source_key, source_defaults in DEFAULT_SETTINGS["sources"].items():
                        settings["sources"].setdefault(source_key, {})
                        for s_key, s_val in source_defaults.items():
                            if s_key not in settings["sources"][source_key]:
                                settings["sources"][source_key][s_key] = s_val
                return settings
        except (json.JSONDecodeError, IOError) as e:
            print(f"Error loading settings: {e}", flush=True)
            return DEFAULT_SETTINGS.copy()

    print("Settings file not found. Creating new file with defaults.", flush=True)
    # Create in dist folder if it exists, otherwise in app folder
    final_path = dist_path if os.path.exists(os.path.dirname(dist_path)) else os.path.join(app_path, "current_meta_analysis_settings.json")
    with open(final_path, "w", encoding="utf-8") as f:
        json.dump(DEFAULT_SETTINGS, f, indent=4)
    return DEFAULT_SETTINGS.copy()


# Helper functions for Pokemon name normalization (from city_league_archetype_scraper)
def clean_pokemon_name(name: str) -> str:
    """Remove card variant suffixes from pokemon names (EX, V, VMAX, VSTAR, GX, ex, etc)."""
    variants = [" VSTAR", " V-UNION", " VMAX", " V", " EX", " GX", " ex"]
    name = name.strip()
    for variant in variants:
        if name.upper().endswith(variant.upper()):
            name = name[:-len(variant)].strip()
            break
    return name


def fix_mega_pokemon_name(name: str) -> str:
    """Convert 'pokemon-mega' format to 'mega pokemon' format."""
    if "-mega" in name.lower():
        name = re.sub(r"-mega$", "", name, flags=re.IGNORECASE)
        return f"mega {name}"
    return name


# ============================================================
# LIMITLESS ONLINE (Meta Live)
# ============================================================

def scrape_limitless_online(settings: Dict[str, Any], card_db: CardDatabaseLookup) -> List[Dict[str, Any]]:
    """Scrape Limitless Online deck data from tournament pages."""
    config = settings.get("sources", {}).get("limitless_online", {})
    if not config.get("enabled", False):
        print("Limitless Online disabled in settings - skipping")
        return []

    print("\n" + "=" * 60, flush=True)
    print("SCRAPING LIMITLESS ONLINE (META LIVE)", flush=True)
    print("=" * 60, flush=True)

    max_decks = config.get("max_decks", 60)
    max_lists_per_deck = config.get("max_lists_per_deck", 20)
    delay_lists = config.get("delay_between_lists", settings.get("delay_between_requests", 1.5))
    delay_decks = config.get("delay_between_decks", settings.get("delay_between_requests", 1.5))
    format_filter = config.get("format_filter", "PFL")
    request_timeout = settings.get("request_timeout", 20)
    max_retries = settings.get("max_retries", 2)
    retry_delay = settings.get("retry_delay", 1.0)

    decks_url = "https://play.limitlesstcg.com/decks?game=PTCG"
    print(f"Fetching decks page: {decks_url}", flush=True)

    html = safe_fetch(decks_url, request_timeout, max_retries, retry_delay)
    if not html:
        print("Failed to fetch decks page", flush=True)
        return []

    deck_pattern = re.compile(
        r'<a href="(/decks/([^"?]+)\?[^\"]*set=' + re.escape(format_filter) + r'[^\"]*)">',
        re.IGNORECASE
    )
    deck_matches = deck_pattern.findall(html)

    if not deck_matches:
        print(f"No decks found with filter: {format_filter}", flush=True)
        return []

    seen_slugs = set()
    deck_links = []
    for full_href, slug in deck_matches:
        if "/matchups" in full_href.lower() or slug.endswith("/matchups"):
            continue
        if slug not in seen_slugs:
            seen_slugs.add(slug)
            deck_links.append((slug, full_href))

    deck_links = deck_links[:max_decks]
    print(f"Found {len(deck_links)} decks to scrape", flush=True)

    all_decks = []

    for idx, (deck_slug, deck_href) in enumerate(deck_links, 1):
        deck_name = " ".join(word.title() for word in deck_slug.split("-"))
        print(f"\n[{idx}/{len(deck_links)}] Processing {deck_name}...", flush=True)

        try:
            deck_url = f"https://play.limitlesstcg.com{deck_href}"
            deck_html = safe_fetch(deck_url, request_timeout, max_retries, retry_delay)
            if not deck_html:
                print("  Failed to fetch deck page", flush=True)
                continue

            name_match = re.search(r'<div class="name">([^<]+)</div>', deck_html, re.IGNORECASE)
            if name_match:
                deck_name = name_match.group(1).strip()

            list_pattern = re.compile(r'<a href="(/tournament/[^\"]+/player/[^\"]+/decklist)"', re.IGNORECASE)
            list_links = list_pattern.findall(deck_html)

            unique_list_links = list(dict.fromkeys(list_links))
            if not unique_list_links:
                print("  No tournament decklists found", flush=True)
                continue

            max_to_try = min(len(unique_list_links), max_lists_per_deck * 3)
            unique_list_links = unique_list_links[:max_to_try]
            print(f"  Found {len(unique_list_links)} tournament decklists available", flush=True)

            successful_lists = 0

            for list_idx, list_href in enumerate(unique_list_links, 1):
                if successful_lists >= max_lists_per_deck:
                    break

                list_url = f"https://play.limitlesstcg.com{list_href}"
                try:
                    list_html = safe_fetch(list_url, request_timeout, max_retries, retry_delay)
                    if not list_html:
                        continue

                    cards = []

                    pokemon_match = re.search(
                        r'<div class="cards"><div class="heading">Pokémon[^<]*</div>(.*?)</div>',
                        list_html,
                        re.DOTALL | re.IGNORECASE
                    )

                    if pokemon_match:
                        pokemon_links = re.findall(
                            r'<a href="[^"]+/([A-Z0-9]+)/([0-9]+)"[^>]*>([0-9]+)\s+([^<(]+)\s*\([^)]+\)</a>',
                            pokemon_match.group(1)
                        )
                        for set_code, set_number, count, card_name in pokemon_links:
                            cards.append({
                                "name": card_name.strip(),
                                "count": int(count),
                                "set_code": set_code.strip(),
                                "set_number": set_number.strip()
                            })

                    trainer_match = re.search(
                        r'<div class="heading">Trainer[^<]*</div>(.*?)</div>',
                        list_html,
                        re.DOTALL | re.IGNORECASE
                    )

                    if trainer_match:
                        trainer_links = re.findall(
                            r'<a href="[^"]+"[^>]*>([0-9]+)\s+([^<]+)</a>',
                            trainer_match.group(1)
                        )
                        for count, card_name in trainer_links:
                            card_name = card_name.strip()
                            latest_card = card_db.get_latest_low_rarity_version(card_name)
                            if latest_card:
                                cards.append({
                                    "name": card_name,
                                    "count": int(count),
                                    "set_code": latest_card.set_code,
                                    "set_number": latest_card.number
                                })

                    energy_match = re.search(
                        r'<div class="heading">Energy[^<]*</div>(.*?)</div>',
                        list_html,
                        re.DOTALL | re.IGNORECASE
                    )

                    if energy_match:
                        energy_links = re.findall(
                            r'<a href="[^"]+"[^>]*>([0-9]+)\s+([^<]+)</a>',
                            energy_match.group(1)
                        )
                        for count, card_name in energy_links:
                            latest_card = card_db.get_latest_low_rarity_version(card_name)
                            if latest_card:
                                cards.append({
                                    "name": card_name.strip(),
                                    "count": int(count),
                                    "set_code": latest_card.set_code,
                                    "set_number": latest_card.number
                                })

                    if cards:
                        all_decks.append({
                            "archetype": normalize_archetype_name(deck_name),
                            "deck_slug": deck_slug,
                            "cards": cards,
                            "source": "limitless_online"
                        })
                        successful_lists += 1
                        print(f"    [{list_idx}] {deck_name}: Extracted {len(cards)} cards", flush=True)

                    time.sleep(delay_lists)

                except Exception:
                    continue

            time.sleep(delay_decks)

        except Exception as e:
            print(f"  Error processing {deck_name}: {e}", flush=True)
            continue

    print(f"\n{'=' * 60}", flush=True)
    print(f"Total decks extracted (Meta Live): {len(all_decks)}", flush=True)
    print(f"{'=' * 60}", flush=True)
    return all_decks


# ============================================================
# TOURNAMENTS (Meta Play! - from labs.limitlesstcg.com)
# ============================================================

def get_tournament_links(base_url: str, max_tournaments: int, scraped_ids: set = None) -> List[Dict[str, str]]:
    """Get tournament links from labs.limitlesstcg.com."""
    tournaments = []
    
    if scraped_ids is None:
        scraped_ids = set()
    
    print(f"  Loading tournaments from {base_url}...", flush=True)
    if scraped_ids:
        print(f"  Tracking: {len(scraped_ids)} tournaments already scraped", flush=True)
    
    html = fetch_page(base_url)
    if not html:
        print(f"  [DEBUG] Failed to fetch {base_url}", flush=True)
        return []
    
    # Extract tournament IDs from links like /0050/standings
    matches = re.findall(r'/(\d+)/standings', html)
    print(f"  [DEBUG] Found {len(matches)} tournament links in HTML", flush=True)
    
    seen_ids = set()
    skipped_count = 0
    
    for tournament_id in matches:
        if tournament_id not in seen_ids:
            seen_ids.add(tournament_id)
            
            # Skip if already scraped
            if tournament_id in scraped_ids:
                skipped_count += 1
                continue
            
            tournaments.append({
                'id': tournament_id,
                'url': f'https://labs.limitlesstcg.com/{tournament_id}/standings',
                'standings_url': f'https://labs.limitlesstcg.com/{tournament_id}/standings'
            })
        
        if len(tournaments) >= max_tournaments:
            break
    
    print(f"  📊 Tournaments to scrape: {len(tournaments)} new (skipped {skipped_count} already scraped)", flush=True)
    return tournaments


def get_tournament_info(tournament_url: str) -> Dict[str, str]:
    """Get tournament name and details from the tournament page."""
    html = fetch_page(tournament_url)
    if not html:
        return {'name': 'Unknown Tournament', 'date': '', 'format': '', 'meta': 'Standard'}
    
    info = {'name': 'Unknown Tournament', 'date': '', 'format': ''}
    
    # Extract tournament name
    title_match = re.search(r'<title>([^<]+)</title>', html, re.IGNORECASE)
    if title_match:
        title = title_match.group(1).strip()
        title = re.sub(r'\s*\|\s*Limitless.*$', '', title)
        info['name'] = title
    
    # Extract date
    date_match = re.search(r'(\d{1,2}(?:st|nd|rd|th)?\s+\w+\s+\d{4})', html)
    if date_match:
        info['date'] = date_match.group(1)
    
    # Detect format and meta
    is_jp_tournament = False
    if 'Standard (JP)' in html or 'Champions League' in info.get('name', '') or 'Regional League' in info.get('name', ''):
        is_jp_tournament = True
    
    if is_jp_tournament:
        info['format'] = ''
        info['meta'] = 'Standard (JP)'
    elif 'Expanded' in html:
        info['meta'] = 'Expanded'
    else:
        info['meta'] = 'Standard'
    
    return info


def get_deck_links_from_standings(tournament_id: str, max_decks: int = 128) -> List[Dict[str, str]]:
    """Get deck links and names from tournament standings page."""
    standings_url = f"https://labs.limitlesstcg.com/{tournament_id}/standings"
    html = fetch_page(standings_url)
    if not html:
        return []
    
    deck_links = []
    
    # Split into table rows
    rows = re.split(r'<tr[^>]*>', html, flags=re.IGNORECASE)
    
    for row in rows:
        # Look for player decklist link
        player_match = re.search(r'href="/' + re.escape(tournament_id) + r'/player/(\d+)/decklist"', row)
        if not player_match:
            continue
        
        player_id = player_match.group(1)
        
        # Look for deck archetype link in the same row
        deck_match = re.search(r'href="/' + re.escape(tournament_id) + r'/decks/([^"]+)"', row)
        
        if deck_match:
            archetype_slug = deck_match.group(1)
            archetype = slug_to_archetype(archetype_slug)
        else:
            # Try to extract from img alt attributes
            alt_matches = re.findall(r'<img[^>]+class="pokemon"[^>]+alt="([^"]+)"', row, re.IGNORECASE)
            if alt_matches:
                archetype = ' '.join(word.title() for word in alt_matches)
            else:
                archetype = "Unknown"
        
        deck_links.append({
            'player_id': player_id,
            'url': f"https://labs.limitlesstcg.com/{tournament_id}/player/{player_id}/decklist",
            'archetype': archetype
        })
        
        if len(deck_links) >= max_decks:
            break
    
    return deck_links[:max_decks]


def slug_to_archetype(slug: str) -> str:
    """Convert deck slug to a readable archetype name with improved normalization."""
    slug = slug.strip().replace('_', '-')
    slug = re.sub(r'-+', ' ', slug)
    slug = slug.strip()
    words = slug.split(' ')
    special = {'ex', 'gx', 'v', 'vmax', 'vstar', 'mega', 'tag', 'break', 'lv', 'lv.x', 'lvx', 'lv-x', 'star', 
               'dark', 'light', 'shiny', 'prism', 'basic', 'stage', 'baby', 'legend', 'dudunsparce', 'urshifu', 
               'rapid', 'single', 'fusion', 'arceus', 'mewtwo', 'alakazam', 'charizard', 'pikachu', 'eevee', 
               'gardevoir', 'rayquaza', 'kyogre', 'groudon', 'lugia', 'dialga', 'palkia', 'zacian', 'zamazenta', 
               'regieleki', 'regidrago', 'regigigas', 'regice', 'regirock', 'registeel', 'blastoise', 'venusaur', 
               'snorlax', 'mimikyu', 'dragapult', 'calyrex', 'shadow', 'ice', 'fire', 'water', 'grass', 'electric', 
               'psychic', 'fighting', 'darkness', 'metal', 'fairy', 'dragon', 'normal', 'poison', 'ground', 'rock', 
               'bug', 'ghost', 'steel', 'flying'}
    
    def smart_title(word):
        w = word.lower()
        if w in special:
            return word.upper() if w in {'ex', 'gx', 'v', 'vmax', 'vstar'} else word.title()
        return word.title()
    
    archetype = ' '.join(smart_title(w) for w in words)
    archetype = re.sub(r'\s+', ' ', archetype).strip()
    return archetype


def extract_cards_from_tournament_decklist(decklist_url: str, card_db: CardDatabaseLookup) -> List[Dict[str, Any]]:
    """Extract card data from a tournament player's decklist page using JSON data."""
    html_content = fetch_page(decklist_url)
    if not html_content:
        return []

    cards: List[Dict] = []
    
    # Try to find JSON data in script tags
    script_pattern = re.compile(r'<script[^>]*>(.*?)</script>', re.DOTALL)
    scripts = script_pattern.findall(html_content)
    
    for script in scripts:
        if not script.strip():
            continue
            
        try:
            # Look for card data in JSON
            if 'pokemon' not in script.lower() and 'trainer' not in script.lower() and 'energy' not in script.lower():
                continue
            
            data = json.loads(script)
            if 'body' not in data:
                continue
            
            body_data = json.loads(data['body'])
            if not body_data.get('ok') or 'message' not in body_data:
                continue
            
            message = body_data['message']
            
            # Extract cards from pokemon, trainer, energy sections
            for category in ['pokemon', 'trainer', 'energy']:
                if category not in message:
                    continue
                
                for card in message[category]:
                    try:
                        count = int(card.get('count', 0))
                        name = card.get('name', '').strip()
                        set_code = card.get('set', '').strip().upper()
                        card_number = card.get('number', '').strip()
                        
                        if not name or count == 0:
                            continue
                        
                        import html as html_module
                        name = html_module.unescape(name)
                        name = name.replace("'", "'").replace("`", "'").replace("´", "'").replace("'", "'")
                        
                        cards.append({
                            'name': name,
                            'count': count,
                            'set_code': set_code if set_code else '',
                            'set_number': card_number if card_number else ''
                        })
                    except (ValueError, KeyError, TypeError):
                        continue
            
            if cards:
                return cards
                
        except (json.JSONDecodeError, KeyError, TypeError):
            continue
    
    return cards


def scrape_tournaments(settings: Dict[str, Any], card_db: CardDatabaseLookup) -> List[Dict[str, Any]]:
    """Scrape tournament deck data from labs.limitlesstcg.com - PRIMARY SOURCE for card lists."""
    config = settings.get("sources", {}).get("tournaments", {})
    if not config.get("enabled", False):
        print("Tournament scraping disabled in settings - skipping", flush=True)
        return []

    print("\n" + "=" * 60, flush=True)
    print("SCRAPING TOURNAMENTS (META PLAY! - labs.limitlesstcg.com)", flush=True)
    print("=" * 60, flush=True)

    max_tournaments = config.get("max_tournaments", 150)
    max_decks_per_tournament = config.get("max_decks_per_tournament", 128)
    delay_between_requests = settings.get("delay_between_requests", 3.0)
    request_timeout = settings.get("request_timeout", 20)
    
    # Get tournament filters
    allowed_types = config.get("tournament_types", [])
    format_filter = config.get("format_filter", [])
    start_date = config.get("start_date", "")
    end_date = config.get("end_date", "")
    
    base_url = "https://labs.limitlesstcg.com/"
    all_decks = []
    
    # Load scraped tournament tracking
    scraped_ids = load_scraped_meta_tournaments()
    newly_scraped_ids = set()
    
    # Get tournament links
    tournaments = get_tournament_links(base_url, max_tournaments, scraped_ids)
    if not tournaments:
        print("No tournaments found")
        return []
    
    for i, tournament in enumerate(tournaments, 1):
        print(f"\n[{i}/{len(tournaments)}] Processing tournament {tournament['id']}...", flush=True)
        
        try:
            # Get tournament info
            info = get_tournament_info(tournament['url'])
            print(f"  {info['name']}", flush=True)
            print(f"  Type: {info.get('type', 'Unknown')} | Format: {info.get('meta', 'Unknown')}", flush=True)
            
            # Apply tournament type filter
            if allowed_types and info.get('type') not in allowed_types:
                print(f"  ⊘ Skipping - Tournament type '{info.get('type')}' not in allowed types: {allowed_types}", flush=True)
                continue
            
            # Apply format filter
            if format_filter and info.get('meta') not in format_filter:
                print(f"  ⊘ Skipping - Format '{info.get('meta')}' not in allowed formats: {format_filter}", flush=True)
                continue
            
            # Get deck links from standings
            deck_links = get_deck_links_from_standings(tournament['id'], max_decks_per_tournament)
            if not deck_links:
                print("  No decks found", flush=True)
                continue
            
            print(f"  Found {len(deck_links)} decks, scraping...", flush=True)
            
            for j, deck_info in enumerate(deck_links, 1):
                if j % 20 == 0:
                    print(f"    Processed {j}/{len(deck_links)} decks...", flush=True)
                
                try:
                    # Extract cards from tournament decklist (using JSON format)
                    cards = extract_cards_from_tournament_decklist(deck_info['url'], card_db)
                    
                    # Validate deck has exactly 60 cards
                    total_cards = sum(card['count'] for card in cards)
                    
                    if cards and total_cards == 60:
                        all_decks.append({
                            'archetype': normalize_archetype_name(deck_info['archetype']),
                            'cards': cards,
                            'source': 'Tournament'
                        })
                    elif cards:
                        if j <= 3:
                            print(f"    ⚠️ Warning: Tournament deck has {total_cards} instead of 60 cards - skipped", flush=True)
                
                except Exception as e:
                    if j <= 3:
                        print(f"    Error extracting deck {j}: {e}", flush=True)
                    continue
                
                time.sleep(delay_between_requests / 10)  # Shorter delay between decks
            
            # Track successfully scraped tournament
            newly_scraped_ids.add(tournament['id'])
            
            print(f"  Collected {len(all_decks)} complete decks so far", flush=True)
            time.sleep(delay_between_requests)
            
        except Exception as e:
            print(f"  Error processing tournament {tournament['id']}: {e}", flush=True)
            continue
    
    print(f"\n✓ Total decks with FULL CARD LISTS from tournaments: {len(all_decks)}", flush=True)
    
    # Save tracking
    if newly_scraped_ids:
        all_scraped_ids = scraped_ids | newly_scraped_ids
        save_scraped_meta_tournaments(all_scraped_ids)
        print(f"✓ Saved {len(newly_scraped_ids)} new tournament IDs to tracking file", flush=True)
        print(f"  Total tracked tournaments: {len(all_scraped_ids)}", flush=True)
    
    return all_decks


# ============================================================
# AGGREGATION + OUTPUT
# ============================================================

def aggregate_with_meta(all_decks: List[Dict[str, Any]], card_db: CardDatabaseLookup, meta_label: str) -> List[Dict[str, Any]]:
    """Aggregate card data and override meta label."""
    if not all_decks:
        return []

    aggregated = aggregate_card_data(all_decks, card_db)
    for row in aggregated:
        row["meta"] = meta_label
    return aggregated


# ============================================================
# MAIN
# ============================================================

def main():
    if sys.platform == "win32":
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

    print("[DEBUG] Entering current meta main()", flush=True)
    print("=" * 60, flush=True)
    print("CURRENT META ANALYSIS SCRAPER", flush=True)
    print("=" * 60, flush=True)

    settings = load_settings()
    print("[DEBUG] Settings loaded", flush=True)

    print("Loading unified card database (English + Japanese)...", flush=True)
    try:
        card_db = CardDatabaseLookup()  # Auto-loads from CardDataManager
    except Exception as e:
        print(f"\nERROR: Could not load card database: {e}", flush=True)
        print("Make sure CardDataManager and databases are properly configured.")
        print("To setup databases, run: python update_cards.py --type english --mode full")
        input("\nPress Enter to exit...")
        return

    if not card_db.cards:
        print("\nERROR: Failed to load card database!", flush=True)
        input("\nPress Enter to exit...")
        return

    print("[DEBUG] Starting Meta Live scrape", flush=True)
    limitless_decks = scrape_limitless_online(settings, card_db)
    print("[DEBUG] Starting Meta Play! scrape", flush=True)
    tournament_decks = scrape_tournaments(settings, card_db)

    aggregated_data = []
    aggregated_data.extend(aggregate_with_meta(limitless_decks, card_db, "Meta Live"))
    aggregated_data.extend(aggregate_with_meta(tournament_decks, card_db, "Meta Play!"))

    if not aggregated_data:
        print("\nNo data collected. Please check your settings and try again.")
        input("\nPress Enter to exit...")
        return

    append_mode = settings.get('append_mode', False)
    save_to_csv(aggregated_data, settings["output_file"], append_mode=append_mode)

    print("\n" + "=" * 60)
    print("SCRAPING COMPLETE!")
    print("=" * 60)
    input("\nPress Enter to exit...")


if __name__ == "__main__":
    try:
        print("[START] Current Meta Analysis starting...")
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
