#!/usr/bin/env python3
"""
Unified Card Scraper
Combines City League, Limitless Online, and Tournament data
Aggregates card usage with set/number info and archetype percentages
No external dependencies - uses only Python standard library
"""

import urllib.request
import urllib.parse
import csv
import re
import time
import json
import os
import sys
from datetime import datetime
from html.parser import HTMLParser
from typing import List, Dict, Optional, Tuple
from collections import defaultdict

# Add parent folder to path for shared modules
app_path = os.path.dirname(os.path.abspath(__file__))
parent_path = os.path.dirname(app_path)
if parent_path not in sys.path:
    sys.path.insert(0, parent_path)

# Try to import existing scrapers
try:
    import limitless_online_scraper
    LIMITLESS_ONLINE_AVAILABLE = True
except ImportError:
    LIMITLESS_ONLINE_AVAILABLE = False
    print("Warning: limitless_online_scraper not available")

try:
    import city_league_archetype_scraper
    CITY_LEAGUE_ARCHETYPE_AVAILABLE = True
except ImportError:
    CITY_LEAGUE_ARCHETYPE_AVAILABLE = False
    print("Warning: city_league_archetype_scraper not available")

# Import the FULL scrapers with card list support
try:
    import city_league_scraper
    CITY_LEAGUE_AVAILABLE = True
except ImportError:
    CITY_LEAGUE_AVAILABLE = False
    print("Warning: city_league_scraper not available")

try:
    import limitless_scraper
    LIMITLESS_AVAILABLE = True
except ImportError:
    LIMITLESS_AVAILABLE = False
    print("Warning: limitless_scraper not available")

# Import card type lookup
try:
    from card_type_lookup import is_trainer_or_energy, is_valid_card
except ImportError:
    # Fallback if module not available
    def is_trainer_or_energy(card_name: str) -> bool:
        """Fallback trainer/energy detection."""
        trainer_keywords = ['Professor', 'Boss', 'Ball', 'Rod', 'Switch', 'Candy', 'Belt', 
                           'Poffin', 'Nest', 'Ultra', 'Search', 'Town', 'Iono', 'Arven',
                           'Colress', 'Stadium', 'Pokédex', 'Energy', 'Reversal']
        return any(keyword in card_name for keyword in trainer_keywords)
    
    def is_valid_card(card_name: str) -> bool:
        """Fallback card validation."""
        return len(card_name) > 0

# Default settings
DEFAULT_SETTINGS = {
    "sources": {
        "city_league": {
            "enabled": True,
            "start_date": "24.01.2026",  # Fixed start date in 'DD.MM.YYYY' format
            "end_date": "auto",           # 'auto' = today - 2 days, or use 'DD.MM.YYYY'
            "max_decklists_per_league": 16  # 0 = all decklists
        },
        "limitless_online": {
            "enabled": True,
            "game": "POKEMON",
            "format": "STANDARD",
            "rotation": "2025",
            "set": "PFL",
            "top_decks": 20,
            "max_lists_per_deck": 5
        },
        "tournaments": {
            "enabled": True,
            "max_tournaments": 5,
            "max_decks_per_tournament": 128,
            "format_filter": ["Standard", "Standard (JP)"]
        }
    },
    "delay_between_requests": 1.5,
    "output_file": "unified_card_data.csv",
    "api_cache_file": "pokemon_tcg_api_cache.json"
}

def get_app_path() -> str:
    """Get the directory where the executable/script is located."""
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    else:
        return os.path.dirname(os.path.abspath(__file__))

def calculate_date_range(start_date: str, end_date: str) -> Tuple[str, str]:
    """Calculate date range for scraping.
    
    Args:
        start_date: Fixed date in 'DD.MM.YYYY' format
        end_date: 'auto' for today-2, or 'DD.MM.YYYY'
    
    Returns:
        Tuple of (start_date, end_date) in 'DD.MM.YYYY' format
    """
    from datetime import datetime, timedelta
    
    # Start date is always provided as fixed date
    start_str = start_date
    
    # Calculate end_date if 'auto'
    if end_date == 'auto':
        # Today - 2 days
        end_dt = datetime.now() - timedelta(days=2)
        end_str = end_dt.strftime('%d.%m.%Y')
    else:
        # Use provided date
        end_str = end_date
    
    return start_str, end_str

def load_settings() -> Dict:
    """Load settings from unified_card_settings.json."""
    app_path = get_app_path()
    settings_path = os.path.join(app_path, 'unified_card_settings.json')
    
    if not os.path.exists(settings_path) and os.path.basename(app_path) == 'dist':
        parent_path = os.path.dirname(app_path)
        settings_path = os.path.join(parent_path, 'unified_card_settings.json')
    
    print(f"Loading settings from: {settings_path}")
    
    if os.path.exists(settings_path):
        try:
            with open(settings_path, 'r', encoding='utf-8-sig') as f:
                settings = json.loads(f.read().strip())
                print(f"Settings loaded successfully")
                return settings
        except Exception as e:
            print(f"Error loading settings: {e}")
            return DEFAULT_SETTINGS.copy()
    else:
        print(f"Creating default settings file...")
        with open(settings_path, 'w', encoding='utf-8') as f:
            json.dump(DEFAULT_SETTINGS, f, indent=4)
        return DEFAULT_SETTINGS.copy()

def fetch_page(url: str) -> str:
    """Fetch a webpage and return its HTML content."""
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=30) as response:
            return response.read().decode('utf-8', errors='ignore')
    except Exception as e:
        print(f"  Error fetching {url}: {e}")
        return ""

# ============================================================================
# CARD DATABASE LOOKUP (from all_cards_database.csv)
# ============================================================================

