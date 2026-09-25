#!/usr/bin/env python3
"""
City League Archetype Scraper - FAST EDITION
============================================
Scrapes archetype data from limitlesstcg.com Japanese City League tournaments.
- Uses cloudscraper for Cloudflare bypass
- Uses BeautifulSoup4 for robust HTML parsing
- Uses ThreadPoolExecutor for fast concurrent scraping
- Generates detailed HTML & CSV comparison reports
"""

import csv
import re
import time
import json
import html as html_mod
import os
import sys
import logging
import threading
import concurrent.futures
from typing import Dict, List, Optional
from datetime import datetime, timedelta

try:
    from bs4 import BeautifulSoup
except ImportError:
    print("FEHLER: beautifulsoup4 fehlt! pip install beautifulsoup4")
    sys.exit(1)

from card_scraper_shared import (
    setup_console_encoding, get_app_path, get_data_dir, setup_logging, load_settings,
    normalize_archetype_name, fetch_page_bs4, clean_pokemon_name, fix_mega_pokemon_name,
    parse_tournament_date
)

# Archetype matcher (Phase 3): given a Japanese-row's list of Pokemon slugs,
# try to resolve it to a canonical Limitless archetype name. Falls back to
# the original name-based match when the scraper module or data file is
# unavailable — so a stale/missing archetype_icons.json never breaks the
# scraper entirely.
# ── Phase 4: icon-harvest state ────────────────────────────────────────────
# Every (archetype, slugs) combo we observe during scraping is captured
# here, then merged into archetype_icons.json after save_to_csv. Backfills
# JP-only combos that play.limitlesstcg.com's EN decks page never lists
# (and which the icon-scraper therefore can't see). Module-level dict so
# threaded workers can write into it safely with the GIL.
_observed_icons: 'Dict[str, List[str]]' = {}


def _record_observed_icons(archetype: str, slugs: 'List[str]') -> None:
    """First-seen wins — once we have slugs for an archetype name, don't
    overwrite. Different tournaments may show the same name with slightly
    different slug orders; the first one is fine because the matcher
    treats slug lists as sets."""
    if not archetype or not slugs:
        return
    if archetype in _observed_icons:
        return
    _observed_icons[archetype] = list(slugs)


try:
    from archetype_matcher import ArchetypeMatcher  # type: ignore
    _matcher: 'Optional[ArchetypeMatcher]' = ArchetypeMatcher().load()
except Exception as _matcher_err:  # FileNotFoundError, import errors, etc.
    _matcher = None
    logging.getLogger("archetype_scraper").warning(
        "ArchetypeMatcher unavailable (%s) — falling back to name-only matching",
        _matcher_err,
    )

# Fix Windows console encoding for Unicode characters
setup_console_encoding()

# ============================================================================
# LOGGING SETUP
# ============================================================================
logger = setup_logging("archetype_scraper")


# ============================================================================
# SETTINGS
# ============================================================================
DEFAULT_SETTINGS = {
    # Auto-synced by update_sets.apply_format_window_to_scraper_settings
    # to format_window.jp_release_date on every run. Hardcoded fallback
    # below = the JP rotation we know is current at the time this code
    # was written; if format_window.json is missing AND the unified
    # config doesn't override, we want a sane post-rotation default,
    # NOT the pre-rotation 24.01.2026 baseline that would re-pull all
    # M3-era tournaments back into Current.
    "start_date": "13.03.2026",
    "end_date": "auto",
    "delay_between_requests": 1.5,
    "max_workers": 5,
    "output_file": "city_league_archetypes.csv",
    "region": "jp",
    # Skip tournaments with fewer than this many placements posted.
    # 1 = "include every tournament that has at least one player on
    # the standings page", which is what we want for the JP City
    # League where typical events have 4-16 placements (NOT 32+).
    # The historical CSV (Feb 2026 → Apr 18 2026) was built with NO
    # min-size filter at all and contains 624 tournaments with
    # placement counts between 4 and 16. The earlier default of 32
    # (introduced 2026-04-21) was a copy-paste from a major-event
    # scraper and silently rejected EVERY post-April-18 City League
    # event for two weeks — symptom: archetypes CSV frozen at
    # April 18, current-meta UI showing data 17 days old.
    "min_tournament_size": 1,
    "additional_tournament_ids": [],
    # Japanische Majors (Champions League, Regional League, Japan
    # Championships) aus der Hauptliste /tournaments mitziehen. Sie
    # tragen dasselbe japanische Standard-Meta wie die City League und
    # sind der einzige Bestand, der in der Saisonpause ueberhaupt
    # vorliegt. Abschaltbar, damit ein Wiederholungslauf sie ueberspringen
    # kann — standardmaessig AN.
    "include_jp_majors": True
}

def _load_settings() -> dict:
    return load_settings("city_league_archetype_settings.json", DEFAULT_SETTINGS)

def calculate_date_range(start_date: str, end_date: str):
    start_str = start_date
    if end_date == 'auto':
        end_dt = datetime.now() - timedelta(days=2)
        end_str = end_dt.strftime('%d.%m.%Y')
    else:
        end_str = end_date
    return start_str, end_str

def parse_date(date_str: str) -> datetime:
    try:
        return datetime.strptime(date_str, "%d.%m.%Y")
    except ValueError:
        logger.error("Invalid date format: %s. Use DD.MM.YYYY", date_str)
        raise

# ============================================================================
# CLOUDSCRAPER / NETWORK
# ============================================================================

