# -*- coding: utf-8 -*-
"""Die Regel hinter `is_ace_spec` — drei Werte, jeder mit Beleg.

BEFUND (30.08.2026, alle 21 ausgelieferten CSVs mit dieser Spalte)
------------------------------------------------------------------
653.852 Zeilen. Gegen data/ace_specs.json gemessen war die Spalte in
beide Richtungen falsch: 12.734 Zeilen "Yes" fuer Namen, die nicht auf
der Liste stehen ("Switch" 4.473x, "Jamming Tower" 3.306x, "Roxanne"
1.121x), und 4.221 Zeilen "No" fuer echte ACE SPECs ("Neo Upper Energy"
1.133x, "Legacy Energy" 1.097x). 4.492 Zeilen waren in sich unmoeglich:
"Yes" bei max_count > 1, obwohl eine ACE SPEC nur einmal ins Deck darf.
data/current_meta_card_data.csv trug 0 von 3.311 Zeilen "Yes" trotz 184
echter ACE SPECs.

Ursache war eine tote Pruefung (`'ace spec' in v['type']`, siehe
backend/core/card_scraper_shared.py). Der Bestand wird von
scripts/repariere_ace_spec.py geraeumt; die Zeilen, die ab jetzt neu
entstehen, gehen durch backend/core/ace_spec_regel.py.

Diese Datei haelt die Regel selbst fest und dass es bei EINER bleibt —
alle vier Schreibstellen importieren dieselbe Funktion, statt sie zu
kopieren. Die Pruefungen am ausgelieferten Bestand stehen in
tests/python/test_ace_spec_bestand.py.
"""

import collections
import glob
import json
import os
import sys

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
DATEN = os.path.join(WURZEL, "data")
if WURZEL not in sys.path:
    sys.path.insert(0, WURZEL)

from backend.core.ace_spec_regel import (  # noqa: E402
    KEINE_ACE_TYPEN,
    POKEMON_TYPEN,
    entscheide,
    entscheide_zeile,
    lade_ace_liste,
)
from scripts.repariere_ace_spec import felder, lies, dateien_mit_spalte  # noqa: E402

ERLAUBT = ("Yes", "No", "")
# Typen, mit denen die kanonischen Namen tatsaechlich im Bestand stehen.
ACE_TYPEN = {"Item", "Tool", "Stadium", "Special Energy"}


@pytest.fixture(scope="module")
def ace():
    return lade_ace_liste(os.path.join(DATEN, "ace_specs.json"))


@pytest.fixture(scope="module")
def bestand():
    """Alle Zeilen aller ausgelieferten CSVs mit der Spalte, einmal gelesen."""
    aus = []
    for pfad in dateien_mit_spalte(DATEN):
        _, tr, namen, zeilen = lies(pfad)
        if not zeilen or "is_ace_spec" not in namen or "card_name" not in namen:
            continue
        idx = {n: i for i, n in enumerate(namen)}
        for zeile in zeilen[1:]:
            fs = [w for w, _, _ in felder(zeile.rstrip("\r\n"), tr)]
            if len(fs) != len(namen):
                continue
            aus.append((os.path.basename(pfad), idx, fs))
    return aus


def _feld(idx, fs, name):
    i = idx.get(name)
    return fs[i] if i is not None else None


# ── 1. Die Regel ─────────────────────────────────────────────────────

def test_liste_ist_gefuellt(ace):
    assert len(ace) >= 30, "ace_specs.json unerwartet leer oder winzig"
    assert all(n == n.strip().lower() for n in ace)


def test_name_auf_liste_wird_yes(ace):
    assert entscheide("Prime Catcher", ace) == "Yes"
    assert entscheide("prime catcher", ace) == "Yes"
    assert entscheide("  Unfair Stamp  ", ace) == "Yes"


def test_mehrfach_gespielt_wird_no(ace):
    assert entscheide("Switch", ace, {"switch"}, {}) == "No"


def test_nur_pokemon_wird_no(ace):
    assert entscheide("Cleffa", ace, set(), {"cleffa": {"Basic"}}) == "No"
    assert entscheide("Annihilape", ace, set(), {"annihilape": {"Stage 2"}}) == "No"


def test_basis_energie_wird_no(ace):
    assert entscheide("Basic Fire Energy", ace, set(),
                      {"basic fire energy": {"Basic Energy"}}) == "No"


def test_unbelegtes_bleibt_leer(ace):
    """Ein Supporter, der nie mehrfach lag und nicht auf der Liste steht,
    ist nach diesen Daten unbekannt — und wird nicht zu 'No' geraten."""
    assert entscheide("Ruffian", ace, set(), {"ruffian": {"Supporter"}}) == ""
    assert entscheide("Justified Gloves", ace, set(),
                      {"justified gloves": {"Tool"}}) == ""


