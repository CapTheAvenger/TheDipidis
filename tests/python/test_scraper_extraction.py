"""Unit tests for scraper HTML extraction — mock all HTTP requests."""
import json
from unittest.mock import patch, MagicMock

import pytest

from backend.core.card_scraper_shared import (
    extract_cards_from_decklist_soup,
    CardDatabaseLookup,
    safe_fetch_html,
    fetch_page_bs4,
)


# ============================================================================
# Helper: minimal BeautifulSoup import
# ============================================================================
from bs4 import BeautifulSoup


# ============================================================================
# extract_cards_from_decklist_soup — Limitless decklist format
# ============================================================================
class TestExtractCardsFromDecklistSoup:
    """Tests for the shared decklist HTML parser."""

    POKEMON_HTML = """
    <div class="decklist-column">
        <div class="decklist-column-heading">Pokémon</div>
        <div class="decklist-card">
            <span class="card-count">2</span>
            <a href="/cards/PTCG/OBF/125" class="card-name">Charizard ex</a>
        </div>
        <div class="decklist-card">
            <span class="card-count">3</span>
            <a href="/cards/PTCG/SVI/198" class="card-name">Pidgeot ex</a>
        </div>
    </div>
    """

    TRAINER_HTML = """
    <div class="decklist-column">
        <div class="decklist-column-heading">Trainer</div>
        <div class="decklist-card">
            <span class="card-count">4</span>
            <span class="card-name">Boss's Orders</span>
        </div>
    </div>
    """

    ENERGY_HTML = """
    <div class="decklist-column">
        <div class="decklist-column-heading">Energy</div>
        <div class="decklist-card">
            <span class="card-count">8</span>
            <span class="card-name">Fire Energy</span>
        </div>
    </div>
    """

    def test_pokemon_href_extraction(self, mock_card_db):
        soup = BeautifulSoup(self.POKEMON_HTML, 'html.parser')
        cards = extract_cards_from_decklist_soup(soup, mock_card_db)
        assert len(cards) == 2
        assert cards[0]['name'] == 'Charizard ex'
        assert cards[0]['count'] == 2
        assert cards[0]['set_code'] == 'OBF'
        assert cards[0]['set_number'] == '125'

    def test_trainer_uses_carddb_fallback(self, mock_card_db):
        soup = BeautifulSoup(self.TRAINER_HTML, 'html.parser')
        cards = extract_cards_from_decklist_soup(soup, mock_card_db)
        assert len(cards) == 1
        assert cards[0]['name'] == "Boss's Orders"
        assert cards[0]['count'] == 4

    def test_energy_uses_carddb_fallback(self, mock_card_db):
        soup = BeautifulSoup(self.ENERGY_HTML, 'html.parser')
        cards = extract_cards_from_decklist_soup(soup, mock_card_db)
        assert len(cards) == 1
        assert cards[0]['name'] == 'Fire Energy'
        assert cards[0]['count'] == 8

    def test_combined_deck(self, mock_card_db):
        html = self.POKEMON_HTML + self.TRAINER_HTML + self.ENERGY_HTML
        soup = BeautifulSoup(html, 'html.parser')
        cards = extract_cards_from_decklist_soup(soup, mock_card_db)
        assert len(cards) == 4

    def test_empty_html(self, mock_card_db):
        soup = BeautifulSoup("", 'html.parser')
        cards = extract_cards_from_decklist_soup(soup, mock_card_db)
        assert cards == []

    def test_missing_count_element(self, mock_card_db):
        html = """
        <div class="decklist-column">
            <div class="decklist-column-heading">Pokémon</div>
            <div class="decklist-card">
                <span class="card-name">Charizard ex</span>
            </div>
        </div>
        """
        soup = BeautifulSoup(html, 'html.parser')
        cards = extract_cards_from_decklist_soup(soup, mock_card_db)
        assert cards == []

    def test_invalid_count(self, mock_card_db):
        html = """
        <div class="decklist-column">
            <div class="decklist-column-heading">Pokémon</div>
            <div class="decklist-card">
                <span class="card-count">abc</span>
                <span class="card-name">Charizard ex</span>
            </div>
        </div>
        """
        soup = BeautifulSoup(html, 'html.parser')
        cards = extract_cards_from_decklist_soup(soup, mock_card_db)
        assert cards == []

    def test_data_attributes_method(self, mock_card_db):
        html = """
        <div class="decklist-column">
            <div class="decklist-column-heading">Pokémon</div>
            <div class="decklist-card" data-set="TEF" data-number="85">
                <span class="card-count">1</span>
                <span class="card-name">Munkidori</span>
            </div>
        </div>
        """
        soup = BeautifulSoup(html, 'html.parser')
        cards = extract_cards_from_decklist_soup(soup, mock_card_db)
        assert len(cards) == 1
        assert cards[0]['set_code'] == 'TEF'
        assert cards[0]['set_number'] == '85'

    def test_span_set_method(self, mock_card_db):
        html = """
        <div class="decklist-column">
            <div class="decklist-column-heading">Pokémon</div>
            <div class="decklist-card">
                <span class="card-count">2</span>
                <span class="card-name">Ditto</span>
                <span class="set">PAL 132</span>
            </div>
        </div>
        """
        soup = BeautifulSoup(html, 'html.parser')
        cards = extract_cards_from_decklist_soup(soup, mock_card_db)
        assert len(cards) == 1
        assert cards[0]['set_code'] == 'PAL'
        assert cards[0]['set_number'] == '132'

    def test_pr_sv_alias_normalized(self, mock_card_db):
        html = """
        <div class="decklist-column">
            <div class="decklist-column-heading">Pokémon</div>
            <div class="decklist-card" data-set="PR-SV" data-number="68">
                <span class="card-count">1</span>
                <span class="card-name">Mew ex</span>
            </div>
        </div>
        """
        soup = BeautifulSoup(html, 'html.parser')
        cards = extract_cards_from_decklist_soup(soup, mock_card_db)
        assert len(cards) == 1
        assert cards[0]['set_code'] == 'SVP'

    def test_no_heading_column_skipped(self, mock_card_db):
        html = """
        <div class="decklist-column">
            <div class="decklist-card">
                <span class="card-count">1</span>
                <span class="card-name">Ghost</span>
            </div>
        </div>
        """
        soup = BeautifulSoup(html, 'html.parser')
        cards = extract_cards_from_decklist_soup(soup, mock_card_db)
        assert cards == []


