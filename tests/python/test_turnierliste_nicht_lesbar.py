"""Nicht lesbar ist nicht "keine Turniere".

BEFUND (29.09.2026, Pruefung des Wochenlaufs): scrapers/city_league_past_
archetype_scraper.py brach bei einem Ladefehler der Turnierliste (403,
Timeout) still ab und meldete danach "keine Turniere im Fenster" — dieselbe
Meldung wie in der japanischen Saisonpause, mit Code 0. Ein Ausfall der
Quelle war damit unsichtbar. Gemessen mit einer Attrappe fuer
fetch_page_bs4, die None liefert.

Die Zusicherung fuehrt die Funktion aus.
"""
import importlib.util
import os
import sys
from datetime import datetime

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SKRIPT = os.path.join(WURZEL, "backend", "scrapers", "city_league_past_archetype_scraper.py")


def _modul():
    sys.path.insert(0, os.path.join(WURZEL, "backend", "core"))
    sys.path.insert(0, os.path.join(WURZEL, "backend", "scrapers"))
    spec = importlib.util.spec_from_file_location("clpa_lesbar", SKRIPT)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_ein_ladefehler_auf_seite_eins_ist_nicht_leer(monkeypatch):
    m = _modul()
    monkeypatch.setattr(m, "fetch_page_bs4", lambda url: None)
    erg = m.get_tournaments_in_date_range("jp", datetime(2026, 9, 1), datetime(2026, 9, 28))
    assert erg is None, (
        "ein Ladefehler der Turnierliste kommt als %r zurueck — dann meldet der "
        "Scraper 'keine Turniere' statt 'Quelle nicht erreichbar'" % (erg,))


def test_main_meldet_den_ladefehler_nach_aussen(monkeypatch, capsys):
    m = _modul()
    monkeypatch.setattr(m, "fetch_page_bs4", lambda url: None)
    monkeypatch.setattr(m, "_load_settings", lambda: {
        "region": "jp", "start_date": "2026-09-01", "end_date": "2026-09-28",
        "output_file": "city_league_archetypes_past_probe.csv"})
    monkeypatch.setattr(m, "calculate_date_range", lambda a, b: (a, b))
    monkeypatch.setattr(m, "parse_date", lambda s: datetime.strptime(s, "%Y-%m-%d"))
    rc = m.main()
    assert rc not in (0, None), "main() meldet Erfolg, obwohl die Turnierliste nicht lesbar war"
    assert "::error::" in capsys.readouterr().out
