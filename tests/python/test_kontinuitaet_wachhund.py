"""512 Zeilen sind keine Turniergroesse, sondern eine Deckelung.

BEFUND (06.09.2026). data/player_continuity.csv fuehrte elf von zwoelf
Turnieren mit exakt 512 Zeilen — auch das mit 3743 und das mit 1434
gemeldeten Teilnehmern. 512 ist die Zahl, bis zu der labs seine
Standings-Seite ausliefert ("top 512 filter ON"); alles darunter liegt
in einem JSON-Block daneben, den ein Parser ohne JavaScript nicht
anfasst.

Der Waechter hat das nie gemeldet, weil er nur Zeilenzahlen GEGEN SICH
SELBST vergleicht (Schrumpfung gegen die Grundlinie). Eine Datei, die
seit ihrer ersten Zeile zu kurz ist, schrumpft nie.

Was hier geprueft wird, ist deshalb kein absoluter Schwellwert — der
Modulkommentar des Waechters warnt zu Recht davor —, sondern der
Abgleich JE TURNIER gegen die Teilnehmerzahl, die die Quelle selbst
nennt. Ein Turnier mit 485 Teilnehmern und 485 Zeilen ist vollstaendig;
eines mit 3743 Teilnehmern und 512 Zeilen ist es nicht, egal wie gross
die absolute Zahl aussieht.
"""
import importlib.util
import json
import os

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _guardian():
    pfad = os.path.join(ROOT, "scripts", "data_guardian.py")
    spec = importlib.util.spec_from_file_location("guardian_kontinuitaet", pfad)
    modul = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modul)
    return modul


def _lege_an(tmp_path, monkeypatch, g, turniere, zeilen):
    ordner = tmp_path / "data"
    ordner.mkdir(exist_ok=True)
    (ordner / "labs_tournaments.json").write_text(
        json.dumps(turniere), encoding="utf-8")
    kopf = "tournament_id,place,player_name,player_id\n"
    leib = "".join("%s,%d,S%d,%s\n" % (t, i + 1, i, p)
                   for (t, n, p) in zeilen for i in range(n))
    (ordner / "player_continuity.csv").write_text(kopf + leib, encoding="utf-8")
    monkeypatch.setattr(g, "DATA", str(ordner))


def _kritisch(findings):
    return [m for (stufe, m) in findings if stufe == "CRITICAL"]


def _warnungen(findings):
    return [m for (stufe, m) in findings if stufe == "WARN"]


TURNIERE = [
    {"tournament_id": "0070", "total_players": 3743},
    {"tournament_id": "0067", "total_players": 485},
]


def test_der_gemessene_befund_wird_kritisch(tmp_path, monkeypatch):
    """Genau die Lage vom 06.09.2026: 512 Zeilen bei 3743 Teilnehmern."""
    g = _guardian()
    _lege_an(tmp_path, monkeypatch, g, TURNIERE,
             [("0070", 512, "1"), ("0067", 485, "1")])
    findings = []
    g.check_kontinuitaet_vollstaendig(findings)
    kritisch = _kritisch(findings)
    assert len(kritisch) == 1, findings
    assert "0070: 512/3743" in kritisch[0]
    assert "0067" not in kritisch[0], (
        "Das kleine Turnier ist vollstaendig — es darf nicht mitgemeldet "
        "werden, sonst ist die Meldung wieder Rauschen.")
    assert "3231" in kritisch[0], "Die Zahl der fehlenden Spieler muss dastehen."


def test_vollstaendige_datei_meldet_nichts(tmp_path, monkeypatch):
    g = _guardian()
    _lege_an(tmp_path, monkeypatch, g, TURNIERE,
             [("0070", 3743, "1"), ("0067", 485, "1")])
    findings = []
    g.check_kontinuitaet_vollstaendig(findings)
    assert findings == [], findings


def test_kleine_abweichung_ist_kein_befund(tmp_path, monkeypatch):
    """labs zaehlt im Seitenkopf gelegentlich ein paar Spieler mehr."""
    g = _guardian()
    _lege_an(tmp_path, monkeypatch, g, TURNIERE,
             [("0070", 3600, "1"), ("0067", 485, "1")])
    findings = []
    g.check_kontinuitaet_vollstaendig(findings)
    assert _kritisch(findings) == []


def test_zeilen_ohne_schluessel_werden_gemeldet(tmp_path, monkeypatch):
    """Der HTML-Rueckfallweg liefert keine player_id.

    CLAUDE.md, "Data rules": *Never join card data by name.* Ueber
    Turniergrenzen hinweg ist das bei Spielern dieselbe Falle."""
    g = _guardian()
    _lege_an(tmp_path, monkeypatch, g, TURNIERE,
             [("0070", 3743, ""), ("0067", 485, "1")])
    findings = []
    g.check_kontinuitaet_vollstaendig(findings)
    warn = _warnungen(findings)
    assert len(warn) == 1
    assert "player_id" in warn[0]
    assert "3743" in warn[0]


def test_ohne_dateien_schweigt_die_pruefung(tmp_path, monkeypatch):
    g = _guardian()
    leer = tmp_path / "leer"
    leer.mkdir()
    monkeypatch.setattr(g, "DATA", str(leer))
    findings = []
    g.check_kontinuitaet_vollstaendig(findings)
    assert findings == []


def test_unbekanntes_turnier_wird_nicht_geraten(tmp_path, monkeypatch):
    """Steht ein tid nicht im Index, ist seine Sollgroesse unbekannt.
    Dann wird nichts behauptet."""
    g = _guardian()
    _lege_an(tmp_path, monkeypatch, g, TURNIERE,
             [("0070", 3743, "1"), ("0067", 485, "1"), ("0060", 12, "1")])
    findings = []
    g.check_kontinuitaet_vollstaendig(findings)
    assert _kritisch(findings) == []


def test_die_pruefung_haengt_im_lauf(tmp_path, monkeypatch):
    """Eine Pruefung, die niemand aufruft, ist keine Pruefung.

    Genau das war der Herzschlag-Befund vom 04.09.: die Datei war da,
    der Aufruf fehlte."""
    quelle = open(os.path.join(ROOT, "scripts", "data_guardian.py"),
                  encoding="utf-8").read()
    assert "    check_kontinuitaet_vollstaendig(findings)\n" in quelle
