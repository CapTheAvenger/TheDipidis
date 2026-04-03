#!/usr/bin/env python3
"""Recreate CSV from JSON"""
import json
import csv
import os


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.join(script_dir, '..')
    json_path = os.path.join(project_dir, 'data', 'all_cards_merged.json')
    csv_path = os.path.join(project_dir, 'data', 'all_cards_merged.csv')

    print("Recreating CSV from JSON...")

    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
        cards = data['cards']

    print(f"Loaded {len(cards)} cards from JSON")

    fieldnames = ['name', 'set', 'number', 'type', 'rarity', 'image_url', 'international_prints', 'cardmarket_url', 'eur_price', 'price_last_updated']

    with open(csv_path, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(cards)

    print(f"[✓] Saved {len(cards)} cards to CSV with correct column order")


if __name__ == "__main__":
    main()
