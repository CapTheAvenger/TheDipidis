#!/usr/bin/env python3
"""
Limitless-API-Scraper (play.limitlesstcg.com/api)
=================================================

WARUM ES DIESE DATEI GIBT
-------------------------
Bis 08.09.2026 zog dieses Projekt Online-Turnierdaten aus dem gerenderten
HTML von play.limitlesstcg.com — und zwar nur die *erfolgreichen* Listen
(`max_lists_per_deck: 20`, Median 3 Archetypen je Turnier). Damit waren
Kartenschnitte ueber das ganze Feld, Matchup-Matrizen und Share-Zahlen mit
belastbarem Nenner nicht baubar.

Limitless betreibt eine **offizielle, schluesselfreie API**
(https://docs.limitlesstcg.com/developer). Sie liefert pro Turnier:

  /tournaments                 Liste mit id, name, date, format, players
  /tournaments/{id}/details    Phasen, Runden, isOnline, decklists
  /tournaments/{id}/standings  JEDEN Spieler mit deck + vollstaendiger Liste
  /tournaments/{id}/pairings   JEDES Match mit Sieger

LIVE GEGENGEPRUEFT am 08.09.2026, Turnier "Pumpkaweekly"
(`6a9db100ab080c8c957fc12b`, 342 Spieler, 876 Matches):

  * 342 von 342 Spielern haben `deck` UND `decklist` — keine Stichprobe.
  * Kartenschnitte fuer Mega Excadrill (13 Listen), aus /standings selbst
    gerechnet: Pokemon 19,31 / Trainer 24,69 / Energie 16,00;
    Metang (TEF-114) 3,77; Team Rocket's Petrel (DRI-176) 3,62;
    Drilbur (PBL-46) 3,23; Metal Energy (MEE-8) 15,92.
    Die Limitless-Seite /metagame/mega-excadrill-ex/cards zeigt
    19.30 / 24.68 / 16.00 und exakt dieselben Kartenwerte.
  * Bilanz Mega Excadrill aus /pairings gerechnet: 32-40-0.
    Aus den `record`-Feldern der Standings: 32-40-0.
    Auf der Limitless-Metagame-Seite: 32-40-0. Drei Wege, ein Ergebnis.

NAMEN KOMMEN AUS DER API, NICHT AUS DEM SLUG
--------------------------------------------
Jeder Standings-Eintrag traegt `deck: {id, name, icons}`, also
`mega-excadrill-ex` UND `Mega Excadrill`. Ein Slug-Normalisierer wird
deshalb NICHT gebaut — er waere falsch: gegen die 62 Archetypen des
Testturniers trifft der Weg ueber `slug_to_archetype` +
`normalize_archetype_name` nur 26 von 62 Namen
(`dragapult-ex` -> "Dragapult Ex" statt "Dragapult",
 `n-zoroark` -> "Zoroark" statt "N's Zoroark",
 `basic-box-m` -> "Basic Box M", das es in archetype_icons.json nicht gibt).
Ueber den mitgelieferten `deck.name` treffen 61 von 62; der 62. ist der
Sammeleimer "Other", der bewusst kein Archetyp ist.

MATCHREGELN (live abgelesen, nicht angenommen)
----------------------------------------------
  winner == <spieler-id>   Sieg fuer diesen Spieler, Niederlage fuer den anderen
  winner == 0              Unentschieden fuer beide
  winner == -1             DOPPELNIEDERLAGE — Niederlage fuer beide
  player2 leer             Freilos oder Zeitstrafe; zaehlt in die Bilanz,
                           aber NICHT in die Matchup-Matrix (kein Gegner)

Ohne die beiden letzten Regeln kam bei Mega Excadrill 32-33-0 heraus statt
32-40-0 (5 Doppelniederlagen + 2 Partien ohne Gegner).

INKREMENTELL
------------
`data/online_api_tournaments.csv` ist das Gedaechtnis: eine Zeile je
bereits geholtem Turnier. `neue_turniere()` vergleicht die API-Liste
dagegen und liefert nur, was fehlt. Ein bekanntes Turnier wird NIE erneut
geholt — Limitless-Turniere sind nach Abschluss unveraenderlich.

AUFBAU
------
Der gesamte Rechenteil ist netzfrei und rein: `archetyp_bilanz`,
`karten_schnitt`, `matchup_matrix`, `neue_turniere`. Nur `LimitlessApi`
und `main()` fassen das Netz an. Deshalb sind die Regeln oben ohne
Netzzugang testbar — der Sandkasten erreicht die API nicht (Proxy 403),
Live-Laeufe gehen ueber CI.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

API_BASIS = "https://play.limitlesstcg.com/api"

# Der Sammeleimer ist kein Archetyp. Er darf in keine Kartenstatistik und
# in keine Matchup-Zeile, sonst mischt er 20 verschiedene Decks zu einem.
SAMMELEIMER = "other"

# Verifiziert am 08.09.2026: 86 Turniere in 7 Tagen, davon 26 mit >= 100
# Spielern; diese 26 tragen 4.457 von 5.622 Spielern (79 %).
STANDARD_MIN_SPIELER = 100
STANDARD_FORMAT = "STANDARD"
STANDARD_SPIEL = "PTCG"

GRUPPEN = ("pokemon", "trainer", "energy")

# ---------------------------------------------------------------------------
# Tiefen
# ---------------------------------------------------------------------------
#
# VOLL       details + standings + pairings -> alle vier Ebenen.
#            Drei Anfragen je Turnier, rund 200 KB Zeilen.
# ARCHETYPEN nur standings, Bilanz aus den record-Feldern -> Turnier- und
#            Archetypzeilen. EINE Anfrage je Turnier, rund 6 KB.
#
# Die duenne Tiefe gibt es, weil die Kartenebene ueber eine Formatgrenze
# hinweg nicht bedeutet, was sie zu bedeuten scheint: Mega Excadrill ex
# ist PBL-65, vor dem 17.07.2026 gibt es die Karte nicht. Eine
# "Entwicklung" von 0 auf 2 Kopien waere dort ein Releasedatum, keine
# Entwicklung. Was ueber die Grenze hinweg TRAEGT, ist der Anteil eines
# Archetyps und wie er sich nach einem Praesenzturnier bewegt — und
# genau das kostet ein Dreissigstel des Platzes.
TIEFE_VOLL = "voll"
TIEFE_ARCHETYPEN = "archetypen"
TIEFEN = (TIEFE_VOLL, TIEFE_ARCHETYPEN)


# ---------------------------------------------------------------------------
# Formatfenster
# ---------------------------------------------------------------------------
#
# WARUM DAS SEIN MUSS
# -------------------
# Das Feld `format` der API sagt bei JEDEM Standardturnier schlicht
# "STANDARD" — bei einem von gestern genauso wie bei einem vom Januar.
# Gemessen am 08.09.2026 an 3.000 Turnieren: vier verschiedene
# Kartenpools, ein einziger Feldwert. Ein Rueckbau, der nur darauf
# filtert, mischt sie stillschweigend in eine Datei.
#
# Online wechselt das Format am SET-RELEASE, nicht am in-person-legal-Datum
# (Release + 14 Tage Lag, siehe data/format_window.json). Ein
# Online-Turnier vom 20.07.2026 spielt PBL, ein Praesenzturnier vom
# selben Tag nicht.
#
# Der obere Rand kommt aus data/sets_metadata.json und ist damit
# nachpruefbar. Der untere Rand — welches Set gerade der Boden ist —
# steht in keiner Datei: Rotationen sind eine jaehrliche Ansage des
# Herstellers. Deshalb ist ROTATIONEN eine gepflegte Liste, genau wie
# `previous_format_key` in format_window.json eine gepflegte Zeile ist.
# `_pruefe_fenster()` schlaegt an, wenn ein Release-Datum darin nicht
# mehr zu sets_metadata.json passt — dann ist die Liste veraltet und
# nicht die Daten falsch.
#
# Quelle der Boeden: die Chunkdateien, die das Projekt seit Langem
# fuehrt (labs_tournament_decks_SVI-ASC.csv, ..._TEF-POR.csv, ...).
ROTATIONEN = (
    # (Formatschluessel, oberstes Set, dessen Release = Fensterbeginn)
    ("TEF-PBL", "PBL"),
    ("TEF-CRI", "CRI"),
    ("TEF-POR", "POR"),
    ("SVI-ASC", "ASC"),
    ("SVI-PFL", "PFL"),
    ("SVI-MEG", "MEG"),
    ("SVI-BLK", "BLK"),
    ("SVI-DRI", "DRI"),
    ("SVI-JTG", "JTG"),
    ("BRS-PRE", "PRE"),
    ("BRS-SSP", "SSP"),
    ("BRS-SCR", "SCR"),
    ("BRS-SFA", "SFA"),
)

VOR_DEM_AELTESTEN = "vor-bekanntem-fenster"

_fenster_zwischenspeicher: Optional[List[Tuple[str, str]]] = None


def _sets_metadata(datenverzeichnis: str = "data") -> Dict[str, dict]:
    pfad = os.path.join(datenverzeichnis, "sets_metadata.json")
    with open(pfad, encoding="utf-8") as datei:
        return json.load(datei)


def formatfenster(datenverzeichnis: str = "data") -> List[Tuple[str, str]]:
    """[(Formatschluessel, Startdatum)], neuestes zuerst.

    Startdatum ist das Release des obersten Sets — der Tag, an dem
    Online darauf umschaltet.
    """
    global _fenster_zwischenspeicher
    if _fenster_zwischenspeicher is not None:
        return _fenster_zwischenspeicher
    meta = _sets_metadata(datenverzeichnis)
    heraus = []
    for schluessel, set_code in ROTATIONEN:
        eintrag = meta.get(set_code) or {}
        datum = eintrag.get("release_date")
        if datum:
            heraus.append((schluessel, datum))

    # DAS LAUFENDE FENSTER KOMMT AUS format_window.json, NICHT AUS DER
    # HANDLISTE.
    #
    # ROTATIONEN ist eine gepflegte Liste — und genau deshalb ist sie in
    # dem Moment leer, in dem es zaehlt: am Tag der Rotation steht das
    # neue Format noch nicht drin. Bis 12.09.2026 ordnete
    # formatschluessel() dann ALLE Turniere danach weiter dem alten
    # Fenster zu, und `fehlendes_fenster()` meldete das als
    # ::warning:: — auf einem taeglichen Lauf liest das niemand.
    #
    # Der laufende Schluessel ist ableitbar: <oldest_legal>-<current>
    # aus format_window.json, Fensterbeginn ist das Release des
    # obersten Sets. Dieselbe Datei, die update_sets.py mit zwei
    # Riegeln (Monotonie, Anker) gegen Fehlwechsel schuetzt.
    #
    # Konkreter Anlass: 30C erscheint am 16.09.2026, wird am 25.09.
    # legal, Frankfurt ist am 26.09. — die Handliste haette eine Nacht
    # Zeit gehabt.
    try:
        with open(os.path.join(datenverzeichnis, "format_window.json"),
                  encoding="utf-8") as datei:
            fw = json.load(datei)
        laufend_set = str(fw.get("current_set") or "").strip().upper()
        laufend_alt = str(fw.get("oldest_legal_set") or "").strip().upper()
        laufend_datum = str(
            (meta.get(laufend_set) or {}).get("release_date") or "").strip()
        if laufend_set and laufend_alt and laufend_datum:
            laufend = f"{laufend_alt}-{laufend_set}"
            if laufend not in {k for k, _ in heraus}:
                heraus.append((laufend, laufend_datum))
    except (OSError, ValueError, KeyError):
        # Fehlt oder ist kaputt: dann gilt die Handliste allein. Das ist
        # der Stand von vor dieser Aenderung, nicht schlechter.
        pass

    heraus.sort(key=lambda x: x[1], reverse=True)
    _fenster_zwischenspeicher = heraus
    return heraus


def formatschluessel(datum: Optional[str], datenverzeichnis: str = "data") -> str:
    """Welches Format galt online an diesem Tag? Datum als YYYY-MM-DD."""
    if not datum:
        return VOR_DEM_AELTESTEN
    tag = str(datum)[:10]
    for schluessel, start in formatfenster(datenverzeichnis):
        if tag >= start:
            return schluessel
    return VOR_DEM_AELTESTEN


def pruefe_fenster(datenverzeichnis: str = "data") -> List[str]:
    """Meldet Sets aus ROTATIONEN, die sets_metadata.json nicht kennt.

    Eine Liste, die niemand nachzieht, ist schlimmer als keine: sie
    ordnet Turniere ins falsche Fenster und sieht dabei richtig aus.
    """
    meta = _sets_metadata(datenverzeichnis)
    fehlt = [f"{k} (Set {s})" for k, s in ROTATIONEN
             if not (meta.get(s) or {}).get("release_date")]
    return fehlt


def fehlendes_fenster(datenverzeichnis: str = "data") -> Optional[Tuple[str, str, int]]:
    """Ist ein Set erschienen, das ROTATIONEN noch nicht kennt?

    Gibt (Set-Code, Release-Datum, gespielte Karten) zurueck, wenn ein
    Set NEUER ist als der oberste Eintrag von ROTATIONEN **und** im
    Standardfeld wie ein Hauptset gespielt wird. Sonst None.

    WARUM
    -----
    `pruefe_fenster()` faengt den einen Weg — ROTATIONEN nennt ein Set,
    das es nicht gibt. Der andere Weg ist stiller und teurer: ein
    echtes Hauptset erscheint, steht aber NICHT in ROTATIONEN. Dann
    ordnet `formatschluessel()` alle Turniere danach weiter dem alten
    Fenster zu — die Kartenzeilen zweier Formate landen in derselben
    Datei, und genau das sollte die Aufteilung je Format verhindern.

    Die Schwelle ist dieselbe wie beim Ankerriegel in update_sets.py
    (25 verschiedene gespielte Karten, gemessen an PBL: 40 am Tag nach
    dem Erscheinen gegen 8 beim groessten Mini-Set).
    """
    meta = _sets_metadata(datenverzeichnis)
    fenster = formatfenster(datenverzeichnis)
    if not fenster:
        return None
    juengstes = fenster[0][1]

    gespielt: Dict[str, set] = {}
    try:
        namen = [n for n in os.listdir(datenverzeichnis)
                 if n.startswith("online_api_cards_") and n.endswith(".csv")]
    except OSError:
        return None
    for name in namen:
        try:
            with open(os.path.join(datenverzeichnis, name),
                      encoding="utf-8", newline="") as datei:
                for zeile in csv.DictReader(datei, delimiter=";"):
                    code = (zeile.get("set") or "").strip().upper()
                    nummer = (zeile.get("number") or "").strip()
                    if code and nummer:
                        gespielt.setdefault(code, set()).add(nummer)
        except (OSError, csv.Error):
            continue

    # Auch das abgeleitete laufende Fenster zaehlt als bekannt — sonst
    # meldet der Waechter genau das Set, das gerade richtig eingeordnet
    # wird.
    bekannt = {s for _, s in ROTATIONEN}
    try:
        with open(os.path.join(datenverzeichnis, "format_window.json"),
                  encoding="utf-8") as datei:
            bekannt.add(str((json.load(datei)).get("current_set")
                            or "").strip().upper())
    except (OSError, ValueError):
        pass
    bekannt.discard("")
    for code, eintrag in meta.items():
        datum = (eintrag or {}).get("release_date")
        if not datum or datum <= juengstes or code in bekannt:
            continue
        n = len(gespielt.get(code.upper(), ()))
        if n >= ANKER_MIN_KARTEN:
            return (code, datum, n)
    return None


# Dieselbe gemessene Schwelle wie backend/core/update_sets.py.
ANKER_MIN_KARTEN = 25


# ---------------------------------------------------------------------------
# Netzschicht
# ---------------------------------------------------------------------------

class LimitlessApi:
    """Duenne Huelle um die offizielle API.

    Kein Schluessel noetig (ausser fuer /games/decks, das wir nicht
    brauchen). Die Rate-Limit-Header sind aus dem Browser wegen CORS
    NICHT lesbar — serverseitig sind sie da, und genau deshalb liest
    diese Klasse sie aus und bremst von selbst, statt in ein 429 zu
    laufen.
    """

    def __init__(self, basis: str = API_BASIS, pause: float = 0.35,
                 timeout: int = 30, versuche: int = 4,
                 schluessel: Optional[str] = None):
        self.basis = basis.rstrip("/")
        self.pause = pause
        self.timeout = timeout
        self.versuche = versuche
        self.schluessel = schluessel
        self.anfragen = 0
        self.letzte_header: Dict[str, str] = {}

    def _url(self, pfad: str, params: Optional[Dict[str, Any]] = None) -> str:
        """Der Schluessel geht als HEADER raus, nicht als Query-Parameter.

        Limitless erlaubt beides (`?key=` oder `X-Access-Key`). Der
        Header ist der einzig vertretbare Weg: eine URL landet im
        Protokoll des Laufs, in Fehlermeldungen und in jedem
        Zwischenspeicher. Ein Zugangsschluessel hat dort nichts zu
        suchen.
        """
        frage = ("?" + urllib.parse.urlencode(params)) if params else ""
        return f"{self.basis}/{pfad.lstrip('/')}{frage}"

    def get(self, pfad: str, params: Optional[Dict[str, Any]] = None) -> Any:
        url = self._url(pfad, params)
        letzter_fehler: Optional[Exception] = None
        for versuch in range(self.versuche):
            try:
                kopf = {"User-Agent": "TheDipidis/1.0 (+https://thedipidis.app)",
                        "Accept": "application/json"}
                if self.schluessel:
                    kopf["X-Access-Key"] = self.schluessel
                anfrage = urllib.request.Request(url, headers=kopf)
                with urllib.request.urlopen(anfrage, timeout=self.timeout) as antwort:
                    roh = antwort.read().decode("utf-8")
                    self.letzte_header = {k.lower(): v for k, v in antwort.headers.items()}
                self.anfragen += 1
                self._bremse()
                return json.loads(roh)
            except urllib.error.HTTPError as fehler:
                letzter_fehler = fehler
                if fehler.code == 429:
                    warte = float(fehler.headers.get("Retry-After") or (2 ** versuch))
                    time.sleep(min(warte, 60.0))
                    continue
                if fehler.code in (500, 502, 503, 504):
                    time.sleep(2 ** versuch)
                    continue
                raise
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as fehler:
                letzter_fehler = fehler
                time.sleep(2 ** versuch)
        raise RuntimeError(f"API-Anfrage endgueltig gescheitert: {url}") from letzter_fehler

    def _bremse(self) -> None:
        """Freiwillige Pause; wird enger, wenn das Restkontingent knapp wird."""
        rest = self.letzte_header.get("x-ratelimit-remaining")
        pause = self.pause
        try:
            if rest is not None and int(rest) < 20:
                pause = max(pause, 2.0)
        except (TypeError, ValueError):
            pass
        time.sleep(pause)

    # --- die vier Endpunkte -------------------------------------------------

    def turniere(self, spiel: str = STANDARD_SPIEL, format_id: Optional[str] = None,
                 limit: int = 100, seite: int = 1) -> List[dict]:
        params: Dict[str, Any] = {"game": spiel, "limit": limit, "page": seite}
        if format_id:
            params["format"] = format_id
        return self.get("tournaments", params) or []

    def details(self, turnier_id: str) -> dict:
        return self.get(f"tournaments/{turnier_id}/details") or {}

    def standings(self, turnier_id: str) -> List[dict]:
        return self.get(f"tournaments/{turnier_id}/standings") or []

    def pairings(self, turnier_id: str) -> List[dict]:
        return self.get(f"tournaments/{turnier_id}/pairings") or []


# ---------------------------------------------------------------------------
# Reine Rechenschicht — kein Netz, vollstaendig testbar
# ---------------------------------------------------------------------------

def deck_je_spieler(standings: Sequence[dict]) -> Dict[str, str]:
    """spieler-id -> deck-id. Spieler ohne Deckzuordnung fehlen absichtlich."""
    zu = {}
    for eintrag in standings:
        spieler = eintrag.get("player")
        deck = eintrag.get("deck") or {}
        if spieler and deck.get("id"):
            zu[spieler] = deck["id"]
    return zu


def deck_namen(standings: Sequence[dict]) -> Dict[str, str]:
    """deck-id -> Anzeigename, wie die API ihn selbst mitliefert.

    Das ist der einzige zulaessige Weg zum Namen. Wird ein Name fuer
    dieselbe id uneinheitlich geliefert, gewinnt der erste — gemeldet
    wird das nicht hier, sondern vom Data Guardian.
    """
    namen: Dict[str, str] = {}
    for eintrag in standings:
        deck = eintrag.get("deck") or {}
        if deck.get("id") and deck.get("name") and deck["id"] not in namen:
            namen[deck["id"]] = deck["name"]
    return namen


def _partien(pairings: Sequence[dict]) -> Iterable[Tuple[str, Optional[str], str]]:
    """Zerlegt jede Partie in zwei Sichten: (ich, gegner, ergebnis).

    ergebnis ist 'S', 'N' oder 'U'. Gegner ist None bei Freilos/Zeitstrafe.
    """
    for match in pairings:
        p1, p2 = match.get("player1"), match.get("player2")
        sieger = match.get("winner")
        for ich, gegner in ((p1, p2), (p2, p1)):
            if not ich:
                continue
            if sieger == 0:
                ergebnis = "U"
            elif sieger == -1:
                ergebnis = "N"          # Doppelniederlage: beide verlieren
            elif sieger == ich:
                ergebnis = "S"
            else:
                ergebnis = "N"
            yield ich, (gegner or None), ergebnis


def bilanz_aus_records(standings: Sequence[dict]) -> Dict[str, List[int]]:
    """Bilanz je Archetyp aus den `record`-Feldern der Standings.

    Der zweite, unabhaengige Weg zur selben Zahl — am 08.09.2026 an
    Mega Excadrill gegengerechnet: aus /pairings 32-40-0, aus den
    record-Feldern 32-40-0, auf der Limitless-Seite 32-40-0.

    Er kostet KEINE zusaetzliche Anfrage und ist deshalb der Weg fuer
    die duenne Tiefe. Was er nicht kann: die Matchup-Matrix. Wer wissen
    will, GEGEN WEN gewonnen wurde, braucht /pairings.
    """
    heraus: Dict[str, List[int]] = defaultdict(lambda: [0, 0, 0])
    for eintrag in standings:
        deck = (eintrag.get("deck") or {}).get("id")
        if not deck:
            continue
        r = eintrag.get("record") or {}
        heraus[deck][0] += int(r.get("wins") or 0)
        heraus[deck][1] += int(r.get("losses") or 0)
        heraus[deck][2] += int(r.get("ties") or 0)
    return heraus


def archetyp_bilanz(standings: Sequence[dict],
                    pairings: Sequence[dict]) -> Dict[str, dict]:
    """Je Archetyp: Listenzahl, Anteil und Bilanz aus den Partien.

    Der Anteil traegt seinen Nenner mit (`listen_gesamt`) — ohne Nenner
    ist eine Prozentzahl in diesem Projekt nicht ausspielbar.
    """
    zu = deck_je_spieler(standings)
    namen = deck_namen(standings)

    listen: Dict[str, int] = defaultdict(int)
    for spieler, deck in zu.items():
        listen[deck] += 1
    gesamt = sum(listen.values())

    # Ohne Pairings (duenne Tiefe) kommt die Bilanz aus den record-Feldern.
    # Beide Wege liefern dieselben Zahlen; welcher es war, steht in der
    # Ausgabe, damit niemand spaeter raten muss.
    if pairings:
        quelle = "pairings"
        bilanz: Dict[str, List[int]] = defaultdict(lambda: [0, 0, 0])
        for ich, _gegner, ergebnis in _partien(pairings):
            deck = zu.get(ich)
            if not deck:
                continue
            bilanz[deck]["SNU".index(ergebnis)] += 1
    else:
        quelle = "records"
        bilanz = bilanz_aus_records(standings)

    heraus: Dict[str, dict] = {}
    for deck, anzahl in listen.items():
        s, n, u = bilanz.get(deck, [0, 0, 0])
        partien = s + n + u
        heraus[deck] = {
            "archetyp_id": deck,
            "archetyp_name": namen.get(deck, deck),
            "listen": anzahl,
            "listen_gesamt": gesamt,
            "anteil": (anzahl / gesamt) if gesamt else 0.0,
            "siege": s, "niederlagen": n, "unentschieden": u,
            "partien": partien,
            # Konvention "mitUnentschieden" (js/win-rate-konvention.js):
            # S / (S + N + U). Der Name der Konvention wird mitgeschrieben,
            # damit die Frontend-Seite nicht raten muss.
            "quote": (s / partien) if partien else 0.0,
            "quoten_konvention": "mitUnentschieden",
            "bilanz_quelle": quelle,
        }
    return heraus


def karten_schnitt(standings: Sequence[dict]) -> Dict[Tuple[str, str, str, str], dict]:
    """Je (Archetyp, Gruppe, Set, Nummer): Feldschnitt und Aufnahmequote.

    `schnitt` ist die Zahl, die Limitless auf /metagame/<slug>/cards
    zeigt: Gesamtzahl der Karte geteilt durch die Zahl ALLER Listen des
    Archetyps — nicht durch die Listen, die die Karte spielen. Genau
    darin liegt der Unterschied zwischen "3 Kopien in jedem Deck" und
    "3 Kopien in einem Drittel der Decks", und beides steht deshalb
    nebeneinander: `schnitt` und `aufnahmequote`.
    """
    zu = deck_je_spieler(standings)
    listen_je_deck: Dict[str, int] = defaultdict(int)
    for eintrag in standings:
        deck = (eintrag.get("deck") or {}).get("id")
        if deck:
            listen_je_deck[deck] += 1

    summe: Dict[Tuple[str, str, str, str], int] = defaultdict(int)
    listen_mit: Dict[Tuple[str, str, str, str], int] = defaultdict(int)
    name_je: Dict[Tuple[str, str, str, str], str] = {}

    for eintrag in standings:
        deck = (eintrag.get("deck") or {}).get("id")
        liste = eintrag.get("decklist") or {}
        if not deck or not liste:
            continue
        gesehen = set()
        for gruppe in GRUPPEN:
            for karte in (liste.get(gruppe) or []):
                satz = str(karte.get("set") or "")
                nummer = str(karte.get("number") or "")
                anzahl = int(karte.get("count") or 0)
                if not satz or not nummer or anzahl <= 0:
                    continue
                schluessel = (deck, gruppe, satz, nummer)
                summe[schluessel] += anzahl
                name_je.setdefault(schluessel, karte.get("name") or "")
                gesehen.add(schluessel)
        for schluessel in gesehen:
            listen_mit[schluessel] += 1

    heraus = {}
    for schluessel, gesamt in summe.items():
        deck, gruppe, satz, nummer = schluessel
        n = listen_je_deck.get(deck, 0)
        heraus[schluessel] = {
            "archetyp_id": deck,
            "gruppe": gruppe,
            "set": satz,
            "nummer": nummer,
            "karte": name_je.get(schluessel, ""),
            "kopien_gesamt": gesamt,
            "listen_mit_karte": listen_mit.get(schluessel, 0),
            "listen_gesamt": n,
            "schnitt": (gesamt / n) if n else 0.0,
            "aufnahmequote": (listen_mit.get(schluessel, 0) / n) if n else 0.0,
        }
    return heraus


def matchup_matrix(standings: Sequence[dict],
                   pairings: Sequence[dict]) -> Dict[Tuple[str, str], dict]:
    """Je (Archetyp, Gegner-Archetyp): Bilanz aus dem GANZEN Feld.

    Partien ohne Gegner (Freilos, Zeitstrafe) fallen heraus — sie haben
    keinen Gegner-Archetyp. Der Sammeleimer "Other" faellt auf beiden
    Seiten heraus: er ist kein Deck, sondern zwanzig verschiedene.
    """
    zu = deck_je_spieler(standings)
    roh: Dict[Tuple[str, str], List[int]] = defaultdict(lambda: [0, 0, 0])
    for ich, gegner, ergebnis in _partien(pairings):
        if not gegner:
            continue
        a, b = zu.get(ich), zu.get(gegner)
        if not a or not b or a == SAMMELEIMER or b == SAMMELEIMER:
            continue
        roh[(a, b)]["SNU".index(ergebnis)] += 1

    heraus = {}
    for (a, b), (s, n, u) in roh.items():
        partien = s + n + u
        heraus[(a, b)] = {
            "archetyp_id": a, "gegner_id": b,
            "siege": s, "niederlagen": n, "unentschieden": u,
            "partien": partien,
            "quote": (s / partien) if partien else 0.0,
            "quoten_konvention": "mitUnentschieden",
        }
    return heraus


def neue_turniere(api_liste: Sequence[dict],
                  bekannt: Any = (),
                  min_spieler: int = STANDARD_MIN_SPIELER,
                  format_id: Optional[str] = STANDARD_FORMAT,
                  ab_datum: Optional[datetime] = None,
                  bis_datum: Optional[datetime] = None,
                  tiefe: str = TIEFE_VOLL,
                  metas: Optional[Iterable[str]] = None,
                  datenverzeichnis: str = "data") -> List[dict]:
    """Die inkrementelle Regel: bekanntes Turnier -> ueberspringen.

    Ein abgeschlossenes Limitless-Turnier aendert sich nicht mehr, ein
    erneuter Abruf waere also reine Last.

    EINE Ausnahme: wurde es nur duenn geholt und jetzt wird die volle
    Tiefe verlangt, kommt es wieder mit. `voll` schliesst `archetypen`
    ein, umgekehrt nicht.

    Gefiltert wird ausserdem auf Format (das API-Feld), Zeitraum,
    Mindestspielerzahl und optional auf bestimmte Formatfenster —
    letzteres ist der Filter, der beim Rueckbau die Kartenpools
    auseinanderhaelt.
    """
    if isinstance(bekannt, dict):
        bekannt_tiefe = bekannt
    else:
        bekannt_tiefe = {t: TIEFE_VOLL for t in bekannt}
    erlaubt = set(metas) if metas else None

    heraus = []
    for turnier in api_liste:
        tid = turnier.get("id")
        if not tid:
            continue
        schon = bekannt_tiefe.get(tid)
        if schon == TIEFE_VOLL or (schon is not None and schon == tiefe):
            continue
        if format_id and turnier.get("format") != format_id:
            continue
        if int(turnier.get("players") or 0) < min_spieler:
            continue
        wann = parse_api_datum(turnier.get("date"))
        if ab_datum is not None and (wann is None or wann < ab_datum):
            continue
        if bis_datum is not None and (wann is None or wann > bis_datum):
            continue
        if erlaubt is not None:
            meta = formatschluessel((turnier.get("date") or "")[:10],
                                    datenverzeichnis)
            if meta not in erlaubt:
                continue
        heraus.append(turnier)
    return heraus


def parse_api_datum(roh: Optional[str]) -> Optional[datetime]:
    """ISO-8601 mit Z, wie die API es liefert: 2026-09-08T02:00:00.000Z."""
    if not roh:
        return None
    try:
        return datetime.fromisoformat(str(roh).replace("Z", "+00:00"))
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# Ausgabe
# ---------------------------------------------------------------------------

# `meta` traegt in jeder Zeile das Formatfenster. Ohne diese Spalte ist
# eine Kartenzahl aus dem Mai und eine aus dem September dieselbe Zahl —
# obwohl dazwischen ein Set dazukam und davor eine Rotation lag.
SPALTEN_TURNIERE = ["tournament_id", "name", "date", "meta", "format",
                    "players", "organizer_id", "is_online", "has_decklists",
                    "swiss_rounds", "phases", "standings_rows",
                    "pairings_rows", "depth", "scraped_at"]

SPALTEN_ARCHETYPEN = ["tournament_id", "date", "meta", "players",
                      "archetype_id", "archetype_name", "lists",
                      "lists_total", "share", "wins", "losses", "ties",
                      "matches", "win_rate", "win_rate_convention",
                      "record_source"]

SPALTEN_KARTEN = ["tournament_id", "date", "meta", "archetype_id", "group",
                  "set", "number", "card", "copies_total", "lists_with_card",
                  "lists_total", "avg_count", "inclusion_rate"]

SPALTEN_MATCHUPS = ["tournament_id", "date", "meta", "archetype_id",
                    "opponent_id", "wins", "losses", "ties", "matches",
                    "win_rate", "win_rate_convention"]

def _chunkname(basis: str, meta: str) -> str:
    """online_api_cards_TEF-PBL.csv — dasselbe Muster wie
    labs_tournament_matchups_TEF-PBL.csv, das dieses Projekt seit Langem
    fuehrt.

    Warum aufgeteilt: gemessen am 08.09.2026 sind es 146 KB Kartenzeilen
    JE TURNIER. Das laufende Format allein sind 186 Turniere = 27 MB;
    sechs Monate waeren 65 MB in einer Datei, wachsend. GitHub warnt ab
    50 MB und nimmt ab 100 MB gar nichts mehr an. Eine Datei je Format
    hoert auf zu wachsen, sobald das Format vorbei ist.
    """
    return f"{basis}_{meta}.csv"


def _schreibe_csv(pfad: str, spalten: Sequence[str], zeilen: Sequence[dict]) -> None:
    os.makedirs(os.path.dirname(pfad) or ".", exist_ok=True)
    neu = not os.path.exists(pfad) or os.path.getsize(pfad) == 0
    with open(pfad, "a", encoding="utf-8", newline="") as datei:
        schreiber = csv.DictWriter(datei, fieldnames=list(spalten),
                                   delimiter=";", extrasaction="ignore")
        if neu:
            schreiber.writeheader()
        for zeile in zeilen:
            schreiber.writerow(zeile)


def bekannte_turniere(pfad: str) -> Dict[str, str]:
    """turnier-id -> bereits geholte Tiefe.

    Das Gedaechtnis merkt sich nicht nur DASS ein Turnier geholt wurde,
    sondern WIE TIEF. Sonst koennte ein Fenster, das erst duenn geholt
    wurde, spaeter nie auf die volle Tiefe nachgezogen werden — der Lauf
    saehe die id und uebersprnge sie.
    """
    if not os.path.exists(pfad):
        return {}
    heraus: Dict[str, str] = {}
    with open(pfad, encoding="utf-8", newline="") as datei:
        for zeile in csv.DictReader(datei, delimiter=";"):
            tid = zeile.get("tournament_id")
            if tid:
                # Zeilen aus der Zeit vor der Tiefenschaltung tragen keine
                # Spalte; sie stammen aus vollen Laeufen.
                heraus[tid] = zeile.get("depth") or TIEFE_VOLL
    return heraus


def bekannte_turnier_ids(pfad: str) -> List[str]:
    """Nur die ids — fuer das Aufraeumen verwaister Zeilen."""
    return list(bekannte_turniere(pfad))


def verwaiste_zeilen(zeilen: Sequence[dict], bekannte_ids: Iterable[str]) -> List[dict]:
    """Behaelt nur Zeilen, deren Turnier im Index steht.

    WARUM DAS NOETIG IST
    Je Turnier werden mehrere Dateien geschrieben, der Index zuletzt.
    Bricht der Lauf dazwischen ab, dann stehen Archetyp-, Karten- oder
    Matchupzeilen da, ohne dass das Turnier als geholt gilt. Der naechste
    Lauf holt es erneut und haengt dieselben Zeilen ein zweites Mal an —
    ein Kartenschnitt von 3,77 wuerde dadurch nicht auffaellig falsch,
    sondern unauffaellig doppelt gewichtet. Diese Funktion raeumt die
    Halbfertigen weg, bevor etwas Neues geschrieben wird.
    """
    bekannt = set(bekannte_ids)
    return [z for z in zeilen if z.get("tournament_id") in bekannt]


def _raeume_auf(pfad: str, spalten: Sequence[str], bekannte_ids: Iterable[str]) -> int:
    """Schreibt eine Datei ohne ihre verwaisten Zeilen neu. Gibt die Zahl der
    entfernten Zeilen zurueck."""
    if not os.path.exists(pfad):
        return 0
    with open(pfad, encoding="utf-8", newline="") as datei:
        alle = list(csv.DictReader(datei, delimiter=";"))
    behalten = verwaiste_zeilen(alle, bekannte_ids)
    entfernt = len(alle) - len(behalten)
    if entfernt:
        with open(pfad, "w", encoding="utf-8", newline="") as datei:
            schreiber = csv.DictWriter(datei, fieldnames=list(spalten),
                                       delimiter=";", extrasaction="ignore")
            schreiber.writeheader()
            schreiber.writerows(behalten)
    return entfernt


def _raeume_chunks_auf(datenverzeichnis: str, basis: str,
                       spalten: Sequence[str],
                       bekannte_ids: Iterable[str]) -> int:
    """Dasselbe ueber alle Chunkdateien eines Basisnamens."""
    entfernt = 0
    for name in sorted(os.listdir(datenverzeichnis)):
        if name.startswith(basis + "_") and name.endswith(".csv"):
            entfernt += _raeume_auf(os.path.join(datenverzeichnis, name),
                                    spalten, bekannte_ids)
    return entfernt


def zeilen_fuer_turnier(turnier: dict, details: dict,
                        standings: Sequence[dict],
                        pairings: Sequence[dict],
                        tiefe: str = TIEFE_VOLL,
                        datenverzeichnis: str = "data") -> Dict[str, List[dict]]:
    """Bindet die reinen Rechenfunktionen zu den Ausgabetabellen.

    Bei `tiefe == archetypen` bleiben Karten- und Matchupzeilen leer:
    dort wurden gar keine Pairings geholt, und die Kartenebene traegt
    ueber eine Formatgrenze hinweg ohnehin nicht.
    """
    tid = turnier.get("id", "")
    datum = (turnier.get("date") or "")[:10]
    meta = formatschluessel(datum, datenverzeichnis)
    spieler = int(turnier.get("players") or 0)

    phasen = details.get("phases") or []
    swiss = next((int(p.get("rounds") or 0) for p in phasen
                  if str(p.get("type", "")).upper() == "SWISS"), 0)

    bilanz = archetyp_bilanz(standings, pairings)

    zeilen_arch = [{
        "tournament_id": tid, "date": datum, "meta": meta, "players": spieler,
        "archetype_id": w["archetyp_id"], "archetype_name": w["archetyp_name"],
        "lists": w["listen"], "lists_total": w["listen_gesamt"],
        "share": round(w["anteil"], 6),
        "wins": w["siege"], "losses": w["niederlagen"], "ties": w["unentschieden"],
        "matches": w["partien"], "win_rate": round(w["quote"], 6),
        "win_rate_convention": w["quoten_konvention"],
        "record_source": w["bilanz_quelle"],
    } for w in sorted(bilanz.values(), key=lambda x: -x["listen"])]

    zeilen_karten: List[dict] = []
    zeilen_matchups: List[dict] = []
    if tiefe == TIEFE_VOLL:
        zeilen_karten = [{
            "tournament_id": tid, "date": datum, "meta": meta,
            "archetype_id": w["archetyp_id"], "group": w["gruppe"],
            "set": w["set"], "number": w["nummer"], "card": w["karte"],
            "copies_total": w["kopien_gesamt"],
            "lists_with_card": w["listen_mit_karte"],
            "lists_total": w["listen_gesamt"],
            "avg_count": round(w["schnitt"], 4),
            "inclusion_rate": round(w["aufnahmequote"], 4),
        } for w in karten_schnitt(standings).values()
            if w["archetyp_id"] != SAMMELEIMER]

        zeilen_matchups = [{
            "tournament_id": tid, "date": datum, "meta": meta,
            "archetype_id": w["archetyp_id"], "opponent_id": w["gegner_id"],
            "wins": w["siege"], "losses": w["niederlagen"],
            "ties": w["unentschieden"], "matches": w["partien"],
            "win_rate": round(w["quote"], 6),
            "win_rate_convention": w["quoten_konvention"],
        } for w in matchup_matrix(standings, pairings).values()]

    zeile_turnier = {
        "tournament_id": tid, "name": turnier.get("name", ""),
        "date": turnier.get("date", ""), "meta": meta,
        "format": turnier.get("format", ""),
        "players": spieler, "organizer_id": turnier.get("organizerId", ""),
        "is_online": details.get("isOnline", ""),
        # ANGABE DER QUELLE, NICHT NACHGEPRUEFT — nicht danach filtern.
        #
        # `has_decklists` ist woertlich das Feld `decklists` aus
        # /tournaments/{id}/details. Es sagt, was Limitless ueber das
        # Turnier BEHAUPTET, nicht, was wir an Listen bekommen haben.
        # Wir schreiben es unveraendert weiter (Hausregel "Report,
        # don't silently repair"): ein Widerspruch zwischen Behauptung
        # und Bestand ist eine Aussage ueber die Quelle und darf nicht
        # wegkorrigiert werden.
        #
        # GEMESSEN AM 12.09.2026 ueber data/online_api_tournaments.csv
        # (410 Turniere) gegen data/online_api_cards_TEF-PBL.csv:
        #   True  199   davon 199 mit Kartenzeilen
        #   False   1   MIT 816 Kartenzeilen (Turnier
        #               6a8c23ae8302ae761e5fb0bc, SEASAC League
        #               Challenge #24, 126 Standings-Zeilen)
        #   leer  210   = alle Turniere mit depth='archetypen'. Dort
        #               wird /details gar nicht erst geholt (siehe
        #               main(): `details = {}`), das Feld ist also
        #               nicht "nein", sondern "nicht gefragt".
        # Umgekehrt gibt es 0 Turniere mit has_decklists=True und ohne
        # Kartenzeilen.
        #
        # Wer wissen will, ob Decklisten VORLIEGEN, zaehlt die Zeilen in
        # online_api_cards_<FENSTER>.csv zur tournament_id — das ist die
        # gemessene Antwort. `has_decklists` beantwortet diese Frage
        # nachweislich falsch.
        "has_decklists": details.get("decklists", ""),
        "swiss_rounds": swiss, "phases": len(phasen),
        "standings_rows": len(standings), "pairings_rows": len(pairings),
        "depth": tiefe,
        "scraped_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }

    return {"turniere": [zeile_turnier], "archetypen": zeilen_arch,
            "karten": zeilen_karten, "matchups": zeilen_matchups,
            "meta": meta}


# ---------------------------------------------------------------------------
# Live-Gegenprobe
# ---------------------------------------------------------------------------

# Am 08.09.2026 im Browser von der Limitless-Oberflaeche abgelesen und
# unabhaengig aus der API nachgerechnet. Wenn die API ihre Semantik aendert
# (etwa Doppelniederlagen anders zaehlt), faellt genau das hier auf — im
# Sandkasten ist die API nicht erreichbar (Proxy 403), deshalb laeuft diese
# Probe ausschliesslich in CI.
GEGENPROBE = {
    "turnier_id": "6a9db100ab080c8c957fc12b",
    "spieler": 342,
    "partien": 876,
    "archetyp": "mega-excadrill-ex",
    "name": "Mega Excadrill",
    "listen": 13,
    "bilanz": (32, 40, 0),
    "karten": {                       # (Gruppe, Set, Nummer): Schnitt
        ("pokemon", "TEF", "114"): 3.77,
        ("trainer", "DRI", "176"): 3.62,
        ("pokemon", "PBL", "46"): 3.23,
        ("energy", "MEE", "8"): 15.92,
    },
    # Limitless schneidet ab, wir runden — daher 0,02 Spielraum, nicht mehr.
    "toleranz": 0.02,
}


def gegenprobe(api: "LimitlessApi") -> List[str]:
    """Rechnet die vier Ebenen gegen live abgelesene Werte. Gibt Abweichungen zurueck."""
    g = GEGENPROBE
    standings = api.standings(g["turnier_id"])
    pairings = api.pairings(g["turnier_id"])
    fehler: List[str] = []

    def pruefe(was, ist, soll):
        if ist != soll:
            fehler.append(f"{was}: erwartet {soll}, gemessen {ist}")

    pruefe("Standings-Zeilen", len(standings), g["spieler"])
    pruefe("Pairings-Zeilen", len(pairings), g["partien"])

    bilanz = archetyp_bilanz(standings, pairings)
    w = bilanz.get(g["archetyp"])
    if not w:
        fehler.append(f"Archetyp {g['archetyp']} fehlt in den Standings")
        return fehler

    pruefe("Anzeigename", w["archetyp_name"], g["name"])
    pruefe("Listen", w["listen"], g["listen"])
    pruefe("Bilanz", (w["siege"], w["niederlagen"], w["unentschieden"]), g["bilanz"])

    # Zweiter, unabhaengiger Weg zur selben Bilanz: die record-Felder.
    aus_records = [0, 0, 0]
    for eintrag in standings:
        if (eintrag.get("deck") or {}).get("id") != g["archetyp"]:
            continue
        r = eintrag.get("record") or {}
        aus_records[0] += int(r.get("wins") or 0)
        aus_records[1] += int(r.get("losses") or 0)
        aus_records[2] += int(r.get("ties") or 0)
    pruefe("Bilanz aus den record-Feldern", tuple(aus_records), g["bilanz"])

    karten = karten_schnitt(standings)
    for (gruppe, satz, nummer), soll in g["karten"].items():
        eintrag = karten.get((g["archetyp"], gruppe, satz, nummer))
        if not eintrag:
            fehler.append(f"Karte {satz}-{nummer} fehlt")
            continue
        if abs(eintrag["schnitt"] - soll) > g["toleranz"]:
            fehler.append(f"Schnitt {satz}-{nummer}: erwartet {soll}, "
                          f"gemessen {eintrag['schnitt']:.2f}")
    return fehler


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main(argv: Optional[Sequence[str]] = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    p.add_argument("--data-dir", default="data")
    p.add_argument("--min-players", type=int, default=STANDARD_MIN_SPIELER)
    p.add_argument("--format", default=STANDARD_FORMAT)
    p.add_argument("--game", default=STANDARD_SPIEL)
    p.add_argument("--days", type=int, default=14,
                   help="Wie weit zurueck die Turnierliste gelesen wird.")
    p.add_argument("--meta", default="",
                   help="Nur diese Formatfenster holen, komma-getrennt "
                        "(z. B. TEF-CRI,TEF-POR). Leer = alle im Zeitraum.")
    p.add_argument("--tiefe", choices=TIEFEN, default=TIEFE_VOLL,
                   help="voll = alle vier Ebenen (3 Anfragen/Turnier); "
                        "archetypen = nur Turnier- und Archetypzeilen "
                        "(1 Anfrage/Turnier).")
    p.add_argument("--max-tournaments", type=int, default=0,
                   help="0 = kein Deckel.")
    p.add_argument("--pause", type=float, default=0.35)
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--verify", action="store_true",
                   help="Nur die Live-Gegenprobe fahren, nichts schreiben.")
    a = p.parse_args(argv)

    pfad = lambda n: os.path.join(a.data_dir, n)
    # Der Schluessel ist OPTIONAL. Limitless vergibt ihn fuer hoehere
    # Kontingente an oeffentliche Projekte; ohne ihn laeuft alles, was
    # dieser Scraper tut (in fuenf Laeufen bis 26 min kein einziges 429).
    # Er kommt ausschliesslich aus der Umgebung — nie aus einer Datei im
    # Repo, nie aus einem Argument, das im Protokoll landet.
    schluessel = os.environ.get("LIMITLESS_API_KEY") or None
    api = LimitlessApi(pause=a.pause, schluessel=schluessel)
    print("API-Schluessel: " + ("gesetzt" if schluessel else "keiner (nicht noetig)"))
    ab = datetime.now(timezone.utc) - timedelta(days=a.days)

    if a.verify:
        abweichungen = gegenprobe(api)
        if abweichungen:
            print("GEGENPROBE GESCHEITERT:", file=sys.stderr)
            for zeile in abweichungen:
                print(f"  - {zeile}", file=sys.stderr)
            return 1
        print(f"Gegenprobe bestanden ({api.anfragen} Anfragen): "
              f"Standings, Pairings, Bilanz auf zwei Wegen und vier Kartenschnitte "
              f"stimmen mit den am 08.09.2026 abgelesenen Werten ueberein.")
        return 0

    # Eine veraltete Fensterliste ordnet Turniere ins falsche Format und
    # sieht dabei richtig aus. Lieber hier abbrechen.
    luecken = pruefe_fenster(a.data_dir)
    if luecken:
        print("::error::ROTATIONEN kennt Sets, die sets_metadata.json nicht "
              "hat: " + ", ".join(luecken), file=sys.stderr)
        return 1

    # Der stillere der beiden Wege: ein echtes Hauptset ist erschienen und
    # steht nicht in ROTATIONEN. Dann landen die Kartenzeilen zweier
    # Formate in derselben Datei — genau das, was die Aufteilung je Format
    # verhindern soll. Warnen, nicht abbrechen: der Lauf selbst ist
    # weiterhin korrekt, nur das Fenster ist zu grob.
    fehlt = fehlendes_fenster(a.data_dir)
    if fehlt:
        code, datum, n = fehlt
        print(f"::warning::Set {code} ist am {datum} erschienen und wird im "
              f"Standardfeld gespielt ({n} verschiedene Karten), steht aber "
              f"nicht in ROTATIONEN. Alle Turniere danach werden weiter dem "
              f"alten Fenster zugeordnet. Eintrag in ROTATIONEN ergaenzen.",
              file=sys.stderr)

    metas = [m.strip() for m in a.meta.split(",") if m.strip()] or None
    if metas:
        bekannte_fenster = {k for k, _ in formatfenster(a.data_dir)}
        unbekannt = [m for m in metas if m not in bekannte_fenster]
        if unbekannt:
            print(f"::error::unbekanntes Formatfenster: {', '.join(unbekannt)}",
                  file=sys.stderr)
            return 1

    liste: List[dict] = []
    for seite in range(1, 41):
        teil = api.turniere(spiel=a.game, limit=100, seite=seite)
        if not teil:
            break
        liste.extend(teil)
        letztes = parse_api_datum(teil[-1].get("date"))
        if letztes and letztes < ab:
            break

    bekannt = bekannte_turniere(pfad("online_api_tournaments.csv"))

    # Halbfertige Turniere eines abgebrochenen Vorlaufs wegraeumen, BEVOR
    # etwas Neues dazukommt — sonst zaehlen ihre Zeilen doppelt.
    aufgeraeumt = (
        _raeume_auf(pfad("online_api_archetypes.csv"), SPALTEN_ARCHETYPEN, bekannt)
        + _raeume_chunks_auf(a.data_dir, "online_api_cards", SPALTEN_KARTEN, bekannt)
        + _raeume_chunks_auf(a.data_dir, "online_api_matchups", SPALTEN_MATCHUPS, bekannt)
    )
    if aufgeraeumt:
        print(f"{aufgeraeumt} verwaiste Zeilen aus einem abgebrochenen Lauf entfernt.")

    offen = neue_turniere(liste, bekannt, min_spieler=a.min_players,
                          format_id=a.format, ab_datum=ab, tiefe=a.tiefe,
                          metas=metas, datenverzeichnis=a.data_dir)
    if a.max_tournaments:
        offen = offen[:a.max_tournaments]

    verteilung: Dict[str, int] = defaultdict(int)
    for t in offen:
        verteilung[formatschluessel((t.get("date") or "")[:10], a.data_dir)] += 1
    print(f"Turnierliste: {len(liste)} · bekannt: {len(bekannt)} · "
          f"offen: {len(offen)} · Tiefe: {a.tiefe}")
    if verteilung:
        print("  je Fenster: " + " · ".join(f"{k} {v}" for k, v
                                            in sorted(verteilung.items())))
    if a.dry_run:
        for t in offen[:20]:
            print(f"  {t.get('date','')[:10]}  {t.get('players'):>4}  {t.get('name','')[:60]}")
        return 0

    for i, turnier in enumerate(offen, 1):
        tid = turnier["id"]
        try:
            if a.tiefe == TIEFE_VOLL:
                details = api.details(tid)
                standings = api.standings(tid)
                pairings = api.pairings(tid)
            else:
                # Eine Anfrage. Die Bilanz kommt aus den record-Feldern,
                # nachgerechnet gegen /pairings am 08.09.2026: 32-40-0 auf
                # beiden Wegen.
                details = {}
                standings = api.standings(tid)
                pairings = []
        except Exception as fehler:                      # noqa: BLE001
            print(f"  [{i}/{len(offen)}] {tid} NICHT GEHOLT: {fehler}", file=sys.stderr)
            continue
        if not standings:
            print(f"  [{i}/{len(offen)}] {tid} ohne Standings — uebersprungen")
            continue

        teile = zeilen_fuer_turnier(turnier, details, standings, pairings,
                                    tiefe=a.tiefe, datenverzeichnis=a.data_dir)
        meta = teile["meta"]
        _schreibe_csv(pfad("online_api_archetypes.csv"), SPALTEN_ARCHETYPEN,
                      teile["archetypen"])
        if teile["karten"]:
            _schreibe_csv(pfad(_chunkname("online_api_cards", meta)),
                          SPALTEN_KARTEN, teile["karten"])
        if teile["matchups"]:
            _schreibe_csv(pfad(_chunkname("online_api_matchups", meta)),
                          SPALTEN_MATCHUPS, teile["matchups"])
        # Der Index ZULETZT — er ist das Gedaechtnis, und ein Turnier soll
        # erst als geholt gelten, wenn seine Zeilen stehen.
        _schreibe_csv(pfad("online_api_tournaments.csv"), SPALTEN_TURNIERE,
                      teile["turniere"])
        print(f"  [{i}/{len(offen)}] {meta} · {turnier.get('name','')[:44]} · "
              f"{len(standings)} Listen · {len(teile['archetypen'])} Arch. · "
              f"{len(teile['karten'])} Karten · {len(teile['matchups'])} Matchups")

    print(f"Fertig. {api.anfragen} API-Anfragen.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
