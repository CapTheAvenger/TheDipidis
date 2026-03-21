#!/usr/bin/env python3
"""
Limitless TCG Tournament Cards Scraper - FAST EDITION
=====================================================
Scrapes card usage data from limitlesstcg.com/tournaments
- Uses cloudscraper to safely bypass Cloudflare.
- Uses BeautifulSoup4 for robust and clean HTML parsing.
- Uses ThreadPoolExecutor to download decklists concurrently.
- Supports incremental scraping (resumes where it left off).
"""

import csv
import re
import urllib.parse
import time
import json
import os
import sys
import logging
import threading
import concurrent.futures
from collections import Counter
from typing import List, Dict, Optional, Any, Set, Tuple

try:
    from bs4 import BeautifulSoup
except ImportError:
    print("FEHLER: beautifulsoup4 fehlt! pip install beautifulsoup4")
    sys.exit(1)

from card_scraper_shared import (
    setup_console_encoding, get_app_path, get_data_dir, load_scraped_ids,
    save_scraped_ids, CardDatabaseLookup, is_trainer_or_energy, is_valid_card,
    fetch_page_bs4, setup_logging, load_settings, load_set_order
)

setup_console_encoding()

# ============================================================================
# LOGGING SETUP
# ============================================================================
logger = setup_logging("tournament_scraper")

# ============================================================================
# TOURNAMENT TRACKING (Incremental Scraping)
# ============================================================================
def get_scraped_tournaments_file() -> str:
    return os.path.join(get_data_dir(), "tournament_jh_scraped.json")

def load_scraped_tournaments() -> Set[str]:
    return load_scraped_ids(get_scraped_tournaments_file())

def save_scraped_tournaments(tournament_ids: Set[str]) -> None:
    save_scraped_ids(get_scraped_tournaments_file(), tournament_ids, "scraped_tournament_ids")

# ============================================================================
# SETTINGS
# ============================================================================
DEFAULT_SETTINGS: Dict[str, Any] = {
    "max_tournaments": 150,
    "delay_between_tournaments": 1.0,
    "max_workers": 5,
    "start_tournament_id": 391,
    "output_file": "tournament_cards_data.csv",
    "format_filter": ["Standard"],
    "tournament_types": ["Regional", "Special Event", "LAIC", "EUIC", "NAIC", "Worlds", "International", "Championship"],
    "append_mode": True
}

def _load_settings() -> Dict[str, Any]:
    return load_settings("tournament_JH_settings.json", DEFAULT_SETTINGS, create_if_missing=True)

# ============================================================================
# NETWORK & HTML UTILS
# ============================================================================

# fetch_page_bs4 imported from card_scraper_shared
# Note: shared version uses timeout=15 (was 20 locally)


FORMAT_CODE_BY_SET: Dict[str, str] = {
    "ASC": "SVI-ASC",
    "PFL": "SVI-PFL",
    "MEG": "SVI-MEG",
    "BLK": "SVI-BLK",
    "WHT": "SVI-BLK",
    "DRI": "SVI-DRI",
    "JTG": "SVI-JTG",
    "PRE": "BRS-PRE",
    "SSP": "BRS-SSP",
    "SCR": "BRS-SCR",
    "SFA": "BRS-SFA",
    "TWM": "BRS-TWM",
    "TEF": "BRS-TEF",
    "PAR": "BST-PAR",
    "PAF": "SVI-PAF",
}

FORMAT_NAME_TO_CODE: Dict[str, str] = {
    "scarlet & violet - ascended heroes": "SVI-ASC",
    "scarlet & violet - phantasmal flames": "SVI-PFL",
    "scarlet & violet - mega evolution": "SVI-MEG",
    "scarlet & violet - black bolt": "SVI-BLK",
    "scarlet & violet - white flare": "SVI-BLK",
    "scarlet & violet - black bolt / white flare": "SVI-BLK",
    "scarlet & violet - destined rivals": "SVI-DRI",
    "scarlet & violet - journey together": "SVI-JTG",
    "brilliant stars - prismatic evolutions": "BRS-PRE",
    "brilliant stars - surging sparks": "BRS-SSP",
    "brilliant stars - stellar crown": "BRS-SCR",
    "brilliant stars - shrouded fable": "BRS-SFA",
    "brilliant stars - twilight masquerade": "BRS-TWM",
    "brilliant stars - temporal forces": "BRS-TEF",
    "battle styles - paradox rift": "BST-PAR",
    "meta play!": "Meta Play!",
    "meta live": "Meta Live",
}

