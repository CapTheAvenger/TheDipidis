#!/usr/bin/env python3
"""
All Cards Scraper - Scrape ALL Pokemon Cards from Limitless TCG
================================================================
Scrapes complete card data including image URLs and reprints.
Extracts: Name, Set Code, Set Number, Type, Rarity, Image URL
Supports pagination to get all cards.
"""

import csv
import json
import os
import subprocess
import sys
import time
from datetime import datetime
from typing import List, Dict, Optional
from urllib.parse import urljoin

# Fix Windows console encoding for Unicode characters (✓, •, etc.)
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

print("=" * 80)
print("ALL CARDS SCRAPER - Scraping ALL Cards from Limitless TCG")
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

DEFAULT_SETTINGS = {
    "start_page": 1,
    "end_page": None,   # None = no limit, or set to e.g. 10 to scrape pages 1-10
    "max_pages": None,  # None = all pages, or set to e.g. 3 for testing (alternative to end_page)
    "set_filter": [],   # Empty = all sets, or e.g. ["ASC", "SVI", "TWM"] for specific sets
    "append": True,
    "rescrape_incomplete": True,  # True = re-scrape cards missing image_url or rarity
    "use_page_tracking": True,    # True = skip already scraped pages (huge time saver!)
    "headless": True,
    "skip_detail_scraping": False,  # True = only scrape list (fast), False = scrape details too
    "list_page_delay_seconds": 1.0,
    "detail_page_wait_seconds": 2.0,
    "detail_request_delay_seconds": 0.5
}


def get_app_dir() -> str:
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


def get_data_dir() -> str:
    """Get the correct data directory path.
    
    Returns:
        - 'data' if running as Python script from root
        - '../data' if running as EXE from dist/ folder (to write to root/data/)
    """
    app_dir = get_app_dir()
    
    # If running as EXE and in 'dist' folder, go up one level
    if getattr(sys, "frozen", False) and app_dir.endswith("dist"):
        return os.path.join(app_dir, "..", "data")
    
    # Otherwise use 'data' relative to current directory
    return "data"


def get_scraped_pages_file() -> str:
    """Get path to scraped pages tracking file."""
    data_dir = get_data_dir()
    return os.path.join(data_dir, 'all_cards_scraped_pages.json')


