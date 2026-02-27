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
        with open(OUTPUT_CSV, 'r', encoding='utf-8') as f:
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
        wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "table")))
        time.sleep(1)  # Minimal wait
        
        # Get only the first row
        first_row = driver.find_element(By.CSS_SELECTOR, "table tbody tr")
        cells = first_row.find_elements(By.TAG_NAME, "td")
        
        if len(cells) >= 3:
            name_cell = cells[0]
            name_link = name_cell.find_element(By.TAG_NAME, "a")
            full_name = name_link.text.strip()
            
            try:
                code_elem = name_cell.find_element(By.CSS_SELECTOR, "div.text-xs.text-gray-500")
                set_code = code_elem.text.strip()
            except:
                set_code = ''
                for char in full_name:
                    if char.isupper():
                        set_code += char
                    elif set_code:
                        break
            
            release_date = cells[1].text.strip()
            
            newest_set = {
                'set_code': set_code,
                'set_name': full_name.replace(set_code, '').strip(),
                'release_date': release_date
            }
            print(f"[Set Scraper] Newest set on Limitless: {set_code} - {newest_set['set_name']} ({release_date})")
    
    except Exception as e:
        print(f"[Set Scraper] Error checking newest set: {e}")
    
    finally:
        driver.quit()
    
    return newest_set

def scrape_set_list():
    """Scrape all Pokemon TCG sets from Limitless."""
    
    print("=" * 80)
    print("POKEMON TCG SET LIST SCRAPER")
    print("=" * 80)
    print()
    print(f"Source: {BASE_URL}")
    print(f"Output: {OUTPUT_CSV}")
    print()
    
    # Setup Chrome driver
    print("[Set Scraper] Starting browser...")
    options = webdriver.ChromeOptions()
    options.add_argument('--headless')
    options.add_argument('--disable-gpu')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    
    driver = webdriver.Chrome(options=options)
    driver.set_page_load_timeout(30)
    
    sets = []
    
    try:
        print(f"[Set Scraper] Loading {BASE_URL}...")
        driver.get(BASE_URL)
        
        # Wait for set list to load
        wait = WebDriverWait(driver, 15)
        wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "table")))
        
        time.sleep(2)  # Extra wait for dynamic content
        
        # Find all set rows in the table
        print("[Set Scraper] Extracting set data...")
        rows = driver.find_elements(By.CSS_SELECTOR, "table tbody tr")
        
        for idx, row in enumerate(rows, 1):
            try:
                cells = row.find_elements(By.TAG_NAME, "td")
                
                if len(cells) < 3:
                    continue
                
                # Extract set name and code from first cell
                name_cell = cells[0]
                name_link = name_cell.find_element(By.TAG_NAME, "a")
                full_name = name_link.text.strip()
                
                # Try to find the set code (usually in a sub-element)
                try:
                    code_elem = name_cell.find_element(By.CSS_SELECTOR, "div.text-xs.text-gray-500")
                    set_code = code_elem.text.strip()
                except:
                    # Fallback: extract from full name (e.g., "ASCAscended Heroes" -> "ASC")
                    set_code = ''
                    for i, char in enumerate(full_name):
                        if char.isupper():
                            set_code += char
                        elif set_code:
                            break
                
                # Extract release date from second cell
                date_cell = cells[1]
                release_date = date_cell.text.strip()
                
                # Extract card count from third cell
                cards_cell = cells[2]
                card_count = cards_cell.text.strip()
                
                if set_code and full_name:
                    sets.append({
                        'set_code': set_code,
                        'set_name': full_name.replace(set_code, '').strip(),
                        'release_date': release_date,
                        'card_count': card_count,
                        'order': len(rows) - idx + 1  # Newest = highest number
                    })
                    
                    print(f"  [{idx}/{len(rows)}] {set_code:6s} - {full_name[:40]:40s} ({release_date})")
                    
            except Exception as e:
                print(f"  [ERROR] Failed to parse row {idx}: {e}")
                continue
        
    except Exception as e:
        print(f"[Set Scraper] ERROR: {e}")
        return []
    
    finally:
        driver.quit()
    
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