# fetch_page_bs4 imported from card_scraper_shared

# ============================================================================
# SCRAPING LOGIC
# ============================================================================
# parse_tournament_date imported from card_scraper_shared

def get_tournaments_in_date_range(region: str, start_date: datetime, end_date: datetime) -> list:
    # Limitless listings cap at 500 rows per page server-side even when
    # ?show= asks for more — verified 2026-05-23. Walk the listing with
    # ?show=100&page={N} (same pattern as tournament_scraper_JH) and
    # stop once we've passed start_date or exhausted pages.
    MAX_PAGES = 15  # 15 * 100 = 1500 tournaments cap.
    tournaments = []
    seen_ids = set()
    for page in range(1, MAX_PAGES + 1):
        url = f"https://limitlesstcg.com/tournaments/{region}?show=100&page={page}"
        logger.info("Lade Turnierliste Seite %s: %s", page, url)
        soup = fetch_page_bs4(url)
        if not soup:
            logger.error("Fehler beim Laden der Turnierliste (Seite %s).", page)
            break

        rows = [tr for tr in soup.select('table.striped tr') if tr.find('td')]
        if not rows:
            logger.info("Seite %s leer — Pagination beendet.", page)
            break

        page_added = 0
        page_oldest = None
        for row in rows:
            cells = row.find_all('td')
            if len(cells) < 4:
                continue

            date_text = cells[0].get_text(strip=True)
            t_date = parse_tournament_date(date_text)
            if t_date and (page_oldest is None or t_date < page_oldest):
                page_oldest = t_date

            if t_date and start_date <= t_date <= end_date:
                link = cells[1].find('a')
                if not link:
                    continue
                href = link['href']
                t_id = href.split('/')[-1]
                if t_id in seen_ids:
                    continue
                seen_ids.add(t_id)
                t_url = f"https://limitlesstcg.com{href}" if href.startswith('/') else href
                tournaments.append({
                    'tournament_id': t_id,
                    'url': t_url,
                    'date_str': date_text,
                    'prefecture': cells[2].get_text(strip=True),
                    'shop': link.get_text(strip=True)
                })
                page_added += 1

        logger.info("  Seite %s: +%s Turniere im Fenster, ältestes Datum: %s",
                    page, page_added,
                    page_oldest.strftime('%d.%m.%Y') if page_oldest else '?')

        if page_oldest is not None and page_oldest < start_date:
            logger.info("Pagination beendet: Seite %s ist vor start_date %s.",
                        page, start_date.strftime('%d.%m.%Y'))
            break

    logger.info("%s Turniere im Zeitraum gefunden (über %s Seiten).",
                len(tournaments), page)
    return tournaments

# ── JAPANISCHE MAJORS FINDEN SICH SELBST ──────────────────────────────
#
# Die Liste /tournaments/jp fuehrt AUSSCHLIESSLICH City Leagues. Gemessen
# am 25.09.2026: neuester Eintrag dort 06 May 26, Spaltenkopf
# "Date | Prefecture | Shop | Winner". Die Champions League Yokohama vom
# 20.09.2026 (Turnier 569, 10.000 Spieler, Sieger Keiyo Watanabe mit
# Mega-Stalobor) steht dort NICHT — sie steht nur in der Hauptliste
# /tournaments, deren Kopf "Date | Country | Name | | Players | Winner"
# lautet.
#
# Folge bis zu diesem Tag: der laufende japanische Meta-Reiter war leer
# (city_league_archetypes.csv hatte nur seine Kopfzeile), obwohl das
# groesste japanische Turnier der Saison seit fuenf Tagen ausgewertet
# vorlag. Kein Scraper war defekt — es hat nur keiner hingesehen.
#
# Der Unterscheider ist NICHT der Turniername. "Champions League",
# "Regional League", "Japan Championships" ist eine Liste, die mit jedem
# neuen Format-Namen veraltet. Die Hauptliste fuehrt je Zeile ein
# Formatbild, und dessen alt-Text ist die Bedingung, die wir wirklich
# meinen:
#
#     20 Sep 26 | IMG[flags/JP] | Champions League Yokohama
#               | IMG[formats/standard-jp.png alt="standard-jp"] | 10000
#
# alt="standard-jp" heisst "japanisches Standard-Meta". Genau das ist der
# Datenbestand, den dieser Ablauf fuehrt. Ein Name muss dafuer nicht
# geraten werden.
JP_FORMAT_ALT = "standard-jp"

# Turnierklassen, die in der Spalte `format` erscheinen duerfen. Der
# Schluessel ist ein Stueck des Namens in Kleinschreibung, der Wert die
# Klasse, die in die CSV geht. Wer hier nichts trifft, bekommt die
# neutrale Klasse — geraten wird nicht.
#
# Der Zusatz "(JP)" meint in diesem Bestand seit je das japanische
# Standard-FORMAT, nicht das Austragungsland — die vorhandene Klasse
# "City League (JP)" traegt ihn genauso. Das ist wichtig, weil das
# Formatbild standard-jp am 25.09.2026 gemessen auch ueber Turnieren
# ausserhalb Japans steht: "Korean League Final Season" (24.05.2026),
# "Singapore Premier Ball League", "Indonesia Master Ball League". Die
# spielen dasselbe Format und gehoeren damit in denselben Bestand — aber
# sie werden BENANNT, nicht zu Champions Leagues gemacht.
JP_MAJOR_KLASSEN = (
    ("champions league",   "Champions League (JP)"),
    ("regional league",    "Regional League (JP)"),
    ("championships",      "Japan Championships (JP)"),
    ("korean league",      "Korean League (JP)"),
    ("ball league",        "Premier Ball League (JP)"),
    ("city league",        "City League (JP)"),
)
# Trifft nichts, wird das sichtbar unbestimmt gelassen. "Major (JP)"
# waere eine Behauptung ueber die Groesse des Turniers, die wir nicht
# gemessen haben.
JP_MAJOR_KLASSE_UNBEKANNT = "Sonstiges (JP)"