def load_scraped_pages() -> set:
    """Load set of already scraped page numbers."""
    tracking_file = get_scraped_pages_file()
    
    if not os.path.exists(tracking_file):
        return set()
    
    try:
        with open(tracking_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return set(data.get('scraped_pages', []))
    except Exception as e:
        print(f"[All Cards Scraper] Warning: Could not load scraped pages: {e}")
        return set()


def save_scraped_pages(pages: set) -> None:
    """Save set of scraped page numbers to tracking file."""
    tracking_file = get_scraped_pages_file()
    
    try:
        data = {
            'scraped_pages': sorted(list(pages)),
            'last_updated': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'total_pages': len(pages)
        }
        with open(tracking_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"[All Cards Scraper] Warning: Could not save scraped pages: {e}")


def load_settings() -> Dict[str, object]:
    settings = DEFAULT_SETTINGS.copy()
    app_dir = get_app_dir()
    candidates = [
        os.path.join(app_dir, "all_cards_scraper_settings.json"),
        os.path.join(os.getcwd(), "all_cards_scraper_settings.json"),
        os.path.join(app_dir, "..", "all_cards_scraper_settings.json"),  # Parent dir (if running from dist/)
        os.path.join(app_dir, "data", "all_cards_scraper_settings.json")
    ]

    settings_path = None
    for path in candidates:
        normalized_path = os.path.normpath(path)
        if os.path.isfile(normalized_path):
            settings_path = normalized_path
            break

    if settings_path:
        try:
            # Read with explicit UTF-8 encoding without BOM
            with open(settings_path, "r", encoding="utf-8-sig") as f:
                content = f.read()
                loaded = json.loads(content)
            if isinstance(loaded, dict):
                settings.update(loaded)
            print(f"[All Cards Scraper] Loaded settings: {settings_path}")
        except Exception as e:
            print(f"[All Cards Scraper] WARNING: Failed to load settings: {e}")
            # Use default settings
    else:
        print("[All Cards Scraper] No settings file found. Using defaults.")

    return settings

def scrape_all_cards_list(settings: Dict[str, object], start_page: int = 1, existing_keys: Optional[set] = None) -> List[Dict[str, str]]:
    """Scrape card names and basic info from the Limitless TCG card list."""
    print("[All Cards Scraper] Starting Selenium WebDriver...")
    
    chrome_options = Options()
    if settings.get("headless", True):
        chrome_options.add_argument("--headless")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1920,1080")
    
    driver = webdriver.Chrome(options=chrome_options)
    all_cards_data = []
    if existing_keys is None:
        existing_keys = set()
    
    # Get settings
    max_pages = settings.get("max_pages")
    end_page = settings.get("end_page")
    set_filter = settings.get("set_filter", [])
    use_page_tracking = settings.get("use_page_tracking", True)
    
    # Load page tracking
    scraped_pages = load_scraped_pages() if use_page_tracking else set()
    newly_scraped_pages = set()
    
    if max_pages:
        print(f"[All Cards Scraper] MAX PAGES LIMIT: {max_pages} (for testing)")
    if end_page:
        print(f"[All Cards Scraper] END PAGE: {end_page} (pages {start_page}-{end_page})")
    if set_filter:
        print(f"[All Cards Scraper] SET FILTER ACTIVE: {', '.join(set_filter)}")
    if use_page_tracking and scraped_pages:
        print(f"[All Cards Scraper] PAGE TRACKING: {len(scraped_pages)} pages already scraped (will be skipped)")
    
    try:
        # Use pagination to load all cards reliably
        base_url = "https://limitlesstcg.com/cards?q=lang%3Aen&display=list"
        print(f"[All Cards Scraper] Loading English cards: {base_url}")

        seen_keys = set()
        seen_pages = set()
        page_index = max(1, start_page)
        next_url = base_url if start_page <= 1 else f"{base_url}&page={start_page}"

        while next_url:
            # Check max_pages limit
            if max_pages and page_index > max_pages:
                print(f"[All Cards Scraper] Reached max_pages limit ({max_pages}). Stopping.")
                break
            
            # Check end_page limit
            if end_page and page_index > end_page:
                print(f"[All Cards Scraper] Reached end_page ({end_page}). Stopping.")
                break
            
            if next_url in seen_pages:
                print("[All Cards Scraper] WARNING: Detected repeated page URL. Stopping.")
                break
            seen_pages.add(next_url)

            # Check if page already scraped
            if use_page_tracking and page_index in scraped_pages:
                print(f"[All Cards Scraper] ⏭ Skipping page {page_index} (already scraped)")
                page_index += 1
                next_url = f"{base_url}&page={page_index}" if page_index > 1 else None
                continue
            
            print(f"[All Cards Scraper] Loading page {page_index}: {next_url}")
            driver.get(next_url)

            # Wait for table rows to appear
            try:
                WebDriverWait(driver, 15).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, "tbody tr"))
                )
            except Exception:
                print("[All Cards Scraper] ERROR: Table rows not found on this page.")
                break

            # Extract data from table rows
            rows = driver.find_elements(By.CSS_SELECTOR, "tbody tr")
            print(f"[All Cards Scraper] Found {len(rows)} cards on page {page_index}")

            new_added_on_page = 0
            filtered_out_on_page = 0

            for idx, row in enumerate(rows):
                try:
                    cells = row.find_elements(By.TAG_NAME, "td")

                    if len(cells) >= 4:
                        # Extract data - column order: Set, No, Name, Type
                        set_code = cells[0].get_attribute('textContent').strip()
                        set_number = cells[1].get_attribute('textContent').strip()
                        card_name = cells[2].get_attribute('textContent').strip()
                        card_type = cells[3].get_attribute('textContent').strip()
                        
                        # Apply set_filter if specified
                        if set_filter and set_code not in set_filter:
                            filtered_out_on_page += 1
                            continue

                        # Try to get card link for detail page
                        try:
                            link_elem = cells[2].find_element(By.TAG_NAME, "a")
                            card_url = link_elem.get_attribute('href')
                        except:
                            card_url = None

                        if card_name:
                            key = f"{card_name}::{set_code}::{set_number}"
                            if key in seen_keys or key in existing_keys:
                                continue
                            seen_keys.add(key)
                            all_cards_data.append({
                                'name': card_name,
                                'set': set_code,
                                'number': set_number,
                                'type': card_type,
                                'card_url': card_url,
                                'image_url': '',
                                'rarity': '',
                                'international_prints': '',
                                'cardmarket_url': ''
                            })
                            new_added_on_page += 1

                            if (len(all_cards_data)) % 500 == 0:
                                print(f"[All Cards Scraper]   Processed {len(all_cards_data)} cards so far...")
                except Exception:
                    continue
            
            if filtered_out_on_page > 0:
                print(f"[All Cards Scraper]   Filtered out {filtered_out_on_page} cards (not in set_filter)")
            
            # Mark page as successfully scraped
            if use_page_tracking:
                newly_scraped_pages.add(page_index)

            # Find next page link
            next_link = None
            next_selectors = [
                ".pagination a[rel='next']",
                ".pagination .page-item.next a",
                ".pagination a[aria-label='Next']"
            ]
            for selector in next_selectors:
                elems = driver.find_elements(By.CSS_SELECTOR, selector)
                if elems:
                    next_link = elems[0]
                    break

            if not next_link:
                # If no next button found, try to construct next page URL manually
                # Only stop if we have no rows at all (truly empty page)
                if len(rows) == 0:
                    print("[All Cards Scraper] Reached last page (no cards found).")
                    break
                next_url = f"{base_url}&page={page_index + 1}"
                page_index += 1
                time.sleep(float(settings.get("list_page_delay_seconds", 1.0)))
                continue

            parent = next_link.find_element(By.XPATH, "..")
            parent_class = parent.get_attribute("class") or ""
            if "disabled" in parent_class.lower():
                print("[All Cards Scraper] Reached last page (next disabled).")
                break

            href = next_link.get_attribute("href")
            if not href:
                print("[All Cards Scraper] No href on next link. Stopping.")
                break

            next_url = href
            page_index += 1
            time.sleep(float(settings.get("list_page_delay_seconds", 1.0)))
        
    except Exception as e:
        print(f"[All Cards Scraper] ERROR during list scraping: {e}")
        import traceback
        traceback.print_exc()
    finally:
        driver.quit()
    
    print(f"\n[All Cards Scraper] OK: Extracted {len(all_cards_data)} cards from list")
    
    # Save page tracking
    if use_page_tracking and newly_scraped_pages:
        all_scraped_pages = scraped_pages | newly_scraped_pages
        save_scraped_pages(all_scraped_pages)
        print(f"[All Cards Scraper] ✓ Saved {len(newly_scraped_pages)} new page(s) to tracking file")
        print(f"[All Cards Scraper]   Total tracked pages: {len(all_scraped_pages)}")
    
    return all_cards_data


