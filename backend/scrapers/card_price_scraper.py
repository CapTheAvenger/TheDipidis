#!/usr/bin/env python3
"""
Card Price Scraper - Limitless TCG Only (V5)
=============================================
- Scraped Preise ausschliesslich von Limitless TCG.
- Kein Cardmarket, kein Selenium, kein Proxy.
- Einfacher requests-basierter Scraper mit Set-Matching.
"""

import csv
import os
import sys
import time
import logging
import concurrent.futures
from datetime import datetime

try:
    from bs4 import BeautifulSoup
    import requests as std_requests
except ImportError:
    print("FEHLER: Bibliotheken fehlen! pip install beautifulsoup4 requests lxml")
    sys.exit(1)

from card_scraper_shared import setup_console_encoding, get_data_dir, setup_logging, load_settings

setup_console_encoding()
logger = setup_logging("price_scraper")


def _load_settings() -> dict:
    return load_settings("card_price_scraper_settings.json", {
        "delay_seconds": 1.5,
        "max_workers": 4,
        "batch_size": 100,
        "skip_cards_with_prices": False,
        "only_update_sets": []
    })


def load_cards_to_update(csv_path: str) -> list:
    if not os.path.isfile(csv_path):
        return []
    cards = []
    with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = (row.get("name_en") or row.get("name") or "").strip()
            cards.append({
                "name": name,
                "set": row.get("set", ""),
                "number": row.get("number", ""),
                "cardmarket_url": row.get("cardmarket_url", ""),
                "card_url": row.get("card_url", ""),
            })
    return cards


def _fetch_single_price(card: dict, base_delay: float) -> dict:
    """Fetch price from Limitless TCG only."""
    card_id = f"{card['set']}-{card['number']}"
    eur_price = ""

    try:
        lt_url = (
            f"https://limitlesstcg.com{card['card_url']}"
            if card.get("card_url")
            else f"https://limitlesstcg.com/cards/{card['set']}/{card['number']}"
        )
        resp = std_requests.get(lt_url, timeout=12, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        })
        if resp.status_code == 200:
            soup = BeautifulSoup(resp.text, "lxml")
            prints_table = soup.select_one("table.card-prints-versions")
            if prints_table:
                # Best match: the row with class="current" IS this card's print
                current_row = prints_table.select_one("tr.current")
                if current_row:
                    eur_link = current_row.select_one("a.card-price.eur")
                    if eur_link:
                        eur_price = eur_link.get_text(strip=True)
                        logger.info("  + LT Preis [%s]: %s (Current-Row)", card_id, eur_price)
                # Fallback: match by card number in <span class="prints-table-card-number">
                if not eur_price:
                    for row in prints_table.select("tr"):
                        num_span = row.select_one("span.prints-table-card-number")
                        if num_span and num_span.get_text(strip=True) == f"#{card['number']}":
                            eur_link = row.select_one("a.card-price.eur")
                            if eur_link:
                                eur_price = eur_link.get_text(strip=True)
                                logger.info("  + LT Preis [%s]: %s (Nr-Span-Match)", card_id, eur_price)
                                break
            # Last resort: use the main card price shown on the page header
            # (outside the prints table), which corresponds to THIS specific card.
            if not eur_price:
                main_price = soup.select_one(".card-price-main a.card-price.eur, .card-detail-prices a.card-price.eur")
                if main_price:
                    eur_price = main_price.get_text(strip=True)
                    logger.info("  + LT Preis [%s]: %s (Main-Card)", card_id, eur_price)
            if not eur_price:
                logger.info("  - LT kein Preis [%s] (Seite geladen, kein EUR-Match)", card_id)
        else:
            logger.info("  - LT HTTP %s fuer [%s]", resp.status_code, card_id)
    except Exception as e:
        logger.info("  - LT Fehler [%s]: %s", card_id, e)

    time.sleep(base_delay)

    return {**card, "eur_price": eur_price, "last_updated": datetime.now().isoformat()}


def save_prices(prices: list, csv_path: str):
    existing = {}
    if os.path.isfile(csv_path):
        with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                if not row:
                    continue
                key = f"{row.get('set', '')}_{row.get('number', '')}"
                existing[key] = row

    for p in prices:
        key = f"{p.get('set', '')}_{p.get('number', '')}"
        if p.get("eur_price"):
            existing[key] = p

    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["name", "set", "number", "eur_price", "cardmarket_url", "last_updated"],
            extrasaction="ignore",
        )
        writer.writeheader()
        for k in sorted(existing.keys()):
            writer.writerow(existing[k])


def scrape_prices(cards: list, settings: dict, csv_path: str) -> list:
    only_sets = settings.get("only_update_sets", [])
    if only_sets:
        only_sets_lower = [s.lower() for s in only_sets]
        cards = [c for c in cards if c["set"].lower() in only_sets_lower]
        logger.info("  -> Gefiltert auf Sets: %s (%s Karten)", only_sets, len(cards))

    if settings.get("skip_cards_with_prices"):
        prices_csv = csv_path
        existing_keys = set()
        if os.path.isfile(prices_csv):
            with open(prices_csv, "r", encoding="utf-8-sig", newline="") as f:
                for row in csv.DictReader(f):
                    if row.get("eur_price"):
                        existing_keys.add(f"{row.get('set', '')}_{row.get('number', '')}")
        before = len(cards)
        cards = [c for c in cards if f"{c['set']}_{c['number']}" not in existing_keys]
        logger.info("  -> Ueberspringe %s Karten mit vorhandenen Preisen.", before - len(cards))

    if not cards:
        logger.info("Keine Karten zu verarbeiten.")
        return []

    results = []
    delay = float(settings.get("delay_seconds", 1.5))
    workers = min(int(settings.get("max_workers", 4)), 6)
    batch_size = int(settings.get("batch_size", 100))

    logger.info("Starte Limitless-Scraping: %s Karten (%s Workers, %.1fs Delay).", len(cards), workers, delay)

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
        futures = [executor.submit(_fetch_single_price, c, delay) for c in cards]
        for i, f in enumerate(concurrent.futures.as_completed(futures)):
            results.append(f.result())
            if (i + 1) % batch_size == 0:
                save_prices(results, csv_path)
                logger.info("  -> Zwischenspeichern nach %s Karten.", i + 1)

    return results


def main():
    settings = _load_settings()
    data_dir = get_data_dir()
    cards_csv = os.path.join(data_dir, "all_cards_database.csv")
    prices_csv = os.path.join(data_dir, "price_data.csv")

    logger.info("=" * 60)
    logger.info("Card Price Scraper - Limitless TCG Only (V5)")
    logger.info("=" * 60)

    cards = load_cards_to_update(cards_csv)
    logger.info("Geladene Karten: %s", len(cards))

    if cards:
        results = scrape_prices(cards, settings, prices_csv)
        save_prices(results, prices_csv)
        found = sum(1 for r in results if r.get("eur_price"))
        logger.info("Preise gefunden: %s / %s", found, len(results))

    logger.info("SUCCESS: Price update complete!")


if __name__ == "__main__":
    main()
