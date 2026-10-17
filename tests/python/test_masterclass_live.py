# -*- coding: utf-8 -*-
"""Sperre: in data/masterclass_live/*.json steht keine bezahlte Prosa.

UMZUG 17.10.2026: die gekauften Ausarbeitungen liegen nur in Hausis Konto,
das Repo ist oeffentlich. Die Live-Dateien werden mit data/ ausgeliefert
und sind fuer jeden lesbar — sie duerfen deshalb nur tragen, was die
Erzeuger aus den Turnierdaten rechnen (scripts/masterclass_live.py).

Geprueft wird an JEDER Zeichenkette der Datei, nicht an einer Stichprobe:
  * nur bekannte Schluessel auf den oberen Ebenen;
  * jede Zeichenkette entspricht einer Schablone der Erzeuger — oder ist
    kurz (hoechstens 120 Zeichen und 12 Woerter) und kein Satz;
  * die festen Saetze der Erzeuger (Leerhinweis, Quelle) stehen woertlich so
    da, wie sie im Skript stehen.
Ein Satz aus einer Ausarbeitung faellt damit an Laenge, Wortzahl oder
Satzbau auf — die Verfaelschungsprobe unten schreibt einen hinein.
"""

import glob
import json
import os
import re
import sys

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
ORDNER = os.path.join(WURZEL, "data", "masterclass_live")
sys.path.insert(0, os.path.join(WURZEL, "scripts"))

OBEN = {"_meta", "matchups", "online_listen", "werte", "aktuell"}
# 17.10.2026: Block „Aktuelle Daten“ (scripts/masterclass_aktuell.py)
AKTUELL = {"deck", "name", "online", "vor_ort", "gegner", "liste_online", "listen_vor_ort"}
META = {"id", "erzeugt_am", "quelle"}
MATCHUPS = {"koepfe", "majors_praefix", "werte", "zellen", "leer", "anteile", "mindest_partien"}
LISTEN = {"gruppe", "max_plaetze", "leer_hinweis", "mindest_spieler", "listen"}

ZAHL = r"[\d.]+"
SCHABLONEN = [
    # Sprechblasen der Zellen (soll_zelle)
    re.compile(r"^\d+,\d % Win % nach Matchpunkten, aus " + ZAHL + r" Partien, Bilanz \d+–\d+–\d+ \(S–N–U\)$"),
    re.compile(r"^Bilanz \d+–\d+–\d+ \(S–N–U\) aus " + ZAHL + r" Partien\. Unter \d+ Partien steht hier keine Quote — "
               r"eine einzelne Partie verschiebt sie um \d+\.\d Punkte\.$"),
    re.compile(r"^keine Partien in den Daten$"),
    # Majors-Texte (majors_texte)
    re.compile(r"^Letzte Präsenzturniere \([^()]+\), Format [A-Z0-9]+–[A-Z0-9]+: $"),
    re.compile(r"^sind die letzten Präsenzturniere \([^()]+\)(?:, schon im laufenden Format| — die liefen noch im Format [A-Z0-9]+–[A-Z0-9]+)\.$"),
    # Einleitung einer Online-Liste (fakten)
    re.compile(r"^\d+\. Platz(?: von \d+)?(?: \(\d+–\d+–\d+\))?, „[^“]{1,160}“, \d\d\.\d\d\.\d{4}\.$"),
    re.compile(r"^\d+\. Platz(?: von \d+)?(?: \(\d+–\d+–\d+\))?, \d\d\.\d\d\.\d{4}\.$"),
]


def _dateien():
    return sorted(glob.glob(os.path.join(ORDNER, "*.json")))


def _zeichenketten(x, pfad=""):
    if isinstance(x, str):
        yield pfad, x
    elif isinstance(x, dict):
        for k, v in x.items():
            yield from _zeichenketten(v, pfad + "/" + str(k))
    elif isinstance(x, list):
        for i, v in enumerate(x):
            yield from _zeichenketten(v, pfad + "/%d" % i)


def _feste_saetze():
    import masterclass_listen_nachziehen as L
    import masterclass_live as LIVE
    return {L.LEER_HINWEIS}, LIVE


