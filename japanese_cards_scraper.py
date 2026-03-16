#!/usr/bin/env python3
"""
Japanese Cards Scraper - FAST EDITION
=====================================
Scrapes LATEST Japanese Pokemon Cards from Limitless TCG.
- Uses cloudscraper for Cloudflare bypass.
- Uses BeautifulSoup4 for lightning-fast parsing.
- Uses ThreadPoolExecutor for concurrent detail fetching.
- Keeps only the N most recent sets + promos.
"""

import csv
import json
import os
import sys
import time
import logging
import threading
import concurrent.futures
from datetime import datetime
from typing import List, Dict, Set, Tuple

try:
    import cloudscraper
    from bs4 import BeautifulSoup
except ImportError:
    print("FEHLER: Es fehlen Bibliotheken! Bitte installiere sie mit:")
    print("pip install cloudscraper beautifulsoup4")
    sys.exit(1)

from card_scraper_shared import setup_console_encoding
setup_console_encoding()

# ============================================================================
# LOGGING SETUP
# ============================================================================
def get_data_dir() -> str:
    if getattr(sys, "frozen", False):
        app_dir = os.path.dirname(sys.executable)
        if app_dir.endswith("dist"):
            return os.path.join(app_dir, "..", "data")
    return "data"

data_dir = get_data_dir()
os.makedirs(data_dir, exist_ok=True)
log_file = os.path.join(data_dir, "japanese_cards_scraper.log")

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

# ============================================================================
# SETTINGS
# ============================================================================
DEFAULT_SETTINGS = {
    "max_pages": 50,
    "list_page_delay_seconds": 0.5,
    "max_workers": 8,
    "keep_latest_sets": 4,
    "skip_detail_scraping": False
}

def load_settings() -> dict:
    settings_path = 'japanese_cards_scraper_settings.json'
    settings = DEFAULT_SETTINGS.copy()
    if os.path.exists(settings_path):
        try:
            with open(settings_path, 'r', encoding='utf-8-sig') as f:
                settings.update(json.load(f))
            logger.info(f"Settings geladen aus {settings_path}")
        except Exception as e:
            logger.warning(f"Konnte Settings nicht laden: {e}")
    else:
        logger.info("Nutze Standard-Settings.")
    return settings

SETTINGS = load_settings()

logger.info("=" * 80)
logger.info(f"JAPANESE CARDS SCRAPER - Lade die neusten {SETTINGS['keep_latest_sets']} JP Sets")
logger.info("=" * 80)

# ============================================================================
# NETWORK UTILS
# ============================================================================
_thread_local = threading.local()

def _get_scraper() -> cloudscraper.CloudScraper:
    if not hasattr(_thread_local, "scraper"):
        _thread_local.scraper = cloudscraper.create_scraper(
            browser={"browser": "chrome", "platform": "windows", "mobile": False}
        )
    return _thread_local.scraper

def fetch_page_bs4(url: str, retries: int = 3):
    scraper = _get_scraper()
    for attempt in range(1, retries + 1):
        try:
            resp = scraper.get(url, timeout=15)
            resp.raise_for_status()
            if "Just a moment..." in resp.text or "cf-browser-verification" in resp.text:
                raise Exception("Cloudflare Challenge Page detected")
            return BeautifulSoup(resp.text, "html.parser")
        except Exception as e:
            if attempt < retries:
                time.sleep(1)
            else:
                logger.debug(f"Fetch failed nach {retries} Versuchen: {url} -> {e}")
    return None

