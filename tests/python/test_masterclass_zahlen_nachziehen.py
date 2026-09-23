# -*- coding: utf-8 -*-
"""Der Erzeuger der Masterclass-Zahlen — und die Kette, die ihn traegt.

BEFUND 23.09.2026. masterclass/mega-stalobor.de.html traegt je Matchup drei
Zahlen aus data/online_api_matchups_*.csv und data/labs_tournament_matchups.csv.
tests/python/test_masterclass_kartennamen.py rechnet sie nach — aber niemand
zog sie nach, wenn die Daten wuchsen. Am 23.09.2026 standen 52 Partien gegen
Dragapult im Stueck und 66 in der Datei; der Deploy hing an sechzehn Zellen.

scripts/masterclass_zahlen_nachziehen.py ist der fehlende Erzeuger. Damit er
wirkt, muessen DREI Dinge stimmen, und alle drei stehen hier:

  1. Er laeuft in dem Ablauf, der seine EINGABE schreibt.
  2. Sein Ergebnis steht in der `git add`-Liste dieses Ablaufs — sonst wird
     es mit dem Laeufer weggeworfen (genau die Falle, die
     data/champions_move_flags.json sieben Tage lang erwischt hat).
  3. Er rechnet nach DERSELBEN Konvention wie die Zusicherung, und er
     erfindet nichts: keine Bilanz -> Gedankenstrich, unter 30 Partien ->
     Bilanz statt Quote.
"""

import importlib.util
import os
import re
import sys

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
SKRIPT = os.path.join(WURZEL, "scripts", "masterclass_zahlen_nachziehen.py")
ABLAUF = os.path.join(WURZEL, ".github", "workflows", "limitless-api-scrape.yml")
STUECK = os.path.join(WURZEL, "masterclass", "mega-stalobor.de.html")


def _modul():
    spec = importlib.util.spec_from_file_location("mcl_nachziehen", SKRIPT)
    m = importlib.util.module_from_spec(spec)
    sys.modules["mcl_nachziehen"] = m
    spec.loader.exec_module(m)
    return m


def _ablauf():
    with open(ABLAUF, encoding="utf-8") as f:
        return f.read()


def test_der_erzeuger_laeuft_in_dem_ablauf_der_seine_eingabe_schreibt():
    text = _ablauf()
    assert "scripts/masterclass_zahlen_nachziehen.py" in text, (
        "der Erzeuger ist in limitless-api-scrape.yml nicht verdrahtet — "
        "dann zieht niemand das Stueck nach, wenn die CSVs wachsen")
    # Und er muss NACH dem Scrape stehen, sonst rechnet er mit dem
    # Vortagesstand. Gemessen an der Reihenfolge im Ablauf.
    assert text.index("online_api_matchups") < text.index(
        "scripts/masterclass_zahlen_nachziehen.py"), (
        "der Erzeuger steht vor dem Schritt, der seine Eingabe schreibt")


def test_das_stueck_steht_in_der_commitliste_dieses_ablaufs():
    text = _ablauf()
    assert re.search(r"git add\s+masterclass/mega-stalobor\.de\.html", text), (
        "das Stueck fehlt in der `git add`-Liste — der Schritt waere "
        "wirkungslos, genau wie bei champions_move_flags.json am 23.09.2026")


def test_er_erfindet_nichts():
    m = _modul()
    # Keine Bilanz -> Gedankenstrich, KEIN geschaetzter Wert.
    assert m.soll_zelle([0, 0, 0]) == ("—", "")
    # Unter 30 Partien bleibt es eine Bilanz — die Regel, die das Stueck
    # selbst ausspricht.
    assert m.soll_zelle([5, 6, 0])[0] == "5–6–0"
    assert m.soll_zelle([14, 14, 0])[0] == "14–14–0"
    # Ab 30 eine Quote, und zwar (3S+U)/(3n).
    wert, nenner = m.soll_zelle([17, 17, 0])
    assert wert == "50,0 %", wert
    assert nenner == "<i>(34)</i>", nenner


def test_die_grenze_liegt_bei_dreissig_und_zwar_beidseitig():
    """29 ist eine Bilanz, 30 ist eine Quote. Eine Grenze, die nur von
    einer Seite geprueft ist, ist nicht geprueft."""
    m = _modul()
    assert m.MINDEST_PARTIEN == 30
    assert "–" in m.soll_zelle([15, 14, 0])[0]     # 29 Partien
    assert "%" in m.soll_zelle([15, 15, 0])[0]     # 30 Partien


