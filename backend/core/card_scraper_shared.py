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
import tempfile
import importlib
import logging
import threading
from datetime import datetime, timedelta
from collections import defaultdict
from typing import List, Dict, Optional, Tuple, Any, Set, Mapping, TypedDict, Union, DefaultDict, cast

try:
    cloudscraper = importlib.import_module('cloudscraper')
except ModuleNotFoundError:
    cloudscraper = None
    print("[WARN] cloudscraper missing. Some functions won't work.")

try:
    bs4_module = importlib.import_module('bs4')
    BeautifulSoup = getattr(bs4_module, 'BeautifulSoup', None)
except ModuleNotFoundError:
    BeautifulSoup = None
    print("[WARN] bs4 missing. Some functions won't work.")


class CardVariant(TypedDict):
    name: str
    set_code: str
    set_number: str
    number: str
    rarity: str
    type: str
    supertype: str
    image_url: str
    _source: str


class DeckCard(TypedDict, total=False):
    name: str
    count: Union[int, str]
    set_code: str
    set: str
    set_number: str
    number: str


class DeckEntry(TypedDict, total=False):
    cards: List[DeckCard]
    archetype: str
    tournament_id: str
    tournament_date: str
    date: str


class CardStats(TypedDict):
    total_count: int
    deck_count: int
    max_count: int
    set_versions: DefaultDict[Tuple[str, str], int]


GroupKey = Union[str, Tuple[str, str], Tuple[str, str, str]]
RowDict = Dict[str, Any]

logger = logging.getLogger(__name__)

# ============================================================================
# OS & DIRECTORY UTILS
# ============================================================================
def setup_logging(log_name: str) -> logging.Logger:
    """Configure file+console logging and return a named logger."""
    data_dir = get_data_dir()
    os.makedirs(data_dir, exist_ok=True)
    log_file = os.path.join(data_dir, f"{log_name}.log")
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[
            logging.FileHandler(log_file, encoding="utf-8"),
            logging.StreamHandler(sys.stdout)
        ]
    )
    return logging.getLogger(log_name)

def setup_console_encoding() -> None:
    if sys.platform == 'win32':
        for stream in (sys.stdout, sys.stderr):
            reconfigure = getattr(stream, 'reconfigure', None)
            if callable(reconfigure):
                try:
                    reconfigure(encoding='utf-8')
                except Exception as e:
                    logger.debug("Unable to reconfigure stream encoding: %s", e)

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

def fix_mojibake(s: str) -> str:
    """Repair Latin-1-decoded-as-UTF-8 mojibake. No-op when already clean UTF-8.

    Limitless serves UTF-8 HTML without a charset header on some pages, so
    Python's `requests` falls back to ISO-8859-1 decoding. The result is
    "QuerÃ©taro" instead of "Querétaro", "GdaÅsk" instead of "Gdańsk",
    and the en-dash bytes \\xe2\\x80\\x93 split into three single chars
    'â\\x80\\x93' that no regex looking for U+2013 will match.

    The encode-as-Latin-1, decode-as-UTF-8 round-trip recovers the
    original bytes and re-decodes them correctly. Strings that were
    already clean UTF-8 raise UnicodeEncodeError on the encode step
    (because they contain non-Latin-1 chars) — caught and returned as-is.
    """
    if not s:
        return s
    try:
        return s.encode('latin1').decode('utf-8')
    except (UnicodeDecodeError, UnicodeEncodeError):
        return s


