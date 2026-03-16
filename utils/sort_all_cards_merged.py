#!/usr/bin/env python3
"""
Sort all_cards_merged.csv and all_cards_merged.json
====================================================
Sorts by Release Date (SET_ORDER, newest first) then Number (numerically)
Automatically runs after all_cards_scraper finishes.
"""

import csv
import json
import os
import re
from datetime import datetime

def get_set_order():
    sets_path = os.path.join('data', 'sets.json')
    try:
        with open(sets_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}

SET_ORDER = get_set_order()

def extract_number(number_str):
    """Extract numeric part from card number (handles '185a', '185+', 'TG24', etc.)"""
    if not number_str:
        return 0
    try:
        match = re.match(r'(\d+)', str(number_str))
        return int(match.group(1)) if match else 0
    except:
        return 0

def sort_key(card):
    """Sort key: SET_ORDER desc (newest first), then card number asc"""
    set_code = card.get('set', '')
    number_str = card.get('number', '0')
    
    set_order = SET_ORDER.get(set_code, 0)
    card_number = extract_number(number_str)
    
    # Return: (-set_order, card_number, number_str)
    # Negative set_order = newest first, then number ascending
    return (-set_order, card_number, str(number_str))

def sort_csv():
    """Sort the CSV file."""
    csv_path = 'data/all_cards_merged.csv'
    
    if not os.path.exists(csv_path):
        print(f"[WARN] {csv_path} not found, skipping CSV sort")
        return 0
    
    print(f"\n[CSV] Loading {csv_path}...")
    cards = []
    fieldnames = None
    
    with open(csv_path, 'r', encoding='utf-8', newline='') as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        for row in reader:
            cards.append(row)
    
    print(f"[CSV] Loaded {len(cards)} cards")
    
    # Sort: First by SET_ORDER (newest first), then by number (numerically)
    cards.sort(key=sort_key)
    
    print(f"[CSV] Sorted by Release Date (SET_ORDER) → Number")
    
    # Save back
    with open(csv_path, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(cards)
    
    print(f"[CSV] ✓ Saved sorted CSV")
    return len(cards)

def sort_json():
    """Sort the JSON file."""
    json_path = 'data/all_cards_merged.json'
    
    if not os.path.exists(json_path):
        print(f"[WARN] {json_path} not found, skipping JSON sort")
        return 0
    
    print(f"\n[JSON] Loading {json_path}...")
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Handle nested structure with "cards" array
    if isinstance(data, dict) and 'cards' in data:
        cards = data['cards']
        has_metadata = True
    else:
        cards = data
        has_metadata = False
    
    print(f"[JSON] Loaded {len(cards)} cards")
    
    # Sort: First by SET_ORDER (newest first), then by number (numerically)
    cards.sort(key=sort_key)
    
    print(f"[JSON] Sorted by Set → Number")
    
    # Update metadata
    if has_metadata:
        data['cards'] = cards
        data['total_cards'] = len(cards)
        data['timestamp'] = datetime.now().isoformat()
        save_data = data
    else:
        save_data = cards
    
    # Save back
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(save_data, f, ensure_ascii=False, indent=2)
    
    print(f"[JSON] ✓ Saved sorted JSON")
    return len(cards)

if __name__ == '__main__':
    print("=" * 80)
    print("SORT ALL CARDS MERGED DATABASE")
    print("=" * 80)
    
    csv_count = sort_csv()
    json_count = sort_json()
    
    print()
    print("=" * 80)
    print(f"[✓] DONE! Sorted {csv_count} cards in CSV and {json_count} cards in JSON")
    print("=" * 80)
