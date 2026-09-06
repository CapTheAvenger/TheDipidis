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
try:  # als Paket (backend.core) ...
    from .ace_spec_regel import entscheide_zeile, lade_ace_liste
except ImportError:  # ... oder als Einzelmodul, wie die Scraper es laden
    from ace_spec_regel import entscheide_zeile, lade_ace_liste

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
    quiet=True unterdrückt das finale WARNING-Log (z.B. wenn ein Fallback folgt).

    Two-stage strategy:
      1. cloudscraper with Chrome impersonation (long-standing default)
      2. curl_cffi with full Chrome120 TLS-fingerprint impersonation
         as fallback when stage 1 exhausts retries. curl_cffi matches
         the JA3 hash + TLS extensions of a real Chrome browser, which
         survives Cloudflare's stricter bot-detection escalations that
         occasionally trip cloudscraper. Observed 2026-05-24 on
         labs.limitlesstcg.com — a weekly run produced 0 deck rows
         despite the deck-list scrape having worked hours earlier the
         same day. curl_cffi is graceful-optional: if not installed,
         the function returns "" exactly like before (no behavior change
         in the happy path).
    """
    scraper = _get_scraper()
    delay = retry_delay
    last_status = None
    for attempt in range(1, retries + 2):
        try:
            resp = scraper.get(url, timeout=timeout)
            last_status = resp.status_code
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

    # cloudscraper exhausted retries → try curl_cffi as last-resort bypass.
    fallback_html = _curl_cffi_fetch(url, timeout=timeout, quiet=quiet)
    if fallback_html:
        logger.info("curl_cffi fallback succeeded for %s (cloudscraper got %s)", url, last_status)
        return fallback_html
    return ""


def _curl_cffi_fetch(url: str, timeout: int = 15, quiet: bool = False) -> str:
    """Fallback fetcher using curl_cffi with Chrome120 TLS-fingerprint
    impersonation. Returns "" on failure or when the library is not
    installed (graceful no-op)."""
    try:
        from curl_cffi import requests as cf_requests  # type: ignore
    except ImportError:
        return ""
    try:
        resp = cf_requests.get(
            url,
            impersonate='chrome120',
            timeout=timeout,
            allow_redirects=True,
        )
        if resp.status_code == 200:
            return resp.text
        if not quiet:
            logger.debug("curl_cffi fallback got HTTP %s for %s", resp.status_code, url)
    except Exception as e:
        if not quiet:
            logger.debug("curl_cffi fallback errored for %s: %s", url, e)
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
    # Narrow exception types so genuine bugs (e.g. a renamed argument
    # passed in by a caller) surface as crashes instead of silently
    # collapsing to the 30-day default. strptime only ever raises
    # ValueError for parse failures and TypeError when handed a non-str.
    try: start_dt = datetime.strptime(start_date, "%d.%m.%Y")
    except (ValueError, TypeError): start_dt = datetime.now() - timedelta(days=30)

    if end_date == "auto": end_dt = datetime.now() - timedelta(days=2)
    else:
        try: end_dt = datetime.strptime(end_date, "%d.%m.%Y")
        except (ValueError, TypeError): end_dt = datetime.now() - timedelta(days=2)
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
        # (SET, Nummer) -> Kartensatz. Der Schluessel, den CLAUDE.md
        # unter "Data rules" verlangt: *Never join card data by name.*
        # get_card() lief bisher als lineare Suche ueber alle Varianten
        # — bei 30.000 Kartenzeilen je Lauf ist das kein Nachschlagen
        # mehr, sondern ein Grund, es gar nicht erst zu versuchen.
        self.nach_druck: Dict[str, CardVariant] = {}
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
            eintrag = {
                'name': name, 'set_code': sc, 'set_number': sn, 'number': sn,
                'rarity': row.get('rarity', ''), 'type': c_type, 'supertype': supertype,
                'image_url': row.get('image_url', ''), '_source': source
            }
            self.cards[norm].append(eintrag)
            if sc and sn:
                self.nach_druck.setdefault(
                    self.druckschluessel(sc, sn), eintrag)

    def normalize_name(self, name: str) -> str:
        norm = name.strip().lower().replace("'", "").replace("`", "").replace("\u2019", "").replace("-", " ").replace(".", "")
        return ' '.join(norm.split())

    @staticmethod
    def druckschluessel(set_code: str, number: str) -> str:
        return f"{str(set_code).strip().upper()}-{str(number).strip()}"

    def get_card(self, set_code: str, number: str) -> Optional[Dict[str, str]]:
        """Manager API compatibility — jetzt ueber den Druckindex."""
        v = self.nach_druck.get(self.druckschluessel(set_code, number))
        if not v:
            return None
        return {'set_name': '', 'rarity': v['rarity'], 'type': v['type'],
                'image_url': v['image_url']}

    def typ_von_druck(self, set_code: str, number: str) -> str:
        """Der feine Kartentyp zu genau diesem Druck, oder ''.

        WARUM NICHT DIE SPALTENUEBERSCHRIFT (06.09.2026):
        Die Decklisten-Seite gruppiert nur in "Pokémon", "Trainer" und
        "Energy". Genau diese drei Woerter in die Spalte `type` zu
        schreiben waere SCHLECHTER als sie leer zu lassen: das Frontend
        (js/deck-builder-consistency.js, `kat()`) liest `c.type` zuerst
        und faellt nur bei leerem Wert auf die Kartendatenbank zurueck.
        Ein "Trainer" dort trifft keinen seiner Zweige und landet im
        Sammelfall 'Pokemon' — die Kategorie-Deckung saehe dann
        vollstaendig aus und waere falsch. Deshalb wird hier der
        feine Typ ueber (set, number) aufgeloest oder gar nichts
        geschrieben."""
        v = self.nach_druck.get(self.druckschluessel(set_code, number))
        return str(v.get('type') or '') if v else ''

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

    # ── ACE SPEC ──────────────────────────────────────────────────
    #
    # BEFUND (30.08.2026): die Erkennung unten hing allein an
    # `'ace spec' in v['type']`. Diese Zeichenkette kommt in KEINEM der
    # 37 type-Werte aus all_cards_database.csv und in keinem der 10 aus
    # japanese_cards_database.csv vor — die Pruefung konnte nur noch
    # False liefern, still und ohne Meldung.
    #
    # Was das kostet: `is_ace_spec` steht in 18 ausgelieferten Dateien.
    # Gegen die kanonische Liste data/ace_specs.json gemessen sind
    # 12.734 Zeilen faelschlich "Yes" (Reste eines aelteren DB-Stands:
    # "Switch" 3.386x, "Jamming Tower" 2.243x) und 5.411 faelschlich
    # "No"/leer (echte ACE SPECs: "Unfair Stamp" 600x, "Prime Catcher",
    # "Secret Box", "Legacy Energy"). Jede NEU erzeugte Zeile bekaeme
    # weiterhin ein falsches "No" — current_meta_card_data.csv vom
    # 28.08.2026 hat 184 davon.
    #
    # Die Reparatur raet nicht, sie gleicht ab: data/ace_specs.json ist
    # dieselbe Liste, der das Frontend seit jeher vertraut
    # (js/app-core.js:2396 ff., meta-binder.js isAceSpecRow) — 39 Namen,
    # Quelle limitlesstcg.com/cards?q=is:ace. Der type-Weg bleibt davor
    # stehen, falls die Datenbank das Feld je zurueckbekommt.
    #
    # Ist WEDER ein type-Treffer moeglich NOCH die Liste lesbar, wird
    # das gemeldet statt still "No" zu schreiben (Projektregel: melden,
    # nicht raten).
    _ACE_LISTE = None          # None = noch nicht geladen, set() = leer
    _ACE_GEMELDET = False

    @classmethod
    def _ace_namen(cls) -> set:
        if cls._ACE_LISTE is not None:
            return cls._ACE_LISTE
        cls._ACE_LISTE = set()
        here = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(os.path.dirname(here))
        for pfad in (os.path.join(project_root, 'data', 'ace_specs.json'),
                     os.path.join(get_data_dir(), 'ace_specs.json')):
            try:
                if not os.path.exists(pfad):
                    continue
                with open(pfad, encoding='utf-8') as f:
                    roh = json.load(f).get('ace_specs') or []
                namen = {str(n).strip().lower() for n in roh if str(n).strip()}
                if namen:
                    cls._ACE_LISTE = namen
                    return cls._ACE_LISTE
            except (OSError, ValueError):
                continue
        if not cls._ACE_GEMELDET:
            cls._ACE_GEMELDET = True
            print("::warning::ace_specs.json nicht lesbar — is_ace_spec kann "
                  "nur noch ueber das type-Feld erkannt werden, und das "
                  "fuehrt seit einem DB-Wechsel keine ACE-SPEC-Angabe mehr.")
        return cls._ACE_LISTE

    def is_ace_spec_by_name(self, card_name: str) -> bool:
        norm = self.normalize_name(card_name)
        # 1) Der urspruengliche Weg. Heute tot, aber nicht falsch: sobald
        #    die Kartendatenbank das type-Feld wieder fuehrt, gewinnt sie,
        #    weil sie die Auflage pro Druck kennt und die Liste nur Namen.
        if norm in self.cards and any('ace spec' in (v.get('type') or '').lower()
                                      for v in self.cards[norm]):
            return True
        # 2) Abgleich gegen die kanonische Liste — kein Raten.
        namen = self._ace_namen()
        if not namen:
            return False
        roh = str(card_name or '').strip().lower()
        if roh in namen:
            return True
        # Die Liste fuehrt reine Kartennamen; unsere Aufrufer geben
        # gelegentlich einen mit Set-Zusatz herein.
        return roh.split(' (')[0].strip() in namen

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
def _feiner_typ(card_db, set_code, set_number) -> str:
    """Typ ueber (set, number), ohne dass ein fremdes card_db-Objekt
    den Lauf kostet. Aeltere Aufrufer reichen Attrappen herein, die
    typ_von_druck nicht kennen — dann bleibt das Feld leer, was der
    Zustand von vorher ist und nichts kaputt macht."""
    holen = getattr(card_db, 'typ_von_druck', None)
    if not callable(holen):
        return ''
    try:
        return holen(set_code, set_number) or ''
    except Exception:
        return ''


def extract_cards_from_decklist_soup(soup, card_db: CardDatabaseLookup) -> list:
    """Extract cards from a Limitless-style decklist HTML (BeautifulSoup object).

    Der Druck (set, number) wird fuer JEDE Karte von der Seite gelesen:
      1. href link  (/cards/SET/NUMBER)
      2. data-set / data-number attributes
      3. <span class="set"> or <span class="card-set">
    Nur wenn die Seite nichts hergibt, wird ueber den Namen auf den
    juengsten Druck niedriger Seltenheit ausgewichen — und das wird
    protokolliert.

    WARUM DAS FRUEHER ANDERS WAR UND WAS ES GEKOSTET HAT (06.09.2026).
    Bis heute galt der Seitenabgriff nur fuer Pokemon; Trainer und
    Energie wurden AUSSCHLIESSLICH ueber den Namen aufgeloest
    (get_latest_low_rarity_version). CLAUDE.md, "Data rules", verbietet
    genau das: *Never join card data by name.*

    Nachgemessen an zehn Decklisten von limitlesstcg.com, 232
    Kartenzeilen:

        Pokemon          85 von 85 richtig
        Trainer/Energie  70 von 147 FALSCH  (47,6 %)

    Betroffen sind 19.003 der 30.459 Zeilen in
    data/tournament_decklists_per_player.csv (62,4 %).

    Und die Seite liefert die richtige Angabe die ganze Zeit mit. An
    Boming Wangs Mega-Excadrill-Liste (Worlds, Platz 37) nachgesehen:

        <div class="decklist-card" data-set="DRI" data-number="176">
            Team Rocket's Petrel

    Wir schrieben ASC 207. Ebenso Lillie's Determination (MEG 119 ->
    ASC 192), Buddy-Buddy Poffin (TEF 144 -> ASC 184), Metal Energy
    (MEE 8 -> EVO 98) — acht von elf Trainer-/Energiezeilen dieser
    einen Liste.

    WAS DAS KOSTET. Der Preis nicht viel: der Namensweg waehlte
    absichtlich den guenstigsten Druck, fuer diese Liste 5,25 statt
    4,90 EUR. Der Schaden liegt woanders — falsches Kartenbild im
    Deckbauer und im Proxy-Druck, keine Aussage darueber, WELCHEN Druck
    die Spieler wirklich spielen, und eine Zuordnung, die genau dann
    teuer wird, wenn ein Name mehrere Drucke mit sehr verschiedenen
    Preisen hat. CLAUDE.md nennt das Beispiel selbst: vier Produkte
    "Mega Darkrai ex" zu 1,03 / 9,69 / 184,03 / 331,99 EUR.

    Returns a list of ``{name, count, set_code, set_number, type}`` dicts.

    ``type`` ist der FEINE Kartentyp aus der Kartendatenbank, ueber
    (set, number) aufgeloest — 'Supporter', 'Item', 'Stadium', 'Tool',
    'Basic Energy', oder bei Pokemon der Energietyp. NICHT die
    Spaltenueberschrift der Decklistenseite: die kennt nur "Pokémon",
    "Trainer", "Energy", und diese drei Woerter in die Spalte zu
    schreiben waere schlechter als sie leer zu lassen (siehe
    CardDatabaseLookup.typ_von_druck). Findet die Datenbank den Druck
    nicht, bleibt das Feld leer — gemeldet statt geraten.
    """
    cards: list = []
    for column in soup.select('.decklist-column'):
        heading_elem = column.select_one('.decklist-column-heading')
        if not heading_elem:
            continue
        # Die Spalteneinteilung wird nicht mehr gebraucht: der Druck
        # kommt fuer JEDE Karte von der Seite. Sie stand hier, weil der
        # Trainer-Zweig frueher ueber den Namen aufloeste — genau der
        # Fehler, den dieser Docstring beschreibt.

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
            if card_div is not None:
                # METHOD 1: href link
                link_elem = card_div.find('a', href=True) or name_elem.find('a', href=True)
                if link_elem:
                    parts = link_elem.get('href', '').split('/cards/')[-1].split('/')
                    if len(parts) >= 3:
                        set_code, set_number = parts[1].upper(), parts[2]
                    elif len(parts) == 2:
                        set_code, set_number = parts[0].upper(), parts[1]
                    # Limitless links JP-set cards with a "?translate=en"
                    # query (e.g. /cards/M5/37?translate=en). Strip the query +
                    # fragment so the number stays a clean "37" — otherwise the
                    # (set,number) image lookup fails and the frontend falls
                    # back to the wrong same-name print (MEG-18 for M5-37
                    # Dhelmise, ASC-91 for M5-32 Banette, …).
                    if set_number:
                        set_number = set_number.split('?', 1)[0].split('#', 1)[0].strip()
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
                    cards.append({'name': card_name, 'count': count,
                                  'set_code': set_code, 'set_number': set_number,
                                  'type': _feiner_typ(card_db, set_code, set_number),
                                  'druck_quelle': 'seite'})
                    continue
            # RUECKFALL: die Seite gibt nichts her. Erst hier darf ueber
            # den Namen aufgeloest werden — und es wird gezaehlt, damit
            # niemand die Ausnahme fuer den Normalfall haelt.
            latest = card_db.get_latest_low_rarity_version(card_name)
            if latest:
                logger.info("    Druck fuer '%s' nicht auf der Seite — ueber "
                            "den Namen aufgeloest auf %s %s",
                            card_name, latest.set_code, latest.number)
                cards.append({'name': card_name, 'count': count,
                              'set_code': latest.set_code,
                              'set_number': latest.number,
                              'type': _feiner_typ(card_db, latest.set_code,
                                                  latest.number),
                              'druck_quelle': 'name'})
            else:
                logger.warning("    Druck fuer '%s' weder auf der Seite noch "
                               "in der Kartendatenbank — Zeile faellt weg",
                               card_name)
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
        # BEFUND (30.08.2026): `max_count` wurde ueber die einzelne
        # DRUCKZEILE gebildet, `total_count` aber ueber alle Drucke
        # derselben Karte in einem Deck. Spielt ein Deck 3x Applin
        # TWM 126 und 1x Applin aus einem anderen Druck, stand
        # total_count auf 4 und max_count auf 3 — und die Spalte
        # behauptete, hoechstens drei Kopien laegen im Deck.
        #
        # Gemessen: 365 in sich widerspruechliche Zeilen in drei
        # ausgelieferten Dateien (city_league_analysis_M3.csv 358,
        # current_meta_card_data.csv 5, city_league_analysis_past.csv 2).
        # Sichtbar wurde es beim Kopieren einer Deckliste aus einer
        # einzigen Auswahl: dort liest die Oberflaeche `max_count`, und
        # 264 von 4.129 Auswahlen kamen auf 56 bis 59 statt 60.
        #
        # `max_count` heisst "so viele Kopien lagen hoechstens in EINEM
        # Deck". Also erst je Deck zusammenzaehlen, dann das Maximum
        # nehmen. Nebenbei faellt `seen` weg: die Menge der Namen dieses
        # Decks ist jetzt ohnehin da.
        pro_deck: DefaultDict[str, int] = defaultdict(int)
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
            pro_deck[name] += count
            sc = str(c.get('set_code', '') or c.get('set', ''))
            sn = str(c.get('set_number', '') or c.get('number', ''))
            if sc and sn:
                grouped_cards[group_key][name]['set_versions'][(sc, sn)] += count

        for name, im_deck in pro_deck.items():
            eintrag = grouped_cards[group_key][name]
            eintrag['max_count'] = max(eintrag['max_count'], im_deck)
            eintrag['deck_count'] += 1

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
                # Drei Werte, jeder mit Beleg — nicht 'No' als Rueckfall.
                # max_count und type stehen hier bereits fest, damit ist ein
                # Teil der Zeilen belegbar; der Rest bleibt ehrlich leer.
                # Regel: backend/core/ace_spec_regel.py
                'is_ace_spec': ('Yes' if card_db.is_ace_spec_by_name(name)
                                else entscheide_zeile(name, lade_ace_liste(),
                                                      stats['max_count'],
                                                      c_info.get('type', '')))
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
