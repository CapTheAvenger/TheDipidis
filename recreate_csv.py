#!/usr/bin/env python3
"""Recreate CSV from JSON"""
import json
import csv

print("Recreating CSV from JSON...")

# Load JSON
with open('data/all_cards_merged.json', 'r', encoding='utf-8') as f:
    data = json.load(f)
    cards = data['cards']

print(f"Loaded {len(cards)} cards from JSON")

# Define fieldnames in the CORRECT order (matching original CSV format)
fieldnames = ['name', 'set', 'number', 'type', 'rarity', 'image_url', 'international_prints', 'cardmarket_url', 'eur_price', 'price_last_updated']

# Write CSV
with open('data/all_cards_merged.csv', 'w', encoding='utf-8', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
    writer.writeheader()
    writer.writerows(cards)

print(f"[✓] Saved {len(cards)} cards to CSV with correct column order")
