# -*- coding: utf-8 -*-
"""Was in den ausgelieferten CSVs steht, muss belegt sein.

Die Regel und ihre Begruendung stehen in
tests/python/test_ace_spec_regel.py und backend/core/ace_spec_regel.py.
Hier wird nur nachgemessen, ob der ausgelieferte Bestand ihr folgt:

  * kein "Yes" fuer einen Namen ausserhalb data/ace_specs.json
    (frueher 12.734 Zeilen, "Switch" 4.473x),
  * kein "No" fuer einen Namen darin
    (frueher 4.221 Zeilen, "Neo Upper Energy" 1.133x),
  * kein "Yes" bei mehr als einer Kopie im Deck — das verbietet die
    Deckregel (frueher 4.492 Zeilen),
  * und die Grundlage der Typregel: die Listennamen treten im Bestand
    ausschliesslich als Item, Tool, Stadium oder Special Energy auf.
    Faellt das je um, ist die Regel nicht mehr gedeckt.
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


# ── 2. Der ausgelieferte Bestand ─────────────────────────────────────

def test_bestand_wurde_gelesen(bestand):
    assert len(bestand) > 500_000, "zu wenige Zeilen gelesen — Test greift ins Leere"


def test_nur_erlaubte_werte(bestand):
    schlecht = collections.Counter()
    for datei, idx, fs in bestand:
        w = _feld(idx, fs, "is_ace_spec")
        if w not in ERLAUBT:
            schlecht[(datei, w)] += 1
    assert not schlecht, "unerlaubte Werte: %s" % schlecht.most_common(5)


def test_kein_yes_ohne_listeneintrag(bestand, ace):
    schlecht = collections.Counter()
    for datei, idx, fs in bestand:
        if _feld(idx, fs, "is_ace_spec") == "Yes":
            n = (_feld(idx, fs, "card_name") or "").strip().lower()
            if n not in ace:
                schlecht[n] += 1
    assert not schlecht, (
        "%d Zeilen tragen Yes fuer Namen ausserhalb data/ace_specs.json: %s"
        % (sum(schlecht.values()), schlecht.most_common(5)))


def test_kein_no_fuer_einen_listennamen(bestand, ace):
    schlecht = collections.Counter()
    for datei, idx, fs in bestand:
        if _feld(idx, fs, "is_ace_spec") == "No":
            n = (_feld(idx, fs, "card_name") or "").strip().lower()
            if n in ace:
                schlecht[n] += 1
    assert not schlecht, (
        "%d Zeilen tragen No fuer eine ACE SPEC: %s"
        % (sum(schlecht.values()), schlecht.most_common(5)))


def test_kein_yes_mit_mehr_als_einer_kopie(bestand):
    """Die Deckregel laesst genau eine ACE SPEC zu — zwei Kopien derselben
    Karte in einem Deck schliessen sie aus."""
    schlecht = collections.Counter()
    for datei, idx, fs in bestand:
        if _feld(idx, fs, "is_ace_spec") != "Yes":
            continue
        roh = _feld(idx, fs, "max_count")
        if roh is None:
            roh = _feld(idx, fs, "count")
        try:
            m = float(str(roh).replace(",", "."))
        except (TypeError, ValueError):
            continue
        if m > 1:
            schlecht[(datei, (_feld(idx, fs, "card_name") or "").strip())] += 1
    assert not schlecht, (
        "%d logisch unmoegliche Zeilen (Yes und mehr als eine Kopie): %s"
        % (sum(schlecht.values()), schlecht.most_common(5)))


def test_listennamen_widersprechen_den_daten_nicht(bestand, ace):
    """Waere ein Listenname je mehrfach gespielt worden, waere entweder die
    Liste falsch oder die Zeile — dann darf hier nichts stillschweigend
    'Yes' heissen."""
    schlecht = collections.Counter()
    for datei, idx, fs in bestand:
        n = (_feld(idx, fs, "card_name") or "").strip().lower()
        if n not in ace:
            continue
        roh = _feld(idx, fs, "max_count")
        if roh is None:
            roh = _feld(idx, fs, "count")
        try:
            m = float(str(roh).replace(",", "."))
        except (TypeError, ValueError):
            continue
        if m > 1:
            schlecht[n] += 1
    assert not schlecht, (
        "Listennamen mit mehr als einer Kopie im Deck: %s" % schlecht.most_common(5))


def test_typgrundlage_der_regel_haelt(bestand, ace):
    """Die Typregel steht und faellt damit, dass ACE SPECs im Bestand nur
    als Item, Tool, Stadium oder Special Energy vorkommen."""
    typen = collections.defaultdict(set)
    for datei, idx, fs in bestand:
        n = (_feld(idx, fs, "card_name") or "").strip().lower()
        if n not in ace:
            continue
        t = (_feld(idx, fs, "type") or "").strip()
        if t:
            typen[n].add(t)
    assert typen, "keine ACE SPEC im Bestand gefunden — Test greift ins Leere"
    fremd = {n: sorted(ts) for n, ts in typen.items() if not set(ts) <= ACE_TYPEN}
    assert not fremd, "ACE SPEC mit unerwartetem Typ: %s" % fremd


def test_aktuelles_meta_hat_wieder_ace_specs(bestand):
    """current_meta_card_data.csv trug 0 von 3.311 Zeilen Yes."""
    treffer = sum(1 for datei, idx, fs in bestand
                  if datei == "current_meta_card_data.csv"
                  and _feld(idx, fs, "is_ace_spec") == "Yes")
    assert treffer > 100, "nur %d Yes im aktuellen Meta" % treffer


def test_leere_felder_bleiben_die_ausnahme(bestand):
    leer = sum(1 for _, idx, fs in bestand if _feld(idx, fs, "is_ace_spec") == "")
    anteil = leer / len(bestand)
    assert anteil < 0.01, (
        "%.2f %% der Zeilen unbelegt — die Regel deckt zu wenig ab"
        % (anteil * 100))


def test_leere_felder_sind_nie_pokemon(bestand):
    """Wenn etwas leer bleibt, dann weil der Typ es offen laesst — ein
    Pokemon ist immer entscheidbar."""
    schlecht = collections.Counter()
    for datei, idx, fs in bestand:
        if _feld(idx, fs, "is_ace_spec") != "":
            continue
        t = (_feld(idx, fs, "type") or "").strip()
        if t in POKEMON_TYPEN:
            schlecht[(_feld(idx, fs, "card_name") or "").strip()] += 1
    assert not schlecht, "leere Felder bei Pokemon: %s" % schlecht.most_common(5)


