#!/usr/bin/env python3
"""
Update Sets - Scrape Set Release Order from Limitless TCG
==========================================================
Fetches all English sets from Limitless TCG, assigns release-order numbers
(newest = highest), captures release dates, and derives the current
format-window for the Predictor.

Outputs (in data/):
  sets.json            — {set_code: order_number}             (back-compat)
  sets_metadata.json   — {set_code: {order, release_date}}    (NEW)
  format_window.json   — {current_set, set_release_date,      (NEW)
                          in_person_legal_date}

Run this once initially, then whenever new sets are released. The
predictor reads format_window.json to filter labs/major data to the
current format only and to recency-weight late-format tournaments.
"""

import datetime
import json
import os
import re
import sys
import time
from typing import List

try:
    from bs4 import BeautifulSoup
except ImportError:
    print("FEHLER: Bitte installiere: pip install beautifulsoup4")
    sys.exit(1)

try:
    from card_scraper_shared import get_data_dir, setup_console_encoding, safe_fetch_html
    setup_console_encoding()
    data_dir = get_data_dir()
except ImportError:
    data_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
    def safe_fetch_html(url, timeout=15, **kwargs):
        import requests
        r = requests.get(url, timeout=timeout)
        r.raise_for_status()
        return r.text

# Project root for cross-module path resolution (config/ + data/).
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.normpath(os.path.join(_THIS_DIR, '..', '..'))
_CONFIG_DIR = os.path.join(_PROJECT_ROOT, 'config')

# Days between online release and in-person tournament legality.
# Confirmed by user — Limitless online accepts new sets immediately on
# release, in-person majors apply a fixed two-week lag.
IN_PERSON_LEGAL_LAG_DAYS = 14

# Hardcoded fallback release dates for recent JP sets (Limitless
# /cards/jp listing). Same role as FALLBACK_RELEASE_DATES but for the
# Japanese rotation — independent from the EN cycle.
#
# Why we track these separately: JP and EN run on independent cycles
# with DIFFERENT set names. The international set "POR" (Perfect
# Order, EN release 2026-03-27) is the EN counterpart of M3 (Nihil
# Zero, JP) — by the time POR shipped to EN, JP was already on M4
# (Ninja Spinner, JP release 2026-03-13). The "JP leads by N days"
# heuristic we tried earlier is wrong: there's no fixed offset
# because the sets aren't the same physical product. City League JP
# data tracks the JP rotation; the EN scrapers track the EN rotation.
FALLBACK_JP_RELEASE_DATES = {
    'M4':  '2026-03-13',  # Ninja Spinner — current JP rotation anchor
    'M3':  '2025-12-26',  # Nihil Zero (POR-EN counterpart)
}

# Hardcoded fallback release dates for the current rotation. The live
# scraper attempts to parse these from limitlesstcg.com; when the site
# layout changes or the date isn't visible on the cards page, we fall
# back to this dict. Keep the most recent ~6 sets here so a fresh
# install still has a working format_window.json.
FALLBACK_RELEASE_DATES = {
    'POR': '2026-03-27',  # Perfect Order — current rotation anchor
    'BLK': '2026-01-17',
    'WHT': '2026-01-17',
    'DRI': '2025-11-21',
    'JTG': '2025-09-26',
    'PRE': '2025-08-01',
}

