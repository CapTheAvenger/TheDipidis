#!/usr/bin/env python3
"""
Card Scraper Shared Module - FAST EDITION
=========================================
Centralized utilities for all Pokemon TCG Scrapers.
Provides:
- Cloudscraper & BeautifulSoup network utilities
- Unified Card Database (English + Japanese)
- String & Date normalization tools
- CSV & Data aggregation tools
- Card type helpers (replaces card_type_lookup.py)
"""

import os
import sys
import csv
import json
import re
import time
import threading
from datetime import datetime, timedelta
from collections import defaultdict
from typing import List, Dict, Optional, Tuple, Any, Set

try:
    import cloudscraper
    from bs4 import BeautifulSoup
except ImportError:
    print("[WARN] cloudscraper or bs4 missing. Some functions won't work.")

# ============================================================================
# OS & DIRECTORY UTILS
# ============================================================================
def setup_console_encoding() -> None:
    if sys.platform == 'win32':
        for stream in (sys.stdout, sys.stderr):
            if hasattr(stream, 'reconfigure'):
                try: stream.reconfigure(encoding='utf-8')
                except Exception: pass

def get_app_path() -> str:
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))

def get_data_dir() -> str:
    app_path = get_app_path()
    parts = app_path.replace('\\', '/').split('/')
    if 'dist' in parts:
        workspace_root = '/'.join(parts[:parts.index('dist')])
    else:
        workspace_root = app_path
    data_dir = os.path.join(workspace_root, 'data')
    os.makedirs(data_dir, exist_ok=True)
    return data_dir

