#!/usr/bin/env python3
"""Spiegelt die Gegenstands-Icons von PokeAPI nach images/champions-items/.

WARUM ES DIESES SKRIPT GIBT

Bestellt am 16.09.2026 vom Betreiber:

    "koennen wir bei den items auch noch den Champions sprite anzeigen.
     WEil mir sagt nicht automatisch jeder Name was aber die Optik schon"

Er hat recht: die Item-Auswahl im Schadensrechner listet bis zu neunzehn
Namen untereinander ("Chople Berry - Rospelbeere (44,3 %)"). Wer die
Beere im Spiel schon gesehen hat, erkennt sie am Bild sofort und am
Namen erst nach dem Lesen.

WOHER DIE BILDER KOMMEN — UND WARUM NICHT VON POKEWIKI

Der Betreiber hat pokewiki.de/Rospelbeere verlinkt. PokeWiki hat die
Bilder, aber:

  1. Die Pokemon-Icons liegen dort unter einem BERECHENBAREN Pfad
     (MD5 des Dateinamens, siehe build_champions_sprites.py). Fuer
     Gegenstaende gibt es keinen solchen Namensschluessel: der
     Dateiname haengt am deutschen Namen und an der Spielgeneration
     ("Itemsprite_Rospelbeere_KAPU.png" gegen "...(8).png" gegen
     "...HOME.png"). Das waere geraten, nicht berechnet.
  2. Fuer 24 der benutzten Gegenstaende gibt es gar keinen deutschen
     Namen (Champions-eigene Mega-Steine) — der PokeWiki-Pfad haengt
     aber genau daran.

PokeAPI/sprites fuehrt die Icons unter dem ENGLISCHEN Bezeichner, und
den liefert dieselbe PokeAPI-Tabelle, aus der der Namensbauer schon die
deutschen Namen zieht (data/v2/csv/items.csv). Die Zuordnung Name ->
Datei ist damit NACHGESCHLAGEN, nicht geraten.

RECHTLICHES, unverkuerzt: die Icons sind Werke von The Pokemon Company /
Nintendo / GAME FREAK. PokeAPI stellt sie als Fansammlung bereit und
kann daran nichts einraeumen; dieses Skript behauptet das auch nicht. Es
haelt nur fest, woher jede Datei stammt, damit die Herkunft
nachvollziehbar bleibt. Gespiegelt wird aus demselben Grund wie bei den
Pokemon-Icons: kein fremder Server traegt unsere Seitenaufrufe, und eine
Umbenennung dort kann uns die Bilder nicht mehr still wegnehmen.

WAS GESPIEGELT WIRD

Die Vereinigung aus
  * allen Gegenstaenden, die data/champions_usage.json wirklich fuehrt
    (das ist die Liste, die der Rechner zur Auswahl stellt), und
  * allen Gegenstaenden aus data/champions_resources.json mit
    champ=true (die Serebii-Liste der in Champions verfuegbaren).

WAS NICHT GESPIEGELT WIRD — UND WARUM DAS SO BLEIBT

Champions erfindet Mega-Steine, die es in keinem Hauptreihenspiel gibt
(Staraptite, Glimmoranite, Raichunite X/Y ...). Fuer die hat PokeAPI
kein Bild, und es wird auch keins ersetzt: ein fremder Mega-Stein als
Platzhalter waere ein Bild, das etwas anderes behauptet, als es zeigt.
Sie stehen mit Namen in _meta.ohne_sprite der Manifestdatei, und
tests/python/test_champions_item_sprites.py prueft diese Liste in BEIDE
Richtungen — ein Name darin darf keine Datei haben, eine Datei darf
nicht darin stehen.

AUFRUF
  python3 scripts/build_champions_item_sprites.py            # nur Fehlendes
  python3 scripts/build_champions_item_sprites.py --force    # alles neu
  python3 scripts/build_champions_item_sprites.py --pruefen  # nur berichten
"""

import argparse
import csv
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
BILDER = os.path.join(ROOT, "images", "champions-items")

CSV_BASE = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv"
SPRITE_BASE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items"
MANIFEST = os.path.join(DATA, "champions_item_sprites.json")
UA = {"User-Agent": "TheDipidisChampionsBot/1.0 (+https://thedipidis.app)"}

LANG_EN = 9


def apostroph(s):
    """Typografischer Apostroph -> gerader.

    PokeAPI schreibt "King’s Rock", unsere Nutzungsdaten "King's Rock".
    Genau daran ist am 15.09.2026 schon "Forest's Curse" durch jede
    automatische Quelle gefallen; ohne diese Zeile faellt "King's Rock"
    hier durch dieselbe Ritze und landet faelschlich in ohne_sprite.
    """
    return str(s or "").replace("’", "'").replace("ʼ", "'")


def hole(url, binaer=False):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        roh = r.read()
    return roh if binaer else roh.decode("utf-8")


