"""
Fix Switch card incorrectly marked as Ace Spec in CSV files.
Only 'Scramble Switch' is an Ace Spec, not regular 'Switch'.
"""
import csv
import os
from pathlib import Path

def fix_csv_file(filepath):
    """Fix is_ace_spec field for Switch card in CSV file"""
    if not os.path.exists(filepath):
        print(f"⚠️  File not found: {filepath}")
        return 0
    
    rows = []
    fixed_count = 0
    
    # Read CSV
    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f, delimiter=';')
        fieldnames = reader.fieldnames
        
        for row in reader:
            # Check if this is a Switch card (NOT Scramble Switch)
            card_name = row.get('card_name', '').strip()
            
            if card_name == 'Switch' and row.get('is_ace_spec') == 'Yes':
                row['is_ace_spec'] = 'No'
                fixed_count += 1
                print(f"   Fixed: {card_name} ({row.get('set_code', '')} {row.get('set_number', '')})")
            
            rows.append(row)
    
    # Write back
    if fixed_count > 0:
        with open(filepath, 'w', encoding='utf-8', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=';')
            writer.writeheader()
            writer.writerows(rows)
        print(f"✅ Fixed {fixed_count} entries in {os.path.basename(filepath)}")
    else:
        print(f"✓  No fixes needed in {os.path.basename(filepath)}")
    
    return fixed_count

def main():
    print("=" * 60)
    print("Fixing Switch Ace Spec Entries")
    print("=" * 60)
    print()
    
    data_dir = Path('data')
    csv_files = [
        'city_league_analysis.csv',
        'current_meta_card_data.csv',
        'limitless_online_decks.csv',
        'tournament_cards_data_cards.csv'
    ]
    
    total_fixed = 0
    
    for filename in csv_files:
        filepath = data_dir / filename
        if filepath.exists():
            print(f"Processing {filename}...")
            fixed = fix_csv_file(str(filepath))
            total_fixed += fixed
            print()
        else:
            print(f"⚠️  Skipped {filename} (not found)")
            print()
    
    print("=" * 60)
    print(f"✅ Total fixed: {total_fixed} entries")
    print("=" * 60)
    print()
    print("Switch card is now correctly marked as NOT an Ace Spec.")
    print("Only 'Scramble Switch' is an Ace Spec card.")

if __name__ == '__main__':
    main()
