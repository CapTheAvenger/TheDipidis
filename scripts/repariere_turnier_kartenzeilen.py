#!/usr/bin/env python3
"""Repariert zerrissene Kartenzeilen in den Turnier-Chunks.

BEFUND (gemessen 20./21.08.2026)
--------------------------------
In data/tournament_cards_data_cards_TEF-CRI.csv lagen 1.263 von 2.737
Zeilen (46,1 %) zerrissen vor, alle aus Turnier 540 (Special Event Turin).
Ein Python-Listen-Text war in die Zeile geraten:

    ...;12;4;3;<zerrissener Wert>;3;<zerrissener Wert>;ASC;;95;Common;
    Basic;<url>;<zerrissener Wert>

Betroffen sind genau drei Werte je Zeile:

    average_count            zerrissen   statt  4,0
    percentage_in_archetype  zerrissen   statt  100,0
    is_ace_spec              zerrissen   statt  No

Die Spaltenanzahl stimmt weiterhin (20 Felder), es verschiebt sich also
nichts — nur diese drei Werte sind unbrauchbar.

WAS DIESES SKRIPT TUT — UND WAS NICHT
-------------------------------------
Es RECHNET die beiden Zahlen aus den unversehrten Spalten derselben Zeile
neu, mit genau der Formel, die der Scraper benutzt
(backend/scrapers/tournament_scraper_JH.py:550 und :578):

    average_count           = round(total_count / deck_inclusion_count, 2)
    percentage_in_archetype = round(deck_inclusion_count / total_decks_in_archetype * 100, 2)

Das ist keine Schaetzung: alle drei Eingaben stehen unversehrt in
derselben Zeile, und die saubere Haelfte derselben Datei (Turnier 518,
NAIC) belegt die Formel Zeile fuer Zeile.

is_ace_spec wird NICHT geraten, sondern GELEERT. Gegen die 447.858
sauberen Zeilen aller Chunks gemessen weicht die kanonische Liste
data/ace_specs.json in 2,62 % der Faelle vom CSV-Wert ab — und zwar in
beide Richtungen ("Switch" steht dort als ACE SPEC, "Jamming Tower"
fehlt). Die Spalte ist also schon in den sauberen Zeilen unzuverlaessig;
das Frontend liest sie deshalb gar nicht, sondern ace_specs.json
(js/app-core.js:2396 ff.). Ein leeres Feld sagt "unbekannt" — das ist
wahr. Ein erfundenes "No" waere es nicht.

Das Skript schreibt nur, wenn danach _pruefe_kartenzeilen() zufrieden ist.

Aufruf:  python3 scripts/repariere_turnier_kartenzeilen.py [--schreiben]
Ohne --schreiben wird nur berichtet.
"""

import argparse
import csv
import glob
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")

_ZAHL_FORM = re.compile(r"^-?\d+(?:[.,]\d+)?$")
_ACE_ERLAUBT = ("Yes", "No", "True", "False", "1", "0")


def ist_zerrissen(zeile: dict) -> bool:
    for feld in ("average_count", "percentage_in_archetype"):
        wert = str(zeile.get(feld, ""))
        if wert and not _ZAHL_FORM.match(wert):
            return True
    ace = str(zeile.get("is_ace_spec", "")).strip()
    return bool(ace) and ace not in _ACE_ERLAUBT


def _ganz(wert) -> int:
    return int(str(wert).strip())


def repariere_zeile(zeile: dict) -> str:
    """Setzt die drei Werte neu. Gibt einen Grund zurueck, wenn es nicht geht."""
    try:
        gesamt = _ganz(zeile["total_count"])
        listen = _ganz(zeile["deck_inclusion_count"])
        decks = _ganz(zeile["total_decks_in_archetype"])
    except (KeyError, ValueError):
        return "Eingabespalten selbst unlesbar"
    if listen <= 0 or decks <= 0:
        return f"nicht nachrechenbar (deck_inclusion_count={listen}, total_decks={decks})"

    # Schreibweise wie im Scraper: round(...) und dann Punkt zu Komma.
    # str(round(1.0, 2)) ist "1.0", nicht "1.00" — die sauberen Zeilen
    # derselben Datei sehen genau so aus, und ein abweichendes Format
    # waere eine zweite, stille Aenderung.
    schnitt = round(gesamt / listen, 2)
    anteil = round(listen / decks * 100, 2)
    zeile["average_count"] = str(schnitt).replace(".", ",")
    zeile["percentage_in_archetype"] = str(anteil).replace(".", ",")
    # Bewusst leer statt geraten — siehe Kopf dieser Datei.
    zeile["is_ace_spec"] = ""
    return ""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--schreiben", action="store_true",
                    help="Dateien tatsaechlich aendern (sonst nur berichten)")
    args = ap.parse_args()

    gesamt_zerrissen = 0
    gesamt_repariert = 0
    probleme = []

    for pfad in sorted(glob.glob(os.path.join(DATA, "tournament_cards_data_cards*.csv"))):
        with open(pfad, "r", encoding="utf-8-sig", newline="") as f:
            leser = csv.DictReader(f, delimiter=";")
            felder = [(n or "").strip().rstrip(",").strip() for n in (leser.fieldnames or [])]
            zeilen = [dict(z) for z in leser]
        if not zeilen or "average_count" not in zeilen[0]:
            continue

        zerrissen = [z for z in zeilen if ist_zerrissen(z)]
        if not zerrissen:
            continue
        gesamt_zerrissen += len(zerrissen)
        name = os.path.basename(pfad)
        turniere = sorted({str(z.get("tournament_id", "?")) for z in zerrissen})
        print(f"{name}: {len(zerrissen)} von {len(zeilen)} Zeilen zerrissen "
              f"(Turnier {', '.join(turniere)})")

        repariert = 0
        for z in zerrissen:
            grund = repariere_zeile(z)
            if grund:
                probleme.append(f"{name}: {grund} — {z.get('card_name')}")
            else:
                repariert += 1
        gesamt_repariert += repariert
        print(f"  nachgerechnet: {repariert}, nicht reparierbar: {len(zerrissen) - repariert}")

        rest = [z for z in zeilen if ist_zerrissen(z)]
        if rest:
            probleme.append(f"{name}: {len(rest)} Zeilen bleiben zerrissen — nicht geschrieben")
            continue

        if args.schreiben:
            with open(pfad, "w", encoding="utf-8-sig", newline="") as f:
                schreiber = csv.DictWriter(f, fieldnames=felder, delimiter=";",
                                           extrasaction="ignore")
                schreiber.writeheader()
                for z in zeilen:
                    schreiber.writerow({k: z.get(k, "") for k in felder})
            print(f"  geschrieben: {pfad}")
        else:
            print("  (Probelauf — nichts geschrieben, --schreiben zum Anwenden)")

    print()
    print(f"Zerrissen gesamt: {gesamt_zerrissen} · nachgerechnet: {gesamt_repariert}")
    if probleme:
        print("Nicht behandelt:")
        for p in probleme[:20]:
            print("  -", p)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
