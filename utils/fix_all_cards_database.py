#!/usr/bin/env python3
"""
Fix All Cards Database
======================
1. Sort by Set (alphabetically) then by Number (numerically)
2. Fill missing image_url with built URLs
3. Save sorted and fixed JSON and CSV
"""

import json
import csv
import os
import re
from typing import List, Dict

def natural_sort_key(s: str):
    """Sort key that handles numbers properly (e.g., '1' before '10')"""
    return [int(text) if text.isdigit() else text.lower() 
            for text in re.split(r'(\d+)', s)]

def build_card_image_url(set_code: str, set_number: str, rarity: str) -> str:
    """Build Limitless CDN URL for a card."""
    if not set_code or not set_number:
        return ''
    
    # Determine rarity code
    rarity_code = 'R'  # Default to Rare
    if rarity:
        r = rarity.lower()
        if 'uncommon' in r:
            rarity_code = 'U'
        elif 'common' in r and 'uncommon' not in r:
            rarity_code = 'C'
        elif 'holo' in r or 'rare' in r:
            rarity_code = 'R'
    
    # Pad numeric card numbers to 3 digits (86 -> 086, TG24 stays TG24)
    padded_number = set_number
    if set_number.isdigit():
        padded_number = set_number.zfill(3)
    
    # Build URL: SET_NUM_R_EN_LG.png
    return f"https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/{set_code}/{set_code}_{padded_number}_{rarity_code}_EN_LG.png"

def fix_and_sort_json():
    """Load, fix, and sort the all_cards_merged.json file."""
    json_path = 'data/all_cards_merged.json'
    
    if not os.path.exists(json_path):
        print(f"[ERROR] {json_path} not found!")
        return
    
    print(f"[1/4] Loading {json_path}...")
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Handle nested structure with "cards" array
    if isinstance(data, dict) and 'cards' in data:
        cards = data['cards']
        has_metadata = True
    else:
        cards = data
        has_metadata = False
    
    print(f"[2/4] Loaded {len(cards)} cards")
    
    # Fix missing image_urls
    fixed_count = 0
    for card in cards:
        if not card.get('image_url') or card.get('image_url', '').strip() == '':
            set_code = card.get('set', '')
            set_number = card.get('number', '')
            rarity = card.get('rarity', '')
            
            if set_code and set_number:
                built_url = build_card_image_url(set_code, set_number, rarity)
                if built_url:
                    card['image_url'] = built_url
                    fixed_count += 1
    
    print(f"[3/4] Fixed {fixed_count} missing image_urls")
    
    # Sort: First by set (alphabetically), then by number (naturally)
    cards.sort(key=lambda c: (c.get('set', ''), natural_sort_key(c.get('number', ''))))
    
    print(f"[4/4] Sorted by Set → Number")
    
    # Save back
    if has_metadata:
        data['cards'] = cards
        data['total_cards'] = len(cards)
        save_data = data
    else:
        save_data = cards
    
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(save_data, f, ensure_ascii=False, indent=2)
    
    print(f"[✓] Saved fixed and sorted JSON to {json_path}")
    print(f"    - Total cards: {len(cards)}")
    print(f"    - Fixed image URLs: {fixed_count}")

def fix_and_sort_csv():
    """Load, fix, and sort the all_cards_merged.csv file."""
    csv_path = 'data/all_cards_merged.csv'
    
    if not os.path.exists(csv_path):
        print(f"[WARN] {csv_path} not found, skipping CSV fix")
        return
    
    print(f"\n[1/4] Loading {csv_path}...")
    cards = []
    
    with open(csv_path, 'r', encoding='utf-8', newline='') as f:
        reader = csv.DictReader(f)
        for row in reader:
            cards.append(row)
    
    print(f"[2/4] Loaded {len(cards)} cards from CSV")
    
    # Fix missing image_urls
    fixed_count = 0
    for card in cards:
        if not card.get('image_url') or card.get('image_url', '').strip() == '':
            set_code = card.get('set', '')
            set_number = card.get('number', '')
            rarity = card.get('rarity', '')
            
            if set_code and set_number:
                built_url = build_card_image_url(set_code, set_number, rarity)
                if built_url:
                    card['image_url'] = built_url
                    fixed_count += 1
    
    print(f"[3/4] Fixed {fixed_count} missing image_urls in CSV")
    
    # Sort: First by set (alphabetically), then by number (naturally)
    cards.sort(key=lambda c: (c.get('set', ''), natural_sort_key(c.get('number', ''))))
    
    print(f"[4/4] Sorted CSV by Set → Number")
    
    # Save back
    # Get all unique fieldnames from cards
    all_fieldnames = set()
    for card in cards:
        all_fieldnames.update(card.keys())
    
    # Sort fieldnames for consistent order
    fieldnames = sorted(all_fieldnames)
    
    with open(csv_path, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(cards)
    
    print(f"[✓] Saved fixed and sorted CSV to {csv_path}")
    print(f"    - Total cards: {len(cards)}")
    print(f"    - Fixed image URLs: {fixed_count}")

if __name__ == '__main__':
    print("=" * 80)
    print("FIX ALL CARDS DATABASE")
    print("=" * 80)
    print()
    
    # Fix JSON
    fix_and_sort_json()
    
    # Fix CSV
    fix_and_sort_csv()
    
    print()
    print("=" * 80)
    print("[✓] DONE! Database fixed and sorted")
    print("=" * 80)
