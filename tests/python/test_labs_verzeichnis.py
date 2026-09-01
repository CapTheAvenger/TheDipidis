# -*- coding: utf-8 -*-
"""Das Labs-Verzeichnis muss zu den Dateien passen, die daneben liegen.

ANLASS (01.09.2026)
-------------------
An zwei Stellen im Code stand, das Verzeichnis koenne "nicht veralten, ohne
dass die Dateien danebenliegen" — backend/scrapers/labs_tournament_scraper.py
(_schreibe_labs_verzeichnis) und js/app-tier-meta.js:1183. Beide Saetze waren
richtig fuer den Ordner, in dem der Scraper arbeitet, und falsch fuer den
Ordner, aus dem das Frontend liest:

  Scraper schreibt nach   backend/core/data/
  Ruecksicherung kopiert  backend/core/data/*.csv  →  data/       (nur CSV!)
  Frontend liest aus      data/

Das Verzeichnis ist kein CSV. Es blieb drueben liegen. Gemessen am 01.09.:
data/labs_tournament_decks_TEF-PBL.csv (44 Zeilen, Worlds San Francisco,
774 Spieler) lag im Repo, das Verzeichnis daneben stand auf dem 30.08. und
kannte TEF-PBL nicht — labsAuszugVorhanden('TEF-PBL') gab false, die
Tier-Liste hat das erste Praesenzturnier des laufenden Formats nie geladen.

Diese Pruefungen halten die Zusage, die im Code steht, jetzt wirklich:
sie vergleichen das Verzeichnis mit dem Ordner, aus dem das Frontend liest.
"""

import csv
import glob
import io
import json
import os

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
DATA = os.path.join(WURZEL, "data")

PRAEFIXE = ["labs_tournament_decks", "labs_tournament_matchups"]


def _zeilen(pfad):
    with io.open(pfad, "r", encoding="utf-8", newline="") as f:
        return max(0, sum(1 for _ in csv.reader(f)) - 1)


def _auszuege(praefix):
    """(schluessel, zeilen) je vorhandener Auszugsdatei in data/."""
    raus = {}
    for pfad in sorted(glob.glob(os.path.join(DATA, praefix + "_*.csv"))):
        rest = os.path.basename(pfad)[len(praefix) + 1:-4]
        if not rest or rest.startswith("_"):
            continue
        raus[rest] = _zeilen(pfad)
    return raus


def _verzeichnis(praefix):
    pfad = os.path.join(DATA, praefix + "_verzeichnis.json")
    assert os.path.isfile(pfad), (
        praefix + "_verzeichnis.json fehlt in data/ — das Frontend haelt dann "
        "JEDEN Meta fuer auszugslos und laedt keinen einzigen Labs-Auszug")
    with io.open(pfad, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.mark.parametrize("praefix", PRAEFIXE)
def test_verzeichnis_kennt_jeden_auszug_der_danebenliegt(praefix):
    """Der Fall vom 01.09.: die Datei ist da, das Verzeichnis kennt sie nicht."""
    vorhanden = _auszuege(praefix)
    gelistet = set(_verzeichnis(praefix).get("meta_keys") or [])
    fehlend = sorted(k for k, n in vorhanden.items() if n > 0 and k not in gelistet)
    assert not fehlend, (
        "diese Auszuege liegen in data/ und stehen nicht im Verzeichnis: "
        + ", ".join("%s (%d Zeilen)" % (k, vorhanden[k]) for k in fehlend)
        + " — das Frontend laedt sie nicht. Abhilfe: "
        "python3 scripts/schreibe_labs_verzeichnis.py")


@pytest.mark.parametrize("praefix", PRAEFIXE)
def test_verzeichnis_verspricht_keinen_auszug_der_fehlt(praefix):
    """Die Gegenrichtung — sonst holt sich das Frontend eine 404."""
    vorhanden = _auszuege(praefix)
    gelistet = _verzeichnis(praefix).get("meta_keys") or []
    zuviel = [k for k in gelistet if k not in vorhanden]
    assert not zuviel, (
        "das Verzeichnis nennt Auszuege, die es in data/ nicht gibt: "
        + ", ".join(zuviel) + " — jeder davon ist eine 404 je Seitenaufruf")


@pytest.mark.parametrize("praefix", PRAEFIXE)
def test_unsorted_steht_nicht_im_verzeichnis(praefix):
    """`_unsorted` ist der Eimer fuer Zeilen ohne Meta-Wert, kein Format."""
    gelistet = _verzeichnis(praefix).get("meta_keys") or []
    assert not [k for k in gelistet if k.startswith("_")], (
        "ein Sammelbecken steht als Meta im Verzeichnis: " + repr(gelistet))


def test_das_laufende_format_ist_dabei_sobald_es_daten_hat():
    """Der teuerste Einzelfall: der laufende Meta faellt aus der Tier-Liste.

    Ein alter Auszug, der uebersehen wird, kostet eine geschlossene Epoche.
    Der LAUFENDE kostet die Ansicht, die auf der Startseite steht.
    """
    fenster = os.path.join(DATA, "format_window.json")
    if not os.path.isfile(fenster):
        pytest.skip("format_window.json fehlt")
    with io.open(fenster, "r", encoding="utf-8") as f:
        fw = json.load(f)
    # Der Schluessel steht dort nicht am Stueck: `oldest_legal_set`-`current_set`
    # ist die Schreibweise, die die Auszugsdateien tragen (TEF-PBL).
    alt_ = (fw.get("oldest_legal_set") or "").strip().upper()
    neu_ = (fw.get("current_set") or "").strip().upper()
    laufend = ("%s-%s" % (alt_, neu_)) if alt_ and neu_ else ""
    if not laufend:
        pytest.skip("kein laufender Meta-Schluessel in format_window.json")
    pfad = os.path.join(DATA, "labs_tournament_decks_%s.csv" % laufend)
    if not os.path.isfile(pfad) or _zeilen(pfad) < 1:
        return   # noch kein Praesenzturnier in diesem Format — nichts zu melden
    gelistet = _verzeichnis("labs_tournament_decks").get("meta_keys") or []
    assert laufend in gelistet, (
        "%s hat %d Auszugszeilen und steht nicht im Verzeichnis — die "
        "Tier-Liste des LAUFENDEN Formats laedt sie nicht"
        % (laufend, _zeilen(pfad)))


def test_der_wochenlauf_baut_das_verzeichnis_neu():
    """Ein Skript, das niemand aufruft, ist kein Netz.

    Und die Reihenfolge zaehlt: nach der Ruecksicherung (sonst baut es aus
    einem halben Ordner), vor dem Commit (sonst geht die Korrektur nicht mit).
    """
    pfad = os.path.join(WURZEL, ".github", "workflows", "weekly-full-update.yml")
    text = io.open(pfad, encoding="utf-8").read()
    assert "schreibe_labs_verzeichnis.py" in text, (
        "der Wochenlauf baut das Verzeichnis nicht neu — dann veraltet es "
        "wieder, sobald ein neues Format sein erstes Turnier bekommt")
    i_bau = text.index("schreibe_labs_verzeichnis.py")
    i_commit = text.index("- name: Commit + push")
    assert i_bau < i_commit, "das Verzeichnis wird nach dem Commit gebaut"
    i_sync = text.index("synced chunk")
    assert i_sync < i_bau, (
        "das Verzeichnis wird vor der Ruecksicherung gebaut — dann kennt es "
        "die frisch geholten Auszuege nicht")
