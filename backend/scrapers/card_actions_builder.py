#!/usr/bin/env python3
"""
Card Actions Builder
====================
Reads the local card database (data/cards_chunk*.json) and generates/updates
data/card_actions.json with automation entries for the Playtester.

Strategy
--------
1. Load all cards_chunk*.json  →  build name → [print_codes] lookup
2. For each card name defined in NAME_ACTION_MAP, collect all known print codes
3. Optionally enrich with Pokémon TCG API text (--api flag)
4. Merge into existing card_actions.json without overwriting curated entries

Run:
    python card_actions_builder.py            # local DB only
    python card_actions_builder.py --dry-run  # preview only, no write
    python card_actions_builder.py --api      # + TCG API text lookup
"""

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

_SCRIPT_DIR = Path(__file__).parent
_PROJECT_ROOT = _SCRIPT_DIR.parent.parent
_DATA_DIR = _PROJECT_ROOT / "data"

TRAINER_TYPES = {"Item", "Supporter", "Tool", "Stadium", "Item/Technical Machine"}

# ---------------------------------------------------------------------------
# NAME → ACTION MAPPING
# Each entry: card_name → dict with at least 'action', optionally 'actionParam',
#             'description', and 'triggerZone'.
# Actions must correspond to a key in _PT_TRAINER_ACTIONS in playtester.js.
# ---------------------------------------------------------------------------
NAME_ACTION_MAP = {
    # ── Supporters ──────────────────────────────────────────────────────────
    "Judge":                     {"action": "judge",          "description": "Both players shuffle hand into deck and draw 4"},
    "Iono":                      {"action": "iono",           "description": "Both players shuffle hand into deck; draw = prize count"},
    "Boss's Orders":             {"action": "boss-orders",    "description": "Switch opponent's Benched Pokémon to Active"},
    "Boss's Orders (Cyrus)":     {"action": "boss-orders",    "description": "Switch opponent's Benched Pokémon to Active"},
    "Boss's Orders (Giovanni)":  {"action": "boss-orders",    "description": "Switch opponent's Benched Pokémon to Active"},
    "Arven":                     {"action": "deck-search",    "description": "Search deck for Item + Tool card"},
    "Carmine":                   {"action": "carmine",        "description": "Discard hand, draw 5 cards"},
    "Lillie's Determination":    {"action": "lillie",         "description": "Shuffle hand into deck, draw 6 (8 if 6 prizes remain)"},
    "Dawn":                      {"action": "deck-search",    "description": "Search deck for Basic, Stage 1, and Stage 2 Pokémon"},
    "Hilda":                     {"action": "deck-search",    "description": "Search deck for Evolution Pokémon + Energy"},
    "Crispin":                   {"action": "deck-search",    "description": "Search deck for up to 2 Basic Energy of different types"},
    "Lacey":                     {"action": "deck-search",    "description": "Search deck for a colorless Pokémon"},
    "Team Rocket's Petrel":      {"action": "deck-search",    "description": "Search deck for a Trainer card"},
    "Ciphermaniac's Codebreaking": {"action": "ciphermaniac", "description": "Search deck for 2 cards, place on top"},

    # Professor / Research type (discard hand, draw 7)
    "Professor's Research":       {"action": "prof-research", "description": "Discard hand, draw 7"},
    "Professor's Research (Professor Magnolia)": {"action": "prof-research", "description": "Discard hand, draw 7"},
    "Professor's Research (Professor Sada)":     {"action": "prof-research", "description": "Discard hand, draw 7"},
    "Professor's Research (Professor Turo)":     {"action": "prof-research", "description": "Discard hand, draw 7"},
    "Professor Elm's Lecture":   {"action": "prof-research",  "description": "Discard hand, draw 7"},
    "Professor Sycamore":        {"action": "prof-research",  "description": "Discard hand, draw 7"},
    "Professor Kukui":           {"action": "prof-research",  "description": "Discard hand, draw 7 (also +20 damage)"},
    "Professor Oak":             {"action": "prof-research",  "description": "Discard hand, draw 7"},
    "Professor Juniper":         {"action": "prof-research",  "description": "Discard hand, draw 7"},

    # ── Items ────────────────────────────────────────────────────────────────
    "Nest Ball":                 {"action": "deck-search",    "description": "Search deck for Basic Pokémon"},
    "Ultra Ball":                {"action": "ultra-ball",     "description": "Discard 2 cards from hand, search deck for any Pokémon"},
    "Great Ball":                {"action": "deck-search",    "description": "Look at top 7 cards, pick a Pokémon"},
    "Buddy-Buddy Poffin":        {"action": "deck-search",    "description": "Search deck for up to 2 Basic Pokémon with 70 HP or less"},
    "Prime Catcher":             {"action": "boss-orders",    "description": "Gust + switch your own active with bench"},
    "Counter Catcher":           {"action": "boss-orders",    "description": "If behind on prizes: gust opponent's bench"},
    "Earthen Vessel":            {"action": "discard-retrieve","description": "Discard a Pokémon from hand, get 2 Basic Energy from deck"},
    "Night Stretcher":           {"action": "discard-retrieve","description": "Put Pokémon or Basic Energy from discard to hand"},
    "Wondrous Patch":            {"action": "discard-retrieve","description": "Attach Basic Psychic Energy from discard to benched Psychic Pokémon"},
    "Fighting Gong":             {"action": "deck-search",    "description": "Search deck for Basic Fighting Energy or Basic Fighting Pokémon"},
    "Poké Pad":                  {"action": "deck-search",    "description": "Search deck for Pokémon without a Rule Box"},
    "Pokégear 3.0":              {"action": "look-top-supporter", "actionParam": 7, "description": "Look at top 7 cards, take a Supporter"},
    "Secret Box":                {"action": "secret-box",     "description": "Discard 3, search for Item + Tool + Supporter + Stadium"},
    "Unfair Stamp":              {"action": "unfair-stamp",   "description": "Both shuffle hand; you draw 5, opponent draws 2"},
    "Tool Scrapper":             {"action": "tool-scrapper",  "description": "Remove up to 2 Pokémon Tools from play"},
    "Energy Switch":             {"action": "energy-switch",  "description": "Move a Basic Energy between your Pokémon"},
    "Switch":                    {"action": "switch-active",  "description": "Switch your Active Pokémon with a Bench Pokémon"},
    "Switch Cart":               {"action": "switch-active",  "description": "Switch your Active Pokémon with a Bench Pokémon; heal 30"},
    "Escape Rope":               {"action": "switch-active",  "description": "Both players switch active Pokémon"},
    "Ciphermaniac's Codebreaking": {"action": "ciphermaniac", "description": "Search deck for 2 cards, put on top"},
    "Energy Search":             {"action": "deck-search",    "description": "Search deck for a Basic Energy card"},
    "Rare Candy":                {"action": "deck-search",    "description": "Evolve a Basic to Stage 2, skipping Stage 1"},
    "Level Ball":                {"action": "deck-search",    "description": "Search deck for Pokémon with 90 HP or less"},
    "Quick Ball":                {"action": "deck-search",    "description": "Discard a card, search deck for Basic Pokémon"},
    "Evolution Incense":         {"action": "deck-search",    "description": "Search deck for Evolution Pokémon"},
    "Air Balloon":               {"action": "deck-search",    "description": "Tool: free retreat for Pokémon with 2 energy retreat cost"},
    "Crispin":                   {"action": "deck-search",    "description": "Search for up to 2 Basic Energy of different types"},

    # Pokégear variants
    "Pokégear 3.0":              {"action": "look-top-supporter", "actionParam": 7},
}

