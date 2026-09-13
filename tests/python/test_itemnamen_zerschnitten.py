"""Zwei Mega-Steine standen mit einem Leerzeichen mittendrin im Modal.

BEFUND (30.08.2026): `data/champions_usage.json` fuehrte
`"Tyra nitarite"` (Tyranitar) und `"Mega niumite"` (Meganium) als
gehaltenen Gegenstand. Beides sind die einzigen zwei Faelle unter 238
Pokemon, und der Name kommt genau so aus dem CSV-Feld der Quelle — es
ist kein Parserfehler auf unserer Seite.

Warum das mehr als ein Schoenheitsfehler war: `build_champions_pokedex.py`
sucht den Mega-Stein in der `held_item`-Liste der Basisform, um die
Nutzungsdaten der Basisform auf die Mega-Form zu uebertragen. Der Anteil
des Steins ("56,5 % halten Tyranitarite") ist die Belegkette dafuer. Ein
zerschnittener Name landet unveraendert in `meta.viaStone` und damit als
Quellenangabe im Modal — eine Herkunftsangabe, die es so nicht gibt.

Repariert wird ausschliesslich gegen die kanonische Liste aus
`data/champions_available_items.json` (Serebii, 181 Namen), und nur wenn
der Name ohne Leerzeichen dort genau einen Treffer hat. Kein Raten.
"""

import json
import os
import re

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
DATEN = os.path.join(WURZEL, "data")
SCRAPER = os.path.join(WURZEL, "scripts", "scrape_champions_usage.py")


def _lade(name):
    pfad = os.path.join(DATEN, name)
    if not os.path.exists(pfad):
        pytest.skip(f"{name} fehlt")
    with open(pfad, encoding="utf-8") as f:
        return json.load(f)


def _kanonisch():
    namen = _lade("champions_available_items.json").get("items") or []
    assert namen, "die Referenzliste ist leer"
    return namen


# ── Die Daten ──────────────────────────────────────────────────────

# Namen, die die Referenzliste nicht kennt und die wir NICHT korrigieren.
#
# Die Serebii-Liste hinkt neuen Gegenstaenden zwangslaeufig hinterher,
# und die Quelle liefert gelegentlich Muell. Eine harte Schwelle waere
# hier Rauschen (Projektregel: Aenderung gegen eine Grundlinie erkennen,
# nicht absolute Schwellen setzen) — deshalb steht hier eine Grundlinie:
# was schon bekannt ist, ist geduldet, alles NEUE faellt auf.
#
# Geraten wird nichts. Der Scraper laesst diese Namen unveraendert
# stehen und meldet sie (repariere_itemnamen), und das Modal zeigt, was
# die Quelle sagt.
#
#   WUE — 30.08.2026, eelektross/doubles, 1,1 %. Drei Grossbuchstaben,
#         kein Gegenstand dieses Namens existiert. Sieht nach einem
#         abgeschnittenen Eintrag der Quelle aus. Nicht korrigierbar:
#         ohne Leerzeichen ergibt sich kein Treffer in der Liste, also
#         waere jede Zuordnung geraten.
GEDULDET_UNBEKANNT = {"WUE"}

# ── Eine KLASSE, kein Einzelname (13.09.2026) ──────────────────────
#
# Am 13.09.2026 lieferte championsbattledata.com fuer einen Teil der
# gehaltenen Gegenstaende keinen Namen mehr, sondern "Unknown Item 542".
# Gemessen: 20 verschiedene Nummern, 174 betroffene Eintraege; im Stand
# vom 12.09. keine einzige. Zwanzig Zeilen in GEDULDET_UNBEKANNT waeren
# hier falsch — nicht weil es zu viele sind, sondern weil sie den Fall
# als zwanzig Einzelfaelle beschreiben wuerden. Es ist EIN Ausfall, und
# morgen traegt er andere Nummern.
#
# GEPRUEFT UND VERWORFEN: PokeAPI-Item-IDs sind es nicht. Die Gegenprobe
# gegen data/v2/csv/item_names.csv ergibt fuer 542/230/253/267 Poke-Floete,
# Muschelglocke, Zoomlinse und Kraftguertel — nichts davon haelt jemand in
# einem Wettkampfformat. Jede Zuordnung waere geraten.
#
# Geduldet ist die Klasse deshalb nur unter zwei Bedingungen, die beide
# unten geprueft werden: sie darf nicht wachsen, und sie muss im
# Luecken-Inventar stehen, also im Admin-Bereich sichtbar sein.
UNBENANNT = re.compile(r"^Unknown Item \d+$")
UNBENANNT_HOECHSTENS = 25      # gemessen am 13.09.2026: 20


