#!/usr/bin/env python3
"""
Card Price Scraper - FAST EDITION
==================================
- Fetches 7-day average prices directly from Cardmarket using targeted HTML parsing.
- Uses cloudscraper to bypass basic Cloudflare protection without Selenium.
- Multithreaded, but rate-limited to prevent IP bans (default: 2 workers).
- Fallback: Limitless TCG if Cardmarket is blocked or unavailable.
- Supports name_en/name_de CSV format from the new all_cards_scraper.
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
    import cloudscraper
    from bs4 import BeautifulSoup
except ImportError:
    print("FEHLER: Bibliotheken fehlen! Bitte installiere:")
    print("  pip install cloudscraper beautifulsoup4")
    sys.exit(1)

from card_scraper_shared import setup_console_encoding, get_app_path, get_data_dir

setup_console_encoding()

# LOGGING
data_dir = get_data_dir()
os.makedirs(data_dir, exist_ok=True)
log_file = os.path.join(data_dir, "price_scraper.log")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.FileHandler(log_file, encoding="utf-8"),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

logger.info("=" * 80)
logger.info("CARD PRICE SCRAPER - FAST EDITION")
logger.info("=" * 80)

# SETTINGS
DEFAULT_SETTINGS = {
    "delay_seconds": 1.5,        # Base delay per request (+ random 0.1-0.8s jitter)
    "max_workers": 2,            # KEEP LOW (2-3 max) to avoid Cardmarket IP bans
    "skip_cards_with_prices": True,
    "only_update_sets": [],      # [] = all sets, or e.g. ["TWM", "SFA"]
    "max_runtime_minutes": None, # Optional time cap for GitHub Actions
}

def load_settings() -> dict:
    settings = DEFAULT_SETTINGS.copy()
    app_path = get_app_path()
    candidates = [
        os.path.join(app_path, "card_price_scraper_settings.json"),
        os.path.join(os.getcwd(), "card_price_scraper_settings.json"),
        os.path.join(app_path, "data", "card_price_scraper_settings.json"),
    ]
    for path in candidates:
        if os.path.isfile(path):
            try:
                with open(path, "r", encoding="utf-8-sig") as f:
                    settings.update(json.loads(f.read()))
                logger.info(f"Settings geladen: {path}")
                return settings
            except Exception as e:
                logger.warning(f"Settings konnten nicht geladen werden: {e}")
    logger.info("Keine Settings-Datei gefunden. Nutze Standardwerte.")
    return settings


# DATA LOADING
def load_cards_to_update(csv_path: str) -> list:
    if not os.path.isfile(csv_path):
        logger.error(f"{csv_path} nicht gefunden!")
        return []

    cards = []
    with open(csv_path, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if not row:
                continue
            # Compatible with both old (name) and new (name_en) CSV formats
            name = (row.get("name_en") or row.get("name") or "").strip()
            cards.append({
                "name": name,
                "set": (row.get("set") or "").strip(),
                "number": (row.get("number") or "").strip(),
                "cardmarket_url": (row.get("cardmarket_url") or "").strip(),
                "card_url": (row.get("card_url") or "").strip(),
            })

    logger.info(f"Lade {len(cards)} Karten aus der Datenbank.")
    return cards


def load_existing_prices(csv_path: str) -> dict:
    if not os.path.isfile(csv_path):
        return {}

    prices = {}
    with open(csv_path, "r", encoding="utf-8", newline="") as f:
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
    Only overwrites a row when a non-empty price was found; otherwise keeps existing data.
    """
    existing = {}
    if os.path.isfile(csv_path):
        with open(csv_path, "r", encoding="utf-8", newline="") as f:
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
            existing[key] = price          # overwrite with fresh data
        elif key not in existing:
            existing[key] = price           # add entry even without price

    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        fieldnames = ["name", "set", "number", "eur_price", "cardmarket_url", "last_updated"]
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for key in sorted(existing.keys()):
            writer.writerow(existing[key])

    logger.info(f"+ {len(existing)} Preise gespeichert in {csv_path}")


# SCRAPING LOGIC
_thread_local = threading.local()

def _get_scraper() -> "cloudscraper.CloudScraper":
    """Each thread gets its own CloudScraper instance (thread-safe)."""
    if not hasattr(_thread_local, "scraper"):
        _thread_local.scraper = cloudscraper.create_scraper(
            browser={"browser": "chrome", "platform": "windows", "mobile": False}
        )
    return _thread_local.scraper


