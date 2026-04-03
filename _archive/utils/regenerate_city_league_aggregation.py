#!/usr/bin/env python3
"""
City League CSV Re-Aggregator
==============================
Re-aggregates city_league_analysis.csv WITHOUT re-scraping tournaments.

PROBLEM:
- Multiple tournaments on same date with append_mode cause incorrect totals
- Example: 8 tournaments on 04 Mar 26, but only last 3 tournaments counted

SOLUTION:
- Load existing CSV (which has ALL card data from ALL tournaments)
- Group by (tournament_date, archetype)  
- Sum up deck_count values to get true total_decks_in_archetype
- Recalculate percentages
- Overwrite CSV with corrected data
"""

import os
import csv
from collections import defaultdict
from typing import Dict, List, Any

from card_scraper_shared import (
    setup_console_encoding, get_data_dir
)

setup_console_encoding()


def reaggregate_csv():
    """Re-aggregate city_league_analysis.csv to fix deck count issues."""
    print("\n" + "="*60)
    print("CITY LEAGUE CSV RE-AGGREGATION")
    print("="*60)
    print("\nThis will fix aggregation issues caused by multiple tournaments")
    print("on the same date being scraped in separate runs.\n")
    
    data_dir = get_data_dir()
    csv_file = os.path.join(data_dir, 'city_league_analysis.csv')
    backup_file = os.path.join(data_dir, f'city_league_analysis_PRE_REAGGREGATE.csv')
    
    if not os.path.exists(csv_file):
        print(f"ERROR: CSV file not found: {csv_file}")
        input("\nPress Enter to exit...")
        return
    
    # Backup existing CSV
    import shutil
    shutil.copy2(csv_file, backup_file)
    print(f"✓ Backup created: {backup_file}\n")
    
    # Load CSV
    print("Loading CSV...")
    with open(csv_file, 'r', newline='', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f, delimiter=';')
        rows = list(reader)
    print(f"Loaded {len(rows)} entries\n")
    
    # Group by (tournament_date, archetype, card_name)
    # The KEY INSIGHT: Each row represents ONE CARD from ONE OR MORE DECKS
    # deck_count = how many decks contain this card
    # We need to find the TOTAL number of decks for each (date, archetype) combo
    
    print("Analyzing deck counts per archetype/date...")
    
    # Step 1: Find max deck_count per (date, archetype) - this represents total decks
    # because if a card appears in ALL decks, its deck_count = total decks
    archetype_totals = defaultdict(int)
    
    for row in rows:
        key = (row['tournament_date'], row['archetype'])
        deck_count = int(row['deck_count'])
        # The maximum deck_count for any card in this archetype = total decks
        if deck_count > archetype_totals[key]:
            archetype_totals[key] = deck_count
    
    print(f"Found {len(archetype_totals)} unique (date, archetype) combinations\n")
    
    # Step 2: Update total_decks_in_archetype and recalculate percentages
    print("Recalculating percentages...")
    updated_rows = []
    
    for row in rows:
        key = (row['tournament_date'], row['archetype'])
        total_decks = archetype_totals[key]
        deck_count = int(row['deck_count'])
        
        # Update values
        row['total_decks_in_archetype'] = str(total_decks)
        
        # Recalculate percentage
        if total_decks > 0:
            percentage = (deck_count / total_decks) * 100
            row['percentage_in_archetype'] = f"{percentage:.1f}".replace('.', ',')
        
        updated_rows.append(row)
    
    # Step 3: Write back to CSV
    print(f"Writing {len(updated_rows)} entries back to CSV...\n")
    
    fieldnames = ['meta', 'tournament_date', 'archetype', 'card_name', 'card_identifier', 
                  'total_count', 'max_count', 'deck_count', 'total_decks_in_archetype', 
                  'percentage_in_archetype', 'set_code', 'set_name', 'set_number', 
                  'rarity', 'type', 'image_url', 'is_ace_spec']
    
    with open(csv_file, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=';')
        writer.writeheader()
        writer.writerows(updated_rows)
    
    # Show summary of changes
    print("="*60)
    print("✅ RE-AGGREGATION COMPLETE!")
    print("="*60)
    print("\n📊 Updated Deck Counts:")
    
    # Show top 10 archetype/date combinations with their new counts
    sorted_totals = sorted(archetype_totals.items(), 
                           key=lambda x: (x[0][0], -x[1]))[:20]
    
    for (date, archetype), total in sorted_totals:
        print(f"  • {date} - {archetype}: {total} decks")
    
    if len(archetype_totals) > 20:
        print(f"  ... and {len(archetype_totals) - 20} more")
    
    print(f"\nOld CSV backed up to: {backup_file}")
    print(f"New CSV written to: {csv_file}")
    input("\nPress Enter to exit...")


if __name__ == '__main__':
    reaggregate_csv()
