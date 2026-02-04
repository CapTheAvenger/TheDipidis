#!/usr/bin/env python3
"""
Limitless TCG City League Scraper
Scrapes deck data from Japanese City League tournaments at limitlesstcg.com/tournaments/jp
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
from datetime import datetime
from html.parser import HTMLParser
from typing import List, Dict, Optional

# Import the reliable card type lookup module with Japanese support
from card_type_lookup import is_trainer_or_energy_jp, is_valid_card_jp

# Default settings
DEFAULT_SETTINGS = {
    "start_date": "24.01.2026",
    "end_date": "25.01.2026",
    "max_decklists_per_league": 16,  # Set to 0 or -1 to scrape ALL decklists
    "delay_between_requests": 0,
    "output_file": "city_league_data.csv"
}

def get_app_path() -> str:
    """Get the directory where the executable/script is located."""
    if getattr(sys, 'frozen', False):
        # Running as compiled executable
        return os.path.dirname(sys.executable)
    else:
        # Running as script
        return os.path.dirname(os.path.abspath(__file__))

def load_settings() -> Dict:
    """Load settings from city_league_settings.json, or create it with defaults if it doesn't exist."""
    app_path = get_app_path()
    settings_path = os.path.join(app_path, 'city_league_settings.json')
    
    # If running from dist folder, also check parent folder
    if not os.path.exists(settings_path) and os.path.basename(app_path) == 'dist':
        parent_path = os.path.dirname(app_path)
        parent_settings_path = os.path.join(parent_path, 'city_league_settings.json')
        if os.path.exists(parent_settings_path):
            settings_path = parent_settings_path
    
    print(f"Loading settings from: {settings_path}")
    
    if os.path.exists(settings_path):
        try:
            with open(settings_path, 'r', encoding='utf-8-sig') as f:
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
            print(f"Error loading city_league_settings.json: {e}")
            print("Using default settings.")
            return DEFAULT_SETTINGS.copy()
    else:
        # Create default settings file
        print(f"Settings file not found. Creating new file with defaults.")
        with open(settings_path, 'w', encoding='utf-8') as f:
            json.dump(DEFAULT_SETTINGS, f, indent=4)
        print(f"Created default city_league_settings.json at {settings_path}")
        return DEFAULT_SETTINGS.copy()

def parse_date(date_str: str) -> datetime:
    """Parse date from DD.MM.YYYY format."""
    try:
        return datetime.strptime(date_str, "%d.%m.%Y")
    except ValueError:
        print(f"Error parsing date: {date_str}. Using format DD.MM.YYYY")
        raise

def parse_tournament_date(date_str: str) -> Optional[datetime]:
    """Parse date from format like '24 Jan 26' to datetime."""
    try:
        # Parse "24 Jan 26" format
        date_obj = datetime.strptime(date_str, "%d %b %y")
        return date_obj
    except ValueError:
        print(f"Could not parse date: {date_str}")
        return None

def fetch_page(url: str) -> str:
    """Fetch a webpage and return its HTML content."""
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=15) as response:
            return response.read().decode('utf-8', errors='ignore')
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return ""

