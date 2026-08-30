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
import json
import os
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
]

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
}


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


def inhalt_bis(datei, spalte):
    """Juengstes Datum IM Inhalt, als ISO-Tag. None, wenn nicht lesbar.

    Bewusst tolerant: findet die Spalte nicht statt, gibt es eben keine
    Angabe. Ein geratenes Inhaltsdatum waere derselbe Fehler wie das
    geratene Dateidatum, nur eine Ebene tiefer."""
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
                v = (r.get(spalte) or "").strip()[:10]
                if len(v) == 10 and v[4] == "-" and v[7] == "-":
                    werte.add(v)
        return max(werte) if werte else None
    except (OSError, ValueError, UnicodeDecodeError):
        return None


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
        if name in DATEIEN:
            treffer.add(name)
    return treffer


def aus_git():
    """Erstbestand aus dem vollen Verlauf. Braucht einen tiefen Clone."""
    stand = {}
    for f in DATEIEN:
        out = _git("log", "-1", "--format=%cI", "--", "data/" + f)
        if out and out.strip():
            stand[f] = out.strip()
    return stand


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
             if f in DATEIEN and os.path.exists(os.path.join(WURZEL, "data", f))}

    # Zweite Ebene: wie weit reicht der INHALT? Nur fuer die Dateien, die
    # ein eigenes Datum fuehren, und nur wenn es sich lesen laesst.
    inhalt = {}
    for f, spalte in INHALT_BIS.items():
        if f not in stand:
            continue
        bis = inhalt_bis(f, spalte)
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

    with open(ZIEL, "w", encoding="utf-8") as fh:
        json.dump({"erzeugt_am": jetzt, "quelle": quelle,
                   "dateien": stand, "inhalt_bis": inhalt, "leer": leer},
                  fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    if leer:
        print("ohne Datenzeilen: " + ", ".join(leer))

    print("data/data_stand.json: %d Staende" % len(stand))
    for f, d in sorted(stand.items()):
        zusatz = ("   Inhalt bis " + inhalt[f]) if f in inhalt else ""
        print("  %-38s %s%s" % (f, d, zusatz))
    return 0


if __name__ == "__main__":
    sys.exit(main())
