#!/usr/bin/env python3
"""
Card Price Scraper - FAST EDITION (curl_cffi + IPRoyal)
========================================================
- Fetches prices directly from Cardmarket using targeted HTML parsing.
- Uses curl_cffi to perfectly impersonate a Chrome browser and bypass Cloudflare.
- Routes traffic through IPRoyal Residential Proxies.
- Fallback: Limitless TCG if Cardmarket is blocked or unavailable.
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
except ImportError:
    print("FEHLER: beautifulsoup4 fehlt! pip install beautifulsoup4")
    sys.exit(1)

try:
    from curl_cffi import requests as curl_requests
except ImportError:
    print("FEHLER: curl_cffi fehlt! pip install curl_cffi")
    sys.exit(1)

from card_scraper_shared import setup_console_encoding, get_app_path, get_data_dir, setup_logging, load_settings

setup_console_encoding()

# Shared rate limiter: Auf 10 erhoeht, da wir rotierende Proxies nutzen
_request_semaphore = threading.Semaphore(10)

# LOGGING
logger = setup_logging("price_scraper")

logger.info("=" * 80)
logger.info("CARD PRICE SCRAPER - FAST EDITION (STEALTH MODE)")
logger.info("=" * 80)

# SETTINGS
DEFAULT_SETTINGS = {
    "delay_seconds": 3.0,        
    "max_workers": 2,            
    "skip_cards_with_prices": True,
    "only_update_sets": [],      
    "max_runtime_minutes": None, 
}

def _load_settings() -> dict:
    return load_settings("card_price_scraper_settings.json", DEFAULT_SETTINGS)


# DATA LOADING
def load_cards_to_update(csv_path: str) -> list:
    if not os.path.isfile(csv_path):
        logger.error("%s nicht gefunden!", csv_path)
        return []

    cards = []
    with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if not row:
                continue
            name = (row.get("name_en") or row.get("name") or "").strip()
            cards.append({
                "name": name,
                "set": (row.get("set") or "").strip(),
                "number": (row.get("number") or "").strip(),
                "cardmarket_url": (row.get("cardmarket_url") or "").strip(),
                "card_url": (row.get("card_url") or "").strip(),
            })

    logger.info("Lade %s Karten aus der Datenbank.", len(cards))
    return cards


def load_existing_prices(csv_path: str) -> dict:
    if not os.path.isfile(csv_path):
        return {}

    prices = {}
    with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if not row:
                continue
            key = f"{row.get('set', '')}_{row.get('number', '')}"
            prices[key] = {
                "eur_price": (row.get("eur_price") or "").strip(),
                "last_updated": (row.get("last_updated") or "").strip(),
            }
    return prices


def save_prices(prices: list, csv_path: str):
    """
    Merge new prices into existing price_data.csv.
    """
    existing = {}
    if os.path.isfile(csv_path):
        with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                if not row:
                    continue
                key = f"{row.get('set', '')}_{row.get('number', '')}"
                existing[key] = {
                    "name": row.get("name", ""),
                    "set": row.get("set", ""),
                    "number": row.get("number", ""),
                    "eur_price": row.get("eur_price", ""),
                    "cardmarket_url": row.get("cardmarket_url", ""),
                    "last_updated": row.get("last_updated", ""),
                }

    for price in prices:
        key = f"{price.get('set', '')}_{price.get('number', '')}"
        new_price = (price.get("eur_price") or "").strip()
        if new_price:
            existing[key] = price          
        elif key not in existing:
            existing[key] = price           

    tmp_path = csv_path + '.tmp'
    with open(tmp_path, "w", encoding="utf-8", newline="") as f:
        fieldnames = ["name", "set", "number", "eur_price", "cardmarket_url", "last_updated"]
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for key in sorted(existing.keys()):
            writer.writerow(existing[key])
    os.replace(tmp_path, csv_path)

    logger.info("+ %s Preise gespeichert in %s", len(existing), csv_path)


# SCRAPING LOGIC
def _parse_cardmarket_price(html: str, card_id: str) -> str:
    """
    Extract EUR price from Cardmarket HTML.
    Priority 1: From / Ab price (gefiltert nach EN/DE).
    """
    soup = BeautifulSoup(html, "lxml")
    dt_elements = soup.find_all("dt")

    # Priority 1: From / Ab price 
    for dt in dt_elements:
        label = dt.get_text(strip=True).lower()
        if label in ("from", "ab"):
            dd = dt.find_next_sibling("dd")
            if dd:
                text = dd.get_text(strip=True)
                if ("EUR" in text or "€" in text) and "£" not in text and "$" not in text:
                    logger.info("  + CM Ab-Preis (EN/DE) [%s]: %s", card_id, text)
                    return text

    # Priority 2: 7-day average 
    for dt in dt_elements:
        label = dt.get_text(strip=True).lower()
        if "7-tages" in label or "7-days" in label or "7-day" in label:
            dd = dt.find_next_sibling("dd")
            if dd:
                text = dd.get_text(strip=True)
                if "EUR" in text or "€" in text:
                    logger.info("  + CM 7-day avg [%s]: %s", card_id, text)
                    return text

    # Priority 3: 30-day average
    for dt in dt_elements:
        label = dt.get_text(strip=True).lower()
        if "30-tages" in label or "30-days" in label or "30-day" in label:
            dd = dt.find_next_sibling("dd")
            if dd:
                text = dd.get_text(strip=True)
                if "EUR" in text or "€" in text:
                    logger.info("  + CM 30-day avg [%s]: %s", card_id, text)
                    return text

    return ""


def _fetch_single_price(card: dict, base_delay: float) -> dict:
    """Fetch price for one card using curl_cffi and IPRoyal with retry loop."""
    card_id  = f"{card['set']}-{card['number']}"
    eur_price = ""
    cm_url   = card.get("cardmarket_url", "")
    max_retries = 3 # Wir versuchen es bis zu 3 Mal mit verschiedenen IPs!

    # DEINE IPROYAL RESIDENTIAL PROXY DATEN
    proxy_url = "http://SUdFKMiObiweTnv4:cMWlX3fJZjRohu7K@geo.iproyal.com:12321"
    proxies = {
        "http": proxy_url,
        "https": proxy_url
    }

    with _request_semaphore:
        # Strategy 1: Cardmarket via curl_cffi (Chrome Stealth) + Proxy
        if cm_url:
            if "?" in cm_url:
                target_url = cm_url + "&language=1,3"
            else:
                target_url = cm_url + "?language=1,3"

            for attempt in range(max_retries):
                # Kleines Delay, damit wir Cloudflare nicht überrennen
                time.sleep(random.uniform(0.5, 1.5))
                
                try:
                    # MAGIC: Spezifische, stabile Chrome Version vortäuschen
                    resp = curl_requests.get(
                        target_url, 
                        proxies=proxies, 
                        impersonate="chrome120", 
                        timeout=20
                    )
                    
                    if resp.status_code == 200:
                        eur_price = _parse_cardmarket_price(resp.text, card_id)
                        if eur_price:
                            break # ERFOLG! Wir springen aus der Retry-Schleife raus.
                    elif resp.status_code in (429, 503):
                        retry_after = int(resp.headers.get('Retry-After', 5))
                        time.sleep(retry_after)
                    elif resp.status_code == 403:
                        if attempt < max_retries - 1:
                            logger.debug("  ~ 403 bei CM [%s] (Versuch %s/%s) - Hole neue IP...", card_id, attempt+1, max_retries)
                        else:
                            logger.warning("  ! Cloudflare 403 bei CM [%s] nach %s Versuchen — Limitless Fallback", card_id, max_retries)
                except Exception as e:
                    if attempt >= max_retries - 1:
                        logger.debug("  CM Fehler fuer %s: %s", card_id, e)

        # Strategy 2: Limitless TCG fallback (no proxy)
        if not eur_price:
            try:
                if card.get("card_url"):
                    lt_url = (
                        f"https://limitlesstcg.com{card['card_url']}"
                        if card["card_url"].startswith("/")
                        else card["card_url"]
                    )
                else:
                    lt_url = f"https://limitlesstcg.com/cards/{card['set']}/{card['number']}"

                import requests as std_requests
                resp = std_requests.get(lt_url, timeout=15) 
                
                if resp.status_code == 200:
                    soup = BeautifulSoup(resp.text, "lxml")
                    table = soup.select_one("table.card-prints-versions")
                    if table:
                        for row in [tr for tr in table.select("tr") if tr.find("td")]:
                            if "current" in row.get("class", []):
                                eur_link = row.select_one("a.card-price.eur")
                                if eur_link:
                                    eur_price = eur_link.get_text(strip=True)
                                    if not cm_url and eur_link.has_attr("href"):
                                        cm_url = eur_link["href"]
                                    logger.info("  + LT fallback [%s]: %s", card_id, eur_price)
                                    break
            except Exception as e:
                logger.debug("  LT Fallback Fehler fuer %s: %s", card_id, e)

    if not eur_price:
        logger.debug("  x Kein Preis gefunden [%s]", card_id)

    return {
        "name": card["name"],
        "set": card["set"],
        "number": card["number"],
        "eur_price": eur_price,
        "cardmarket_url": cm_url,
        "last_updated": datetime.now().isoformat(),
    }


def scrape_prices(cards: list, settings: dict, existing_prices: dict, csv_path: str) -> list:
    max_workers  = int(settings.get("max_workers", 2))
    base_delay   = float(settings.get("delay_seconds", 1.5))
    skip_existing = bool(settings.get("skip_cards_with_prices", True))
    only_sets    = settings.get("only_update_sets", [])
    max_runtime  = settings.get("max_runtime_minutes", None)
    scrape_start = time.time()

    logger.info("Starte Preis-Scraping (%s Thread(s), %ss Base-Delay)", max_workers, base_delay)

    results          = []
    cards_to_process = []

    for card in cards:
        key = f"{card['set']}_{card['number']}"

        if only_sets and card["set"] not in only_sets:
            if key in existing_prices:
                results.append({
                    "name": card["name"],
                    "set": card["set"],
                    "number": card["number"],
                    "eur_price": existing_prices[key].get("eur_price", ""),
                    "cardmarket_url": card.get("cardmarket_url", ""),
                    "last_updated": existing_prices[key].get("last_updated", ""),
                })
            continue

        if skip_existing and key in existing_prices and existing_prices[key].get("eur_price"):
            results.append({
                "name": card["name"],
                "set": card["set"],
                "number": card["number"],
                "eur_price": existing_prices[key]["eur_price"],
                "cardmarket_url": card.get("cardmarket_url", ""),
                "last_updated": existing_prices[key].get("last_updated", ""),
            })
            continue

        cards_to_process.append(card)

    logger.info(
        f"{len(cards_to_process)} Preise werden live abgerufen "
        f"({len(results)} uebersprungen/gefiltert)."
    )

    if not cards_to_process:
        return results

    completed = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_card = {
            executor.submit(_fetch_single_price, card, base_delay): card
            for card in cards_to_process
        }

        for future in concurrent.futures.as_completed(future_to_card):
            completed += 1

            if max_runtime:
                elapsed = (time.time() - scrape_start) / 60
                if elapsed >= max_runtime:
                    logger.info(
                        f"Zeitlimit {max_runtime} min erreicht ({elapsed:.1f} min). "
                        f"Speichere Fortschritt und beende sauber..."
                    )
                    save_prices(results, csv_path)
                    executor.shutdown(wait=False, cancel_futures=True)
                    return results

            try:
                results.append(future.result())
            except Exception as exc:
                logger.error("Thread-Fehler: %s", exc)
                results.append(future_to_card[future])

            if completed % 50 == 0:
                logger.info("  Fortschritt: %s/%s Preise aktualisiert ...", completed, len(cards_to_process))
                save_prices(results, csv_path)

    return results


def main():
    try:
        settings   = _load_settings()
        data_dir   = get_data_dir()
        cards_csv  = os.path.join(data_dir, "all_cards_database.csv")
        prices_csv = os.path.join(data_dir, "price_data.csv")

        logger.info("Input:  %s", os.path.abspath(cards_csv))
        logger.info("Output: %s", os.path.abspath(prices_csv))

        cards = load_cards_to_update(cards_csv)
        if not cards:
            logger.warning("Keine Karten gefunden. Beende.")
            return

        existing_prices = load_existing_prices(prices_csv)
        logger.info("Vorhandene Preise in price_data.csv: %s", len(existing_prices))

        logger.info("=" * 60)
        logger.info("PHASE 1: PREISE SCRAPEN")
        logger.info("=" * 60)
        all_prices = scrape_prices(cards, settings, existing_prices, prices_csv)

        logger.info("=" * 60)
        logger.info("PHASE 2: SPEICHERN")
        logger.info("=" * 60)
        save_prices(all_prices, prices_csv)

        logger.info("=" * 80)
        logger.info("SUCCESS: Price update complete!")
        logger.info("=" * 80)

    except Exception as e:
        logger.critical(f"KRITISCHER FEHLER - Price Scraper abgebrochen: {e}", exc_info=True)


if __name__ == "__main__":
    main()
