"""Additional pytest unit tests for scraper extraction and formatting helpers."""

import json
from unittest.mock import patch

from bs4 import BeautifulSoup
import pytest

import backend.core.update_sets as update_sets
import backend.scrapers.all_cards_scraper as all_cards_scraper
import backend.scrapers.city_league_analysis_scraper as city_league_analysis_scraper
import backend.scrapers.current_meta_analysis_scraper as current_meta_analysis_scraper
import backend.scrapers.japanese_cards_scraper as japanese_cards_scraper
import backend.scrapers.limitless_online_scraper as limitless_online_scraper
import backend.scrapers.tournament_scraper_JH as tournament_scraper_jh
from backend.core.card_scraper_shared import aggregate_card_data, extract_cards_from_decklist_soup


class TestUpdateSets:
    @patch("backend.core.update_sets.safe_fetch_html")
    def test_scrape_live_sets_filters_junk_and_preserves_newest_order(self, mock_fetch):
        mock_fetch.return_value = """
        <html><body>
          <select>
            <option>ALL</option>
            <option>EN</option>
            <option>2025</option>
            <option>SV</option>
            <option>PAR</option>
            <option>TEF</option>
            <option>PAR</option>
            <option>TWM</option>
            <option>SCR</option>
            <option>SSP</option>
            <option>MEG</option>
            <option>PRE</option>
          </select>
        </body></html>
        """

        result = update_sets.scrape_live_sets()

        assert result == {
            "PRE": 1,
            "MEG": 2,
            "SSP": 3,
            "SCR": 4,
            "TWM": 5,
            "TEF": 6,
            "PAR": 7,
        }

    @patch("backend.core.update_sets.safe_fetch_html")
    def test_scrape_live_sets_returns_empty_when_no_source_matches(self, mock_fetch):
        mock_fetch.return_value = "<html><body><p>No sets here</p></body></html>"

        assert update_sets.scrape_live_sets() == {}

    @patch("backend.core.update_sets.safe_fetch_html")
    def test_scrape_live_sets_falls_back_to_link_strategy(self, mock_fetch):
        mock_fetch.return_value = """
        <html><body>
          <a href="/sets/PAR">PAR</a>
          <a href="/sets/TEF">TEF</a>
          <a href="/sets/TWM">TWM</a>
          <a href="/sets/SCR">SCR</a>
          <a href="/sets/SSP">SSP</a>
          <a href="/sets/PRE">PRE</a>
          <a href="/sets/MEG">MEG</a>
          <a href="/sets/ASC">ASC</a>
          <a href="/sets/BLK">BLK</a>
          <a href="/sets/DRI">DRI</a>
          <a href="/sets/ALL">ALL</a>
        </body></html>
        """

        result = update_sets.scrape_live_sets()

        assert result["PAR"] == 10
        assert result["DRI"] == 1
        assert "ALL" not in result


