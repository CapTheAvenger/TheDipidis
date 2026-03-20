#!/usr/bin/env python3
"""
Pokemon TCG Set List Scraper
=============================
Scrapes the complete set list from Limitless TCG to keep SET_ORDER up-to-date.

Source: https://limitlesstcg.com/cards
Output: data/pokemon_sets_list.csv

Run this whenever a new set is released to update the SET_ORDER mapping.

OPTIMIZATION: Only re-scrapes full list if a new set is detected (2-3 sec vs 10-20 sec).
"""

import csv
import os
from pathlib import Path
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time

# Settings
BASE_URL = "https://limitlesstcg.com/cards"
OUTPUT_CSV = "data/pokemon_sets_list.csv"
OUTPUT_JS = "data/pokemon_sets_order.js"

def load_existing_sets():
    """Load existing set list from CSV."""
    if not os.path.exists(OUTPUT_CSV):
        return []
    
    try:
        with open(OUTPUT_CSV, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            sets = list(reader)
            print(f"[Set Scraper] Loaded {len(sets)} existing sets from CSV")
            return sets
    except Exception as e:
        print(f"[Set Scraper] Error loading existing CSV: {e}")
        return []

def scrape_newest_set_only():
    """Scrape only the newest (first) set to check for changes."""
    print("[Set Scraper] 🔍 Quick check: Scraping newest set only...")
    
    options = webdriver.ChromeOptions()
    options.add_argument('--headless')
    options.add_argument('--disable-gpu')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    
    driver = webdriver.Chrome(options=options)
    driver.set_page_load_timeout(30)
    
    newest_set = None
    
    try:
        driver.get(BASE_URL)
        wait = WebDriverWait(driver, 15)
        wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "table tbody tr")))
        time.sleep(2)
        
        rows = driver.find_elements(By.CSS_SELECTOR, "table tbody tr")
        for row in rows:
            try:
                cells = row.find_elements(By.TAG_NAME, "td")
                if len(cells) < 2:
                    continue
                links = cells[0].find_elements(By.TAG_NAME, "a")
                if not links:
                    continue
                href = links[0].get_attribute("href") or ''
                if '/cards/' not in href:
                    continue
                set_code = href.rstrip('/').split('/cards/')[-1].split('/')[0].split('?')[0].upper()
                if not set_code:
                    continue
                full_name = links[0].text.strip() or cells[0].text.strip()
                set_name = full_name
                if full_name.upper().startswith(set_code):
                    set_name = full_name[len(set_code):].strip()
                release_date = cells[1].text.strip() if len(cells) > 1 else ''
                newest_set = {'set_code': set_code, 'set_name': set_name, 'release_date': release_date}
                print(f"[Set Scraper] Newest set on Limitless: {set_code} - {set_name} ({release_date})")
                break
            except Exception:
                continue
    except Exception as e:
        print(f"[Set Scraper] Error checking newest set: {e}")
    finally:
        driver.quit()
    
    return newest_set

