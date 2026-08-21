"""Die japanische Kartendatenbank darf durch einen Lauf nicht schrumpfen.

GEMESSEN am 21.08.2026: data/japanese_cards_database.csv enthielt 772
Zeilen aus genau fuenf Sets — M6 und vier Promo-Sets (SP, SVP, SMP, HSP).
M5, M4 und M3 fehlten vollstaendig. Die Datei war zuletzt am 28.07.2026
geschrieben worden; sieben Wochenlaeufe danach haben nichts ergaenzt.

Zwei Ursachen, beide hier festgehalten:

1. Der Schreibpfad oeffnete die Datei mit "w" und ersetzte sie durch das
   Ergebnis EINES Laufs. Was dieser Lauf nicht fand, war weg.
2. Faellt die JP-Set-Uebersicht aus (Cloudflare, geaenderte
   Seitenstruktur), lieferte quick_check_latest_sets() eine leere Menge.
   Der Lauf ging trotzdem weiter und fragte nur die fest verdrahteten
   Promo-Sets ab — und genau dieses Ergebnis ersetzte die Datenbank.
   Das erklaert die beobachtete Zusammensetzung Punkt fuer Punkt.
"""

import csv
import importlib.util
import os
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SKRIPT = os.path.join(ROOT, "backend", "scrapers", "japanese_cards_scraper.py")


def _lade_modul():
    """Das Modul ohne Netzwerk und ohne die schweren Importe laden."""
    sys.path.insert(0, os.path.join(ROOT, "backend", "core"))
    sys.path.insert(0, os.path.join(ROOT, "backend", "scrapers"))
    spec = importlib.util.spec_from_file_location("jp_scraper", SKRIPT)
    modul = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(modul)
    except Exception as e:  # pragma: no cover
        pytest.skip(f"Modul nicht ladbar (Abhaengigkeit fehlt): {e}")
    return modul


JP = _lade_modul()


def z(set_code, nummer):
    return {"name": f"K{nummer}", "set": set_code, "number": str(nummer),
            "type": "", "rarity": "", "image_url": ""}


class TestZusammenlegen:
    def test_ein_erneuertes_set_loescht_die_anderen_nicht(self):
        alt = [z("M4", 1), z("M4", 2), z("M5", 1), z("SP", 1)]
        neu = [z("M6", 1), z("M6", 2)]
        zeilen, erneuert, behalten = JP.merge_rows(alt, neu)
        assert erneuert == {"M6"}
        assert behalten == {"M4", "M5", "SP"}
        assert {r["set"] for r in zeilen} == {"M4", "M5", "SP", "M6"}
        assert len(zeilen) == 6

    def test_ein_set_wird_vollstaendig_ersetzt_nicht_ergaenzt(self):
        # Karten, die aus einem Set verschwinden (Korrektur an der Quelle),
        # sollen auch hier verschwinden — aber nur in diesem einen Set.
        alt = [z("M6", 1), z("M6", 2), z("M6", 3), z("SP", 1)]
        neu = [z("M6", 1)]
        zeilen, erneuert, behalten = JP.merge_rows(alt, neu)
        assert erneuert == {"M6"}
        assert len([r for r in zeilen if r["set"] == "M6"]) == 1
        assert len([r for r in zeilen if r["set"] == "SP"]) == 1

    def test_leerer_bestand_ist_kein_sonderfall(self):
        zeilen, erneuert, behalten = JP.merge_rows([], [z("M6", 1)])
        assert len(zeilen) == 1 and behalten == set()


class TestVerlustschutz:
    def test_verschwundenes_set_haelt_das_schreiben_an(self):
        alt = [z("M4", 1), z("M5", 1), z("M6", 1)]
        # Ein Lauf, der nur die Promos findet — genau der reale Fall.
        nur_promos = [z("SP", 1), z("SVP", 1)]
        zusammen, _, _ = JP.merge_rows(alt, nur_promos)
        # Zusammengelegt geht nichts verloren, der Schutz meldet nichts:
        assert JP.pruefe_kein_verlust(alt, zusammen) is None
        # Ohne Zusammenlegen — also die alte Schreibweise — schlaegt er an:
        grund = JP.pruefe_kein_verlust(alt, nur_promos)
        assert grund is not None
        for s in ("M4", "M5", "M6"):
            assert s in grund

    def test_starkes_schrumpfen_haelt_das_schreiben_an(self):
        alt = [z("M6", i) for i in range(100)]
        neu = [z("M6", i) for i in range(50)]
        zusammen, _, _ = JP.merge_rows(alt, neu)
        grund = JP.pruefe_kein_verlust(alt, zusammen)
        assert grund is not None and "kleiner" in grund

    def test_gleichstand_und_wachstum_gehen_durch(self):
        alt = [z("M6", i) for i in range(100)]
        assert JP.pruefe_kein_verlust(alt, list(alt)) is None
        assert JP.pruefe_kein_verlust(alt, alt + [z("M7", 1)]) is None


class TestSchutzImWaechter:
    def test_die_datei_steht_jetzt_in_der_schwellenliste(self):
        pfad = os.path.join(ROOT, "scripts", "sanity_check_data.py")
        with open(pfad, encoding="utf-8") as f:
            quelle = f.read()
        assert "'japanese_cards_database.csv'" in quelle, (
            "ohne Eintrag faellt ein Totalverlust nirgends auf"
        )

    def test_der_heutige_bestand_liegt_ueber_der_schwelle(self):
        pfad = os.path.join(ROOT, "data", "japanese_cards_database.csv")
        if not os.path.exists(pfad):
            pytest.skip("JP-Datenbank nicht im Baum")
        with open(pfad, encoding="utf-8-sig") as f:
            zeilen = list(csv.DictReader(f))
        assert len(zeilen) >= 400, f"nur {len(zeilen)} Zeilen"


class TestLeereUebersicht:
    def test_ohne_set_uebersicht_wird_nicht_geschrieben(self):
        with open(SKRIPT, encoding="utf-8") as f:
            quelle = f.read()
        i = quelle.index("latest_online = quick_check_latest_sets()")
        j = quelle.index("all_cards = scrape_japanese_cards_list", i)
        block = quelle[i:j]
        assert "if not latest_online:" in block, (
            "eine leere Set-Uebersicht muss den Lauf beenden"
        )
        assert "return" in block
        assert "::error::" in block, "der Ausfall muss im CI-Log sichtbar sein"