class CardDatabaseLookup:
    """Lookup card information from local CSV database."""
    
    # Rarity priority (lower = better) - LOW RARITY preferred!
    RARITY_PRIORITY = {
        'Common': 1,
        'Uncommon': 2,
        'Double Rare': 3,
        'Rare': 4,
        'Art Rare': 20,  # Mid Rarity - much lower priority
        'Ultra Rare': 21,  # Mid Rarity - much lower priority
        'Secret Rare': 30,  # High Rarity - lowest priority
        'Special Illustration Rare': 31,  # High Rarity - lowest priority
        'Hyper Rare': 32,  # High Rarity - lowest priority
        'Illustration Rare': 33,
        'Promo': 5  # Promo cards can be low rarity
    }
    
    # Set order priority (higher = newer/better) - LATEST sets first!
    SET_ORDER = {
        'MEG': 100, 'ASC': 99, 'SP': 98, 'SCR': 97, 'SSH': 96, 'MEW': 95, 'BLK': 94,
        'SSP': 93, 'SVI': 92, 'TEF': 91, 'TWM': 90, 'PAR': 89, 'PAF': 88, 'OBF': 87,
        'PR-SW': 86, 'SVP': 85, 'CRZ': 84, 'SIT': 83, 'LOR': 82, 'PGO': 81, 'ASR': 80,
        'BRS': 79, 'FST': 78, 'CEL': 77, 'EVS': 76, 'CRE': 75, 'BST': 74, 'SHF': 73,
        'VIV': 72, 'CPA': 71, 'DAA': 70, 'RCL': 69
    }
    
    def __init__(self, csv_path: str):
        self.csv_path = csv_path
        self.cards = {}  # name -> list of card variants
        self.load_database()
    
    def normalize_name(self, name: str) -> str:
        """Normalize card name for matching."""
        normalized = name.strip().lower()
        normalized = normalized.replace("'", "'").replace("'", "'").replace("`", "'")
        normalized = normalized.replace('-', ' ').replace('.', '')
        normalized = ' '.join(normalized.split())
        return normalized
    
    def load_database(self):
        """Load all cards from CSV database."""
        if not os.path.exists(self.csv_path):
            print(f"Warning: Card database not found at {self.csv_path}")
            return
        
        try:
            with open(self.csv_path, 'r', encoding='utf-8-sig') as f:
                reader = csv.DictReader(f, delimiter=';')
                count = 0
                for row in reader:
                    # Try both column name formats
                    card_name = row.get('name', row.get('Name', '')).strip()
                    if not card_name:
                        continue
                    
                    normalized = self.normalize_name(card_name)
                    
                    card_info = {
                        'name': card_name,
                        'set_code': row.get('set', row.get('Set Code', '')),
                        'set_number': row.get('number', row.get('Number', '')),
                        'rarity': row.get('rarity', row.get('Rarity', '')),
                        'type': row.get('type', row.get('Type', '')),
                        'card_type': row.get('card_type', row.get('Card Type', 'Pokemon'))
                    }
                    
                    if normalized not in self.cards:
                        self.cards[normalized] = []
                    self.cards[normalized].append(card_info)
                    count += 1
                
                print(f"Loaded {count} cards from database ({len(self.cards)} unique names)")
        except Exception as e:
            print(f"Error loading card database: {e}")
    
    def get_card_info(self, card_name: str) -> Optional[Dict]:
        """Get card info with LOWEST RARITY preference (Common/Uncommon), then NEWEST set."""
        normalized = self.normalize_name(card_name)
        
        # Try exact match first
        if normalized in self.cards:
            variants = self.cards[normalized]
            
            # Find variant with LOWEST rarity (Common > Uncommon > Double Rare > Rare), then NEWEST set
            best_card = None
            best_priority = 999
            best_set_order = -1
            
            for variant in variants:
                rarity = variant['rarity']
                priority = self.RARITY_PRIORITY.get(rarity, 50)
                set_order = self.SET_ORDER.get(variant['set_code'], 0)
                
                # CRITICAL: Prefer LOWER rarity priority (1=Common is best), then HIGHER set order (newer)
                if priority < best_priority or (priority == best_priority and set_order > best_set_order):
                    best_card = variant
                    best_priority = priority
                    best_set_order = set_order
            
            if best_card:
                # Generate Limitless CDN image URL
                # Format: https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/{SET}/{SET}_{NUMBER}_{RARITY}_{LANG}.png
                set_code = best_card['set_code'].upper()
                card_number = best_card['set_number'].replace('-', '_')
                rarity = best_card['rarity'].upper()
                
                # Map rarity to Limitless format (R, U, C, RH, etc.)
                rarity_map = {
                    'RARE': 'R',
                    'UNCOMMON': 'U', 
                    'COMMON': 'C',
                    'RARE HOLO': 'RH',
                    'ULTRA RARE': 'UR',
                    'SECRET RARE': 'SR',
                    'AMAZING RARE': 'AR',
                    'PROMO': 'PR'
                }
                rarity_short = rarity_map.get(rarity, rarity[0] if rarity else 'R')
                
                image_url = f"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/{set_code}/{set_code}_{card_number}_{rarity_short}_EN_LG.png"
                
                return {
                    'set_code': best_card['set_code'],
                    'set_name': '',  # Not in CSV
                    'number': best_card['set_number'],
                    'rarity': best_card['rarity'],
                    'image_url': image_url
                }
        
        # Try partial match (for cards with ex/V suffixes)
        for db_name, variants in self.cards.items():
            if normalized in db_name or db_name in normalized:
                best_card = None
                best_priority = 999
                best_set_order = -1
                
                for variant in variants:
                    rarity = variant['rarity']
                    priority = self.RARITY_PRIORITY.get(rarity, 50)
                    set_order = self.SET_ORDER.get(variant['set_code'], 0)
                    
                    # Prefer LOWER rarity, then NEWER set
                    if priority < best_priority or (priority == best_priority and set_order > best_set_order):
                        best_card = variant
                        best_priority = priority
                        best_set_order = set_order
                
                if best_card:
                    # Generate Limitless CDN image URL
                    set_code = best_card['set_code'].upper()
                    card_number = best_card['set_number'].replace('-', '_')
                    rarity = best_card['rarity'].upper()
                    
                    rarity_map = {
                        'RARE': 'R',
                        'UNCOMMON': 'U',
                        'COMMON': 'C',
                        'RARE HOLO': 'RH',
                        'ULTRA RARE': 'UR',
                        'SECRET RARE': 'SR',
                        'AMAZING RARE': 'AR',
                        'PROMO': 'PR'
                    }
                    rarity_short = rarity_map.get(rarity, rarity[0] if rarity else 'R')
                    
                    image_url = f"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/{set_code}/{set_code}_{card_number}_{rarity_short}_EN_LG.png"
                    
                    return {
                        'set_code': best_card['set_code'],
                        'set_name': '',
                        'number': best_card['set_number'],
                        'rarity': best_card['rarity'],
                        'image_url': image_url
                    }
        
        return None
    
    def get_name_by_set_number(self, set_code: str, card_number: str) -> Optional[str]:
        """Lookup card name by set code and number."""
        if not set_code or not card_number:
            return None
        
        # Search through all cards for matching set+number
        for db_name, variants in self.cards.items():
            for variant in variants:
                if variant['set_code'] == set_code and variant['set_number'] == card_number:
                    return variant['name']
        
        return None

