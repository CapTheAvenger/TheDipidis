# -*- coding: utf-8 -*-
"""Der Nachzieher fuer die Gruppe "Online · letzte 7 Tage".

BESTELLUNG (23.09.2026): "Die Masterclass unbedingt auf den Wochenlauf
haengen, damit ich immer die aktuellsten Daten habe."

Ein Erzeuger, der in ein 600 KB grosses Stueck schreibt, kann mehr
kaputtmachen als er nuetzt. Was hier beissen soll:

  1. Er schreibt nur, was er belegen kann — unbekannte Karte, mehr als
     fuenf Listen, fehlende Gruppe: NICHTS wird geschrieben. Weniger
     Listen heissen seit 30.09.2026 weniger Plaetze (DA-26).
  2. Er fasst nur die Online-Gruppe an. Tims Listen, die Worlds-Listen,
     die Matchups und die Ausarbeitung bleiben Zeichen fuer Zeichen.
  3. Er ist stabil: zweimal laufen aendert beim zweiten Mal nichts.
  4. Der heutige Stand ist nachgezogen — sonst waere das Stueck
     dateiert und niemand saehe es.

UMZUG 17.10.2026: das Stueck liegt nur noch in Hausis Konto. Der Erzeuger
schreibt den Schluessel `online_listen` in
data/masterclass_live/mega-stalobor.json; das Einsetzen in die Gruppe
(Kacheln mit Tims Begruendung, Unterschied zu Tims Liste, weniger Listen =
weniger Plaetze, Gruppe bleibt bei unbekannter Karte stehen) prueft
tests/unit/test-masterclass-live.js am Verhalten. Hier bleibt, was der
Erzeuger selbst entscheidet.
"""

import hashlib
import importlib.util
import json
import os
import re
import sys

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
SKRIPT = os.path.join(WURZEL, "scripts", "masterclass_listen_nachziehen.py")
LIVE = os.path.join(WURZEL, "data", "masterclass_live", "mega-stalobor.json")
FAELLE = os.path.join(WURZEL, "tests", "fixtures", "masterclass_unterschied.json")
LISTEN = os.path.join(WURZEL, "data", "masterclass_online_listen.json")


def _modul():
    spec = importlib.util.spec_from_file_location("mcl_listen", SKRIPT)
    m = importlib.util.module_from_spec(spec)
    sys.modules["mcl_listen"] = m
    spec.loader.exec_module(m)
    return m


def _fp(text):
    """Fingerabdruck statt Zeichenkette. Ein fehlgeschlagenes
    `assert neu == roh` liesse pytest sonst zwei 630-KB-Texte
    gegeneinander diffen — der Lauf haengt dann minutenlang, statt den
    Fehler zu melden (gemessen am 23.09.2026 in der
    Verfaelschungsprobe)."""
    return hashlib.sha1(text.encode("utf-8")).hexdigest()


def _listen():
    with open(LISTEN, encoding="utf-8") as f:
        return json.load(f).get("listen") or []


def _liste(spieler="testspieler", platz=1, feld=100, bilanz="7 - 0 - 0", karten=None):
    return {
        "tournament_id": "t-" + spieler,
        "tournament_name": "Probe-Cup",
        "tournament_date": "2026-09-20",
        "player": spieler,
        "place": "%dst of %d" % (platz, feld),
        "place_rank": platz,
        "total_players": feld,
        "score": bilanz,
        "win_pct": 100.0,
        "cards": karten if karten is not None else [
            {"name": "Drilbur", "count": 3, "set_code": "PBL", "set_number": "46"},
            {"name": "Metal Energy", "count": 17, "set_code": "MEE", "set_number": "8"},
        ],
    }


# ---------------------------------------------------------------- Zustand

@pytest.mark.skipif(not (os.path.exists(LIVE) and os.path.exists(LISTEN)),
                    reason="Live- oder Listendatei nicht im Baum")
def test_am_heutigen_stand_ist_nichts_nachzuziehen():
    """Die eingecheckte JSON steht wie die Rohdaten — mit genau so vielen
    Listen, wie die Datei liefert (DA-26, 30.09.2026)."""
    m = _modul()
    soll, grund = m.live_daten(_listen())
    assert grund == "", grund
    with open(LIVE, encoding="utf-8") as f:
        da = json.load(f).get("online_listen")
    assert _fp(json.dumps(da, sort_keys=True)) == _fp(json.dumps(soll, sort_keys=True)), (
        "die Online-Listen stehen anders da als die Rohdaten — nachziehen mit "
        "'python3 scripts/masterclass_listen_nachziehen.py'")
    assert len(da["listen"]) == len(_listen())