def get_city_league_links(base_url: str, start_date: datetime, end_date: datetime) -> List[Dict]:
    """Get city league tournament links from the main page within the specified date range."""
    print("Fetching city leagues list...")
    
    leagues = []
    seen_ids = set()
    
    print(f"Filtering for dates between {start_date.strftime('%d.%m.%Y')} and {end_date.strftime('%d.%m.%Y')}")
    
    # Fetch the page with show=500
    fetch_url = f"{base_url}?show=500"
    print(f"Loading tournament list from: {fetch_url}")
    html = fetch_page(fetch_url)
    
    if not html:
        print("Failed to fetch tournament list")
        return []
    
    # Parse table rows to match dates with tournament IDs
    # Strategy: Find all links to /tournaments/jp/ID and extract the date from the link text
    # Pattern: <a href="...tournaments/jp/12345...">24 Jan 26</a>
    
    # First, find all tournament links
    link_pattern = r'<a[^>]+href="[^"]*?/tournaments/jp/(\d+)"[^>]*>([^<]+)</a>'
    matches = re.findall(link_pattern, html, re.IGNORECASE)
    
    print(f"Found {len(matches)} tournament entries")
    
    # Process each match (tournament_id, link_text)
    for tournament_id, link_text in matches:
        # Extract date from link text (e.g., "24 Jan 26" or "24 Jan 2026")
        date_match = re.search(r'(\d{1,2}\s+[A-Za-z]{3}\s+\d{2,4})', link_text.strip())
        if not date_match:
            continue
        
        date_str = date_match.group(1)
        tournament_date = parse_tournament_date(date_str)
        
        if not tournament_date:
            continue
        
        # Check if date is in range
        if tournament_date < start_date or tournament_date > end_date:
            continue
        
        # Check if we've already seen this tournament
        if tournament_id not in seen_ids:
            seen_ids.add(tournament_id)
            url = f'https://limitlesstcg.com/tournaments/jp/{tournament_id}'
            leagues.append({
                'id': tournament_id,
                'url': url,
                'date_str': date_str
            })
            print(f"  ✓ {date_str} - Tournament ID: {tournament_id}")
    
    print(f"Found {len(leagues)} city leagues in the specified date range")
    return leagues

def get_league_info(league_url: str) -> Dict:
    """Get city league name and details from the league page."""
    html = fetch_page(league_url)
    if not html:
        return {'name': 'Unknown League', 'date': '', 'shop': ''}
    
    info = {'name': 'Unknown League', 'date': '', 'shop': ''}
    
    # Try to extract league name from title
    title_match = re.search(r'<title>([^<]+)</title>', html, re.IGNORECASE)
    if title_match:
        title = title_match.group(1).strip()
        # Clean up title
        title = re.sub(r'\s*[–\-]\s*Limitless.*$', '', title)
        info['name'] = title
    
    # Try to extract date
    date_match = re.search(r'(\d{1,2}(?:st|nd|rd|th)?\s+\w+\s+\d{4})', html)
    if date_match:
        info['date'] = date_match.group(1)
    
    return info

def get_decklist_links(league_url: str, max_decklists: int) -> List[Dict]:
    """Get decklist links from a city league page, including archetype data."""
    html = fetch_page(league_url)
    if not html:
        return []
    
    decklists = []
    
    # Extract data from table rows
    # Each row contains: placement, player name, deck images, and decklist link
    row_pattern = r'<tr>(.*?)</tr>'
    rows = re.findall(row_pattern, html, re.DOTALL)
    
    seen_urls = set()
    for row in rows:
        # Extract cells
        cells = re.findall(r'<td>(.*?)</td>', row, re.DOTALL)
        
        if len(cells) >= 3:
            # Cell 0: placement number
            # Cell 1: player name
            # Cell 2: deck with images
            placement = re.sub(r'<[^>]+>', '', cells[0]).strip()
            
            # Extract deck URL
            url_match = re.search(r'href="(https://limitlesstcg\.com/decks/list/jp/\d+)"', row)
            if not url_match:
                continue
            
            url = url_match.group(1)
            
            # Skip duplicates
            if url in seen_urls or not placement.isdigit():
                continue
            
            seen_urls.add(url)
            
            # Extract pokemon names from alt attributes (same as archetype scraper)
            pokemon_names = re.findall(r'alt="([^"]+)"', cells[2])
            # Fix mega pokemon names
            pokemon_names = [fix_mega_pokemon_name(name) for name in pokemon_names]
            archetype = ' '.join(pokemon_names) if pokemon_names else 'Unknown'
            
            decklists.append({
                'rank': int(placement),
                'url': url,
                'archetype': archetype  # Pre-extracted archetype
            })
    
    # If max_decklists <= 0, return ALL decklists
    if max_decklists <= 0:
        return decklists
    return decklists[:max_decklists]

def fix_mega_pokemon_name(name: str) -> str:
    """Fix mega pokemon names (convert 'pokemon-mega' to 'Mega pokemon')."""
    if '-mega' in name.lower():
        base_name = name.replace('-mega', '').replace('-Mega', '').strip()
        return f"Mega {base_name}"
    return name

