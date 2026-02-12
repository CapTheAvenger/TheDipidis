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
from typing import List, Dict, Optional, Tuple, Any
from collections import defaultdict

# Import dedicated scrapers - try to load them
_city_league_available = False
_limitless_available = False

try:
    # Try importing from standard path first
    import sys
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import city_league_archetype_scraper as city_league_module
    _city_league_available = True
    print("[DEBUG] City League module imported successfully")
except Exception as e:
    city_league_module = None
    print(f"[DEBUG] City League import failed: {type(e).__name__}: {e}")

try:
    import sys
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import limitless_online_scraper as limitless_module
    _limitless_available = True
    print("[DEBUG] Limitless Online module imported successfully")
except Exception as e:
    limitless_module = None
    print(f"[DEBUG] Limitless Online import failed: {type(e).__name__}: {e}")

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
DEFAULT_SETTINGS: Dict[str, Any] = {
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
    "output_file": "unified_card_data.csv"
}

def get_app_path() -> str:
    """Get the directory where the executable/script is located."""
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    else:
        return os.path.dirname(os.path.abspath(__file__))

def get_data_dir() -> str:
    """Get the shared data directory for CSV outputs."""
    app_path = get_app_path()
    
    # Always use workspace root/data directory
    parts = app_path.replace('\\', '/').split('/')
    
    # Find workspace root (before 'dist' or use current if not in dist)
    if 'dist' in parts:
        dist_index = parts.index('dist')
        workspace_root = '/'.join(parts[:dist_index])  # Everything before 'dist'
    else:
        # Running from workspace root or as script
        workspace_root = app_path
    
    # Ensure data directory exists
    data_dir = os.path.join(workspace_root, 'data')
    os.makedirs(data_dir, exist_ok=True)
    
    return data_dir

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