def klassifiziere_jp_turnier(name: str) -> str:
    """Ordnet einen Turniernamen im JP-Format einer benannten Klasse zu.

    Trifft nichts, kommt `Sonstiges (JP)` zurueck — sichtbar unbestimmt
    statt stillschweigend als City League verbucht.
    """
    klein = (name or "").lower()
    for stueck, klasse in JP_MAJOR_KLASSEN:
        if stueck in klein:
            return klasse
    return JP_MAJOR_KLASSE_UNBEKANNT


def get_jp_major_tournaments(start_date: datetime, end_date: datetime,
                            max_pages: int = 5) -> list:
    """Japanische Standard-Turniere aus der HAUPTLISTE /tournaments.

    Erkennt sie am Formatbild (alt="standard-jp"), nicht am Namen. Gibt
    dieselbe Form zurueck wie get_tournaments_in_date_range, damit
    _scrape_single_tournament nichts davon wissen muss.
    """
    gefunden = []
    gesehen = set()
    for page in range(1, max_pages + 1):
        url = f"https://limitlesstcg.com/tournaments?show=100&page={page}"
        logger.info("Lade Hauptturnierliste Seite %s (japanische Majors): %s",
                    page, url)
        soup = fetch_page_bs4(url)
        if not soup:
            logger.warning("Hauptturnierliste Seite %s nicht ladbar.", page)
            break

        rows = [tr for tr in soup.select('table.striped tr') if tr.find('td')]
        if not rows:
            logger.info("Hauptliste Seite %s leer — Ende.", page)
            break

        seite_aeltestes = None
        seite_neu = 0
        for row in rows:
            cells = row.find_all('td')
            if len(cells) < 5:
                continue

            t_date = parse_tournament_date(cells[0].get_text(strip=True))
            if t_date and (seite_aeltestes is None or t_date < seite_aeltestes):
                seite_aeltestes = t_date

            # Zwei Wege zum selben Merkmal, beide gemessen am 25.09.2026:
            #   <tr data-format="standard-jp" ...>
            #   <td><img class="format" alt="standard-jp" ...></td>
            # Der Spaltenindex hat sich bei Limitless schon zweimal
            # verschoben, diese beiden Merkmale nie. Verlangt wird nur
            # EINES von beiden — verschwindet eines, laeuft es weiter.
            ist_jp = (row.get('data-format') or '').strip().lower() == JP_FORMAT_ALT
            if not ist_jp:
                ist_jp = any(
                    JP_FORMAT_ALT == (img.get('alt') or '').strip().lower()
                    for img in row.select('img')
                )
            if not ist_jp:
                continue

            link = row.select_one('a[href^="/tournaments/"]')
            if not link:
                continue
            t_id = (link.get('href') or '').rstrip('/').split('/')[-1]
            if not t_id.isdigit() or t_id in gesehen:
                continue

            if not t_date:
                logger.warning(
                    "Japanisches Turnier %s ohne lesbares Datum (%r) — "
                    "uebersprungen statt geraten.",
                    t_id, cells[0].get_text(strip=True))
                continue
            if not (start_date <= t_date <= end_date):
                continue

            gesehen.add(t_id)
            name = link.get_text(strip=True)
            klasse = klassifiziere_jp_turnier(name)
            # Die Praefektur-Spalte fuehrt bei einem Major keine Praefektur —
            # die Hauptliste hat diese Spalte nicht. Was sie fuehrt, ist das
            # Land, und das ist ein Quellwert: <td><img class="flag"
            # alt="JP"></td> bzw. data-country am <tr>. Es wird ausgelesen,
            # nicht gesetzt — eine gesetzte Ortsangabe muesste die Seite als
            # Platzhalter ausweisen (siehe ORT_PLATZHALTER_OHNE_QUELLE), und
            # ein geratener Wert kommt hier gar nicht erst hinein.
            land = (row.get('data-country') or '').strip()
            if not land:
                flagge = row.select_one('img.flag')
                land = (flagge.get('alt') or '').strip() if flagge else ''
            gefunden.append({
                'tournament_id': t_id,
                'url': f"https://limitlesstcg.com/tournaments/{t_id}",
                'date_str': cells[0].get_text(strip=True),
                'prefecture': land,
                'shop': name,
                'format': klasse,
            })
            seite_neu += 1

        logger.info("  Hauptliste Seite %s: +%s japanische Turniere im Fenster, "
                    "aeltestes Datum: %s", page, seite_neu,
                    seite_aeltestes.strftime('%d.%m.%Y') if seite_aeltestes else '?')

        if seite_aeltestes is not None and seite_aeltestes < start_date:
            logger.info("Hauptliste beendet: Seite %s liegt vor %s.",
                        page, start_date.strftime('%d.%m.%Y'))
            break

    logger.info("%s japanische Majors in der Hauptliste gefunden.", len(gefunden))
    return gefunden


