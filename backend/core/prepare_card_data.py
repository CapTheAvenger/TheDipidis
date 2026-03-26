#!/usr/bin/env python3
"""
Card Database Updater - FAST EDITION
====================================
Merges English cards, Japanese cards, Prices AND Pokédex Numbers
into the final JSON for the frontend.
"""


import json
import csv
import os
import re
import sys
from typing import List, Dict
from backend.core.card_scraper_shared import setup_console_encoding, load_set_order, card_sort_key
from backend.settings import get_data_path

setup_console_encoding()

def load_csv(filepath: str) -> List[Dict]:
    cards = []
    if os.path.exists(filepath):
        with open(filepath, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                if row.get('name_en') or row.get('name'):
                    cards.append(row)
    return cards

def load_pokedex() -> Dict[str, int]:
    dex_path = get_data_path('pokemon_dex_numbers.json')
    if os.path.exists(dex_path):
        with open(dex_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

def get_base_pokemon_name(name: str) -> str:
    name = name.lower()
    # Entferne bekannte Suffixe (ex, VMAX, GX, etc.)
    name = re.sub(r'\s+(vstar|vmax|v-union|v|ex|gx|break|star|lv\.x|legend)$', '', name)
    # Entferne bekannte Präfixe (Radiant, Galarian, Dark, etc.)
    name = re.sub(r'^(radiant|shining|galarian|hisuian|alolan|paldean|dark|light|basic)\s+', '', name)
    # Bereinige Satzzeichen (Mr. Mime -> mr-mime, Farfetch'd -> farfetchd)
    name = name.replace("\u2019", "").replace("'", "").replace(".", "").strip()
    # Leerzeichen zu Bindestrich für exakten PokéAPI-Match (Roaring Moon -> roaring-moon)
    return name.replace(" ", "-")

def create_merged_database():
    print("=" * 80)
    print("UPDATING FRONTEND CARD DATA (Merging EN, DE, Prices & Pokedex)")
    print("=" * 80)

    english_cards = load_csv(get_data_path('all_cards_database.csv'))
    japanese_cards = load_csv(get_data_path('japanese_cards_database.csv'))
    price_data = load_csv(get_data_path('price_data.csv'))
    pokedex = load_pokedex()

    prices_dict = {f"{p.get('set')}_{p.get('number')}": p for p in price_data}
    en_keys = {f"{c.get('set')}_{c.get('number')}" for c in english_cards}
    jp_to_add = [c for c in japanese_cards if f"{c.get('set')}_{c.get('number')}" not in en_keys]

    merged_cards = english_cards + jp_to_add

    match_count = 0

    for card in merged_cards:
        if 'name' in card and 'name_en' not in card:
            card['name_en'] = card.pop('name')

        key = f"{card.get('set')}_{card.get('number')}"

        if key in prices_dict:
            card['eur_price'] = prices_dict[key].get('eur_price', '')
            card['price_last_updated'] = prices_dict[key].get('last_updated', '')
        else:
            card['eur_price'] = card.get('eur_price', '')
            card['price_last_updated'] = card.get('price_last_updated', '')

        # For JP-origin cards, replace the Japanese scan with the English proxy
        # from pokemonproxies.com. The URL is predictable: set folder + prefix + number + name.
        # Only M3 and M4 are available on pokemonproxies; other JP sets keep the JP image.
        PROXY_SET_MAP = {
            'M3': ('Munikis_Zero', '3a'),
            'M4': ('Chaos_Rising', '4a'),
        }
        if '_JP_LG.png' in card.get('image_url', ''):
            set_code = card.get('set', '')
            card_num = card.get('number', '')
            card_name = card.get('name_en', card.get('name', ''))
            if set_code in PROXY_SET_MAP:
                folder, prefix = PROXY_SET_MAP[set_code]
                try:
                    num_padded = str(int(card_num)).zfill(3)
                    name_normalized = card_name.replace(' ', '_')
                    card['image_url'] = f"https://pokemonproxies.com/images/cards/sets/{folder}/{prefix}-{num_padded}-{name_normalized}.png"
                except (ValueError, TypeError):
                    pass  # keep original JP image as fallback

        card['pokedex_number'] = ''

        # Type field is "Basic", "Stage 1", "VMAX", etc. for Pokémon;
        # "Supporter", "Item", "Tool", "Stadium", "Energy" for non-Pokémon.
        card_type_lower = card.get('type', '').lower()
        NON_POKEMON = ('supporter', 'item', 'tool', 'stadium', 'energy')
        is_pokemon = not any(t in card_type_lower for t in NON_POKEMON)

        if is_pokemon:
            base_name = get_base_pokemon_name(card.get('name_en', ''))
            dex_num = pokedex.get(base_name)

            # Nidoran ♀ / ♂ edge case
            if not dex_num and 'nidoran' in base_name:
                raw = card.get('name_en', '')
                if '\u2640' in raw:
                    dex_num = pokedex.get('nidoran-f')
                elif '\u2642' in raw:
                    dex_num = pokedex.get('nidoran-m')

            if dex_num:
                card['pokedex_number'] = str(dex_num)
                match_count += 1

    # Sort cards: newest sets first (descending set index), then by card number ascending
    set_order = load_set_order()
    merged_cards.sort(key=lambda c: card_sort_key(c, set_order))
    if set_order:
        print(f"✓ Karten sortiert nach Set-Reihenfolge ({len(set_order)} Sets geladen).")
    else:
        print("⚠ sets.json nicht gefunden – Sortierung nach Erscheinungsdatum übersprungen. Bitte [8] ausführen!")

    json_path = get_data_path('all_cards_merged.json')
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump({'cards': merged_cards}, f, ensure_ascii=False, indent=2)

    csv_path = get_data_path('all_cards_merged.csv')
    fieldnames = ['name_en', 'name_de', 'set', 'number', 'pokedex_number', 'type', 'rarity', 'image_url', 'international_prints', 'cardmarket_url', 'eur_price', 'price_last_updated']

    with open(csv_path, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(merged_cards)

    print(f"✓ Erfolgreich {len(merged_cards)} Karten für das Frontend exportiert!")
    print(f"✓ Pokédex-Nummern gefunden für: {match_count} Pokémon")

if __name__ == "__main__":
    try:
        create_merged_database()
    except Exception as e:
        print(f"Fehler: {e}")