def load_settings() -> Dict[str, Any]:
    """Load settings from unified_card_settings.json in dist/ folder."""
    app_path = get_app_path()
    
    # Determine workspace root (same logic as get_data_dir)
    parts = app_path.replace('\\', '/').split('/')
    if 'dist' in parts:
        dist_index = parts.index('dist')
        workspace_root = '/'.join(parts[:dist_index])
    else:
        workspace_root = app_path
    
    # Always use settings from workspace_root/dist/
    dist_dir = os.path.join(workspace_root, 'dist')
    settings_path = os.path.join(dist_dir, 'unified_card_settings.json')
    
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
            print(f"Error loading unified_card_settings.json: {e}")
            print("Using default settings.")
            return DEFAULT_SETTINGS.copy()
    else:
        print(f"Settings file not found. Creating new file with defaults.")
        with open(settings_path, 'w', encoding='utf-8') as f:
            json.dump(DEFAULT_SETTINGS, f, indent=4)
        print(f"Created default unified_card_settings.json at {settings_path}")
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
    # ASC (Scarlet ex) is newer than MEG (Scarlet & Violet base), so ASC has higher priority
    SET_ORDER = {
        'PRE': 102, 'SFA': 101, 'ASC': 101, 'MEG': 100, 'MEP': 99, 'SP': 99, 'SVE': 98,
        'SCR': 98, 'SSH': 97, 'MEW': 96, 'BLK': 95, 'SSP': 94, 'SVI': 93, 'TEF': 92,
        'TWM': 91, 'PAR': 90, 'PAF': 89, 'PAL': 89, 'OBF': 88, 'PR-SW': 87, 'SVP': 86,
        'CRZ': 85, 'SIT': 84, 'LOR': 83, 'PGO': 82, 'ASR': 81, 'BRS': 80, 'FST': 79,
        'CEL': 78, 'EVS': 77, 'CRE': 76, 'BST': 75, 'SHF': 74, 'VIV': 73, 'CPA': 72,
        'DAA': 71, 'RCL': 70, 'MP1': 50, 'M3': 20, 'MC': 15, 'JTG': 10, 'PFL': 5, 'DRI': 2
    }
    
    def __init__(self, csv_path: str):
        self.csv_path = csv_path
        self.cards: Dict[str, List[Dict[str, str]]] = {}  # name -> list of card variants
        self.english_set_codes: set = set()  # Cache of English set codes from limitlesstcg.com/cards
        self.load_database()
        self.load_english_set_codes()
    
    def load_english_set_codes(self):
        """Load list of English set codes from limitlesstcg.com/cards."""
        try:
            print("[DEBUG] Loading English set codes from limitlesstcg.com/cards...")
            url = "https://limitlesstcg.com/cards"
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            
            with urllib.request.urlopen(req, timeout=10) as response:
                html = response.read().decode('utf-8')
            
            # Find all set codes in the HTML (they appear as data-set="XXX" or in URLs like /cards/XXX)
            set_pattern = r'(?:data-set="|/cards/)([A-Z0-9]{2,5})(?:"|/|\s)'
            matches = re.findall(set_pattern, html)
            self.english_set_codes = set(matches)
            
            print(f"[DEBUG] Loaded {len(self.english_set_codes)} English set codes: {sorted(self.english_set_codes)}")
        except Exception as e:
            print(f"[DEBUG] Failed to load English set codes: {e}")
            # Fallback: hardcode known English sets
            self.english_set_codes = {
                'PRE', 'SFA', 'ASC', 'MEG', 'MEP', 'SP', 'SVE', 'SCR', 'SSH', 
                'MEW', 'BLK', 'SSP', 'SVI', 'TEF', 'TWM', 'PAR', 'PAF', 'PAL', 
                'OBF', 'SVP', 'CRZ', 'SIT', 'LOR', 'PGO', 'ASR', 'BRS', 'FST', 
                'CEL', 'EVS', 'CRE', 'BST', 'SHF', 'VIV', 'CPA', 'DAA', 'RCL'
            }
            print(f"[DEBUG] Using fallback English set codes: {len(self.english_set_codes)} sets")
    
    def is_japanese_set(self, set_code: str) -> bool:
        """Check if set code is Japanese (not in English set list)."""
        return set_code.upper() not in self.english_set_codes
    
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
            print(f"⚠️  Warning: Card database not found at {self.csv_path}")
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
                        'card_type': row.get('card_type', row.get('Card Type', '')) or row.get('type', row.get('Type', 'Pokemon'))
                    }
                    
                    if normalized not in self.cards:
                        self.cards[normalized] = []
                    self.cards[normalized].append(card_info)
                    count += 1
                
                print(f"Loaded {count} cards from database ({len(self.cards)} unique names)")
        except Exception as e:
            print(f"Error loading card database: {e}")
    
    def is_card_trainer_or_energy(self, variants: List[Dict[str, str]]) -> bool:
        """Check if this card is a Trainer or Energy card based on type/card_type from database."""
        if not variants:
            return False
        # Check the first variant - they should all be same type
        card_type = variants[0].get('card_type', '') or variants[0].get('type', '')
        card_type_lower = card_type.lower()
        return 'trainer' in card_type_lower or 'supporter' in card_type_lower or 'energy' in card_type_lower or 'stadium' in card_type_lower or 'tool' in card_type_lower

    def is_card_trainer_or_energy_by_name(self, card_name: str) -> bool:
        """Check if a card (by name) is a Trainer or Energy card."""
        normalized = self.normalize_name(card_name)
        if normalized in self.cards:
            return self.is_card_trainer_or_energy(self.cards[normalized])
        return False
    
    def get_latest_low_rarity_version(self, card_name: str) -> Optional[Any]:
        """
        Get the latest LOW RARITY version of a Trainer/Energy card.
        Returns a CardInfo object with set_code, number, rarity, etc.
        
        For Basic Energy: Force SVE set (17-25)
        For Trainer/Energy cards: Filter to LOW RARITY only (Common, Uncommon, Promo),
        then select NEWEST set from those low-rarity versions.
        """
        normalized = self.normalize_name(card_name)
        
        # Force SVE for basic energies
        basic_energy_map = {
            'grass energy': ('SVE', '17'),
            'fire energy': ('SVE', '18'),
            'water energy': ('SVE', '19'),
            'lightning energy': ('SVE', '20'),
            'psychic energy': ('SVE', '21'),
            'fighting energy': ('SVE', '22'),
            'darkness energy': ('SVE', '23'),
            'metal energy': ('SVE', '24'),
            'fairy energy': ('SVE', '25')
        }
        
        if normalized in basic_energy_map:
            set_code, set_number = basic_energy_map[normalized]
            class CardInfo:
                def __init__(self):
                    self.name = card_name
                    self.set_code = set_code
                    self.number = set_number
                    self.rarity = 'Basic Energy'
                    self.supertype = 'Energy'
            return CardInfo()
        
        if normalized not in self.cards:
            return None
        
        variants = self.cards[normalized]
        
        # Define LOW RARITY values
        LOW_RARITIES = {'Common', 'Uncommon', 'Promo'}
        
        # Filter to only LOW RARITY variants
        low_rarity_variants = [v for v in variants if v.get('rarity', '') in LOW_RARITIES]
        
        # If no low rarity version exists, fallback to ANY rarity (prefer newest set)
        if not low_rarity_variants:
            print(f"[DEBUG] No low-rarity version for '{card_name}', using any rarity")
            low_rarity_variants = variants  # Use all variants as fallback
        
        # Find the NEWEST set among available variants
        best_card = None
        best_set_order = -1
        
        for variant in low_rarity_variants:
            set_code = variant.get('set_code', '')
            set_order = self.SET_ORDER.get(set_code, 0)
            
            if set_order > best_set_order:
                best_card = variant
                best_set_order = set_order
        
        if not best_card:
            return None
        
        # Return a CardInfo-like object
        class CardInfo:
            def __init__(self, data):
                self.name = data.get('name', '')
                self.set_code = data.get('set_code', '')
                self.number = data.get('set_number', '')
                self.rarity = data.get('rarity', '')
                self.supertype = data.get('card_type', '') or data.get('type', '')
        
        return CardInfo(best_card)
    
    def lookup_card(self, card_name: str) -> Optional[Any]:
        """
        Lookup card in database and return CardInfo object with supertype, set_code, etc.
        Used for determining card type (Pokemon vs Trainer vs Energy).
        """
        normalized = self.normalize_name(card_name)
        
        if normalized not in self.cards:
            return None
        
        variants = self.cards[normalized]
        if not variants:
            return None
        
        # Return first variant as CardInfo object
        class CardInfo:
            def __init__(self, data):
                self.name = data.get('name', '')
                self.set_code = data.get('set_code', '')
                self.number = data.get('set_number', '')
                self.rarity = data.get('rarity', '')
                card_type = data.get('card_type', '') or data.get('type', '')
                # Normalize supertype
                if 'pokemon' in card_type.lower() or card_type == '':
                    self.supertype = 'Pokémon'
                elif 'energy' in card_type.lower():
                    self.supertype = 'Energy'
                elif any(x in card_type.lower() for x in ['trainer', 'supporter', 'item', 'tool', 'stadium']):
                    self.supertype = 'Trainer'
                else:
                    self.supertype = 'Pokémon'  # Default
        
        return CardInfo(variants[0])

    def generate_limitless_image_url(self, set_code: str, card_number: str, rarity: str) -> str:
        """Generate Limitless CDN image URL for EN or JP cards."""
        set_code = set_code.upper()
        card_number_raw = card_number.replace('-', '_')
        card_number_no_pad = card_number_raw.lstrip('0') or '0'
        card_number_padded = card_number_no_pad.zfill(3)
        rarity_short = 'R'
        
        # Check if Japanese set
        is_japanese = self.is_japanese_set(set_code)
        
        if is_japanese:
            # Japanese card: use /tpc/, _JP_, NO padding (41 bleibt 41, nicht 041)
            url = (
                f"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/"
                f"{set_code}/{set_code}_{card_number_no_pad}_{rarity_short}_JP_LG.png"
            )
            print(f"[DEBUG] Japanese card detected: {set_code} {card_number} -> {url}")
        else:
            # English card: use /tpci/, _EN_, WITH padding (41 wird 041)
            url = (
                f"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/"
                f"{set_code}/{set_code}_{card_number_padded}_{rarity_short}_EN_LG.png"
            )
        
        return url
    
    def get_card_info(self, card_name: str) -> Optional[Dict[str, str]]:
        """Get card info with proper handling of basic energies."""
        # Force SVE EN variant for standard basic energies
        basic_energy_map = {
            'grass energy': ('SVE', '17'),
            'fire energy': ('SVE', '18'),
            'water energy': ('SVE', '19'),
            'lightning energy': ('SVE', '20'),
            'psychic energy': ('SVE', '21'),
            'fighting energy': ('SVE', '22'),
            'darkness energy': ('SVE', '23'),
            'metal energy': ('SVE', '24'),
            'fairy energy': ('SVE', '25')  # Added for completeness
        }
        norm_name = self.normalize_name(card_name)
        if norm_name in basic_energy_map:
            set_code, set_number = basic_energy_map[norm_name]
            rarity = 'Basic Energy'
            image_url = self.generate_limitless_image_url(set_code, set_number, rarity)
            return {
                'set_code': set_code,
                'set_name': 'SVE',
                'number': set_number,
                'rarity': rarity,
                'type': 'Energy',
                'image_url': image_url
            }
        """Get card info.
        
        For Trainer/Energy cards: Use NEWEST set (ASC > MEG > BRS...) regardless of rarity
        For Pokemon cards: Use LOWEST rarity (Common > Uncommon) regardless of set
        """
        normalized = self.normalize_name(card_name)
        
        # Try exact match first
        if normalized in self.cards:
            variants = self.cards[normalized]
            # Prefer EN variant if available
            en_variant = None
            jp_variant = None
            for variant in variants:
                set_code = variant.get('set_code', '').upper()
                # EN cards: set_code is not MC, not a pure number, not JP-only
                if set_code and not set_code.startswith('MC') and not set_code.isdigit():
                    en_variant = variant
                    break
                # MC or numeric set_code is JP
                if set_code.startswith('MC') or set_code.isdigit():
                    jp_variant = variant
            best_card = en_variant if en_variant else jp_variant if jp_variant else variants[0]
            image_url = self.generate_limitless_image_url(
                best_card['set_code'],
                best_card['set_number'],
                best_card['rarity']
            )
            return {
                'set_code': best_card['set_code'],
                'set_name': '',  # Not in CSV
                'number': best_card['set_number'],
                'rarity': best_card['rarity'],
                'type': best_card.get('type', ''),
                'image_url': image_url
            }
        
        # Try partial match (for cards with ex/V suffixes or truncated names)
        # First try: cards where input is contained in database name
        for db_name, variants in self.cards.items():
            if normalized in db_name:
                # Determine if this is a Trainer/Energy card
                is_trainer_energy = self.is_card_trainer_or_energy(variants)
                
                best_card = None
                best_priority = 999
                best_set_order = -1
                
                for variant in variants:
                    set_order = self.SET_ORDER.get(variant['set_code'], 0)
                    
                    if is_trainer_energy:
                        # For Trainer/Energy: Prefer NEWEST set only
                        if set_order > best_set_order:
                            best_card = variant
                            best_set_order = set_order
                    else:
                        # For Pokemon: Prefer LOWEST rarity, then NEWEST set
                        rarity = variant['rarity']
                        priority = self.RARITY_PRIORITY.get(rarity, 50)
                        if priority < best_priority or (priority == best_priority and set_order > best_set_order):
                            best_card = variant
                            best_priority = priority
                            best_set_order = set_order
                
                if best_card:
                    image_url = self.generate_limitless_image_url(
                        best_card['set_code'],
                        best_card['set_number'],
                        best_card['rarity']
                    )
                    
                    return {
                        'set_code': best_card['set_code'],
                        'set_name': '',
                        'number': best_card['set_number'],
                        'rarity': best_card['rarity'],
                        'type': best_card.get('type', ''),
                        'image_url': image_url
                    }
        
        # Second try: database name is contained in input (for cases where scraped name is longer)
        for db_name, variants in self.cards.items():
            if db_name in normalized and len(db_name) > 3:  # Only if db_name is meaningful length
                # Determine if this is a Trainer/Energy card
                is_trainer_energy = self.is_card_trainer_or_energy(variants)
                
                best_card = None
                best_priority = 999
                best_set_order = -1
                
                for variant in variants:
                    set_order = self.SET_ORDER.get(variant['set_code'], 0)
                    
                    if is_trainer_energy:
                        # For Trainer/Energy: Prefer NEWEST set only
                        if set_order > best_set_order:
                            best_card = variant
                            best_set_order = set_order
                    else:
                        # For Pokemon: Prefer LOWEST rarity, then NEWEST set
                        rarity = variant['rarity']
                        priority = self.RARITY_PRIORITY.get(rarity, 50)
                        if priority < best_priority or (priority == best_priority and set_order > best_set_order):
                            best_card = variant
                            best_priority = priority
                            best_set_order = set_order
                
                if best_card:
                    image_url = self.generate_limitless_image_url(
                        best_card['set_code'],
                        best_card['set_number'],
                        best_card['rarity']
                    )
                    
                    return {
                        'set_code': best_card['set_code'],
                        'set_name': '',
                        'number': best_card['set_number'],
                        'rarity': best_card['rarity'],
                        'type': best_card.get('type', ''),
                        'image_url': image_url
                    }
        
        return None
    
    def get_card_info_by_set_number(self, card_name: str, set_code: str, card_number: str) -> Optional[Dict[str, str]]:
        """Get card info for a specific set and number.
        
        For Pokemon cards: Return the exact card from the specified set/number
        For Trainer/Energy: Return the exact card from the specified set/number
        
        This preserves the original card selection from the source (Limitless/Tournament)
        without re-selecting based on rarity or set order.
        """
        # Normalize card name for lookup
        normalized = self.normalize_name(card_name)
        
        if normalized not in self.cards:
            return None
        
        variants = self.cards[normalized]
        
        # Find the exact variant matching the set and number
        for variant in variants:
            if variant['set_code'] == set_code and variant['set_number'] == card_number:
                image_url = self.generate_limitless_image_url(set_code, card_number, variant['rarity'])
                return {
                    'set_code': variant['set_code'],
                    'set_name': '',
                    'number': variant['set_number'],
                    'rarity': variant['rarity'],
                    'type': variant.get('type', ''),
                    'image_url': image_url
                }
        
        return None
    
    def get_name_by_set_number(self, set_code: str, card_number: str) -> Optional[str]:
        """Lookup card name by set code and number."""
        if not set_code or not card_number:
            return None

        normalized_set = set_code.strip().upper()
        normalized_number = card_number.strip().lstrip('0') or card_number.strip()
        
        # Search through all cards for matching set+number
        for db_name, variants in self.cards.items():
            for variant in variants:
                variant_set = (variant['set_code'] or '').strip().upper()
                variant_number = (variant['set_number'] or '').strip()
                variant_number_norm = variant_number.lstrip('0') or variant_number

                if variant_set == normalized_set and (
                    variant_number == card_number.strip() or variant_number_norm == normalized_number
                ):
                    return variant['name']
        
        return None

