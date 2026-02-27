#!/usr/bin/env python3
"""
Fix City League Archetype Duplicates
Removes duplicate entries from city_league_archetypes.csv
"""

import csv
import os

def get_data_dir():
    """Get the data directory."""
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')

def deduplicate_city_league_data():
    """Remove duplicate entries from city league archetype data."""
    data_dir = get_data_dir()
    csv_file = os.path.join(data_dir, 'city_league_archetypes.csv')
    
    if not os.path.exists(csv_file):
        print(f"❌ CSV file not found: {csv_file}")
        return
    
    # Load all data
    print(f"Loading data from: {csv_file}")
    with open(csv_file, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f, delimiter=';')
        all_data = list(reader)
    
    print(f"Loaded {len(all_data)} total entries")
    
    # Deduplicate using unique key: tournament_id + placement + player
    seen = set()
    unique_data = []
    duplicates = 0
    
    for entry in all_data:
        # Create unique key
        key = (
            entry.get('tournament_id', ''),
            entry.get('placement', ''),
            entry.get('player', ''),
            entry.get('archetype', '')
        )
        
        if key not in seen:
            seen.add(key)
            unique_data.append(entry)
        else:
            duplicates += 1
    
    print(f"\nFound {duplicates} duplicate entries")
    print(f"Unique entries: {len(unique_data)}")
    
    if duplicates > 0:
        # Backup original file
        backup_file = csv_file.replace('.csv', '_backup.csv')
        os.rename(csv_file, backup_file)
        print(f"\n✓ Created backup: {backup_file}")
        
        # Save deduplicated data
        with open(csv_file, 'w', newline='', encoding='utf-8-sig') as f:
            fieldnames = ['date', 'tournament_id', 'prefecture', 'shop', 'format', 'placement', 'player', 'archetype']
            writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=';')
            writer.writeheader()
            writer.writerows(unique_data)
        
        print(f"✅ Saved {len(unique_data)} unique entries to {csv_file}")
        print(f"   Removed {duplicates} duplicates")
    else:
        print("\n✓ No duplicates found - data is already clean!")

if __name__ == "__main__":
    try:
        deduplicate_city_league_data()
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        print("\n" + "=" * 50)
        input("Press Enter to close...")
