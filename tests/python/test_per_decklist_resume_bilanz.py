"""SC-8 (30.09.2026): --resume holt ein Turnier ohne jede Bilanz erneut.

Bis heute zaehlte fuer `load_existing_output` jede Zeile. Ein Turnier,
das waehrend es lief oder ohne Bilanzspalte geholt wurde, stand mit
leeren wins/losses/ties im Bestand, und der woechentliche Lauf mit
--resume holte es nie wieder. Gemessen am 30.09.: 0 von 85 Turnieren
betroffen — die Regel gehoert trotzdem an ihre Bedingung.

Ausgefuehrt, nicht gelesen: die Funktion laeuft gegen eine TESTDATEN-CSV
in einem Wegwerf-Verzeichnis.
"""
import csv
import importlib.util
import os
import sys

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
QUELLE = os.path.join(WURZEL, "backend", "scrapers", "per_decklist_scraper.py")


@pytest.fixture(scope="module")
def modul():
    sys.path.insert(0, os.path.join(WURZEL, "backend", "core"))
    spec = importlib.util.spec_from_file_location("pds_resume_test", QUELLE)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def _csv(pfad, zeilen, felder):
    with open(pfad, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=felder)
        w.writeheader()
        for z in zeilen:
            w.writerow({k: z.get(k, "") for k in felder})


def test_nur_ein_turnier_mit_bilanz_gilt_als_erledigt(modul, tmp_path):
    pfad = tmp_path / "per_player.csv"
    _csv(pfad, [
        # TESTDATEN
        {"limitless_tournament_id": "501", "player_name": "TEST A", "wins": "6", "losses": "2", "ties": "1"},
        {"limitless_tournament_id": "501", "player_name": "TEST B", "wins": "", "losses": "", "ties": ""},
        {"limitless_tournament_id": "502", "player_name": "TEST C", "wins": "", "losses": "", "ties": ""},
        {"limitless_tournament_id": "502", "player_name": "TEST D", "wins": "", "losses": "", "ties": ""},
        {"limitless_tournament_id": "503", "player_name": "TEST E", "wins": "0", "losses": "3", "ties": "0"},
    ], modul.CSV_FIELDS)
    erledigt = modul.load_existing_output(str(pfad))
    assert erledigt == {"501", "503"}, (
        "502 hat keine einzige Bilanz und muss neu geholt werden; 501 hat "
        "eine (Rueckfall-Luecken einzelner Spieler sind kein Grund) und "
        f"503 eine echte 0-3-0 — bekommen: {sorted(erledigt)}")


def test_ohne_datei_ist_nichts_erledigt(modul, tmp_path):
    assert modul.load_existing_output(str(tmp_path / "gibt-es-nicht.csv")) == set()