def load_existing_cards(csv_path: str, rescrape_incomplete: bool = True) -> (List[Dict[str, str]], set, List[Dict[str, str]]):
    """Load existing cards from CSV to avoid duplicates and allow append mode.
    
    Returns:
        - existing_cards: Complete cards to keep (have image_url + rarity + international_prints)
        - existing_keys: Set of unique identifiers for all cards (complete + incomplete)
        - incomplete_cards: Cards missing any of: image_url, rarity, or international_prints
    """
    if not os.path.isfile(csv_path):
        return [], set(), []

    complete_cards = []
    incomplete_cards = []
    existing_keys = set()
    
    with open(csv_path, 'r', encoding='utf-8', newline='') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if not row:
                continue
            name = (row.get('name') or '').strip()
            set_code = (row.get('set') or '').strip()
            set_number = (row.get('number') or '').strip()
            image_url = (row.get('image_url') or '').strip()
            rarity = (row.get('rarity') or '').strip()
            international_prints = (row.get('international_prints') or '').strip()
            cardmarket_url = (row.get('cardmarket_url') or '').strip()
            
            card_data = {
                'name': name,
                'set': set_code,
                'number': set_number,
                'type': (row.get('type') or '').strip(),
                'rarity': rarity,
                'image_url': image_url,
                'international_prints': international_prints,
                'cardmarket_url': cardmarket_url,
                'card_url': ''
            }
            
            if name and set_code and set_number:
                key = f"{name}::{set_code}::{set_number}"
                existing_keys.add(key)
                
                # Check if card is complete: needs ALL essential fields
                # This ensures cards get re-scraped when:
                # - Missing image_url, rarity, or international_prints
                # - OR has only self-reference in int.prints AND no Cardmarket link (indicates incomplete scrape)
                has_basic_data = bool(image_url and rarity and international_prints)
                
                # Check if card has ONLY self-reference in international_prints
                # (e.g., "WHT-126" = only itself, no other prints found)
                only_self_reference = False
                if international_prints:
                    prints_list = [p.strip() for p in international_prints.split(',')]
                    self_id = f"{set_code}-{set_number}"
                    only_self_reference = (len(prints_list) == 1 and prints_list[0] == self_id)
                
                # Card is incomplete if:
                # - Missing basic data OR
                # - Has only self-reference AND no Cardmarket link (likely failed scrape)
                is_incomplete = not has_basic_data or (only_self_reference and not cardmarket_url)
                is_complete = not is_incomplete
                
                if is_complete:
                    complete_cards.append(card_data)
                elif rescrape_incomplete:
                    # Add to incomplete list for re-scraping
                    incomplete_cards.append(card_data)
                else:
                    # Keep incomplete cards as-is if not re-scraping
                    complete_cards.append(card_data)

    total_count = len(complete_cards) + len(incomplete_cards)
    complete_count = len(complete_cards)
    incomplete_count = len(incomplete_cards)
    
    print(f"[All Cards Scraper] Loaded {total_count} existing cards from CSV")
    print(f"[All Cards Scraper]   ✓ {complete_count} cards are complete (have image + rarity + int.prints + cardmarket)")
    
    if rescrape_incomplete and incomplete_count > 0:
        print(f"[All Cards Scraper]   ⚠ {incomplete_count} cards are incomplete and will be re-scraped")
        print(f"[All Cards Scraper]      (Missing data or Cardmarket link failed on previous run)")
    elif incomplete_count > 0:
        print(f"[All Cards Scraper]   ⚠ {incomplete_count} cards are incomplete (kept as-is, rescrape_incomplete=False)")

    
    return complete_cards, existing_keys, incomplete_cards


