#!/usr/bin/env python3
"""
Japanese Cards Scraper - Scrape LATEST Japanese Pokemon Cards from Limitless TCG
==================================================================================
Scrapes ONLY the 4 most recent Japanese sets each run.
Overwrites CSV completely (no incremental) since older sets get rotated out.
Useful for City League data which uses international cards before global release.

Target: https://limitlesstcg.com/cards?q=lang%3Aen.t&display=list
"""

import csv
import json
import os
import sys
import time
from datetime import datetime
from typing import List, Dict, Set, Tuple

# Import shared utilities
from card_scraper_shared import setup_console_encoding

# Fix Windows console encoding for Unicode characters
setup_console_encoding()

# Default settings
DEFAULT_SETTINGS = {
    "headless": True,
    "max_pages": None,
    "list_page_delay_seconds": 2.0,
    "detail_page_wait_seconds": 2.0,
    "detail_request_delay_seconds": 0.5,
    "keep_latest_sets": 4,
    "skip_detail_scraping": False
}

# Load settings from file if it exists
settings_path = 'japanese_cards_scraper_settings.json'
if os.path.exists(settings_path):
    with open(settings_path, 'r', encoding='utf-8') as f:
        user_settings = json.load(f)
        SETTINGS = {**DEFAULT_SETTINGS, **user_settings}
        print(f"[Japanese Scraper] Loaded settings from {settings_path}")
else:
    SETTINGS = DEFAULT_SETTINGS
    print(f"[Japanese Scraper] Using default settings (no {settings_path} found)")

print("=" * 80)
print(f"JAPANESE CARDS SCRAPER - Scraping Latest {SETTINGS['keep_latest_sets']} Japanese Sets")
print("=" * 80)
print()

try:
    from selenium import webdriver
    from selenium.webdriver.common.by import By
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    SELENIUM_AVAILABLE = True
except ImportError:
    SELENIUM_AVAILABLE = False
    print("[ERROR] Selenium not available! Install with: pip install selenium")
    exit(1)


def get_data_dir() -> str:
    """Get the correct data directory path.
    
    Returns:
        - 'data' if running as Python script from root
        - '../data' if running as EXE from dist/ folder (to write to root/data/)
    """
    # If running as EXE and in 'dist' folder, go up one level
    if getattr(sys, "frozen", False):
        app_dir = os.path.dirname(sys.executable)
        if app_dir.endswith("dist"):
            return os.path.join(app_dir, "..", "data")
    
    # Otherwise use 'data' relative to current directory
    return "data"


def load_existing_sets() -> Set[str]:
    """Load existing Japanese card sets from CSV to check if update is needed."""
    data_dir = get_data_dir()
    csv_path = os.path.join(data_dir, 'japanese_cards_database.csv')
    
    if not os.path.exists(csv_path):
        return set()
    
    try:
        existing_sets = set()
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                if 'set' in row and row['set']:
                    existing_sets.add(row['set'])
        return existing_sets
    except Exception as e:
        print(f"[Japanese Scraper] Could not load existing sets: {e}")
        return set()


def quick_check_latest_sets() -> Set[str]:
    """Quick check of first page to see what the latest sets are."""
    print("[Japanese Scraper] Quick check: Loading first page to detect latest sets...")
    
    chrome_options = Options()
    if SETTINGS['headless']:
        chrome_options.add_argument("--headless")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1920,1080")
    
    driver = webdriver.Chrome(options=chrome_options)
    current_sets = []
    
    try:
        base_url = "https://limitlesstcg.com/cards?q=lang%3Aen.t&display=list"
        driver.get(base_url)
        
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "tbody tr"))
        )
        
        rows = driver.find_elements(By.CSS_SELECTOR, "tbody tr")
        seen_sets = []
        
        for row in rows:
            try:
                cells = row.find_elements(By.TAG_NAME, "td")
                if len(cells) >= 1:
                    set_code = cells[0].get_attribute('textContent').strip()
                    if set_code and set_code not in seen_sets:
                        seen_sets.append(set_code)
                        if len(seen_sets) >= SETTINGS['keep_latest_sets']:
                            break
            except:
                continue
        
        current_sets = seen_sets[:SETTINGS['keep_latest_sets']]
        
    except Exception as e:
        print(f"[Japanese Scraper] Error during quick check: {e}")
    finally:
        driver.quit()
    
    return set(current_sets)