def normalize_archetype_name(archetype: str) -> str:
    """Normalize archetype names to consistent Title Case format.
    
    This ensures "alakazam dragapult", "Alakazam Dragapult", and "ALAKAZAM DRAGAPULT" 
    all become "Alakazam Dragapult" for consistency.
    """
    name = archetype.strip()
    
    # Convert to Title Case (first letter of each word capitalized)
    name = name.title()
    
    # ONLY remove single-letter prefixes that are trainer names (N's Zoroark)
    name = re.sub(r'^N\s+', '', name, flags=re.IGNORECASE)   # "N Zoroark" -> "Zoroark"
    name = re.sub(r'^Ns\s+', '', name, flags=re.IGNORECASE)  # "Ns Zoroark" -> "Zoroark"
    
    # Move "-Mega" suffix to "Mega " prefix for each Pokemon
    # "Abomasnow-Mega" → "Mega Abomasnow"
    # "Absol-Mega Kangaskhan-Mega" → "Mega Absol Mega Kangaskhan"
    name = re.sub(r'(\w+)-Mega\b', r'Mega \1', name, flags=re.IGNORECASE)
    
    # DO NOT remove Ex/V/Vstar/Vmax - these are important variant markers
    # DO NOT remove 3-letter words - could be partner Pokemon names (Meg = Mega Diance)
    
    return name.strip()

# ============================================================================
# CARD INFO LOOKUP
# Note: Card database (CardDatabaseLookup) is now the primary method for
# card lookups. The old Pokemon TCG API integration has been removed.
# ============================================================================

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