FORMAT_CODE_DISPLAY: Dict[str, str] = {
    "SVI-ASC": "Scarlet & Violet - Ascended Heroes",
    "SVI-PFL": "Scarlet & Violet - Phantasmal Flames",
    "SVI-MEG": "Scarlet & Violet - Mega Evolution",
    "SVI-BLK": "Scarlet & Violet - Black Bolt / White Flare",
    "SVI-DRI": "Scarlet & Violet - Destined Rivals",
    "SVI-JTG": "Scarlet & Violet - Journey Together",
    "BRS-PRE": "Brilliant Stars - Prismatic Evolutions",
    "BRS-SSP": "Brilliant Stars - Surging Sparks",
    "BRS-SCR": "Brilliant Stars - Stellar Crown",
    "BRS-SFA": "Brilliant Stars - Shrouded Fable",
    "BRS-TWM": "Brilliant Stars - Twilight Masquerade",
    "BRS-TEF": "Brilliant Stars - Temporal Forces",
    "BST-PAR": "Battle Styles - Paradox Rift",
    "SVI-PAF": "Scarlet & Violet - Paldean Fates",
}


def _load_set_order_map() -> Dict[str, int]:
    raw = load_set_order()
    return {k.upper(): v for k, v in raw.items()}


SET_ORDER_MAP = _load_set_order_map()


def normalize_tournament_format(raw_format: str) -> str:
    raw = str(raw_format or "").strip()
    if not raw:
        return ""

    # Accept already normalized code.
    upper_raw = raw.upper()
    if upper_raw in FORMAT_CODE_DISPLAY:
        return upper_raw

    lowered = raw.lower()
    if lowered in FORMAT_NAME_TO_CODE:
        return FORMAT_NAME_TO_CODE[lowered]

    for name, code in FORMAT_NAME_TO_CODE.items():
        if name in lowered:
            return code

    # Normalize common compact patterns like SVI-ASC, BRS-TEF, BST-PAR.
    compact = re.search(r"\b(SVI|BRS|BST)\s*[-/]\s*([A-Z]{3})\b", upper_raw)
    if compact:
        return f"{compact.group(1)}-{compact.group(2)}"

    # Fallback for bare set codes.
    if upper_raw in FORMAT_CODE_BY_SET:
        return FORMAT_CODE_BY_SET[upper_raw]

    return raw


def infer_format_from_decks(decks_data: List[Dict[str, Any]]) -> str:
    newest_set = ""
    newest_order = -1

    for deck in decks_data:
        for card in deck.get("cards", []):
            set_code = str(card.get("set_code", "") or "").upper().strip()
            if not set_code:
                continue

            order = SET_ORDER_MAP.get(set_code, 0)
            if order > newest_order:
                newest_order = order
                newest_set = set_code

    if newest_set in FORMAT_CODE_BY_SET:
        return FORMAT_CODE_BY_SET[newest_set]

    return ""


def update_formats_catalog(new_formats: List[str]) -> None:
    catalog_path = os.path.join(get_data_dir(), "formats_catalog.json")

    known_codes = set(FORMAT_CODE_DISPLAY.keys())
    observed_codes: Set[str] = set()
    for f in new_formats:
        normalized = normalize_tournament_format(f)
        if normalized:
            observed_codes.add(normalized)

    try:
        if os.path.exists(catalog_path):
            with open(catalog_path, "r", encoding="utf-8") as f:
                existing = json.load(f)
            for row in existing.get("formats", []):
                code = normalize_tournament_format(row.get("code", ""))
                if code:
                    observed_codes.add(code)
    except Exception as e:
        logger.warning("Could not read existing formats catalog: %s", e)

    all_codes = sorted(observed_codes | known_codes)
    payload = {
        "last_updated": time.strftime("%Y-%m-%d %H:%M:%S"),
        "formats": [
            {
                "code": code,
                "name": FORMAT_CODE_DISPLAY.get(code, code),
                "source": "known" if code in known_codes else "scraped"
            }
            for code in all_codes
        ]
    }

    try:
        with open(catalog_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)
        logger.info("Formats catalog updated: %s (%d formats)", catalog_path, len(payload["formats"]))
    except Exception as e:
        logger.warning("Could not write formats catalog: %s", e)