def test_die_konvention_ist_die_des_hauses():
    """Dieselbe Formel wie js/win-rate-konvention.js und wie die
    Zusicherung. Eine zweite Formel waere eine vierte Konvention."""
    m = _modul()
    assert m._matchpunkte(1, 0, 0) == 100.0
    assert m._matchpunkte(0, 1, 0) == 0.0
    # Ein Unentschieden zaehlt einen von drei Punkten, nicht einen halben.
    assert m._matchpunkte(0, 0, 3) == pytest.approx(100 / 3)
    assert m._matchpunkte(0, 0, 0) is None


def test_der_tausenderpunkt_ist_der_des_stuecks():
    m = _modul()
    assert m._tausender(1053) == "1.053"
    assert m._tausender(66) == "66"


@pytest.mark.skipif(not os.path.exists(STUECK), reason="Stueck nicht im Baum")
def test_das_muster_findet_die_bloecke_wirklich():
    """VERFAELSCHUNGSPROBE. Faende das Muster nichts, meldete das Skript
    "alle Zahlen stehen wie die Rohdaten" — und waere dabei blind. Genau
    deshalb bricht es unter 20 Bloecken ab statt gruen zu melden."""
    m = _modul()
    with open(STUECK, encoding="utf-8") as f:
        roh = f.read()
    assert len(m.BLOCK.findall(roh)) >= 20
    assert len(m.ZELLE.findall(roh)) >= 60, (
        "weniger als drei Zellen je Matchup gefunden — das Zellmuster passt nicht")
    # Und die Koepfe muessen die sein, die das Stueck traegt: seit dem
    # 23.09.2026 heissen sie nach ihrem Meta. Ein Muster, das auf
    # "Jetzt"/"Davor" wartet, faende hier nichts mehr.
    koepfe = {t[1] for t in m.ZELLE.findall(roh)}
    assert m.KOPF_JETZT in koepfe, (
        "der Kopf des laufenden Metas (%s) kommt im Stueck nicht vor" % m.KOPF_JETZT)
    assert any(k.startswith("Majors (") for k in koepfe), (
        "die Majors-Spalte nennt ihr Format nicht in Klammern: %s" % sorted(koepfe))


@pytest.mark.skipif(not os.path.exists(STUECK), reason="Stueck nicht im Baum")
def test_am_heutigen_stand_ist_nichts_nachzuziehen():
    """Der Arbeitsbaum muss sauber sein: laeuft hier etwas auf, ist das
    Stueck dateiert und der naechste Deploy waere rot."""
    m = _modul()
    with open(STUECK, encoding="utf-8") as f:
        roh = f.read()
    quellen = {
        "jetzt": m._online(m.ONLINE_JETZT),
        "davor": m._online(m.ONLINE_DAVOR),
        "major": m._majors(),
    }
    _neu, aenderungen, _ohne = m.nachziehen(roh, quellen, m._slugs())
    assert aenderungen == [], (
        "das Stueck steht anders da als die Rohdaten — nachziehen mit "
        "'python3 scripts/masterclass_zahlen_nachziehen.py':\n  "
        + "\n  ".join(aenderungen))


@pytest.mark.skipif(not os.path.exists(STUECK), reason="Stueck nicht im Baum")
def test_zweimal_nachziehen_aendert_nichts_mehr():
    """Ein Erzeuger, der bei jedem Lauf etwas anderes schreibt, erzeugt
    jede Nacht einen Commit und niemand sieht mehr, wann sich wirklich
    etwas geaendert hat."""
    m = _modul()
    with open(STUECK, encoding="utf-8") as f:
        roh = f.read()
    quellen = {
        "jetzt": m._online(m.ONLINE_JETZT),
        "davor": m._online(m.ONLINE_DAVOR),
        "major": m._majors(),
    }
    slugs = m._slugs()
    einmal, _a, _o = m.nachziehen(roh, quellen, slugs)
    zweimal, aend2, _o2 = m.nachziehen(einmal, quellen, slugs)
    assert zweimal == einmal and aend2 == [], "der Erzeuger ist nicht stabil"