def get_tournament_by_id(tournament_id: str) -> dict:
    url = f"https://limitlesstcg.com/tournaments/{tournament_id}"
    soup = fetch_page_bs4(url)
    if not soup:
        return None

    header = soup.select_one('.tournament-header')
    name = header.find('h1').get_text(strip=True) if header and header.find('h1') else f"Tournament {tournament_id}"

    date_str = ""
    for infobox in soup.select('.infobox-line'):
        text = infobox.get_text(strip=True)
        if '•' in text and 'player' in text.lower():
            date_str = text.split('•')[0].strip()
            break

    return {
        'tournament_id': str(tournament_id),
        'url': url,
        'date_str': date_str,
        'prefecture': 'Special Event',
        'shop': name
    }

def _scrape_single_tournament(tournament: dict) -> list:
    """
    Worker function for multithreading.
    Robuste Tabellenextraktion - vermeidet tbody-Verschluck-Bug.
    """
    soup = fetch_page_bs4(tournament['url'])
    results = []
    if not soup:
        return results

    # ROBUST: Finde zuerst die Tabelle, dann alle <tr> direkt
    # Vermeidet BeautifulSoup tbody-Verschluck-Bug
    table = soup.select_one('table.striped')
    if not table:
        logger.debug(f"Keine Tabelle gefunden für Turnier {tournament.get('tournament_id', 'unknown')}")
        return results
    
    # Iteriere über ALLE <tr>-Zeilen, überspringe Header-Zeilen
    for row in table.find_all('tr'):
        # Überspringe Header-Zeilen (die nur <th> haben)
        if row.find('th'):
            continue
        
        cells = row.find_all('td')
        if len(cells) < 4:
            continue

        placement = cells[0].get_text(strip=True)
        player = cells[1].get_text(strip=True)

        # Extrahiere Pokémon-Namen aus img.pokemon Elementen.
        # ROBUST: scan the WHOLE row rather than a fixed cell index. Regular
        # JP City Leagues put the deck icons in cell[2], but majors like the
        # Japan Championships insert an extra country-flag column that shifts
        # them to cell[3] (verified 2026-07: tournament 568 had empty cell[2]
        # and img.pokemon in cell[3], so the old cells[2] lookup returned 0
        # archetypes and the whole event was silently dropped). img.pokemon
        # only ever marks a deck's Pokémon, so a row-wide select is layout-
        # independent.
        pokemon_imgs = row.select('img.pokemon')
        raw_names = [img['alt'] for img in pokemon_imgs if img.has_attr('alt')]

        # Bereinige Namen (entferne -EX, -VSTAR, etc. und fixe Mega)
        cleaned_names = [fix_mega_pokemon_name(clean_pokemon_name(n)) for n in raw_names]
        archetype_raw = ' '.join(cleaned_names)

        # Phase 3: try slug-signature match against Limitless canonical names
        # FIRST (order-insensitive, apostrophe-robust, mega-form aware). Falls
        # back to the historical normalize_archetype_name() flow if the
        # matcher isn't loaded or the signature isn't in the index yet.
        archetype = ''
        slug_candidates: list[str] = []
        if _matcher is not None and cleaned_names:
            # DER SLUG KOMMT AUS DER QUELLE, NICHT AUS DEM ANZEIGENAMEN
            #
            # BEFUND (Wochenlauf 157, 25.09.2026): hier stand
            # `cleaned_names`. Das sind die ANZEIGENAMEN — durch
            # fix_mega_pokemon_name() gelaufen, das aus der
            # Limitless-Schreibweise `starmie-mega` den Namen
            # `mega starmie` macht. Kleingeschrieben und mit Bindestrich
            # wurde daraus der Slug `mega-starmie`.
            #
            # Zwei Schaeden auf einmal:
            #   1. canonicalize_by_slugs() schlaegt in
            #      archetype_icons.json nach, und dort heisst die Form
            #      ueberall `starmie-mega`. Die Signatur traf nie.
            #   2. _record_observed_icons() schrieb `mega-starmie` als
            #      neuen Eintrag in die Datei — gegen die Regel, dass
            #      der Formzusatz ans ENDE des Slugs gehoert
            #      (tests/python/test_archetyp_icons.py).
            #
            # Aufgefallen ist es erst, als die Champions League Yokohama
            # in den japanischen Bestand kam und mit ihr die ersten
            # Mega-Formen. Die `alt`-Werte der Deck-Symbole SIND die
            # Limitless-Slugs (gemessen 25.09.2026 an Turnier 569:
            # excadrill-mega, clefairy, ogerpon, slowking). Sie werden
            # deshalb unveraendert genommen.
            slug_candidates = [n.strip().lower() for n in raw_names if n and n.strip()]
            canonical = _matcher.canonicalize_by_slugs(slug_candidates)
            if canonical:
                archetype = canonical
        if not archetype:
            archetype = normalize_archetype_name(archetype_raw) if archetype_raw else ''

        # Phase 4: harvest the (archetype → slugs) mapping for any combo
        # we just saw. archetype_icons_scraper only sees what
        # play.limitlesstcg.com surfaces on the EN decks page, which
        # excludes most JP-only City League combos (Aegislash Dragapult,
        # Alakazam Solrock, Beedrill Dudunsparce, etc.). Without this
        # harvest, the frontend renders those archetypes without Pokemon
        # icons because archetype_icons.json has no entry. Capping at 2
        # slugs matches the frontend renderer's display cap.
        if archetype and slug_candidates:
            _record_observed_icons(archetype, slug_candidates[:2])

        if placement.isdigit() and archetype:
            results.append({
                'date': tournament.get('date_str', ''),
                'tournament_id': tournament['tournament_id'],
                'prefecture': tournament.get('prefecture', ''),
                'shop': tournament.get('shop', ''),
                # Die Turnierklasse kommt AUS dem Turnier, nicht aus einer
                # festen Zeichenkette. Bis 25.09.2026 stand hier
                # 'City League (JP)' fest — damit haette ein japanisches
                # Major (Champions League, Regional League) in derselben
                # Spalte gestanden wie ein Laden-Turnier mit acht
                # Spielern, und niemand haette die beiden im Nachhinein
                # trennen koennen. Gemessen am 25.09.2026: die Champions
                # League Yokohama (Turnier 569) fuehrt 10.000 Spieler,
                # eine City League typisch 4 bis 16.
                'format': tournament.get('format') or 'City League (JP)',
                'placement': placement,
                'player': player,
                'archetype': archetype
            })
    return results