def scrape_japanese_cards_list() -> List[Dict[str, str]]:
    """Scrape Japanese card list and extract set information."""
    print("[Japanese Scraper] Starting Selenium WebDriver...")
    
    chrome_options = Options()
    if SETTINGS['headless']:
        chrome_options.add_argument("--headless")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1920,1080")
    
    driver = webdriver.Chrome(options=chrome_options)
    all_cards_data = []
    
    try:
        # Japanese cards URL (lang=en.t for English-translated Japanese)
        base_url = "https://limitlesstcg.com/cards?q=lang%3Aen.t&display=list"
        print(f"[Japanese Scraper] Loading Japanese cards: {base_url}")

        seen_keys = set()
        page_index = 1
        max_pages = SETTINGS['max_pages'] if SETTINGS['max_pages'] is not None else 50

        while page_index <= max_pages:
            # Try URL with page parameter (common pattern: ?page=N or &page=N)
            if page_index == 1:
                current_url = base_url
            else:
                # Try different pagination URL patterns
                current_url = f"{base_url}&page={page_index}"

            print(f"[Japanese Scraper] Loading page {page_index}: {current_url}")
            driver.get(current_url)

            # Wait for table rows to appear
            try:
                WebDriverWait(driver, 15).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, "tbody tr"))
                )
            except Exception:
                print("[Japanese Scraper] ERROR: Table rows not found on this page.")
                break

            # Extract data from table rows
            rows = driver.find_elements(By.CSS_SELECTOR, "tbody tr")
            print(f"[Japanese Scraper] Found {len(rows)} rows on page {page_index}")
            
            # If no rows or same as before, we've reached the end
            if len(rows) == 0:
                print("[Japanese Scraper] No cards found on this page - stopping.")
                break

            cards_added_this_page = 0
            for idx, row in enumerate(rows):
                try:
                    cells = row.find_elements(By.TAG_NAME, "td")

                    if len(cells) >= 4:
                        # Extract data - column order: Set, No, Name, Type
                        set_code = cells[0].get_attribute('textContent').strip()
                        set_number = cells[1].get_attribute('textContent').strip()
                        card_name = cells[2].get_attribute('textContent').strip()
                        card_type = cells[3].get_attribute('textContent').strip()

                        # Try to get card link for detail page
                        try:
                            link_elem = cells[2].find_element(By.TAG_NAME, "a")
                            card_url = link_elem.get_attribute('href')
                        except:
                            card_url = None

                        if card_name:
                            key = f"{card_name}::{set_code}::{set_number}"
                            if key in seen_keys:
                                continue
                            seen_keys.add(key)
                            all_cards_data.append({
                                'name': card_name,
                                'set': set_code,
                                'number': set_number,
                                'type': card_type,
                                'card_url': card_url,
                                'image_url': '',
                                'rarity': ''
                            })
                            cards_added_this_page += 1

                            if (len(all_cards_data)) % 500 == 0:
                                print(f"[Japanese Scraper]   Processed {len(all_cards_data)} cards so far...")
                except Exception:
                    continue
            
            print(f"[Japanese Scraper] Added {cards_added_this_page} new cards from page {page_index}")
            
            # If we got 0 new cards, we've reached the end or hit duplicates
            if cards_added_this_page == 0:
                print("[Japanese Scraper] No new cards added - reached end.")
                break

            # Move to next page
            page_index += 1
            time.sleep(SETTINGS['list_page_delay_seconds'])
        
    except Exception as e:
        print(f"[Japanese Scraper] ERROR during list scraping: {e}")
        import traceback
        traceback.print_exc()
    finally:
        driver.quit()
    
    print(f"\n[Japanese Scraper] ✓ Extracted {len(all_cards_data)} Japanese cards from list")
    return all_cards_data