# Hardcoded fallback — used if live scraping fails. KEEP IN SYNC with
# data/sets.json: any new release that lands here also needs an entry
# below, or update_sets.py on a CI runner that fails to scrape (Cloudflare,
# DNS hiccup, table re-skinned) silently writes a sets.json missing the
# newest sets → prepare_card_data.py's chunker reads order 0 for those
# sets → cards land in legacy chunk → Deck Builder can't find them.
# That's how POR/M4 cards disappeared from the standard chunk on the
# 2026-05-03 auto-runs. Bump these whenever a new English-set rotation
# happens.
FALLBACK_SET_ORDER = {
    # Mega (2026)
    'M4': 152, 'POR': 151, 'ASC': 150, 'PFL': 149, 'MEG': 148, 'MEE': 147, 'MEP': 146,
    # Scarlet & Violet (2023-2025)
    'BLK': 145, 'WHT': 144, 'DRI': 143, 'JTG': 142, 'PRE': 141,
    'SSP': 140, 'SCR': 139, 'SFA': 138, 'TWM': 137, 'TEF': 136,
    'PAF': 135, 'PAR': 134, 'MEW': 133, 'OBF': 132, 'PAL': 131,
    'SVI': 130, 'SVE': 129, 'SVP': 128,
    # Sword & Shield (2020-2023)
    'CRZ': 127, 'SIT': 126, 'LOR': 125, 'PGO': 124, 'ASR': 123,
    'BRS': 122, 'FST': 121, 'CEL': 120, 'EVS': 119, 'CRE': 118,
    'BST': 117, 'SHF': 116, 'VIV': 115, 'CPA': 114, 'DAA': 113,
    'RCL': 112, 'SSH': 111, 'SWSH': 111, 'SP': 110, 'SWSHP': 110,
    'PR-SW': 110,
    # Sun & Moon (2017-2019)
    'CEC': 109, 'HIF': 108, 'UNM': 107, 'UNB': 106, 'DET': 105,
    'TEU': 104, 'LOT': 103, 'DRM': 102, 'CES': 101, 'FLI': 100,
    'UPR': 99, 'CIN': 98, 'SLG': 97, 'BUS': 96, 'GRI': 95,
    'SUM': 94, 'SMP': 93, 'PR-SM': 93,
    # XY (2014-2016)
    'EVO': 92, 'STS': 91, 'FCO': 90, 'GEN': 89, 'BKP': 88,
    'BKT': 87, 'AOR': 86, 'ROS': 85, 'DCR': 84, 'PRC': 83,
    'PHF': 82, 'FFI': 81, 'FLF': 80, 'XY': 79, 'KSS': 78,
    'XYP': 77, 'PR-XY': 77,
    # Black & White (2011-2013)
    'LTR': 76, 'PLB': 75, 'PLF': 74, 'PLS': 73, 'BCR': 72,
    'DRV': 71, 'DRX': 70, 'DEX': 69, 'NXD': 68, 'NVI': 67,
    'EPO': 66, 'BLW': 65, 'BWP': 64, 'PR-BLW': 64,
    # HeartGold & SoulSilver (2010-2011)
    'CL': 63, 'TM': 62, 'UD': 61, 'UL': 60, 'HS': 59, 'HSP': 58,
    'PR-HS': 58,
    # Diamond & Pearl / Platinum (2007-2010)
    'RM': 57, 'AR': 56, 'SV': 55, 'RR': 54, 'P9': 53, 'PL': 52,
    'SF': 51, 'P8': 50, 'LA': 49, 'MD': 48, 'P7': 47, 'GE': 46,
    'SW': 45, 'P6': 44, 'MT': 43, 'DP': 42, 'DPP': 41, 'PR-DP': 41,
    # EX (2003-2007)
    'P5': 40, 'PK': 39, 'DF': 38, 'CG': 37, 'P4': 36, 'HP': 35,
    'P3': 34, 'LM': 33, 'DS': 32, 'UF': 31, 'P2': 30, 'EM': 29,
    'DX': 28, 'TRR': 27, 'P1': 26, 'RG': 25, 'HL': 24, 'MA': 23,
    'DR': 22, 'SS': 21, 'RS': 20, 'NP': 19,
    # e-Card & WotC (1999-2003)
    'E3': 18, 'E2': 17, 'BG': 16, 'E1': 15, 'LC': 14, 'N4': 13,
    'N3': 12, 'SI': 11, 'N2': 10, 'N1': 9, 'G2': 8, 'G1': 7,
    'TR': 6, 'BS2': 5, 'FO': 4, 'JU': 3, 'BS': 2, 'WP': 1,
}


