#!/usr/bin/env python3
"""Pflegt data/data_stand.json — wann welche Datendatei zuletzt neu geschrieben wurde.

WARUM ES DIESE DATEI GIBT

Bis zum 20.08.2026 zeigte jeder Frische-Chip der Seite den Tag des BESUCHS:

    localStorage.getItem('lastScraperUpdate') || new Date().toLocaleDateString()

Der linke Teil war immer leer — 'lastScraperUpdate' wird nirgends im Repo
geschrieben. Fuenf Reiter, deren Daten bis zu 19 Tage auseinanderliegen,
trugen dasselbe Datum, und das war das des Besuchers.

ZWEI WEGE, DIE NICHT TRAGEN

1. `Last-Modified` der Datei. GEMESSEN am 20.08.2026 gegen thedipidis.app:
   GitHub Pages setzt dort die DEPLOY-Zeit — fuer alle Dateien dieselbe
   (Thu, 20 Aug 2026 07:34), und bei city_league_archetypes.csv und
   city_league_analysis.csv gar keinen Kopf. Das haette das geratene Datum
   nur durch ein anderes ersetzt, das glaubwuerdiger aussieht.

2. `git log` im Deploy. Waere exakt, verlangt aber die volle Historie:
   .git ist 620 MB bei 2.962 Commits. Ein tiefer Clone bei jedem Deploy ist
   ein hoher Preis fuer ein Datum, und ein flacher Clone (die Vorgabe von
   actions/checkout) laesst `git log -1 -- datei` fuer JEDE Datei denselben
   Commit melden — derselbe Fehler in neuer Verpackung.

WIE ES STATTDESSEN LAEUFT

Der Stand wird dort festgehalten, wo er entsteht: im Wochenlauf, unmittelbar
bevor die neuen Daten committet werden. Geaenderte Dateien bekommen den
Zeitpunkt des Laufs, unveraenderte behalten ihren alten Eintrag. Damit
braucht es keine Historie — die Datei IST die Historie, fortgeschrieben.

Der Erstbestand wurde einmal aus dem vollen lokalen Verlauf erzeugt
(`--aus-git`), damit die Seite nicht bei null anfaengt.
"""

import argparse
import glob
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone

