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

# Hardcoded fallback — used if live scraping fails
FALLBACK_SET_ORDER = {
    # Mega (2025-2026)
    'ASC': 135, 'PFL': 134, 'MEG': 133, 'MEE': 133, 'MEP': 133,
    # Scarlet & Violet (2023-2025)
    'BLK': 132, 'WHT': 131, 'DRI': 130, 'JTG': 129, 'PRE': 128,
    'SSP': 127, 'SCR': 126, 'SFA': 125, 'TWM': 124, 'TEF': 123,
    'PAF': 122, 'PAR': 121, 'MEW': 120, 'OBF': 119, 'PAL': 118,
    'SVI': 117, 'SVE': 117, 'SVP': 117,
    # Sword & Shield (2020-2023)
    'CRZ': 116, 'SIT': 115, 'LOR': 114, 'PGO': 113, 'ASR': 112,
    'BRS': 111, 'FST': 110, 'CEL': 109, 'EVS': 108, 'CRE': 107,
    'BST': 106, 'SHF': 105, 'VIV': 104, 'CPA': 103, 'DAA': 102,
    'RCL': 101, 'SSH': 100, 'SP': 100, 'SWSH': 100, 'SWSHP': 100,
    'PR-SW': 100,
    # Sun & Moon (2017-2019)
    'CEC': 99, 'HIF': 98, 'UNM': 97, 'UNB': 96, 'DET': 95,
    'TEU': 94, 'LOT': 93, 'DRM': 92, 'CES': 91, 'FLI': 90,
    'UPR': 89, 'CIN': 88, 'SLG': 87, 'BUS': 86, 'GRI': 85,
    'SUM': 84, 'SMP': 84, 'PR-SM': 84,
    # XY (2014-2016)
    'EVO': 83, 'STS': 82, 'FCO': 81, 'GEN': 80, 'BKP': 79,
    'BKT': 78, 'AOR': 77, 'ROS': 76, 'DCR': 75, 'PRC': 74,
    'PHF': 73, 'FFI': 72, 'FLF': 71, 'XY': 70, 'XYP': 70,
    'PR-XY': 70,
    # Black & White (2011-2013)
    'LTR': 69, 'PLB': 68, 'PLF': 67, 'PLS': 66, 'BCR': 65,
    'DRX': 64, 'DEX': 63, 'NXD': 62, 'NVI': 61, 'EPO': 60,
    'BLW': 59, 'BWP': 59, 'PR-BLW': 59,
    # HeartGold & SoulSilver (2010-2011)
    'CL': 58, 'TM': 57, 'UD': 56, 'UL': 55, 'HS': 54, 'HSP': 54,
    'PR-HS': 54,
    # Platinum (2009-2010)
    'AR': 53, 'SV': 52, 'RR': 51, 'PL': 50, 'SF': 49,
    # Diamond & Pearl (2007-2009)
    'LA': 48, 'MD': 47, 'GE': 46, 'SW': 45, 'MT': 44, 'DP': 43,
    'DPP': 43, 'PR-DP': 43,
    # EX (2003-2007)
    'PK': 42, 'DF': 41, 'CG': 40, 'HP': 39, 'LM': 38, 'DS': 37,
    'UF': 36, 'EM': 35, 'DX': 34, 'TRR': 33, 'RG': 32, 'HL': 31,
    'MA': 30, 'DR': 29, 'SS': 28, 'RS': 27,
    # e-Card & Neo (2000-2003)
    'E3': 26, 'E2': 25, 'E1': 24, 'LC': 23, 'N4': 22, 'N3': 21,
    'N2': 20, 'N1': 19,
    # Classic (1999-2000)
    'G2': 18, 'G1': 17, 'TR': 16, 'BS2': 15, 'FO': 14, 'JU': 13, 'BS': 12,
    # Older Special Sets
    'NP': 55, 'WP': 55, 'POP': 55, 'M3': 25, 'MC': 20, 'MP1': 55,
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
            soup = BeautifulSoup(html, 'html.parser')

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

    os.makedirs(data_dir, exist_ok=True)
    out_path = os.path.join(data_dir, 'sets.json')

    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(sets_order, f, indent=2, sort_keys=True)

    print(f"[Update Sets] ✓ Saved {len(sets_order)} sets to: {out_path}")
    print("[Update Sets] Done!")


if __name__ == '__main__':
    main()
