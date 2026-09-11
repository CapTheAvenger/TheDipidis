#!/usr/bin/env python3
"""Per-Decklist Scraper.

Reads each tournament on limitlesstcg.com, walks the standings table
ROW BY ROW (not just the aggregated /decks/list/<id> link collection
the old JH scraper uses), and writes ONE CSV row per
(tournament × player × card) — preserving per-decklist resolution
that the existing pipeline aggregates away.

Why this exists:
  - The current pipeline aggregates card stats per archetype-per-
    tournament: 21 Slowking decklists at Turin collapse to a single
    "Slowking @ Turin" stats row. The deckbuilder's Most-Consistency
    output, the Past-Meta "best successful list" display, and the
    user's "weight 2nd-place > 100th-place" spec all need
    per-decklist resolution. Without it, the algorithm has to guess.

What's preserved:
  - tournament_id (labs 4-digit canonical, joins with
    labs_tournament_decks.csv + player_continuity.csv)
  - place (per row)
  - player_name (per row)
  - deck_archetype + deck_slug (canonical labels)
  - record (W-L-T per row)
  - per-card count IN THIS SPECIFIC LIST

Output: data/tournament_decklists_per_player.csv
Schema (header row):
  tournament_id, tournament_name, tournament_date, meta,
  place, player_name, deck_archetype, deck_slug,
  wins, losses, ties,
  card_name, card_identifier, set_code, set_number,
  count, type, is_ace_spec, quelle, druck_quelle, scraped_at

Usage:
  python backend/scrapers/per_decklist_scraper.py
  python backend/scrapers/per_decklist_scraper.py --tournament-url <url>
  python backend/scrapers/per_decklist_scraper.py --from-tournament-id 530
  python backend/scrapers/per_decklist_scraper.py --resume   # skip tids
                                                              # already in
                                                              # the output
  python backend/scrapers/per_decklist_scraper.py --bilanzen-nachtragen
                       # ohne Netz: 0-0-0-Bilanzen im vorhandenen Bestand
                       # aus data/player_continuity.csv fuellen; was dort
                       # nicht steht, bekommt leere Felder statt einer 0.

Network notes:
  - One fetch per tournament page (?show=2000 to skip pagination).
  - One fetch per UNIQUE decklist URL (multiple players sharing an
    identical list resolve to the same /decks/list/<id> and we cache
    the deck so we only pay for the fetch once).
  - Cloudscraper handles Cloudflare. Default 1.0 s delay between
    requests is a polite citizen rate.
"""

import argparse
import contextlib
import csv
import json
import logging
import os
import re
import sys
import time
import unicodedata
from collections import OrderedDict
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.normpath(os.path.join(_SCRIPT_DIR, '..', '..'))
_CORE_DIR = os.path.join(_SCRIPT_DIR, '..', 'core')
if _CORE_DIR not in sys.path:
    sys.path.insert(0, _CORE_DIR)
if _SCRIPT_DIR not in sys.path:
    sys.path.insert(0, _SCRIPT_DIR)

from card_scraper_shared import (
    setup_console_encoding,
    fetch_page_bs4,
    setup_logging,
    get_data_dir,
    fix_mojibake,
    CardDatabaseLookup,
    extract_cards_from_decklist_soup,
)
# Dieselbe Regel wie in der Bestandsreparatur.
from ace_spec_regel import entscheide_zeile, lade_ace_liste
from turnier_legalitaet import zweiter_freitag_nach

# Reuse the JH scraper's name → labs-tid resolver + format/meta derivation
# so per-decklist rows carry the same canonical labels as the existing
# aggregated pipeline. No code duplication, no drift risk.
from tournament_scraper_JH import (
    get_tournament_info,
    _resolve_labs_tournament_id,
    _parse_iso_date,
    _derive_meta_from_date_JH,
    _clean_deck_name,
    normalize_tournament_format,
    # BEFUND 07.09.2026: fehlte hier. Der JH-Scraper geht an beiden
    # Schreibstellen durch den Datums-Override, dieser Scraper ging
    # daran vorbei — und schrieb fuer Turnier 518 (NAIC 2026) in
    # 16.960 Zeilen das rohe Quelldatum 2026-06-10 statt des
    # belegten 2026-06-12. Siehe Kommentar bei t_date_raw.
    _datum_mit_override,
)

setup_console_encoding()
logger = setup_logging("per_decklist_scraper")

BASE_URL = "https://limitlesstcg.com"
TOURNAMENTS_INDEX_URL = f"{BASE_URL}/tournaments"
DEFAULT_DELAY = 1.0
OUTPUT_FILE = "tournament_decklists_per_player.csv"

# Standings table header synonyms — labs / limitless have used variants
# across versions. Defensive: search the synonym list against each
# header text, take the first match.
_HEADER_SYNONYMS = {
    'place':    ['place', 'rank', 'pos', 'position', '#'],
    'player':   ['player', 'name', 'username'],
    'country':  ['country', 'cc', 'flag'],
    'deck':     ['deck', 'archetype', 'list'],
    'wins':     ['wins', 'w'],
    'losses':   ['losses', 'l'],
    'ties':     ['ties', 't', 'draws', 'd'],
    'record':   ['record', 'w-l-t', 'record (w-l-t)'],
}


def _find_col(headers_lc: List[str], key: str) -> Optional[int]:
    """Discover a column index by trying any synonym for `key`."""
    syns = _HEADER_SYNONYMS.get(key, [key])
    for syn in syns:
        for i, h in enumerate(headers_lc):
            h_clean = h.strip(' #').strip()
            if h_clean == syn:
                return i
    return None


def _parse_record(text: str) -> Tuple[int, int, int]:
    """'7-2-0' / '7 - 2 - 0' → (7, 2, 0). '7-2' → (7, 2, 0). Empty → (0,0,0)."""
    if not text:
        return (0, 0, 0)
    m = re.match(r'(\d+)\s*-\s*(\d+)(?:\s*-\s*(\d+))?', text.strip())
    if not m:
        return (0, 0, 0)
    return (int(m.group(1)), int(m.group(2)), int(m.group(3) or 0))


def parse_standings_rows(tournament_url: str) -> List[Dict]:
    """Walk the tournament standings table on limitlesstcg.com and
    return one dict per row: { place, player_name, deck_id, deck_name,
    wins, losses, ties }.

    Multiple players can map to the same deck_id when they ran
    identical lists — caller deduplicates the deck fetch via cache.

    Defensive: header columns are discovered by text, not index. If
    the deck-link column is missing on a row (rare), that row is
    skipped with a warning so a single malformed row doesn't kill the
    whole tournament."""
    fetch_url = f"{tournament_url.rstrip('/')}?show=2000"
    logger.info("  Fetching standings: %s", fetch_url)
    soup = fetch_page_bs4(fetch_url)
    if not soup:
        logger.warning("    Standings fetch failed")
        return []

    # The tournament page typically has multiple tables; the standings
    # table is the one with /decks/list/ links in body rows. Iterate
    # candidates to find it.
    standings_table = None
    for table in soup.select('table'):
        if table.find('a', href=re.compile(r'^/decks/list/')):
            standings_table = table
            break
    if not standings_table:
        logger.warning("    No standings table with /decks/list/ links")
        return []

    header_cells = standings_table.select('thead th') or standings_table.select('tr:first-child th')
    headers_lc = [th.get_text(strip=True).lower() for th in header_cells]
    if not headers_lc:
        logger.warning("    Standings table has no <th> headers — schema unknown")
        return []

    col_place   = _find_col(headers_lc, 'place')
    col_player  = _find_col(headers_lc, 'player')
    col_record  = _find_col(headers_lc, 'record')
    col_wins    = _find_col(headers_lc, 'wins')
    col_losses  = _find_col(headers_lc, 'losses')
    col_ties    = _find_col(headers_lc, 'ties')
    col_deck    = _find_col(headers_lc, 'deck')

    if col_place is None:
        col_place = 0  # standings tables put the # column first

    rows_out: List[Dict] = []
    for tr in standings_table.select('tbody tr') or standings_table.select('tr'):
        cells = tr.find_all('td')
        if not cells or len(cells) <= col_place:
            continue

        place_text = cells[col_place].get_text(strip=True)
        m = re.match(r'\d+', place_text)
        if not m:
            continue
        place = int(m.group())

        player_name = ''
        if col_player is not None and col_player < len(cells):
            player_name = fix_mojibake(cells[col_player].get_text(strip=True))

        # Decklist link can be in any cell; look for /decks/list/<id>
        deck_link = None
        for c in cells:
            a = c.find('a', href=re.compile(r'^/decks/list/'))
            if a:
                deck_link = a
                break
        if not deck_link:
            # Player dropped / didn't share a list — happens at the
            # tail of the standings. Skip without warning (expected).
            continue
        deck_id = deck_link['href'].rsplit('/', 1)[-1]
        deck_name_raw = deck_link.get_text(strip=True) or ''
        deck_name = _clean_deck_name(deck_name_raw)

        wins = losses = ties = 0
        if col_record is not None and col_record < len(cells):
            wins, losses, ties = _parse_record(cells[col_record].get_text(strip=True))
        else:
            if col_wins is not None and col_wins < len(cells):
                wins, _, _ = _parse_record(cells[col_wins].get_text(strip=True))
            if col_losses is not None and col_losses < len(cells):
                _, losses, _ = _parse_record(cells[col_losses].get_text(strip=True))
            if col_ties is not None and col_ties < len(cells):
                _, _, ties = _parse_record(cells[col_ties].get_text(strip=True))

        rows_out.append({
            'place':       place,
            'player_name': player_name,
            'deck_id':     deck_id,
            'deck_name':   deck_name,
            'deck_url':    f"{BASE_URL}/decks/list/{deck_id}",
            'wins':        wins,
            'losses':      losses,
            'ties':        ties,
        })

    logger.info("    → %d standings rows captured", len(rows_out))
    return rows_out