def scrape_city_league(settings: Dict[str, Any], card_db: CardDatabaseLookup) -> List[Dict[str, Any]]:
    """Scrape City League tournament data from HTML structure."""
    print("\n" + "="*60)
    print("SCRAPING CITY LEAGUE DATA (HTML Structure Method)")
    print("="*60)
    
    config = settings.get('sources', {}).get('city_league', {})
    
    if not config.get('enabled', False):
        print("City League disabled in settings - skipping")
        return []
    
    all_decks = []
    
    try:
        start_date_str = config.get('start_date', '24.01.2026')
        end_date_str = config.get('end_date', 'auto')
        max_decklists = config.get('max_decklists_per_league', 16)
        
        print(f"Date range: {start_date_str} to {end_date_str}")
        print(f"Max decklists per league: {max_decklists}")
        
        # Calculate date range
        start_date, end_date = calculate_date_range(start_date_str, end_date_str)
        
        # Parse dates
        from datetime import datetime
        start_dt = datetime.strptime(start_date, "%d.%m.%Y")
        end_dt = datetime.strptime(end_date, "%d.%m.%Y")
        
        # Try to use city_league_module if available
        if _city_league_available and city_league_module:
            print("Fetching City League tournaments...")
            tournaments = city_league_module.get_tournaments_in_date_range(
                "jp", start_dt, end_dt, 1.5
            )
            print(f"Found {len(tournaments)} tournaments")
            
            if not tournaments:
                print("No tournaments found")
                return []
            
            processed_count = 0
            delay = settings.get('delay_between_requests', 1.0)
            import html as html_module
            
            for i, tournament in enumerate(tournaments, 1):
                if i % 20 == 1:
                    print(f"  Processing tournaments {i}-{min(i+19, len(tournaments))}...")
                
                try:
                    tournament_url = tournament.get('url', '')
                    if not tournament_url:
                        continue
                    
                    # Fetch tournament page HTML
                    html = fetch_page(tournament_url)
                    if not html:
                        continue
                    
                    # Debug: Show table structure (only for first tournament)
                    if i == 1:
                        print(f"    [DEBUG] Tournament URL: {tournament_url}")
                        print(f"    [DEBUG] HTML length: {len(html)} chars")
                        # Find table with rankings
                        table_match = re.search(r'<table[^>]*>(.*?)</table>', html, re.DOTALL | re.IGNORECASE)
                        if table_match:
                            print(f"    [DEBUG] Found table, length: {len(table_match.group(1))} chars")
                            # Show ALL rows to understand structure
                            all_rows = re.findall(r'<tr[^>]*>(.*?)</tr>', table_match.group(1), re.DOTALL)
                            print(f"    [DEBUG] Total rows found: {len(all_rows)}")
                            # Show first 3 rows (header + 2 data rows)
                            for idx, row_content in enumerate(all_rows[:3], 1):
                                print(f"    [DEBUG] Row {idx} sample: {row_content[:400]}")
                        else:
                            print(f"    [DEBUG] No table found in HTML")
                    
                    # Parse table rows to extract deck links
                    # Structure: Each row has rank, deck images, and link to decklist
                    # Links are in format: /decks/list/jp/XXXXX
                    list_links = []
                    deck_names = []
                    
                    # Find all table rows (skip header row)
                    rows = re.findall(r'<tr[^>]*>(.*?)</tr>', html, re.DOTALL | re.IGNORECASE)
                    
                    for row in rows:
                        # Skip header rows
                        if '<th' in row.lower():
                            continue
                        
                        # Extract deck name from img alt tags
                        # Format: <img class="pokemon" ... alt="barbaracle"><img ... alt="okidogi">
                        img_alts = re.findall(r'<img[^>]+class="pokemon"[^>]+alt="([^"]+)"', row, re.IGNORECASE)
                        if img_alts:
                            deck_name = ' '.join(word.title() for word in img_alts)
                        else:
                            deck_name = "Unknown"
                        
                        # Extract link to decklist
                        # Format: <a href="https://limitlesstcg.com/decks/list/jp/60595"> OR <a href="/decks/list/jp/60595">
                        link_match = re.search(r'<a[^>]+href="(?:https://limitlesstcg\.com)?(/decks/list/jp/\d+)"', row)
                        if link_match:
                            list_url = link_match.group(1)
                            list_links.append(list_url)
                            deck_names.append(deck_name)
                    
                    if not list_links:
                        if i <= 3:
                            print(f"    [DEBUG] No deck list links found in table rows")
                        continue
                    
                    # Limit to max_decklists
                    list_links = list_links[:max_decklists]
                    deck_names = deck_names[:max_decklists]
                    
                    if i == 1:
                        print(f"    [DEBUG] Found {len(list_links)} deck list links")
                        if list_links:
                            print(f"    [DEBUG] First link: {list_links[0]}")
                            print(f"    [DEBUG] First deck name: {deck_names[0]}")
                    
                    decks_in_tournament = 0
                    
                    for list_url_suffix, deck_name in zip(list_links, deck_names):
                        # Build absolute URL (handle both relative and absolute paths)
                        if list_url_suffix.startswith('http'):
                            deck_url = list_url_suffix
                        else:
                            deck_url = f"https://limitlesstcg.com{list_url_suffix}"
                        
                        try:
                            deck_html = fetch_page(deck_url)
                            if not deck_html:
                                continue
                            
                            # Deck name already extracted from tournament table
                            # No need to re-extract from decklist page
                            
                            # Extract Pokemon cards from <div class="decklist-column"><div class="decklist-column-heading">Pokémon
                            cards = []
                            
                            # Pokemon section
                            pokemon_section = re.search(
                                r'<div class="decklist-column-heading">Pokémon[^<]*</div>(.*?)(?=<div class="decklist-column-heading"|$)',
                                deck_html,
                                re.DOTALL | re.IGNORECASE
                            )
                            
                            if not pokemon_section:
                                if i == 1:
                                    print(f"      [DEBUG] No Pokemon section found in deck {deck_url}")
                                continue
                            
                            if pokemon_section:
                                pokemon_cards = re.findall(
                                    r'<div[^>]+class="decklist-card"[^>]+data-set="([^"]+)"[^>]+data-number="([^"]+)"[^>]*>.*?<span class="card-count">([^<]+)</span>\s*<span class="card-name">([^<]+)</span>',
                                    pokemon_section.group(1),
                                    re.DOTALL | re.IGNORECASE
                                )
                                
                                for set_code, set_number, count, card_name in pokemon_cards:
                                    cards.append({
                                        'name': card_name.strip(),
                                        'count': int(float(count)),
                                        'set_code': set_code.strip(),
                                        'set_number': set_number.strip()
                                    })
                            
                            # Trainer section
                            trainer_section = re.search(
                                r'<div class="decklist-column-heading">Trainer[^<]*</div>(.*?)(?=<div class="decklist-column-heading"|$)',
                                deck_html,
                                re.DOTALL | re.IGNORECASE
                            )
                            
                            if trainer_section:
                                trainer_cards = re.findall(
                                    r'<div[^>]+class="decklist-card"[^>]*>.*?<span class="card-count">([^<]+)</span>\s*<span class="card-name">([^<]+)</span>',
                                    trainer_section.group(1),
                                    re.DOTALL | re.IGNORECASE
                                )
                                
                                for count, card_name in trainer_cards:
                                    card_name = card_name.strip()
                                    # Get low-rarity version from database
                                    latest_card = card_db.get_latest_low_rarity_version(card_name)
                                    if latest_card:
                                        cards.append({
                                            'name': card_name,
                                            'count': int(float(count)),
                                            'set_code': latest_card.set_code,
                                            'set_number': latest_card.number
                                        })
                            
                            # Energy section
                            energy_section = re.search(
                                r'<div class="decklist-column-heading">Energy[^<]*</div>(.*?)(?=<div class="decklist-column"|$)',
                                deck_html,
                                re.DOTALL | re.IGNORECASE
                            )
                            
                            if energy_section:
                                energy_cards = re.findall(
                                    r'<div[^>]+class="decklist-card"[^>]*>.*?<span class="card-count">([^<]+)</span>\s*<span class="card-name">([^<]+)</span>',
                                    energy_section.group(1),
                                    re.DOTALL | re.IGNORECASE
                                )
                                
                                for count, card_name in energy_cards:
                                    card_name = card_name.strip()
                                    norm_name = card_db.normalize_name(card_name)
                                    basic_energies = ['grass energy', 'fire energy', 'water energy', 'lightning energy',
                                                    'psychic energy', 'fighting energy', 'darkness energy', 'metal energy', 'fairy energy']
                                    
                                    if norm_name in basic_energies:
                                        # Force SVE set
                                        basic_energy_map = {
                                            'grass energy': '17', 'fire energy': '18', 'water energy': '19',
                                            'lightning energy': '20', 'psychic energy': '21', 'fighting energy': '22',
                                            'darkness energy': '23', 'metal energy': '24', 'fairy energy': '25'
                                        }
                                        cards.append({
                                            'name': card_name,
                                            'count': int(float(count)),
                                            'set_code': 'SVE',
                                            'set_number': basic_energy_map[norm_name]
                                        })
                                    else:
                                        # Get low-rarity version
                                        latest_card = card_db.get_latest_low_rarity_version(card_name)
                                        if latest_card:
                                            cards.append({
                                                'name': card_name,
                                                'count': int(float(count)),
                                                'set_code': latest_card.set_code,
                                                'set_number': latest_card.number
                                            })
                            
                            # Validate deck has exactly 60 cards
                            total_cards = sum(card['count'] for card in cards)
                            
                            if cards and total_cards == 60:
                                all_decks.append({
                                    'archetype': normalize_archetype_name(deck_name),
                                    'cards': cards,
                                    'source': 'City League'
                                })
                                decks_in_tournament += 1
                            elif cards:
                                print(f"      ⚠️ WARNUNG: Deck '{deck_name}' hat {total_cards} statt 60 Karten - übersprungen")
                                if i == 1:
                                    print(f"      [DEBUG] Karten: Pokemon={sum(1 for c in cards if any(x in str(c.get('set_code','')).upper() for x in ['TWM','MEG','PAL','SVI']))}, "
                                          f"Trainer={sum(1 for c in cards if not any(x in str(c.get('set_code','')).upper() for x in ['TWM','MEG','PAL','SVI']) and 'energy' not in c.get('name','').lower())}, "
                                          f"Energy={sum(1 for c in cards if 'energy' in c.get('name','').lower())}")
                            
                            time.sleep(0.3)
                        
                        except Exception as deck_error:
                            continue
                    
                    if decks_in_tournament > 0:
                        print(f"    Extracted {decks_in_tournament} decklists")
                    processed_count += decks_in_tournament
                    
                    time.sleep(delay)
                    
                except Exception as tournament_error:
                    continue
            
            print(f"✓ Collected {processed_count} complete decks from City League")
        
        else:
            print("City League module not available - skipping")
        
    except Exception as e:
        if 'charmap' not in str(e).lower():
            print(f"Error scraping City League: {e}")
    
    return all_decks

# ============================================================================
# LIMITLESS ONLINE SCRAPER
# ============================================================================

