#!/usr/bin/env python3
"""Spiegelt die Pokémon-Champions-Icons von PokeWiki nach images/champions/.

WARUM ES DIESES SKRIPT GIBT

Bis zum 31.08.2026 kamen die Sprites der Champions-Ansichten von
r2.limitlesstcg.net. Zwei Probleme:

  1. Fuer NEUN Champions-eigene Mega-Formen liefert Limitless gar nichts
     (Glimmora, Scovillain, Raichu X, Raichu Y, Staraptor, Golurk,
     Crabominable, Meowstic, Chimecho). Sieben Schreibweisen und fuenf
     Verzeichnisse geprueft — die Bilder existieren dort nicht.
  2. Limitless liefert die Sprites der HAUPTREIHE in 35–41 px. Die Side
     Quest bildet aber Pokémon Champions nach, und PokeWiki fuehrt genau
     dafuer eigene Icons ("CMP") in 128 px.

PokeWiki hat alle 292. Der Betreiber hat entschieden, sie zu SPIEGELN
statt zu verlinken: das belastet kein ehrenamtliches Wiki mit jedem
Seitenaufruf, und eine Umbenennung dort kann uns die Bilder nicht mehr
still wegnehmen (der MediaWiki-Pfad haengt am Dateinamen, siehe unten).

RECHTLICHES, unverkuerzt: Die Icons stehen NICHT unter CC-BY-SA — das
gilt nur fuer den Wiki-Text. PokeWiki fuehrt sie als Bildzitat nach
§ 51 UrhG; Rechteinhaber ist The Pokémon Company / Nintendo / GAME FREAK.
PokeWiki kann daran nichts einraeumen, und dieses Skript behauptet das
auch nicht. Es haelt nur fest, woher jede Datei stammt, damit die
Herkunft nachvollziehbar bleibt.

WIE DIE ADRESSE ZUSTANDE KOMMT

MediaWiki legt Dateien unter /images/<h[0]>/<h[0:2]>/<Dateiname> ab,
wobei h der MD5 des Dateinamens ist. Der Pfad ist also BERECHENBAR —
keine Hash-Liste noetig, anders als bei pokebase, dessen Adressen
undurchsichtige Zufalls-IDs sind.

Der Dateiname folgt "Pokémon-Icon_<dex><form>_CMP.png". Das Formkuerzel
ist am 31.08.2026 fuer jeden einzelnen Eintrag im Browser geprueft
worden (Bild geladen = Datei existiert), nicht geraten:

  Grundform          ''      z. B. 887      (Dragapult)
  Mega               'm1'    z. B. 376m1    (Mega Metagross)
  Mega X / Mega Y    'm1'/'m2'   026m1/026m2
  eine Alternativform 'a'    z. B. 038a (Alola-Vulnona), 080a (Galar-Lahmus)

PokeWiki nummeriert Formen also DURCH und kodiert keine Region. Wo
mehrere Alternativformen existieren, entscheidet die Reihenfolge — und
die wird nicht geraten, sondern steht unten in FORM_UEBERSTEUERUNG, je
mit der Quelle, aus der sie belegt ist.

AUFRUF
  python3 scripts/build_champions_sprites.py            # nur Fehlendes
  python3 scripts/build_champions_sprites.py --force    # alles neu
  python3 scripts/build_champions_sprites.py --pruefen  # nichts laden,
                                                        # nur Bestand melden
"""

import argparse
import hashlib
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DEX_PATH = os.path.join(ROOT, "data", "champions_pokedex.json")
BILD_DIR = os.path.join(ROOT, "images", "champions")
MANIFEST = os.path.join(ROOT, "data", "champions_sprites.json")

WIKI = "https://www.pokewiki.de"
DATEI_MUSTER = "Pokémon-Icon_{key}_CMP.png"
UA = ("TheDipidis-Sprite-Mirror/1.0 (+https://thedipidis.app; "
      "einmaliger Abgleich, kein Dauerabruf)")