class TestAllCardsScraperDetails:
    @patch("backend.scrapers.all_cards_scraper.safe_fetch_html")
    def test_fetch_single_card_extracts_rarity_prints_and_cardmarket_url(self, mock_fetch):
        mock_fetch.return_value = """
        <html><body>
          <img class="card shadow resp-w" src="https://img.example/obf-125.png" />
          <div class="card-prints-current">
            <div class="prints-current-details">
              <span>OBF 125</span>
              <span>Charizard ex . Double Rare</span>
            </div>
          </div>
          <table class="card-prints-versions">
            <tr class="current">
              <td><a href="/cards/en/OBF/125">Current</a></td>
              <td><a class="card-price eur" href="https://cardmarket.example/obf-125">EUR</a></td>
            </tr>
            <tr>
              <td><a href="/cards/PAL/54">Other print</a></td>
            </tr>
            <tr>
              <td><a href="/cards/ja/JP/001">Japanese print</a></td>
            </tr>
          </table>
        </body></html>
        """
        card = {
            "name": "Charizard ex",
            "set": "OBF",
            "number": "125",
            "card_url": "/cards/OBF/125",
            "image_url": "",
            "rarity": "",
            "international_prints": "",
            "cardmarket_url": "",
        }

        result = all_cards_scraper._fetch_single_card(card)

        assert result["image_url"] == "https://img.example/obf-125.png"
        assert result["rarity"] == "Double Rare"
        assert result["cardmarket_url"] == "https://cardmarket.example/obf-125"
        assert result["international_prints"] == "OBF-125,PAL-54"

    @pytest.mark.parametrize(
        ("input_url", "set_code", "set_number", "expected"),
        [
            ("/cards/GRI/125a/field-blower", "GRI", "125a", "/cards/GRI/125a"),
            ("https://limitlesstcg.com/cards/GRI/125a/field-blower", "GRI", "125a", "/cards/GRI/125a"),
            ("/cards/en/GRI/125a/field-blower", "GRI", "125a", "/cards/GRI/125a"),
            ("/cards/SVE/22/fighting-energy", "SVE", "22", "/cards/SVE/22"),
            ("", "MEE", "3", "/cards/MEE/3"),
        ],
    )
    def test_normalize_limitless_card_url(self, input_url, set_code, set_number, expected):
        assert all_cards_scraper.normalize_limitless_card_url(input_url, set_code, set_number) == expected

    @patch("backend.scrapers.all_cards_scraper.safe_fetch_html")
    def test_fetch_single_card_uses_canonical_url_without_slug(self, mock_fetch):
        mock_fetch.return_value = """
        <html><body>
          <img class="card shadow resp-w" src="https://img.example/gri-125a.png" />
        </body></html>
        """
        card = {
            "name_en": "Field Blower",
            "set": "GRI",
            "number": "125a",
            "card_url": "/cards/GRI/125a/field-blower",
            "image_url": "",
            "rarity": "",
            "international_prints": "",
            "cardmarket_url": "",
        }

        result = all_cards_scraper._fetch_single_card(card)

        called_url = mock_fetch.call_args[0][0]
        assert called_url == "https://limitlesstcg.com/cards/GRI/125a"
        assert result["card_url"] == "/cards/GRI/125a"


    class TestSharedDeckExtractionEdgeCases:
      def test_extract_cards_skips_pokemon_without_resolvable_set_data(self, mock_card_db):
        html = """
        <div class="decklist-column">
          <div class="decklist-column-heading">Pokémon</div>
          <div class="decklist-card">
          <span class="card-count">2</span>
          <span class="card-name">Mystery Pokemon</span>
          </div>
        </div>
        """

        cards = extract_cards_from_decklist_soup(BeautifulSoup(html, "lxml"), mock_card_db)

        assert cards == []

      def test_extract_cards_skips_trainer_when_card_db_has_no_match(self, mock_card_db):
        mock_card_db.get_latest_low_rarity_version = lambda _name: None
        html = """
        <div class="decklist-column">
          <div class="decklist-column-heading">Trainer</div>
          <div class="decklist-card">
          <span class="card-count">4</span>
          <span class="card-name">Unknown Trainer</span>
          </div>
        </div>
        """

        cards = extract_cards_from_decklist_soup(BeautifulSoup(html, "lxml"), mock_card_db)

        assert cards == []


    class TestAggregateCardDataEdgeCases:
      def test_duplicate_card_entries_in_single_deck_count_once_for_inclusion(self, mock_card_db):
        decks = [{
          "archetype": "Charizard",
          "cards": [
            {"name": "Rare Candy", "count": 2, "set_code": "SVI", "set_number": "1"},
            {"name": "Rare Candy", "count": 1, "set_code": "SVI", "set_number": "1"},
          ],
        }]

        result = aggregate_card_data(decks, mock_card_db)

        assert len(result) == 1
        assert result[0]["total_count"] == 3
        assert result[0]["deck_inclusion_count"] == 1
        assert result[0]["average_count"] == 3.0

      def test_group_by_tournament_date_uses_default_identifiers_when_missing(self, mock_card_db):
        decks = [{
          "archetype": "Gardevoir",
          "cards": [{"name": "Kirlia", "count": 3}],
        }]

        result = aggregate_card_data(decks, mock_card_db, group_by_tournament_date=True)

        assert len(result) == 1
        assert result[0]["tournament_id"] == "Unknown-Tournament"
        assert result[0]["tournament_date"] == "Unknown-Date"
        assert result[0]["period"] == "Unknown-Week"

      def test_most_played_set_version_wins_card_identifier(self, mock_card_db):
        decks = [
          {"archetype": "Charizard", "cards": [{"name": "Pidgeot ex", "count": 2, "set_code": "OBF", "set_number": "164"}]},
          {"archetype": "Charizard", "cards": [{"name": "Pidgeot ex", "count": 1, "set_code": "SVI", "set_number": "1"}]},
        ]

        result = aggregate_card_data(decks, mock_card_db)

        assert len(result) == 1
        assert result[0]["card_identifier"] == "OBF 164"
        assert result[0]["set_code"] == "OBF"
        assert result[0]["set_number"] == "164"


