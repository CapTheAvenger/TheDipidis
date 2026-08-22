"""Die Kennzahl, die zaehlt: Preiszuordnungen der GESPIELTEN Karten.

BEFUND (22.08.2026): der Waechter meldete taeglich "1.244 von 20.419
Preiszeilen haben eine unbestaetigte Produktzuordnung, 310 davon ueber
5 EUR". Die Zahl stimmt und ist trotzdem irrefuehrend — sie laesst den
Leser die falsche Groesse sehen.

Nachgemessen: von den 1.244 standen genau **28** in einer Deckliste des
laufenden Formats. Die anderen 1.216 sind alte Karten. Eine Meldung, die
ein Problem 44-mal groesser darstellt als es ist, wird nach dem dritten
Mal ueberblaettert — und dann faellt auch der Tag nicht auf, an dem
wirklich etwas passiert.

Diese Pruefung zaehlt deshalb nur Karten aus current_meta_card_data.csv.
Die acht MEE-Grundenergien stehen getrennt (INFO), weil sie ein
bekannter Fall sind: Cardmarket fuehrt fuer MEE keine eigene Expansion.
Wuerden sie mitgezaehlt, verdeckten sie dauerhaft den Fall, der neu
waere.
"""

import csv
import io
import os
import sys

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
sys.path.insert(0, os.path.join(WURZEL, "scripts"))

import data_guardian as w  # noqa: E402


def _ordner(tmp_path, meta_karten, preis_zeilen):
    d = tmp_path
    d.mkdir(parents=True, exist_ok=True)
    with io.open(d / "current_meta_card_data.csv", "w", encoding="utf-8",
                 newline="") as f:
        s = csv.writer(f, delimiter=";")
        s.writerow(["archetype", "card_name", "set_code", "set_number"])
        for sc, nr in meta_karten:
            s.writerow(["Deck", "X", sc, nr])
    with io.open(d / "price_data.csv", "w", encoding="utf-8", newline="") as f:
        s = csv.writer(f)
        s.writerow(["name", "set", "number", "mapping_status"])
        for sc, nr, st in preis_zeilen:
            s.writerow(["X", sc, nr, st])
    return d


def _lauf(monkeypatch, ordner):
    monkeypatch.setattr(w, "DATA", str(ordner))
    findings = []
    w.check_meta_preiszuordnung(findings)
    return findings


def test_alles_bestaetigt_meldet_nichts(tmp_path, monkeypatch):
    d = _ordner(tmp_path / "a", [("SSP", "76")], [("SSP", "76", "ok")])
    assert _lauf(monkeypatch, d) == []


def test_alte_karte_ausserhalb_des_metas_zaehlt_nicht(tmp_path, monkeypatch):
    """Der eigentliche Punkt: 1.216 alte Karten duerfen die Meldung nicht
    aufblaehen."""
    d = _ordner(tmp_path / "b", [("SSP", "76")],
                [("SSP", "76", "ok"), ("BS", "4", "unverified"),
                 ("UF", "J", "unverified")])
    assert _lauf(monkeypatch, d) == []


def test_gespielte_karte_ohne_bestaetigung_meldet_sich(tmp_path, monkeypatch):
    d = _ordner(tmp_path / "c", [("SSP", "76"), ("TWM", "25")],
                [("SSP", "76", "unverified"), ("TWM", "25", "ok")])
    findings = _lauf(monkeypatch, d)
    assert [lvl for lvl, _ in findings] == ["WARN"]
    text = findings[0][1]
    assert "SSP 76" in text, "die Karte gehoert benannt, nicht nur gezaehlt"
    assert "1 von 2" in text, f"Anteil statt nackter Zahl: {text}"
    assert "cardmarket_mapping_manual.csv" in text, (
        "eine Meldung ohne den Weg zur Behebung kostet den Leser eine Suche")


def test_kollision_zaehlt_auch(tmp_path, monkeypatch):
    """collision ist kein 'ok'. TWM-17/18 standen darauf, weil ihre
    Illustrationsvarianten ihnen die Produkt-ID weggenommen hatten."""
    d = _ordner(tmp_path / "d", [("TWM", "17")], [("TWM", "17", "collision")])
    assert [lvl for lvl, _ in _lauf(monkeypatch, d)] == ["WARN"]


def test_mee_energien_stehen_getrennt(tmp_path, monkeypatch):
    """Bekannter Fall, Centbetraege — INFO statt WARN, damit sie den
    naechsten echten Fall nicht verdecken."""
    d = _ordner(tmp_path / "e", [("MEE", str(i)) for i in range(1, 9)],
                [("MEE", str(i), "collision") for i in range(1, 9)])
    findings = _lauf(monkeypatch, d)
    assert [lvl for lvl, _ in findings] == ["INFO"]
    assert "MEE" in findings[0][1]


def test_mee_verdeckt_den_echten_fall_nicht(tmp_path, monkeypatch):
    """Beides gleichzeitig: die Energien duerfen die eine echte Karte
    nicht schlucken."""
    d = _ordner(tmp_path / "f",
                [("MEE", str(i)) for i in range(1, 9)] + [("SSP", "76")],
                [("MEE", str(i), "collision") for i in range(1, 9)]
                + [("SSP", "76", "unverified")])
    stufen = [lvl for lvl, _ in _lauf(monkeypatch, d)]
    assert stufen == ["WARN", "INFO"]


def test_leere_metaliste_meldet_sich(tmp_path, monkeypatch):
    """Sonst sieht ein kaputter Meta-Scraper aus wie 'alles sauber'."""
    d = _ordner(tmp_path / "g", [], [("SSP", "76", "unverified")])
    findings = _lauf(monkeypatch, d)
    assert [lvl for lvl, _ in findings] == ["WARN"]
    assert "laeuft ins Leere" in findings[0][1]


def test_pruefung_haengt_im_lauf():
    quelle = io.open(os.path.join(WURZEL, "scripts", "data_guardian.py"),
                     encoding="utf-8").read()
    ohne_kommentar = "\n".join(
        z for z in quelle.split("\n") if not z.lstrip().startswith("#"))
    assert "check_meta_preiszuordnung(findings)" in ohne_kommentar