def fetch_decklist_cards_and_title(deck_url: str, card_db: CardDatabaseLookup) -> Tuple[List[Dict], str]:
    """Fetch /decks/list/<id> and return (cards, deck_title).

    cards: list of { card_name, set_code, set_number, count, type,
    is_ace_spec } via the existing shared extractor. Returns ([], '')
    on fetch failure.

    deck_title: the archetype label scraped from the page's
    .decklist-title element — the SAME source the JH aggregator uses,
    so labels stay canonical across pipelines. The standings-table
    link text doesn't carry the archetype name (just "View" or blank),
    which is why the first 2026-06-09 backfill produced 78k rows with
    deck_archetype = '' everywhere."""
    soup = fetch_page_bs4(deck_url)
    if not soup:
        logger.warning("    Decklist fetch failed: %s", deck_url)
        return ([], '')
    title_elem = soup.select_one('.decklist-title')
    raw_title = title_elem.get_text(strip=True) if title_elem else ''
    title = _clean_deck_name(raw_title) if raw_title else ''
    return (extract_cards_from_decklist_soup(soup, card_db), title)


def load_tournament_index_from_jh_state() -> List[Dict]:
    """Read tournament_jh_scraped.json + tournament_jh_settings.json
    to reconstruct the set of tournaments the JH scraper has seen.
    Returns a list of { id, url } records that mirrors what the JH
    scraper iterates."""
    data_dir = get_data_dir()
    path = os.path.join(data_dir, 'tournament_jh_scraped.json')
    if not os.path.exists(path):
        return []
    try:
        with open(path, encoding='utf-8') as f:
            blob = json.load(f)
    except Exception as e:
        logger.error("Failed to parse %s: %s", path, e)
        return []
    ids = blob.get('scraped_tournament_ids', [])
    if not isinstance(ids, list):
        return []
    return [
        {'id': str(t).strip(), 'url': f"{BASE_URL}/tournaments/{t}"}
        for t in ids if str(t).strip().isdigit()
    ]


def _bilanz_namensschluessel(name: str) -> str:
    """Der Spielername als Vergleichsschluessel zwischen den zwei Dateien.

    BEFUND 07.09.2026. Der Rueckfall unten verglich die Namen roh.
    tournament_decklists_per_player.csv fuehrt `Benjamin Pham`,
    player_continuity.csv fuehrt `benjamin pham` — derselbe Mensch, kein
    Treffer. Gemessen an den 100 genullten Decklisten des Bestands:

        roh                                   0 von 100 Treffern
        .strip().lower()                     84 von 100
        zusaetzlich entakzentuiert           86 von 100
        zusaetzlich ohne Satzzeichen         86 von 100

    Die dritte Stufe bringt zwei Treffer (Namen mit Akzent, die eine der
    beiden Quellen entakzentuiert fuehrt). Die vierte bringt heute
    nichts; sie steht trotzdem hier, weil `Jesper S.H Eriksen` gegen
    `Jesper S.H. Eriksen` sonst wieder am Punkt scheitert und ein
    doppeltes Leerzeichen ebenso. Sie kostet keinen Treffer, das ist
    gemessen, nicht vermutet.

    Weiter wird NICHT normalisiert. Namensteile wegzulassen oder
    umzusortieren waere kein Schluessel mehr, sondern ein Ratespiel.
    """
    t = unicodedata.normalize('NFKD', (name or '').strip().lower())
    t = ''.join(c for c in t if not unicodedata.combining(c))
    t = ''.join(c if (c.isalnum() or c.isspace()) else ' ' for c in t)
    return ' '.join(t.split())


def _namen_meinen_denselben(a: str, b: str) -> bool:
    """Sind das zwei Schreibweisen EINES Spielers?

    Nur wahr, wenn die Wortteile des einen Namens vollstaendig in denen
    des anderen stecken UND mindestens zwei Teile gemeinsam sind. Also
    ja fuer `Marco Aurelio Fernandes Garcia` / `Marco Garcia` und fuer
    `Seungrim Kim` / `KIM SEUNGRIM`; nein fuer zwei fremde Menschen, die
    sich nur einen Vornamen teilen.

    Zwei gemeinsame Teile sind das Mindestmass, weil ein einzelner
    gleicher Vorname bei 797 Spielern eines Turniers nichts beweist.
    """
    ta = set(_bilanz_namensschluessel(a).split())
    tb = set(_bilanz_namensschluessel(b).split())
    if not ta or not tb:
        return False
    return (ta <= tb or tb <= ta) and len(ta & tb) >= 2


class Kontinuitaetsbilanzen:
    """Die Bilanzen aus player_continuity.csv, auf zwei Wegen nachschlagbar.

    `nach_name`  (labs_tid, Platz, Namensschluessel) -> (w, l, t)
    `nach_platz` (labs_tid, Platz)                   -> [(Name, (w, l, t))]

    Der Platzweg ist der zweite Anlauf fuer die Faelle, in denen die
    beiden Dateien denselben Menschen verschieden ausschreiben
    (`Marco Cifuentes Meta` gegen `Marco Cifuentes`). Er ist nur so
    sicher, wie der Platz eindeutig ist — deshalb wird ausschliesslich
    ein EINZELNER Eintrag unter (Turnier, Platz) genommen, und der Name
    muss zusaetzlich zum selben Menschen passen.

    Belegt, bevor dieser Weg gebaut wurde (gemessen am 07.09.2026 gegen
    alle 1.201 Decklisten des Bestands):
      * 1.201 von 1.201 finden GENAU EINEN Eintrag unter (Turnier, Platz);
        mehrfach belegte Paare gibt es nur mit LEEREM Platz (52 Zeilen,
        ausgestiegene Spieler) — die kommen hier nicht vor.
      * 1.187 Namen sind danach zeichengleich, 14 sind Teilmengen,
        0 sind fremd.
      * Bei den 1.101 Listen, die schon eine Bilanz tragen, stimmt die
        Bilanz aus player_continuity.csv in 1.101 von 1.101 Faellen
        aufs Spiel genau ueberein. Diese Datei widerspricht dem
        Bestand nirgends; sie fuellt nur, was fehlt.
    """

    def __init__(self, nach_name, nach_platz):
        self.nach_name = nach_name
        self.nach_platz = nach_platz

    def __bool__(self) -> bool:
        return bool(self.nach_name)

    def __len__(self) -> int:
        return len(self.nach_name)

    def finde(self, tid, place, name):
        """((w, l, t), Weg) oder None. `Weg` ist 'name' oder 'platz'."""
        tid = str(tid or '').strip()
        place = str(place or '').strip()
        if not (tid and place):
            return None
        schl = _bilanz_namensschluessel(name)
        if schl:
            treffer = self.nach_name.get((tid, place, schl))
            if treffer:
                return treffer, 'name'
        kandidaten = self.nach_platz.get((tid, place)) or []
        if len(kandidaten) == 1:
            k_name, k_bilanz = kandidaten[0]
            if _namen_meinen_denselben(name, k_name):
                return k_bilanz, 'platz'
        return None


def _pfad_zur_kontinuitaetsdatei() -> str:
    """player_continuity.csv — erst im Arbeitsverzeichnis, dann im Repo.

    `get_data_dir()` zeigt auf backend/core/data. Im Wochenlauf wird die
    Datei dorthin geseedet, lokal steht sie nur unter data/ im Repo.
    Ohne den zweiten Blick lief `--bilanzen-nachtragen` von Hand ins
    Leere und meldete "Quelle fehlt", obwohl sie danebenlag.
    Zurueck kommt der erste Pfad, den es gibt, sonst ''.
    """
    for p in (os.path.join(get_data_dir(), 'player_continuity.csv'),
              os.path.join(_PROJECT_ROOT, 'data', 'player_continuity.csv')):
        if os.path.exists(p):
            return p
    return ''