def _parse_cardmarket_price(html: str, card_id: str) -> str:
    """
    Extract EUR price from Cardmarket HTML.
    Priority: 7-day average > 30-day average > From price (EUR only).
    """
    soup = BeautifulSoup(html, "html.parser")
    dt_elements = soup.find_all("dt")

    # Priority 1: 7-day average (German or English label)
    for dt in dt_elements:
        label = dt.get_text(strip=True).lower()
        if "7-tages" in label or "7-days" in label or "7-day" in label:
            dd = dt.find_next_sibling("dd")
            if dd:
                text = dd.get_text(strip=True)
                if "EUR" in text or "€" in text:
                    logger.info(f"  + CM 7-day avg [{card_id}]: {text}")
                    return text

    # Priority 2: 30-day average
    for dt in dt_elements:
        label = dt.get_text(strip=True).lower()
        if "30-tages" in label or "30-days" in label or "30-day" in label:
            dd = dt.find_next_sibling("dd")
            if dd:
                text = dd.get_text(strip=True)
                if "EUR" in text or "€" in text:
                    logger.info(f"  + CM 30-day avg [{card_id}]: {text}")
                    return text

    # Priority 3: From / Ab price (EUR only — not GBP/USD)
    for dt in dt_elements:
        label = dt.get_text(strip=True).lower()
        if label in ("from", "ab"):
            dd = dt.find_next_sibling("dd")
            if dd:
                text = dd.get_text(strip=True)
                if ("EUR" in text or "€" in text) and "£" not in text and "$" not in text:
                    logger.info(f"  + CM From price [{card_id}]: {text}")
                    return text

    return ""


def _fetch_single_price(card: dict, base_delay: float) -> dict:
    """Fetch price for one card: tries Cardmarket first, then Limitless as fallback."""
    scraper  = _get_scraper()
    card_id  = f"{card['set']}-{card['number']}"
    eur_price = ""
    cm_url   = card.get("cardmarket_url", "")

    # Anti-ban: randomised delay so requests look human
    time.sleep(base_delay + random.uniform(0.1, 0.8))

    # Strategy 1: Cardmarket (direct 7-day average)
    if cm_url:
        try:
            resp = scraper.get(cm_url, timeout=20)
            if resp.status_code == 200:
                eur_price = _parse_cardmarket_price(resp.text, card_id)
            elif resp.status_code == 403:
                logger.warning(f"  ! Cloudflare 403 bei CM [{card_id}] — versuche Limitless")
            else:
                logger.debug(f"  CM HTTP {resp.status_code} fuer {card_id}")
        except Exception as e:
            logger.debug(f"  CM Fehler fuer {card_id}: {e}")

    # Strategy 2: Limitless TCG fallback (also refreshes CM URL if missing)
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

            resp = scraper.get(lt_url, timeout=15)
            if resp.status_code == 200:
                soup = BeautifulSoup(resp.text, "html.parser")
                table = soup.select_one("table.card-prints-versions")
                if table:
                    # ROBUST: Vermeidet BeautifulSoup tbody-Verschluck-Bug
                    for row in [tr for tr in table.select("tr") if tr.find("td")]:
                        if "current" in row.get("class", []):
                            eur_link = row.select_one("a.card-price.eur")
                            if eur_link:
                                eur_price = eur_link.get_text(strip=True)
                                # Update CM URL if we didn't have it or want to refresh
                                if not cm_url and eur_link.has_attr("href"):
                                    cm_url = eur_link["href"]
                                logger.info(f"  + LT fallback [{card_id}]: {eur_price}")
                                break
        except Exception as e:
            logger.debug(f"  LT Fallback Fehler fuer {card_id}: {e}")

    if not eur_price:
        logger.debug(f"  x Kein Preis gefunden [{card_id}]")

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

    logger.info(f"Starte Preis-Scraping ({max_workers} Thread(s), {base_delay}s Base-Delay)")

    results          = []
    cards_to_process = []

    for card in cards:
        key = f"{card['set']}_{card['number']}"

        # Set filter: keep/skip cards not in only_sets
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

        # Skip if price already exists
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

            # Graceful time-limit (for GitHub Actions)
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
                logger.error(f"Thread-Fehler: {exc}")
                results.append(future_to_card[future])

            if completed % 50 == 0:
                logger.info(f"  Fortschritt: {completed}/{len(cards_to_process)} Preise aktualisiert ...")
                save_prices(results, csv_path)

    return results


# MAIN
def main():
    try:
        settings   = load_settings()
        cards_csv  = os.path.join(data_dir, "all_cards_database.csv")
        prices_csv = os.path.join(data_dir, "price_data.csv")

        logger.info(f"Input:  {os.path.abspath(cards_csv)}")
        logger.info(f"Output: {os.path.abspath(prices_csv)}")

        cards = load_cards_to_update(cards_csv)
        if not cards:
            logger.warning("Keine Karten gefunden. Beende.")
            return

        existing_prices = load_existing_prices(prices_csv)
        logger.info(f"Vorhandene Preise in price_data.csv: {len(existing_prices)}")

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
