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

# Import shared utilities
from card_scraper_shared import setup_console_encoding

# Fix Windows console encoding for Unicode characters
setup_console_encoding()

# Selenium imports (only loaded when needed)
try:
    from selenium import webdriver
    from selenium.webdriver.common.by import By
    from selenium.webdriver.chrome.options import Options
    from selenium_stealth import stealth
    SELENIUM_AVAILABLE = True
except ImportError:
    SELENIUM_AVAILABLE = False
    print("WARNING: Selenium not available. Install with: pip install selenium selenium-stealth")

# Default settings
DEFAULT_SETTINGS: Dict[str, object] = {
    "delay_seconds": 0.5,
    "headless": True,
    "batch_size": 100,
    "skip_cards_with_prices": True,
    "only_update_sets": []  # Empty = all sets, or list like ["TWM", "SFA", "SCR", "SSP", "PRE", "SVP"]
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
        chrome_options.add_argument("--headless=new")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1920,1080")
    chrome_options.add_argument("--disable-blink-features=AutomationControlled")
    chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
    chrome_options.add_experimental_option('useAutomationExtension', False)
    
    driver = webdriver.Chrome(options=chrome_options)
    
    # Apply stealth settings to bypass Cloudflare
    stealth(driver,
            languages=["en-US", "en"],
            vendor="Google Inc.",
            platform="Win32",
            webgl_vendor="Intel Inc.",
            renderer="Intel Iris OpenGL Engine",
            fix_hairline=True,
            )
    
    results = []
    skip_existing = bool(settings.get("skip_cards_with_prices", True))
    delay = float(settings.get("delay_seconds", 0.5))
    only_update_sets = settings.get("only_update_sets", [])
    
    try:
        for idx, card in enumerate(cards):
            card_key = f"{card['set']}_{card['number']}"
            
            # Filter by set if only_update_sets is specified
            if only_update_sets and len(only_update_sets) > 0:
                if card['set'] not in only_update_sets:
                    # Keep existing price if available, otherwise skip
                    if card_key in existing_prices:
                        results.append({
                            'name': card['name'],
                            'set': card['set'],
                            'number': card['number'],
                            'eur_price': existing_prices[card_key]['eur_price'],
                            'cardmarket_url': card['cardmarket_url'],
                            'last_updated': existing_prices[card_key]['last_updated']
                        })
                    continue
            
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
            
            # Only print every 10th card to reduce spam
            if (idx + 1) % 10 == 0 or idx == 0:
                print(f"[Price Scraper] Progress: {idx+1}/{len(cards)} cards...")
            
            try:
                # Strategy: Get CardMarket URL from Limitless, then scrape price directly from CardMarket
                # This gives us the most up-to-date 7-day average price
                if not card.get('name') or not card.get('set') or not card.get('number'):
                    continue
                
                eur_price = ''
                cardmarket_url_final = card.get('cardmarket_url', '')
                
                # Step 1: Get CardMarket URL from Limitless (if we don't have it yet)
                limitless_price_backup = ''
                if not cardmarket_url_final:
                    try:
                        # Build Limitless URL
                        if card.get('card_url'):
                            if card['card_url'].startswith('/'):
                                url = f"https://limitlesstcg.com{card['card_url']}"
                            else:
                                url = card['card_url']
                        else:
                            url = f"https://limitlesstcg.com/cards/{card['set']}/{card['number']}"
                        
                        driver.get(url)
                        time.sleep(0.8)
                        
                        # Extract CardMarket URL AND price from the table
                        try:
                            table = driver.find_element(By.CSS_SELECTOR, "table.card-prints-versions")
                            current_row = table.find_element(By.CSS_SELECTOR, "tr.current")
                            eur_link = current_row.find_element(By.CSS_SELECTOR, "a.card-price.eur")
                            cardmarket_url_final = eur_link.get_attribute('href') or ''
                            limitless_price_backup = eur_link.text.strip()  # Save as backup
                            if cardmarket_url_final:
                                print(f"   → Found CM URL from Limitless (backup price: {limitless_price_backup})")
                        except:
                            pass
                    except:
                        pass
                
                # Step 2: Scrape current price directly from CardMarket (7-days average)
                if cardmarket_url_final:
                    try:
                        driver.get(cardmarket_url_final)
                        time.sleep(8)  # Longer wait for Cloudflare to pass
                        
                        # Strategy 1: Find "7-days average price" label and get the next dd element
                        # HTML structure: <dt>7-days average price</dt> <dd><span>3,23 €</span></dd>
                        try:
                            dt_elements = driver.find_elements(By.TAG_NAME, "dt")
                            for dt in dt_elements:
                                if "7-days average" in dt.text or "7-day average" in dt.text:
                                    dd_element = dt.find_element(By.XPATH, "following-sibling::dd[1]")
                                    text = dd_element.text.strip()
                                    if '€' in text:
                                        eur_price = text
                                        print(f"   ✓ CM 7-day avg: {eur_price}")
                                        break
                        except:
                            pass
                        
                        # Fallback Strategy 2: Try 30-days average if 7-day not found
                        if not eur_price:
                            try:
                                dt_elements = driver.find_elements(By.TAG_NAME, "dt")
                                for dt in dt_elements:
                                    if "30-days average" in dt.text or "30-day average" in dt.text:
                                        dd_element = dt.find_element(By.XPATH, "following-sibling::dd[1]")
                                        text = dd_element.text.strip()
                                        if '€' in text:
                                            eur_price = text
                                            print(f"   ✓ CM 30-day avg: {eur_price}")
                                            break
                            except:
                                pass
                        
                        # Fallback Strategy 3: "From" price but ONLY if it's in EUR (not GBP/USD)
                        if not eur_price:
                            try:
                                dt_elements = driver.find_elements(By.TAG_NAME, "dt")
                                for dt in dt_elements:
                                    if "From" in dt.text:
                                        dd_element = dt.find_element(By.XPATH, "following-sibling::dd[1]")
                                        text = dd_element.text.strip()
                                        # Only accept if it's EUR (€), not GBP (£) or USD ($)
                                        if '€' in text and '£' not in text and '$' not in text:
                                            eur_price = text
                                            print(f"   ✓ CM From: {eur_price}")
                                            break
                            except:
                                pass
                        
                        # If we got a valid Cardmarket price, we're done - skip Limitless fallback
                        
                    except Exception:
                        pass  # Silent fail, will try Limitless backup next
                
                # Step 3: Use Limitless backup price if CardMarket failed
                if not eur_price and limitless_price_backup:
                    eur_price = limitless_price_backup
                    print(f"   ✓ LT backup: {eur_price}")
                
                # Step 4: Last resort - try Limitless directly (only if we haven't been there yet)
                if not eur_price and not limitless_price_backup:
                    try:
                        # Build URL
                        if card.get('card_url'):
                            if card['card_url'].startswith('/'):
                                url = f"https://limitlesstcg.com{card['card_url']}"
                            else:
                                url = card['card_url']
                        else:
                            url = f"https://limitlesstcg.com/cards/{card['set']}/{card['number']}"
                        
                        driver.get(url)
                        time.sleep(0.8)
                        
                        try:
                            table = driver.find_element(By.CSS_SELECTOR, "table.card-prints-versions")
                            current_row = table.find_element(By.CSS_SELECTOR, "tr.current")
                            eur_link = current_row.find_element(By.CSS_SELECTOR, "a.card-price.eur")
                            eur_price = eur_link.text.strip()
                            cardmarket_url_final = eur_link.get_attribute('href') or cardmarket_url_final
                            print(f"   ✓ LT: {eur_price}")
                        except:
                            pass  # No price available
                    except Exception:
                        pass  # Silent
                
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
                    
                    # Recreate browser with stealth
                    chrome_options = Options()
                    if settings.get("headless", True):
                        chrome_options.add_argument("--headless=new")
                    chrome_options.add_argument("--no-sandbox")
                    chrome_options.add_argument("--disable-dev-shm-usage")
                    chrome_options.add_argument("--disable-gpu")
                    chrome_options.add_argument("--window-size=1920,1080")
                    chrome_options.add_argument("--disable-blink-features=AutomationControlled")
                    chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
                    chrome_options.add_experimental_option('useAutomationExtension', False)
                    
                    driver = webdriver.Chrome(options=chrome_options)
                    
                    # Apply stealth settings
                    stealth(driver,
                            languages=["en-US", "en"],
                            vendor="Google Inc.",
                            platform="Win32",
                            webgl_vendor="Intel Inc.",
                            renderer="Intel Iris OpenGL Engine",
                            fix_hairline=True,
                            )
                    
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
    """
    Save prices to price_data.csv, preserving existing prices.
    Only overwrites when a new valid price is found.
    """
    # Load existing prices from CSV
    existing_prices = {}
    if os.path.isfile(csv_path):
        with open(csv_path, 'r', encoding='utf-8', newline='') as f:
            reader = csv.DictReader(f)
            for row in reader:
                if not row:
                    continue
                key = f"{row.get('set', '')}_{row.get('number', '')}"
                existing_prices[key] = {
                    'name': row.get('name', ''),
                    'set': row.get('set', ''),
                    'number': row.get('number', ''),
                    'eur_price': row.get('eur_price', ''),
                    'cardmarket_url': row.get('cardmarket_url', ''),
                    'last_updated': row.get('last_updated', '')
                }
    
    # Merge new prices with existing ones
    # Only update if new price is non-empty
    for price in prices:
        key = f"{price.get('set', '')}_{price.get('number', '')}"
        new_price = (price.get('eur_price') or '').strip()
        
        if new_price:
            # New valid price found - update everything
            existing_prices[key] = price
        elif key not in existing_prices:
            # New card but no price yet - add entry with empty price
            existing_prices[key] = price
        # else: Keep existing price (don't overwrite with empty)
    
    # Write all prices back to CSV
    with open(csv_path, 'w', encoding='utf-8', newline='') as f:
        fieldnames = ['name', 'set', 'number', 'eur_price', 'cardmarket_url', 'last_updated']
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for key in sorted(existing_prices.keys()):
            writer.writerow(existing_prices[key])
    
    print(f"[Price Scraper] OK: Saved {len(existing_prices)} prices to {csv_path}")


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
