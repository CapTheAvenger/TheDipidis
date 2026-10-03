"""DA-32 (03.10.2026): Der Scraper benennt einen Archetyp nach dem Slug-Eintrag
in labs_tournament_decks.csv (Anzeigename), nicht nach dem title-cased Slug.
Ausgefuehrt mit einer Wegwerf-Zuordnung; ohne Treffer bleibt der alte Weg."""
import importlib
import os
import sys

HIER = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HIER, "..", "..", "backend", "scrapers"))
sys.path.insert(0, os.path.join(HIER, "..", "..", "backend", "core"))


def _modul():
    return importlib.import_module("current_meta_analysis_scraper")


def test_slug_treffer_gibt_den_anzeigenamen():
    m = _modul()
    m._SLUG_NAMEN = {"basic-box-m": "Basic Box", "mew-ex-30c": "Mew Box"}
    assert m.archetyp_aus_slug("basic-box-m") == "Basic Box"
    assert m.archetyp_aus_slug("mew-ex-30c") == "Mew Box"


def test_ohne_treffer_bleibt_die_bisherige_kanonisierung():
    m = _modul()
    m._SLUG_NAMEN = {}
    assert m.archetyp_aus_slug("crustle-dri") == m._canonicalize_archetype(m.slug_to_archetype("crustle-dri"))


def test_der_listenlauf_nutzt_die_zuordnung():
    q = open(os.path.join(HIER, "..", "..", "backend", "scrapers", "current_meta_analysis_scraper.py"), encoding="utf-8").read()
    assert "deck_name = archetyp_aus_slug(slug)" in q