def filter_latest_sets(cards: List[Dict[str, str]]) -> Tuple[List[Dict[str, str]], Set[str]]:
    """
    Keep only cards from the N most recent Japanese sets (N from settings).
    Returns filtered cards and the set codes of the latest sets.
    """
    # Get unique sets and their "first appearance" index (lower index = newer)
    set_first_appearance = {}
    for idx, card in enumerate(cards):
        set_code = card['set']
        if set_code not in set_first_appearance:
            set_first_appearance[set_code] = idx
    
    # Sort sets by first appearance (index) - lower index means appeared first = newer
    sorted_sets = sorted(set_first_appearance.items(), key=lambda x: x[1])
    
    # Get the N most recent sets from settings
    keep_count = SETTINGS['keep_latest_sets']
    latest_sets = {set_code for set_code, _ in sorted_sets[:keep_count]}
    
    print(f"\n[Japanese Scraper] Detected {len(set_first_appearance)} different sets total")
    print(f"[Japanese Scraper] Keeping only the {keep_count} most recent sets:")
    for set_code, idx in sorted_sets[:keep_count]:
        count = sum(1 for c in cards if c['set'] == set_code)
        print(f"[Japanese Scraper]   - {set_code}: {count} cards")
    
    # Filter cards
    filtered_cards = [c for c in cards if c['set'] in latest_sets]
    
    print(f"\n[Japanese Scraper] ✓ Filtered to {len(filtered_cards)} cards from {keep_count} latest sets")
    return filtered_cards, latest_sets


def scrape_card_details(cards: List[Dict[str, str]]) -> List[Dict[str, str]]:
    """Scrape detail page for each card to get image URL and rarity."""
    print(f"\n[Japanese Scraper] Scraping detail pages for {len(cards)} cards...")
    print(f"[Japanese Scraper] This may take a while - opening ~1 page per card...")
    
    chrome_options = Options()
    if SETTINGS['headless']:
        chrome_options.add_argument("--headless")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1920,1080")
    
    driver = webdriver.Chrome(options=chrome_options)
    
    try:
        for idx, card in enumerate(cards):
            try:
                if not card.get('card_url'):
                    continue
                
                # Build full URL if relative
                if card['card_url'].startswith('/'):
                    full_url = f"https://limitlesstcg.com{card['card_url']}"
                else:
                    full_url = card['card_url']
                
                print(f"[Japanese Scraper] [{idx+1}/{len(cards)}] {card['name']} ({card['set']} {card['number']})...")
                driver.get(full_url)
                
                # Wait for image to load
                time.sleep(SETTINGS['detail_page_wait_seconds'])
                
                # Extract image URL from <img class="card shadow resp-w">
                try:
                    img_elem = driver.find_element(By.CSS_SELECTOR, "img.card.shadow.resp-w")
                    image_url = img_elem.get_attribute('src')
                    if image_url:
                        card['image_url'] = image_url
                except:
                    pass
                
                # Extract rarity from card-prints div
                try:
                    rarity_spans = driver.find_elements(By.CSS_SELECTOR, ".card-prints-current .prints-current-details span")
                    if len(rarity_spans) >= 2:
                        rarity_info = rarity_spans[1].get_attribute('textContent').strip()
                        # Extract rarity from format like "· Double Rare"
                        if '·' in rarity_info:
                            rarity = rarity_info.split('·')[1].strip()
                            card['rarity'] = rarity
                except:
                    pass
                
                # For Promo sets: If rarity is empty, set it to "Promo"
                PROMO_SETS = ['MEP', 'SVP', 'SP', 'SMP', 'XYP', 'BWP', 'HSP', 'DPP', 'NP', 'WP', 
                              'POP', 'SWSH', 'SWSHP', 'PR-SW', 'PR-SM', 'PR-XY', 'PR-BLW', 'PR-HS', 'PR-DP']
                if card['set'] in PROMO_SETS and not card.get('rarity'):
                    card['rarity'] = 'Promo'
                
                # Be nice to the server
                time.sleep(SETTINGS['detail_request_delay_seconds'])
                
                if (idx + 1) % 50 == 0:
                    print(f"[Japanese Scraper] ✓ Completed {idx + 1} detail pages")
                
            except Exception as e:
                print(f"[Japanese Scraper] ERROR scraping {card['name']}: {e}")
                continue
    
    finally:
        driver.quit()
    
    # Count how many got image URLs
    cards_with_images = sum(1 for c in cards if c.get('image_url'))
    print(f"\n[Japanese Scraper] ✓ Successfully got image URLs for {cards_with_images}/{len(cards)} cards")
    
    return cards


# Main execution
print("\n" + "=" * 80)
print("QUICK CHECK: Verifying if update is needed...")
print("=" * 80)

# Load existing sets from CSV
existing_sets = load_existing_sets()
if existing_sets:
    print(f"[Japanese Scraper] Found existing database with {len(existing_sets)} sets")
    print(f"[Japanese Scraper] Existing sets: {', '.join(sorted(existing_sets))}")
else:
    print("[Japanese Scraper] No existing database found - will scrape everything")

