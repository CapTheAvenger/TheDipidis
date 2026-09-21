#!/usr/bin/env python3
"""Kartentexte auf Deutsch UND Englisch — eine Setseite statt 20.580 Karten.

AUFTRAG (21.09.2026)
====================
„Wir haben festgestellt, dass wir Kartentexte nicht auf Deutsch haben.
Dementsprechend muessten wir mal den Kartentext-Scraper umbauen, dass der
in Zukunft deutsche Kartentexte und englische Kartentexte zieht."

DIE QUELLE
----------
`limitlesstcg.com/cards/de/<SET>?display=full` liefert ein **ganzes Set
auf einer Seite**, mit denselben CSS-Klassen wie die englische Fassung.
Gemessen am 21.09.2026: 30C = 160 Karten, 1,0 MB, 656 ms.

Daraus folgt der eigentliche Gewinn dieses Skripts. `all_cards_scraper.py`
holt **jede Karte einzeln** — 20.580 Detailseiten. Hier sind es **zwei
Seiten je Set**, eine je Sprache. Fuer Standard und Extended zusammen
sind das rund 90 Abrufe statt 8.758.

WAS ES SCHREIBT
---------------
Zwei Spalten in `data/all_cards_database.csv`:

* `card_text`     — Englisch, **mit** der Zeile Weakness/Resistance/Retreat
* `card_text_de`  — Deutsch, **ohne** diese Zeile (sie ist auch auf der
                    deutschen Seite englisch; Entscheidung des Betreibers
                    vom 21.09.2026, Begruendung im Kopf von
                    `backend/core/kartentext.py`)

`card_text` wird dabei **neu** geschrieben, nicht nur ergaenzt: der alte
Parser hat zwei Dinge nie gelesen, und zwar fuer alle 20.580 Karten
(Faehigkeitsnamen: 0 gefunden; Trainer-/Item-/Stadion-/Energietexte:
3.208 von 3.210 leer). Wer nur die Luecken fuellt, behaelt die Fehler.

WELCHE SETS
-----------
Standard und Extended, entschieden am 21.09.2026 anhand der gemessenen
Abdeckung: Standard 96,5 %, Extended 99,9 %, Legacy nur 60,4 %. Die
Einordnung kommt aus `backend/core/prepare_card_data.py::aera_fuer_set`
— dieselbe Funktion, die auch die Chunks aufteilt, damit Daten und
Auslieferung nicht auseinanderlaufen koennen.

`--aeren legacy` holt die alten Sets trotzdem, wenn es jemand will.

WAS ES NICHT TUT
----------------
Es erfindet nichts. Eine Karte ohne deutsche Fassung bekommt ein leeres
`card_text_de` und steht am Ende im Bericht. Die Quelle faellt bei einer
fehlenden Uebersetzung **nicht** still auf Englisch zurueck (gemessen an
/cards/de/30C/120) — `ist_uebersetzt()` prueft das trotzdem, und zwar an
drei Merkmalen.

DIE GEGENPROBE LAEUFT VOR JEDEM SCHREIBEN
-----------------------------------------
Aendert Limitless seine Klassennamen, liefert der Parser stumm leere
Texte und wuerde eine gefuellte Spalte leerraeumen. `--min-treffer`
(Vorgabe 0,80) bricht deshalb ab, sobald ein Set weniger Karten liefert
als die Datenbank fuer dieses Set fuehrt. Abbrechen ist hier richtig:
ein gemeldetes Loch ist behebbar, eine stillschweigend geleerte Spalte
faellt erst Wochen spaeter auf.

Aufruf:
    python scrape_kartentexte.py                    # Standard + Extended
    python scrape_kartentexte.py --sets PBL,30C     # nur diese
    python scrape_kartentexte.py --aeren standard   # nur das Standardformat
    python scrape_kartentexte.py --trockenlauf      # nichts schreiben
"""

from __future__ import annotations

import argparse
import csv
import importlib.util
import json
import os
import sys
import time
from typing import Dict, List, Optional, Tuple

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.dirname(os.path.dirname(HIER))
KERN = os.path.join(WURZEL, 'backend', 'core')
sys.path.insert(0, KERN)

from card_scraper_shared import (  # noqa: E402
    setup_console_encoding, setup_logging, safe_fetch_html,
)
from kartentext import (  # noqa: E402
    kartentext, ist_uebersetzt, kartenschluessel,
)

try:
    from bs4 import BeautifulSoup
except ImportError:  # pragma: no cover
    BeautifulSoup = None

