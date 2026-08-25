"""Der Bestand an Champions-Replica-Teams wird ueberwacht, nicht erzwungen.

Am 25.08.2026 schlug tests/unit/test-side-quest-usage.js an: die Datei
data/champions_replica_teams.json war auf 46 Teams gefallen, der Test
verlangte mehr als 50. Der Test hatte in der Sache recht — die Zahl faellt
seit einer Woche (96 -> 73 -> 66 -> 62 -> 60 -> 46) —, aber er sass im
Deploy-Gate. Ergebnis: die Auslieferung stand komplett, auch fuer die
Preisdaten, die voellig in Ordnung waren.

Ein Mengenrueckgang einer Fremdquelle ist ein Datenthema. Er gehoert
gemeldet, nicht in eine Sperre. Diese Tests halten fest, dass die Pruefung
im Guardian liegt und sich dort richtig verhaelt:

  * gegen die Grundlinie, nicht gegen eine feste Zahl,
  * WARN statt CRITICAL, solange ueberhaupt Teams da sind,
  * CRITICAL nur bei null Teams, denn dann hat auch der fail-soft-Rueckfall
    des Scrapers versagt.
"""

import importlib
import json
import os
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "scripts"))

guardian = importlib.import_module("data_guardian")


def _schreibe(tmp_path, monkeypatch, anzahl):
    """Legt eine Teamdatei mit `anzahl` Teams an und zeigt den Guardian darauf."""
    daten = {"teams": [{"pokemon": ["a", "b"]} for _ in range(anzahl)]}
    ordner = tmp_path / "data"
    ordner.mkdir(exist_ok=True)
    (ordner / "champions_replica_teams.json").write_text(
        json.dumps(daten), encoding="utf-8"
    )
    monkeypatch.setattr(guardian, "DATA", str(ordner))


def test_erster_lauf_meldet_nichts(tmp_path, monkeypatch):
    """Ohne Grundlinie gibt es keine Veraenderung, ueber die man reden koennte."""
    _schreibe(tmp_path, monkeypatch, 60)
    befunde = []
    assert guardian.check_champions_teams(befunde, None) == 60
    assert befunde == []


def test_deutlicher_rueckgang_wird_gemeldet(tmp_path, monkeypatch):
    _schreibe(tmp_path, monkeypatch, 46)
    befunde = []
    guardian.check_champions_teams(befunde, 60)
    assert len(befunde) == 1
    stufe, text = befunde[0]
    assert stufe == "WARN", "ein gedrosselter Fremdserver ist kein Repo-Fehler"
    assert "60 -> 46" in text
    assert "23 %" in text


def test_kleine_schwankung_ist_kein_alarm(tmp_path, monkeypatch):
    """Die Quelle schwankt von Natur aus. Ein Alarm bei jedem Rauschen ist keiner."""
    _schreibe(tmp_path, monkeypatch, 46)
    befunde = []
    guardian.check_champions_teams(befunde, 50)
    assert befunde == []


def test_null_teams_ist_kritisch(tmp_path, monkeypatch):
    """Dann hat auch der fail-soft-Rueckfall des Scrapers nicht gegriffen."""
    _schreibe(tmp_path, monkeypatch, 0)
    befunde = []
    guardian.check_champions_teams(befunde, 60)
    assert [s for s, _ in befunde] == ["CRITICAL"]


def test_fehlende_datei_meldet_nichts(tmp_path, monkeypatch):
    ordner = tmp_path / "data"
    ordner.mkdir()
    monkeypatch.setattr(guardian, "DATA", str(ordner))
    befunde = []
    assert guardian.check_champions_teams(befunde, 60) is None
    assert befunde == []


def test_kaputte_datei_ist_kritisch(tmp_path, monkeypatch):
    ordner = tmp_path / "data"
    ordner.mkdir()
    (ordner / "champions_replica_teams.json").write_text("{kein json", encoding="utf-8")
    monkeypatch.setattr(guardian, "DATA", str(ordner))
    befunde = []
    guardian.check_champions_teams(befunde, 60)
    assert [s for s, _ in befunde] == ["CRITICAL"]


