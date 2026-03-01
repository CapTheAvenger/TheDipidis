#!/usr/bin/env python3
"""
Limitless TCG Tournament Cards Scraper
Scrapes card usage data from limitlesstcg.com/tournaments
No external dependencies required - uses only Python standard library
"""

import urllib.request
import urllib.parse
import csv
import re
import time
import json
import os
import sys
import html
import math
from html.parser import HTMLParser
from typing import List, Dict, Optional, Any, Set, Tuple

# Fix Windows console encoding for Unicode characters (✓, ×, •, etc.)
if sys.platform == 'win32':
    if hasattr(sys.stdout, 'reconfigure'):
        try:
            sys.stdout.reconfigure(encoding='utf-8')  # type: ignore
        except Exception:
            pass
    if hasattr(sys.stderr, 'reconfigure'):
        try:
            sys.stderr.reconfigure(encoding='utf-8')  # type: ignore
        except Exception:
            pass

# Import the reliable card type lookup module
from card_type_lookup import is_trainer_or_energy, is_valid_card
from card_scraper_shared import CardDatabaseLookup

# ============================================================================
# TOURNAMENT TRACKING (Incremental Scraping)
# ============================================================================

def get_scraped_tournaments_file() -> str:
    """Get path to scraped tournaments tracking file."""
    data_dir = get_data_dir()
    return os.path.join(data_dir, 'tournament_jh_scraped.json')


