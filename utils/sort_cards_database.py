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

def get_set_order():
    sets_path = os.path.join('data', 'sets.json')
    try:
        with open(sets_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}

SET_ORDER = get_set_order()

def extract_number(number_str):
    """Extract numeric part from card number (handles '185a', '185+', etc.)"""
    if not number_str:
        return 0
    try:
        match = re.match(r'(\d+)', number_str)
        return int(match.group(1)) if match else 0
    except (ValueError, AttributeError):
        return 0

def sort_key(card):
    """Sort key: SET_ORDER desc (newest first), then card number asc"""
    set_code = card.get('set', '')
    number_str = card.get('number', '0')
    
    set_order = SET_ORDER.get(set_code, 0)
    card_number = extract_number(number_str)
    
    # Sort by: -set_order (higher = newer, comes first), card_number, number_str
    return (-set_order, card_number, number_str)


def main():
    SET_ORDER = get_set_order()

    print("=" * 80)
    print("SORTING ALL_CARDS_DATABASE.CSV BY SET ORDER")
    print("=" * 80)
    print()

    # Load CSV
    csv_path = 'data/all_cards_database.csv'
    if not os.path.exists(csv_path):
        print(f"ERROR: {csv_path} not found!")
        exit(1)

    print(f"Loading {csv_path}...")
    cards = []
    with open(csv_path, 'r', encoding='utf-8-sig', newline='') as f:
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


if __name__ == '__main__':
    main()
