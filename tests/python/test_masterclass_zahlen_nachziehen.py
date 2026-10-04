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
    kopf = "Online-Meta TEF\u201330C (laufendes Format): 53,8 % Win % nach Matchpunkten"
    # Keine Bilanz -> Gedankenstrich, KEIN geschaetzter Wert.
    klasse, titel, wert, nenner = m.soll_zelle([0, 0, 0], "mcl-wrz", kopf)
    assert wert == "\u2014" and nenner == ""
    assert klasse.endswith("mcl-wrz-leer")
    assert titel.endswith("keine Partien in den Daten")
    # Unter 30 Partien bleibt es eine Bilanz — die Regel, die das Stueck
    # selbst ausspricht.
    assert m.soll_zelle([5, 6, 0], "mcl-wrz", kopf)[2] == "5\u20136\u20130"
    assert m.soll_zelle([14, 14, 0], "mcl-wrz", kopf)[2] == "14\u201314\u20130"
    # Ab 30 eine Quote, und zwar (3S+U)/(3n).
    klasse, titel, wert, nenner = m.soll_zelle([17, 17, 0], "mcl-wrz", kopf)
    assert wert == "50,0 %", wert
    assert nenner == "<i>(34)</i>", nenner
    assert klasse == "mcl-wrz", klasse


def test_die_sprechblase_wird_mitgezogen():
    """BEFUND 23.09.2026: die Zelle traegt die Zahl ZWEIMAL — sichtbar und
    in der Sprechblase. Wer nur die sichtbare nachzieht, hinterlaesst eine
    Sprechblase, die etwas anderes behauptet als der Wert daneben."""
    m = _modul()
    kopf = "Online-Meta TEF\u201330C (laufendes Format): irgendwas Altes"
    _k, titel, wert, _n = m.soll_zelle([17, 17, 0], "mcl-wrz", kopf)
    assert titel.startswith("Online-Meta TEF\u201330C (laufendes Format): ")
    assert wert in titel, "die Sprechblase nennt einen anderen Wert als die Zelle"
    assert "34 Partien" in titel and "17\u201317\u20130" in titel
    # Und der ANFANG bleibt stehen: er benennt die Spalte und stammt nicht
    # aus diesem Skript.
    _k2, titel2, _w2, _n2 = m.soll_zelle(
        [1, 1, 0], "mcl-wrz", "Letzte Pr\u00e4senzturniere, Format X: alt")
    assert titel2.startswith("Letzte Pr\u00e4senzturniere, Format X: ")


def test_die_verschiebung_wird_gerechnet_nicht_gesetzt():
    """Unter 30 Partien nennt die Sprechblase, wie stark eine einzelne
    Partie die Quote verschiebt: 100/n Prozentpunkte, eine Nachkommastelle."""
    m = _modul()
    _k, titel, _w, _n = m.soll_zelle([14, 14, 0], "mcl-wrz", "X: alt")
    assert "3.6 Punkte" in titel, titel
    _k, titel, _w, _n = m.soll_zelle([12, 4, 5], "mcl-wrz", "X: alt")
    assert "4.8 Punkte" in titel, titel


def test_die_spaltenkoepfe_kommen_aus_den_daten():
    """Kein Spaltenname steht im Skript. Er wird abgeleitet — aus dem
    Dateinamen des Scrapers und aus der Spalte `meta` der Majors-Zeilen,
    genau wie in tests/python/test_masterclass_kartennamen.py."""
    m = _modul()
    k = m.koepfe()
    assert k["jetzt"] != k["davor"], "beide Online-Spalten traegen denselben Kopf"
    assert k["majors"].startswith("Majors (")
    assert "\u2013" in k["jetzt"], "der Kopf nutzt den Halbgeviertstrich"
    assert "Jetzt" not in k.values() and "Davor" not in k.values()


