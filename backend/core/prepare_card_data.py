#!/usr/bin/env python3
"""
Card Database Updater - FAST EDITION
====================================
Merges English cards, Japanese cards, Prices AND Pokédex Numbers
into the final JSON for the frontend.
Then syncs all scraper output (tournaments, meta, city league) to the
frontend ``data/`` folder so the dashboard serves current data.
"""

import hashlib
import json
import csv
import os
import re
import shutil
import sys
from typing import List, Dict
from card_scraper_shared import get_data_dir, get_app_path, setup_console_encoding, load_set_order, card_sort_key


def _uf_find(parent: list, x: int) -> int:
    """Path-compressed union-find lookup. parent[i] is the index of
    i's parent; following the chain until parent[x] == x yields the
    root. Compresses each visited node's parent to the root as it
    goes so subsequent lookups are O(1)."""
    while parent[x] != x:
        parent[x] = parent[parent[x]]
        x = parent[x]
    return x


def _uf_union(parent: list, a: int, b: int) -> None:
    """Merge the components of a and b. No-op when they already share
    a root."""
    ra, rb = _uf_find(parent, a), _uf_find(parent, b)
    if ra != rb:
        parent[ra] = rb


def _file_md5(path: str, chunk_size: int = 1 << 20) -> str:
    """Streaming md5 — chunked so we don't read 50 MB CSVs into memory.
    Used by sync_scraper_data_to_frontend to decide whether the
    destination file already matches the source byte-for-byte."""
    h = hashlib.md5()
    with open(path, 'rb') as f:
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()

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
    dex_path = os.path.join(get_data_dir(), 'pokemon_dex_numbers.json')
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
    
    data_dir = get_data_dir()
    project_root = os.path.dirname(os.path.dirname(get_app_path()))
    frontend_data = os.path.join(project_root, "data")

    english_cards = load_csv(os.path.join(data_dir, 'all_cards_database.csv'))
    japanese_cards = load_csv(os.path.join(data_dir, 'japanese_cards_database.csv'))
    pokedex = load_pokedex()

    # Merge price data from both backend and frontend sources.
    # The frontend file may contain a more complete set of prices from
    # previous scraper runs, while the backend file holds the latest scrape.
    # We load backend prices first, then overlay frontend prices so that
    # the larger, more complete dataset fills gaps. Finally, any backend
    # entry that is strictly newer (by last_updated) gets a chance to win.
    prices_dict = {}
    frontend_prices = os.path.join(frontend_data, 'price_data.csv')
    backend_prices = os.path.join(data_dir, 'price_data.csv')
    # Load frontend prices first (may be more complete from prior runs)
    for p in load_csv(frontend_prices):
        key = f"{p.get('set')}_{p.get('number')}"
        if p.get('eur_price'):
            prices_dict[key] = p
    fe_count = len(prices_dict)
    # Backend prices override when they are newer (latest scrape).
    # Exception: a frontend row carrying eur_low comes from the Cardmarket
    # merger and is authoritative — never let a Limitless backend row
    # overwrite it (would clobber the trend+low pair).
    be_override = 0
    for p in load_csv(backend_prices):
        key = f"{p.get('set')}_{p.get('number')}"
        if not p.get('eur_price'):
            continue
        existing = prices_dict.get(key)
        if not existing:
            prices_dict[key] = p
            be_override += 1
        elif existing.get('eur_low'):
            continue  # frontend row is from Cardmarket — keep it
        else:
            be_ts = p.get('last_updated', '')
            fe_ts = existing.get('last_updated', '')
            if be_ts >= fe_ts:
                prices_dict[key] = p
                be_override += 1
    print(f"✓ Preise geladen: {len(prices_dict)} Einträge ({fe_count} frontend, {be_override} backend-override)")
    en_keys = {f"{c.get('set')}_{c.get('number')}" for c in english_cards}
    jp_to_add = [c for c in japanese_cards if f"{c.get('set')}_{c.get('number')}" not in en_keys]

    # Tag JP-only rows so the frontend can render an honest
    # "Japan-only, no Cardmarket listing" affordance instead of an
    # empty price field that reads like a scrape failure. Without
    # this flag, the audit can't tell apart "we have an EN card and
    # missed its price" (real bug) from "this card never released
    # in EN — Cardmarket has nothing to list" (working as intended).
    # The big offenders are JP promo sets (SP, SVP, SMP, M4) where
    # 100s of cards exist on the Limitless JP scan side but have no
    # EN/Cardmarket counterpart.
    for c in jp_to_add:
        c['jp_only'] = True

    merged_cards = english_cards + jp_to_add
    
    match_count = 0
    
    for card in merged_cards:
        if 'name' in card and 'name_en' not in card:
            card['name_en'] = card.pop('name')
            
        key = f"{card.get('set')}_{card.get('number')}"
        
        if key in prices_dict:
            card['eur_price'] = prices_dict[key].get('eur_price', '')
            card['eur_low'] = prices_dict[key].get('eur_low', '')
            card['price_last_updated'] = prices_dict[key].get('last_updated', '')
        else:
            card['eur_price'] = card.get('eur_price', '')
            card['eur_low'] = card.get('eur_low', '')
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

    # ── Unify international_prints via transitive closure ──
    # Two cards with the same name are "connected" when their int-print lists
    # overlap. We grow each group transitively so that newer reprints (e.g.
    # POR-81 → ASC-198) propagate back to older entries, WITHOUT merging
    # functionally different cards (e.g. Riolu ASC-112 vs Riolu PRE-50).
    from collections import defaultdict

    # Group cards by name
    cards_by_name = defaultdict(list)
    for card in merged_cards:
        name = (card.get('name_en') or '').strip()
        if name:
            cards_by_name[name].append(card)

    unified_count = 0
    for name, group in cards_by_name.items():
        # Parse each card's int-print set
        card_sets = []
        for card in group:
            ip = (card.get('international_prints') or '').strip()
            ids = set(t.strip() for t in ip.split(',') if t.strip()) if ip else set()
            # Ensure card's own ID is always present
            own_id = f"{card.get('set','')}-{card.get('number','')}"
            if own_id and own_id != '-':
                ids.add(own_id)
            card_sets.append(ids)

        # Build transitive closure groups via union-find. The parent
        # array gets reused for the whole iteration; find/union take
        # it as an explicit parameter rather than closing over the
        # loop-scoped name (ruff B023). Functional difference is nil
        # — the closures only ran inside one iteration anyway — but
        # the parameter form makes the contract obvious.
        parent = list(range(len(group)))

        for i in range(len(group)):
            for j in range(i + 1, len(group)):
                if card_sets[i] & card_sets[j]:  # overlapping sets
                    _uf_union(parent, i, j)

        # Merge int-prints within each group
        groups = defaultdict(set)
        for i in range(len(group)):
            groups[_uf_find(parent, i)].update(card_sets[i])

        # Write back unified prints
        for i, card in enumerate(group):
            merged_ip = ','.join(sorted(groups[_uf_find(parent, i)]))
            old_ip = (card.get('international_prints') or '').strip()
            if merged_ip != old_ip:
                card['international_prints'] = merged_ip
                unified_count += 1

    if unified_count:
        print(f"✓ international_prints vereinheitlicht bei {unified_count} Karten.")

    json_path = os.path.join(data_dir, 'all_cards_merged.json')
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump({'cards': merged_cards}, f, ensure_ascii=False, indent=2)
        
    csv_path = os.path.join(data_dir, 'all_cards_merged.csv')
    fieldnames = ['name_en', 'name_de', 'set', 'number', 'pokedex_number', 'type', 'energy_type', 'rarity', 'image_url', 'international_prints', 'cardmarket_url', 'eur_price', 'eur_low', 'price_last_updated']
    
    with open(csv_path, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(merged_cards)
        
    print(f"✓ Erfolgreich {len(merged_cards)} Karten für das Frontend exportiert!")
    print(f"✓ Pokédex-Nummern gefunden für: {match_count} Pokémon")

    # Generate chunked JSON files for fast frontend loading
    os.makedirs(frontend_data, exist_ok=True)
    split_card_database_chunks(merged_cards, frontend_data)


# ============================================================================
# CARD DATABASE CHUNKING (standard / extended / legacy)
# ============================================================================

# Standard rotation boundary — sets with set_order >= this value.
# Update this value when the Pokemon TCG standard format rotates.
STANDARD_MIN_ORDER = 136   # TEF and newer

# Extended boundary — sets >= this and < STANDARD_MIN_ORDER
EXTENDED_MIN_ORDER = 113   # SSH and newer

# Promo sets span multiple eras; assign them to standard for fast first-load.
PROMO_ERA_SETS = {"SVP", "MEP", "SP", "HSP", "SMP", "SV", "SWSHP"}


def _is_new_set_unknown_to_set_order(set_code: str, set_order: dict) -> bool:
    """A set we encountered but sets.json doesn't know about. Happens
    when update_sets.py crashed before refreshing sets.json — a brand
    new rotation hits all_cards_database.csv before its order entry
    lands. Without a special-case we'd classify it as order=0 (=
    legacy) and the new cards would silently vanish from the
    Standard chunk that the deck builder reads."""
    code = (set_code or '').strip().upper()
    if not code:
        return False
    if code in set_order or any(k.upper() == code for k in set_order.keys()):
        return False
    if code in PROMO_ERA_SETS or code in SUPERSEDED_SETS:
        return False
    return True

# Sets that are superseded by a later release and should be excluded from the
# card database entirely. Preview sets that got a proper release under a
# different name (often with slightly different card names — e.g. "Rock
# Fighting Energy" in M3 → "Rocky Fighting Energy" in POR) leave stale
# autocomplete suggestions if kept around, so we drop them here.
SUPERSEDED_SETS = {"M3"}  # POR fully supersedes M3 (115 of 116 cards duplicated)


def split_card_database_chunks(all_cards: list, frontend_data: str):
    """Split all_cards_merged data into era-based JSON chunks + manifest.

    Creates:
      - data/cards_chunk_standard.json
      - data/cards_chunk_extended.json
      - data/cards_chunk_legacy.json
      - data/cards_manifest.json
    """
    set_order = load_set_order()

    # Backfill energy_type from data/energy_type_map.json if the
    # incoming cards lost the field somewhere upstream. The chunks
    # used to be regenerated weekly without energy_type because the
    # source CSV doesn't carry it; the frontend Element Type filter
    # then returned zero results for Fighting / Fire / etc. because
    # every chunked card had `energy_type === undefined`. Patching
    # here keeps the field on every Pokémon print across auto-updates
    # without needing to re-scrape Limitless every run.
    energy_map_path = os.path.join(frontend_data, "energy_type_map.json")
    energy_map = {}
    if os.path.exists(energy_map_path):
        try:
            with open(energy_map_path, "r", encoding="utf-8") as f:
                energy_map = json.load(f) or {}
        except Exception as e:
            print(f"  warn: failed to read energy_type_map.json — {e}")
    if energy_map:
        patched = 0
        for c in all_cards:
            if c.get("energy_type"):
                continue
            s = (c.get("set") or "").upper().strip()
            n = str(c.get("number") or "").strip()
            if not s or not n:
                continue
            key = f"{s}::{n}"
            v = energy_map.get(key)
            if v:
                c["energy_type"] = v
                patched += 1
        if patched:
            print(f"  backfilled energy_type on {patched} cards from energy_type_map.json")

    standard, extended, legacy = [], [], []
    dropped_superseded = 0
    unknown_sets_promoted = set()

    for card in all_cards:
        set_code = (card.get("set") or "").strip()

        # Drop superseded preview sets (e.g. M3 → POR rename)
        if set_code.upper() in SUPERSEDED_SETS:
            dropped_superseded += 1
            continue

        order = set_order.get(set_code, set_order.get(set_code.upper(), 0))

        # New-set safety net: a set with order==0 + not in sets.json is
        # almost always a fresh rotation set whose order entry hasn't
        # been written yet (update_sets.py is supposed to populate it
        # but can silently skip on Cloudflare blocks). Route it to
        # Standard rather than letting order=0 default it into Legacy,
        # where the deck builder would never load it. We log every
        # unknown set we promote so the operator can confirm.
        if order == 0 and _is_new_set_unknown_to_set_order(set_code, set_order):
            unknown_sets_promoted.add(set_code.upper())
            standard.append(card)
            continue

        if set_code.upper() in PROMO_ERA_SETS or order >= STANDARD_MIN_ORDER:
            standard.append(card)
        elif order >= EXTENDED_MIN_ORDER:
            extended.append(card)
        else:
            legacy.append(card)

    if dropped_superseded:
        print(f"  dropped {dropped_superseded} cards from superseded sets: {sorted(SUPERSEDED_SETS)}")
    if unknown_sets_promoted:
        print(
            f"  WARN: promoted {len(unknown_sets_promoted)} unknown set(s) to Standard "
            f"(no order in sets.json yet): {sorted(unknown_sets_promoted)}. "
            f"Re-run update_sets.py to refresh sets.json + sets_metadata.json."
        )

    import hashlib

    def _write_chunk(filename, cards):
        path = os.path.join(frontend_data, filename)
        raw = json.dumps(cards, ensure_ascii=False, separators=(",", ":"))
        with open(path, "w", encoding="utf-8") as f:
            f.write(raw)
        h = hashlib.md5(raw.encode("utf-8")).hexdigest()[:8]
        return h

    h_std = _write_chunk("cards_chunk_standard.json", standard)
    h_ext = _write_chunk("cards_chunk_extended.json", extended)
    h_leg = _write_chunk("cards_chunk_legacy.json", legacy)

    # Manifest version = hash of all chunk hashes → changes when any card changes
    version = hashlib.md5(f"{h_std}{h_ext}{h_leg}".encode()).hexdigest()[:12]

    # Count cards AFTER the SUPERSEDED-set filter so the totalCards
    # field matches what the chunks actually contain. Earlier we
    # used len(all_cards) which still included M3-preview cards that
    # got dropped by the loop above, producing a 116-card phantom
    # diff (manifest claimed 21364, chunks had 21248). The mismatch
    # was harmless for rendering but caused the cache-key hash to
    # rotate on runs where the only change was the superseded-drop
    # count, triggering unnecessary IndexedDB invalidations.
    chunked_total = len(standard) + len(extended) + len(legacy)
    manifest = {
        "version": version,
        "generated": __import__("datetime").datetime.now().astimezone().isoformat(),
        "totalCards": chunked_total,
        "chunks": [
            {"file": "cards_chunk_standard.json", "era": "standard", "count": len(standard), "hash": h_std},
            {"file": "cards_chunk_extended.json", "era": "extended", "count": len(extended), "hash": h_ext},
            {"file": "cards_chunk_legacy.json",   "era": "legacy",   "count": len(legacy),   "hash": h_leg},
        ],
    }
    manifest_path = os.path.join(frontend_data, "cards_manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print(f"\n✓ Card-DB-Chunks generiert: standard={len(standard)}, extended={len(extended)}, legacy={len(legacy)}")
    print(f"  Manifest-Version: {version}")


# ============================================================================
# SYNC SCRAPER OUTPUT → FRONTEND data/
# ============================================================================

# Files that each scraper produces and the frontend needs.
# Patterns are matched with str.startswith against filenames in backend/core/data/.
SYNC_PATTERNS = [
    # Card master databases — produced by all_cards_scraper +
    # japanese_cards_scraper. These scrapers use get_data_dir()
    # → backend/core/data/, so the sync step is what gets them
    # back into the project-root data/ that the frontend ships.
    # Without them in SYNC_PATTERNS, a CI run writes only to
    # backend/core/data/ and the frontend stays frozen — exactly
    # how the 2026-05-22 CRI rotation produced empty Card DB
    # entries for ~2 weeks. PR #246 also adds an explicit
    # mid-batch mirror after all_cards_scraper so the downstream
    # cardmarket_id_mapper sees the fresh CSV (the end-of-batch
    # sync would have been too late for that consumer).
    #
    # NOTE: cardmarket_id_mapping.csv, price_data.csv and
    # pokemon_card_text.json deliberately stay OUT of this list
    # even though they were briefly added in PR #242. Those three
    # scrapers (cardmarket_id_mapper, cardmarket_price_merger,
    # pokemon_card_text_scraper) all write DIRECTLY to the
    # project-root data/ via get_project_data_dir() — not to
    # backend/core/data/. Adding them to SYNC_PATTERNS made the
    # end-of-batch sync overwrite the freshly-written mapper /
    # merger output with the stale seed (which was the original
    # data/ from the start of the run). Result: CRI prices stayed
    # N/A even though the mapper had successfully produced them
    # in CI. They stay in ALLOWED_SEED_ONLY in the consistency
    # test (correctly labelled as "scraper writes directly to
    # data/, no backend sync needed").
    "all_cards_database.csv",
    "all_cards_database.json",
    "japanese_cards_database.csv",
    # Tournament Scraper JH  →  Past Meta tab
    "tournament_cards_data_cards.csv",
    "tournament_cards_data_overview.csv",
    # Current Meta Analysis  →  Current Meta tab
    "current_meta_card_data.csv",
    # City League Analysis  →  City League tab
    "city_league_analysis.csv",
    "city_league_archetypes.csv",
    "city_league_archetypes_comparison.csv",
    "city_league_archetypes_comparison_M3.csv",
    "city_league_archetypes_deck_stats.csv",
    # Past-meta snapshot — frozen at the last JP-set rotation by
    # city_league_past_analysis_scraper + city_league_past_archetype_scraper.
    # Frontend's "Past Meta" view reads these (replaces the legacy
    # _M3 archive once a real rotation has populated them).
    "city_league_analysis_past.csv",
    "city_league_archetypes_past.csv",
    "city_league_archetypes_past_comparison.csv",
    "city_league_archetypes_past_deck_stats.csv",
    # Limitless Online  →  Current Meta deck stats
    "limitless_online_decks.csv",
    "limitless_online_decks.html",
    "limitless_online_decks_comparison.csv",
    "limitless_online_decks_comparison.html",
    "limitless_online_decks_comparison_local.html",
    "limitless_online_decks_matchups.csv",
    # Labs Major Tournaments  →  Meta Call Predictor 2.0 Mode B
    "labs_tournament_decks.csv",
    "labs_tournament_matchups.csv",  # PR #199 — per-archetype matchup matrix (3:1 weight blend over online)
    "labs_tournaments.json",
    # Player-Continuity  →  Meta Call Predictor 5.8 (stickiness damp)
    # Per-(player × archetype × tournament) row from the labs standings
    # pages. Predictor 5.8 reads it to damp decks the previous-format
    # player base tried but didn't stick with (Lopunny / OMH / Cynthia /
    # Dragapult Dudunsparce — all <1.5 % returning-pilot rate at TEF-POR
    # despite >100 brought-count). Without this file present in data/,
    # the JS predictor silently no-ops the stickiness damper and the
    # over-callees come back. Synced for both reasons the labs files
    # are: incremental --resume needs the prior CSV as input, AND the
    # frontend reads from data/, not backend/core/data/.
    "player_continuity.csv",
    # Per-decklist scraper output — preserves per-(tournament × player ×
    # card) resolution that the existing aggregated pipeline collapses.
    # Frontend consumers: Most-Consistency deck-builder (success-weighted
    # card scoring), Past Meta "most successful list" display, Quick
    # Overview "best major / best online list" panels. Refreshed by
    # backend/scrapers/per_decklist_scraper.py (per-decklist-scrape.yml
    # workflow). Without this file the consumers fall back to the
    # archetype-aggregated stats — degraded gracefully but less precise.
    "tournament_decklists_per_player.csv",
    # Champions Side Quest — VGCPastes Google-Sheet derived team list.
    # Refreshed by backend/scrapers/champions_replica_scraper.py on the
    # weekly run; the Side Quest tab (js/app-side-quest.js) reads from
    # data/. Unrelated to the TCG predictor pipeline but uses the same
    # seed/sync infrastructure so the consistency test stays green.
    "champions_replica_teams.json",
    # Scraper state files — list of tournament IDs each scraper has
    # already processed. Synced back to data/ so the next CI run can
    # resume incrementally instead of re-scraping every tournament from
    # scratch each week (Cloudflare rate-limits made the from-scratch
    # path produce only partial data — see workflow seed step).
    "city_league_analysis_scraped.json",
    "city_league_analysis_past_scraped.json",
    "tournament_jh_scraped.json",
    "current_meta_scraped_tournaments.json",
    # Set metadata — produced by backend/core/update_sets.py and read
    # by the frontend (Meta Call format-filter, format-window display,
    # etc.). Without this in SYNC_PATTERNS, an Actions-side update_sets
    # run would write to backend/core/data/ and leave data/ stale.
    "sets.json",
    "sets_metadata.json",
    "format_window.json",
    # Formats catalog — produced by tournament_scraper_JH.update_formats_catalog
    # whenever a new format key shows up on Limitless (e.g. TEF-POR
    # added on the 2026-03-27 rotation). Seeded into the workflow's
    # input copy AND must sync back, otherwise CI runs would write the
    # update to backend/core/data/formats_catalog.json and the frontend
    # never sees the new format.
    "formats_catalog.json",
    # Card-text + threat intel — produced by pokemon_card_effects_scraper
    # + build_threat_intel.py and read by the consistency builder's
    # tech-audit step (Stage 3).
    "pokemon_card_effects.json",
    "active_threats.json",
    # Date-tagged online tournament data — produced as a second output
    # of current_meta_analysis_scraper.py (same crawl, dual emit).
    # Read by the deck-builder's time-decay scoring path.
    "online_tournament_dated_cards.csv",
]


def sync_scraper_data_to_frontend():
    """Copy scraper output from backend/core/data/ to the project-root data/ folder."""
    backend_data = get_data_dir()                       # backend/core/data/
    project_root = os.path.dirname(os.path.dirname(get_app_path()))
    frontend_data = os.path.join(project_root, "data")

    if os.path.normpath(backend_data) == os.path.normpath(frontend_data):
        print("  Backend- und Frontend-data sind identisch – kein Sync noetig.")
        return

    os.makedirs(frontend_data, exist_ok=True)

    print("\n" + "=" * 80)
    print("SYNCING SCRAPER DATA → FRONTEND  (backend/core/data/ → data/)")
    print("=" * 80)

    synced = 0
    skipped = 0
    for name in SYNC_PATTERNS:
        src = os.path.join(backend_data, name)
        dst = os.path.join(frontend_data, name)
        if not os.path.isfile(src):
            continue

        # Skip only when source and destination are content-identical.
        # The previous mtime+size check could declare "already current"
        # when a scrape wrote garbage that happened to match dst's size
        # — a real bug class that surfaced in the data integrity sweep.
        # Size comparison stays as the fast-path filter (different size
        # → definitely different); md5 only runs when size matches, so
        # the cost is bounded.
        if os.path.isfile(dst):
            if os.path.getsize(src) == os.path.getsize(dst):
                if _file_md5(src) == _file_md5(dst):
                    skipped += 1
                    continue

        shutil.copy2(src, dst)
        size_mb = os.path.getsize(dst) / (1024 * 1024)
        print(f"  ✓ {name}  ({size_mb:.1f} MB)")
        synced += 1

    print(f"\n✓ Sync abgeschlossen: {synced} Dateien kopiert, {skipped} bereits aktuell.")

    # After sync, split large tournament CSV into per-meta chunks
    split_tournament_cards(frontend_data)


def split_tournament_cards(frontend_data):
    """Split tournament_cards_data_cards.csv into per-meta chunk files.
    
    Creates:
      - data/tournament_cards_data_cards_<META>.csv  (one per meta period)
      - data/tournament_cards_manifest.json          (list of chunk filenames)
    
    The monolith CSV remains locally for backward compat but is .gitignored.
    """
    source = os.path.join(frontend_data, "tournament_cards_data_cards.csv")
    if not os.path.isfile(source):
        return

    print("\n" + "-" * 60)
    print("SPLITTING tournament_cards_data_cards.csv by meta")
    print("-" * 60)

    # Helper for parsing the "21st November 2025" tournament_date format
    # used in this CSV (ordinal day + month name + year).
    import re as _re
    _MONTHS = {m.lower(): i + 1 for i, m in enumerate([
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'])}
    _ORDINAL_RE = _re.compile(r'(\d+)(?:st|nd|rd|th)\s+(\w+)\s+(\d{4})', _re.I)

    def _parse_tournament_date(s):
        if not s:
            return None
        m = _ORDINAL_RE.match(s.strip())
        if not m:
            return None
        mon = m.group(2).lower()
        if mon not in _MONTHS:
            return None
        try:
            from datetime import datetime as _dt
            return _dt(int(m.group(3)), _MONTHS[mon], int(m.group(1)))
        except ValueError:
            return None

    # Read all rows, group by meta. Track min/max tournament_date per meta
    # so the manifest can carry chunk_dates — used by the frontend loader
    # to pick the chunk with the truly latest tournaments instead of the
    # last meta key in alphabetical order (BRS-PRE … SVI-PFL).
    meta_rows = {}
    meta_min_date = {}
    meta_max_date = {}
    fieldnames = None
    with open(source, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f, delimiter=";")
        fieldnames = reader.fieldnames
        for row in reader:
            meta = row.get("meta", "unknown").strip()
            if not meta:
                meta = "unknown"
            meta_rows.setdefault(meta, []).append(row)
            d = _parse_tournament_date(row.get("tournament_date", ""))
            if d:
                if meta not in meta_min_date or d < meta_min_date[meta]:
                    meta_min_date[meta] = d
                if meta not in meta_max_date or d > meta_max_date[meta]:
                    meta_max_date[meta] = d

    if not fieldnames or not meta_rows:
        print("  Keine Daten zum Splitten gefunden.")
        return

    # Write per-meta chunk files
    chunk_files = []
    skipped_writes = []
    for meta_key in sorted(meta_rows.keys()):
        rows = meta_rows[meta_key]
        chunk_name = f"tournament_cards_data_cards_{meta_key}.csv"
        chunk_path = os.path.join(frontend_data, chunk_name)

        # Truncation guard. If the monolith reassembly silently missed
        # historical chunks (the May 13 2026 auto-run lost LA's 1183
        # rows + every other format chunk this way), the new per-meta
        # group will be much smaller than the existing chunk. Overwriting
        # would permanently lose the historical data. Skip the overwrite
        # when the new chunk would shrink by ≥ 50 % on a chunk that
        # already has > 100 rows — log loud, let the operator investigate.
        existing_row_count = 0
        if os.path.isfile(chunk_path):
            try:
                with open(chunk_path, "r", encoding="utf-8-sig", newline="") as ef:
                    # Subtract 1 for header. Fast: count lines only.
                    existing_row_count = max(0, sum(1 for _ in ef) - 1)
            except OSError:
                existing_row_count = 0
        if existing_row_count > 100 and len(rows) < existing_row_count * 0.5:
            warn = (
                f"⚠ Refusing to truncate {chunk_name}: monolith has {len(rows)} "
                f"rows but existing chunk has {existing_row_count}. "
                f"Reassembly likely failed (chunks not seeded into "
                f"backend/core/data/?). Chunk left unchanged."
            )
            print(warn)
            skipped_writes.append({
                "chunk": chunk_name,
                "monolith_rows": len(rows),
                "existing_rows": existing_row_count,
            })
            chunk_files.append(chunk_name)  # still list in manifest — file exists
            continue

        # Dedup safety: TEF-CRI shipped 2x copies of every row in the
        # 2026-06 rotation (first-time meta-chunk creation hit a write
        # path that didn't dedupe). The frontend's aggregateCardStatsByDate
        # sums total_count across rows, so duplicates push every Pokémon /
        # Trainer card past the 4-copy legal cap → display freezes at
        # "Ø 4,00x" / "Ø 8,10x" for basic energies and the user can't
        # trust any avg-count number on the page. Dedup by the natural
        # primary key (tournament_id, archetype, card_name, card_identifier)
        # before writing so this can't recur even if the monolith gets
        # rebuilt with stray duplicates.
        seen_keys = set()
        deduped_rows = []
        dup_count = 0
        for row in rows:
            k = (
                str(row.get("tournament_id", "")).strip(),
                str(row.get("archetype", "")).strip(),
                str(row.get("card_name", "")).strip(),
                str(row.get("card_identifier", "")).strip(),
            )
            if k in seen_keys:
                dup_count += 1
                continue
            seen_keys.add(k)
            deduped_rows.append(row)
        if dup_count > 0:
            print(f"  ↪ {chunk_name}: dropped {dup_count} duplicate "
                  f"(tournament,archetype,card) rows before write")
        rows = deduped_rows

        with open(chunk_path, "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=";")
            writer.writeheader()
            writer.writerows(rows)

        size_mb = os.path.getsize(chunk_path) / (1024 * 1024)
        print(f"  ✓ {chunk_name}  ({len(rows)} Zeilen, {size_mb:.1f} MB)")
        chunk_files.append(chunk_name)

    # ALSO preserve chunks that exist on disk but weren't in this run's
    # monolith at all (zero rows for that meta_key). Without this the
    # manifest would forget e.g. SVI-PFL.csv just because Prague (TEF-POR)
    # was the only tournament re-scraped. The chunks themselves are never
    # touched in this branch — we just acknowledge them in the manifest.
    try:
        for fname in sorted(os.listdir(frontend_data)):
            if not fname.startswith("tournament_cards_data_cards_"):
                continue
            if not fname.endswith(".csv"):
                continue
            if fname == "tournament_cards_data_cards.csv":
                continue
            if fname not in chunk_files:
                chunk_files.append(fname)
                meta_from_name = fname.replace("tournament_cards_data_cards_", "").replace(".csv", "")
                if meta_from_name not in meta_rows:
                    meta_rows[meta_from_name] = []  # tracked for manifest below
                print(f"  ↪ {fname}  (preserved — not in this run's monolith)")
    except OSError:
        pass

    # Write manifest. chunk_dates is consumed by the frontend loader to
    # pick "latest" by real recency (max_date) — the meta keys are
    # alphabetical so simple last-in-array picking lands on SVI-PFL even
    # when SVI-ASC has fresher tournaments.
    chunk_dates = {}
    total_rows_manifest = 0
    for meta_key in sorted(meta_rows.keys()):
        chunk_name = f"tournament_cards_data_cards_{meta_key}.csv"
        mn = meta_min_date.get(meta_key)
        mx = meta_max_date.get(meta_key)
        # If this meta wasn't in the monolith (preserved chunk), read
        # min/max dates directly from the existing chunk file so the
        # manifest stays accurate.
        if mn is None or mx is None:
            chunk_path = os.path.join(frontend_data, chunk_name)
            if os.path.isfile(chunk_path):
                try:
                    with open(chunk_path, "r", encoding="utf-8-sig", newline="") as ef:
                        reader = csv.DictReader(ef, delimiter=";")
                        for row in reader:
                            d = _parse_tournament_date(row.get("tournament_date", ""))
                            if d:
                                if mn is None or d < mn: mn = d
                                if mx is None or d > mx: mx = d
                            total_rows_manifest += 1
                except OSError:
                    pass
        else:
            total_rows_manifest += len(meta_rows.get(meta_key, []))
        chunk_dates[chunk_name] = {
            "min_date": mn.strftime("%Y-%m-%d") if mn else None,
            "max_date": mx.strftime("%Y-%m-%d") if mx else None,
        }

    manifest = {
        "source": "tournament_cards_data_cards.csv",
        "chunks": chunk_files,
        "meta_keys": sorted(meta_rows.keys()),
        "chunk_dates": chunk_dates,
        "total_rows": total_rows_manifest,
        "generated": __import__("datetime").datetime.now().isoformat()
    }
    if skipped_writes:
        manifest["truncation_guard_triggered"] = skipped_writes
    manifest_path = os.path.join(frontend_data, "tournament_cards_manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    
    print(f"\n  ✓ Manifest: tournament_cards_manifest.json ({len(chunk_files)} Chunks, {manifest['total_rows']} Zeilen)")

    # ── Health-check report ─────────────────────────────────────────────
    # Surface anomalies that would otherwise sit silently in the data:
    #   - "unknown" meta tag (scraper failed format extraction)
    #   - format keys that look right but aren't in our known catalog
    #     (likely a new Limitless format we haven't taught the system)
    #   - chunks where max_date is older than 90 days but the meta key
    #     is still being scraped — warns about a stale active-format tag
    #
    # Known-good keys are loaded best-effort from the scraper's catalog
    # so we don't have to duplicate the list here. If the catalog can't
    # be read, we just skip the unknown-key check (the other checks
    # still run).
    print("\n" + "-" * 60)
    print("HEALTH CHECK")
    print("-" * 60)

    known_codes = set()
    catalog_path = os.path.join(frontend_data, "formats_catalog.json")
    if os.path.exists(catalog_path):
        try:
            with open(catalog_path, "r", encoding="utf-8") as f:
                catalog = json.load(f)
            for row in catalog.get("formats", []) or []:
                code = str(row.get("code", "")).strip().upper()
                if code:
                    known_codes.add(code)
        except Exception as e:
            print(f"  ! Could not read formats_catalog.json: {e}")

    warnings = 0
    for meta_key in sorted(meta_rows.keys()):
        chunk_name = f"tournament_cards_data_cards_{meta_key}.csv"
        n_rows = len(meta_rows[meta_key])
        mn = meta_min_date.get(meta_key)
        mx = meta_max_date.get(meta_key)
        flags = []
        if not meta_key or meta_key.lower() == "unknown":
            flags.append("UNKNOWN meta tag — scraper format extraction failed")
        if known_codes and meta_key.upper() not in known_codes:
            flags.append(f"format key {meta_key!r} not in formats_catalog.json")
        if not mx:
            flags.append("no parseable tournament_date in any row")
        flag_str = ("  [!] " + "; ".join(flags)) if flags else ""
        if flags:
            warnings += 1
        date_range = f"{mn.strftime('%Y-%m-%d') if mn else '?'} … {mx.strftime('%Y-%m-%d') if mx else '?'}"
        print(f"  {meta_key:>12}  {n_rows:>7} rows  {date_range}{flag_str}")

    if warnings:
        print(f"\n  [!] {warnings} chunk(s) flagged. Review above before deploying.")
    else:
        print("\n  ✓ All chunks look clean.")


if __name__ == "__main__":
    try:
        create_merged_database()
        sync_scraper_data_to_frontend()
    except Exception as e:
        print(f"Fehler: {e}")
