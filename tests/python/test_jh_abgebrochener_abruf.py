"""SC-9 (30.09.2026): ein abgebrochener Deck-Abruf markiert kein Turnier.

Bis heute reichte dem JH-Scraper EIN erfolgreich geholtes Deck: das
Turnier kam in den Ledger (tournament_jh_scraped.json) und wurde nie
wieder geholt — mit den Karten nur der Decks, die gerade kamen.

Ausgefuehrt: main() laeuft mit nachgebauten Abrufen (TESTDATEN), eine
von zwei Decklisten-Seiten kommt nicht. Erwartet: nichts geschrieben,
nichts markiert, eine benannte Warnung. Kommen beide, wird geschrieben.
"""
import importlib.util
import os
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, 'backend', 'core'))
sys.path.insert(0, os.path.join(ROOT, 'backend', 'scrapers'))

_spec = importlib.util.spec_from_file_location(
    'tournament_scraper_JH_sc9',
    os.path.join(ROOT, 'backend', 'scrapers', 'tournament_scraper_JH.py'))
JH = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(JH)


def _aufbauen(monkeypatch, kaputt):
    geschrieben, markiert = [], []
    monkeypatch.setattr(JH, '_load_settings', lambda: {
        'max_tournaments': 5, 'tournament_types': ['Regional'], 'max_workers': 2,
        'output_file': 'tournament_cards_data.csv', 'append_mode': True})
    class _Db:  # TESTDATEN
        def is_ace_spec_by_name(self, name):
            return False
    monkeypatch.setattr(JH, 'CardDatabaseLookup', _Db)
    monkeypatch.setattr(JH, '_reassemble_monolith_from_chunks', lambda *a, **k: 0)
    monkeypatch.setattr(JH, 'revalidate_recent_tournament_meta', lambda **k: None)
    monkeypatch.setattr(JH, 'load_scraped_tournaments', lambda: set())
    monkeypatch.setattr(JH, 'get_tournament_links', lambda *a: [
        {'id': '9001', 'url': 'https://example.invalid/t/9001', 'name': 'TEST Regional'}])
    monkeypatch.setattr(JH, 'get_tournament_info', lambda url: {
        'name': 'TEST Regional', 'format': 'TEF-30C', 'meta': 'Standard'})
    monkeypatch.setattr(JH, 'get_deck_list_links', lambda url: [
        {'url': 'https://example.invalid/d/1', 'player_count': 1},
        {'url': 'https://example.invalid/d/2', 'player_count': 1}])
    class _Seite:  # TESTDATEN: eine Deckseite ohne Titel
        def select_one(self, sel):
            return None
    monkeypatch.setattr(JH, 'fetch_page_bs4',
                        lambda url, *a, **k: None if (kaputt and url.endswith('/2')) else _Seite())
    monkeypatch.setattr(JH, 'extract_cards_from_decklist_soup', lambda soup, db: [
        {'name': 'TEST Karte', 'set_code': 'TST', 'set_number': '1', 'count': 4, 'type': ''}])
    monkeypatch.setattr(JH, 'is_valid_card', lambda n: True)
    monkeypatch.setattr(JH, 'entscheide', lambda *a, **k: 'No')
    monkeypatch.setattr(JH, 'aggregate_tournament_cards', lambda decks, t, db: [{'n': len(decks)}])
    monkeypatch.setattr(JH, 'save_scraped_tournaments', lambda ids: markiert.append(set(ids)))
    monkeypatch.setattr(JH, 'save_csv_files', lambda ts, *a, **k: geschrieben.extend(ts))
    return geschrieben, markiert


def test_ein_fehlendes_deck_haelt_das_turnier_offen(monkeypatch, capsys):
    geschrieben, markiert = _aufbauen(monkeypatch, kaputt=True)
    JH.main()
    assert geschrieben == [], 'ein unvollstaendiges Turnier wurde geschrieben'
    assert markiert == [], 'ein unvollstaendiges Turnier wurde als erledigt markiert'
    aus = capsys.readouterr().out
    assert '::warning::' in aus and '1 von 2' in aus and '9001' in aus


def test_vollstaendig_geholt_wird_geschrieben_und_markiert(monkeypatch):
    geschrieben, markiert = _aufbauen(monkeypatch, kaputt=False)
    JH.main()
    assert [t['id'] for t in geschrieben] == ['9001']
    assert markiert and '9001' in markiert[-1]
    assert geschrieben[0]['cards'] == [{'n': 2}], 'beide Decks muessen eingehen'
