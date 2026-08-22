"""Der Kartentext-Bericht muss zu der Menge passen, die er beschreibt.

BEFUND (22.08.2026): data/card_text_resolution.csv fuehrte 1314 Zeilen,
price_data.csv aber nur noch 1244 Karten mit mapping_status
'unverified'. Der Bericht listet genau diese Menge — je eine Zeile,
entschieden oder nicht.

Nachgemessen war die Differenz KEIN Defekt: 91 Karten sind seit der
letzten Erzeugung von 'unverified' auf 'collision' gewandert, 21 kamen
dazu, macht netto -70. Von 112 Statuswechseln bei den gebliebenen
Karten erklaeren sich 108 durch eine geaenderte current_product_id —
cardmarket_id_mapping.csv wird bei jedem Scrape neu gebaut. Zwei Laeufe
hintereinander liefern Byte fuer Byte dasselbe.

Der eigentliche Befund ist ein anderer: diese Datei erzeugt kein Lauf.
Sie wird von Hand angestossen und committet und driftet zwischen zwei
Anstoessen stumm von den Daten weg, die sie beschreibt. Wer sie liest,
arbeitet eine Landkarte von gestern ab.

Deshalb steht die Pruefung im Waechter (meldet) und nicht im Sanity-Tor
(setzt zurueck): ein veralteter Bericht ist kein Datenverlust.
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


def _schreibe(ordner, unverified, berichtszeilen):
    ordner.mkdir(parents=True, exist_ok=True)
    with io.open(ordner / "price_data.csv", "w", encoding="utf-8", newline="") as f:
        s = csv.writer(f)
        s.writerow(["set", "number", "mapping_status"])
        for i in range(unverified):
            s.writerow(["SVI", str(i), "unverified"])
        for i in range(3):
            s.writerow(["SVI", f"ok{i}", "ok"])
    with io.open(ordner / "card_text_resolution.csv", "w", encoding="utf-8",
                 newline="") as f:
        s = csv.writer(f)
        s.writerow(["set", "number", "status"])
        for i in range(berichtszeilen):
            s.writerow(["SVI", str(i), "ambiguous"])


def _lauf(monkeypatch, ordner):
    monkeypatch.setattr(w, "DATA", str(ordner))
    findings = []
    w.check_kartentext_bericht(findings)
    return findings


def test_gleichstand_meldet_nichts(tmp_path, monkeypatch):
    _schreibe(tmp_path / "d", 1244, 1244)
    assert _lauf(monkeypatch, tmp_path / "d") == []


def test_veralteter_bericht_meldet_sich(tmp_path, monkeypatch):
    """Der gemessene Fall: 1314 gegen 1244."""
    _schreibe(tmp_path / "d", 1244, 1314)
    findings = _lauf(monkeypatch, tmp_path / "d")
    assert len(findings) == 1
    stufe, text = findings[0]
    assert stufe == "WARN", "ein veralteter Bericht ist kein Datenverlust"
    assert "1314" in text and "1244" in text, "beide Zahlen gehoeren genannt"
    assert "+70" in text, f"das Vorzeichen sagt, in welche Richtung: {text}"
    assert "resolve_by_card_text.py" in text, (
        "eine Meldung ohne den Befehl, der sie behebt, kostet den Leser "
        "eine Suche")


def test_zu_kleiner_bericht_meldet_sich_auch(tmp_path, monkeypatch):
    """Die andere Richtung ist der interessantere Fall: neue unverified
    Karten, die im Bericht noch gar nicht vorkommen."""
    _schreibe(tmp_path / "d", 1300, 1244)
    findings = _lauf(monkeypatch, tmp_path / "d")
    assert len(findings) == 1
    assert "-56" in findings[0][1]


def test_fehlende_datei_ist_kein_fehlalarm(tmp_path, monkeypatch):
    """Der Bericht ist optional. Fehlt er, ist das keine Meldung wert —
    sonst schlaegt der Waechter in jedem frischen Klon Alarm."""
    ordner = tmp_path / "d"
    ordner.mkdir()
    assert _lauf(monkeypatch, ordner) == []


def test_pruefung_haengt_im_lauf():
    """Eine Pruefung, die niemand aufruft, ist keine Pruefung."""
    quelle = io.open(os.path.join(WURZEL, "scripts", "data_guardian.py"),
                     encoding="utf-8").read()
    ohne_kommentar = "\n".join(
        z for z in quelle.split("\n") if not z.lstrip().startswith("#"))
    assert "check_kartentext_bericht(findings)" in ohne_kommentar


# Bewusst KEIN Test "Bericht im Repo passt heute zur Grundmenge".
#
# price_data.csv wird taeglich automatisch neu geschrieben, und
# cardmarket_id_mapping.csv wird bei jedem Scrape von Grund auf neu
# gebaut. Die Grundmenge bewegt sich also ohne Zutun — ein harter Test
# darauf waere ab dem naechsten Auto-Commit rot, ohne dass irgendetwas
# kaputt ist. Genau diese Bauart hat am 21.08.2026 schon einmal main rot
# gefaerbt (test-namensbruecke.js gegen ein rollierendes Fenster).
#
# Die Drift gehoert gemeldet, nicht blockiert: dafuer ist
# check_kartentext_bericht da, und der meldet WARN.