def get_format_code(format_name: str) -> str:
    format_mapping = {
        "Scarlet & Violet - Phantasmal Flames": "SVI-PFL",
        "Scarlet & Violet - Mega Evolution": "SVI-MEG",
        "Scarlet & Violet - Surging Sparks": "SVI-SSP",
        "Scarlet & Violet - Stellar Crown": "SVI-SCR",
        "Scarlet & Violet - Shrouded Fable": "SVI-SFA",
        "Scarlet & Violet - Twilight Masquerade": "SVI-TWM",
        "Scarlet & Violet - Temporal Forces": "SVI-TEF",
        "Scarlet & Violet - Paldean Fates": "SVI-PAF",
        "Scarlet & Violet - Paradox Rift": "SVI-PAR",
        "Scarlet & Violet - Obsidian Flames": "SVI-OBF",
        "Scarlet & Violet - Paldea Evolved": "SVI-PAL",
        "Scarlet & Violet - 151": "SVI-MEW",
        "Scarlet & Violet": "SVI",
        "Sword & Shield - Silver Tempest": "SWS-SIT",
        "Sword & Shield - Lost Origin": "SWS-LOR",
        "Sword & Shield - Astral Radiance": "SWS-ASR",
        "Sword & Shield - Brilliant Stars": "SWS-BRS",
    }
    for full_name, code in format_mapping.items():
        if full_name.lower() in format_name.lower():
            return code
    return normalize_tournament_format(format_name)

# ============================================================================
# TOURNAMENT PARSING
# ============================================================================
def get_tournament_links(base_url: str, start_tournament_id: Optional[int], scraped_ids: Set[str]) -> List[dict]:
    tournaments = []
    seen_ids = set()
    page = 1

    logger.info("Suche nach Turnieren auf Limitless...")

    while page <= 10:
        url = f"{base_url}?show=100&page={page}"
        soup = fetch_page_bs4(url)
        if not soup:
            break

        rows = [tr for tr in soup.select("table tr") if tr.find("td")]
        if not rows:
            break

        found_on_page = 0
        for row in rows:
            link = row.select_one('a[href^="/tournaments/"]')
            if not link:
                continue

            href = link["href"]
            t_id_str = href.split("/")[-1]
            if not t_id_str.isdigit():
                continue

            t_id = int(t_id_str)

            if start_tournament_id and t_id < start_tournament_id:
                logger.info("Stop-ID erreicht (%s < %s). Beende Suche.", t_id, start_tournament_id)
                return tournaments

            if t_id_str not in seen_ids:
                seen_ids.add(t_id_str)
                if t_id_str not in scraped_ids:
                    tournaments.append({
                        "id": t_id_str,
                        "url": f"https://limitlesstcg.com{href}",
                        "cards_url": f"https://limitlesstcg.com{href}/cards"
                    })
                    found_on_page += 1

        if found_on_page == 0:
            break
        page += 1

    return tournaments

def get_tournament_info(url: str) -> dict:
    info = {"name": "Unknown", "date": "", "players": "", "format": "", "meta": "Standard"}
    soup = fetch_page_bs4(url)
    if not soup:
        return info

    html_text = str(soup)

    # 1. Name aus dem Title-Tag extrahieren (viel sicherer)
    title_tag = soup.find("title")
    if title_tag:
        title = title_tag.get_text(strip=True)
        info["name"] = re.sub(r'\s*\|\s*Limitless.*$', '', title, flags=re.IGNORECASE).strip()

    # 2. Datum und Spieler extrahieren
    date_match = re.search(r'(\d{1,2}(?:st|nd|rd|th)?\s+\w+\s+\d{4})', html_text)
    if date_match:
        info["date"] = date_match.group(1)

    players_match = re.search(r'(\d+)\s*Players', html_text, re.IGNORECASE)
    if players_match:
        info["players"] = players_match.group(1)

    # 3. Format aus URL-Parametern extrahieren (falls vorhanden)
    format_code_match = re.search(r'<a[^>]*href=["\'][^"\']*[?&]format=([^"\'&]+)["\'][^>]*>', html_text, re.IGNORECASE)
    if format_code_match:
        raw_format = urllib.parse.unquote(format_code_match.group(1).strip())
        info["format"] = normalize_tournament_format(raw_format)

    # 3b. Fallback: bekannte Format-Namen direkt im Seitentext erkennen
    if not info["format"]:
        page_text = soup.get_text(" ", strip=True).lower()
        for known_name, format_code in FORMAT_NAME_TO_CODE.items():
            if known_name in page_text and format_code not in {"Meta Live", "Meta Play!"}:
                info["format"] = format_code
                break

    # 4. Meta korrekt zuweisen
    is_jp = False
    if "Standard (JP)" in html_text or "Champions League" in info["name"] or "Regional League" in info["name"]:
        is_jp = True

    jp_kr_count = len(re.findall(r'\bKR\b|\bJP\b', html_text))
    total_flags = len(re.findall(r'<img[^>]*flags/[A-Z]{2}\.png', html_text))
    if total_flags > 20 and jp_kr_count > total_flags * 0.7:
        is_jp = True

    if is_jp:
        info["meta"] = "Standard (JP)"
        info["format"] = ""
    # FIX: Suche "Expanded" nur im Format-Namen oder in echten Format-Links, nicht im Menü!
    elif info["format"] == "Expanded" or "format=Expanded" in html_text:
        info["meta"] = "Expanded"

    return info

