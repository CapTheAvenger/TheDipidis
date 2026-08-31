"""Floette: eine Roster-Zeile, die sich selbst widersprach.

BEFUND (31.08.2026, beim Umstellen der Sprites): der Roster von
otterlyclueless fuehrt Floette mit 54/45/47/75/98/52 und Mega Floette
mit 74/85/87/155/148/102 — beide als championsVerified. Beides zusammen
kann nicht stimmen: eine Mega-Entwicklung aendert die Basis-KP NIE,
hier waeren es +20.

Welche Zeile ist die falsche? Zwei unabhaengige Belege sagen 74:

  * Die Mega-Zeile deckt sich Stat fuer Stat mit Smogons Floette-Mega.
  * Smogons Floette-Ewigbluetler ist 74/65/67/125/128/92; plus
    (0/+20/+20/+30/+20/+10) ergibt genau diese Mega-Werte.

Drittes Indiz von aussen: pokewiki fuehrt fuer Champions nur zwei
Floette-Icons, 670e (Ewigbluetler) und 670m1 (Mega). Eine gewoehnliche
Floette gibt es dort nicht.

Aufgefallen ist das NUR, weil fuer die Sprites geklaert werden musste,
welche Floette-Form Champions ueberhaupt fuehrt. Diese Datei prueft
darum nicht die Zahl 74, sondern die REGEL dahinter — sie gilt fuer
jede Mega-Form im Kader und bleibt richtig, wenn der Roster upstream
korrigiert wird.
"""
import json
import os
import re

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, "data")


@pytest.fixture(scope="module")
def dex():
    with open(os.path.join(DATA, "champions_pokedex.json"), encoding="utf-8") as f:
        return json.load(f)["entries"]


def grundform(en):
    return re.sub(r"\s+[XY]$", "", re.sub(r"^Mega\s+", "", en)).strip()


def test_keine_mega_form_aendert_die_basis_kp(dex):
    """Die Regel, nicht der Einzelfall.

    Haette es diese Zusicherung am 30.08. schon gegeben, waere die
    Floette-Zeile beim ersten Lauf aufgefallen statt vier Wochen
    spaeter durch Zufall.
    """
    nach_en = {e["en"]: e for e in dex}
    schief = []
    for e in dex:
        if e.get("form") != "Mega":
            continue
        g = nach_en.get(grundform(e["en"]))
        if not g:
            continue
        if g["hp"]["base"] != e["hp"]["base"]:
            schief.append(f"{e['en']}: {e['hp']['base']} KP, "
                          f"Grundform {g['en']}: {g['hp']['base']} KP")
    assert schief == [], (
        "eine Mega-Entwicklung aendert die Basis-KP nie:\n  " + "\n  ".join(schief))


def test_jede_mega_form_legt_genau_100_basiswertpunkte_zu(dex):
    """Zweite Fassung derselben Frage, von der anderen Seite.

    Die KP-Regel allein wuerde eine vertauschte Grundform durchlassen,
    solange die KP zufaellig passen. Der Basiswertzuwachs faengt das:
    ueber alle 70 Mega-Formen im Kader sind es ausnahmslos +100.

    (Ein frueherer Entwurf verlangte hier, kein Wert duerfe SINKEN. Das
    ist schlicht falsch — Mega Garchomp verliert Initiative, Mega
    Skarmory Verteidigung, Mega Abomasnow 30 Punkte Initiative. Der
    Test hat die eigene Fehlannahme gefangen, bevor sie eingecheckt
    wurde; die Notiz bleibt stehen, damit sie niemand zurueckbaut.)
    """
    nach_en = {e["en"]: e for e in dex}
    schief = []
    geprueft = 0
    for e in dex:
        if e.get("form") != "Mega":
            continue
        g = nach_en.get(grundform(e["en"]))
        if not g:
            continue
        geprueft += 1
        if e["total"] - g["total"] != 100:
            schief.append(f"{e['en']}: {g['total']} -> {e['total']} "
                          f"({e['total'] - g['total']:+d})")
    assert geprueft > 50, f"nur {geprueft} Mega-Formen geprueft"
    assert schief == [], "\n  ".join([""] + schief)


def test_floette_traegt_die_werte_der_ewigbluetler(dex):
    """Der Einzelfall, namentlich — damit die Korrektur nicht
    unbemerkt zurueckgedreht wird."""
    e = next(x for x in dex if x["en"] == "Floette")
    ist = {k: e[k]["base"] for k in ("hp", "atk", "def", "spa", "spd", "spe")}
    assert ist == {"hp": 74, "atk": 65, "def": 67, "spa": 125, "spd": 128, "spe": 92}
    # Der Name bleibt schlicht "Floette" — so heisst sie im Spiel.
    assert e["de"] == "Floette"


def test_die_korrektur_kommt_aus_smogon_nicht_von_hand():
    """Eine Zahl, die jemand ins JSON getippt hat, ueberlebt den
    naechsten Bau nicht. Die Werte muessen aus einer Quelle kommen."""
    with open(os.path.join(ROOT, "scripts", "build_champions_pokedex.py"),
              encoding="utf-8") as f:
        q = f.read()
    assert "ROSTER_WERTE_AUS_SMOGON" in q
    assert '"Floette": "Floette-Eternal"' in q
    anwendung = q[q.index("if name in ROSTER_WERTE_AUS_SMOGON"):]
    anwendung = anwendung[:anwendung.index("entry = {")]
    assert "baseStats" in anwendung, "die Smogon-Werte werden nicht uebernommen"
    for k in ("hp", "atk", "def", "spa", "spd", "spe"):
        assert f'"{k}"' in anwendung, f"{k} wird nicht ersetzt"


def test_die_smogon_quelle_stuetzt_die_korrektur():
    """Gegenprobe an den Daten selbst: die Rechnung muss aufgehen."""
    with open(os.path.join(DATA, "pokemon_battle_data.json"), encoding="utf-8") as f:
        sm = json.load(f)
    ewig = sm["Floette-Eternal"]["baseStats"]
    mega = sm["Floette-Mega"]["baseStats"]
    normal = sm["Floette"]["baseStats"]
    assert ewig["hp"] == mega["hp"], "Ewigbluetler und Mega muessen dieselben KP haben"
    assert normal["hp"] != mega["hp"], (
        "die gewoehnliche Floette passt nicht zur Mega — genau der Befund")
    for k in ("atk", "def", "spa", "spd", "spe"):
        assert mega[k] >= ewig[k]
