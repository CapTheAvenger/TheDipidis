# -*- coding: utf-8 -*-
"""Die Masterclass haengt am Wochenlauf — und zwar so, dass es wirkt.

BESTELLUNG (23.09.2026): "Die Masterclass unbedingt auf den Wochenlauf
haengen, damit ich immer die aktuellsten Daten habe."

Drei Dinge muessen dafuer stimmen, und alle drei stehen hier:

  1. Die Erzeuger laufen IN dem Ablauf, der ihre Eingabe schreibt, und
     ihr Ergebnis wird committet — sonst wird es mit dem Laeufer
     weggeworfen (die Falle, die data/champions_move_flags.json sieben
     Tage lang erwischt hat).
  2. Die Zahlen, die dabei nachgezogen werden, stehen im Stueck so da
     wie in den Dateien: Feldanteile und die Reihenfolge, die die
     Einleitung verspricht.
  3. Die Druckregel liegt im Repo, nicht im Scratchpad, und liefert
     genau die Drucke, die im Stueck stehen — sonst bekaeme eine
     nachgezogene Liste andere Karten als der Rest.
"""

import csv
import html
import importlib.util
import os
import re
import sys

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
STUECK = os.path.join(WURZEL, "masterclass", "mega-stalobor.de.html")
WOCHE = os.path.join(WURZEL, ".github", "workflows", "weekly-full-update.yml")
API = os.path.join(WURZEL, ".github", "workflows", "limitless-api-scrape.yml")
FELD_CSV = os.path.join(WURZEL, "data", "limitless_online_decks.csv")
DRUCKE_PY = os.path.join(WURZEL, "scripts", "masterclass_drucke.py")
SCRAPER = os.path.join(WURZEL, "backend", "scrapers", "current_meta_analysis_scraper.py")

csv.field_size_limit(10 ** 7)


def _lies(pfad):
    with open(pfad, encoding="utf-8") as f:
        return f.read()


def _stueck():
    return _lies(STUECK)


# ------------------------------------------------- 1. Der Ablauf traegt es

def test_beide_erzeuger_laufen_im_wochenlauf():
    text = _lies(WOCHE)
    for skript in ("scripts/masterclass_zahlen_nachziehen.py",
                   "scripts/masterclass_listen_nachziehen.py"):
        assert skript in text, (
            "%s ist im Wochenlauf nicht verdrahtet — dann zieht niemand die "
            "Masterclass nach, wenn die Daten wachsen" % skript)
    # NACH den Scrapern: davor rechnete er mit dem Vortagesstand.
    assert text.index("- name: Run scrapers") < text.index(
        "scripts/masterclass_listen_nachziehen.py"), \
        "der Nachzieher steht vor dem Schritt, der seine Eingabe schreibt"
    # VOR dem Commit: danach waere das Ergebnis nicht im Push.
    assert text.index("scripts/masterclass_listen_nachziehen.py") < text.index(
        "- name: Commit + push"), "der Nachzieher laeuft erst nach dem Commit"


def test_der_wochenlauf_committet_alles_was_er_erzeugt():
    """Der Wochenlauf nimmt `git add -A` — damit ist die neue Datei
    data/masterclass_online_listen.json mit drin. Faellt das weg, muss
    sie einzeln in die Liste."""
    text = _lies(WOCHE)
    assert re.search(r"git add -A", text), (
        "der Wochenlauf listet die Dateien einzeln auf — dann gehoert "
        "data/masterclass_online_listen.json dazu")


def test_der_api_lauf_zieht_die_zahlen_weiter_nach():
    """Der haeufigere Lauf schreibt die Matchup-CSVs; sein Schritt darf
    beim Umbau nicht verloren gehen."""
    text = _lies(API)
    assert "scripts/masterclass_zahlen_nachziehen.py" in text
    assert re.search(r"git add\s+masterclass/mega-stalobor\.de\.html", text)


def test_der_scraper_schreibt_die_listendatei():
    text = _lies(SCRAPER)
    assert "build_masterclass_listen" in text
    assert "masterclass_online_listen.json" in text
    # Und er schreibt sie NACH dem Sammeln, aus demselben Datensatz.
    assert text.index("def build_masterclass_listen") < text.index(
        'json.dump({"archetyp"')


# ------------------------------------------- 2. Feldanteile und Reihenfolge

def _anteile():
    aus = {}
    with open(FELD_CSV, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f, delimiter=";"):
            name = (r.get("deck_name") or "").strip().lower()
            anteil = (r.get("share") or "").replace("%", "").strip()
            if name and anteil:
                aus[name] = anteil.replace(".", ",")
    return aus