def extract_deck_archetype(decklist_url: str) -> str:
    """Extract deck archetype from decklist page by analyzing the actual card list."""
    page_html = fetch_page(decklist_url)
    if not page_html:
        return "Unknown"
    
    # Strategy: Extract Pokemon cards from the decklist
    # Pattern to match decklist-card divs with card names
    card_pattern = r'<div[^>]*class="decklist-card"[^>]*>.*?<span class="card-name">([^<]+)</span>'
    card_matches = re.findall(card_pattern, page_html, re.IGNORECASE | re.DOTALL)
    
    if not card_matches:
        return "Unknown"
    
    # List of set codes to filter out
    set_codes = ['ASC', 'MEG', 'TWM', 'PAR', 'OBF', 'PAL', 'TEF', 'SFA', 'SCR', 'PFL', 
                 'SVI', 'SWS', 'MEW', 'CRE', 'EVS', 'BST', 'VIV', 'DAA', 'RCL']
    
    # Process card names
    pokemon_names = []
    seen = set()
    
    for name in card_matches:
        # Clean up the name
        name = html.unescape(name).strip()
        name = name.replace(''', "'").replace('`', "'").replace('´', "'").replace(''', "'")
        name_lower = name.lower()
        
        # Skip if already seen
        if name_lower in seen:
            continue
        
        # Filter out:
        # - Set codes
        # - Energy cards
        # - Trainer cards (common keywords)
        # - Very short names
        is_set_code = name.upper() in set_codes
        is_energy = 'energy' in name_lower
        is_trainer = any(keyword in name_lower for keyword in [
            'ball', 'supporter', 'item', 'stadium', 'order', 'nest', 'rod', 
            'candy', 'professor', 'research', 'boss', 'switch', 'catcher',
            'retrieval', 'potion', 'band', 'tool', 'cart', 'garde', 'box'
        ])
        
        if is_set_code or is_energy or is_trainer or len(name) <= 3:
            continue
        
        # Add to Pokemon list
        seen.add(name_lower)
        pokemon_names.append(name)
        
        # Stop after finding 3 Pokemon (enough for archetype)
        if len(pokemon_names) >= 3:
            break
    
    # Return archetype
    if len(pokemon_names) >= 2:
        return ' '.join(pokemon_names[:2])
    elif pokemon_names:
        return pokemon_names[0]
    
    return "Unknown"

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

# Old is_trainer_or_energy() function removed - now using card_type_lookup.py
# which provides 100% accurate card type detection based on Alle Karten.txt

