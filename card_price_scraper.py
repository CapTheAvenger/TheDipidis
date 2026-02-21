#!/usr/bin/env python3
"""
Card Price Scraper - Update EUR prices from Limitless TCG
==========================================================
Fast scraper that only updates Cardmarket EUR prices for existing cards.
Reads from all_cards_database.csv and updates price_data.csv.
"""

import csv
import json
import os
import sys
import time
from datetime import datetime
from typing import List, Dict, Optional

# Fix Windows console encoding for Unicode characters
if sys.platform == 'win32':
    if hasattr(sys.stdout, 'reconfigure'):
        try:
            sys.stdout.reconfigure(encoding='utf-8')
        except Exception:
            pass
    if hasattr(sys.stderr, 'reconfigure'):
        try:
            sys.stderr.reconfigure(encoding='utf-8')
        except Exception:
            pass

# Selenium imports (only loaded when needed)
try:
    from selenium import webdriver
    from selenium.webdriver.common.by import By
    from selenium.webdriver.chrome.options import Options
    SELENIUM_AVAILABLE = True
except ImportError:
    SELENIUM_AVAILABLE = False
    print("WARNING: Selenium not available. Install with: pip install selenium")

# Default settings
DEFAULT_SETTINGS: Dict[str, object] = {
    "delay_seconds": 0.5,
    "headless": True,
    "batch_size": 100,
    "skip_cards_with_prices": True
}

def get_app_dir() -> str:
    """Get the directory where the script is located."""
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    else:
        return os.path.dirname(os.path.abspath(__file__))

def get_data_dir() -> str:
    """Get the shared data directory for CSV outputs."""
    app_dir = get_app_dir()
    data_dir = os.path.join(app_dir, 'data')
    os.makedirs(data_dir, exist_ok=True)
    return data_dir

def load_settings() -> Dict[str, object]:
    """Load settings from card_price_scraper_settings.json."""
    settings = DEFAULT_SETTINGS.copy()
    app_dir = get_app_dir()
    candidates = [
        os.path.join(app_dir, "card_price_scraper_settings.json"),
        os.path.join(os.getcwd(), "card_price_scraper_settings.json"),
        os.path.join(app_dir, "..", "card_price_scraper_settings.json"),
        os.path.join(app_dir, "data", "card_price_scraper_settings.json")
    ]

    settings_path = None
    for path in candidates:
        normalized_path = os.path.normpath(path)
        if os.path.isfile(normalized_path):
            settings_path = normalized_path
            break

    if settings_path:
        try:
            with open(settings_path, "r", encoding="utf-8-sig") as f:
                content = f.read()
                loaded = json.loads(content)
            if isinstance(loaded, dict):
                settings.update(loaded)
            print(f"[Price Scraper] Loaded settings: {settings_path}")
        except Exception as e:
            print(f"[Price Scraper] WARNING: Failed to load settings: {e}")
            print(f"[Price Scraper] Using default settings.")
    else:
        print(f"[Price Scraper] No settings file found. Using defaults.")
    
    return settings

def load_cards_to_update(csv_path: str) -> List[Dict[str, str]]:
    """Load cards from all_cards_database.csv."""
    if not os.path.isfile(csv_path):
        print(f"[Price Scraper] ERROR: {csv_path} not found!")
        return []
    
    cards = []
    with open(csv_path, 'r', encoding='utf-8', newline='') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if not row:
                continue
            cards.append({
                'name': (row.get('name') or '').strip(),
                'set': (row.get('set') or '').strip(),
                'number': (row.get('number') or '').strip(),
                'cardmarket_url': (row.get('cardmarket_url') or '').strip(),
                'card_url': (row.get('card_url') or '').strip()  # May be empty if CSV doesn't have it
            })
    
    print(f"[Price Scraper] Loaded {len(cards)} cards from database")
    return cards

def load_existing_prices(csv_path: str) -> Dict[str, Dict[str, str]]:
    """Load existing prices from price_data.csv."""
    if not os.path.isfile(csv_path):
        return {}
    
    prices = {}
    with open(csv_path, 'r', encoding='utf-8', newline='') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if not row:
                continue
            key = f"{row.get('set', '')}_{row.get('number', '')}"
            prices[key] = {
                'eur_price': (row.get('eur_price') or '').strip(),
                'last_updated': (row.get('last_updated') or '').strip()
            }
    
    return prices