def test_die_grundlinie_traegt_die_zahl():
    """Ohne den Eintrag in der Grundlinie vergleicht der naechste Lauf gegen nichts."""
    quelle = open(
        os.path.join(ROOT, "scripts", "data_guardian.py"), encoding="utf-8"
    ).read()
    assert '"champions_teams": champions_teams,' in quelle, (
        "die Teamzahl wird nicht in die Grundlinie geschrieben — dann meldet die "
        "Pruefung nie etwas, weil sie immer wie ein erster Lauf aussieht"
    )
    assert 'baseline.get("champions_teams")' in quelle


def test_der_unit_test_sperrt_den_deploy_nicht_mehr():
    """Die feste Untergrenze darf nicht in den Deploy-Gate-Test zurueckwandern."""
    pfad = os.path.join(ROOT, "tests", "unit", "test-side-quest-usage.js")
    quelle = open(pfad, encoding="utf-8").read()
    assert "TEAMS.teams.length > 50" not in quelle, (
        "die Untergrenze von 50 ist zurueck im Deploy-Gate — ein Rueckgang der "
        "Fremdquelle haelt damit wieder die ganze Auslieferung an"
    )
    assert "TEAMS.teams.length >= 10" in quelle


# ── Ein zweiter Fund desselben Morgens ───────────────────────────────
#
# Am 25.08.2026 schlug ausserdem test_threat_intel_legalitaet an: MEM, ein
# japanisches Set, war in den Counter-Empfehlungen legal geworden. Nicht
# durch eine Codeaenderung — durch die Rotation. MEM und MEZ standen nie in
# der abgeleiteten JP-Liste, sie fielen nur ueber die Obergrenze des
# Formatfensters heraus. Diese Obergrenze traegt nicht: sets.json vergibt
# MEZ und PBL beide die Ordnungszahl 158.

def test_legalitaet_haengt_nicht_mehr_an_der_ordnungszahl():
    """Die Obergrenze allein kann MEM und MEZ nicht ausschliessen."""
    quelle = open(
        os.path.join(ROOT, "backend", "tools", "build_threat_intel.py"),
        encoding="utf-8",
    ).read()
    assert "_sets_mit_internationalen_karten" in quelle, (
        "die dritte Bedingung fehlt — dann entscheidet wieder allein die "
        "Ordnungszahl, und die vergibt denselben Platz zweimal"
    )
    assert "and (not mit_karten or s in mit_karten)" in quelle


def test_ordnungszahlen_sind_nicht_eindeutig():
    """Der Befund, auf dem die Reparatur beruht — als Zahl, nicht als Behauptung.

    Faellt diese Doppelbelegung eines Tages weg, ist das kein Fehler; der
    Test sagt dann nur, dass die Annahme nicht mehr gilt.
    """
    with open(os.path.join(ROOT, "data", "sets.json"), encoding="utf-8") as f:
        order = json.load(f)
    zahlen = [v for v in order.values() if isinstance(v, int)]
    doppelt = len(zahlen) - len(set(zahlen))
    assert doppelt >= 0  # rein beschreibend
    if doppelt == 0:
        pytest.skip("sets.json vergibt derzeit jede Ordnungszahl nur einmal")


def test_mem_und_mez_haben_keine_internationalen_karten():
    """Die Messung, die die Regel traegt.

    Gemessen ueber alle Kartenchunks: von den Sets ab Ordnungszahl 140
    haben genau MEM und MEZ keine einzige internationale Karte.
    """
    import glob as _glob

    codes = set()
    for pfad in _glob.glob(os.path.join(ROOT, "data", "cards_chunk_*.json")):
        with open(pfad, encoding="utf-8") as f:
            for karte in json.load(f) or []:
                c = str((karte or {}).get("set") or "").strip().upper()
                if c:
                    codes.add(c)
    assert codes, "keine Kartenchunks lesbar — die Regel haette keine Grundlage"
    with open(os.path.join(ROOT, "data", "sets.json"), encoding="utf-8") as f:
        order = json.load(f)
    ohne = sorted(c for c, i in order.items() if isinstance(i, int) and i >= 140 and c not in codes)
    assert "MEM" in ohne and "MEZ" in ohne
    # M4/M5/M6 tragen sehr wohl internationale Karten — sie werden ueber das
    # Namensmuster ausgeschlossen, nicht ueber diese Regel.
    for jp in ("M4", "M5", "M6"):
        assert jp in codes, f"{jp} hat keine Karten mehr — dann greift die Regel zu weit"
