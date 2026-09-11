#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""EINZELLISTEN VON LIMITLESS **ONLINE** — play.limitlesstcg.com

ANLASS (07.09.2026)
-------------------
`data/tournament_decklists_per_player.csv` hat 30.459 Zeilen, aber im
laufenden Format TEF-PBL steht darin genau EIN Turnier: Worlds 2026 mit
143 Listen. Davon acht Mega Excadrill, Plaetze 37-122. Auf dieser Basis
rechnen "Max Consistency" und jede Kartenempfehlung im Deckbauer.

Acht Listen aus einem Turnier sind keine Empfehlung, das ist eine
Stichprobe mit Meinung. Der Betreiber spielt Mega Excadrill und will
sich darauf verlassen koennen.

WARUM ONLINE UND NICHT MEHR PAPIER
----------------------------------
Der Unterschied ist nicht die Zahl der Turniere, sondern die
Veroeffentlichungsquote:

    Papier-Majors (limitlesstcg.com)   ~18 % der Spieler mit Liste
    Online (play.limitlesstcg.com)     253 von 253 bei "Rare Candy
                                       Club Showdown #43" (07.09.2026)

Ein einziges Online-Turnier mit 250 Spielern liefert also mehr
Einzellisten als alle drei Papier-Turniere im Bestand zusammen. Und
Online-Turniere gibt es taeglich, nicht dreimal im Jahr.

WAS DER PREIS DAFUER IST — UND WARUM DIE SPALTE `quelle` EXISTIERT
------------------------------------------------------------------
Online ist nicht Papier. Kein Anreiseaufwand, kein Startgeld, teils
Bo1 statt Bo3, ein anderes Teilnehmerfeld. Eine Empfehlung, die beide
Toepfe stillschweigend vermischt, behauptet eine Vergleichbarkeit, die
niemand gemessen hat.

Deshalb traegt JEDE Zeile eine Herkunft:

    quelle = "papier"   limitlesstcg.com, per_decklist_scraper.py
    quelle = "online"   play.limitlesstcg.com, diese Datei

Die Oberflaeche kann damit gewichten, trennen oder anschreiben. Ohne
die Spalte koennte sie das nicht einmal, wenn sie wollte.

DIE SPALTE IM BESTAND NACHTRAGEN
--------------------------------
Die vorhandenen 30.459 Zeilen stammen alle aus dem Papier-Scraper. Sie
bekommen `papier` nachgetragen — einmalig, ohne Netz:

    python3 backend/scrapers/limitless_online_decklist_scraper.py \
        --nur-herkunft-nachtragen

Das schreibt atomar (tmp + os.replace), fasst keinen anderen Wert an
und ist wiederholbar: ein zweiter Lauf findet nichts mehr zu tun.
`per_decklist_scraper.CSV_FIELDS` fuehrt `quelle` seit demselben Tag,
damit der naechste Papier-Lauf die Spalte nicht wieder wegschreibt.

DIESELBE DATEI, DIESELBEN SPALTEN
---------------------------------
Geschrieben wird in `data/tournament_decklists_per_player.csv` — die
Datei, die der Deckbauer, `js/deck-builder-consistency.js` und
`scripts/data_guardian.py` schon lesen. Die Spaltenliste wird NICHT
hier noch einmal hingeschrieben, sondern aus `per_decklist_scraper`
importiert: zwei Listen, die dasselbe meinen, laufen frueher oder
spaeter auseinander, und der Schaden faellt erst beim Lesen auf.

WAS DIESER LAUF NICHT KANN
--------------------------
* `tournament_id` (die vierstellige Labs-Nummer) bleibt LEER. Online-
  Turniere stehen nicht in labs_tournaments.json; eine Nummer zu
  erfinden waere genau die stille Reparatur, die CLAUDE.md verbietet.
* `--format` filtert ueber die ZAHL, mit der Limitless das Format in
  `data-format` fuehrt (am 07.09.2026: 4 = laufendes Standard). Diese
  Zahl ist keine Konstante des Spiels, sondern eine Datenbank-ID von
  Limitless. Nach jeder Rotation gehoert sie nachgesehen — der Lauf
  bricht ab und nennt die vorgefundenen Zahlen, wenn der Filter alles
  wegwirft, statt still null Turniere zu melden.

AUFRUF
------
    # Probelauf, schreibt nichts:
    python3 backend/scrapers/limitless_online_decklist_scraper.py --nur 5

    # gegen die Ausschnittsdateien (kein Netz noetig):
    python3 backend/scrapers/limitless_online_decklist_scraper.py \
        --aus-datei tests/fixtures/limitless_online_turnierliste.html \
        --ausgabe /tmp/probe.csv

    # echter Lauf, drei Turniere:
    python3 backend/scrapers/limitless_online_decklist_scraper.py \
        --turniere 3 --mindest-spieler 50