def normalize_archetype_name(archetype: str) -> str:
    """Normalize archetype names - MINIMAL normalization to avoid breaking valid deck names.
    
    Only fixes known duplicates like 'N Zoroark' vs 'Zoroark' where N is a trainer prefix.
    Does NOT remove partner Pokemon names like 'Meg' (Mega Diance), 'Dudunsparce', etc.
    """
    name = archetype.strip()
    
    # ONLY remove single-letter prefixes that are trainer names (N's Zoroark)
    name = re.sub(r'^N\s+', '', name)   # "N Zoroark" -> "Zoroark"
    name = re.sub(r'^Ns\s+', '', name)  # "Ns Zoroark" -> "Zoroark"
    
    # DO NOT remove Ex/V/Vstar/Vmax - these might be important variant markers
    # DO NOT remove 3-letter words - could be partner Pokemon names (Meg = Mega Diance)
    
    return name.strip()

# ============================================================================
# POKEMON TCG API INTEGRATION FOR SET/NUMBER LOOKUP (LEGACY - NOT USED)
# ============================================================================

class PokemonTCGAPI:
    """Interface to Pokemon TCG API for card lookup."""
    
    BASE_URL = "https://api.pokemontcg.io/v2"
    
    # Rarity priority (lower = better)
    RARITY_PRIORITY = {
        'Common': 1,
        'Uncommon': 2,
        'Double Rare': 3,
        'Rare': 4,
        'Art Rare': 5,
        'Ultra Rare': 6,
        'Secret Rare': 7,
        'Special Illustration Rare': 8,
        'Hyper Rare': 9,
        'Illustration Rare': 10
    }
    
    def __init__(self, cache_file: str):
        self.cache_file = cache_file
        self.cache = self.load_cache()
    
    def load_cache(self) -> Dict:
        """Load API cache from file."""
        if os.path.exists(self.cache_file):
            try:
                with open(self.cache_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except:
                return {}
        return {}
    
    def save_cache(self):
        """Save API cache to file."""
        try:
            with open(self.cache_file, 'w', encoding='utf-8') as f:
                json.dump(self.cache, f, indent=2)
        except Exception as e:
            print(f"  Warning: Could not save API cache: {e}")
    
    def get_card_info(self, card_name: str) -> Optional[Dict]:
        """Get card set/number/rarity info from API."""
        # Check cache first
        if card_name in self.cache:
            return self.cache[card_name]
        
        # Clean card name for API search
        clean_name = card_name.replace(' ex', '').replace(' V', '').replace(' VMAX', '').replace(' VSTAR', '').strip()
        
        # Search API
        try:
            # Properly encode the search query
            search_query = f'name:"{clean_name}"'
            encoded_query = urllib.parse.quote(search_query)
            url = f"{self.BASE_URL}/cards?q={encoded_query}&pageSize=250"
            
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            
            with urllib.request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode('utf-8'))
                
                if not data.get('data'):
                    # Try broader search without exact name matching
                    search_query = clean_name
                    encoded_query = urllib.parse.quote(search_query)
                    url = f"{self.BASE_URL}/cards?q=name:{encoded_query}&pageSize=250"
                    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                    
                    with urllib.request.urlopen(req, timeout=10) as response:
                        data = json.loads(response.read().decode('utf-8'))
                        
                        if not data.get('data'):
                            self.cache[card_name] = None
                            return None
                
                # Find the best match with lowest rarity
                best_card = None
                best_priority = 999
                best_date = ""
                
                for card in data['data']:
                    card_api_name = card.get('name', '').lower()
                    
                    # Check if card name matches
                    name_match = False
                    if card_api_name == card_name.lower():
                        name_match = True
                    elif card_api_name == clean_name.lower():
                        name_match = True
                    elif card_api_name.startswith(clean_name.lower()):
                        # Partial match for cards like "Pikachu ex" where we search "Pikachu"
                        name_match = True
                    
                    if not name_match:
                        continue
                    
                    rarity = card.get('rarity', 'Unknown')
                    priority = self.RARITY_PRIORITY.get(rarity, 50)
                    release_date = card.get('set', {}).get('releaseDate', '1900-01-01')
                    
                    # Prefer lower priority (lower rarity), then newer sets
                    if priority < best_priority or (priority == best_priority and release_date > best_date):
                        best_card = card
                        best_priority = priority
                        best_date = release_date
                
                if best_card:
                    result = {
                        'set_code': best_card.get('set', {}).get('id', ''),
                        'set_name': best_card.get('set', {}).get('name', ''),
                        'number': best_card.get('number', ''),
                        'rarity': best_card.get('rarity', ''),
                        'image_url': best_card.get('images', {}).get('small', '')
                    }
                    self.cache[card_name] = result
                    self.save_cache()
                    return result
                
                self.cache[card_name] = None
                return None
                
        except Exception as e:
            print(f"  API error for {card_name}: {e}")
            self.cache[card_name] = None
            return None
        finally:
            time.sleep(0.15)  # Rate limiting

