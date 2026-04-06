#!/usr/bin/env python3
"""
Backfill energy_type for existing card data.

Scrapes Limitless TCG card list pages (fast, no detail pages) to extract
the ptcg-symbol energy type letter for each card, then patches:
  - data/all_cards_database.json
  - data/all_cards_merged.json
  - data/cards_chunk_standard.json
  - data/cards_chunk_extended.json (if exists)
  - data/cards_chunk_legacy.json   (if exists)
"""
import json
import os
import sys
import time

# Add backend/core to path so we can import shared utilities
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend", "core"))
from card_scraper_shared import safe_fetch_html
from bs4 import BeautifulSoup

# Limitless ptcg-symbol letter -> TCG energy type name
ENERGY_SYMBOL_MAP = {
    "G": "Grass", "R": "Fire", "W": "Water", "L": "Lightning",
    "P": "Psychic", "F": "Fighting", "D": "Darkness", "M": "Metal",
    "N": "Dragon", "C": "Colorless",
}

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")


def scrape_energy_types():
    """Scrape Limitless list pages and return {set::number: energy_type} mapping."""
    base_url = "https://limitlesstcg.com/cards?q=lang%3Aen&display=list"
    energy_map = {}
    page = 1

    while True:
        url = base_url if page == 1 else f"{base_url}&page={page}"
        print(f"  Seite {page}: {url}")

        html = safe_fetch_html(url, timeout=30, retries=3)
        if not html:
            print(f"  Kein HTML erhalten - Stoppe.")
            break

        soup = BeautifulSoup(html, "lxml")
        rows = [tr for tr in soup.select("table tr") if tr.find("td")]

        if not rows:
            print("  Keine Karten mehr gefunden - Ende.")
            break

        new_on_page = 0
        for row in rows:
            cells = row.find_all("td")
            if len(cells) < 4:
                continue

            set_code = cells[0].get_text(strip=True)
            set_number = cells[1].get_text(strip=True)

            type_span = cells[3].find("span", class_="ptcg-symbol")
            if type_span:
                symbol_letter = type_span.get_text(strip=True)
                energy_type = ENERGY_SYMBOL_MAP.get(symbol_letter, "")
                if energy_type:
                    key = f"{set_code}::{set_number}"
                    energy_map[key] = energy_type
                    new_on_page += 1

        if len(energy_map) % 500 == 0 and new_on_page > 0:
            print(f"  ... {len(energy_map)} Energy Types bisher")

        # Pagination check (same logic as all_cards_scraper)
        next_tag = soup.select_one(
            ".pagination a[rel='next'], "
            ".pagination .page-item.next a, "
            ".pagination a[aria-label='Next']"
        )
        has_next = False
        if next_tag:
            parent = next_tag.find_parent()
            if parent and "disabled" not in parent.get("class", []):
                has_next = True

        if not has_next and new_on_page == 0:
            print("  Keine neuen Karten - Ende der Liste.")
            break

        page += 1
        time.sleep(0.3)

    print(f"\n✓ {len(energy_map)} Energy Types extrahiert.")
    return energy_map


def patch_json_file(filepath, energy_map):
    """Add energy_type to cards in a JSON file. Returns count of patched cards."""
    if not os.path.exists(filepath):
        return 0

    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Handle different JSON structures
    if isinstance(data, dict) and "cards" in data:
        cards = data["cards"]
    elif isinstance(data, list):
        cards = data
    else:
        print(f"  Unbekannte Struktur in {os.path.basename(filepath)}")
        return 0

    patched = 0
    for card in cards:
        set_code = card.get("set", "")
        number = card.get("number", "")
        key = f"{set_code}::{number}"

        if key in energy_map:
            card["energy_type"] = energy_map[key]
            patched += 1
        elif "energy_type" not in card:
            card["energy_type"] = ""

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    return patched


def main():
    print("=" * 60)
    print("Backfill Energy Types from Limitless TCG")
    print("=" * 60)

    # Step 1: Scrape energy types from list pages
    print("\n[1/2] Scrape Limitless Karten-Listen...")
    energy_map = scrape_energy_types()

    if not energy_map:
        print("FEHLER: Keine Energy Types gefunden. Abbruch.")
        sys.exit(1)

    # Save mapping for reference
    map_path = os.path.join(DATA_DIR, "energy_type_map.json")
    with open(map_path, "w", encoding="utf-8") as f:
        json.dump(energy_map, f, ensure_ascii=False, indent=2)
    print(f"✓ Mapping gespeichert: {map_path}")

    # Step 2: Patch all data files
    print("\n[2/2] Patche Kartendaten...")
    files_to_patch = [
        "all_cards_database.json",
        "all_cards_merged.json",
        "cards_chunk_standard.json",
        "cards_chunk_extended.json",
        "cards_chunk_legacy.json",
    ]

    for filename in files_to_patch:
        filepath = os.path.join(DATA_DIR, filename)
        if os.path.exists(filepath):
            count = patch_json_file(filepath, energy_map)
            print(f"  ✓ {filename}: {count} Karten gepatcht")
        else:
            print(f"  - {filename}: nicht vorhanden, übersprungen")

    # Distribution stats
    type_counts = {}
    for t in energy_map.values():
        type_counts[t] = type_counts.get(t, 0) + 1
    print("\nVerteilung:")
    for t, c in sorted(type_counts.items(), key=lambda x: -x[1]):
        print(f"  {t}: {c}")

    print("\n✓ Fertig!")


if __name__ == "__main__":
    main()
