#!/usr/bin/env python3
"""Setzt die Spalte `is_ace_spec` in den ausgelieferten CSVs auf Belegtes.

BEFUND (gemessen 30.08.2026, alle 21 Dateien mit dieser Spalte)
---------------------------------------------------------------
653.852 Zeilen, davon 30.027 mit "Yes". Gegen die kanonische Liste
data/ace_specs.json gemessen ist die Spalte in beide Richtungen falsch:

    12.734 Zeilen  "Yes", obwohl der Name nicht auf der Liste steht
                   ("Switch" 4.473x, "Jamming Tower" 3.306x,
                    "Roxanne" 1.121x, "Black Belt's Training" 906x,
                    "Colress's Experiment" 899x, "Eri" 779x, ...)
     4.221 Zeilen  "No", obwohl der Name eine ACE SPEC ist
                   ("Neo Upper Energy" 1.133x, "Legacy Energy" 1.097x,
                    "Unfair Stamp" 751x, "Enriching Energy" 500x, ...)
     4.492 Zeilen  "Yes" UND max_count > 1 — logisch unmoeglich, weil
                   eine ACE SPEC nur einmal im Deck liegen darf.

data/current_meta_card_data.csv traegt 0 von 3.311 Zeilen "Yes",
obwohl 184 Zeilen ACE SPECs sind.

URSACHE: die Erkennung im Scraper hing an `'ace spec' in v['type']`.
Diese Zeichenkette kommt in keinem type-Wert der heutigen Kartendatenbank
mehr vor (siehe backend/core/card_scraper_shared.py, Abschnitt ACE SPEC).
Dort ist der Abgleich gegen ace_specs.json inzwischen nachgeruestet — das
wirkt aber nur auf NEU erzeugte Zeilen. Dieses Skript raeumt den Bestand.

WAS DAS SKRIPT SCHREIBT — UND WAS NICHT
---------------------------------------
Es raet nicht. Jede Zeile bekommt genau einen von drei Werten, und jeder
haengt an einem Beleg:

    "Yes"   Der Name steht in data/ace_specs.json.
            Quelle: limitlesstcg.com/cards?q=is:ace, Stand 18.02.2026.

    "No"    Der Name wurde in diesen Daten selbst mit mehr als einer
            Kopie in einem Deck gefuehrt (max_count bzw. count > 1) —
            eine ACE SPEC kann das nicht sein, das verbietet die
            Deckregel, die auch das Frontend durchsetzt
            (js/i18n.js 'deck.aceSpecOnce').
            ODER: der Name tritt im gesamten Bestand ausschliesslich
            als Pokemon (Basic, Stage 1, Stage 2, VSTAR, VMAX,
            V-UNION) oder als Basis-Energie auf. ACE SPEC ist eine
            Eigenschaft von Trainer- und Spezial-Energie-Karten.

    ""      Alles andere: Trainer- oder Energiekarten, die nie mehrfach
            gespielt wurden und nicht auf der Liste stehen. Die Liste
            wird von Hand gepflegt und traegt den Stand vom 18.02.2026;
            ob seit Februar ACE SPECs dazugekommen sind, laesst sich im
            Repo nicht feststellen (data/ace_specs.json, Feld _hinweis).
            Ein leeres Feld sagt "unbekannt" — das ist wahr. Ein
            erfundenes "No" waere es nicht.

Das ist dieselbe Haltung wie in scripts/repariere_turnier_kartenzeilen.py
und dieselbe Regel wie in scripts/data_guardian.py: melden, nicht raten.

Gemessene Wirkung: 22.716 "Yes", 630.238 "No", 898 leer (58 Namen,
groesste Gruppe Supporter wie "Team Yell's Cheer" 348x — die sind
erkennbar keine ACE SPECs, aber die Daten beweisen es nicht).

WER DIE SPALTE LIEST
--------------------
Das Frontend nicht: es liest ace_specs.json (js/app-core.js isAceSpec),
weil die Spalte als unzuverlaessig bekannt war (js/app-city-league.js
Kommentar "CSV is_ace_spec is buggy"). Die Spalte lesen
scripts/generate-bot-deck-index.py (Zeile 287, vertraut "Yes" — dort
kommt das falsche "Switch" als ACE SPEC im Bot an) und alles, was ueber
data/_consumers.md an den Dateien haengt. Leer ist ein erlaubter Wert:
_pruefe_kartenzeilen() in backend/scrapers/tournament_scraper_JH.py
laesst ihn seit der TEF-CRI-Reparatur ausdruecklich durch.

SCHREIBWEISE
------------
Geaendert wird ausschliesslich das eine Feld, per Textausschnitt. Alle
uebrigen Bytes der Zeile — Trennzeichen, Anfuehrungszeichen,
Zeilenende, BOM — bleiben unangetastet. Nach dem Schreiben prueft das
Skript Datei fuer Datei nach, dass wirklich nur diese Spalte anders ist.

WARUM DAS SKRIPT AUCH IM WOCHENLAUF STEHT
-----------------------------------------
Am 01.09.2026 kam die Drift zurueck: der Scraper uebernahm is_ace_spec
aus der Stichprobenzeile und liess das Feld leer, wenn die Stichprobe
leer war. 7.790 unbelegte Felder, darunter Pokemon. Gemerkt hat es
niemand, bis tests/python/test_ace_spec_bestand.py im Deploy rot wurde —
und ein roter Deploy heisst: die ganze Seite bleibt auf dem alten Stand
stehen, wegen einer Spalte, die das Frontend nicht einmal liest.

Die Ursache ist seitdem behoben (backend/scrapers/tournament_scraper_JH.py).
Trotzdem laeuft dieses Skript jetzt im Wochenlauf mit — aber NUR
berichtend, mit --melden. Es schreibt dort nichts.

Das ist Absicht und folgt der Regel aus CLAUDE.md, "Report, don't
silently repair": faende der Lauf Drift, waere das ein Hinweis auf eine
NEUE Quelle unbelegter Zeilen. Die will man sehen, nicht stumm
ueberschreiben lassen. Die Meldung erscheint auf der Laufseite, bevor
der Deploy rot wird; geschrieben wird danach von Hand ueber den
Workflow "Daten reparieren".

Aufruf:  python3 scripts/repariere_ace_spec.py [--schreiben | --melden] [--streng]
Ohne Schalter wird nur berichtet.
  --melden   zusaetzlich eine ::warning::-Zeile je Datei mit Drift
             (fuer die Laufseite). Beendet sich trotzdem mit 0.
  --streng   beendet sich mit 1, wenn Drift gefunden wurde.
"""