# Positivliste statt Glob ueber data/: 145 Zeitstempel auszuliefern, von denen
# ein Dutzend gelesen wird, waere Ballast — und ein Glob nimmt beim naechsten
# Scraper stillschweigend Dateien auf, die niemand anzeigt.
DATEIEN = [
    "limitless_online_decks.csv",
    "limitless_online_decks_matchups.csv",
    "online_tournament_top8_decks.csv",
    "limitless_meta_stats.json",
    "city_league_archetypes.csv",
    "city_league_analysis.csv",
    "city_league_analysis_past.csv",
    "city_league_archetypes_past.csv",
    "all_cards_database.csv",
    "price_data.csv",
    "labs_tournament_decks.csv",
    "champions_usage.json",
    # NACHTRAG (Abnahmerunde 30.08.2026): diese beiden werden von
    # js/app-city-league.js als aktuelle City-League-Quellen geladen
    # (Zeilen 566-568 und 1598-1600), standen aber nicht in dieser
    # Liste. Sie sind heute LEER — ohne Eintrag haette ein Chip, der
    # kuenftig auf sie zeigt, "hat Daten" gemeldet.
    "city_league_archetypes_comparison.csv",
    "city_league_archetypes_deck_stats.csv",
    # Die eigentliche Quelle des Reiters "Vergangene Turniere". Der
    # Frischechip dort zeigte bis heute auf city_league_analysis_past.csv
    # — eine Datei, die dieser Reiter gar nicht laedt.
    "tournament_cards_data_overview.csv",
    # NACHTRAG 07.09.2026: die ONLINE-Seite der Datengrundlage stand komplett
    # nicht in dieser Liste — vier Dateien ohne jedes Datum.
    #
    # limitless_online_fenster.csv traegt die AKTUELLSTE Zahl der ganzen Seite:
    # den Anteil im laufenden 14-Tage-Fenster (Differenz zweier gemessener
    # Kumulativstaende). Sie speist laut scripts/sanity_check_data.py 12-30 %
    # des prognostizierten Anteils im Meta Call. Ohne Eintrag hier hat
    # ausgerechnet die juengste Zahl der Seite kein Erhebungsdatum — und ein
    # Chip, der auf sie zeigte, muesste "unbekannt" sagen.
    #
    # Die drei uebrigen tragen die Kartenanalyse (Deck Analysis, Typical
    # Build) und die Matchup-Matrix des Meta Calls.
    "limitless_online_fenster.csv",
    "current_meta_card_data.csv",
    "online_tournament_dated_cards.csv",
    "labs_tournament_matchups.csv",
    # format_window.json entscheidet, WELCHES Format ueberhaupt gefiltert
    # wird. Sie aendert sich nur bei einer Rotation, bekommt hier also erst
    # dann einen Stand — bis dahin steht sie in "ohne_stand" (siehe unten),
    # damit die Luecke sichtbar ist statt still. Ihr genaues Alter nennt
    # scripts/data_guardian.py aus dem vollen Verlauf; dieser Lauf hier
    # arbeitet auf einem flachen Klon und koennte es nur raten.
    "format_window.json",
    # NACHTRAG 08.09.2026: die vier Dateien des Limitless-API-Laufs
    # (.github/workflows/limitless-api-scrape.yml). Sie tragen die erste
    # VOLLSTAENDIGE Online-Datenbasis dieses Projekts — jeden Spieler jedes
    # erfassten Turniers statt nur der erfolgreichen Listen. Genau deshalb
    # muessen sie hier stehen: eine Datei, aus der eine Prognose gerechnet
    # wird, ohne Erhebungsdatum, ist die teuerste Sorte Zahl.
    #
    # Alle vier fuehren ihr Turnierdatum je Zeile, also steht auch ihr
    # Inhaltsdatum unten in INHALT_BIS.
    # Karten und Matchups liegen je Formatfenster in eigenen Dateien
    # (online_api_cards_TEF-PBL.csv …). Ein Frischechip zeigt immer auf
    # ein Format, nie auf "alle" — deshalb werden sie unten per Glob
    # aufgenommen statt hier einzeln gefuehrt.
    "online_api_tournaments.csv",
    "online_api_archetypes.csv",
    # Die gerechnete Prognose. Sie traegt kein Turnierdatum je Zeile,
    # sondern ein Fenster in `_meta` — deshalb steht sie unten in
    # INHALT_AUS_NEBENDATEI und nicht in INHALT_BIS.
    "meta_prognose.json",
    # 09.09.2026 dazu: beide sind Grundlage sichtbarer Ansichten
    # (Deck Builder, Typical Build, Turnierbestand) und tragen ein
    # Turnierdatum je Zeile — siehe INHALT_BIS unten.
    "tournament_decklists_per_player.csv",
    "player_continuity.csv",
    # 09.09.2026 dazu: die drei Dateien der Champions-Nachtlaeufe. Sie
    # stehen in data/_consumers.md als oeffentliche Schnittstelle, waren
    # aber in keinem Datenstand gefuehrt — eine Datei, die niemand
    # datiert, kann beliebig alt werden, ohne dass es auffaellt.
    "champions_editionen.json",
    "pokemon_go_liste.json",
    "pokemon_go_shiny.json",
    "opgg_champions_moves.json",
    # Ebenso: die Nutzungsdaten selbst. Sie werden taeglich frisch
    # committet, standen hier aber nicht — data_stand.json wies deshalb
    # den 30.08. aus, waehrend der Reiter korrekt den 09.09. zeigte.
    "champions_usage.json",
]

# Dateien, die je Formatfenster aufgeteilt sind: mit jeder Rotation kommt
# eine dazu. Sie einzeln zu fuehren waere eine Pflegeaufgabe, die niemand
# macht — also werden sie beim Lauf eingesammelt.
DATEIEN_GLOB = (
    "online_api_cards_*.csv",
    "online_api_matchups_*.csv",
    # 09.09.2026 dazu: die Labs-Auszuege und die Turnierkarten je
    # Formatfenster. Das Frontend liest GENAU DIESE Auszuege (js/app-core.js
    # waehlt sie ueber format_window.json), nicht die Monolithen daneben —
    # und fuer sie stand bis heute kein Stand in der Datei. Sie rotieren
    # nach demselben Muster wie die API-Auszuege und gehoeren deshalb in
    # denselben Glob statt in eine Liste, die niemand pflegt.
    # labs_tournament_matchups_* bleibt bewusst draussen: die Bilanz ist
    # ueber mehrere Turniere aggregiert und fuehrt kein Turnierdatum je
    # Zeile. Sie waere nur mit "wann zuletzt geschaut" fuehrbar, und das
    # steht schon im Monolithen daneben.
    # tournament_cards_data_cards_* bleibt draussen: nur die Auszuege des
    # laufenden Fensters fuehren ueberhaupt ein tournament_date, die
    # aelteren nicht — sie wuerden die Liste "ohne Stand" fuellen, ohne
    # dass jemand etwas davon haette.
    "labs_tournament_decks_*.csv",
)