"""

import argparse
import csv
import os
import re
import sys
import time
from datetime import datetime, timezone

_HIER = os.path.dirname(os.path.abspath(__file__))
_WURZEL = os.path.normpath(os.path.join(_HIER, "..", ".."))
_KERN = os.path.join(_HIER, "..", "core")
for _p in (_KERN, _HIER):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from bs4 import BeautifulSoup

from card_scraper_shared import (
    setup_console_encoding, setup_logging, get_data_dir, fix_mojibake,
    safe_fetch_html, _feiner_typ,
)
from ace_spec_regel import (entscheide, entscheide_zeile,  # noqa: F401
                            belege_aus_bestand, lade_ace_liste)
from tournament_scraper_JH import _derive_meta_from_date_JH

# Die Spaltenliste kommt aus dem Papier-Scraper, nicht aus einer zweiten
# Kopie hier. Beide schreiben in DIESELBE Datei; zwei Listen waeren zwei
# Wahrheiten, und die Abweichung faellt erst beim Lesen auf (genau der
# Versatz, den `_schreibe_csv_kopftreu` im JH-Scraper aufraeumen musste).
from per_decklist_scraper import CSV_FIELDS, DEFAULT_DELAY

setup_console_encoding()
logger = setup_logging("limitless_online_decklist_scraper")

BASIS = "https://play.limitlesstcg.com"
TURNIERLISTE_URL = (BASIS + "/tournaments/completed"
                    "?game=PTCG&format=all&platform=all&type=online&time=all")

AUSGABE_DATEI = "tournament_decklists_per_player.csv"

# Der Scrape schreibt nach `get_data_dir()` — und das ist im Repo
# backend/core/data/, NICHT data/. Diese Merkwuerdigkeit ist geerbt
# (card_scraper_shared.get_data_dir haengt am Ort der Moduldatei); die
# Ablaeufe gleichen sie aus, indem sie vorher hinein- und hinterher
# herauskopieren — siehe .github/workflows/per-decklist-scrape.yml.
# Sie hier "aufzuraeumen" wuerde per_decklist_scraper.py und diesen
# Scraper auf verschiedene Dateien zeigen lassen; das waere schlimmer.
#
# Der einmalige Herkunfts-Nachtrag ist kein Scrape, sondern Pflege am
# Bestand im Repo. Er zielt deshalb auf die ECHTE Datei.
REPO_AUSGABE = os.path.join(_WURZEL, "data", AUSGABE_DATEI)

QUELLE_ONLINE = "online"
QUELLE_PAPIER = "papier"

# Die Zahl, mit der Limitless am 07.09.2026 das laufende Standard-Format
# in `data-format` fuehrt. Siehe Kopf: das ist eine Datenbank-ID von
# Limitless, keine Eigenschaft des Spiels.
FORMAT_AKTUELL = "4"

# Voreinstellung fuer die Feldgroesse. Unter 50 Spielern ist ein
# Online-Turnier fuer eine Kartenempfehlung zu duenn: die Plaetze 1-8
# eines 20er-Feldes sagen ueber Konsistenz nichts, was die Plaetze 1-8
# eines 250er-Feldes nicht besser saegten.
MINDEST_SPIELER = 50

# Ab wann ein Lauf als Einbruch gilt statt als Lauf — dieselbe Schwelle
# und dieselbe Uebersteuerung wie in scripts/scrape_pocket_tierlist.py.
SCHRUMPF_SCHWELLE = 0.7

# Die drei Ueberschriften, die play.limitlesstcg.com auf einer
# Decklistenseite setzt. Mehr gibt es nicht; taucht eine vierte auf, hat
# sich der Aufbau geaendert und der Lauf soll das melden.
ABSCHNITTE = ("Pokémon", "Trainer", "Energy")

_ABSCHNITT_RE = re.compile(r"^\s*(.+?)\s*\((\d+)\)\s*$")
_KARTE_RE = re.compile(r"^\s*(\d+)\s+(.*?)\s*$")
_DRUCK_IM_TEXT_RE = re.compile(r"\(([A-Z0-9\-]+)[\s-]([A-Za-z0-9]+)\)\s*$")
_DRUCK_IM_LINK_RE = re.compile(r"/cards/([A-Za-z0-9\-]+)/([A-Za-z0-9]+)")
# Die Bilanzzelle kann hinter der Zahl noch einen Vermerk tragen:
#   <td class="secondary">6 - 2 - 0<span class="drop">drop</span></td>
# `get_text(strip=True)` klebt das zu "6 - 2 - 0drop" zusammen, und
# das anker-feste Muster von vorher hat es abgelehnt.
#
# GEMESSEN am 10.09.2026 an der echten Seite (Amyverse PTCG Live
# Weekly #12, 6a98f8ef…): 100 von 155 Standings-Zeilen tragen den
# Vermerk. Im Bestand standen dadurch 663 von 1.319 Online-Listen
# auf 0-0-0 — nicht weil die Spieler nichts gewonnen haetten,
# sondern weil ein <span> danebenstand.
_BILANZ_RE = re.compile(
    r"^\s*(\d+)\s*-\s*(\d+)(?:\s*-\s*(\d+))?\s*(?:drop)?\s*$",
    re.IGNORECASE)
_TURNIER_ID_RE = re.compile(r"/tournament/([0-9a-zA-Z]+)/")


class Teilausfall(RuntimeError):
    """Ein Abruf oder ein Aufbau hat nicht gehalten, was er verspricht.

    Wird bis nach oben durchgereicht und beendet den Lauf, OHNE zu
    schreiben. CLAUDE.md, "Report, don't silently repair": eine halb
    geholte Datei sieht aus wie eine ganze und ist die teurere Variante
    von gar keiner.
    """


# ─────────────────────────────────────────────────────────────────────
# Abruf
# ─────────────────────────────────────────────────────────────────────

def hole(url: str, pause: float) -> str:
    """Eine Seite holen und danach warten.

    Die Pause steht VOR der Rueckgabe und nicht beim Aufrufer, damit
    sie niemand vergisst. `DEFAULT_DELAY` kommt aus
    per_decklist_scraper — dieselbe Sekunde, mit der wir schon heute
    bei limitlesstcg.com anklopfen. Limitless schuldet uns nichts.
    """
    html = safe_fetch_html(url)
    time.sleep(pause)
    if not html:
        raise Teilausfall(f"Seite nicht erreichbar: {url}")
    return html


def _suppe(html: str) -> BeautifulSoup:
    # lxml, wie im Rest des Repos (card_scraper_shared.fetch_page_bs4).
    return BeautifulSoup(html, "lxml")


# ─────────────────────────────────────────────────────────────────────
# 1. Die Turnierliste
# ─────────────────────────────────────────────────────────────────────

def lies_turnierliste(html: str) -> list:
    """Die abgeschlossenen Online-Turniere aus der Uebersichtsseite.

    Jede Zeile traegt ihre Angaben doppelt: einmal als Attribut am
    `<tr>` (data-date, data-name, data-format, data-players), einmal als
    Text in den Zellen. Gelesen werden die ATTRIBUTE — der Zelltext ist
    lokalisiert ("07. September 2026") und traegt bei schmalen Fenstern
    die Klasse `landscape-only`, ist also je nach Ausspielung gar nicht
    da.
    """
    suppe = _suppe(html)
    turniere = []
    for tr in suppe.select("tr[data-name]"):
        verweis = None
        for a in tr.select("a[href]"):
            if _TURNIER_ID_RE.search(a["href"]):
                verweis = a["href"]
                break
        if not verweis:
            # Eine Zeile ohne Verweis auf das Turnier ist nicht
            # halb brauchbar, sie ist unbrauchbar — ohne ID gibt es
            # keine Standings.
            continue
        tid = _TURNIER_ID_RE.search(verweis).group(1)
        datum_roh = (tr.get("data-date") or "").strip()
        try:
            spieler = int((tr.get("data-players") or "").strip() or 0)
        except ValueError:
            spieler = 0
        turniere.append({
            "id": tid,
            "name": fix_mojibake((tr.get("data-name") or "").strip()),
            "datum": datum_roh[:10],
            "veranstalter": fix_mojibake((tr.get("data-organizer") or "").strip()),
            "format": (tr.get("data-format") or "").strip(),
            "spieler": spieler,
            "url": f"{BASIS}/tournament/{tid}/standings",
        })
    return turniere


def filtere_turniere(turniere: list, format_code: str, mindest_spieler: int) -> list:
    """Nach Format und Feldgroesse aussieben.

    `format_code` leer oder "alle" schaltet den Formatfilter ab —
    gebraucht beim Nachholen ueber eine Rotation hinweg, wenn die
    Limitless-Zahl gerade gewechselt hat.
    """
    kein_format_filter = (not format_code) or format_code.lower() in ("alle", "all")
    behalten = []
    for t in turniere:
        if not kein_format_filter and t["format"] != str(format_code):
            continue
        if t["spieler"] < mindest_spieler:
            continue
        behalten.append(t)
    return behalten


# ─────────────────────────────────────────────────────────────────────
# 2. Die Standings
# ─────────────────────────────────────────────────────────────────────

def zerlege_bilanz(text: str) -> tuple:
    """"10 - 0 - 1" -> (10, 0, 1). "9 - 2" -> (9, 2, 0).

    Was NICHT passt, gibt (0, 0, 0) — und das ist Absicht: eine Bilanz
    ist eine Nebenangabe, an ihr soll kein Turnier scheitern. Die
    Gewichtung im Deckbauer haengt am PLATZ, nicht an der Bilanz.
    """
    m = _BILANZ_RE.match(text or "")
    if not m:
        return (0, 0, 0)
    w, l, t = int(m.group(1)), int(m.group(2)), int(m.group(3) or 0)
    # Plausibilitaetsgrenze, damit die Form nicht auf Fremdes passt:
    # "2026-09-09" ergibt sonst (2026, 9, 9). Auf der Standings-Seite
    # steht heute keine Datumszelle — aber die Suche laeuft ueber ALLE
    # Zellen der Zeile, und was dort morgen steht, weiss diese Datei
    # nicht. Kein Turnier spielt mehr als 99 Runden.
    if w > 99 or l > 99 or t > 99 or (w + l + t) > 99:
        return (0, 0, 0)
    return (w, l, t)


def lies_standings(html: str) -> list:
    """Eine Zeile je Spieler MIT veroeffentlichter Liste.

    Wer keine Liste veroeffentlicht hat, hat in seiner Zeile weder den
    Archetyp-Verweis noch den Listen-Verweis — die beiden Zellen sind
    leer. Das ist der Normalfall am Ende jedes Feldes und KEIN Fehler:
    solche Zeilen fallen still heraus. Wuerde hier eine Ausnahme
    fliegen, brauechte ein einziger Aussteiger das ganze Turnier.
    """
    suppe = _suppe(html)
    zeilen = []
    for tr in suppe.select("tr[data-placing]"):
        listen_a = None
        for a in tr.select("a[href]"):
            if a["href"].rstrip("/").endswith("/decklist"):
                listen_a = a
                break
        if listen_a is None:
            continue

        meta_a = tr.select_one('a[href*="/metagame/"]')
        archetyp = ""
        slug = ""
        if meta_a is not None:
            slug = meta_a["href"].rstrip("/").rsplit("/", 1)[-1]
            # Der Anzeigename steht im data-tooltip INNERHALB des
            # Archetyp-Verweises. Nicht irgendein data-tooltip der
            # Zeile nehmen: die Landesflagge traegt auch einen.
            tip = meta_a.select_one("[data-tooltip]")
            if tip is not None:
                archetyp = fix_mojibake(tip["data-tooltip"].strip())

        # Die Bilanz steht in einer der `secondary`-Zellen, aber nicht
        # immer in derselben (Punkte, Bilanz, Opp-%, OppOpp-%). Gesucht
        # wird deshalb nach der FORM, nicht nach der Position.
        wins = losses = ties = 0
        for td in tr.find_all("td"):
            # Den Vermerk aus der Zelle nehmen, BEVOR der Text gelesen
            # wird — sonst haengt er ohne Trennzeichen an der Zahl.
            # Das Muster oben faengt ihn zusaetzlich ab; beide Wege,
            # weil die Seite den Vermerk auch mal anders auszeichnen
            # koennte und eine Bilanz nicht an einer Klasse haengen soll.
            for weg in td.select("span.drop"):
                weg.extract()
            w, l, t = zerlege_bilanz(td.get_text(strip=True))
            if (w + l + t) > 0:
                wins, losses, ties = w, l, t
                break

        try:
            platz = int((tr.get("data-placing") or "").strip())
        except ValueError:
            continue

        zeilen.append({
            "platz": platz,
            "spieler": fix_mojibake((tr.get("data-name") or "").strip()),
            "land": (tr.get("data-country") or "").strip(),
            "archetyp": archetyp,
            "slug": slug,
            "wins": wins,
            "losses": losses,
            "ties": ties,
            "listen_url": BASIS + listen_a["href"] if listen_a["href"].startswith("/")
                          else listen_a["href"],
        })
    return zeilen


# ─────────────────────────────────────────────────────────────────────
# 3. Die Deckliste
# ─────────────────────────────────────────────────────────────────────

def lies_deckliste(html: str, card_db=None) -> list:
    """Die 60 Karten einer Liste, je mit Anzahl, Name, Set und Nummer.

    Der Aufbau ist ein anderer als bei limitlesstcg.com (dort
    `.decklist-card` mit `data-set`/`data-number`), deshalb greift
    `card_scraper_shared.extract_cards_from_decklist_soup` hier NICHT.
    Online steht die Karte als Text im Verweis:

        <a href="https://limitlesstcg.com/cards/DRI/127">
            4 Team Rocket's Murkrow (DRI-127)</a>

    Set und Nummer werden aus der `href` gelesen, nicht aus dem Text:
    der Text traegt die Klammer nur manchmal, die `href` immer. Der
    Text ist der Rueckfall, nicht die Quelle — CLAUDE.md, "Never join
    card data by name".

    Zwei Abbruchgruende, beide Aufbauwechsel und keine Datenlage:
      * die Summe der Anzahlen weicht von der Zahl in der Ueberschrift
        ab ("Pokémon (12)"), oder
      * eine Karte gibt weder in `href` noch im Text einen Druck her.
    Beides beendet den Lauf, statt eine Liste mit Loechern zu
    schreiben, die spaeter niemand mehr von einer echten unterscheidet.
    """
    suppe = _suppe(html)
    wurzel = suppe.select_one(".decklist")
    if wurzel is None:
        raise Teilausfall("Deckliste: kein .decklist-Block auf der Seite")

    karten = []
    gesehene_abschnitte = []
    for block in wurzel.select(".cards"):
        kopf = block.select_one(".heading")
        if kopf is None:
            continue
        m = _ABSCHNITT_RE.match(kopf.get_text(strip=True))
        if not m:
            raise Teilausfall(
                f"Deckliste: Ueberschrift ohne Anzahl: {kopf.get_text(strip=True)!r}")
        abschnitt, soll = m.group(1), int(m.group(2))
        if abschnitt not in ABSCHNITTE:
            raise Teilausfall(
                f"Deckliste: unbekannter Abschnitt {abschnitt!r} "
                f"(bekannt: {', '.join(ABSCHNITTE)})")
        gesehene_abschnitte.append(abschnitt)

        ist = 0
        for a in block.select("p a[href]"):
            anzahl, name = _zerlege_kartentext(a.get_text(" ", strip=True))
            set_code, nummer = _druck(a.get("href", ""), a.get_text(" ", strip=True))
            if not (set_code and nummer):
                raise Teilausfall(
                    f"Deckliste: kein Druck fuer {name!r} "
                    f"(href={a.get('href', '')!r}) — geraten wird nicht")
            ist += anzahl
            karten.append({
                "abschnitt": abschnitt,
                "count": anzahl,
                "name": name,
                "set_code": set_code,
                "set_number": nummer,
                "type": _feiner_typ(card_db, set_code, nummer),
            })
        if ist != soll:
            raise Teilausfall(
                f"Deckliste: Abschnitt {abschnitt} zaehlt {ist}, "
                f"die Ueberschrift sagt {soll}")

    if not karten:
        raise Teilausfall("Deckliste: keine Karten gefunden")
    return karten


def _zerlege_kartentext(text: str) -> tuple:
    """"4 Team Rocket's Murkrow (DRI-127)" -> (4, "Team Rocket's Murkrow")."""
    m = _KARTE_RE.match(text or "")
    if not m:
        raise Teilausfall(f"Deckliste: Kartenzeile ohne Anzahl: {text!r}")
    rest = _DRUCK_IM_TEXT_RE.sub("", m.group(2)).strip()
    return int(m.group(1)), rest


def _druck(href: str, text: str) -> tuple:
    """(Set, Nummer) — erst aus der `href`, dann aus dem Text."""
    m = _DRUCK_IM_LINK_RE.search(href or "")
    if m:
        return m.group(1).upper(), m.group(2).split("?")[0].split("#")[0]
    m = _DRUCK_IM_TEXT_RE.search(text or "")
    if m:
        return m.group(1).upper(), m.group(2)
    return "", ""


# ─────────────────────────────────────────────────────────────────────
# 4. Aus Standings + Listen werden CSV-Zeilen
# ─────────────────────────────────────────────────────────────────────

_BELEGE = None


def _belege():
    """(mehrfach, typen) ueber den ganzen ausgelieferten Bestand.

    Einmal je Prozess. `belege_aus_bestand()` liest alle CSVs mit einer
    `card_name`-Spalte und braucht dafuer rund drei Sekunden — pro
    Kartenzeile waere das nicht bezahlbar, einmal pro Lauf ist es
    nichts.
    """
    global _BELEGE
    if _BELEGE is None:
        _BELEGE = belege_aus_bestand()
    return _BELEGE


def baue_zeilen(turnier: dict, standing: dict, karten: list, gestempelt: str) -> list:
    """Eine Zeile je Karte dieser einen Liste — im Schema des
    Papier-Scrapers, damit jeder vorhandene Leser ohne Aenderung
    weiterliest.

    `tournament_id` bleibt leer: Online-Turniere haben keine
    Labs-Nummer (siehe Kopf). `meta` kommt aus dem DATUM ueber
    dieselbe Funktion, die der Papier-Scraper benutzt — die
    Limitless-Formatzahl (`data-format`) laesst sich nicht auf
    "TEF-PBL" abbilden, ohne eine Zuordnung zu erfinden.
    """
    meta = _derive_meta_from_date_JH(turnier["datum"]) or ""
    ace = lade_ace_liste()
    zeilen = []
    for k in karten:
        zeilen.append({
            "tournament_id":           "",
            "limitless_tournament_id": turnier["id"],
            "tournament_name":         turnier["name"],
            "tournament_date":         turnier["datum"],
            "meta":                    meta,
            "place":                   standing["platz"],
            "player_name":             standing["spieler"],
            "deck_archetype":          standing["archetyp"],
            "deck_slug":               standing["slug"],
            "wins":                    standing["wins"],
            "losses":                  standing["losses"],
            "ties":                    standing["ties"],
            "card_name":               k["name"],
            "card_identifier":         f"{k['set_code']} {k['set_number']}".strip(),
            "set_code":                k["set_code"],
            "set_number":              k["set_number"],
            "count":                   k["count"],
            "type":                    k["type"],
            # Die STARKE Regel, nicht die zeilenlokale.
            #
            # `entscheide_zeile` sieht nur die eine Zeile: eine
            # ACE-SPEC-verdaechtige Karte, die in DIESER Liste einmal
            # steht, gilt ihr als ACE SPEC. `entscheide` bekommt den
            # ganzen Bestand dazu — jede Karte, die IRGENDWO mit mehr
            # als einem Exemplar gespielt wurde, kann keine sein.
            # PR #738 hat card_scraper_shared.py und limitless_dated.py
            # am 10.09.2026 umgestellt; diese Datei war uebersehen und
            # schrieb weiter nach der schwachen Regel in DIESELBE CSV.
            "is_ace_spec":             entscheide(k["name"], ace, *_belege(),
                                                  typ=k["type"]),
            "quelle":                  QUELLE_ONLINE,
            # Gemessen an `data-players` der Turnierliste, nicht
            # geschaetzt. 0 heisst: das Attribut fehlte — dann
            # bleibt die Spalte leer statt eine Null zu behaupten.
            "spielerzahl":             (str(turnier.get("spieler") or "")
                                        if (turnier.get("spieler") or 0) > 0
                                        else ""),
            # Der Druck kam von der Seite — anders kommt er hier gar
            # nicht heraus, `lies_deckliste` bricht sonst ab.
            "druck_quelle":            "seite",
            "scraped_at":              gestempelt,
        })
    return zeilen


# ─────────────────────────────────────────────────────────────────────
# 5. Der Schreibweg
# ─────────────────────────────────────────────────────────────────────

def _lies_bestand(pfad: str) -> tuple:
    """(Kopfzeile, Zeilen) der vorhandenen Datei; ([], []) wenn es sie
    nicht gibt."""
    if not os.path.exists(pfad):
        return [], []
    with open(pfad, newline="", encoding="utf-8") as f:
        rd = csv.DictReader(f)
        return list(rd.fieldnames or []), list(rd)


def _bestand(pfad: str):
    """Wie viele Datenzeilen stehen heute in der Zieldatei?

    `None` heisst: keine brauchbare Vorlage — die Datei fehlt oder ist
    leer. Dann greift der Riegel nicht; er soll den ERSTEN Lauf nicht
    verhindern, sondern einen Bestand schuetzen, den es gibt. Gleiche
    Bauart wie `_bestand` in scripts/scrape_pocket_tierlist.py.
    """
    try:
        _kopf, zeilen = _lies_bestand(pfad)
    except (OSError, csv.Error):
        return None
    return len(zeilen) or None


def _schluessel(z: dict) -> tuple:
    """Was ein neuer Lauf ersetzt: die Liste EINES Spielers bei EINEM
    Turnier — dieselbe Einheit wie `per_decklist_scraper._schluessel`.

    Nicht die einzelne Karte: ein Spieler fuehrt sehr wohl zwei Drucke
    desselben Namens, und beim Neulauf aendert sich der Druck, sodass
    eine Zeile mit Druck im Schluessel niemals ersetzt, sondern nur
    verdoppelt wuerde.
    """
    return (
        str(z.get("limitless_tournament_id", "") or ""),
        str(z.get("player_name", "") or ""),
        str(z.get("deck_slug", "") or ""),
    )


def _vereinige_kopf(kopf_alt: list, felder: list) -> list:
    """Kopfzeile aus beiden Spaltenmengen — KEINE geht verloren.

    Die Reihenfolge ist die von `per_decklist_scraper.CSV_FIELDS`; was
    nur in der vorhandenen Datei steht, haengt hinten an. Zwei Gruende
    fuer genau diese Richtung:

    * Sie ist die veroeffentlichte (data/_consumers.md,
      tests/python/test_schreiben_ersetzt_statt_anhaengt.py). Der
      Papier-Scraper schreibt die Datei bei abweichender Kopfzeile
      ohnehin in dieser Reihenfolge neu — beide Schreiber muessen
      dieselbe waehlen, sonst sortiert jeder Lauf die Datei um und der
      Verlauf besteht aus Umsortierungen.
    * Eine fremde Spalte trotzdem MITZUNEHMEN ist der eigentliche
      Schutz: `felder` allein zu nehmen wuerde sie stillschweigend
      loeschen.

    NICHT `felder` allein nehmen — dieselbe Falle, die am 06.09.2026 in
    per_decklist_scraper.py 21-Feld-Zeilen unter eine 20-Feld-Kopfzeile
    schrieb: `seite` landete in der Spalte `scraped_at`, alles dahinter
    war verschoben. Beim SCHREIBEN faellt das nicht auf, der Lauf meldet
    Erfolg.
    """
    return list(felder) + [f for f in kopf_alt if f not in felder]


def _schreibe_atomar(pfad: str, kopf: list, zeilen: list) -> None:
    """Erst daneben schreiben, dann umbenennen.

    `open(pfad, "w")` kuerzt die vorhandene Datei, BEVOR geschrieben
    wird. Ein Abbruch mitten im Schreiben — der Ablauf hat ein
    Zeitlimit — hinterliesse eine halbe CSV, und der Commit-Schritt
    committet sie.
    """
    os.makedirs(os.path.dirname(pfad) or ".", exist_ok=True)
    vorlaeufig = pfad + ".tmp"
    with open(vorlaeufig, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=kopf)
        w.writeheader()
        for z in zeilen:
            w.writerow({k: z.get(k, "") for k in kopf})
    os.replace(vorlaeufig, pfad)


def _herkunft_nachtragen(zeilen: list, kopf: list) -> int:
    """Vorhandene Zeilen ohne Herkunft bekommen `papier`.

    Sie stammen ausnahmslos aus per_decklist_scraper.py, also von
    limitlesstcg.com. Das ist kein Raten, sondern der Stand der Datei
    vor dem 07.09.2026: bis dahin gab es nur einen Schreiber.
    """
    if "quelle" not in kopf:
        return 0
    n = 0
    for z in zeilen:
        if not (z.get("quelle") or "").strip():
            z["quelle"] = QUELLE_PAPIER
            n += 1
    return n


def schreibe(neue: list, pfad: str, schrumpfen_erlauben: bool = False) -> int:
    """Neue Zeilen einpflegen und die Datei atomar neu schreiben.

    Rueckgabe: die Zahl der Zeilen in der geschriebenen Datei.
    Wirft `Teilausfall`, wenn der Riegel greift.
    """
    kopf_alt, bestand = _lies_bestand(pfad)
    felder = list(CSV_FIELDS)
    for z in neue:
        for k in z:
            if k not in felder:
                felder.append(k)
    kopf = _vereinige_kopf(kopf_alt, felder)

    nachgetragen = _herkunft_nachtragen(bestand, kopf)
    if nachgetragen:
        logger.info("Herkunft `%s` fuer %d vorhandene Zeile(n) nachgetragen",
                    QUELLE_PAPIER, nachgetragen)

    ersetzte = {_schluessel(z) for z in neue}
    ueberlebende = [z for z in bestand if _schluessel(z) not in ersetzte]
    ergebnis = ueberlebende + list(neue)

    # DER RIEGEL. Ein Lauf darf den Bestand nicht durch ein paar Zeilen
    # ersetzen. Gemessen wird gegen den BESTAND, nicht gegen den Lauf:
    # dass ein einzelner Lauf wenige Zeilen holt, ist normal (ein
    # Turnier), dass die Datei danach schrumpft, ist es nicht.
    vorher = len(bestand)
    if vorher and len(ergebnis) < vorher * SCHRUMPF_SCHWELLE:
        if schrumpfen_erlauben:
            print(f"::warning::{len(ergebnis)} Zeilen gegen {vorher} im Bestand — "
                  f"auf ausdrueckliche Anweisung trotzdem geschrieben.")
        else:
            raise Teilausfall(
                f"nach dem Lauf staenden nur noch {len(ergebnis)} Zeilen in der "
                f"Datei, im Bestand sind es {vorher}. Das ist kein Lauf, das ist "
                f"ein Einbruch — die vorhandene Datei bleibt stehen. Ist der "
                f"Einbruch gewollt, noch einmal mit --schrumpfen-erlauben.")

    _schreibe_atomar(pfad, kopf, ergebnis)
    return len(ergebnis)


# ─────────────────────────────────────────────────────────────────────
# 6. Der Lauf
# ─────────────────────────────────────────────────────────────────────

def _ausschnitt(pfad_liste: str, name: str) -> str:
    """Ein Geschwisterausschnitt neben der Turnierliste.

    `--aus-datei` bekommt die Turnierliste; Standings und Deckliste
    liegen im selben Verzeichnis unter festen Namen. Das ist eine PROBE
    DES ZUSAMMENBAUS, keine Datenlage: dieselben fuenf Standings und
    dieselbe Liste fuer jedes Turnier. Deshalb verlangt `--aus-datei`
    ein eigenes `--ausgabe` (siehe main) — Ausschnittsdaten haben in
    der echten Datei nichts verloren.
    """
    p = os.path.join(os.path.dirname(os.path.abspath(pfad_liste)), name)
    if not os.path.exists(p):
        raise Teilausfall(f"Ausschnittsdatei fehlt: {p}")
    with open(p, encoding="utf-8") as f:
        return f.read()


def sammle(turniere: list, pause: float, aus_datei: str = "",
           deckel: int = 0, card_db=None) -> list:
    """Ueber die Turniere laufen und alle Zeilen einsammeln.

    Gesammelt wird VOLLSTAENDIG, bevor irgendetwas geschrieben wird:
    ein Teilausfall auf Turnier drei soll nicht die Zeilen von Turnier
    eins und zwei in der Datei zuruecklassen.
    """
    gestempelt = datetime.now(timezone.utc).isoformat()
    alle = []
    gezaehlte_listen = 0
    for i, t in enumerate(turniere, 1):
        if aus_datei:
            std_html = _ausschnitt(aus_datei, "limitless_online_standings.html")
        else:
            std_html = hole(t["url"], pause)
        standings = lies_standings(std_html)
        if not standings:
            raise Teilausfall(
                f"Turnier {t['id']} ({t['name']}): keine Zeile mit "
                f"veroeffentlichter Liste — Aufbau der Standings geaendert?")
        logger.info("[%d/%d] %s — %d Liste(n) von %d Spieler(n)",
                    i, len(turniere), t["name"], len(standings), t["spieler"])
        _pruefe_ausbeute(t, standings)

        for s in standings:
            if deckel and gezaehlte_listen >= deckel:
                return alle
            if aus_datei:
                dl_html = _ausschnitt(aus_datei, "limitless_online_decklist.html")
            else:
                dl_html = hole(s["listen_url"], pause)
            karten = lies_deckliste(dl_html, card_db)
            alle.extend(baue_zeilen(t, s, karten, gestempelt))
            gezaehlte_listen += 1
    return alle


def _pruefe_ausbeute(turnier: dict, standings: list) -> None:
    """Meldet, wenn aus einem Turnier auffaellig wenige Listen kommen.

    WAS ICH HIER NICHT WEISS, UND WARUM DAS EINE WARNUNG IST UND KEIN
    ABBRUCH.

    Auf limitlesstcg.com muss man `?show=2000` anhaengen, sonst liefert
    die Standings-Seite nur die erste Seite — per_decklist_scraper.py
    tut das aus genau diesem Grund. Ob play.limitlesstcg.com ebenso
    blaettert, konnte ich nicht messen: der Bausandkasten kommt nicht
    hinaus (Egress-Proxy, 403), und der Ausschnitt in tests/fixtures/
    hat fuenf Zeilen. Eine Blaetter-Angabe zu ERFINDEN waere geraten.

    Also wird gemessen statt geraten: `data-players` sagt, wie gross
    das Feld war. Kommen daraus auffaellig wenige Listen, steht das im
    Protokoll des Laufs — und wer hinsieht, weiss sofort, wo er suchen
    muss.

    Kein Abbruch, weil eine niedrige Quote auch echt sein kann: nicht
    jeder Veranstalter veroeffentlicht alles. Bei "Rare Candy Club
    Showdown #43" waren es 253 von 253, das ist nicht das Gesetz.
    """
    feld = turnier.get("spieler") or 0
    if feld <= 0:
        return
    quote = len(standings) / feld
    if quote < 0.5:
        print(f"::warning::{turnier['name']}: nur {len(standings)} Liste(n) "
              f"aus einem Feld von {feld} ({quote:.0%}). Entweder "
              f"veroeffentlicht dieser Veranstalter wenig — oder die "
              f"Standings-Seite blaettert und wir sehen nur die erste "
              f"Seite. Nachsehen, bevor die Zahlen benutzt werden.")


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--format", default=FORMAT_AKTUELL,
                   help=f"Limitless-Formatzahl aus data-format (Vorgabe "
                        f"{FORMAT_AKTUELL} = laufendes Standard, Stand "
                        f"07.09.2026). 'alle' schaltet den Filter ab.")
    p.add_argument("--mindest-spieler", type=int, default=MINDEST_SPIELER,
                   dest="mindest_spieler",
                   help=f"Turniere mit weniger Teilnehmern ueberspringen "
                        f"(Vorgabe {MINDEST_SPIELER})")
    p.add_argument("--turniere", type=int, default=0,
                   help="hoechstens N Turniere holen (0 = alle gefundenen)")
    p.add_argument("--nur", type=int,
                   help="Probelauf ueber die ersten N Decklisten; schreibt NICHT")
    p.add_argument("--pause", type=float, default=DEFAULT_DELAY,
                   help=f"Sekunden zwischen zwei Abrufen (Vorgabe {DEFAULT_DELAY})")
    p.add_argument("--aus-datei", dest="aus_datei", default="",
                   help="Turnierliste aus einer Datei statt aus dem Netz; "
                        "Standings und Deckliste werden daneben erwartet")
    p.add_argument("--ausgabe", default="",
                   help=f"Zieldatei (Vorgabe data/{AUSGABE_DATEI})")
    p.add_argument("--trocken", action="store_true",
                   help="nichts schreiben, nur berichten")
    p.add_argument("--schrumpfen-erlauben", action="store_true",
                   dest="schrumpfen_erlauben",
                   help="deutlich weniger Zeilen als bisher trotzdem schreiben")
    p.add_argument("--nur-herkunft-nachtragen", action="store_true",
                   dest="nur_herkunft",
                   help="ohne Netz: der vorhandenen Datei die Spalte `quelle` "
                        "geben und alle Zeilen ohne Wert auf `papier` setzen. "
                        "Zielt ohne --ausgabe auf data/ im Repo, nicht auf "
                        "get_data_dir()")
    a = p.parse_args(argv)

    ziel = a.ausgabe or os.path.join(get_data_dir(), AUSGABE_DATEI)

    if a.nur_herkunft:
        return _lauf_herkunft(a.ausgabe or REPO_AUSGABE)

    # Ausschnittsdaten sind eine Probe des Zusammenbaus, keine Daten.
    # Sie duerfen die echte Datei nicht anfassen — auch nicht aus
    # Versehen, wenn jemand `--trocken` vergisst.
    if a.aus_datei and not a.ausgabe and not (a.trocken or a.nur):
        print("::error::--aus-datei liefert Ausschnittsdaten. Dazu gehoert ein "
              "eigenes --ausgabe (oder --trocken), damit nichts davon in "
              "data/tournament_decklists_per_player.csv landet.")
        return 1

    try:
        html = (open(a.aus_datei, encoding="utf-8").read() if a.aus_datei
                else hole(TURNIERLISTE_URL, a.pause))
        alle_turniere = lies_turnierliste(html)
        if not alle_turniere:
            raise Teilausfall("Turnierliste: keine Zeile gelesen — "
                              "Aufbau der Seite geaendert?")
        turniere = filtere_turniere(alle_turniere, a.format, a.mindest_spieler)
        print(f"Turnierliste: {len(alle_turniere)} gefunden, "
              f"{len(turniere)} nach Format={a.format} und "
              f"mindestens {a.mindest_spieler} Spielern")
        if not turniere:
            # Melden, welche Formatzahlen tatsaechlich dastanden. Ohne
            # das sieht ein veralteter Formatfilter aus wie eine leere
            # Quelle, und man sucht an der falschen Stelle.
            gesehen = sorted({t["format"] for t in alle_turniere})
            raise Teilausfall(
                f"kein Turnier passt auf Format={a.format} mit mindestens "
                f"{a.mindest_spieler} Spielern. Vorgefundene Formatzahlen: "
                f"{', '.join(gesehen) or '(keine)'}. Nach einer Rotation "
                f"aendert Limitless diese Zahl — --format nachziehen.")
        if a.turniere:
            turniere = turniere[:a.turniere]

        card_db = _karten_datenbank()
        zeilen = sammle(turniere, a.pause, a.aus_datei, a.nur or 0, card_db)
    except Teilausfall as e:
        print(f"::error::{e}")
        return 1

    listen = len({(z["limitless_tournament_id"], z["player_name"], z["deck_slug"])
                  for z in zeilen})
    # Gezaehlt wird, was WIRKLICH geholt wurde, nicht was geplant war.
    # `--nur` bricht mitten im ersten Turnier ab; "3 Listen in 3
    # Turnieren" waere dann schlicht falsch.
    geholt = len({z["limitless_tournament_id"] for z in zeilen})
    print(f"{len(zeilen)} Kartenzeilen aus {listen} Deckliste(n) "
          f"in {geholt} von {len(turniere)} Turnier(en)")

    if a.nur or a.trocken:
        print("Probelauf — es wird nichts geschrieben.")
        return 0
    if not zeilen:
        print("::error::keine Zeile eingesammelt — es wird nichts geschrieben.")
        return 1

    try:
        gesamt = schreibe(zeilen, ziel, a.schrumpfen_erlauben)
    except Teilausfall as e:
        print(f"::error::{e}")
        return 1
    print(f"geschrieben: {ziel} ({gesamt} Zeilen)")
    return 0


def _lauf_herkunft(ziel: str) -> int:
    """`--nur-herkunft-nachtragen`: die Spalte `quelle` in den Bestand."""
    kopf_alt, zeilen = _lies_bestand(ziel)
    if not zeilen:
        print(f"::error::{ziel} hat keine Zeilen — nichts nachzutragen.")
        return 1
    kopf = _vereinige_kopf(kopf_alt, list(CSV_FIELDS))
    n = _herkunft_nachtragen(zeilen, kopf)
    _schreibe_atomar(ziel, kopf, zeilen)
    print(f"{n} von {len(zeilen)} Zeile(n) auf quelle={QUELLE_PAPIER} gesetzt; "
          f"{len(kopf)} Spalten geschrieben.")
    return 0


def _karten_datenbank():
    """Die Kartendatenbank fuer den feinen Typ — oder None.

    Faellt sie aus, bleibt die Spalte `type` leer. Das ist der Zustand
    von vorher und macht nichts kaputt; ein Lauf daran scheitern zu
    lassen waere unverhaeltnismaessig.
    """
    try:
        from card_scraper_shared import CardDatabaseLookup
        return CardDatabaseLookup()
    except Exception as e:      # pragma: no cover - Umgebungsfrage
        logger.warning("Kartendatenbank nicht ladbar (%s) — Spalte `type` "
                       "bleibt leer", e)
        return None


if __name__ == "__main__":
    sys.exit(main())