def load_scraped_tournaments() -> Set[str]:
    """Load set of already scraped tournament IDs."""
    tracking_file = get_scraped_tournaments_file()
    
    if not os.path.exists(tracking_file):
        return set()
    
    try:
        with open(tracking_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return set(data.get('scraped_tournament_ids', []))
    except Exception as e:
        print(f"Warning: Could not load scraped tournaments: {e}")
        return set()


def save_scraped_tournaments(tournament_ids: Set[str]) -> None:
    """Save set of scraped tournament IDs to tracking file."""
    tracking_file = get_scraped_tournaments_file()
    
    try:
        data = {
            'scraped_tournament_ids': sorted(list(tournament_ids)),
            'last_updated': time.strftime('%Y-%m-%d %H:%M:%S'),
            'total_tournaments': len(tournament_ids)
        }
        with open(tracking_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Warning: Could not save scraped tournaments: {e}")

# Default settings
DEFAULT_SETTINGS: Dict[str, Any] = {
    "max_tournaments": 150,
    "delay_between_tournaments": 0,
    "start_tournament_id": 391,
    "output_file": "tournament_cards_data.csv",
    "format_filter": ["Standard"],
    "tournament_types": ["Regional", "Special Event", "LAIC", "EUIC", "NAIC", "Worlds", "International", "Championship"],
    "append_mode": True,
    "_comment": "Scrapes individual deck lists from each tournament. Nur Standard-Format Turniere (Regional, Special Event, LAIC, EUIC, NAIC, Worlds) werden automatisch gescraped. append_mode=True keeps old tournament data and only adds new tournaments."
}

def get_app_path() -> str:
    """Get the directory where the executable/script is located."""
    if getattr(sys, 'frozen', False):
        # Running as compiled executable
        return os.path.dirname(sys.executable)
    else:
        # Running as script
        return os.path.dirname(os.path.abspath(__file__))

def get_data_dir() -> str:
    """Get the data directory, creating it if needed."""
    app_path = get_app_path()
    data_dir = os.path.join(app_path, 'data')
    os.makedirs(data_dir, exist_ok=True)
    return data_dir

def load_settings() -> Dict[str, Any]:
    """Load settings from tournament_JH_settings.json, or create it with defaults if it doesn't exist."""
    app_path = get_app_path()
    settings_path = os.path.join(app_path, 'tournament_JH_settings.json')
    
    # If running from dist folder, also check parent folder
    if not os.path.exists(settings_path) and os.path.basename(app_path) == 'dist':
        parent_path = os.path.dirname(app_path)
        parent_settings_path = os.path.join(parent_path, 'tournament_JH_settings.json')
        if os.path.exists(parent_settings_path):
            settings_path = parent_settings_path
    
    print(f"Loading settings from: {settings_path}")
    
    if os.path.exists(settings_path):
        try:
            with open(settings_path, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                if not content:
                    print("Settings file is empty. Using default settings.")
                    return DEFAULT_SETTINGS.copy()
                settings = json.loads(content)
                print(f"Settings loaded successfully: {settings}")
                # Merge with defaults for any missing keys
                for key, value in DEFAULT_SETTINGS.items():
                    if key not in settings:
                        settings[key] = value
                return settings
        except (json.JSONDecodeError, IOError) as e:
            print(f"Error loading tournament_JH_settings.json: {e}")
            print("Using default settings.")
            return DEFAULT_SETTINGS.copy()
    else:
        # Create default settings file
        print(f"Settings file not found. Creating new file with defaults.")
        with open(settings_path, 'w', encoding='utf-8') as f:
            json.dump(DEFAULT_SETTINGS, f, indent=4)
        print(f"Created default tournament_JH_settings.json at {settings_path}")
        return DEFAULT_SETTINGS.copy()


def fetch_page(url: str) -> str:
    """Fetch a webpage and return its HTML content."""
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=30) as response:
            html = response.read().decode('utf-8', errors='ignore')
            print(f"  Fetched {len(html)} bytes")
            return html
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return ""

def get_tournament_links(base_url: str, max_tournaments: int, start_tournament_id: Optional[int] = None, scraped_ids: Optional[Set[str]] = None) -> List[Dict[str, Any]]:
    """Get tournament links from the main tournaments page with pagination support."""
    print("Fetching tournaments list...")
    if start_tournament_id:
        print(f"Filter: Tournaments from latest down to ID {start_tournament_id}")
    
    if scraped_ids is None:
        scraped_ids = set()
    
    tournaments: List[Dict[str, Any]] = []
    seen_ids: Set[str] = set()
    skipped_count = 0
    page = 1
    stop_scraping = False
    
    # Load multiple pages if needed
    # NOTE: Collect ALL tournaments down to start_tournament_id, don't limit by max_tournaments yet
    # The main loop will filter by tournament type and then apply max_tournaments limit
    while not stop_scraping:
        # Construct URL with pagination
        if '?' in base_url:
            fetch_url = f"{base_url}&show=100&page={page}"
        else:
            if page == 1:
                fetch_url = f"{base_url}?show=100"
            else:
                fetch_url = f"{base_url}?show=100&page={page}"
        
        print(f"Loading page {page}... (found {len(tournaments)} so far)")
        html = fetch_page(fetch_url)
        if not html:
            break
        
        # Parse table rows - each row contains tournament info
        matches = re.findall(r'href=["\'](/tournaments/(\d+))["\']', html)
        page_tournaments = 0
        
        for match in matches:
            path, tournament_id = match
            tournament_id_num = int(tournament_id)
            
            # STOP immediately if we reach start_tournament_id
            # This is the OLDEST tournament we want to include
            if start_tournament_id and tournament_id_num < start_tournament_id:
                print(f"Reached stop point: Tournament ID {tournament_id_num} < {start_tournament_id}")
                stop_scraping = True
                break
            
            if tournament_id not in seen_ids:
                seen_ids.add(tournament_id)
                
                # Skip already scraped tournaments
                if tournament_id in scraped_ids:
                    skipped_count += 1
                    continue
                
                tournaments.append({
                    'id': tournament_id,
                    'url': f'https://limitlesstcg.com{path}',
                    'cards_url': f'https://limitlesstcg.com{path}/cards'
                })
                page_tournaments += 1
        
        # If no new tournaments found on this page, we've reached the end
        if page_tournaments == 0:
            print(f"No more tournaments found on page {page}")
            break
        
        page += 1
        
        # Safety limit: don't load more than 10 pages (1000 tournaments)
        if page > 10:
            print("Reached page limit (10 pages)")
            break
    
    print(f"Found {len(tournaments)} new tournaments (skipped {skipped_count} already scraped)")
    return tournaments

def get_format_code(format_name: str) -> str:
    """Convert format name to short code (e.g., 'Scarlet & Violet - Phantasmal Flames' -> 'SVI-PFL')."""
    format_mapping = {
        # Scarlet & Violet formats
        'Scarlet & Violet - Phantasmal Flames': 'SVI-PFL',
        'Scarlet & Violet - Mega Evolution': 'SVI-MEG',
        'Scarlet & Violet - Surging Sparks': 'SVI-SSP',
        'Scarlet & Violet - Stellar Crown': 'SVI-SCR',
        'Scarlet & Violet - Shrouded Fable': 'SVI-SFA',
        'Scarlet & Violet - Black Bolt': 'SVI-BLK',
        'Scarlet & Violet - Twilight Masquerade': 'SVI-TWM',
        'Scarlet & Violet - Destined Rivals': 'SVI-DRI',
        'Scarlet & Violet - Temporal Forces': 'SVI-TEF',
        'Scarlet & Violet - Paldean Fates': 'SVI-PAF',
        'Scarlet & Violet - Paradox Rift': 'SVI-PAR',
        'Scarlet & Violet - Obsidian Flames': 'SVI-OBF',
        'Scarlet & Violet - Paldea Evolved': 'SVI-PAL',
        'Scarlet & Violet - 151': 'SVI-MEW',
        'Scarlet & Violet': 'SVI',
        # Sword & Shield formats
        'Sword & Shield - Silver Tempest': 'SWS-SIT',
        'Sword & Shield - Lost Origin': 'SWS-LOR',
        'Sword & Shield - Astral Radiance': 'SWS-ASR',
        'Sword & Shield - Brilliant Stars': 'SWS-BRS',
        'Sword & Shield - Fusion Strike': 'SWS-FST',
        'Sword & Shield - Evolving Skies': 'SWS-EVS',
        'Sword & Shield - Chilling Reign': 'SWS-CRE',
        # Sword & Shield - Battle Styles': 'SWS-BST',
        'Sword & Shield - Shining Fates': 'SWS-SHF',
        'Sword & Shield - Vivid Voltage': 'SWS-VIV',
        'Sword & Shield - Champion\'s Path': 'SWS-CPA',
        'Sword & Shield - Darkness Ablaze': 'SWS-DAA',
        'Sword & Shield - Rebel Clash': 'SWS-RCL',
        'Sword & Shield': 'SWS',
        # Expanded formats (combinations)
        'Brilliant Stars - Shrouded Fable': 'BRS-SFA',
        'Brilliant Stars - Stellar Crown': 'BRS-SCR',
        'Brilliant Stars - Twilight Masquerade': 'BRS-TWM',
        'Brilliant Stars - Temporal Forces': 'BRS-TEF',
        'Brilliant Stars - Paldean Fates': 'BRS-PAF',
        'Brilliant Stars - Paradox Rift': 'BRS-PAR',
        'Brilliant Stars - Obsidian Flames': 'BRS-OBF',
        'Battle Styles - Paradox Rift': 'BST-PAR',
        'Battle Styles - Obsidian Flames': 'BST-OBF',
        'Battle Styles - Paldea Evolved': 'BST-PAL',
        'Battle Styles - 151': 'BST-MEW',
        # Sun & Moon formats
        'Sun & Moon - Cosmic Eclipse': 'SM-CEC',
        'Sun & Moon - Hidden Fates': 'SM-HIF',
        'Sun & Moon - Unified Minds': 'SM-UNM',
        'Sun & Moon - Unbroken Bonds': 'SM-UNB',
        'Sun & Moon - Team Up': 'SM-TEU',
        'Sun & Moon - Lost Thunder': 'SM-LOT',
        'Sun & Moon - Celestial Storm': 'SM-CES',
        'Sun & Moon - Forbidden Light': 'SM-FLI',
        'Sun & Moon - Ultra Prism': 'SM-UPR',
        'Sun & Moon - Crimson Invasion': 'SM-CIN',
        'Sun & Moon - Shining Legends': 'SM-SHL',
        'Sun & Moon - Burning Shadows': 'SM-BUS',
        'Sun & Moon - Guardians Rising': 'SM-GRI',
        'Sun & Moon': 'SM',
    }
    
    # Try exact match first
    if format_name in format_mapping:
        return format_mapping[format_name]
    
    # Try partial match for known formats
    for full_name, code in format_mapping.items():
        if full_name.lower() in format_name.lower():
            return code
    
    # Return original if no match found
    return format_name

def get_tournament_info(tournament_url: str) -> Dict[str, str]:
    """Get tournament name and details from the tournament page."""
    html = fetch_page(tournament_url)
    if not html:
        return {'name': 'Unknown Tournament', 'date': '', 'players': '', 'format': ''}
    
    info = {'name': 'Unknown Tournament', 'date': '', 'players': '', 'format': ''}
    
    # Try to extract tournament name from title or heading
    title_match = re.search(r'<title>([^<]+)</title>', html, re.IGNORECASE)
    if title_match:
        title = title_match.group(1).strip()
        # Clean up title (remove " | Limitless" suffix if present)
        title = re.sub(r'\s*\|\s*Limitless.*$', '', title)
        info['name'] = title
    
    # Try to extract date
    date_match = re.search(r'(\d{1,2}(?:st|nd|rd|th)?\s+\w+\s+\d{4})', html)
    if date_match:
        info['date'] = date_match.group(1)
    
    # Try to extract player count
    players_match = re.search(r'(\d+)\s*Players', html, re.IGNORECASE)
    if players_match:
        info['players'] = players_match.group(1)
    
    # Try to extract format (e.g., "Scarlet & Violet - Phantasmal Flames")
    # The format appears in the header line after Players count
    format_name = None
    format_code = None
    
    # Primary: Extract format code directly from the link href attribute
    # Example: <a href="/decks/?time=all&format=BRS-SFA">Brilliant Stars - Shrouded Fable</a>
    # This is the most reliable method as the code is already provided
    format_code_match = re.search(r'<a[^>]*href=["\'][^"\']*[?&]format=([^"\'&]+)["\'][^>]*>', html, re.IGNORECASE)
    if format_code_match:
        format_code = format_code_match.group(1).strip()
        info['format'] = format_code
    
    # Fallback: Try to extract format name from <a> tag text after "Players"
    # Only used if format code not found in href
    if not format_code:
        format_match = re.search(r'(\d+)\s*Players\s*[^<]*?<a[^>]*>([^<]+)</a>', html, re.IGNORECASE | re.DOTALL)
        if format_match:
            candidate = format_match.group(2).strip()
            # Decode HTML entities
            import html as html_module
            candidate = html_module.unescape(candidate)
            # Remove any trailing text
            candidate = re.sub(r'\s*(?:RK9|Results|Limitless).*$', '', candidate, flags=re.IGNORECASE).strip()
            
            # Check if it looks like a valid format (contains "Scarlet" or "Sword" or "Sun" etc.)
            if candidate and ('Scarlet' in candidate or 'Sword' in candidate or 'Sun' in candidate or 'Black' in candidate or 'X' in candidate or 'Diamond' in candidate or 'Brilliant' in candidate or 'Battle' in candidate):
                format_name = candidate
    
    # Fallback 2: Try without <a> tag (for tournaments that don't use links)
    if not format_code and not format_name:
        format_match2 = re.search(r'(\d+)\s*Players\s*•\s*([^<\n•]+?)(?:•|<|Results|$)', html, re.IGNORECASE)
        if format_match2:
            candidate = format_match2.group(2).strip()
            # Remove any trailing text like "RK9", "Results", links, etc.
            candidate = re.sub(r'\s*(?:RK9|Results|Limitless).*$', '', candidate, flags=re.IGNORECASE).strip()
            
            # Check if it looks like a valid format
            if candidate and ('Scarlet' in candidate or 'Sword' in candidate or 'Sun' in candidate or 'Black' in candidate or 'X' in candidate or 'Diamond' in candidate or 'Brilliant' in candidate or 'Battle' in candidate):
                format_name = candidate
    
    # If format name found but not code, convert it to short code
    if format_name and not format_code:
        info['format'] = get_format_code(format_name)
    
    # Detect if this is a Standard (JP) tournament BEFORE applying fallback
    # Check if majority of players are from JP/KR (Korean League, Japanese tournaments)
    is_jp_tournament = False
    
    # Check page title for "Standard (JP)"
    if 'Standard (JP)' in html:
        is_jp_tournament = True
    
    # Champions League tournaments are always Standard (JP)
    if 'Champions League' in info.get('name', ''):
        is_jp_tournament = True
    
    # Regional League tournaments (Thailand, Korea, Japan, etc.) are local tournaments
    if 'Regional League' in info.get('name', ''):
        is_jp_tournament = True
    
    # Also check if tournament has mostly JP/KR players (Korean League, Japanese domestic events)
    jp_kr_count = len(re.findall(r'\bKR\b|\bJP\b', html))
    total_flags = len(re.findall(r'<img[^>]*flags/[A-Z]{2}\.png', html))
    
    if total_flags > 20 and jp_kr_count > total_flags * 0.7:  # If >70% are JP/KR
        is_jp_tournament = True
    
    # If this is a JP tournament and no format was explicitly found in header, clear it
    if is_jp_tournament:
        info['format'] = ''  # Always clear format for JP tournaments
    
    # Store meta info
    if is_jp_tournament:
        info['meta'] = 'Standard (JP)'
    elif 'Expanded' in html:
        info['meta'] = 'Expanded'
    else:
        info['meta'] = 'Standard'
    
    # If no specific format was found, try to determine it from the date
    # BUT: Do NOT set a format for Standard (JP) tournaments - leave them empty
    if not info.get('format') or info['format'] in ['Standard', 'Expanded']:
        # Only try to guess format for non-JP tournaments
        if not is_jp_tournament:
            # Try to extract date and map to format based on tournament date
            date_str = info.get('date', '')
            if date_str:
                # Extract year and month from date string
                import datetime
                month_map = {
                    'January': 1, 'February': 2, 'March': 3, 'April': 4,
                    'May': 5, 'June': 6, 'July': 7, 'August': 8,
                    'September': 9, 'October': 10, 'November': 11, 'December': 12
                }
                
                # Try to parse the date
                year = None
                month = None
                for month_name, month_num in month_map.items():
                    if month_name in date_str:
                        month = month_num
                        # Extract year
                        year_match = re.search(r'(\d{4})', date_str)
                        if year_match:
                            year = int(year_match.group(1))
                        break
                
                # Map date ranges to formats (only as fallback for Standard tournaments)
                if year and month:
                    tournament_date = year * 100 + month  # e.g., 202601 for January 2026
                    
                    # Format mappings based on release dates
                    if tournament_date >= 202601:  # January 2026+
                        info['format'] = 'SVI-PFL'  # Phantasmal Flames (Jan 2026)
                    elif tournament_date >= 202511:  # November 2025
                        info['format'] = 'SVI-SSP'  # Surging Sparks (Nov 2025)
                    elif tournament_date >= 202508:  # August 2025
                        info['format'] = 'SVI-SFA'  # Shrouded Fable (Aug 2025)
                    elif tournament_date >= 202505:  # May 2025
                        info['format'] = 'SVI-TWM'  # Twilight Masquerade (May 2025)
                    elif tournament_date >= 202503:  # March 2025
                        info['format'] = 'SVI-TEF'  # Temporal Forces (March 2025)
                    elif tournament_date >= 202411:  # November 2024
                        info['format'] = 'SVI-SCR'  # Stellar Crown (Sep 2024)
                    elif tournament_date >= 202408:  # August 2024
                        info['format'] = 'SVI-SCR'  # Stellar Crown
                    elif tournament_date >= 202405:  # May 2024
                        info['format'] = 'SVI-TWI'  # Twilight Masquerade
                    else:  # Earlier dates
                        info['format'] = 'SVI-PAR'  # Paradox Rift or earlier
                elif year:
                    # Fallback if only year is available
                    if year >= 2026:
                        info['format'] = 'SVI-PFL'
                    elif year >= 2025:
                        info['format'] = 'SVI-TWM'
                    elif year >= 2024:
                        info['format'] = 'SVI-PAR'
    
    return info

def get_deck_list_links(tournament_url: str) -> List[Dict[str, Any]]:
    """
    Extract all individual deck list URLs from a tournament page.
    Returns list of dicts: [{'url': 'https://...', 'player_count': 2}, ...]
    where player_count = how many players used this exact deck.
    """
    # Try with high show parameter to get all decks on one page
    if '?' in tournament_url:
        fetch_url = f"{tournament_url}&show=2000"
    else:
        fetch_url = f"{tournament_url}?show=2000"
    
    html = fetch_page(fetch_url)
    if not html:
        return []
    
    # Find all deck list links - pattern: /decks/list/\d+
    all_matches = re.findall(r'/decks/list/(\d+)', html)
    
    print(f"  [DEBUG] Found {len(all_matches)} total /decks/list/ mentions")
    
    # Count how many players used each deck
    from collections import Counter
    deck_id_counts = Counter(all_matches)
    
    print(f"  [DEBUG] Unique deck IDs: {len(deck_id_counts)}")
    print(f"  [DEBUG] Total players: {sum(deck_id_counts.values())}")
    
    # Find decks used by multiple players
    shared_decks = {deck_id: count for deck_id, count in deck_id_counts.items() if count > 1}
    if shared_decks:
        total_shared = sum(shared_decks.values())
        print(f"  [DEBUG] {len(shared_decks)} decks shared by multiple players (total {total_shared} players)")
    
    # Build list with player counts
    deck_list: List[Dict[str, Any]] = []
    for deck_id, player_count in deck_id_counts.items():
        deck_list.append({
            'url': f"https://limitlesstcg.com/decks/list/{deck_id}",
            'player_count': player_count
        })
    
    print(f"  Found {len(deck_list)} unique deck lists representing {sum(d['player_count'] for d in deck_list)} total players")
    return deck_list

def get_deck_options(cards_url: str) -> List[Dict[str, Any]]:
    """Extract deck options from the dropdown on the cards page."""
    html = fetch_page(cards_url)
    if not html:
        return []
    
    deck_options: List[Dict[str, Any]] = []
    
    # Pattern to match dropdown options: <li data-value="267.40">Gholdengo Lunatone - 82 decklists</li>
    pattern = r'<li\s+data-value="([^"]+)"[^>]*>([^<]+)</li>'
    matches = re.findall(pattern, html)
    
    for match in matches:
        data_value = match[0]
        label = match[1].strip()
        
        # Decode HTML entities (e.g., &#039; -> ')
        import html as html_module
        label = html_module.unescape(label)
        
        # Normalize apostrophes in deck names (fix Cynthia's, N's, etc.)
        label = label.replace(''', "'").replace('`', "'").replace('´', "'").replace(''', "'").replace('ʼ', "'")
        
        # Parse the label to extract deck name and decklist count
        # Format: "Gholdengo Lunatone - 82 decklists"
        label_match = re.match(r'(.+?)\s*-\s*(\d+)\s*decklist', label)
        if label_match:
            deck_name = label_match.group(1).strip()
            decklist_count = int(label_match.group(2))
            deck_options.append({
                'data_value': data_value,
                'deck_name': deck_name,
                'decklist_count': decklist_count
            })
    
    return deck_options

# Old is_trainer_or_energy() function removed - now using card_type_lookup.py
# which provides 100% accurate card type detection based on Alle Karten.txt

# Global cache for card lookups
_card_lookup_cache: Dict[str, Optional[Dict[str, Any]]] = {}

def lookup_card_info(card_name: str, retries: int = 3) -> Optional[Dict[str, Any]]:
    """Look up card information from Limitless TCG cards database with improved robustness."""
    # Check cache first
    if card_name in _card_lookup_cache:
        return _card_lookup_cache[card_name]
    
    # Create list of names to try
    names_to_try = [card_name]
    
    # For cards with possessive (e.g., "Team Rocket's Porygon", "Ethan's Sudowoodo"),
    # also try without the possessive prefix
    if "'s " in card_name or "'s " in card_name:
        # Try removing the possessive prefix
        parts = card_name.replace("'s ", "'s ").split("'s ", 1)
        if len(parts) == 2:
            base_name = parts[1].strip()
            names_to_try.append(base_name)
    
    # Try exact search first
    encoded_name = urllib.parse.quote(card_name)
    search_url = f"https://limitlesstcg.com/cards?q=lang%3Aen+name%3A%22{encoded_name}%22&show=all&display=list"
    
    for attempt in range(retries):
        try:
            html = fetch_page(search_url)
            if not html:
                time.sleep(1.0)
                continue
            
            # Strategy 1: Look for data-set and data-number in card container
            # Pattern: <div class="card-list-card" data-set="PAR" data-number="123">
            pattern1 = re.compile(
                r'<div[^>]*class="[^"]*card-list-card[^"]*"[^>]*data-set="([A-Z0-9]+)"[^>]*data-number="(\d+)"[^>]*>',
                re.IGNORECASE
            )
            matches = pattern1.findall(html)
            if matches:
                # Take the first match (most relevant)
                result = {
                    'set_code': matches[0][0].upper(),
                    'card_number': matches[0][1]
                }
                _card_lookup_cache[card_name] = result
                return result
            
            # Strategy 2: Look for set code in span with class "set"
            # Pattern: <span class="set">PAR 123</span>
            pattern2 = re.compile(
                r'<span[^>]*class="[^"]*set[^"]*"[^>]*>\s*([A-Z0-9]+)\s+(\d+)\s*</span>',
                re.IGNORECASE
            )
            matches2 = pattern2.findall(html)
            if matches2:
                result = {
                    'set_code': matches2[0][0].upper(),
                    'card_number': matches2[0][1]
                }
                _card_lookup_cache[card_name] = result
                return result
            
            # Strategy 3: Search for card name in text and find nearest set info
            # This is more flexible but less precise
            name_lower = card_name.lower()
            html_lower = html.lower()
            name_pos = html_lower.find(name_lower)
            
            if name_pos != -1:
                # Look in a window around the name
                start = max(0, name_pos - 500)
                end = min(len(html), name_pos + 1000)
                search_section = html[start:end]
                
                # Try to find data-set/data-number attributes
                data_match = re.search(r'data-set="([A-Z0-9]+)"[^>]*data-number="(\d+)"', search_section)
                if data_match:
                    result = {
                        'set_code': data_match.group(1).upper(),
                        'card_number': data_match.group(2)
                    }
                    _card_lookup_cache[card_name] = result
                    return result
                
                # Try to find set span
                set_match = re.search(r'<span[^>]*class="[^"]*set[^"]*"[^>]*>\s*([A-Z0-9]+)\s+(\d+)\s*</span>', search_section)
                if set_match:
                    result = {
                        'set_code': set_match.group(1).upper(),
                        'card_number': set_match.group(2)
                    }
                    _card_lookup_cache[card_name] = result
                    return result
            
            # If exact search failed, try alternative names
            if attempt == retries - 1 and len(names_to_try) > 1:
                # Try searching with base name (without possessive)
                for alt_name in names_to_try[1:]:
                    encoded_alt = urllib.parse.quote(alt_name)
                    search_url_alt = f"https://limitlesstcg.com/cards?q=lang%3Aen+name%3A%22{encoded_alt}%22&show=all&display=list"
                    html_alt = fetch_page(search_url_alt)
                    if html_alt:
                        # Try all strategies on alternative name
                        alt_matches = pattern1.findall(html_alt)
                        if alt_matches:
                            set_code = alt_matches[0][0].upper()
                            if set_code == 'PR-SV':
                                set_code = 'SVP'
                            result = {
                                'set_code': set_code,
                                'card_number': alt_matches[0][1]
                            }
                            _card_lookup_cache[card_name] = result
                            return result
                        
                        alt_matches2 = pattern2.findall(html_alt)
                        if alt_matches2:
                            set_code = alt_matches2[0][0].upper()
                            if set_code == 'PR-SV':
                                set_code = 'SVP'
                            result = {
                                'set_code': set_code,
                                'card_number': alt_matches2[0][1]
                            }
                            _card_lookup_cache[card_name] = result
                            return result
            
            # If still failed, try broader search without exact name matching
            if attempt == retries - 1:
                # Last attempt: try without exact name requirement
                search_url_broad = f"https://limitlesstcg.com/cards?q=lang%3Aen+{encoded_name}&show=all&display=list"
                html_broad = fetch_page(search_url_broad)
                if html_broad:
                    # Try all strategies again on broader results
                    pattern1_matches = pattern1.findall(html_broad)
                    if pattern1_matches:
                        result = {
                            'set_code': pattern1_matches[0][0].upper(),
                            'card_number': pattern1_matches[0][1]
                        }
                        _card_lookup_cache[card_name] = result
                        return result
                    
                    pattern2_matches = pattern2.findall(html_broad)
                    if pattern2_matches:
                        result = {
                            'set_code': pattern2_matches[0][0].upper(),
                            'card_number': pattern2_matches[0][1]
                        }
                        _card_lookup_cache[card_name] = result
                        return result
            
        except Exception as e:
            print(f"    Warning: Error looking up {card_name} (attempt {attempt+1}): {e}")
            if attempt < retries - 1:
                time.sleep(1.0)
    
    # Cache negative result to avoid repeated lookups
    _card_lookup_cache[card_name] = None
    return None

def extract_single_deck(deck_url: str, card_db: CardDatabaseLookup) -> Tuple[List[Dict[str, Any]], str]:
    """
    Extract cards from a single deck list.
    Returns: (cards_list, deck_name)
        - cards_list: List of card dicts with exact counts
        - deck_name: Archetype name (e.g., "Dragapult Dusknoir") or "Unknown Deck"
    """
    html_content = fetch_page(deck_url)
    if not html_content:
        return [], "Unknown Deck"
    
    # Extract deck archetype name from the page
    # Try multiple patterns to find the archetype
    deck_name = "Unknown Deck"
    
    # Pattern 1: Look for decklist-title div (primary source for deck name)
    title_div_match = re.search(r'<div[^>]*class="decklist-title"[^>]*>\s*([^\n<]+)', html_content, re.IGNORECASE)
    if title_div_match:
        potential_name = title_div_match.group(1).strip()
        # Clean up - remove extra whitespace
        potential_name = re.sub(r'\s+', ' ', potential_name)
        if potential_name and len(potential_name) > 2:
            deck_name = potential_name
    
    # Pattern 2: Look for archetype in page title or meta tags
    if deck_name == "Unknown Deck":
        title_match = re.search(r'<title>([^|<]+)\s*\|', html_content)
        if title_match:
            potential_name = title_match.group(1).strip()
            # Clean up common prefixes/suffixes
            potential_name = re.sub(r'^(Deck(list)?\s*-\s*)', '', potential_name, flags=re.IGNORECASE)
            if potential_name and not potential_name.startswith('http'):
                deck_name = potential_name
    
    # Pattern 3: Look for archetype label/heading on the page
    if deck_name == "Unknown Deck":
        archetype_match = re.search(r'<div[^>]*class="[^"]*archetype[^"]*"[^>]*>([^<]+)</div>', html_content, re.IGNORECASE)
        if archetype_match:
            deck_name = archetype_match.group(1).strip()
    
    # Pattern 4: Look in breadcrumb or navigation
    if deck_name == "Unknown Deck":
        breadcrumb_match = re.search(r'<span[^>]*class="[^"]*breadcrumb[^"]*"[^>]*>([^<]+)</span>', html_content, re.IGNORECASE)
        if breadcrumb_match:
            potential_name = breadcrumb_match.group(1).strip()
            if potential_name and not potential_name.lower() in ['home', 'decks', 'deck']:
                deck_name = potential_name
    
    # Clean up deck name
    deck_name = html.unescape(deck_name)
    deck_name = deck_name.replace(''', "'").replace('`', "'").replace('´', "'").replace(''', "'").replace('ʼ', "'")

    cards: List[Dict[str, Any]] = []
    seen_cards: Set[str] = set()
    cards_to_lookup: List[int] = []
    
    # Regex patterns (same as extract_cards_from_page)
    heading_pattern = re.compile(r'<div[^>]*class="decklist-column-heading"[^>]*>\s*([^<]+?)\s*</div>', re.IGNORECASE)
    card_pattern = re.compile(r'<div[^>]*class="decklist-card"[^>]*data-set="([A-Z0-9]*)"[^>]*data-number="(\d*)"[^>]*>.*?<span class="card-count">([0-9.]+)</span>\s*<span class="card-name">([^<]+)</span>', re.IGNORECASE | re.DOTALL)

    # Find all headings with their span (start/end ranges)
    headings: List[Dict[str, Any]] = []
    for m in heading_pattern.finditer(html_content):
        title = m.group(1).strip().lower()
        if 'trainer' in title:
            section_type = 'trainer'
        elif 'energy' in title:
            section_type = 'energy'
        else:
            section_type = 'pokemon'
        headings.append({'start': m.end(), 'type': section_type})

    # Determine end positions for headings
    for idx in range(len(headings)):
        start = headings[idx]['start']
        end = headings[idx + 1]['start'] if idx + 1 < len(headings) else len(html_content)
        headings[idx]['end'] = end

    # Extract cards per section
    for sec in headings if headings else [{'start': 0, 'end': len(html_content), 'type': 'pokemon'}]:
        block = html_content[sec['start']:sec['end']]
        section_type = sec['type']

        for match in card_pattern.findall(block):
            try:
                set_code_raw = match[0].upper() if match[0] else ""
                card_number_raw = match[1] if match[1] else ""
                count_str = match[2]
                name = match[3].strip()

                # Decode HTML entities
                name = html.unescape(name)
                name = name.replace(''', "'").replace('`', "'").replace('´', "'").replace(''', "'").replace('ʼ', "'")

                # Validate card name
                if not is_valid_card(name):
                    continue

                # Parse count (should be integer for individual decks, but allow decimal)
                count = int(float(count_str))

                # Get set/number based on section type
                if section_type in ['trainer', 'energy']:
                    latest_card = card_db.get_latest_low_rarity_version(name)
                    if latest_card:
                        set_code = latest_card.set_code
                        card_number = latest_card.number
                        full_name = f"{name} {set_code} {card_number}"
                        card_key = f"{name}|{set_code}|{card_number}".lower()
                        needs_lookup = False
                    else:
                        set_code = ""
                        card_number = ""
                        full_name = name
                        card_key = name.lower()
                        needs_lookup = False
                else:
                    # Pokemon: require set/number
                    set_code = set_code_raw
                    card_number = card_number_raw
                    
                    if set_code == 'PR-SV':
                        set_code = 'SVP'
                    
                    if not set_code or not card_number:
                        cards_to_lookup.append(len(cards))
                        full_name = name
                        card_key = name.lower()
                        needs_lookup = True
                    else:
                        full_name = f"{name} {set_code} {card_number}"
                        card_key = f"{name}|{set_code}|{card_number}".lower()
                        needs_lookup = False

                if card_key not in seen_cards and name:
                    seen_cards.add(card_key)
                    is_ace_spec = card_db.is_ace_spec_by_name(name)
                    cards.append({
                        'count': count,
                        'name': name,
                        'set_code': set_code,
                        'card_number': card_number,
                        'full_name': full_name,
                        'needs_lookup': needs_lookup,
                        'is_ace_spec': 'Yes' if is_ace_spec else 'No'
                    })
            except (ValueError, IndexError):
                continue

    # Lookup missing Pokemon card info (skip for single deck scraping to save time)
    # Can be re-enabled if needed
    
    return cards, deck_name

def aggregate_tournament_cards(all_decks: List[Dict[str, Any]], tournament_info: Dict[str, Any], card_db: CardDatabaseLookup) -> List[Dict[str, Any]]:
    """
    Aggregate card statistics from all decks in a tournament, grouped by deck archetype.
    
    Args:
        all_decks: List of deck dicts: [{'cards': [...], 'player_count': 2, 'deck_name': 'Dragapult Dusknoir'}, ...]
        tournament_info: Dict with tournament metadata (id, name, format, date, etc.)
        card_db: CardDatabaseLookup instance for fetching card details
    
    Returns:
        List of card dicts matching current_meta format:
        - meta: Tournament format (e.g., "Standard", "Expanded")
        - tournament_date: Tournament date
        - archetype: Deck archetype name (e.g., "Dragapult Dusknoir")
        - card_name: "Iron Bundle"
        - card_identifier: "PAR 56"
        - total_count: Total cards across all players of this archetype
        - max_count: Maximum count in any single deck
        - deck_count: Number of players with this card in this archetype
        - total_decks_in_archetype: Total players using this archetype
        - percentage_in_archetype: (deck_count / total_players_in_archetype) * 100
        - set_code, set_name, set_number, rarity, type, image_url, is_ace_spec
    """
    if not all_decks:
        return []
    
    # Group decks by archetype
    archetype_groups: Dict[str, List[Dict[str, Any]]] = {}
    for deck_info in all_decks:
        deck_name = deck_info.get('deck_name', 'Unknown Deck')
        if deck_name not in archetype_groups:
            archetype_groups[deck_name] = []
        archetype_groups[deck_name].append(deck_info)
    
    # Process each archetype separately
    all_aggregated_cards: List[Dict[str, Any]] = []
    
    for archetype_name, archetype_decks in archetype_groups.items():
        # Total players in this archetype
        total_players = sum(deck_info['player_count'] for deck_info in archetype_decks)
        
        # Map card_key -> {total_count: int, max_count: int, player_count: int, sample_card: Dict}
        card_stats: Dict[str, Dict[str, Any]] = {}
        
        for deck_info in archetype_decks:
            player_count = deck_info['player_count']  # How many players used this deck
            cards = deck_info['cards']
            
            # Track which cards appear in this deck (to count player occurrences)
            cards_in_deck: Set[str] = set()
            
            for card in cards:
                # Create unique key: "Name|SET|NUM"
                card_key = f"{card['name']}|{card['set_code']}|{card['card_number']}".lower()
                
                if card_key not in card_stats:
                    card_stats[card_key] = {
                        'total_count': 0,
                        'max_count': 0,
                        'player_count': 0,
                        'sample_card': card  # Keep one card for reference
                    }
                
                # Add count * player_count (if 3 players used this deck with 4 Abra, that's 12 Abra total)
                card_stats[card_key]['total_count'] += card['count'] * player_count
                
                # Track maximum count in any single deck
                if card['count'] > card_stats[card_key]['max_count']:
                    card_stats[card_key]['max_count'] = card['count']
                
                # Mark this card as appearing in this deck
                if card_key not in cards_in_deck:
                    cards_in_deck.add(card_key)
                    card_stats[card_key]['player_count'] += player_count
        
        # Convert to output format (matching current_meta structure)
        for card_key, stats in card_stats.items():
            sample = stats['sample_card']
            
            # Calculate percentage
            percentage = (stats['player_count'] / total_players * 100) if total_players > 0 else 0
            
            # Get card details from database
            card_name = sample['name']
            set_code = sample['set_code'] if sample['set_code'] else ''
            card_number = sample['card_number'] if sample['card_number'] else ''
            card_identifier = f"{set_code} {card_number}" if set_code and card_number else ''
            
            # Fetch full card details from database
            set_name = ''
            rarity = ''
            card_type = ''
            image_url = ''
            
            if set_code and card_number:
                db_card = card_db.manager.get_card(set_code, card_number)
                if db_card:
                    set_name = db_card.get('set_name', '')
                    rarity = db_card.get('rarity', '')
                    card_type = db_card.get('type', '')
                    image_url = db_card.get('image_url', '')
            
            all_aggregated_cards.append({
                'meta': tournament_info.get('format', 'Past Meta'),  # Use actual tournament format
                'tournament_date': tournament_info.get('date', ''),
                'archetype': archetype_name,  # Deck archetype name (e.g., "Dragapult Dusknoir")
                'card_name': card_name,
                'card_identifier': card_identifier,
                'total_count': stats['total_count'],
                'max_count': stats['max_count'],
                'deck_count': stats['player_count'],
                'total_decks_in_archetype': total_players,
                'percentage_in_archetype': round(percentage, 2),
                'set_code': set_code,
                'set_name': set_name,
                'set_number': card_number,
                'rarity': rarity,
                'type': card_type,
                'image_url': image_url,
                'is_ace_spec': sample['is_ace_spec']
            })
    
    return all_aggregated_cards

def extract_cards_from_page(cards_url: str, card_db: CardDatabaseLookup, deck_name: Optional[str] = None) -> List[Dict[str, Any]]:
    """Extract card data from a tournament's cards page."""
    print(f"Fetching cards from: {cards_url}")
    html_content = fetch_page(cards_url)
    if not html_content:
        return []

    cards: List[Dict[str, Any]] = []
    seen_cards: Set[str] = set()
    cards_to_lookup: List[int] = []  # Track cards that need lookup
    
    # Regex patterns
    heading_pattern = re.compile(r'<div[^>]*class="decklist-column-heading"[^>]*>\s*([^<]+?)\s*</div>', re.IGNORECASE)
    card_pattern = re.compile(r'<div[^>]*class="decklist-card"[^>]*data-set="([A-Z0-9]*)"[^>]*data-number="(\d*)"[^>]*>.*?<span class="card-count">([0-9.]+)</span>\s*<span class="card-name">([^<]+)</span>', re.IGNORECASE | re.DOTALL)

    # Find all headings with their span (start/end ranges)
    headings: List[Dict[str, Any]] = []
    for m in heading_pattern.finditer(html_content):
        title = m.group(1).strip().lower()
        # Classify section by heading text
        if 'trainer' in title:
            section_type = 'trainer'
        elif 'energy' in title:
            section_type = 'energy'
        else:
            section_type = 'pokemon'
        headings.append({'start': m.end(), 'type': section_type})

    # Determine end positions for headings
    for idx in range(len(headings)):
        start = headings[idx]['start']
        end = headings[idx + 1]['start'] if idx + 1 < len(headings) else len(html_content)
        headings[idx]['end'] = end

    # Extract cards per section so we know exact type
    for sec in headings if headings else [{'start': 0, 'end': len(html_content), 'type': 'pokemon'}]:
        block = html_content[sec['start']:sec['end']]
        section_type = sec['type']

        for match in card_pattern.findall(block):
            try:
                set_code_raw = match[0].upper() if match[0] else ""
                card_number_raw = match[1] if match[1] else ""
                count_str = match[2]
                name = match[3].strip()

                # Decode HTML entities (e.g., &#039; -> ')
                name = html.unescape(name)

                # Normalize different apostrophe characters to standard ASCII apostrophe
                name = name.replace(''', "'").replace('`', "'").replace('´', "'").replace(''', "'").replace('ʼ', "'")

                # IMPORTANT: Validate card name against database before processing
                # This filters out tournament titles like "CUT WILL GET COAL", "January 2025", etc.
                if not is_valid_card(name):
                    # Not a valid card - likely tournament title or metadata
                    continue

                # Parse count (can be decimal like 3.78)
                count = float(count_str)

                # TRUST THE SECTION HEADING from HTML!
                # Trainer/Energy sections: Get latest low-rarity version from database
                # Pokemon section: ALWAYS include set/number from scraped data
                
                if section_type in ['trainer', 'energy']:
                    # For Trainer/Energy: Get latest low-rarity version from database
                    latest_card = card_db.get_latest_low_rarity_version(name)
                    if latest_card:
                        set_code = latest_card.set_code
                        card_number = latest_card.number
                        full_name = f"{name} {set_code} {card_number}"
                        card_key = f"{name}|{set_code}|{card_number}".lower()
                        needs_lookup = False
                    else:
                        # Fallback if not found in database
                        set_code = ""
                        card_number = ""
                        full_name = name
                        card_key = name.lower()
                        needs_lookup = False
                else:
                    # For Pokemon: ALWAYS require set/number
                    set_code = set_code_raw
                    card_number = card_number_raw
                    
                    # Fix PR-SV to SVP mapping
                    if set_code == 'PR-SV':
                        set_code = 'SVP'
                    
                    # Check if Pokemon card is missing set/number info
                    if not set_code or not card_number:
                        # Mark for lookup
                        cards_to_lookup.append(len(cards))
                        full_name = name
                        card_key = name.lower()
                        needs_lookup = True
                    else:
                        full_name = f"{name} {set_code} {card_number}"
                        card_key = f"{name}|{set_code}|{card_number}".lower()
                        needs_lookup = False

                if card_key not in seen_cards and name:
                    seen_cards.add(card_key)
                    # Determine if card is an Ace Spec
                    is_ace_spec = card_db.is_ace_spec_by_name(name)
                    cards.append({
                        'count': count,
                        'name': name,
                        'set_code': set_code,
                        'card_number': card_number,
                        'full_name': full_name,
                        'needs_lookup': needs_lookup,
                        'is_ace_spec': 'Yes' if is_ace_spec else 'No'
                    })
            except (ValueError, IndexError):
                continue

    # Lookup missing card info - ONLY for Pokemon cards
    if cards_to_lookup:
        print(f"  Looking up {len(cards_to_lookup)} Pokemon cards with missing set/number info...")
        successful_lookups = 0
        failed_lookups = 0
        
        for idx in cards_to_lookup:
            if idx >= len(cards):
                print(f"    WARNING: Invalid index {idx}, skipping")
                continue
                
            card = cards[idx]
            
            # SAFETY CHECK: Double-check this is not a Trainer/Energy
            if is_trainer_or_energy(card['name']):
                print(f"    SKIPPING (detected as Trainer/Energy): {card['name']}")
                card['needs_lookup'] = False
                continue
            
            print(f"    Looking up: {card['name']}...", end=' ')
            info = lookup_card_info(card['name'])
            if info:
                # Fix PR-SV to SVP mapping
                set_code = info['set_code']
                if set_code == 'PR-SV':
                    set_code = 'SVP'
                card['set_code'] = set_code
                card['card_number'] = info['card_number']
                card['full_name'] = f"{card['name']} {set_code} {info['card_number']}"
                card['needs_lookup'] = False
                successful_lookups += 1
                print(f"✓ {card['full_name']}")
            else:
                # KEEP the card even if lookup fails - don't remove Pokemon cards!
                card['needs_lookup'] = False
                failed_lookups += 1
                print(f"✗ NOT FOUND - keeping card anyway: {card['name']}")
            # Update Ace Spec status (in case it wasn't set or needs update)
            card['is_ace_spec'] = 'Yes' if card_db.is_ace_spec_by_name(card['name']) else 'No'
            time.sleep(0.3)  # Rate limiting
        
        print(f"  Lookup summary: {successful_lookups} found, {failed_lookups} kept without set/number")

    return cards

def save_csv_files(all_data: List[Dict[str, Any]], output_file: str, append_mode: bool = False):
    """Save scraped data to CSV files."""
    # Save to data/ directory like other scrapers
    # Overview file
    overview_file = os.path.join(get_data_dir(), output_file.replace('.csv', '_overview.csv'))
    overview_rows: List[Dict[str, Any]] = []
    
    for tournament in all_data:
        overview_rows.append({
            'tournament_id': tournament['id'],
            'tournament_name': tournament['name'],
            'tournament_date': tournament.get('date', ''),
            'players': tournament.get('players', ''),
            'format': tournament.get('format', ''),
            'cards_url': tournament['cards_url'],
            'total_cards': tournament.get('total_cards', 0),
            'status': tournament['status']
        })
    
    # Handle append mode for overview file
    if append_mode and os.path.exists(overview_file):
        # Load existing data
        existing_ids: Set[str] = set()
        with open(overview_file, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f, delimiter=';')
            for row in reader:
                existing_ids.add(row['tournament_id'])
        # Filter out duplicates
        overview_rows = [r for r in overview_rows if r['tournament_id'] not in existing_ids]
        if overview_rows:
            print(f"[Append Mode] Adding {len(overview_rows)} new tournaments to overview file")
            with open(overview_file, 'a', newline='', encoding='utf-8-sig') as f:
                fieldnames = ['tournament_id', 'tournament_name', 'tournament_date', 
                             'players', 'format', 'cards_url', 'total_cards', 'status']
                writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=';')
                writer.writerows(overview_rows)
        else:
            print(f"[Append Mode] No new tournaments to add (all already exist)")
    else:
        with open(overview_file, 'w', newline='', encoding='utf-8-sig') as f:
            fieldnames = ['tournament_id', 'tournament_name', 'tournament_date', 
                         'players', 'format', 'cards_url', 'total_cards', 'status']
            writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=';')
            writer.writeheader()
            writer.writerows(overview_rows)
    
    # Cards file (matching current_meta format)
    cards_file = os.path.join(get_data_dir(), output_file.replace('.csv', '_cards.csv'))
    card_rows: List[Dict[str, Any]] = []
    
    for tournament in all_data:
        for card in tournament.get('cards', []):
            # Cards come pre-aggregated with all necessary fields
            card_rows.append({
                'meta': card.get('meta', 'Past Meta'),
                'tournament_date': card.get('tournament_date', ''),
                'archetype': card.get('archetype', ''),
                'card_name': card.get('card_name', ''),
                'card_identifier': card.get('card_identifier', ''),
                'total_count': card.get('total_count', 0),
                'max_count': card.get('max_count', 0),
                'deck_count': card.get('deck_count', 0),
                'total_decks_in_archetype': card.get('total_decks_in_archetype', 0),
                'percentage_in_archetype': str(card.get('percentage_in_archetype', 0)).replace('.', ','),  # German format
                'set_code': card.get('set_code', ''),
                'set_name': card.get('set_name', ''),
                'set_number': card.get('set_number', ''),
                'rarity': card.get('rarity', ''),
                'type': card.get('type', ''),
                'image_url': card.get('image_url', ''),
                'is_ace_spec': card.get('is_ace_spec', 'No')
            })
    
    # Handle append mode for cards file
    if card_rows:
        if append_mode and os.path.exists(cards_file):
            # Load existing data to avoid duplicates (check by archetype + card_name)
            existing_entries: Set[str] = set()
            with open(cards_file, 'r', encoding='utf-8-sig') as f:
                reader = csv.DictReader(f, delimiter=';')
                for row in reader:
                    key = f"{row.get('archetype', '')}|{row.get('card_name', '')}|{row.get('card_identifier', '')}"
                    existing_entries.add(key)
            
            # Filter out duplicate entries
            new_card_rows: List[Dict[str, Any]] = []
            for r in card_rows:
                key = f"{r['archetype']}|{r['card_name']}|{r['card_identifier']}"
                if key not in existing_entries:
                    new_card_rows.append(r)
            
            if new_card_rows:
                print(f"[Append Mode] Adding {len(new_card_rows)} new card entries to cards file")
                with open(cards_file, 'a', newline='', encoding='utf-8-sig') as f:
                    fieldnames = ['meta', 'tournament_date', 'archetype', 'card_name', 'card_identifier', 
                                'total_count', 'max_count', 'deck_count', 'total_decks_in_archetype', 
                                'percentage_in_archetype', 'set_code', 'set_name', 'set_number', 
                                'rarity', 'type', 'image_url', 'is_ace_spec']
                    writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=';')
                    writer.writerows(new_card_rows)
            else:
                print(f"[Append Mode] No new card entries to add")
        else:
            with open(cards_file, 'w', newline='', encoding='utf-8-sig') as f:
                fieldnames = ['meta', 'tournament_date', 'archetype', 'card_name', 'card_identifier', 
                            'total_count', 'max_count', 'deck_count', 'total_decks_in_archetype', 
                            'percentage_in_archetype', 'set_code', 'set_name', 'set_number', 
                            'rarity', 'type', 'image_url', 'is_ace_spec']
                writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=';')
                writer.writeheader()
                writer.writerows(card_rows)
    
    return overview_file, cards_file