class TestJapaneseCardsScraper:
    @patch("backend.scrapers.japanese_cards_scraper.fetch_page_bs4")
    def test_get_latest_jp_sets_uses_code_span_and_image_alt(self, mock_fetch):
        html = """
        <table>
          <tr><td><span class="code">sv1</span></td></tr>
          <tr><td><img class="set" alt="pal" /></td></tr>
          <tr><td><span class="code">SV1</span></td></tr>
          <tr><td><img class="set" alt="mew" /></td></tr>
          <tr><td><span class="code">obf</span></td></tr>
        </table>
        """
        mock_fetch.return_value = BeautifulSoup(html, "lxml")

        with patch.dict(japanese_cards_scraper.SETTINGS, {"keep_latest_sets": 3}, clear=False):
            result = japanese_cards_scraper.get_latest_jp_sets()

        assert result == {"SV1", "PAL", "MEW"}

    @patch("backend.scrapers.japanese_cards_scraper.fetch_page_bs4")
    def test_fetch_single_detail_adds_translate_param_and_promo_fallback(self, mock_fetch):
        html = """
        <html><body>
          <img class="card shadow resp-w" src="https://img.example/svp-001.png" />
        </body></html>
        """
        mock_fetch.return_value = BeautifulSoup(html, "lxml")
        card = {
            "name": "Promo Card",
            "set": "SVP",
            "number": "1",
            "card_url": "/cards/jp/svp/1",
            "image_url": "",
            "rarity": "",
        }

        result = japanese_cards_scraper._fetch_single_detail(card)

        assert mock_fetch.call_args.args[0] == "https://limitlesstcg.com/cards/jp/svp/1?translate=en"
        assert result["image_url"] == "https://img.example/svp-001.png"
        assert result["rarity"] == "Promo"

    @pytest.mark.parametrize(
        ("card_url", "expected_url"),
        [
            ("/cards/jp/svp/1", "https://limitlesstcg.com/cards/jp/svp/1?translate=en"),
            ("https://limitlesstcg.com/cards/jp/svp/1?page=2", "https://limitlesstcg.com/cards/jp/svp/1?page=2&translate=en"),
            ("https://limitlesstcg.com/cards/jp/svp/1?translate=en", "https://limitlesstcg.com/cards/jp/svp/1?translate=en"),
        ],
    )
    @patch("backend.scrapers.japanese_cards_scraper.fetch_page_bs4")
    def test_fetch_single_detail_normalizes_translate_query(self, mock_fetch, card_url, expected_url):
        mock_fetch.return_value = BeautifulSoup("<html></html>", "lxml")
        card = {
            "name": "Promo Card",
            "set": "SVP",
            "number": "1",
            "card_url": card_url,
            "image_url": "",
            "rarity": "",
        }

        japanese_cards_scraper._fetch_single_detail(card)

        assert mock_fetch.call_args.args[0] == expected_url


