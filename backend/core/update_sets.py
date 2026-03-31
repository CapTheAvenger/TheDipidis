#!/usr/bin/env python3
"""
Update Sets - Scrape Set Release Order from Limitless TCG
==========================================================
Fetches all English sets from Limitless TCG, assigns release-order numbers
(newest = highest), and writes the result to data/sets.json.

Run this once initially, then whenever new sets are released.
"""


import json
import os
import sys
import time
from backend.settings import get_data_path, get_config_path

try:
    from bs4 import BeautifulSoup
except ImportError:
    print("FEHLER: Bitte installiere: pip install beautifulsoup4")
    sys.exit(1)

try:
    from backend.core.card_scraper_shared import setup_console_encoding, safe_fetch_html
    setup_console_encoding()
except ImportError:
    def safe_fetch_html(url, timeout=15, **kwargs):
        import requests
        r = requests.get(url, timeout=timeout)
        r.raise_for_status()
        return r.text

# Hardcoded fallback — used if live scraping fails
FALLBACK_SET_ORDER = {
    # Mega (2025-2026)
    'POR': 151, 'ASC': 150, 'PFL': 149, 'MEG': 148, 'MEE': 147, 'MEP': 146,
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


    out_path = get_data_path('sets.json')
    os.makedirs(out_path.parent, exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(sets_order, f, indent=2, sort_keys=True)

    print(f"[Update Sets] ✓ Saved {len(sets_order)} sets to: {out_path}")
    print("[Update Sets] Done!")


if __name__ == '__main__':
    main()