def extract_cards_from_decklist(decklist_url: str) -> List[Dict]:
    """Extract card data from a decklist page."""
    html_content = fetch_page(decklist_url)
    if not html_content:
        return []
    
    cards = []
    seen_cards = set()
    cards_to_lookup = []  # Track Pokemon cards needing lookup
    
    # Pattern to match decklist-card divs with data-set and data-number attributes (can be empty)
    card_pattern = r'<div[^>]*class="decklist-card"[^>]*data-set="([A-Z0-9]*)"[^>]*data-number="(\d*)"[^>]*>.*?<span class="card-count">(\d+)</span>\s*<span class="card-name">([^<]+)</span>'
    
    matches = re.findall(card_pattern, html_content, re.IGNORECASE | re.DOTALL)
    
    for match in matches:
        try:
            set_code = match[0].upper() if match[0] else ""
            card_number = match[1] if match[1] else ""
            count = int(match[2])
            name = match[3].strip()
            
            # Decode HTML entities (e.g., &#039; -> ')
            name = html.unescape(name)
            
            # Normalize different apostrophe characters to standard ASCII apostrophe
            name = name.replace(''', "'").replace('`', "'").replace('´', "'").replace(''', "'").replace('ʼ', "'")
            
            # IMPORTANT: Validate card name against database before processing
            # This filters out tournament titles like "CUT WILL GET COAL", "January 2025", etc.
            if not is_valid_card_jp(name):
                # Not a valid card - likely tournament title or metadata
                continue
            
            # Determine if card is Trainer or Energy using improved function
            is_trainer_energy = is_trainer_or_energy_jp(name)
            
            # IMPORTANT: Check trainer/energy FIRST before looking at set/number
            if is_trainer_energy:
                # Trainer/Energy: NO set code or number needed
                full_name = name
                card_key = name.lower()
                needs_lookup = False
            else:
                # Pokémon: ALWAYS requires set/number
                if not set_code or not card_number:
                    # Mark for lookup
                    cards_to_lookup.append(len(cards))
                    full_name = name
                    card_key = name.lower()
                    needs_lookup = True
                else:
                    # Fix PR-SV to SVP mapping
                    if set_code == 'PR-SV':
                        set_code = 'SVP'
                    full_name = f"{name} {set_code} {card_number}"
                    card_key = f"{name}|{set_code}|{card_number}".lower()
                    needs_lookup = False
            
            if card_key not in seen_cards and name:
                seen_cards.add(card_key)
                cards.append({
                    'count': count,
                    'full_name': full_name,
                    'needs_lookup': needs_lookup
                })
        except (ValueError, IndexError):
            continue
    
    # Lookup missing card info for Pokemon cards  
    if cards_to_lookup:
        print(f"    Looking up {len(cards_to_lookup)} Pokemon cards with missing set/number info...")
        successful_lookups = 0
        failed_lookups = 0
        
        for idx in cards_to_lookup:
            if idx >= len(cards):
                print(f"      WARNING: Invalid index {idx}, skipping")
                continue
                
            card = cards[idx]
            base_name = card['full_name']
            
            # SAFETY CHECK: Double-check this is not a Trainer/Energy
            if is_trainer_or_energy_jp(base_name):
                print(f"      SKIPPING (detected as Trainer/Energy): {base_name}")
                card['needs_lookup'] = False
                continue
            
            print(f"      Looking up: {base_name}...", end=' ')
            info = lookup_card_info(base_name)
            if info:
                # Fix PR-SV to SVP mapping
                set_code = info['set_code']
                if set_code == 'PR-SV':
                    set_code = 'SVP'
                card['full_name'] = f"{base_name} {set_code} {info['card_number']}"
                card['needs_lookup'] = False
                successful_lookups += 1
                print(f"✓ {card['full_name']}")
            else:
                # KEEP the card even if lookup fails - don't remove Pokemon cards!
                card['needs_lookup'] = False
                failed_lookups += 1
                print(f"✗ NOT FOUND - keeping card anyway: {base_name}")
            time.sleep(0.3)  # Rate limiting
        
        print(f"    Lookup summary: {successful_lookups} found, {failed_lookups} kept without set/number")
    
    return cards

def save_csv_files(all_data: List[Dict], output_file: str):
    """Save scraped data to CSV files."""
    app_path = get_app_path()
    
    # Overview file
    overview_file = os.path.join(app_path, output_file.replace('.csv', '_overview.csv'))
    overview_rows = []
    
    for league in all_data:
        for decklist in league.get('decklists', []):
            overview_rows.append({
                'league_id': league['id'],
                'league_name': league['name'],
                'league_date': league.get('date', ''),
                'format': 'City League (JP)',
                'rank': decklist.get('rank', 0),
                'archetype': decklist.get('archetype', 'Unknown'),
                'decklist_url': decklist.get('url', ''),
                'total_cards': decklist.get('total_cards', 0),
                'status': decklist.get('status', '')
            })
    
    with open(overview_file, 'w', newline='', encoding='utf-8-sig') as f:
        fieldnames = ['league_id', 'league_name', 'league_date', 'format',
                     'rank', 'archetype', 'decklist_url', 'total_cards', 'status']
        writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=';')
        writer.writeheader()
        writer.writerows(overview_rows)
    
    # Cards file
    cards_file = os.path.join(app_path, output_file.replace('.csv', '_cards.csv'))
    card_rows = []
    
    for league in all_data:
        for decklist in league.get('decklists', []):
            for card in decklist.get('cards', []):
                card_rows.append({
                    'league_id': league['id'],
                    'league_name': league['name'],
                    'format': 'City League (JP)',
                    'rank': decklist.get('rank', 0),
                    'archetype': decklist.get('archetype', 'Unknown'),
                    'card_count': card.get('count', 0),
                    'full_card_name': card.get('full_name', '')
                })
    
    # Always create the cards file, even if empty - with retry on permission error
    cards_file_base = os.path.join(app_path, output_file.replace('.csv', '_cards.csv'))
    cards_file = cards_file_base
    
    max_attempts = 3
    for attempt in range(max_attempts):
        try:
            with open(cards_file, 'w', newline='', encoding='utf-8-sig') as f:
                fieldnames = ['league_id', 'league_name', 'format', 'rank', 'archetype', 'card_count', 'full_card_name']
                writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=';')
                writer.writeheader()
                if card_rows:
                    writer.writerows(card_rows)
                else:
                    print(f"  WARNING: No cards were extracted - cards file will be empty")
            break  # Success
        except PermissionError:
            if attempt < max_attempts - 1:
                from datetime import datetime
                timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
                cards_file = cards_file_base.replace('.csv', f'_{timestamp}.csv')
                print(f"  File locked, trying: {os.path.basename(cards_file)}")
            else:
                print(f"  ERROR: Could not save cards file - please close it in Excel and try again")
                raise
    
    return overview_file, cards_file