# ============================================================================
# CITY LEAGUE SCRAPER
# ============================================================================

class CityLeagueParser(HTMLParser):
    """Parser for City League tournament pages."""
    def __init__(self):
        super().__init__()
        self.decks = []
        self.in_deck_list = False
        self.current_deck = None
        self.current_tag = None
        self.current_count = None
    
    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        
        if tag == 'div' and attrs_dict.get('class') == 'decklist':
            self.in_deck_list = True
            self.current_deck = {'archetype': '', 'cards': []}
        
        if self.in_deck_list:
            if tag == 'h3':
                self.current_tag = 'archetype'
            elif tag == 'span' and 'quantity' in attrs_dict.get('class', ''):
                self.current_tag = 'quantity'
            elif tag == 'a' and 'card-link' in attrs_dict.get('class', ''):
                self.current_tag = 'card'
    
    def handle_data(self, data):
        if self.in_deck_list:
            if self.current_tag == 'archetype':
                self.current_deck['archetype'] = data.strip()
                self.current_tag = None
            elif self.current_tag == 'quantity':
                self.current_count = int(data.strip())
                self.current_tag = None
            elif self.current_tag == 'card':
                card_name = data.strip()
                if self.current_count and is_valid_card(card_name):
                    self.current_deck['cards'].append({
                        'name': card_name,
                        'count': self.current_count
                    })
                self.current_count = None
                self.current_tag = None
    
    def handle_endtag(self, tag):
        if tag == 'div' and self.in_deck_list and self.current_deck:
            if self.current_deck['archetype'] and self.current_deck['cards']:
                self.decks.append(self.current_deck)
            self.current_deck = None
            self.in_deck_list = False

def scrape_city_league(settings: Dict, card_db: CardDatabaseLookup) -> List[Dict]:
    """Scrape City League tournaments with FULL CARD LISTS."""
    print("\n" + "="*60)
    print("SCRAPING CITY LEAGUE DATA (Full Card Lists)")
    print("="*60)
    
    config = settings['sources']['city_league']
    if not config.get('enabled'):
        print("City League scraping disabled in settings")
        return []
    
    if not CITY_LEAGUE_AVAILABLE:
        print("⚠️  City League scraper module not available - skipping")
        return []
    
    all_decks = []
    
    try:
        start_date_config = config.get('start_date', '24.01.2026')
        end_date_config = config.get('end_date', 'auto')
        max_decklists_per_league = config.get('max_decklists_per_league', 16)
        
        # Calculate dates (end_date can be 'auto' for today-2)
        start_date, end_date = calculate_date_range(start_date_config, end_date_config)
        
        print(f"Scraping City League tournaments from {start_date} to {end_date}")
        if end_date_config == 'auto':
            print(f"  (End date auto-calculated: today - 2 days)")
        print(f"Max decklists per league: {max_decklists_per_league if max_decklists_per_league > 0 else 'ALL'}")
        
        # Parse dates
        from datetime import datetime
        start_dt = datetime.strptime(start_date, "%d.%m.%Y")
        end_dt = datetime.strptime(end_date, "%d.%m.%Y")
        
        # Get city league links (always from Japan region)
        base_url = "https://limitlesstcg.com/tournaments/jp"
        leagues = city_league_scraper.get_city_league_links(base_url, start_dt, end_dt)
        
        print(f"Found {len(leagues)} City League tournaments")
        
        for i, league in enumerate(leagues, 1):
            league_id = league.get('id', 'Unknown')
            url = league.get('url', '')
            date_str = league.get('date_str', '')
            
            if not url:
                continue
            
            # Get league info
            league_info = city_league_scraper.get_league_info(url)
            league_name = league_info.get('name', f'League {league_id}')
            
            print(f"  [{i}/{len(leagues)}] {date_str} - {league_name}")
            
            # Get decklists from this league
            max_lists = max_decklists_per_league if max_decklists_per_league > 0 else 0
            decklists = city_league_scraper.get_decklist_links(url, max_decklists=max_lists)
            print(f"    Found {len(decklists)} decklists")
            
            for j, decklist in enumerate(decklists, 1):
                if j % 5 == 0:
                    print(f"      Processing decklist {j}/{len(decklists)}...")
                
                deck_url = decklist.get('url', '')
                archetype = decklist.get('archetype', 'Unknown')
                
                # Extract cards from decklist
                cards = city_league_scraper.extract_cards_from_decklist(deck_url)
                
                if cards:
                    # Convert format to our format
                    converted_cards = []
                    for card in cards:
                        # Parse full_name like "Charizard ex MEG 006"
                        parts = card['full_name'].split()
                        if len(parts) >= 3:
                            # Has set and number
                            card_name = ' '.join(parts[:-2])
                            set_code = parts[-2]
                            card_number = parts[-1]
                        else:
                            # No set/number
                            card_name = card['full_name']
                            set_code = ''
                            card_number = ''
                        
                        converted_cards.append({
                            'name': card_name,
                            'count': card['count'],
                            'set_code': set_code,
                            'card_number': card_number
                        })
                    
                    all_decks.append({
                        'archetype': archetype,
                        'cards': converted_cards,
                        'source': 'City League'
                    })
            
            time.sleep(settings.get('delay_between_requests', 1.0))
        
        print(f"\n✓ Total decks with FULL CARD LISTS from City League: {len(all_decks)}")
        
    except Exception as e:
        print(f"⚠️  Error in City League scraping: {e}")
        print("   (Continuing with other sources...)")
        import traceback
        traceback.print_exc()
    
    return all_decks

# ============================================================================
# LIMITLESS ONLINE SCRAPER
# ============================================================================