def test_zweimal_nachziehen_aendert_nichts_mehr():
    m = _modul()
    listen = [_liste("s%d" % i, i + 1) for i in range(5)]
    a, _g = m.live_daten(listen)
    b, _g2 = m.live_daten(listen)
    assert _fp(json.dumps(a, sort_keys=True)) == _fp(json.dumps(b, sort_keys=True)), "der Erzeuger ist nicht stabil"


# ------------------------------------------------------- Alles oder nichts

def test_weniger_listen_heisst_weniger_plaetze():
    """DA-26 (Hausi, 30.09.2026): „lieber weniger Listen anzeigen,
    veraltete online bringen nichts". Die JSON fuehrt genau die Listen des
    Fensters — 4, 1 oder 0 — und fuer 0 den Hinweis."""
    m = _modul()
    for anzahl in (4, 1, 0):
        d, grund = m.live_daten([_liste("s%d" % i, i + 1) for i in range(anzahl)])
        assert grund == "", grund
        assert len(d["listen"]) == anzahl
        assert [l["name"] for l in d["listen"]] == ["s%d · %d. von 100" % (i, i + 1) for i in range(anzahl)]
    assert "mcl-listgruppe-leer" in d["leer_hinweis"]
    assert d["gruppe"] == "Online · letzte 7 Tage" and d["max_plaetze"] == 5


def test_mehr_listen_als_plaetze_schreibt_nichts():
    m = _modul()
    d, grund = m.live_daten([_liste("s%d" % i, i + 1) for i in range(6)])
    assert d is None and "hoechstens" in grund


def test_unbekannte_karte_kommt_ohne_kachelangaben():
    """Eine Karte, die die Kartendatenbank nicht kennt, bekommt KEINE
    erfundenen Kachel-Angaben (`neu` leer). Die Seite nimmt dann Tims
    Kachel — gibt es keine, bleibt die Gruppe stehen (JS-Zusicherung)."""
    m = _modul()
    listen = [_liste("s0", 1, karten=[{"name": "Gibt Es Nicht", "count": 2, "set_code": "ZZZ", "set_number": "999"},
                                      {"name": "Drilbur", "count": 3, "set_code": "PBL", "set_number": "46"}])]
    d, _g = m.live_daten(listen)
    k = {x["name"]: x for x in d["listen"][0]["karten"]}
    assert k["Gibt Es Nicht"]["neu"] is None
    assert k["Drilbur"]["neu"]["de"] and k["Drilbur"]["neu"]["bild"].endswith("_R_EN_LG.png")


# ------------------------------------------------------------- Inhalt

def test_die_einleitung_ist_aus_den_rohdaten_gerechnet():
    m = _modul()
    d, grund = m.live_daten([_liste("Kingssofgamer02", 1, 386, "10 - 1 - 1")])
    assert grund == "", grund
    l = d["listen"][0]
    assert l["fakten"] == "1. Platz von 386 (10–1–1), „Probe-Cup“, 20.09.2026."
    assert l["name"] == "Kingssofgamer02 · 1. von 386"
    assert [(k["name"], k["n"]) for k in l["karten"]] == [("Drilbur", 3), ("Metal Energy", 17)]
    assert l["karten"][1]["schluessel"] == m._schluessel("Basic Metal Energy")


def test_der_unterschied_ist_derselbe_satz_wie_auf_der_seite():
    """Den Satz rechnet seit dem Umzug die Seite (listenUnterschied in
    js/ds-masterclass.js). Beide Fassungen muessen dieselben Faelle gleich
    beantworten — die JS-Seite prueft dieselbe Datei."""
    m = _modul()
    with open(FAELLE, encoding="utf-8") as f:
        faelle = json.load(f)["faelle"]
    assert len(faelle) >= 4
    for fa in faelle:
        assert m.unterschied(fa["zaehlung"], fa["tims"]) == fa["erwartet"]


def test_in_der_json_steht_kein_satz_der_ausarbeitung():
    """Die Live-Datei ist oeffentlich. Sie darf nur Daten tragen: Namen,
    Zahlen, Turniere, Kartenangaben — keine Begruendung (data-warum) und
    keinen Kartentext."""
    if not os.path.exists(LIVE):
        pytest.skip("Live-Datei nicht im Baum")
    with open(LIVE, encoding="utf-8") as f:
        roh = f.read()
    for verboten in ("data-warum", "data-text", "Tim ", "Begründung", "<p", "<div"):
        assert verboten not in roh, verboten


def test_der_namensschluessel_haelt_die_schreibweisen_aus():
    m = _modul()
    assert m._schluessel("Basic Metal Energy") == m._schluessel("Metal Energy")
    assert m._schluessel("Boss&#x27;s Orders") == m._schluessel("Boss's Orders")
    assert m._schluessel("  Iono  ") == "iono"
