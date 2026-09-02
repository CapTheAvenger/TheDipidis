#!/usr/bin/env python3
"""Player-Continuity Scraper.

For every tournament_id in labs_tournaments.json, fetch the full
labs.limitlesstcg.com/<tid>/standings table and extract
(player_name, deck_slug, place) for every entry — not just top-8.

Output: data/player_continuity.csv
Schema: tournament_id, tournament_date, meta, place, player_name,
        country, deck_slug, deck_archetype, wins, losses, ties

Why this signal matters for Meta Call:
  - Player retention vs switching: "did the player who won the last
    regional bring the same deck this time?" is a stronger forward
    indicator than aggregate brought-share.
  - Pro-player concentration: when a recognised name brings a fringe
    deck, that's a hype seed — top-of-game pilots see what others
    don't.
  - Geographic continuity: EU pilots' deck choices at EU regionals
    are more predictive of the next EU regional than NA aggregates.

The scraper deliberately consumes only the standings page (one fetch
per tournament). No decklist parsing — that lives in the labs deck
scraper. We pair on deck_slug → archetype using the labs_tournament_
decks.csv lookup that the existing labs scraper already produces.

Usage:
  python backend/scrapers/player_continuity_scraper.py
  python backend/scrapers/player_continuity_scraper.py --tournament-id 0068
  python backend/scrapers/player_continuity_scraper.py --from-date 2026-04-01
  python backend/scrapers/player_continuity_scraper.py --resume   # only fetch missing tids
"""

import argparse
import csv
import json
import logging
import os
import re
import sys
import time
from typing import Dict, List, Optional

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.normpath(os.path.join(_SCRIPT_DIR, '..', '..'))
_CORE_DIR = os.path.join(_SCRIPT_DIR, '..', 'core')
if _CORE_DIR not in sys.path:
    sys.path.insert(0, _CORE_DIR)

from card_scraper_shared import (
    setup_console_encoding,
    fetch_page_bs4,
    setup_logging,
    get_data_dir,
    fix_mojibake,
)

setup_console_encoding()
logger = setup_logging("player_continuity_scraper")

BASE_URL = "https://labs.limitlesstcg.com"
DEFAULT_DELAY = 1.5  # seconds between requests
OUTPUT_FILE = "player_continuity.csv"


def load_tournaments_index(data_dir: str) -> List[Dict]:
    """labs_tournaments.json is the tid index the labs deck scraper writes."""
    path = os.path.join(data_dir, "labs_tournaments.json")
    if not os.path.exists(path):
        logger.error("labs_tournaments.json not found at %s. Run the labs "
                     "deck scraper first to seed the tid index.", path)
        return []
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def load_deck_archetype_map(data_dir: str) -> Dict[str, str]:
    """Map deck_slug → deck_name from labs_tournament_decks.csv so the
    output of this scraper carries the same canonical archetype labels
    as the existing predictor consumes."""
    path = os.path.join(data_dir, "labs_tournament_decks.csv")
    out: Dict[str, str] = {}
    if not os.path.exists(path):
        return out
    with open(path, encoding='utf-8-sig') as f:
        for r in csv.DictReader(f):
            slug = (r.get('deck_slug') or '').strip()
            name = (r.get('deck_name') or '').strip()
            if slug and name and slug not in out:
                out[slug] = name
    return out


def load_meta_map(data_dir: str) -> Dict[str, str]:
    """Map tournament_id -> meta from labs_tournament_decks.csv.

    Warum nicht aus labs_tournaments.json: dieser Index fuehrt die
    Spalte `meta` ueberhaupt nicht (Schluessel: tournament_id,
    tournament_name, tournament_date, tournament_type, country,
    total_players). `t.get('meta')` war deshalb immer None, und die
    Spalte stand in ALLEN 5619 Zeilen der Ausgabe leer — gemessen am
    29.08.2026.

    Das ist keine Kosmetik: der Prognosemotor filtert die Klebrigkeit
    ueber genau diese Spalte (`js/app-meta-call.js`: if (prev && meta
    && meta !== prev) return;). Ohne sie greift der Filter nie und das
    Fenster mischt drei Formate.

    labs_tournament_decks.csv fuehrt `meta` je Turnier eindeutig und
    ist dieselbe Quelle, aus der schon die Archetyp-Karte kommt."""
    path = os.path.join(data_dir, "labs_tournament_decks.csv")
    out: Dict[str, str] = {}
    if not os.path.exists(path):
        logger.warning("labs_tournament_decks.csv fehlt — meta bleibt leer.")
        return out
    widersprueche: Dict[str, set] = {}
    with open(path, encoding='utf-8-sig') as f:
        for r in csv.DictReader(f):
            tid = (r.get('tournament_id') or '').strip()
            meta = (r.get('meta') or '').strip()
            if not tid or not meta:
                continue
            widersprueche.setdefault(tid, set()).add(meta)
            out.setdefault(tid, meta)
    # Melden, nicht stillschweigend das erste nehmen.
    for tid, werte in widersprueche.items():
        if len(werte) > 1:
            logger.warning("tid=%s traegt mehrere metas %s — nehme %s",
                           tid, sorted(werte), out[tid])
    return out