def scrape_limitless_online(settings: Dict, card_db: CardDatabaseLookup) -> List[Dict]:
    """Scrape Limitless Online deck data with FULL CARD LISTS."""
    print("\n" + "="*60)
    print("SCRAPING LIMITLESS ONLINE DATA (Full Card Lists)")
    print("="*60)
    
    config = settings['sources']['limitless_online']
    if not config.get('enabled'):
        print("Limitless Online scraping disabled in settings")
        return []
    
    if not LIMITLESS_AVAILABLE:
        print("⚠️  Limitless scraper module not available - skipping")
        return []
    
    all_decks = []
    
    try:
        max_decks = config.get('max_decks', 20)
        max_lists_per_deck = config.get('max_lists_per_deck', 3)
        delay_between_lists = config.get('delay_between_lists', 1.5)
        delay_between_decks = config.get('delay_between_decks', 3)
        format_filter = config.get('format_filter', '').lower()
        
        print(f"Scraping Limitless Online decks")
        print(f"  Max decks: {max_decks}, Max lists per deck: {max_lists_per_deck}")
        print(f"  Format filter: {format_filter if format_filter else 'ALL'}")
        
        # Build main URL with rotation and set filter
        if format_filter:
            main_url = f"https://play.limitlesstcg.com/decks?rotation=2025&set={format_filter}"
            print(f"  Filtering by: rotation=2025, set={format_filter}")
        else:
            main_url = "https://play.limitlesstcg.com/decks?game=POKEMON"
        
        # Get deck links from main page
        deck_links = limitless_scraper.get_deck_links(main_url)
        
        print(f"Found {len(deck_links)} deck links")
        
        # Limit to max decks
        deck_links = deck_links[:max_decks]
        
        print(f"Processing top {len(deck_links)} decks...")
        
        for i, deck_url in enumerate(deck_links, 1):
            # Get deck info
            deck_info = limitless_scraper.get_deck_info(deck_url)
            archetype = deck_info.get('deck_name', 'Unknown')
            
            print(f"  [{i}/{len(deck_links)}] {archetype}")
            
            # Get list links for this deck with optional format filter
            if format_filter:
                filter_params = f"rotation=2025&set={format_filter}"
            else:
                filter_params = ""
            list_links = limitless_scraper.get_list_links(deck_url, filter_params)
            
            # Limit lists per deck
            list_links = list_links[:max_lists_per_deck]
            
            print(f"    Found {len(list_links)} lists, processing...")
            
            for j, list_url in enumerate(list_links, 1):
                if j % 2 == 0:
                    print(f"      Processing list {j}/{len(list_links)}...")
                
                # Extract deck data (cards)
                deck_data = limitless_scraper.extract_deck_data(list_url)
                
                if 'card_list' in deck_data and deck_data['card_list']:
                    # Convert format
                    converted_cards = []
                    for card in deck_data['card_list']:
                        # limitless_scraper returns: {'count': X, 'name': 'Card Name SET NUM', 'needs_lookup': bool}
                        # We need: {'name': ..., 'count': ..., 'set_code': ..., 'card_number': ...}
                        
                        full_name = card.get('name', '')
                        count = card.get('count', 1)
                        
                        # Parse the name - could be:
                        # - "Charizard ex PFL 006" (Pokemon with set/number)
                        # - "Nest Ball" (Trainer/Energy without set/number)
                        parts = full_name.rsplit(' ', 2)  # Split from right to get last 2 parts
                        
                        if len(parts) == 3:
                            # Check if last two parts are SET CODE and NUMBER
                            potential_set = parts[-2]
                            potential_number = parts[-1]
                            
                            # Validate: SET must be 2-4 uppercase letters, NUMBER must be digits
                            if (potential_set.isupper() and len(potential_set) >= 2 and len(potential_set) <= 4 
                                and potential_number.isdigit()):
                                # Has set and number
                                card_name = parts[0]
                                set_code = potential_set
                                card_number = potential_number
                            else:
                                # Doesn't match pattern - treat as card name only
                                card_name = full_name
                                set_code = ''
                                card_number = ''
                        else:
                            # No set/number
                            card_name = full_name
                            set_code = ''
                            card_number = ''
                        
                        converted_cards.append({
                            'name': card_name,
                            'count': count,
                            'set_code': set_code,
                            'card_number': card_number
                        })
                    
                    all_decks.append({
                        'archetype': archetype,
                        'cards': converted_cards,
                        'source': 'Limitless Online'
                    })
                
                time.sleep(delay_between_lists)
            
            time.sleep(delay_between_decks)
        
        print(f"\n✓ Total decks with FULL CARD LISTS from Limitless Online: {len(all_decks)}")
        
    except Exception as e:
        print(f"⚠️  Error in Limitless Online scraping: {e}")
        print("   (Continuing with other sources...)")
        import traceback
        traceback.print_exc()
    
    return all_decks

# ============================================================================
# TOURNAMENT SCRAPER
# ============================================================================

def get_tournament_links(base_url: str, max_tournaments: int) -> List[Dict]:
    """Get tournament links from labs.limitlesstcg.com."""
    tournaments = []
    
    print(f"  Loading tournaments from {base_url}...")
    html = fetch_page(base_url)
    if not html:
        return []
    
    # Extract tournament IDs from links like /0050/standings
    matches = re.findall(r'href=["\']/(\d+)/standings["\']', html)
    seen_ids = set()
    
    if not matches:
        print(f"  Debug: Could not find tournament links. HTML length: {len(html)}")
    
    for tournament_id in matches:
        if tournament_id not in seen_ids:
            seen_ids.add(tournament_id)
            tournaments.append({
                'id': tournament_id,
                'url': f'https://labs.limitlesstcg.com/{tournament_id}/standings',
                'standings_url': f'https://labs.limitlesstcg.com/{tournament_id}/standings'
            })
        
        if len(tournaments) >= max_tournaments:
            break
    
    result = tournaments[:max_tournaments]
    print(f"  Found {len(result)} tournaments")
    return result

def get_tournament_info(tournament_url: str) -> Dict:
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

