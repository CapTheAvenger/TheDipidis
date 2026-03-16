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
    import cloudscraper
    from bs4 import BeautifulSoup
except ImportError:
    print("FEHLER: Es fehlen Bibliotheken! Bitte installiere sie mit:")
    print("pip install cloudscraper beautifulsoup4")
    sys.exit(1)

from card_scraper_shared import setup_console_encoding, get_app_path, get_data_dir, load_scraped_ids, save_scraped_ids, CardDatabaseLookup, is_trainer_or_energy, is_valid_card

setup_console_encoding()

# ============================================================================
# LOGGING SETUP
# ============================================================================
data_dir = get_data_dir()
os.makedirs(data_dir, exist_ok=True)
log_file = os.path.join(data_dir, "tournament_scraper.log")

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

def load_settings() -> Dict[str, Any]:
    app_path = get_app_path()
    settings_path = os.path.join(app_path, "tournament_JH_settings.json")

    if not os.path.exists(settings_path) and os.path.basename(app_path) == "dist":
        parent_path = os.path.dirname(app_path)
        parent_settings_path = os.path.join(parent_path, "tournament_JH_settings.json")
        if os.path.exists(parent_settings_path):
            settings_path = parent_settings_path

    if os.path.exists(settings_path):
        try:
            with open(settings_path, "r", encoding="utf-8-sig") as f:
                content = f.read().strip()
                if not content:
                    return DEFAULT_SETTINGS.copy()
                settings = json.loads(content)
                logger.info("Settings geladen.")
                for k, v in DEFAULT_SETTINGS.items():
                    if k not in settings:
                        settings[k] = v
                return settings
        except Exception as e:
            logger.error(f"Fehler beim Laden der Settings: {e}")
            return DEFAULT_SETTINGS.copy()

    logger.info("Settings nicht gefunden, erstelle Standardwerte.")
    with open(settings_path, "w", encoding="utf-8") as f:
        json.dump(DEFAULT_SETTINGS, f, indent=4)
    return DEFAULT_SETTINGS.copy()

# ============================================================================
# NETWORK & HTML UTILS
# ============================================================================
_thread_local = threading.local()

def _get_scraper() -> cloudscraper.CloudScraper:
    if not hasattr(_thread_local, "scraper"):
        _thread_local.scraper = cloudscraper.create_scraper(
            browser={"browser": "chrome", "platform": "windows", "mobile": False}
        )
    return _thread_local.scraper

def fetch_page_bs4(url: str, retries: int = 2):
    scraper = _get_scraper()
    for attempt in range(1, retries + 2):
        try:
            resp = scraper.get(url, timeout=20)
            resp.raise_for_status()
            return BeautifulSoup(resp.text, "html.parser")
        except Exception as e:
            if attempt <= retries:
                time.sleep(1)
            else:
                logger.debug(f"Fetch fehlgeschlagen: {url} -> {e}")
    return None

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
    return format_name

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
                logger.info(f"Stop-ID erreicht ({t_id} < {start_tournament_id}). Beende Suche.")
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

    # 3. Format direkt aus Format-Link extrahieren
    format_code_match = re.search(r'<a[^>]*href=["\'][^"\']*[?&]format=([^"\'&]+)["\'][^>]*>', html_text, re.IGNORECASE)
    if format_code_match:
        info["format"] = format_code_match.group(1).strip()

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
                "meta": t_info.get("format", "Past Meta"),
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

    return overview_f, cards_f

# ============================================================================
# MAIN
# ============================================================================
def main():
    logger.info("=" * 60)
    logger.info("TOURNAMENT SCRAPER JH - FAST EDITION")
    logger.info("=" * 60)

    settings = load_settings()

    try:
        card_db = CardDatabaseLookup()
    except Exception as e:
        logger.error(f"Konnte Karten-DB nicht laden: {e}")
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

        logger.info(f"Lade {len(deck_links)} Decklisten parallel...")
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
    logger.info(f"Scraping beendet. {processed} Turniere verarbeitet.")
    logger.info("=" * 60)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        logger.critical(f"Abbruch: {e}", exc_info=True)
    finally:
        pass