def gefuehrte_dateien():
    """DATEIEN plus die aktuell vorhandenen Chunkdateien.

    Wird bei JEDEM Aufruf neu ausgewertet: nach einer Rotation gibt es
    eine Datei mehr, und niemand soll sie von Hand nachtragen muessen.
    """
    heraus = list(DATEIEN)
    daten = os.path.join(WURZEL, "data")
    for muster in DATEIEN_GLOB:
        for treffer in sorted(glob.glob(os.path.join(daten, muster))):
            name = os.path.basename(treffer)
            if name not in heraus:
                heraus.append(name)
    return heraus

WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZIEL = os.path.join(WURZEL, "data", "data_stand.json")

# Dateien, die ihr eigenes Datum im INHALT tragen: {Datei: Spaltenname}.
#
# Warum das noetig ist — gemessen am 29.08.2026:
# labs_tournament_decks.csv wurde am 25.08. neu geschrieben, das juengste
# Turnier darin ist aber vom 12.06. — 74 Tage Abstand. Der Betreiber hat
# bestaetigt: Sommerpause, die Daten stimmen.
#
# Kein Chip zeigt diese Datei heute an, es war also kein sichtbarer Fehler.
# Aber ein Schreibdatum, das 74 Tage vor dem Inhalt liegt, ist genau die
# Sorte Zahl, die spaeter jemand fuer bare Muenze nimmt.
#
# Beides ist wahr und beides gehoert hin: wann zuletzt geschaut wurde, und
# wie weit der Inhalt reicht. Bei 78 Tagen Abstand ist die zweite Zahl die,
# nach der ein Head Judge fragt.
INHALT_BIS = {
    "labs_tournament_decks.csv": "tournament_date",
    "city_league_archetypes.csv": "date",
    "city_league_archetypes_past.csv": "date",
    # Dieselbe Frage fuer die Online-Turnierkarten: die Datei fuehrt je Zeile
    # das Turnierdatum, also laesst sich sagen, wie weit ihr Inhalt reicht.
    "online_tournament_dated_cards.csv": "tournament_date",
    # Der Limitless-API-Lauf schreibt inkrementell an: die Datei kann heute
    # geschrieben worden sein und trotzdem nur Turniere von letzter Woche
    # enthalten, wenn seither keines die Schwelle erreicht hat. Beide Zahlen
    # gehoeren hin.
    "online_api_tournaments.csv": "date",
    "online_api_archetypes.csv": "date",
    # 09.09.2026 dazu. Beide sind Grundlage sichtbarer Ansichten
    # (Deck Builder, Typical Build, Turnierbestand) und tragen ein
    # Turnierdatum je Zeile — es gab keinen Grund, sie auszulassen
    # ausser dem, dass sie niemand nachgetragen hat.
    "tournament_decklists_per_player.csv": "tournament_date",
    "player_continuity.csv": "tournament_date",
    # 10.09.2026 dazu. Beide Kartendateien der City League fuehren je
    # Zeile ein Turnierdatum; nur die Archetypdateien standen bisher hier.
    # Der Chip des Reiters "Deck-Analyse" zeigte deshalb ein Schreibdatum
    # ohne Gegenstueck.
    "city_league_analysis.csv": "tournament_date",
    "city_league_analysis_past.csv": "tournament_date",
}


def inhalt_bis_tabelle():
    """INHALT_BIS plus die Chunkdateien — die fuehren dieselbe Spalte."""
    heraus = dict(INHALT_BIS)
    for name in gefuehrte_dateien():
        if name.startswith(("online_api_cards_", "online_api_matchups_")):
            heraus[name] = "date"
        elif name.startswith("labs_tournament_decks_"):
            heraus[name] = "tournament_date"
    return heraus