def scrape_set_list():
    """Scrape all Pokemon TCG sets from Limitless.
    
    Limitless uses virtual/lazy rendering - row text is only populated when the
    row is in the viewport.  We solve this by scrolling in small steps and
    collecting data at each position, keeping the best (non-empty) value seen.
    """
    
    print("=" * 80)
    print("POKEMON TCG SET LIST SCRAPER")
    print("=" * 80)
    print()
    print(f"Source: {BASE_URL}")
    print(f"Output: {OUTPUT_CSV}")
    print()
    
    print("[Set Scraper] Starting browser...")
    options = webdriver.ChromeOptions()
    options.add_argument('--headless')
    options.add_argument('--disable-gpu')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    options.add_argument('--window-size=1920,1080')
    
    driver = webdriver.Chrome(options=options)
    driver.set_page_load_timeout(60)
    
    collected = {}   # set_code -> best data seen so far
    row_order = []   # maintains insertion order for final sort
    
    try:
        print(f"[Set Scraper] Loading {BASE_URL}...")
        driver.get(BASE_URL)
        
        wait = WebDriverWait(driver, 30)
        wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "table tbody tr")))
        time.sleep(2)
        
        # Scroll incrementally — collect data at each viewport position
        print("[Set Scraper] Scrolling through page to trigger lazy rendering...")
        step = 350   # px — roughly one screenful of rows at a time
        pos = 0
        passes = 0
        
        while True:
            driver.execute_script(f"window.scrollTo(0, {pos});")
            time.sleep(0.5)
            
            rows = driver.find_elements(By.CSS_SELECTOR, "table tbody tr")
            for row in rows:
                try:
                    cells = row.find_elements(By.TAG_NAME, "td")
                    if len(cells) < 2:
                        continue
                    links = cells[0].find_elements(By.TAG_NAME, "a")
                    if not links:
                        continue
                    
                    href = links[0].get_attribute("href") or ''
                    if '/cards/' not in href:
                        continue
                    set_code = href.rstrip('/').split('/cards/')[-1].split('/')[0].split('?')[0].upper()
                    if not set_code:
                        continue
                    
                    # Extract name: split cell text by newlines, discard the set-code line
                    cell_text = cells[0].text.strip()
                    name_lines = [
                        l.strip() for l in cell_text.split('\n')
                        if l.strip() and l.strip().upper() != set_code
                    ]
                    set_name = name_lines[0] if name_lines else ''
                    
                    release_date = cells[1].text.strip() if len(cells) > 1 else ''
                    card_count  = cells[2].text.strip() if len(cells) > 2 else ''
                    
                    existing = collected.get(set_code)
                    # Update if we have no entry yet, or if this one has better (non-empty) data
                    if not existing:
                        collected[set_code] = {
                            'set_code': set_code,
                            'set_name': set_name,
                            'release_date': release_date,
                            'card_count': card_count,
                        }
                        row_order.append(set_code)
                    else:
                        if set_name and not existing['set_name']:
                            existing['set_name'] = set_name
                        if release_date and not existing['release_date']:
                            existing['release_date'] = release_date
                        if card_count and not existing['card_count']:
                            existing['card_count'] = card_count
                            
                except Exception:
                    continue
            
            page_height = driver.execute_script("return document.body.scrollHeight")
            pos += step
            passes += 1
            if pos > page_height:
                break
        
        # One final pass at the very bottom
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        time.sleep(1)
        rows = driver.find_elements(By.CSS_SELECTOR, "table tbody tr")
        for row in rows:
            try:
                cells = row.find_elements(By.TAG_NAME, "td")
                if len(cells) < 2:
                    continue
                links = cells[0].find_elements(By.TAG_NAME, "a")
                if not links:
                    continue
                href = links[0].get_attribute("href") or ''
                if '/cards/' not in href:
                    continue
                set_code = href.rstrip('/').split('/cards/')[-1].split('/')[0].split('?')[0].upper()
                if not set_code or set_code not in collected:
                    continue
                existing = collected[set_code]
                cell_text = cells[0].text.strip()
                name_lines = [l.strip() for l in cell_text.split('\n') if l.strip() and l.strip().upper() != set_code]
                if name_lines and not existing['set_name']:
                    existing['set_name'] = name_lines[0]
                if len(cells) > 1 and cells[1].text.strip() and not existing['release_date']:
                    existing['release_date'] = cells[1].text.strip()
            except Exception:
                continue
        
        print(f"[Set Scraper] Extracting set data (collected during {passes} scroll passes)...")
    
    except Exception as e:
        print(f"[Set Scraper] ERROR: {e}")
        import traceback
        traceback.print_exc()
        driver.quit()
        return []
    
    finally:
        driver.quit()
    
    # Build final list preserving page order; assign order numbers (newest = highest)
    sets = []
    total = len(row_order)
    for i, code in enumerate(row_order):
        entry = collected[code].copy()
        entry['order'] = total - i   # first in list = newest = highest order number
        sets.append(entry)
    
    print()
    for i, s in enumerate(sets, 1):
        print(f"  [{i}/{total}] {s['set_code']:6s} - {s['set_name'][:40]:40s} ({s['release_date']})")
    
    print()
    print(f"[Set Scraper] Extracted {len(sets)} sets")
    
    return sets

def save_sets_to_csv(sets):
    """Save sets to CSV file."""
    
    if not sets:
        print("[Set Scraper] No sets to save")
        return
    
    os.makedirs('data', exist_ok=True)
    
    with open(OUTPUT_CSV, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['set_code', 'set_name', 'release_date', 'card_count', 'order'])
        writer.writeheader()
        writer.writerows(sets)
    
    print(f"[Set Scraper] ✓ Saved to {OUTPUT_CSV}")