def scrape_live_sets() -> dict:
    """
    Try to scrape sets from the Limitless TCG sets list page.
    Returns a dict {set_code: order_number} with newest sets = highest number,
    or empty dict if scraping fails.
    """
    # Only use the advanced search page – /sets returns 404
    urls_to_try = [
        "https://limitlesstcg.com/cards",               # main cards page (set list by era)
        "https://limitlesstcg.com/cards/advanced",      # has set dropdown with all codes
        "https://limitlesstcg.com/cards?display=list",
    ]

    set_codes_ordered = []  # ordered list, newest first (as shown on site)

    for url in urls_to_try:
        try:
            print(f"[Update Sets] Fetching: {url}")
            html = safe_fetch_html(url, timeout=15)
            if not html:
                print(f"[Update Sets]   No response from {url}")
                continue
            soup = BeautifulSoup(html, 'lxml')

            # Strategy 1: Look for <select> or <option> elements with set codes
            for select in soup.find_all('select'):
                opts = select.find_all('option')
                found = []
                for opt in opts:
                    val = (opt.get('value') or opt.get_text(strip=True) or '').strip().upper()
                    # Set codes: 2-6 chars, uppercase letters/digits, may contain hyphen
                    if 2 <= len(val) <= 6 and val.replace('-', '').replace('_', '').isalnum():
                        found.append(val)
                if len(found) >= 10:  # looks like a set dropdown
                    set_codes_ordered = found
                    print(f"[Update Sets]   Found {len(found)} sets in <select> dropdown")
                    break

            if set_codes_ordered:
                break

            # Strategy 2: Look for table rows with set code column
            rows = [tr for tr in soup.select("table tr") if tr.find("td")]
            found = []
            for row in rows:
                cells = row.find_all('td')
                if cells:
                    for cell in cells[:3]:
                        text = cell.get_text(strip=True).upper()
                        if 2 <= len(text) <= 6 and text.replace('-', '').isalnum():
                            found.append(text)
                            break
            if len(found) >= 10:
                set_codes_ordered = found
                print(f"[Update Sets]   Found {len(found)} sets in table rows")
                break

            # Strategy 3: Links to set detail pages  (/cards?set=XXX or /sets/XXX)
            found = []
            seen = set()
            for a in soup.find_all('a', href=True):
                href = a['href']
                for pattern in ['/sets/', '?set=', '&set=']:
                    if pattern in href:
                        part = href.split(pattern)[-1].split('&')[0].split('/')[0].strip().upper()
                        if 2 <= len(part) <= 6 and part.replace('-', '').isalnum() and part not in seen:
                            seen.add(part)
                            found.append(part)
                        break
            if len(found) >= 10:
                set_codes_ordered = found
                print(f"[Update Sets]   Found {len(found)} sets from links")
                break

        except Exception as e:
            print(f"[Update Sets]   Error with {url}: {e}")
            time.sleep(2)
            continue

    if not set_codes_ordered:
        return {}

    # Filter out obvious non-set-codes (ALL, EN, DE, etc.)
    # Also filter era-header codes that Limitless uses in dropdowns but which
    # COLLIDE with actual old EN set codes (e.g. SV = Supreme Victors 2009,
    # BW = conflates with BLW, SM = conflates with SUM, SS = Skyridge, etc.)
    ERA_HEADERS = {'SV', 'SM', 'XY', 'BW', 'SS', 'SWSH', 'HS', 'DP', 'PL', 'EX'}
    skip = {'ALL', 'EN', 'DE', 'FR', 'ES', 'IT', 'PT', 'JA', 'KO', 'JP', ''} | ERA_HEADERS
    # Also skip pure year labels like 2024, 2025
    set_codes_ordered = [s for s in set_codes_ordered if s not in skip and not (len(s) == 4 and s.isdigit())]

    # Deduplicate while preserving order
    seen = set()
    unique = []
    for s in set_codes_ordered:
        if s not in seen:
            seen.add(s)
            unique.append(s)

    # Assign order numbers: site shows newest first → first in list = highest number
    result = {}
    total = len(unique)
    for i, code in enumerate(reversed(unique)):  # reversed → oldest=1, newest=total
        result[code] = i + 1

    return result