class TestLimitlessOnlineScraper:
    @pytest.mark.parametrize(
        ("deck_name", "cleaned", "slug"),
        [
            ("  Gardevoir   ex\n", "Gardevoir ex", "gardevoir-ex"),
            ("Arven's Toolbox", "Arven's Toolbox", "arven-toolbox"),
            ("Marnie’s Pride", "Marnie’s Pride", "marnie-pride"),
        ],
    )
    def test_name_cleaning_and_slug_generation(self, deck_name, cleaned, slug):
        assert limitless_online_scraper.clean_deck_name(deck_name) == cleaned
        assert limitless_online_scraper.deck_name_to_url(cleaned) == slug

    @patch("backend.scrapers.limitless_online_scraper.get_data_path")
    @patch("backend.scrapers.limitless_online_scraper.fetch_page_bs4")
    def test_scrape_deck_statistics_parses_table_and_meta_stats(self, mock_fetch, mock_get_data_path, tmp_path):
        html = """
        <html><body>
          <p>12 tournaments, 345 players, 678 matches</p>
          <table>
            <tr>
              <th>Rank</th><th>Deck</th><th>Count</th><th>Share</th><th>Score</th><th>Win Rate</th>
            </tr>
            <tr>
              <td>1</td>
              <td><a href="/decks/charizard-ex?format=standard">  Charizard ex  </a></td>
              <td>25</td>
              <td>12.5%</td>
              <td>10 - 2 - 1</td>
              <td>83.3%</td>
            </tr>
          </table>
        </body></html>
        """
        mock_fetch.return_value = BeautifulSoup(html, "lxml")
        mock_get_data_path.side_effect = lambda name: tmp_path / name

        result = limitless_online_scraper.scrape_deck_statistics(
            game="POKEMON", format_type="standard", rotation="2025", set_code="PFL"
        )

        assert len(result) == 1
        assert result[0]["deck_name"] == "Charizard ex"
        assert result[0]["deck_url"] == "charizard-ex"
        assert result[0]["wins"] == 10
        assert result[0]["losses"] == 2
        assert result[0]["ties"] == 1
        assert result[0]["share_numeric"] == 12.5
        assert result[0]["win_rate_numeric"] == 83.3
        assert result[0]["game"] == "PTCG"
        assert json.loads((tmp_path / "limitless_meta_stats.json").read_text(encoding="utf-8")) == {
            "tournaments": 12,
            "players": 345,
            "matches": 678,
        }

    @patch("backend.scrapers.limitless_online_scraper.fetch_page_bs4")
    def test_scrape_single_matchup_retries_without_set_and_parses_rows(self, mock_fetch):
        html = """
        <table>
          <tr>
            <td>1</td>
            <td>Charizard ex</td>
            <td>8</td>
            <td>5 - 3 - 0</td>
            <td>62.5%</td>
          </tr>
        </table>
        """
        mock_fetch.side_effect = [None, BeautifulSoup(html, "lxml")]

        deck_name, matchups = limitless_online_scraper._scrape_single_matchup(
            "Gardevoir", "gardevoir-ex", {"format": "STANDARD", "rotation": "2025", "set": "PFL"}
        )

        assert deck_name == "Gardevoir"
        assert len(matchups) == 1
        assert matchups[0]["opponent_deck"] == "Charizard ex"
        assert matchups[0]["record"] == "5 - 3 - 0"
        assert matchups[0]["total_games"] == 8
        assert matchups[0]["win_rate_numeric"] == 62.5
        assert "set=PFL" in mock_fetch.call_args_list[0].args[0]
        assert "set=" not in mock_fetch.call_args_list[1].args[0]


