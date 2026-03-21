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
import sys
from datetime import datetime

# Allow importing from project root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from card_scraper_shared import load_set_order, extract_number, card_sort_key

SET_ORDER = load_set_order()

def sort_key(card):
    return card_sort_key(card, SET_ORDER)

def sort_csv():
    """Sort the CSV file."""
    csv_path = 'data/all_cards_merged.csv'
    
    if not os.path.exists(csv_path):
        print(f"[WARN] {csv_path} not found, skipping CSV sort")
        return 0
    
    print(f"\n[CSV] Loading {csv_path}...")
    cards = []
    fieldnames = None
    
    with open(csv_path, 'r', encoding='utf-8-sig', newline='') as f:
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