def csv_lesen(name):
    return list(csv.DictReader(io.StringIO(hole(f"{CSV_BASE}/{name}.csv"))))


def en_nach_bezeichner():
    """Englischer Gegenstandsname -> PokeAPI-Bezeichner (Dateiname ohne .png).

    Die Zuordnung kommt aus den beiden PokeAPI-Tabellen, nicht aus einer
    Umformung des Namens: "King's Rock" heisst dort "kings-rock",
    "Bright Powder" heisst "bright-powder" — beides liesse sich raten,
    aber nicht jedes. Nachschlagen kostet eine Zeile mehr und kann nicht
    danebenliegen.
    """
    bez = {r["id"]: r["identifier"] for r in csv_lesen("items")}
    raus = {}
    for r in csv_lesen("item_names"):
        if int(r["local_language_id"]) != LANG_EN:
            continue
        b = bez.get(r["item_id"])
        if b:
            raus[apostroph(r["name"])] = b
    return raus


def gewuenschte_gegenstaende():
    """Die Namen, fuer die die Oberflaeche ein Bild zeigen kann."""
    namen = set()
    pfad = os.path.join(DATA, "champions_usage.json")
    with open(pfad, encoding="utf-8") as f:
        for _k, v in (json.load(f).get("pokemon") or {}).items():
            for modus in ("doubles", "singles"):
                for it in ((v.get(modus) or {}).get("held_item") or []):
                    n = str((it or {}).get("name") or "").strip()
                    if n:
                        namen.add(n)
    pfad = os.path.join(DATA, "champions_resources.json")
    try:
        with open(pfad, encoding="utf-8") as f:
            for e in json.load(f).get("entries", []):
                if e.get("cat") == "item" and e.get("champ") and e.get("en"):
                    namen.add(e["en"])
    except Exception as e:  # noqa: BLE001
        print(f"WARN: champions_resources.json nicht lesbar ({e})", file=sys.stderr)
    return sorted(namen)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--force", action="store_true",
                   help="auch vorhandene Dateien neu laden")
    p.add_argument("--pruefen", action="store_true",
                   help="nichts laden, nur den Bestand melden")
    args = p.parse_args()

    namen = gewuenschte_gegenstaende()
    print(f"{len(namen)} Gegenstaende aus Nutzungsdaten + Serebii-Liste")

    if args.pruefen:
        da = {f for f in os.listdir(BILDER)} if os.path.isdir(BILDER) else set()
        print(f"images/champions-items/: {len(da)} Dateien")
        return 0

    bezeichner = en_nach_bezeichner()
    print(f"PokeAPI-Tabelle: {len(bezeichner)} englische Gegenstandsnamen")

    os.makedirs(BILDER, exist_ok=True)
    sprites, ohne = {}, []
    geladen = vorhanden = 0
    for n in namen:
        b = bezeichner.get(apostroph(n))
        if not b:
            ohne.append(n)
            continue
        ziel = os.path.join(BILDER, f"{b}.png")
        if os.path.exists(ziel) and not args.force:
            sprites[n] = f"{b}.png"
            vorhanden += 1
            continue
        try:
            roh = hole(f"{SPRITE_BASE}/{b}.png", binaer=True)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                ohne.append(n)
                continue
            raise
        if not roh.startswith(b"\x89PNG"):
            print(f"WARN: {n} -> {b}.png ist kein PNG, uebersprungen", file=sys.stderr)
            ohne.append(n)
            continue
        with open(ziel, "wb") as f:
            f.write(roh)
        sprites[n] = f"{b}.png"
        geladen += 1
        time.sleep(0.05)

    # Alphabetisch, damit ein Neubau ohne Aenderung auch einen leeren
    # Git-Unterschied ergibt.
    manifest = {
        "_meta": {
            "beschreibung": "Gegenstands-Icons fuer die Champions-Flaechen. "
                            "Schluessel ist der englische Gegenstandsname, "
                            "Wert der Dateiname unter images/champions-items/.",
            "quelle": SPRITE_BASE,
            "zuordnung": f"{CSV_BASE}/items.csv + item_names.csv (local_language_id 9)",
            "rechte": "The Pokemon Company / Nintendo / GAME FREAK. PokeAPI "
                      "stellt die Icons als Fansammlung bereit und kann daran "
                      "nichts einraeumen.",
            "anzahl": len(sprites),
            "ohne_sprite": sorted(ohne),
            "ohne_sprite_grund": "Champions-eigene Gegenstaende (fast durchweg "
                                 "Mega-Steine), die es in keinem Hauptreihenspiel "
                                 "gibt. Es wird KEIN Ersatzbild gesetzt.",
        },
        "sprites": {k: sprites[k] for k in sorted(sprites)},
    }
    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"{geladen} geladen, {vorhanden} schon da, {len(ohne)} ohne Bild")
    print(f"Wrote {MANIFEST} — {len(sprites)} Zuordnungen")
    return 0


if __name__ == "__main__":
    sys.exit(main())
