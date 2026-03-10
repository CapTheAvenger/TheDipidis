#!/usr/bin/env python3
"""Quick test of the updated price scraper with Cardmarket stealth"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from card_price_scraper import scrape_prices, load_settings, get_data_dir, load_existing_prices
import csv

print("\n" + "=" * 80)
print("TESTING CARDMARKET SCRAPING WITH STEALTH")
print("=" * 80)

settings = load_settings()
data_dir = get_data_dir()

# Create a small test sample from all_cards_database.csv
cards_csv = os.path.join(data_dir, 'all_cards_database.csv')
prices_csv = os.path.join(data_dir, 'price_data.csv')

print(f"\n[Test] Loading first 3 cards from database...")
test_cards = []
with open(cards_csv, 'r', encoding='utf-8', newline='') as f:
    reader = csv.DictReader(f)
    for i, row in enumerate(reader):
        if i >= 3:  # Only test 3 cards
            break
        test_cards.append({
            'name': (row.get('name') or '').strip(),
            'set': (row.get('set') or '').strip(),
            'number': (row.get('number') or '').strip(),
            'cardmarket_url': (row.get('cardmarket_url') or '').strip(),
            'card_url': (row.get('card_url') or '').strip()
        })

print(f"[Test] Testing with {len(test_cards)} cards:")
for card in test_cards:
    print(f"  - {card['name']} ({card['set']}-{card['number']})")

existing_prices = load_existing_prices(prices_csv)

print("\n[Test] Starting scrape test...")
print("="*80)

# Override skip setting for testing
settings['skip_cards_with_prices'] = False

results = scrape_prices(test_cards, settings, existing_prices, prices_csv)

print("\n" + "=" * 80)
print("TEST RESULTS")
print("=" * 80)

success_count = 0
for result in results:
    price = result.get('eur_price', '')
    status = "✓ SUCCESS" if price else "✗ NO PRICE"
    if price:
        success_count += 1
    print(f"{status}: {result['name']} → {price}")

print(f"\nSuccess rate: {success_count}/{len(results)} cards")
print("\n" + "=" * 80)