def parse_copy_button_decklist(copy_text: str, card_db: CardDatabaseLookup) -> List[Dict[str, Any]]:
    """Parse decklist from 'Copy to Clipboard' button format.
    
    Format:
    Pokémon: 21
    4 Dreepy TWM 128
    4 Drakloak TWM 129
    ...
    Trainer: 32
    4 Lillie's Determination MEG 119
    ...
    Energy: 7
    3 Luminous Energy PAL 191
    1 Fire Energy MEE 2
    
    Pokemon: Keep original set+number from copy button
    Trainer/Energy: Database lookup for low-rarity version (Common/Uncommon)
    Basic Energy: Force SVE set
    """
    cards = []
    lines = copy_text.strip().split('\n')
    
    for line in lines:
        line = line.strip()
        if not line or ':' in line and not any(char.isdigit() for char in line.split(':')[0]):
            # Skip section headers like "Pokémon: 21"
            continue
        
        # Parse format: "4 Card Name SET 123"
        match = re.match(r'^(\d+)\s+(.+?)\s+([A-Z0-9]+)\s+(\d+)$', line)
        if match:
            count = int(match.group(1))
            card_name = match.group(2).strip()
            set_code = match.group(3).strip()
            set_number = match.group(4).strip()
            
            # Check if basic energy
            norm_name = card_db.normalize_name(card_name)
            basic_energies = ['grass energy', 'fire energy', 'water energy', 'lightning energy',
                            'psychic energy', 'fighting energy', 'darkness energy', 'metal energy', 'fairy energy']
            
            if norm_name in basic_energies:
                # Force SVE set for basic energies
                basic_energy_map = {
                    'grass energy': '17', 'fire energy': '18', 'water energy': '19',
                    'lightning energy': '20', 'psychic energy': '21', 'fighting energy': '22',
                    'darkness energy': '23', 'metal energy': '24', 'fairy energy': '25'
                }
                cards.append({
                    'name': card_name,
                    'count': count,
                    'set_code': 'SVE',
                    'set_number': basic_energy_map[norm_name]
                })
            else:
                # Check card type
                db_card = card_db.lookup_card(card_name)
                
                if db_card and db_card.supertype == 'Pokémon':
                    # Pokemon: Keep original set+number from copy button
                    cards.append({
                        'name': card_name,
                        'count': count,
                        'set_code': set_code,
                        'set_number': set_number
                    })
                else:
                    # Trainer/Energy: Get low-rarity version from database
                    latest_card = card_db.get_latest_low_rarity_version(card_name)
                    if latest_card:
                        cards.append({
                            'name': card_name,
                            'count': count,
                            'set_code': latest_card.set_code,
                            'set_number': latest_card.number
                        })
                    else:
                        # Fallback: Keep original if no low-rarity found
                        cards.append({
                            'name': card_name,
                            'count': count,
                            'set_code': set_code,
                            'set_number': set_number
                        })
    
    return cards

def scrape_limitless_online(settings: Dict[str, Any], card_db: CardDatabaseLookup) -> List[Dict[str, Any]]:
    """Scrape Limitless Online deck data from HTML structure."""
    print("\n" + "="*60)
    print("SCRAPING LIMITLESS ONLINE DATA (HTML Structure Method)")
    print("="*60)
    
    config = settings.get('sources', {}).get('limitless_online', {})
    
    if not config.get('enabled', False):
        print("Limitless Online disabled in settings - skipping")
        return []
    
    try:
        # Use config values directly
        format_filter = config.get('format_filter', 'PFL')
        max_decks = config.get('max_decks', 10)
        max_lists_per_deck = config.get('max_lists_per_deck', 3)
        delay = settings.get('delay_between_requests', 1.0)
        
        # Start at main decks page
        decks_url = f"https://play.limitlesstcg.com/decks?game=PTCG"
        print(f"Fetching decks page: {decks_url}")
        
        html = fetch_page(decks_url)
        if not html:
            print("Failed to fetch decks page")
            return []
        
        # Extract deck links from <a href="/decks/dragapult-dusknoir?format=standard&rotation=2025&set=PFL">
        deck_pattern = re.compile(
            r'<a href="(/decks/([^"?]+)\?[^"]*set=' + re.escape(format_filter) + r'[^"]*)">',
            re.IGNORECASE
        )
        deck_matches = deck_pattern.findall(html)
        
        if not deck_matches:
            print(f"No decks found with filter: {format_filter}")
            return []
        
        # Extract unique deck slugs - FILTER OUT /matchups pages!
        seen_slugs = set()
        deck_links = []
        for full_href, slug in deck_matches:
            # Skip matchups/statistics pages - they have no decklists
            if '/matchups' in full_href.lower() or slug.endswith('/matchups'):
                continue
            if slug not in seen_slugs:
                seen_slugs.add(slug)
                deck_links.append((slug, full_href))
        
        deck_links = deck_links[:max_decks]
        print(f"Found {len(deck_links)} decks to scrape (filtered out matchups pages)")
        
        all_decks = []
        import html as html_module
        
        for idx, (deck_slug, deck_href) in enumerate(deck_links, 1):
            # Build deck name from slug
            deck_name = ' '.join(word.title() for word in deck_slug.split('-'))
            print(f"\n[{idx}/{len(deck_links)}] Processing {deck_name}...")
            
            try:
                deck_url = f"https://play.limitlesstcg.com{deck_href}"
                deck_html = fetch_page(deck_url)
                if not deck_html:
                    print(f"  Failed to fetch deck page")
                    continue
                
                # Extract deck name from <div class="name">...</div>
                name_match = re.search(r'<div class="name">([^<]+)</div>', deck_html, re.IGNORECASE)
                if name_match:
                    deck_name = name_match.group(1).strip()
                
                # Find list links: <a href="/tournament/.../player/.../decklist">
                list_pattern = re.compile(r'<a href="(/tournament/[^"]+/player/[^"]+/decklist)"', re.IGNORECASE)
                list_links = list_pattern.findall(deck_html)
                
                # Remove duplicates - get MORE than needed to handle empty/private lists
                unique_list_links = list(dict.fromkeys(list_links))
                
                if not unique_list_links:
                    print(f"  No deck lists found")
                    continue
                
                # Try up to 3x the target to find enough valid lists
                max_to_try = min(len(unique_list_links), max_lists_per_deck * 3)
                unique_list_links = unique_list_links[:max_to_try]
                
                print(f"  Found {len(unique_list_links)} deck list(s) available, extracting cards...")
                
                # Aggregate cards from multiple lists
                deck_cards_aggregated = {}
                successful_lists = 0
                
                for list_idx, list_href in enumerate(unique_list_links, 1):
                    # Stop if we already have enough successful lists
                    if successful_lists >= max_lists_per_deck:
                        break
                    list_url = f"https://play.limitlesstcg.com{list_href}"
                    
                    try:
                        list_html = fetch_page(list_url)
                        if not list_html:
                            continue
                        
                        cards = []
                        
                        # Debug: Check if page has expected structure
                        if list_idx == 1 and idx <= 2:
                            print(f"      [DEBUG] List URL: {list_url}")
                            print(f"      [DEBUG] HTML length: {len(list_html)} chars")
                            has_cards_div = '<div class="cards">' in list_html
                            has_heading = '<div class="heading">Pokémon' in list_html or '<div class="heading">Pokemon' in list_html
                            print(f"      [DEBUG] Has 'cards' div: {has_cards_div}")
                            print(f"      [DEBUG] Has Pokemon heading: {has_heading}")
                        
                        # Extract Pokemon: <div class="cards"><div class="heading">Pokémon (21)</div><p><a href=".../TWM/128">4 Dreepy (TWM-128)</a>
                        pokemon_match = re.search(
                            r'<div class="cards"><div class="heading">Pokémon[^<]*</div>(.*?)</div>',
                            list_html,
                            re.DOTALL | re.IGNORECASE
                        )
                        
                        if pokemon_match:
                            pokemon_links = re.findall(
                                r'<a href="[^"]+/([A-Z0-9]+)/(\d+)"[^>]*>(\d+)\s+([^(]+)\s*\([^)]+\)</a>',
                                pokemon_match.group(1)
                            )
                            
                            for set_code, set_number, count, card_name in pokemon_links:
                                cards.append({
                                    'name': card_name.strip(),
                                    'count': int(count),
                                    'set_code': set_code.strip(),
                                    'set_number': set_number.strip()
                                })
                        
                        # Extract Trainer: <div class="heading">Trainer (32)</div><p><a href="...">4 Lillie's Determination</a>
                        trainer_match = re.search(
                            r'<div class="heading">Trainer[^<]*</div>(.*?)</div>',
                            list_html,
                            re.DOTALL | re.IGNORECASE
                        )
                        
                        if trainer_match:
                            trainer_links = re.findall(
                                r'<a href="[^"]+"[^>]*>(\d+)\s+([^<]+)</a>',
                                trainer_match.group(1)
                            )
                            
                            for count, card_name in trainer_links:
                                card_name = card_name.strip()
                                # Get low-rarity version
                                latest_card = card_db.get_latest_low_rarity_version(card_name)
                                if latest_card:
                                    cards.append({
                                        'name': card_name,
                                        'count': int(count),
                                        'set_code': latest_card.set_code,
                                        'set_number': latest_card.number
                                    })
                        
                        # Extract Energy: <div class="heading">Energy (7)</div><p><a href="...">3 Luminous Energy</a>
                        energy_match = re.search(
                            r'<div class="heading">Energy[^<]*</div>(.*?)</div>',
                            list_html,
                            re.DOTALL | re.IGNORECASE
                        )
                        
                        if energy_match:
                            energy_links = re.findall(
                                r'<a href="[^"]+"[^>]*>(\d+)\s+([^<]+)</a>',
                                energy_match.group(1)
                            )
                            
                            for count, card_name in energy_links:
                                card_name = card_name.strip()
                                norm_name = card_db.normalize_name(card_name)
                                basic_energies = ['grass energy', 'fire energy', 'water energy', 'lightning energy',
                                                'psychic energy', 'fighting energy', 'darkness energy', 'metal energy', 'fairy energy']
                                
                                if norm_name in basic_energies:
                                    # Force SVE set
                                    basic_energy_map = {
                                        'grass energy': '17', 'fire energy': '18', 'water energy': '19',
                                        'lightning energy': '20', 'psychic energy': '21', 'fighting energy': '22',
                                        'darkness energy': '23', 'metal energy': '24', 'fairy energy': '25'
                                    }
                                    cards.append({
                                        'name': card_name,
                                        'count': int(count),
                                        'set_code': 'SVE',
                                        'set_number': basic_energy_map[norm_name]
                                    })
                                else:
                                    # Get low-rarity version
                                    latest_card = card_db.get_latest_low_rarity_version(card_name)
                                    if latest_card:
                                        cards.append({
                                            'name': card_name,
                                            'count': int(count),
                                            'set_code': latest_card.set_code,
                                            'set_number': latest_card.number
                                        })
                        
                        # If no cards extracted, try copy button format as fallback
                        if len(cards) == 0:
                            # Try to extract copy button text format
                            copy_match = re.search(
                                r'Pokémon:\s*\d+.*?Energy:\s*\d+',
                                list_html,
                                re.DOTALL | re.IGNORECASE
                            )
                            
                            if copy_match:
                                # Extract the full text block
                                copy_text = copy_match.group(0)
                                cards = parse_copy_button_decklist(copy_text, card_db)
                                if len(cards) > 0:
                                    print(f"      [DEBUG] Fallback to copy button format: extracted {len(cards)} cards")
                        
                        # Validate deck has exactly 60 cards before aggregating
                        total_cards = sum(card['count'] for card in cards)
                        if cards and total_cards != 60:
                            print(f"      ⚠️ WARNUNG: Liste hat {total_cards} statt 60 Karten - übersprungen")
                            continue
                        
                        # Aggregate cards
                        for card in cards:
                            card_name = card['name']
                            if card_name not in deck_cards_aggregated:
                                deck_cards_aggregated[card_name] = {
                                    'count': 0,
                                    'appearances': 0,
                                    'set_code': card['set_code'],
                                    'set_number': card['set_number']
                                }
                            deck_cards_aggregated[card_name]['count'] += card['count']
                            deck_cards_aggregated[card_name]['appearances'] += 1
                        
                        # Count as successful if we got cards
                        if len(cards) > 0:
                            successful_lists += 1
                            print(f"    [{successful_lists}/{max_lists_per_deck}] ✓ Extracted {len(cards)} cards")
                        else:
                            # Debug: Show HTML sample if still 0 cards extracted
                            print(f"    [Skipped - empty] List {list_idx}")
                            print(f"      [DEBUG] 0 cards extracted from {list_url}")
                            print(f"      [DEBUG] HTML length: {len(list_html)} chars")
                            # Show more context - search for any card-related content
                            if 'Pokémon:' in list_html or 'Pokemon:' in list_html:
                                print(f"      [DEBUG] Found 'Pokemon:' in HTML")
                                # Extract 1000 chars around Pokemon: for analysis
                                idx_pos = list_html.find('Pokémon:') if 'Pokémon:' in list_html else list_html.find('Pokemon:')
                                sample = list_html[max(0, idx_pos-100):min(len(list_html), idx_pos+900)]
                                print(f"      [DEBUG] Context around 'Pokemon:': {sample}")
                            else:
                                print(f"      [DEBUG] No 'Pokemon:' found in HTML - likely private/unpublished list")
                                # Show body content sample instead of head
                                body_start = list_html.find('<body')
                                if body_start > 0:
                                    print(f"      [DEBUG] Body sample (500 chars): {list_html[body_start:body_start+500]}")
                                else:
                                    print(f"      [DEBUG] HTML sample (first 500 chars): {list_html[:500]}")
                        
                        time.sleep(0.3)
                    
                    except Exception as e:
                        print(f"    [{list_idx}/{len(unique_list_links)}] Error: {e}")
                        continue
                
                # Average card counts
                final_cards = []
                for card_name, card_data in deck_cards_aggregated.items():
                    avg_count = round(card_data['count'] / card_data['appearances'])
                    final_cards.append({
                        'name': card_name,
                        'count': avg_count,
                        'set_code': card_data['set_code'],
                        'set_number': card_data['set_number']
                    })
                
                if final_cards:
                    all_decks.append({
                        'archetype': normalize_archetype_name(deck_name),
                        'source': 'limitless_online',
                        'cards': final_cards
                    })
                    print(f"  ✓ Aggregated {len(final_cards)} cards from {successful_lists} valid list(s)")
                else:
                    print(f"  ✗ No valid lists found for this deck (0/{max_lists_per_deck})")
                
                time.sleep(delay)
                
            except Exception as e:
                print(f"  Error processing deck: {e}")
                continue
        
        print(f"\n✓ Scraped {len(all_decks)} decks from Limitless Online")
        return all_decks
        
    except Exception as e:
        print(f"Error scraping Limitless Online: {e}")
        import traceback
        traceback.print_exc()
        return []

