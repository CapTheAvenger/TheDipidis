"""
PokemonProxies.com M3 Card Scraper
Extracts English translation image URLs for M3 (Muniki's Zero) set cards.
"""

import csv
import time
import json
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

# Settings
SETTINGS = {
    'headless': False,  # Set to False to see what's happening
    'page_delay_seconds': 2.0,
    'card_delay_seconds': 0.5
}

OUTPUT_FILE = Path(__file__).parent / 'data' / 'pokemonproxies_m3_mapping.csv'

def scrape_pokemonproxies_m3():
    """Scrape M3 card image URLs from pokemonproxies.com"""
    
    print("\n" + "="*80)
    print("POKEMONPROXIES.COM M3 SCRAPER")
    print("="*80)
    print(f"Target: https://pokemonproxies.com/sets/Munikis_Zero")
    print(f"Output: {OUTPUT_FILE}")
    print("="*80 + "\n")
    
    # Setup Chrome
    chrome_options = Options()
    if SETTINGS['headless']:
        chrome_options.add_argument("--headless")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1920,1080")
    
    driver = webdriver.Chrome(options=chrome_options)
    cards = []
    
    try:
        # Navigate to M3 set page
        url = "https://pokemonproxies.com/sets/Munikis_Zero"
        print(f"[Scraper] Loading {url}...")
        driver.get(url)
        
        # Wait for cards to load
        print("[Scraper] Waiting for cards to load...")
        time.sleep(SETTINGS['page_delay_seconds'])
        
        # Try to find card images
        # The site uses <img> tags with src="/assets/..."
        print("[Scraper] Searching for card images...")
        
        # Method 1: Find all images with class containing "card" or in specific containers
        img_elements = driver.find_elements(By.TAG_NAME, "img")
        
        print(f"[Scraper] Found {len(img_elements)} total images on page")
        
        # Filter for M3 card images (they have pattern: 3a-XXX-CardName-HASH.png)
        for img in img_elements:
            try:
                src = img.get_attribute('src')
                alt = img.get_attribute('alt') or ''
                
                if not src:
                    continue
                
                # Check if this is an M3 card image (pattern: 3a-XXX-...)
                if '/3a-' in src and '.png' in src:
                    # Extract card number and name from filename
                    # Example: /assets/3a-075-Rosa's_Encouragement-CXfUiMgS.png
                    filename = src.split('/')[-1]  # Get filename
                    
                    # Parse: 3a-075-Rosa's_Encouragement-CXfUiMgS.png
                    parts = filename.split('-')
                    if len(parts) >= 3:
                        card_number = parts[1]  # 075
                        
                        # Card name is everything between number and hash
                        # Join parts[2:-1] and remove .png
                        card_name_parts = parts[2:]
                        # Last part has hash and .png, remove them
                        if card_name_parts:
                            last_part = card_name_parts[-1].split('.')[0]  # Remove .png
                            card_name_parts[-1] = last_part
                            
                            # Card name might have underscores or be in the parts
                            card_name_raw = '-'.join(card_name_parts[:-1]) if len(card_name_parts) > 1 else card_name_parts[0]
                            
                            # Clean up: replace underscores with spaces, add apostrophes back
                            card_name = card_name_raw.replace('_', ' ').replace('s ', "'s ")
                            
                            # Make full URL if relative
                            if src.startswith('/'):
                                full_url = f"https://pokemonproxies.com{src}"
                            else:
                                full_url = src
                            
                            card_data = {
                                'card_number': card_number,
                                'card_name': card_name,
                                'image_url': full_url,
                                'alt_text': alt
                            }
                            
                            cards.append(card_data)
                            print(f"[Scraper] ✓ Found: {card_number} - {card_name}")
                
            except Exception as e:
                continue
        
        print(f"\n[Scraper] Total M3 cards found: {len(cards)}")
        
        # Save to CSV
        if cards:
            OUTPUT_FILE.parent.mkdir(exist_ok=True)
            
            with open(OUTPUT_FILE, 'w', newline='', encoding='utf-8') as f:
                writer = csv.DictWriter(f, fieldnames=['card_number', 'card_name', 'image_url', 'alt_text'])
                writer.writeheader()
                writer.writerows(cards)
            
            print(f"\n[Scraper] ✓ Saved {len(cards)} cards to {OUTPUT_FILE}")
            
            # Print sample
            print("\n[Scraper] Sample entries:")
            for card in cards[:5]:
                print(f"  {card['card_number']} - {card['card_name']}")
                print(f"    → {card['image_url']}")
        else:
            print("\n[Scraper] ⚠ No cards found!")
            print("[Scraper] The page structure might have changed.")
            print("[Scraper] Opening browser to inspect...")
            time.sleep(30)  # Keep browser open for inspection
        
    except Exception as e:
        print(f"\n[Scraper] ERROR: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        driver.quit()
        print("\n[Scraper] Browser closed")

if __name__ == "__main__":
    scrape_pokemonproxies_m3()
    print("\n" + "="*80)
    print("SCRAPING COMPLETE")
    print("="*80)
