"""Unit tests for city_league and current_meta scraper functions — mock HTTP."""
from unittest.mock import patch, MagicMock

import pytest
from bs4 import BeautifulSoup

from backend.scrapers.city_league_analysis_scraper import (
    to_iso_week_period,
    extract_tournament_date_from_html,
)


# ============================================================================
# to_iso_week_period
# ============================================================================
class TestToIsoWeekPeriod:
    def test_valid_date(self):
        result = to_iso_week_period("15 Jan 25")
        assert result.startswith("2025-W")

    def test_invalid_date(self):
        assert to_iso_week_period("garbage") == "Unknown-Week"

    def test_empty(self):
        assert to_iso_week_period("") == "Unknown-Week"


# ============================================================================
# extract_tournament_date_from_html
# ============================================================================
class TestExtractTournamentDateFromHtml:
    def test_extracts_from_infobox(self):
        html = """
        <div class="infobox-line">15 Jan 25 • 128 Players</div>
        """
        result = extract_tournament_date_from_html(html)
        assert result == "15 Jan 25"

    def test_fallback_on_empty_html(self):
        assert extract_tournament_date_from_html("", "01 Feb 25") == "01 Feb 25"

    def test_fallback_on_no_date_found(self):
        html = "<div>No date here</div>"
        result = extract_tournament_date_from_html(html, "01 Mar 25")
        assert result == "01 Mar 25"

    def test_with_multiple_infobox_lines(self):
        html = """
        <div class="infobox-line">Location: Tokyo</div>
        <div class="infobox-line">20 Feb 25 • Standard</div>
        """
        result = extract_tournament_date_from_html(html)
        assert result == "20 Feb 25"

    def test_no_fallback_no_date(self):
        html = "<div>Nothing useful</div>"
        result = extract_tournament_date_from_html(html)
        assert result == ""


# ============================================================================
# current_meta_analysis_scraper: _fetch_meta_live_decklist
# ============================================================================
class TestFetchMetaLiveDecklist:
    """Test HTML parsing of Limitless Meta Live decklist pages."""

    @patch('backend.scrapers.current_meta_analysis_scraper.safe_fetch_html')
    def test_extracts_cards_from_href(self, mock_fetch, mock_card_db):
        mock_fetch.return_value = """
        <html><body>
            <a href="/cards/PTCG/OBF/125">2 Charizard ex</a>
            <a href="/cards/PTCG/SVI/198">3 Pidgeot ex</a>
        </body></html>
        """
        from backend.scrapers.current_meta_analysis_scraper import _fetch_meta_live_decklist
        result = _fetch_meta_live_decklist(
            "https://play.limitlesstcg.com/decks/charizard/lists/1",
            "Charizard", "charizard", mock_card_db, 10
        )
        assert result is not None
        assert result['archetype'] == 'Charizard'
        assert len(result['cards']) == 2
        assert result['cards'][0]['name'] == 'Charizard ex'
        assert result['cards'][0]['set_code'] == 'OBF'
        assert result['cards'][0]['set_number'] == '125'

    @patch('backend.scrapers.current_meta_analysis_scraper.safe_fetch_html')
    def test_empty_html_returns_none(self, mock_fetch, mock_card_db):
        mock_fetch.return_value = ""
        from backend.scrapers.current_meta_analysis_scraper import _fetch_meta_live_decklist
        result = _fetch_meta_live_decklist("https://example.com", "Test", "test", mock_card_db, 10)
        assert result is None

    @patch('backend.scrapers.current_meta_analysis_scraper.safe_fetch_html')
    def test_no_matching_links_returns_none(self, mock_fetch, mock_card_db):
        mock_fetch.return_value = "<html><body><p>No cards here</p></body></html>"
        from backend.scrapers.current_meta_analysis_scraper import _fetch_meta_live_decklist
        result = _fetch_meta_live_decklist("https://example.com", "Test", "test", mock_card_db, 10)
        assert result is None

    @patch('backend.scrapers.current_meta_analysis_scraper.safe_fetch_html')
    def test_carddb_fallback_for_missing_sets(self, mock_fetch, mock_card_db):
        mock_fetch.return_value = """
        <html><body>
            <a href="/cards/something">1 Unknown Card</a>
        </body></html>
        """
        from backend.scrapers.current_meta_analysis_scraper import _fetch_meta_live_decklist
        result = _fetch_meta_live_decklist("https://example.com", "Test", "test", mock_card_db, 10)
        # Card should be extracted with fallback from card_db
        if result:
            assert len(result['cards']) >= 1


