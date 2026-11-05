"""VP-01 (06.11.2026): Champions-Daten standen zehn Tage still — grün, aber still.

Ursachensatz: pokebase.app listet seit dem 27.10.2026 `floette-eternal`
statt `floette`; der Kader fuehrte damit die Grundform von Floette-Mega
nicht mehr, aus_mega() legte "Floette" neu an, und die Zusicherung „die
ergaenzten Grundformen sind BELEGT" fand fuer "floette" keine
Nutzungszeile (championsbattledata fuehrt sie als floette-eternal). Das
Tor rollte zehn Usage- und zehn Replica-Laeufe lang die ganze
Champions-Familie zurueck (27.10.–05.11.). Zweiter Befund am 05.11.:
die Quelle lieferte um 04:01 und 05:07 UTC fuer 54 Pokemon duenne
Doppel-Bloecke (ein Item 100 %), der Pokedex-Bau fand fuer neun
Mega-Formen keinen Stein mehr.

Drei Regeln, alle an gebauten Faellen geprueft — nicht am Wochenwert:
  1. ein Slug, der eine Form unter der Grundform meint, heisst im Kader
     wie die Grundform (TEAM_UNTER_GRUNDFORM gilt auch fuer pokebase);
  2. ein Formatblock, der unter DUENN_ANTEIL der Zeilen seines
     Vorgaengers traegt, bleibt auf dem alten Stand — benannt;
  3. der Mega-Stein wird erst im Hauptformat, dann im anderen gesucht.
"""
import importlib.util
import os
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
SCRIPTS = os.path.join(ROOT, "scripts")


def _modul(name):
    spec = importlib.util.spec_from_file_location(name, os.path.join(SCRIPTS, name + ".py"))
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope="module")
def roster():
    return _modul("scrape_champions_roster")


@pytest.fixture(scope="module")
def usage():
    return _modul("scrape_champions_usage")


@pytest.fixture(scope="module")
def pokedex():
    return _modul("build_champions_pokedex")


SMOGON = {
    "Floette": {"baseStats": {"hp": 54}},
    "Floette-Eternal": {"baseStats": {"hp": 74}},
    "Floette-Mega": {"baseStats": {"hp": 74}},
    "Dragalge": {"baseStats": {"hp": 65}},
    "Dragalge-Mega": {"baseStats": {"hp": 65}},
    "Maushold": {"baseStats": {"hp": 74}},
    "Maushold-Four": {"baseStats": {"hp": 74}},
}


# ── Regel 1: Formen unter der Grundform, auch aus der Kaderquelle ────

def test_jede_form_unter_der_grundform_heisst_aus_dem_slug_wie_die_grundform(roster):
    for form, grundform in roster.TEAM_UNTER_GRUNDFORM.items():
        slug = roster.als_schluessel(form)
        assert roster.slug_to_smogon(slug) == grundform, (
            f"pokebase-Slug {slug!r} muss auf {grundform!r} abbilden, "
            f"nicht auf {roster.slug_to_smogon(slug)!r}")


def test_der_fall_vom_27_10_floette_eternal_im_kader(roster):
    # Genau die Liste, die pokebase seit dem 27.10.2026 liefert: die
    # Mega-Form und die Ewigbluetler-Form, keine gewoehnliche Floette.
    base = roster.kader_aus_slugs(["floette-eternal", "floette-mega", "dragalge-mega"], SMOGON)
    assert base == ["Floette", "Floette-Mega", "Dragalge-Mega"], base
    aus_mega, ohne = roster.grundformen_aus_megas(base, set(base), SMOGON)
    assert aus_mega == ["Dragalge"], (
        "Floette darf NICHT als abgeleitete Grundform auftauchen — sie steht "
        f"ueber floette-eternal schon im Kader; ergaenzt wurde: {aus_mega}")
    assert ohne == []


