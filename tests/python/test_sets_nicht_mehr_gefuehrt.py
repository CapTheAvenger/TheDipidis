"""DA-6: M4 und M5 werden nicht mehr gefuehrt — aber nichts loest sich auf.

Entscheidung Hausi (26.09.2026): M4 und M5 werden nicht mehr gefuehrt.
Auflage: nichts wegnehmen, was eine bestehende Ansicht oder ein
gespeichertes Deck aufloest. Gespeicherte Decks und Binder liegen in
Firestore und sind von hier aus NICHT GEPRUEFT — deshalb: nicht mehr
abrufen, aber die Datensaetze behalten (benannt und datiert in
data/sets_nicht_mehr_gefuehrt.json).
"""
import csv
import json
import os
import sys

import pytest

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATEN = os.path.join(WURZEL, "data")


def _liste():
    with open(os.path.join(DATEN, "sets_nicht_mehr_gefuehrt.json"), encoding="utf-8") as f:
        return json.load(f)["sets"]


def test_jeder_eintrag_ist_datiert_und_begruendet():
    liste = _liste()
    assert {"M4", "M5"} <= set(liste)
    for code, e in liste.items():
        assert e.get("seit") and len(e.get("grund", "")) > 40, code


@pytest.fixture(scope="module")
def jp():
    sys.path.insert(0, os.path.join(WURZEL, "backend", "scrapers"))
    sys.path.insert(0, os.path.join(WURZEL, "backend", "core"))
    return pytest.importorskip("japanese_cards_scraper")


def test_der_scraper_ruft_sie_nicht_mehr_ab(jp, monkeypatch):
    monkeypatch.setitem(jp.SETTINGS, "keep_latest_sets", 12)
    karten = [{"set": s, "number": "1", "name": "x"} for s in ("M6A", "M6", "M5", "M4", "M3")]
    _, ziel = jp.filter_latest_sets(karten)
    assert "M4" not in ziel and "M5" not in ziel, ziel
    assert "M6" in ziel, "die Sperre darf nicht alles wegwerfen"


def test_die_datensaetze_bleiben_zum_aufloesen(jp):
    """Ein Lauf, der M4/M5 nicht abruft, darf ihre Zeilen nicht verlieren."""
    alt = [{"set": "M4", "number": "1"}, {"set": "M5", "number": "2"}, {"set": "M6", "number": "3"}]
    neu = [{"set": "M6", "number": "3"}]
    zeilen, _, behalten = jp.merge_rows(alt, neu)
    assert {"M4", "M5"} <= behalten
    assert {(z["set"], z["number"]) for z in zeilen} >= {("M4", "1"), ("M5", "2")}
    with open(os.path.join(DATEN, "japanese_cards_database.csv"), encoding="utf-8-sig") as f:
        im_bestand = {z["set"] for z in csv.DictReader(f)}
    assert {"M4", "M5"} <= im_bestand, "die Datensaetze sind aus dem Bestand verschwunden"
