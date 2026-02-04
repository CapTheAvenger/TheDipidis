#!/usr/bin/env python3
"""
Limitless TCG Deck Scraper - FIXED VERSION
Scrapes deck data from play.limitlesstcg.com/decks
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
from html.parser import HTMLParser
from typing import List, Dict, Optional

# Import the reliable card type lookup module
from card_type_lookup import get_card_type, is_trainer_or_energy, is_valid_card

# Default settings
DEFAULT_SETTINGS = {
    "max_decks": 20,
    "max_lists_per_deck": 5,
    "delay_between_lists": 1.5,
    "delay_between_decks": 3,
    "output_file": "limitless_deck_data.csv",
    "format_filter": ""  # e.g., "SVI-PFL" for Scarlet & Violet - Phantasmal Flames, "" for all formats
}

def get_app_path() -> str:
    """Get the directory where the executable/script is located."""
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    else:
        return os.path.dirname(os.path.abspath(__file__))

def load_settings() -> Dict:
    """Load settings from limitless_settings.json, or create it with defaults if it doesn't exist."""
    app_path = get_app_path()
    settings_path = os.path.join(app_path, 'limitless_settings.json')
    
    # If running from dist folder, also check parent folder
    if not os.path.exists(settings_path) and os.path.basename(app_path) == 'dist':
        parent_path = os.path.dirname(app_path)
        parent_settings_path = os.path.join(parent_path, 'limitless_settings.json')
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
                for key, value in DEFAULT_SETTINGS.items():
                    if key not in settings:
                        settings[key] = value
                return settings
        except (json.JSONDecodeError, IOError) as e:
            print(f"Error loading limitless_settings.json: {e}")
            print("Using default settings.")
            return DEFAULT_SETTINGS.copy()
    else:
        print(f"Settings file not found. Creating new file with defaults.")
        with open(settings_path, 'w', encoding='utf-8') as f:
            json.dump(DEFAULT_SETTINGS, f, indent=4)
        print(f"Created default limitless_settings.json at {settings_path}")
        return DEFAULT_SETTINGS.copy()

class DeckPageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.deck_links = []
        
    def handle_starttag(self, tag, attrs):
        if tag == 'a':
            attrs_dict = dict(attrs)
            if 'href' in attrs_dict:
                href = attrs_dict['href']
                if '/deck/' in href or 'deck' in href.lower():
                    if href.startswith('/'):
                        href = 'https://play.limitlesstcg.com' + href
                    self.deck_links.append(href)

class TournamentResultsParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.list_links = []
        
    def handle_starttag(self, tag, attrs):
        if tag == 'a':
            attrs_dict = dict(attrs)
            if 'href' in attrs_dict:
                href = attrs_dict['href']
                if '/list/' in href or '/decklist' in href or 'list' in href.lower():
                    if href.startswith('/'):
                        href = 'https://play.limitlesstcg.com' + href
                    self.list_links.append(href)

def fetch_page(url: str) -> str:
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