def scrape_prices(cards: List[Dict[str, str]], settings: Dict[str, object], 
                 existing_prices: Dict[str, Dict[str, str]], csv_path: str) -> List[Dict[str, str]]:
    """Scrape EUR prices from Limitless card pages."""
    
    if not SELENIUM_AVAILABLE:
        print("[Price Scraper] ERROR: Selenium not available!")
        return []
    
    print(f"\n[Price Scraper] Starting browser...")
    chrome_options = Options()
    if settings.get("headless", True):
        chrome_options.add_argument("--headless")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1920,1080")
    
    driver = webdriver.Chrome(options=chrome_options)
    
    results = []
    skip_existing = bool(settings.get("skip_cards_with_prices", True))
    delay = float(settings.get("delay_seconds", 0.5))
    
    try:
        for idx, card in enumerate(cards):
            card_key = f"{card['set']}_{card['number']}"
            
            # Skip if price already exists
            if skip_existing and card_key in existing_prices:
                # Keep existing price
                results.append({
                    'name': card['name'],
                    'set': card['set'],
                    'number': card['number'],
                    'eur_price': existing_prices[card_key]['eur_price'],
                    'cardmarket_url': card['cardmarket_url'],
                    'last_updated': existing_prices[card_key]['last_updated']
                })
                continue
            
            print(f"[Price Scraper] [{idx+1}/{len(cards)}] {card['name']} ({card['set']} {card['number']})...")
            
            try:
                # Strategy: Prefer Cardmarket direct scraping (original source), fallback to Limitless
                if not card.get('name') or not card.get('set') or not card.get('number'):
                    continue
                
                eur_price = ''
                cardmarket_url_final = card.get('cardmarket_url', '')
                
                # Try Cardmarket first (if URL available)
                if cardmarket_url_final:
                    try:
                        print(f"   → Trying Cardmarket direct...")
                        driver.get(cardmarket_url_final)
                        time.sleep(2)
                        
                        # Find price in <dd class="col-6 col-xl-7">2,50 €</dd>
                        try:
                            # Try multiple selectors for Cardmarket price
                            price_elem = None
                            try:
                                # Primary: dd.col-6.col-xl-7 (often contains the "From" price)
                                price_elems = driver.find_elements(By.CSS_SELECTOR, "dd.col-6.col-xl-7")
                                for elem in price_elems:
                                    text = elem.text.strip()
                                    if '€' in text:
                                        eur_price = text
                                        print(f"   ✓ Cardmarket: {eur_price}")
                                        break
                            except:
                                pass
                            
                            if not eur_price:
                                # Fallback: Try .price-container or other common Cardmarket selectors
                                try:
                                    price_elem = driver.find_element(By.CSS_SELECTOR, ".price-container .text-right")
                                    eur_price = price_elem.text.strip()
                                    print(f"   ✓ Cardmarket (fallback): {eur_price}")
                                except:
                                    pass
                            
                        except Exception as e:
                            print(f"   ⚠ Cardmarket price not found: {str(e)[:80]}")
                    
                    except Exception as e:
                        print(f"   ⚠ Cardmarket error: {str(e)[:80]}")
                
                # Fallback: Try Limitless if Cardmarket failed or no URL
                if not eur_price:
                    try:
                        # Build URL (try to use card_url from database if available)
                        if card.get('card_url'):
                            if card['card_url'].startswith('/'):
                                url = f"https://limitlesstcg.com{card['card_url']}"
                            else:
                                url = card['card_url']
                        else:
                            # Build URL manually (format: /cards/SET/NUM)
                            url = f"https://limitlesstcg.com/cards/{card['set']}/{card['number']}"
                        
                        print(f"   → Trying Limitless: {url}")
                        driver.get(url)
                        time.sleep(2)
                        
                        # Find the table with prices
                        cardmarket_url_from_page = ''
                        
                        try:
                            # Find the current card row (class="current")
                            table = driver.find_element(By.CSS_SELECTOR, "table.card-prints-versions")
                            current_row = table.find_element(By.CSS_SELECTOR, "tr.current")
                            
                            # Extract EUR price from third column
                            eur_link = current_row.find_element(By.CSS_SELECTOR, "a.card-price.eur")
                            eur_price = eur_link.text.strip()
                            cardmarket_url_from_page = eur_link.get_attribute('href') or ''
                            
                            print(f"   ✓ Limitless: {eur_price}")
                            
                            # Update Cardmarket URL if we got a new one from Limitless
                            if cardmarket_url_from_page and not cardmarket_url_final:
                                cardmarket_url_final = cardmarket_url_from_page
                        except Exception as e:
                            error_str = str(e)
                            if 'no such element' in error_str and 'card-prints-versions' in error_str:
                                print(f"   ℹ No price table on Limitless")
                            else:
                                print(f"   ⚠ Limitless error: {error_str.split('Stacktrace')[0].strip()[:80]}")
                    
                    except Exception as e:
                        print(f"   ⚠ Limitless failed: {str(e)[:80]}")
                
                # Store result (even if price is empty - we track all attempts)
                results.append({
                    'name': card['name'],
                    'set': card['set'],
                    'number': card['number'],
                    'eur_price': eur_price,
                    'cardmarket_url': cardmarket_url_final,
                    'last_updated': datetime.now().isoformat()
                })
                
                time.sleep(delay)
                
                # Progress save every 100 cards
                if (idx + 1) % 100 == 0:
                    print(f"[Price Scraper] Completed {idx + 1} cards, saving progress...")
                    save_prices(results, csv_path)
                    print(f"[Price Scraper] Progress saved: {len(results)} prices")
            
            except Exception as e:
                error_str = str(e).lower()
                
                # Handle session errors - restart browser
                if 'invalid session' in error_str or 'session' in error_str:
                    print(f"[Price Scraper] SESSION ERROR: Browser crashed, restarting...")
                    try:
                        driver.quit()
                    except:
                        pass
                    
                    # Recreate browser
                    chrome_options = Options()
                    if settings.get("headless", True):
                        chrome_options.add_argument("--headless")
                    chrome_options.add_argument("--no-sandbox")
                    chrome_options.add_argument("--disable-dev-shm-usage")
                    chrome_options.add_argument("--disable-gpu")
                    chrome_options.add_argument("--window-size=1920,1080")
                    driver = webdriver.Chrome(options=chrome_options)
                    
                    print(f"[Price Scraper] Browser restarted, continuing...")
                    time.sleep(2)
                    continue
                
                # Other errors - just log and continue
                print(f"[Price Scraper] ERROR for {card.get('name', 'unknown')}: {str(e)[:100]}")
                continue
    
    finally:
        driver.quit()
    
    return results