# ---------------------------------------------------------------------------
# Default triggerZone per subtype
# ---------------------------------------------------------------------------
ZONE_BY_TYPE = {
    "Item": "playzone",
    "Supporter": "playzone",
    "Tool": "active",   # tools go on Pokémon zones
    "Stadium": "stadium",
    "Item/Technical Machine": "playzone",
}


def load_all_chunks(data_dir: Path) -> list[dict]:
    cards = []
    for p in sorted(data_dir.glob("cards_chunk*.json")):
        try:
            with open(p, encoding="utf-8") as f:
                chunk = json.load(f)
            if isinstance(chunk, list):
                cards.extend(chunk)
            elif isinstance(chunk, dict):
                for v in chunk.values():
                    if isinstance(v, list):
                        cards.extend(v)
                    elif isinstance(v, dict):
                        cards.append(v)
        except Exception as e:
            print(f"  [WARN] Could not load {p.name}: {e}")
    return cards


def build_name_to_prints(cards: list[dict]) -> dict[str, set]:
    """Build mapping: card_name → set of SetCode-Number print codes."""
    mapping: dict[str, set] = {}
    for c in cards:
        if c.get("type", "") not in TRAINER_TYPES:
            continue
        name = (c.get("name_en") or "").strip()
        if not name:
            continue
        # Primary print from set+number
        primary = f"{c.get('set','')}-{c.get('number','')}".upper().strip("-")
        # Additional prints from international_prints field (comma-separated)
        extras_raw = c.get("international_prints", "") or ""
        extras = [p.strip().upper() for p in re.split(r"[,;]+", extras_raw) if p.strip()]
        all_prints = set(extras)
        if primary:
            all_prints.add(primary)
        if name not in mapping:
            mapping[name] = set()
        mapping[name].update(all_prints)
    return mapping