# ============================================================================
# TOURNAMENT SCRAPER
# ============================================================================

def get_tournament_links(base_url: str, max_tournaments: int) -> List[Dict[str, str]]:
    """Get tournament links from labs.limitlesstcg.com."""
    tournaments = []
    
    print(f"  Loading tournaments from {base_url}...")
    html = fetch_page(base_url)
    if not html:
        print(f"  [DEBUG] Failed to fetch {base_url}")
        return []
    
    # Extract tournament IDs from links like /0050/standings
    # Use simpler pattern that works better
    matches = re.findall(r'/(\d+)/standings', html)
    print(f"  [DEBUG] Found {len(matches)} tournament links in HTML")
    
    seen_ids = set()
    
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
    
    print(f"  Found {len(tournaments)} tournaments")
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
    
    # Find all decklist entries in standings
    # Pattern: <a href="/0050/decks/grimmsnarl-froslass">...<img class="pokemon" ... alt="grimmsnarl">...</a>
    # Extract both the player decklist link and the deck archetype link
    
    # Split into table rows
    rows = re.split(r'<tr[^>]*>', html, flags=re.IGNORECASE)
    
    for row in rows:
        # Look for player decklist link
        player_match = re.search(r'href="/' + re.escape(tournament_id) + r'/player/(\d+)/decklist"', row)
        if not player_match:
            continue
        
        player_id = player_match.group(1)
        
        # Look for deck archetype link in the same row
        # Pattern: <a href="/0050/decks/grimmsnarl-froslass">
        deck_match = re.search(r'href="/' + re.escape(tournament_id) + r'/decks/([^"]+)"', row)
        
        if deck_match:
            archetype_slug = deck_match.group(1)
            # Convert slug to archetype name: "grimmsnarl-froslass" -> "Grimmsnarl Froslass"
            archetype = slug_to_archetype(archetype_slug)
        else:
            # Try to extract from img alt attributes
            # Pattern: <img class="pokemon" ... alt="grimmsnarl">
            alt_matches = re.findall(r'<img[^>]+class="pokemon"[^>]+alt="([^"]+)"', row, re.IGNORECASE)
            if alt_matches:
                # Combine all pokemon names: ["grimmsnarl", "froslass"] -> "Grimmsnarl Froslass"
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

