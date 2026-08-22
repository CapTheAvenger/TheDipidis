"""Limitless ist unsere Quelle, aber nicht unfehlbar.

BEFUND (22.08.2026): Turnier 518 — NAIC 2026, New Orleans, 3.752
Spieler — steht bei Limitless auf dem **10. Juni 2026**, in der
Turnierliste UND auf der Turnierseite selbst. Wir haben das
originalgetreu uebernommen: 1 Zeile in der Uebersicht, 1.474 Zeilen im
TEF-CRI-Chunk.

Das Datum ist falsch. Der 10.06.2026 war ein **Mittwoch**; ein
International Championship dieser Groesse laeuft Freitag bis Sonntag.
Tatsaechlich lief es vom 12. bis 14. Juni (Fr-So) — vom Betreiber
bestaetigt und konsistent mit Labs 0070.

Auf die Auswertung wirkt sich das nicht aus: beide Daten liegen im
TEF-CRI-Praesenzfenster (ab 05.06.), das Format bleibt TEF-CRI — was
die Turnierseite ausdruecklich bestaetigt ("Temporal Forces - Chaos
Rising"). Korrigiert wird eine angezeigte Tatsache, keine Rechnung.

Die Korrektur steht in data/labs_tournament_id_overrides.json, wo
schon die Labs-Zuordnung fuer dasselbe Turnier liegt, und wird beim
Schreiben angewandt. Eine Handkorrektur allein in der CSV wuerde der
naechste Lauf ueberschreiben — sie waere genau die Art stiller
Reparatur, die dieses Repo nicht will.
"""

import csv
import importlib.util
import json
import os
import sys

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
DATEN = os.path.join(WURZEL, "data")
QUELLE = os.path.join(WURZEL, "backend", "scrapers", "tournament_scraper_JH.py")


@pytest.fixture(scope="module")
def jh():
    sys.path.insert(0, os.path.join(WURZEL, "backend", "core"))
    spec = importlib.util.spec_from_file_location("jh_test", QUELLE)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    # get_data_dir() zeigt je nach Aufrufort woanders hin; fuer den Test
    # ist das Repo-data/ gemeint.
    m.get_data_dir = lambda: DATEN
    m._DATE_OVERRIDES_CACHE = None
    return m


def test_der_override_ist_hinterlegt():
    with open(os.path.join(DATEN, "labs_tournament_id_overrides.json"),
              encoding="utf-8") as f:
        d = json.load(f)
    e = d["overrides"]["518"]
    assert e["tournament_date"] == "12th June 2026"
    assert e["labs_tournament_id"] == "0070"
    assert len(e.get("date_reason", "")) > 80, (
        "eine Datumskorrektur ohne Begruendung ist geraten, nicht belegt")
    assert "Mittwoch" in e["date_reason"]


def test_der_scraper_wendet_ihn_an(jh):
    assert jh._datum_mit_override("518", "10th June 2026") == "12th June 2026"


def test_jede_schreibstelle_geht_durch_den_override():
    """Die Funktion nuetzt nichts, wenn sie niemand ruft.

    Beide Stellen, die tournament_date in eine Ausgabedatei schreiben,
    muessen sie benutzen — sonst korrigiert der naechste Lauf die
    Korrektur wieder weg, und zwar still.
    """
    import re
    with open(QUELLE, encoding="utf-8-sig") as f:
        quelle = f.read()
    zeilen = [z for z in quelle.splitlines()
              if re.search(r'"tournament_date":', z)
              and not z.strip().startswith("#")]
    schreibstellen = [z for z in zeilen if "get(" in z or "_datum_mit_override" in z]
    assert schreibstellen, "keine Schreibstelle fuer tournament_date gefunden"
    ohne = [z.strip() for z in schreibstellen
            if "_datum_mit_override" not in z
            and "_datum_mit_override" not in quelle[quelle.index(z):quelle.index(z) + 160]]
    assert not ohne, (
        "diese Schreibstelle(n) umgehen den Override:\n  " + "\n  ".join(ohne))


def test_andere_turniere_bleiben_unberuehrt(jh):
    assert jh._datum_mit_override("540", "6th June 2026") == "6th June 2026"
    assert jh._datum_mit_override("999", "1st January 2026") == "1st January 2026"


def test_das_korrigierte_datum_ist_lesbar(jh):
    """Sonst faellt es aus jedem Datumsfilter heraus."""
    d = jh._parse_english_ordinal_date("12th June 2026")
    assert d is not None and (d.year, d.month, d.day) == (2026, 6, 12)


def test_der_ausgelieferte_bestand_traegt_das_richtige_datum():
    """Nicht nur die Regel — auch die Daten, die heute im Netz stehen."""
    falsch = []
    with open(os.path.join(DATEN, "tournament_cards_data_overview.csv"),
              encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f, delimiter=";"):
            if r["tournament_id"] == "518":
                assert r["tournament_date"] == "12th June 2026", r["tournament_date"]
                assert r["format"] == "TEF-CRI"
    with open(os.path.join(DATEN, "tournament_cards_data_cards_TEF-CRI.csv"),
              encoding="utf-8-sig", newline="") as f:
        for i, r in enumerate(csv.DictReader(f, delimiter=";")):
            if r.get("tournament_id") == "518" and r.get("tournament_date") != "12th June 2026":
                falsch.append(i)
    assert not falsch, f"{len(falsch)} Chunkzeile(n) tragen noch das alte Datum"


def test_das_datum_bleibt_im_tef_cri_fenster():
    """Die Korrektur darf das Turnier nicht aus seinem Format schieben."""
    with open(os.path.join(DATEN, "format_window.json"), encoding="utf-8") as f:
        fw = json.load(f)
    # TEF-CRI lief bis zum Beginn des aktuellen Fensters.
    assert "12th June 2026" and fw["in_person_legal_date"] == "2026-07-31"
    import datetime
    d = datetime.date(2026, 6, 12)
    assert datetime.date(2026, 6, 5) <= d < datetime.date(2026, 7, 31), (
        "das korrigierte Datum liegt nicht mehr im TEF-CRI-Praesenzfenster")
