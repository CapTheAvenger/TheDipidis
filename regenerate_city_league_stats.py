#!/usr/bin/env python3
"""
Regenerate City League Statistics
Recreates the deck statistics file from cleaned city_league_archetypes.csv
"""

import csv
import os

def get_data_dir():
    """Get the data directory."""
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')

def regenerate_stats():
    """Regenerate deck statistics from cleaned data."""
    data_dir = get_data_dir()
    csv_file = os.path.join(data_dir, 'city_league_archetypes.csv')
    stats_file = os.path.join(data_dir, 'city_league_archetypes_deck_stats.csv')
    
    if not os.path.exists(csv_file):
        print(f"❌ CSV file not found: {csv_file}")
        return
    
    # Load all data
    print(f"Loading data from: {csv_file}")
    with open(csv_file, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f, delimiter=';')
        all_data = list(reader)
    
    print(f"Loaded {len(all_data)} entries")
    
    # Collect deck statistics
    deck_data = {}  # {archetype: {'count': int, 'placements': [int, ...], 'tournaments': [str, ...]}}
    
    for entry in all_data:
        archetype = entry.get('archetype', 'Unknown')
        try:
            placement = int(entry.get('placement', 0))
        except ValueError:
            placement = 0
        
        tournament_info = f"{entry.get('date', '')} - {entry.get('prefecture', '')} - {entry.get('shop', '')} (ID: {entry.get('tournament_id', '')})"
        
        if archetype not in deck_data:
            deck_data[archetype] = {
                'count': 0,
                'placements': [],
                'tournaments': []
            }
        
        deck_data[archetype]['count'] += 1
        deck_data[archetype]['placements'].append(placement)
        deck_data[archetype]['tournaments'].append(tournament_info)
    
    # Calculate statistics
    stats_rows = []
    for archetype, deck_info in deck_data.items():
        avg_placement = sum(deck_info['placements']) / len(deck_info['placements']) if deck_info['placements'] else 0
        best_placement = min(deck_info['placements']) if deck_info['placements'] else 0
        worst_placement = max(deck_info['placements']) if deck_info['placements'] else 0
        
        # Format average_placement with comma as decimal separator for German Excel
        avg_placement_str = str(round(avg_placement, 2)).replace('.', ',')
        
        stats_rows.append({
            'archetype': archetype,
            'format': 'City League (JP)',
            'total_appearances': deck_info['count'],
            'average_placement': avg_placement_str,
            'best_placement': best_placement,
            'worst_placement': worst_placement,
            'tournaments': '; '.join(set(deck_info['tournaments']))  # Unique tournament names
        })
    
    # Sort by total appearances (most common first)
    stats_rows.sort(key=lambda x: x['total_appearances'], reverse=True)
    
    # Save to CSV
    print(f"\nSaving statistics to: {stats_file}")
    with open(stats_file, 'w', newline='', encoding='utf-8-sig') as f:
        fieldnames = ['archetype', 'format', 'total_appearances', 'average_placement', 'best_placement', 'worst_placement', 'tournaments']
        writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=';')
        writer.writeheader()
        writer.writerows(stats_rows)
    
    print(f"✅ Statistics saved successfully!")
    print(f"\nTop 10 Most Common Decks:")
    print("-" * 70)
    for i, row in enumerate(stats_rows[:10], 1):
        print(f"{i}. {row['archetype']}: {row['total_appearances']} appearances, avg placement: {row['average_placement']}")
    
    return stats_rows

if __name__ == "__main__":
    try:
        regenerate_stats()
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        print("\n" + "=" * 50)
        input("Press Enter to close...")
