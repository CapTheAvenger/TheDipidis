#!/usr/bin/env python3
"""
Fix Missing URLs in all_cards_database.csv
==========================================
Re-scrapes detail pages for cards that are missing image_url or rarity.
"""

import csv
import time
import os
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By

def load_cards_from_csv(csv_path):
    """Load all cards from CSV."""
    cards = []
    if not os.path.exists(csv_path):
        print(f"ERROR: {csv_path} not found")
        return cards
    
    with open(csv_path, 'r', encoding='utf-8', newline='') as f:
        reader = csv.DictReader(f)
        for row in reader:
            cards.append(row)
    
    return cards

def find_incomplete_cards(cards):
    """Find cards missing image_url or rarity (except Basic Energy which has no rarity)."""
    incomplete = []
    for card in cards:
        # Skip Basic Energy cards (they don't have rarity)
        if card.get('type') == 'Basic Energy':
            # Basic Energy should have URL but no rarity - check only URL
            if not card.get('image_url'):
                incomplete.append(card)
        else:
            # Other cards should have both URL and rarity
            if not card.get('image_url') or not card.get('rarity'):
                incomplete.append(card)
    
    return incomplete

def scrape_card_details_fix(cards):
    """Scrape missing details for incomplete cards."""
    print(f"\nScraping details for {len(cards)} incomplete cards...")
    
    chrome_options = Options()
    chrome_options.add_argument("--headless")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1920,1080")
    chrome_options.add_argument("--dns-prefetch-disable")
    
    driver = webdriver.Chrome(options=chrome_options)
    
    fixed_count = 0
    failed_count = 0
    max_retries = 3
    
    try:
        for idx, card in enumerate(cards):
            retry_count = 0
            success = False
            
            while retry_count < max_retries and not success:
                try:
                    # Build URL from set and number
                    set_code = card['set']
                    set_number = card['number']
                    
                    # Limitless URL pattern: /cards/{SET}/{NUMBER}
                    url = f"https://limitlesstcg.com/cards/{set_code}/{set_number}"
                    
                    print(f"[{idx+1}/{len(cards)}] Scraping {card['name']} ({set_code} {set_number})...", end=" ")
                    
                    driver.set_page_load_timeout(15)
                    driver.get(url)
                    time.sleep(2.0)
                    
                    # Extract image URL
                    try:
                        img_elem = driver.find_element(By.CSS_SELECTOR, "img.card.shadow.resp-w")
                        image_url = img_elem.get_attribute('src')
                        if image_url:
                            card['image_url'] = image_url
                    except:
                        pass
                    
                    # Extract rarity (only for non-Basic Energy)
                    if card.get('type') != 'Basic Energy':
                        try:
                            rarity_spans = driver.find_elements(By.CSS_SELECTOR, ".card-prints-current .prints-current-details span")
                            if len(rarity_spans) >= 2:
                                rarity_info = rarity_spans[1].get_attribute('textContent').strip()
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
                    
                    # Check if we got the data
                    if card.get('image_url'):
                        fixed_count += 1
                        print(f"OK")
                        success = True
                    else:
                        print(f"No URL found")
                        failed_count += 1
                        success = True  # Don't retry if page loaded but no image
                    
                    time.sleep(0.5)
                    
                except Exception as e:
                    retry_count += 1
                    if retry_count < max_retries:
                        print(f"ERROR (retry {retry_count}/{max_retries}): {str(e)[:50]}")
                        time.sleep(2.0)
                    else:
                        print(f"FAILED after {max_retries} retries: {str(e)[:50]}")
                        failed_count += 1
                        
            if (idx + 1) % 100 == 0:
                print(f"\n--- Progress: {idx+1}/{len(cards)} | Fixed: {fixed_count} | Failed: {failed_count} ---\n")
    
    finally:
        driver.quit()
    
    print(f"\nFixed {fixed_count}/{len(cards)} cards (Failed: {failed_count})")
    return cards

def save_cards_to_csv(cards, csv_path):
    """Save all cards back to CSV."""
    with open(csv_path, 'w', encoding='utf-8', newline='') as f:
        fieldnames = ['name', 'set', 'number', 'type', 'rarity', 'image_url']
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for card in cards:
            writer.writerow(card)
    
    print(f"Saved {len(cards)} cards to {csv_path}")

def main():
    csv_path = 'dist/data/all_cards_database.csv'
    
    print("="*80)
    print("FIX MISSING URLs - Rescrape incomplete cards")
    print("="*80)
    
    # Load all cards
    print(f"\nLoading cards from {csv_path}...")
    all_cards = load_cards_from_csv(csv_path)
    print(f"Loaded {len(all_cards)} total cards")
    
    # Find incomplete cards
    incomplete_cards = find_incomplete_cards(all_cards)
    print(f"Found {len(incomplete_cards)} cards missing details")
    
    if not incomplete_cards:
        print("\nAll cards already have complete data!")
        return
    
    # Show sample
    print("\nSample incomplete cards:")
    for card in incomplete_cards[:5]:
        print(f"  - {card['name']} ({card['set']} {card['number']}) - Type: {card['type']}, Rarity: '{card['rarity']}', URL: {'OK' if card.get('image_url') else 'MISSING'}")
    if len(incomplete_cards) > 5:
        print(f"  ... and {len(incomplete_cards) - 5} more")
    
    # Auto-confirm (no manual input needed)
    print(f"\nStarting rescrape of {len(incomplete_cards)} cards...")
    print("This will take approximately {:.1f} hours".format(len(incomplete_cards) * 0.5 / 3600))
    print("Press Ctrl+C to abort\n")
    
    # Scrape details
    scrape_card_details_fix(incomplete_cards)
    
    # Save updated cards
    print(f"\nSaving updated data to {csv_path}...")
    save_cards_to_csv(all_cards, csv_path)
    
    # Verify
    still_incomplete = find_incomplete_cards(all_cards)
    print(f"\nAfter fix: {len(still_incomplete)} cards still incomplete")
    
    print("\n" + "="*80)
    print("FIX COMPLETE!")
    print("="*80)

if __name__ == "__main__":
    main()
