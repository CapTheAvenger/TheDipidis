"""Zwei Loecher, die sich selbst versteckt haben.

Beide Befunde vom 30.08.2026 haben dasselbe Muster: eine Funktion
liefert bei fehlender Eingabe still einen leeren oder falschen Wert,
und weil nirgends eine Meldung faellt, laeuft der Fehler monatelang
durch die ganze Kette bis in die Oberflaeche.

BEFUND 1 — pokedex_number leer in 20.878 von 20.878 Kartenzeilen.
`load_pokedex()` in backend/core/prepare_card_data.py las
ausschliesslich `get_data_dir()`, also `backend/core/data/`. Dort liegt
die Datei nicht, und kein Workflow kopiert sie hin. Sie liegt im Repo
unter `data/pokemon_dex_numbers.json` — 1064 Eintraege. Der Rueckfall
`return {}` machte daraus einen lautlosen Totalausfall.

Sichtbare Folge: die Kartensuche verspricht im Platzhalter „Name
(EN/DE), Set+Nr. oder Pokedex" und lieferte auf jede Dex-Nummer
0 Treffer. Dazu sortierte js/app-core.js alle Pokemon auf 9999.

BEFUND 2 — is_ace_spec in 18.145 Zeilen falsch, in beide Richtungen.
`is_ace_spec_by_name()` prueft `'ace spec' in v['type']`. Diese
Zeichenkette kommt in keinem der 37 type-Werte aus
all_cards_database.csv und keinem der 10 aus japanese_cards_database.csv
vor — die Pruefung konnte nur noch False liefern. 12.734 Zeilen tragen
faelschlich „Yes" (Reste eines aelteren DB-Stands), 5.411 faelschlich
„No" oder leer.

Beide sind jetzt gegen eine kanonische Quelle abgeglichen statt
geraten, und beide melden sich, wenn die Quelle fehlt.
"""

import importlib.util
import json
import os
import sys

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
DATEN = os.path.join(WURZEL, "data")
KERN = os.path.join(WURZEL, "backend", "core")


def _lade(modul, datei):
    """Modul aus backend/core laden, ohne das Paket zu installieren."""
    if KERN not in sys.path:
        sys.path.insert(0, KERN)
    pfad = os.path.join(KERN, datei)
    if not os.path.exists(pfad):
        pytest.skip(f"{datei} fehlt")
    spec = importlib.util.spec_from_file_location(modul, pfad)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def _quelle(pfad):
    with open(os.path.join(WURZEL, pfad), encoding="utf-8") as f:
        return f.read()


# ── Befund 1: Pokedex-Nummern ──────────────────────────────────────

def test_die_dex_datei_liegt_da_wo_gesucht_wird():
    m = _lade("_prep", "prepare_card_data.py")
    dex = m.load_pokedex()
    assert len(dex) > 900, (
        f"load_pokedex() liefert {len(dex)} Eintraege. Unter 900 heisst: sie "
        f"sucht wieder nur in backend/core/data/, und dort liegt die Datei "
        f"nicht. Folge: pokedex_number bleibt in JEDER Kartenzeile leer und "
        f"die Pokedex-Suche liefert nie einen Treffer."
    )


def test_bekannte_namen_treffen():
    """Ein voller Zaehler nuetzt nichts, wenn die Schluessel nicht passen."""
    m = _lade("_prep", "prepare_card_data.py")
    dex = m.load_pokedex()
    for name, nummer in [("bulbasaur", 1), ("pikachu", 25), ("charizard", 6),
                         ("dragapult", 887)]:
        assert dex.get(name) == nummer, (
            f"{name} steht auf {dex.get(name)} statt {nummer} — die "
            f"Namensform der Datei passt nicht mehr zu get_base_pokemon_name()"
        )


def test_ein_fehlender_dex_wird_gemeldet_nicht_verschwiegen():
    q = _quelle("backend/core/prepare_card_data.py")
    i = q.find("def load_pokedex(")
    assert i != -1
    rumpf = q[i:i + 2500]
    assert "::warning::" in rumpf, (
        "load_pokedex() gibt bei fehlender Datei wieder still {} zurueck. "
        "Genau so ist der Ausfall monatelang unbemerkt geblieben."
    )
    assert "project_root" in rumpf, (
        "es wird nur noch ein Verzeichnis durchsucht"
    )


