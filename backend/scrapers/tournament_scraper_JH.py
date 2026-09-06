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
import stat
import sys
import logging
import threading
import concurrent.futures
from collections import Counter
from datetime import datetime
from typing import List, Dict, Optional, Any, Set, Tuple

try:
    from bs4 import BeautifulSoup
except ImportError:
    print("FEHLER: beautifulsoup4 fehlt! pip install beautifulsoup4")
    sys.exit(1)

from card_scraper_shared import (
    setup_console_encoding, get_app_path, get_data_dir, load_scraped_ids,
    save_scraped_ids, CardDatabaseLookup, is_trainer_or_energy, is_valid_card,
    fetch_page_bs4, setup_logging, load_settings, load_set_order,
    extract_cards_from_decklist_soup, atomic_write_file
)
# Dieselbe Regel wie in der Bestandsreparatur — card_scraper_shared liegt
# neben ace_spec_regel, der Pfad ist zu diesem Zeitpunkt also schon gesetzt.
from ace_spec_regel import entscheide_zeile, lade_ace_liste

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
    "temporal forces - perfect order": "TEF-POR",
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
    "TEF-POR": "Temporal Forces - Perfect Order",
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


# ── Date-based meta fallback ──────────────────────────────────────────────────
# When the limitless tournament API doesn't echo a `format` field (happens
# for events that ran very recently and haven't been classified yet), we
# derive the meta from the tournament_date using format_window.json's
# in_person_legal_date + current_set boundary. Mirrors the labs scraper's
# _derive_meta_from_date but with a simpler "current vs previous" split
# since this scraper doesn't have the multi-meta date-range cache.

def _derive_meta_from_date_JH(date_iso: str) -> str:
    """Pick the meta key for a tournament whose API record omitted format.

    Reads data/format_window.json:
      • current_set + previous_format_key define the active rotation
      • in_person_legal_date is the cutoff between previous and current

    Accepts both ISO 'YYYY-MM-DD' and the English-ordinal format that
    get_tournament_info() scrapes off the page ('6th June 2026'). The
    raw page-scraped string was the actual hit — when this function
    only parsed ISO, Turin (date='6th June 2026') returned '' here,
    caller hit `api_format or "Past Meta"` and tagged the row 'Past
    Meta' even though the date sits AFTER in_person_legal_date.

    Returns 'TEF-CRI' / 'TEF-POR' style key, or '' if the date can't be
    parsed (caller defaults to 'Past Meta' as before)."""
    if not date_iso:
        return ''
    d = None
    try:
        d = datetime.strptime(date_iso, '%Y-%m-%d')
    except ValueError:
        d = _parse_english_ordinal_date(date_iso)
    if d is None:
        return ''
    data_dir = get_data_dir()
    fw_path = os.path.join(data_dir, 'format_window.json')
    if not os.path.exists(fw_path):
        return ''
    try:
        with open(fw_path, encoding='utf-8') as f:
            fw = json.load(f)
    except Exception:
        return ''
    current = (fw.get('current_set') or '').strip().upper()
    previous = (fw.get('previous_format_key') or '').strip().upper()
    oldest_legal = (fw.get('oldest_legal_set') or '').strip().upper()
    legal_str = (fw.get('in_person_legal_date') or '').strip()
    if not legal_str:
        return ''
    try:
        legal = datetime.strptime(legal_str, '%Y-%m-%d')
    except ValueError:
        return ''
    if d >= legal and current:
        # After in-person legal date → current format
        # Build full key like "TEF-CRI" if oldest_legal_set known
        return f'{oldest_legal}-{current}' if oldest_legal else current
    if d < legal and previous:
        return previous
    return ''



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

    # 3. Format aus den Decks-Links lesen — ueber das href-ATTRIBUT.
    #
    # Hier stand ein Regex gegen str(soup). Beim Re-Serialisieren
    # verwandelt BeautifulSoup jedes & in &amp;, und ein Muster, das nach
    # dem nackten [?&]format= sucht, findet dann nichts mehr. Nachgestellt
    # am 21.08.2026 mit bs4:
    #
    #     href="/tournaments/540/decks?time=all&format=TEF-CRI"
    #       -> str(soup) liefert "...&amp;format=TEF-CRI"
    #       -> alter Regex: kein Treffer
    #       -> href-Attribut:  TEF-CRI
    #
    # Getroffen hat der alte Weg nur dort, wo format der EINZIGE oder
    # erste Parameter war. Deshalb stehen in
    # data/tournament_cards_data_overview.csv zwei Zeilen ohne Format da —
    # Turin (540) und NAIC (518) —, waehrend dieselben Turniere in der
    # Kartendatei meta='TEF-CRI' tragen.
    #
    # Genau dieser Fehler ist in _fetch_current_format weiter unten schon
    # beschrieben UND behoben; die Korrektur ist hier nie angekommen. Sie
    # ist zeitkritisch: die Weltmeisterschaft steht bevor, und ihre
    # Uebersichtszeile bekaeme sonst mit einiger Wahrscheinlichkeit
    # wieder ein leeres Format.
    for _a in soup.select('a[href]'):
        _m = re.search(r'[?&]format=([^&]+)', _a.get('href') or '', re.IGNORECASE)
        if _m:
            info["format"] = normalize_tournament_format(
                urllib.parse.unquote(_m.group(1).strip()))
            if info["format"]:
                break

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
    # Expanded is taken ONLY from the parsed format link (section 3 above),
    # never from a raw "format=Expanded" substring anywhere on the page — a
    # Standard event whose page merely links an Expanded format view (menu,
    # related-tournaments sidebar) would otherwise be misclassified Expanded
    # and dropped from the Standard cards pipeline. This was the suspected
    # cause of NAIC (TID 518) never reaching tournament_cards_data: discovered
    # every run, then skipped at the meta filter. (The old broad substring
    # check contradicted this function's own comment.)
    elif info["format"] == "Expanded":
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

_DECK_NAME_PRICE_RE = re.compile(r'\s*\d+(?:[.,]\d+)?\s*\$\s*\d+(?:[.,]\d+)?\s*[€$]\s*$')