def get_deck_links_from_standings(tournament_id: str, max_decks: int = 128) -> List[Dict]:
    """Get deck links from tournament standings page."""
    standings_url = f"https://labs.limitlesstcg.com/{tournament_id}/standings"
    html = fetch_page(standings_url)
    if not html:
        return []
    
    deck_links = []
    
    # Strategy: Parse the HTML line by line to find player-archetype pairs
    # The HTML structure has rows like:
    # <tr>...player link.../0050/player/123/decklist...deck link.../0050/decks/alakazam-dudunsparce...</tr>
    
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
            # Convert slug to readable name (e.g., "alakazam-dudunsparce" -> "Alakazam Dudunsparce")
            archetype = archetype_slug.replace('-', ' ').title()
        else:
            # No archetype link found - try to extract from text or default to Unknown
            archetype = "Unknown"
        
        deck_links.append({
            'player_id': player_id,
            'url': f"https://labs.limitlesstcg.com/{tournament_id}/player/{player_id}/decklist",
            'archetype': archetype
        })
        
        if len(deck_links) >= max_decks:
            break
    
    return deck_links[:max_decks]

def extract_cards_from_decklist(decklist_url: str) -> List[Dict]:
    """Extract card data from a player's decklist page on labs.limitlesstcg.com."""
    html_content = fetch_page(decklist_url)
    if not html_content:
        return []

    cards: List[Dict] = []
    
    # Labs.limitlesstcg.com stores deck data in JSON within script tags
    # Pattern: <script>{"status":200,...,"body":"{\"ok\":true,\"message\":{\"pokemon\":[...],\"trainer\":[...],\"energy\":[...]}}"}
    script_pattern = re.compile(r'<script[^>]*>(.*?)</script>', re.DOTALL)
    scripts = script_pattern.findall(html_content)
    
    for script in scripts:
        try:
            # Check if this script contains deck data (check for escaped quotes too)
            if 'pokemon' not in script.lower() and 'trainer' not in script.lower():
                continue
            
            # Parse the outer JSON
            data = json.loads(script)
            if 'body' not in data:
                continue
            
            # Parse the inner JSON (which is a string)
            body_data = json.loads(data['body'])
            if not body_data.get('ok') or 'message' not in body_data:
                continue
            
            message = body_data['message']
            
            # Extract cards from each category
            for category in ['pokemon', 'trainer', 'energy']:
                if category not in message:
                    continue
                
                for card in message[category]:
                    try:
                        count = int(card.get('count', 0))
                        name = card.get('name', '').strip()
                        
                        if not name or count == 0:
                            continue
                        
                        # Clean up name
                        import html as html_module
                        name = html_module.unescape(name)
                        name = name.replace("'", "'").replace("`", "'").replace("´", "'").replace("'", "'")
                        
                        cards.append({
                            'name': name,
                            'count': count,
                            'set_code': '',
                            'card_number': ''
                        })
                    except (ValueError, KeyError):
                        continue
            
            # If we found cards, we're done
            if cards:
                break
                
        except (json.JSONDecodeError, KeyError):
            continue
    
    return cards

def extract_cards_from_tournament(cards_url: str, deck_name: str = None) -> List[Dict]:
    """Extract card data from a tournament's cards page."""
    html_content = fetch_page(cards_url)
    if not html_content:
        return []

    cards: List[Dict] = []
    seen_cards = set()

    # Regex patterns
    heading_pattern = re.compile(r'<div[^>]*class="decklist-column-heading"[^>]*>\s*([^<]+?)\s*</div>', re.IGNORECASE)
    card_pattern = re.compile(r'<div[^>]*class="decklist-card"[^>]*data-set="([A-Z0-9]*)"[^>]*data-number="(\d*)"[^>]*>.*?<span class="card-count">([0-9.]+)</span>\s*<span class="card-name">([^<]+)</span>', re.IGNORECASE | re.DOTALL)

    # Find all headings
    headings = []
    for m in heading_pattern.finditer(html_content):
        title = m.group(1).strip().lower()
        if 'trainer' in title:
            section_type = 'trainer'
        elif 'energy' in title:
            section_type = 'energy'
        else:
            section_type = 'pokemon'
        headings.append({'start': m.end(), 'type': section_type})

    # Determine end positions
    for idx in range(len(headings)):
        start = headings[idx]['start']
        end = headings[idx + 1]['start'] if idx + 1 < len(headings) else len(html_content)
        headings[idx]['end'] = end

    # Extract cards per section
    import html as html_module
    for sec in headings if headings else [{'start': 0, 'end': len(html_content), 'type': 'pokemon'}]:
        block = html_content[sec['start']:sec['end']]
        section_type = sec['type']

        for match in card_pattern.findall(block):
            try:
                set_code_raw = match[0].upper() if match[0] else ""
                card_number_raw = match[1] if match[1] else ""
                count_str = match[2]
                name = match[3].strip()

                name = html_module.unescape(name)
                name = name.replace("'", "'").replace("`", "'").replace("´", "'").replace("'", "'")

                if not is_valid_card(name):
                    continue

                count = int(float(count_str) + 0.5)  # Round up

                # ALL cards get set/number info (Pokemon, Trainer, AND Energy!)
                set_code = set_code_raw if set_code_raw else ""
                card_number = card_number_raw if card_number_raw else ""
                if set_code == 'PR-SV':
                    set_code = 'SVP'
                
                # Create unique key with set/number for all cards
                if set_code and card_number:
                    card_key = f"{name}|{set_code}|{card_number}".lower()
                else:
                    card_key = name.lower()

                if card_key not in seen_cards and name:
                    seen_cards.add(card_key)
                    cards.append({
                        'name': name,
                        'count': count,
                        'set_code': set_code,
                        'card_number': card_number
                    })
                elif card_key in seen_cards and name:
                    # Card already exists, add to count
                    for existing_card in cards:
                        # Create same key format for comparison (all cards use set/number)
                        if existing_card.get('set_code') and existing_card.get('card_number'):
                            existing_key = f"{existing_card['name']}|{existing_card.get('set_code', '')}|{existing_card.get('card_number', '')}".lower()
                        else:
                            existing_key = existing_card['name'].lower()
                        
                        if existing_key == card_key:
                            existing_card['count'] += count
                            break
            except (ValueError, IndexError):
                continue

    return cards