def _archetype_icons_path() -> str:
    """Resolve repo-root data/archetype_icons.json — the file the
    frontend actually reads. Mirrors archetype_icons_scraper._repo_data_dir."""
    repo_root = os.path.normpath(
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
    )
    return os.path.join(repo_root, "data", "archetype_icons.json")


def merge_observed_icons_into_json() -> Dict[str, int]:
    """Backfill archetype_icons.json with the (archetype → slugs) tuples
    we observed during this scrape run.

    Two distinct cases:
      (a) Archetype is missing from the file entirely (typical for
          JP-only combos like "Aegislash Dragapult" that
          play.limitlesstcg.com EN never lists). Add a fresh entry.
      (b) Archetype exists with EMPTY slug list (manual placeholder
          for "we know the name but had no Pokemon to point at" —
          e.g. "Psy Box", "Tera Box"). Fill in the first-seen slugs
          so the frontend can render an icon instead of a text
          fallback.

    Existing non-empty entries are NEVER overwritten — if a human
    curated a different slug list there, we trust it.

    Returns a dict {added, filled, unchanged} for the build log.
    """
    if not _observed_icons:
        return {"added": 0, "filled": 0, "unchanged": 0}

    path = _archetype_icons_path()
    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except FileNotFoundError:
        data = {"_meta": {}, "archetypes": {}}
    except Exception as e:
        logger.warning("Could not read %s: %s — skipping icon merge", path, e)
        return {"added": 0, "filled": 0, "unchanged": 0}

    archetypes: Dict[str, List[str]] = data.setdefault("archetypes", {})
    added: List[str] = []
    filled: List[str] = []
    unchanged: int = 0

    for name, slugs in _observed_icons.items():
        if name not in archetypes:
            archetypes[name] = list(slugs)
            added.append(name)
        elif not archetypes[name]:  # explicit empty list = placeholder
            archetypes[name] = list(slugs)
            filled.append(name)
        else:
            unchanged += 1

    if not added and not filled:
        logger.info(
            "[icon-harvest] %s observed combos already in archetype_icons.json — no merge needed",
            unchanged,
        )
        return {"added": 0, "filled": 0, "unchanged": unchanged}

    data.setdefault("_meta", {})["lastHarvestedFrom"] = "city_league_archetype_scraper"
    data["_meta"]["lastHarvestedAt"] = (
        __import__("datetime").datetime.now().isoformat(timespec="seconds")
    )
    data["archetypes"] = archetypes

    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2, sort_keys=False)

    logger.info(
        "[icon-harvest] %s → +%s new, ~%s filled (placeholder→slugs), =%s unchanged",
        path, len(added), len(filled), unchanged,
    )
    if added:
        logger.info("[icon-harvest] Added (sample): %s", added[:5])
    if filled:
        logger.info("[icon-harvest] Filled placeholders: %s", filled)
    return {"added": len(added), "filled": len(filled), "unchanged": unchanged}


# ============================================================================
# STATS & REPORT GENERATION
# ============================================================================
def save_to_csv(data: list, output_file: str):
    if not data:
        return
    output_path = os.path.join(get_data_dir(), output_file)

    with open(output_path, 'w', newline='', encoding='utf-8-sig') as csvfile:
        fieldnames = ['date', 'tournament_id', 'prefecture', 'shop', 'format', 'placement', 'player', 'archetype']
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames, delimiter=';')
        writer.writeheader()
        writer.writerows(data)
    logger.info("✓ %s Eintraege in %s gespeichert.", len(data), output_file)

