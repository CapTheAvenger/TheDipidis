#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Baut data/labs_tournament_*_verzeichnis.json aus dem, was in data/ LIEGT.

WARUM ES DIESES SKRIPT GIBT (01.09.2026)
----------------------------------------
Der Scraper schreibt das Verzeichnis selbst (`_schreibe_labs_verzeichnis`), und
an beiden Enden stand der Satz, es koenne "nicht veralten, ohne dass die
Dateien danebenliegen" — im Scraper und in js/app-tier-meta.js:1183.

Genau das ist eingetreten. Der Scraper laeuft im Wochenlauf gegen
`backend/core/data/`; die Ruecksicherung nach `data/` (weekly-full-update.yml)
kopiert per Glob nur `*.csv`. Das Verzeichnis blieb dadurch drueben liegen.

Messung 01.09.2026, nachdem Worlds San Francisco (774 Spieler) eingesammelt war:

    data/labs_tournament_decks_TEF-PBL.csv          44 Zeilen, geschrieben 01.09.
    data/labs_tournament_matchups_TEF-PBL.csv    1.776 Zeilen, geschrieben 01.09.
    data/labs_tournament_decks_verzeichnis.json   Stand 30.08., 12 Schluessel,
                                                  TEF-PBL NICHT dabei

`labsAuszugVorhanden()` fragt genau dieses Verzeichnis, bevor es laedt. Das
erste Praesenzturnier des laufenden Formats lag also im Repo und wurde von der
Tier-Liste nie angefasst — 26 der 44 Decks liegen ueber der 15-Partien-Schwelle,
und in einer Gegenprobe verschiebt ihre Aufnahme Tier 1 (Grimmsnarl Froslass
gegen Dragapult Dusknoir) und schichtet Tier 2/3 um.

DIE UMKEHRUNG
-------------
Das Verzeichnis wird jetzt aus `data/` gebaut, nicht aus dem Arbeitsordner des
Scrapers — aus demselben Ordner also, aus dem das Frontend liest. Damit kann es
nur noch falsch sein, wenn im selben Ordner die Dateien danebenliegen, und
`tests/python/test_labs_verzeichnis.py` prueft genau das bei jedem Lauf.

Aufruf im Wochenlauf nach der Ruecksicherung, vor dem Commit.
"""

import argparse
import csv
import glob
import json
import os
import sys
from datetime import datetime, timezone

WURZEL = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
DATA = os.path.join(WURZEL, "data")

PRAEFIXE = ("labs_tournament_decks", "labs_tournament_matchups")

HINWEIS = ("Welche Meta-Auszuege es gibt. Das Frontend fragt hier nach, statt jede "
           "Datei einzeln zu probieren — ein HEAD auf einen noch nicht existierenden "
           "Auszug hinterliess sonst eine 404 in der Konsole. Gebaut aus den Dateien "
           "in data/ (scripts/schreibe_labs_verzeichnis.py), also aus demselben "
           "Ordner, aus dem das Frontend liest.")


def schluessel_aus_ordner(ordner, praefix):
    """Die Meta-Schluessel, fuer die in `ordner` ein Auszug liegt.

    `_unsorted` ist kein Meta, sondern der Eimer fuer Zeilen ohne Meta-Wert —
    er darf nicht ins Verzeichnis, sonst fragt das Frontend danach.
    Eine Datei, die nur aus der Kopfzeile besteht, zaehlt ebenfalls nicht:
    ein leerer Auszug ist kein Auszug, und das Frontend wuerde ihn laden und
    eine leere Ansicht zeigen statt der ehrlichen "noch keine Daten".
    """
    raus = []
    for pfad in sorted(glob.glob(os.path.join(ordner, praefix + "_*.csv"))):
        rest = os.path.basename(pfad)[len(praefix) + 1:-4]
        if not rest or rest.startswith("_"):
            continue
        if _zeilen(pfad) < 1:
            continue
        raus.append(rest)
    return raus


def _zeilen(pfad):
    """Datenzeilen ohne Kopfzeile."""
    try:
        with open(pfad, "r", encoding="utf-8", newline="") as f:
            return max(0, sum(1 for _ in csv.reader(f)) - 1)
    except OSError:
        return 0


def baue(ordner=DATA, schreiben=True):
    ergebnis = {}
    for praefix in PRAEFIXE:
        schluessel = schluessel_aus_ordner(ordner, praefix)
        ziel = os.path.join(ordner, praefix + "_verzeichnis.json")
        alt = []
        if os.path.isfile(ziel):
            try:
                with open(ziel, "r", encoding="utf-8") as f:
                    alt = json.load(f).get("meta_keys", []) or []
            except (OSError, ValueError):
                alt = []
        ergebnis[praefix] = {"vorher": alt, "nachher": schluessel}
        if schreiben and alt != schluessel:
            with open(ziel, "w", encoding="utf-8") as f:
                json.dump({
                    "quelle": praefix,
                    "stand": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "meta_keys": schluessel,
                    "_hinweis": HINWEIS,
                }, f, ensure_ascii=False, indent=2)
                f.write("\n")
    return ergebnis


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--melden", action="store_true",
                   help="nur berichten, nichts schreiben")
    args = p.parse_args()

    ergebnis = baue(schreiben=not args.melden)
    drift = 0
    for praefix, stand in ergebnis.items():
        neu = [k for k in stand["nachher"] if k not in stand["vorher"]]
        weg = [k for k in stand["vorher"] if k not in stand["nachher"]]
        drift += len(neu) + len(weg)
        print("%s: %d Auszuege%s%s" % (
            praefix, len(stand["nachher"]),
            (" · neu: " + ", ".join(neu)) if neu else "",
            (" · entfallen: " + ", ".join(weg)) if weg else ""))
    if args.melden and drift:
        print("::warning::Labs-Verzeichnis haengt hinterher: %d Schluessel Unterschied. "
              "Das Frontend laedt einen vorhandenen Auszug dann nicht "
              "(js/app-tier-meta.js, labsAuszugVorhanden)." % drift)
    elif not args.melden and drift:
        print("  → %d Schluessel angeglichen." % drift)
    else:
        print("  → keine Drift.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