# ============================================================================
# LOGIC
# ============================================================================
def load_existing_sets() -> Set[str]:
    csv_path = os.path.join(data_dir, "japanese_cards_database.csv")
    if not os.path.exists(csv_path):
        return set()
    try:
        existing = set()
        with open(csv_path, "r", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                if row.get("set"):
                    existing.add(row["set"])
        return existing
    except Exception as e:
        logger.warning(f"Konnte bestehende DB nicht lesen: {e}")
        return set()

def quick_check_latest_sets() -> Set[str]:
    logger.info("Quick Check: Pruefe die neusten Sets auf Limitless...")
    # The JP set index page lists all sets, newest first
    url = "https://limitlesstcg.com/cards/jp"
    soup = fetch_page_bs4(url)
    if not soup:
        return set()
    seen_sets = []
    # Limitless does not use <tbody> — select all <tr> that contain <td>
    for row in [tr for tr in soup.select("table tr") if tr.find("td")]:
        # Set code is in <span class="code annotation"> or img alt
        span = row.find("span", class_="code")
        if span:
            set_code = span.get_text(strip=True).upper()
        else:
            img = row.find("img", class_="set")
            set_code = (img["alt"].upper() if img and img.has_attr("alt") else "").strip()
        if set_code and set_code not in seen_sets:
            seen_sets.append(set_code)
            if len(seen_sets) >= SETTINGS["keep_latest_sets"]:
                break
    return set(seen_sets)

def scrape_japanese_cards_list(target_sets: Set[str]) -> List[Dict[str, str]]:
    all_cards = []

    # Always include standard promo sets alongside the target sets
    PROMO_SETS_TO_ADD = ["SVP", "SP", "SMP", "SWSH", "PR-SW", "PR-SM"]
    search_sets = list(target_sets) + [s for s in PROMO_SETS_TO_ADD if s not in target_sets]
    sets_query  = ",".join(search_sets).lower()
    base_url    = f"https://limitlesstcg.com/cards/jp?q=set:{sets_query}&translate=en&display=list"
    seen_keys   = set()
    max_pages   = SETTINGS["max_pages"]

    for page in range(1, max_pages + 1):
        url = base_url if page == 1 else f"{base_url}&page={page}"
        logger.info(f"Lade Seite {page}...")

        soup = fetch_page_bs4(url)
        if not soup:
            break

        # Limitless does not use <tbody>
        rows = [tr for tr in soup.select("table tr") if tr.find("td")]
        if not rows:
            logger.info("Keine weiteren Karten gefunden.")
            break

        added_this_page = 0
        for row in rows:
            cells = row.find_all("td")
            if len(cells) >= 4:
                set_code = cells[0].get_text(strip=True).upper()
                set_num  = cells[1].get_text(strip=True)
                name     = cells[2].get_text(strip=True)
                # Strip ptcg symbol prefix from type (e.g. "GBasic" -> "Basic")
                raw_type  = cells[3].get_text(strip=True)
                type_span = cells[3].find("span", class_="ptcg-symbol")
                if type_span:
                    raw_type = raw_type[len(type_span.get_text()):].strip()
                rarity   = cells[4].get_text(strip=True) if len(cells) > 4 else ""
                a_tag    = cells[2].find("a")
                card_url = a_tag["href"] if a_tag and a_tag.has_attr("href") else ""

                if name:
                    key = f"{set_code}::{set_num}"
                    if key not in seen_keys:
                        seen_keys.add(key)
                        all_cards.append({
                            "name": name, "set": set_code, "number": set_num,
                            "type": raw_type, "card_url": card_url,
                            "image_url": "", "rarity": rarity,
                        })
                        added_this_page += 1

        logger.info(f" -> {added_this_page} Karten extrahiert.")
        if added_this_page == 0:
            break

        time.sleep(SETTINGS["list_page_delay_seconds"])

    logger.info(f"Insgesamt {len(all_cards)} japanische Karten in der Liste gefunden.")
    return all_cards

def filter_latest_sets(cards: List[Dict[str, str]]) -> Tuple[List[Dict[str, str]], Set[str]]:
    PROMO_SETS = {
        "MEP", "SVP", "SP", "SMP", "XYP", "BWP", "HSP", "DPP", "NP", "WP",
        "POP", "SWSH", "SWSHP", "PR-SW", "PR-SM", "PR-XY", "PR-BLW", "PR-HS", "PR-DP", "MP"
    }
    set_first_app = {}
    for idx, c in enumerate(cards):
        if c["set"] not in set_first_app:
            set_first_app[c["set"]] = idx

    promo_sets_found = {s for s in set_first_app if s in PROMO_SETS}
    regular_sets     = sorted(
        [(s, idx) for s, idx in set_first_app.items() if s not in PROMO_SETS],
        key=lambda x: x[1]
    )
    keep           = SETTINGS["keep_latest_sets"]
    latest_regular = {s for s, _ in regular_sets[:keep]}
    target_sets    = latest_regular | promo_sets_found

    logger.info(f"Behalte die neusten {keep} regulaeren Sets + {len(promo_sets_found)} Promo-Sets:")
    for s, _ in regular_sets[:keep]:
        logger.info(f" - {s} (Regular)")
    for s in promo_sets_found:
        logger.info(f" - {s} (Promo)")

    filtered = [c for c in cards if c["set"] in target_sets]
    logger.info(f"Liste auf {len(filtered)} Karten reduziert.")
    return filtered, target_sets

def _fetch_single_detail(card: dict) -> dict:
    if not card.get("card_url"):
        return card
    url = (
        f"https://limitlesstcg.com{card['card_url']}"
        if card["card_url"].startswith("/")
        else card["card_url"]
    )
    # Force English translation for Japanese detail pages
    if "translate=en" not in url:
        url += "&translate=en" if "?" in url else "?translate=en"

    soup = fetch_page_bs4(url)
    if soup:
        img = soup.select_one("img.card.shadow.resp-w")
        if img and img.has_attr("src"):
            card["image_url"] = img["src"]

        # Rarity extraction
        rarity_spans = soup.select(".card-prints-current .prints-current-details span")
        if len(rarity_spans) >= 2:
            r_info = rarity_spans[1].get_text(strip=True)
            if "·" in r_info:
                card["rarity"] = r_info.split("·")[1].strip()
            elif "." in r_info:
                card["rarity"] = r_info.split(".", 1)[1].strip()
        else:
            for h in soup.select("h1, h2, h3, .card-info"):
                txt = h.get_text(strip=True)
                if "·" in txt and card["set"] in txt:
                    card["rarity"] = txt.split("·")[-1].strip()
                    break

        # Promo fallback
        if card["set"] in ["SVP", "SMP", "SWSH", "PR-SW"] and not card.get("rarity"):
            card["rarity"] = "Promo"

    return card

def scrape_card_details(cards: List[dict]) -> List[dict]:
    max_workers = SETTINGS["max_workers"]
    logger.info(
        f"Starte Detail-Download fuer {len(cards)} Karten "
        f"(Multithreading mit {max_workers} Workern)..."
    )
    updated   = []
    completed = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [executor.submit(_fetch_single_detail, c) for c in cards]
        for future in concurrent.futures.as_completed(futures):
            updated.append(future.result())
            completed += 1
            if completed % 100 == 0:
                logger.info(f"  Fortschritt: {completed}/{len(cards)} Karten...")

    success = sum(1 for c in updated if c.get("image_url"))
    logger.info(f"Detail-Download beendet. Bilder gefunden: {success}/{len(updated)}")
    return updated

# ============================================================================
# MAIN
# ============================================================================
def main():
    existing_sets = load_existing_sets()
    if existing_sets:
        logger.info(f"Lokale Datenbank enthaelt {len(existing_sets)} Sets.")

    latest_online = quick_check_latest_sets()
    if latest_online:
        logger.info(f"Neueste Sets online: {', '.join(latest_online)}")
        if latest_online.issubset(existing_sets):
            logger.info("DATENBANK IST BEREITS AKTUELL!")
            logger.info("Die neusten Sets sind bereits in der lokalen Datenbank. Abbruch.")
            return

    all_cards = scrape_japanese_cards_list(latest_online)
    if not all_cards:
        return

    filtered_cards, latest_sets = filter_latest_sets(all_cards)

    if not SETTINGS["skip_detail_scraping"]:
        filtered_cards = scrape_card_details(filtered_cards)
    else:
        logger.info("Detail-Download uebersprungen (skip_detail_scraping = True).")

    csv_path  = os.path.join(data_dir, "japanese_cards_database.csv")
    json_path = os.path.join(data_dir, "japanese_cards_database.json")

    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(
            f, fieldnames=["name", "set", "number", "type", "rarity", "image_url"],
            extrasaction="ignore"
        )
        writer.writeheader()
        writer.writerows(filtered_cards)

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "timestamp": datetime.now().isoformat(),
                "total_count": len(filtered_cards),
                "sets": list(latest_sets),
                "cards": filtered_cards,
            },
            f, indent=2, ensure_ascii=False,
        )

    logger.info(f"Erfolgreich ueberschrieben. {len(filtered_cards)} Karten in Datenbank gespeichert.")
    logger.info("=" * 80)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logger.warning("Abbruch durch Benutzer.")
    except Exception as e:
        logger.critical(f"Fehler aufgetreten: {e}", exc_info=True)
    finally:
        pass