def get_deck_list_links(url: str) -> List[dict]:
    fetch_url = f"{url}?show=2000"
    soup = fetch_page_bs4(fetch_url)
    if not soup:
        return []

    deck_ids = []
    for a in soup.select('a[href^="/decks/list/"]'):
        deck_ids.append(a["href"].split("/")[-1])

    counts = Counter(deck_ids)
    return [{"url": f"https://limitlesstcg.com/decks/list/{d_id}", "player_count": count} for d_id, count in counts.items()]

# ============================================================================
# DECK PARSING & CARD LOOKUP
# ============================================================================

def extract_single_deck(deck_url: str, card_db: CardDatabaseLookup) -> Tuple[list, str]:
    soup = fetch_page_bs4(deck_url)
    if not soup:
        return [], "Unknown Deck"

    title_elem = soup.select_one(".decklist-title")
    deck_name = title_elem.get_text(strip=True) if title_elem else "Unknown Deck"

    cards = []
    seen = set()

    for col in soup.select(".decklist-column"):
        heading = col.select_one(".decklist-column-heading")
        if not heading:
            continue

        c_type = heading.get_text(strip=True).lower()

        for cdiv in col.select(".decklist-card"):
            count_span = cdiv.select_one(".card-count")
            name_span  = cdiv.select_one(".card-name")

            if not count_span or not name_span:
                continue

            try:
                count = int(count_span.get_text(strip=True))
            except Exception:
                continue

            name = name_span.get_text(strip=True)
            if not is_valid_card(name):
                continue

            set_code = ""
            card_num = ""
            
            # Safe check: Pokémon headers contain "pokémon" (with accent) after
            # .lower(), so checking for plain "pokemon" would ALWAYS fail.
            # Instead: if it's NOT trainer and NOT energy, it must be a Pokémon.
            is_pokemon = "trainer" not in c_type and "energy" not in c_type

            if is_pokemon:
                # POKÉMON: 3-stufige Set-Erkennung (100% Genauigkeit)
                # METHODE 1: Aus href-Link extrahieren (höchste Priorität)
                link_elem = cdiv.find('a', href=True) or name_span.find('a', href=True)
                if link_elem:
                    href = link_elem.get('href', '')
                    # Pattern: /cards/SET/NUMBER oder /cards/format/SET/NUMBER
                    parts = href.split('/cards/')[-1].split('/')
                    if len(parts) >= 3:
                        set_code, card_num = parts[1].upper(), parts[2]
                    elif len(parts) == 2:
                        set_code, card_num = parts[0].upper(), parts[1]
                
                # METHODE 2: <span class="set"> oder <span class="card-set">
                if not set_code or not card_num:
                    set_span = cdiv.find('span', class_=['set', 'card-set'])
                    if set_span:
                        set_text = set_span.get_text(strip=True)
                        match = re.match(r'([A-Z0-9]+)[\s-]+([0-9]+)', set_text, re.IGNORECASE)
                        if match:
                            set_code, card_num = match.group(1).upper(), match.group(2)
                
                # METHODE 3: data-set/data-number Attribute
                if not set_code or not card_num:
                    set_code = cdiv.get("data-set", "").upper()
                    card_num = cdiv.get("data-number", "")
                
                # Set-Code Normalisierung
                if set_code == "PR-SV":
                    set_code = "SVP"
            else:
                # TRAINER/ENERGY: Immer via CardDB auflösen
                db_card = card_db.get_latest_low_rarity_version(name)
                if db_card:
                    set_code, card_num = db_card.set_code, db_card.number

            key = f"{name}|{set_code}|{card_num}".lower()
            if key not in seen:
                seen.add(key)
                cards.append({
                    "count": count,
                    "name": name,
                    "set_code": set_code,
                    "card_number": card_num,
                    "full_name": f"{name} {set_code} {card_num}".strip(),
                    "is_ace_spec": "Yes" if card_db.is_ace_spec_by_name(name) else "No"
                })

    return cards, deck_name