@pytest.mark.skipif(not os.path.exists(STUECK), reason="Stueck nicht im Baum")
def test_die_abgeleiteten_koepfe_stehen_auch_wirklich_im_stueck():
    """Die eigentliche Verknuepfung. Laufen Ableitung und Stueck
    auseinander, zieht der Erzeuger keine einzige Zelle nach und meldet
    trotzdem 'nichts zu tun' — genau das ist am 23.09.2026 passiert, als
    die Spalten von Jetzt/Davor/Majors auf die Metanamen umgestellt
    wurden."""
    m = _modul()
    with open(STUECK, encoding="utf-8") as f:
        roh = f.read()
    im_stueck = {z[2] for z in m.ZELLE.findall(roh)}
    for name in m.koepfe().values():
        assert name in im_stueck, (
            f"der abgeleitete Spaltenkopf {name!r} steht nicht im Stueck \u2014 "
            f"dort stehen: {sorted(im_stueck)}")


def test_die_grenze_liegt_bei_dreissig_und_zwar_beidseitig():
    """29 ist eine Bilanz, 30 ist eine Quote. Eine Grenze, die nur von
    einer Seite geprueft ist, ist nicht geprueft."""
    m = _modul()
    assert m.MINDEST_PARTIEN == 30
    assert "\u2013" in m.soll_zelle([15, 14, 0], "mcl-wrz", "X: alt")[2]   # 29 Partien
    assert "%" in m.soll_zelle([15, 15, 0], "mcl-wrz", "X: alt")[2]        # 30 Partien


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
    koepfe = set(m.koepfe().values())
    daten = [z for z in m.ZELLE.findall(roh) if z[2] in koepfe]
    assert len(daten) >= 60, (
        "weniger als drei Datenzellen je Matchup gefunden \u2014 das Zellmuster "
        f"passt nicht (gefunden: {len(daten)} von {len(m.ZELLE.findall(roh))} Zellen)")


