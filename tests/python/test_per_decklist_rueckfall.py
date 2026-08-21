"""Ein Format ohne Turniere darf den Einzellisten-Lauf nicht stilllegen.

BEFUND (21.08.2026): per_decklist_scraper.py laeuft im Wochenlauf mit
`--from-date auto`. "auto" liest in_person_legal_date aus
format_window.json und pinnt das Fenster damit auf das LAUFENDE Format.
Richtig — solange es dort Turniere gibt.

In TEF-PBL gibt es keins: das erste Major des Formats ist die
Weltmeisterschaft. Der Lauf holte also null Turniere, meldete Erfolg,
und data/tournament_decklists_per_player.csv steht seit Turin bei zwei
Turnieren. Im Deckbauer heisst das: keine Einzellisten, Rueckfall auf
Archetyp-Mittelwerte — planmaessig, aber niemand konnte sehen, dass es
am Filter liegt und nicht an der Quelle.

Jetzt faellt der Lauf auf das Fenster des VORFORMATS zurueck
(previous_format_key aus format_window.json, plus lag_days auf das
Erscheinungsdatum des neueren Sets) und sagt das als ::warning::.

Den Filter ganz zu streichen waere die schlechtere Antwort: dann liefen
wieder drei Jahre Turniere durch, und genau das soll er verhindern.
"""

import ast
import importlib.util
import json
import os
import sys

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
QUELLE = os.path.join(WURZEL, "backend", "scrapers", "per_decklist_scraper.py")


@pytest.fixture(scope="module")
def modul():
    sys.path.insert(0, os.path.join(WURZEL, "backend", "core"))
    spec = importlib.util.spec_from_file_location("pds_test", QUELLE)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_vorformat_wird_aus_dem_repo_bestimmt(modul):
    datum, name = modul._vorformat_fenster(os.path.join(WURZEL, "data"))
    with open(os.path.join(WURZEL, "data", "format_window.json"), encoding="utf-8") as f:
        fw = json.load(f)
    assert name == fw["previous_format_key"]
    assert datum and datum < fw["in_person_legal_date"], (
        "das Vorformat muss VOR dem laufenden beginnen — sonst holt der "
        "Rueckfall dieselbe leere Menge")


def test_vorformat_rechnet_erscheinen_plus_verzug(modul, tmp_path):
    (tmp_path / "format_window.json").write_text(json.dumps({
        "previous_format_key": "TEF-CRI", "lag_days": 14,
    }), encoding="utf-8")
    (tmp_path / "sets_metadata.json").write_text(json.dumps({
        "CRI": {"order": 154, "release_date": "2026-05-22"},
    }), encoding="utf-8")
    assert modul._vorformat_fenster(str(tmp_path)) == ("2026-06-05", "TEF-CRI")


def test_vorformat_raet_nicht(modul, tmp_path):
    """Fehlt die Angabe, gibt es keinen Rueckfall — kein erfundenes Datum."""
    (tmp_path / "format_window.json").write_text(json.dumps({}), encoding="utf-8")
    assert modul._vorformat_fenster(str(tmp_path)) == (None, None)

    (tmp_path / "format_window.json").write_text(json.dumps({
        "previous_format_key": "TEF-CRI",
    }), encoding="utf-8")
    (tmp_path / "sets_metadata.json").write_text(json.dumps({
        "CRI": {"order": 154, "release_date": ""},
    }), encoding="utf-8")
    datum, name = modul._vorformat_fenster(str(tmp_path))
    assert datum is None and name == "TEF-CRI"


def test_datumsfilter_behaelt_undatierte_zeilen(modul):
    overview = {"1": {"date_iso": "2026-06-10"},
                "2": {"date_iso": "2026-08-05"},
                "3": {}}
    werke = [{"id": "1"}, {"id": "2"}, {"id": "3"}]
    ids = [w["id"] for w in modul._nach_datum(werke, overview, "2026-07-31")]
    assert ids == ["2", "3"], (
        "ein Turnier ohne Datum in der Uebersicht wegzuwerfen waere eine "
        "stille Reparatur — die Uebersicht kennt frisch entdeckte Turniere "
        "manchmal noch nicht")


def test_rueckfall_greift_nur_beim_automatischen_fenster():
    """Ein von Hand gesetztes --from-date ist eine Ansage."""
    with open(QUELLE, encoding="utf-8") as f:
        quelle = f.read()
    stelle = quelle.index("if not work and args.from_date ==")
    zeile = quelle[stelle:quelle.index("\n", stelle)]
    assert "_auto_fenster_datum" in zeile, (
        "der Rueckfall haengt nicht am aufgeloesten auto-Wert — er wuerde "
        "damit auch ein ausdrueckliches --from-date hintergehen")


def test_der_rueckfall_ist_sichtbar():
    with open(QUELLE, encoding="utf-8") as f:
        quelle = f.read()
    stelle = quelle.index("if not work and args.from_date ==")
    block = quelle[stelle:stelle + 2200]
    assert "::warning::per_decklist_scraper" in block, (
        "ein stiller Rueckfall waere nur ein anderer stiller Zustand")
    assert "_vorformat_fenster" in block


def test_beide_ausgaenge_melden_sich():
    """Auch der Fall 'kein Vorformat bestimmbar' darf nicht stumm sein."""
    with open(QUELLE, encoding="utf-8") as f:
        quelle = f.read()
    stelle = quelle.index("if not work and args.from_date ==")
    block = quelle[stelle:stelle + 2600]
    assert block.count("::warning::per_decklist_scraper") >= 2, block[:400]
