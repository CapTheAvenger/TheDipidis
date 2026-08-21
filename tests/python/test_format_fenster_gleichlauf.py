"""Ein Datum, drei Dateien, drei Antworten.

GEMESSEN am 21.08.2026:

    data/format_window.json              in_person_legal_date = 2026-07-31
    config/scraper_settings.json         start_date           = 31.07.2026
    config/current_meta_analysis_settings.json
                                         start_date           = 10.04.2026

112 Tage und drei Formate Unterschied. Die letzte Datei ist die, die das
Frontend laedt: sie entschied, welche Turniere als "aktuelles Meta"
gelten. Ursache war backend/core/update_sets.py — die Liste
standalone_rotations drehte in dieser Datei nur den format_filter, nicht
das Startdatum.

Diese Datei haelt den Gleichlauf fest. Sie prueft KEINEN festen Wert,
sondern dass die drei Angaben dasselbe sagen — sie bleibt damit ueber
jede Rotation hinweg gueltig.
"""

import json
import os
import re

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _lies(pfad):
    with open(os.path.join(ROOT, pfad), encoding="utf-8-sig") as f:
        return json.load(f)


def _iso_zu_de(iso: str) -> str:
    j, m, t = iso.split("-")
    return f"{t}.{m}.{j}"


@pytest.fixture(scope="module")
def fenster():
    return _lies("data/format_window.json")


class TestStartdatum:
    def test_das_formatfenster_traegt_ein_brauchbares_startdatum(self, fenster):
        iso = fenster.get("in_person_legal_date") or fenster.get("set_release_date") or ""
        assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", iso), f"unbrauchbar: {iso!r}"

    def test_beide_configs_nennen_dasselbe_startdatum(self):
        standalone = _lies("config/current_meta_analysis_settings.json")
        gebuendelt = _lies("config/scraper_settings.json")
        a = standalone["sources"]["tournaments"]["start_date"]
        b = gebuendelt["current_meta_analysis"]["sources"]["tournaments"]["start_date"]
        assert a == b, (
            f"config/current_meta_analysis_settings.json sagt {a}, "
            f"config/scraper_settings.json sagt {b} — das Frontend liest die erste"
        )

    def test_das_startdatum_passt_zum_laufenden_format(self, fenster):
        standalone = _lies("config/current_meta_analysis_settings.json")
        soll = _iso_zu_de(fenster["in_person_legal_date"])
        ist = standalone["sources"]["tournaments"]["start_date"]
        assert ist == soll, (
            f"Startdatum {ist} passt nicht zum Praesenzstart des laufenden "
            f"Formats ({soll}) — dann zaehlen Turniere aus dem Vorformat mit"
        )

    def test_beide_configs_nennen_dasselbe_format(self, fenster):
        standalone = _lies("config/current_meta_analysis_settings.json")
        gebuendelt = _lies("config/scraper_settings.json")
        soll = str(fenster["current_set"]).strip().upper()
        for name, wert in (
            ("current_meta_analysis_settings.json",
             standalone["sources"]["limitless_online"]["format_filter"]),
            ("scraper_settings.json",
             gebuendelt["current_meta_analysis"]["sources"]["limitless_online"]["format_filter"]),
        ):
            assert str(wert).strip().upper() == soll, f"{name}: {wert} statt {soll}"


class TestRotationDrehtEsMit:
    def test_update_sets_dreht_das_startdatum_der_standalone_datei(self):
        pfad = os.path.join(ROOT, "backend", "core", "update_sets.py")
        with open(pfad, encoding="utf-8-sig") as f:
            quelle = f.read()
        i = quelle.index("standalone_rotations = [")
        j = quelle.index("]", i)
        block = quelle[i:j]
        assert "'current_meta_analysis_settings.json'" in block
        assert "'start_date'" in block, (
            "ohne diesen Eintrag altert das Startdatum bei jeder Rotation weiter"
        )
        assert "in_person_de" in block, "der Wert muss aus dem Formatfenster kommen"


class TestKeinHartesSetKuerzel:
    """Ein hart geschriebenes Set-Kuerzel als Rueckfall altert bei jeder
    Rotation. Faellt das Formatfenster einmal aus, scrapt der Lauf sonst
    still das vorletzte Format — und die Selbstheilung ueberschreibt damit
    sogar eine korrekt gesetzte Einstellung."""

    @pytest.mark.parametrize("datei", [
        "backend/scrapers/current_meta_analysis_scraper.py",
        "backend/scrapers/online_tournament_scraper.py",
    ])
    def test_current_set_code_faellt_nicht_auf_ein_set_zurueck(self, datei):
        with open(os.path.join(ROOT, datei), encoding="utf-8-sig") as f:
            quelle = f.read()
        m = re.search(r"def _current_set_code\(fallback: str = (.+?)\)", quelle)
        assert m, f"{datei}: _current_set_code nicht gefunden"
        assert m.group(1).strip() in ("''", '""'), (
            f"{datei}: Rueckfall ist {m.group(1)} — ein Set-Kuerzel altert"
        )

    @pytest.mark.parametrize("datei", [
        "backend/scrapers/current_meta_analysis_scraper.py",
        "backend/scrapers/online_tournament_scraper.py",
    ])
    def test_ohne_format_wird_nichts_geholt(self, datei):
        with open(os.path.join(ROOT, datei), encoding="utf-8-sig") as f:
            quelle = f.read()
        assert "::error::" in quelle, (
            f"{datei}: ein fehlender Formatfilter muss im CI-Log sichtbar sein"
        )
        assert re.search(r"if not (fmt|format_filter):", quelle), (
            f"{datei}: ohne Formatfilter darf nicht ungefiltert gescrapt werden"
        )
