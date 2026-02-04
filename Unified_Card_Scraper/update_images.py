#!/usr/bin/env python3
import csv

# Rarity mapping
rarity_map = {
    'Common': 'C',
    'Uncommon': 'U',
    'Rare': 'R',
    'Double Rare': 'DR',
    'Ultra Rare': 'UR',
    'Secret Rare': 'SR',
    'Illustration Rare': 'IR',
    'Art Rare': 'AR',
    'Amazing Rare': 'AR',
    'Promo': 'PR',
    'Hyper Rare': 'HR',
    'Special Illustration Rare': 'SIR'
}

csv_path = r'Unified_Card_Scraper\unified_card_data.csv'

# Read and process
rows = []
alakazam_count = 0
updated_count = 0

with open(csv_path, 'r', encoding='utf-8-sig') as f:
    reader = csv.DictReader(f, delimiter=';')
    fieldnames = reader.fieldnames
    
    for row in reader:
        if 'alakazam dudunsparce' in row.get('archetype', '').lower():
            alakazam_count += 1
            if alakazam_count <= 15:  # Top 15 Karten
                set_code = row.get('set_code', '').upper()
                card_number = row.get('set_number', '').replace('-', '_')
                rarity = row.get('rarity', 'Common')
                rarity_short = rarity_map.get(rarity, rarity[0] if rarity else 'R')
                
                # Build Limitless URL
                if set_code and card_number:
                    new_url = f'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/{set_code}/{set_code}_{card_number}_{rarity_short}_EN_LG.png'
                    row['image_url'] = new_url
                    updated_count += 1
        
        rows.append(row)

# Write back
with open(csv_path, 'w', newline='', encoding='utf-8-sig') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=';')
    writer.writeheader()
    writer.writerows(rows)

print(f"✓ Updated {updated_count} Alakazam Dudunsparce cards with Limitless CDN URLs")