def generate_javascript_mapping(sets):
    """Generate JavaScript SET_ORDER object for landing.html."""
    
    if not sets:
        return
    
    # Sort by order (highest first)
    sets_sorted = sorted(sets, key=lambda x: x['order'], reverse=True)
    
    js_lines = [
        "// Pokemon TCG Set Order Mapping",
        f"// Auto-generated from Limitless TCG on {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        "// Higher number = newer set",
        "",
        "const SET_ORDER = {"
    ]
    
    # Group by era for readability
    current_era = None
    for s in sets_sorted:
        set_name = s['set_name']
        
        # Detect era changes
        era = None
        if 'Mega' in set_name or s['set_code'] in ['ASC', 'PFL', 'MEG', 'MEE', 'MEP']:
            era = "Mega"
        elif any(x in set_name for x in ['Scarlet', 'Violet', 'Prismatic', 'Surging', 'Stellar']):
            era = "Scarlet & Violet"
        elif any(x in set_name for x in ['Sword', 'Shield', 'Crown', 'Silver', 'Lost']):
            era = "Sword & Shield"
        elif any(x in set_name for x in ['Sun', 'Moon', 'Cosmic', 'Hidden', 'Unified']):
            era = "Sun & Moon"
        elif set_name.startswith('XY') or 'Evolution' in set_name or 'Steam' in set_name:
            era = "XY"
        elif any(x in set_name for x in ['Black', 'White', 'Plasma']):
            era = "Black & White"
        elif any(x in set_name for x in ['HeartGold', 'SoulSilver', 'Call of Legends']):
            era = "HeartGold & SoulSilver"
        elif any(x in set_name for x in ['Diamond', 'Pearl', 'Platinum']):
            era = "Diamond & Pearl"
        else:
            era = "Classic"
        
        if era != current_era:
            if current_era is not None:
                js_lines.append("")
            js_lines.append(f"    // {era}")
            current_era = era
        
        js_lines.append(f"    '{s['set_code']}': {s['order']},  // {set_name}")
    
    js_lines.append("};")
    
    js_content = "\n".join(js_lines)
    
    with open(OUTPUT_JS, 'w', encoding='utf-8') as f:
        f.write(js_content)
    
    print(f"[Set Scraper] ✓ Generated JavaScript mapping: {OUTPUT_JS}")
    print()
    print("Copy the SET_ORDER object from this file into landing.html")

def main():
    """Main scraper function with optimization."""
    
    print("=" * 80)
    print("POKEMON TCG SET LIST SCRAPER")
    print("=" * 80)
    print()
    print(f"Source: {BASE_URL}")
    print(f"Output: {OUTPUT_CSV}")
    print()
    
    # Step 1: Load existing sets
    existing_sets = load_existing_sets()
    
    if existing_sets:
        # Step 2: Quick check - scrape only newest set
        newest_set = scrape_newest_set_only()
        
        if newest_set:
            # Step 3: Compare with existing newest set
            existing_newest = existing_sets[0] if existing_sets else None
            
            if existing_newest and existing_newest['set_code'] == newest_set['set_code']:
                print()
                print("=" * 80)
                print("✓ No new sets detected - set list is up-to-date!")
                print("=" * 80)
                print()
                print(f"Latest set: {newest_set['set_code']} - {newest_set['set_name']}")
                print(f"Total sets in database: {len(existing_sets)}")
                print()
                print("⚡ Fast exit - completed in ~2-3 seconds")
                return
            else:
                print()
                print("=" * 80)
                print("🆕 NEW SET DETECTED!")
                print("=" * 80)
                print()
                if existing_newest:
                    print(f"  Old: {existing_newest['set_code']} - {existing_newest['set_name']}")
                print(f"  New: {newest_set['set_code']} - {newest_set['set_name']}")
                print()
                print("Starting full scrape to update complete set list...")
                print()
    
    # Step 4: Full scrape (either first run or new set detected)
    sets = scrape_set_list()
    
    if sets:
        save_sets_to_csv(sets)
        generate_javascript_mapping(sets)
        
        print()
        print("=" * 80)
        print("✓ Set list scraping complete!")
        print("=" * 80)
        print()
        print("Next steps:")
        print("1. Check data/pokemon_sets_list.csv for accuracy")
        print("2. Copy SET_ORDER from data/pokemon_sets_order.js into landing.html")
    else:
        print()
        print("=" * 80)
        print("✗ No sets found - scraping failed")
        print("=" * 80)

if __name__ == '__main__':
    main()