def scrape_tournaments(settings: Dict, card_db: CardDatabaseLookup) -> List[Dict]:
    """Scrape tournament deck data from labs.limitlesstcg.com - PRIMARY SOURCE for card lists."""
    print("\n" + "="*60)
    print("SCRAPING TOURNAMENT DATA (Complete Card Lists)")
    print("="*60)
    
    config = settings['sources']['tournaments']
    if not config.get('enabled'):
        print("Tournament scraping disabled in settings")
        return []
    
    max_tournaments = config.get('max_tournaments', 150)
    max_decks_per_tournament = config.get('max_decks_per_tournament', 128)
    
    base_url = "https://labs.limitlesstcg.com/"
    all_decks = []
    
    # Get tournament links
    tournaments = get_tournament_links(base_url, max_tournaments)
    if not tournaments:
        print("No tournaments found")
        return []
    
    for i, tournament in enumerate(tournaments, 1):
        print(f"\n[{i}/{len(tournaments)}] Processing tournament {tournament['id']}...")
        
        # Get tournament info
        info = get_tournament_info(tournament['url'])
        print(f"  {info['name']}")
        
        # Get deck links from standings
        deck_links = get_deck_links_from_standings(tournament['id'], max_decks_per_tournament)
        if not deck_links:
            print("  No decks found")
            continue
        
        print(f"  Found {len(deck_links)} decks, scraping...")
        
        for j, deck_info in enumerate(deck_links, 1):
            if j % 20 == 0:
                print(f"    Processed {j}/{len(deck_links)} decks...")
            
            cards = extract_cards_from_decklist(deck_info['url'])
            
            if cards:
                all_decks.append({
                    'archetype': deck_info['archetype'],
                    'cards': cards,
                    'source': 'Tournament'
                })
        
        print(f"  Collected {len(all_decks)} complete decks so far")
        time.sleep(settings.get('delay_between_requests', 1.0))
    
    print(f"\n✓ Total decks with FULL CARD LISTS from tournaments: {len(all_decks)}")
    return all_decks

# ============================================================================
# DATA AGGREGATION AND ANALYSIS
# ============================================================================

def aggregate_card_data(all_decks: List[Dict], card_db: CardDatabaseLookup) -> List[Dict]:
    """Aggregate card data from all sources with archetype percentages."""
    print("\n" + "="*60)
    print("AGGREGATING CARD DATA")
    print("="*60)
    
    # Structure: {archetype: {card_name: {'total_count': X, 'deck_count': Y, 'max_count': Z, 'decks': []}}}
    archetype_cards = defaultdict(lambda: defaultdict(lambda: {'total_count': 0, 'deck_count': 0, 'max_count': 0, 'decks': []}))
    archetype_deck_counts = defaultdict(int)  # Total decks per archetype (with cards)
    archetype_total_seen = defaultdict(int)  # All decks including those without cards
    
    # Aggregate data
    decks_with_cards = 0
    decks_without_cards = 0
    
    print(f"\nDebug: Processing {len(all_decks)} decks...")
    for i, deck in enumerate(all_decks):
        # NORMALIZE ARCHETYPE NAME to merge variants like "Ceruledge Ex" and "Ceruledge"
        archetype_raw = deck['archetype']
        archetype = normalize_archetype_name(archetype_raw)
        archetype_total_seen[archetype] += 1
        
        # Debug first 3 decks
        if i < 3:
            print(f"  Deck {i+1}: archetype_raw={archetype_raw}, archetype_normalized={archetype}, cards={len(deck.get('cards', []))} cards, source={deck.get('source')}")
        
        # Skip decks without card lists (from City League/Limitless Online)
        if not deck.get('cards'):
            decks_without_cards += 1
            continue
        
        decks_with_cards += 1
        archetype_deck_counts[archetype] += 1
        
        # Track which cards appear in this deck
        cards_in_deck = set()
        
        for card in deck['cards']:
            card_name = card['name']
            count = card['count']
            
            # FIX: If card name is empty but we have set+number, lookup the name
            if not card_name or card_name.strip() == '':
                set_code = card.get('set_code', '')
                card_number = card.get('card_number', '')
                if set_code and card_number:
                    looked_up_name = card_db.get_name_by_set_number(set_code, card_number)
                    if looked_up_name:
                        card_name = looked_up_name
                        card['name'] = card_name  # Update the card dict
                    else:
                        # Still no name found - skip this card
                        continue
                else:
                    # No name and no set+number - skip this card
                    continue
            
            archetype_cards[archetype][card_name]['total_count'] += count
            
            # Track max count across all decks
            if count > archetype_cards[archetype][card_name]['max_count']:
                archetype_cards[archetype][card_name]['max_count'] = count
            
            if card_name not in cards_in_deck:
                archetype_cards[archetype][card_name]['deck_count'] += 1
                cards_in_deck.add(card_name)
    
    print(f"\n📊 Data Summary:")
    print(f"  • Total decks collected: {len(all_decks)}")
    print(f"  • Decks WITH card lists: {decks_with_cards} (Tournament data)")
    print(f"  • Decks WITHOUT card lists: {decks_without_cards} (City League/Limitless archetype tracking)")
    print(f"  • Unique archetypes: {len(archetype_deck_counts)}")
    
    # Build final output
    result = []
    
    print(f"\n🔍 Looking up set/number info from card database...")
    card_count = 0
    successful_lookups = 0
    failed_lookups = 0
    
    for archetype, cards in archetype_cards.items():
        # Use only decks WITH cards for percentage calculation
        total_decks_with_cards = archetype_deck_counts[archetype]
        
        if total_decks_with_cards == 0:
            continue  # Skip archetypes with no card data
        
        for card_name, data in cards.items():
            # Calculate percentage based on decks that have card lists
            percentage = (data['deck_count'] / total_decks_with_cards * 100) if total_decks_with_cards > 0 else 0
            
            card_count += 1
            if card_count % 50 == 0:
                print(f"  Processed {card_count} unique cards... ({successful_lookups} found, {failed_lookups} not found)")
            
            # Get set/number info from local database (ALL cards including Trainer/Energy!)
            card_info = card_db.get_card_info(card_name)
            
            if card_info:
                successful_lookups += 1
            else:
                failed_lookups += 1
            
            # Create combined identifier (Card Name + Set + Number)
            set_code_val = card_info['set_code'] if card_info else ''
            set_number_val = card_info['number'] if card_info else ''
            if set_code_val and set_number_val:
                card_identifier = f"{card_name} {set_code_val} {set_number_val}"
            else:
                card_identifier = card_name
            
            result.append({
                'archetype': archetype,
                'card_name': card_name,
                'card_identifier': card_identifier,
                'total_count': data['total_count'],
                'max_count': data['max_count'],
                'deck_count': data['deck_count'],
                'total_decks_in_archetype': total_decks_with_cards,
                'percentage_in_archetype': round(percentage, 1),
                'set_code': card_info['set_code'] if card_info else '',
                'set_name': card_info['set_name'] if card_info else '',
                'set_number': card_info['number'] if card_info else '',
                'rarity': card_info['rarity'] if card_info else '',
                'image_url': card_info['image_url'] if card_info else ''
            })
    
    # Sort by archetype, then by percentage descending
    result.sort(key=lambda x: (x['archetype'], -x['percentage_in_archetype'], x['card_name']))
    
    print(f"\n✅ Final Results:")
    print(f"  • {len(result)} card entries across {len(archetype_cards)} archetypes")
    print(f"  • Lookup Summary: {successful_lookups} found ✓, {failed_lookups} not found ✗")
    if failed_lookups > 0:
        print(f"  ⚠️  {failed_lookups} cards missing set/number info (check all_cards_database.csv)")
    return result