class TestTournamentScraperJH:
    @pytest.mark.parametrize(
        ("raw_format", "expected"),
        [
            ("Scarlet & Violet - Phantasmal Flames", "SVI-PFL"),
            ("SVI-ASC", "SVI-ASC"),
            ("PAR", "BST-PAR"),
            ("BRS-TEF", "BRS-TEF"),
            ("battle styles - paradox rift", "BST-PAR"),
            ("", ""),
        ],
    )
    def test_normalize_tournament_format_handles_common_inputs(self, raw_format, expected):
        assert tournament_scraper_jh.normalize_tournament_format(raw_format) == expected

    @patch("backend.scrapers.tournament_scraper_JH.fetch_page_bs4")
    def test_get_tournament_info_extracts_title_date_players_and_format(self, mock_fetch):
        html = """
        <html>
          <head><title>Regional Challenge | Limitless</title></head>
          <body>
            <a href="/tournaments?format=Scarlet%20%26%20Violet%20-%20Phantasmal%20Flames">Format</a>
            <div>15th March 2026</div>
            <div>256 Players</div>
          </body>
        </html>
        """
        mock_fetch.return_value = BeautifulSoup(html, "lxml")

        result = tournament_scraper_jh.get_tournament_info("https://limitlesstcg.com/tournaments/999")

        assert result["name"] == "Regional Challenge"
        assert result["date"] == "15th March 2026"
        assert result["players"] == "256"
        assert result["format"] == "SVI-PFL"
        assert result["meta"] == "Standard"

    @patch("backend.scrapers.tournament_scraper_JH.is_valid_card", return_value=True)
    @patch("backend.scrapers.tournament_scraper_JH.fetch_page_bs4")
    def test_extract_single_deck_deduplicates_cards_and_keeps_title(self, mock_fetch, _mock_is_valid, mock_card_db):
        html = """
        <html><body>
          <div class="decklist-title">Charizard ex</div>
          <div class="decklist-column">
            <div class="decklist-column-heading">Pokémon</div>
            <div class="decklist-card" data-set="OBF" data-number="125">
              <span class="card-count">2</span>
              <span class="card-name">Charizard ex</span>
            </div>
            <div class="decklist-card" data-set="OBF" data-number="125">
              <span class="card-count">2</span>
              <span class="card-name">Charizard ex</span>
            </div>
          </div>
        </body></html>
        """
        mock_fetch.return_value = BeautifulSoup(html, "lxml")

        cards, deck_name = tournament_scraper_jh.extract_single_deck(
            "https://limitlesstcg.com/decks/list/123", mock_card_db
        )

        assert deck_name == "Charizard ex"
        assert len(cards) == 1
        assert cards[0]["full_name"] == "Charizard ex OBF 125"
        assert cards[0]["card_number"] == "125"