import argparse
import collections
import glob
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")

sys.path.insert(0, ROOT)
# Die Regel selbst steht in backend/core/ace_spec_regel.py, damit der
# Scraper und diese Reparatur nicht auseinander laufen koennen.
from backend.core.ace_spec_regel import entscheide, lade_ace_liste  # noqa: E402

SPALTE = "is_ace_spec"

_ZEILEN = re.compile(r"[^\r\n]*(?:\r\n|\n|\r)?")


def zerlege_zeilen(text: str):
    """Zerlegt in Zeilen MIT Zeilenende. Anders als splitlines() teilt das
    nicht an \\x0b, \\x0c oder \\u2028 — die stehen in Kartennamen zwar
    nicht, aber eine Reparatur soll nicht an so etwas haengen."""
    aus = [m.group(0) for m in _ZEILEN.finditer(text)]
    return [z for z in aus if z != ""]


def felder(zeile: str, trenner: str):
    """(wert, anfang, ende) je Feld. Beachtet Anfuehrungszeichen."""
    aus = []
    i, n = 0, len(zeile)
    while True:
        start = i
        if i < n and zeile[i] == '"':
            i += 1
            while i < n:
                if zeile[i] == '"':
                    if i + 1 < n and zeile[i + 1] == '"':
                        i += 2
                        continue
                    i += 1
                    break
                i += 1
            while i < n and zeile[i] != trenner:
                i += 1
            roh = zeile[start:i]
            wert = (roh[1:-1].replace('""', '"')
                    if len(roh) >= 2 and roh[0] == '"' and roh[-1] == '"' else roh)
        else:
            while i < n and zeile[i] != trenner:
                i += 1
            wert = zeile[start:i]
        aus.append((wert, start, i))
        if i >= n:
            break
        i += 1
    return aus