def test_die_dex_datei_selbst_ist_brauchbar():
    pfad = os.path.join(DATEN, "pokemon_dex_numbers.json")
    if not os.path.exists(pfad):
        pytest.fail("data/pokemon_dex_numbers.json fehlt — ohne sie ist die "
                    "Pokedex-Suche und die Entwicklungslinien-Sortierung tot")
    with open(pfad, encoding="utf-8") as f:
        dex = json.load(f)
    assert len(dex) > 900, f"nur {len(dex)} Eintraege"
    kaputt = [k for k, v in dex.items() if not isinstance(v, int) or v < 1]
    assert not kaputt, f"unmoegliche Dex-Nummern: {kaputt[:5]}"


# ── Befund 2: ACE SPEC ─────────────────────────────────────────────

def _lookup():
    m = _lade("_csh", "card_scraper_shared.py")
    C = m.CardDatabaseLookup
    db = C.__new__(C)
    db.cards = {}
    db.normalize_name = lambda n: str(n).lower().strip()
    return C, db


def test_ace_spec_erkennt_beide_richtungen():
    C, db = _lookup()
    echt = ["Unfair Stamp", "Prime Catcher", "Secret Box", "Legacy Energy",
            "Computer Search", "Hero's Cape"]
    keine = ["Switch", "Jamming Tower", "Ultra Ball", "Roxanne",
             "Colress's Experiment", "Nest Ball"]
    falsch_nein = [n for n in echt if not db.is_ace_spec_by_name(n)]
    falsch_ja = [n for n in keine if db.is_ace_spec_by_name(n)]
    assert not falsch_nein, (
        f"echte ACE SPECs nicht erkannt: {falsch_nein}. Genau diese Namen "
        f"standen in 5.411 Zeilen faelschlich auf 'No'."
    )
    assert not falsch_ja, (
        f"als ACE SPEC erkannt, obwohl keine: {falsch_ja}. 'Switch' stand in "
        f"3.386 Zeilen faelschlich auf 'Yes'."
    )


def test_die_erkennung_haengt_nicht_mehr_allein_am_type_feld():
    q = _quelle("backend/core/card_scraper_shared.py")
    i = q.find("def is_ace_spec_by_name(")
    assert i != -1
    rumpf = q[i:i + 1200]
    assert "_ace_namen()" in rumpf, (
        "die Erkennung fragt die kanonische Liste nicht mehr — dann kann sie "
        "wieder nur False liefern, weil kein type-Wert 'ace spec' enthaelt."
    )


def test_das_type_feld_fuehrt_wirklich_keine_ace_spec_angabe():
    """Die Begruendung der Reparatur, als Zusicherung.

    Bekaeme die Kartendatenbank das Feld eines Tages zurueck, waere der
    Umweg ueber die Liste nicht mehr noetig — dann soll das hier
    auffallen und jemand die Begruendung im Quelltext nachziehen."""
    import csv
    pfad = os.path.join(DATEN, "all_cards_database.csv")
    if not os.path.exists(pfad):
        pytest.skip("all_cards_database.csv fehlt")
    typen = set()
    with open(pfad, newline="", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            t = (r.get("type") or "").strip()
            if t:
                typen.add(t)
    mit = [t for t in typen if "ace spec" in t.lower()]
    assert not mit, (
        f"all_cards_database.csv fuehrt jetzt doch ACE-SPEC-Typen ({mit}) — "
        f"die Begruendung von _ace_namen() gehoert aktualisiert."
    )


def test_eine_fehlende_liste_wird_gemeldet():
    q = _quelle("backend/core/card_scraper_shared.py")
    i = q.find("def _ace_namen(")
    assert i != -1
    assert "::warning::" in q[i:i + 1600], (
        "ohne Liste und ohne type-Feld schreibt die Funktion still 'No' in "
        "jede Zeile — das ist eine Behauptung, keine Messung."
    )


def test_die_kanonische_liste_ist_da_und_plausibel():
    pfad = os.path.join(DATEN, "ace_specs.json")
    if not os.path.exists(pfad):
        pytest.fail("data/ace_specs.json fehlt — daran haengen die Erkennung "
                    "im Backend UND die Anzeige im Frontend")
    with open(pfad, encoding="utf-8") as f:
        d = json.load(f)
    namen = d.get("ace_specs") or []
    assert len(namen) >= 30, f"nur {len(namen)} Namen"
    assert all(n == n.lower().strip() for n in namen), (
        "die Liste ist nicht durchgehend kleingeschrieben — der Abgleich "
        "in _ace_namen() und im Frontend vergleicht kleingeschrieben"
    )
