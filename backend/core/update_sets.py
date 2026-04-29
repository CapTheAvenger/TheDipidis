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

# Hardcoded fallback — used if live scraping fails
FALLBACK_SET_ORDER = {
    # Mega (2025-2026)
    'ASC': 150, 'PFL': 149, 'MEG': 148, 'MEE': 147, 'MEP': 146,
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
    '' on any error so callers can fall back gracefully."""
    path = os.path.join(_CONFIG_DIR, 'scraper_settings.json')
    try:
        with open(path, 'r', encoding='utf-8') as f:
            cfg = json.load(f)
        return (cfg.get('current_meta_analysis') or {}).get('set', '') or ''
    except Exception as e:
        print(f"[Update Sets] Could not read scraper_settings.json: {e}")
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


def write_format_window(sets_metadata_path: str) -> str:
    """Derive data/format_window.json from
        config/scraper_settings.json.current_meta_analysis.set
        + data/sets_metadata.json[<set>].release_date
        + IN_PERSON_LEGAL_LAG_DAYS.
    Skipped (with a warning) when the current set is unknown or has no
    release date — the predictor falls back to "no filter" in that case."""
    current = _read_current_set_from_settings()
    if not current:
        print("[Update Sets] ! current_meta_analysis.set is empty — skipping format_window.json")
        return ''

    try:
        with open(sets_metadata_path, 'r', encoding='utf-8') as f:
            metadata = json.load(f)
    except Exception as e:
        print(f"[Update Sets] ! Could not read {sets_metadata_path}: {e}")
        return ''

    entry = metadata.get(current) or {}
    release_date = entry.get('release_date') or FALLBACK_RELEASE_DATES.get(current, '')
    if not release_date:
        print(f"[Update Sets] ! No release_date known for current set '{current}' — skipping format_window.json")
        return ''

    in_person_legal = _add_days(release_date, IN_PERSON_LEGAL_LAG_DAYS)
    out = {
        'current_set':          current,
        'set_release_date':     release_date,
        'in_person_legal_date': in_person_legal,
        'lag_days':             IN_PERSON_LEGAL_LAG_DAYS,
        '_note': (
            'Online (Limitless ladder + online tournaments) accept new sets on '
            'set_release_date. In-person majors are legal in_person_legal_date '
            '(= release + lag_days). Predictor uses these to filter labs/major '
            'data to the current format and to recency-weight late-format events.'
        ),
    }
    out_path = os.path.join(data_dir, 'format_window.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
    print(
        f"[Update Sets] ✓ format_window.json: {current} "
        f"online {release_date} → in-person {in_person_legal}"
    )
    return out_path


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
        print(f"[Update Sets] Scraped {len(release_dates)} release dates from live site.")
    else:
        print("[Update Sets] No release dates scraped — using fallback dict.")

    os.makedirs(data_dir, exist_ok=True)

    # 1) sets.json (back-compat: flat {code: order})
    sets_path = os.path.join(data_dir, 'sets.json')
    with open(sets_path, 'w', encoding='utf-8') as f:
        json.dump(sets_order, f, indent=2, sort_keys=True)
    print(f"[Update Sets] ✓ Saved {len(sets_order)} sets to: {sets_path}")

    # 2) sets_metadata.json (NEW: code -> {order, release_date})
    metadata_path = write_sets_metadata(sets_order, release_dates)
    print(f"[Update Sets] ✓ Saved metadata to: {metadata_path}")

    # 3) format_window.json (NEW: derived from current set + release date)
    write_format_window(metadata_path)

    print("[Update Sets] Done!")


if __name__ == '__main__':
    main()