def _zeilen():
    """(englischer Name, Feldanteil als Text) je Matchup-Zeile."""
    return [(html.unescape(a).strip(), b) for a, b in re.findall(
        r'<span class="mcl-nm">[^<]*<em>([^<]*)</em></span>\s*'
        r'<span class="mcl-sub">([\d.,]+) %', _stueck())]


@pytest.mark.skipif(not (os.path.exists(STUECK) and os.path.exists(FELD_CSV)),
                    reason="Stueck oder Feld-CSV nicht im Baum")
def test_die_feldanteile_stehen_so_da_wie_in_der_datei():
    anteile = _anteile()
    falsch = [(n, steht, anteile.get(n.lower()))
              for n, steht in _zeilen()
              if anteile.get(n.lower()) and steht != anteile[n.lower()]]
    assert falsch == [], (
        "diese Feldanteile stehen anders im Stueck als in "
        "data/limitless_online_decks.csv: " + str(falsch))
    geprueft = [n for n, _s in _zeilen() if anteile.get(n.lower())]
    assert len(geprueft) >= 15, (
        "nur %d Zeilen gegen die Datei geprueft — der Test liefe ins Leere"
        % len(geprueft))


@pytest.mark.skipif(not os.path.exists(STUECK), reason="Stueck nicht im Baum")
def test_die_reihenfolge_haelt_was_die_einleitung_verspricht():
    """Ueber der Liste steht "Sortiert nach Feldanteil". Zieht der Lauf
    die Anteile nach, ohne die Reihenfolge mitzuziehen, wird der Satz
    falsch."""
    roh = _stueck()
    assert "Sortiert nach Feldanteil" in roh, "das Versprechen steht nicht mehr da"
    werte = [float(b.replace(",", ".")) for _a, b in _zeilen()]
    assert len(werte) >= 15
    absteigend = all(werte[i] >= werte[i + 1] for i in range(len(werte) - 1))
    assert absteigend, "die Matchups stehen nicht nach Feldanteil sortiert: %s" % werte


# ---------------------------------------------------- 3. Die Druckregel

def _drucke():
    spec = importlib.util.spec_from_file_location("mcl_drucke", DRUCKE_PY)
    m = importlib.util.module_from_spec(spec)
    sys.modules["mcl_drucke"] = m
    spec.loader.exec_module(m)
    return m


@pytest.mark.skipif(not (os.path.exists(STUECK) and os.path.exists(DRUCKE_PY)),
                    reason="Stueck oder Druckmodul nicht im Baum")
def test_die_druckregel_im_repo_liefert_die_drucke_des_stuecks():
    """Bis zum 23.09.2026 lag diese Regel nur im Scratchpad. Kaeme eine
    neue Karte ueber den Wochenlauf ins Stueck, bekaeme sie einen Druck
    nach einer anderen Regel als alle anderen."""
    d = _drucke()
    paare = {(a, b) for a, b in re.findall(
        r'data-druck="([^"]*)" data-druck-hoch="([^"]*)"', _stueck())}
    assert len(paare) >= 40, "nur %d Druckpaare im Stueck" % len(paare)
    falsch = []
    for druck, hoch in sorted(paare):
        billig = d.neuester_billiger_druck(druck)[0] or druck
        hoechst = d.hoechster_druck(druck)[0] or druck
        if billig != druck or hoechst != hoch:
            falsch.append("%s/%s -> Regel sagt %s/%s" % (druck, hoch, billig, hoechst))
    assert falsch == [], (
        "die Regel im Repo weicht von den Drucken im Stueck ab:\n  "
        + "\n  ".join(falsch))


@pytest.mark.skipif(not os.path.exists(DRUCKE_PY), reason="Druckmodul nicht im Baum")
def test_die_grundenergie_bleibt_die_billige():
    """Die Rangfolge der Seite gibt Karten OHNE Raritaet 999 und filtert
    sie in der "min"-Wahl aus. Fuer Grundenergien ist genau das falsch:
    mit dieser Regel waere die Metall-Energie der Listen SFA-99 (Secret
    Rare) statt MEE-8 (2 Cent). Gemessen am 23.09.2026."""
    d = _drucke()
    assert d.neuester_billiger_druck("MEE-8")[0] == "MEE-8"
    assert d.rang("", "MEE") < d.rang("Common", "MEE")
    assert d.rang("Secret Rare", "SFA") > d.rang("Double Rare", "PBL")
