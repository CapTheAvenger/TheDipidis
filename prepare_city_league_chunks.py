#!/usr/bin/env python3
"""
Pre-process city_league_analysis CSV into archetype image map + per-archetype JSON chunks.

This eliminates the need to load 35 MB of raw CSV in the browser.
Instead the app loads:
  1. archetype_images.json  (~30 KB)  - for the tier list banner
  2. Per-archetype JSON     (~5-50 KB each, loaded on demand)

Run:
    python prepare_city_league_chunks.py
"""

import csv
import json
import os
import re
import sys

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")

# Card types that are NOT Pokemon (used for image selection)
NON_POKEMON_TYPES = {"trainer", "energy", "item", "supporter", "stadium"}


def is_pokemon(card_type):
    """Check if a card type represents a Pokemon (not Trainer/Energy)."""
    t = (card_type or "").lower()
    return not any(x in t for x in NON_POKEMON_TYPES)


def pick_archetype_image(archetype_name, cards):
    """
    Replicate the getArchetypeImage() logic from app-tier-meta.js.
    Returns the best image_url for a given archetype.
    """
    pokemon = [c for c in cards if is_pokemon(c.get("type", ""))]
    if not pokemon:
        return ""

    archetype_lower = archetype_name.lower()
    parts = archetype_lower.split()
    archetype_base = " ".join(parts[:2])
    archetype_first = parts[0] if parts else ""

    def pct(card):
        raw = card.get("percentage_in_archetype", "0").replace(",", ".")
        try:
            return float(raw)
        except ValueError:
            return 0.0

    def count(card):
        try:
            return int(card.get("total_count", 0))
        except (ValueError, TypeError):
            return 0

    # Priority 1: Cards matching archetype name
    matching = [c for c in pokemon
                if archetype_base in (c.get("card_name", "").lower())
                or (c.get("card_name", "").lower()).startswith(archetype_first)]
    if matching:
        matching.sort(key=pct, reverse=True)
        return matching[0].get("image_url", "")

    # Priority 2: Pokemon ex, VSTAR, VMAX, V-UNION
    special = [c for c in pokemon
               if any(x in (c.get("card_name", "").lower())
                      for x in (" ex", "vstar", "vmax", "v-union"))]
    if special:
        special.sort(key=lambda c: (pct(c), count(c)), reverse=True)
        return special[0].get("image_url", "")

    # Priority 3: Stage 2
    stage2 = [c for c in pokemon if "stage 2" in (c.get("type", "").lower())]
    if stage2:
        stage2.sort(key=pct, reverse=True)
        return stage2[0].get("image_url", "")

    # Priority 4: Most common Pokemon
    pokemon.sort(key=pct, reverse=True)
    return pokemon[0].get("image_url", "")


def process_format(suffix=""):
    """Process one format (M4 = '' or M3 = '_M3')."""
    analysis_file = os.path.join(DATA_DIR, f"city_league_analysis{suffix}.csv")
    if not os.path.exists(analysis_file):
        print(f"  Skipping {analysis_file} (not found)")
        return

    print(f"  Reading {os.path.basename(analysis_file)}...")

    # Read CSV
    rows_by_archetype = {}
    with open(analysis_file, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter=";")
        for row in reader:
            arch = row.get("archetype", "").strip()
            if not arch:
                continue
            if arch not in rows_by_archetype:
                rows_by_archetype[arch] = []
            rows_by_archetype[arch].append(row)

    total_rows = sum(len(v) for v in rows_by_archetype.values())
    print(f"  {total_rows:,} rows across {len(rows_by_archetype)} archetypes")

    # 1. Build archetype images map
    images = {}
    for arch, cards in rows_by_archetype.items():
        img = pick_archetype_image(arch, cards)
        if img:
            images[arch] = img

    images_file = os.path.join(DATA_DIR, f"city_league_images{suffix}.json")
    with open(images_file, "w", encoding="utf-8") as f:
        json.dump(images, f, ensure_ascii=False, separators=(",", ":"))
    size_kb = os.path.getsize(images_file) / 1024
    print(f"  -> {os.path.basename(images_file)}: {len(images)} archetypes, {size_kb:.1f} KB")

    # 2. Build per-archetype JSON chunks
    chunks_dir = os.path.join(DATA_DIR, f"city_league_cards{suffix}")
    os.makedirs(chunks_dir, exist_ok=True)

    # Keep only the fields the app actually needs
    KEEP_FIELDS = [
        "period", "archetype", "card_name", "card_identifier",
        "total_count", "max_count", "deck_inclusion_count",
        "average_count", "average_count_overall",
        "total_decks_in_archetype", "percentage_in_archetype",
        "set_code", "set_number", "rarity", "type", "image_url",
        "is_ace_spec", "tournament_id", "tournament_date", "date",
        "total_decks_in_archetype_in_period",
    ]

    total_chunk_size = 0
    for arch, cards in rows_by_archetype.items():
        # Sanitize archetype name for filename
        safe_name = re.sub(r'[^\w\s-]', '', arch).strip().replace(" ", "_").lower()
        if not safe_name:
            safe_name = "unknown"

        # Keep only needed fields, skip empty/null values
        slim_cards = []
        for c in cards:
            slim = {}
            for field in KEEP_FIELDS:
                val = c.get(field, "")
                if val:
                    slim[field] = val
            slim_cards.append(slim)

        chunk_file = os.path.join(chunks_dir, f"{safe_name}.json")
        with open(chunk_file, "w", encoding="utf-8") as f:
            json.dump(slim_cards, f, ensure_ascii=False, separators=(",", ":"))
        total_chunk_size += os.path.getsize(chunk_file)

    # 3. Build a manifest mapping archetype → chunk filename
    manifest = {}
    for arch in rows_by_archetype:
        safe_name = re.sub(r'[^\w\s-]', '', arch).strip().replace(" ", "_").lower()
        if not safe_name:
            safe_name = "unknown"
        manifest[arch] = safe_name

    manifest_file = os.path.join(DATA_DIR, f"city_league_manifest{suffix}.json")
    with open(manifest_file, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, separators=(",", ":"))

    chunk_avg = total_chunk_size / max(len(rows_by_archetype), 1) / 1024
    print(f"  -> {len(rows_by_archetype)} chunk files in city_league_cards{suffix}/")
    print(f"     Total: {total_chunk_size/1024:.0f} KB, avg: {chunk_avg:.1f} KB/archetype")
    print(f"  -> {os.path.basename(manifest_file)}: archetype→filename mapping")


def main():
    print("=== City League JSON Preprocessor ===")
    print()
    for suffix, label in [("", "M4 (Current)"), ("_M3", "M3 (Past)")]:
        print(f"Processing {label}...")
        process_format(suffix)
        print()
    print("Done! The app can now lazy-load per-archetype data.")


if __name__ == "__main__":
    main()