def scrape_release_dates() -> dict:
    """
    Try to parse {set_code: release_date_iso} from limitlesstcg.com/cards.

    The cards index renders one row per set with a release date column;
    we sniff for "set_code … YYYY-MM-DD" or "set_code … Month DD, YYYY"
    patterns near each detected set link. Best-effort — returns the
    subset that parsed cleanly. Missing dates fall back to
    FALLBACK_RELEASE_DATES.
    """
    out = {}
    try:
        html = safe_fetch_html("https://limitlesstcg.com/cards", timeout=15)
        if not html:
            return out
        soup = BeautifulSoup(html, 'lxml')

        # Each set typically lives in a <tr> with a code cell + date cell.
        for row in soup.select('tr'):
            cells = row.find_all('td')
            if len(cells) < 2:
                continue
            code = ''
            for cell in cells[:3]:
                txt = cell.get_text(strip=True).upper()
                if 2 <= len(txt) <= 6 and txt.replace('-', '').isalnum() and not txt.isdigit():
                    code = txt
                    break
            if not code:
                continue
            row_text = row.get_text(' ', strip=True)
            iso = _extract_iso_date(row_text)
            if iso:
                out.setdefault(code, iso)

        # Fallback: scan all anchors that link to a set page and look at
        # nearby text for a date — covers card-page layouts that use
        # divs instead of tables.
        for a in soup.find_all('a', href=True):
            href = a['href']
            m = re.search(r'(?:[?&]set=|/sets/)([A-Z0-9-]{2,6})', href, re.IGNORECASE)
            if not m:
                continue
            code = m.group(1).upper()
            if code in out:
                continue
            container = a.find_parent(['li', 'div', 'tr']) or a.parent
            if not container:
                continue
            iso = _extract_iso_date(container.get_text(' ', strip=True))
            if iso:
                out[code] = iso
    except Exception as e:
        print(f"[Update Sets] Release-date scrape failed: {e}")
    return out


def scrape_jp_release_dates() -> dict:
    """JP twin of scrape_release_dates. Targets limitlesstcg.com/cards/jp,
    which lists the Japanese set rotation independently from the EN page.
    Same parsing strategy (table rows + anchor-context fallback) so a
    Limitless layout change is symmetric between EN and JP runs.

    Best-effort — returns the subset that parsed cleanly. Empty dict
    when the page is unreachable; caller falls back to FALLBACK_JP_RELEASE_DATES.
    """
    out = {}
    try:
        html = safe_fetch_html("https://limitlesstcg.com/cards/jp", timeout=15)
        if not html:
            return out
        soup = BeautifulSoup(html, 'lxml')
        for row in soup.select('tr'):
            cells = row.find_all('td')
            if len(cells) < 2:
                continue
            code = ''
            for cell in cells[:3]:
                txt = cell.get_text(strip=True).upper()
                if 2 <= len(txt) <= 6 and txt.replace('-', '').isalnum() and not txt.isdigit():
                    code = txt
                    break
            if not code:
                continue
            row_text = row.get_text(' ', strip=True)
            iso = _extract_iso_date(row_text)
            if iso:
                out.setdefault(code, iso)

        for a in soup.find_all('a', href=True):
            href = a['href']
            m = re.search(r'(?:[?&]set=|/sets/)([A-Z0-9-]{2,6})', href, re.IGNORECASE)
            if not m:
                continue
            code = m.group(1).upper()
            if code in out:
                continue
            container = a.find_parent(['li', 'div', 'tr']) or a.parent
            if not container:
                continue
            iso = _extract_iso_date(container.get_text(' ', strip=True))
            if iso:
                out[code] = iso
    except Exception as e:
        print(f"[Update Sets] JP release-date scrape failed: {e}")
    return out


def _pick_current_set(release_dates: dict) -> str:
    """Return the set code with the latest release_date that's <= today.
    Empty string when no qualifying entry exists.

    Used to auto-detect the active rotation anchor without touching
    scraper_settings.json — a fully unattended weekly run can refresh
    `current_set` and `current_set_jp` purely from the live or fallback
    release-date dict."""
    today = datetime.date.today().isoformat()
    candidates = [(code, iso) for code, iso in release_dates.items() if iso and iso <= today]
    if not candidates:
        return ''
    candidates.sort(key=lambda x: x[1], reverse=True)
    return candidates[0][0]


def _extract_iso_date(text: str) -> str:
    """Pull a YYYY-MM-DD date out of free text. Accepts ISO and a few
    common English/German formats. Returns '' on no match."""
    if not text:
        return ''
    # ISO: 2026-03-27
    m = re.search(r'\b(20\d{2})-(\d{2})-(\d{2})\b', text)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    # English: March 27, 2026 / Mar 27 2026
    months = {
        'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'may': '05', 'jun': '06',
        'jul': '07', 'aug': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12',
    }
    m = re.search(
        r'\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2}),?\s+(20\d{2})',
        text, re.IGNORECASE
    )
    if m:
        return f"{m.group(3)}-{months[m.group(1).lower()[:3]]}-{int(m.group(2)):02d}"
    return ''