def save_deck_statistics(all_data: List[Dict], output_file: str):
    """Calculate and save deck archetype statistics."""
    app_path = get_app_path()
    stats_file = os.path.join(app_path, output_file.replace('.csv', '_deck_stats.csv'))
    
    # Collect all deck data
    deck_data = {}  # {archetype: {'count': int, 'placements': [int, ...], 'tournaments': [str, ...]}}
    
    for league in all_data:
        league_name = league.get('name', 'Unknown')
        league_id = league.get('id', 'Unknown')
        
        for decklist in league.get('decklists', []):
            archetype = decklist.get('archetype', 'Unknown')
            rank = decklist.get('rank', 0)
            
            if archetype not in deck_data:
                deck_data[archetype] = {
                    'count': 0,
                    'placements': [],
                    'tournaments': []
                }
            
            deck_data[archetype]['count'] += 1
            deck_data[archetype]['placements'].append(rank)
            deck_data[archetype]['tournaments'].append(f"{league_name} (ID: {league_id})")
    
    # Calculate statistics
    stats_rows = []
    for archetype, data in deck_data.items():
        avg_placement = sum(data['placements']) / len(data['placements']) if data['placements'] else 0
        best_placement = min(data['placements']) if data['placements'] else 0
        worst_placement = max(data['placements']) if data['placements'] else 0
        
        stats_rows.append({
            'archetype': archetype,
            'total_appearances': data['count'],
            'average_placement': round(avg_placement, 2),
            'best_placement': best_placement,
            'worst_placement': worst_placement,
            'tournaments': '; '.join(set(data['tournaments']))  # Unique tournament names
        })
    
    # Sort by total appearances (most common first)
    stats_rows.sort(key=lambda x: x['total_appearances'], reverse=True)
    
    # Save to CSV
    with open(stats_file, 'w', newline='', encoding='utf-8-sig') as f:
        fieldnames = ['archetype', 'total_appearances', 'average_placement', 'best_placement', 'worst_placement', 'tournaments']
        writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=';')
        writer.writeheader()
        writer.writerows(stats_rows)
    
    print(f"Deck statistics saved to: {stats_file}")
    print(f"\nTop 10 Most Common Decks:")
    print("-" * 70)
    for i, row in enumerate(stats_rows[:10], 1):
        print(f"{i}. {row['archetype']}: {row['total_appearances']} appearances, avg placement: {row['average_placement']}")
    
    return stats_file

