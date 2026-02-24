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
from typing import List, Dict, Optional

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


def load_scraped_tournaments() -> set:
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


def save_scraped_tournaments(tournament_ids: set) -> None:
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
DEFAULT_SETTINGS = {
    "max_tournaments": 150,
    "max_decks_per_tournament": 1,
    "delay_between_tournaments": 0,
    "start_tournament_id": 391,
    "output_file": "tournament_cards_data.csv",
    "format_filter": ["Standard"],
    "tournament_types": ["Regional", "Special Event", "LAIC", "EUIC", "NAIC", "Worlds", "International", "Championship"],
    "append_mode": True,
    "_comment": "Nur Standard-Format Turniere (Regional, Special Event, LAIC, EUIC, NAIC, Worlds) werden automatisch gescraped. append_mode=True keeps old tournament data."
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

def load_settings() -> Dict:
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

def get_tournament_links(base_url: str, max_tournaments: int, start_tournament_id: int = None, scraped_ids: set = None) -> List[Dict]:
    """Get tournament links from the main tournaments page with pagination support."""
    print("Fetching tournaments list...")
    if start_tournament_id:
        print(f"Filter: Tournaments from latest down to ID {start_tournament_id}")
    
    if scraped_ids is None:
        scraped_ids = set()
    
    tournaments = []
    seen_ids = set()
    skipped_count = 0
    page = 1
    stop_scraping = False
    
    # Load multiple pages if needed
    while len(tournaments) < max_tournaments and not stop_scraping:
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
                
                # If we've reached max_tournaments, stop
                if len(tournaments) >= max_tournaments:
                    stop_scraping = True
                    break
        
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

def get_tournament_info(tournament_url: str) -> Dict:
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

def get_deck_options(cards_url: str) -> List[Dict]:
    """Extract deck options from the dropdown on the cards page."""
    html = fetch_page(cards_url)
    if not html:
        return []
    
    deck_options = []
    
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
_card_lookup_cache = {}

def lookup_card_info(card_name: str, retries: int = 3) -> Optional[Dict]:
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

def extract_cards_from_page(cards_url: str, card_db: CardDatabaseLookup, deck_name: str = None) -> List[Dict]:
    """Extract card data from a tournament's cards page."""
    print(f"Fetching cards from: {cards_url}")
    html_content = fetch_page(cards_url)
    if not html_content:
        return []

    cards: List[Dict] = []
    seen_cards = set()
    cards_to_lookup = []  # Track cards that need lookup

    # Regex patterns
    heading_pattern = re.compile(r'<div[^>]*class="decklist-column-heading"[^>]*>\s*([^<]+?)\s*</div>', re.IGNORECASE)
    card_pattern = re.compile(r'<div[^>]*class="decklist-card"[^>]*data-set="([A-Z0-9]*)"[^>]*data-number="(\d*)"[^>]*>.*?<span class="card-count">([0-9.]+)</span>\s*<span class="card-name">([^<]+)</span>', re.IGNORECASE | re.DOTALL)

    # Find all headings with their span (start/end ranges)
    headings = []
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

def save_csv_files(all_data: List[Dict], output_file: str, append_mode: bool = False):
    """Save scraped data to CSV files."""
    # Save to data/ directory like other scrapers
    # Overview file
    overview_file = os.path.join(get_data_dir(), output_file.replace('.csv', '_overview.csv'))
    overview_rows = []
    
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
        existing_ids = set()
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
    
    # Cards file
    cards_file = os.path.join(get_data_dir(), output_file.replace('.csv', '_cards.csv'))
    card_rows = []
    
    for tournament in all_data:
        for card in tournament.get('cards', []):
            # Round up the card count (e.g., 0.1 -> 1, 3.78 -> 4)
            count = card.get('count', 0)
            rounded_count = math.ceil(count) if count > 0 else 0
            card_rows.append({
                'tournament_id': tournament['id'],
                'tournament_name': tournament['name'],
                'format': tournament.get('format', ''),
                'deck_name': card.get('deck_name', ''),
                'card_count': rounded_count,
                'full_card_name': card.get('full_name', ''),
                'is_ace_spec': card.get('is_ace_spec', 'No')
            })
    
    # Handle append mode for cards file
    if card_rows:
        if append_mode and os.path.exists(cards_file):
            # Load existing tournament IDs to avoid duplicates
            existing_tournament_ids = set()
            with open(cards_file, 'r', encoding='utf-8-sig') as f:
                reader = csv.DictReader(f, delimiter=';')
                for row in reader:
                    existing_tournament_ids.add(row['tournament_id'])
            # Filter out cards from tournaments that already exist
            card_rows = [r for r in card_rows if r['tournament_id'] not in existing_tournament_ids]
            if card_rows:
                print(f"[Append Mode] Adding {len(card_rows)} new card entries to cards file")
                with open(cards_file, 'a', newline='', encoding='utf-8-sig') as f:
                    fieldnames = ['tournament_id', 'tournament_name', 'format', 'deck_name', 'card_count', 'full_card_name', 'is_ace_spec']
                    writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=';')
                    writer.writerows(card_rows)
            else:
                print(f"[Append Mode] No new card entries to add")
        else:
            with open(cards_file, 'w', newline='', encoding='utf-8-sig') as f:
                fieldnames = ['tournament_id', 'tournament_name', 'format', 'deck_name', 'card_count', 'full_card_name', 'is_ace_spec']
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
    max_decks = settings.get('max_decks_per_tournament', 1)
    delay = settings['delay_between_tournaments']
    output_file = settings['output_file']
    start_tournament_id = settings.get('start_tournament_id', None)
    tournament_types = settings.get('tournament_types', ["Regional", "Special Event", "LAIC", "EUIC", "NAIC", "Worlds", "International", "Championship"])
    append_mode = settings.get('append_mode', False)
    
    print(f"✓ Settings loaded successfully")
    print(f"  Max tournaments: {max_tournaments}")
    print(f"  Append mode: {append_mode}")
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
    all_data = []
    
    print("Starting Limitless TCG Tournament Cards Scraper...")
    print(f"Settings: max_tournaments={max_tournaments}, max_decks_per_tournament={max_decks}")
    if start_tournament_id:
        print(f"Stop at tournament ID: {start_tournament_id} (oldest tournament to include)")
    print(f"Tournament types filter: {', '.join(tournament_types)}")
    print("=" * 50)
    
    # Load scraped tournament tracking
    scraped_ids = load_scraped_tournaments()
    print(f"[DEBUG] Loaded {len(scraped_ids)} tournament IDs from tracking file")
    if scraped_ids:
        print(f"[DEBUG] First few IDs: {sorted(list(scraped_ids))[:10]}")
    newly_scraped_ids = set()
    
    # Get tournament links
    tournaments = get_tournament_links(base_url, max_tournaments, start_tournament_id, scraped_ids)
    if not tournaments:
        print("No tournaments found.")
        return
    
    for i, tournament in enumerate(tournaments, 1):
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
        
        # Get deck options from dropdown
        deck_options = get_deck_options(tournament['cards_url'])
        decks_to_scrape = deck_options[:max_decks] if deck_options else []
        
        # Add total deck count to tournament name
        if deck_options:
            tournament['name'] = f"{tournament['name']} ({len(deck_options)} decks)"
        
        all_cards = []
        
        if decks_to_scrape:
            print(f"Found {len(deck_options)} deck archetypes, scraping top {len(decks_to_scrape)}")
            
            for j, deck in enumerate(decks_to_scrape, 1):
                deck_url = f"{tournament['cards_url']}?deck={deck['data_value']}"
                print(f"  Deck {j}/{len(decks_to_scrape)}: {deck['deck_name']} ({deck['decklist_count']} lists)")
                
                cards = extract_cards_from_page(deck_url, card_db, deck['deck_name'])
                
                # Add deck name to each card
                for card in cards:
                    card['deck_name'] = deck['deck_name']
                
                all_cards.extend(cards)
        else:
            # Fallback: just scrape the default page
            print("No deck dropdown found, scraping default page")
            cards = extract_cards_from_page(tournament['cards_url'], card_db)
            for card in cards:
                card['deck_name'] = 'Default'
            all_cards.extend(cards)
        
        tournament['cards'] = all_cards
        tournament['total_cards'] = len(all_cards)
        tournament['status'] = 'success' if all_cards else 'no cards found'
        
        print(f"Found {len(all_cards)} total cards")
        
        all_data.append(tournament)
        
        # Track successfully scraped tournament
        newly_scraped_ids.add(tournament['id'])
        
        if delay > 0 and i < len(tournaments):
            time.sleep(delay)
    
    # Save to CSV
    if all_data:
        # Save tracking first
        if newly_scraped_ids:
            all_scraped_ids = scraped_ids | newly_scraped_ids
            save_scraped_tournaments(all_scraped_ids)
            print(f"✓ Saved {len(newly_scraped_ids)} new tournament IDs to tracking file")
            print(f"  Total tracked tournaments: {len(all_scraped_ids)}")
        
        overview_file, cards_file = save_csv_files(all_data, output_file, append_mode=append_mode)
        
        print(f"\n" + "=" * 50)
        print(f"Scraping completed!")
        print(f"Overview data saved to: {overview_file}")
        print(f"Detailed card data saved to: {cards_file}")
        
        total_cards = sum(t.get('total_cards', 0) for t in all_data)
        print(f"Tournaments processed: {len(all_data)}")
        print(f"Total cards extracted: {total_cards}")
    else:
        print("No data collected.")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\nError occurred: {e}")
        import traceback
        traceback.print_exc()
    finally:
        print("\n" + "=" * 50)
        input("Press Enter to close...")
