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
import re
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
#
# BLINDER FLECK, benannt am 03.09.2026: `if not a or not b: continue`
# ueberspringt jeden Namen, den nur EINE Seite fuehrt. Genau davon gab
# es 23 — Namen, die nur in einer Referenzdatei standen und deshalb auf
# der deutschen Seite englisch erschienen (alle dreizehn Mega-Steine,
# die Hibisbeere, die Schattenbrille). Ein Widerspruch entsteht eben
# nur, wenn zwei Quellen etwas sagen.
#
# Der Fleck bleibt hier absichtlich stehen: dieser Melder beantwortet
# die Frage "welcher von zwei Namen stimmt", und ein fehlender Name ist
# keine solche Frage. Geschlossen wird die Luecke an der Wurzel —
# build_champions_pokedex.write_names_de() traegt fehlende Namen aus
# den Referenzen nach — und bewacht von
# tests/python/test_deutsche_namen_sichtbar.py, das in CI umfaellt,
# sobald wieder ein Name nur in der Referenz steht.
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
    # ── Die vierte Quelle ────────────────────────────────────────────
    #
    # BEFUND (03.09.2026): data/champions_resources.json fuehrt 1.268
    # deutsche Namen — mehr als jede Referenzdatei — und stand bis dahin
    # in keinem Vergleich. Gemessen widersprach sie der Namenstabelle an
    # 18 Stellen, davon neun, die schon einmal entschieden waren
    # ("Lichtelit" statt Skelabranit, "Wahlglas" statt Wahlbrille).
    #
    # Ein Melder, der drei von vier Quellen kennt, meldet null Konflikte
    # und liegt trotzdem falsch. Die vierte kommt deshalb hier dazu.
    try:
        res = _lies("champions_resources.json")
    except FileNotFoundError:
        res = None
    if res:
        KAT = {"item": ("items", "Item"),
               "ability": ("abilities", "F\u00e4higkeit"),
               "move": ("moves", "Attacke")}
        for e in res.get("entries", []):
            topf_art = KAT.get(e.get("cat"))
            if not topf_art:
                continue
            topf, art = topf_art
            en = (e.get("en") or "").strip()
            a = (e.get("de") or "").strip()
            b = (namen.get(topf, {}).get(en) or "").strip()
            if not en or not a or not b or a == b:
                continue
            luecken.append({
                "id": "namenskonflikt/res/" + en.lower().replace(" ", "-"),
                "klasse": "namenskonflikt",
                "titel": "%s %s \u2014 zwei deutsche Namen" % (art, en),
                "titelEn": "%s %s \u2014 two German names" % (art, en),
                "wo": "data/champions_resources.json \u2192 %s.de  vs.  "
                      "data/champions_names_de.json \u2192 %s" % (en, topf),
                "ansicht": "side-quest",
                "vorschlag": {
                    "wert": b,
                    "quelle": "https://pokewiki.de/" + en.replace(" ", "_"),
                    "einstufung": "mehrdeutig",
                    "begruendung": "Die Ressourcendatei schreibt \u201e%s\u201c, die "
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


# ── Pruefung 5: Gegenstaende, die die Quelle nur als Nummer liefert ─
#
# BEFUND 13.09.2026: championsbattledata.com hat aufgehoert, fuer einen
# Teil der gehaltenen Gegenstaende Namen zu liefern, und schreibt
# stattdessen "Unknown Item 542". Gemessen im Stand vom 13.09.: 20
# verschiedene Nummern, 158 betroffene Eintraege; im Stand vom 12.09.
# war es keine einzige.
#
# GEPRUEFT UND VERWORFEN: die Nummern sind KEINE PokeAPI-Item-IDs. Die
# Gegenprobe gegen data/v2/csv/item_names.csv ergibt Poke-Floete,
# Festivalticket, EP-Teiler und Rosenrauchwerk — Gegenstaende, die in
# einem Wettkampfformat niemand haelt. Eine Zuordnung waere also
# geraten, und geraten wird hier nichts (CLAUDE.md: "Report, don't
# silently repair").
#
# Deshalb steht der Befund hier: eine Luecke je Nummer waere Rauschen,
# also EIN Eintrag fuer den Ausfall, mit den Nummern im Text.
UNBENANNT = re.compile(r"^Unknown Item \d+$")


def gegenstandsnamen():
    try:
        usage = _lies("champions_usage.json")
    except FileNotFoundError:
        return []
    pk = usage.get("pokemon") or usage
    nummern, treffer = set(), 0
    for _slug, rec in pk.items():
        for _fmt, blk in rec.items():
            if not isinstance(blk, dict):
                continue
            for it in (blk.get("held_item") or []):
                n = (it.get("name") or "").strip()
                if UNBENANNT.match(n):
                    nummern.add(n)
                    treffer += 1
    if not nummern:
        return []
    liste = ", ".join(sorted(nummern, key=lambda x: int(x.rsplit(" ", 1)[1]))[:8])
    mehr = " …" if len(nummern) > 8 else ""
    return [{
        "id": "gegenstandsname/quelle-liefert-nummern",
        "klasse": "gegenstandsname",
        "titel": f"{len(nummern)} Gegenstände kommen nur als Nummer "
                 f"({treffer} Einträge): {liste}{mehr}",
        "titelEn": f"{len(nummern)} held items arrive as a bare number "
                   f"({treffer} entries): {liste}{mehr}",
        "wo": "data/champions_usage.json → pokemon[*][*].held_item[].name",
        "ansicht": "side-quest",
        "vorschlag": None,
    }]


# ── Pruefung 6: benutzte Namen, die kein Deutsch haben ─────────────
#
# BEFUND 15.09.2026, gemeldet vom Betreiber: "die Fähigkeit emergency
# exit heißt auf Deutsch sicher anders". Sie tut es (Rueckzug) — nur
# stand sie in keiner unserer Dateien.
#
# WARUM ES KEIN BESTEHENDER MELDER GESEHEN HAT. Pruefung 3 vergleicht
# zwei deutsche Namen miteinander und schweigt, wenn es keinen gibt;
# das steht dort auch so. Und tests/python/test_deutsche_namen_sichtbar.py
# bewacht die Kette Referenz -> Namenstabelle. Beide fragen dieselbe
# Sache: was unsere Namensquellen fuehren, muss ankommen.
#
# Emergency Exit kam aus einer ANDEREN Richtung: aus
# champions_usage.json. Die Nutzungsdaten fuehren Faehigkeiten,
# Attacken und Wesen, die der Champions-Datensatz nicht kennt —
# gemessen am 15.09.2026 waren das 19 von 202 benutzten Faehigkeiten
# und 2 von 423 Attacken. Kein Widerspruch, keine Referenz, also kein
# Melder. Der blinde Fleck war nicht der Vergleich, sondern die
# Eingangstuer.
#
# Deshalb fragt diese Pruefung von der ANZEIGE her: was die deutsche
# Seite tatsaechlich hinschreiben muss, und wofuer sie keinen
# deutschen Namen hat. Eine Luecke je Art, nicht je Name — 19 Zeilen
# waeren Rauschen, eine Zeile mit 19 Namen ist eine Aufgabe.
#
# NICHT GEPRUEFT wird hier absichtlich der Gegenstands-Topf: die
# Mega-Steine des Formats (Golisopite, Baxcalibrite, ...) sind
# Erfindungen des Spiels und haben keinen deutschen Namen, den man
# nachschlagen koennte. Ein Melder, der 73 unloesbare Zeilen wirft,
# wird weggeklickt und nimmt die loesbaren mit.
NAMENSTOEPFE = [
    ("ability", "abilities", "F\u00e4higkeit", "F\u00e4higkeiten", "ability", "abilities"),
    ("move", "moves", "Attacke", "Attacken", "move", "moves"),
]


def benutzte_namen_ohne_deutsch():
    try:
        usage = _lies("champions_usage.json")
        namen = _lies("champions_names_de.json")
    except FileNotFoundError:
        return []
    benutzt = {}
    for _slug, rec in (usage.get("pokemon") or {}).items():
        for _fmt, blk in (rec or {}).items():
            if not isinstance(blk, dict):
                continue
            for feld, eintraege in blk.items():
                if not isinstance(eintraege, list):
                    continue
                for e in eintraege:
                    n = (e.get("name") or "").strip() if isinstance(e, dict) else ""
                    if n:
                        benutzt.setdefault(feld, set()).add(n)
    luecken = []
    for feld, topf, einzahl, mehrzahl, einzahl_en, mehrzahl_en in NAMENSTOEPFE:
        tabelle = namen.get(topf) or {}
        fehlt = sorted(n for n in benutzt.get(feld, set()) if not (tabelle.get(n) or "").strip())
        if not fehlt:
            continue
        liste = ", ".join(fehlt[:8])
        mehr = " \u2026" if len(fehlt) > 8 else ""
        wort = einzahl if len(fehlt) == 1 else mehrzahl
        wort_en = einzahl_en if len(fehlt) == 1 else mehrzahl_en
        hat = "hat" if len(fehlt) == 1 else "haben"
        has = "has" if len(fehlt) == 1 else "have"
        luecken.append({
            "id": "deutscher-name/" + topf,
            "klasse": "deutscher-name",
            "titel": f"{len(fehlt)} {wort} aus den Nutzungsdaten {hat} keinen "
                     f"deutschen Namen: {liste}{mehr}",
            "titelEn": f"{len(fehlt)} {wort_en} used in the usage data {has} no "
                       f"German name: {liste}{mehr}",
            "wo": f"data/champions_usage.json \u2192 pokemon[*][*].{feld}[].name  "
                  f"fehlt in  data/champions_names_de.json \u2192 {topf}",
            "ansicht": "side-quest",
            "vorschlag": None,
        })
    return luecken


def drucke_ohne_kartentyp():
    """Drucke in den ausgelieferten Zeilen, zu denen die Kartendatenbank
    keinen Typ kennt.

    BEFUND 23.09.2026 (Wochenlauf #147). 455 von 178.221 Zeilen standen
    ohne Kartentyp da, alle aus den JP-Drucken MEE-9 bis MEE-16 (Energien
    und Items). tests/python/test_kartentyp_aus_druck.py verglich gegen
    einen Grundstand von 3 und hielt den Lauf an.

    Der Grundstand war richtig gemeint und falsch gebaut: er ist eine
    ZAHL, und eine Zahl sagt nicht, WELCHE Luecke dazugekommen ist. Die
    Kartendatenbank fuehrt MEE-13 als "Poke Pad", die Turnierliste nennt
    es "Psychic Energy" — die JP-Nummerierung der Decklisten ist eine
    andere als die der jp_prints. Wer sie hier aufloesen wollte, schriebe
    den falschen Typ hinein; der Scraper laesst das Feld deshalb
    ABSICHTLICH leer, damit der Rueckfall im Frontend greift.

    Eine geduldete Luecke ist in Ordnung, eine UNBENANNTE nicht. Ab hier
    steht jeder unaufloesbare Druck namentlich im Inventar, mit Anzahl —
    sichtbar im Admin-Bereich, und die Zusicherung verlangt nur noch,
    dass keine unbenannte dazukommt.

    NACHTRAG 24.09.2026 — DIESE PRUEFUNG HAT DEN DEPLOY ANGEHALTEN.
    ---------------------------------------------------------------
    Sie braucht als einzige die KARTENDATENBANK, und die liegt in
    backend/core/data. Der Wochenlauf saet diesen Ordner, der Deploy
    NICHT. Dort fand sie also keine Karte, gab eine leere Liste zurueck
    und behauptete damit: "keine Luecke". Die Datei im Repo fuehrte acht
    — geschrieben vom Wochenlauf, der die Datenbank sehr wohl hatte.

    test_datenluecken.py verglich beide und meldete die Datei als
    veraltet. Sie war es nicht. Nicht gemessen ist nicht dasselbe wie
    nichts gefunden, und genau diesen Unterschied hat die Pruefung
    verschluckt — drei Mal, an drei verschiedenen Ausgaengen.

    Sie gibt jetzt NICHT_MESSBAR zurueck, wenn ihr die Grundlage fehlt.
    baue() laesst die vorhandenen Eintraege dieser Klasse dann stehen,
    statt sie wortlos zu loeschen.
    """
    import csv as _csv

    pfad = os.path.join(DATA, "tournament_decklists_per_player.csv")
    if not os.path.exists(pfad):
        return NICHT_MESSBAR
    try:
        import sys
        sys.path.insert(0, os.path.join(os.path.dirname(DATA), "backend", "core"))
        import card_scraper_shared as css
        db = css.CardDatabaseLookup()
    except Exception:
        return NICHT_MESSBAR
    if not getattr(db, "nach_druck", None):
        return NICHT_MESSBAR

    zaehler = {}
    namen = {}
    with open(pfad, encoding="utf-8-sig") as f:
        for r in _csv.DictReader(f):
            satz = (r.get("set_code") or "").strip()
            nummer = (r.get("set_number") or "").strip()
            if not satz or not nummer:
                continue
            if db.typ_von_druck(satz, nummer):
                continue
            schluessel = f"{satz} {nummer}"
            zaehler[schluessel] = zaehler.get(schluessel, 0) + 1
            namen.setdefault(schluessel, (r.get("card_name") or "").strip())

    heraus = []
    for schluessel, anzahl in sorted(zaehler.items()):
        name = namen.get(schluessel) or "?"
        heraus.append({
            "id": "kartentyp/" + schluessel.lower().replace(" ", "-"),
            "klasse": "kartentyp",
            "titel": f"{name} ({schluessel}) — kein Kartentyp in der Datenbank "
                     f"({anzahl}x)",
            "titelEn": f"{name} ({schluessel}) — no card type in the database "
                       f"({anzahl}x)",
            "wo": "data/tournament_decklists_per_player.csv → Spalte type",
            "ansicht": "deck-builder",
            "vorschlag": None,
        })
    return heraus


PRUEFUNGEN = [mega_faehigkeiten, nutzungsdaten, namenskonflikte,
              fehlende_bereiche, gegenstandsnamen,
              benutzte_namen_ohne_deutsch, drucke_ohne_kartentyp]

# Welche Klasse eine Pruefung fuellt. Nur noetig fuer die, die
# NICHT_MESSBAR zurueckgeben koennen — sonst waere nicht zu sagen,
# WELCHE Eintraege uebernommen werden muessen.
KLASSE_JE_PRUEFUNG = {
    "drucke_ohne_kartentyp": "kartentyp",
}


def _vorheriger_stand():
    """Der zuletzt geschriebene Stand, oder ein leerer."""
    try:
        with open(OUT_PATH, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"luecken": []}

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
    "gegenstandsname": {
        "de": "Gegenstand ohne Namen",
        "en": "Held item without a name",
    },
    "deutscher-name": {
        "de": "Kein deutscher Name",
        "en": "No German name",
    },
    "kartentyp": {
        "de": "Druck ohne Kartentyp",
        "en": "Print without a card type",
    },
}


# Eine Pruefung, die ihre Grundlage nicht hat, gibt DIES zurueck — nicht
# eine leere Liste. "Nicht gemessen" und "nichts gefunden" sehen im
# Ergebnis gleich aus und bedeuten das Gegenteil voneinander; am
# 24.09.2026 hat genau diese Verwechslung den Deploy angehalten.
NICHT_MESSBAR = None


def baue(vorher=None):
    """Das Inventar neu bestimmen.

    `vorher` ist der bereits geschriebene Stand. Kann eine Pruefung nicht
    messen, bleiben SEINE Eintraege dieser Klasse stehen — ohne Grundlage
    darf niemand behaupten, eine Luecke sei verschwunden. Fehlt `vorher`,
    wird die Datei selbst gelesen.
    """
    if vorher is None:
        vorher = _vorheriger_stand()

    luecken = []
    nicht_gemessen = []
    for pruefung in PRUEFUNGEN:
        ergebnis = pruefung()
        if ergebnis is NICHT_MESSBAR:
            klasse = KLASSE_JE_PRUEFUNG.get(pruefung.__name__)
            if klasse:
                nicht_gemessen.append(klasse)
                luecken.extend([l for l in (vorher.get("luecken") or [])
                                if l.get("klasse") == klasse])
            continue
        luecken.extend(ergebnis)
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
            # Welche Klassen in DIESEM Lauf nicht gemessen werden konnten.
            # Ihre Eintraege sind uebernommen, nicht neu bestimmt.
            "nichtGemessen": sorted(nicht_gemessen),
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