def scrape_card_details(settings: Dict[str, object], cards: List[Dict[str, str]], 
                        existing_cards: List[Dict[str, str]], csv_path: str, append_mode: bool) -> List[Dict[str, str]]:
    """Scrape detail page for each card to get image URL and rarity.
    
    Writes CSV progressively every 100 cards so other tools can use updated data while scraping continues.
    Browser is restarted every 1000 cards to prevent session timeout issues.
    """
    print(f"\n[All Cards Scraper] Now scraping detail pages for {len(cards)} cards...")
    print("[All Cards Scraper] This may take a while - opening ~1 page per card...")
    print("[All Cards Scraper] CSV will be updated every 100 cards with latest details...")
    print("[All Cards Scraper] Browser will restart every 1000 cards to prevent session issues...")
    
    def create_browser():
        """Create a new Chrome browser instance with standard settings."""
        chrome_options = Options()
        if settings.get("headless", True):
            chrome_options.add_argument("--headless")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--disable-gpu")
        chrome_options.add_argument("--window-size=1920,1080")
        return webdriver.Chrome(options=chrome_options)
    
    driver = create_browser()
    restart_counter = 0  # Track cards processed since last restart
    
    def write_csv_batch():
        """Write all cards (existing + new with current details) to CSV with deduplication."""
        all_data = (existing_cards + cards) if append_mode else cards
        
        # Deduplicate by unique key (name::set::number) before writing
        seen_keys = set()
        deduplicated_data = []
        for card in all_data:
            key = f"{card.get('name', '')}::{card.get('set', '')}::{card.get('number', '')}"
            if key and key not in seen_keys:
                seen_keys.add(key)
                deduplicated_data.append(card)
        
        with open(csv_path, 'w', encoding='utf-8', newline='') as f:
            fieldnames = ['name', 'set', 'number', 'type', 'rarity', 'image_url', 'international_prints', 'cardmarket_url']
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            for card in deduplicated_data:
                writer.writerow({
                    'name': card.get('name', ''),
                    'set': card.get('set', ''),
                    'number': card.get('number', ''),
                    'type': card.get('type', ''),
                    'rarity': card.get('rarity', ''),
                    'image_url': card.get('image_url', ''),
                    'international_prints': card.get('international_prints', ''),
                    'cardmarket_url': card.get('cardmarket_url', '')
                })
    
    try:
        for idx, card in enumerate(cards):
            try:
                if not card.get('card_url'):
                    # Skip cards without URL
                    continue
                
                # Browser restart every 1000 cards to prevent session timeout
                if restart_counter >= 1000:
                    print(f"\n[All Cards Scraper] BROWSER RESTART: Processed {restart_counter} cards, restarting browser...")
                    try:
                        driver.quit()
                    except:
                        pass
                    driver = create_browser()
                    restart_counter = 0
                    print("[All Cards Scraper] Browser restarted successfully!")
                
                # Build full URL if relative
                if card['card_url'].startswith('/'):
                    full_url = f"https://limitlesstcg.com{card['card_url']}"
                else:
                    full_url = card['card_url']
                
                print(f"[All Cards Scraper] [{idx+1}/{len(cards)}] {card['name']} ({card['set']} {card['number']})...")
                
                # Try to load the page with session recovery
                max_retries = 3
                for retry in range(max_retries):
                    try:
                        driver.get(full_url)
                        break  # Success, exit retry loop
                    except Exception as e:
                        error_msg = str(e).lower()
                        
                        # Handle network errors (DNS resolution, connection errors)
                        if 'err_name_not_resolved' in error_msg or 'err_connection' in error_msg or 'network' in error_msg:
                            print(f"[All Cards Scraper] NETWORK ERROR: Cannot reach server")
                            if retry < max_retries - 1:
                                wait_time = 10 * (retry + 1)  # Increase wait time with each retry
                                print(f"   ⏸ Waiting {wait_time} seconds before retry {retry+1}/{max_retries}...")
                                time.sleep(wait_time)
                            else:
                                print(f"[All Cards Scraper] NETWORK FAILED after {max_retries} retries")
                                print(f"   ⚠ Skipping card: {card['name']}")
                                raise
                        
                        # Handle session errors (browser crashes, session timeouts)
                        elif 'invalid session id' in error_msg or 'session' in error_msg:
                            print(f"[All Cards Scraper] SESSION ERROR detected: {e}")
                            if retry < max_retries - 1:
                                print(f"[All Cards Scraper] RECOVERING: Restarting browser (retry {retry+1}/{max_retries})...")
                                try:
                                    driver.quit()
                                except:
                                    pass
                                driver = create_browser()
                                restart_counter = 0
                                time.sleep(2)  # Wait a bit before retrying
                            else:
                                print(f"[All Cards Scraper] FAILED after {max_retries} retries, skipping card")
                                raise
                        else:
                            raise  # Re-raise if it's not a known recoverable error
                
                # Wait for image to load
                time.sleep(float(settings.get("detail_page_wait_seconds", 2.0)))
                
                # Extract image URL from <img class="card shadow resp-w">
                try:
                    img_elem = driver.find_element(By.CSS_SELECTOR, "img.card.shadow.resp-w")
                    image_url = img_elem.get_attribute('src')
                    if image_url:
                        card['image_url'] = image_url
                except:
                    pass
                
                # Extract rarity from card-prints div with multiple fallback strategies
                try:
                    rarity_found = False
                    
                    # Strategy 1: Try .card-prints-current .prints-current-details span (most reliable)
                    try:
                        rarity_spans = driver.find_elements(By.CSS_SELECTOR, ".card-prints-current .prints-current-details span")
                        if len(rarity_spans) >= 2:
                            rarity_info = rarity_spans[1].get_attribute('textContent').strip()
                            # Extract rarity from format like "· Double Rare"
                            if '·' in rarity_info:
                                rarity = rarity_info.split('·')[1].strip()
                                if rarity:
                                    card['rarity'] = rarity
                                    rarity_found = True
                    except:
                        pass
                    
                    # Strategy 2: Try the prints table rows (alternative method)
                    if not rarity_found:
                        try:
                            # Look for the current card's row in the prints table
                            table = driver.find_element(By.CSS_SELECTOR, "table.card-prints-versions")
                            rows = table.find_elements(By.CSS_SELECTOR, "tbody tr")
                            
                            current_set = card['set']
                            current_number = card['number']
                            
                            for row in rows:
                                cells = row.find_elements(By.TAG_NAME, "td")
                                if len(cells) >= 2:
                                    # Check if this row matches current card (set-number)
                                    first_cell_text = cells[0].get_attribute('textContent').strip()
                                    if f"{current_set}-{current_number}" in first_cell_text or first_cell_text.startswith(f"{current_set} "):
                                        # Extract rarity from second column
                                        rarity_text = cells[1].get_attribute('textContent').strip()
                                        if rarity_text and rarity_text not in ['—', '-', '']:
                                            card['rarity'] = rarity_text
                                            rarity_found = True
                                            break
                        except:
                            pass
                    
                    # Log if rarity extraction failed
                    if not rarity_found:
                        print(f"      [WARNING] Could not extract rarity for {card['set']}-{card['number']}")
                        
                except Exception as e:
                    print(f"      [ERROR] Rarity extraction failed for {card['set']}-{card['number']}: {e}")
                
                # For Promo sets: If rarity is empty, set it to "Promo"
                # This makes Promo cards easier to track and fixes threshold logic in frontend
                PROMO_SETS = ['MEP', 'SVP', 'SP', 'SMP', 'XYP', 'BWP', 'HSP', 'DPP', 'NP', 'WP', 
                              'POP', 'SWSH', 'SWSHP', 'PR-SW', 'PR-SM', 'PR-XY', 'PR-BLW', 'PR-HS', 'PR-DP']
                if card['set'] in PROMO_SETS and not card.get('rarity'):
                    card['rarity'] = 'Promo'
                
                # Extract International Prints + Cardmarket Link from the prints table
                # HTML structure: <table class="card-prints-versions"> with rows containing card links and prices
                try:
                    int_prints = set()
                    cardmarket_url = ''
                    
                    # Find the card-prints-versions table
                    try:
                        table = driver.find_element(By.CSS_SELECTOR, "table.card-prints-versions")
                        
                        # Get all rows in the table body
                        rows = table.find_elements(By.CSS_SELECTOR, "tbody tr")
                        
                        for row in rows:
                            # Skip header row
                            if row.find_elements(By.TAG_NAME, "th"):
                                continue
                            
                            # Extract Int. Print from first column (td with <a href="/cards/SET/NUM">)
                            try:
                                first_td = row.find_element(By.CSS_SELECTOR, "td:first-child")
                                card_link = first_td.find_element(By.CSS_SELECTOR, "a[href*='/cards/']")
                                href = card_link.get_attribute('href')
                                
                                if href and '/cards/' in href:
                                    # Extract SET/NUM from URL
                                    # URLs can be: /cards/SET/NUM or /cards/en/SET/NUM (with language prefix)
                                    path = href.split('/cards/')[-1].strip()
                                    parts = path.split('/')
                                    
                                    # Remove language prefix (en, de, fr, etc.) if present
                                    if len(parts) >= 3 and parts[0].lower() in ['en', 'de', 'fr', 'es', 'it', 'pt', 'ja', 'ko']:
                                        # Format: /cards/en/SET/NUM
                                        set_code = parts[1].upper()
                                        set_num = parts[2]
                                    elif len(parts) >= 2:
                                        # Format: /cards/SET/NUM
                                        set_code = parts[0].upper()
                                        set_num = parts[1]
                                    else:
                                        continue
                                    
                                    # Skip Japanese sets
                                    if set_code != 'JP':
                                        card_id = f"{set_code}-{set_num}"
                                        int_prints.add(card_id)
                            except:
                                pass  # Row might not have card link (could be current card without href)
                            
                            # Extract Cardmarket URL from current card's row (class="current")
                            try:
                                if 'current' in row.get_attribute('class'):
                                    # Find EUR price column (third td) with Cardmarket link
                                    eur_link = row.find_element(By.CSS_SELECTOR, "a.card-price.eur")
                                    cardmarket_url = eur_link.get_attribute('href') or ''
                            except:
                                pass
                        
                        # Always add current card's ID to int_prints
                        current_id = f"{card['set']}-{card['number']}"
                        int_prints.add(current_id)
                        
                        # Store results
                        card['international_prints'] = ','.join(sorted(list(int_prints)))
                        card['cardmarket_url'] = cardmarket_url
                        
                        if len(int_prints) > 1:
                            print(f"   → Found {len(int_prints)} int. prints: {', '.join(sorted(list(int_prints))[:4])}{'...' if len(int_prints) > 4 else ''}")
                        else:
                            print(f"   ℹ Single print: {card['name']}")
                        
                        if cardmarket_url:
                            print(f"   ✓ Cardmarket link found")
                        
                    except Exception as e:
                        # Fallback: use own ID if table not found
                        card['international_prints'] = f"{card['set']}-{card['number']}"
                        card['cardmarket_url'] = ''
                        
                        # Check for network errors (critical)
                        error_str = str(e)
                        if 'ERR_NAME_NOT_RESOLVED' in error_str or 'ERR_CONNECTION' in error_str:
                            print(f"   ⚠ NETWORK ERROR: {error_str.split('Stacktrace')[0].strip()}")
                            print(f"   ⏸ Pausing for 10 seconds before retry...")
                            time.sleep(10)
                        elif 'no such element' in error_str and 'card-prints-versions' in error_str:
                            # Table not found - normal for single-print cards
                            print(f"   ℹ No int. prints table (single print)")
                        else:
                            # Other errors
                            print(f"   ⚠ Could not extract prints: {error_str.split('Stacktrace')[0].strip()[:100]}")
                    
                except Exception as e:
                    # Final fallback
                    card['international_prints'] = f"{card['set']}-{card['number']}"
                    card['cardmarket_url'] = ''
                    error_str = str(e)
                    print(f"   ERROR: {error_str.split('Stacktrace')[0].strip()[:150]}")
                
                # Be nice to the server - small delay between requests
                time.sleep(float(settings.get("detail_request_delay_seconds", 0.5)))
                
                restart_counter += 1  # Increment counter for browser restart logic
                
                # Progressive CSV update every 100 cards
                if (idx + 1) % 100 == 0:
                    print(f"[All Cards Scraper] OK: Completed {idx + 1} detail pages")
                    print(f"[All Cards Scraper] UPDATING CSV: Writing current progress to {csv_path}...")
                    write_csv_batch()
                    print(f"[All Cards Scraper] CSV updated! Other tools can now use {idx + 1} cards with details.")
                
            except Exception as e:
                print(f"[All Cards Scraper] ERROR scraping {card['name']}: {e}")
                continue
    
    finally:
        try:
            driver.quit()
        except:
            pass
    
    # Count how many got image URLs
    cards_with_images = sum(1 for c in cards if c.get('image_url'))
    print(f"\n[All Cards Scraper] OK: Got image URLs for {cards_with_images}/{len(cards)} cards")
    
    return cards


