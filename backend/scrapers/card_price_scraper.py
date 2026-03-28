#!/usr/bin/env python3
"""
Card Price Scraper - TWO-PHASE EDITION (V5)
===========================================
PHASE 1: Fast Limitless TCG Baseline für ALLE Karten.
PHASE 2: Premium Overwrite via Cardmarket (nur Playables & High-Rares).
"""

import csv
import json
import os
import sys
import time
import logging
import random
import threading
import concurrent.futures
from datetime import datetime

try:
    from bs4 import BeautifulSoup
    import requests as std_requests
    from seleniumbase import Driver
except ImportError:
    print("FEHLER: Bibliotheken fehlen! pip install seleniumbase beautifulsoup4 requests")
    sys.exit(1)

from backend.settings import get_data_path, get_config_path
from backend.core.card_scraper_shared import setup_console_encoding, setup_logging, load_settings

setup_console_encoding()
_cm_semaphore = threading.Semaphore(2) # Max 2 Browser gleichzeitig
logger = setup_logging("price_scraper")

def _load_settings() -> dict:
    settings = load_settings("card_price_scraper_settings.json", {"delay_seconds": 5.0, "max_workers": 10, "headless": True})
    proxy_path = get_config_path("proxy_settings.json")
    if os.path.exists(proxy_path):
        try:
            with open(proxy_path, "r", encoding="utf-8") as f:
                settings["proxy"] = json.load(f)
        except Exception as e:
            logger.warning(f"Konnte proxy_settings.json nicht laden: {e}")
    else:
        settings["proxy"] = None
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
                "rarity": (row.get("rarity") or "").lower(),
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

# --- PHASE 1: LIMITLESS (FAST) ---
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
                for row in prints_table.select("tr"):
                    if card['set'].lower() in row.get_text().lower():
                        eur_link = row.select_one("a.card-price.eur")
                        if eur_link:
                            eur_price = eur_link.get_text(strip=True)
                            logger.info("  [P1] LT Baseline [%s]: %s (Set: %s)", card_id, eur_price, card['set'])
                            break
            if not eur_price:
                first_price = soup.select_one("a.card-price.eur")
                if first_price: eur_price = first_price.get_text(strip=True)
    except Exception:
        pass
    
    # Behalte alten Preis, wenn LT nichts findet
    if not eur_price: eur_price = card.get("eur_price", "")
    
    return {**card, "eur_price": eur_price, "last_updated": datetime.now().isoformat()}

# --- PHASE 2: CARDMARKET OVERWRITE (STEALTH) ---
def _fetch_cardmarket(card: dict, base_delay: float, is_headless: bool, proxy_str: str) -> dict:
    card_id = f"{card['set']}-{card['number']}"
    cm_url = card.get("cardmarket_url", "")
    new_price = ""

    if not cm_url: return card

    target_url = cm_url + ("&language=1,3" if "?" in cm_url else "?language=1,3")
    
    with _cm_semaphore:
        for attempt in range(2):
            driver = None
            try:
                driver = Driver(uc=True, proxy=proxy_str, headless2=is_headless) if proxy_str else Driver(uc=True, headless2=is_headless)
                driver.get(target_url)
                time.sleep(base_delay + random.uniform(2.0, 4.0))
                
                # Preis parsen
                soup = BeautifulSoup(driver.page_source, "lxml")
                for dt in soup.find_all("dt"):
                    if dt.get_text(strip=True).lower() in ("from", "ab"):
                        dd = dt.find_next_sibling("dd")
                        if dd and ("EUR" in dd.text or "€" in dd.text) and "£" not in dd.text:
                            new_price = dd.get_text(strip=True)
                            logger.info("  [P2] CM OVERWRITE [%s]: %s (vorher: %s)", card_id, new_price, card.get('eur_price', 'N/A'))
                            break
                if new_price: break
            except Exception as e:
                logger.debug("  CM Fehler [%s]: %s", card_id, e)
            finally:
                if driver: driver.quit()

    if new_price:
        return {**card, "eur_price": new_price, "last_updated": datetime.now().isoformat()}
    else:
        logger.debug("  [P2] CM failed [%s] - behalte LT Preis: %s", card_id, card.get('eur_price', ''))
        return card