def build_new_entries(
    name_to_prints: dict[str, set],
    existing_data: dict,
    existing_prints: set[str],
) -> tuple[list[dict], list[tuple[int, list[str]]]]:
    """
    Returns (new_entries, print_additions).
    - new_entries: entirely new cards to append
    - print_additions: (index_in_existing_trainers, new_prints) for cards already present
    """
    # Build lookup: cardName -> index in existing trainers list
    name_to_idx: dict[str, int] = {}
    for i, e in enumerate(existing_data.get("trainers", [])):
        cname = e.get("cardName", "")
        if cname and cname not in name_to_idx:
            name_to_idx[cname] = i

    new_entries = []
    print_additions = []

    for card_name, action_info in NAME_ACTION_MAP.items():
        prints = name_to_prints.get(card_name, set())
        new_prints = sorted(prints - existing_prints)
        if not prints and card_name not in name_to_prints:
            print(f"  [MISS] '{card_name}' not found in local DB - skipped")
            continue
        if not new_prints:
            print(f"  [SKIP] '{card_name}' - all {len(prints)} print(s) already in card_actions.json")
            continue

        if card_name in name_to_idx:
            # Merge new prints into existing entry
            idx = name_to_idx[card_name]
            print_additions.append((idx, new_prints))
            print(f"  [MERGE] '{card_name}' -> +{len(new_prints)} print(s) into existing entry")
        else:
            slug = re.sub(r"[^a-z0-9]+", "-", card_name.lower()).strip("-")
            entry = {
                "id": slug,
                "cardName": card_name,
                "action": action_info["action"],
                "triggerZone": action_info.get("triggerZone", "playzone"),
            }
            if "actionParam" in action_info:
                entry["actionParam"] = action_info["actionParam"]
            entry["prints"] = new_prints
            if "description" in action_info:
                entry["description"] = action_info["description"]
            new_entries.append(entry)
            print(f"  [ADD]  '{card_name}' -> action={action_info['action']}, {len(new_prints)} new print(s)")

    return new_entries, print_additions


def get_existing_prints(data: dict) -> set[str]:
    """Collect all print codes already present in card_actions.json."""
    existing = set()
    for section in ("trainers", "abilities"):
        for entry in data.get(section, []):
            for p in entry.get("prints", []):
                existing.add(p.upper())
    return existing