def scrape_standings_full(tournament_id: str) -> Optional[List[Dict]]:
    """Fetch /<tid>/standings and return every row as
    { place, player_name, country, deck_slug, wins, losses, ties }.

    Returns None when the page could NOT BE READ — a 403, a timeout, a
    hung connection. Returns [] only when the page loaded and genuinely
    carries no standings table.

    THAT DISTINCTION IS THE WHOLE POINT (02.09.2026).
    Until now both cases returned []. The caller drops the existing rows
    for every tournament it is about to re-scrape, so an empty result
    meant: the rows are gone. Reproduced with fetch_page_bs4 forced to
    None — 4 rows in, 1 row out, and main() returned 0, i.e. success.

    Limitless throttles bulk scraping from datacenter IPs with 403s
    (CLAUDE.md, "External sources & rate limits"). Drosselung ist kein
    Urteil ueber die Daten: the same principle is already spelled out in
    tests/python/test_price_mapping_verification.py — "403 row untouched
    — throttled is not a verdict". This scraper did not follow it.

    Defensive parser: header columns are discovered by text rather
    than hardcoded indices so a labs layout shuffle doesn't silently
    mis-attribute fields."""
    url = f"{BASE_URL}/{tournament_id}/standings"
    logger.info("  Fetching %s", url)
    soup = fetch_page_bs4(url)
    if not soup:
        logger.error("    Standings NICHT LESBAR fuer %s — Bestand bleibt "
                     "unangetastet", tournament_id)
        return None

    table = soup.find('table', attrs={'class': re.compile(r'data-table')})
    if not table:
        logger.warning("    No standings data-table for %s", tournament_id)
        return []

    headers_raw = [th.get_text(strip=True).lower() for th in table.select('thead th')]
    # Discover column indices defensively. Labs has used various headers
    # over time — search for the first match in a list of synonyms.
    def find_col(synonyms):
        for syn in synonyms:
            for i, h in enumerate(headers_raw):
                hh = h.strip(' #')
                if hh == syn or h == '#' and syn == 'place':
                    return i
        return None

    col_place   = find_col(['place', 'rank', 'pos', 'position']) or 0
    col_player  = find_col(['player', 'name'])
    col_country = find_col(['country', 'cc', 'flag'])
    if col_country is None:
        # Die Flaggenspalte auf labs traegt eine LEERE Kopfzeile. Der
        # Textabgleich oben konnte sie deshalb nie finden — country
        # stand in allen 5619 Zeilen leer. Also nach dem Inhalt suchen:
        # die erste Zelle, die eine Flagge mit zweibuchstabigem alt
        # traegt (<img alt="US">) oder einen Landeslink (?c=US).
        for zeile in table.select('tbody tr')[:8]:
            zellen = zeile.find_all('td')
            for i, z in enumerate(zellen):
                img = z.find('img')
                if img and re.fullmatch(r'[A-Za-z]{2}', (img.get('alt') or '').strip()):
                    col_country = i
                    break
                a = z.find('a', href=re.compile(r'[?&]c=[A-Za-z]{2}\b'))
                if a:
                    col_country = i
                    break
            if col_country is not None:
                break
        if col_country is None:
            logger.warning("    Keine Laenderspalte gefunden fuer %s", tournament_id)
    col_record  = find_col(['record', 'w-l-t', 'record (w-l-t)'])

    out: List[Dict] = []
    for row in table.select('tbody tr'):
        cells = row.find_all('td')
        if len(cells) <= col_place:
            continue
        place_text = cells[col_place].get_text(strip=True)
        place_match = re.match(r'\d+', place_text)
        if not place_match:
            continue
        place = int(place_match.group())

        player_name = ''
        if col_player is not None and col_player < len(cells):
            player_name = fix_mojibake(cells[col_player].get_text(strip=True))

        country = ''
        if col_country is not None and col_country < len(cells):
            country_cell = cells[col_country]
            # Country sometimes encoded as <img alt="DE"> flag
            img = country_cell.find('img')
            if img and img.get('alt'):
                country = img.get('alt')
            else:
                country = country_cell.get_text(strip=True)

        # Deck slug from /<tid>/decks/<slug> link in any cell
        slug = ''
        for c in cells:
            a = c.find('a', href=re.compile(r'/decks?/'))
            if a:
                href = a.get('href', '')
                candidate = href.rsplit('/', 1)[-1]
                if candidate and candidate not in ('decks', 'standings'):
                    slug = candidate
                    break

        wins = losses = ties = 0
        if col_record is not None and col_record < len(cells):
            record_text = cells[col_record].get_text(strip=True)
            m = re.match(r'(\d+)\s*-\s*(\d+)(?:\s*-\s*(\d+))?', record_text)
            if m:
                wins = int(m.group(1))
                losses = int(m.group(2))
                ties = int(m.group(3) or 0)

        out.append({
            'place': place,
            'player_name': player_name,
            'country': country,
            'deck_slug': slug,
            'wins': wins,
            'losses': losses,
            'ties': ties,
        })

    logger.info("    → %d standings rows captured", len(out))
    return out


