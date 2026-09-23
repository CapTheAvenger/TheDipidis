# -*- coding: utf-8 -*-
"""Der Nachzieher fuer die Gruppe "Online · letzte 7 Tage".

BESTELLUNG (23.09.2026): "Die Masterclass unbedingt auf den Wochenlauf
haengen, damit ich immer die aktuellsten Daten habe."

Ein Erzeuger, der in ein 600 KB grosses Stueck schreibt, kann mehr
kaputtmachen als er nuetzt. Was hier beissen soll:

  1. Er schreibt nur, was er belegen kann — unbekannte Karte, falsche
     Listenzahl, fehlende Gruppe: NICHTS wird geschrieben.
  2. Er fasst nur die Online-Gruppe an. Tims Listen, die Worlds-Listen,
     die Matchups und die Ausarbeitung bleiben Zeichen fuer Zeichen.
  3. Er ist stabil: zweimal laufen aendert beim zweiten Mal nichts.
  4. Der heutige Stand ist nachgezogen — sonst waere das Stueck
     dateiert und niemand saehe es.
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
STUECK = os.path.join(WURZEL, "masterclass", "mega-stalobor.de.html")
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


def _stueck():
    with open(STUECK, encoding="utf-8") as f:
        return f.read()


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

@pytest.mark.skipif(not (os.path.exists(STUECK) and os.path.exists(LISTEN)),
                    reason="Stueck oder Listendatei nicht im Baum")
def test_am_heutigen_stand_ist_nichts_nachzuziehen():
    m = _modul()
    _neu, aenderungen, grund = m.nachziehen(_stueck(), _listen())
    assert grund == "", grund
    assert aenderungen == [], (
        "die Online-Listen stehen anders da als die Rohdaten — nachziehen mit "
        "'python3 scripts/masterclass_listen_nachziehen.py':\n  " + "\n  ".join(aenderungen))


@pytest.mark.skipif(not (os.path.exists(STUECK) and os.path.exists(LISTEN)),
                    reason="Stueck oder Listendatei nicht im Baum")
def test_zweimal_nachziehen_aendert_nichts_mehr():
    m = _modul()
    listen = _listen()
    einmal, _a, grund = m.nachziehen(_stueck(), listen)
    assert grund == "", grund
    zweimal, aend2, _g2 = m.nachziehen(einmal, listen)
    assert _fp(zweimal) == _fp(einmal) and aend2 == [], "der Erzeuger ist nicht stabil"


@pytest.mark.skipif(not (os.path.exists(STUECK) and os.path.exists(LISTEN)),
                    reason="Stueck oder Listendatei nicht im Baum")
def test_er_fasst_nur_die_online_gruppe_an():
    """Gegenprobe mit VERAENDERTEN Listen: alles ausserhalb der Gruppe
    muss Zeichen fuer Zeichen stehen bleiben."""
    m = _modul()
    roh = _stueck()
    listen = [dict(e, player="Proband%d" % i) for i, e in enumerate(_listen())]
    neu, aenderungen, grund = m.nachziehen(roh, listen)
    assert grund == "" and aenderungen, "die Gegenprobe hat gar nichts geaendert"

    # Alles vor dem ersten Block der Gruppe und die Ausarbeitung dahinter.
    nummern, _t = m.gruppen_nummern(roh)
    erste = 'data-mcl-listenblock="%s"' % nummern[0]
    assert roh[:roh.find(erste)].replace(
        "Kingssofgamer02", "X") != "", "Schnitt misslungen"
    vorher_teil = roh[:roh.find(erste)]
    nachher_teil = neu[:neu.find(erste)]
    # Die Schalterreihe der Gruppe steht davor und darf sich aendern —
    # alles andere nicht.
    def ohne_reihe(t):
        return re.sub(r'<div class="mcl-listwahl-reihe">.*?</div>', "", t, flags=re.S)
    assert _fp(ohne_reihe(vorher_teil)) == _fp(ohne_reihe(nachher_teil)), \
        "ausserhalb der Gruppe wurde etwas veraendert"

    doku_a = roh[roh.find('data-mcl-abschnitt="doku"'):]
    doku_b = neu[neu.find('data-mcl-abschnitt="doku"'):]
    assert _fp(doku_a) == _fp(doku_b), "die Ausarbeitung wurde angefasst"
    assert neu.count('data-mcl-listenblock=') == roh.count('data-mcl-listenblock=')
    assert neu.count('data-mcl-kopieren=') == roh.count('data-mcl-kopieren=')


# ------------------------------------------------------- Alles oder nichts

@pytest.mark.skipif(not os.path.exists(STUECK), reason="Stueck nicht im Baum")
def test_falsche_listenzahl_schreibt_nichts():
    m = _modul()
    roh = _stueck()
    for anzahl in (0, 1, 4, 6):
        neu, aend, grund = m.nachziehen(roh, [_liste("s%d" % i, i + 1) for i in range(anzahl)])
        assert _fp(neu) == _fp(roh) and aend == [] and grund, \
            "bei %d Listen wurde geschrieben" % anzahl
        assert "Plaetze" in grund or "Gruppe" in grund


@pytest.mark.skipif(not os.path.exists(STUECK), reason="Stueck nicht im Baum")
def test_unbekannte_karte_schreibt_nichts():
    m = _modul()
    roh = _stueck()
    kaputt = [{"name": "Gibt Es Nicht", "count": 2, "set_code": "ZZZ", "set_number": "999"}]
    listen = [_liste("s%d" % i, i + 1) for i in range(5)]
    listen[2]["cards"] = kaputt
    neu, aend, grund = m.nachziehen(roh, listen)
    assert _fp(neu) == _fp(roh) and aend == [] and "Gibt Es Nicht" in grund


# ------------------------------------------------------------- Inhalt

@pytest.mark.skipif(not os.path.exists(STUECK), reason="Stueck nicht im Baum")
def test_die_einleitung_ist_aus_den_rohdaten_gerechnet():
    m = _modul()
    roh = _stueck()
    listen = [_liste("s%d" % i, i + 1) for i in range(5)]
    listen[0] = _liste("Kingssofgamer02", 1, 386, "10 - 1 - 1")
    neu, _a, grund = m.nachziehen(roh, listen)
    assert grund == "", grund
    nummern, _t = m.gruppen_nummern(roh)
    block = re.search(r'data-mcl-listenblock="%s"[^>]*>(<p class="mcl-listmeta">.*?</p>)'
                      % nummern[0], neu, re.S).group(1)
    text = re.sub(r"<[^>]+>", "", block)
    assert "1. Platz von 386" in text
    assert "10–1–1" in text, text            # Gedankenstriche wie im Stueck
    assert "Probe-Cup" in text
    assert "20.09.2026" in text
    # Und der Unterschied ist gezaehlt, nicht behauptet.
    assert "Tims aktueller Liste" in text
    assert "Kartengleich" in text or "×" in text or "statt" in text or "kein " in text


@pytest.mark.skipif(not os.path.exists(STUECK), reason="Stueck nicht im Baum")
def test_die_kacheln_tragen_weiter_deutsche_namen_und_begruendung():
    """Die Kacheln werden aus dem Stueck uebernommen, nicht neu erfunden —
    sonst verloere eine nachgezogene Liste Tims Begruendungen."""
    m = _modul()
    roh = _stueck()
    listen = [_liste("s%d" % i, i + 1) for i in range(5)]
    neu, _a, grund = m.nachziehen(roh, listen)
    assert grund == "", grund
    nummern, _t = m.gruppen_nummern(roh)
    block = re.search(r'(data-mcl-listenblock="%s".*?<p class="mcl-quelle">.*?</p></div>)'
                      % nummern[0], neu, re.S).group(1)
    assert 'data-de="Rotomurf"' in block, "der deutsche Name fehlt"
    assert 'data-warum=' in block, "Tims Begruendung fehlt"
    assert 'data-n="3"' in block and '<span class="mcl-anz">3</span>' in block
    assert "20 Karten · 2 verschiedene" in block


def test_der_namensschluessel_haelt_die_schreibweisen_aus():
    m = _modul()
    assert m._schluessel("Basic Metal Energy") == m._schluessel("Metal Energy")
    assert m._schluessel("Boss&#x27;s Orders") == m._schluessel("Boss's Orders")
    assert m._schluessel("  Iono  ") == "iono"