def aggregate_tournament_cards(all_decks: list, t_info: dict, card_db: CardDatabaseLookup) -> list:
    """
    Aggregiert Karten mit neuen Competitive-Metriken:
    - deck_inclusion_count: Anzahl Decks mit dieser Karte (mind. 1x)
    - average_count: Durchschnittliche Anzahl pro Deck, wenn gespielt
    """
    groups = {}
    for d in all_decks:
        groups.setdefault(d["deck_name"], []).append(d)

    aggregated = []

    for arch_name, decks in groups.items():
        total_p = sum(d["player_count"] for d in decks)
        stats = {}

        for d in decks:
            p_cnt = d["player_count"]
            deck_seen = set()

            for c in d["cards"]:
                k = f"{c['name']}|{c['set_code']}|{c['card_number']}".lower()
                if k not in stats:
                    stats[k] = {"total_count": 0, "max_count": 0, "player_count": 0, "sample": c}

                stats[k]["total_count"] += c["count"] * p_cnt
                stats[k]["max_count"] = max(stats[k]["max_count"], c["count"])

                if k not in deck_seen:
                    deck_seen.add(k)
                    stats[k]["player_count"] += p_cnt

        for stat in stats.values():
            samp  = stat["sample"]
            db_c  = card_db.manager.get_card(samp["set_code"], samp["card_number"]) if samp["set_code"] else None
            
            # NEUE METRIKEN (Competitive-Analyse)
            deck_inclusion_count = stat["player_count"]  # Wie viele Decks haben die Karte mind. 1x?
            average_count = round(stat["total_count"] / deck_inclusion_count, 2) if deck_inclusion_count > 0 else 0

            aggregated.append({
                "tournament_id": t_info.get("id", ""),
                "tournament_name": t_info.get("name", ""),
                "meta": t_info.get("format") or "Past Meta",
                "tournament_date": t_info.get("date", ""),
                "archetype": arch_name,
                "card_name": samp["name"],
                "card_identifier": f"{samp['set_code']} {samp['card_number']}".strip(),
                "total_count": stat["total_count"],
                "max_count": stat["max_count"],
                "deck_inclusion_count": deck_inclusion_count,  # NEU
                "average_count": average_count,  # NEU
                "total_decks_in_archetype": total_p,
                "percentage_in_archetype": round((deck_inclusion_count / total_p * 100) if total_p else 0, 2),
                "set_code": samp["set_code"],
                "set_name": db_c.get("set_name", "") if db_c else "",
                "set_number": samp["card_number"],
                "rarity": db_c.get("rarity", "") if db_c else "",
                "type": db_c.get("type", "") if db_c else "",
                "image_url": db_c.get("image_url", "") if db_c else "",
                "is_ace_spec": samp["is_ace_spec"]
            })

    return aggregated