# Quick check of latest sets from website
current_latest_sets = quick_check_latest_sets()
if current_latest_sets:
    print(f"[Japanese Scraper] Latest {len(current_latest_sets)} sets on website: {', '.join(sorted(current_latest_sets))}")
    
    # Check if existing sets match current latest sets
    if existing_sets == current_latest_sets:
        print("\n" + "=" * 80)
        print("✅ DATABASE IS UP TO DATE!")
        print("=" * 80)
        print(f"[Japanese Scraper] Existing database already has the latest {SETTINGS['keep_latest_sets']} sets")
        print("[Japanese Scraper] No update needed - skipping scrape")
        print("\n" + "=" * 80)
        if getattr(sys, "frozen", False):
            input("Press ENTER to close...")
        sys.exit(0)
    else:
        print(f"[Japanese Scraper] ⚠️ Database needs update!")
        print(f"[Japanese Scraper]   Sets to add: {current_latest_sets - existing_sets}")
        print(f"[Japanese Scraper]   Sets to remove: {existing_sets - current_latest_sets}")
else:
    print("[Japanese Scraper] Could not determine latest sets - proceeding with full scrape")

print("\n" + "=" * 80)
print("PHASE 1: Scraping Japanese card list from Limitless...")
print("=" * 80)
all_cards = scrape_japanese_cards_list()

if not all_cards:
    print("[Japanese Scraper] ERROR: No cards extracted!")
    exit(1)

print("\n" + "=" * 80)
print(f"PHASE 2: Filtering to {SETTINGS['keep_latest_sets']} most recent sets...")
print("=" * 80)
filtered_cards, latest_sets = filter_latest_sets(all_cards)

if not filtered_cards:
    print("[Japanese Scraper] ERROR: No cards after filtering!")
    exit(1)

if SETTINGS['skip_detail_scraping']:
    print("\n" + "=" * 80)
    print("PHASE 3: Skipping detail scraping (skip_detail_scraping = true)")
    print("=" * 80)
    print("[Japanese Scraper] Cards will not have image_url or rarity data")
else:
    print("\n" + "=" * 80)
    print("PHASE 3: Scraping detail pages for image URLs and rarity...")
    print("=" * 80)
    filtered_cards = scrape_card_details(filtered_cards)

# Get correct data directory
data_dir = get_data_dir()

# Ensure output directory exists
os.makedirs(data_dir, exist_ok=True)

print(f"\n[Japanese Scraper] Data directory: {os.path.abspath(data_dir)}")

# Save to CSV - OVERWRITE (not append!)
csv_path = os.path.join(data_dir, 'japanese_cards_database.csv')
json_path = os.path.join(data_dir, 'japanese_cards_database.json')
with open(csv_path, 'w', encoding='utf-8', newline='') as f:
    fieldnames = ['name', 'set', 'number', 'type', 'rarity', 'image_url']
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    for card in filtered_cards:
        writer.writerow({
            'name': card.get('name', ''),
            'set': card.get('set', ''),
            'number': card.get('number', ''),
            'type': card.get('type', ''),
            'rarity': card.get('rarity', ''),
            'image_url': card.get('image_url', '')
        })

print(f"\n[Japanese Scraper] ✓ Overwrote {csv_path} with latest {len(filtered_cards)} Japanese cards")

# Also save to JSON
json_data = {
    'timestamp': datetime.now().isoformat(),
    'source': 'https://limitlesstcg.com/cards?q=lang%3Aen.t',
    'total_count': len(filtered_cards),
    'sets': list(latest_sets),
    'cards': filtered_cards
}

with open(json_path, 'w', encoding='utf-8') as f:
    json.dump(json_data, f, indent=2, ensure_ascii=False)

print(f"[Japanese Scraper] ✓ Saved to {json_path}")

print()
print("Sample data (first 10):")
for card in filtered_cards[:10]:
    img_status = "✓" if card['image_url'] else "✗"
    print(f"  {img_status} {card['name']} ({card['set']} {card['number']}) - {card['type']}")
    if card['image_url']:
        print(f"      └─ {card['image_url']}")
if len(filtered_cards) > 10:
    print(f"  ... and {len(filtered_cards) - 10} more")
print()
print("=" * 80)
print("SUCCESS: Japanese cards database ready!")
print("=" * 80)
print()

# Keep console open if running as EXE
if getattr(sys, "frozen", False):
    input("Press ENTER to close...")