def load_existing_output(out_path: str) -> set:
    """Return set of tournament_ids already in the output file so
    --resume can skip them."""
    seen = set()
    if not os.path.exists(out_path):
        return seen
    with open(out_path, encoding='utf-8-sig') as f:
        for r in csv.DictReader(f):
            tid = (r.get('tournament_id') or '').strip()
            if tid:
                seen.add(tid)
    return seen


def write_output(rows: List[Dict], out_path: str):
    """Atomic write: temp file then rename. Avoids half-written CSV on
    interrupt."""
    fieldnames = ['tournament_id', 'tournament_date', 'meta', 'place',
                  'player_name', 'country', 'deck_slug', 'deck_archetype',
                  'wins', 'losses', 'ties']
    tmp_path = out_path + '.tmp'
    with open(tmp_path, 'w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in rows:
            w.writerow(r)
    os.replace(tmp_path, out_path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--tournament-id', default='', help='Scrape one tid only.')
    ap.add_argument('--from-date', default='', help='Only tids dated ≥ this ISO date.')
    ap.add_argument('--resume', action='store_true',
                    help='Skip tids already in player_continuity.csv.')
    ap.add_argument('--delay', type=float, default=DEFAULT_DELAY,
                    help='Seconds between fetches (default 1.5).')
    args = ap.parse_args()

    data_dir = get_data_dir()
    out_path = os.path.join(data_dir, OUTPUT_FILE)

    tournaments = load_tournaments_index(data_dir)
    if not tournaments:
        return 1

    archetype_map = load_deck_archetype_map(data_dir)
    logger.info("Loaded %d deck_slug → deck_name mappings", len(archetype_map))
    meta_map = load_meta_map(data_dir)
    logger.info("Loaded %d tournament_id → meta mappings", len(meta_map))

    # Filter tids per CLI
    target = []
    for t in tournaments:
        tid = str(t.get('tournament_id') or '').strip()
        if not tid:
            continue
        if args.tournament_id and tid != args.tournament_id:
            continue
        date = (t.get('tournament_date') or '').strip()
        if args.from_date and date and date < args.from_date:
            continue
        target.append(t)

    if args.resume:
        already = load_existing_output(out_path)
        before = len(target)
        target = [t for t in target if str(t.get('tournament_id')) not in already]
        logger.info("--resume: %d / %d tids already scraped, %d to fetch",
                    before - len(target), before, len(target))

    if not target:
        logger.info("Nothing to do — exit clean.")
        return 0

    # Bestand einlesen und NACH TURNIER GRUPPIEREN.
    #
    # Vorher wurden die Zeilen der Turniere, die gleich neu geholt
    # werden, hier sofort verworfen. Kam der Abruf dann nicht durch,
    # waren sie weg — ohne dass irgendetwas es gemeldet haette. Jetzt
    # bleiben sie liegen, bis ein Abruf tatsaechlich etwas Besseres
    # liefert.
    ziel_tids = {str(t.get('tournament_id')) for t in target}
    fremde_zeilen: List[Dict] = []          # Turniere, die nicht dran sind
    bestand_je_tid: Dict[str, List[Dict]] = {}
    if os.path.exists(out_path):
        with open(out_path, encoding='utf-8-sig') as f:
            for r in csv.DictReader(f):
                tid_r = str(r.get('tournament_id') or '')
                if tid_r in ziel_tids:
                    bestand_je_tid.setdefault(tid_r, []).append(r)
                else:
                    fremde_zeilen.append(r)

    # Was am Ende in der Datei stehen soll — je Turnier entweder das
    # frisch Geholte oder der unveraenderte Bestand.
    ergebnis_je_tid: Dict[str, List[Dict]] = {}
    # Turniere, deren Standings nicht gelesen werden konnten.
    nicht_lesbar: List[str] = []

    def alle_zeilen() -> List[Dict]:
        """Fremde Zeilen + entschiedene Turniere + noch nicht bearbeitete.

        Der letzte Teil ist wichtig: bricht der Lauf in der Mitte ab,
        darf der Zwischenstand die noch nicht angefassten Turniere nicht
        verlieren."""
        raus = list(fremde_zeilen)
        for tid_k in ziel_tids:
            if tid_k in ergebnis_je_tid:
                raus.extend(ergebnis_je_tid[tid_k])
            else:
                raus.extend(bestand_je_tid.get(tid_k, []))
        return raus

    for i, t in enumerate(target, 1):
        tid = str(t.get('tournament_id')).strip()
        date = (t.get('tournament_date') or '').strip()
        # Index zuerst (falls er die Spalte je bekommt), sonst die
        # Karte aus labs_tournament_decks.csv.
        meta = (t.get('meta') or '').strip() or meta_map.get(tid, '')
        if not meta:
            logger.warning("    tid=%s ohne meta — die Klebrigkeit kann "
                           "dieses Turnier nicht nach Format filtern.", tid)
        logger.info("[%d/%d] tid=%s  %s  %s",
                    i, len(target), tid, date, meta or '(no meta)')
        rows = scrape_standings_full(tid)
        if rows is None:
            # NICHT LESBAR — nicht "leer". Der Bestand bleibt stehen.
            behalten = bestand_je_tid.get(tid, [])
            ergebnis_je_tid[tid] = behalten
            nicht_lesbar.append(tid)
            logger.error("    tid=%s uebersprungen, %d vorhandene Zeilen "
                         "bleiben unangetastet", tid, len(behalten))
            if i < len(target):
                time.sleep(args.delay)
            continue

        neue = []
        for r in rows:
            slug = r['deck_slug']
            archetype = archetype_map.get(slug, '')
            neue.append({
                'tournament_id': tid,
                'tournament_date': date,
                'meta': meta,
                'place': r['place'],
                'player_name': r['player_name'],
                'country': r['country'],
                'deck_slug': slug,
                'deck_archetype': archetype,
                'wins': r['wins'],
                'losses': r['losses'],
                'ties': r['ties'],
            })

        # Die Seite war lesbar und traegt keine Standings — dann ist die
        # Null echt. Hatte das Turnier aber schon einmal Zeilen, ist das
        # ein Widerspruch, den niemand still aufloesen sollte: melden und
        # den Bestand behalten.
        alt_bestand = bestand_je_tid.get(tid, [])
        if not neue and alt_bestand:
            logger.error("    tid=%s liefert 0 Zeilen, hatte aber %d. Das "
                         "ist kein Ergebnis, das ist ein Widerspruch — "
                         "Bestand bleibt, Turnier gilt als nicht gelesen.",
                         tid, len(alt_bestand))
            ergebnis_je_tid[tid] = alt_bestand
            nicht_lesbar.append(tid)
        else:
            ergebnis_je_tid[tid] = neue

        # Zwischenstand nach jedem Turnier, damit ein Abbruch keine
        # Arbeit kostet.
        write_output(alle_zeilen(), out_path)
        if i < len(target):
            time.sleep(args.delay)

    endstand = alle_zeilen()
    write_output(endstand, out_path)
    logger.info("Done — %d rows in %s across %d tournaments",
                len(endstand), out_path,
                len({r['tournament_id'] for r in endstand}))

    if nicht_lesbar:
        # Der Wochenlauf wertet den Rueckgabewert aus und schreibt ihn in
        # die Bilanz (.github/workflows/weekly-full-update.yml:426).
        # Ein stiller Erfolg waere hier das Schlimmste: die Datei saehe
        # gesund aus, waere aber nicht auf dem Stand, den sie vorgibt.
        logger.error("%d von %d Turnieren waren nicht lesbar (%s%s). Ihre "
                     "Zeilen stehen unveraendert in der Datei — der Lauf "
                     "ist NICHT vollstaendig.",
                     len(nicht_lesbar), len(target),
                     ', '.join(nicht_lesbar[:8]),
                     ' …' if len(nicht_lesbar) > 8 else '')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main() or 0)
