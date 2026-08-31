#!/usr/bin/env python3
"""Datenluecken-Inventar — was die Seite ueber sich selbst nicht weiss.

WARUM ES DAS GIBT
Die Seite benennt ihre Luecken bereits an Ort und Stelle: der Pokedex
schreibt "keine belegte Quelle" unter eine Mega-Form, der Datenausweis
schreibt "Schnappschuss fehlt". Das ist richtig — aber es ist verstreut.
Wer die Luecken SCHLIESSEN will, muss dafuer heute jede Ansicht einzeln
durchklicken.

Dieses Skript sammelt sie an einer Stelle: data/datenluecken.json, das
der Admin-Bereich (#admin) liest. Jede Luecke traegt, wo sie sitzt, was
fehlt, und — wenn es einen gibt — einen Vorschlag mit Quelle.

REGEL
Hier wird nichts repariert. Das Skript liest nur und meldet. Was
tatsaechlich in die Daten wandert, entscheidet der Betreiber im
Admin-Bereich; der Weg dorthin ist ein GitHub-Issue, kein stiller
Schreibzugriff.

Neue Pruefung hinzufuegen: eine Funktion schreiben, die eine Liste von
Luecken-Dicts zurueckgibt, und sie unten in PRUEFUNGEN eintragen.
"""
import json
import os
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")
OUT_PATH = os.path.join(DATA, "datenluecken.json")


def _lies(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)


# ── Pruefung 1: Mega-Faehigkeiten ohne Beleg ───────────────────────
def mega_faehigkeiten():
    dex = _lies("champions_pokedex.json")
    try:
        quellen = _lies("champions_mega_faehigkeiten.json").get("eintraege", {})
    except FileNotFoundError:
        quellen = {}
    luecken = []
    for e in dex["entries"]:
        if e.get("form") != "Mega" or (e.get("megaAbility") or "").strip():
            continue
        q = quellen.get(e["en"]) or {}
        vorschlag = None
        if (q.get("wert") or "").strip():
            vorschlag = {
                "wert": q["wert"],
                "quelle": "https://pokebase.app/pokemon-champions/pokemon/"
                          + (q.get("slug") or ""),
                "einstufung": q.get("einstufung") or "ungeprueft",
                "begruendung": q.get("begruendung") or "",
                "grundform": q.get("grundform") or "",
                "basisFaehigkeiten": q.get("basisFaehigkeiten") or [],
            }
        luecken.append({
            "id": "mega-faehigkeit/" + e["en"].lower().replace(" ", "-"),
            "klasse": "mega-faehigkeit",
            "titel": e["de"] + " — Mega-Fähigkeit fehlt",
            "titelEn": e["en"] + " — mega ability missing",
            "wo": "data/champions_pokedex.json → entries[en=%s].megaAbility" % e["en"],
            "ansicht": "side-quest",
            "vorschlag": vorschlag,
        })
    return luecken


# ── Pruefung 2: Pokedex-Eintraege ohne Nutzungsdatensatz ───────────
def nutzungsdaten():
    dex = _lies("champions_pokedex.json")
    luecken = []
    for e in dex["entries"]:
        if e.get("meta"):
            continue
        luecken.append({
            "id": "nutzungsdaten/" + e["en"].lower().replace(" ", "-"),
            "klasse": "nutzungsdaten",
            "titel": e["de"] + " — kein Nutzungsdatensatz",
            "titelEn": e["en"] + " — no usage record",
            "wo": "data/champions_usage.json → pokemon[%s]" % e["en"],
            "ansicht": "side-quest",
            "vorschlag": None,
        })
    return luecken


# ── Pruefung 3: deutsche Namen, die sich widersprechen ─────────────
#
# BEFUND (31.08.2026, beim Bau der Statusuebersicht): vier Dateien
# fuehren deutsche Namen. Die drei Referenzdateien tun es als
# `de_name`, champions_names_de.json als eigene Tabelle. An 63 Stellen
# sagen sie etwas anderes.
#
# Beide Seiten koennen falsch sein, und beide sind es stellenweise:
#   Sitrus Berry  Referenz "Prunusbeere"   Tabelle "Tsitrubeere"
#                 — Prunusbeere ist der Name der Lum Berry. Hier
#                   stehen zwei Beeren vertauscht, und zwar in der
#                   Referenz.
#   Throat Chop   Referenz "Knebelhieb"    Tabelle "Neck Strike"
#                 — hier steht ein ENGLISCHER Name im deutschen Feld,
#                   also ist diesmal die Referenz die richtige Seite.
#
# Deshalb wird hier kein Sieger ausgerufen. Die Luecke nennt beide
# Werte und verlinkt die Nachschlageseite; entschieden wird im
# Admin-Bereich, nicht hier.
NAMENSQUELLEN = [
    ("champions_moves_reference.json", "moves", "moves", "Attacke"),
    ("champions_items_reference.json", "items", "items", "Item"),
    ("champions_abilities_reference.json", "abilities", "abilities", "F\u00e4higkeit"),
]


