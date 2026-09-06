#!/usr/bin/env python3
"""Fuellt die Spalte `type` in data/tournament_decklists_per_player.csv.

BEFUND (06.09.2026)
-------------------
30.459 von 30.459 Zeilen ohne Kartentyp. Ursache war der Extraktor
(`extract_cards_from_decklist_soup` in backend/core/card_scraper_shared.py
gab `type` gar nicht zurueck, waehrend per_decklist_scraper.py:555
verspricht, es kaeme von dort). Der Extraktor ist behoben — das wirkt
aber nur auf NEU geschriebene Zeilen.

WARUM NICHT EINFACH NEU SCRAPEN
-------------------------------
`per_decklist_scraper.py --resume` ueberspringt jedes Turnier, das schon
irgendeine Zeile hat — gemessen 515 von 518. Ein Neuaufbau hiesse also
`--resume` weglassen und 518 Turniere erneut von limitlesstcg.com holen.
CLAUDE.md, "External sources & rate limits", ist an der Stelle eindeutig:
*never re-fetch data you already have*. Genau dafuer holt auch der
Prize-Pack-Bau nur neue Serien.

Der Typ steht ohnehin lokal: data/all_cards_database.csv fuehrt ihn je
Druck. Es wird also nichts geholt und nichts geraten — es wird
verknuepft, und zwar ueber (set, number), wie CLAUDE.md es unter
"Data rules" verlangt (*Never join card data by name.* Namen sind
innerhalb eines Sets nicht eindeutig).

WAS DAS SKRIPT SCHREIBT — UND WAS NICHT
---------------------------------------
Nur die Spalte `type`, nur dort, wo sie leer ist, und nur wenn der Druck
in der Kartendatenbank steht. Ein Druck ohne Eintrag bleibt leer und
wird gezaehlt. `is_ace_spec` wird NICHT angefasst: der Bestand dort
stammt aus scripts/repariere_ace_spec.py, das die strengere
bestandsweite Regel benutzt. Dieses Skript macht jene Regel nur besser
anwendbar — `entscheide(name, ace, mehrfach, typen)` bekommt dann echte
Typen statt leerer Zeichenketten.

Vorbild fuer Aufbau und Ton: scripts/repariere_ace_spec.py.

Aufruf:  python3 scripts/fuelle_kartentyp.py [--schreiben]
         ohne --schreiben wird nur berichtet.
"""

import argparse
import csv
import os
import sys

WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(WURZEL, "backend", "core"))

ZIEL = os.path.join(WURZEL, "data", "tournament_decklists_per_player.csv")


def _kartendatenbank():
    import card_scraper_shared as css
    css.get_data_dir = lambda: os.path.join(WURZEL, "data")
    return css.CardDatabaseLookup()


def lauf(pfad: str, schreiben: bool) -> int:
    if not os.path.exists(pfad):
        print(f"::error::{pfad} fehlt")
        return 1
    db = _kartendatenbank()
    if not db.nach_druck:
        print("::error::Kartendatenbank leer — ohne sie waere jede Fuellung "
              "geraten. Nichts geaendert.")
        return 1

    with open(pfad, encoding="utf-8-sig", newline="") as f:
        leser = csv.DictReader(f)
        spalten = list(leser.fieldnames or [])
        zeilen = list(leser)

    if "type" not in spalten:
        print("::error::Die Spalte `type` gibt es in dieser Datei nicht. "
              "Eine anzulegen waere eine Schemaaenderung, keine Fuellung.")
        return 1

    gefuellt = 0
    ohne_druck = 0
    schon_da = 0
    ungeloest = {}
    for r in zeilen:
        if (r.get("type") or "").strip():
            schon_da += 1
            continue
        sc = (r.get("set_code") or "").strip()
        sn = (r.get("set_number") or "").strip()
        typ = db.typ_von_druck(sc, sn) if (sc and sn) else ""
        if typ:
            r["type"] = typ
            gefuellt += 1
        else:
            ohne_druck += 1
            schluessel = f"{sc}-{sn}" if (sc or sn) else "(ohne Druckangabe)"
            ungeloest[schluessel] = ungeloest.get(schluessel, 0) + 1

    print(f"{len(zeilen)} Zeilen — {gefuellt} gefuellt, {schon_da} hatten "
          f"schon einen Typ, {ohne_druck} ohne Eintrag in der "
          f"Kartendatenbank")
    if ungeloest:
        oben = sorted(ungeloest.items(), key=lambda kv: -kv[1])[:10]
        print("::warning::Nicht aufloesbare Drucke (bleiben leer, damit der "
              "Rueckfall im Frontend greift): "
              + ", ".join(f"{k} ({n}x)" for k, n in oben))

    if not schreiben:
        print("\n(Nur berichtet. Mit --schreiben wird geaendert.)")
        return 0
    if not gefuellt:
        print("Nichts zu schreiben.")
        return 0

    tmp = pfad + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=spalten, extrasaction="ignore")
        w.writeheader()
        for r in zeilen:
            w.writerow(r)
    os.replace(tmp, pfad)
    print(f"Geschrieben: {pfad}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--schreiben", action="store_true",
                    help="Aenderungen wirklich in die Datei schreiben.")
    ap.add_argument("--datei", default=ZIEL)
    args = ap.parse_args()
    return lauf(args.datei, args.schreiben)


if __name__ == "__main__":
    sys.exit(main())
