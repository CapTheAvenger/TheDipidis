#!/usr/bin/env python3
"""
All Cards Scraper - FAST EDITION (English + German)
====================================================
- HTTP requests + BeautifulSoup instead of Selenium -> massive speed boost
- Multithreaded detail scraping (concurrent.futures)
- Bilingual: fetches English AND German card names
- Dynamic set sorting via data/sets.json
- Uses cloudscraper (via shared library) to bypass Cloudflare
"""

import csv
import json
import os
import sys
import time
import logging
import concurrent.futures
import re
from datetime import datetime
from urllib.parse import urljoin
from bs4 import BeautifulSoup

from card_scraper_shared import (
    setup_console_encoding, get_app_path, get_data_dir, safe_fetch_html,
    setup_logging, load_settings, load_set_order, card_sort_key
)

setup_console_encoding()

# Limitless ptcg-symbol letter -> TCG energy type name
ENERGY_SYMBOL_MAP = {
    "G": "Grass", "R": "Fire", "W": "Water", "L": "Lightning",
    "P": "Psychic", "F": "Fighting", "D": "Darkness", "M": "Metal",
    "N": "Dragon", "C": "Colorless",
}

# LOGGING SETUP
logger = setup_logging("scraper")
data_dir = get_data_dir()

logger.info("=" * 80)
logger.info("ALL CARDS SCRAPER - FAST EDITION (English + German)")
logger.info("=" * 80)

# SETTINGS
DEFAULT_SETTINGS = {
    "start_page": 1,
    "end_page": None,
    "max_pages": None,
    "set_filter": [],
    "append": True,
    "rescrape_incomplete": True,
    "skip_detail_scraping": False,
    "list_page_delay_seconds": 0.3,
    "max_workers": 8,
}

def _load_settings() -> dict:
    return load_settings("all_cards_scraper_settings.json", DEFAULT_SETTINGS)


# SET-ORDER (dynamisch aus sets.json)
SET_ORDER = load_set_order()
if SET_ORDER:
    logger.info("+ %s Sets fuer Sortierung geladen aus sets.json", len(SET_ORDER))
else:
    logger.warning("! sets.json nicht gefunden! Bitte im Dashboard Update Sets (8) ausfuehren.")
    logger.warning("  Karten werden vorerst nur nach Nummer sortiert.")


def sort_key(card: dict):
    return card_sort_key(card, SET_ORDER)


# LOAD EXISTING CSV
def load_existing_cards(csv_path: str, rescrape_incomplete: bool = True):
    if not os.path.isfile(csv_path):
        return [], set(), []

    complete_cards = []
    incomplete_cards = []
    existing_keys = set()

    with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if not row:
                continue
            name_en    = (row.get("name_en") or row.get("name") or "").strip()
            name_de    = (row.get("name_de") or "").strip()
            set_code   = (row.get("set") or "").strip()
            set_number = (row.get("number") or "").strip()
            image_url  = (row.get("image_url") or "").strip()
            rarity     = (row.get("rarity") or "").strip()
            intl       = (row.get("international_prints") or "").strip()
            cm_url     = (row.get("cardmarket_url") or "").strip()

            if not (name_en and set_code and set_number):
                continue

            card_data = {
                "name_en": name_en, "name_de": name_de,
                "set": set_code, "number": set_number,
                "type": (row.get("type") or "").strip(),
                "rarity": rarity, "image_url": image_url,
                "international_prints": intl, "cardmarket_url": cm_url,
                "card_url": "",
            }

            key = f"{set_code}::{set_number}"
            existing_keys.add(key)

            energy_type = (row.get("energy_type") or "").strip()
            hp_val      = (row.get("hp") or "").strip()
            card_text   = (row.get("card_text") or "").strip()

            card_data["energy_type"] = energy_type
            card_data["hp"] = hp_val
            card_data["card_text"] = card_text

            has_basic = bool(image_url and rarity and intl)
            only_self = False
            if intl:
                p_list = [p.strip() for p in intl.split(",")]
                only_self = (len(p_list) == 1 and p_list[0] == f"{set_code}-{set_number}")

            # Also rescrape if energy_type is missing for Pokemon cards
            is_pokemon_type = (row.get("type") or "").strip().lower() in (
                "basic", "stage 1", "stage 2", "vstar", "vmax", "v", "v-union",
                "mega", "break", "restored", "legend"
            )
            missing_energy = is_pokemon_type and not energy_type

            is_incomplete = not has_basic or (only_self and not cm_url) or missing_energy

            if not is_incomplete:
                complete_cards.append(card_data)
            elif rescrape_incomplete:
                incomplete_cards.append(card_data)
            else:
                complete_cards.append(card_data)

    logger.info(
        f"Lade {len(complete_cards) + len(incomplete_cards)} Karten aus bestehender CSV "
        f"({len(complete_cards)} vollstaendig, {len(incomplete_cards)} unvollstaendig)"
    )
    if incomplete_cards and rescrape_incomplete:
        logger.info("! %s unvollstaendige Karten werden neu gescraped.", len(incomplete_cards))

    return complete_cards, existing_keys, incomplete_cards