def befunde(daten):
    """Alle Verstoesse einer Live-Datei als Liste (leer = in Ordnung)."""
    aus = []
    frei_erlaubt, _live = _feste_saetze()
    for k in daten:
        if k not in OBEN:
            aus.append("unbekannter Schluessel /%s" % k)
    for k in (daten.get("_meta") or {}):
        if k not in META:
            aus.append("unbekannter Schluessel /_meta/%s" % k)
    for k in (daten.get("matchups") or {}):
        if k not in MATCHUPS:
            aus.append("unbekannter Schluessel /matchups/%s" % k)
    for k in (daten.get("aktuell") or {}):
        if k not in AKTUELL:
            aus.append("unbekannter Schluessel /aktuell/%s" % k)
    for k in (daten.get("online_listen") or {}):
        if k not in LISTEN:
            aus.append("unbekannter Schluessel /online_listen/%s" % k)
    for pfad, s in _zeichenketten(daten):
        if pfad == "/_meta/quelle" or s in frei_erlaubt:
            continue
        passt = any(m.match(s) for m in SCHABLONEN)
        # Wo der Erzeuger IMMER eine Schablone schreibt, gilt nur sie:
        # Sprechblasen der Zellen, Majors-Texte, Einleitung einer Liste.
        streng = (re.match(r"^/matchups/(zellen/[^/]+/[^/]+|leer)/1$", pfad)
                  or pfad in ("/matchups/majors_praefix", "/matchups/werte/majors-satz")
                  or re.match(r"^/online_listen/listen/\d+/fakten$", pfad))
        if passt:
            continue
        if streng:
            aus.append("keine Schablone in %s: %r" % (pfad, s[:80]))
            continue
        woerter = len(s.split())
        satz = re.search(r"[a-zäöüß]{2,}[.!?](?:\s|$)", s) and woerter >= 3
        if len(s) > 120 or woerter > 12 or satz:
            aus.append("freier Text in %s: %r" % (pfad, s[:80]))
    return aus


def test_es_gibt_mindestens_eine_live_datei():
    assert _dateien(), "data/masterclass_live/ ist leer — die Sperre prueft ins Leere"


@pytest.mark.parametrize("pfad", _dateien() or ["(keine)"])
def test_keine_prosa_in_der_live_datei(pfad):
    if not os.path.exists(pfad):
        pytest.skip("keine Live-Datei")
    with open(pfad, encoding="utf-8") as f:
        daten = json.load(f)
    aus = befunde(daten)
    assert aus == [], "%s:\n  " % os.path.basename(pfad) + "\n  ".join(aus[:20])
    # Gegen ein leeres Bestehen: die Schablonen muessen wirklich greifen.
    if "matchups" in daten:
        treffer = sum(1 for _p, s in _zeichenketten(daten) if any(m.match(s) for m in SCHABLONEN))
        assert treffer >= 20, "nur %d Zeichenketten passen auf eine Schablone" % treffer
    else:
        # Nur „Aktuelle Daten“: gegen ein leeres Bestehen mindestens zehn Gegner.
        assert len((daten.get("aktuell") or {}).get("gegner") or []) >= 10, "Live-Datei ohne Gegner"


def test_der_feste_quellsatz_ist_der_des_schreibers(tmp_path, monkeypatch):
    _f, LIVE = _feste_saetze()
    monkeypatch.setattr(LIVE, "ORDNER", str(tmp_path))
    LIVE.schreibe_teil("probe", "matchups", {"werte": {}})
    with open(LIVE.pfad("probe"), encoding="utf-8") as f:
        d = json.load(f)
    assert d["_meta"]["quelle"].startswith("data/ (Turnierdaten)")
    assert befunde(d) == []


def test_verfaelschung_prosa_satz_faellt_auf():
    """VERFAELSCHUNGSPROBE: ein Satz, wie er in einer Ausarbeitung steht,
    an drei Stellen — jede muss auffallen."""
    pfad = os.path.join(ORDNER, "mega-stalobor.json")
    with open(pfad, encoding="utf-8") as f:
        echt = json.load(f)
    satz = "Going Second — sonst setzt dich Knospi mit Item-Lock aus dem Spiel."
    kurz = "Immer zuerst gehen."
    # vierter Ort: ein kurzer Satz an einer freien Stelle
    for setze in (
        lambda d: d["matchups"]["werte"].__setitem__("plan", satz),
        lambda d: d["online_listen"]["listen"][0].__setitem__("fakten", satz) if d["online_listen"]["listen"] else d["online_listen"].__setitem__("x", satz),
        lambda d: d["matchups"]["zellen"][next(iter(d["matchups"]["zellen"]))]["jetzt"].__setitem__(1, kurz),
        lambda d: d.__setitem__("ausarbeitung", {}),
        lambda d: d["matchups"]["werte"].__setitem__("tipp", kurz),
        lambda d: d["aktuell"].__setitem__("plan", satz),
        lambda d: d["aktuell"]["gegner"][0].__setitem__("name", satz),
    ):
        d = json.loads(json.dumps(echt))
        setze(d)
        assert befunde(d), "die Sperre liess Prosa durch"
