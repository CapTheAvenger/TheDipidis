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
import threading
import concurrent.futures
from datetime import datetime
from typing import List, Dict, Optional, Set, Tuple

from bs4 import BeautifulSoup

from card_scraper_shared import (
    setup_console_encoding, get_data_dir, _get_scraper,
    setup_logging, load_settings as _shared_load_settings,
)

setup_console_encoding()
logger = setup_logging("japanese_cards_scraper")
data_dir = get_data_dir()

# Limitless ptcg-symbol letter -> TCG energy type name
ENERGY_SYMBOL_MAP = {
    "G": "Grass", "R": "Fire", "W": "Water", "L": "Lightning",
    "P": "Psychic", "F": "Fighting", "D": "Darkness", "M": "Metal",
    "N": "Dragon", "C": "Colorless",
}

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

def _load_settings() -> dict:
    return _shared_load_settings("japanese_cards_scraper_settings.json", DEFAULT_SETTINGS)

SETTINGS = _load_settings()

logger.info("=" * 80)
logger.info(f"JAPANESE CARDS SCRAPER - Lade die neusten {SETTINGS['keep_latest_sets']} JP Sets")
logger.info("=" * 80)

# ============================================================================
# NETWORK UTILS
# ============================================================================

def fetch_page_bs4(url: str, retries: int = 3):
    scraper = _get_scraper()
    for attempt in range(1, retries + 1):
        try:
            resp = scraper.get(url, timeout=15)
            resp.raise_for_status()
            if "Just a moment..." in resp.text or "cf-browser-verification" in resp.text:
                raise Exception("Cloudflare Challenge Page detected")
            return BeautifulSoup(resp.text, "lxml")
        except Exception as e:
            if attempt < retries:
                time.sleep(1)
            else:
                logger.debug("Fetch failed nach %s Versuchen: %s -> %s", retries, url, e)
    return None

# ============================================================================
# LOGIC
# ============================================================================
def load_existing_rows() -> List[Dict[str, str]]:
    """Alle Zeilen der bestehenden JP-Datenbank, oder eine leere Liste."""
    csv_path = os.path.join(data_dir, "japanese_cards_database.csv")
    if not os.path.exists(csv_path):
        return []
    try:
        with open(csv_path, "r", encoding="utf-8-sig") as f:
            return [dict(row) for row in csv.DictReader(f)]
    except Exception as e:
        logger.warning("Konnte bestehende DB nicht lesen: %s", e)
        return []


def load_existing_sets() -> Set[str]:
    return {r["set"] for r in load_existing_rows() if r.get("set")}


def merge_rows(alt: List[Dict[str, str]],
               neu: List[Dict[str, str]]) -> Tuple[List[Dict[str, str]], Set[str], Set[str]]:
    """Neue Zeilen ueber die alten legen, ohne die alten zu verlieren.

    GEMESSEN am 21.08.2026: data/japanese_cards_database.csv enthielt
    772 Zeilen aus genau fuenf Sets — M6 und vier Promo-Sets. M5, M4 und
    M3 fehlten vollstaendig, obwohl sie frueher darin standen. Ursache
    ist die Schreibweise weiter unten: die Datei wurde mit "w" geoeffnet
    und komplett durch das Ergebnis EINES Laufs ersetzt. Faellt in einem
    Lauf die Set-Uebersicht aus (Cloudflare, geaenderte Seitenstruktur),
    fragt der Scraper nur noch die fest verdrahteten Promo-Sets ab — und
    dieses Ergebnis loeschte alles andere.

    Deshalb wird jetzt zusammengelegt statt ersetzt: ein Set, das dieser
    Lauf geliefert hat, wird darin vollstaendig erneuert; ein Set, das er
    nicht angefasst hat, bleibt unveraendert stehen.

    Rueckgabe: (zeilen, erneuerte_sets, behaltene_sets)
    """
    neue_sets = {r["set"] for r in neu if r.get("set")}
    behalten = [r for r in alt if r.get("set") and r["set"] not in neue_sets]
    behaltene_sets = {r["set"] for r in behalten}
    return behalten + list(neu), neue_sets, behaltene_sets


def pruefe_kein_verlust(alt: List[Dict[str, str]],
                        zusammengelegt: List[Dict[str, str]]) -> Optional[str]:
    """Gibt einen Grund zurueck, wenn das Ergebnis schlechter waere als der Bestand.

    Melden, nicht still reparieren (CLAUDE.md): lieber die alte Datei
    behalten und laut sein, als eine kleinere zu schreiben, die richtig
    aussieht.
    """
    alt_sets = {r["set"] for r in alt if r.get("set")}
    neu_sets = {r["set"] for r in zusammengelegt if r.get("set")}
    verloren = alt_sets - neu_sets
    if verloren:
        return f"Sets wuerden verschwinden: {', '.join(sorted(verloren))}"
    if alt and len(zusammengelegt) < len(alt) * 0.9:
        return (f"Ergebnis waere deutlich kleiner: {len(zusammengelegt)} statt "
                f"{len(alt)} Zeilen")
    return None

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
        logger.info("Lade Seite %s...", page)

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
                # Extract energy type from ptcg-symbol span, then strip it
                raw_type  = cells[3].get_text(strip=True)
                energy_type = ""
                type_span = cells[3].find("span", class_="ptcg-symbol")
                if type_span:
                    symbol_letter = type_span.get_text(strip=True)
                    energy_type = ENERGY_SYMBOL_MAP.get(symbol_letter, "")
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
                            "type": raw_type, "energy_type": energy_type,
                            "card_url": card_url,
                            "image_url": "", "rarity": rarity,
                        })
                        added_this_page += 1

        logger.info(" -> %s Karten extrahiert.", added_this_page)
        if added_this_page == 0:
            break

        time.sleep(SETTINGS["list_page_delay_seconds"])

    logger.info("Insgesamt %s japanische Karten in der Liste gefunden.", len(all_cards))
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

    logger.info("Behalte die neusten %s regulaeren Sets + %s Promo-Sets:", keep, len(promo_sets_found))
    for s, _ in regular_sets[:keep]:
        logger.info(" - %s (Regular)", s)
    for s in promo_sets_found:
        logger.info(" - %s (Promo)", s)

    filtered = [c for c in cards if c["set"] in target_sets]
    logger.info("Liste auf %s Karten reduziert.", len(filtered))
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
                logger.info("  Fortschritt: %s/%s Karten...", completed, len(cards))

    success = sum(1 for c in updated if c.get("image_url"))
    logger.info("Detail-Download beendet. Bilder gefunden: %s/%s", success, len(updated))
    return updated