# Improved slug-to-archetype conversion
def slug_to_archetype(slug: str) -> str:
    """Convert deck slug to a readable archetype name with improved normalization."""
    # Remove common suffixes/prefixes, handle special cases
    slug = slug.strip().replace('_', '-')
    # Replace multiple dashes with single space
    slug = re.sub(r'-+', ' ', slug)
    # Remove trailing/leading spaces
    slug = slug.strip()
    # Title-case, but preserve EX, V, VMAX, etc.
    words = slug.split(' ')
    special = {'ex', 'gx', 'v', 'vmax', 'vstar', 'mega', 'tag', 'break', 'lv', 'lv.x', 'lvx', 'lv-x', 'star', 'dark', 'light', 'shiny', 'prism', 'basic', 'stage', 'baby', 'legend', 'dudunsparce', 'urshifu', 'rapid', 'single', 'fusion', 'arceus', 'mewtwo', 'alakazam', 'charizard', 'pikachu', 'eevee', 'gardevoir', 'rayquaza', 'kyogre', 'groudon', 'lugia', 'dialga', 'palkia', 'zacian', 'zamazenta', 'regieleki', 'regidrago', 'regigigas', 'regice', 'regirock', 'registeel', 'blastoise', 'venusaur', 'snorlax', 'mimikyu', 'dragapult', 'calyrex', 'shadow', 'ice', 'fire', 'water', 'grass', 'electric', 'psychic', 'fighting', 'darkness', 'metal', 'fairy', 'dragon', 'normal', 'poison', 'ground', 'rock', 'bug', 'ghost', 'steel', 'flying', 'ice', 'fire', 'water', 'grass', 'electric', 'psychic', 'fighting', 'darkness', 'metal', 'fairy', 'dragon', 'normal', 'poison', 'ground', 'rock', 'bug', 'ghost', 'steel', 'flying'}
    def smart_title(word):
        w = word.lower()
        if w in special:
            return word.upper() if w in {'ex', 'gx', 'v', 'vmax', 'vstar'} else word.title()
        return word.title()
    archetype = ' '.join(smart_title(w) for w in words)
    # Clean up extra spaces
    archetype = re.sub(r'\s+', ' ', archetype).strip()
    return archetype

def extract_cards_from_decklist(decklist_url: str, card_db: CardDatabaseLookup) -> List[Dict[str, Any]]:
    """Extract card data from a player's decklist page using copy button data."""
    html_content = fetch_page(decklist_url)
    if not html_content:
        return []

    # Try to find and extract copy button data
    # The copy button triggers export of text in format:
    # Pokémon: 21
    # 4 Dreepy TWM 128
    # ...
    
    # Look for the export/copy button and nearby text content
    # Pattern: Find sections with "Pokémon:" or similar headers
    copy_match = re.search(r'Pokémon:\s*\d+.*?Energy:\s*\d+.*?(?=<button|$)', html_content, re.DOTALL | re.IGNORECASE)
    
    if copy_match:
        copy_text = copy_match.group(0)
        # Clean HTML tags
        copy_text = re.sub(r'<[^>]+>', '\n', copy_text)
        import html as html_module
        copy_text = html_module.unescape(copy_text)
        
        # Parse using copy button parser
        cards = parse_copy_button_decklist(copy_text, card_db)
        if cards:
            return cards
    
    # Fallback: Try JSON approach
    cards: List[Dict] = []
    script_pattern = re.compile(r'<script[^>]*>(.*?)</script>', re.DOTALL)
    scripts = script_pattern.findall(html_content)
    
    for script in scripts:
        try:
            if 'pokemon' not in script.lower() and 'trainer' not in script.lower():
                continue
            
            data = json.loads(script)
            if 'body' not in data:
                continue
            
            body_data = json.loads(data['body'])
            if not body_data.get('ok') or 'message' not in body_data:
                continue
            
            message = body_data['message']
            
            # Extract cards and process with card database
            copy_lines = []
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
                        
                        # Build copy format line
                        copy_lines.append(f"{count} {name} {set_code} {card_number}")
                    except (ValueError, KeyError):
                        continue
            
            if copy_lines:
                copy_text = "Pokémon: 0\n" + "\n".join(copy_lines) + "\nTrainer: 0\nEnergy: 0"
                cards = parse_copy_button_decklist(copy_text, card_db)
                break
                
        except (json.JSONDecodeError, KeyError):
            continue
    
    return cards

def extract_cards_from_tournament(cards_url: str, card_db: CardDatabaseLookup, deck_name: Optional[str] = None) -> List[Dict[str, Any]]:
    """Extract card data from a tournament's cards page.
    
    Pokemon: Keep set+number from HTML data-set/data-number attributes
    Trainer/Energy: Extract name only, leave set/number empty for database lookup
    """
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

                # Check if this is a Pokemon or Trainer/Energy card
                db_card = card_db.lookup_card(name)
                is_pokemon = db_card and db_card.supertype == 'Pokémon'
                
                # Pokemon: Keep HTML set+number
                # Trainer/Energy: Leave set/number empty for later database lookup
                if is_pokemon:
                    set_code = set_code_raw if set_code_raw else ""
                    card_number = card_number_raw if card_number_raw else ""
                    if set_code == 'PR-SV':
                        set_code = 'SVP'
                    card_key = f"{name}|{set_code}|{card_number}".lower()
                else:
                    # Trainer/Energy: No set/number (will be looked up later from database)
                    set_code = ""
                    card_number = ""
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
                        if is_pokemon and existing_card.get('set_code') and existing_card.get('card_number'):
                            existing_key = f"{existing_card['name']}|{existing_card.get('set_code', '')}|{existing_card.get('card_number', '')}".lower()
                        else:
                            existing_key = existing_card['name'].lower()
                        
                        if existing_key == card_key:
                            existing_card['count'] += count
                            break
            except (ValueError, IndexError):
                continue

    return cards

def scrape_tournaments(settings: Dict[str, Any], card_db: CardDatabaseLookup) -> List[Dict[str, Any]]:
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
            
            # Tournaments use Copy-Button format, NOT HTML data-set attributes
            cards = extract_cards_from_decklist(deck_info['url'], card_db)
            
            # Validate deck has exactly 60 cards
            total_cards = sum(card['count'] for card in cards)
            
            if cards and total_cards == 60:
                all_decks.append({
                    'archetype': normalize_archetype_name(deck_info['archetype']),
                    'cards': cards,
                    'source': 'Tournament'
                })
            elif cards:
                print(f"    ⚠️ WARNUNG: Tournament Deck hat {total_cards} statt 60 Karten - übersprungen")
        
        print(f"  Collected {len(all_decks)} complete decks so far")
        time.sleep(settings.get('delay_between_requests', 1.0))
    
    print(f"\n✓ Total decks with FULL CARD LISTS from tournaments: {len(all_decks)}")
    return all_decks

# ============================================================================
# DATA AGGREGATION AND ANALYSIS
# ============================================================================