def load_scraped_ids(tracking_file: str) -> Set[str]:
    if not os.path.exists(tracking_file): return set()
    try:
        # utf-8-sig transparently strips a leading BOM if present.
        # Earlier versions wrote the file with utf-8-sig and the loader
        # tripped on the BOM ("Unexpected UTF-8 BOM"); using -sig here
        # is a no-op for plain UTF-8 and tolerates either form.
        with open(tracking_file, 'r', encoding='utf-8-sig') as f:
            raw_data: Any = json.load(f)
            if isinstance(raw_data, dict):
                data_map = cast(Mapping[str, Any], raw_data)
                for key in ['scraped_tournament_ids', 'scraped_ids', 'ids']:
                    value = data_map.get(key)
                    if isinstance(value, list):
                        return {str(v) for v in cast(List[Any], value)}
            if isinstance(raw_data, list):
                return {str(v) for v in cast(List[Any], raw_data)}
    except Exception as e:
        logger.warning("Failed to load scraped IDs from %s: %s", tracking_file, e)
    return set()

def save_scraped_ids(tracking_file: str, ids: Set[str], id_key: str = 'scraped_ids') -> None:
    try:
        data: RowDict = {id_key: sorted(list(ids)), 'last_updated': time.strftime('%Y-%m-%d %H:%M:%S'), 'total_count': len(ids)}
        os.makedirs(os.path.dirname(tracking_file) or '.', exist_ok=True)
        with open(tracking_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        logger.warning("Failed to save scraped IDs to %s: %s", tracking_file, e)

def _apply_defaults(loaded: dict, defaults: dict,
                    deep_merge_keys: Optional[List[str]] = None) -> dict:
    """Fill missing top-level defaults and deep-merge nested dicts."""
    for key, value in defaults.items():
        if key not in loaded:
            loaded[key] = value
    for dmk in (deep_merge_keys or []):
        if dmk in defaults and isinstance(defaults[dmk], dict):
            loaded.setdefault(dmk, {})
            for sub_key, sub_defaults in defaults[dmk].items():
                loaded[dmk].setdefault(
                    sub_key, {} if isinstance(sub_defaults, dict) else sub_defaults
                )
                if isinstance(sub_defaults, dict) and isinstance(loaded[dmk].get(sub_key), dict):
                    for sk, sv in sub_defaults.items():
                        loaded[dmk][sub_key].setdefault(sk, sv)
    return loaded


def load_settings(settings_filename: str, defaults: dict,
                  deep_merge_keys: Optional[List[str]] = None,
                  create_if_missing: bool = False) -> dict:
    """Load settings from JSON file, searching standard candidate paths.

    Priority: unified ``config/scraper_settings.json`` (section key derived
    from *settings_filename*) → individual settings files → defaults.

    For *deep_merge_keys* (e.g. ``['sources']``), nested dicts are merged
    at the sub-key level rather than being replaced wholesale.
    """
    app_path = get_app_path()
    # Derive project root: app_path is backend/core/, so two levels up
    project_root = os.path.dirname(os.path.dirname(app_path))

    # --- 1. Try unified scraper_settings.json first ---
    section_key = settings_filename.replace("_settings.json", "")
    unified_candidates = [
        os.path.join(project_root, "config", "scraper_settings.json"),
        os.path.join(os.getcwd(), "config", "scraper_settings.json"),
    ]
    for upath in unified_candidates:
        upath = os.path.normpath(upath)
        if not os.path.isfile(upath):
            continue
        try:
            with open(upath, "r", encoding="utf-8-sig") as f:
                unified = json.loads(f.read().strip())
            if isinstance(unified, dict) and section_key in unified:
                section = unified[section_key]
                if isinstance(section, dict):
                    loaded = _apply_defaults(section, defaults, deep_merge_keys)
                    logger.info("Settings geladen: %s [%s]", upath, section_key)
                    return loaded
        except Exception as e:
            logger.warning("Konnte zentrale Settings nicht laden: %s", e)

    # --- 2. Fallback: individual settings files ---
    candidates = [
        os.path.join(project_root, "config", settings_filename),
        os.path.join(app_path, settings_filename),
        os.path.join(os.getcwd(), settings_filename),
        os.path.join(os.getcwd(), "config", settings_filename),
        os.path.join(app_path, "data", settings_filename),
    ]
    if os.path.basename(app_path) == "dist":
        candidates.insert(0, os.path.join(os.path.dirname(app_path), settings_filename))

    for path in candidates:
        path = os.path.normpath(path)
        if not os.path.isfile(path):
            continue
        try:
            with open(path, "r", encoding="utf-8-sig") as f:
                content = f.read().strip()
            if not content:
                continue
            loaded = json.loads(content)
            if not isinstance(loaded, dict):
                continue
            loaded = _apply_defaults(loaded, defaults, deep_merge_keys)
            logger.info("Settings geladen: %s", path)
            return loaded
        except Exception as e:
            logger.warning("Konnte Settings nicht laden: %s", e)

    if create_if_missing:
        settings_path = os.path.join(app_path, settings_filename)
        try:
            with open(settings_path, "w", encoding="utf-8") as f:
                json.dump(defaults, f, indent=4)
            logger.info("Settings-Datei erstellt: %s", settings_path)
        except Exception as e:
            logger.warning("Konnte Settings nicht erstellen: %s", e)
    else:
        logger.info("Keine Settings-Datei gefunden. Nutze Standardwerte.")

    return defaults.copy()

# ============================================================================
# NETWORK UTILS (Cloudscraper + BS4)
# ============================================================================
_thread_local = threading.local()

def _get_scraper() -> Any:
    if cloudscraper is None:
        raise RuntimeError("cloudscraper is not installed")
    if not hasattr(_thread_local, "scraper"):
        create_scraper = getattr(cloudscraper, 'create_scraper')
        _thread_local.scraper = create_scraper(browser={'browser': 'chrome', 'platform': 'windows', 'mobile': False})
    return _thread_local.scraper

def safe_fetch_html(url: str, timeout: int = 15, retries: int = 2, retry_delay: float = 1.0, quiet: bool = False) -> str:
    """Zentraler HTML Fetcher mit Cloudflare-Bypass und exponentiellem Backoff.
    quiet=True unterdrückt das finale WARNING-Log (z.B. wenn ein Fallback folgt)."""
    scraper = _get_scraper()
    delay = retry_delay
    for attempt in range(1, retries + 2):
        try:
            resp = scraper.get(url, timeout=timeout)
            # Rate-limit / overload: back off longer before retry
            if resp.status_code in (429, 503):
                retry_after = int(resp.headers.get('Retry-After', delay * 3))
                logger.warning("HTTP %s for %s — backing off %ss", resp.status_code, url, retry_after)
                if attempt <= retries:
                    time.sleep(retry_after)
                    delay = min(delay * 3, 60)
                    continue
            resp.raise_for_status()
            return resp.text
        except Exception as e:
            if attempt <= retries:
                logger.debug("Fetch failed (attempt %s/%s) for %s: %s", attempt, retries + 1, url, e)
                time.sleep(delay)
                delay = min(delay * 2, 30)  # exponential backoff, max 30s
            else:
                if quiet:
                    logger.debug("Fetch failed after %s attempts for %s: %s", retries + 1, url, e)
                else:
                    logger.warning("Fetch failed after %s attempts for %s: %s", retries + 1, url, e)
    return ""

def fetch_page_bs4(url: str, timeout: int = 15, retries: int = 2) -> Optional[Any]:
    html = safe_fetch_html(url, timeout, retries)
    if BeautifulSoup is None:
        return None
    return BeautifulSoup(html, 'lxml') if html else None

def fetch_page(url: str, timeout: int = 15) -> str:
    """Legacy wrapper fuer alte Skripte."""
    return safe_fetch_html(url, timeout)


def atomic_write_file(target_path: str, write_fn, mode: str = 'w', encoding: str = 'utf-8', newline: str = ''):
    """Write file atomically: write to temp file first, then rename.
    
    Args:
        target_path: Final destination path
        write_fn: Callable that receives the open file handle to write to
        mode: File mode (default 'w')
        encoding: File encoding (default 'utf-8')
        newline: Newline parameter for open()
    """
    dir_name = os.path.dirname(target_path) or '.'
    os.makedirs(dir_name, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(dir=dir_name, suffix='.tmp')
    try:
        with os.fdopen(fd, mode, encoding=encoding, newline=newline) as f:
            write_fn(f)
        # Atomic rename (on Windows, need to remove target first)
        if os.path.exists(target_path):
            os.replace(tmp_path, target_path)
        else:
            os.rename(tmp_path, target_path)
    except Exception:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise


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
    """Move a Limitless mega-form marker into a leading "Mega " prefix.

    Limitless renders Mega forms via the suffix "-mega" on the species
    slug, optionally with a regional / form variant after it:
        charizard-mega         → mega charizard
        charizard-mega-x       → mega charizard-x   (X form)
        charizard-mega-y       → mega charizard-y
        absol-mega             → mega absol

    The earlier implementation only stripped a TRAILING `-mega$`, so
    "charizard-mega-x" got "mega " prepended without the "-mega"
    segment removed → "mega charizard-mega-x". A later pass through
    normalize_archetype_name's `(\\w+)-Mega\\b` regex then turned the
    surviving "-Mega" into a SECOND "Mega " prefix, producing
    "Mega Mega Charizard-X" in the archetypes CSV. Fix: strip
    `-mega` whether trailing or followed by another hyphenated form
    token, exactly once.
    """
    lower = name.lower()
    if '-mega' not in lower:
        return name
    stripped = re.sub(r'-mega(?=-|$)', '', name, count=1, flags=re.IGNORECASE)
    return f"mega {stripped}"

def slug_to_archetype(slug: str) -> str:
    slug = re.sub(r'-+', ' ', slug.strip().replace('_', '-')).strip()
    words = slug.split(' ')
    def smart_title(word: str) -> str:
        return word.upper() if word.lower() in {'ex', 'gx', 'v', 'vmax', 'vstar'} else word.title()
    return re.sub(r'\s+', ' ', ' '.join(smart_title(w) for w in words)).strip()

def normalize_archetype_name(archetype: str) -> str:
    """Title-case + Mega-prefix normalization for archetype display
    names. .title() Python-stdlib uppercases the letter immediately
    after an apostrophe ("Rocket's Mewtwo" → "Rocket'S Mewtwo"), which
    breaks downstream string equality with the canonical names baked
    into archetype_icons.json. Post-fix the apostrophe-S so the result
    matches what the rest of the system speaks.
    """
    name = archetype.strip().title()
    # Restore lowercase "'s" after an apostrophe — covers all variants
    # of single-quote characters Limitless and our parsing pipeline
    # might emit.
    name = re.sub(r"(?<=\w)(['‘’‛´])S\b", r"\1s", name)
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
    if not date_str:
        return None
    raw = str(date_str).strip()
    if not raw:
        return None
    try:
        return datetime.strptime(raw, "%d %b %y")
    except ValueError:
        try:
            clean = re.sub(r'(\d+)(st|nd|rd|th)', r'\1', raw, flags=re.IGNORECASE)
            return datetime.strptime(clean.strip(), "%d %B %Y")
        except ValueError:
            return None

def get_week_id(date_str: str) -> str:
    """Converts a date string to week id format YYYY-Www."""
    if not date_str:
        return "Unknown-Week"

    raw = str(date_str).strip()
    dt = parse_tournament_date(raw)

    if dt is None:
        try:
            dt = datetime.strptime(raw, "%d.%m.%Y")
        except ValueError:
            try:
                dt = datetime.strptime(raw, "%Y-%m-%d")
            except ValueError:
                return "Unknown-Week"

    return dt.strftime('%Y-W%W')


def load_set_order() -> Dict[str, int]:
    """Load set release order from data/sets.json (newest = highest number)."""
    sets_path = os.path.join(get_data_dir(), 'sets.json')
    try:
        with open(sets_path, 'r', encoding='utf-8') as f:
            raw = json.load(f)
            return {str(k): int(v) for k, v in raw.items() if isinstance(v, (int, float))}
    except Exception:
        return {}


def extract_number(number_str: str) -> int:
    """Extract numeric part from card number (handles '185a', 'TG24', etc.)."""
    if not number_str:
        return 0
    m = re.match(r'(\d+)', str(number_str))
    return int(m.group(1)) if m else 0


def card_sort_key(card: dict, set_order: Dict[str, int]) -> Tuple[int, int, str]:
    """Sort key: newest set first (desc), then card number (asc)."""
    set_code = card.get('set', '')
    number_str = card.get('number', '0')
    return (-set_order.get(set_code, 0), extract_number(number_str), str(number_str))

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

    def __init__(self, csv_path: Optional[str] = None):
        self.cards: Dict[str, List[CardVariant]] = {}
        self.manager = self  # Duck-typing for backward compatibility
        self.SET_ORDER = self._load_dynamic_set_order()
        self._load_databases()

    def _load_dynamic_set_order(self) -> Dict[str, int]:
        sets_path = os.path.join(get_data_dir(), 'sets.json')
        try:
            with open(sets_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.warning("Could not load sets order from %s: %s", sets_path, e)
            return {'SVP': 100, 'SVI': 100}

    def _load_databases(self):
        data_dir = get_data_dir()
        en_path = os.path.join(data_dir, 'all_cards_database.csv')
        jp_path = os.path.join(data_dir, 'japanese_cards_database.csv')
        seen: Set[str] = set()

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

        if not self.cards:
            logger.warning("Card database is empty. Checked files: %s, %s", en_path, jp_path)

    def _add_card(self, name: str, row: Mapping[str, Any], source: str, seen: Set[str]):
        sc, sn = row.get('set', ''), row.get('number', '')
        key = f"{sc}_{sn}"
        if key not in seen:
            seen.add(key)
            norm = self.normalize_name(name)
            if norm not in self.cards:
                self.cards[norm] = []
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

    def get_card(self, set_code: str, number: str) -> Optional[Dict[str, str]]:
        """Manager API compatibility."""
        for variants in self.cards.values():
            for v in variants:
                if v['set_code'].upper() == set_code.upper() and v['number'] == number:
                    return {'set_name': '', 'rarity': v['rarity'], 'type': v['type'], 'image_url': v['image_url']}
        return None

    def get_card_info(self, card_name: str) -> Optional[Dict[str, str]]:
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
            def __init__(self, d: CardVariant):
                self.name = d['name']; self.set_code = d['set_code']; self.number = d['number']
                self.rarity = d['rarity']; self.supertype = d['supertype']
        return CardInfo(best)

    def is_ace_spec_by_name(self, card_name: str) -> bool:
        norm = self.normalize_name(card_name)
        if norm not in self.cards: return False
        # A card is ACE SPEC only if any variant's type explicitly contains 'ace spec'
        return any('ace spec' in v['type'].lower() for v in self.cards[norm])

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
# SHARED DECK HTML EXTRACTION
# ============================================================================
def extract_cards_from_decklist_soup(soup, card_db: CardDatabaseLookup) -> list:
    """Extract cards from a Limitless-style decklist HTML (BeautifulSoup object).

    Uses a 3-method set-code detection for Pokémon cards:
      1. href link  (/cards/SET/NUMBER)
      2. data-set / data-number attributes
      3. <span class="set"> or <span class="card-set">
    Trainer/Energy cards are resolved via *card_db*.

    Returns a list of ``{name, count, set_code, set_number}`` dicts.
    """
    cards: list = []
    for column in soup.select('.decklist-column'):
        heading_elem = column.select_one('.decklist-column-heading')
        if not heading_elem:
            continue
        category = heading_elem.get_text(strip=True).lower()
        is_pokemon = 'trainer' not in category and 'energy' not in category

        for card_div in column.select('.decklist-card'):
            count_elem = card_div.select_one('.card-count')
            name_elem = card_div.select_one('.card-name')
            if not count_elem or not name_elem:
                continue
            try:
                count = int(count_elem.get_text(strip=True))
                card_name = name_elem.get_text(strip=True)
            except (ValueError, AttributeError):
                continue

            set_code, set_number = "", ""
            if is_pokemon:
                # METHOD 1: href link
                link_elem = card_div.find('a', href=True) or name_elem.find('a', href=True)
                if link_elem:
                    parts = link_elem.get('href', '').split('/cards/')[-1].split('/')
                    if len(parts) >= 3:
                        set_code, set_number = parts[1].upper(), parts[2]
                    elif len(parts) == 2:
                        set_code, set_number = parts[0].upper(), parts[1]
                # METHOD 2: data attributes
                if not set_code or not set_number:
                    set_code = card_div.get('data-set', '').strip().upper()
                    set_number = card_div.get('data-number', '').strip()
                # METHOD 3: span.set / span.card-set
                if not set_code or not set_number:
                    set_span = card_div.find('span', class_=['set', 'card-set'])
                    if set_span:
                        m = re.match(r'([A-Z0-9]+)[\s-]+([0-9]+)', set_span.get_text(strip=True), re.IGNORECASE)
                        if m:
                            set_code, set_number = m.group(1).upper(), m.group(2)
                # Normalize known aliases
                if set_code == 'PR-SV':
                    set_code = 'SVP'
                if set_code and set_number:
                    cards.append({'name': card_name, 'count': count, 'set_code': set_code, 'set_number': set_number})
            else:
                latest = card_db.get_latest_low_rarity_version(card_name)
                if latest:
                    cards.append({'name': card_name, 'count': count, 'set_code': latest.set_code, 'set_number': latest.number})
    return cards


# ============================================================================
# AGGREGATION & CSV EXPORT
# ============================================================================
def aggregate_card_data(all_decks: List[DeckEntry], card_db: CardDatabaseLookup, group_by_tournament_date: bool = False) -> List[RowDict]:
    """
    Aggregates cards from decks into meta-analysis format.
    Neu: deck_inclusion_count und average_count für Competitive-Analyse.
    """
    def _new_stats() -> CardStats:
        return {
            'total_count': 0,
            'deck_count': 0,
            'max_count': 0,
            'set_versions': defaultdict(int),
        }

    grouped_cards: DefaultDict[GroupKey, DefaultDict[str, CardStats]] = defaultdict(lambda: defaultdict(_new_stats))
    grouped_deck_counts: DefaultDict[GroupKey, int] = defaultdict(int)

    for deck in all_decks:
        if not deck.get('cards'):
            continue

        archetype_raw = deck.get('archetype', '')
        if not archetype_raw:
            logger.debug("Skipping deck without archetype: %s", deck)
            continue

        arch = normalize_archetype_name(archetype_raw)
        raw_tournament_date = str(deck.get('tournament_date') or deck.get('date') or '').strip()
        tournament_id = str(deck.get('tournament_id') or '').strip()

        if group_by_tournament_date:
            # Group on exact tournament rows for precise date filtering and trend calculations.
            date_key = raw_tournament_date or 'Unknown-Date'
            id_key = tournament_id or 'Unknown-Tournament'
            group_key = (id_key, date_key, arch)
        else:
            group_key = arch
        grouped_deck_counts[group_key] += 1
        seen: Set[str] = set()
        for c in deck.get('cards', []):
            name = c.get('name', '')
            if not name:
                continue

            try:
                count = int(c.get('count', 0))
            except (TypeError, ValueError):
                logger.debug("Invalid card count for %s in %s: %s", name, arch, c.get('count'))
                continue

            grouped_cards[group_key][name]['total_count'] += count
            grouped_cards[group_key][name]['max_count'] = max(grouped_cards[group_key][name]['max_count'], count)
            sc = str(c.get('set_code', '') or c.get('set', ''))
            sn = str(c.get('set_number', '') or c.get('number', ''))
            if sc and sn:
                grouped_cards[group_key][name]['set_versions'][(sc, sn)] += count
            if name not in seen:
                grouped_cards[group_key][name]['deck_count'] += 1
                seen.add(name)

    result: List[RowDict] = []
    for group_key, cards in grouped_cards.items():
        if group_by_tournament_date:
            if not isinstance(group_key, tuple) or len(group_key) != 3:
                logger.debug("Unexpected group_key format in tournament mode: %s", group_key)
                continue
            tournament_id, tournament_date, arch = group_key
            period = get_week_id(tournament_date)
        else:
            tournament_id, tournament_date, period, arch = '', '', '', group_key

        total_decks = grouped_deck_counts[group_key]
        for name, stats in cards.items():
            deck_inclusion_count = stats['deck_count']
            pct = (deck_inclusion_count / total_decks * 100) if total_decks > 0 else 0
            # NEUE METRIK: average_count = total_count / deck_inclusion_count
            average_count = round(stats['total_count'] / deck_inclusion_count, 2) if deck_inclusion_count > 0 else 0
            # NEUE METRIK: average_count_overall = total_count / total_decks (Durchschnitt über ALLE Decks)
            average_count_overall = round(stats['total_count'] / total_decks, 2) if total_decks > 0 else 0
            
            c_info = _resolve_card_info(name, stats['set_versions'], card_db)
            row: RowDict = {
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
            }

            if group_by_tournament_date:
                row['meta'] = 'City League'
                row['tournament_id'] = tournament_id
                row['tournament_date'] = tournament_date
                row['date'] = tournament_date
                row['period'] = period
                row['total_decks_in_archetype_in_period'] = total_decks

            result.append(row)
    return result


def _resolve_card_info(card_name: str, set_versions: Mapping[Tuple[str, str], int], card_db: CardDatabaseLookup) -> Dict[str, str]:
    """Resolves card metadata with preference for most-played exact set+number in decklists."""
    fallback = card_db.get_card_info(card_name) or {}
    if not set_versions:
        return fallback

    best_set, best_number = max(set_versions.items(), key=lambda x: x[1])[0]
    specific = card_db.get_card(best_set, best_number) or {}
    return {
        'set_code': best_set,
        'number': best_number,
        'rarity': specific.get('rarity', fallback.get('rarity', '')),
        'type': specific.get('type', fallback.get('type', '')),
        'image_url': specific.get('image_url', fallback.get('image_url', '')),
    }

def save_to_csv(data: List[RowDict], output_file: str, append_mode: bool = False):
    if not data: return
    out_path = os.path.join(get_data_dir(), output_file)

    existing = []
    if append_mode and os.path.exists(out_path):
        with open(out_path, 'r', encoding='utf-8-sig') as f:
            existing = list(csv.DictReader(f, delimiter=';'))

    if append_mode and existing:
        def row_period_key(row: Mapping[str, Any]) -> str:
            tournament_id = row.get('tournament_id', '')
            period = row.get('period', '') or row.get('date', '') or row.get('tournament_date', '')
            return f"{tournament_id}|{period}|{row.get('archetype','')}|{row.get('card_name','')}"

        new_keys = {row_period_key(r) for r in data}
        merged = [r for r in existing if row_period_key(r) not in new_keys]
        merged.extend(data)
        data = merged

    if not data: return

    if 'period' in data[0]:
        reordered: List[RowDict] = []
        for row in data:
            ordered = {'period': row.get('period', '')}
            for key, value in row.items():
                if key == 'period':
                    continue
                ordered[key] = value
            reordered.append(ordered)
        data = reordered
    elif 'date' in data[0]:
        reordered: List[RowDict] = []
        for row in data:
            ordered = {'date': row.get('date', '')}
            for key, value in row.items():
                if key == 'date':
                    continue
                ordered[key] = value
            reordered.append(ordered)
        data = reordered

    fieldnames = list(data[0].keys())
    def _write_csv(f):
        writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=';', extrasaction='ignore')
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
    
    atomic_write_file(out_path, _write_csv, encoding='utf-8-sig', newline='')