# ============================================================================
# safe_fetch_html — mock cloudscraper
# ============================================================================
class TestSafeFetchHtml:
    @patch('backend.core.card_scraper_shared._get_scraper')
    def test_successful_fetch(self, mock_get_scraper):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.text = "<html>ok</html>"
        mock_resp.raise_for_status = MagicMock()
        mock_get_scraper.return_value.get.return_value = mock_resp

        result = safe_fetch_html("https://example.com", timeout=5, retries=0)
        assert result == "<html>ok</html>"

    @patch('backend.core.card_scraper_shared._get_scraper')
    def test_returns_empty_on_failure(self, mock_get_scraper):
        mock_get_scraper.return_value.get.side_effect = ConnectionError("timeout")

        result = safe_fetch_html("https://example.com", timeout=1, retries=0, retry_delay=0.01)
        assert result == ""

    @patch('backend.core.card_scraper_shared._get_scraper')
    def test_retries_on_429(self, mock_get_scraper):
        mock_resp_429 = MagicMock()
        mock_resp_429.status_code = 429
        mock_resp_429.headers = {'Retry-After': '0'}

        mock_resp_ok = MagicMock()
        mock_resp_ok.status_code = 200
        mock_resp_ok.text = "<html>ok</html>"
        mock_resp_ok.raise_for_status = MagicMock()

        mock_get_scraper.return_value.get.side_effect = [mock_resp_429, mock_resp_ok]

        result = safe_fetch_html("https://example.com", timeout=5, retries=1, retry_delay=0.01)
        assert result == "<html>ok</html>"


# ============================================================================
# fetch_page_bs4 — mock network
# ============================================================================
class TestFetchPageBs4:
    @patch('backend.core.card_scraper_shared.safe_fetch_html')
    def test_returns_soup(self, mock_fetch):
        mock_fetch.return_value = "<html><body>test</body></html>"
        result = fetch_page_bs4("https://example.com")
        assert result is not None
        assert result.find('body').text == 'test'

    @patch('backend.core.card_scraper_shared.safe_fetch_html')
    def test_returns_none_on_empty(self, mock_fetch):
        mock_fetch.return_value = ""
        result = fetch_page_bs4("https://example.com")
        assert result is None