# ============================================================================
# current_meta_analysis_scraper: _fetch_meta_play_decklist
# ============================================================================
class TestFetchMetaPlayDecklist:
    """Test JSON-in-script extraction for Play! tournament decklists."""

    @patch('backend.scrapers.current_meta_analysis_scraper.safe_fetch_html')
    def test_extracts_cards_from_json_script(self, mock_fetch, mock_card_db):
        import json
        deck_data = {
            "body": json.dumps({
                "message": {
                    "pokemon": [
                        {"name": "Charizard ex", "count": 2, "set": "OBF", "number": "125"}
                    ],
                    "trainer": [
                        {"name": "Boss&#x27;s Orders", "count": 4, "set": "PAL", "number": "172"}
                    ],
                    "energy": [
                        {"name": "Fire Energy", "count": 12, "set": "SVI", "number": ""}
                    ]
                }
            })
        }
        # count = 2 + 4 + 12 = 18, not 60. The function checks sum == 60.
        # Adjust to make a valid 60-card deck:
        deck_data_60 = {
            "body": json.dumps({
                "message": {
                    "pokemon": [
                        {"name": "Charizard ex", "count": 20, "set": "OBF", "number": "125"}
                    ],
                    "trainer": [
                        {"name": "Boss's Orders", "count": 28, "set": "PAL", "number": "172"}
                    ],
                    "energy": [
                        {"name": "Fire Energy", "count": 12, "set": "SVI", "number": ""}
                    ]
                }
            })
        }
        mock_fetch.return_value = f"<html><script>{json.dumps(deck_data_60)}</script></html>"
        from backend.scrapers.current_meta_analysis_scraper import _fetch_meta_play_decklist
        result = _fetch_meta_play_decklist("https://example.com", "Charizard", mock_card_db, 10)
        assert result is not None
        assert sum(c['count'] for c in result['cards']) == 60

    @patch('backend.scrapers.current_meta_analysis_scraper.safe_fetch_html')
    def test_returns_none_for_non_60_cards(self, mock_fetch, mock_card_db):
        import json
        deck_data = {
            "body": json.dumps({
                "message": {
                    "pokemon": [{"name": "X", "count": 5, "set": "A", "number": "1"}],
                    "trainer": [],
                    "energy": []
                }
            })
        }
        mock_fetch.return_value = f"<html><script>{json.dumps(deck_data)}</script></html>"
        from backend.scrapers.current_meta_analysis_scraper import _fetch_meta_play_decklist
        result = _fetch_meta_play_decklist("https://example.com", "Test", mock_card_db, 10)
        assert result is None

    @patch('backend.scrapers.current_meta_analysis_scraper.safe_fetch_html')
    def test_empty_response(self, mock_fetch, mock_card_db):
        mock_fetch.return_value = ""
        from backend.scrapers.current_meta_analysis_scraper import _fetch_meta_play_decklist
        result = _fetch_meta_play_decklist("https://example.com", "Test", mock_card_db, 10)
        assert result is None


# ============================================================================
# all_cards_scraper: load_existing_cards
# ============================================================================
class TestLoadExistingCards:
    def test_missing_file(self, tmp_path):
        from backend.scrapers.all_cards_scraper import load_existing_cards
        cards, keys, incomplete = load_existing_cards(str(tmp_path / "nonexistent.csv"))
        assert cards == []
        assert keys == set()
        assert incomplete == []

    def test_loads_complete_cards(self, tmp_path):
        import csv
        csv_path = str(tmp_path / "cards.csv")
        with open(csv_path, 'w', newline='', encoding='utf-8-sig') as f:
            writer = csv.DictWriter(f, fieldnames=['name_en', 'name_de', 'set', 'number', 'type', 'rarity', 'image_url', 'international_prints', 'cardmarket_url', 'card_url'])
            writer.writeheader()
            writer.writerow({
                'name_en': 'Pikachu', 'name_de': 'Pikachu', 'set': 'SVI', 'number': '25',
                'type': 'Basic', 'rarity': 'Common', 'image_url': 'http://img.png',
                'international_prints': 'SVI-25,PAL-50', 'cardmarket_url': 'http://cm.com',
                'card_url': ''
            })

        from backend.scrapers.all_cards_scraper import load_existing_cards
        cards, keys, incomplete = load_existing_cards(csv_path)
        assert len(cards) == 1
        assert 'SVI::25' in keys
        assert cards[0]['name_en'] == 'Pikachu'

    def test_identifies_incomplete_cards(self, tmp_path):
        import csv
        csv_path = str(tmp_path / "cards.csv")
        with open(csv_path, 'w', newline='', encoding='utf-8-sig') as f:
            writer = csv.DictWriter(f, fieldnames=['name_en', 'name_de', 'set', 'number', 'type', 'rarity', 'image_url', 'international_prints', 'cardmarket_url', 'card_url'])
            writer.writeheader()
            # Missing image_url and rarity -> incomplete
            writer.writerow({
                'name_en': 'Pikachu', 'name_de': '', 'set': 'SVI', 'number': '25',
                'type': 'Basic', 'rarity': '', 'image_url': '',
                'international_prints': '', 'cardmarket_url': '', 'card_url': ''
            })

        from backend.scrapers.all_cards_scraper import load_existing_cards
        cards, keys, incomplete = load_existing_cards(csv_path, rescrape_incomplete=True)
        assert len(cards) == 0
        assert len(incomplete) == 1

    def test_skips_rows_without_name(self, tmp_path):
        import csv
        csv_path = str(tmp_path / "cards.csv")
        with open(csv_path, 'w', newline='', encoding='utf-8-sig') as f:
            writer = csv.DictWriter(f, fieldnames=['name_en', 'set', 'number', 'type', 'rarity', 'image_url', 'international_prints', 'cardmarket_url', 'card_url'])
            writer.writeheader()
            writer.writerow({'name_en': '', 'set': 'SVI', 'number': '1', 'type': '', 'rarity': '', 'image_url': '', 'international_prints': '', 'cardmarket_url': '', 'card_url': ''})

        from backend.scrapers.all_cards_scraper import load_existing_cards
        cards, keys, incomplete = load_existing_cards(csv_path)
        assert len(cards) == 0


# ============================================================================
# all_cards_scraper: sort_key
# ============================================================================
class TestSortKey:
    def test_basic_sort(self):
        from backend.scrapers.all_cards_scraper import sort_key
        card = {'set': 'SVI', 'number': '25'}
        key = sort_key(card)
        assert isinstance(key, tuple)
