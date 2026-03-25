#!/usr/bin/env python3
"""
Card Price Scraper - HYBRID STEALTH EDITION (V3 - Precise Matching)
==================================================================
- Nutzt Meta-Daten & Raritäten, um CM-Anfragen zu minimieren.
- High-Rares & Playables: Cardmarket (SeleniumBase UC + Proxy).
- Rest (C, U, R): Präziser Set-Match via Limitless TCG.
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
    print("FEHLER: Fehlende Bibliotheken! pip install seleniumbase beautifulsoup4 requests")
    sys.exit(1)

from card_scraper_shared import setup_console_encoding, get_data_dir, setup_logging, load_settings

setup_console_encoding()
_request_semaphore = threading.Semaphore(2) 
logger = setup_logging("price_scraper")

def _load_settings() -> dict:
    return load_settings("card_price_scraper_settings.json", {"delay_seconds": 5.0, "max_workers": 2, "headless": True})

def load_cards_to_update(csv_path: str) -> list:
    if not os.path.isfile(csv_path): return []
    cards = []
    with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = (row.get("name_en") or row.get("name") or "").strip()
            cards.append({
                "name": name, "set": row.get("set", ""), "number": row.get("number", ""),
                "cardmarket_url": row.get("cardmarket_url", ""), "card_url": row.get("card_url", "")
            })
    return cards

def _parse_cardmarket_price(html: str, card_id: str) -> str:
    soup = BeautifulSoup(html, "lxml")
    for dt in soup.find_all("dt"):
        label = dt.get_text(strip=True).lower()
        if label in ("from", "ab"):
            dd = dt.find_next_sibling("dd")
            if dd:
                text = dd.get_text(strip=True)
                if ("EUR" in text or "€" in text) and "£" not in text:
                    logger.info("  + CM Ab-Preis [%s]: %s", card_id, text)
                    return text
    return ""

def _fetch_single_price(card: dict, base_delay: float, is_headless: bool, force_limitless: bool) -> dict:
    card_id = f"{card['set']}-{card['number']}"
    eur_price = ""
    cm_url = card.get("cardmarket_url", "")
    proxy_host_port = "geo.iproyal.com:12321"


    with _request_semaphore:
        if not force_limitless and cm_url:
            target_url = cm_url + ("&language=1,3" if "?" in cm_url else "?language=1,3")
            for attempt in range(2):
                driver = None
                try:
                    driver = Driver(uc=True, proxy=proxy_host_port, headless=is_headless)
                    try:
                        driver.get(target_url)
                        time.sleep(base_delay + random.uniform(2.0, 4.0))
                        eur_price = _parse_cardmarket_price(driver.page_source, card_id)
                        if eur_price:
                            break
                    except Exception as e:
                        logger.debug("  CM Fehler: %s", e)
                    finally:
                        if driver:
                            driver.quit()

        if not eur_price:
            try:
                lt_url = f"https://limitlesstcg.com{card['card_url']}" if card.get("card_url") else f"https://limitlesstcg.com/cards/{card['set']}/{card['number']}"
                resp = std_requests.get(lt_url, timeout=10)
                if resp.status_code == 200:
                    soup = BeautifulSoup(resp.text, "lxml")
                    prints_table = soup.select_one("table.card-prints-versions")
                    if prints_table:
                        for row in prints_table.select("tr"):
                            row_text = row.get_text().lower()
                            if card['set'].lower() in row_text:
                                eur_link = row.select_one("a.card-price.eur")
                                if eur_link:
                                    eur_price = eur_link.get_text(strip=True)
                                    logger.info("  + LT %s [%s]: %s (Set-Match: %s)", 
                                                "Fallback" if not force_limitless else "Direkt", 
                                                card_id, eur_price, card['set'])
                                    break
                    if not eur_price:
                        first_price = soup.select_one("a.card-price.eur")
                        if first_price: eur_price = first_price.get_text(strip=True)
            except: pass

    return {**card, "eur_price": eur_price, "last_updated": datetime.now().isoformat()}

def save_prices(prices: list, csv_path: str):
    existing = {}
    if os.path.isfile(csv_path):
        with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                if not row: continue
                key = f"{row.get('set', '')}_{row.get('number', '')}"
                existing[key] = row

    for p in prices:
        key = f"{p.get('set', '')}_{p.get('number', '')}"
        if p.get("eur_price"): existing[key] = p          

    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["name", "set", "number", "eur_price", "cardmarket_url", "last_updated"], extrasaction="ignore")
        writer.writeheader()
        for k in sorted(existing.keys()): writer.writerow(existing[k])

def scrape_prices(cards: list, settings: dict, csv_path: str) -> list:

    playable_names = set()
    data_dir = get_data_dir()
    meta_path = os.path.join(data_dir, "meta_data.json")
    # Check ob Meta-Daten da sind
    if os.path.exists(meta_path):
        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                meta = json.load(f)
                for deck in meta.get("decks", []):
                    for c in deck.get("cards", []): 
                        playable_names.add(c.get("name", "").lower().strip())
            logger.info("  -> %s spielbare Karten aus Meta-Analyse geladen.", len(playable_names))
        except Exception as e:
            logger.error("  ! Fehler beim Lesen der meta_data.json: %s", e)
    else:
        logger.warning("  ! meta_data.json NICHT GEFUNDEN. Bitte erst Punkt [5] ausfuehren!")

    to_process = []
    for card in cards:
        c_name = card['name'].lower().strip()
        c_num = card['number'].upper()
        # 1. Erweiterter High-Rare Check (SIR, Gold, EX, V, Illustration Rares)
        # Wir triggern CM wenn die Nummer Buchstaben enthaelt oder ueber 160 liegt
        is_high_rare = any(x in c_num for x in ["SIR", "GG", "TG", "SV", "AR", "FA", "EX", "VSTAR", "PROMO"]) or \
                       (c_num.count('/') > 0 and int(c_num.split('/')[0]) > 160)
        # 2. Playable Check
        is_playable = c_name in playable_names
        # Wenn es eine wichtige Karte ist -> Cardmarket (force_lt = False)
        # Sonst -> Limitless (force_lt = True)
        force_lt = not (is_high_rare or is_playable)
        # DEBUG fuer dich: Wenn ASC-10 trotzdem zu LT geht, wissen wir warum
        if "ASC-10" in f"{card['set']}-{card['number']}":
            logger.info("  [DEBUG ASC-10] High-Rare: %s, Playable: %s -> CM: %s", is_high_rare, is_playable, not force_lt)
        to_process.append((card, force_lt))

    results = []
    logger.info("Starte Hybrid-Scraping (Match-Edition): %s Karten.", len(to_process))
    with concurrent.futures.ThreadPoolExecutor(max_workers=int(settings['max_workers'])) as executor:
        futures = [executor.submit(_fetch_single_price, c, float(settings['delay_seconds']), bool(settings['headless']), flt) for c, flt in to_process]
        for i, f in enumerate(concurrent.futures.as_completed(futures)):
            results.append(f.result())
            if (i+1) % 50 == 0: save_prices(results, csv_path)
    return results

def main():
    settings = _load_settings()
    data_dir = get_data_dir()
    cards_csv = os.path.join(data_dir, "all_cards_database.csv")
    prices_csv = os.path.join(data_dir, "price_data.csv")
    cards = load_cards_to_update(cards_csv)
    if cards:
        results = scrape_prices(cards, settings, prices_csv)
        save_prices(results, prices_csv)
    logger.info("SUCCESS: Price update complete!")

if __name__ == "__main__":
    main()
