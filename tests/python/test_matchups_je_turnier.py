"""DA-8: Matchups je Turnier statt formatweit.

Befund F14: jede Zeile in labs_tournament_matchups_<META>.csv ist der
Schnitt ueber alle Turniere des Formats. Entscheidung Hausi 26.09.2026:
pro Turnier ist richtig. Die Labs-Ansicht nimmt eine beliebige
Turnierliste; mit einer einzigen Kennung ist sie die Matrix dieses
Turniers. Geschrieben wird in data/labs_matchups_je_turnier_<META>.csv.
"""
import os
import sys

import pytest

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


@pytest.fixture(scope="module")
def labs():
    sys.path.insert(0, os.path.join(WURZEL, "backend", "scrapers"))
    sys.path.insert(0, os.path.join(WURZEL, "backend", "core"))
    return pytest.importorskip("labs_tournament_scraper")


def test_die_vorsilbe_kollidiert_nicht_mit_dem_formatschnitt(labs):
    """Meta Call, Current Meta, Cardbinder und Wochenlauf lesen alles, was mit
    labs_tournament_matchups_ beginnt, als Formatschnitt."""
    assert not labs.JE_TURNIER_PREFIX.startswith("labs_tournament_matchups")
    assert not (labs.JE_TURNIER_PREFIX + "_X.csv").startswith("labs_tournament_matchups_")


def test_ziele_sind_je_deck_und_turnier_und_offene_nur(labs):
    decks = [
        {"meta": "TEF-CRI", "tournament_id": "0069", "deck_slug": "dragapult", "deck_name": "Dragapult"},
        {"meta": "TEF-CRI", "tournament_id": "0070", "deck_slug": "dragapult", "deck_name": "Dragapult"},
        {"meta": "TEF-CRI", "tournament_id": "0070", "deck_slug": "gardevoir", "deck_name": "Gardevoir"},
        {"meta": "", "tournament_id": "0019", "deck_slug": "x", "deck_name": "X"},
        {"meta": "_unsorted", "tournament_id": "0042", "deck_slug": "y", "deck_name": "Y"},
    ]
    vorhanden = [{"meta": "TEF-CRI", "tournaments_used": "69", "my_deck_slug": "dragapult"}]
    ziele = labs.je_turnier_ziele(decks, vorhanden)
    assert [(m, t, s) for m, t, s, _ in ziele] == [("TEF-CRI", "70", "dragapult"), ("TEF-CRI", "70", "gardevoir")]


def test_eine_kennung_ergibt_zeilen_eines_turniers(labs):
    zeilen = labs.build_matchup_rows("TEF-CRI", "dragapult", "Dragapult", {
        "summary": {}, "day_filter": labs.MATCHUP_DAY_OVERALL, "tournaments_used": ["70"],
        "matchups": [{"opponent_slug": "gardevoir", "opponent_name": "Gardevoir", "vs_count": 12, "vs_win_pct": 50.0}],
    })
    assert zeilen[0]["tournament_count"] == 1 and zeilen[0]["tournaments_used"] == "70"


def test_der_lauf_schreibt_die_eigene_datei(labs):
    import inspect
    import re
    q = re.sub(r"#[^\n]*", "", inspect.getsource(labs.main))
    assert "je_turnier_ziele(" in q and "JE_TURNIER_PREFIX" in q, "der Lauf holt die Matrix je Turnier nicht"
    assert "scrape_archetype_matchups(slug, [tid]" in q, "je Turnier muss GENAU eine Kennung abgefragt werden"


def test_der_wochenlauf_saet_und_holt_die_dateien_zurueck():
    wf = open(os.path.join(WURZEL, ".github", "workflows", "weekly-full-update.yml"), encoding="utf-8").read()
    assert wf.count("labs_matchups_je_turnier_*.csv") >= 2, (
        "ohne Samen und Rueckweg holt jeder Lauf alle Turniere neu bzw. verliert das Ergebnis")
