#!/usr/bin/env python3
"""
Regenerate City League Comparison CSV
Recreates the comparison file from cleaned city_league_archetypes.csv
"""

import csv
import os

def get_data_dir():
    """Get the data directory."""
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')

def build_stats(data):
    """Build statistics from deck data."""
    stats = {}
    for entry in data:
        archetype = entry.get('archetype', 'Unknown')
        try:
            placement = int(entry.get('placement', 0))
        except ValueError:
            placement = 0
        
        if archetype not in stats:
            stats[archetype] = {
                'count': 0,
                'placements': [],
                'total_placement': 0
            }
        
        stats[archetype]['count'] += 1
        stats[archetype]['placements'].append(placement)
        stats[archetype]['total_placement'] += placement
    
    # Calculate averages
    for archetype, data in stats.items():
        data['avg_placement'] = data['total_placement'] / data['count'] if data['count'] > 0 else 0
        data['best_placement'] = min(data['placements']) if data['placements'] else 0
    
    return stats

def regenerate_comparison():
    """Regenerate comparison CSV from cleaned data."""
    data_dir = get_data_dir()
    csv_file = os.path.join(data_dir, 'city_league_archetypes.csv')
    comparison_csv = os.path.join(data_dir, 'city_league_archetypes_comparison.csv')
    
    if not os.path.exists(csv_file):
        print(f"❌ CSV file not found: {csv_file}")
        return
    
    # Load all data
    print(f"Loading data from: {csv_file}")
    with open(csv_file, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f, delimiter=';')
        all_data = list(reader)
    
    print(f"Loaded {len(all_data)} entries")
    
    # Since we don't have "old" data to compare against, we'll create a comparison where:
    # - old_data = empty (represents state before any scraping)
    # - new_data = current cleaned data (represents current state)
    # This shows the current status of all archetypes
    
    old_stats = {}  # Empty - no old data
    new_stats = build_stats(all_data)
    
    # Prepare comparison data
    comparison_data = []
    
    for archetype in new_stats.keys():
        old = {'count': 0, 'avg_placement': 0, 'best_placement': 0}
        new = new_stats[archetype]
        
        count_change = new['count'] - old['count']
        avg_change = new['avg_placement'] - old['avg_placement']
        
        # All archetypes are "BESTEHND" (existing) since we're showing current state
        status = 'BESTEHEND'
        trend = 'STABIL'
        
        comparison_data.append({
            'archetype': archetype,
            'status': status,
            'trend': trend,
            'old_count': old['count'],
            'new_count': new['count'],
            'count_change': count_change,
            'old_avg_placement': round(old['avg_placement'], 2),
            'new_avg_placement': round(new['avg_placement'], 2),
            'avg_placement_change': round(avg_change, 2),
            'old_best': old['best_placement'],
            'new_best': new['best_placement']
        })
    
    # Sort by new count (most popular first)
    comparison_data.sort(key=lambda x: x['new_count'], reverse=True)
    
    print(f"\nGenerating comparison CSV for {len(comparison_data)} archetypes")
    
    # Save CSV
    try:
        with open(comparison_csv, 'w', newline='', encoding='utf-8-sig') as f:
            fieldnames = ['archetype', 'status', 'trend', 'old_count', 'new_count', 'count_change',
                         'old_avg_placement', 'new_avg_placement', 'avg_placement_change',
                         'old_best', 'new_best']
            writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=';')
            writer.writeheader()
            
            for row in comparison_data:
                row_formatted = row.copy()
                # Format for German Excel (comma as decimal separator)
                for key in ['old_avg_placement', 'new_avg_placement', 'avg_placement_change']:
                    row_formatted[key] = str(row[key]).replace('.', ',')
                writer.writerow(row_formatted)
        
        print(f"✅ Comparison CSV saved to: {comparison_csv}")
        print(f"\nTop 10 Most Common Archetypes:")
        print("-" * 70)
        for i, row in enumerate(comparison_data[:10], 1):
            print(f"{i}. {row['archetype']}: {row['new_count']} appearances, avg placement: {row['new_avg_placement']}")
    except Exception as e:
        print(f"❌ Error saving comparison CSV: {e}")

if __name__ == "__main__":
    try:
        regenerate_comparison()
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        print("\n" + "=" * 50)
        input("Press Enter to close...")