def aggregate_card_data(all_decks: List[Dict[str, Any]], card_db: CardDatabaseLookup) -> List[Dict[str, Any]]:
    """Aggregate card data from all sources with archetype percentages."""
    print("\n" + "="*60)
    print("AGGREGATING CARD DATA")
    print("="*60)
    
    # Structure: {archetype: {card_name: {'total_count': X, 'deck_count': Y, 'max_count': Z, 'decks': [], 'set_codes': {}}}}
    archetype_cards = defaultdict(lambda: defaultdict(lambda: {'total_count': 0, 'deck_count': 0, 'max_count': 0, 'decks': [], 'set_codes': {}}))
    archetype_deck_counts = defaultdict(int)  # Total decks per archetype (with cards)
    archetype_total_seen = defaultdict(int)  # All decks including those without cards
    
    # Aggregate data
    decks_with_cards = 0
    decks_without_cards = 0
    
    for i, deck in enumerate(all_decks):
        # NORMALIZE ARCHETYPE NAME to merge variants like "Ceruledge Ex" and "Ceruledge"
        archetype_raw = deck['archetype']
        archetype = normalize_archetype_name(archetype_raw)
        archetype_total_seen[archetype] += 1
        
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
            
            # Prefer set+number lookup to avoid truncated or incorrect names
            set_code = card.get('set_code', '')
            card_number = card.get('set_number', '')  # Fixed: was 'card_number', should be 'set_number'
            if set_code and card_number:
                looked_up_name = card_db.get_name_by_set_number(set_code, card_number)
                if looked_up_name:
                    if (not card_name or card_name.strip() == '' or
                        card_db.normalize_name(card_name) != card_db.normalize_name(looked_up_name)):
                        card_name = looked_up_name
                        card['name'] = card_name  # Update the card dict
            
            # If card name is still empty, skip
            if not card_name or card_name.strip() == '':
                continue
            
            archetype_cards[archetype][card_name]['total_count'] += count
            
            # Track max count across all decks
            if count > archetype_cards[archetype][card_name]['max_count']:
                archetype_cards[archetype][card_name]['max_count'] = count
            
            # Track set/number information for Pokemon cards
            if set_code and card_number:
                set_key = f"{set_code}_{card_number}"
                if set_key not in archetype_cards[archetype][card_name]['set_codes']:
                    archetype_cards[archetype][card_name]['set_codes'][set_key] = {'set_code': set_code, 'set_number': card_number, 'count': 0}
                archetype_cards[archetype][card_name]['set_codes'][set_key]['count'] += 1
            
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
            
            # Determine which set/number to use
            card_info = None
            final_set_code = ''
            final_card_number = ''
            
            # If we have tracked set/numbers from the source (Pokemon case), use the most common one
            if data['set_codes']:
                # Find the most frequently occurring set/number combination
                most_common = max(data['set_codes'].items(), key=lambda x: x[1]['count'])
                set_code = most_common[1]['set_code']
                card_number = most_common[1]['set_number']  # Fixed: was 'card_number', should be 'set_number'
                
                # Check if this is a Trainer/Energy card
                is_trainer_energy = card_db.is_card_trainer_or_energy_by_name(card_name)
                
                # For Pokemon: Use the exact set/number from source
                # For Trainer/Energy: Use latest LOW RARITY version (Common/Uncommon)
                if not is_trainer_energy:
                    # Pokemon card - keep the EXACT set/number from source
                    card_info = card_db.get_card_info_by_set_number(card_name, set_code, card_number)
                    if card_info:
                        final_set_code = card_info['set_code']
                        final_card_number = card_info['number']
                    else:
                        # Fallback for Pokemon if exact lookup fails
                        card_info = card_db.get_card_info(card_name)
                        if card_info:
                            final_set_code = card_info['set_code']
                            final_card_number = card_info['number']
                        else:
                            # Use source data as last resort
                            final_set_code = set_code
                            final_card_number = card_number
                else:
                    # Trainer/Energy - use latest LOW RARITY version (ignore source set/number)
                    latest_card = card_db.get_latest_low_rarity_version(card_name)
                    if latest_card:
                        # Convert to dict format
                        image_url = card_db.generate_limitless_image_url(latest_card.set_code, latest_card.number, latest_card.rarity)
                        card_info = {
                            'set_code': latest_card.set_code,
                            'set_name': '',
                            'number': latest_card.number,
                            'rarity': latest_card.rarity,
                            'type': latest_card.supertype,
                            'image_url': image_url
                        }
                        final_set_code = latest_card.set_code
                        final_card_number = latest_card.number
                    else:
                        # Fallback: Try any version from database
                        card_info = card_db.get_card_info(card_name)
                        if card_info:
                            final_set_code = card_info['set_code']
                            final_card_number = card_info['number']
                        elif set_code and card_number:
                            # Last resort: Use source set/number
                            image_url = card_db.generate_limitless_image_url(set_code, card_number, 'Common')
                            # Try to get type from database
                            fallback_info = card_db.get_card_info(card_name)
                            card_type = fallback_info.get('type', 'Trainer') if fallback_info else 'Trainer'
                            card_info = {
                                'set_code': set_code,
                                'set_name': '',
                                'number': card_number,
                                'rarity': 'Unknown',
                                'type': card_type,
                                'image_url': image_url
                            }
                            final_set_code = set_code
                            final_card_number = card_number
            else:
                # No source set/number info - must be Trainer/Energy
                # Use latest LOW RARITY version
                latest_card = card_db.get_latest_low_rarity_version(card_name)
                if latest_card:
                    image_url = card_db.generate_limitless_image_url(latest_card.set_code, latest_card.number, latest_card.rarity)
                    card_info = {
                        'set_code': latest_card.set_code,
                        'set_name': '',
                        'number': latest_card.number,
                        'rarity': latest_card.rarity,
                        'type': latest_card.supertype,
                        'image_url': image_url
                    }
                    final_set_code = latest_card.set_code
                    final_card_number = latest_card.number
                else:
                    # Fallback to get_card_info if low-rarity not available
                    card_info = card_db.get_card_info(card_name)
                    if card_info:
                        final_set_code = card_info['set_code']
                        final_card_number = card_info['number']
            
            if card_info:
                successful_lookups += 1
            else:
                failed_lookups += 1
            
            # Create identifier with Set_Number format for ALL cards (Pokemon, Trainer, Energy)
            # Format: "Set_Number" (e.g., "MEG_54" or "PAR_160")
            # Use the final_set_code/final_card_number we determined above
            if final_set_code and final_card_number:
                card_identifier = f"{final_set_code}_{final_card_number}"
            else:
                # Fallback to just name if Set/Number not available
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
                'type': card_info['type'] if card_info else '',
                'image_url': card_info['image_url'] if card_info else ''
            })
    
    # Sort by archetype, then by type (Pokemon element+evolution order), then by percentage descending
    def sort_key(card):
        archetype = card['archetype']
        card_type = card['type']
        percentage = card['percentage_in_archetype']
        card_name = card['card_name']
        
        # Type sorting order: G,R,W,L,P,F,D,M,N,C (element) then Basic,Stage1,Stage2 (evolution)
        # Trainer/Energy cards sort after Pokemon (Z prefix)
        element_order = {'G': '1', 'R': '2', 'W': '3', 'L': '4', 'P': '5', 'F': '6', 'D': '7', 'M': '8', 'N': '9', 'C': 'A'}
        evolution_order = {'Basic': '1', 'Stage1': '2', 'Stage2': '3'}
        
        if card_type.startswith(tuple(element_order.keys())):
            # Pokemon card (e.g., "GBasic", "RStage1")
            element = card_type[0] if card_type else 'Z'
            evolution = card_type[1:] if len(card_type) > 1 else ''
            type_sort = element_order.get(element, 'Z') + evolution_order.get(evolution, '9')
        else:
            # Trainer/Energy - sort after all Pokemon
            type_sort = 'Z' + card_type
        
        return (archetype, type_sort, -percentage, card_name)
    
    result.sort(key=sort_key)
    
    print(f"\n✅ Final Results:")
    print(f"  • {len(result)} card entries across {len(archetype_cards)} archetypes")
    print(f"  • Lookup Summary: {successful_lookups} found ✓, {failed_lookups} not found ✗")
    if failed_lookups > 0:
        print(f"  ⚠️  {failed_lookups} cards missing set/number info (check all_cards_database.csv)")
    return result

def save_to_csv(data: List[Dict[str, Any]], output_file: str):
    """Save aggregated data to CSV."""
    if not data:
        print("No data to save.")
        return
    
    output_path = os.path.join(get_data_dir(), output_file)
    
    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    print(f"\nSaving data to: {output_path}")
    
    fieldnames = ['archetype', 'card_name', 'card_identifier', 'total_count', 'max_count', 'deck_count', 
                  'total_decks_in_archetype', 'percentage_in_archetype',
                  'set_code', 'set_name', 'set_number', 'rarity', 'type', 'image_url']
    
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
    data_dir = get_data_dir()
    
    # Try multiple locations for the database
    possible_paths = [
        os.path.join(data_dir, 'all_cards_database.csv'),  # Primary: shared data folder
        os.path.join(app_path, 'all_cards_database.csv'),
        os.path.join(os.path.dirname(app_path), 'source', 'all_cards_database.csv'),
        os.path.join(os.path.dirname(app_path), 'all_cards_database.csv'),
        'C:\\Users\\haush\\OneDrive\\Desktop\\Hausi Scrapen\\source\\all_cards_database.csv'
    ]
    
    csv_path = None
    for path in possible_paths:
        if os.path.exists(path):
            csv_path = path
            break
    
    if not csv_path:
        print("\nERROR: all_cards_database.csv not found!")
        print("Please copy all_cards_database.csv to the same folder as the .exe")
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
        print("[START] Scraper starting...")
        main()
        print("\n[SUCCESS] Scraper completed successfully!")
    except KeyboardInterrupt:
        print("\n\n[INTERRUPTED] Scraping interrupted by user.")
    except Exception as e:
        print(f"\n[ERROR] Unexpected error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        input("\nPress Enter to exit...")
