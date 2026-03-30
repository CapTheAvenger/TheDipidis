#!/usr/bin/env python3
"""
Card Price Scraper - LIMITLESS ONLY EDITION
=========================================================
Zieht rasend schnell alle Basis-Preise von Limitless.
Cardmarket wurde entfernt, da die CM-Links dynamisch im Frontend erzeugt werden.
"""

import csv
import os
import sys
import concurrent.futures
from datetime import datetime

try:
    from bs4 import BeautifulSoup
    import requests as std_requests
except ImportError:
    print("FEHLER: Bibliotheken fehlen! pip install beautifulsoup4 requests")
    sys.exit(1)

from backend.settings import get_data_path
from backend.core.card_scraper_shared import setup_console_encoding, setup_logging, load_settings

setup_console_encoding()
logger = setup_logging("price_scraper")

def _load_settings() -> dict:
    default_settings = {
        "max_workers": 10, 
        "limitless_update_sets": []
    }
    settings = load_settings("card_price_scraper_settings.json", default_settings)
    return settings

def load_cards_to_update(csv_path: str) -> list:
    if not os.path.isfile(csv_path): return []
    cards = []
    with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            cards.append({
                "name": (row.get("name_en") or row.get("name") or "").strip(), 
                "set": row.get("set", ""), 
                "number": row.get("number", ""),
                "cardmarket_url": row.get("cardmarket_url", ""), 
                "card_url": row.get("card_url", ""),
                "eur_price": row.get("eur_price", "")
            })
    return cards

def save_prices(prices: list, csv_path: str):
    existing = {}
    if os.path.isfile(csv_path):
        with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                if row: existing[f"{row.get('set', '')}_{row.get('number', '')}"] = row

    for p in prices:
        if p.get("eur_price"): 
            existing[f"{p.get('set', '')}_{p.get('number', '')}"] = p          

    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["name", "set", "number", "eur_price", "cardmarket_url", "last_updated"], extrasaction="ignore")
        writer.writeheader()
        for k in sorted(existing.keys()): writer.writerow(existing[k])

# --- LIMITLESS PRICE FETCH ---
def _fetch_limitless(card: dict) -> dict:
    card_id = f"{card['set']}-{card['number']}"
    eur_price = ""
    try:
        lt_url = f"https://limitlesstcg.com{card['card_url']}" if card.get("card_url") else f"https://limitlesstcg.com/cards/{card['set']}/{card['number']}"
        resp = std_requests.get(lt_url, timeout=10)
        
        if resp.status_code == 200:
            soup = BeautifulSoup(resp.text, "lxml")
            prints_table = soup.select_one("table.card-prints-versions")
            
            if prints_table:
                # STRATEGIE A: Die aktuell markierte Zeile
                current_row = prints_table.select_one("tr.current")
                if current_row:
                    eur_link = current_row.select_one("a.card-price.eur")
                    if eur_link:
                        eur_price = eur_link.get_text(strip=True)
                        logger.info("  [LT] Price [%s]: %s (Exakter Match)", card_id, eur_price)
                
                # STRATEGIE B: Link-Match
                if not eur_price:
                    exact_path = f"/cards/{card['set'].upper()}/{card['number']}"
                    for row in prints_table.select("tr"):
                        link_elem = row.select_one("a[href]")
                        if link_elem and link_elem.has_attr('href') and exact_path in link_elem["href"].upper():
                            eur_link = row.select_one("a.card-price.eur")
                            if eur_link:
                                eur_price = eur_link.get_text(strip=True)
                                logger.info("  [LT] Price [%s]: %s (Link-Match)", card_id, eur_price)
                                break
            
            # STRATEGIE C: Fallback
            if not eur_price:
                first_price = soup.select_one("a.card-price.eur")
                if first_price:
                    eur_price = first_price.get_text(strip=True)
                    logger.info("  [LT] Price [%s]: %s (Fallback)", card_id, eur_price)
                    
    except Exception as e:
        logger.debug("  [LT] Interner Fehler bei %s: %s", card_id, e)
    
    if not eur_price: 
        eur_price = card.get("eur_price", "")
    
    return {**card, "eur_price": eur_price, "last_updated": datetime.now().isoformat()}

def main():
    settings = _load_settings()
    cards_csv = str(get_data_path("all_cards_database.csv"))
    prices_csv = str(get_data_path("price_data.csv"))
    cards = load_cards_to_update(cards_csv)
    
    if not cards: return

    limitless_sets = [s.upper() for s in settings.get("limitless_update_sets", [])]

    cards_for_update = []
    for c in cards:
        if not limitless_sets or c['set'].upper() in limitless_sets:
            cards_for_update.append(c)

    logger.info("="*60)
    logger.info("LIMITLESS PRICE SCRAPER gestartet fuer %s Karten...", len(cards_for_update))
    logger.info("="*60)
    
    results = []
    workers = int(settings.get("max_workers", 10))
    
    # 10 Worker saugen Limitless jetzt in Höchstgeschwindigkeit ab
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
        futures = [executor.submit(_fetch_limitless, c) for c in cards_for_update]
        for i, f in enumerate(concurrent.futures.as_completed(futures)):
            results.append(f.result())
            if (i+1) % 500 == 0: logger.info("  ... %s/%s Preise gecheckt", i+1, len(cards_for_update))
            if (i+1) % 50 == 0: save_prices(results, prices_csv)
            
    save_prices(results, prices_csv)
    
    logger.info("="*60)
    logger.info("SUCCESS: Limitless Price Update complete!")
    logger.info("="*60)

if __name__ == "__main__":
    main()