def main():
    # Load settings
    settings = load_settings()
    
    # Parse dates
    try:
        start_date = parse_date(settings['start_date'])
        end_date = parse_date(settings['end_date'])
    except ValueError:
        print("Error: Invalid date format in settings. Use DD.MM.YYYY format.")
        return
    
    max_decklists = settings['max_decklists_per_league']
    delay = settings['delay_between_requests']
    output_file = settings['output_file']
    
    base_url = "https://limitlesstcg.com/tournaments/jp"
    all_data = []
    
    print("Starting Limitless TCG City League Scraper...")
    print(f"Date Range: {settings['start_date']} - {settings['end_date']}")
    print(f"Max decklists per league: {max_decklists} (0 or -1 = ALL)")
    print("=" * 50)
    
    # Get city league links in date range
    leagues = get_city_league_links(base_url, start_date, end_date)
    if not leagues:
        print("No city leagues found in the specified date range.")
        return
    
    for i, league in enumerate(leagues, 1):
        print(f"\nProcessing city league {i}/{len(leagues)}")
        print("-" * 30)
        
        # Get league info
        print(f"Fetching league info: {league['url']}")
        info = get_league_info(league['url'])
        league['name'] = info['name']
        league['date'] = league.get('date_str', info.get('date', ''))
        
        print(f"League: {league['name']} ({league['date']})")
        
        # Get decklist links
        decklist_links = get_decklist_links(league['url'], max_decklists)
        print(f"Found {len(decklist_links)} decklists")
        
        league['decklists'] = []
        
        for j, decklist in enumerate(decklist_links, 1):
            print(f"  Decklist {j}/{len(decklist_links)} (Rank {decklist['rank']})")
            
            # Use pre-extracted archetype from tournament overview page
            archetype = decklist.get('archetype', 'Unknown')
            print(f"    Archetype: {archetype}")
            
            cards = extract_cards_from_decklist(decklist['url'])
            
            decklist['cards'] = cards
            decklist['total_cards'] = len(cards)
            decklist['status'] = 'success' if cards else 'no cards found'
            decklist['archetype'] = archetype
            
            league['decklists'].append(decklist)
            
            if delay > 0:
                time.sleep(delay)
        
        all_data.append(league)
        
        if delay > 0 and i < len(leagues):
            time.sleep(delay)
    
    # Save to CSV
    if all_data:
        overview_file, cards_file = save_csv_files(all_data, output_file)
        deck_stats_file = save_deck_statistics(all_data, output_file)
        
        print(f"\n" + "=" * 50)
        print(f"Scraping completed!")
        print(f"Overview data saved to: {overview_file}")
        print(f"Detailed card data saved to: {cards_file}")
        print(f"Deck statistics saved to: {deck_stats_file}")
        
        total_decklists = sum(len(l.get('decklists', [])) for l in all_data)
        total_cards = sum(
            d.get('total_cards', 0) 
            for l in all_data 
            for d in l.get('decklists', [])
        )
        print(f"City leagues processed: {len(all_data)}")
        print(f"Decklists processed: {total_decklists}")
        print(f"Total cards extracted: {total_cards}")
    else:
        print("No data collected.")

    # Post-run check: scan cards CSV for Trainer/Energy entries that still include set code/number
    try:
        check_file = os.path.join(get_app_path(), 'trainer_check.txt')
        problematic = []
        cleaned_rows = []
        # pattern matches trailing ' SETCODE NUMBER' at end of card name
        trailing_set_pattern = re.compile(r"\s([A-Z0-9]{2,})\s(\d+)$")

        # Local heuristics for Trainer/Energy detection (independent of CARD_TYPE_MAP)
        trainer_keywords = set([
            'supporter', 'item', 'stadium', 'tool', 'ace spec', 'poké', 'pokeball', 'ball', 'nest ball',
            'ultra ball', 'great ball', 'quick ball', 'switch', 'energy switch', 'trainer', 'professor',
            'judge', 'compressor', 'muscle band', 'choice band', 'float stone',
            # Expanded list from user feedback
            'flute', 'drum', 'blowtorch', 'blender', 'teaser', 'hammer', 'laser', 'generator',
            'recycler', 'retrieval', 'trumpet', 'trimmer', 'aroma', 'defender', 'memo', 'signal',
            'blower', 'headset', 'backpack', 'mask', 'pad', 'basket', 'vital', 'potion',
            'power pro', 'catcher', 'reboot', 'ticket', 'repel', 'stick', 'ash', 'cyclone',
            'box', 'doll', 'timepiece', 'radar', 'orb', 'tracker', 'stamp', 'patch',
            'academy', 'area zero', 'cage', 'court', 'calamitous', 'community', 'cycling',
            'forest', 'lab', 'grand tree', 'gravity', 'levincia', 'mesagoza', 'moonlit',
            'mystery', 'neutralization', 'castle', 'perilous', 'league headquarters', 'postwick',
            'studio', 'ruins', 'spikemuth', 'surfing', 'factory',
            'acerola', 'atticus', 'bianca', 'bill', 'billy', 'brassius', 'briar', 'brock',
            'cheren', 'ciphermaniac', 'clavell', 'clemont', 'colress', 'cook', 'crispin',
            'cyrano', 'daisy', 'dawn', 'drayton', 'emcee', 'eri', 'erika', 'ethan',
            'explorer', 'fennel', 'firebreather', 'friends', 'geeta', 'giacomo', 'giovanni',
            'grimsley', 'harlequin', 'hassel', 'iris', 'jacq', 'kieran', 'kofu', 'lana',
            'larry', 'lisia', 'surge', 'mela', 'miriam', 'morty', 'nemona', 'penny',
            'perrin', 'center lady', 'raifort', 'rika', 'roark', 'ruffian', 'ryme',
            'saguaro', 'salvatore', 'surfer', 'team rocket', 'team star', 'wally',
            'xerosic', 'youngster', 'carmine', 'tulip',
            'amulet', 'mochi', 'bangle', 'gain', 'weight', 'vest', 'bomb', 'exp. share',
            'gemstone', 'fan', 'baton', 'cape', 'leftovers', 'berry', 'goggles', 'helmet',
            'chestplate', 'crystal', 'brace', 'punch'
        ])
        energy_indicators = [' energy', 'énergie', 'energia', 'エネルギー', 'basic ', 'special ', 'darkness ', 'fire ', 'water ', 'grass ', 'electric ', 'psychic ', 'fighting ', 'metal ', 'dragon ', 'fairy ', 'colorless ']

        if os.path.exists(cards_file):
            with open(cards_file, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    full = row.get('full_card_name', '').strip()
                    if not full:
                        cleaned_rows.append(row)
                        continue

                    m = trailing_set_pattern.search(full)
                    if not m:
                        cleaned_rows.append(row)
                        continue

                    # extract base name (without set code and number)
                    base_name = full[:m.start()].strip()
                    lowered = base_name.lower()

                    # Heuristic detection
                    is_energy = any(lowered.startswith(s) for s in [s.lower() for s in energy_indicators]) or lowered.endswith(' energy') or ' energy' in lowered
                    is_trainer = any(k in lowered for k in trainer_keywords) or lowered in trainer_keywords

                    if is_trainer or is_energy:
                        problematic.append(full)
                        # replace full_card_name with stripped base name
                        new_row = dict(row)
                        new_row['full_card_name'] = base_name
                        cleaned_rows.append(new_row)
                    else:
                        cleaned_rows.append(row)

        # Write check file
        with open(check_file, 'w', encoding='utf-8') as out:
            if problematic:
                out.write('Found trainer/energy rows that still contain set code/number:\n')
                for p in problematic:
                    out.write(p + '\n')
                out.write('\nApplied automatic cleaning to those rows in the cards CSV.\n')

                # Rewrite the cards CSV with cleaned rows
                try:
                    with open(cards_file, 'w', newline='', encoding='utf-8-sig') as f:
                        fieldnames = ['league_id', 'league_name', 'rank', 'card_count', 'full_card_name']
                        writer = csv.DictWriter(f, fieldnames=fieldnames)
                        writer.writeheader()
                        for r in cleaned_rows:
                            writer.writerow({k: r.get(k, '') for k in fieldnames})
                except Exception as e:
                    out.write(f'Error rewriting cards CSV: {e}\n')
            else:
                out.write('No trainer/energy rows with trailing set code/number found.\n')
    except Exception:
        pass

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