def trennzeichen(kopf: str) -> str:
    return ";" if kopf.count(";") > kopf.count(",") else ","


def zahl(wert):
    try:
        return float(str(wert).strip().replace(",", "."))
    except (TypeError, ValueError):
        return None




def dateien_mit_spalte(ordner=None):
    ordner = ordner or DATA
    aus = []
    for pfad in sorted(glob.glob(os.path.join(ordner, "*.csv"))):
        with open(pfad, encoding="utf-8", newline="") as f:
            kopf = f.readline()
        if SPALTE in kopf:
            aus.append(pfad)
    return aus


def lies(pfad):
    """(kopfzeile_ohne_ende, trenner, spaltennamen, zeilen_mit_ende)"""
    with open(pfad, encoding="utf-8", newline="") as f:
        text = f.read()
    zeilen = zerlege_zeilen(text)
    if not zeilen:
        return "", ";", [], []
    kopf = zeilen[0].rstrip("\r\n").lstrip("﻿")
    tr = trennzeichen(kopf)
    namen = [w for w, _, _ in felder(kopf, tr)]
    return kopf, tr, namen, zeilen


def sammle_belege(dateien):
    """Zwei Mengen ueber Kartennamen (klein geschrieben), aus den Daten selbst:
    mehrfach  = irgendwo mit mehr als einer Kopie im Deck gefuehrt
    typen     = alle beobachteten type-Werte je Name
    """
    mehrfach = set()
    typen = collections.defaultdict(set)
    haeufig = collections.Counter()
    for pfad in dateien:
        _, tr, namen, zeilen = lies(pfad)
        if not zeilen:
            continue
        idx = {n: i for i, n in enumerate(namen)}
        i_name = idx.get("card_name")
        i_typ = idx.get("type")
        i_max = idx.get("max_count", idx.get("count"))
        if i_name is None:
            continue
        for zeile in zeilen[1:]:
            fs = felder(zeile.rstrip("\r\n"), tr)
            if len(fs) != len(namen):
                continue
            name = fs[i_name][0].strip().lower()
            if not name:
                continue
            haeufig[name] += 1
            if i_typ is not None:
                t = fs[i_typ][0].strip()
                if t:
                    typen[name].add(t)
            if i_max is not None:
                m = zahl(fs[i_max][0])
                if m is not None and m > 1:
                    mehrfach.add(name)
    return mehrfach, typen, haeufig