def get_format_code(format_name: str) -> str:
    """Convert format name to short code (e.g., 'Scarlet & Violet - Phantasmal Flames' -> 'SVI-PFL')."""
    format_mapping = {
        # Scarlet & Violet formats
        'Scarlet & Violet - Phantasmal Flames': 'SVI-PFL',
        'Scarlet & Violet - Stellar Crown': 'SVI-SCR',
        'Scarlet & Violet - Shrouded Fable': 'SVI-SFA',
        'Scarlet & Violet - Twilight Masquerade': 'SVI-TWM',
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
        'Sword & Shield - Battle Styles': 'SWS-BST',
        'Sword & Shield - Shining Fates': 'SWS-SHF',
        'Sword & Shield - Vivid Voltage': 'SWS-VIV',
        'Sword & Shield - Champion\'s Path': 'SWS-CPA',
        'Sword & Shield - Darkness Ablaze': 'SWS-DAA',
        'Sword & Shield - Rebel Clash': 'SWS-RCL',
        'Sword & Shield': 'SWS',
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

def get_deck_links(main_page_url: str) -> List[str]:
    print(f"Fetching main deck page from URL: {main_page_url}")
    page_html = fetch_page(main_page_url)
    if not page_html:
        return []
    
    # Try to extract deck links from the table in order
    # The table has rows with rank numbers and deck links
    # Pattern: <tr>...<td>1</td>...<a href="/decks/dragapult-dusknoir">...
    
    deck_links = []
    
    # Look for table rows with rank number and deck link
    # Match: rank number followed by deck link in same row
    table_rows = re.findall(r'<tr[^>]*>.*?</tr>', page_html, re.DOTALL | re.IGNORECASE)
    
    for row in table_rows:
        # Check if row contains a rank number (starts with digit at beginning of cell)
        rank_match = re.search(r'<td[^>]*>\s*(\d+)\s*</td>', row)
        if rank_match:
            # Extract deck link from this row
            link_match = re.search(r'href=["\']([^"\']*decks/[^"\'?#]+)["\']', row)
            if link_match:
                link = link_match.group(1)
                if link.startswith('/'):
                    link = 'https://play.limitlesstcg.com' + link
                
                # Only add valid deck links (not the main /decks page)
                if (link not in deck_links and 
                    '/decks/' in link and 
                    link != 'https://play.limitlesstcg.com/decks' and
                    '/matchups' not in link):
                    deck_links.append(link)
    
    # If no table rows found (fallback to old method)
    if not deck_links:
        patterns = [
            r'href=["\']([^"\']*decks/[^"\'?]+)[^"\']*["\']',
            r'href=["\']([^"\']*deck/[^"\']*)["\']'
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, page_html, re.IGNORECASE)
            for match in matches:
                link = match
                if link.startswith('/'):
                    link = 'https://play.limitlesstcg.com' + link
                
                if ('limitlesstcg.com' in link and 
                    '/decks/' in link and 
                    link != 'https://play.limitlesstcg.com/decks' and
                    '/matchups' not in link and
                    link not in deck_links):
                    deck_links.append(link)
    
    print(f"Found deck links: {deck_links[:10]}")
    print(f"Found {len(deck_links)} deck links")
    return deck_links

def get_deck_info(deck_url: str, use_format: str = '') -> Dict:
    print(f"Fetching deck info from: {deck_url}")
    page_html = fetch_page(deck_url)
    if not page_html:
        return {'deck_name': 'Unknown Deck', 'format': use_format if use_format else ''}
    
    deck_info = {'deck_name': 'Unknown Deck', 'format': use_format if use_format else ''}
    
    deck_name_pattern = r'<div[^>]*class="[^"]*name[^"]*"[^>]*>([^<]+)</div>'
    deck_name_match = re.search(deck_name_pattern, page_html, re.IGNORECASE)
    if deck_name_match:
        dn = deck_name_match.group(1).strip()
        dn = html.unescape(dn)
        dn = fix_utf8(dn)
        for ch in ["\u2019", "\u2018", "`", "´", "ʼ", "'", "ʹ"]:
            dn = dn.replace(ch, "")
        dn = re.sub(r"\s+", " ", dn).strip()
        deck_info['deck_name'] = dn
    
    # Extract format from deck overview page only if not already set
    if not use_format:
        format_patterns = [
            r'<[^>]*class="[^"]*format[^"]*"[^>]*>([^<]+)</[^>]*>',
            r'Format[:\s]*([A-Z][\w&\s-]+?)(?=\s*<|\s*\n|$)',
            r'<[^>]*badge[^>]*>([^<]*(?:Scarlet & Violet|Sword & Shield|Sun & Moon|SVI-|SWS-|SM-)[^<]*)</[^>]*>',
            r'([A-Z][\w&\s-]*(?:Scarlet & Violet|Sword & Shield|Sun & Moon)[\w&\s-]*?)(?=\s*•|\s*<)',
        ]
        
        for pattern in format_patterns:
            format_match = re.search(pattern, page_html, re.IGNORECASE)
            if format_match:
                format_name = format_match.group(1).strip()
                full_format = get_format_code(format_name)
                # Extract only the set code (e.g., "PFL" from "SVI-PFL Standard 2025")
                # Split by space and take the first part, then take only after the dash
                format_parts = full_format.split()
                if format_parts:
                    # If format is like "SVI-PFL", take only "PFL" part
                    if '-' in format_parts[0]:
                        deck_info['format'] = format_parts[0].split('-')[-1]
                    else:
                        deck_info['format'] = format_parts[0]
                else:
                    deck_info['format'] = full_format
                break
    
    if deck_info['deck_name'] == 'Unknown Deck':
        alt_patterns = [
            r'<h1[^>]*>([^<]+)</h1>',
            r'<title[^>]*>([^<]+)</title>'
        ]
        for pattern in alt_patterns:
            match = re.search(pattern, page_html, re.IGNORECASE)
            if match:
                deck_info['deck_name'] = match.group(1).strip()
                break

    if deck_info.get('deck_name') and deck_info['deck_name'] != 'Unknown Deck':
        dn = html.unescape(deck_info['deck_name'])
        dn = fix_utf8(dn)
        for ch in ["\u2019", "\u2018", "`", "´", "ʼ", "'", "ʹ"]:
            dn = dn.replace(ch, "")
        dn = re.sub(r"\s+", " ", dn).strip()
        deck_info['deck_name'] = dn
    
    return deck_info

def fix_utf8(text: str) -> str:
    """
    Fix UTF-8 mojibake conservatively.

    Strategy:
    - Only attempt latin-1 -> utf-8 re-decode when there's a strong
      indication of mojibake: adjacent high-byte chars that commonly
      appear when UTF-8 bytes are mis-decoded (e.g. 'Ã©').
    - Apply iteratively up to a few times until no further change.
    """
    max_passes = 3
    passes = 0

    def looks_like_mojibake(s: str) -> bool:
        # Detect patterns like U+00C3 followed by U+0080..U+00BF (common)
        # and sequences such as 'Ã©' (U+00C3 U+00A9).
        if re.search(r'[\u00C0-\u00C3][\u0080-\u00BF]', s):
            return True
        # Also catch repeated mixtures of high-bit bytes (two or more in a row)
        consec_high = 0
        for ch in s:
            if ord(ch) >= 0x80:
                consec_high += 1
                if consec_high >= 2:
                    return True
            else:
                consec_high = 0
        return False

    result = text
    while passes < max_passes and looks_like_mojibake(result):
        passes += 1
        try:
            attempted = result.encode('latin-1', errors='strict').decode('utf-8', errors='strict')
        except Exception:
            # conservative fallback: stop if strict conversion fails
            break
        if attempted == result:
            break
        result = attempted

    return result

def get_list_links(deck_url: str, filter_params: str = '') -> List[str]:
    # Add filter parameters to deck URL if provided
    full_url = deck_url
    if filter_params:
        separator = '&' if '?' in deck_url else '?'
        full_url = f"{deck_url}{separator}{filter_params}"
    
    print(f"Fetching list links from: {full_url}")
    page_html = fetch_page(full_url)
    if not page_html:
        return []
    
    parser = TournamentResultsParser()
    try:
        parser.feed(page_html)
        list_links = parser.list_links
    except Exception as e:
        print(f"Parser error: {e}")
        list_links = []
    
    if not list_links:
        matches = re.findall(r'href=["\']([^"\']*list[^"\']*)["\']', page_html, re.IGNORECASE)
        for match in matches:
            if match.startswith('/'):
                match = 'https://play.limitlesstcg.com' + match
            if 'limitlesstcg.com' in match:
                list_links.append(match)
    
    seen = set()
    unique_links = []
    for link in list_links:
        if link not in seen:
            seen.add(link)
            unique_links.append(link)
    
    return unique_links

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
                set_code = matches[0][0].upper()
                # Fix Limitless set code mapping
                if set_code == 'PR-SV':
                    set_code = 'SVP'
                result = {
                    'set_code': set_code,
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
                set_code = matches2[0][0].upper()
                # Fix Limitless set code mapping
                if set_code == 'PR-SV':
                    set_code = 'SVP'
                result = {
                    'set_code': set_code,
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
                    set_code = data_match.group(1).upper()
                    # Fix Limitless set code mapping
                    if set_code == 'PR-SV':
                        set_code = 'SVP'
                    result = {
                        'set_code': set_code,
                        'card_number': data_match.group(2)
                    }
                    _card_lookup_cache[card_name] = result
                    return result
                
                # Try to find set span
                set_match = re.search(r'<span[^>]*class="[^"]*set[^"]*"[^>]*>\s*([A-Z0-9]+)\s+(\d+)\s*</span>', search_section)
                if set_match:
                    set_code = set_match.group(1).upper()
                    # Fix Limitless set code mapping
                    if set_code == 'PR-SV':
                        set_code = 'SVP'
                    result = {
                        'set_code': set_code,
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
                        set_code = pattern1_matches[0][0].upper()
                        # Fix Limitless set code mapping
                        if set_code == 'PR-SV':
                            set_code = 'SVP'
                        result = {
                            'set_code': set_code,
                            'card_number': pattern1_matches[0][1]
                        }
                        _card_lookup_cache[card_name] = result
                        return result
                    
                    pattern2_matches = pattern2.findall(html_broad)
                    if pattern2_matches:
                        set_code = pattern2_matches[0][0].upper()
                        # Fix Limitless set code mapping
                        if set_code == 'PR-SV':
                            set_code = 'SVP'
                        result = {
                            'set_code': set_code,
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

def extract_deck_data_from_html(html_content: str) -> Dict:
    # Pre-fix known mojibake patterns in HTML
    html_content = html_content.replace('PokÃ©gear', 'Pokégear')
    html_content = html_content.replace('PokÃ‰gear', 'Pokégear')
    
    deck_data = {
        'tournament': '',
        'format': '',
        'cards': []
    }
    
    tournament_match = re.search(r'Tournament[:\s]*([^<\n]+)', html_content, re.IGNORECASE)
    if tournament_match:
        deck_data['tournament'] = tournament_match.group(1).strip()
    
    # Try to extract format (e.g., "Scarlet & Violet - Phantasmal Flames")
    # Pattern 1: Look for "Format:" label
    format_match = re.search(r'Format[:\s]*([A-Z][\w&\s-]+?)(?=\s*<|\s*\n|$)', html_content, re.IGNORECASE)
    if format_match:
        format_name = format_match.group(1).strip()
        deck_data['format'] = get_format_code(format_name)
    else:
        # Pattern 2: Look for format in common HTML structures (badges, labels, etc.)
        alt_patterns = [
            r'<[^>]*class="[^"]*format[^"]*"[^>]*>([^<]+)</[^>]*>',
            r'<[^>]*badge[^>]*>([^<]*(?:Scarlet & Violet|Sword & Shield|Sun & Moon|SVI-|SWS-|SM-)[^<]*)</[^>]*>',
            r'([A-Z][\w&\s-]*(?:Scarlet & Violet|Sword & Shield|Sun & Moon)[\w&\s-]*?)(?=\s*•|\s*<|\s*\n)',
        ]
        for pattern in alt_patterns:
            alt_match = re.search(pattern, html_content, re.IGNORECASE)
            if alt_match:
                format_name = alt_match.group(1).strip()
                deck_data['format'] = get_format_code(format_name)
                break
    
    all_cards = []
    seen_names = set()
    cards_to_lookup = []  # Track Pokemon cards needing lookup
    
    exclude_patterns = [
        'notification', 'mb-', 'class=', 'href=', 'style=', 
        'div>', 'span>', 'button', 'click', 'toggle', 'menu',
        'login', 'signup', 'subscribe', 'cookie', 'privacy',
        'tournament', 'limitless', 'cash', 'prize', 'codes'
    ]
    
    # Single regex pattern
    pattern = r'(\d+)\s+([A-Za-z][^<\n]*?)(?=\s*\n|\s*<|$)'
    matches = re.findall(pattern, html_content, re.IGNORECASE | re.MULTILINE)
    
    for match in matches:
        try:
            count = int(match[0])
            name = match[1].strip()
            
            name = html.unescape(name)
            name = fix_utf8(name)
            
            # Normalize apostrophes within the name (U+2019, etc. → U+0027)
            for ch in ["\u2019", "\u2018", "`", "´", "ʼ", "ʹ"]:
                name = name.replace(ch, "'")
            
            # Remove trailing apostrophe (artifact from HTML)
            name = name.rstrip("'")

            name = name.replace('·', '').strip()
            name = re.sub(r'\s+', ' ', name)
            
            # Fix Pokégear mojibake - try multiple byte-level approaches
            try:
                # Handle the specific triple-encoded mojibake pattern
                name_bytes = name.encode('utf-8')
                # Pattern: Ã (C3 83) followed by © or other mojibake
                if b'\xc3\x83' in name_bytes:
                    # Decode and re-encode to fix
                    name = name_bytes.decode('utf-8', errors='replace')
                    # Manual fix for Pokégear
                    if 'gear' in name.lower():
                        name = re.sub(r'Pok[^g]*gear', 'Pokégear', name, flags=re.IGNORECASE)
            except:
                pass
            
            name_lower = name.lower()
            if any(excl in name_lower for excl in exclude_patterns):
                continue
            
            if '<' in name or '>' in name or '"' in name or '=' in name:
                continue
            
            if '(' in name or ')' in name:
                continue
            
            if not (name and len(name) > 2 and count > 0 and count <= 60):
                continue
            
            # CRITICAL FIX: Remove set/number BEFORE checking card type
            # because card_type_lookup needs the clean card name
            has_set_code = bool(re.search(r'[A-Z]{2,4}\s+\d+$', name))
            
            # Fix PR-SV to SVP mapping BEFORE further processing
            if ' PR-SV ' in name:
                name = name.replace(' PR-SV ', ' SVP ')
                
            clean_name = re.sub(r'\s+[A-Z]{2,4}\s+\d+$', '', name) if has_set_code else name
            
            # VALIDATE: Check if this is actually a card in the database
            # This prevents tournament titles from being parsed as cards
            if not is_valid_card(clean_name):
                # Not a valid card - likely tournament title or noise
                continue
            
            card_type = get_card_type(clean_name)
            
            # Format card name based on type
            # get_card_type() returns "Pokemon", "Trainer", or "Energy" (with capital letters)
            if card_type in ["Trainer", "Energy"]:
                # Trainer/Energy: ALWAYS use clean name without set/number
                formatted_name = clean_name
                needs_lookup = False
            else:
                # Pokemon: keep original name with set/number if present, otherwise mark for lookup
                formatted_name = name
                needs_lookup = not has_set_code
            
            # Deduplicate
            formatted_lower = re.sub(r'\s+', ' ', formatted_name.lower().strip())
            if formatted_lower not in seen_names:
                seen_names.add(formatted_lower)
                card_index = len(all_cards)
                all_cards.append({
                    'count': count,
                    'name': formatted_name,
                    'needs_lookup': needs_lookup
                })
                
                # Add to lookup list ONLY if it's a Pokemon without set code
                if card_type == "Pokemon" and not has_set_code:
                    cards_to_lookup.append(card_index)
        except (ValueError, IndexError):
            continue
    
    # Lookup missing card info for Pokemon cards
    if cards_to_lookup:
        print(f"  Looking up {len(cards_to_lookup)} Pokemon cards with missing set/number info...")
        successful_lookups = 0
        failed_lookups = 0
        
        for idx in cards_to_lookup:
            if idx >= len(all_cards):
                print(f"    WARNING: Invalid index {idx}, skipping")
                continue
                
            card = all_cards[idx]
            
            # SAFETY CHECK: Double-check this is not a Trainer/Energy
            card_type_check = get_card_type(card['name'])
            if card_type_check in ["Trainer", "Energy"]:
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
                card['name'] = f"{card['name']} {set_code} {info['card_number']}"
                card['needs_lookup'] = False
                successful_lookups += 1
                print(f"✓ {card['name']}")
            else:
                # KEEP the card even if lookup fails - don't remove Pokemon cards!
                card['needs_lookup'] = False
                failed_lookups += 1
                print(f"✗ NOT FOUND - keeping card anyway: {card['name']}")
            time.sleep(0.3)  # Rate limiting
        
        print(f"  Lookup summary: {successful_lookups} found, {failed_lookups} kept without set/number")
    
    deck_data['cards'] = all_cards
    return deck_data

def extract_deck_data(list_url: str) -> Dict:
    print(f"Extracting data from: {list_url}")
    page_html = fetch_page(list_url)
    if not page_html:
        return {'url': list_url, 'error': True}
    
    deck_data = extract_deck_data_from_html(page_html)
    
    if not deck_data['tournament']:
        deck_data['tournament'] = 'Unknown tournament'
    
    return {
        'url': list_url,
        'tournament': deck_data['tournament'],
        'format': deck_data.get('format', ''),
        'total_cards': len(deck_data['cards']),
        'card_list': deck_data['cards']
    }

def save_csv_files(csv_rows: List[Dict], output_file: str):
    app_path = get_app_path()
    overview_file = os.path.join(app_path, output_file.replace('.csv', '_overview.csv'))
    overview_rows = []
    
    for row in csv_rows:
        overview_rows.append({
            'deck_number': row['deck_number'],
            'deck_url': row['deck_url'],
            'list_number': row['list_number'],
            'deck_name': row.get('deck_name', ''),
            'tournament': row.get('tournament', ''),
            'format': row.get('format', ''),
            'total_cards': row.get('total_cards', 0),
            'status': row['status']
        })
    
    with open(overview_file, 'w', newline='', encoding='utf-8-sig') as f:
        fieldnames = ['deck_number', 'deck_url', 'list_number', 
                     'deck_name', 'tournament', 'format', 'total_cards', 'status']
        writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=';')
        writer.writeheader()
        writer.writerows(overview_rows)
    
    cards_file = os.path.join(app_path, output_file.replace('.csv', '_cards.csv'))
    card_rows = []
    
    for row in csv_rows:
        card_list = row.get('card_list', [])
        # Sort: Pokemon, Trainer, Energy
        def sort_key(card_dict):
            card_name = card_dict.get('name', '').lower()
            if 'energy' in card_name:
                return (2, card_name)
            elif any(k in card_name for k in ['trainer', 'supporter', 'item', 'stadium', 'ball', 'order', 'turo', 'gong', 'vessel', 'gear', 'nest', 'trolley', 'rod', 'ultra', 'power', 'balloon', 'band', 'artazon', 'retrieval', 'arven', 'lillie', 'iono', 'professor', 'buddy', 'stretcher', 'catcher', 'determination', 'research', 'poffin', 'candy', 'tower', 'jamming', 'lucky', 'temple', 'course', 'bridge', 'platform', 'tool', 'junk', 'switch', 'town', 'warp', 'great', 'max', 'luxury', 'box', 'machine', 'charm', 'garden', 'basket', 'hilda', 'brock', 'scouting', 'sticker', 'case', 'cork', 'screw', 'secret', 'mystery', 'picnic', 'technical', 'bravery']):
                return (1, card_name)
            else:
                return (0, card_name)
        
        sorted_cards = sorted(card_list, key=sort_key)
        for card in sorted_cards:
            card_rows.append({
                'deck_number': row['deck_number'],
                'list_number': row['list_number'],
                'format': row.get('format', ''),
                'deck_name': row.get('deck_name', ''),
                'card_count': card.get('count', 0),
                'card_name': card.get('name', '')
            })
    
    # Always create the cards file, even if empty - with retry on permission error
    cards_file_base = os.path.join(app_path, output_file.replace('.csv', '_cards.csv'))
    cards_file = cards_file_base
    
    max_attempts = 3
    for attempt in range(max_attempts):
        try:
            with open(cards_file, 'w', newline='', encoding='utf-8-sig') as f:
                fieldnames = ['deck_number', 'list_number', 'format', 'deck_name', 'card_count', 'card_name']
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

def main():
    settings = load_settings()
    max_decks = settings['max_decks']
    max_lists = settings['max_lists_per_deck']
    delay_lists = settings['delay_between_lists']
    delay_decks = settings['delay_between_decks']
    output_file = settings['output_file']
    format_filter = settings.get('format_filter', '')
    
    base_url = "https://play.limitlesstcg.com/decks"
    
    # Add format filter to URL if specified
    if format_filter:
        # Extract only the set code (e.g., "MEG" from "SVI-MEG")
        set_code = format_filter.split('-')[-1] if '-' in format_filter else format_filter
        
        # Determine rotation based on set code
        rotation_2025_sets = ['PFL', 'MEG']  # Current rotation
        rotation_2024_sets = ['PRE', 'SSP', 'SCR', 'SFA', 'TWM', 'TEF']
        rotation_2023_sets = ['PAR', 'OBF', 'PAL', 'SVI']
        
        if set_code in rotation_2025_sets:
            rotation = '2025'
        elif set_code in rotation_2024_sets:
            rotation = '2024'
        elif set_code in rotation_2023_sets:
            rotation = '2023'
        else:
            rotation = '2025'  # Default to current rotation
        
        base_url = f"{base_url}?rotation={rotation}&set={set_code}"
        print(f"Filtering by format: {format_filter} (using rotation={rotation}, set={set_code})")
    
    csv_rows = []
    
    print("Starting Limitless TCG Deck Scraper...")
    print(f"Settings: max_decks={max_decks}, max_lists_per_deck={max_lists}")
    print("=" * 50)
    
    deck_links = get_deck_links(base_url)
    if not deck_links:
        print("No deck links found.")
        return
    
    deck_links = deck_links[:max_decks]
    
    for i, deck_url in enumerate(deck_links, 1):
        print(f"\nProcessing deck {i}/{len(deck_links)}")
        print("-" * 30)
        
        # Extract only the set code from format_filter (e.g., "MEG" from "SVI-MEG")
        use_format = ''
        if format_filter:
            if '-' in format_filter:
                use_format = format_filter.split('-')[-1]
            else:
                use_format = format_filter
        
        deck_info = get_deck_info(deck_url, use_format)
        deck_name = deck_info['deck_name']
        deck_format = deck_info.get('format', '')  # Get format from deck overview
        
        # Build filter parameters for list links
        filter_params = ''
        if format_filter and rotation and set_code:
            filter_params = f"rotation={rotation}&set={set_code}"
        
        list_links = get_list_links(deck_url, filter_params)
        
        if not list_links:
            csv_rows.append({
                'deck_number': i,
                'deck_url': deck_url,
                'list_number': 0,
                'deck_name': deck_name,
                'tournament': '',
                'format': deck_format,  # Use format from deck overview
                'total_cards': 0,
                'card_list': [],
                'status': 'No list links found'
            })
            continue
        
        list_links = list_links[:max_lists]
        print(f"Found {len(list_links)} list links")
        
        for j, list_url in enumerate(list_links, 1):
            print(f"  Processing list {j}/{len(list_links)}")
            
            list_data = extract_deck_data(list_url)
            
            # Use format from list data if available, otherwise fallback to deck overview format
            list_format = list_data.get('format', '') or deck_format
            
            csv_rows.append({
                'deck_number': i,
                'deck_url': deck_url,
                'list_number': j,
                'deck_name': deck_name,
                'tournament': list_data.get('tournament', ''),
                'format': list_format,  # Use list format or fallback to deck format
                'total_cards': list_data.get('total_cards', 0),
                'card_list': list_data.get('card_list', []),
                'status': 'success' if list_data.get('total_cards', 0) > 0 else 'partial'
            })
            
            time.sleep(delay_lists)
        
        time.sleep(delay_decks)
    
    if csv_rows:
        overview_file, cards_file = save_csv_files(csv_rows, output_file)
        
        print(f"\n" + "=" * 50)
        print(f"Scraping completed!")
        print(f"Overview data saved to: {overview_file}")
        print(f"Detailed card data saved to: {cards_file}")
        
        successful_rows = sum(1 for row in csv_rows if row['status'] == 'success')
        total_cards = sum(row.get('total_cards', 0) for row in csv_rows)
        print(f"Successfully extracted: {successful_rows} deck lists")
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