# Dateien, deren Inhaltsdatum in einer NEBENDATEI steht statt in einer Spalte:
# {Datei: (Nebendatei, Feld)}.
#
# limitless_online_fenster.csv hat kein Datum je Zeile — das Fenster gilt fuer
# die ganze Datei und steht in ihrer Kopfzeile ("# Fenster 2026-08-22 bis
# 2026-09-06") sowie, maschinenlesbar, als "fenster_bis" in
# data/limitless_online_fenster_meta.json. Gelesen wird die JSON-Datei: eine
# Kommentarzeile zu zerlegen waere ein Parser mehr, der beim naechsten
# Textwechsel still falsch liegt.
INHALT_AUS_NEBENDATEI = {
    "limitless_online_fenster.csv": ("limitless_online_fenster_meta.json",
                                     "fenster_bis"),
}

# Dateien, deren Inhaltsdatum in einem VERSCHACHTELTEN Feld der Datei
# selbst steht: {Datei: (Schluesselkette,)}.
#
# meta_prognose.json hat kein Datum je Zeile — die Prognose gilt fuer ein
# Fenster, und dessen Ende steht in `_meta.online_bis`. Ohne diesen
# Eintrag traegt ausgerechnet die gerechnete Zahl kein Inhaltsdatum, und
# ein Leser koennte eine drei Wochen alte Prognose fuer aktuell halten.
INHALT_AUS_FELD = {
    "meta_prognose.json": ("_meta", "online_bis"),
}


def inhalt_aus_feld(datei, kette):
    """Liest ein verschachteltes Feld aus einer JSON-Datei."""
    pfad = os.path.join(WURZEL, "data", datei)
    try:
        with open(pfad, encoding="utf-8") as fh:
            wert = json.load(fh)
    except (OSError, ValueError):
        return ""
    for schluessel in kette:
        if not isinstance(wert, dict):
            return ""
        wert = wert.get(schluessel)
    return str(wert)[:10] if wert else ""


def inhalt_aus_nebendatei(nebendatei, feld):
    """ISO-Tag aus einem Feld einer JSON-Nebendatei. None, wenn nicht lesbar."""
    pfad = os.path.join(WURZEL, "data", nebendatei)
    try:
        with open(pfad, encoding="utf-8") as fh:
            wert = (json.load(fh) or {}).get(feld)
    except (OSError, ValueError):
        return None
    wert = str(wert or "").strip()[:10]
    if len(wert) == 10 and wert[4] == "-" and wert[7] == "-":
        return wert
    return None


def _ohne_datenzeilen(datei):
    """True, wenn die CSV ausser der Kopfzeile nichts enthaelt.

    Nur CSVs: eine JSON-Datei steht oft in einer einzigen Zeile, und die
    waere nach dieser Rechnung "nur eine Kopfzeile". Beim ersten Lauf hat
    das champions_usage.json faelschlich als leer gemeldet — die Datei
    ist 1,4 MB gross und fuehrt 168 Pokemon.
    """
    if not datei.lower().endswith(".csv"):
        return False
    pfad = os.path.join(WURZEL, "data", datei)
    try:
        with open(pfad, encoding="utf-8-sig", errors="replace", newline="") as fh:
            fh.readline()                      # Kopfzeile
            for zeile in fh:
                if zeile.strip():
                    return False
        return True
    except OSError:
        return False