PAUSE_S = 0.35          # freundlich zum Wiki: gut drei Abrufe je Sekunde
ERWARTETE_KANTE = 128   # alle CMP-Icons sind 128x128

# ── Formkuerzel, die sich nicht aus der Regel ergeben ──────────────
#
# Jede Zeile ist einzeln belegt. Ohne Beleg gehoert hier nichts hinein:
# ein falsches Kuerzel liefert ein Bild, das laedt und trotzdem das
# falsche Pokémon zeigt — der teuerste Fehler, den diese Datei machen
# kann.
FORM_UEBERSTEUERUNG = {
    # pokewiki.de/Liste_der_Pokémon_in_Pokémon_Champions nennt die drei
    # Varianten namentlich; die Farben der Icons bestaetigen es
    # (a schlicht, b rote Hoerner, c blaue Hoerner).
    "Paldean Tauros (Combat Breed)": "128a",   # Gefechtvariante
    "Paldean Tauros (Blaze Breed)":  "128b",   # Flammenvariante
    "Paldean Tauros (Aqua Breed)":   "128c",   # Flutenvariante
    # pokewiki.de/Rotom/Sprites_und_3D-Modelle
    "Rotom (Heat)": "479a",                    # Hitze-Rotom
    "Rotom (Wash)": "479b",                    # Wasch-Rotom
    # pokewiki.de/Wolwerock/Sprites_und_3D-Modelle:
    # 745 Tagform, 745a Nachtform, 745b Zwielichtform
    "Lycanroc (Dusk)": "745b",
    # pokewiki.de/Floette: 670e = Ewigbluetler. Fuer Champions gibt es
    # dort NUR 670e und 670m1 — keine gewoehnliche Floette. Das deckt
    # sich mit der Werte-Korrektur in build_champions_pokedex.py.
    "Floette": "670e",
}

REGION_PRAEFIX = ("Alolan ", "Galarian ", "Hisuian ", "Paldean ")


def schluessel(e):
    """Pokédex-Eintrag -> PokeWiki-Formschluessel, z. B. '376m1'."""
    en = e["en"]
    if en in FORM_UEBERSTEUERUNG:
        return FORM_UEBERSTEUERUNG[en]
    dex = "%03d" % int(e["dex"])
    if en.startswith("Mega "):
        if en.endswith(" X"):
            return dex + "m1"
        if en.endswith(" Y"):
            return dex + "m2"
        return dex + "m1"
    if en.startswith(REGION_PRAEFIX):
        return dex + "a"
    if "(" in en:
        # Eine Klammerform ohne Eintrag oben waere geraten. Lieber laut
        # abbrechen als ein plausibles falsches Bild spiegeln.
        return None
    return dex


def datei_name(key):
    return DATEI_MUSTER.format(key=key)


def quelle(key):
    fn = datei_name(key)
    h = hashlib.md5(fn.encode("utf-8")).hexdigest()
    return f"{WIKI}/images/{h[0]}/{h[0:2]}/" + urllib.parse.quote(fn)


def lokal_name(en):
    """Stabiler eigener Dateiname — unabhaengig von fremden Slugs."""
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", en.lower())).strip("-")


def png_masse(b):
    """(Breite, Hoehe) aus dem IHDR, oder None wenn es kein PNG ist."""
    if len(b) < 24 or b[:8] != b"\x89PNG\r\n\x1a\n" or b[12:16] != b"IHDR":
        return None
    return (int.from_bytes(b[16:20], "big"), int.from_bytes(b[20:24], "big"))