def _read_current_set_from_settings() -> str:
    """Pick the live set code from config/scraper_settings.json. Returns
    '' on any error so callers can fall back gracefully.

    Walks the known paths in priority order so legacy schemas keep
    working: the unified config currently stores the set under
    limitless_online.set and (redundantly) under
    current_meta_analysis.sources.limitless_online.format_filter."""
    path = os.path.join(_CONFIG_DIR, 'scraper_settings.json')
    try:
        with open(path, 'r', encoding='utf-8') as f:
            cfg = json.load(f)
    except Exception as e:
        print(f"[Update Sets] Could not read scraper_settings.json: {e}")
        return ''

    # Try canonical paths in order
    candidates = [
        cfg.get('limitless_online', {}).get('set'),
        cfg.get('current_meta_analysis', {})
            .get('sources', {})
            .get('limitless_online', {})
            .get('format_filter'),
        cfg.get('current_meta_analysis', {}).get('set'),  # legacy
    ]
    for c in candidates:
        if c:
            return str(c).strip()
    return ''


def _add_days(iso_date: str, days: int) -> str:
    """Add `days` calendar days to a YYYY-MM-DD string. Returns '' on
    parse error so the caller can decide to skip the dependent field."""
    try:
        dt = datetime.date.fromisoformat(iso_date)
        return (dt + datetime.timedelta(days=days)).isoformat()
    except Exception:
        return ''