def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--schreiben", action="store_true",
                    help="Dateien tatsaechlich aendern (sonst nur berichten)")
    ap.add_argument("--melden", action="store_true",
                    help="Drift zusaetzlich als ::warning:: melden (Laufseite)")
    ap.add_argument("--streng", action="store_true",
                    help="mit 1 beenden, wenn Drift gefunden wurde")
    args = ap.parse_args()
    if args.schreiben and args.melden:
        print("::error::--schreiben und --melden schliessen sich aus: "
              "entweder raeumen oder berichten.")
        return 1

    ace = lade_ace_liste()
    dateien = dateien_mit_spalte()
    if not dateien:
        print("Keine CSV mit is_ace_spec gefunden.")
        return 1
    mehrfach, typen, haeufig = sammle_belege(dateien)
    print("Belege aus den Daten: %d Namen insgesamt, %d davon nachweislich "
          "mehrfach gespielt, %d Namen auf data/ace_specs.json."
          % (len(haeufig), len(mehrfach), len(ace)))

    gesamt = collections.Counter()
    offen = collections.Counter()
    for pfad in dateien:
        kopf, tr, namen, zeilen = lies(pfad)
        if not zeilen or SPALTE not in namen or "card_name" not in namen:
            continue
        i_ace = namen.index(SPALTE)
        i_name = namen.index("card_name")
        neu = [zeilen[0]]
        aenderungen = 0
        schief = 0
        zaehl = collections.Counter()
        for zeile in zeilen[1:]:
            ende_laenge = len(zeile) - len(zeile.rstrip("\r\n"))
            rumpf = zeile[:len(zeile) - ende_laenge] if ende_laenge else zeile
            ende = zeile[len(rumpf):]
            fs = felder(rumpf, tr)
            if len(fs) != len(namen):
                schief += 1
                neu.append(zeile)
                continue
            alt = fs[i_ace][0]
            wert = entscheide(fs[i_name][0], ace, mehrfach, typen)
            zaehl[wert or "(leer)"] += 1
            if wert == "":
                offen[fs[i_name][0].strip()] += 1
            if wert != alt:
                _, a, e = fs[i_ace]
                rumpf = rumpf[:a] + wert + rumpf[e:]
                aenderungen += 1
            neu.append(rumpf + ende)

        gesamt.update(zaehl)
        gesamt["geaendert"] += aenderungen
        gesamt["schief"] += schief
        print("  %-58s %6d Zeilen  geaendert %6d   Yes %5d  No %6d  leer %4d%s"
              % (os.path.basename(pfad), len(zeilen) - 1, aenderungen,
                 zaehl["Yes"], zaehl["No"], zaehl["(leer)"],
                 "   SPALTENZAHL SCHIEF: %d" % schief if schief else ""))

        if args.schreiben and aenderungen:
            text_neu = "".join(neu)
            with open(pfad, "w", encoding="utf-8", newline="") as f:
                f.write(text_neu)
            # Nachpruefung: nur diese eine Spalte darf sich unterscheiden.
            _, tr2, namen2, zeilen2 = lies(pfad)
            if namen2 != namen or len(zeilen2) != len(zeilen):
                print("::error::%s: Datei nach dem Schreiben anders geformt."
                      % pfad)
                return 2
            for a_z, n_z in zip(zeilen[1:], zeilen2[1:]):
                fa = [w for w, _, _ in felder(a_z.rstrip("\r\n"), tr)]
                fn = [w for w, _, _ in felder(n_z.rstrip("\r\n"), tr2)]
                if len(fa) != len(fn):
                    print("::error::%s: Feldzahl veraendert." % pfad)
                    return 2
                for k, (x, y) in enumerate(zip(fa, fn)):
                    if k != i_ace and x != y:
                        print("::error::%s: Spalte %r veraendert (%r -> %r)."
                              % (pfad, namen[k], x, y))
                        return 2

    print("\nGesamt: Yes %d, No %d, leer %d — %d Felder geaendert."
          % (gesamt["Yes"], gesamt["No"], gesamt["(leer)"], gesamt["geaendert"]))
    if gesamt["schief"]:
        print("Zeilen mit abweichender Spaltenzahl (unangetastet): %d"
              % gesamt["schief"])
    if offen:
        print("\nUnbelegt geblieben (leer) — %d Namen, %d Zeilen:"
              % (len(offen), sum(offen.values())))
        for name, anzahl in offen.most_common(15):
            print("   %6d  %s" % (anzahl, name))
        if len(offen) > 15:
            print("   ... und %d weitere Namen" % (len(offen) - 15))
    if not args.schreiben:
        print("\n(Nur berichtet. Mit --schreiben wird geaendert.)")

    # Drift = Felder, die anders belegt waeren als sie dastehen. Im
    # Schreibmodus sind sie soeben geraeumt worden und keine Meldung
    # mehr wert; im Berichtsmodus stehen sie noch in den Dateien.
    drift = 0 if args.schreiben else gesamt["geaendert"]
    if args.melden and drift:
        print("::warning::is_ace_spec driftet wieder: %d Felder in den "
              "ausgelieferten CSVs sind anders belegt als die Regel es "
              "vorgibt. Das deutet auf eine neue Quelle unbelegter Zeilen — "
              "nachsehen, dann den Workflow \"Daten reparieren\" mit "
              "schreiben=true ausloesen." % drift)
    elif args.melden:
        # "OK" allein liesse sich nicht von "OK, weil nichts geprueft wurde"
        # unterscheiden. Also immer die Zahl dazu.
        print("is_ace_spec: keine Drift — %d Dateien, %d Zeilen geprueft."
              % (len(dateien), gesamt["Yes"] + gesamt["No"] + gesamt["(leer)"]))
    if args.streng and drift:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