def test_jeder_gehaltene_gegenstand_steht_in_der_referenzliste():
    """Ein Name, den die Referenzliste nicht kennt, ist entweder neu
    (dann gehoert die Liste nachgezogen) oder zerschnitten."""
    erlaubt = set(_kanonisch()) | GEDULDET_UNBEKANNT
    usage = _lade("champions_usage.json")
    pk = usage.get("pokemon") or usage
    unbekannt = {}
    for slug, rec in pk.items():
        for fmt, blk in rec.items():
            if not isinstance(blk, dict):
                continue
            for it in (blk.get("held_item") or []):
                n = (it.get("name") or "").strip()
                if n and n not in erlaubt and not UNBENANNT.match(n):
                    unbekannt.setdefault(n, []).append(f"{slug}/{fmt}")
    assert not unbekannt, (
        "NEUE Gegenstaende ausserhalb der Referenzliste: "
        f"{ {k: v[:2] for k, v in unbekannt.items()} }. "
        "Entweder ist die Serebii-Liste veraltet (dann nachziehen) oder die "
        "Quelle liefert einen zerschnittenen Namen (dann greift die Reparatur "
        "in scrape_champions_usage.py). Ist beides ausgeschlossen, gehoert der "
        "Name mit Begruendung in GEDULDET_UNBEKANNT — nicht stillschweigend."
    )


def test_kein_gegenstand_ist_nur_durch_leerzeichen_verschoben():
    """Der konkrete Fehler, namentlich: `X Y` und `XY` sind derselbe
    Gegenstand, aber nur einer davon ist der richtige Name."""
    ohne = {n.replace(" ", "").lower(): n for n in _kanonisch()}
    usage = _lade("champions_usage.json")
    pk = usage.get("pokemon") or usage
    schief = []
    for slug, rec in pk.items():
        for fmt, blk in rec.items():
            if not isinstance(blk, dict):
                continue
            for it in (blk.get("held_item") or []):
                n = (it.get("name") or "").strip()
                richtig = ohne.get(n.replace(" ", "").lower())
                if richtig and richtig != n:
                    schief.append((slug, fmt, n, richtig))
    assert not schief, f"falsch gesetzte Leerzeichen: {schief[:5]}"


def test_die_steinangabe_im_pokedex_ist_ein_echter_gegenstand():
    """`meta.viaStone` ist die Belegkette fuer geerbte Nutzungsdaten.

    Steht dort ein Name, den es nicht gibt, behauptet das Modal eine
    Herkunft, die niemand nachpruefen kann."""
    erlaubt = set(_kanonisch())
    eintraege = _lade("champions_pokedex.json").get("entries") or []
    megas = [e for e in eintraege if e.get("form") == "Mega"]
    assert megas, "keine Mega-Formen im Pokedex"
    schief = [(e.get("en"), (e.get("meta") or {}).get("viaStone"))
              for e in megas
              if (e.get("meta") or {}).get("viaStone")
              and (e["meta"]["viaStone"]) not in erlaubt]
    assert not schief, f"viaStone kennt die Referenzliste nicht: {schief}"


def test_geerbte_nutzungsdaten_haben_immer_einen_beleg():
    """Vererbt wird nur MIT Steinbeleg — sonst waere es geraten."""
    eintraege = _lade("champions_pokedex.json").get("entries") or []
    ohne = []
    for e in eintraege:
        meta = e.get("meta") or {}
        if meta.get("viaBase") and not meta.get("viaStone"):
            ohne.append(e.get("en"))
    assert not ohne, (
        f"Nutzungsdaten der Basisform uebernommen, ohne dass ein Mega-Stein "
        f"das belegt: {ohne}"
    )


# ── Der Scraper ────────────────────────────────────────────────────

def test_der_scraper_repariert_kuenftige_faelle_selbst():
    with open(SCRAPER, encoding="utf-8") as f:
        q = f.read()
    assert "def repariere_itemnamen(" in q, "die Reparatur fehlt"
    assert "repariere_itemnamen(r.get" in q, (
        "die Reparatur wird beim Einlesen der Items nicht aufgerufen"
    )
    assert "champions_available_items.json" in q, (
        "ohne kanonische Liste waere jede Korrektur geraten"
    )