def save_prices(prices: List[Dict[str, str]], csv_path: str):
    """Save prices to price_data.csv."""
    with open(csv_path, 'w', encoding='utf-8', newline='') as f:
        fieldnames = ['name', 'set', 'number', 'eur_price', 'cardmarket_url', 'last_updated']
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for price in prices:
            writer.writerow(price)
    
    print(f"[Price Scraper] OK: Saved {len(prices)} prices to {csv_path}")


# Main execution
try:
    print("\n" + "=" * 80)
    print("CARD PRICE SCRAPER - Update EUR prices from Limitless")
    print("=" * 80)
    print()
    
    settings = load_settings()
    data_dir = get_data_dir()
    
    cards_csv = os.path.join(data_dir, 'all_cards_database.csv')
    prices_csv = os.path.join(data_dir, 'price_data.csv')
    
    print(f"[Price Scraper] Input: {os.path.abspath(cards_csv)}")
    print(f"[Price Scraper] Output: {os.path.abspath(prices_csv)}")
    print()
    
    # Load cards and existing prices
    cards = load_cards_to_update(cards_csv)
    if not cards:
        print("[Price Scraper] No cards found. Exiting.")
        input("\nPress ENTER to close...")
        sys.exit(1)
    
    existing_prices = load_existing_prices(prices_csv)
    print(f"[Price Scraper] Found {len(existing_prices)} existing prices")
    
    # Scrape prices
    print("\n" + "=" * 80)
    print("SCRAPING PRICES...")
    print("=" * 80)
    
    all_prices = scrape_prices(cards, settings, existing_prices, prices_csv)
    
    # Save results
    print("\n" + "=" * 80)
    print("SAVING RESULTS...")
    print("=" * 80)
    
    save_prices(all_prices, prices_csv)
    
    print("\n" + "=" * 80)
    print("SUCCESS: Price update complete!")
    print("=" * 80)
    print()

except Exception as e:
    print("\n" + "=" * 80)
    print("❌ ERROR: Price scraper failed!")
    print("=" * 80)
    print(f"\nError: {e}")
    import traceback
    traceback.print_exc()
    print("\n" + "=" * 80)

finally:
    if getattr(sys, "frozen", False):
        print("\n")
        input("Press ENTER to close...")