setup_console_encoding()
logger = setup_logging('scrape_kartentexte')

DATEN = os.path.join(WURZEL, 'data')
KARTEN_CSV = os.path.join(DATEN, 'all_cards_database.csv')

# Die Kopfzeile, wie die Datei sie seit dem 21.09.2026 fuehrt. Sie steht
# hier, weil dieses Skript die Datei neu schreibt und eine verschobene
# Spalte jeden Verbraucher trifft (data/_consumers.md).
SPALTEN = ['name_en', 'name_de', 'set', 'number', 'type', 'energy_type',
           'hp', 'rarity', 'image_url', 'international_prints', 'jp_prints',
           'cardmarket_url', 'card_text', 'card_text_de']

SEITE_EN = 'https://limitlesstcg.com/cards/{set}?display=full'
SEITE_DE = 'https://limitlesstcg.com/cards/de/{set}?display=full'


def set_ordnung() -> Dict[str, int]:
    """Die Ordnungszahlen aus data/sets.json — direkt, nicht ueber
    `load_set_order()`.

    BEFUND AUS LAUF #1 (21.09.2026): `load_set_order()` sucht sets.json
    relativ zum Aufrufort und kam hier LEER zurueck. Eine leere Ordnung
    heisst fuer `aera_fuer_set`, dass jedes Set eine frische Rotation
    ist — also „standard". Der Lauf hat deshalb **alle 154 Sets** geholt
    statt der rund 90 aus Standard und Extended, 308 Abrufe statt 180.

    Das Tueckische daran: es sah nach Erfolg aus. Mehr Daten als
    bestellt faellt nicht auf; nur die Laufzeit war doppelt so lang.

    Ein leeres Ergebnis wird deshalb nicht geduldet. Ohne Ordnungszahlen
    ist JEDE Aera-Auswahl falsch, und lieber bricht der Lauf ab, als
    dass er das Vierfache holt und niemand es merkt.
    """
    pfad = os.path.join(DATEN, 'sets.json')
    with open(pfad, encoding='utf-8') as f:
        ordnung = json.load(f)
    if not isinstance(ordnung, dict) or not ordnung:
        raise RuntimeError(
            f'{pfad} traegt keine Ordnungszahlen. Ohne sie gilt jedes Set '
            'als frische Rotation, und der Lauf wuerde alle Aeren holen.')
    return ordnung


def _aera_funktion():
    """`aera_fuer_set` aus prepare_card_data, ohne dessen main() zu starten."""
    pfad = os.path.join(KERN, 'prepare_card_data.py')
    spec = importlib.util.spec_from_file_location('pcd_fuer_kartentext', pfad)
    modul = importlib.util.module_from_spec(spec)
    sys.modules['pcd_fuer_kartentext'] = modul
    spec.loader.exec_module(modul)
    return modul.aera_fuer_set


def lies_karten() -> List[Dict[str, str]]:
    with open(KARTEN_CSV, 'r', encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))


def hole_setseite(vorlage: str, set_code: str) -> Dict[str, str]:
    """{'PBL|100': '<roher Kartentext>'} fuer ein ganzes Set.

    Nicht uebersetzte Karten fehlen im Ergebnis — sie sollen fehlen.
    """
    html = safe_fetch_html(vorlage.format(set=set_code), timeout=40, retries=2)
    if not html or BeautifulSoup is None:
        return {}
    suppe = BeautifulSoup(html, 'lxml')
    deutsch = '/cards/de/' in vorlage
    treffer: Dict[str, str] = {}
    for block in suppe.select('.card-text'):
        schluessel = kartenschluessel(block)
        if not schluessel:
            continue
        if deutsch and not ist_uebersetzt(block):
            continue
        treffer[schluessel] = kartentext(block, mit_wrr=not deutsch)
    return treffer