# ============================================================================
# MAIN
# ============================================================================
def main():
    existing_sets = load_existing_sets()
    if existing_sets:
        logger.info("Lokale Datenbank enthaelt %s Sets.", len(existing_sets))

    latest_online = quick_check_latest_sets()
    if not latest_online:
        # Ohne die Set-Uebersicht weiss dieser Lauf nicht, WELCHE Sets es
        # gibt. Frueher lief er trotzdem weiter und fragte nur die fest
        # verdrahteten Promo-Sets ab — deren Ergebnis ersetzte dann die
        # ganze Datenbank. Genau so sind M5, M4 und M3 verschwunden.
        logger.error(
            "Set-Uebersicht auf limitlesstcg.com/cards/jp lieferte kein einziges "
            "Set. Ohne sie ist nicht bestimmbar, was zu holen waere — Abbruch "
            "OHNE Schreiben. Bestehende Datenbank bleibt unveraendert."
        )
        print("::error::japanese_cards_scraper: JP-Set-Uebersicht leer — "
              "Seitenstruktur oder Cloudflare pruefen. Datenbank unveraendert.")
        return

    logger.info(f"Neueste Sets online: {', '.join(sorted(latest_online))}")

    # Hier stand ein Abbruch, sobald die neuesten Set-CODES schon in der
    # Datenbank vorkamen. Ein Set ist aber kein Ereignis, sondern ein
    # Bestand: nach dem Erscheinen kommen Secret Rares und Nachdrucke
    # dazu, und die hat dieser Lauf danach nie wieder geholt — M6 stand
    # seit dem 28.07. unveraendert bei 76 Karten, waehrend der Lauf jede
    # Woche "DATENBANK IST BEREITS AKTUELL" meldete.
    #
    # Ein Kartenzahlvergleich je Set waere der genauere Weg, dafuer
    # muesste die Set-Uebersicht eine Kartenzahl liefern; sie liefert nur
    # Codes. Also faellt der Abbruch weg. Der Preis ist ein zusaetzlicher
    # Abruf des NEUESTEN Sets pro Lauf (keep_latest_sets steht auf 1), der
    # Gewinn ist, dass Nachtraege ankommen. Verloren gehen kann dabei
    # nichts mehr: merge_rows() legt zusammen, statt zu ersetzen, und
    # pruefe_kein_verlust() haelt dagegen.
    if latest_online.issubset(existing_sets):
        logger.info("Die neuesten Set-Codes sind bereits bekannt — es wird "
                    "trotzdem geholt, weil Sets nachtraeglich wachsen.")

    all_cards = scrape_japanese_cards_list(latest_online)
    if not all_cards:
        return

    filtered_cards, latest_sets = filter_latest_sets(all_cards)

    if not SETTINGS["skip_detail_scraping"]:
        filtered_cards = scrape_card_details(filtered_cards)
    else:
        logger.info("Detail-Download uebersprungen (skip_detail_scraping = True).")

    csv_path  = os.path.join(data_dir, "japanese_cards_database.csv")

    bestand = load_existing_rows()
    zusammengelegt, erneuert, behalten = merge_rows(bestand, filtered_cards)
    logger.info("Zusammengelegt: %s Sets erneuert (%s), %s Sets unveraendert behalten.",
                len(erneuert), ", ".join(sorted(erneuert)) or "-", len(behalten))

    grund = pruefe_kein_verlust(bestand, zusammengelegt)
    if grund:
        logger.error("Schreiben abgebrochen — %s", grund)
        print(f"::error::japanese_cards_scraper: nicht geschrieben ({grund}). "
              f"Bestehende Datenbank bleibt unveraendert.")
        return

    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(
            f, fieldnames=["name", "set", "number", "type", "rarity", "image_url"],
            extrasaction="ignore"
        )
        writer.writeheader()
        writer.writerows(zusammengelegt)
    filtered_cards = zusammengelegt

    # NOTE: the legacy japanese_cards_database.json output was dropped
    # 2026-06-12 (AUDIT_DATA_PIPELINE.md F-D15). Only the CSV is
    # consumed downstream (prepare_card_data.py merges it with the EN
    # database into all_cards_merged.json). The JSON variant carried
    # no consumer for 12+ months — write-only artefact.
    logger.info("Erfolgreich ueberschrieben. %s Karten in Datenbank gespeichert.", len(filtered_cards))
    logger.info("=" * 80)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logger.warning("Abbruch durch Benutzer.")
        sys.exit(130)
    except Exception as e:
        logger.critical(f"Fehler aufgetreten: {e}", exc_info=True)
        # Ohne Rueckgabewert bleibt ein Absturz dieses Scrapers in CI
        # unsichtbar - und genau dieser Scraper hat schon einmal still
        # den halben japanischen Bestand verloren (S7).
        print(f"::error::japanese_cards_scraper abgebrochen: {e}")
        sys.exit(1)