def test_die_ergaenzung_bleibt_fuer_echte_luecken_scharf(roster):
    aus_mega, ohne = roster.grundformen_aus_megas(
        ["Dragalge-Mega", "Floette-Mega"], {"Dragalge-Mega", "Floette-Mega"}, SMOGON)
    assert sorted(aus_mega) == ["Dragalge", "Floette"]


# ── Regel 2: duenne Bloecke bleiben auf dem alten Stand ──────────────

def _block(n_moves, item_pct):
    return {
        "move": [{"name": f"m{i}", "pct": 10.0} for i in range(n_moves)],
        "held_item": [{"name": "Stein", "pct": item_pct}],
        "teammate": [{"name": "t", "rang": 1}],
        "nature": [{"name": "Adamant", "pct": 100.0}],
        "stat_points": [{"evs": "32 Atk", "pct": 100.0}],
        "ability": [{"name": "a"}],
    }


def test_der_fall_vom_05_11_duenner_block_bleibt_alt(usage):
    alt = {"baxcalibur": {"doubles": _block(10, 62.5), "singles": _block(10, 45.3)}}
    neu = {"baxcalibur": {"doubles": _block(1, 100.0), "singles": _block(9, 63.2)},
           "neuling": {"doubles": _block(1, 100.0)}}
    behalten = usage.duenne_bloecke_behalten(neu, alt, "2026-10-26T05:11:09+00:00")
    assert [(s, f) for s, f, _a, _n in behalten] == [("baxcalibur", "doubles")]
    assert neu["baxcalibur"]["doubles"]["held_item"][0]["pct"] == 62.5
    assert "2026-10-26" in neu["baxcalibur"]["doubles"]["_warnungen"][0]
    # Der Einzel-Block war frisch genug und bleibt frisch.
    assert neu["baxcalibur"]["singles"]["held_item"][0]["pct"] == 63.2
    assert "_warnungen" not in neu["baxcalibur"]["singles"]
    # Ohne Vorgaenger gibt es nichts zu behalten — ein neuer Eintrag kommt
    # so herein, wie die Quelle ihn liefert.
    assert neu["neuling"]["doubles"]["held_item"][0]["pct"] == 100.0


def test_die_grenze_ist_ein_anteil_und_liegt_unter_eins(usage):
    assert 0 < usage.DUENN_ANTEIL < 1
    alt = {"x": {"doubles": _block(10, 50.0)}}
    knapp_drueber = {"x": {"doubles": _block(int(10 * usage.DUENN_ANTEIL) + 1, 50.0)}}
    assert usage.duenne_bloecke_behalten(knapp_drueber, alt) == []


# ── Regel 3: der Stein wird in beiden Formaten gesucht ───────────────

def test_stein_aus_dem_anderen_format_wenn_das_hauptformat_ihn_nicht_traegt(pokedex):
    rec = {"doubles": {"held_item": [{"name": "Focus Sash", "pct": 100.0}]},
           "singles": {"held_item": [{"name": "Baxcalibrite", "pct": 63.2}]}}
    assert pokedex._stein_anteil(rec, "Mega Baxcalibur") == (63.2, "Baxcalibrite")


def test_das_hauptformat_hat_vorrang(pokedex):
    rec = {"doubles": {"held_item": [{"name": "Baxcalibrite", "pct": 62.5}]},
           "singles": {"held_item": [{"name": "Baxcalibrite", "pct": 63.2}]}}
    assert pokedex._stein_anteil(rec, "Mega Baxcalibur") == (62.5, "Baxcalibrite")


def test_x_y_kennung_gilt_auch_im_anderen_format(pokedex):
    rec = {"doubles": {"held_item": [{"name": "Focus Sash", "pct": 100.0}]},
           "singles": {"held_item": [{"name": "Raichunite X", "pct": 40.0}]}}
    assert pokedex._stein_anteil(rec, "Mega Raichu Y") == (None, None)
    assert pokedex._stein_anteil(rec, "Mega Raichu X") == (40.0, "Raichunite X")
