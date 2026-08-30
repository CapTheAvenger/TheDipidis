# -*- coding: utf-8 -*-
"""Die Dex-Nummern muessen in den AUSGELIEFERTEN Dateien stehen.

BEFUND (Abnahmerunde 30.08.2026)
--------------------------------
PR #567 hat `loese_dex_nummer()` gebaut und mit 52 Zusicherungen
belegt: 88,4 % -> 99,3 % Abdeckung, kein Widerspruch zu den 15.183
bereits belegten Zeilen. Nur stand die Verbesserung danach ausschliess-
lich im CODE. `git show --stat ee689827` fasst keine einzige Datendatei
an; `data/cards_chunk_*.json` blieb bei 15.183 von 17.182 = 88,37 %.

Die Gegenprobe der Abnahme war vernichtend: **alle 3.753 Dex-Nummern
in `cards_chunk_standard.json` geleert -> `pytest tests/python -q`
bleibt gruen.** Kein einziger Test sah den ausgelieferten Bestand an;
`test_abdeckung_ist_deutlich_besser` misst die FUNKTION.

Genau dieser Unterschied ist in diesem Projekt schon einmal teuer
gewesen: `load_pokedex()` las monatelang das falsche Verzeichnis, und
niemand merkte es, weil die Funktion fuer sich genommen richtig war.

Diese Datei prueft deshalb, was ausgeliefert wird — nicht, was der Code
koennte. Seit dem Lauf der Kartenpipeline vom 30.08.2026 sind es
17.061 von 17.182 = 99,30 %.
"""

import glob
import json
import os
import sys

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
DATEN = os.path.join(WURZEL, "data")
KERN = os.path.join(WURZEL, "backend", "core")
for pfad in (WURZEL, KERN):
    if pfad not in sys.path:
        sys.path.insert(0, pfad)

from prepare_card_data import loese_dex_nummer  # noqa: E402

POKEMON_TYPEN = {"Basic", "Stage 1", "Stage 2", "VSTAR", "VMAX", "V-UNION",
                 "Restored", "LEGEND", "BREAK"}
# Gemessen am 30.08.2026 nach dem Pipelinelauf. Der Deckel liegt knapp
# darunter, damit ein einzelner neuer Tag-Team-Druck ihn nicht reisst —
# ein Rueckfall auf den alten Stand (88 %) aber sehr wohl.
MINDESTABDECKUNG = 0.98


@pytest.fixture(scope="module")
def pokemonzeilen():
    aus = []
    for pfad in sorted(glob.glob(os.path.join(DATEN, "cards_chunk_*.json"))):
        with open(pfad, encoding="utf-8") as f:
            for c in json.load(f):
                if (c.get("type") or "").strip() in POKEMON_TYPEN:
                    aus.append((os.path.basename(pfad), c))
    return aus


@pytest.fixture(scope="module")
def dex():
    with open(os.path.join(DATEN, "pokemon_dex_numbers.json"), encoding="utf-8") as f:
        return json.load(f)


def test_es_gibt_ueberhaupt_pokemonzeilen(pokemonzeilen):
    assert len(pokemonzeilen) > 15000, (
        "nur %d Pokemon-Zeilen gelesen — dann prueft der Test unten nichts"
        % len(pokemonzeilen))


def test_die_ausgelieferten_dateien_tragen_die_nummern(pokemonzeilen):
    """Das ist die Zusicherung, die am 30.08. gefehlt hat."""
    mit = sum(1 for _, c in pokemonzeilen if (c.get("pokedex_number") or "").strip())
    anteil = mit / len(pokemonzeilen)
    assert anteil >= MINDESTABDECKUNG, (
        "nur %.2f %% der Pokemon-Zeilen tragen eine Dex-Nummer (%d von %d). "
        "Vor der Reparatur waren es 88,37 %%; wenn das hier wieder faellt, "
        "ist die Kartenpipeline nicht gelaufen oder die Aufloesung ist kaputt."
        % (anteil * 100, mit, len(pokemonzeilen)))


def test_was_leer_ist_ist_auch_nicht_aufloesbar(pokemonzeilen, dex):
    """Eine leere Nummer ist nur dann in Ordnung, wenn die Aufloesung sie
    auch nicht bestimmen kann — sonst hat die Pipeline sie verloren."""
    verloren = []
    for datei, c in pokemonzeilen:
        if (c.get("pokedex_number") or "").strip():
            continue
        nummer, _grund = loese_dex_nummer(c.get("name_en", ""), dex)
        if nummer is not None:
            verloren.append((datei, c.get("name_en"), nummer))
    assert not verloren, (
        "%d Zeilen sind leer, obwohl die Aufloesung eine Nummer liefert: %s"
        % (len(verloren), verloren[:5]))


def test_keine_zeile_widerspricht_der_aufloesung(pokemonzeilen, dex):
    schlecht = []
    for datei, c in pokemonzeilen:
        alt = (c.get("pokedex_number") or "").strip()
        if not alt:
            continue
        nummer, _ = loese_dex_nummer(c.get("name_en", ""), dex)
        if nummer is not None and str(nummer) != alt:
            schlecht.append((datei, c.get("name_en"), alt, nummer))
    assert not schlecht, "%d Widersprueche, z. B. %s" % (len(schlecht), schlecht[:5])


def test_die_nummern_sind_zahlen_im_gueltigen_bereich(pokemonzeilen):
    schlecht = []
    for datei, c in pokemonzeilen:
        roh = (c.get("pokedex_number") or "").strip()
        if not roh:
            continue
        if not roh.isdigit() or not (1 <= int(roh) <= 1400):
            schlecht.append((datei, c.get("name_en"), roh))
    assert not schlecht, "unbrauchbare Dex-Nummern: %s" % schlecht[:5]


def test_auch_die_zusammengefuehrte_datei_traegt_sie():
    """all_cards_merged.csv ist eine veroeffentlichte Schnittstelle
    (data/_consumers.md) — sie darf nicht hinter den Chunks zurueckbleiben."""
    import csv
    pfad = os.path.join(DATEN, "all_cards_merged.csv")
    if not os.path.exists(pfad):
        pytest.skip("all_cards_merged.csv liegt nicht im Repo")
    with open(pfad, encoding="utf-8-sig", newline="") as f:
        kopf = f.readline()
        trenner = ";" if kopf.count(";") > kopf.count(",") else ","
        f.seek(0)
        zeilen = [r for r in csv.DictReader(f, delimiter=trenner)
                  if (r.get("type") or "").strip() in POKEMON_TYPEN]
    assert len(zeilen) > 15000, "zu wenige Pokemon-Zeilen: %d" % len(zeilen)
    mit = sum(1 for r in zeilen if (r.get("pokedex_number") or "").strip())
    anteil = mit / len(zeilen)
    assert anteil >= MINDESTABDECKUNG, (
        "all_cards_merged.csv: nur %.2f %% (%d von %d)"
        % (anteil * 100, mit, len(zeilen)))
