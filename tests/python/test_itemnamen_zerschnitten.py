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

def test_jeder_gehaltene_gegenstand_steht_in_der_referenzliste():
    """Ein Name, den die Referenzliste nicht kennt, ist entweder neu
    (dann gehoert die Liste nachgezogen) oder zerschnitten."""
    erlaubt = set(_kanonisch())
    usage = _lade("champions_usage.json")
    pk = usage.get("pokemon") or usage
    unbekannt = {}
    for slug, rec in pk.items():
        for fmt, blk in rec.items():
            if not isinstance(blk, dict):
                continue
            for it in (blk.get("held_item") or []):
                n = (it.get("name") or "").strip()
                if n and n not in erlaubt:
                    unbekannt.setdefault(n, []).append(f"{slug}/{fmt}")
    assert not unbekannt, (
        "Gegenstaende ausserhalb der Referenzliste — vermutlich wieder "
        f"zerschnitten: { {k: v[:2] for k, v in unbekannt.items()} }"
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