def save_deck_statistics(data: list, output_file: str):
    stats_file = os.path.join(get_data_dir(), output_file.replace('.csv', '_deck_stats.csv'))
    deck_data = {}

    for entry in data:
        arch = entry.get('archetype', 'Unknown')
        place = int(entry.get('placement', 0))
        t_info = f"{entry.get('date', '')} - {entry.get('prefecture', '')} - {entry.get('shop', '')}"

        if arch not in deck_data:
            deck_data[arch] = {'count': 0, 'placements': [], 'tournaments': set(),
                               'formate': set()}

        deck_data[arch]['count'] += 1
        deck_data[arch]['placements'].append(place)
        deck_data[arch]['tournaments'].add(t_info)
        deck_data[arch]['formate'].add(entry.get('format') or 'City League (JP)')

    stats_rows = []
    for arch, info in deck_data.items():
        avg_place = sum(info['placements']) / len(info['placements']) if info['placements'] else 0
        stats_rows.append({
            'archetype': arch,
            # Mehrere Klassen sind moeglich, sobald ein Major mit im
            # Fenster liegt. Sie werden BENANNT, nicht auf eine
            # zusammengezogen — sonst liest sich ein Top-8-Platz beim
            # 10.000-Spieler-Major wie ein Ladensieg.
            'format': ' + '.join(sorted(info['formate'])) or 'City League (JP)',
            'total_appearances': info['count'],
            'average_placement': str(round(avg_place, 2)).replace('.', ','),
            'best_placement': min(info['placements']) if info['placements'] else 0,
            'worst_placement': max(info['placements']) if info['placements'] else 0,
            'tournaments': '; '.join(info['tournaments'])
        })

    stats_rows.sort(key=lambda x: x['total_appearances'], reverse=True)

    with open(stats_file, 'w', newline='', encoding='utf-8-sig') as f:
        fieldnames = ['archetype', 'format', 'total_appearances', 'average_placement', 'best_placement', 'worst_placement', 'tournaments']
        writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=';')
        writer.writeheader()
        writer.writerows(stats_rows)
    logger.info("✓ Deck Stats gespeichert in: %s", stats_file)

def create_comparison_report(old_data: list, new_data: list, output_file: str):
    data_dir = get_data_dir()
    comparison_csv = os.path.join(data_dir, output_file.replace('.csv', '_comparison.csv'))
    comparison_html = os.path.join(data_dir, output_file.replace('.csv', '_comparison.html'))

    def build_stats(data):
        stats = {}
        total_decks = len(data)  # Für Meta-Share-Berechnung
        for entry in data:
            arch = entry.get('archetype', 'Unknown')
            place = int(entry.get('placement', 0))
            if arch not in stats:
                stats[arch] = {'count': 0, 'placements': [], 'total_placement': 0}
            stats[arch]['count'] += 1
            stats[arch]['placements'].append(place)
            stats[arch]['total_placement'] += place
        for d in stats.values():
            d['avg_placement'] = d['total_placement'] / d['count'] if d['count'] > 0 else 0
            d['best_placement'] = min(d['placements']) if d['placements'] else 0
            d['meta_share'] = (d['count'] / total_decks * 100) if total_decks > 0 else 0  # NEU: Meta-Share
        return stats, total_decks

    old_stats, old_total = build_stats(old_data)
    new_stats, new_total = build_stats(new_data)

    comparison_data = []
    all_archetypes = set(old_stats.keys()) | set(new_stats.keys())

    for arch in all_archetypes:
        old = old_stats.get(arch, {'count': 0, 'avg_placement': 0, 'best_placement': 0, 'meta_share': 0})
        new = new_stats.get(arch, {'count': 0, 'avg_placement': 0, 'best_placement': 0, 'meta_share': 0})

        count_change = new['count'] - old['count']
        avg_change = new['avg_placement'] - old['avg_placement']
        meta_share_change = new['meta_share'] - old['meta_share']  # NEU: Meta-Share-Änderung

        if old['count'] == 0:
            status = 'NEU'
        elif new['count'] == 0:
            status = 'VERSCHWUNDEN'
        else:
            status = 'BESTEHEND'

        if abs(avg_change) < 0.5:
            trend = 'STABIL'
        elif avg_change < 0:
            trend = 'VERBESSERT'
        else:
            trend = 'VERSCHLECHTERT'

        comparison_data.append({
            'archetype': arch, 'status': status, 'trend': trend,
            'old_count': old['count'], 'new_count': new['count'], 'count_change': count_change,
            'old_meta_share': round(old['meta_share'], 2),  # NEU
            'new_meta_share': round(new['meta_share'], 2),  # NEU
            'meta_share_change': round(meta_share_change, 2),  # NEU
            'old_avg_placement': round(old['avg_placement'], 2), 'new_avg_placement': round(new['avg_placement'], 2),
            'avg_placement_change': round(avg_change, 2),
            'old_best': old['best_placement'], 'new_best': new['best_placement']
        })

    comparison_data.sort(key=lambda x: x['new_count'], reverse=True)

    with open(comparison_csv, 'w', newline='', encoding='utf-8-sig') as f:
        fieldnames = ['archetype', 'status', 'trend', 'old_count', 'new_count', 'count_change',
                      'old_meta_share', 'new_meta_share', 'meta_share_change',  # NEU
                      'old_avg_placement', 'new_avg_placement', 'avg_placement_change', 'old_best', 'new_best']
        writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=';')
        writer.writeheader()
        for row in comparison_data:
            rf = row.copy()
            # Formatiere Dezimalzahlen mit Komma für Excel (deutsches Format)
            for k in ['old_avg_placement', 'new_avg_placement', 'avg_placement_change',
                      'old_meta_share', 'new_meta_share', 'meta_share_change']:
                rf[k] = str(row[k]).replace('.', ',')
            writer.writerow(rf)

    create_html_comparison(comparison_data, comparison_html)
    logger.info("✓ HTML Report erzeugt: %s", comparison_html)