def try_enrich_from_api(card_name: str, delay: float = 0.5) -> str | None:
    """Optionally fetch card text from api.pokemontcg.io."""
    try:
        import urllib.request
        import urllib.parse
        q = urllib.parse.quote(f'name:"{card_name}" supertype:Trainer')
        url = f"https://api.pokemontcg.io/v2/cards?q={q}&pageSize=1&select=name,rules"
        req = urllib.request.Request(url, headers={"User-Agent": "TheDipidis/1.0"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read())
        cards = data.get("data", [])
        if cards and cards[0].get("rules"):
            return " ".join(cards[0]["rules"])
    except Exception:
        pass
    finally:
        time.sleep(delay)
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description="Build/update card_actions.json from local card DB")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing")
    parser.add_argument("--api", action="store_true", help="Enrich with Pokémon TCG API card text")
    args = parser.parse_args()

    actions_path = _DATA_DIR / "card_actions.json"

    # Load existing
    existing_data: dict = {"trainers": [], "abilities": []}
    if actions_path.exists():
        with open(actions_path, encoding="utf-8") as f:
            existing_data = json.load(f)
    existing_prints = get_existing_prints(existing_data)
    print(f"Existing card_actions.json: {len(existing_data.get('trainers',[]))} trainers, "
          f"{len(existing_prints)} total prints tracked")

    # Load local card chunks
    print(f"\nLoading card chunks from {_DATA_DIR} …")
    cards = load_all_chunks(_DATA_DIR)
    trainer_cards = [c for c in cards if c.get("type", "") in TRAINER_TYPES]
    print(f"  {len(cards)} total cards, {len(trainer_cards)} trainers/items/tools/stadiums")

    name_to_prints = build_name_to_prints(trainer_cards)
    print(f"  {len(name_to_prints)} unique trainer names in local DB\n")

    # Generate new entries + print merges
    new_entries, print_additions = build_new_entries(name_to_prints, existing_data, existing_prints)

    # Optional API enrichment
    if args.api and new_entries:
        print("\nFetching card text from Pokemon TCG API ...")
        for entry in new_entries:
            text = try_enrich_from_api(entry["cardName"])
            if text:
                entry["description"] = text[:200]
                print(f"  [API]  '{entry['cardName']}': {text[:80]}...")

    if not new_entries and not print_additions:
        print("\nOK: Nothing new to add - card_actions.json is up to date.")
        return

    print(f"\n{len(new_entries)} new entr{'ies' if len(new_entries) != 1 else 'y'}, "
          f"{len(print_additions)} existing entr{'ies' if len(print_additions) != 1 else 'y'} with new prints.")

    if args.dry_run:
        if new_entries:
            print("\n[DRY RUN] Would add:")
            print(json.dumps(new_entries, indent=2, ensure_ascii=False))
        if print_additions:
            print("\n[DRY RUN] Would merge prints into existing entries:")
            for idx, prints in print_additions:
                name = existing_data["trainers"][idx].get("cardName", f"idx={idx}")
                print(f"  +{len(prints)} print(s) -> '{name}': {prints[:3]}{'...' if len(prints) > 3 else ''}")
        return

    # Apply print merges into existing entries
    existing_data.setdefault("trainers", [])
    for idx, prints in print_additions:
        existing_prints_for_entry = set(existing_data["trainers"][idx].get("prints", []))
        merged = sorted(existing_prints_for_entry | set(prints))
        existing_data["trainers"][idx]["prints"] = merged

    # Append new entries
    existing_data["trainers"].extend(new_entries)

    # Deduplicate entries by cardName (keep first occurrence, merge prints)
    seen: dict[str, int] = {}
    deduped = []
    for entry in existing_data["trainers"]:
        cname = entry.get("cardName", "")
        if cname in seen:
            # Merge prints into the already-kept entry
            kept = deduped[seen[cname]]
            existing_set = set(kept.get("prints", []))
            existing_set.update(entry.get("prints", []))
            kept["prints"] = sorted(existing_set)
        else:
            seen[cname] = len(deduped)
            deduped.append(entry)
    existing_data["trainers"] = deduped

    # Sort by cardName
    existing_data["trainers"].sort(key=lambda e: e.get("cardName", "").lower())

    with open(actions_path, "w", encoding="utf-8") as f:
        json.dump(existing_data, f, indent=2, ensure_ascii=False)

    print(f"\nOK: card_actions.json updated - {len(existing_data['trainers'])} total trainer entries.")


if __name__ == "__main__":
    main()