def load_player_continuity_records() -> Kontinuitaetsbilanzen:
    """Bilanzen aus player_continuity.csv, nachschlagbar nach Namen und
    nach Platz. Rueckfall fuer den Fall, dass der Standings-Leser die
    Bilanz nicht aus der Turnierseite bekommt — Special-Event-Seiten
    (Turin 2026-06 war der erste Fall) fuehren eine Spalte
    "Match Points" statt "Record", die `_HEADER_SYNONYMS` nicht kennt,
    und liefern dann (0, 0, 0). player_continuity.csv wird von einem
    anderen Scraper mit einem anderen Leser geschrieben und hat die
    Bilanz.

    Eine 0-0-0-Bilanz wird NICHT uebernommen: sie waere kein Fund,
    sondern dieselbe Luecke noch einmal. Dass es sie als echte Bilanz
    nicht gibt, ist gemessen — von 21.247 Eintraegen mit Platz in
    player_continuity.csv traegt kein einziger 0-0-0.

    Leere Bilanzen, wenn die Datei fehlt — der Aufrufer ueberspringt
    den Schritt dann stillschweigend."""
    leer = Kontinuitaetsbilanzen({}, {})
    path = _pfad_zur_kontinuitaetsdatei()
    if not path:
        return leer
    nach_name: Dict[Tuple[str, str, str], Tuple[int, int, int]] = {}
    nach_platz: Dict[Tuple[str, str], List[Tuple[str, Tuple[int, int, int]]]] = {}
    try:
        with open(path, encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for r in reader:
                tid = (r.get('tournament_id') or '').strip()
                place = (r.get('place') or '').strip()
                player = (r.get('player_name') or '').strip()
                if not (tid and place and player):
                    continue
                try:
                    w = int(r.get('wins') or 0)
                    l = int(r.get('losses') or 0)
                    t = int(r.get('ties') or 0)
                except ValueError:
                    continue
                if (w + l + t) <= 0:
                    continue
                nach_name[(tid, place, _bilanz_namensschluessel(player))] = (w, l, t)
                nach_platz.setdefault((tid, place), []).append((player, (w, l, t)))
    except Exception as e:
        logger.warning("Could not parse player_continuity.csv: %s", e)
        return leer
    return Kontinuitaetsbilanzen(nach_name, nach_platz)


def load_tournament_metadata_lookup() -> Dict[str, Dict]:
    """Build { limitless_tid: {date_iso, meta} } from
    tournament_cards_data_overview.csv so we can pre-filter
    tournaments by date / meta WITHOUT having to fetch each one's
    page first. The overview file is written by the JH scraper —
    every tournament the index walked is in there with its
    canonicalised metadata.

    Returns {} when the overview file is missing — caller treats
    that as "no metadata, can't pre-filter, fetch all"."""
    data_dir = get_data_dir()
    path = os.path.join(data_dir, 'tournament_cards_data_overview.csv')
    if not os.path.exists(path):
        return {}
    # English-ordinal date parser — same shape as the JH scraper helper
    import re as _re
    months = {'january':1,'february':2,'march':3,'april':4,'may':5,'june':6,
              'july':7,'august':8,'september':9,'october':10,'november':11,'december':12}
    def parse_eng_ord(s: str) -> str:
        if not s:
            return ''
        m = _re.match(r'(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)\s+(\d{4})', s.strip())
        if not m:
            return ''
        mn = m.group(2).lower()
        if mn not in months:
            return ''
        try:
            d = datetime(int(m.group(3)), months[mn], int(m.group(1)))
            return d.strftime('%Y-%m-%d')
        except ValueError:
            return ''
    out: Dict[str, Dict] = {}
    # The overview CSV uses ';' separator (JH legacy)
    try:
        with open(path, encoding='utf-8-sig') as f:
            reader = csv.DictReader(f, delimiter=';')
            for r in reader:
                tid = (r.get('tournament_id') or '').strip()
                if not tid:
                    continue
                out[tid] = {
                    'date_iso': parse_eng_ord(r.get('tournament_date', '')),
                    'meta':     (r.get('format') or '').strip(),
                    'name':     (r.get('tournament_name') or '').strip(),
                    'players':  (r.get('players') or '').strip(),
                }
    except Exception as e:
        logger.warning("Could not parse overview CSV: %s", e)
        return {}
    return out


def load_existing_output(out_path: str) -> set:
    """Return set of limitless tournament IDs already in the output.
    We key on the limitless ID (not labs) because that's what we
    iterate. --resume skips these."""
    seen = set()
    if not os.path.exists(out_path):
        return seen
    try:
        with open(out_path, encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for r in reader:
                lid = r.get('limitless_tournament_id', '').strip()
                if lid:
                    seen.add(lid)
    except Exception as e:
        logger.warning("Could not parse existing output: %s", e)
    return seen


CSV_FIELDS = [
    'tournament_id',          # labs canonical (4-digit), '' if unmapped
    'limitless_tournament_id',  # 3-digit limitless internal
    'tournament_name',
    'tournament_date',        # ISO YYYY-MM-DD
    'meta',                   # e.g. TEF-CRI
    'place',
    'player_name',
    'deck_archetype',
    'deck_slug',              # the deck_id from /decks/list/<id>
    'wins',
    'losses',
    'ties',
    'card_name',
    'card_identifier',
    'set_code',
    'set_number',
    'count',
    'type',
    'is_ace_spec',
    # Woher die ZEILE stammt, nicht die Karte:
    #   'papier'  limitlesstcg.com — dieser Scraper hier.
    #   'online'  play.limitlesstcg.com — der Online-Scraper
    #             (backend/scrapers/limitless_online_decklist_scraper.py),
    #             der seit dem 07.09.2026 in DIESELBE Datei schreibt.
    # Die Spalte steht hier und nicht nur drueben, weil `write_rows` die
    # Datei bei abweichender Kopfzeile komplett neu schreibt: fehlte
    # 'quelle' in dieser Liste, wuerde der naechste Papier-Lauf die
    # Herkunft aller Online-Zeilen wieder wegwerfen.
    'quelle',
    # Die Feldgroesse des Turniers, gemessen an der Quelle.
    #
    # WARUM DIESE SPALTE SEIT DEM 10.09.2026 EXISTIERT: Papierzeilen
    # tragen eine `tournament_id`, ueber die
    # js/deck-builder-consistency.js die Spielerzahl aus
    # data/labs_tournament_decks.csv holt. Online-Zeilen haben keine
    # Labs-Nummer (siehe limitless_online_decklist_scraper.py) — der
    # Deckbauer fand fuer sie KEINE Feldgroesse und vergab still den
    # Notwert `SIZE_WEIGHT_FLOOR` 0,5.
    #
    # Gemessen am 10.09.2026, nach dem ersten Lauf mit Online-Zeilen:
    # 1.319 Online-Listen trugen 24,6 % der Gewichtsmasse des
    # Deckbauers — zum Notwert, nicht zu einer gemessenen Groesse.
    #
    # Der Online-Scraper liest die Zahl ohnehin schon aus dem Attribut
    # `data-players` der Turnierliste (Funktion `hole_turnierliste`);
    # sie stand nur nie in der Zeile. Papierzeilen lassen die Spalte
    # leer: dort ist die Labs-Datei die Quelle, und eine zweite Zahl
    # danebenzuschreiben hiesse, zwei Wahrheiten zu pflegen.
    'spielerzahl',
    # Woher der Druck (set, number) stammt: 'seite' = von der
    # Decklistenseite abgegriffen, 'name' = ueber den Kartennamen
    # aufgeloest, weil die Seite nichts hergab. Leer = vor dem
    # 06.09.2026 geschrieben, als der Trainerzweig IMMER ueber den
    # Namen ging (70 von 147 Trainer-/Energiezeilen der Stichprobe
    # falsch). Der Waechter zaehlt die leeren Zeilen, damit der Rest
    # des Bestands nicht als geprueft durchgeht.
    'druck_quelle',
    'scraped_at',
]


def _bestand_lesen(out_path: str) -> Tuple[List[str], List[Dict]]:
    """Kopfzeile und Zeilen der vorhandenen Datei. Leere Rueckgabe,
    wenn es sie nicht gibt."""
    if not os.path.exists(out_path):
        return [], []
    with open(out_path, newline='', encoding='utf-8') as f:
        rd = csv.DictReader(f)
        return list(rd.fieldnames or []), list(rd)


def _schluessel(r: Dict) -> Tuple[str, str, str]:
    """Die Einheit, die ein erneuter Lauf ersetzt: die Deckliste EINES
    Spielers bei EINEM Turnier.

    Nicht die einzelne Karte. Beim Aufraeumen am 06.09.2026 habe ich
    zuerst `(Turnier, Spieler, Deck, Kartenname)` genommen und damit
    beinahe 122 echte Zeilen geloescht: ein Spieler fuehrt sehr wohl
    2x Abra TWM 80 UND 2x Abra MEG 54 — derselbe Name, zwei Drucke,
    zwei berechtigte Zeilen. Genau die Unterscheidung, die dieser
    Scraper seit PR #687 ueberhaupt erst sichtbar macht.

    Den Druck in den Schluessel zu nehmen, hilft aber auch nicht: beim
    Neulauf AENDERT sich der Druck (ASC 207 -> DRI 176), die alte Zeile
    haette einen anderen Schluessel und bliebe stehen. Ersetzt wird
    deshalb die ganze Deckliste auf einmal.

    OFFEN, bewusst so gelassen (07.09.2026). Dieser Schluessel vergleicht
    den Spielernamen zeichengenau — dieselbe Bauart, die den
    Bilanz-Rueckfall stumm gemacht hat (siehe
    `_bilanz_namensschluessel`). Gemessen am heutigen Bestand ist er
    unauffaellig: 1.201 verschiedene Schluessel zeichengenau, 1.201
    normalisiert, also kein einziges Paar, das nur an der
    Schreibweise auseinanderfaellt. Traete eines auf, wuerde die alte
    Zeile nicht ersetzt, sondern verdoppelt.
    Hier trotzdem NICHT normalisiert, weil
    `limitless_online_decklist_scraper._schluessel` in dieselbe Datei
    schreibt und dieselbe Einteilung waehlen muss. Einseitig geaendert
    waeren es zwei Schreiber mit zwei Vorstellungen davon, was dieselbe
    Deckliste ist — schlimmer als das Problem. Zu aendern sind beide
    zusammen.
    """
    return (
        str(r.get('limitless_tournament_id', '') or ''),
        str(r.get('player_name', '') or ''),
        str(r.get('deck_slug', '') or ''),
    )


def write_rows(rows: List[Dict], out_path: str, append: bool = True) -> None:
    """Schreibt `rows` in die Ausgabedatei.

    Zwei Fallen, die am 06.09.2026 im echten Lauf zugeschnappt sind und
    seitdem hier abgefangen werden:

    1. **Kopfzeile veraltet.** Das alte `write_rows` haengte mit dem
       AKTUELLEN `CSV_FIELDS` an eine Datei an, deren Kopfzeile noch
       die alte Spaltenliste trug. Als PR #687 `druck_quelle` einfuehrte,
       schrieb der naechste Lauf 21-Feld-Zeilen unter eine 20-Feld-
       Kopfzeile: `seite` landete in der Spalte `scraped_at`, alles
       dahinter war verschoben. Die Datei sah nur beim Lesen kaputt aus,
       nicht beim Schreiben — der Lauf meldete Erfolg.
       Jetzt gilt: weicht die vorhandene Kopfzeile von `CSV_FIELDS` ab,
       wird die GANZE Datei neu geschrieben und die alten Zeilen werden
       mitgenommen (fehlende Felder bleiben leer, statt zu verrutschen).

    2. **Anhaengen verdoppelt.** Ein Lauf ohne `--resume` holt Turniere
       neu, die schon in der Datei stehen. Angehaengt standen sie danach
       zweimal drin — einmal mit den alten falschen Drucken, einmal mit
       den richtigen. 889 Schluessel doppelt, gemessen am 06.09.2026.
       Jetzt ersetzt ein neu geschriebenes Deck das alte mit demselben
       Schluessel (Turnier, Spieler, Deck) — siehe `_schluessel`.

    `append=False` schreibt weiterhin kompromisslos neu.
    """
    kopf_alt, bestand = _bestand_lesen(out_path) if append else ([], [])
    kopf_passt = (kopf_alt == CSV_FIELDS)

    if append and bestand and kopf_passt:
        # Kopfzeile stimmt: nur die ersetzten Schluessel herausnehmen und
        # anhaengen. Das ist der schnelle Normalfall.
        neue = {_schluessel(r) for r in rows}
        ueberlebende = [r for r in bestand if _schluessel(r) not in neue]
        if len(ueberlebende) == len(bestand):
            with open(out_path, 'a', newline='', encoding='utf-8') as f:
                writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
                for r in rows:
                    writer.writerow({k: r.get(k, '') for k in CSV_FIELDS})
            return
        ersetzt = len(bestand) - len(ueberlebende)
        logger.info("    %d vorhandene Zeile(n) werden durch neue ersetzt", ersetzt)
        auszugeben = ueberlebende + rows
    elif append and bestand and not kopf_passt:
        logger.warning(
            "    Kopfzeile der vorhandenen Datei weicht ab (%d statt %d Spalten) — "
            "Datei wird komplett neu geschrieben, alte Zeilen werden uebernommen",
            len(kopf_alt), len(CSV_FIELDS))
        neue = {_schluessel(r) for r in rows}
        ueberlebende = [r for r in bestand if _schluessel(r) not in neue]
        auszugeben = ueberlebende + rows
    else:
        auszugeben = list(rows)

    with open(out_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        writer.writeheader()
        for r in auszugeben:
            # Restrict to known fields (writer would raise on extras)
            writer.writerow({k: r.get(k, '') for k in CSV_FIELDS})


def bilanz_rueckfall_je_zeile(rows_std: List[Dict], labs_tid: str,
                             bilanzen: 'Kontinuitaetsbilanzen') -> Dict[str, int]:
    """Fuellt JEDE genullte Standings-Zeile einzeln aus den Bilanzen.
    Aendert `rows_std` an Ort und Stelle, zaehlt die Wege zurueck.

    Ausdruecklich JE ZEILE und nicht je Stapel. Der Vorgaenger fragte
    `all_zero`, also ob der ganze Stapel genullt ist, und feuerte
    deshalb nie: bei Worlds (0071) waren 28 von 143 Listen genullt,
    bei NAIC (0070) 32 von 675. Gemessen am Bestand blieben so 100 von
    1.201 Decklisten mit 0-0-0 stehen, darunter Platz 53, Benjamin
    Pham, Mega Excadrill — dessen Bilanz 8-3-1 die ganze Zeit in
    player_continuity.csv stand.

    Eine vorhandene Bilanz wird nie angefasst. Eine echte 0-0-0-Bilanz
    zu ueberschreiben ist ausgeschlossen: von 21.247 Eintraegen mit
    Platz in player_continuity.csv traegt keiner 0-0-0 — wer mit einem
    Platz in einer Standings-Tabelle steht, hat gespielt.
    """
    z = {'aus_name': 0, 'aus_platz': 0, 'unbekannt': 0}
    for r in rows_std:
        werte = [str(r.get(k, '') if r.get(k, '') is not None else '').strip()
                 for k in ('wins', 'losses', 'ties')]
        if any(v == '' for v in werte):
            # Schon als "keine Quelle" gekennzeichnet — nicht erneut anfassen.
            continue
        try:
            if sum(int(v) for v in werte) > 0:
                continue
        except ValueError:
            continue
        fund = bilanzen.finde(labs_tid, r.get('place'), r.get('player_name'))
        if fund:
            (w, l, t), weg = fund
            r['wins'], r['losses'], r['ties'] = w, l, t
            z['aus_name' if weg == 'name' else 'aus_platz'] += 1
        else:
            # Keine Quelle — also auch keine Zahl. Leer statt 0, damit
            # die Zeile nichts behauptet, statt "0 Siege" zu behaupten.
            r['wins'] = r['losses'] = r['ties'] = ''
            z['unbekannt'] += 1
    return z


def scrape_one_tournament(
    tournament: Dict,
    card_db: CardDatabaseLookup,
    delay: float = DEFAULT_DELAY,
    continuity_records: Optional['Kontinuitaetsbilanzen'] = None,
) -> List[Dict]:
    """Scrape one tournament end-to-end and return the rows. Top-level
    flow:

      1. Fetch tournament metadata (name, date, format) via the
         existing JH helper.
      2. Walk standings rows.
      3. For each unique deck_id, fetch /decks/list/<id> ONCE
         (multiple players sharing an identical list reuse the
         cached card lookup).
      4. Emit one row per (player × card).
    """
    tid_lim = tournament['id']
    t_url = tournament['url']
    logger.info("Tournament %s — %s", tid_lim, t_url)

    info = get_tournament_info(t_url)
    t_name = info.get('name', '') or ''
    # Limitless ist die Quelle, aber nicht unfehlbar. Turnier 518 (NAIC
    # 2026, New Orleans) steht auf der Turnierseite auf dem 10.06.2026 —
    # einem Mittwoch. Gelaufen ist es vom 12. bis 14. Juni; labs fuehrt es
    # unter 0070 mit dem 12.06. Fuer genau solche Faelle gibt es
    # data/labs_tournament_id_overrides.json. Der JH-Scraper wendet den
    # Override an beiden eigenen Schreibstellen an, dieser hier tat es
    # bis zum 07.09.2026 nicht — Folge: 16.960 Zeilen mit dem falschen
    # Datum, waehrend tournament_cards_data_overview.csv fuer dasselbe
    # Turnier das richtige trug.
    t_date_raw = _datum_mit_override(tid_lim, info.get('date', '') or '')
    t_date_iso = _parse_iso_date(t_date_raw)

    # Meta: prefer the scraped format, fall back to date-based JH helper
    api_format = info.get('format') or ''
    if not api_format:
        api_format = _derive_meta_from_date_JH(t_date_iso or t_date_raw)
    meta = normalize_tournament_format(api_format) if api_format else ''

    # Resolve labs-canonical 4-digit tid (matches labs_tournament_decks
    # + player_continuity). Empty string when no mapping known.
    labs_tid = _resolve_labs_tournament_id(t_name, t_date_iso, tid_lim)

    rows_std = parse_standings_rows(t_url)
    if not rows_std:
        logger.info("  No standings rows for %s — skipping", tid_lim)
        return []

    # Bilanz-Rueckfall aus player_continuity.csv.
    #
    # Der Standings-Leser liefert (0, 0, 0), wenn die Turnierseite die
    # Bilanz in einer Spalte fuehrt, die `_HEADER_SYNONYMS` nicht kennt
    # ("Match Points" statt "Record"; Turin 2026-06 war der erste Fall).
    # player_continuity.csv hat die Bilanz, weil sie von einem anderen
    # Scraper mit einem anderen Leser geschrieben wird.
    #
    # ZWEI BEFUNDE vom 07.09.2026, die diesen Block vorher stumm
    # liessen — beide gemessen am Bestand:
    #
    #  1. Der Rueckfall fragte `all_zero`, also ob der GANZE Stapel
    #     genullt ist. Bei Worlds (0071) waren 28 von 143 Listen
    #     genullt, bei NAIC (0070) 32 von 675 — der Stapel war nie
    #     ganz genullt, der Rueckfall feuerte nie, und 100 von 1.201
    #     Decklisten standen mit 0-0-0 da. Darunter Platz 53, Benjamin
    #     Pham, Mega Excadrill, dessen Bilanz 8-3-1 die ganze Zeit in
    #     player_continuity.csv stand.
    #     Jetzt wird JEDE ZEILE einzeln gefragt. Das ist auch das
    #     richtige Mass: eine halb geratene Standings-Tabelle ist
    #     wahrscheinlicher als eine ganz kaputte.
    #  2. Der Schluessel verglich die Namen zeichengenau. Der Bestand
    #     fuehrt `Benjamin Pham`, player_continuity.csv `benjamin pham`.
    #     Treffer zeichengenau: 0 von 100. Ueber
    #     `_bilanz_namensschluessel`: 86 von 100.
    #
    # Eine vorhandene Bilanz wird NIE angefasst — nur Zeilen, die
    # 0-0-0 tragen. Dass eine echte 0-0-0-Bilanz dabei ueberschrieben
    # werden koennte, ist ausgeschlossen und nicht bloss angenommen:
    # von 21.247 Eintraegen mit Platz in player_continuity.csv traegt
    # keiner 0-0-0. Wer in einer Standings-Tabelle mit einem Platz
    # steht, hat gespielt.
    if continuity_records and labs_tid:
        z = bilanz_rueckfall_je_zeile(rows_std, labs_tid, continuity_records)
        if z['aus_name'] or z['aus_platz'] or z['unbekannt']:
            logger.info("  Bilanz-Rueckfall: %d ueber den Namen, %d ueber den "
                        "Platz, %d ohne Quelle (bleiben leer) — von %d Zeilen",
                        z['aus_name'], z['aus_platz'], z['unbekannt'],
                        len(rows_std))
        if z['unbekannt']:
            print(f"::warning::per_decklist_scraper: {z['unbekannt']} Spieler "
                  f"bei Turnier {labs_tid} haben weder auf der Turnierseite "
                  f"noch in player_continuity.csv eine Bilanz. Ihre Felder "
                  f"wins/losses/ties bleiben LEER — nicht 0.")

    # Group rows by deck_id so we fetch each unique decklist once
    by_deck_id: "OrderedDict[str, List[Dict]]" = OrderedDict()
    for r in rows_std:
        by_deck_id.setdefault(r['deck_id'], []).append(r)

    scraped_at = datetime.now(timezone.utc).isoformat()
    out_rows: List[Dict] = []
    for deck_id, players in by_deck_id.items():
        time.sleep(delay)
        cards, deck_title_from_page = fetch_decklist_cards_and_title(
            players[0]['deck_url'], card_db)
        if not cards:
            logger.warning("  Empty card list for deck_id=%s (%d players affected)",
                           deck_id, len(players))
            continue
        # The page-derived title is the canonical archetype label
        # (matches JH aggregator's .decklist-title source). Fall back
        # to the standings-table cell text only if the page didn't
        # supply a title — that text is usually "View" / blank but
        # better than nothing.
        archetype_label = deck_title_from_page or players[0].get('deck_name', '')
        for p in players:
            for c in cards:
                card_name = c.get('name', '') or c.get('card_name', '')
                set_code = c.get('set_code', '')
                set_number = c.get('card_number', '') or c.get('set_number', '')
                identifier = f"{set_code} {set_number}".strip()
                out_rows.append({
                    'tournament_id':             labs_tid,
                    'limitless_tournament_id':   tid_lim,
                    'tournament_name':           t_name,
                    'tournament_date':           t_date_iso,
                    'meta':                      meta,
                    'place':                     p['place'],
                    'player_name':               p['player_name'],
                    'deck_archetype':            archetype_label,
                    'deck_slug':                 deck_id,
                    'wins':                      p['wins'],
                    'losses':                    p['losses'],
                    'ties':                      p['ties'],
                    'card_name':                 card_name,
                    'card_identifier':           identifier,
                    'set_code':                  set_code,
                    'set_number':                set_number,
                    'count':                     c.get('count', 0),
                    'type':                      c.get('type', '') or c.get('card_type', ''),
                    # Papier — siehe CSV_FIELDS.
                    'quelle':                    'papier',
                    'druck_quelle':              c.get('druck_quelle', ''),
                    # Belegt statt geraten — siehe backend/core/ace_spec_regel.py.
                    'is_ace_spec':               ('Yes' if c.get('is_ace_spec')
                                                  else entscheide_zeile(
                                                      card_name, lade_ace_liste(),
                                                      c.get('count', 0),
                                                      c.get('type', '') or c.get('card_type', ''))),
                    'scraped_at':                scraped_at,
                })

    logger.info("  → %d per-(player × card) rows for tournament %s",
                len(out_rows), tid_lim)
    return out_rows


def _nach_datum(werke, overview, cutoff_iso):
    """Turniere ab `cutoff_iso` behalten.

    Zeilen ohne Datum bleiben drin: die Uebersicht kennt frisch
    entdeckte Turniere manchmal noch nicht, und etwas wegzuwerfen, das
    man nicht datieren kann, waere eine stille Reparatur.
    """
    kept = []
    for w in werke:
        d = (overview.get(w['id']) or {}).get('date_iso', '')
        if not d or d >= cutoff_iso:
            kept.append(w)
    return kept


def _vorformat_fenster(data_dir):
    """(Startdatum, Name) des vorherigen Formats — oder (None, None).

    previous_format_key steht in format_window.json und wird bei jeder
    Rotation von Hand gepflegt (z. B. "TEF-CRI"). Die neuere Haelfte
    davon ist das Set, dessen Praesenzfenster damals begann — dieselbe
    Rechnung wie fuer das laufende Format: der zweite Freitag nach dem
    Erscheinen (backend/core/turnier_legalitaet.py).

    NICHT lag_days aus format_window.json nehmen. Die Zahl gehoert seit
    dem 11.09.2026 zum LAUFENDEN Set (sie wird aus dessen Datum
    abgeleitet und ist bei einem Mittwochs-Release neun statt vierzehn
    Tage). Auf das Erscheinungsdatum eines ANDEREN Sets angewandt ergibt
    sie einen Tag, den es nie gab.
    """
    try:
        with open(os.path.join(data_dir, 'format_window.json'), encoding='utf-8') as f:
            fw = json.load(f)
    except Exception:
        return None, None
    schluessel = str(fw.get('previous_format_key') or '').strip()
    if not schluessel or '-' not in schluessel:
        return None, None
    neueres_set = schluessel.split('-')[-1].strip().upper()
    if not neueres_set:
        return None, None
    try:
        with open(os.path.join(data_dir, 'sets_metadata.json'), encoding='utf-8') as f:
            meta = json.load(f)
    except Exception:
        return None, schluessel
    eintrag = meta.get(neueres_set) or {}
    erschienen = str(eintrag.get('release_date') or '').strip()
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', erschienen):
        return None, schluessel
    grenze = zweiter_freitag_nach(erschienen)
    if not grenze:
        return None, schluessel
    return grenze, schluessel


def _schreibe_atomar(pfad: str, kopf: List[str], zeilen: List[Dict]) -> None:
    """Erst daneben schreiben, dann umbenennen.

    `open(pfad, "w")` kuerzt die vorhandene Datei, BEVOR geschrieben
    wird. Ein Abbruch mittendrin — der Ablauf in Actions hat ein
    Zeitlimit — hinterliesse eine halbe CSV, und der Commit-Schritt
    committet sie. Gleiche Bauart wie `_schreibe_atomar` in
    backend/scrapers/limitless_online_decklist_scraper.py.
    """
    os.makedirs(os.path.dirname(pfad) or '.', exist_ok=True)
    vorlaeufig = pfad + '.tmp'
    with open(vorlaeufig, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=kopf)
        w.writeheader()
        for z in zeilen:
            w.writerow({k: z.get(k, '') for k in kopf})
    os.replace(vorlaeufig, pfad)


def _ist_genullt(z: Dict) -> bool:
    """Traegt diese Zeile eine 0-0-0-Bilanz?

    Leere Felder zaehlen NICHT als genullt: sie sind das Kennzeichen
    fuer "keine Quelle gefunden" und wurden absichtlich so gesetzt.
    Sie noch einmal anzufassen brachte nichts und wuerde nur
    verschleiern, wie viele Luecken wirklich offen sind.
    """
    werte = [str(z.get(k, '')).strip() for k in ('wins', 'losses', 'ties')]
    if any(v == '' for v in werte):
        return False
    try:
        return sum(int(v) for v in werte) == 0
    except ValueError:
        return False


def bilanzen_nachtragen(zeilen: List[Dict],
                        bilanzen: 'Kontinuitaetsbilanzen') -> Dict[str, int]:
    """Genullte Bilanzen im vorhandenen Bestand aus player_continuity.csv
    nachtragen. Aendert `zeilen` an Ort und Stelle.

    Entschieden wird je DECKLISTE (Turnier, Platz, Spieler), nicht je
    Kartenzeile: eine Liste hat 20 bis 30 Kartenzeilen, und alle tragen
    dieselbe Bilanz. Einmal nachschlagen statt dreissigmal, und vor
    allem: keine Liste, die am Ende halb gefuellt dasteht.

    Angefasst werden ausschliesslich `wins`, `losses` und `ties`, und
    das nur bei Zeilen, die heute 0-0-0 tragen. Rueckgabe: die Zaehlung
    nach Weg.
    """
    # Decklisten sammeln
    nach_liste: "OrderedDict[Tuple[str, str, str], List[Dict]]" = OrderedDict()
    for z in zeilen:
        schl = (str(z.get('tournament_id', '') or '').strip(),
                str(z.get('place', '') or '').strip(),
                str(z.get('player_name', '') or '').strip())
        nach_liste.setdefault(schl, []).append(z)

    zaehlung = {'listen': len(nach_liste), 'genullt': 0, 'aus_name': 0,
                'aus_platz': 0, 'unbekannt': 0, 'zeilen_geaendert': 0}
    offen: List[Tuple[Tuple[str, str, str], Dict]] = []
    for (tid, platz, name), gruppe in nach_liste.items():
        if not _ist_genullt(gruppe[0]):
            continue
        zaehlung['genullt'] += 1
        fund = bilanzen.finde(tid, platz, name) if bilanzen else None
        if fund:
            (w, l, t), weg = fund
            zaehlung['aus_name' if weg == 'name' else 'aus_platz'] += 1
            for z in gruppe:
                z['wins'], z['losses'], z['ties'] = str(w), str(l), str(t)
                zaehlung['zeilen_geaendert'] += 1
        else:
            # Keine Quelle. Leer statt 0 — die Zeile behauptet dann
            # nichts mehr, statt "0 Siege" zu behaupten.
            zaehlung['unbekannt'] += 1
            offen.append(((tid, platz, name), gruppe[0]))
            for z in gruppe:
                z['wins'] = z['losses'] = z['ties'] = ''
                zaehlung['zeilen_geaendert'] += 1
    zaehlung['_offen'] = offen
    return zaehlung


@contextlib.contextmanager
def _overrides_aus(datenverzeichnis: Optional[str]):
    """Liest die Overrides fuer die Dauer des Blocks aus `datenverzeichnis`
    — und danach wieder aus dem gewohnten Ort.

    BEFUND (07.09.2026), an der Suite gemessen:

        Hier stand `_jh.get_data_dir = lambda: datenverzeichnis` ohne
        Ruecknahme, auf dem ECHTEN Modulobjekt in sys.modules. Der
        Wachhund-Test in tests/python/test_per_decklist_datum_override.py,
        dessen Docstring "Dieser Test biegt bewusst NICHTS um" sagt, lief
        danach unter einem bereits umgebogenen Modul. Folge: das
        Zurueckdrehen des Fixes in `tournament_scraper_JH._overrides_verzeichnis`
        liess die gesamte Suite gruen (1583 passed) — der Wachhund konnte
        den Fehler, den er bewachen soll, nicht mehr sehen.

    Der Ort wird darum nur noch fuer die Dauer des Blocks umgebogen, und
    zwar an der Stelle, die ihn heute wirklich bestimmt:
    `_overrides_verzeichnis()`. `get_data_dir` wird derselben
    Vollstaendigkeit halber mitgesetzt, damit der Parameter auch dann
    wirkt, wenn das JH-Modul den Ort wieder direkt darueber bezieht.
    Beide Caches werden geleert (sonst antwortete der alte Bestand) und
    hinterher samt Funktionen im `finally` zurueckgegeben.
    """
    if not datenverzeichnis:
        yield
        return
    import tournament_scraper_JH as _jh  # noqa: PLC0415
    vorher = {
        '_overrides_verzeichnis': getattr(_jh, '_overrides_verzeichnis', None),
        'get_data_dir': _jh.get_data_dir,
        '_DATE_OVERRIDES_CACHE': _jh._DATE_OVERRIDES_CACHE,
        '_LABS_ID_OVERRIDES_CACHE': _jh._LABS_ID_OVERRIDES_CACHE,
    }
    if vorher['_overrides_verzeichnis'] is not None:
        _jh._overrides_verzeichnis = lambda: datenverzeichnis
    _jh.get_data_dir = lambda: datenverzeichnis
    _jh._DATE_OVERRIDES_CACHE = None
    _jh._LABS_ID_OVERRIDES_CACHE = None
    try:
        yield
    finally:
        if vorher['_overrides_verzeichnis'] is not None:
            _jh._overrides_verzeichnis = vorher['_overrides_verzeichnis']
        _jh.get_data_dir = vorher['get_data_dir']
        _jh._DATE_OVERRIDES_CACHE = vorher['_DATE_OVERRIDES_CACHE']
        _jh._LABS_ID_OVERRIDES_CACHE = vorher['_LABS_ID_OVERRIDES_CACHE']


def datum_nachtragen(ziel: str, datenverzeichnis: Optional[str] = None,
                     trocken: bool = False) -> Dict:
    """`--datum-nachtragen`: die Datumsspalte im Bestand nachziehen — ohne Netz.

    WARUM ES DAS GIBT

    Limitless liefert einzelne Turniere mit falschem Datum aus. Turnier
    518 (NAIC 2026, New Orleans) steht in der Liste UND auf der
    Turnierseite auf dem 10.06.2026, einem Mittwoch; gelaufen ist es vom
    12. bis 14. Juni. Belegt am 07.09.2026:

      Quelle labs /0070/decks : "June 12-14, 2026"
      data/labs_tournament_decks.csv        0070 -> 2026-06-12
      data/tournament_cards_data_overview.csv 518 -> 12th June 2026
      data/tournament_decklists_per_player.csv 518 -> 2026-06-10  (falsch)

    Die Korrektur selbst steht seit dem 22.08.2026 in
    data/labs_tournament_id_overrides.json; dieser Scraper ging bis zum
    07.09.2026 an ihr vorbei. Der Scrape-Weg ist repariert (siehe
    `scrape_one_tournament`) — dieser Schalter zieht den vorhandenen
    Bestand nach, ohne 30.459 Zeilen neu holen zu muessen.

    WAS ANGEFASST WIRD

    Ausschliesslich `tournament_date`, und nur in Zeilen, deren
    `limitless_tournament_id` einen hinterlegten Override hat. Alle
    uebrigen Spalten werden vor und nach dem Nachtrag Zelle fuer Zelle
    verglichen; weichen sie ab, wird NICHTS geschrieben.

    DER PARAMETER `datenverzeichnis`

    Er sagt, aus WELCHEM Verzeichnis labs_tournament_id_overrides.json
    gelesen wird — Standard ist der Ort, den das JH-Modul selbst waehlt.
    Er war eine Zeit lang wirkungslos: gesetzt wurde `get_data_dir`,
    waehrend `_overrides_verzeichnis()` den Ort bestimmt und
    `get_data_dir()` nur noch als Rueckfall benutzt. Jetzt geht er durch
    `_overrides_aus` und biegt genau die Stelle um, die zaehlt. Geprueft
    in tests/python/test_r2_override_mechanik.py mit einem erfundenen
    Override in tmp_path: das Ergebnisdatum ist der Wert aus DIESEM
    Verzeichnis, nicht der aus data/.

    Rueckgabe: Bericht als dict (auch im Probelauf).
    """
    with _overrides_aus(datenverzeichnis):
        return _datum_nachtragen_kern(ziel, trocken)


def _datum_nachtragen_kern(ziel: str, trocken: bool = False) -> Dict:
    """Der Nachtrag selbst. Laeuft immer innerhalb von `_overrides_aus`,
    damit `_datum_mit_override` waehrenddessen aus dem gewuenschten
    Verzeichnis liest und danach wieder aus dem gewohnten."""
    kopf, zeilen = _bestand_lesen(ziel)
    bericht: Dict = {
        'zeilen_vorher': len(zeilen),
        'zeilen_nachher': len(zeilen),
        'geaendert': 0,
        'je_turnier': {},
        'geschrieben': False,
    }
    if not zeilen:
        return bericht

    # Abdruck aller Spalten AUSSER tournament_date — vorher und nachher.
    andere = [k for k in kopf if k != 'tournament_date']
    abdruck_vorher = [tuple(z.get(k, '') for k in andere) for z in zeilen]

    # Je Turnier EINMAL aufloesen, nicht je Zeile: _datum_mit_override
    # schreibt bei jedem Treffer seine Begruendung ins Log, und der
    # Bestand hat fuer Turnier 518 allein 16.960 Zeilen.
    aufgeloest: Dict[str, str] = {}

    def _ziel_datum(lid: str) -> str:
        if lid in aufgeloest:
            return aufgeloest[lid]
        # Leerer Eingabewert: _datum_mit_override gibt den Override
        # zurueck, wenn einer da ist, sonst wieder den leeren String.
        # So bleibt ein Turnier ohne Override garantiert unberuehrt.
        roh = _datum_mit_override(lid, '')
        iso = _parse_iso_date(roh) if roh else ''
        # Unlesbarer Override — lieber nichts anfassen als raten.
        if not re.match(r'^\d{4}-\d{2}-\d{2}$', iso or ''):
            iso = ''
        aufgeloest[lid] = iso
        return iso

    for z in zeilen:
        lid = (z.get('limitless_tournament_id') or '').strip()
        if not lid:
            continue
        neu_iso = _ziel_datum(lid)
        if not neu_iso or (z.get('tournament_date') or '') == neu_iso:
            continue
        alt = z.get('tournament_date') or ''
        z['tournament_date'] = neu_iso
        bericht['geaendert'] += 1
        bericht['je_turnier'].setdefault(lid, {'von': alt, 'auf': neu_iso, 'zeilen': 0})
        bericht['je_turnier'][lid]['zeilen'] += 1

    abdruck_nachher = [tuple(z.get(k, '') for k in andere) for z in zeilen]
    bericht['zeilen_nachher'] = len(zeilen)
    if len(zeilen) != bericht['zeilen_vorher'] or abdruck_nachher != abdruck_vorher:
        bericht['fehler'] = ('der Nachtrag haette ausserhalb von '
                             'tournament_date etwas veraendert')
        return bericht

    if bericht['geaendert'] and not trocken:
        _schreibe_atomar(ziel, kopf, zeilen)
        bericht['geschrieben'] = True
    return bericht


def _lauf_datum(ziel: str, trocken: bool = False) -> int:
    """CLI-Huelle um `datum_nachtragen` — misst, meldet, schreibt."""
    b = datum_nachtragen(ziel, trocken=trocken)
    if not b['zeilen_vorher']:
        print(f"::error::{ziel} hat keine Zeilen — nichts nachzutragen.")
        return 1
    if b.get('fehler'):
        print(f"::error::{b['fehler']} — es wird nichts geschrieben.")
        return 1
    print(f"{b['zeilen_vorher']} Zeile(n) im Bestand.")
    if not b['je_turnier']:
        print("  kein Turnier mit hinterlegtem Datums-Override weicht ab — "
              "nichts zu tun.")
        return 0
    for lid, e in sorted(b['je_turnier'].items()):
        print(f"  Turnier {lid}: {e['von']} -> {e['auf']} "
              f"({e['zeilen']} Zeilen)")
    print(f"  geaenderte Zellen: {b['geaendert']} — ausschliesslich in "
          f"tournament_date (alle uebrigen Spalten Zelle fuer Zelle geprueft)")
    print(f"  Zeilenzahl: {b['zeilen_vorher']} -> {b['zeilen_nachher']}")
    if trocken:
        print("Probelauf — es wird nichts geschrieben.")
        return 0
    if b['geschrieben']:
        print(f"geschrieben: {ziel}")
    return 0


def _lauf_bilanzen(ziel: str, trocken: bool = False) -> int:
    """`--bilanzen-nachtragen`: den vorhandenen Bestand reparieren, ohne Netz.

    Vorbild ist `--nur-herkunft-nachtragen` im Online-Scraper: lesen,
    genau eine Spaltengruppe anfassen, atomar zurueckschreiben.
    """
    kopf, zeilen = _bestand_lesen(ziel)
    if not zeilen:
        print(f"::error::{ziel} hat keine Zeilen — nichts nachzutragen.")
        return 1
    vorher_zeilen = len(zeilen)
    # Zustand VOR der Reparatur, Zelle fuer Zelle, ohne die drei
    # Bilanzspalten. Danach wird derselbe Abdruck noch einmal gebildet.
    # Weicht er ab, hat die Reparatur etwas angefasst, das ihr nicht
    # gehoert — dann wird nichts geschrieben.
    andere = [k for k in kopf if k not in ('wins', 'losses', 'ties')]
    abdruck_vorher = [tuple(z.get(k, '') for k in andere) for z in zeilen]

    bilanzen = load_player_continuity_records()
    if not bilanzen:
        print("::error::player_continuity.csv fehlt oder ist leer — ohne "
              "Quelle wird keine Bilanz nachgetragen.")
        return 1
    z = bilanzen_nachtragen(zeilen, bilanzen)
    offen = z.pop('_offen', [])

    abdruck_nachher = [tuple(r.get(k, '') for k in andere) for r in zeilen]
    if len(zeilen) != vorher_zeilen or abdruck_nachher != abdruck_vorher:
        print("::error::die Reparatur haette ausserhalb von wins/losses/ties "
              "etwas veraendert — es wird nichts geschrieben.")
        return 1

    noch_genullt = sum(1 for r in zeilen if _ist_genullt(r))
    print(f"{z['listen']} Deckliste(n) im Bestand, davon {z['genullt']} mit "
          f"0-0-0.")
    print(f"  ueber den Namensschluessel repariert: {z['aus_name']}")
    print(f"  ueber (Turnier, Platz) repariert:     {z['aus_platz']}")
    print(f"  ohne Quelle, Felder geleert:          {z['unbekannt']}")
    for (tid, platz, name), zeile in offen:
        print(f"    offen: Turnier {tid}, Platz {platz}, {name} "
              f"({zeile.get('deck_archetype', '')})")
    print(f"  betroffene Kartenzeilen: {z['zeilen_geaendert']} von {len(zeilen)}")
    print(f"  Kartenzeilen mit 0-0-0 danach: {noch_genullt}")
    if trocken:
        print("Probelauf — es wird nichts geschrieben.")
        return 0
    _schreibe_atomar(ziel, kopf, zeilen)
    print(f"geschrieben: {ziel} ({len(zeilen)} Zeilen, {len(kopf)} Spalten)")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--tournament-url', type=str,
                    help='Scrape a single tournament URL (skips index walk).')
    ap.add_argument('--tournament-id', type=str,
                    help='Limitless 3-digit tournament ID (alternative to --tournament-url).')
    ap.add_argument('--from-tournament-id', type=int, default=0,
                    help='Skip tournaments with limitless ID below this threshold.')
    ap.add_argument('--from-date', type=str, default='auto',
                    help='Skip tournaments dated before YYYY-MM-DD. Read from '
                         'tournament_cards_data_overview.csv — pre-filters BEFORE '
                         'any network fetch. Default "auto" reads '
                         'in_person_legal_date from data/format_window.json so '
                         'the scraper only pulls current-format tournaments '
                         '(no stale rotation data piles up). Pass an explicit '
                         'date (e.g. 2026-04-01) to backfill broader windows; '
                         'pass "" to disable the date filter entirely.')
    ap.add_argument('--meta', type=str, default='',
                    help='Comma-separated list of meta codes to scrape '
                         '(e.g. TEF-POR,TEF-CRI). Pre-filters via overview CSV.')
    ap.add_argument('--resume', action='store_true',
                    help='Skip tournaments already in the output CSV.')
    ap.add_argument('--delay', type=float, default=DEFAULT_DELAY,
                    help='Seconds between fetches.')
    ap.add_argument('--max-tournaments', type=int, default=0,
                    help='Stop after this many tournaments (0 = unlimited).')
    ap.add_argument('--output', default=OUTPUT_FILE,
                    help='Output CSV filename (relative to data_dir).')
    ap.add_argument('--bilanzen-nachtragen', action='store_true',
                    dest='bilanzen_nachtragen',
                    help='Ohne Netz: im vorhandenen Bestand jede Deckliste '
                         'mit 0-0-0 aus data/player_continuity.csv fuellen. '
                         'Was dort nicht steht, bekommt LEERE Felder statt '
                         'einer 0. Nur wins/losses/ties werden angefasst.')
    ap.add_argument('--datum-nachtragen', action='store_true',
                    dest='datum_nachtragen',
                    help='Ohne Netz: im vorhandenen Bestand die Spalte '
                         'tournament_date fuer die Turniere nachziehen, fuer '
                         'die data/labs_tournament_id_overrides.json ein '
                         'belegtes Datum fuehrt. Nur diese eine Spalte wird '
                         'angefasst; alle uebrigen werden vor und nach dem '
                         'Lauf Zelle fuer Zelle verglichen.')
    ap.add_argument('--trocken', action='store_true',
                    help='Nur berichten, nichts schreiben (mit '
                         '--bilanzen-nachtragen oder --datum-nachtragen).')
    args = ap.parse_args()

    data_dir = get_data_dir()
    out_path = os.path.join(data_dir, args.output)

    if args.datum_nachtragen:
        # Reiner Dateilauf wie --bilanzen-nachtragen: kein Netz, keine
        # Kartendatenbank, kein Turnierindex.
        ziel = out_path
        if args.output == OUTPUT_FILE:
            im_repo = os.path.join(_PROJECT_ROOT, 'data', OUTPUT_FILE)
            if os.path.exists(im_repo):
                ziel = im_repo
        return _lauf_datum(ziel, args.trocken)

    if args.bilanzen_nachtragen:
        # Reiner Dateilauf: kein Netz, keine Kartendatenbank, kein
        # Turnierindex. Zielt auf data/ im Repo, wenn --output nicht
        # ausdruecklich etwas anderes sagt.
        ziel = out_path
        if args.output == OUTPUT_FILE:
            im_repo = os.path.join(_PROJECT_ROOT, 'data', OUTPUT_FILE)
            if os.path.exists(im_repo):
                ziel = im_repo
        return _lauf_bilanzen(ziel, args.trocken)

    try:
        card_db = CardDatabaseLookup()
    except Exception as e:
        logger.error("Card DB load failed: %s", e)
        return 1

    # Build the work list
    if args.tournament_url:
        # Single-URL mode — extract ID from URL tail
        tid = args.tournament_url.rstrip('/').rsplit('/', 1)[-1]
        work = [{'id': tid, 'url': args.tournament_url}]
    elif args.tournament_id:
        work = [{'id': args.tournament_id,
                 'url': f"{BASE_URL}/tournaments/{args.tournament_id}"}]
    else:
        work = load_tournament_index_from_jh_state()
        if not work:
            logger.error("No tournaments found via JH state. Pass --tournament-url "
                         "or --tournament-id for a single-shot run.")
            return 1

    # Apply pre-filters in order: --from-tournament-id, --from-date, --meta.
    # Date + meta read tournament_cards_data_overview.csv so we DON'T have
    # to fetch each tournament page just to discard it — the 109-tournament
    # backfill on 2026-06-09 hit the 90-min timeout precisely because every
    # tournament's standings page had to be fetched even when we wanted only
    # ~11 of them. With --from-date the discard is free.
    if args.from_tournament_id:
        before = len(work)
        work = [w for w in work if int(w['id']) >= args.from_tournament_id]
        logger.info("--from-tournament-id %d: %d → %d tournaments",
                    args.from_tournament_id, before, len(work))

    # Merker: welchen Wert hat "auto" aufgeloest? Nur dann darf der
    # Rueckfall unten greifen — ein von Hand gesetztes --from-date ist
    # eine Ansage und wird nicht hintergangen.
    _auto_fenster_datum = None

    # Resolve "auto" sentinel from format_window.json — keeps the
    # scrape window pinned to the current format so old rotation
    # data (TEF-POR, SVI-ASC etc.) doesn't pile up in the output
    # after a format change. The maintainer can still pass an
    # explicit --from-date for backfills, or "" to skip the filter.
    if args.from_date == 'auto':
        fw_path = os.path.join(data_dir, 'format_window.json')
        if os.path.exists(fw_path):
            try:
                with open(fw_path, encoding='utf-8') as f:
                    fw = json.load(f)
                legal = (fw.get('in_person_legal_date') or '').strip()
                if legal:
                    args.from_date = legal
                    _auto_fenster_datum = legal
                    logger.info("--from-date auto → %s (in_person_legal_date "
                                "from format_window.json, current format: %s-%s)",
                                legal,
                                (fw.get('oldest_legal_set') or '').strip().upper(),
                                (fw.get('current_set') or '').strip().upper())
                else:
                    logger.warning("--from-date auto: format_window.json missing "
                                   "in_person_legal_date — disabling date filter.")
                    args.from_date = ''
            except Exception as e:
                logger.warning("--from-date auto: format_window.json unreadable "
                               "(%s) — disabling date filter.", e)
                args.from_date = ''
        else:
            logger.warning("--from-date auto: format_window.json not found at %s "
                           "— disabling date filter.", fw_path)
            args.from_date = ''

    # Stand vor dem Datumsfilter — der Rueckfall unten misst gegen ihn.
    alle_vor_datum = list(work)

    overview = None
    if args.from_date or args.meta:
        overview = load_tournament_metadata_lookup()
        if not overview:
            logger.warning("Metadata pre-filter requested but overview CSV "
                           "missing/unreadable — falling back to per-fetch filter "
                           "(slower).")

    if args.from_date and overview:
        before = len(work)
        cutoff_iso = args.from_date.strip()
        work = _nach_datum(work, overview, cutoff_iso)
        logger.info("--from-date %s: %d → %d tournaments (using overview metadata)",
                    cutoff_iso, before, len(work))

        # S11 — Rueckfall auf das Vorformat.
        #
        # "auto" pinnt das Fenster auf das laufende Format. Das ist
        # richtig, solange es dort Turniere GIBT. In TEF-PBL gibt es
        # bisher keins: das erste Major des Formats ist die
        # Weltmeisterschaft. Der Lauf holte damit null Turniere,
        # meldete Erfolg, und tournament_decklists_per_player.csv
        # blieb bei den zwei Turnieren von Turin stehen — ohne dass
        # irgendwo stand, dass das am Filter liegt und nicht an der
        # Quelle.
        #
        # Also: bleibt nach dem automatischen Fenster nichts uebrig,
        # wird das Fenster des VORFORMATS versucht. Die Alternative
        # waere, den Filter ganz zu streichen — dann liefen wieder
        # drei Jahre Turniere durch, und genau das sollte er
        # verhindern.
        if not work and args.from_date == _auto_fenster_datum:
            vorher_datum, vorher_name = _vorformat_fenster(data_dir)
            if vorher_datum and vorher_datum != cutoff_iso:
                zurueck = _nach_datum(alle_vor_datum, overview, vorher_datum)
                logger.warning(
                    "Im aktuellen Format kein Turnier im Fenster ab %s. "
                    "Rueckfall auf das Vorformat %s (ab %s): %d Turnier(e).",
                    cutoff_iso, vorher_name or '?', vorher_datum, len(zurueck))
                print(f"::warning::per_decklist_scraper: im aktuellen Format "
                      f"liegt kein Turnier ab {cutoff_iso}. Es wird das "
                      f"Vorformat {vorher_name or '?'} ab {vorher_datum} "
                      f"geholt, damit der Deckbauer nicht ohne Einzellisten "
                      f"dasteht.")
                work = zurueck
            else:
                logger.warning(
                    "Im aktuellen Format kein Turnier im Fenster ab %s, und "
                    "das Vorformat liess sich nicht bestimmen.", cutoff_iso)
                print(f"::warning::per_decklist_scraper: kein Turnier ab "
                      f"{cutoff_iso}, kein Vorformat bestimmbar — dieser Lauf "
                      f"holt nichts.")

    if args.meta and overview:
        wanted = {m.strip().upper() for m in args.meta.split(',') if m.strip()}
        before = len(work)
        kept = []
        for w in work:
            m = (overview.get(w['id']) or {}).get('meta', '').upper()
            if not m or m in wanted:
                kept.append(w)
        work = kept
        logger.info("--meta %s: %d → %d tournaments",
                    ','.join(sorted(wanted)), before, len(work))

    if args.resume:
        seen = load_existing_output(out_path)
        before = len(work)
        work = [w for w in work if w['id'] not in seen]
        logger.info("--resume: %d / %d tournaments already scraped, %d to fetch",
                    before - len(work), before, len(work))
    if args.max_tournaments:
        work = work[:args.max_tournaments]

    # Continuity-record lookup for the W-L fallback path in
    # scrape_one_tournament (see comment there). Loaded once per
    # process and passed in by reference so each tournament can fall
    # through to it without reopening the CSV.
    continuity_records = load_player_continuity_records()
    if continuity_records:
        logger.info("player_continuity.csv: %d Bilanzen geladen "
                    "(Nachschlag ueber Namensschluessel und ueber Platz).",
                    len(continuity_records))

    total_rows = 0
    for i, t in enumerate(work, 1):
        logger.info("[%d/%d] tid=%s", i, len(work), t['id'])
        try:
            rows = scrape_one_tournament(t, card_db, args.delay, continuity_records)
        except Exception as e:
            logger.exception("Unexpected failure for tid=%s: %s", t['id'], e)
            continue
        if rows:
            write_rows(rows, out_path, append=True)
            total_rows += len(rows)

    logger.info("Done — %d rows total → %s", total_rows, out_path)
    return 0


if __name__ == '__main__':
    sys.exit(main() or 0)