def create_html_comparison(comparison_data: list, output_file: str):
    new_decks = [d for d in comparison_data if d['status'] == 'NEU']
    disappeared_decks = [d for d in comparison_data if d['status'] == 'VERSCHWUNDEN']

    rows_html = ''.join(
        f'<tr>'
        f'<td><strong>{html_mod.escape(deck["archetype"])}</strong></td>'
        f'<td><span class="badge badge-{deck["status"].lower()}">{deck["status"]}</span></td>'
        f'<td><span class="badge badge-{deck["trend"].lower()}">{deck["trend"]}</span></td>'
        f'<td>{deck["new_count"]}</td>'
        f'<td><span class="{"positive" if deck["count_change"] > 0 else "negative" if deck["count_change"] < 0 else "neutral"}">({deck["count_change"]:+d})</span></td>'
        f'<td>{deck["new_meta_share"]:.1f}%</td>'
        f'<td><span class="{"positive" if deck["meta_share_change"] > 0 else "negative" if deck["meta_share_change"] < 0 else "neutral"}">({deck["meta_share_change"]:+.1f}%)</span></td>'
        f'<td>{deck["new_avg_placement"]:.2f}</td>'
        f'<td><span class="{"positive" if deck["avg_placement_change"] < 0 else "negative" if deck["avg_placement_change"] > 0 else "neutral"}">({deck["avg_placement_change"]:+.2f})</span></td>'
        f'<td>{deck["new_best"] if deck["new_best"] > 0 else "-"}</td>'
        f'</tr>'
        for deck in comparison_data[:50]
    )

    new_details = '<br>'.join([f"{html_mod.escape(d['archetype'])} ({d['new_count']}x)" for d in new_decks[:5]]) if new_decks else 'No new archetypes'
    dis_details = '<br>'.join([f"{html_mod.escape(d['archetype'])} (was {d['old_count']}x)" for d in disappeared_decks[:5]]) if disappeared_decks else 'No disappeared archetypes'
    most_active_count = comparison_data[0]['new_count'] if comparison_data else 0
    most_active_name = html_mod.escape(comparison_data[0]['archetype']) if comparison_data else 'No data'
    most_active_avg = comparison_data[0]['new_avg_placement'] if comparison_data else 0
    total_archetypes = len(comparison_data)
    generated_at = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    html = f"""<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <title>City League Archetype Comparison</title>
    <style>
        body {{ font-family: 'Segoe UI', Tahoma, sans-serif; line-height: 1.6; color: #333; max-width: 1400px; margin: 0 auto; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }}
        .container {{ background: white; border-radius: 10px; padding: 30px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); }}
        h1 {{ color: #2c3e50; text-align: center; margin-bottom: 10px; font-size: 2.5em; }}
        .subtitle {{ text-align: center; color: #7f8c8d; margin-bottom: 30px; font-size: 1.2em; }}
        .meta-info {{ background: #ecf0f1; padding: 15px; border-radius: 5px; margin-bottom: 30px; text-align: center; }}
        .meta-info span {{ display: inline-block; margin: 0 15px; font-weight: bold; }}
        .section {{ margin-bottom: 40px; }}
        .section h2 {{ color: #34495e; border-bottom: 3px solid #3498db; padding-bottom: 10px; margin-bottom: 20px; }}
        .stats-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 30px; }}
        .stat-card {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); }}
        .stat-card h3 {{ margin: 0 0 10px 0; font-size: 1.1em; opacity: 0.9; }}
        .stat-card .value {{ font-size: 2.5em; font-weight: bold; margin: 10px 0; }}
        .stat-card .details {{ font-size: 0.85em; opacity: 0.9; margin-top: 10px; }}
        table {{ width: 100%; border-collapse: collapse; margin-top: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
        th {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px; text-align: left; font-weight: 600; }}
        td {{ padding: 12px; border-bottom: 1px solid #ecf0f1; }}
        tr:hover {{ background-color: #f8f9fa; }}
        .badge {{ display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 0.85em; font-weight: bold; color: white; }}
        .badge-neu {{ background-color: #2ecc71; }}
        .badge-verschwunden {{ background-color: #e74c3c; }}
        .badge-bestehend {{ background-color: #3498db; }}
        .badge-verbessert {{ background-color: #27ae60; }}
        .badge-verschlechtert {{ background-color: #e67e22; }}
        .badge-stabil {{ background-color: #95a5a6; }}
        .positive {{ color: #27ae60; font-weight: bold; }}
        .negative {{ color: #e74c3c; font-weight: bold; }}
        .neutral {{ color: #95a5a6; }}
    </style>
</head>
<body>
    <div class="container">
        <h1>City League Archetype Comparison</h1>
        <div class="subtitle">Japanese City League Tournament Data</div>
        <div class="meta-info">
            <span>Generated: {generated_at}</span>
            <span>Total Archetypes Tracked: {total_archetypes}</span>
        </div>
        <div class="stats-grid">
            <div class="stat-card">
                <h3>New Archetypes</h3>
                <div class="value">{len(new_decks)}</div>
                <div class="details">{new_details}</div>
            </div>
            <div class="stat-card">
                <h3>Disappeared</h3>
                <div class="value">{len(disappeared_decks)}</div>
                <div class="details">{dis_details}</div>
            </div>
            <div class="stat-card">
                <h3>Most Active</h3>
                <div class="value">{most_active_count}</div>
                <div class="details">{most_active_name}<br>Avg Placement: {most_active_avg}</div>
            </div>
        </div>
        <div class="section">
            <h2>Full Comparison Table (Top 50)</h2>
            <table>
                <tr><th>Archetype</th><th>Status</th><th>Trend</th><th>Count</th><th>Count Δ</th><th>Meta Share</th><th>Share Δ</th><th>Avg Placement</th><th>Avg Δ</th><th>Best</th></tr>
                {rows_html}
            </table>
        </div>
    </div>
</body>
</html>"""

    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(html)

