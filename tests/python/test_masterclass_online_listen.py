# -*- coding: utf-8 -*-
"""build_masterclass_listen — die Listen, die in der Masterclass unter
"Online · letzte 7 Tage" stehen.

BESTELLUNG (23.09.2026): "Die Masterclass unbedingt auf den Wochenlauf
haengen, damit ich immer die aktuellsten Daten habe."

Die Gruppe hielt seit dem 22.09. fuenf von Hand gebaute Listen. Diese
Funktion waehlt sie aus demselben Datensatz, den der Lauf ohnehin
scrapt — ein Archetyp, mehrere Listen, dieselbe Reihenfolge wie
build_best_online_decklists (Platz, dann Matchpunkte, dann Datum).

Was hier beissen soll:
  1. Die Reihenfolge ist die versprochene.
  2. Das Zeitfenster gilt wirklich.
  3. Derselbe Spieler im selben Turnier belegt nur EINEN Platz.
  4. Es wird nichts erfunden: ohne Platz oder ohne Karten faellt eine
     Liste raus, und die Zahl der Listen ist begrenzt.
"""

import sys
from datetime import datetime, timedelta
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_REPO_ROOT / "backend" / "core"))
sys.path.insert(0, str(_REPO_ROOT / "backend" / "scrapers"))

import current_meta_analysis_scraper as cma  # noqa: E402

ARCHETYP = "Mega Excadrill"


def _iso(tage_her):
    return (datetime.now() - timedelta(days=tage_her)).strftime("%Y-%m-%d")


def _karten():
    return [{"name": "Drilbur", "count": 3, "set_code": "PBL", "set_number": "46",
             "type": "Basic", "is_ace_spec": False}]


def _liste(platz, bilanz, tage_her, spieler, archetyp=ARCHETYP, karten=None, turnier=None):
    return {
        "archetype": archetyp,
        "place": platz,
        "score": bilanz,
        "tournament_date": _iso(tage_her),
        "tournament_id": turnier or ("t-" + spieler),
        "tournament_name": "Event " + spieler,
        "player": spieler,
        "total_players": 200,
        "cards": _karten() if karten is None else karten,
    }


def test_der_beste_platz_steht_vorn_und_es_sind_mehrere():
    decks = [
        _liste("5th of 72", "5-2-0", 2, "alice"),
        _liste("1st of 65", "8-1-0", 3, "bob"),
        _liste("2nd of 90", "9-1-0", 1, "carol"),
    ]
    aus = cma.build_masterclass_listen(decks, ARCHETYP, anzahl=5, recent_days=7)
    assert [e["player"] for e in aus] == ["bob", "carol", "alice"]
    assert [e["place_rank"] for e in aus] == [1, 2, 5]
    # Gegenprobe zur alten Funktion: die liefert genau EINE Liste.
    eine = cma.build_best_online_decklists(decks, recent_days=7)
    assert eine[ARCHETYP]["player"] == "bob"


def test_bei_gleichem_platz_entscheidet_die_matchpunktquote():
    decks = [
        _liste("3rd of 100", "6-3-0", 2, "schwach"),      # 66,7 %
        _liste("3rd of 100", "8-1-0", 2, "stark"),        # 88,9 %
    ]
    aus = cma.build_masterclass_listen(decks, ARCHETYP, anzahl=5)
    assert [e["player"] for e in aus] == ["stark", "schwach"]


def test_nur_dieser_archetyp_und_nur_im_fenster():
    decks = [
        _liste("1st of 50", "7-0-0", 2, "meiner"),
        _liste("1st of 50", "7-0-0", 2, "fremder", archetyp="Dragapult"),
        _liste("1st of 50", "7-0-0", 40, "alter"),        # ausserhalb des Fensters
    ]
    aus = cma.build_masterclass_listen(decks, ARCHETYP, anzahl=5, recent_days=7)
    assert [e["player"] for e in aus] == ["meiner"]


def test_ohne_platz_oder_ohne_karten_faellt_eine_liste_raus():
    decks = [
        _liste("1st of 50", "7-0-0", 1, "ganz", karten=[]),
        _liste("", "7-0-0", 1, "ohneplatz"),
        _liste("Top 8", "7-0-0", 1, "unscharf"),
        _liste("4th of 50", "5-2-0", 1, "sauber"),
    ]
    aus = cma.build_masterclass_listen(decks, ARCHETYP, anzahl=5)
    assert [e["player"] for e in aus] == ["sauber"]


def test_derselbe_spieler_im_selben_turnier_steht_nur_einmal():
    """Ein Spieler mit zwei gescrapten Zeilen desselben Laufs wuerde sonst
    zwei der fuenf Plaetze belegen und eine fremde Liste verdraengen."""
    decks = [
        _liste("1st of 80", "8-0-0", 1, "doppel", turnier="t-gleich"),
        _liste("1st of 80", "8-0-0", 1, "doppel", turnier="t-gleich"),
        _liste("9th of 80", "6-2-0", 1, "anderer"),
    ]
    aus = cma.build_masterclass_listen(decks, ARCHETYP, anzahl=5)
    assert [e["player"] for e in aus] == ["doppel", "anderer"]


def test_mehr_als_anzahl_wird_abgeschnitten():
    decks = [_liste(f"{i}th of 200", "6-2-0", 1, f"s{i}") for i in range(4, 20)]
    aus = cma.build_masterclass_listen(decks, ARCHETYP, anzahl=5)
    assert len(aus) == 5
    assert [e["place_rank"] for e in aus] == [4, 5, 6, 7, 8]


def test_die_felder_sind_die_des_stuecks():
    """Der Nachzieher baut daraus Ueberschrift und Kachelgitter — fehlt
    ein Feld, steht spaeter eine leere Zeile im Stueck."""
    aus = cma.build_masterclass_listen([_liste("2nd of 386", "10-1-1", 1, "kings")], ARCHETYP)
    e = aus[0]
    for feld in ("tournament_name", "tournament_date", "player", "place",
                 "place_rank", "total_players", "score", "win_pct", "cards"):
        assert feld in e, feld
    assert e["total_players"] == 200
    assert e["score"] == "10-1-1"
    assert e["cards"][0]["count"] == 3
    # Matchpunkte, nicht Siege/Partien: (3*10+1)/(3*12) = 86,1 %
    assert e["win_pct"] == 86.1
