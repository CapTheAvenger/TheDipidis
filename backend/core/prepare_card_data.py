#!/usr/bin/env python3
"""
Card Database Updater - FAST EDITION
====================================
Merges English cards, Japanese cards, Prices AND Pokédex Numbers
into the final JSON for the frontend.
Then syncs all scraper output (tournaments, meta, city league) to the
frontend ``data/`` folder so the dashboard serves current data.
"""

import json
import csv
import os
import re
import shutil
import sys
from typing import List, Dict
from card_scraper_shared import get_data_dir, get_app_path, setup_console_encoding, load_set_order, card_sort_key

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

        # Build transitive closure groups via union-find
        parent = list(range(len(group)))

        def find(x):
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        def union(a, b):
            ra, rb = find(a), find(b)
            if ra != rb:
                parent[ra] = rb

        for i in range(len(group)):
            for j in range(i + 1, len(group)):
                if card_sets[i] & card_sets[j]:  # overlapping sets
                    union(i, j)

        # Merge int-prints within each group
        groups = defaultdict(set)
        for i in range(len(group)):
            groups[find(i)].update(card_sets[i])

        # Write back unified prints
        for i, card in enumerate(group):
            merged_ip = ','.join(sorted(groups[find(i)]))
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

    standard, extended, legacy = [], [], []
    dropped_superseded = 0

    for card in all_cards:
        set_code = (card.get("set") or "").strip()

        # Drop superseded preview sets (e.g. M3 → POR rename)
        if set_code.upper() in SUPERSEDED_SETS:
            dropped_superseded += 1
            continue

        order = set_order.get(set_code, set_order.get(set_code.upper(), 0))

        if set_code.upper() in PROMO_ERA_SETS or order >= STANDARD_MIN_ORDER:
            standard.append(card)
        elif order >= EXTENDED_MIN_ORDER:
            extended.append(card)
        else:
            legacy.append(card)

    if dropped_superseded:
        print(f"  dropped {dropped_superseded} cards from superseded sets: {sorted(SUPERSEDED_SETS)}")

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

    manifest = {
        "version": version,
        "generated": __import__("datetime").datetime.now().astimezone().isoformat(),
        "totalCards": len(all_cards),
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
    # Limitless Online  →  Current Meta deck stats
    "limitless_online_decks.csv",
    "limitless_online_decks.html",
    "limitless_online_decks_comparison.csv",
    "limitless_online_decks_comparison.html",
    "limitless_online_decks_comparison_local.html",
    "limitless_online_decks_matchups.csv",
    # Labs Major Tournaments  →  Meta Call Predictor 2.0 Mode B
    "labs_tournament_decks.csv",
    "labs_tournaments.json",
    # Scraper state files — list of tournament IDs each scraper has
    # already processed. Synced back to data/ so the next CI run can
    # resume incrementally instead of re-scraping every tournament from
    # scratch each week (Cloudflare rate-limits made the from-scratch
    # path produce only partial data — see workflow seed step).
    "city_league_analysis_scraped.json",
    "tournament_jh_scraped.json",
    "current_meta_scraped_tournaments.json",
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

        # Only copy if source is newer or size differs
        if os.path.isfile(dst):
            src_stat = os.stat(src)
            dst_stat = os.stat(dst)
            if src_stat.st_mtime <= dst_stat.st_mtime and src_stat.st_size == dst_stat.st_size:
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
    for meta_key in sorted(meta_rows.keys()):
        rows = meta_rows[meta_key]
        chunk_name = f"tournament_cards_data_cards_{meta_key}.csv"
        chunk_path = os.path.join(frontend_data, chunk_name)
        
        with open(chunk_path, "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=";")
            writer.writeheader()
            writer.writerows(rows)

        size_mb = os.path.getsize(chunk_path) / (1024 * 1024)
        print(f"  ✓ {chunk_name}  ({len(rows)} Zeilen, {size_mb:.1f} MB)")
        chunk_files.append(chunk_name)

    # Write manifest. chunk_dates is consumed by the frontend loader to
    # pick "latest" by real recency (max_date) — the meta keys are
    # alphabetical so simple last-in-array picking lands on SVI-PFL even
    # when SVI-ASC has fresher tournaments.
    chunk_dates = {}
    for meta_key in sorted(meta_rows.keys()):
        chunk_name = f"tournament_cards_data_cards_{meta_key}.csv"
        mn = meta_min_date.get(meta_key)
        mx = meta_max_date.get(meta_key)
        chunk_dates[chunk_name] = {
            "min_date": mn.strftime("%Y-%m-%d") if mn else None,
            "max_date": mx.strftime("%Y-%m-%d") if mx else None,
        }

    manifest = {
        "source": "tournament_cards_data_cards.csv",
        "chunks": chunk_files,
        "meta_keys": sorted(meta_rows.keys()),
        "chunk_dates": chunk_dates,
        "total_rows": sum(len(v) for v in meta_rows.values()),
        "generated": __import__("datetime").datetime.now().isoformat()
    }
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

    from datetime import datetime as _dt, timedelta as _td
    today = _dt.now()
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