class TestCityLeagueAnalysisScraper:
    @pytest.mark.parametrize(
        ("html", "fallback_date", "expected"),
        [
            (
                "<div class='tournament-header'><time>20 Feb 25</time></div>",
                "",
                "20 Feb 25",
            ),
            (
                "<div class='tournament-header'><div class='date'>21 Feb 25</div></div>",
                "",
                "21 Feb 25",
            ),
            (
                "<div class='tournament-header'><div class='date'>garbage</div></div>",
                "01 Mar 25",
                "01 Mar 25",
            ),
        ],
    )
    def test_extract_tournament_date_from_html_handles_header_fallbacks(self, html, fallback_date, expected):
        assert city_league_analysis_scraper.extract_tournament_date_from_html(html, fallback_date) == expected

    @patch("backend.scrapers.city_league_analysis_scraper.extract_cards_from_deck_html")
    @patch("backend.scrapers.city_league_analysis_scraper.safe_fetch_html")
    def test_fetch_single_deck_normalizes_name_and_adds_metadata(self, mock_fetch, mock_extract, mock_card_db):
        mock_fetch.return_value = "<html></html>"
        mock_extract.return_value = [{"name": "Charizard ex", "count": 2, "set_code": "OBF", "set_number": "125"}]

        result = city_league_analysis_scraper._fetch_single_deck(
            deck_url="https://limitlesstcg.com/decks/list/123",
            deck_name="n Charizard-Mega",
            tournament_date="15 Jan 25",
            tournament_id="123",
            card_db=mock_card_db,
            timeout=10,
        )

        assert result == {
            "archetype": "Mega Charizard",
            "cards": [{"name": "Charizard ex", "count": 2, "set_code": "OBF", "set_number": "125"}],
            "source": "City League",
            "tournament_id": "123",
            "tournament_date": "15 Jan 25",
            "date": "15 Jan 25",
        }

    @patch("backend.scrapers.city_league_analysis_scraper._fetch_single_deck")
    def test_process_tournament_decklists_extracts_links_from_anchor_and_icon(self, mock_fetch_single_deck, mock_card_db):
        html = """
        <table>
          <tr>
            <td>1</td>
            <td><img class="pokemon" alt="charizard" /></td>
            <td><a href="/decks/list/111">Deck</a></td>
          </tr>
          <tr>
            <td>2</td>
            <td><img class="pokemon" alt="gardevoir" /></td>
            <td><a href="/decks/list/222"><i class="fa-list-alt"></i></a></td>
          </tr>
        </table>
        """
        mock_fetch_single_deck.side_effect = [
            {"archetype": "Charizard", "cards": []},
            {"archetype": "Gardevoir", "cards": []},
        ]

        result = city_league_analysis_scraper.process_tournament_decklists(
            tournament_html=html,
            max_decklists=5,
            tournament_info={"tournament_id": "T1", "date": "15 Jan 25"},
            request_timeout=10,
            max_workers=2,
            card_db=mock_card_db,
        )

        assert len(result) == 2
        first_call = mock_fetch_single_deck.call_args_list[0].args
        second_call = mock_fetch_single_deck.call_args_list[1].args
        assert first_call[0] == "https://limitlesstcg.com/decks/list/111"
        assert first_call[1] == "Charizard"
        assert second_call[0] == "https://limitlesstcg.com/decks/list/222"
        assert second_call[1] == "Gardevoir"

    @patch("backend.scrapers.city_league_analysis_scraper.time.sleep")
    @patch("backend.scrapers.city_league_analysis_scraper.save_scraped_tournaments")
    @patch("backend.scrapers.city_league_analysis_scraper.process_tournament_decklists")
    @patch("backend.scrapers.city_league_analysis_scraper.extract_tournament_date_from_html")
    @patch("backend.scrapers.city_league_analysis_scraper.safe_fetch_html")
    @patch("backend.scrapers.city_league_analysis_scraper.load_scraped_tournaments")
    @patch("backend.scrapers.city_league_analysis_scraper.resolve_date_range")
    def test_scrape_city_league_processes_only_new_tournaments_and_saves_ids(
        self,
        mock_resolve_date_range,
        mock_load_scraped,
        mock_fetch,
        mock_extract_date,
        mock_process,
        mock_save_scraped,
        _mock_sleep,
        mock_card_db,
    ):
        mock_resolve_date_range.return_value = (
            city_league_analysis_scraper.datetime(2026, 1, 1),
            city_league_analysis_scraper.datetime(2026, 1, 31),
        )
        mock_load_scraped.return_value = {"old-1"}
        mock_fetch.return_value = "<html>Tournament</html>"
        mock_extract_date.return_value = "15 Jan 25"
        mock_process.return_value = [{"archetype": "Charizard", "cards": []}]

        with patch.object(city_league_analysis_scraper, "_city_league_available", True), patch.object(
            city_league_analysis_scraper,
            "city_league_module",
        ) as mock_module:
            mock_module.get_tournaments_in_date_range.return_value = [
                {"tournament_id": "old-1", "url": "https://example.com/old", "date": "14 Jan 25", "shop": "Old"},
                {"tournament_id": "new-1", "url": "https://example.com/new", "date": "15 Jan 25", "shop": "New"},
            ]
            mock_module.get_tournament_by_id.return_value = {
                "tournament_id": "extra-1",
                "url": "https://example.com/extra",
                "date_str": "16 Jan 25",
                "shop": "Extra",
            }

            result = city_league_analysis_scraper.scrape_city_league(
                {
                    "sources": {"city_league": {"enabled": True, "additional_tournament_ids": ["extra-1"]}},
                    "delay_between_requests": 0,
                },
                mock_card_db,
            )

        assert len(result) == 2
        assert mock_fetch.call_count == 2
        saved_ids = mock_save_scraped.call_args.args[0]
        assert saved_ids == {"old-1", "new-1", "extra-1"}