# PHASE 1: FAST LIST SCRAPING
def scrape_all_cards_list(
    settings: dict,
    start_page: int = 1,
    existing_keys: set = None,
    language: str = "en"
) -> list:
    logger.info("Starte Listen-Scraping - Sprache: %s", language.upper())
    all_cards_data = []
    if existing_keys is None:
        existing_keys = set()

    max_pages  = settings.get("max_pages")
    end_page   = settings.get("end_page")
    set_filter = settings.get("set_filter", [])
    delay      = float(settings.get("list_page_delay_seconds", 0.3))

    base_url   = f"https://limitlesstcg.com/cards?q=lang%3A{language}&display=list"
    seen_keys  = set()
    page_index = max(1, start_page)

    while True:
        if max_pages and page_index > max_pages:
            logger.info("max_pages-Limit erreicht (%s). Stoppe.", max_pages)
            break
        if end_page and page_index > end_page:
            logger.info("end_page-Limit erreicht (%s). Stoppe.", end_page)
            break

        current_url = base_url if page_index == 1 else f"{base_url}&page={page_index}"
        logger.info("  Seite %s (%s): %s", page_index, language.upper(), current_url)

        html = safe_fetch_html(current_url, timeout=15)
        if not html:
            logger.error("  Fehler bei Seite %s: Cloudflare Block oder Timeout", page_index)
            time.sleep(5)
            page_index += 1
            continue

        soup = BeautifulSoup(html, "lxml")
        # Limitless does not use <tbody>, so select all <tr> that contain <td>
        rows = [tr for tr in soup.select("table tr") if tr.find("td")]

        if not rows:
            logger.info("  Keine Karten mehr gefunden - Ende der Liste.")
            break

        new_on_page = 0
        for row in rows:
            cells = row.find_all("td")
            if len(cells) < 4:
                continue

            set_code   = cells[0].get_text(strip=True)
            set_number = cells[1].get_text(strip=True)
            card_name  = cells[2].get_text(strip=True)
            # Extract energy type from ptcg-symbol span, then strip it from type
            raw_type  = cells[3].get_text(strip=True)
            energy_type = ""
            type_span = cells[3].find("span", class_="ptcg-symbol")
            if type_span:
                symbol_letter = type_span.get_text(strip=True)
                energy_type = ENERGY_SYMBOL_MAP.get(symbol_letter, "")
                raw_type = raw_type[len(type_span.get_text()):].strip()
            card_type   = raw_type
            # Rarity is in column 4 on the list page
            card_rarity = cells[4].get_text(strip=True) if len(cells) > 4 else ""

            if set_filter and set_code not in set_filter:
                continue

            link_elem = cells[2].find("a")
            card_url = link_elem["href"] if link_elem and link_elem.has_attr("href") else ""

            if not card_name:
                continue

            key = f"{set_code}::{set_number}"
            if key in seen_keys or key in existing_keys:
                continue
            seen_keys.add(key)

            all_cards_data.append({
                "set": set_code,
                "number": set_number,
                "name": card_name,
                "type": card_type,
                "energy_type": energy_type,
                "hp": "",
                "card_url": card_url,
                "image_url": "",
                "rarity": card_rarity,
                "international_prints": "",
                "cardmarket_url": "",
                "card_text": "",
            })
            new_on_page += 1

        if len(all_cards_data) % 500 == 0 and new_on_page > 0:
            logger.info("  ... %s Karten bisher", len(all_cards_data))

        # Pagination check
        next_tag = soup.select_one(
            ".pagination a[rel='next'], "
            ".pagination .page-item.next a, "
            ".pagination a[aria-label='Next']"
        )
        has_next = False
        if next_tag:
            parent = next_tag.find_parent()
            if parent and "disabled" not in parent.get("class", []):
                has_next = True

        page_index += 1

        if not has_next and new_on_page == 0:
            logger.info("  Keine neuen Karten - Ende der Liste.")
            break

        time.sleep(delay)

    logger.info("+ %s %s-Karten aus Liste geladen.", len(all_cards_data), language.upper())
    return all_cards_data