def test_gemischte_typen_beweisen_nichts(ace):
    """Steht ein Name mal als Pokemon und mal als Item da, ist der Typweg
    kein Beleg mehr — dann darf nichts entschieden werden."""
    assert entscheide("Zwitter", ace, set(),
                      {"zwitter": {"Basic", "Item"}}) == ""


def test_leerer_name_entscheidet_nichts(ace):
    assert entscheide("", ace, {"switch"}, {}) == ""
    assert entscheide(None, ace) == ""
    assert entscheide_zeile("", ace, max_count=9) == ""


def test_liste_schlaegt_die_negativbelege(ace):
    """Widersprechen sich Liste und Beleg, gewinnt die Liste — und der
    Bestand darf so einen Widerspruch gar nicht erst enthalten (s. u.)."""
    assert entscheide("Prime Catcher", ace, {"prime catcher"}, {}) == "Yes"


def test_zeilenregel_deckt_sich_mit_der_bestandsregel(ace):
    assert entscheide_zeile("Switch", ace, max_count=4) == "No"
    assert entscheide_zeile("Unfair Stamp", ace, max_count=1) == "Yes"
    assert entscheide_zeile("Cleffa", ace, max_count=1, typ="Basic") == "No"
    assert entscheide_zeile("Ruffian", ace, max_count=1, typ="Supporter") == ""
    assert entscheide_zeile("Switch", ace, max_count="4,0") == "No"


def test_ohne_liste_wird_nichts_behauptet():
    """Fehlt die Quelle, wird nicht still 'No' geschrieben."""
    leer = set()
    assert entscheide("Prime Catcher", leer) == ""
    assert entscheide_zeile("Prime Catcher", leer, max_count=1, typ="Item") == ""


def test_pokemon_typen_enthalten_keine_trainer():
    assert "Item" not in KEINE_ACE_TYPEN
    assert "Tool" not in KEINE_ACE_TYPEN
    assert "Stadium" not in KEINE_ACE_TYPEN
    assert "Special Energy" not in KEINE_ACE_TYPEN
    assert "Supporter" not in KEINE_ACE_TYPEN, (
        "Supporter waere sachlich richtig, ist aber aus diesen Daten nicht "
        "beweisbar — bewusst draussen")
    assert POKEMON_TYPEN <= KEINE_ACE_TYPEN


# ── 3. Eine Regel, nicht zwei ────────────────────────────────────────

SCHREIBSTELLEN = (
    os.path.join("backend", "core", "limitless_dated.py"),
    os.path.join("backend", "core", "card_scraper_shared.py"),
    os.path.join("backend", "scrapers", "tournament_scraper_JH.py"),
    os.path.join("backend", "scrapers", "per_decklist_scraper.py"),
)


@pytest.mark.parametrize("rel", SCHREIBSTELLEN)
def test_jede_schreibstelle_benutzt_die_regel(rel):
    quelle = open(os.path.join(WURZEL, rel), encoding="utf-8-sig").read()
    assert "ace_spec_regel import" in quelle, (
        "%s schreibt is_ace_spec wieder an der Regel vorbei" % rel)
    assert "entscheide_zeile(" in quelle, (
        "%s importiert die Regel, ruft sie aber nicht auf" % rel)


@pytest.mark.parametrize("rel", SCHREIBSTELLEN)
def test_keine_schreibstelle_faellt_auf_no_zurueck(rel):
    """Der alte Rueckfall hiess `... else 'No'` und hat 630.000 Zeilen mit
    einer Behauptung gefuellt, fuer die es keinen Beleg gab."""
    quelle = open(os.path.join(WURZEL, rel), encoding="utf-8-sig").read()
    ohne_kommentare = "\n".join(
        z for z in quelle.split("\n") if not z.lstrip().startswith("#"))
    for muster in ("is_ace_spec_by_name(name) else 'No'",
                   'is_ace_spec_by_name(name) else "No"',
                   "c.get('is_ace_spec') else 'No'",
                   '"is_ace_spec": ""',
                   "'is_ace_spec': ''"):
        assert muster not in ohne_kommentare, (
            "%s setzt is_ace_spec wieder ungedeckt (%s)" % (rel, muster))


def test_die_reparatur_hat_keine_zweitregel():
    rep = open(os.path.join(WURZEL, "scripts", "repariere_ace_spec.py"),
               encoding="utf-8").read()
    assert "ace_spec_regel import" in rep
    assert "\ndef entscheide(" not in rep, (
        "Die Reparatur hat wieder eine eigene Kopie der Regel")


def test_die_liste_traegt_ihren_stand():
    j = json.load(open(os.path.join(DATEN, "ace_specs.json"), encoding="utf-8"))
    assert j.get("timestamp"), "ace_specs.json ohne Stand — nicht nachvollziehbar"
    assert j.get("source"), "ace_specs.json ohne Quelle"
    assert len(set(j["ace_specs"])) == len(j["ace_specs"]), "Dubletten in der Liste"
    assert j.get("total_count") == len(j["ace_specs"])