def main() -> int:
    p = argparse.ArgumentParser(
        description='Kartentexte je Set in beiden Sprachen holen.')
    p.add_argument('--sets', help='Nur diese Set-Kuerzel, mit Komma getrennt')
    p.add_argument('--aeren', default='standard,extended',
                   help='Welche Aeren (standard,extended,legacy)')
    p.add_argument('--min-treffer', type=float, default=0.80,
                   help='Abbruch, wenn ein Set weniger als dieser Anteil der '
                        'erwarteten Karten liefert (Vorgabe 0.80)')
    p.add_argument('--pause', type=float, default=0.8,
                   help='Sekunden zwischen zwei Abrufen (Vorgabe 0.8)')
    p.add_argument('--trockenlauf', action='store_true',
                   help='Alles messen, nichts schreiben')
    args = p.parse_args()

    if BeautifulSoup is None:
        logger.error('beautifulsoup4 fehlt — ohne Parser kein Kartentext.')
        return 1
    if not os.path.isfile(KARTEN_CSV):
        logger.error('Kartendatenbank fehlt: %s', KARTEN_CSV)
        return 1

    karten = lies_karten()
    aera_fuer_set = _aera_funktion()
    ordnung = set_ordnung()
    gewuenscht = {a.strip() for a in args.aeren.split(',') if a.strip()}

    # Welche Sets? Immer aus dem BESTAND, nie aus einer Liste im Code —
    # sonst faellt ein frisches Set durch, bis jemand die Liste pflegt.
    je_set: Dict[str, int] = {}
    for k in karten:
        s = (k.get('set') or '').strip()
        if s:
            je_set[s] = je_set.get(s, 0) + 1

    if args.sets:
        auswahl = [s.strip().upper() for s in args.sets.split(',') if s.strip()]
        sets = [s for s in je_set if s.upper() in auswahl]
    else:
        sets = [s for s in je_set if aera_fuer_set(s, ordnung) in gewuenscht]
    sets.sort(key=lambda s: -je_set[s])

    if not sets:
        logger.error('Kein Set ausgewaehlt (Aeren: %s).', sorted(gewuenscht))
        return 1

    # SELBSTKONTROLLE (nach Lauf #1 am 21.09.2026): waehlt eine
    # EINGESCHRAENKTE Aera-Liste am Ende doch jedes Set aus, dann hat die
    # Einordnung nicht funktioniert — und der Lauf wuerde das Vierfache
    # holen, ohne dass es auffiele. Bei `--sets` gilt das nicht, dort ist
    # die Auswahl ausdruecklich von Hand gesetzt.
    if (not args.sets
            and gewuenscht != {'standard', 'extended', 'legacy'}
            and len(sets) == len(je_set)):
        logger.error(
            '::error::Die Aera-Auswahl %s umfasst ALLE %d Sets. Die '
            'Einordnung greift nicht — vermutlich fehlen die '
            'Ordnungszahlen. Es wird nichts geholt.',
            sorted(gewuenscht), len(je_set))
        return 3

    erwartet = sum(je_set[s] for s in sets)
    logger.info('%d Set(s), %d Karten, %d Abrufe.',
                len(sets), erwartet, 2 * len(sets))

    en_alle: Dict[str, str] = {}
    de_alle: Dict[str, str] = {}
    duenn: List[str] = []
    begonnen = time.time()

    for i, s in enumerate(sets, 1):
        en = hole_setseite(SEITE_EN, s)
        time.sleep(args.pause)
        de = hole_setseite(SEITE_DE, s)
        time.sleep(args.pause)
        en_alle.update(en)
        de_alle.update(de)
        anteil = len(en) / je_set[s] if je_set[s] else 0.0
        marke = '' if anteil >= args.min_treffer else '  << zu duenn'
        if marke:
            duenn.append(f'{s}: {len(en)} von {je_set[s]} erwarteten Karten')
        logger.info('  [%3d/%3d] %-5s  en %4d  de %4d  (erwartet %4d)%s',
                    i, len(sets), s, len(en), len(de), je_set[s], marke)

    dauer = time.time() - begonnen

    # ── Gegenprobe VOR dem Schreiben ────────────────────────────────
    #
    # Ein leeres Ergebnis heisst nicht „das Set hat keinen Text", sondern
    # fast immer „die Seite ist anders gebaut als gestern". Wer das
    # wegschreibt, leert eine gefuellte Spalte — und merkt es erst, wenn
    # jemand eine Karte aufschlaegt.
    if duenn:
        logger.error('::error::Die englische Setseite liefert zu wenige '
                     'Karten — vermutlich hat sich die Seitenstruktur '
                     'geaendert. Es wird NICHTS geschrieben:')
        for z in duenn:
            logger.error('  %s', z)
        return 2

    gewaehlt = {f"{(k.get('set') or '').strip().upper()}|"
                f"{(k.get('number') or '').strip()}"
                for k in karten
                if (k.get('set') or '').strip() in sets}

    mit_en = sum(1 for s in gewaehlt if en_alle.get(s))
    mit_de = sum(1 for s in gewaehlt if de_alle.get(s))
    ohne_de = sorted(s for s in gewaehlt if not de_alle.get(s))

    logger.info('')
    logger.info('Englisch: %d von %d Karten mit Text', mit_en, len(gewaehlt))
    logger.info('Deutsch : %d von %d Karten mit Text (%.2f %%)',
                mit_de, len(gewaehlt), 100.0 * mit_de / max(1, len(gewaehlt)))
    logger.info('Dauer   : %.0f s', dauer)
    if ohne_de:
        logger.info('Ohne deutsche Fassung (%d): %s%s', len(ohne_de),
                    ', '.join(ohne_de[:25]),
                    ' …' if len(ohne_de) > 25 else '')

    if args.trockenlauf:
        logger.info('Trockenlauf — nichts geschrieben.')
        return 0

    veraendert = 0
    for k in karten:
        s = (k.get('set') or '').strip().upper()
        n = (k.get('number') or '').strip()
        schluessel = f'{s}|{n}'
        if schluessel not in gewaehlt:
            k.setdefault('card_text_de', k.get('card_text_de', '') or '')
            continue
        neu_en = en_alle.get(schluessel, '')
        neu_de = de_alle.get(schluessel, '')
        # Ein leeres Ergebnis darf einen vorhandenen Text NICHT
        # ueberschreiben: Basisenergien haben legitim keinen, aber ein
        # einzelner verpatzter Abruf hat auch keinen — und der zweite
        # Fall ist nicht vom ersten zu unterscheiden.
        if neu_en and neu_en != (k.get('card_text') or ''):
            k['card_text'] = neu_en
            veraendert += 1
        if neu_de != (k.get('card_text_de') or ''):
            if neu_de or not (k.get('card_text_de') or ''):
                k['card_text_de'] = neu_de
                veraendert += 1

    for k in karten:
        k.setdefault('card_text_de', '')

    # ── Geschrieben wird an BEIDE Orte (21.09.2026) ────────────────
    #
    # Dieses Repo fuehrt die Kartendatenbank doppelt: `data/` ist die
    # ausgelieferte Fassung, `backend/core/data/` die Arbeitsfassung der
    # Scraper. Der Wochenlauf saet am Anfang von `data/` nach
    # `core/data/`, und `prepare_card_data` liest `core/data/`, baut
    # daraus die Chunks und spiegelt am Ende ueber SYNC_PATTERNS wieder
    # zurueck nach `data/`.
    #
    # Wer also nur nach `data/` schreibt, verliert dreifach:
    #   1. prepare_card_data liest die alte Fassung -> Chunks ohne
    #      deutschen Text,
    #   2. der Rueckspiegel ueberschreibt `data/` mit ebendieser alten
    #      Fassung -> der frisch geholte Text ist weg,
    #   3. und beides faellt nicht auf, weil jede Datei gueltig bleibt.
    #
    # Deshalb beide. `core/data/` nur, wenn es den Ordner schon gibt —
    # ihn anzulegen, wo keiner ist, wuerde einen Arbeitsstand vortaeuschen.
    ziele = [KARTEN_CSV]
    kern_csv = os.path.join(KERN, 'data', 'all_cards_database.csv')
    if os.path.isdir(os.path.dirname(kern_csv)):
        ziele.append(kern_csv)

    for ziel in ziele:
        with open(ziel, 'w', encoding='utf-8', newline='') as f:
            schreiber = csv.DictWriter(f, fieldnames=SPALTEN,
                                       extrasaction='ignore')
            schreiber.writeheader()
            schreiber.writerows(karten)

    logger.info('%d Feld(er) geaendert, geschrieben nach: %s', veraendert,
                ', '.join(os.path.relpath(z, WURZEL) for z in ziele))

    stand = os.path.join(DATEN, 'kartentext_stand.json')
    with open(stand, 'w', encoding='utf-8') as f:
        json.dump({
            '_zweck': 'Belegt, welche Sets deutschen Kartentext tragen und '
                      'welche Karten die Quelle nicht uebersetzt fuehrt.',
            'gelaufen_am': time.strftime('%Y-%m-%d %H:%M:%S UTC',
                                         time.gmtime()),
            'quelle': SEITE_DE.format(set='<SET>'),
            'aeren': sorted(gewuenscht),
            'sets': sorted(sets),
            'karten_betrachtet': len(gewaehlt),
            'mit_text_en': mit_en,
            'mit_text_de': mit_de,
            'ohne_deutsche_fassung': ohne_de,
        }, f, ensure_ascii=False, indent=2)
    logger.info('Stand nach %s geschrieben.', os.path.basename(stand))
    return 0


if __name__ == '__main__':
    sys.exit(main())