# Datumsschreibweisen, die in den Datendateien wirklich vorkommen.
#
# GEMESSEN am 10.09.2026: city_league_archetypes_past.csv fuehrt in der
# Spalte `date` den einen Wert "6th June 2026". Der alte Leser nahm
# ausschliesslich ISO — er gab also fuer eine Datei, die HIER als
# Inhaltsquelle EINGETRAGEN war, still nichts zurueck. Ergebnis:
# data_stand.json trug fuer keine einzige City-League-Datei ein
# Inhaltsdatum, und der Frischechip haette dort das SCHREIBdatum
# (22.08.2026) neben Inhalt vom 06.06.2026 gestellt — 77 Tage Abstand,
# und die falsche der beiden Zahlen sichtbar.
#
# Die Regel stammt nicht von hier: backend/core/card_scraper_shared.py
# `parse_tournament_date` kennt genau diese beiden Schreibweisen, weil
# der Scraper sie von der Quelle uebernimmt. Sie steht hier nachgebaut
# statt importiert, damit der Deploy-Lauf nicht an der Scraper-Kette
# haengt; tests/python/test_datumsformate_datenstand.py haelt beide
# Umsetzungen aneinander.
def _als_iso_tag(roh):
    """Ein Datum aus einer Datenzeile als ISO-Tag, oder None."""
    v = (roh or "").strip()
    if not v:
        return None
    # 1. ISO, wie die meisten Dateien es fuehren.
    kurz = v[:10]
    if len(kurz) == 10 and kurz[4] == "-" and kurz[7] == "-":
        try:
            datetime.strptime(kurz, "%Y-%m-%d")
            return kurz
        except ValueError:
            return None
    # 2. "06 Jun 26"
    for muster in ("%d %b %y",):
        try:
            return datetime.strptime(v, muster).strftime("%Y-%m-%d")
        except ValueError:
            pass
    # 3. "6th June 2026" — die Ordnungszahl-Endung faellt weg.
    ohne = re.sub(r"(\d+)(st|nd|rd|th)", r"\1", v, flags=re.IGNORECASE).strip()
    try:
        return datetime.strptime(ohne, "%d %B %Y").strftime("%Y-%m-%d")
    except ValueError:
        return None


def inhalt_bis(datei, spalte):
    """Juengstes Datum IM Inhalt, als ISO-Tag. None, wenn nicht lesbar.

    Bewusst tolerant gegenueber einer FEHLENDEN Spalte: dann gibt es eben
    keine Angabe. NICHT tolerant gegenueber einer Spalte, die da ist und
    nur unlesbare Werte fuehrt — das meldet unlesbare_inhaltsspalten()
    unten, damit ein stiller Ausfall wie der vom 10.09.2026 nicht wieder
    monatelang unbemerkt bleibt.

    Ein geratenes Inhaltsdatum waere derselbe Fehler wie das geratene
    Dateidatum, nur eine Ebene tiefer."""
    pfad = os.path.join(WURZEL, "data", datei)
    if not os.path.exists(pfad):
        return None
    try:
        import csv as _csv
        with open(pfad, newline="", encoding="utf-8-sig") as fh:
            kopf = fh.readline()
            trenn = ";" if kopf.count(";") > kopf.count(",") else ","
            fh.seek(0)
            werte = set()
            for r in _csv.DictReader(fh, delimiter=trenn):
                iso = _als_iso_tag(r.get(spalte))
                if iso:
                    werte.add(iso)
        return max(werte) if werte else None
    except (OSError, ValueError, UnicodeDecodeError):
        return None


def unlesbare_inhaltsspalten(tabelle):
    """Dateien, deren Inhaltsspalte DA ist, aber kein lesbares Datum ergibt.

    Der Unterschied zaehlt: eine fehlende Spalte ist eine Aussage ueber
    die Datei, eine unlesbare Spalte ist ein Ausfall dieses Skripts. Bis
    zum 10.09.2026 sahen beide gleich aus — naemlich nach nichts."""
    heraus = []
    import csv as _csv
    for datei, spalte in sorted(tabelle.items()):
        pfad = os.path.join(WURZEL, "data", datei)
        if not os.path.exists(pfad):
            continue
        try:
            with open(pfad, newline="", encoding="utf-8-sig") as fh:
                kopf = fh.readline()
                trenn = ";" if kopf.count(";") > kopf.count(",") else ","
                fh.seek(0)
                leser = _csv.DictReader(fh, delimiter=trenn)
                if spalte not in (leser.fieldnames or []):
                    continue          # Spalte fehlt — kein Ausfall.
                belegt = unlesbar = 0
                beispiel = ""
                for r in leser:
                    roh = (r.get(spalte) or "").strip()
                    if not roh:
                        continue
                    belegt += 1
                    if not _als_iso_tag(roh):
                        unlesbar += 1
                        beispiel = beispiel or roh
        except (OSError, ValueError, UnicodeDecodeError):
            continue
        if belegt and unlesbar == belegt:
            heraus.append((datei, spalte, beispiel))
    return heraus