def hole(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true",
                    help="auch bereits vorhandene Dateien neu laden")
    ap.add_argument("--pruefen", action="store_true",
                    help="nichts laden, nur Bestand und Zuordnung melden")
    args = ap.parse_args()

    with open(DEX_PATH, encoding="utf-8") as f:
        dex = json.load(f)
    eintraege = dex["entries"]

    os.makedirs(BILD_DIR, exist_ok=True)

    ohne_regel = [e["en"] for e in eintraege if schluessel(e) is None]
    if ohne_regel:
        print("FEHLER: fuer diese Eintraege gibt es keine belegte Formzuordnung.\n"
              "  Eintrag in FORM_UEBERSTEUERUNG ergaenzen — MIT Quelle:\n  "
              + "\n  ".join(ohne_regel), file=sys.stderr)
        return 1

    # Zwei Eintraege duerfen nie auf dieselbe Datei zeigen.
    belegt = {}
    for e in eintraege:
        k = schluessel(e)
        if k in belegt:
            print(f"FEHLER: {e['en']} und {belegt[k]} zeigen beide auf {k}",
                  file=sys.stderr)
            return 1
        belegt[k] = e["en"]

    manifest = {}
    neu = uebersprungen = 0
    fehler = []

    for e in eintraege:
        key = schluessel(e)
        lok = lokal_name(e["en"]) + ".png"
        pfad = os.path.join(BILD_DIR, lok)
        url = quelle(key)
        eintrag = {"datei": "images/champions/" + lok,
                   "formschluessel": key, "quelle": url}

        if os.path.exists(pfad) and not args.force:
            with open(pfad, "rb") as f:
                masse = png_masse(f.read(32))
            if masse:
                eintrag["breite"], eintrag["hoehe"] = masse
                eintrag["bytes"] = os.path.getsize(pfad)
                manifest[e["en"]] = eintrag
                uebersprungen += 1
                continue

        if args.pruefen:
            fehler.append(f"{e['en']}: Datei fehlt ({lok})")
            continue

        try:
            roh = hole(url)
        except Exception as ex:  # noqa: BLE001
            fehler.append(f"{e['en']}: Abruf fehlgeschlagen ({ex}) — {url}")
            time.sleep(PAUSE_S)
            continue

        masse = png_masse(roh)
        if not masse:
            fehler.append(f"{e['en']}: Antwort ist kein PNG ({len(roh)} Bytes) — {url}")
            time.sleep(PAUSE_S)
            continue
        if masse != (ERWARTETE_KANTE, ERWARTETE_KANTE):
            # Eine abweichende Groesse ist kein Weltuntergang, aber sie
            # gehoert gemeldet statt still uebernommen.
            print(f"WARN: {e['en']} ist {masse[0]}x{masse[1]}, erwartet "
                  f"{ERWARTETE_KANTE}x{ERWARTETE_KANTE}")

        with open(pfad, "wb") as f:
            f.write(roh)
        eintrag["breite"], eintrag["hoehe"] = masse
        eintrag["bytes"] = len(roh)
        manifest[e["en"]] = eintrag
        neu += 1
        time.sleep(PAUSE_S)

    if fehler:
        print("\nFEHLER bei %d Eintraegen:" % len(fehler), file=sys.stderr)
        for z in fehler:
            print("  " + z, file=sys.stderr)
        return 1

    gesamt = sum(v["bytes"] for v in manifest.values())
    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump({
            "_meta": {
                "zweck": "Pokémon-Champions-Icons, gespiegelt nach images/champions/. "
                         "Eine Zeile je Pokédex-Eintrag, mit der Adresse, aus der "
                         "die Datei stammt.",
                "quelle": WIKI + "/Liste_der_Pok%C3%A9mon_in_Pok%C3%A9mon_Champions",
                "rechte": "Die Icons sind Spiel-Screenshots. Rechteinhaber: "
                          "The Pokémon Company / Nintendo / GAME FREAK. PokeWiki "
                          "fuehrt sie als Bildzitat nach § 51 UrhG; die dortige "
                          "CC-BY-SA-Lizenz gilt nur fuer den Wiki-Text, nicht "
                          "fuer diese Bilder.",
                "erzeuger": "scripts/build_champions_sprites.py",
                "anzahl": len(manifest),
                "bytes": gesamt,
            },
            "sprites": manifest,
        }, f, ensure_ascii=False, indent=1)
        f.write("\n")

    print(f"{len(manifest)} Icons ({neu} neu geladen, {uebersprungen} schon da), "
          f"{gesamt/1024:.0f} KB gesamt")
    print(f"Manifest: {MANIFEST}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