def write_sets_metadata(sets_order: dict, release_dates: dict) -> str:
    """Combine order + release date into sets_metadata.json. Returns
    the output path for downstream logging."""
    metadata = {}
    for code, order in sets_order.items():
        metadata[code] = {
            'order':        order,
            'release_date': release_dates.get(code, FALLBACK_RELEASE_DATES.get(code, '')),
        }
    out_path = os.path.join(data_dir, 'sets_metadata.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=2, sort_keys=True, ensure_ascii=False)
    return out_path


def write_format_window(sets_metadata_path: str,
                        en_release_dates: dict = None,
                        jp_release_dates: dict = None) -> str:
    """Derive data/format_window.json from independently auto-detected
    EN and JP rotation anchors.

    EN and JP run on disjoint cycles with different set codes — POR
    (EN) and M3 (JP) are equivalent products but ship months apart;
    M4 (JP, Ninja Spinner) released 2026-03-13 has no EN counterpart
    yet. So we pick each side's "current set" independently as the
    most recent set whose release_date is <= today.

    en_release_dates / jp_release_dates: optional pre-fetched dicts
    (callers in main() pass the live-scrape results); the function
    falls back to FALLBACK_RELEASE_DATES / FALLBACK_JP_RELEASE_DATES
    when the dicts are empty / missing entries.

    Skipped (with a warning) only when both sides fail to resolve —
    the predictor / scrapers fall back to "no filter" in that case."""

    # --- EN side ---
    en_dates = dict(FALLBACK_RELEASE_DATES)
    if en_release_dates:
        en_dates.update(en_release_dates)
    en_current = _pick_current_set(en_dates)
    en_release = en_dates.get(en_current, '') if en_current else ''

    # --- JP side ---
    jp_dates = dict(FALLBACK_JP_RELEASE_DATES)
    if jp_release_dates:
        jp_dates.update(jp_release_dates)
    jp_current = _pick_current_set(jp_dates)
    jp_release = jp_dates.get(jp_current, '') if jp_current else ''

    if not (en_current and en_release):
        print("[Update Sets] ! Could not resolve EN current set — skipping format_window.json")
        return ''

    in_person_legal = _add_days(en_release, IN_PERSON_LEGAL_LAG_DAYS)

    out = {
        'current_set':          en_current,
        'set_release_date':     en_release,
        'in_person_legal_date': in_person_legal,
        'lag_days':             IN_PERSON_LEGAL_LAG_DAYS,
        'current_set_jp':       jp_current,
        'jp_release_date':      jp_release,
        '_note': (
            'Auto-derived twice per weekly run from limitlesstcg.com/cards '
            '(EN) and /cards/jp (JP). EN and JP run on independent rotation '
            'cycles with different set codes — POR (Perfect Order, EN) is '
            'the international counterpart of M3 (Nihil Zero, JP); by the '
            'time POR shipped to EN on 2026-03-27, JP was already on M4 '
            '(Ninja Spinner, 2026-03-13). City League scrapers track '
            'jp_release_date; the EN-side scrapers track set_release_date '
            'and (for in-person majors) in_person_legal_date = release + '
            'lag_days. _pick_current_set() keeps these in sync without a '
            'human edit when the next set drops.'
        ),
    }
    out_path = os.path.join(data_dir, 'format_window.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(out, f, indent=2, ensure_ascii=False)

    jp_summary = f"{jp_current} {jp_release}" if jp_current else "(no JP anchor resolved)"
    print(
        f"[Update Sets] ✓ format_window.json: EN {en_current} {en_release} "
        f"→ in-person {in_person_legal}  ·  JP {jp_summary}"
    )
    return out_path


def _format_de_date(iso: str) -> str:
    """ISO YYYY-MM-DD → DD.MM.YYYY (the format scraper_settings.json uses)."""
    if not iso:
        return ''
    try:
        d = datetime.date.fromisoformat(iso)
        return d.strftime('%d.%m.%Y')
    except (ValueError, TypeError):
        return ''


def apply_format_window_to_scraper_settings(format_window_path: str,
                                            settings_path: str) -> bool:
    """Sync the rotation-driven settings in config/scraper_settings.json from
    format_window.json so a CI run can refresh dates + set codes without
    a human edit. Touches:

      - city_league_analysis.sources.city_league.start_date  ← jp_release_date
      - city_league_archetype.start_date                     ← jp_release_date
      - limitless_online.set                                 ← current_set (EN)
      - current_meta_analysis.sources.limitless_online.format_filter  ← current_set
      - current_meta_analysis.sources.tournaments.start_date ← in_person_legal_date

    Idempotent — only writes if anything changed. Returns True if the
    file was modified.

    The unified config used to drift from the per-scraper DEFAULT_SETTINGS
    (last seen on 2026-05-05: city_league_analysis had start_date=24.01.2026
    while the user's intent was 13.03.2026 = JP set release). That mismatch
    pulled 200+ February JP tournaments into the Current view alongside
    M3-era data, producing the 300-tournament overlap with the M3 archive
    snapshot. Auto-syncing these fields here removes the failure mode."""
    if not os.path.isfile(format_window_path):
        print(f"[Update Sets] ! {format_window_path} missing — skipping settings sync")
        return False
    if not os.path.isfile(settings_path):
        print(f"[Update Sets] ! {settings_path} missing — skipping settings sync")
        return False

    with open(format_window_path, 'r', encoding='utf-8') as f:
        fw = json.load(f)

    current_set = fw.get('current_set') or ''
    en_release = fw.get('set_release_date') or ''
    jp_release = fw.get('jp_release_date') or ''
    in_person = fw.get('in_person_legal_date') or ''

    if not (current_set and en_release and jp_release and in_person):
        print(
            f"[Update Sets] ! format_window.json missing fields "
            f"(set={current_set!r}, en={en_release!r}, jp={jp_release!r}, ip={in_person!r}) "
            f"— skipping settings sync"
        )
        return False

    jp_de = _format_de_date(jp_release)
    in_person_de = _format_de_date(in_person)

    with open(settings_path, 'r', encoding='utf-8') as f:
        settings = json.load(f)

    # Walk the known paths and patch — guard each with .setdefault so a
    # truncated config file doesn't crash the run.
    changes: List[str] = []

    cla = settings.setdefault('city_league_analysis', {}).setdefault('sources', {}).setdefault('city_league', {})
    if cla.get('start_date') != jp_de:
        changes.append(f"city_league_analysis.sources.city_league.start_date {cla.get('start_date')!r} → {jp_de!r}")
        cla['start_date'] = jp_de

    cla_arch = settings.setdefault('city_league_archetype', {})
    if cla_arch.get('start_date') != jp_de:
        changes.append(f"city_league_archetype.start_date {cla_arch.get('start_date')!r} → {jp_de!r}")
        cla_arch['start_date'] = jp_de

    lo = settings.setdefault('limitless_online', {})
    if lo.get('set') != current_set:
        changes.append(f"limitless_online.set {lo.get('set')!r} → {current_set!r}")
        lo['set'] = current_set

    cma_lo = settings.setdefault('current_meta_analysis', {}).setdefault('sources', {}).setdefault('limitless_online', {})
    if cma_lo.get('format_filter') != current_set:
        changes.append(f"current_meta_analysis.sources.limitless_online.format_filter {cma_lo.get('format_filter')!r} → {current_set!r}")
        cma_lo['format_filter'] = current_set

    cma_t = settings.setdefault('current_meta_analysis', {}).setdefault('sources', {}).setdefault('tournaments', {})
    if cma_t.get('start_date') != in_person_de:
        changes.append(f"current_meta_analysis.sources.tournaments.start_date {cma_t.get('start_date')!r} → {in_person_de!r}")
        cma_t['start_date'] = in_person_de

    if not changes:
        print("[Update Sets] ✓ Scraper settings already in sync with format_window.json")
        return False

    with open(settings_path, 'w', encoding='utf-8') as f:
        json.dump(settings, f, indent=4, ensure_ascii=False)
        f.write('\n')

    print(f"[Update Sets] ✓ Patched {settings_path}:")
    for ch in changes:
        print(f"    - {ch}")
    return True


def main():
    print("=" * 60)
    print("UPDATE SETS - Fetching set release order from Limitless")
    print("=" * 60)

    sets_order = scrape_live_sets()

    if len(sets_order) < 10:
        print("[Update Sets] Live scraping returned insufficient data.")
        print("[Update Sets] Using hardcoded fallback SET_ORDER.")
        sets_order = FALLBACK_SET_ORDER.copy()
    else:
        # Merge with fallback so old sets not on site are still covered
        merged = FALLBACK_SET_ORDER.copy()
        # Rescale live results on top of fallback (live data takes precedence)
        max_fallback = max(merged.values(), default=0)
        live_max = max(sets_order.values(), default=0)
        scale = max_fallback / live_max if live_max > 0 else 1
        for code, order in sets_order.items():
            live_scaled = int(order * scale)
            if code in merged:
                merged[code] = max(merged[code], live_scaled)
            else:
                merged[code] = live_scaled
        sets_order = merged
        print(f"[Update Sets] Merged live data with fallback ({len(sets_order)} sets total).")

    # Release dates — best-effort scrape, fall back to FALLBACK_RELEASE_DATES.
    release_dates = scrape_release_dates()
    if release_dates:
        print(f"[Update Sets] Scraped {len(release_dates)} EN release dates from live site.")
    else:
        print("[Update Sets] No EN release dates scraped — using fallback dict.")

    # JP release dates from /cards/jp — independent rotation, separate
    # fallback dict. JP and EN run on disjoint cycles so we resolve
    # them in two passes that share no data.
    jp_release_dates = scrape_jp_release_dates()
    if jp_release_dates:
        print(f"[Update Sets] Scraped {len(jp_release_dates)} JP release dates from live site.")
    else:
        print("[Update Sets] No JP release dates scraped — using fallback dict.")

    os.makedirs(data_dir, exist_ok=True)

    # 1) sets.json (back-compat: flat {code: order})
    sets_path = os.path.join(data_dir, 'sets.json')
    with open(sets_path, 'w', encoding='utf-8') as f:
        json.dump(sets_order, f, indent=2, sort_keys=True)
    print(f"[Update Sets] ✓ Saved {len(sets_order)} sets to: {sets_path}")

    # 2) sets_metadata.json (NEW: code -> {order, release_date})
    metadata_path = write_sets_metadata(sets_order, release_dates)
    print(f"[Update Sets] ✓ Saved metadata to: {metadata_path}")

    # 3) format_window.json (auto-pick latest released set per region)
    fw_path = write_format_window(metadata_path,
                                  en_release_dates=release_dates,
                                  jp_release_dates=jp_release_dates)

    # 4) Sync rotation-driven settings in config/scraper_settings.json so
    #    the City League / Current Meta scrapers track the JP and EN
    #    release dates automatically — no more manual edits when a set
    #    rotates. Reads the format_window we just wrote and patches only
    #    the date / set fields, leaving everything else untouched.
    if fw_path:
        # project_root = update_sets.py is at backend/core/update_sets.py
        project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        settings_path = os.path.join(project_root, 'config', 'scraper_settings.json')
        apply_format_window_to_scraper_settings(fw_path, settings_path)

    print("[Update Sets] Done!")


if __name__ == '__main__':
    main()