def _git(*args):
    try:
        out = subprocess.run(["git"] + list(args), cwd=WURZEL,
                             capture_output=True, text=True, timeout=60)
    except (OSError, subprocess.SubprocessError):
        return None
    return out.stdout if out.returncode == 0 else None


def bisher():
    if not os.path.exists(ZIEL):
        return {}
    try:
        with open(ZIEL, encoding="utf-8") as fh:
            return (json.load(fh) or {}).get("dateien", {}) or {}
    except (OSError, ValueError):
        return {}


def geaendert():
    """Welche der gefuehrten Dateien hat dieser Lauf angefasst?"""
    out = _git("status", "--porcelain", "--", "data/")
    if out is None:
        return set()
    treffer = set()
    for zeile in out.splitlines():
        pfad = zeile[3:].strip().strip('"')
        # Umbenennungen: "alt -> neu"
        if " -> " in pfad:
            pfad = pfad.split(" -> ", 1)[1]
        name = os.path.basename(pfad)
        if name in gefuehrte_dateien():
            treffer.add(name)
    return treffer


def aus_git():
    """Erstbestand aus dem vollen Verlauf. Braucht einen tiefen Clone."""
    stand = {}
    for f in gefuehrte_dateien():
        out = _git("log", "-1", "--format=%cI", "--", "data/" + f)
        if out and out.strip():
            stand[f] = out.strip()
    return stand


def _nur_stempel_neu(ziel, neu_stand):
    """True, wenn die vorhandene Datei bis auf `erzeugt_am` dasselbe sagt."""
    try:
        with open(ziel, encoding="utf-8") as fh:
            alt = json.load(fh)
    except (OSError, ValueError):
        return False
    if not isinstance(alt, dict):
        return False
    a = {k: v for k, v in alt.items() if k != "erzeugt_am"}
    n = {k: v for k, v in neu_stand.items() if k != "erzeugt_am"}
    return a == n


