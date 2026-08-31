"""Die Spannen im Pokédex — und ihre Beschreibung.

BEFUND (Agentenrunde 31.08.2026): `_meta.rangeBasis` beschrieb eine
Formel, die nicht benutzt wird. Der Satz behauptete „min = 0 IV". Mit
IV 0 stimmte KEINER der 1450 gespeicherten min-Werte; mit IV 31 stimmen
alle 1450.

  Mega Dragonite, Sp.-Angriff, Basis 145
  gespeichert: 148
  mit IV 31:   floor((2·145+31)·50/100+5) · 0,9 = floor(165 · 0,9) = 148  ✓
  mit IV 0:    floor((2·145+ 0)·50/100+5) · 0,9 = floor(150 · 0,9) = 135  ✗

Die Daten waren richtig, der Text daneben nicht — und die Oberfläche
sagte es sogar korrekt („IS fix 31"). Ein Beschreibungstext, der der
eigenen Datei widerspricht, ist schlimmer als keiner: er lädt zum
Nachrechnen mit der falschen Formel ein.

Diese Datei rechnet die Spannen nach, statt die Beschreibung zu glauben.
"""
import json
import os

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


@pytest.fixture(scope="module")
def dex():
    with open(os.path.join(ROOT, "data", "champions_pokedex.json"), encoding="utf-8") as f:
        return json.load(f)


NICHT_KP = ("atk", "def", "spa", "spd", "spe")


def endwert(basis, iv, sp, wesen):
    """Standardformel, Lv. 50, Nicht-KP."""
    return int(((2 * basis + iv + sp // 4) * 50 // 100 + 5) * wesen)


def kp(basis, iv, sp):
    return (2 * basis + iv + sp // 4) * 50 // 100 + 50 + 10


def test_min_rechnet_mit_is_31_nicht_mit_0(dex):
    """Der Kern des Befunds, in beide Richtungen geprüft."""
    mit31 = mit0 = gesamt = 0
    for e in dex["entries"]:
        for k in NICHT_KP:
            s = e[k]
            gesamt += 1
            if s["min"] == endwert(s["base"], 31, 0, 0.9):
                mit31 += 1
            if s["min"] == endwert(s["base"], 0, 0, 0.9):
                mit0 += 1
    assert gesamt == len(dex["entries"]) * 5
    assert mit31 == gesamt, f"nur {mit31} von {gesamt} min-Werten passen zu IS 31"
    assert mit0 == 0, (
        f"{mit0} min-Werte passen zu IS 0 — dann hätte die alte Beschreibung "
        f"doch recht gehabt, und dieser Test wäre der falsche"
    )


def test_max_rechnet_mit_is_31_und_vollen_sp(dex):
    for e in dex["entries"]:
        for k in NICHT_KP:
            s = e[k]
            assert s["max"] == endwert(s["base"], 31, 252, 1.1), f"{e['en']}/{k}"


def test_lv50_ist_der_neutrale_wert(dex):
    """Die mittlere Zeile jeder Zelle: 0 SP, neutrales Wesen."""
    for e in dex["entries"]:
        for k in NICHT_KP:
            s = e[k]
            assert s["lv50"] == endwert(s["base"], 31, 0, 1.0), f"{e['en']}/{k}"


def test_kp_folgt_der_kp_formel(dex):
    for e in dex["entries"]:
        s = e["hp"]
        assert s["lv50"] == kp(s["base"], 31, 0), e["en"]
        assert s["min"] == kp(s["base"], 31, 0), e["en"]
        assert s["max"] == kp(s["base"], 31, 252), e["en"]


def test_die_beschreibung_nennt_die_formel_die_benutzt_wird(dex):
    """Damit der Text nicht wieder von den Daten wegdriftet."""
    text = dex["_meta"]["rangeBasis"]
    assert "min = IV 31" in text, "die Beschreibung behauptet wieder etwas anderes"
    assert "0 IV" not in text, "der widerlegte Satz ist zurück"
    assert "BOTH bounds" in text or "beiden" in text.lower(), (
        "die Beschreibung muss sagen, dass IS in BEIDEN Grenzen fest ist — "
        "sonst liest man weiter eine Spanne über IS hinein"
    )


def test_summe_und_tankwerte_stimmen(dex):
    """Gegenprobe zu den übrigen abgeleiteten Zahlen."""
    for e in dex["entries"]:
        summe = sum(e[k]["base"] for k in ("hp",) + NICHT_KP)
        assert e["total"] == summe, e["en"]
        assert e["bulkPhys"] == e["hp"]["base"] * e["def"]["base"], e["en"]
        assert e["bulkSpec"] == e["hp"]["base"] * e["spd"]["base"], e["en"]


def test_die_oberflaeche_sagt_dasselbe():
    """Die Legende im Pokédex nennt „IS fix 31" — das war schon richtig."""
    p = os.path.join(ROOT, "js", "app-side-quest-pokedex.js")
    with open(p, encoding="utf-8") as f:
        src = f.read()
    assert "IS fix 31" in src, "die Legende nennt den festen IS-Wert nicht mehr"
    assert "IV fixed 31" in src, "die englische Legende nennt den festen IS-Wert nicht"
