#!/usr/bin/env python3
"""
Sort Cards Database by SET_ORDER
=================================
Sorts all_cards_database.csv and all_cards_database.json 
by release date (newest first) and card number.
Fixes the problem where SVI/WHI/FST/MEE/SVE cards are mixed up.
"""

import csv
import json
import re
import os
from datetime import datetime

print("=" * 80)
print("SORTING ALL_CARDS_DATABASE.CSV BY SET ORDER")
print("=" * 80)
print()

# SET_ORDER mapping (same as in card_scraper_shared.py)
SET_ORDER = {
    # Mega (2025-2026)
    'ASC': 130, 'PFL': 129, 'MEG': 128, 'MEE': 128, 'MEP': 128,
    # Scarlet & Violet (2023-2025)
    'BLK': 127, 'WHT': 126, 'DRI': 125, 'JTG': 124, 'PRE': 123,
    'SSP': 122, 'SCR': 121, 'SFA': 120, 'TWM': 119, 'TEF': 118,
    'PAF': 117, 'PAR': 116, 'MEW': 115, 'OBF': 114, 'PAL': 113,
    'SVI': 112, 'SVE': 112, 'SVP': 112,
    # Sword & Shield (2020-2023)
    'CRZ': 111, 'SIT': 110, 'LOR': 109, 'PGO': 108, 'ASR': 107,
    'BRS': 106, 'FST': 105, 'CEL': 104, 'EVS': 103, 'CRE': 102,
    'BST': 101, 'SHF': 100, 'VIV': 99, 'CPA': 98, 'DAA': 97,
    'RCL': 96, 'SSH': 95, 'SP': 95,
    # Sun & Moon (2017-2019)
    'CEC': 94, 'HIF': 93, 'UNM': 92, 'UNB': 91, 'DET': 90,
    'TEU': 89, 'LOT': 88, 'DRM': 87, 'CES': 86, 'FLI': 85,
    'UPR': 84, 'CIN': 83, 'SLG': 82, 'BUS': 81, 'GRI': 80,
    'SUM': 79, 'SMP': 79,
    # XY (2014-2016)
    'EVO': 78, 'STS': 77, 'FCO': 76, 'GEN': 75, 'BKP': 74,
    'BKT': 73, 'AOR': 72, 'ROS': 71, 'DCR': 70, 'PRC': 69,
    'PHF': 68, 'FFI': 67, 'FLF': 66, 'XY': 65, 'XYP': 65,
    # Black & White (2011-2013)
    'LTR': 64, 'PLB': 63, 'PLF': 62, 'PLS': 61, 'BCR': 60,
    'DRX': 59, 'DEX': 58, 'NXD': 57, 'NVI': 56, 'EPO': 55,
    'BLW': 54, 'BWP': 54,
    # HeartGold & SoulSilver (2010-2011)
    'CL': 53, 'TM': 52, 'UD': 51, 'UL': 50, 'HS': 49,
    # Platinum (2009-2010)
    'AR': 48, 'SV': 47, 'RR': 46, 'PL': 45, 'SF': 44,
    # Diamond & Pearl (2007-2009)
    'LA': 43, 'MD': 42, 'GE': 41, 'SW': 40, 'MT': 39, 'DP': 38,
    # EX (2003-2007)
    'PK': 37, 'DF': 36, 'CG': 35, 'HP': 34, 'LM': 33, 'DS': 32,
    'UF': 31, 'EM': 30, 'DX': 29, 'TRR': 28, 'RG': 27, 'HL': 26,
    'MA': 25, 'DR': 24, 'SS': 23, 'RS': 22,
    # e-Card & Neo (2000-2003)
    'E3': 21, 'E2': 20, 'E1': 19, 'LC': 18, 'N4': 17, 'N3': 16,
    'N2': 15, 'N1': 14,
    # Classic (1999-2000)
    'G2': 13, 'G1': 12, 'TR': 11, 'BS2': 10, 'FO': 9, 'JU': 8, 'BS': 7,
    # Older Special Sets
    'M3': 20, 'MC': 15, 'MP1': 50
}

def extract_number(number_str):
    """Extract numeric part from card number (handles '185a', '185+', etc.)"""
    if not number_str:
        return 0
    try:
        match = re.match(r'(\d+)', number_str)
        return int(match.group(1)) if match else 0
    except:
        return 0

def sort_key(card):
    """Sort key: SET_ORDER desc (newest first), then card number asc"""
    set_code = card.get('set', '')
    number_str = card.get('number', '0')
    
    set_order = SET_ORDER.get(set_code, 0)
    card_number = extract_number(number_str)
    
    # Sort by: -set_order (higher = newer, comes first), card_number, number_str
    return (-set_order, card_number, number_str)

# Load CSV
csv_path = 'data/all_cards_database.csv'
if not os.path.exists(csv_path):
    print(f"ERROR: {csv_path} not found!")
    exit(1)

print(f"Loading {csv_path}...")
cards = []
with open(csv_path, 'r', encoding='utf-8', newline='') as f:
    reader = csv.DictReader(f)
    fieldnames = reader.fieldnames
    cards = list(reader)

print(f"✓ Loaded {len(cards)} cards")

# Sort cards
print("Sorting by SET_ORDER (newest sets first) and card number...")
cards.sort(key=sort_key)
print("✓ Cards sorted")

# Show sample of sorted order
print("\nFirst 10 cards after sorting:")
for i, card in enumerate(cards[:10], 1):
    set_order = SET_ORDER.get(card['set'], 0)
    print(f"  {i}. {card['name']} ({card['set']} {card['number']}) - Order: {set_order}")

print("\nLast 10 cards after sorting:")
for i, card in enumerate(cards[-10:], len(cards)-9):
    set_order = SET_ORDER.get(card['set'], 0)
    print(f"  {i}. {card['name']} ({card['set']} {card['number']}) - Order: {set_order}")

# Save sorted CSV
print(f"\nSaving sorted CSV to {csv_path}...")
with open(csv_path, 'w', encoding='utf-8', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(cards)

print("✓ Saved CSV")

# Sort JSON too
json_path = 'data/all_cards_database.json'
if os.path.exists(json_path):
    print(f"\nLoading {json_path}...")
    with open(json_path, 'r', encoding='utf-8') as f:
        json_data = json.load(f)
    
    # Handle nested structure with "cards" array
    if isinstance(json_data, dict) and 'cards' in json_data:
        json_cards = json_data['cards']
        has_metadata = True
    else:
        json_cards = json_data
        has_metadata = False
    
    print(f"✓ Loaded {len(json_cards)} cards from JSON")
    print("Sorting JSON...")
    json_cards.sort(key=sort_key)
    print("✓ JSON sorted")
    
    # Update metadata
    if has_metadata:
        json_data['cards'] = json_cards
        json_data['total_cards'] = len(json_cards)
        json_data['timestamp'] = datetime.now().isoformat()
        save_data = json_data
    else:
        save_data = json_cards
    
    print(f"Saving sorted JSON to {json_path}...")
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(save_data, f, ensure_ascii=False, indent=2)
    print("✓ Saved JSON")
else:
    print(f"\n⚠ {json_path} not found, skipping JSON sort")

print()
print("=" * 80)
print("✓ SUCCESS: Database sorted!")
print("=" * 80)
print()
print("Next steps:")
print("  1. Delete tracking: Remove-Item 'data\\all_cards_scraped_pages.json'")
print("  2. Run scraper to get new cards: .\\RUN_ALL_CARDS.bat")
