"""DA-40 (07.10.2026): der Japan-Durchschnittsrang mischte City Leagues (4-16
Plaetze) mit der Champions League (32+). Fuer den Rang zaehlen nur City Leagues,
Anteil und Anzahl weiter alles. Fuehrt die Funktion des Scrapers aus."""
import os
import sys

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
for _p in (os.path.join(HIER, '..', '..', 'backend', 'core'), os.path.join(HIER, '..', '..', 'backend', 'scrapers')):
    _p = os.path.abspath(_p)
    if _p not in sys.path:
        sys.path.insert(0, _p)


def _modul():
    return pytest.importorskip("city_league_archetype_scraper")


def test_major_zaehlt_nicht_fuer_den_rang():
    m = _modul()
    eintraege = [
        {'format': 'City League (JP)', 'placement': '1'},
        {'format': 'City League (JP)', 'placement': '3'},
        {'format': 'Champions League (JP)', 'placement': '29'},
    ]
    assert m.rang_schnitt(eintraege) == 2


def test_ohne_city_league_der_schnitt_aller():
    m = _modul()
    assert m.rang_schnitt([{'format': 'Champions League (JP)', 'placement': '10'},
                           {'format': 'Champions League (JP)', 'placement': '20'}]) == 15


def test_ohne_format_gilt_city_league():
    m = _modul()
    assert m.rang_schnitt([{'placement': '4'}, {'placement': '0'}]) == 4