def load_scraped_ids(tracking_file: str) -> set:
    if not os.path.exists(tracking_file): return set()
    try:
        with open(tracking_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
            for key in ['scraped_tournament_ids', 'scraped_ids', 'ids']:
                if key in data: return set(data.get(key, []))
            if isinstance(data, list): return set(data)
    except Exception: pass
    return set()

def save_scraped_ids(tracking_file: str, ids: set, id_key: str = 'scraped_ids') -> None:
    try:
        data = {id_key: sorted(list(ids)), 'last_updated': time.strftime('%Y-%m-%d %H:%M:%S'), 'total_count': len(ids)}
        os.makedirs(os.path.dirname(tracking_file) or '.', exist_ok=True)
        with open(tracking_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Warning saving tracking IDs: {e}")

# ============================================================================
# NETWORK UTILS (Cloudscraper + BS4)
# ============================================================================
_thread_local = threading.local()

def _get_scraper() -> "cloudscraper.CloudScraper":
    if not hasattr(_thread_local, "scraper"):
        _thread_local.scraper = cloudscraper.create_scraper(browser={'browser': 'chrome', 'platform': 'windows', 'mobile': False})
    return _thread_local.scraper

def safe_fetch_html(url: str, timeout: int = 15, retries: int = 2, retry_delay: float = 1.0) -> str:
    """Zentraler HTML Fetcher mit Cloudflare-Bypass."""
    scraper = _get_scraper()
    for attempt in range(1, retries + 2):
        try:
            resp = scraper.get(url, timeout=timeout)
            resp.raise_for_status()
            return resp.text
        except Exception as e:
            if attempt <= retries: time.sleep(retry_delay)
    return ""

def fetch_page_bs4(url: str, timeout: int = 15, retries: int = 2) -> Optional["BeautifulSoup"]:
    html = safe_fetch_html(url, timeout, retries)
    return BeautifulSoup(html, 'html.parser') if html else None

def fetch_page(url: str, timeout: int = 15) -> str:
    """Legacy wrapper fuer alte Skripte."""
    return safe_fetch_html(url, timeout)

# ============================================================================
# STRING & DATE NORMALIZATION
# ============================================================================
def clean_pokemon_name(name: str) -> str:
    variants = [' VSTAR', ' V-UNION', ' VMAX', ' V', ' EX', ' GX', ' ex']
    name = name.strip()
    for variant in variants:
        if name.upper().endswith(variant.upper()):
            name = name[:-len(variant)].strip()
            break
    return name

def fix_mega_pokemon_name(name: str) -> str:
    if '-mega' in name.lower():
        return f"mega {re.sub(r'-mega$', '', name, flags=re.IGNORECASE)}"
    return name

def slug_to_archetype(slug: str) -> str:
    slug = re.sub(r'-+', ' ', slug.strip().replace('_', '-')).strip()
    words = slug.split(' ')
    def smart_title(word):
        return word.upper() if word.lower() in {'ex', 'gx', 'v', 'vmax', 'vstar'} else word.title()
    return re.sub(r'\s+', ' ', ' '.join(smart_title(w) for w in words)).strip()

def normalize_archetype_name(archetype: str) -> str:
    name = archetype.strip().title()
    name = re.sub(r'^Ns?\s+', '', name, flags=re.IGNORECASE)
    name = re.sub(r'(\w+)-Mega\b', r'Mega \1', name, flags=re.IGNORECASE)
    return name.strip()

def resolve_date_range(start_date: str, end_date: str) -> Tuple[datetime, datetime]:
    try: start_dt = datetime.strptime(start_date, "%d.%m.%Y")
    except Exception: start_dt = datetime.now() - timedelta(days=30)

    if end_date == "auto": end_dt = datetime.now() - timedelta(days=2)
    else:
        try: end_dt = datetime.strptime(end_date, "%d.%m.%Y")
        except Exception: end_dt = datetime.now() - timedelta(days=2)
    return start_dt, end_dt

def parse_tournament_date(date_str: str) -> Optional[datetime]:
    try: return datetime.strptime(date_str.strip(), "%d %b %y")
    except ValueError:
        try:
            clean = re.sub(r'(\d+)(st|nd|rd|th)', r'\1', date_str)
            return datetime.strptime(clean.strip(), "%d %B %Y")
        except ValueError: return None

# ============================================================================
# UNIFIED CARD DATABASE (Replaces CardDataManager & CardTypeLookup)
# ============================================================================
class CardDatabaseLookup:
    """
    Unified database manager. Loads both EN and JP CSVs automatically.
    Includes dynamic SET_ORDER from sets.json.
    """
    RARITY_PRIORITY = {
        'Common': 1, 'Uncommon': 2, 'Double Rare': 3, 'Rare': 4, 'Promo': 5,
        'Art Rare': 20, 'Ultra Rare': 21, 'Secret Rare': 30, 'Special Illustration Rare': 31,
        'Hyper Rare': 32, 'Illustration Rare': 33
    }

    def __init__(self, csv_path: str = None):
        self.cards = {}
        self.manager = self  # Duck-typing for backward compatibility
        self.SET_ORDER = self._load_dynamic_set_order()
        self._load_databases()

    def _load_dynamic_set_order(self) -> dict:
        sets_path = os.path.join(get_data_dir(), 'sets.json')
        try:
            with open(sets_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return {'SVP': 100, 'SVI': 100}

    def _load_databases(self):
        data_dir = get_data_dir()
        en_path = os.path.join(data_dir, 'all_cards_database.csv')
        jp_path = os.path.join(data_dir, 'japanese_cards_database.csv')
        seen = set()

        if os.path.exists(en_path):
            with open(en_path, 'r', encoding='utf-8-sig') as f:
                for row in csv.DictReader(f):
                    name = row.get('name_en') or row.get('name', '')
                    if name: self._add_card(name, row, 'english', seen)

        if os.path.exists(jp_path):
            with open(jp_path, 'r', encoding='utf-8-sig') as f:
                for row in csv.DictReader(f):
                    name = row.get('name', '')
                    if name: self._add_card(name, row, 'japanese', seen)

    def _add_card(self, name: str, row: dict, source: str, seen: set):
        sc, sn = row.get('set', ''), row.get('number', '')
        key = f"{sc}_{sn}"
        if key not in seen:
            seen.add(key)
            norm = self.normalize_name(name)
            if norm not in self.cards: self.cards[norm] = []
            c_type = row.get('type', '')
            supertype = 'Energy' if 'energy' in c_type.lower() else \
                        'Trainer' if any(t in c_type.lower() for t in ['trainer','item','supporter','stadium','tool']) else \
                        'Pokemon'
            self.cards[norm].append({
                'name': name, 'set_code': sc, 'set_number': sn, 'number': sn,
                'rarity': row.get('rarity', ''), 'type': c_type, 'supertype': supertype,
                'image_url': row.get('image_url', ''), '_source': source
            })

    def normalize_name(self, name: str) -> str:
        norm = name.strip().lower().replace("'", "").replace("`", "").replace("\u2019", "").replace("-", " ").replace(".", "")
        return ' '.join(norm.split())

    def get_card(self, set_code: str, number: str) -> Optional[dict]:
        """Manager API compatibility."""
        for variants in self.cards.values():
            for v in variants:
                if v['set_code'].upper() == set_code.upper() and v['number'] == number:
                    return {'set_name': '', 'rarity': v['rarity'], 'type': v['type'], 'image_url': v['image_url']}
        return None

    def get_card_info(self, card_name: str) -> Optional[dict]:
        norm = self.normalize_name(card_name)
        if norm in self.cards and self.cards[norm]:
            v = self.cards[norm][0]
            return {'set_code': v['set_code'], 'number': v['number'], 'rarity': v['rarity'], 'type': v['type'], 'image_url': v['image_url']}
        return None

    def get_latest_low_rarity_version(self, card_name: str):
        norm = self.normalize_name(card_name)
        if norm not in self.cards: return None
        variants = self.cards[norm]
        low_rarity = [v for v in variants if v['rarity'] in {'Common', 'Uncommon', 'Promo'}] or variants
        best = max(low_rarity, key=lambda v: self.SET_ORDER.get(v['set_code'], 0))
        class CardInfo:
            def __init__(self, d):
                self.name = d['name']; self.set_code = d['set_code']; self.number = d['number']
                self.rarity = d['rarity']; self.supertype = d['supertype']
        return CardInfo(best)

    def is_ace_spec_by_name(self, card_name: str) -> bool:
        norm = self.normalize_name(card_name)
        if norm not in self.cards: return False
        v = self.cards[norm][0]
        return 'ace spec' in v['type'].lower() or ('ultra rare' in v['rarity'].lower() and v['supertype'] == 'Trainer')

    def get_card_type(self, card_name: str) -> str:
        """Returns 'Pokemon', 'Trainer', or 'Energy'."""
        norm = self.normalize_name(card_name)
        if norm in self.cards and self.cards[norm]:
            return self.cards[norm][0]['supertype']
        return 'Pokemon'

    def is_trainer_or_energy(self, card_name: str) -> bool:
        """Returns True if card is a Trainer or Energy."""
        t = self.get_card_type(card_name)
        return t in ('Trainer', 'Energy')

    def is_valid_card(self, card_name: str) -> bool:
        """Returns True if card exists in the database."""
        norm = self.normalize_name(card_name)
        return norm in self.cards

    def get_name_by_set_number(self, set_code: str, card_number: str) -> Optional[str]:
        sc = set_code.upper()
        sn_stripped = card_number.lstrip('0') or card_number
        for variants in self.cards.values():
            for v in variants:
                if v['set_code'].upper() == sc and (v['number'] == card_number or (v['number'].lstrip('0') or v['number']) == sn_stripped):
                    return v['name']
        return None

# ============================================================================
# MODULE-LEVEL CARD TYPE HELPERS (replaces card_type_lookup.py)
# ============================================================================
_db_instance: Optional[CardDatabaseLookup] = None

def _get_db() -> CardDatabaseLookup:
    global _db_instance
    if _db_instance is None:
        _db_instance = CardDatabaseLookup()
    return _db_instance

def get_card_type(card_name: str) -> str:
    """Returns 'Pokemon', 'Trainer', or 'Energy'."""
    return _get_db().get_card_type(card_name)

def is_trainer_or_energy(card_name: str) -> bool:
    """Returns True for Trainer/Energy, False for Pokemon."""
    return _get_db().is_trainer_or_energy(card_name)

def is_valid_card(card_name: str) -> bool:
    """Returns True if card exists in the database."""
    return _get_db().is_valid_card(card_name)

# ============================================================================
# AGGREGATION & CSV EXPORT
# ============================================================================
def aggregate_card_data(all_decks: list, card_db: CardDatabaseLookup) -> list:
    """
    Aggregates cards from decks into meta-analysis format.
    Neu: deck_inclusion_count und average_count für Competitive-Analyse.
    """
    archetype_cards = defaultdict(lambda: defaultdict(lambda: {'total_count': 0, 'deck_count': 0, 'max_count': 0}))
    archetype_deck_counts = defaultdict(int)

    for deck in all_decks:
        if not deck.get('cards'): continue
        arch = normalize_archetype_name(deck['archetype'])
        archetype_deck_counts[arch] += 1
        seen = set()
        for c in deck['cards']:
            name = c['name']
            archetype_cards[arch][name]['total_count'] += c['count']
            archetype_cards[arch][name]['max_count'] = max(archetype_cards[arch][name]['max_count'], c['count'])
            if name not in seen:
                archetype_cards[arch][name]['deck_count'] += 1
                seen.add(name)

    result = []
    for arch, cards in archetype_cards.items():
        total_decks = archetype_deck_counts[arch]
        for name, stats in cards.items():
            deck_inclusion_count = stats['deck_count']
            pct = (deck_inclusion_count / total_decks * 100) if total_decks > 0 else 0
            # NEUE METRIK: average_count = total_count / deck_inclusion_count
            average_count = round(stats['total_count'] / deck_inclusion_count, 2) if deck_inclusion_count > 0 else 0
            # NEUE METRIK: average_count_overall = total_count / total_decks (Durchschnitt über ALLE Decks)
            average_count_overall = round(stats['total_count'] / total_decks, 2) if total_decks > 0 else 0
            
            c_info = card_db.get_card_info(name) or {}
            result.append({
                'archetype': arch, 'card_name': name,
                'card_identifier': f"{c_info.get('set_code','')} {c_info.get('number','')}".strip(),
                'total_count': stats['total_count'], 
                'max_count': stats['max_count'],
                'deck_inclusion_count': deck_inclusion_count,  # NEU: Wie viele Decks diese Karte spielen
                'average_count': average_count,  # NEU: Durchschnitt pro Deck (wenn gespielt)
                'average_count_overall': average_count_overall,  # NEU: Durchschnitt über ALLE Decks im Archetype
                'total_decks_in_archetype': total_decks,
                'percentage_in_archetype': round(pct, 2),
                'set_code': c_info.get('set_code',''), 'set_number': c_info.get('number',''),
                'rarity': c_info.get('rarity',''), 'type': c_info.get('type',''),
                'image_url': c_info.get('image_url',''),
                'is_ace_spec': 'Yes' if card_db.is_ace_spec_by_name(name) else 'No'
            })
    return result

def save_to_csv(data: list, output_file: str, append_mode: bool = False):
    if not data: return
    out_path = os.path.join(get_data_dir(), output_file)

    existing = []
    if append_mode and os.path.exists(out_path):
        with open(out_path, 'r', encoding='utf-8-sig') as f:
            existing = list(csv.DictReader(f, delimiter=';'))

    if append_mode and existing:
        new_keys = {f"{r.get('tournament_date','')}|{r['archetype']}|{r['card_name']}" for r in data}
        merged = [r for r in existing if f"{r.get('tournament_date','')}|{r.get('archetype','')}|{r.get('card_name','')}" not in new_keys]
        merged.extend(data)
        data = merged

    if not data: return

    with open(out_path, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=list(data[0].keys()), delimiter=';', extrasaction='ignore')
        writer.writeheader()
        for r in data:
            rf = r.copy()
            # Formatiere Dezimalzahlen mit Komma für Excel (deutsches Format)
            if 'percentage_in_archetype' in rf:
                rf['percentage_in_archetype'] = str(rf['percentage_in_archetype']).replace('.', ',')
            if 'average_count' in rf:
                rf['average_count'] = str(rf['average_count']).replace('.', ',')
            if 'average_count_overall' in rf:
                rf['average_count_overall'] = str(rf['average_count_overall']).replace('.', ',')
            writer.writerow(rf)
