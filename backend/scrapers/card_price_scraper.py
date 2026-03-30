#!/usr/bin/env python3
"""
Card Price Scraper - TWO-PHASE EDITION (V6 - Set Filters)
=========================================================
PHASE 1: Fast Limitless Baseline für definierte Limitless-Sets.
PHASE 2: Premium Overwrite via Cardmarket (nur Playables/High-Rares aus CM-Sets).
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
    import cloudscraper
except ImportError:
    print("FEHLER: Bibliotheken fehlen! pip install cloudscraper beautifulsoup4 requests")
    sys.exit(1)

from backend.settings import get_data_path, get_config_path
from backend.core.card_scraper_shared import setup_console_encoding, setup_logging, load_settings

setup_console_encoding()
_cm_semaphore = threading.Semaphore(2) # Max 2 Browser gleichzeitig
logger = setup_logging("price_scraper")

def _load_settings() -> dict:
    default_settings = {
        "delay_seconds": 5.0, 
        "max_workers": 10, 
        "headless": True,
        "only_update_sets": ["POR", "ASC", "PFL", "MEG"],
        "limitless_update_sets": ["POR", "ASC", "PFL", "MEG", "MEE", "MEP", "BLK", "WHT", "DRI", "JTG", "PRE", "SSP", "SCR", "SFA", "TWM", "TEF"]
    }
    settings = load_settings("card_price_scraper_settings.json", default_settings)
    
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
        # 1. Wir rufen exakt die Seite der Karte auf
        lt_url = f"https://limitlesstcg.com{card['card_url']}" if card.get("card_url") else f"https://limitlesstcg.com/cards/{card['set']}/{card['number']}"
        resp = std_requests.get(lt_url, timeout=10)
        
        if resp.status_code == 200:
            soup = BeautifulSoup(resp.text, "lxml")
            prints_table = soup.select_one("table.card-prints-versions")
            
            if prints_table:
                # STRATEGIE A: Die aktuell markierte Zeile (class="current") auslesen
                # Das ist der sicherste Weg, weil wir ja genau die URL der Karte aufgerufen haben!
                current_row = prints_table.select_one("tr.current")
                if current_row:
                    eur_link = current_row.select_one("a.card-price.eur")
                    if eur_link:
                        eur_price = eur_link.get_text(strip=True)
                        logger.info("  [P1] LT Baseline [%s]: %s (Exakter Match)", card_id, eur_price)
                
                # STRATEGIE B: Falls Limitless die Zeile nicht als "current" markiert hat,
                # suchen wir exakt nach Set und Nummer in den Links der Tabelle!
                if not eur_price:
                    # Wir suchen nach dem genauen Link-Muster, z.B. /cards/ASC/281
                    exact_path = f"/cards/{card['set'].upper()}/{card['number']}"
                    
                    for row in prints_table.select("tr"):
                        link_elem = row.select_one("a[href]")
                        # Prüfen, ob der Link exakt zu unserer Karte führt
                        if link_elem and link_elem.has_attr('href') and exact_path in link_elem["href"].upper():
                            eur_link = row.select_one("a.card-price.eur")
                            if eur_link:
                                eur_price = eur_link.get_text(strip=True)
                                logger.info("  [P1] LT Baseline [%s]: %s (Link-Match)", card_id, eur_price)
                                break
            
            # STRATEGIE C: Fallback, falls Limitless das Layout ändert oder es nur eine Version gibt
            if not eur_price:
                first_price = soup.select_one("a.card-price.eur")
                if first_price:
                    eur_price = first_price.get_text(strip=True)
                    logger.info("  [P1] LT Baseline [%s]: %s (Fallback)", card_id, eur_price)
                    
    except Exception as e:
        # Fehlermeldung ausgeben, falls die Verbindung unerwartet abbricht
        logger.debug("  [P1] Interner Fehler bei %s: %s", card_id, e)
    
    # Behalte alten Preis, wenn LT nichts findet
    if not eur_price: 
        eur_price = card.get("eur_price", "")
    
    return {**card, "eur_price": eur_price, "last_updated": datetime.now().isoformat()}

# --- PHASE 2: CARDMARKET OVERWRITE (CLOUDSCRAPER + PROXY) ---
def _fetch_cardmarket(card: dict, base_delay: float, is_headless: bool, proxy_str: str) -> dict:
    card_id = f"{card['set']}-{card['number']}"
    cm_url = card.get("cardmarket_url", "")
    new_price = ""

    if not cm_url: 
        logger.warning("  [P2] Ueberspringe [%s]: Keine Cardmarket-URL vorhanden.", card_id)
        return card

    target_url = cm_url + ("&language=1,3" if "?" in cm_url else "?language=1,3")
    
    # NEU: Proxy-Wörterbuch für Cloudscraper vorbereiten
    proxies = {}
    if proxy_str:
        proxies = {
            "http": f"http://{proxy_str}",
            "https": f"http://{proxy_str}"
        }
    
    with _cm_semaphore:
        for attempt in range(4):
            try:
                scraper = cloudscraper.create_scraper(
                    browser={
                        'browser': 'chrome',
                        'platform': 'windows',
                        'desktop': True
                    }
                )
                
                sleep_time = 10.0 + random.uniform(5.0, 15.0)
                logger.debug(f"  [P2] Warte {sleep_time:.1f}s vor Anfrage für {card_id}...")
                time.sleep(sleep_time)
                
                # NEU: Wir geben dem Scraper den IPRoyal-Proxy mit!
                response = scraper.get(target_url, proxies=proxies, timeout=15)

                if response.status_code == 200:
                    html = response.text
                    soup = BeautifulSoup(html, "lxml")
                    
                    for dt in soup.find_all("dt"):
                        if dt.get_text(strip=True).lower() in ("from", "ab"):
                            dd = dt.find_next_sibling("dd")
                            if dd and ("EUR" in dd.text or "€" in dd.text) and "£" not in dd.text:
                                new_price = dd.get_text(strip=True)
                                logger.info("  [P2] CM OVERWRITE [%s]: %s (vorher: %s)", card_id, new_price, card.get('eur_price', 'N/A'))
                                break
                    
                    if new_price:
                        break
                    else:
                        if "Just a moment" in html or "cloudflare" in html.lower():
                             logger.warning("  [P2] CM Warnung [%s]: Cloudflare blockiert (HTTP Status 200) (Versuch %s/2)", card_id, attempt+1)
                        else:
                             logger.warning("  [P2] CM Warnung [%s]: Seite geladen, aber Preis nicht gefunden.", card_id)
                else:
                    logger.warning("  [P2] CM Warnung [%s]: HTTP Status Code %s (Versuch %s/2)", card_id, response.status_code, attempt+1)

            except Exception as e:
                logger.error("  [P2] CM ABSTURZ [%s]: %s", card_id, e)

    if new_price:
        return {**card, "eur_price": new_price, "last_updated": datetime.now().isoformat()}
    else:
        logger.warning("  [P2] CM Fehler [%s] - behalte LT Preis: %s", card_id, card.get('eur_price', ''))
        return card

def main():
    settings = _load_settings()
    cards_csv = str(get_data_path("all_cards_database.csv"))
    prices_csv = str(get_data_path("price_data.csv"))
    cards = load_cards_to_update(cards_csv)
    
    if not cards: return

    # --- SETUP: Listen aus Settings laden ---
    limitless_sets = [s.upper() for s in settings.get("limitless_update_sets", [])]
    cm_sets = [s.upper() for s in settings.get("only_update_sets", [])]

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
        host = p.get("proxy_host") or p.get("host") or "geo.iproyal.com"
        port = p.get("proxy_port") or p.get("port") or "12321"
        
        # WICHTIG: Wir übergeben NUR noch Host und Port. 
        # Keine Usernamen und Passwörter mehr! IPRoyal authentifiziert uns über die Whitelist.
        proxy_str = f"{host}:{port}"

    # ==========================================
    # PHASE 1: LIMITLESS BASELINE
    # ==========================================
    cards_for_phase1 = []
    for c in cards:
        if not limitless_sets or c['set'].upper() in limitless_sets:
            cards_for_phase1.append(c)

    logger.info("="*60)
    logger.info("PHASE 1: Lade Limitless Baseline fuer %s gueltige Karten...", len(cards_for_phase1))
    logger.info("="*60)
    
    phase1_results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(_fetch_limitless, c) for c in cards_for_phase1]
        for i, f in enumerate(concurrent.futures.as_completed(futures)):
            phase1_results.append(f.result())
            if (i+1) % 500 == 0: logger.info("  ... %s/%s Baseline-Preise gecheckt", i+1, len(cards_for_phase1))
            
    save_prices(phase1_results, prices_csv)

    # ==========================================
    # PHASE 2: CARDMARKET OVERWRITE (PREMIUM)
    # ==========================================
    logger.info("="*60)
    logger.info("PHASE 2: Filtere VIP Karten fuer Cardmarket Overwrite...")
    logger.info("="*60)

    cm_vip_cards = []
    for card in phase1_results:
        c_set = card.get('set', '').upper()
        if cm_sets and c_set not in cm_sets:
            continue
            
        c_name = card['name'].lower()
        c_num = card['number'].upper()
        rarity = card.get('rarity', '').lower()
        
        # 1. Absolute Chase-Karten (Alt Arts, Secret Rares, Gold, Promos -> IMMER Cardmarket wegen Sammlerwert)
        is_chase_card = (
            any(x in c_num for x in ["SIR", "GG", "TG", "SV", "AR", "FA", "PROMO"]) or
            (c_num.count('/') > 0 and int(c_num.split('/')[0]) > 160) or
            any(x in rarity for x in ['secret', 'illustration', 'hyper', 'special'])
        )

        # 2. Double Rares & Ultra Rares (Erkannt am Namen ODER exakt an der Rarität)
        is_double_or_ultra = (
            any(x in c_name for x in [' ex', '-ex', ' gx', ' v', ' vmax', ' vstar']) or
            any(x in rarity for x in ['double', 'ultra', 'amazing', 'radiant', 'shiny', 'ur', 'dr', 'rr', 'hr', 'sr'])
        )

        # 3. Ist sie Meta/Playable?
        is_playable = c_name in playable_names

        # ENTSCHEIDUNG:
        # - Chase-Karten (Alt Arts, Gold) gehen immer zu CM.
        # - Double/Ultra Rares gehen NUR zu CM, wenn sie auch in Decks gespielt werden.
        # - Normale Rares, Uncommons, Commons fallen komplett durch (auch wenn sie spielbar sind).
        if is_chase_card or (is_double_or_ultra and is_playable):
            cm_vip_cards.append(card)

    urls_present = sum(1 for c in cm_vip_cards if c.get('cardmarket_url'))
    logger.info("-> %s VIP Karten aus %s Sets identifiziert (%s davon haben eine CM-URL!).", len(cm_vip_cards), len(cm_sets), urls_present)
    
    final_results = []
    cm_workers = 1
    
    if cm_vip_cards:
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
