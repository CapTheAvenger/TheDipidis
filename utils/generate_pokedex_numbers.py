"""
Generate data/pokemon_dex_numbers.json
Maps lowercase Pokémon name → National Pokédex number (1-1025).
Fetches from PokéAPI (free, public). Run once after setup.
"""
import json
import requests
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from card_scraper_shared import get_data_dir

OUTPUT_FILE = os.path.join(get_data_dir(), "pokemon_dex_numbers.json")


def fetch_all_pokemon():
    """Fetch all Pokémon species from PokéAPI."""
    print("Fetching Pokémon list from PokéAPI…")
    url = "https://pokeapi.co/api/v2/pokemon-species?limit=10000"
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    species = data.get("results", [])
    print(f"  → {len(species)} species found")
    return species


def extract_dex_number(url: str) -> int:
    """Extract the dex number from the species URL (e.g. .../pokemon-species/25/)."""
    parts = url.rstrip("/").split("/")
    return int(parts[-1])


def build_lookup(species: list) -> dict:
    """Build name → dex_number dict."""
    lookup = {}
    for entry in species:
        name = entry["name"].lower()  # e.g. "bulbasaur", "mr-mime", "ho-oh"
        dex_no = extract_dex_number(entry["url"])
        lookup[name] = dex_no
        # Also store with spaces instead of hyphens for easier matching
        if "-" in name:
            lookup[name.replace("-", " ")] = dex_no
    return lookup


def main():
    species = fetch_all_pokemon()
    lookup = build_lookup(species)

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(lookup, f, ensure_ascii=False, separators=(",", ":"))

    print(f"✅ Saved {len(lookup)} entries → {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
