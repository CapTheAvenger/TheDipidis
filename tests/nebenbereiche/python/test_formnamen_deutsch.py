"""DA-59 (06.11.2026): deutsche Formnamen im Champions-Pokedex.

Live stand „Durengard (Blade)" (gesehen 17.10.2026): der Alt-Form-Zweig
von parse_smogon() trug die ENGLISCHE Smogon-Endung als deutsche
Beschriftung. FORM_DE in scripts/build_champions_pokedex.py haelt die
pokewiki-Schreibweise (gelesen 06.11.2026: Hitze-Rotom, Klingenform,
Tiefform, Zwielichtform, Nachtform, Größe S/L/XL, Gelbgefiedert).

Geprueft wird die REGEL am Ergebnis: keine Basisform im Pokedex traegt
eine englische Endung als deutschen Zusatz — es sei denn, sie steht in
OFFEN_BENANNT, weil sie ein anderes Problem ist (Mega-Z-Formen laufen
heute als Alt-Form der Grundform, offen.md DA-66).
"""
import importlib.util
import json
import os
import re
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

# Endungen, die heute noch englisch stehen und als EIGENES Thema benannt
# sind. Faellt eine davon weg, wird die Liste hier kuerzer, nicht laenger.
OFFEN_BENANNT = {"Mega-Z"}


@pytest.fixture(scope="module")
def bauer():
    pfad = os.path.join(ROOT, "scripts", "build_champions_pokedex.py")
    spec = importlib.util.spec_from_file_location("build_champions_pokedex", pfad)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["build_champions_pokedex"] = mod
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope="module")
def dex():
    with open(os.path.join(ROOT, "data", "champions_pokedex.json"), encoding="utf-8") as f:
        return json.load(f)["entries"]


def _endung(en):
    m = re.match(r"^(.+?) \((.+)\)$", en)
    return (m.group(1), m.group(2)) if m else (None, None)


def test_keine_basisform_traegt_die_englische_endung_als_deutschen_zusatz(dex, bauer):
    schief = []
    for e in dex:
        if e.get("form") != "Base":
            continue
        grund, endung = _endung(e["en"])
        if not endung or endung in OFFEN_BENANNT:
            continue
        if (grund, endung) not in bauer.FORM_DE:
            schief.append(f"{e['en']} -> {e.get('de')}: Endung {endung!r} nicht in FORM_DE")
        elif e.get("de", "").endswith(f"({endung})"):
            schief.append(f"{e['en']} -> {e.get('de')}: deutscher Name traegt die englische Endung")
    assert schief == [], "\n  ".join(["englische Endung im deutschen Namen:"] + schief)


def test_die_tabelle_wird_angewandt_nicht_nur_gefuehrt(bauer):
    assert bauer.name_de_mit_form("Aegislash", "Durengard", "Blade") == "Durengard (Klingenform)"
    assert bauer.name_de_mit_form("Rotom", "Rotom", "Heat") == "Hitze-Rotom"
    # Unbekannte Form: ehrlich englisch, nicht geraten.
    assert bauer.name_de_mit_form("Rotom", "Rotom", "Unbekannt") == "Rotom (Unbekannt)"
    assert bauer.name_de_mit_form("Rotom", "Rotom", "") == "Rotom"


def test_jede_zeile_der_tabelle_steht_im_pokedex_oder_ist_tot(dex, bauer):
    # Eine Zeile fuer eine Form, die der Kader nicht fuehrt, ist nicht
    # falsch — aber sie ist ungeprueft. Benannt, damit sie nicht unbemerkt
    # veraltet.
    im_dex = {_endung(e["en"]) for e in dex if e.get("form") == "Base"}
    tot = [k for k in bauer.FORM_DE if k not in im_dex]
    assert len(tot) <= 3, f"FORM_DE fuehrt Formen, die der Kader nicht mehr hat: {tot}"