def save_to_csv(data: List[Dict], output_file: str):
    """Save aggregated data to CSV."""
    if not data:
        print("No data to save.")
        return
    
    app_path = get_app_path()
    
    # Save directly in scraper folder (flat structure)
    output_path = os.path.join(app_path, output_file)
    
    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    print(f"\nSaving data to: {output_path}")
    
    fieldnames = ['archetype', 'card_name', 'card_identifier', 'total_count', 'max_count', 'deck_count', 
                  'total_decks_in_archetype', 'percentage_in_archetype',
                  'set_code', 'set_name', 'set_number', 'rarity', 'image_url']
    
    try:
        with open(output_path, 'w', newline='', encoding='utf-8-sig') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=';')
            writer.writeheader()
            
            for row in data:
                # Format percentage with comma for German Excel
                row_formatted = row.copy()
                row_formatted['percentage_in_archetype'] = str(row['percentage_in_archetype']).replace('.', ',')
                writer.writerow(row_formatted)
        
        print(f"Successfully saved {len(data)} entries to {output_file}")
    except Exception as e:
        print(f"Error saving to CSV: {e}")

# ============================================================================
# MAIN FUNCTION
# ============================================================================

def main():
    """Main execution function."""
    print("=" * 60)
    print("UNIFIED CARD SCRAPER")
    print("Combining City League, Limitless Online, and Tournament data")
    print("=" * 60)
    
    # Load settings
    settings = load_settings()
    
    # Initialize Card Database Lookup
    app_path = get_app_path()
    parent_path = os.path.dirname(app_path)
    
    # Try multiple locations for the database
    possible_paths = [
        os.path.join(parent_path, 'all_cards_database.csv'),
        os.path.join(app_path, 'all_cards_database.csv'),
        'C:\\Users\\haush\\OneDrive\\Desktop\\Hausi Scrapen\\all_cards_database.csv'
    ]
    
    csv_path = None
    for path in possible_paths:
        if os.path.exists(path):
            csv_path = path
            break
    
    if not csv_path:
        print("\nERROR: all_cards_database.csv not found!")
        print("Please copy all_cards_database.csv to the parent folder")
        input("\nPress Enter to exit...")
        return
    
    print(f"Loading card database from: {csv_path}")
    card_db = CardDatabaseLookup(csv_path)
    
    if not card_db.cards:
        print("\nERROR: Failed to load card database!")
        input("\nPress Enter to exit...")
        return
    
    # Scrape from all enabled sources
    all_decks = []
    
    try:
        city_decks = scrape_city_league(settings, card_db)
        all_decks.extend(city_decks)
    except Exception as e:
        print(f"Error in City League scraping: {e}")
    
    try:
        limitless_decks = scrape_limitless_online(settings, card_db)
        all_decks.extend(limitless_decks)
    except Exception as e:
        print(f"Error in Limitless Online scraping: {e}")
    
    try:
        tournament_decks = scrape_tournaments(settings, card_db)
        all_decks.extend(tournament_decks)
    except Exception as e:
        print(f"Error in Tournament scraping: {e}")
    
    print(f"\n{'='*60}")
    print(f"Total decks collected: {len(all_decks)}")
    print(f"{'='*60}")
    
    if not all_decks:
        print("\nNo decks found. Please check your settings and try again.")
        input("\nPress Enter to exit...")
        return
    
    # Aggregate and analyze
    aggregated_data = aggregate_card_data(all_decks, card_db)
    
    # Save to CSV
    save_to_csv(aggregated_data, settings['output_file'])
    
    print("\n" + "="*60)
    print("SCRAPING COMPLETE!")
    print("="*60)
    input("\nPress Enter to exit...")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nScraping interrupted by user.")
    except Exception as e:
        print(f"\nUnexpected error: {e}")
        import traceback
        traceback.print_exc()
        input("\nPress Enter to exit...")