def main():
    p = argparse.ArgumentParser(description="Pflegt data/data_stand.json")
    p.add_argument("--aus-git", dest="aus_git_flag", action="store_true",
                   help="Erstbestand aus dem vollen Git-Verlauf erzeugen (tiefer Clone noetig)")
    args = p.parse_args()

    alt = bisher()
    jetzt = datetime.now(timezone.utc).isoformat(timespec="seconds")

    if args.aus_git_flag:
        neu = aus_git()
        if not neu:
            print("kein Git-Verlauf lesbar — nichts geschrieben", file=sys.stderr)
            return 1
        stand = dict(alt)
        stand.update(neu)
        quelle = "git log -1 --format=%cI je Datei (Erstbestand)"
    else:
        frisch = geaendert()
        stand = dict(alt)
        for f in frisch:
            stand[f] = jetzt
        quelle = "Zeitpunkt des Laufs fuer geaenderte Dateien, sonst fortgeschrieben"
        print("in diesem Lauf geaendert: "
              + (", ".join(sorted(frisch)) if frisch else "keine"))

    # Eintraege fuer Dateien, die es nicht mehr gibt, fallen weg — ein Stand
    # ohne Datei waere eine Angabe ueber nichts.
    stand = {f: d for f, d in stand.items()
             if f in gefuehrte_dateien()
             and os.path.exists(os.path.join(WURZEL, "data", f))}

    # Zweite Ebene: wie weit reicht der INHALT? Nur fuer die Dateien, die
    # ein eigenes Datum fuehren, und nur wenn es sich lesen laesst.
    inhalt = {}
    for f, kette in INHALT_AUS_FELD.items():
        if f not in stand:
            continue
        bis = inhalt_aus_feld(f, kette)
        if bis:
            inhalt[f] = bis

    for f, spalte in inhalt_bis_tabelle().items():
        if f not in stand:
            continue
        bis = inhalt_bis(f, spalte)
        if bis:
            inhalt[f] = bis
    for f, (nebendatei, feld) in INHALT_AUS_NEBENDATEI.items():
        if f not in stand or f in inhalt:
            continue
        bis = inhalt_aus_nebendatei(nebendatei, feld)
        if bis:
            inhalt[f] = bis

    # Dritte Ebene: hat die Datei ueberhaupt Zeilen?
    #
    # BEFUND (Schlussabnahme 30.08.2026): der Frische-Chip der City League
    # zeigte "Daten: 31.7.2026" — den Schreibzeitpunkt von
    # city_league_analysis.csv. Diese Datei hat aber 0 Datenzeilen (nur
    # die Kopfzeile), und die gezeigten Zahlen stammen aus
    # city_league_archetypes_past.csv vom 6. Juni. Daneben stand
    # "Verfuegbar: 6.6.2026" — zwei Daten, acht Wochen auseinander.
    #
    # Ein Datum an einer leeren Datei ist kein Stand, sondern der
    # Zeitpunkt, an dem zuletzt nichts hineingeschrieben wurde. Der Chip
    # soll das sagen koennen, also muss er es wissen.
    leer = sorted(f for f in stand if _ohne_datenzeilen(f))

    # Vierte Ebene: welche gefuehrte Datei hat GAR KEINEN Stand?
    #
    # Der Stand wird nur fortgeschrieben, wenn ein Lauf die Datei anfasst. Eine
    # neu in DATEIEN aufgenommene Datei hat also so lange keinen Eintrag, bis
    # sie sich das erste Mal aendert — und ohne diese Liste faellt sie einfach
    # aus der JSON heraus. Ein fehlender Schluessel und "diese Datei fuehren
    # wir, wissen aber noch nichts ueber sie" sehen fuer jeden Leser gleich
    # aus; das ist genau die Art stiller Luecke, gegen die diese Datei
    # geschrieben wurde. scripts/data_guardian.py (check_datenstand) meldet
    # daraus einen Befund, wenn die Datei bei jedem Lauf neu geschrieben wird.
    ohne_stand = sorted(f for f in gefuehrte_dateien()
                        if f not in stand
                        and os.path.exists(os.path.join(WURZEL, "data", f)))

    # Fuenfte Ebene: eine Inhaltsspalte, die DA ist und trotzdem nichts
    # hergibt. Das ist kein Zustand der Daten, sondern ein Ausfall dieses
    # Skripts — und bis zum 10.09.2026 war er von "Spalte fehlt eben"
    # nicht zu unterscheiden. Die Liste kommt in die Datei, damit ein
    # Leser (und der Waechter) sie sehen kann, und in die Ausgabe des
    # Laufs, damit sie beim naechsten Mal auffaellt.
    unlesbar = [{"datei": d, "spalte": sp, "beispiel": bsp}
                for d, sp, bsp in unlesbare_inhaltsspalten(inhalt_bis_tabelle())]

    neu_stand = {"erzeugt_am": jetzt, "quelle": quelle,
                 "dateien": stand, "inhalt_bis": inhalt, "leer": leer,
                 "ohne_stand": ohne_stand,
                 "inhaltsspalte_unlesbar": unlesbar}
    # WZ-24 (01.10.2026): aendert sich nur `erzeugt_am`, bleibt die Datei
    # unberuehrt. Sonst entsteht je Lauf ein Commit und ein Deploy fuer
    # nichts (30.09.: Spielerkontinuitaet de7e6f6, per-decklist 2ec1a77).
    # Den Zeitpunkt des Laufs tragen die Herzschlaege, nicht diese Datei.
    if not _nur_stempel_neu(ZIEL, neu_stand):
        with open(ZIEL, "w", encoding="utf-8") as fh:
            json.dump(neu_stand, fh, indent=2, ensure_ascii=False)
            fh.write("\n")
    if unlesbar:
        print("Inhaltsspalte vorhanden, aber kein Wert lesbar — das ist ein "
              "Ausfall dieses Skripts, keine Aussage ueber die Daten:")
        for e in unlesbar:
            print("  %s / %s   Beispiel: %r" % (e["datei"], e["spalte"], e["beispiel"]))
    if leer:
        print("ohne Datenzeilen: " + ", ".join(leer))
    if ohne_stand:
        print("noch ohne Stand (bekommen eins beim naechsten Lauf, der sie "
              "aendert): " + ", ".join(ohne_stand))

    print("data/data_stand.json: %d Staende" % len(stand))
    for f, d in sorted(stand.items()):
        zusatz = ("   Inhalt bis " + inhalt[f]) if f in inhalt else ""
        print("  %-38s %s%s" % (f, d, zusatz))
    return 0


if __name__ == "__main__":
    sys.exit(main())