# Main execution - with error handling to keep console open
try:
    print("\n" + "=" * 80)
    print("PHASE 1: Scraping card list from Limitless...")
    print("=" * 80)
    settings = load_settings()
    data_dir = get_data_dir()
    csv_path = os.path.join(data_dir, 'all_cards_database.csv')
    json_path = os.path.join(data_dir, 'all_cards_database.json')
    append_mode = bool(settings.get("append", True))
    start_page = int(settings.get("start_page", 1))

    print(f"[All Cards Scraper] Data directory: {os.path.abspath(data_dir)}")
    print(f"[All Cards Scraper] Output file: {os.path.abspath(csv_path)}")
    print()

    rescrape_incomplete = bool(settings.get("rescrape_incomplete", True))

    if append_mode:
        existing_cards, existing_keys, incomplete_cards = load_existing_cards(csv_path, rescrape_incomplete)
    else:
        existing_cards, existing_keys, incomplete_cards = [], set(), []

    all_cards = scrape_all_cards_list(settings, start_page=start_page, existing_keys=existing_keys)

    # Combine new cards with incomplete cards that need re-scraping
    if rescrape_incomplete and incomplete_cards:
        print(f"\n[All Cards Scraper] Adding {len(incomplete_cards)} incomplete cards for detail re-scraping...")
        # Add card_urls to incomplete cards for detail scraping
        for ic in incomplete_cards:
            # Try to build URL from card data
            if ic.get('name') and ic.get('set') and ic.get('number'):
                # Build approximate URL (may not always work, but we'll handle errors)
                card_name_slug = ic['name'].lower().replace(' ', '-').replace("'", '')
                ic['card_url'] = f"/cards/{ic['set'].upper()}/{ic['number']}/{card_name_slug}"
        all_cards = incomplete_cards + all_cards
        print(f"[All Cards Scraper] Total cards to detail-scrape: {len(all_cards)} ({len(incomplete_cards)} incomplete + {len(all_cards) - len(incomplete_cards)} new)")

    if not all_cards:
        print("[All Cards Scraper] No new cards extracted and no incomplete cards to repair. Exiting.")
        exit(0)

    # Write CSV after Phase 1 (list scraping) - so other tools can use partial data immediately
    print("\n" + "=" * 80)
    print("WRITING PARTIAL CSV: Saving cards from list scraping...")
    print("=" * 80)

    # Ensure output directory exists
    os.makedirs(data_dir, exist_ok=True)

    # Save to CSV (ALWAYS OVERWRITE with deduplicated data to prevent duplicates)
    all_data_partial = (existing_cards + all_cards) if append_mode else all_cards
    
    # Deduplicate by unique key (name::set::number) before writing
    seen_keys = set()
    deduplicated_data = []
    for card in all_data_partial:
        key = f"{card.get('name', '')}::{card.get('set', '')}::{card.get('number', '')}"
        if key and key not in seen_keys:
            seen_keys.add(key)
            deduplicated_data.append(card)
    
    duplicates_removed = len(all_data_partial) - len(deduplicated_data)
    if duplicates_removed > 0:
        print(f"[All Cards Scraper] ⚠ Removed {duplicates_removed} duplicate entries before writing")
    
    # NOTE: Sorting will happen in final CSV write, no need to sort partial data here
    
    with open(csv_path, 'w', encoding='utf-8', newline='') as f:
        fieldnames = ['name', 'set', 'number', 'type', 'rarity', 'image_url', 'international_prints', 'cardmarket_url']
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for card in deduplicated_data:
            writer.writerow({
                'name': card.get('name', ''),
                'set': card.get('set', ''),
                'number': card.get('number', ''),
                'type': card.get('type', ''),
                'rarity': card.get('rarity', ''),
                'image_url': card.get('image_url', ''),
                'international_prints': card.get('international_prints', ''),
                'cardmarket_url': card.get('cardmarket_url', '')
            })

    print(f"[All Cards Scraper] OK: Partial CSV saved to {csv_path}")
    print(f"[All Cards Scraper] {len(deduplicated_data)} unique cards are now available for other tools!")
    print("[All Cards Scraper] Will continue with detail scraping and update CSV with images/rarity...")

    # PHASE 2: Scrape detail pages (optional - can be skipped for fast testing)
    skip_details = bool(settings.get("skip_detail_scraping", False))
    if skip_details:
        print("\n" + "=" * 80)
        print("PHASE 2: SKIPPED (skip_detail_scraping = true)")
        print("=" * 80)
        print("[All Cards Scraper] Detail scraping skipped. Cards will have no image_url or rarity.")
    else:
        print("\n" + "=" * 80)
        print("PHASE 2: Scraping detail pages for image URLs and rarity...")
        print("=" * 80)
        all_cards = scrape_card_details(settings, all_cards, existing_cards, csv_path, append_mode)

    # Final CSV write to ensure all data is saved (in case last batch was < 100 cards)
    print("\n" + "=" * 80)
    print("FINAL CSV WRITE: Saving all cards with latest details...")
    print("=" * 80)

    # Ensure output directory exists
    os.makedirs(data_dir, exist_ok=True)

    # Save to CSV with deduplication to prevent duplicate entries
    all_data = (existing_cards + all_cards) if append_mode else all_cards
    
    # Deduplicate by unique key (name::set::number) before writing
    seen_keys = set()
    deduplicated_data = []
    for card in all_data:
        key = f"{card.get('name', '')}::{card.get('set', '')}::{card.get('number', '')}"
        if key and key not in seen_keys:
            seen_keys.add(key)
            deduplicated_data.append(card)
    
    duplicates_removed = len(all_data) - len(deduplicated_data)
    if duplicates_removed > 0:
        print(f"[All Cards Scraper] ⚠ Removed {duplicates_removed} duplicate entries before writing")
    
    # SORT cards by SET_ORDER (newest sets first) and then by card number
    # This fixes the problem where sets are not in chronological order
    SET_ORDER = {
        # Mega (2025-2026)
        'ASC': 130, 'PFL': 129, 'MEG': 128, 'MEE': 128, 'MEP': 128,
        # Scarlet & Violet (2023-2025)
        'BLK': 127, 'WHT': 126, 'DRI': 125, 'JTG': 124, 'PRE': 123,
        'SSP': 122, 'SCR': 121, 'SFA': 120, 'TWM': 119, 'TEF': 118,
        'PAF': 117, 'PAR': 116, 'MEW': 115, 'OBF': 114, 'PAL': 113,
        'SVI': 112, 'SVE': 112, 'SVP': 112,
        # Sword & Shield (2020-2023)
        'CRZ': 111, 'SIT': 110, 'LOR': 109, 'PGO': 108, 'ASR': 107,
        'BRS': 106, 'FST': 105, 'CEL': 104, 'EVS': 103, 'CRE': 102,
        'BST': 101, 'SHF': 100, 'VIV': 99, 'CPA': 98, 'DAA': 97,
        'RCL': 96, 'SSH': 95, 'SP': 95,
        # Sun & Moon (2017-2019)
        'CEC': 94, 'HIF': 93, 'UNM': 92, 'UNB': 91, 'DET': 90,
        'TEU': 89, 'LOT': 88, 'DRM': 87, 'CES': 86, 'FLI': 85,
        'UPR': 84, 'CIN': 83, 'SLG': 82, 'BUS': 81, 'GRI': 80,
        'SUM': 79, 'SMP': 79,
        # XY (2014-2016)
        'EVO': 78, 'STS': 77, 'FCO': 76, 'GEN': 75, 'BKP': 74,
        'BKT': 73, 'AOR': 72, 'ROS': 71, 'DCR': 70, 'PRC': 69,
        'PHF': 68, 'FFI': 67, 'FLF': 66, 'XY': 65, 'XYP': 65,
        # Black & White (2011-2013)
        'LTR': 64, 'PLB': 63, 'PLF': 62, 'PLS': 61, 'BCR': 60,
        'DRX': 59, 'DEX': 58, 'NXD': 57, 'NVI': 56, 'EPO': 55,
        'BLW': 54, 'BWP': 54,
        # HeartGold & SoulSilver (2010-2011)
        'CL': 53, 'TM': 52, 'UD': 51, 'UL': 50, 'HS': 49,
        # Platinum (2009-2010)
        'AR': 48, 'SV': 47, 'RR': 46, 'PL': 45, 'SF': 44,
        # Diamond & Pearl (2007-2009)
        'LA': 43, 'MD': 42, 'GE': 41, 'SW': 40, 'MT': 39, 'DP': 38,
        # EX (2003-2007)
        'PK': 37, 'DF': 36, 'CG': 35, 'HP': 34, 'LM': 33, 'DS': 32,
        'UF': 31, 'EM': 30, 'DX': 29, 'TRR': 28, 'RG': 27, 'HL': 26,
        'MA': 25, 'DR': 24, 'SS': 23, 'RS': 22,
        # e-Card & Neo (2000-2003)
        'E3': 21, 'E2': 20, 'E1': 19, 'LC': 18, 'N4': 17, 'N3': 16,
        'N2': 15, 'N1': 14,
        # Classic (1999-2000)
        'G2': 13, 'G1': 12, 'TR': 11, 'BS2': 10, 'FO': 9, 'JU': 8, 'BS': 7,
        # Older Special Sets
        'M3': 20, 'MC': 15, 'MP1': 50
    }
    
    def sort_key(card):
        set_code = card.get('set', '')
        number_str = card.get('number', '0')
        
        # Get set order (higher = newer sets first)
        set_order = SET_ORDER.get(set_code, 0)
        
        # Extract numeric part from card number (handles "185a", "185+" etc.)
        try:
            # Try to extract leading digits
            import re
            match = re.match(r'(\d+)', number_str)
            card_number = int(match.group(1)) if match else 0
        except:
            card_number = 0
        
        # Sort by: set_order DESC (newest first), then card_number ASC
        return (-set_order, card_number, number_str)
    
    print(f"[All Cards Scraper] Sorting {len(deduplicated_data)} cards by set release date and card number...")
    deduplicated_data.sort(key=sort_key)
    print(f"[All Cards Scraper] ✓ Cards sorted (newest sets first)")
    
    with open(csv_path, 'w', encoding='utf-8', newline='') as f:
        fieldnames = ['name', 'set', 'number', 'type', 'rarity', 'image_url', 'international_prints', 'cardmarket_url']
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for card in deduplicated_data:
            writer.writerow({
                'name': card.get('name', ''),
                'set': card.get('set', ''),
                'number': card.get('number', ''),
                'type': card.get('type', ''),
                'rarity': card.get('rarity', ''),
                'image_url': card.get('image_url', ''),
                'international_prints': card.get('international_prints', ''),
                'cardmarket_url': card.get('cardmarket_url', '')
            })

    print(f"\n[All Cards Scraper] OK: Saved to {csv_path}")
    print(f"[All Cards Scraper] Total cards in database: {len(deduplicated_data)}")

    # Also save to JSON for easy access (use same deduplicated data)
    json_data = {
        'timestamp': datetime.now().isoformat(),
        'source': 'https://limitlesstcg.com/cards?q=lang%3Aen',
        'total_count': len(deduplicated_data),
        'cards': deduplicated_data
    }

    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(json_data, f, indent=2, ensure_ascii=False)

    print(f"[All Cards Scraper] OK: Saved to {json_path}")

    print()
    print("Sample data (first 10):")
    for card in deduplicated_data[:10]:
        img_status = "OK" if card['image_url'] else "NO"
        print(f"  {img_status} {card['name']} ({card['set']} {card['number']}) - {card['type']}")
        if card['image_url']:
            print(f"      └─ {card['image_url']}")
    if len(deduplicated_data) > 10:
        print(f"  ... and {len(deduplicated_data) - 10} more")
    print()
    
    # Auto-sort database by SET_ORDER → Number
    print("=" * 80)
    print("SORTING DATABASE...")
    print("=" * 80)
    try:
        result = subprocess.run(
            [sys.executable, 'sort_cards_database.py'],
            capture_output=True,
            text=True,
            encoding='utf-8',
            timeout=60
        )
        if result.returncode == 0:
            print(result.stdout)
        else:
            print(f"[WARN] Sort script failed with exit code {result.returncode}")
            if result.stderr:
                print(f"Error: {result.stderr}")
    except Exception as e:
        print(f"[WARN] Could not run sort script: {e}")
    
    print("=" * 80)
    print("SUCCESS: All cards database ready!")
    print("=" * 80)
    print()

except Exception as e:
    print("\n" + "=" * 80)
    print("❌ FEHLER: Scraper abgebrochen!")
    print("=" * 80)
    print(f"\nFehler: {e}")
    import traceback
    traceback.print_exc()
    print("\n" + "=" * 80)
    
finally:
    # ALWAYS keep console open (even after errors)
    if getattr(sys, "frozen", False):
        print("\n")
        input("Drücke ENTER zum Beenden...")
