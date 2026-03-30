import json
from datetime import datetime, timedelta

# ===================== TECH-RADAR FEATURE =====================
def calculate_tech_trends():
    db_path = "backend/data/unified_card_database.json"
    city_league_path = "backend/data/city_league_data.json"
    limitless_path = "backend/data/limitless_meta_data.json"
    output_path = "backend/data/tech_radar_data.json"

    def load_json(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []

    card_db = {c["name"]: c for c in load_json(db_path)}
    city_league = load_json(city_league_path)
    limitless = load_json(limitless_path)
    all_decks = city_league + limitless

    now = datetime.utcnow()
    week_ago = now - timedelta(days=7)
    def parse_date(d):
        try:
            return datetime.strptime(d, "%Y-%m-%d")
        except Exception:
            return now

    card_counts = {}
    for deck in all_decks:
        seen = set()
        for c in deck.get("cards", []):
            if c["name"] not in seen:
                card_counts[c["name"]] = card_counts.get(c["name"], 0) + 1
                seen.add(c["name"])
    total_decks = len(all_decks)
    staple_blacklist = {name for name, count in card_counts.items() if count / total_decks > 0.6}

    archetype_decks = {}
    for deck in all_decks:
        arch = deck.get("archetype", "Unknown")
        date = parse_date(deck.get("date", deck.get("tournament_date", "")))
        archetype_decks.setdefault(arch, []).append((date, deck))

    tech_cards = []
    for arch, decks in archetype_decks.items():
        decks = sorted(decks, key=lambda x: x[0], reverse=True)
        recent_decks = [d for dt, d in decks if dt >= week_ago]
        prev_week_decks = [d for dt, d in decks if week_ago - timedelta(days=7) <= dt < week_ago]

        card_freq = {}
        for deck in recent_decks:
            for c in deck.get("cards", []):
                card_freq.setdefault(c["name"], []).append(deck)

        prev_freq = {}
        for deck in prev_week_decks:
            for c in deck.get("cards", []):
                prev_freq.setdefault(c["name"], []).append(deck)

        for card, decks_with_card in card_freq.items():
            if card in staple_blacklist:
                continue
            presence = len(decks_with_card) / max(1, len(recent_decks))
            if presence >= 0.3:
                continue
            top_decks = [d for d in recent_decks if d.get("placement", 99) <= 8]
            top4_decks = [d for d in recent_decks if d.get("placement", 99) <= 4]
            in_top8 = any(card in [c["name"] for c in d.get("cards", [])] for d in top_decks)
            in_top4 = any(card in [c["name"] for c in d.get("cards", [])] for d in top4_decks)
            if not in_top8:
                continue
            prev_presence = len(prev_freq.get(card, [])) / max(1, len(prev_week_decks)) if prev_week_decks else 0
            increase = round((presence - prev_presence) * 100, 1)
            if increase <= 0:
                continue
            tech_cards.append({
                "name": card,
                "image_url": card_db.get(card, {}).get("image_url", ""),
                "increase": increase,
                "found_in": arch,
                "highlight": in_top4,
                "newcomer": prev_presence == 0
            })

    tech_cards = sorted(tech_cards, key=lambda x: (not x["highlight"], -x["increase"]))
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(tech_cards, f, indent=2, ensure_ascii=False)
#!/usr/bin/env python3
"""
Current Meta Analysis Scraper - FAST EDITION
============================================
Combines Limitless Online (Meta Live) and Play! Tournaments (Meta Play!).
- Uses cloudscraper for robust Cloudflare bypass.
- Uses BeautifulSoup4 for stable HTML parsing.
- Uses ThreadPoolExecutor for concurrent decklist fetching.
- Outputs card usage by archetype with shared aggregation logic.
"""

import os
import sys
import json
import re
import time
import logging
import threading
import concurrent.futures
from datetime import datetime
from typing import Dict, List, Any, Optional

try:
    from bs4 import BeautifulSoup
except ImportError:
    print("FEHLER: beautifulsoup4 fehlt! pip install beautifulsoup4")
    sys.exit(1)

from backend.core.card_scraper_shared import (
    setup_console_encoding,
    CardDatabaseLookup,
    aggregate_card_data,
    save_to_csv,
    normalize_archetype_name,
    load_scraped_ids,
    save_scraped_ids,
    safe_fetch_html,
    slug_to_archetype,
    setup_logging,
    load_settings
)
from backend.settings import get_data_path, get_config_path

# Fix Windows console encoding
setup_console_encoding()

# ============================================================================
# LOGGING SETUP
# ============================================================================
logger = setup_logging("current_meta_scraper")

# ============================================================================
# TOURNAMENT TRACKING (Incremental Scraping for Meta Play!)
# ============================================================================
def get_scraped_meta_tournaments_file() -> str:
    return str(get_data_path('current_meta_scraped_tournaments.json'))

from typing import Set
def load_scraped_meta_tournaments() -> Set[str]:
    return load_scraped_ids(get_scraped_meta_tournaments_file())

def save_scraped_meta_tournaments(tournament_ids: Set[str]) -> None:
    save_scraped_ids(get_scraped_meta_tournaments_file(), tournament_ids, 'scraped_tournament_ids')

# ============================================================================
# SETTINGS
# ============================================================================
DEFAULT_SETTINGS: Dict[str, Any] = {
    "sources": {
        "limitless_online": {
            "enabled": True,
            "max_decks": 60,
            "max_lists_per_deck": 20,
            "format_filter": "PFL"
        },
        "tournaments": {
            "enabled": True,
            "start_date": "",
            "max_tournaments": 60,
            "max_decks_per_tournament": 128,
            "format_filter": ["Standard", "Standard (JP)"],
            "tournament_types": []
        }
    },
    "delay_between_requests": 1.5,
    "max_workers": 5,
    "request_timeout": 20,
    "max_retries": 2,
    "append_mode": True,
    "output_file": "current_meta_card_data.csv",
}

def _load_settings() -> Dict[str, Any]:
    return load_settings(
        "current_meta_analysis_settings.json", DEFAULT_SETTINGS,
        deep_merge_keys=["sources"], create_if_missing=True
    )

# safe_fetch_html imported from card_scraper_shared

# ============================================================
# META LIVE (play.limitlesstcg.com)
# ============================================================
def _fetch_meta_live_decklist(list_url: str, deck_name: str, deck_slug: str, card_db: CardDatabaseLookup, timeout: int) -> dict:
    """
    Extrahiert Deckliste von play.limitlesstcg.com mit 100%iger Set-Genauigkeit.
    Priorität:
    1. href-Link (/cards/twm/128 -> TWM 128)
    2. <span class="set"> oder <span class="card-set">
    3. Fallback auf CardDB
    """
    html = safe_fetch_html(list_url, timeout)
    if not html:
        return None

    soup = BeautifulSoup(html, 'lxml')
    cards = []

    for a in soup.select('a[href*="/cards/"]'):
        text = a.get_text(strip=True)
        if not text:
            continue

        match = re.match(r'^(\d+)\s+(.+?)(?:\s+\(.*?\))?$', text)
        if not match:
            continue

        count = int(match.group(1))
        name = match.group(2).strip()

        set_code, set_num = "", ""
        
        # METHODE 1: Aus href-Link extrahieren (höchste Priorität)
        href = a.get('href', '')
        parts = href.split('/cards/')[-1].split('/')
        if len(parts) >= 3:
            set_code, set_num = parts[1].upper(), parts[2]
        elif len(parts) == 2:
            set_code, set_num = parts[0].upper(), parts[1]

        # METHODE 2: <span class="set"> oder <span class="card-set">
        if not set_code or not set_num:
            # Suche im parent element oder im link selbst
            parent = a.parent
            set_span = a.find('span', class_=['set', 'card-set']) or (parent.find('span', class_=['set', 'card-set']) if parent else None)
            if set_span:
                set_text = set_span.get_text(strip=True)
                set_match = re.match(r'([A-Z0-9]+)[\s-]+([0-9]+)', set_text, re.IGNORECASE)
                if set_match:
                    set_code, set_num = set_match.group(1).upper(), set_match.group(2)

        # METHODE 3: Fallback auf CardDB (nur wenn nichts gefunden)
        if not set_code or not set_num:
            latest_card = card_db.get_latest_low_rarity_version(name)
            if latest_card:
                set_code, set_num = latest_card.set_code, latest_card.number

        cards.append({
            'name': name,
            'count': count,
            'set_code': set_code,
            'set_number': set_num
        })

    if cards:
        return {
            "archetype": normalize_archetype_name(deck_name),
            "deck_slug": deck_slug,
            "cards": cards,
            "source": "limitless_online"
        }
    return None

def scrape_limitless_online(settings: dict, card_db: CardDatabaseLookup) -> list:
    config = settings.get("sources", {}).get("limitless_online", {})
    if not config.get("enabled", False):
        logger.info("Meta Live (Limitless Online) deaktiviert.")
        return []

    logger.info("=" * 60)
    logger.info("SCRAPING LIMITLESS ONLINE (META LIVE)")
    logger.info("=" * 60)

    max_decks = config.get("max_decks", 60)
    max_lists_per_deck = config.get("max_lists_per_deck", 20)
    format_filter = config.get("format_filter", "PFL")
    timeout = settings.get("request_timeout", 20)
    max_workers = settings.get("max_workers", 5)

    # FIX 1: Das Set direkt an die Basis-URL anhaengen
    decks_url = f"https://play.limitlesstcg.com/decks?game=PTCG&format=standard&set={format_filter}"
    logger.info("Lade Deck-Uebersicht: %s", decks_url)

    html = safe_fetch_html(decks_url, timeout)
    if not html:
        return []

    soup = BeautifulSoup(html, 'lxml')
    deck_links = []
    seen_slugs = set()

    # FIX 2: Einfach alle Deck-Links einsammeln, anstatt hart nach 'set=PFL' zu suchen
    for a in soup.select('a[href^="/decks/"]'):
        href = a.get('href', '')
        if '/matchups' in href.lower() or 'game=' in href.lower():
            continue

        slug_match = re.search(r'/decks/([^"?]+)', href)
        if slug_match:
            slug = slug_match.group(1)
            if slug not in seen_slugs and slug != "other":
                seen_slugs.add(slug)
                # FIX 3: Die URL fuer die Detailseite muss den Filter ebenfalls enthalten
                deck_links.append((slug, f"https://play.limitlesstcg.com/decks/{slug}?format=standard&set={format_filter}"))

    deck_links = deck_links[:max_decks]
    logger.info("%s Archetypes zum Scrapen gefunden.", len(deck_links))

    all_decks = []

    for idx, (slug, url) in enumerate(deck_links, 1):
        deck_name = slug_to_archetype(slug)
        logger.info("[%s/%s] %s (Sammle Decklisten...)", idx, len(deck_links), deck_name)

        deck_html = safe_fetch_html(url, timeout)
        if not deck_html:
            continue

        dsoup = BeautifulSoup(deck_html, 'lxml')
        list_hrefs = list(dict.fromkeys([a['href'] for a in dsoup.select('a[href*="/decklist"]')]))[:max_lists_per_deck]

        if not list_hrefs:
            continue

        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = [
                executor.submit(_fetch_meta_live_decklist, f"https://play.limitlesstcg.com{lh}", deck_name, slug, card_db, timeout)
                for lh in list_hrefs
            ]
            for future in concurrent.futures.as_completed(futures):
                res = future.result()
                if res:
                    all_decks.append(res)

    logger.info("Meta Live: %s vollstaendige Decklisten extrahiert.", len(all_decks))
    return all_decks

# ============================================================
# META PLAY! (labs.limitlesstcg.com)
# ============================================================
def _fetch_meta_play_decklist(url: str, archetype: str, card_db: CardDatabaseLookup, timeout: int) -> dict:
    import html as html_module

    html = safe_fetch_html(url, timeout)
    if not html:
        return None

    soup = BeautifulSoup(html, 'lxml')
    cards = []

    for script in soup.find_all('script'):
        content = script.string
        if not content:
            continue
        if 'pokemon' in content.lower() and 'message' in content.lower():
            try:
                data = json.loads(content)
                body_data = json.loads(data.get('body', '{}'))
                msg = body_data.get('message', {})

                for category in ['pokemon', 'trainer', 'energy']:
                    for c in msg.get(category, []):
                        name = html_module.unescape(c.get('name', '')).replace("\u2019", "'")
                        count = int(c.get('count', 0))
                        set_code = str(c.get('set', '')).strip().upper()
                        set_num = str(c.get('number', '')).strip()

                        if name and count > 0:
                            cards.append({
                                'name': name,
                                'count': count,
                                'set_code': set_code,
                                'set_number': set_num
                            })
                break
            except Exception as exc:
                logger.debug("JSON parse attempt failed: %s", exc)

    if cards and sum(c['count'] for c in cards) == 60:
        return {
            'archetype': normalize_archetype_name(archetype),
            'cards': cards,
            'source': 'Tournament'
        }
    return None

def scrape_tournaments(settings: dict, card_db: CardDatabaseLookup) -> list:
    config = settings.get("sources", {}).get("tournaments", {})
    if not config.get("enabled", False):
        logger.info("Meta Play! (Tournaments) deaktiviert.")
        return []

    logger.info("=" * 60)
    logger.info("SCRAPING TOURNAMENTS (META PLAY! - labs.limitlesstcg.com)")
    logger.info("=" * 60)

    max_tournaments = config.get("max_tournaments", 60)
    max_decks_per_tourney = config.get("max_decks_per_tournament", 128)
    timeout = settings.get("request_timeout", 20)
    max_workers = settings.get("max_workers", 5)
    format_filter = config.get("format_filter", [])

    start_date = None
    if config.get("start_date"):
        try:
            fmt = "%d.%m.%Y" if '.' in config["start_date"] else "%Y-%m-%d"
            start_date = datetime.strptime(config["start_date"], fmt)
        except ValueError:
            logger.warning("Ungueltiges Datumsformat in settings. Nutze DD.MM.YYYY")

    base_url = "https://labs.limitlesstcg.com/"
    html = safe_fetch_html(base_url, timeout)
    if not html:
        return []

    scraped_ids = load_scraped_meta_tournaments()
    t_ids = sorted(list(set(re.findall(r'/(\d+)/standings', html))), key=int, reverse=True)
    new_t_ids = [tid for tid in t_ids if tid not in scraped_ids][:max_tournaments]

    logger.info("Zu verarbeitende neue Turniere: %s (uebersprungen: %s)", len(new_t_ids), len(t_ids) - len(new_t_ids))

    all_decks = []
    newly_scraped_ids = set()

    for idx, tid in enumerate(new_t_ids, 1):
        url = f"https://labs.limitlesstcg.com/{tid}/standings"
        logger.info("[%s/%s] Lade Turnier %s", idx, len(new_t_ids), tid)

        t_html = safe_fetch_html(url, timeout)
        if not t_html:
            continue

        tsoup = BeautifulSoup(t_html, 'lxml')

        title_tag = tsoup.find('title')
        title = title_tag.get_text(strip=True).replace('| Limitless', '').strip() if title_tag else "Unknown"
        is_jp = 'Standard (JP)' in t_html or 'Champions League' in title
        t_format = 'Standard (JP)' if is_jp else ('Expanded' if 'Expanded' in t_html else 'Standard')

        if format_filter and t_format not in format_filter:
            logger.info("   Uebersprungen (Format %s nicht in Filter)", t_format)
            continue

        # Apply date filter
        if start_date:
            # Search in page TEXT (not raw HTML) to avoid matching dates in scripts/attributes
            page_text = tsoup.get_text(' ', strip=True)
            date_match = re.search(
                r'(\w+)\s+(\d{1,2})(?:\s*[-\u2013]\s*(?:\w+\s+)?\d{1,2})?[^,\d]*,?\s*(\d{4})',
                page_text
            )
            if date_match:
                try:
                    t_date = datetime.strptime(
                        f"{date_match.group(1)} {date_match.group(2)} {date_match.group(3)}",
                        "%B %d %Y"
                    )
                    if t_date < start_date:
                        logger.info(f"   Uebersprungen (Datum {t_date.strftime('%d.%m.%Y')} vor Filter {start_date.strftime('%d.%m.%Y')}) - breche ab.")
                        break
                except ValueError:
                    logger.info(f"   Uebersprungen (Datum nicht parsebar: {date_match.group(0)}) - sicherheitshalber uebersprungen.")
                    continue
            else:
                logger.info(f"   Uebersprungen (kein Datum auf Turnierseite {tid} gefunden) - sicherheitshalber uebersprungen.")
                continue

        deck_tasks = []
        for row in tsoup.select('tr'):
            player_link = row.select_one(f'a[href^="/{tid}/player/"]')
            if not player_link:
                continue

            # Decklist link may be separate from the player link (labs HTML structure)
            decklist_link = row.select_one('a[href*="decklist"]')
            if decklist_link:
                deck_url = f"https://labs.limitlesstcg.com{decklist_link['href']}"
            elif 'decklist' in player_link.get('href', ''):
                deck_url = f"https://labs.limitlesstcg.com{player_link['href']}"
            else:
                # Construct decklist URL from player link
                deck_url = f"https://labs.limitlesstcg.com{player_link['href']}/decklist"

            arch_link = row.select_one(f'a[href^="/{tid}/decks/"]')
            if arch_link:
                archetype = slug_to_archetype(arch_link['href'].split('/')[-1])
            else:
                imgs = row.select('img.pokemon')
                archetype = ' '.join(i['alt'].title() for i in imgs if i.has_attr('alt')) or "Unknown"

            deck_tasks.append((deck_url, archetype))

        deck_tasks = deck_tasks[:max_decks_per_tourney]
        logger.info("   %s (%s) -> Lade %s Decks parallel...", title, t_format, len(deck_tasks))

        decks_before = len(all_decks)
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = [executor.submit(_fetch_meta_play_decklist, u, a, card_db, timeout) for u, a in deck_tasks]
            for future in concurrent.futures.as_completed(futures):
                res = future.result()
                if res:
                    all_decks.append(res)

        # Only mark as scraped if we actually retrieved deck data
        if len(all_decks) > decks_before:
            newly_scraped_ids.add(tid)
        else:
            logger.warning("   Keine Decks gefunden fuer Turnier %s – wird NICHT als erledigt markiert.", tid)

    if newly_scraped_ids:
        save_scraped_meta_tournaments(scraped_ids | newly_scraped_ids)
        logger.info("%s neue Turnier-IDs gespeichert.", len(newly_scraped_ids))

    return all_decks

# ============================================================
# AGGREGATION + OUTPUT
# ============================================================
def aggregate_with_meta(all_decks: list, card_db: CardDatabaseLookup, meta_label: str) -> list:
    if not all_decks:
        return []
    aggregated = aggregate_card_data(all_decks, card_db)
    for row in aggregated:
        row["meta"] = meta_label
    return aggregated

# ============================================================
# MAIN
# ============================================================
def main():
    logger.info("=" * 60)
    logger.info("CURRENT META ANALYSIS SCRAPER - FAST EDITION")
    logger.info("=" * 60)

    settings = _load_settings()

    logger.info("Lade einheitliche Karten-Datenbank...")
    try:
        card_db = CardDatabaseLookup()
    except Exception as e:
        logger.error("Konnte Karten-Datenbank nicht laden: %s", e)
        return

    if not card_db.cards:
        logger.error("Karten-Datenbank ist leer!")
        return

    # Reset tournament tracking when not in append mode (clean slate)
    if not settings.get('append_mode', False):
        save_scraped_meta_tournaments(set())
        logger.info("append_mode=false -> Turnier-Tracking zurueckgesetzt.")

    limitless_decks = scrape_limitless_online(settings, card_db)
    tournament_decks = scrape_tournaments(settings, card_db)

    aggregated_data = []
    aggregated_data.extend(aggregate_with_meta(limitless_decks, card_db, "Meta Live"))
    aggregated_data.extend(aggregate_with_meta(tournament_decks, card_db, "Meta Play!"))


    if not aggregated_data:
        logger.info("Keine Daten gesammelt. Vorgang beendet.")
        return

    append_mode = settings.get('append_mode', False)
    save_to_csv(aggregated_data, settings["output_file"], append_mode=append_mode)

    # Tech-Radar berechnen
    try:
        calculate_tech_trends()
        logger.info("Tech-Radar Daten erfolgreich generiert.")
    except Exception as e:
        logger.error(f"Tech-Radar Fehler: {e}")

    logger.info("=" * 60)
    logger.info("SCRAPING KOMPLETT!")
    logger.info("=" * 60)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logger.warning("Scraper durch Benutzer abgebrochen.")
    except Exception as e:
        logger.critical(f"Unerwarteter Fehler: {e}", exc_info=True)