@pytest.mark.skipif(not os.path.exists(STUECK), reason="Stueck nicht im Baum")
def test_am_heutigen_stand_ist_nichts_nachzuziehen():
    """Der Arbeitsbaum muss sauber sein: laeuft hier etwas auf, ist das
    Stueck dateiert und der naechste Deploy waere rot."""
    m = _modul()
    with open(STUECK, encoding="utf-8") as f:
        roh = f.read()
    k = m.koepfe()
    quellen = {
        k["jetzt"]: m._online(m.ONLINE_JETZT),
        k["davor"]: m._online(m.ONLINE_DAVOR),
        k["majors"]: m._majors(),
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
    k = m.koepfe()
    quellen = {
        k["jetzt"]: m._online(m.ONLINE_JETZT),
        k["davor"]: m._online(m.ONLINE_DAVOR),
        k["majors"]: m._majors(),
    }
    slugs = m._slugs()
    einmal, _a, _o = m.nachziehen(roh, quellen, slugs)
    zweimal, aend2, _o2 = m.nachziehen(einmal, quellen, slugs)
    assert zweimal == einmal and aend2 == [], "der Erzeuger ist nicht stabil"


# ---------------------------------------------------------------------------
# DAS ERSTE MAJOR IM NEUEN FORMAT (29.09.2026, Wochenlauf #168)
# ---------------------------------------------------------------------------
#
# Brisbane und Frankfurt brachten TEF-30C-Zeilen neben die TEF-PBL-Zeilen.
# Der Erzeuger verlangte "genau ein Format" und brach ab, das Stueck blieb
# stehen, und das Tor fand seine Meta-Anteile veraltet — der ganze
# Wochenlauf wurde nicht gepusht. Beide Zusicherungen fuehren die
# Funktionen aus, an gesetzten Dateien.



def _labs_mu(tmp_path, zeilen):
    p = tmp_path / "labs_tournament_matchups.csv"
    felder = ["meta", "tournaments_used", "my_deck_slug", "day_filter",
              "opponent_deck_slug", "opponent_deck_name", "vs_wins", "vs_losses", "vs_ties"]
    import csv as _csv
    with open(p, "w", encoding="utf-8", newline="") as f:
        w = _csv.DictWriter(f, fieldnames=felder)
        w.writeheader()
        for z in zeilen:
            w.writerow(dict(zip(felder, z)))
    return str(p)


def test_die_majors_spalte_nimmt_das_juengste_format(tmp_path, monkeypatch):
    m = _modul()
    monkeypatch.setattr(m, "LABS_MU", _labs_mu(tmp_path, [
        # Das juengere Format ZUERST: ohne Filter ueberschriebe die spaetere
        # PBL-Zeile die 30C-Zahl — genau das muss rot werden.
        ("TEF-30C", "73,74", m.EIGEN, "overall", "dragapult", "Dragapult", "3", "4", "0"),
        ("TEF-PBL", "71,72", m.EIGEN, "overall", "dragapult", "Dragapult", "10", "5", "1"),
        ("TEF-30C", "73,74", "anderes-deck", "overall", "dragapult", "Dragapult", "9", "9", "9"),
    ]))
    assert m._majors_meta() == "TEF-30C", (
        "die Majors-Spalte nimmt nicht die letzten Majors — oder bricht wie "
        "bis 29.09.2026 am zweiten Format ab")
    assert m._majors() == {"dragapult": [3, 4, 0]}, (
        "die Zahlen der Majors-Spalte mischen die Formate: die Zeile des "
        "aelteren Formats ueberschreibt oder ergaenzt die des juengsten")


def test_der_kopfwechsel_benennt_die_spalte_ueberall_neu(monkeypatch):
    m = _modul()
    monkeypatch.setattr(m, "_majors_turniere", lambda meta: ([73, 74], ["Brisbane", "Frankfurt"]))
    alt = ('<b>Majors (TEF–PBL)</b> sind die letzten Präsenzturniere — die liefen noch '
           'im Format TEF–PBL, ein\nPräsenzturnier im laufenden Format gab es noch nicht. '
           'Alle drei sind gleich.'
           '<span class="mcl-wrz" title="Letzte Präsenzturniere (Worlds und Baltimore), '
           'Format TEF–PBL: 50,6 %"><em>Majors (TEF–PBL)</em><b>50,6 %</b></span>'
           '<code>data/labs_tournament_matchups.csv</code>, Turniere 71 und 72,\nalle Tage.')
    neu, aend = m.majors_umstellen(alt, "TEF-30C", "TEF-30C")
    assert aend, "der Kopfwechsel meldet keine Aenderung"
    assert "PBL" not in neu and "Baltimore" not in neu, (
        "nach dem Kopfwechsel nennt das Stueck noch das alte Format: " + neu)
    assert "gab es noch nicht" not in neu, (
        "die Legende behauptet weiter, es gebe kein Praesenzturnier im "
        "laufenden Format — mit Brisbane und Frankfurt ist das falsch")
    assert neu.count("Majors (TEF–30C)") == 2
    assert "Letzte Präsenzturniere (Brisbane und Frankfurt), Format TEF–30C: " in neu
    assert "Turniere 73 und 74," in neu
    assert m.majors_umstellen(neu, "TEF-30C", "TEF-30C") == (neu, []), (
        "ein zweiter Lauf aendert das Stueck noch einmal")


def test_ein_setwechsel_stellt_die_online_spalten_um():
    """Setwechsel-Probe (PR #893, 01.10.2026): seit DA-20 kommen die Koepfe aus
    format_window.json. Ohne diesen Schritt stuende nach dem naechsten Set im
    Stueck noch TEF\u201330C/TEF\u2013PBL, der Erzeuger braeche ab und das Tor hielte den
    Wochenlauf an. Die Abbildung ist (30C, PBL) -> (ZZN, 30C), nicht zweimal
    30C -> ZZN."""
    m = _modul()
    alt = ('<b>TEF\u201330C</b> ist das laufende Online-Format, <b>TEF\u2013PBL</b> das '
           'Online-Format davor, <b>Majors (TEF\u201330C)</b> sind Majors.'
           '<span class="mcl-wrz" title="Online-Meta TEF\u201330C (laufendes Format): 48,8 %">'
           '<em>TEF\u201330C</em><b>48,8 %</b></span>'
           '<span class="mcl-wrz" title="Online-Meta TEF\u2013PBL (Format davor): 49,4 %">'
           '<em>TEF\u2013PBL</em><b>49,4 %</b></span>'
           '<span class="mcl-wrz" title="Letzte Pr\u00e4senzturniere (X), Format TEF\u201330C: 50 %">'
           '<em>Majors (TEF\u201330C)</em><b>50 %</b></span>'
           '<p class="mcl-quelle">TEF\u201330C (online): <code>data/online_api_matchups_TEF-30C.csv</code>, Stand 2026-09-30 \u00b7\n'
           'TEF\u2013PBL (online): <code>data/online_api_matchups_TEF-PBL.csv</code>, Stand 2026-09-18 \u00b7\n'
           'Majors (TEF\u201330C): <code>data/labs_tournament_matchups.csv</code></p>')
    neu, aend = m.online_umstellen(alt, "TEF\u2013ZZN", "TEF\u201330C")
    assert aend, "der Setwechsel meldet keine Aenderung"
    assert "<b>TEF\u2013ZZN</b> ist das laufende Online-Format, <b>TEF\u201330C</b> das Online-Format davor" in neu
    assert "<em>TEF\u2013ZZN</em><b>48,8 %</b>" in neu and "<em>TEF\u201330C</em><b>49,4 %</b>" in neu, (
        "die Zellen sind nicht um eine Stelle weitergerueckt: " + neu)
    assert 'Online-Meta TEF\u2013ZZN (laufendes Format)' in neu
    assert 'Online-Meta TEF\u201330C (Format davor)' in neu
    assert "online_api_matchups_TEF-ZZN.csv" in neu and "online_api_matchups_TEF-PBL.csv" not in neu
    assert "TEF\u2013PBL" not in neu
    # Die Majors-Spalte gehoert zu majors_umstellen und bleibt unberuehrt.
    assert neu.count("Majors (TEF\u201330C)") == 3
    assert m.online_umstellen(neu, "TEF\u2013ZZN", "TEF\u201330C") == (neu, []), (
        "ein zweiter Lauf aendert das Stueck noch einmal")


def test_am_echten_stueck_rueckt_jede_zelle_mit(tmp_path):
    """Dasselbe am echten Stueck: nach der Umstellung gibt es genauso viele
    Zellen mit dem neuen Kopf wie vorher mit dem alten."""
    m = _modul()
    with open(m.STUECK, encoding="utf-8") as f:
        roh = f.read()
    # Die Koepfe stehen im Stueck selbst (Legende), nicht in format_window.json:
    # das Stueck kann vor oder nach dem Nachziehen stehen.
    jetzt, davor = m.LEGENDE_ONLINE.search(roh).groups()
    n_jetzt = roh.count("<em>%s</em>" % jetzt)
    n_davor = roh.count("<em>%s</em>" % davor)
    assert n_jetzt >= 20 and n_davor >= 20, "das Stueck hat zu wenige Zellen zum Pruefen"
    neu, _ = m.online_umstellen(roh, "TEF\u2013QQQ", jetzt)
    assert neu.count("<em>TEF\u2013QQQ</em>") == n_jetzt
    assert neu.count("<em>%s</em>" % jetzt) == n_davor
    assert "<em>%s</em>" % davor not in neu


# DA-20 (01.10.2026): die Online-Dateien kommen aus format_window.json.
def test_formatfenster_aus_den_daten(tmp_path):
    import importlib.util, json, os
    spec = importlib.util.spec_from_file_location(
        "mc_nz", os.path.join(os.path.dirname(__file__), "..", "..", "scripts", "masterclass_zahlen_nachziehen.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    f = tmp_path / "fw.json"
    f.write_text(json.dumps({"oldest_legal_set": "ABC", "current_set": "XYZ", "previous_format_key": "ABC-QRS"}))
    assert m._formatfenster(str(f)) == ("ABC-XYZ", "ABC-QRS")
    # Verfaelschungsprobe: ein fehlendes Feld bricht ab, statt zu raten
    f.write_text(json.dumps({"oldest_legal_set": "ABC", "current_set": "XYZ"}))
    import pytest
    with pytest.raises(SystemExit):
        m._formatfenster(str(f))
    # die echten Daten ergeben die vorhandenen Dateien
    assert os.path.basename(m.ONLINE_JETZT) == f"online_api_matchups_{m._JETZT}.csv"
    assert os.path.exists(m.ONLINE_JETZT) and os.path.exists(m.ONLINE_DAVOR)