def main():
    settings = _load_settings()
    cards_csv = str(get_data_path("all_cards_database.csv"))
    prices_csv = str(get_data_path("price_data.csv"))
    cards = load_cards_to_update(cards_csv)
    
    if not cards: return

    # --- SETUP: Meta und Proxy vorbereiten ---
    playable_names = set()
    meta_path = get_data_path("meta_data.json")
    if os.path.exists(meta_path):
        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                for deck in json.load(f).get("decks", []):
                    for c in deck.get("cards", []): playable_names.add(c.get("name", "").lower().strip())
        except Exception:
            pass

    proxy_str = None
    if settings.get("proxy"):
        p = settings["proxy"]
        proxy_str = f"{p.get('user')}:{p.get('pass')}@{p.get('host')}:{p.get('port')}" if p.get('user') else f"{p.get('host')}:{p.get('port')}"

    # ==========================================
    # PHASE 1: LIMITLESS BASELINE
    # ==========================================
    logger.info("="*60)
    logger.info("PHASE 1: Lade Limitless Baseline fuer ALLE %s Karten...", len(cards))
    logger.info("="*60)
    
    phase1_results = []
    # Hier können wir Gas geben: 10 Workers für normales Web-Scraping
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(_fetch_limitless, c) for c in cards]
        for i, f in enumerate(concurrent.futures.as_completed(futures)):
            phase1_results.append(f.result())
            if (i+1) % 500 == 0: logger.info("  ... %s/%s Baseline-Preise gecheckt", i+1, len(cards))
            
    save_prices(phase1_results, prices_csv)

    # ==========================================
    # PHASE 2: CARDMARKET OVERWRITE (PREMIUM)
    # ==========================================
    logger.info("="*60)
    logger.info("PHASE 2: Filtere VIP Karten fuer Cardmarket Overwrite...")
    logger.info("="*60)

    cm_vip_cards = []
    for card in phase1_results:
        c_name = card['name'].lower()
        c_num = card['number'].upper()
        rarity = card.get('rarity', '').lower()
        
        is_high_rare = (
            any(x in c_num for x in ["SIR", "GG", "TG", "SV", "AR", "FA", "EX", "VSTAR", "PROMO"]) or
            (c_num.count('/') > 0 and int(c_num.split('/')[0]) > 160) or
            any(x in c_name for x in [' ex', '-ex', ' gx', ' v', ' vmax', ' vstar']) or
            any(x in rarity for x in ['secret', 'illustration', 'ultra', 'hyper', 'promo', 'double', 'amazing'])
        )
        is_playable = c_name in playable_names

        if is_high_rare or is_playable:
            cm_vip_cards.append(card)

    logger.info("-> %s VIP Karten identifiziert. Starte CM Stealth Modus.", len(cm_vip_cards))
    
    final_results = []
    # Nur 2 Workers für den Browser-Modus, um RAM/Cloudflare nicht zu triggern
    cm_workers = int(settings.get('max_workers', 2)) if int(settings.get('max_workers', 2)) <= 4 else 2 
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=cm_workers) as executor:
        futures = [executor.submit(_fetch_cardmarket, c, float(settings['delay_seconds']), bool(settings['headless']), proxy_str) for c in cm_vip_cards]
        for i, f in enumerate(concurrent.futures.as_completed(futures)):
            final_results.append(f.result())
            if (i+1) % 50 == 0: save_prices(final_results, prices_csv)
            
    save_prices(final_results, prices_csv)
    logger.info("="*60)
    logger.info("SUCCESS: Two-Phase Price Update complete!")
    logger.info("="*60)

if __name__ == "__main__":
    main()