# PHASE 2: FAST DETAIL SCRAPING
PROMO_SETS = {
    "MEP", "SVP", "SP", "SMP", "XYP", "BWP", "HSP", "DPP", "NP", "WP",
    "POP", "SWSH", "SWSHP", "PR-SW", "PR-SM", "PR-XY", "PR-BLW", "PR-HS", "PR-DP",
}

RARITY_KEYWORDS = [
    "Special Illustration Rare", "Illustration Rare", "Hyper Rare",
    "Double Rare", "Ultra Rare", "Secret Rare", "Amazing Rare",
    "Rainbow Rare", "Holo Rare", "Common", "Uncommon", "Rare", "Promo",
]


def _fetch_single_card(card: dict) -> dict:
    if not card.get("card_url"):
        return card

    full_url = urljoin("https://limitlesstcg.com", card["card_url"])
    # Erster Versuch ohne Retries + quiet — bei 404 sofort Fallback statt 3x retry
    html = safe_fetch_html(full_url, timeout=15, retries=0, quiet=True)

    # Fallback: URL ohne Name-Slug probieren (/cards/SET/NUMBER statt /cards/SET/NUMBER/slug)
    if not html:
        short_url = f"/cards/{card['set'].upper()}/{card['number']}"
        if card["card_url"].rstrip("/") != short_url:
            fallback_full = urljoin("https://limitlesstcg.com", short_url)
            html = safe_fetch_html(fallback_full, timeout=15)
            if html:
                card["card_url"] = short_url

    if not html:
        logger.error(
            f"  [ERROR] Detail-Scraping fehlgeschlagen fuer "
            f"{card.get('name_en', card.get('name', '?'))} ({card['set']}-{card['number']})"
        )
        card["international_prints"] = f"{card['set']}-{card['number']}"
        return card

    soup = BeautifulSoup(html, "lxml")

    # Image URL
    img = soup.select_one("img.card.shadow.resp-w")
    if img and img.has_attr("src"):
        card["image_url"] = img["src"]

    # Rarity — skip if already extracted from list page
    rarity_found = bool(card.get("rarity"))

    # Rarity - Strategy 1: .card-prints-current details
    if not rarity_found:
        spans = soup.select(".card-prints-current .prints-current-details span")
        if len(spans) >= 2:
            info = spans[1].get_text(strip=True)
            separator = "." if "." in info else ("." if "." in info else None)
            if "." in info:
                separator = "."
            elif "·" in info:
                separator = "·"
            else:
                separator = None
            if separator:
                candidate = info.split(separator, 1)[1].strip()
                if candidate:
                    card["rarity"] = candidate
                    rarity_found = True

    # Rarity - Strategy 2: header elements
    if not rarity_found:
        for elem in soup.select("h1, h2, h3, .card-info, [class*='title'], [class*='header']"):
            text = elem.get_text(strip=True)
            if card["set"] in text and str(card["number"]) in text:
                if "·" in text:
                    candidate = text.split("·")[-1].strip()
                    if candidate and candidate not in ("", "-", "\u2014"):
                        card["rarity"] = candidate
                        rarity_found = True
                        break
                for kw in RARITY_KEYWORDS:
                    if kw in text:
                        card["rarity"] = kw
                        rarity_found = True
                        break
            if rarity_found:
                break

    # Promo fallback
    if card["set"] in PROMO_SETS and not card.get("rarity"):
        card["rarity"] = "Promo"

    # International Prints + Cardmarket URL
    int_prints = {f"{card['set']}-{card['number']}"}
    cardmarket_url = ""

    prints_table = soup.select_one("table.card-prints-versions")
    if prints_table:
        # Limitless does not use <tbody> on this table either
        for row in [tr for tr in prints_table.select("tr") if tr.find("td")]:
            td = row.select_one("td:first-child")
            if td:
                a = td.select_one("a[href*='/cards/']")
                if a and a.has_attr("href"):
                    path  = a["href"].split("/cards/", 1)[-1].strip()
                    parts = path.split("/")
                    if (len(parts) >= 3 and
                            parts[0].lower() in ("en","de","fr","es","it","pt","ja","ko")):
                        sc, sn = parts[1].upper(), parts[2]
                    elif len(parts) >= 2:
                        sc, sn = parts[0].upper(), parts[1]
                    else:
                        sc, sn = "", ""
                    if sc and sc != "JP":
                        int_prints.add(f"{sc}-{sn}")

            if "current" in row.get("class", []):
                eur = row.select_one("a.card-price.eur")
                if eur and eur.has_attr("href"):
                    cardmarket_url = eur["href"]

    card["international_prints"] = ",".join(sorted(int_prints))
    card["cardmarket_url"] = cardmarket_url

    # ── Card text / TCG energy type from detail page ──────────────
    title_el = soup.select_one("p.card-text-title")
    if title_el:
        title_text = title_el.get_text(" ", strip=True)
        # Format: "Name - Psychic - 70 HP" or "Name - Trainer" etc.
        parts = [p.strip() for p in title_text.split(" - ")]
        if len(parts) >= 3:
            # Pokemon card: Name - Type - HP
            detail_energy = parts[1].strip()
            hp_text = parts[2].replace("HP", "").strip()
            if detail_energy in ENERGY_SYMBOL_MAP.values():
                card["energy_type"] = detail_energy
            if hp_text.isdigit():
                card["hp"] = hp_text
        elif len(parts) == 2:
            # Trainer/Energy: Name - Trainer or Name - Energy
            pass

    # Card text: attacks + abilities
    card_text_parts = []
    for ability_el in soup.select(".card-text-ability"):
        ab_name = ability_el.select_one(".card-text-ability-name")
        ab_effect = ability_el.select_one(".card-text-ability-effect")
        if ab_name:
            card_text_parts.append(f"[Ability] {ab_name.get_text(strip=True)}")
        if ab_effect:
            card_text_parts.append(ab_effect.get_text(" ", strip=True))

    for attack_el in soup.select(".card-text-attack"):
        info_el = attack_el.select_one(".card-text-attack-info")
        effect_el = attack_el.select_one(".card-text-attack-effect")
        if info_el:
            # Extract cost symbols + name + damage
            symbols = [s.get_text(strip=True) for s in info_el.select(".ptcg-symbol")]
            full_text = info_el.get_text(" ", strip=True)
            card_text_parts.append(full_text)
        if effect_el:
            effect_text = effect_el.get_text(" ", strip=True)
            if effect_text:
                card_text_parts.append(effect_text)

    # Weakness / Resistance / Retreat
    wr_section = soup.select_one(".card-text-wrr")
    if wr_section:
        wr_text = wr_section.get_text(" ", strip=True)
        card_text_parts.append(wr_text)

    if card_text_parts:
        card["card_text"] = " || ".join(card_text_parts)

    return card


