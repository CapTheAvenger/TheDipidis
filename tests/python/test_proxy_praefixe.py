"""Der Proxy-Scraper muss das laufende japanische Set kennen.

BEFUND (gemessen 21.08.2026): der Wochenlauf meldet seit Wochen
"pokemonproxies scrape returned 0 URLs — site structure may have
changed" und behaelt die alte Karte. Die Seitenstruktur hat sich aber
nicht geaendert. In backend/scrapers/scrape_pokemonproxies_urls.py stand
eine von Hand gepflegte Liste:

    PREFIX_TO_SET = {"3a": "M3", "4a": "M4", "5a": "M5"}

M6 erschien am 31.07.2026, seine Dateien heissen 6a-*. Der daraus
gebaute Ausdruck konnte sie nicht treffen. Der Scraper hat gefunden,
wonach er suchte — er suchte nach dem falschen.

Folge: data/pokemonproxies_url_map.json traegt 79 Eintraege, alle M5,
scraped_at 2026-07-21. Japanische Karten aus M6 haben kein Bild.
Dieselbe Liste, ebenso blind, steckte in scripts/scrape_pokemonproxies.py.

Die Kuerzel folgen der Regel M<n> -> <n>a, und welches Set laeuft, steht
in data/format_window.json. Diese Datei prueft, dass die Ableitung
funktioniert — und zwar gegen das ECHTE Formatfenster, damit sie bei der
naechsten Rotation wieder anschlaegt statt still zu altern.
"""

import importlib.util
import json
import os
import re
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _lade(pfad, name):
    sys.path.insert(0, os.path.join(ROOT, "backend", "core"))
    sys.path.insert(0, os.path.dirname(pfad))
    spec = importlib.util.spec_from_file_location(name, pfad)
    modul = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(modul)
    except Exception as e:  # pragma: no cover
        pytest.skip(f"{name} nicht ladbar: {e}")
    return modul


BACKEND = _lade(os.path.join(ROOT, "backend", "scrapers",
                             "scrape_pokemonproxies_urls.py"), "pp_backend")
SKRIPT = _lade(os.path.join(ROOT, "scripts", "scrape_pokemonproxies.py"), "pp_skript")


# DIE JP-SETS HEISSEN NICHT IMMER "M<n>" (20.09.2026).
#
# Hier stand `re.fullmatch(r"M\d{1,2}", s)`. Am 16.09.2026 ist das
# JP-Set **M6A** erschienen; `current_set_jp` traegt seitdem einen
# Buchstaben am Ende, die Vorrichtung brach mit "current_set_jp
# unbrauchbar" ab und riss drei Pruefungen mit — ein Abbruch in der
# Vorrichtung, nicht einmal ein Fehlschlag.
#
# Das Muster kennt jetzt die Unterset-Schreibweise. Die Stammnummer ist
# das, woran die Praefix-Regel haengt (M6 -> "6a"), und sie wird hier
# einmal herausgeschnitten, damit jede Pruefung darunter dasselbe
# meint.
JP_MUSTER = re.compile(r"M(\d{1,2})([A-Z]?)")


@pytest.fixture(scope="module")
def jp_set():
    with open(os.path.join(ROOT, "data", "format_window.json"), encoding="utf-8") as f:
        s = str(json.load(f).get("current_set_jp") or "").strip().upper()
    assert JP_MUSTER.fullmatch(s), f"current_set_jp unbrauchbar: {s!r}"
    return s


def _stammset(jp_set):
    """'M6A' -> 'M6'; 'M6' -> 'M6'."""
    return "M" + JP_MUSTER.fullmatch(jp_set).group(1)


class TestAbleitung:
    def test_das_laufende_jp_set_steht_in_der_karte(self, jp_set):
        """Die Karte muss der JP-Rotation folgen — mindestens bis zum Stamm.

        GEMESSEN AM 20.09.2026: data/pokemonproxies_index.json fuehrt 42
        Bilder, alle unter dem Praefix "6a" und dem Set M6. Fuer das
        Unterset M6A liefert der Vite-Bundle der Quelle keine eigenen
        Dateien — es gibt also nichts zu finden und nichts zu erfinden.
        Ein geratenes Praefix waere hier der teuerste Fehler: es laedt
        ein Bild, das ein anderes Set zeigt.

        Geprueft wird deshalb der Stamm. Bekommt M6A eines Tages eigene
        Dateien, faellt das an genau dieser Stelle auf — dann steht das
        Unterset in der Quelle und gehoert in die Karte.
        """
        stamm = _stammset(jp_set)
        assert stamm in BACKEND.PREFIX_TO_SET.values(), (
            f"{stamm} (Stamm von {jp_set}) fehlt in PREFIX_TO_SET "
            f"{BACKEND.PREFIX_TO_SET} — dann findet der Scraper dessen "
            "Karten nicht"
        )
        assert stamm in SKRIPT.SET_MAP.values(), (
            f"{stamm} fehlt in scripts/scrape_pokemonproxies.py SET_MAP"
        )

    def test_der_ausdruck_trifft_eine_datei_des_laufenden_sets(self, jp_set):
        praefix = BACKEND._prefix_fuer(_stammset(jp_set))
        assert praefix, f"kein Praefix ableitbar aus {jp_set}"
        treffer = BACKEND._ASSET_RE.search(
            f"/assets/{praefix}-001-Tropius-5SkyH5ve.png")
        assert treffer, f"der Ausdruck trifft {praefix}-Dateien nicht"
        assert treffer.group(1) == praefix

    def test_die_alten_sets_bleiben_erreichbar(self):
        # Sie haben teils keinen internationalen Druck; wer sie
        # herausnimmt, verliert die Bilder rueckwirkend.
        for alt in ("3a", "4a", "5a"):
            assert alt in BACKEND.PREFIX_TO_SET, f"{alt} verschwunden"

    def test_die_regel_ist_die_regel(self):
        assert BACKEND._prefix_fuer("M6") == "6a"
        assert BACKEND._prefix_fuer("M12") == "12a"
        assert BACKEND._prefix_fuer("PBL") == ""
        assert BACKEND._prefix_fuer("") == ""

    def test_ohne_formatfenster_bleibt_der_bestand(self):
        karte = BACKEND.baue_prefix_karte("")
        assert karte == {"3a": "M3", "4a": "M4", "5a": "M5"}, (
            "ohne Fenster darf nichts erfunden und nichts verloren gehen"
        )

    def test_ein_kuenftiges_set_kaeme_automatisch_dazu(self):
        karte = BACKEND.baue_prefix_karte("M9")
        for n in (6, 7, 8, 9):
            assert karte[f"{n}a"] == f"M{n}"


class TestFallbackRouten:
    def test_die_set_routen_folgen_derselben_karte(self, jp_set):
        jp_set = _stammset(jp_set)
        assert f"/{jp_set.lower()}" in BACKEND.FALLBACK_PATHS, (
            f"Route /{jp_set.lower()} fehlt in FALLBACK_PATHS "
            f"{BACKEND.FALLBACK_PATHS}"
        )