def test_der_scraper_raet_nicht_bei_unbekannten_namen():
    """Kein Treffer heisst: unveraendert stehen lassen und melden."""
    import importlib.util
    spec = importlib.util.spec_from_file_location("_scu", SCRAPER)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)

    assert m.repariere_itemnamen("Tyra nitarite") == "Tyranitarite"
    assert m.repariere_itemnamen("Mega niumite") == "Meganiumite"
    # Etwas, das es nicht gibt, bleibt wie es ist — keine Naeherung.
    assert m.repariere_itemnamen("Wolkenkuckucksheimite") == "Wolkenkuckucksheimite"
    assert m.repariere_itemnamen("Life Orb") == "Life Orb"
    assert m.repariere_itemnamen("") == ""


def test_die_referenzliste_ist_ohne_leerzeichen_eindeutig():
    """Die ganze Reparatur haengt daran. Gaebe es zwei Gegenstaende, die
    sich nur in Leerzeichen unterscheiden, waere die Zuordnung Raten."""
    namen = _kanonisch()
    gesehen = {}
    doppelt = []
    for n in namen:
        k = n.replace(" ", "").lower()
        if k in gesehen and gesehen[k] != n:
            doppelt.append((gesehen[k], n))
        gesehen[k] = n
    assert not doppelt, f"nicht mehr eindeutig: {doppelt}"


def test_die_grundlinie_bleibt_klein():
    """Eine Duldungsliste, die waechst, ist keine Grundlinie mehr.

    Steht hier eines Tages ein Dutzend Namen, ist nicht die Quelle
    kaputt, sondern unsere Referenzliste veraltet — und dann gehoert
    sie nachgezogen, statt die Ausnahmen weiterzuzaehlen."""
    assert len(GEDULDET_UNBEKANNT) <= 3, (
        f"{len(GEDULDET_UNBEKANNT)} geduldete Unbekannte — "
        f"data/champions_available_items.json gehoert aktualisiert: "
        f"{sorted(GEDULDET_UNBEKANNT)}"
    )


def test_kein_geduldeter_name_ist_in_wahrheit_reparierbar():
    """Die Duldung darf keine Reparatur ersetzen.

    Waere ein geduldeter Name ohne Leerzeichen doch ein Treffer in der
    Referenzliste, waere er kein Raetsel, sondern genau der Fehler, den
    diese Datei behandelt — und dann gehoerte er repariert."""
    ohne = {n.replace(" ", "").lower() for n in _kanonisch()}
    reparierbar = [n for n in GEDULDET_UNBEKANNT
                   if n.replace(" ", "").lower() in ohne]
    assert not reparierbar, (
        f"geduldet, obwohl reparierbar: {reparierbar}"
    )


def _unbenannte():
    usage = _lade("champions_usage.json")
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
    return nummern, treffer


def test_die_namenlosen_gegenstaende_wachsen_nicht():
    """Geduldet heisst nicht unbeobachtet.

    Waechst die Zahl der Nummern deutlich, ist es kein Aussetzer mehr,
    sondern die Quelle hat die Namen ganz aufgegeben — und dann ist der
    Gegenstandsblock im Modal wertlos, statt nur luckenhaft.
    """
    nummern, _treffer = _unbenannte()
    assert len(nummern) <= UNBENANNT_HOECHSTENS, (
        f"{len(nummern)} namenlose Gegenstaende statt hoechstens "
        f"{UNBENANNT_HOECHSTENS} — die Quelle liefert immer weniger Namen. "
        "Nachsehen, ob es noch einen Weg zum Namen gibt, BEVOR die Grenze "
        "angehoben wird."
    )


def test_der_ausfall_steht_im_luecken_inventar():
    """Ein geduldeter Fehler, den niemand sieht, ist ein verschwiegener.

    Die Gegenprobe zur Duldung oben: solange die Quelle Nummern
    liefert, MUSS der Admin-Bereich das anzeigen. Verschwindet der
    Eintrag aus dem Inventar, faellt dieser Test — nicht der Nutzer.
    """
    nummern, _treffer = _unbenannte()
    inventar = _lade("datenluecken.json")
    eintraege = [l for l in inventar["luecken"] if l["klasse"] == "gegenstandsname"]
    if not nummern:
        assert not eintraege, (
            "die Quelle liefert wieder Namen — der Inventar-Eintrag gehoert weg "
            "('python3 scripts/datenluecken.py')"
        )
        return
    assert eintraege, (
        f"{len(nummern)} namenlose Gegenstaende, aber kein Eintrag der Klasse "
        "'gegenstandsname' in data/datenluecken.json — neu erzeugen mit "
        "'python3 scripts/datenluecken.py'"
    )
    assert str(len(nummern)) in eintraege[0]["titel"], (
        "der Inventar-Eintrag nennt eine andere Zahl als gemessen — "
        "data/datenluecken.json ist veraltet"
    )