def scrape_card_details(
    settings: dict,
    cards: list,
    existing_cards: list,
    csv_path: str,
    append_mode: bool
) -> list:
    max_workers = int(settings.get("max_workers", 8))
    logger.info(
        f"Starte Detail-Scraping fuer {len(cards)} Karten "
        f"(Multithreading, {max_workers} Worker)..."
    )

    fieldnames = ["name_en", "name_de", "set", "number", "type", "energy_type",
                  "hp", "rarity", "image_url", "international_prints",
                  "cardmarket_url", "card_text"]

    def write_csv_batch(current_cards: list):
        all_data = (existing_cards + current_cards) if append_mode else current_cards
        deduped  = list({f"{c.get('set','')}::{c.get('number','')}": c for c in all_data}.values())
        with open(csv_path, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(deduped)

    completed     = 0
    updated_cards = []

    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_card = {executor.submit(_fetch_single_card, card): card for card in cards}
        for future in concurrent.futures.as_completed(future_to_card):
            completed += 1
            try:
                updated_cards.append(future.result(timeout=60))
            except concurrent.futures.TimeoutError:
                logger.warning("Thread-Timeout für Karte: %s", future_to_card[future].get('name', '?'))
                updated_cards.append(future_to_card[future])
            except Exception as exc:
                logger.error("Thread-Fehler: %s", exc)
                updated_cards.append(future_to_card[future])
            if completed % 100 == 0:
                logger.info("  Fortschritt: %s/%s Karten gescraped ...", completed, len(cards))
                write_csv_batch(updated_cards)

    write_csv_batch(updated_cards)
    cards_with_img = sum(1 for c in updated_cards if c.get("image_url"))
    logger.info(
        f"+ Detail-Scraping abgeschlossen. "
        f"Bilder gefunden: {cards_with_img}/{len(updated_cards)}"
    )
    return updated_cards


# MAIN
def main():
    try:
        settings    = _load_settings()
        csv_path    = os.path.join(data_dir, "all_cards_database.csv")
        json_path   = os.path.join(data_dir, "all_cards_database.json")
        append_mode = bool(settings.get("append", True))
        start_page  = int(settings.get("start_page", 1))
        rescrape    = bool(settings.get("rescrape_incomplete", True))

        logger.info("Ausgabe-Verzeichnis: %s", os.path.abspath(data_dir))

        if append_mode:
            existing_cards, existing_keys, incomplete_cards = load_existing_cards(csv_path, rescrape)
        else:
            existing_cards, existing_keys, incomplete_cards = [], set(), []

        logger.info("=" * 60)
        logger.info("PHASE 1a: Englische Liste scrapen ...")
        logger.info("=" * 60)
        en_cards = scrape_all_cards_list(
            settings, start_page=start_page, existing_keys=existing_keys, language="en"
        )

        logger.info("=" * 60)
        logger.info("PHASE 1b: Deutsche Liste scrapen (name_de) ...")
        logger.info("=" * 60)
        de_cards = scrape_all_cards_list(
            settings, start_page=start_page, existing_keys=set(), language="de"
        )

        # Merge German names into EN cards
        de_lookup = {f"{c['set']}::{c['number']}": c["name"] for c in de_cards}
        for card in en_cards:
            key = f"{card['set']}::{card['number']}"
            card["name_en"] = card.pop("name")
            card["name_de"] = de_lookup.get(key, "")

        # Prepare incomplete cards for re-scrape
        for ic in incomplete_cards:
            if "name" in ic and "name_en" not in ic:
                ic["name_en"] = ic.pop("name")
            if not ic.get("card_url") and ic.get("name_en") and ic.get("set") and ic.get("number"):
                slug = re.sub(r"[^a-z0-9\s-]", "", ic["name_en"].lower())
                slug = re.sub(r"-+", "-", slug.replace(" ", "-")).strip("-")
                ic["card_url"] = f"/cards/{ic['set'].upper()}/{ic['number']}/{slug}"

        all_cards = incomplete_cards + en_cards

        if not all_cards:
            logger.info("Keine neuen oder unvollstaendigen Karten gefunden. Beende.")
            return

        logger.info(
            f"Gesamt zu scrapen: {len(all_cards)} Karten "
            f"({len(incomplete_cards)} unvollstaendig + {len(en_cards)} neu)"
        )

        if not settings.get("skip_detail_scraping", False):
            logger.info("=" * 60)
            logger.info("PHASE 2: Detail-Seiten scrapen ...")
            logger.info("=" * 60)
            all_cards = scrape_card_details(settings, all_cards, existing_cards, csv_path, append_mode)
        else:
            logger.info("Detail-Scraping uebersprungen (skip_detail_scraping = True).")

        logger.info("=" * 60)
        logger.info("FINALE: Deduplizieren, Sortieren, Speichern ...")
        logger.info("=" * 60)

        all_data = (existing_cards + all_cards) if append_mode else all_cards

        dedup_dict = {}
        for card in all_data:
            key = f"{card.get('set','')}::{card.get('number','')}"
            if key:
                dedup_dict[key] = card
        deduplicated = list(dedup_dict.values())

        logger.info("Sortiere %s Karten (neueste Sets zuerst) ...", len(deduplicated))
        deduplicated.sort(key=sort_key)

        fieldnames = ["name_en", "name_de", "set", "number", "type", "energy_type",
                      "hp", "rarity", "image_url", "international_prints",
                      "cardmarket_url", "card_text"]

        with open(csv_path, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(deduplicated)

        json_data = {
            "timestamp": datetime.now().isoformat(),
            "source": "https://limitlesstcg.com/cards?q=lang%3Aen",
            "total_count": len(deduplicated),
            "cards": deduplicated,
        }
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(json_data, f, indent=2, ensure_ascii=False)

        logger.info("+ CSV gespeichert:  %s", csv_path)
        logger.info("+ JSON gespeichert: %s", json_path)
        logger.info("SUCCESS: All cards database ready!")

    except Exception as e:
        logger.critical(f"KRITISCHER FEHLER - Scraper abgebrochen: {e}", exc_info=True)


if __name__ == "__main__":
    main()