def main():
    print("=" * 80)
    print("TOURNAMENT SCRAPER JH - Starting...")
    print("=" * 80)
    print()
    
    # Load settings
    print("Step 1: Loading settings...")
    try:
        settings = load_settings()
    except Exception as e:
        print(f"ERROR: Failed to load settings: {e}")
        import traceback
        traceback.print_exc()
        return
    
    max_tournaments = settings['max_tournaments']
    delay = settings['delay_between_tournaments']
    output_file = settings['output_file']
    start_tournament_id = settings.get('start_tournament_id', None)
    tournament_types = settings.get('tournament_types', ["Regional", "Special Event", "LAIC", "EUIC", "NAIC", "Worlds", "International", "Championship"])
    append_mode = settings.get('append_mode', False)
    
    print(f"✓ Settings loaded successfully")
    print(f"  Max tournaments: {max_tournaments}")
    print(f"  Append mode: {append_mode}")
    print(f"  Scraping mode: INDIVIDUAL DECK LISTS (all decks per tournament)")
    print()
    
    # Initialize card database (now uses unified CardDataManager)
    print("Step 2: Loading unified card database (English + Japanese)...")
    try:
        card_db = CardDatabaseLookup()  # Auto-loads from CardDataManager
    except Exception as e:
        print(f"ERROR: Could not load card database: {e}")
        print("Make sure CardDataManager and databases are properly configured.")
        print("To setup databases, run: python update_cards.py --type english --mode full")
        import traceback
        traceback.print_exc()
        return
    
    print(f"Loaded card database with {len(card_db.cards)} unique cards")
    
    base_url = "https://limitlesstcg.com/tournaments"
    all_data: List[Dict[str, Any]] = []
    
    print("Starting Limitless TCG Tournament Cards Scraper...")
    print(f"Settings: max_tournaments={max_tournaments}, scraping mode=INDIVIDUAL DECKS")
    if start_tournament_id:
        print(f"Stop at tournament ID: {start_tournament_id} (oldest tournament to include)")
    print(f"Tournament types filter: {', '.join(tournament_types)}")
    print("=" * 50)
    
    # Load scraped tournament tracking
    scraped_ids = load_scraped_tournaments()
    newly_scraped_ids: Set[str] = set()
    processed_count = 0  # Track successfully processed tournaments
    
    # Get tournament links
    tournaments = get_tournament_links(base_url, max_tournaments, start_tournament_id, scraped_ids)
    if not tournaments:
        print("No tournaments found.")
        return
    
    for i, tournament in enumerate(tournaments, 1):
        # Stop if we've processed enough tournaments
        if processed_count >= max_tournaments:
            print(f"\nReached max_tournaments limit ({max_tournaments}). Stopping.")
            break
        
        print(f"\nProcessing tournament {i}/{len(tournaments)}")
        print("-" * 30)
        
        # Get tournament info
        print(f"Fetching tournament info: {tournament['url']}")
        info = get_tournament_info(tournament['url'])
        tournament['name'] = info['name']
        tournament['date'] = info['date']
        tournament['players'] = info['players']
        tournament['format'] = info['format']
        tournament['meta'] = info.get('meta', '')
        
        # Skip Standard (JP) tournaments - they use different card pool
        if tournament['meta'] == 'Standard (JP)':
            print(f"[SKIP] Standard (JP) tournament: {tournament['name']}")
            continue
        
        # Skip Expanded tournaments
        if tournament['meta'] == 'Expanded':
            print(f"[SKIP] Expanded tournament: {tournament['name']}")
            continue
        
        # Filter by tournament type (Regional, Special Event, LAIC, EUIC, NAIC, Worlds, etc.)
        tournament_name = tournament['name']
        tournament_name_lower = tournament_name.lower()
        
        # Blacklist: Skip National Championships (format: "[Country] Championships YYYY")
        # Examples: "Singapore Championships 2024", "Philippines Championships 2024"
        # Should NOT match: "Regional Sydney", "LAIC São Paulo", etc.
        national_championship_patterns = [
            'singapore championships', 'philippines championships', 'japan championships',
            'indonesia championships', 'thailand championships', 'malaysia championships',
            'taiwan championships', 'korea championships', 'hong kong championships',
            'australia championships', 'new zealand championships'
        ]
        
        is_national_championship = any(pattern in tournament_name_lower for pattern in national_championship_patterns)
        
        if is_national_championship:
            print(f"[SKIP] National Championship (not tracked): {tournament_name}")
            continue
        
        # Check if tournament matches allowed types
        is_valid_type = any(ttype.lower() in tournament_name_lower for ttype in tournament_types)
        
        if not is_valid_type:
            print(f"[SKIP] Non-major tournament: {tournament_name}")
            print(f"       (Only scraping: {', '.join(tournament_types)})")
            continue
        
        print(f"[OK] Tournament: {tournament['name']}")
        if info['format']:
            print(f"     Format: {info['format']}")
        
        # NEW APPROACH: Scrape individual deck lists instead of archetyp aggregations
        print(f"Fetching individual deck lists from tournament page...")
        deck_list_urls = get_deck_list_links(tournament['url'])
        
        if not deck_list_urls:
            print(f"  WARNING: No deck lists found for this tournament")
            tournament['cards'] = []
            tournament['total_cards'] = 0
            tournament['status'] = 'no decks found'
            all_data.append(tournament)
            newly_scraped_ids.add(tournament['id'])
            continue
        
        total_players = sum(d['player_count'] for d in deck_list_urls)
        print(f"  Found {len(deck_list_urls)} unique decks representing {total_players} total players")
        print(f"  Estimated time: ~{len(deck_list_urls) * 0.3 / 60:.1f} minutes")
        
        # Scrape each individual deck (with player counts)
        all_decks: List[Dict[str, Any]] = []  # List of dicts: {'cards': [...], 'player_count': 2}
        successful_decks = 0
        failed_decks = 0
        
        for j, deck_info in enumerate(deck_list_urls, 1):
            # Progress indicator every 10 decks
            if j % 10 == 0 or j == 1:
                print(f"  Progress: {j}/{len(deck_list_urls)} decks ({successful_decks} ok, {failed_decks} failed)")
            
            try:
                cards, deck_name = extract_single_deck(deck_info['url'], card_db)
                if cards:
                    all_decks.append({
                        'cards': cards,
                        'player_count': deck_info['player_count'],
                        'deck_name': deck_name
                    })
                    successful_decks += 1
                else:
                    failed_decks += 1
            except Exception as e:
                print(f"    ERROR scraping {deck_info['url']}: {e}")
                failed_decks += 1
            
            # Rate limiting: 0.3s between requests
            if j < len(deck_list_urls):
                time.sleep(0.3)
        
        print(f"  Scraping complete: {successful_decks} decks ok, {failed_decks} failed")
        
        # Aggregate statistics across all decks
        if all_decks:
            total_players = sum(d['player_count'] for d in all_decks)
            print(f"  Aggregating statistics across {len(all_decks)} unique decks ({total_players} total players)...")
            tournament_cards = aggregate_tournament_cards(all_decks, tournament, card_db)
            tournament['cards'] = tournament_cards
            tournament['total_cards'] = len(tournament_cards)
            tournament['status'] = 'success'
            print(f"  Found {len(tournament_cards)} unique cards")
        else:
            print(f"  No valid decks found")
            tournament['cards'] = []
            tournament['total_cards'] = 0
            tournament['status'] = 'no valid decks'
        
        all_data.append(tournament)
        
        # Track successfully scraped tournament
        newly_scraped_ids.add(tournament['id'])
        processed_count += 1  # Increment counter for successfully processed tournaments
        
        # AUTO-SAVE after each tournament (safe against interruptions)
        print(f"  💾 Saving tournament data...")
        try:
            # For first tournament: use original append_mode setting
            # For subsequent tournaments: always append
            current_append_mode = append_mode if i == 1 else True
            
            # Save tracking first
            all_scraped_ids = scraped_ids | newly_scraped_ids
            save_scraped_tournaments(all_scraped_ids)
            
            # Save CSV files
            overview_file, cards_file = save_csv_files([tournament], output_file, append_mode=current_append_mode)
            print(f"  ✓ Saved to CSV (append_mode={current_append_mode})")
        except Exception as save_error:
            print(f"  ⚠ Warning: Could not save tournament data: {save_error}")
        
        if delay > 0 and i < len(tournaments):
            time.sleep(delay)
    
    # Final summary
    if all_data:
        print(f"\n" + "=" * 50)
        print(f"Scraping completed!")
        print(f"Tournaments processed: {len(all_data)}")
        total_cards = sum(t.get('total_cards', 0) for t in all_data)
        print(f"Total unique cards extracted: {total_cards}")
        print(f"Data saved to: {os.path.join(get_data_dir(), output_file.replace('.csv', '_cards.csv'))}")
    else:
        print("No data collected.")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n" + "=" * 50)
        print("SCRAPER INTERRUPTED BY USER (Ctrl+C)")
        print("=" * 50)
        print("\nNOTE: Partial data may not have been saved.")
        print("To save progress during interruption, restart the scraper.")
    except Exception as e:
        print(f"\nError occurred: {e}")
        import traceback
        traceback.print_exc()
    finally:
        print("\n" + "=" * 50)
        input("Press Enter to close...")