# ============================================================================
# CSV OUTPUT
# ============================================================================
def save_csv_files(data: list, output_file: str, append_mode: bool):
    overview_f = os.path.join(get_data_dir(), output_file.replace(".csv", "_overview.csv"))
    cards_f    = os.path.join(get_data_dir(), output_file.replace(".csv", "_cards.csv"))

    o_rows = [
        {
            "tournament_id": t["id"],
            "tournament_name": t["name"],
            "tournament_date": t.get("date", ""),
            "players": t.get("players", ""),
            "format": t.get("format", ""),
            "cards_url": t["cards_url"],
            "total_cards": t.get("total_cards", 0),
            "status": t["status"]
        }
        for t in data
    ]

    c_rows = []
    for t in data:
        for c in t.get("cards", []):
            cr = c.copy()
            # Formatiere Dezimalzahlen mit Komma für Excel (deutsches Format)
            cr["percentage_in_archetype"] = str(cr["percentage_in_archetype"]).replace(".", ",")
            if "average_count" in cr:
                cr["average_count"] = str(cr["average_count"]).replace(".", ",")
            c_rows.append(cr)

    for f_path, rows in [(overview_f, o_rows), (cards_f, c_rows)]:
        if not rows:
            continue
        fields = list(rows[0].keys())
        mode = "a" if append_mode and os.path.exists(f_path) else "w"
        with open(f_path, mode, newline="", encoding="utf-8-sig") as f:
            writer = csv.DictWriter(f, fieldnames=fields, delimiter=";")
            if mode == "w":
                writer.writeheader()
            writer.writerows(rows)

            formats_for_catalog = [str(row.get("format", "") or "") for row in o_rows]
            update_formats_catalog(formats_for_catalog)

    return overview_f, cards_f

# ============================================================================
# MAIN
# ============================================================================
def main():
    logger.info("=" * 60)
    logger.info("TOURNAMENT SCRAPER JH - FAST EDITION")
    logger.info("=" * 60)

    settings = _load_settings()

    try:
        card_db = CardDatabaseLookup()
    except Exception as e:
        logger.error("Konnte Karten-DB nicht laden: %s", e)
        return

    scraped_ids = load_scraped_tournaments()
    tournaments = get_tournament_links(
        "https://limitlesstcg.com/tournaments",
        settings.get("start_tournament_id"),
        scraped_ids
    )

    if not tournaments:
        logger.info("Keine neuen Turniere gefunden.")
        return

    max_t     = settings["max_tournaments"]
    processed = 0
    newly_scraped: Set[str] = set()

    for t in tournaments:
        if processed >= max_t:
            break

        info = get_tournament_info(t["url"])
        t.update(info)
        t["format"] = normalize_tournament_format(t.get("format", ""))

        name_lower = t["name"].lower()
        if t["meta"] in ["Standard (JP)", "Expanded"]:
            logger.info(f"Ueberspringe: {t['name']} ({t['meta']})")
            continue

        if not any(tt.lower() in name_lower for tt in settings["tournament_types"]):
            continue

        logger.info(f"Lade Turnier: {t['name']} ({t['format']})")
        deck_links = get_deck_list_links(t["url"])

        if not deck_links:
            t["cards"]  = []
            t["status"] = "no decks found"
            newly_scraped.add(t["id"])
            continue

        logger.info("Lade %s Decklisten parallel...", len(deck_links))
        decks_data = []

        with concurrent.futures.ThreadPoolExecutor(max_workers=settings["max_workers"]) as executor:
            futures = {
                executor.submit(extract_single_deck, d["url"], card_db): d
                for d in deck_links
            }
            for future in concurrent.futures.as_completed(futures):
                d_info = futures[future]
                try:
                    c_list, d_name = future.result()
                    if c_list:
                        decks_data.append({
                            "cards": c_list,
                            "player_count": d_info["player_count"],
                            "deck_name": d_name
                        })
                except Exception as e:
                    logger.warning(f"Fehler bei {d_info['url']}: {e}")

        if decks_data:
            if not t.get("format"):
                inferred_format = infer_format_from_decks(decks_data)
                if inferred_format:
                    t["format"] = inferred_format

            t["cards"]       = aggregate_tournament_cards(decks_data, t, card_db)
            t["total_cards"] = len(t["cards"])
            t["status"]      = "success"
        else:
            t["cards"]  = []
            t["status"] = "failed"

        newly_scraped.add(t["id"])
        processed += 1

        # Inkrementelles Speichern nach jedem Turnier
        save_scraped_tournaments(scraped_ids | newly_scraped)
        save_csv_files([t], settings["output_file"], append_mode=(settings["append_mode"] if processed == 1 else True))
        logger.info(f"Gespeichert: {t['name']} ({t['total_cards']} Karten-Eintraege)")

    logger.info("=" * 60)
    logger.info("Scraping beendet. %s Turniere verarbeitet.", processed)
    logger.info("=" * 60)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        logger.critical(f"Abbruch: {e}", exc_info=True)