# ============================================================================
# MAIN EXECUTION
# ============================================================================
def main():
    logger.info("=" * 60)
    logger.info("CITY LEAGUE ARCHETYPE SCRAPER - FAST EDITION")
    logger.info("=" * 60)

    settings = _load_settings()
    start_date_str, end_date_str = calculate_date_range(settings['start_date'], settings['end_date'])

    try:
        start_date = parse_date(start_date_str)
        end_date = parse_date(end_date_str)
    except ValueError:
        return

    logger.info("Zeitraum: %s bis %s", start_date_str, end_date_str)

    tournaments = get_tournaments_in_date_range(settings['region'], start_date, end_date)
    vor_majors = len(tournaments)

    # Japanische Majors stehen nicht in /tournaments/jp, nur in der
    # Hauptliste. Ohne diesen Schritt bleibt der laufende japanische
    # Reiter in der Saisonpause der City League leer, obwohl es Daten
    # gibt (gemessen 25.09.2026, Champions League Yokohama).
    if settings.get('include_jp_majors', True):
        bekannte = {str(t['tournament_id']) for t in tournaments}
        for t in get_jp_major_tournaments(start_date, end_date):
            if str(t['tournament_id']) not in bekannte:
                tournaments.append(t)
                bekannte.add(str(t['tournament_id']))
        logger.info("Turnierliste: %s aus /tournaments/jp + %s japanische Majors.",
                    vor_majors, len(tournaments) - vor_majors)

    for t_id in settings.get('additional_tournament_ids', []):
        t_info = get_tournament_by_id(str(t_id))
        if t_info:
            tournaments.append(t_info)
            logger.info("Zusaetzliches Turnier %s geladen.", t_id)

    if not tournaments:
        logger.info("Keine Turniere gefunden.")
        return

    # Load existing to skip already scraped tournaments
    existing_ids = set()
    output_path = os.path.join(get_data_dir(), settings['output_file'])
    if os.path.exists(output_path):
        with open(output_path, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f, delimiter=';')
            for row in reader:
                if row.get('tournament_id'):
                    existing_ids.add(row['tournament_id'])

    new_tournaments = [t for t in tournaments if str(t['tournament_id']) not in existing_ids]

    if not new_tournaments:
        logger.info("Alle Turniere wurden bereits erfasst!")
        return

    logger.info("Starte Multithreading Download fuer %s Turniere...", len(new_tournaments))
    all_data = []

    min_size = settings.get("min_tournament_size", 32)
    with concurrent.futures.ThreadPoolExecutor(max_workers=settings.get("max_workers", 5)) as executor:
        future_to_t = {executor.submit(_scrape_single_tournament, t): t for t in new_tournaments}
        for future in concurrent.futures.as_completed(future_to_t):
            t = future_to_t[future]
            try:
                res = future.result()
                if len(res) < min_size:
                    logger.info(f"  {t.get('shop', t['tournament_id'])} (ID: {t['tournament_id']}) -> {len(res)} Decks (< {min_size} – uebersprungen)")
                    continue
                all_data.extend(res)
                logger.info(f"  {t.get('shop', t['tournament_id'])} (ID: {t['tournament_id']}) -> {len(res)} Decks")
            except Exception as e:
                logger.error(f"Fehler bei {t['tournament_id']}: {e}")

    logger.info("Scraping beendet. %s neue Archetypes gefunden.", len(all_data))

    old_data = []
    if os.path.exists(output_path):
        with open(output_path, 'r', encoding='utf-8-sig') as f:
            old_data = list(csv.DictReader(f, delimiter=';'))

    new_data = old_data + all_data

    if all_data:
        save_to_csv(new_data, settings['output_file'])
        save_deck_statistics(new_data, settings['output_file'])
        create_comparison_report(old_data, new_data, settings['output_file'])
    else:
        # Im LAUFENDEN japanischen Fenster ist leer derzeit der richtige
        # Zustand (Saisonpause der City League), deswegen hier bewusst
        # nur eine Meldung und kein Fehler. Sichtbar muss es trotzdem
        # sein: "nichts gefunden" und "nichts da" sehen im Log sonst
        # gleich aus. Der Past-Zwilling behandelt denselben Fall
        # strenger, weil dort ein Turnier stehen muss.
        logger.warning(
            "Kein einziger Archetyp gefunden — %s Turniere geprueft. "
            "Bestehende Datei bleibt unveraendert.", len(new_tournaments))
        print(f"::warning::city_league_archetype_scraper: 0 Archetypen aus "
              f"{len(new_tournaments)} Turnieren. Bei Saisonpause richtig; "
              f"kommen Turniere zurueck und das bleibt so, hat die Quelle "
              f"ihr Tabellenlayout geaendert.")

    # Phase 4: backfill archetype_icons.json with the JP-only combos we
    # saw this run. Runs even when all_data is empty so we still pick
    # up zero-slug-placeholder fills (Psy Box, Tera Box, …) the next
    # time those archetypes show up in a tournament we DID scrape on
    # an earlier run.
    merge_observed_icons_into_json()

    logger.info("=" * 60)
    logger.info("ERFOLGREICH BEENDET")
    logger.info("=" * 60)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logger.warning("Abbruch durch Benutzer.")
        sys.exit(130)
    except Exception as e:
        logger.critical(f"Unerwarteter Fehler: {e}", exc_info=True)
        print(f"::error::city_league_archetype_scraper abgebrochen: {e}")
        sys.exit(1)