class TestCurrentMetaOrchestration:
    @patch("backend.scrapers.current_meta_analysis_scraper.safe_fetch_html")
    def test_scrape_limitless_online_skips_matchups_and_other_and_fetches_decklists(self, mock_fetch, mock_card_db):
        mock_fetch.side_effect = [
            """
            <html><body>
              <a href="/decks/charizard-ex?format=standard">Charizard</a>
              <a href="/decks/charizard-ex/matchups">Skip matchups</a>
              <a href="/decks/other">Other</a>
            </body></html>
            """,
            "<html><body><a href='/decklist/1'>List 1</a><a href='/decklist/1'>List 1 duplicate</a></body></html>",
        ]

        with patch("backend.scrapers.current_meta_analysis_scraper._fetch_meta_live_decklist", return_value={
            "archetype": "Charizard Ex",
            "deck_slug": "charizard-ex",
            "cards": [{"name": "Charizard ex", "count": 2, "set_code": "OBF", "set_number": "125"}],
            "source": "limitless_online",
        }) as mock_fetch_deck:
            result = current_meta_analysis_scraper.scrape_limitless_online(
                {
                    "sources": {"limitless_online": {"enabled": True, "max_decks": 5, "max_lists_per_deck": 2, "format_filter": "PFL"}},
                    "request_timeout": 10,
                    "max_workers": 2,
                },
                mock_card_db,
            )

        assert len(result) == 1
        assert mock_fetch_deck.call_count == 1
        assert mock_fetch_deck.call_args.args[0] == "https://play.limitlesstcg.com/decklist/1"
        assert mock_fetch_deck.call_args.args[1] == "Charizard EX"

    @patch("backend.scrapers.current_meta_analysis_scraper.save_scraped_meta_tournaments")
    @patch("backend.scrapers.current_meta_analysis_scraper.load_scraped_meta_tournaments")
    @patch("backend.scrapers.current_meta_analysis_scraper.safe_fetch_html")
    def test_scrape_tournaments_collects_new_ids_and_decklists(self, mock_fetch, mock_load_scraped, mock_save_scraped, mock_card_db):
        mock_load_scraped.return_value = {"150"}
        mock_fetch.side_effect = [
            "<html><body><a href='/150/standings'>150</a><a href='/200/standings'>200</a></body></html>",
            """
            <html>
              <head><title>Test Cup | Limitless</title></head>
              <body>
                <table>
                  <tr>
                    <td><a href='/200/player/1'>Player 1</a></td>
                    <td><a href='/200/decks/gardevoir-ex'>Deck</a></td>
                    <td><a href='/200/player/1/decklist'>Decklist</a></td>
                  </tr>
                </table>
              </body>
            </html>
            """,
        ]

        with patch("backend.scrapers.current_meta_analysis_scraper._fetch_meta_play_decklist", return_value={
            "archetype": "Gardevoir Ex",
            "cards": [{"name": "Kirlia", "count": 4, "set_code": "SVI", "set_number": "1"}],
            "source": "Tournament",
        }) as mock_fetch_deck:
            result = current_meta_analysis_scraper.scrape_tournaments(
                {
                    "sources": {"tournaments": {"enabled": True, "max_tournaments": 5, "max_decks_per_tournament": 4, "format_filter": ["Standard"]}},
                    "request_timeout": 10,
                    "max_workers": 2,
                },
                mock_card_db,
            )

        assert len(result) == 1
        assert mock_fetch_deck.call_count == 1
        assert mock_fetch_deck.call_args.args[0] == "https://labs.limitlesstcg.com/200/player/1/decklist"
        assert mock_fetch_deck.call_args.args[1] == "Gardevoir EX"
        assert mock_save_scraped.call_args.args[0] == {"150", "200"}