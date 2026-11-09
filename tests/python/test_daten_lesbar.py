"""Jede Datei unter data/ laesst sich lesen (SC-50, Pruefagent S5, 09.11.2026).

Seit der festen Sperrliste gehen nicht sperrende Befunde durch. Eine
abgeschnittene JSON-Datei war bisher nur zufaellig gefangen: in einer
JS-Testdatei endet `JSON.parse` als normaler Fehlschlag ("1 failure"),
also als Befund — und auf der Seite wirft dann `fetch().json()` und die
Ansicht bleibt leer. Der Vertragstest prueft nur Dasein und Spalten der
dokumentierten Dateien, der Schrumpf-Waechter nur die Groesse.

Diese Pruefung haelt keinen Zustand der Welt fest: eine Datei, die sich
nicht parsen laesst, ist immer kaputt. Deshalb steht sie auf der Sperrliste.
"""
import csv
import json
import os

import pytest

WURZEL = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
DATA = os.path.join(WURZEL, "data")


def _dateien(endung):
    raus = []
    for ort, _ordner, namen in os.walk(DATA):
        for n in namen:
            if n.endswith(endung):
                raus.append(os.path.relpath(os.path.join(ort, n), WURZEL))
    return sorted(raus)


def test_jede_json_datei_laesst_sich_lesen():
    kaputt = []
    for pfad in _dateien(".json"):
        try:
            with open(os.path.join(WURZEL, pfad), encoding="utf-8") as f:
                json.load(f)
        except (ValueError, UnicodeDecodeError) as e:
            kaputt.append(f"{pfad}: {e}"[:200])
    assert kaputt == [], "nicht lesbar:\n  " + "\n  ".join(kaputt)


def test_jede_csv_datei_hat_eine_kopfzeile():
    kaputt = []
    for pfad in _dateien(".csv"):
        try:
            with open(os.path.join(WURZEL, pfad), encoding="utf-8-sig", newline="") as f:
                kopf = next(csv.reader(f, delimiter=";" if "online_api" in pfad else ","), [])
        except (UnicodeDecodeError, csv.Error) as e:
            kaputt.append(f"{pfad}: {e}"[:200])
            continue
        if not any(k.strip() for k in kopf):
            kaputt.append(f"{pfad}: leer oder ohne Kopfzeile")
    assert kaputt == [], "nicht lesbar:\n  " + "\n  ".join(kaputt)


def test_eine_abgeschnittene_datei_wird_erkannt(tmp_path, monkeypatch):
    (tmp_path / "x.json").write_text('{"a": [1, 2')
    (tmp_path / "y.csv").write_text("")
    import sys
    modul = sys.modules[__name__]
    monkeypatch.setattr(modul, "DATA", str(tmp_path))
    monkeypatch.setattr(modul, "WURZEL", str(tmp_path))
    with pytest.raises(AssertionError):
        test_jede_json_datei_laesst_sich_lesen()
    with pytest.raises(AssertionError):
        test_jede_csv_datei_hat_eine_kopfzeile()
