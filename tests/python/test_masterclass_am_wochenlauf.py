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
     wie in den Dateien: Meta-Anteile und die Reihenfolge, die die
     Einleitung verspricht.
  3. Die Druckregel liegt im Repo, nicht im Scratchpad, und liefert
     genau die Drucke, die im Stueck stehen — sonst bekaeme eine
     nachgezogene Liste andere Karten als der Rest.

UMZUG 17.10.2026: das Stueck liegt nur noch in Hausis Konto. Die Erzeuger
schreiben data/masterclass_live/mega-stalobor.json; Anteile und
Reihenfolge setzt die Seite beim Oeffnen (tests/unit/test-masterclass-live.js
prueft das am Verhalten). Was das Stueck selbst traegt, laeuft hier nur,
wenn MASTERCLASS_STUECK eine Datei nennt.
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
STUECK = os.environ.get("MASTERCLASS_STUECK") or os.path.join(WURZEL, "masterclass", "mega-stalobor.de.html")
LIVE = os.path.join(WURZEL, "data", "masterclass_live", "mega-stalobor.json")
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
    """Der Wochenlauf nimmt `git add -A` — damit sind
    data/masterclass_online_listen.json und data/masterclass_live/ mit
    drin. Faellt das weg, muessen sie einzeln in die Liste."""
    text = _lies(WOCHE)
    assert re.search(r"git add -A", text), (
        "der Wochenlauf listet die Dateien einzeln auf — dann gehoert "
        "data/masterclass_online_listen.json dazu")


def test_der_api_lauf_zieht_die_zahlen_weiter_nach():
    """Der haeufigere Lauf schreibt die Matchup-CSVs; sein Schritt darf
    beim Umbau nicht verloren gehen."""
    text = _lies(API)
    assert "scripts/masterclass_zahlen_nachziehen.py" in text
    assert re.search(r"git add\s+data/masterclass_live/", text)


def test_der_scraper_schreibt_die_listendatei():
    text = _lies(SCRAPER)
    assert "build_masterclass_listen" in text
    assert "masterclass_online_listen.json" in text
    # Und er schreibt sie NACH dem Sammeln, aus demselben Datensatz.
    assert text.index("def build_masterclass_listen") < text.index(
        'json.dump({"archetyp"')


# ------------------------------------------- 2. Meta-Anteile und Reihenfolge

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
    """(englischer Name, Meta-Anteil als Text) je Matchup-Zeile."""
    return [(html.unescape(a).strip(), b) for a, b in re.findall(
        r'<span class="mcl-nm">[^<]*<em>([^<]*)</em></span>\s*'
        r'<span class="mcl-sub">([\d.,]+) %', _stueck())]


@pytest.mark.skipif(not (os.path.exists(LIVE) and os.path.exists(FELD_CSV)),
                    reason="Live-Datei oder Feld-CSV nicht im Baum")
def test_die_feldanteile_stehen_so_da_wie_in_der_datei():
    """Die Anteile, die die Seite einsetzt, sind die der Datei — dieselbe
    Quelle wie die Meta-Seite."""
    import json
    with open(LIVE, encoding="utf-8") as f:
        da = json.load(f)["matchups"]["anteile"]
    anteile = _anteile()
    assert da == anteile, "die Live-Datei fuehrt andere Meta-Anteile als data/limitless_online_decks.csv"
    assert len(da) >= 15, "nur %d Anteile — der Test liefe ins Leere" % len(da)


@pytest.mark.skipif(not os.path.exists(STUECK), reason="Stueck liegt im Konto (MASTERCLASS_STUECK nicht gesetzt)")
def test_die_reihenfolge_haelt_was_die_einleitung_verspricht():
    """Ueber der Liste steht "Sortiert nach Meta-Anteil" — das Versprechen
    muss im Stueck stehen; das Sortieren beim Oeffnen prueft
    tests/unit/test-masterclass-live.js."""
    roh = _stueck()
    assert "Sortiert nach Meta-Anteil" in roh, "das Versprechen steht nicht mehr da"
    assert len(_zeilen()) >= 15


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


# ------------------------------------------- W5: nie "Feld", immer "Meta"
def _sichtbarer_text(roh):
    """Nur der Text, den Leser sehen: ohne Tags und ohne <code>-Pfade."""
    roh = re.sub(r"<code>.*?</code>", "", roh, flags=re.S)
    return html.unescape(re.sub(r"<[^>]+>", " ", roh))


def _feld_woerter(text):
    """"Feld" als Teil eines Wortes, ausser "Regelfeld" (Pokemon-Begriff,
    die Regelbox der Karte) — die Anordnung W5 (03.10.2026) meint die
    Zusammensetzung der Teilnehmer."""
    ohne = re.sub(r"[Rr]egelfeld(?:er)?", "", text)
    return re.findall(r"\w*[Ff]eld\w*", ohne)


@pytest.mark.skipif(not os.path.exists(STUECK), reason="Stueck liegt im Konto (MASTERCLASS_STUECK nicht gesetzt)")
def test_das_stueck_sagt_meta_statt_feld():
    """Hausi, 04.10.2026: "Feldanteil" heisst im Stueck "Meta-Anteil"."""
    with open(STUECK, encoding="utf-8") as f:
        roh = f.read()
    assert _feld_woerter(_sichtbarer_text(roh)) == [], (
        "das Stueck sagt noch \"Feld\": "
        + str(sorted(set(_feld_woerter(_sichtbarer_text(roh))))))


def test_feld_probe_schlaegt_an():
    """Verfaelschungsprobe: die Pruefung muss ein "Feldanteil" finden und
    "Regelfeld" durchlassen."""
    assert _feld_woerter("10 % Feldanteil") == ["Feldanteil"]
    assert _feld_woerter("das Regelfeld und die Regelfelder") == []