def _clean_deck_name(name: str) -> str:
    """Strip the price tag Limitless appends to .decklist-title.

    Real-world contamination observed 2026-04: title element renders as
    'Lucario Hariyama15.56$10.28€' because the dollar/EUR price chips
    live inside the same .decklist-title node and get_text() concats
    them. The trailing pattern is unambiguous: <n>.<n>$<n>.<n>€ at the
    end of the string. Stripping it leaves the clean archetype name.
    """
    if not name:
        return name
    cleaned = _DECK_NAME_PRICE_RE.sub('', name).strip()
    return cleaned or name  # never return empty if regex over-matches


def extract_single_deck(deck_url: str, card_db: CardDatabaseLookup) -> Tuple[list, str]:
    soup = fetch_page_bs4(deck_url)
    if not soup:
        return [], "Unknown Deck"

    title_elem = soup.select_one(".decklist-title")
    raw_deck_name = title_elem.get_text(strip=True) if title_elem else "Unknown Deck"
    deck_name = _clean_deck_name(raw_deck_name)

    # Use shared extraction, then enrich with tournament-specific fields
    raw_cards = extract_cards_from_decklist_soup(soup, card_db)

    cards = []
    seen = set()
    for c in raw_cards:
        name = c['name']
        if not is_valid_card(name):
            continue
        sc, sn = c['set_code'], c['set_number']
        key = f"{name}|{sc}|{sn}".lower()
        if key not in seen:
            seen.add(key)
            cards.append({
                "count": c['count'],
                "name": name,
                "set_code": sc,
                "card_number": sn,
                "full_name": f"{name} {sc} {sn}".strip(),
                # Belegt statt geraten — siehe backend/core/ace_spec_regel.py.
                # c['count'] ist die Zahl der Kopien in DIESEM Deck; mehr als
                # eine schliesst eine ACE SPEC aus.
                "is_ace_spec": ("Yes" if card_db.is_ace_spec_by_name(name)
                                else entscheide_zeile(name, lade_ace_liste(),
                                                      c['count'], c.get('type', '')))
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

            # 2026-06-08 — when limitlesstcg's tournament API doesn't
            # echo back a format, fall back to a date-derived meta
            # using format_window.json. The previous "Past Meta"
            # default tagged Turin (2026-06-07) as "Past Meta" because
            # limitless's API hadn't classified the tournament yet,
            # which then propagated downstream: labs scraper's
            # name-based meta lookup matched Turin against the
            # "Past Meta" cards CSV, so the labs CSV row got meta=
            # "Past Meta" instead of "TEF-CRI". The predictor's
            # active-format filter then dropped Turin entirely.
            api_format = t_info.get("format")
            if not api_format:
                api_format = _derive_meta_from_date_JH(t_info.get("date", ""))
            aggregated.append({
                "tournament_id": t_info.get("id", ""),
                "tournament_name": t_info.get("name", ""),
                "meta": api_format or "Past Meta",
                "tournament_date": _datum_mit_override(
                    t_info.get("id", ""), t_info.get("date", "")),
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
                # NEU ENTSCHIEDEN, NICHT AUS DER EINZELZEILE UEBERNOMMEN.
                #
                # BEFUND (01.09.2026): 180 Pokemon-Zeilen in
                # tournament_cards_data_cards_TEF-PBL.csv standen mit leerem
                # is_ace_spec da — Meowth ex, Fezandipiti ex, Shaymin. Bei
                # einem Pokemon ist die Frage aber immer entscheidbar: ein
                # Pokemon ist nie eine ACE SPEC.
                #
                # Ursache: extract_cards_from_decklist_soup() liefert
                # {name, count, set_code, set_number} und KEIN type. Die
                # Entscheidung oben in extract_single_deck() bekommt also
                # immer typ="" und kann nur ueber die Kopienzahl gehen —
                # bei einer einzeln gespielten Karte bleibt sie leer.
                #
                # Hier ist die Lage besser: db_c traegt den Typ, und
                # stat["max_count"] ist das Maximum ueber ALLE Decks statt
                # der Kopienzahl eines einzigen. Beides ist strengere
                # Evidenz, also wird hier neu entschieden. Die Einzelzeile
                # bleibt der Rueckfall — sie kann ein "Yes" tragen, das aus
                # der Namensliste kam und den db_c-Weg nicht braucht.
                "is_ace_spec": (samp["is_ace_spec"] if samp["is_ace_spec"] == "Yes"
                                else (entscheide_zeile(
                                          samp["name"], lade_ace_liste(),
                                          stat["max_count"],
                                          (db_c.get("type", "") if db_c else ""))
                                      or samp["is_ace_spec"]))
            })

    return aggregated

# ============================================================================
# CSV OUTPUT
# ============================================================================
_US_STATE_CODES = {
    'al','ak','az','ar','ca','co','ct','de','fl','ga','hi','id','il','in','ia',
    'ks','ky','la','me','md','ma','mi','mn','ms','mo','mt','ne','nv','nh','nj',
    'nm','ny','nc','nd','oh','ok','or','pa','ri','sc','sd','tn','tx','ut','vt',
    'va','wa','wv','wi','wy','dc',
}

def _normalize_tournament_name_for_match(name: str) -> str:
    """Match key for cross-referencing limitlesstcg.com tournament names
    against labs.limitlesstcg.com names. Limitless main-site uses
    "Regional Houston, TX – Limitless"; labs uses "Regional Championship
    Houston". Strip dashes, the championship/limitless/event-type
    boilerplate, and US two-letter state codes so the remaining city
    tokens line up."""
    s = (name or "").lower()
    s = re.sub(r'[–—\-]', ' ', s)
    s = re.sub(r'\b(championships?|limitless|regional|special event|international|world|stadium|tcg)\b', ' ', s)
    s = re.sub(r'[^a-z0-9]+', ' ', s)
    tokens = [tok for tok in s.split() if tok not in _US_STATE_CODES]
    return ' '.join(tokens)


def _parse_iso_date(date_str: str) -> str:
    """Convert Limitless's "16th May 2026" or already-ISO "2026-05-16"
    into a stable YYYY-MM-DD key. Falls back to the raw string if the
    format is unrecognised — the lookup will then just miss for that
    tournament instead of crashing the whole save."""
    raw = (date_str or "").strip()
    if not raw:
        return ""
    # Already ISO?
    if re.match(r'^\d{4}-\d{2}-\d{2}', raw):
        return raw[:10]
    cleaned = re.sub(r'(\d+)(st|nd|rd|th)', r'\1', raw, flags=re.IGNORECASE)
    for fmt in ("%d %B %Y", "%d %b %Y", "%B %d %Y", "%b %d %Y"):
        try:
            return datetime.strptime(cleaned, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return raw


_LABS_ID_LOOKUP_CACHE = None
_LABS_ID_OVERRIDES_CACHE = None


def _load_labs_id_overrides() -> Dict[str, str]:
    """data/labs_tournament_id_overrides.json provides manual
    cards-tid → labs-tid mappings for tournaments where the name-based
    cross-reference fails (Sevilla vs Seville, EUIC vs International
    Championship London, etc.). Returns {cards_tid: labs_tid}. Cached."""
    global _LABS_ID_OVERRIDES_CACHE
    if _LABS_ID_OVERRIDES_CACHE is not None:
        return _LABS_ID_OVERRIDES_CACHE
    path = os.path.join(get_data_dir(), "labs_tournament_id_overrides.json")
    out: Dict[str, str] = {}
    if os.path.exists(path):
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            for cards_tid, info in (data.get("overrides") or {}).items():
                if isinstance(info, dict):
                    labs_tid = (info.get("labs_tournament_id") or "").strip()
                else:
                    labs_tid = str(info).strip()
                if labs_tid:
                    out[str(cards_tid).strip()] = labs_tid
        except Exception as e:
            logger.warning("[labs-id-overrides] Could not parse %s: %s", path, e)
    _LABS_ID_OVERRIDES_CACHE = out
    logger.info("[labs-id-overrides] loaded %d manual mappings", len(out))
    return out


_DATE_OVERRIDES_CACHE: Optional[Dict[str, dict]] = None


def _load_date_overrides() -> Dict[str, dict]:
    """Korrigierte Turnierdaten aus data/labs_tournament_id_overrides.json.

    Limitless ist unsere Quelle, aber nicht unfehlbar. Gemessen am
    22.08.2026: Turnier 518 (NAIC 2026, New Orleans, 3.752 Spieler)
    steht dort — in der Liste UND auf der Turnierseite — auf dem
    10. Juni 2026. Das war ein Mittwoch. Ein International
    Championship dieser Groesse laeuft Freitag bis Sonntag; das
    Turnier fand vom 12. bis 14. Juni statt.

    Wir uebernehmen die Quelle sonst unveraendert. Wo sie nachweislich
    falsch liegt, steht die Korrektur hier — mit Begruendung, an
    derselben Stelle wie die Labs-ID-Zuordnungen, und nicht als stille
    Handkorrektur in der CSV, die der naechste Lauf ueberschreibt.

    Rueckgabe: {tournament_id: {"tournament_date": ..., "reason": ...}}
    """
    global _DATE_OVERRIDES_CACHE
    if _DATE_OVERRIDES_CACHE is not None:
        return _DATE_OVERRIDES_CACHE
    path = os.path.join(get_data_dir(), "labs_tournament_id_overrides.json")
    out: Dict[str, dict] = {}
    if os.path.exists(path):
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            for tid, info in (data.get("overrides") or {}).items():
                if isinstance(info, dict) and (info.get("tournament_date") or "").strip():
                    out[str(tid).strip()] = {
                        "tournament_date": info["tournament_date"].strip(),
                        "reason": (info.get("date_reason") or "").strip(),
                    }
        except Exception as e:
            logger.warning("[date-overrides] Konnte %s nicht lesen: %s", path, e)
    _DATE_OVERRIDES_CACHE = out
    if out:
        logger.info("[date-overrides] %d korrigierte Turnierdaten geladen: %s",
                    len(out), ", ".join(sorted(out)))
    return out


def _datum_mit_override(tournament_id: str, datum_aus_quelle: str) -> str:
    """Das korrigierte Datum, falls eines hinterlegt ist — sonst die Quelle."""
    eintrag = _load_date_overrides().get(str(tournament_id).strip())
    if not eintrag:
        return datum_aus_quelle
    logger.info("[date-overrides] Turnier %s: %r aus der Quelle wird zu %r (%s)",
                tournament_id, datum_aus_quelle, eintrag["tournament_date"],
                eintrag["reason"] or "ohne Begruendung")
    return eintrag["tournament_date"]


def _build_labs_id_lookup() -> dict:
    """One-time scan of every labs_tournament_decks_*.csv in the data
    dir to build a (normalized_name, iso_date) → labs_tournament_id map.
    Used by save_csv_files to enrich the overview CSV with the matching
    labs tournament_id so the Meta Call frontend can cross-reference
    cards-CSV rows against labs-CSV rows without re-resolving names at
    runtime. Cached — labs CSVs don't change mid-scrape."""
    global _LABS_ID_LOOKUP_CACHE
    if _LABS_ID_LOOKUP_CACHE is not None:
        return _LABS_ID_LOOKUP_CACHE

    lookup = {}
    data_dir = get_data_dir()
    try:
        for fname in os.listdir(data_dir):
            if not fname.startswith("labs_tournament_decks_") or not fname.endswith(".csv"):
                continue
            try:
                with open(os.path.join(data_dir, fname), newline="", encoding="utf-8") as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        tid = (row.get("tournament_id") or "").strip()
                        name = (row.get("tournament_name") or "").strip()
                        date_str = (row.get("tournament_date") or "").strip()
                        if not tid or not name:
                            continue
                        key = (_normalize_tournament_name_for_match(name), _parse_iso_date(date_str))
                        if key not in lookup:
                            lookup[key] = tid
            except Exception as e:
                logger.warning(f"[labs-id-lookup] Could not read {fname}: {e}")
    except FileNotFoundError:
        logger.warning("[labs-id-lookup] data dir missing; lookup will be empty")

    _LABS_ID_LOOKUP_CACHE = lookup
    logger.info(f"[labs-id-lookup] indexed {len(lookup)} tournaments")
    return lookup


def _resolve_labs_tournament_id(name: str, date_str: str, cards_tid: str = "") -> str:
    """Look up the labs.limitlesstcg.com tournament_id (4-digit padded)
    that corresponds to a limitlesstcg.com tournament (3-digit). Manual
    overrides in labs_tournament_id_overrides.json win over the name-
    based match — they exist precisely because the names diverge.
    Returns '' if no match — caller writes empty cell."""
    cards_tid = str(cards_tid or "").strip()
    overrides = _load_labs_id_overrides()
    if cards_tid and cards_tid in overrides:
        return overrides[cards_tid]
    if not name:
        return ""
    lookup = _build_labs_id_lookup()
    key = (_normalize_tournament_name_for_match(name), _parse_iso_date(date_str))
    return lookup.get(key, "")



# ----------------------------------------------------------------------------
# Ausgangspruefung: was hier nicht durchkommt, wird nicht geschrieben
# ----------------------------------------------------------------------------
#
# Am 20.08.2026 lagen in data/tournament_cards_data_cards_TEF-CRI.csv
# 1.263 von 2.737 Zeilen (46,1 %) zerrissen vor — alle aus Turnier 540.
# Ein Python-Listen-Text ("['0', '0']") war in die Zeile geraten und hatte
# drei Spalten auseinandergeschnitten:
#
#     ...;12;4;3;"4,""['0";3;100', '0;ASC;...;"No']"""
#
# Aus average_count wurde `4,"['0`, aus percentage_in_archetype `100', '0`,
# aus is_ace_spec `No']"`. TEF-CRI ist der Standard-Chunk des Reiters
# "Vergangenes Meta"; die Datei wurde ausgeliefert und angezeigt, ohne dass
# irgendwo etwas auffiel. Kein Lauf hat je geprueft, was er geschrieben hat.
#
# Diese Pruefung laeuft unmittelbar vor dem Schreiben und bricht ab, statt
# eine kaputte Datei zu veroeffentlichen. Lieber kein neuer Stand als ein
# falscher — dieselbe Regel wie in scripts/data_guardian.py.
_ZAHL_FORM = re.compile(r"^-?\d+(?:[.,]\d+)?$")


def _pruefe_kartenzeilen(rows, ziel):
    """Bricht ab, wenn eine Kartenzeile nicht die erwartete Form hat."""
    fehler = []
    for i, r in enumerate(rows):
        for feld in ("average_count", "percentage_in_archetype"):
            if feld not in r:
                continue
            wert = str(r.get(feld, ""))
            if wert and not _ZAHL_FORM.match(wert):
                fehler.append("%s Zeile %d: %s=%r" % (ziel, i, feld, wert))
        ace = str(r.get("is_ace_spec", "")).strip()
        if ace and ace not in ("Yes", "No", "True", "False", "1", "0"):
            fehler.append("%s Zeile %d: is_ace_spec=%r" % (ziel, i, ace))
        if len(fehler) >= 10:
            break
    if fehler:
        raise ValueError(
            "Kartenzeilen sind nicht schreibbar: %d Verstoss/Verstoesse in %d "
            "Zeilen. Nichts geschrieben.\n  %s"
            % (len(fehler), len(rows), "\n  ".join(fehler))
        )


class KopfzeileUnlesbar(RuntimeError):
    """Die Zieldatei ist da, laesst sich aber nicht lesen.

    Bewusst eine eigene Ausnahme und bewusst KEIN stiller Rueckfall auf
    "dann eben neu schreiben": ein Lesefehler und "die Datei gibt es noch
    nicht" sehen fuer den Aufrufer sonst gleich aus, und der Neuschreib-Weg
    wuerde einen Bestand von 111 MB durch die paar Zeilen des aktuellen
    Laufs ersetzen — ohne eine einzige Meldung. Lieber laut abbrechen:
    ein gemeldetes Loch ist behebbar, ein stiller Totalverlust nicht.
    (Angemerkt von der unabhaengigen Pruefung am 06.09.2026.)
    """


def _vorhandene_kopfzeile(pfad: str):
    """Die Spaltennamen der schon vorhandenen Datei.

    Rueckgabe:
      * ``None``  — die Datei gibt es nicht
      * ``[]``    — die Datei ist da, aber leer (hat also keine Kopfzeile)
      * ``[...]`` — die Spaltennamen

    Wirft ``KopfzeileUnlesbar``, wenn die Datei da ist und sich nicht lesen
    laesst. Siehe die Ausnahme selbst fuer die Begruendung.
    """
    if not os.path.exists(pfad):
        return None
    try:
        with open(pfad, newline="", encoding="utf-8-sig") as f:
            return next(csv.reader(f, delimiter=";"), [])
    except Exception as e:  # noqa: BLE001
        raise KopfzeileUnlesbar(
            "%s ist vorhanden, aber die Kopfzeile ist nicht lesbar (%s). "
            "Der Lauf bricht ab, statt den Bestand zu ueberschreiben."
            % (pfad, e)
        ) from e


# Ueberzaehlige Werte einer beschaedigten Zeile sammelt csv.DictReader unter
# diesem Schluessel. Ein eigenes Objekt statt einer Zeichenkette: eine
# Kopfzeilenspalte koennte genauso heissen wie jeder Name, den man hier
# einsetzt, und eine heile Datei mit dieser Spalte waere dann faelschlich
# als beschaedigt gemeldet worden. Ein object() kann keine Kopfzeilenspalte
# sein — csv liest Kopfzeilenfelder immer als str.
# (Angemerkt von der unabhaengigen Pruefung am 06.09.2026.)
_UEBERZAEHLIG = object()


def _pruefe_felder(rows: list, felder: list, pfad: str):
    """Wirft, wenn eine Zeile ein Feld traegt, das die Kopfzeile nicht kennt.

    Dieselbe Fehlerklasse, gegen die der ganze Helfer antritt — nur
    innerhalb EINER Charge statt zwischen zwei Laeufen. Der alte
    csv.DictWriter stand auf "raise" und hat das bemerkt; hier faellt es
    nur frueher auf, naemlich bevor die erste Zeile auf der Platte steht.
    """
    bekannt = set(felder)
    for i, r in enumerate(rows):
        fremd = [k for k in r if k not in bekannt]
        if fremd:
            raise ValueError(
                "%s: Zeile %d traegt Felder, die die Kopfzeile nicht kennt: %s"
                % (os.path.basename(pfad), i, ", ".join(sorted(fremd)))
            )


def _zaehle_ueberzaehlige(pfad: str) -> list:
    """Liest den Bestand und wirft, wenn eine Zeile mehr Werte traegt als
    die Kopfzeile Spalten hat.

    Genau so sieht aus, was die alte Falle hinterlassen hat. Beim
    Neuschreiben liessen sich diese Werte keiner Spalte zuordnen — sie
    waeren nach dem ersten Lauf endgueltig weg. "Report, don't silently
    repair" (CLAUDE.md). Gibt bei heiler Datei die gelesenen Zeilen
    zurueck, damit der Schreibweg sie nicht ein zweites Mal liest.
    """
    with open(pfad, newline="", encoding="utf-8-sig") as f:
        bestand = list(csv.DictReader(f, delimiter=";", restkey=_UEBERZAEHLIG))
    kaputt = sum(1 for r in bestand if r.get(_UEBERZAEHLIG))
    if kaputt:
        raise KopfzeileUnlesbar(
            "%s: %d von %d vorhandenen Zeilen tragen mehr Werte als die "
            "Kopfzeile Spalten hat. Diese Werte liessen sich beim "
            "Neuschreiben keiner Spalte zuordnen und waeren danach weg. "
            "Der Lauf bricht ab — die Datei gehoert erst repariert."
            % (pfad, kaputt, len(bestand))
        )
    return bestand


def _pruefe_ziel_schreibbar(pfad: str, rows: list, append_mode: bool):
    """Alles pruefen, was `_schreibe_csv_kopftreu` spaeter zum Abbruch
    bringen koennte — ohne eine Datei anzufassen.

    Damit ein Abbruch an der ZWEITEN Zieldatei kein halb geschriebenes
    Turnier hinterlaesst. Die Pruefung ist bewusst dieselbe, die der
    Schreibweg selbst noch einmal macht: hier darf sie nicht das Ergebnis
    bestimmen, sondern nur den Zeitpunkt vorziehen.
    """
    if not rows:
        return
    neue_felder = list(rows[0].keys())
    kopf_alt = _vorhandene_kopfzeile(pfad) if append_mode else None   # wirft ggf.
    if kopf_alt is not None and kopf_alt == neue_felder:
        _pruefe_felder(rows, neue_felder, pfad)
        return
    if kopf_alt:
        felder = list(kopf_alt) + [k for k in neue_felder if k not in kopf_alt]
        _zaehle_ueberzaehlige(pfad)                                   # wirft ggf.
    else:
        felder = neue_felder
    _pruefe_felder(rows, felder, pfad)


def _schreibe_csv_kopftreu(pfad: str, rows: list, append_mode: bool):
    """Anhaengen, ohne die Spalten gegen die Kopfzeile zu verschieben.

    DIE ALTE FASSUNG WAR EINE FALLE (gefunden am 06.09.2026).

        fields = list(rows[0].keys())
        mode = "a" if append_mode and os.path.exists(f_path) else "w"
        ...
        if mode == "w": writer.writeheader()

    Die Spaltenliste kam aus der ERSTEN NEUEN ZEILE, die Kopfzeile aus dem
    letzten Lauf. Solange beide zufaellig uebereinstimmten, ging es gut.
    Kam oben ein Feld dazu — oder aenderte sich nur die Reihenfolge der
    Schluessel im dict, was in Python die Spaltenreihenfolge bestimmt —,
    landeten die angehaengten Zeilen um eine Stelle verschoben unter einer
    Kopfzeile, die etwas anderes verspricht. Beim SCHREIBEN faellt das
    nicht auf; der Lauf meldet Erfolg.

    Genau das ist am selben Tag in per_decklist_scraper.py passiert, als
    PR #687 dort eine Spalte hinzufuegte: "seite" stand danach in der
    Spalte "scraped_at". Diese Datei hier hatte dieselbe Bauart, nur
    schaerfer — dort war die Spaltenliste wenigstens fest verdrahtet.

    Jetzt gilt:
      * Passt die vorhandene Kopfzeile, wird angehaengt (schneller
        Normalfall, liest nur die erste Zeile).
      * Weicht sie ab, wird die GANZE Datei neu geschrieben: Kopfzeile aus
        der Vereinigung beider Spaltenmengen, alte Zeilen werden
        uebernommen, fehlende Felder bleiben LEER statt zu verrutschen.
      * Traegt eine alte Zeile MEHR Werte als die Kopfzeile Spalten hat —
        so sieht aus, was die alte Falle hinterlassen hat —, bricht der
        Lauf ab. Diese Werte liessen sich beim Neuschreiben keiner Spalte
        zuordnen; sie waeren beim ersten Lauf nach der Auslieferung
        endgueltig weg. "Report, don't silently repair" (CLAUDE.md).
      * `_pruefe_kartenzeilen` prueft weiterhin die WERTE; das hier prueft
        die SPALTEN. Beides ist noetig — die Wertepruefung haette den
        Versatz nie bemerkt.

    Was hier BEWUSST NICHT steht: `extrasaction="ignore"`. Der alte
    DictWriter stand auf dem Vorgabewert "raise", und eine neue Zeile mit
    einem Feld, das die Kopfzeile nicht kennt, soll weiterhin laut
    umfallen — das ist derselbe Fehler, gegen den diese Funktion antritt,
    nur innerhalb einer Charge. test_jh_reassembly_header.py haelt einen
    echten Vorfall fest, bei dem genau diese Ausnahme den Fehler sichtbar
    gemacht hat.
    """
    neue_felder = list(rows[0].keys())
    kopf_alt = _vorhandene_kopfzeile(pfad) if append_mode else None

    if kopf_alt is not None and kopf_alt == neue_felder:
        # Erst pruefen, DANN oeffnen. Der Anhaengeweg ist als einziger
        # nicht atomar — er schreibt in die echte Datei. Wuerde der
        # DictWriter erst bei Zeile 40 einer Charge wegen eines
        # unbekannten Feldes umfallen, staenden 39 Zeilen schon drin und
        # der naechste Lauf haenge sie ein zweites Mal an. Das ist der
        # Grund, warum die Ausnahme VOR dem Oeffnen faellt.
        _pruefe_felder(rows, neue_felder, pfad)
        with open(pfad, "a", newline="", encoding="utf-8-sig") as f:
            csv.DictWriter(f, fieldnames=neue_felder,
                           delimiter=";").writerows(rows)
        return

    bestand = []
    if kopf_alt:                       # vorhanden UND nicht leer
        felder = list(kopf_alt) + [k for k in neue_felder if k not in kopf_alt]
        logger.warning(
            "[JH] Kopfzeile von %s weicht ab (%d statt %d Spalten) — Datei "
            "wird neu geschrieben, alte Zeilen werden uebernommen.",
            os.path.basename(pfad), len(kopf_alt), len(neue_felder)
        )
        bestand = _zaehle_ueberzaehlige(pfad)
    else:
        if kopf_alt == []:
            logger.warning("[JH] %s ist leer — Kopfzeile wird neu gesetzt.",
                           os.path.basename(pfad))
        felder = neue_felder

    # Rechte der vorhandenen Datei merken: atomic_write_file legt die
    # Zwischendatei ueber tempfile.mkstemp an, und die entsteht mit 0600.
    # Ohne das hier wuerde ein Neuschreiben die Rechte stillschweigend
    # verengen — eine Aenderung, die niemand angemeldet hat.
    try:
        alte_rechte = stat.S_IMODE(os.stat(pfad).st_mode)
    except OSError:
        # Es gibt noch keine Datei. Dann sind die Rechte die, die ein
        # schlichtes open(pfad, "w") gegeben haette — 0o666 abzueglich der
        # umask. Ohne das hier bekaeme eine FRISCH angelegte Datei die
        # 0o600 von mkstemp, also enger als bisher. Angemerkt von der
        # unabhaengigen Pruefung am 06.09.2026.
        _umask = os.umask(0)
        os.umask(_umask)
        alte_rechte = 0o666 & ~_umask

    def _schreibe(f):
        w = csv.DictWriter(f, fieldnames=felder, delimiter=";")
        w.writeheader()
        # Alte Zeilen auf die neue Spaltenliste abbilden: fehlende Felder
        # werden LEER, nie verschoben. Der Sammelschluessel darf nicht
        # mitgeschrieben werden (oben ist sichergestellt, dass er leer ist).
        for r in bestand:
            w.writerow({k: r.get(k, "") for k in felder})
        # Neue Zeilen unveraendert durch den DictWriter — mit "raise".
        w.writerows(rows)

    # atomic_write_file statt eines eigenen tmp/replace: es benutzt
    # tempfile.mkstemp (kein fester Name, der bei zwei Laeufen kollidiert)
    # und raeumt die Zwischendatei im Fehlerfall weg. Bei einer Datei von
    # 111 MB ist beides kein Schoenheitsfehler.
    atomic_write_file(pfad, _schreibe, mode="w", encoding="utf-8-sig",
                      newline="")
    try:
        os.chmod(pfad, alte_rechte)
    except OSError:
        pass


def save_csv_files(data: list, output_file: str, append_mode: bool):
    overview_f = os.path.join(get_data_dir(), output_file.replace(".csv", "_overview.csv"))
    cards_f    = os.path.join(get_data_dir(), output_file.replace(".csv", "_cards.csv"))

    o_rows = [
        {
            "tournament_id": t["id"],
            "tournament_name": t["name"],
            "tournament_date": _datum_mit_override(t.get("id", ""), t.get("date", "")),
            "players": t.get("players", ""),
            # Zweiter Weg zum Format, falls die Seite keinen Decks-Link
            # mit ?format= hergibt. _derive_meta_from_date_JH leitet den
            # Meta-Schluessel aus dem Turnierdatum und dem Formatfenster
            # ab — die Kartenzeilen benutzen ihn seit Langem
            # (aggregate_tournament_cards), die Uebersicht nicht. Deshalb
            # konnten dieselben zwei Turniere in der Kartendatei
            # meta='TEF-CRI' tragen und in der Uebersicht format='' haben.
            "format": t.get("format") or _derive_meta_from_date_JH(t.get("date", "")),
            "cards_url": t["cards_url"],
            "total_cards": t.get("total_cards", 0),
            "status": t["status"],
            "labs_tournament_id": _resolve_labs_tournament_id(t["name"], t.get("date", ""), t.get("id", "")),
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

    _pruefe_kartenzeilen(c_rows, cards_f)

    zu_schreiben = [(f, r) for f, r in [(overview_f, o_rows), (cards_f, c_rows)] if r]

    # ERST beide Ziele pruefen, DANN in das erste schreiben.
    #
    # Ohne diese Runde konnte ein Abbruch an der ZWEITEN Datei ein halbes
    # Turnier hinterlassen: die Uebersicht traegt die Zeile mit
    # `total_cards`, die Kartendatei nicht — und weil save_scraped_tournaments
    # die Kennung schon vermerkt hat, holt auch kein spaeterer Lauf sie
    # nach. Nachgestellt von der unabhaengigen Pruefung am 06.09.2026.
    # Die Vorpruefung schreibt nichts; faellt sie um, ist noch keine Datei
    # angefasst.
    for f_path, rows in zu_schreiben:
        _pruefe_ziel_schreibbar(f_path, rows, append_mode)

    for f_path, rows in zu_schreiben:
        _schreibe_csv_kopftreu(f_path, rows, append_mode)

        # Unveraendert: stand vorher im with-Block und lief damit einmal je
        # Datei. Die Wiederholung ist ueberfluessig, aber sie zu entfernen
        # waere eine Verhaltensaenderung an einer Stelle, die ich hier nicht
        # pruefe — der Umbau betrifft nur das Schreiben der Spalten.
        formats_for_catalog = [str(row.get("format", "") or "") for row in o_rows]
        update_formats_catalog(formats_for_catalog)

    return overview_f, cards_f

# ============================================================================
# META RE-VALIDATION (heals retroactive Limitless format renames)
# ============================================================================
# Limitless occasionally renames a format mid-stream — e.g. on 2026-04-25
# the Prague Regional was relabelled SVI-ASC → TEF-POR. Tournaments we
# already scraped (and skipped via scraped_ids) keep the old tag forever.
# Result: rows go into the wrong meta-chunk and the frontend's
# date-aware loader can't find them.
#
# This pass runs BEFORE the new-tournament scrape loop. For every
# tournament in the existing monolith CSV with a tournament_date in the
# last `max_age_days` window, we hit Limitless once to read the current
# format= URL parameter. If it differs from the meta column we wrote
# earlier, every row for that tournament_id is re-tagged in place and
# the CSV is saved back. prepare_card_data.py then re-splits chunks
# from the corrected monolith on the next pass.
#
# Cost: ~30–60 HTTP requests per dashboard run (1 per recent tournament,
# rate-limited by `delay_between_requests`). Idempotent — converges to
# the truth, only writes when something changed.

_TOURNAMENT_DATE_RE = re.compile(r'(\d+)(?:st|nd|rd|th)\s+(\w+)\s+(\d{4})', re.I)
_MONTHS_FULL = {m.lower(): i + 1 for i, m in enumerate([
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'])}


def _parse_english_ordinal_date(s: str):
    """Parse '25th April 2026' → datetime, or None."""
    if not s:
        return None
    m = _TOURNAMENT_DATE_RE.match(s.strip())
    if not m:
        return None
    mn = m.group(2).lower()
    if mn not in _MONTHS_FULL:
        return None
    try:
        from datetime import datetime as _dt
        return _dt(int(m.group(3)), _MONTHS_FULL[mn], int(m.group(1)))
    except ValueError:
        return None


def _fetch_current_format(tournament_id: str) -> Optional[str]:
    """Hit the Limitless tournament page and read `?format=XXX` from a
    decks-link href. Returns the raw format key (e.g. 'TEF-POR') or
    None if the page can't be loaded or no format link is present.

    NB: we read the href via BeautifulSoup's attribute accessor (which
    returns the decoded URL "/decks/?time=all&format=TEF-POR") rather
    than scanning str(soup). When BS4 re-serializes the HTML it escapes
    `&` to `&amp;` and a regex looking for the bare `[?&]format=` would
    miss every match.
    """
    url = f"https://limitlesstcg.com/tournaments/{tournament_id}"
    soup = fetch_page_bs4(url)
    if not soup:
        return None
    for a in soup.select('a[href]'):
        href = a.get('href') or ''
        m = re.search(r'[?&]format=([^&]+)', href, re.IGNORECASE)
        if m:
            return urllib.parse.unquote(m.group(1).strip())
    return None


def revalidate_recent_tournament_meta(monolith_path: str,
                                       max_age_days: int = 60,
                                       delay: float = 1.5) -> Tuple[int, int]:
    """Re-fetch the format tag from Limitless for every tournament in
    the monolith CSV with a tournament_date in the last `max_age_days`
    window. Updates the meta column in place when it has changed.

    Returns (checked, updated). Skips silently when the monolith
    doesn't exist (first scrape run, nothing to revalidate yet).
    """
    if not os.path.isfile(monolith_path):
        logger.info("[revalidate-meta] No monolith yet at %s — skipping.", monolith_path)
        return 0, 0

    from datetime import datetime as _dt, timedelta as _td
    cutoff = _dt.now() - _td(days=max_age_days)

    # Pass 1: scan the CSV, build {tournament_id → (current_meta, latest_date)}
    # for tournaments inside the recency window.
    candidates: Dict[str, Dict[str, Any]] = {}
    fieldnames = None
    with open(monolith_path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f, delimiter=";")
        fieldnames = reader.fieldnames or []
        for row in reader:
            tid = str(row.get("tournament_id", "")).strip()
            if not tid:
                continue
            d = _parse_english_ordinal_date(row.get("tournament_date", ""))
            if not d or d < cutoff:
                continue
            entry = candidates.get(tid)
            if entry is None:
                candidates[tid] = {"meta": row.get("meta", ""), "date": d, "name": row.get("tournament_name", "")}
            elif d > entry["date"]:
                entry["date"] = d

    if not candidates:
        logger.info("[revalidate-meta] No tournaments within last %d days to revalidate.", max_age_days)
        return 0, 0

    logger.info("[revalidate-meta] Checking %d tournaments from the last %d days …",
                len(candidates), max_age_days)

    # Pass 2: hit Limitless for each candidate, build the rewrite map.
    # (tid → new_meta) only contains entries where the tag actually changed.
    rewrites: Dict[str, str] = {}
    for tid, info in sorted(candidates.items()):
        current_meta = str(info.get("meta") or "").strip()
        live_format = _fetch_current_format(tid)
        if live_format is None:
            logger.warning("[revalidate-meta] %s: no format link on tournament page — keeping %r",
                           tid, current_meta)
            time.sleep(delay)
            continue
        normalized = normalize_tournament_format(live_format)
        if normalized and normalized != current_meta:
            logger.info("[revalidate-meta] %s (%s): %s → %s",
                        tid, info.get("name", "")[:50], current_meta, normalized)
            rewrites[tid] = normalized
        time.sleep(delay)

    if not rewrites:
        logger.info("[revalidate-meta] All %d tournaments already correctly tagged.", len(candidates))
        return len(candidates), 0

    # Pass 3: rewrite the CSV with corrected meta values. Stream-rewrite
    # via a sibling tmp file so we don't risk the 100MB+ file being half-
    # written if something blows up partway.
    tmp_path = monolith_path + ".tmp"
    updated_rows = 0
    with open(monolith_path, "r", encoding="utf-8-sig") as src, \
         open(tmp_path, "w", newline="", encoding="utf-8-sig") as dst:
        reader = csv.DictReader(src, delimiter=";")
        writer = csv.DictWriter(dst, fieldnames=fieldnames, delimiter=";")
        writer.writeheader()
        for row in reader:
            tid = str(row.get("tournament_id", "")).strip()
            if tid in rewrites:
                row["meta"] = rewrites[tid]
                updated_rows += 1
            writer.writerow(row)
    os.replace(tmp_path, monolith_path)

    logger.info("[revalidate-meta] Updated %d tournaments (%d rows) — monolith re-saved.",
                len(rewrites), updated_rows)
    return len(candidates), len(rewrites)


# ============================================================================
# MAIN
# ============================================================================
def _reassemble_monolith_from_chunks(monolith_path: str, data_dir: str) -> int:
    """Re-create the gitignored monolith from the committed per-meta
    chunk files when it's missing (= we're on a fresh CI runner).

    Why this matters: the monolith is gitignored (111 MB → too big for
    git), only the per-meta chunks ship in the repo. On every GH Actions
    run the workspace starts with chunks but no monolith. Without this
    reassembly:
      1. tournament_scraper_JH.save_csv_files opens the monolith with
         mode="w" (since the file doesn't exist) — even with
         append_mode=True the existence check at line ~542 fails.
      2. Only the handful of NEW tournaments scraped this run get
         written. Monolith ends up tiny.
      3. prepare_card_data.split_tournament_cards reads the tiny
         monolith and emits tiny chunks (e.g. SVI-PFL went from 73 980
         → 11 017 rows on the 2026-05-03 weekly run, a ~85 % data
         loss).
      4. Those tiny chunks get committed back, overwriting the full
         historical chunks. Past Meta tab silently degrades each week.

    Reassembly: concat every tournament_cards_data_cards_*.csv chunk
    that's NOT the monolith itself (excluding the bare filename and
    any temp/tmp files) into a single CSV with one header. The chunks
    already share the same column schema — split_tournament_cards
    wrote them.

    Returns the number of rows reassembled (0 if monolith already
    existed or no chunks to assemble).
    """
    if os.path.isfile(monolith_path):
        return 0

    monolith_basename = os.path.basename(monolith_path)
    chunks = []
    try:
        for f in sorted(os.listdir(data_dir)):
            if not f.startswith("tournament_cards_data_cards_"):
                continue
            if not f.endswith(".csv"):
                continue
            if f == monolith_basename:
                continue
            chunks.append(os.path.join(data_dir, f))
    except OSError:
        return 0

    if not chunks:
        logger.info(
            "[reassemble] No monolith and no chunks at %s — nothing to seed.",
            data_dir,
        )
        return 0

    rows_written = 0
    fieldnames: List[str] = []

    # Normalize away header corruption before it can crash the whole
    # reassembly. A single chunk once shipped a stray trailing comma on its
    # last column ("is_ace_spec," in tournament_cards_data_cards_TEF-CRI.csv);
    # csv.DictWriter then raised "dict contains fields not in fieldnames" and
    # the JH scraper aborted at startup — silently, so NO new tournament
    # (including NAIC) ever reached the cards pipeline. Strip trailing
    # commas/whitespace from every chunk's field names and remap each row's
    # keys to the clean form; extrasaction="ignore" is a final safety net.
    def _clean_field(fn: str) -> str:
        return (fn or "").strip().rstrip(",").strip()

    with open(monolith_path, "w", newline="", encoding="utf-8-sig") as dst:
        writer = None
        for chunk_path in chunks:
            with open(chunk_path, "r", encoding="utf-8-sig") as src:
                reader = csv.DictReader(src, delimiter=";")
                key_map = {rf: _clean_field(rf) for rf in (reader.fieldnames or [])}
                if writer is None:
                    fieldnames = [_clean_field(rf) for rf in (reader.fieldnames or [])]
                    writer = csv.DictWriter(dst, fieldnames=fieldnames,
                                            delimiter=";", extrasaction="ignore")
                    writer.writeheader()
                for row in reader:
                    writer.writerow({key_map.get(k, k): v for k, v in row.items()})
                    rows_written += 1

    logger.info(
        "[reassemble] Rebuilt monolith from %d chunks (%d rows) — append-mode preserved.",
        len(chunks), rows_written,
    )
    return rows_written


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

    # The monolith path must MATCH the cards_f computation inside
    # save_csv_files (line ~512), which derives the cards CSV name by
    # replacing ".csv" → "_cards.csv". Otherwise reassembly writes to
    # one file while save_csv_files writes to another, and the appended
    # tournament rows land in a fresh empty monolith — losing 459K rows
    # of historical chunk data on every CI run (root cause of the
    # 2026-05-13 weekly-update Prague-+-LA truncation: reassembly
    # rebuilt the monolith at "tournament_cards_data.csv" while
    # save_csv_files wrote "tournament_cards_data_cards.csv" fresh).
    output_file = settings.get("output_file") or "tournament_cards_data.csv"
    monolith_path = os.path.join(
        get_data_dir(),
        output_file.replace(".csv", "_cards.csv"),
    )

    # ── Reassemble the gitignored monolith from committed per-meta
    #    chunks before anything else looks at it. On CI runners the
    #    monolith doesn't exist (gitignored, 111 MB), so without this
    #    seed step the append-mode in save_csv_files would write a
    #    fresh tiny monolith and prepare_card_data would shrink the
    #    chunks back accordingly.
    _reassemble_monolith_from_chunks(monolith_path, get_data_dir())

    # ── Heal retroactive Limitless format renames before scraping new
    #    tournaments. Cheap (one HTTP request per recent tournament,
    #    rate-limited) and idempotent — converges to truth.
    revalidate_recent_tournament_meta(
        monolith_path=monolith_path,
        max_age_days=int(settings.get("revalidate_max_age_days", 60)),
        delay=float(settings.get("delay_between_requests", 1.5)),
    )

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
            logger.info(f"Ueberspringe (meta={t['meta']}): {t['name']} [id {t.get('id')}]")
            continue

        if not any(tt.lower() in name_lower for tt in settings["tournament_types"]):
            # Diagnostic: a major dropped here never reaches the cards pipeline
            # AND never enters the ledger (so it's re-evaluated every run). Log
            # it so a missing tournament is visible instead of silent.
            logger.info(f"Ueberspringe (kein Turnier-Typ-Match): {t['name']} [id {t.get('id')}]")
            continue

        logger.info(f"Lade Turnier: {t['name']} ({t['format']})")
        deck_links = get_deck_list_links(t["url"])

        if not deck_links:
            # Decklists not posted yet (tournament still mid-event or only
            # just finished — Limitless publishes lists with a lag). Do NOT
            # mark as scraped: leave the id OUT of the ledger so the next run
            # revisits it once the lists appear. Previously this branch
            # committed the id, so a tournament probed too early (e.g. NAIC)
            # was cached empty and skipped forever.
            t["cards"]  = []
            t["status"] = "no decks found"
            logger.info("   Keine Decklisten (noch) – NICHT als erledigt markiert, Revisit naechster Lauf: %s", t["name"])
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

            # Commit to the scraped-ledger ONLY when the tournament yielded
            # real deck rows. Empty/failed probes are left out so the next
            # run revisits them — this prevents the "cached empty, skipped
            # forever" poisoning that hid NAIC from the cards pipeline.
            newly_scraped.add(t["id"])
            processed += 1

            # Inkrementelles Speichern nach jedem Turnier
            save_scraped_tournaments(scraped_ids | newly_scraped)
            save_csv_files([t], settings["output_file"], append_mode=(settings["append_mode"] if processed == 1 else True))
            logger.info(f"Gespeichert: {t['name']} ({t['total_cards']} Karten-Eintraege)")
        else:
            t["cards"]  = []
            t["status"] = "failed"
            logger.warning("   Decklisten gefunden, aber Extraktion lieferte 0 Decks – NICHT als erledigt markiert, Revisit naechster Lauf: %s", t["name"])

    logger.info("=" * 60)
    logger.info("Scraping beendet. %s Turniere verarbeitet.", processed)
    logger.info("=" * 60)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        logger.critical(f"Abbruch: {e}", exc_info=True)