def namenskonflikte():
    try:
        namen = _lies("champions_names_de.json")
    except FileNotFoundError:
        return []
    luecken = []
    for datei, schluessel, topf, art in NAMENSQUELLEN:
        try:
            block = _lies(datei)
        except FileNotFoundError:
            continue
        eintraege = block.get(schluessel, block)
        tabelle = namen.get(topf, {})
        for k, v in sorted(eintraege.items()):
            if k.startswith("_") or not isinstance(v, dict):
                continue
            a = (v.get("de_name") or "").strip()
            b = (tabelle.get(k) or "").strip()
            if not a or not b or a == b:
                continue
            luecken.append({
                "id": "namenskonflikt/" + k.lower().replace(" ", "-"),
                "klasse": "namenskonflikt",
                "titel": "%s %s \u2014 zwei deutsche Namen" % (art, k),
                "titelEn": "%s %s \u2014 two German names" % (art, k),
                "wo": "data/%s \u2192 %s.de_name  vs.  "
                      "data/champions_names_de.json \u2192 %s" % (datei, k, topf),
                "ansicht": "side-quest",
                "vorschlag": {
                    "wert": b,
                    "quelle": "https://pokewiki.de/" + b.replace(" ", "_"),
                    "einstufung": "mehrdeutig",
                    "begruendung": "Die Referenzdatei schreibt \u201e%s\u201c, die "
                                   "Namenstabelle \u201e%s\u201c. Welcher stimmt, "
                                   "entscheidet die Nachschlageseite." % (a, b),
                    "grundform": "",
                    "basisFaehigkeiten": [],
                },
            })
    return luecken


# ── Pruefung 4: benannte Bereiche, die es noch nicht gibt ──────────
#
# Anders als oben faellt das keiner Datei auf: eine Seite, die es nicht
# gibt, fehlt in keinem JSON. Sie steht deshalb hier von Hand — und
# verschwindet aus der Liste, sobald die Datei existiert, die sie
# speisen wuerde. Kein Haken, den man vergessen kann.
FEHLENDE_BEREICHE = [
    {
        "id": "bereich/statuszustaende",
        "klasse": "fehlender-bereich",
        "titel": "Statuszustände — Übersicht fehlt",
        "titelEn": "Status conditions — overview missing",
        "wo": "data/champions_statuszustaende.json (existiert nicht)",
        "ansicht": "side-quest",
        "datei": "champions_statuszustaende.json",
        "vorschlag": None,
        "notiz": "Paralyse, Schlaf, Verbrennung, Einfrieren, Vergiftung, "
                 "Verwirrung: was sie tun und mit welcher Wahrscheinlichkeit. "
                 "Steht heute nirgends — auch pokebase führt keine solche "
                 "Seite. Braucht eine zitierbare Regelquelle; "
                 "Champions-eigene Zahlen werden nicht aus dem Hauptspiel "
                 "übernommen, ohne dass das dabeisteht.",
    },
]


def fehlende_bereiche():
    return [b for b in FEHLENDE_BEREICHE
            if not os.path.exists(os.path.join(DATA, b.get("datei") or ""))]


PRUEFUNGEN = [mega_faehigkeiten, nutzungsdaten, namenskonflikte,
              fehlende_bereiche]

KLASSEN = {
    "mega-faehigkeit": {
        "de": "Mega-Fähigkeit ohne Beleg",
        "en": "Mega ability without a source",
    },
    "nutzungsdaten": {
        "de": "Kein Nutzungsdatensatz",
        "en": "No usage record",
    },
    "namenskonflikt": {
        "de": "Zwei deutsche Namen",
        "en": "Two German names",
    },
    "fehlender-bereich": {
        "de": "Bereich fehlt ganz",
        "en": "Whole area missing",
    },
}


def baue():
    luecken = []
    for pruefung in PRUEFUNGEN:
        luecken.extend(pruefung())
    luecken.sort(key=lambda x: (x["klasse"], x["id"]))
    zaehler = {}
    for l in luecken:
        zaehler[l["klasse"]] = zaehler.get(l["klasse"], 0) + 1
    return {
        "_meta": {
            "erzeugt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "erzeuger": "scripts/datenluecken.py",
            "anzahl": len(luecken),
            "jeKlasse": zaehler,
            "klassen": KLASSEN,
            "zweck": "Eingelesen vom Admin-Bereich (#admin). Nur Bestandsaufnahme — "
                     "dieses Skript aendert keine Daten.",
        },
        "luecken": luecken,
    }


def main():
    out = baue()
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print("Datenluecken: %d gesamt" % out["_meta"]["anzahl"])
    for k, n in sorted(out["_meta"]["jeKlasse"].items()):
        print("  %-20s %d" % (k, n))
    print("→ " + os.path.relpath(OUT_PATH, ROOT))


if __name__ == "__main__":
    main()
