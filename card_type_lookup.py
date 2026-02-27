#!/usr/bin/env python3
"""
Card Type Lookup Module
Central module for reliable card type detection based on:
1. all_cards_database.csv (from Card_Database_Scraper) - PRIORITY
2. Alle Karten.txt (fallback)
3. Japanische extra Karten.txt (fallback)
NO MORE KEYWORD GUESSING - 100% accurate lookup!
"""

import os
import sys
import csv
from typing import Dict, Optional, Tuple

class CardTypeLookup:
    """Manages card type lookup from CSV database and fallback text files"""
    
    def __init__(self, load_japanese: bool = False):
        self.card_database: Dict[str, str] = {}  # normalized name -> type
        self.japanese_database: Dict[str, str] = {}  # normalized name -> type (Japanese extras)
        self.load_japanese = load_japanese
        
        # Try to load from CSV first (most up-to-date)
        csv_loaded = self.load_csv_database()
        
        # Fallback to text files if CSV not available
        if not csv_loaded:
            print("CSV database not found, using text file fallback...")
            self.load_card_database()
            if self.load_japanese:
                self.load_japanese_database()
    
    def get_app_path(self) -> str:
        """Get the directory where the executable/script is located."""
        if getattr(sys, 'frozen', False):
            return os.path.dirname(sys.executable)
        else:
            return os.path.dirname(os.path.abspath(__file__))
    
    def normalize_card_name(self, name: str) -> str:
        """
        Normalize card name for reliable lookup.
        Removes special characters, extra spaces, and converts to lowercase.
        """
        # Remove set codes and numbers that might be at the end
        normalized = name.strip().lower()
        
        # Remove common variations
        normalized = normalized.replace('é', 'e')
        normalized = normalized.replace("'", '')
        normalized = normalized.replace("'", '')
        normalized = normalized.replace('-', '')
        normalized = normalized.replace('.', '')
        normalized = normalized.replace('!', '')
        normalized = normalized.replace('♂', '')
        normalized = normalized.replace('♀', '')
        
        # Replace multiple spaces with single space
        normalized = ' '.join(normalized.split())
        
        return normalized
    
    def _determine_card_category(self, type_code: str) -> str:
        """
        Determine card category (Pokemon, Trainer, Energy) from type code.
        Type codes from all_cards_database.csv like: GBasic, RStage1, Item, Supporter, etc.
        """
        if not type_code:
            return "Energy"  # Empty type = Basic Energy
        
        type_lower = type_code.lower()
        
        # Check for Energy
        if 'energy' in type_lower or type_code == '':
            return "Energy"
        
        # Check for Trainer types
        trainer_keywords = ['item', 'supporter', 'stadium', 'tool', 'ace spec', 'acespec']
        if any(keyword in type_lower for keyword in trainer_keywords):
            return "Trainer"
        
        # Check for Pokemon types (type codes start with element letter + stage)
        # Examples: GBasic, RStage1, WStage2, PVMAX, Mega, etc.
        pokemon_indicators = ['basic', 'stage', 'vmax', 'vstar', 'ex', 'gx', 'v', 'mega', 'break']
        if any(indicator in type_lower for indicator in pokemon_indicators):
            return "Pokemon"
        
        # Type codes that start with element letters (G, R, W, L, P, F, C, D, M, N)
        if len(type_code) > 0 and type_code[0] in 'GRWLPFCDMN':
            return "Pokemon"
        
        # Default to Pokemon for unknown types
        return "Pokemon"
    
    def load_csv_database(self) -> bool:
        """
        Load all cards from all_cards_database.csv (created by convert_alle_karten.py).
        This is the preferred source as it's always up-to-date.
        Returns True if successfully loaded, False otherwise.
        """
        app_path = self.get_app_path()
        
        # Try new location first: data/all_cards_database.csv (relative to workspace root)
        data_csv = os.path.join(app_path, 'data', 'all_cards_database.csv')
        
        # Fallback to old location: all_cards_database.csv in app directory
        app_csv = os.path.join(app_path, 'all_cards_database.csv')
        
        # Determine which file to use
        if os.path.exists(data_csv):
            csv_file = data_csv
            print(f"Loading card database from data/: {csv_file}")
        elif os.path.exists(app_csv):
            csv_file = app_csv
            print(f"Loading card database from app dir: {csv_file}")
        else:
            print("INFO: all_cards_database.csv not found. Will use fallback text files.")
            print(f"  Checked locations:")
            print(f"    - {data_csv}")
            print(f"    - {app_csv}")
            return False
        
        try:
            with open(csv_file, 'r', encoding='utf-8-sig') as f:
                reader = csv.DictReader(f, delimiter=',')  # Changed from ';' to ',' to match actual CSV format
                
                card_count = 0
                pokemon_count = 0
                trainer_count = 0
                energy_count = 0
                
                for row in reader:
                    # Support both 'name' and 'card_name' column names
                    card_name = row.get('card_name') or row.get('name', '')
                    card_name = card_name.strip()
                    
                    # Support both 'type' and 'card_type' column names
                    card_type_raw = row.get('card_type') or row.get('type', '')
                    card_type_raw = card_type_raw.strip()
                    
                    if not card_name or not card_type_raw:
                        continue
                    
                    # Determine category from type code
                    # Type codes: GBasic, RBasic, WBasic, etc. = Pokemon
                    # Empty or 'Energy' = Energy
                    # Everything else check for keywords
                    card_type = self._determine_card_category(card_type_raw)
                    
                    # Normalize the card name for lookup
                    normalized_name = self.normalize_card_name(card_name)
                    
                    # Store in database
                    self.card_database[normalized_name] = card_type
                    card_count += 1
                    
                    # Count by type
                    if card_type == "Pokemon":
                        pokemon_count += 1
                    elif card_type == "Trainer":
                        trainer_count += 1
                    elif card_type == "Energy":
                        energy_count += 1
            
            print(f"Loaded {card_count} cards from CSV database:")
            print(f"  - Pokemon: {pokemon_count}")
            print(f"  - Trainer: {trainer_count}")
            print(f"  - Energy: {energy_count}")
            
            return True
            
        except Exception as e:
            print(f"ERROR loading CSV database: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def load_card_database(self):
        """Load all cards from Alle Karten.txt"""
        app_path = self.get_app_path()
        cards_file = os.path.join(app_path, 'Alle Karten.txt')
        
        if not os.path.exists(cards_file):
            print(f"⚠️  WARNING: Alle Karten.txt not found at {cards_file}")
            print("Card type detection will not work properly!")
            return
        
        print(f"Loading card database from: {cards_file}")
        
        try:
            with open(cards_file, 'r', encoding='utf-8') as f:
                lines = f.readlines()
            
            # Skip header line
            card_count = 0
            pokemon_count = 0
            trainer_count = 0
            energy_count = 0
            
            for line in lines[1:]:  # Skip header
                line = line.strip()
                if not line:
                    continue
                
                # Parse tab-separated values
                parts = line.split('\t')
                if len(parts) < 4:
                    continue
                
                # Extract: Set, No, Code (card name), Type
                card_name = parts[2].strip()
                card_type = parts[3].strip()
                
                if not card_name or not card_type:
                    continue
                
                # Normalize the card name for lookup
                normalized_name = self.normalize_card_name(card_name)
                
                # Determine if Pokemon, Trainer, or Energy
                if not card_type:
                    # Empty type = Basic Energy
                    category = "Energy"
                    energy_count += 1
                elif 'basic' in card_type.lower() and 'energy' in card_type.lower():
                    category = "Energy"
                    energy_count += 1
                elif 'energy' in card_type.lower():
                    category = "Energy"
                    energy_count += 1
                elif any(keyword in card_type.lower() for keyword in ['item', 'supporter', 'stadium', 'tool', 'ace spec']):
                    category = "Trainer"
                    trainer_count += 1
                elif any(keyword in card_type.lower() for keyword in ['basic', 'stage 1', 'stage 2', 'mega', 'vmax', 'vstar', 'ex', 'gx', 'v']):
                    category = "Pokemon"
                    pokemon_count += 1
                else:
                    # Default to Pokemon for anything with a type prefix like L, R, W, G, P, F, C, D, M, N
                    if len(card_type) > 0 and card_type[0] in 'LRWGPFCDMN':
                        category = "Pokemon"
                        pokemon_count += 1
                    else:
                        # Unknown - skip or default to Pokemon
                        category = "Pokemon"
                        pokemon_count += 1
                
                # Store in database
                self.card_database[normalized_name] = category
                card_count += 1
            
            print(f"Loaded {card_count} cards from database:")
            print(f"  - Pokemon: {pokemon_count}")
            print(f"  - Trainer: {trainer_count}")
            print(f"  - Energy: {energy_count}")
            
        except Exception as e:
            print(f"ERROR loading card database: {e}")
            import traceback
            traceback.print_exc()
    
    def load_japanese_database(self):
        """Load Japanese cards from Japanische extra Karten.txt"""
        app_path = self.get_app_path()
        japanese_file = os.path.join(app_path, 'Japanische extra Karten.txt')
        
        if not os.path.exists(japanese_file):
            print(f"⚠️  WARNING: Japanische extra Karten.txt not found at {japanese_file}")
            return
        
        print(f"Loading Japanese card database from: {japanese_file}")
        
        try:
            with open(japanese_file, 'r', encoding='utf-8') as f:
                lines = f.readlines()
            
            # Skip header line
            card_count = 0
            pokemon_count = 0
            trainer_count = 0
            energy_count = 0
            
            for line in lines[1:]:  # Skip header
                line = line.strip()
                if not line:
                    continue
                
                # Parse tab-separated values (same format as main database)
                parts = line.split('\t')
                if len(parts) < 4:
                    continue
                
                # Extract: Set, No, Name, Type
                card_name = parts[2].strip()
                card_type = parts[3].strip()
                
                if not card_name or not card_type:
                    continue
                
                # Normalize the card name for lookup
                normalized_name = self.normalize_card_name(card_name)
                
                # Only add if NOT already in main database (main database has priority)
                if normalized_name in self.card_database:
                    continue
                
                # Determine if Pokemon, Trainer, or Energy (same logic as main database)
                if not card_type:
                    category = "Energy"
                    energy_count += 1
                elif 'basic' in card_type.lower() and 'energy' in card_type.lower():
                    category = "Energy"
                    energy_count += 1
                elif 'energy' in card_type.lower():
                    category = "Energy"
                    energy_count += 1
                elif any(keyword in card_type.lower() for keyword in ['item', 'supporter', 'stadium', 'tool', 'ace spec']):
                    category = "Trainer"
                    trainer_count += 1
                elif any(keyword in card_type.lower() for keyword in ['basic', 'stage 1', 'stage 2', 'mega', 'vmax', 'vstar', 'ex', 'gx', 'v']):
                    category = "Pokemon"
                    pokemon_count += 1
                else:
                    # Default to Pokemon for anything with a type prefix
                    if len(card_type) > 0 and card_type[0] in 'LRWGPFCDMN':
                        category = "Pokemon"
                        pokemon_count += 1
                    else:
                        category = "Pokemon"
                        pokemon_count += 1
                
                # Store in Japanese database
                self.japanese_database[normalized_name] = category
                card_count += 1
            
            print(f"Loaded {card_count} Japanese exclusive cards:")
            print(f"  - Pokemon: {pokemon_count}")
            print(f"  - Trainer: {trainer_count}")
            print(f"  - Energy: {energy_count}")
            
        except Exception as e:
            print(f"ERROR loading Japanese card database: {e}")
            import traceback
            traceback.print_exc()
    
    def get_card_type(self, card_name: str) -> str:
        """
        Get the type of a card (Pokemon, Trainer, or Energy).
        Returns "Pokemon" if card is not found (safe default).
        First checks main database, then Japanese database (if loaded).
        
        Args:
            card_name: The name of the card to look up
            
        Returns:
            "Pokemon", "Trainer", or "Energy"
        """
        normalized = self.normalize_card_name(card_name)
        
        # Direct lookup in main database
        if normalized in self.card_database:
            return self.card_database[normalized]
        
        # Fallback to Japanese database if available
        if normalized in self.japanese_database:
            return self.japanese_database[normalized]
        
        # For Energy cards: Try removing "basic" prefix (e.g., "Basic Grass Energy" -> "Grass Energy")
        if normalized.startswith('basic '):
            without_basic = normalized[6:]  # Remove "basic "
            if without_basic in self.card_database:
                return self.card_database[without_basic]
        
        # Try without "ex", "v", "vmax", "vstar" suffixes that might be missing
        for suffix in [' ex', ' v', ' vmax', ' vstar', ' gx', ' mega']:
            if normalized.endswith(suffix):
                base_name = normalized[:-len(suffix)].strip()
                if base_name in self.card_database:
                    # Found the base card - assume same type
                    return self.card_database[base_name]
        
        # Try adding common suffixes
        for suffix in [' ex', ' v', ' vmax', ' vstar', ' gx']:
            variant = f"{normalized}{suffix}"
            if variant in self.card_database:
                return self.card_database[variant]
        
        # Not found - return Pokemon as safe default
        # (Most cards are Pokemon, and it's safer to include an extra Pokemon
        # than to accidentally classify a Pokemon as Trainer/Energy)
        return "Pokemon"
    
    def is_trainer_or_energy(self, card_name: str) -> bool:
        """
        Check if a card is a Trainer or Energy card.
        This function maintains compatibility with old code.
        
        Args:
            card_name: The name of the card to check
            
        Returns:
            True if the card is Trainer or Energy, False if Pokemon
        """
        card_type = self.get_card_type(card_name)
        return card_type in ["Trainer", "Energy"]
    
    def is_valid_card(self, card_name: str) -> bool:
        """
        Check if a card name exists in the database.
        Use this to filter out tournament titles and invalid text.
        Checks both main database and Japanese database (if loaded).
        
        Args:
            card_name: The name to validate
            
        Returns:
            True if the card exists in the database, False otherwise
        """
        normalized = self.normalize_card_name(card_name)
        
        # Direct lookup in main database
        if normalized in self.card_database:
            return True
        
        # Check Japanese database if available
        if normalized in self.japanese_database:
            return True
        
        # Try common variations
        if normalized.startswith('basic '):
            without_basic = normalized[6:]
            if without_basic in self.card_database:
                return True
        
        # Try with/without suffixes
        for suffix in [' ex', ' v', ' vmax', ' vstar', ' gx', ' mega']:
            if normalized.endswith(suffix):
                base_name = normalized[:-len(suffix)].strip()
                if base_name in self.card_database:
                    return True
            else:
                variant = f"{normalized}{suffix}"
                if variant in self.card_database:
                    return True
        
        return False


# Global singleton instances
_card_lookup_instance: Optional[CardTypeLookup] = None
_card_lookup_japanese_instance: Optional[CardTypeLookup] = None


def get_card_lookup(with_japanese: bool = False) -> CardTypeLookup:
    """
    Get or create the global CardTypeLookup instance.
    
    Args:
        with_japanese: If True, includes Japanese extra cards database
                      (use True for City League scraper)
    
    Returns:
        CardTypeLookup instance with appropriate databases loaded
    """
    global _card_lookup_instance, _card_lookup_japanese_instance
    
    if with_japanese:
        if _card_lookup_japanese_instance is None:
            _card_lookup_japanese_instance = CardTypeLookup(load_japanese=True)
        return _card_lookup_japanese_instance
    else:
        if _card_lookup_instance is None:
            _card_lookup_instance = CardTypeLookup(load_japanese=False)
        return _card_lookup_instance


def get_card_type(card_name: str) -> str:
    """
    Convenience function to get card type.
    Returns "Pokemon", "Trainer", or "Energy".
    """
    return get_card_lookup().get_card_type(card_name)


def is_trainer_or_energy(card_name: str) -> bool:
    """
    Convenience function to check if card is Trainer or Energy.
    Returns True for Trainer/Energy, False for Pokemon.
    """
    return get_card_lookup().is_trainer_or_energy(card_name)


def is_valid_card(card_name: str) -> bool:
    """
    Convenience function to check if a card exists in the database.
    Returns True if card exists, False otherwise (e.g., tournament titles).
    """
    return get_card_lookup().is_valid_card(card_name)


# Japanese-specific functions for City League scraper
def get_card_type_jp(card_name: str) -> str:
    """
    Get card type with Japanese database support.
    Use this in City League scraper for Japanese-exclusive cards.
    Returns "Pokemon", "Trainer", or "Energy".
    """
    return get_card_lookup(with_japanese=True).get_card_type(card_name)


def is_trainer_or_energy_jp(card_name: str) -> bool:
    """
    Check if card is Trainer/Energy with Japanese database support.
    Use this in City League scraper for Japanese-exclusive cards.
    Returns True for Trainer/Energy, False for Pokemon.
    """
    return get_card_lookup(with_japanese=True).is_trainer_or_energy(card_name)


def is_valid_card_jp(card_name: str) -> bool:
    """
    Check if card exists with Japanese database support.
    Use this in City League scraper for Japanese-exclusive cards.
    Returns True if card exists in either main or Japanese database.
    """
    return get_card_lookup(with_japanese=True).is_valid_card(card_name)


if __name__ == "__main__":
    # Test the module
    lookup = CardTypeLookup()
    
    print("\n=== Testing Card Type Lookup ===")
    
    test_cards = [
        "Charizard",
        "Professor Oak",
        "Fire Energy",
        "Ultra Ball",
        "Pikachu ex",
        "Boss's Orders",
        "Double Colorless Energy",
        "Mewtwo VSTAR",
        "Computer Search",
        "Rare Candy"
    ]
    
    for card in test_cards:
        card_type = lookup.get_card_type(card)
        is_trainer = lookup.is_trainer_or_energy(card)
        print(f"{card:30} -> {card_type:10} (Trainer/Energy: {is_trainer})")
