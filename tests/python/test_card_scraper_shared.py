"""Unit tests for backend.core.card_scraper_shared — pure functions."""
import json
import os
import tempfile
from datetime import datetime
from unittest.mock import patch, MagicMock

import pytest

from backend.core.card_scraper_shared import (
    clean_pokemon_name,
    fix_mega_pokemon_name,
    slug_to_archetype,
    normalize_archetype_name,
    resolve_date_range,
    parse_tournament_date,
    get_week_id,
    extract_number,
    card_sort_key,
    load_scraped_ids,
    save_scraped_ids,
    aggregate_card_data,
    _resolve_card_info,
)


# ============================================================================
# clean_pokemon_name
# ============================================================================
class TestCleanPokemonName:
    def test_removes_ex_suffix(self):
        assert clean_pokemon_name("Charizard ex") == "Charizard"

    def test_removes_vstar_suffix(self):
        assert clean_pokemon_name("Arceus VSTAR") == "Arceus"

    def test_removes_vmax_suffix(self):
        assert clean_pokemon_name("Mew VMAX") == "Mew"

    def test_removes_v_suffix(self):
        assert clean_pokemon_name("Lugia V") == "Lugia"

    def test_removes_gx_suffix(self):
        assert clean_pokemon_name("Pikachu GX") == "Pikachu"

    def test_removes_v_union_suffix(self):
        assert clean_pokemon_name("Mewtwo V-UNION") == "Mewtwo"

    def test_preserves_plain_name(self):
        assert clean_pokemon_name("Bidoof") == "Bidoof"

    def test_strips_whitespace(self):
        assert clean_pokemon_name("  Pikachu  ") == "Pikachu"

    def test_empty_string(self):
        assert clean_pokemon_name("") == ""

    def test_only_suffix(self):
        # Edge case: "EX" without space prefix is NOT stripped (suffix requires leading space)
        assert clean_pokemon_name("EX") == "EX"


# ============================================================================
# fix_mega_pokemon_name
# ============================================================================
class TestFixMegaPokemonName:
    def test_fixes_dash_mega(self):
        assert fix_mega_pokemon_name("charizard-mega") == "mega charizard"

    def test_case_insensitive(self):
        assert fix_mega_pokemon_name("Lucario-Mega") == "mega Lucario"

    def test_leaves_normal_name(self):
        assert fix_mega_pokemon_name("Mewtwo") == "Mewtwo"

    def test_empty_string(self):
        assert fix_mega_pokemon_name("") == ""


# ============================================================================
# slug_to_archetype
# ============================================================================
class TestSlugToArchetype:
    def test_basic_slug(self):
        assert slug_to_archetype("charizard-ex") == "Charizard EX"

    def test_multi_word(self):
        assert slug_to_archetype("raging-bolt-ogerpon") == "Raging Bolt Ogerpon"

    def test_vmax_uppercase(self):
        assert slug_to_archetype("mew-vmax") == "Mew VMAX"

    def test_vstar_uppercase(self):
        assert slug_to_archetype("arceus-vstar") == "Arceus VSTAR"

    def test_empty(self):
        assert slug_to_archetype("") == ""

    def test_underscores(self):
        assert slug_to_archetype("lugia_v") == "Lugia V"


# ============================================================================
# normalize_archetype_name
# ============================================================================
class TestNormalizeArchetypeName:
    def test_basic_title(self):
        assert normalize_archetype_name("charizard dusknoir") == "Charizard Dusknoir"

    def test_removes_n_prefix(self):
        result = normalize_archetype_name("N Zoroark")
        assert "Zoroark" in result

    def test_fixes_mega_dash(self):
        assert normalize_archetype_name("lucario-mega") == "Mega Lucario"

    def test_strips_whitespace(self):
        assert normalize_archetype_name("  Pikachu  ") == "Pikachu"

    def test_empty(self):
        assert normalize_archetype_name("") == ""


# ============================================================================
# resolve_date_range
# ============================================================================
class TestResolveDateRange:
    def test_valid_dates(self):
        start, end = resolve_date_range("01.01.2025", "31.12.2025")
        assert start == datetime(2025, 1, 1)
        assert end == datetime(2025, 12, 31)

    def test_auto_end_date(self):
        start, end = resolve_date_range("01.01.2025", "auto")
        assert start == datetime(2025, 1, 1)
        assert isinstance(end, datetime)

    def test_invalid_start_uses_fallback(self):
        start, _ = resolve_date_range("invalid", "auto")
        assert isinstance(start, datetime)

    def test_invalid_end_uses_fallback(self):
        _, end = resolve_date_range("01.01.2025", "not-a-date")
        assert isinstance(end, datetime)


# ============================================================================
# parse_tournament_date
# ============================================================================
class TestParseTournamentDate:
    def test_short_format(self):
        result = parse_tournament_date("15 Jan 25")
        assert result == datetime(2025, 1, 15)

    def test_long_format_with_ordinal(self):
        result = parse_tournament_date("1st January 2025")
        assert result is not None
        assert result.day == 1
        assert result.month == 1

    def test_empty_string(self):
        assert parse_tournament_date("") is None

    def test_none_input(self):
        assert parse_tournament_date(None) is None

    def test_invalid_date(self):
        assert parse_tournament_date("not a date") is None

    def test_number_string(self):
        assert parse_tournament_date("12345") is None


# ============================================================================
# get_week_id
# ============================================================================
class TestGetWeekId:
    def test_short_date_format(self):
        result = get_week_id("15 Jan 25")
        assert result.startswith("2025-W")

    def test_iso_format(self):
        result = get_week_id("2025-01-15")
        assert result.startswith("2025-W")

    def test_german_format(self):
        result = get_week_id("15.01.2025")
        assert result.startswith("2025-W")

    def test_empty_string(self):
        assert get_week_id("") == "Unknown-Week"

    def test_invalid(self):
        assert get_week_id("garbage") == "Unknown-Week"


# ============================================================================
# extract_number
# ============================================================================
class TestExtractNumber:
    def test_plain_number(self):
        assert extract_number("185") == 185

    def test_number_with_suffix(self):
        assert extract_number("185a") == 185

    def test_tg_prefix(self):
        # re.match(r'(\d+)', 'TG24') fails — digits must be at start
        assert extract_number("TG24") == 0

    def test_empty_string(self):
        assert extract_number("") == 0

    def test_no_digits(self):
        assert extract_number("abc") == 0

    def test_none_input(self):
        assert extract_number(None) == 0


# ============================================================================
# card_sort_key
# ============================================================================
class TestCardSortKey:
    def test_newer_set_sorts_first(self):
        order = {'SVI': 100, 'PAL': 110}
        key_svi = card_sort_key({'set': 'SVI', 'number': '1'}, order)
        key_pal = card_sort_key({'set': 'PAL', 'number': '1'}, order)
        assert key_pal < key_svi  # PAL is newer (110) -> -110 < -100

    def test_same_set_sorts_by_number(self):
        order = {'SVI': 100}
        key_1 = card_sort_key({'set': 'SVI', 'number': '1'}, order)
        key_50 = card_sort_key({'set': 'SVI', 'number': '50'}, order)
        assert key_1 < key_50

    def test_unknown_set_uses_zero(self):
        key = card_sort_key({'set': 'UNKNOWN', 'number': '1'}, {})
        assert key[0] == 0  # -0 == 0


# ============================================================================
# load_scraped_ids / save_scraped_ids
# ============================================================================
class TestScrapedIds:
    def test_load_missing_file(self):
        assert load_scraped_ids("/nonexistent/path.json") == set()

    def test_round_trip(self, tmp_path):
        path = str(tmp_path / "ids.json")
        ids = {"id1", "id2", "id3"}
        save_scraped_ids(path, ids)
        loaded = load_scraped_ids(path)
        assert loaded == ids

    def test_load_dict_format(self, tmp_path):
        path = str(tmp_path / "ids.json")
        with open(path, 'w') as f:
            json.dump({"scraped_ids": ["a", "b"]}, f)
        assert load_scraped_ids(path) == {"a", "b"}

    def test_load_list_format(self, tmp_path):
        path = str(tmp_path / "ids.json")
        with open(path, 'w') as f:
            json.dump(["x", "y"], f)
        assert load_scraped_ids(path) == {"x", "y"}

    def test_load_corrupted_json(self, tmp_path):
        path = str(tmp_path / "ids.json")
        with open(path, 'w') as f:
            f.write("not json{{{")
        assert load_scraped_ids(path) == set()


# ============================================================================
# aggregate_card_data
# ============================================================================
class TestAggregateCardData:
    def test_empty_decks(self, mock_card_db):
        result = aggregate_card_data([], mock_card_db)
        assert result == []

    def test_single_deck_single_card(self, mock_card_db):
        decks = [{
            'archetype': 'Charizard',
            'cards': [{'name': 'Charizard ex', 'count': 2, 'set_code': 'OBF', 'set_number': '125'}]
        }]
        result = aggregate_card_data(decks, mock_card_db)
        assert len(result) == 1
        assert result[0]['card_name'] == 'Charizard ex'
        assert result[0]['total_count'] == 2
        assert result[0]['deck_inclusion_count'] == 1
        assert result[0]['percentage_in_archetype'] == 100.0

    def test_two_decks_same_archetype(self, mock_card_db):
        decks = [
            {'archetype': 'Lugia', 'cards': [{'name': 'Lugia V', 'count': 2}]},
            {'archetype': 'Lugia', 'cards': [{'name': 'Lugia V', 'count': 3}]},
        ]
        result = aggregate_card_data(decks, mock_card_db)
        assert len(result) == 1
        assert result[0]['total_count'] == 5
        assert result[0]['deck_inclusion_count'] == 2
        assert result[0]['average_count'] == 2.5
        assert result[0]['percentage_in_archetype'] == 100.0

    def test_card_in_one_of_two_decks(self, mock_card_db):
        decks = [
            {'archetype': 'Lugia', 'cards': [
                {'name': 'Lugia V', 'count': 2},
                {'name': 'Boss Order', 'count': 1}
            ]},
            {'archetype': 'Lugia', 'cards': [{'name': 'Lugia V', 'count': 3}]},
        ]
        result = aggregate_card_data(decks, mock_card_db)
        boss = [r for r in result if r['card_name'] == 'Boss Order'][0]
        assert boss['deck_inclusion_count'] == 1
        assert boss['percentage_in_archetype'] == 50.0

    def test_skips_deck_without_archetype(self, mock_card_db):
        decks = [
            {'archetype': '', 'cards': [{'name': 'X', 'count': 1}]},
        ]
        result = aggregate_card_data(decks, mock_card_db)
        assert result == []

    def test_skips_deck_without_cards(self, mock_card_db):
        decks = [{'archetype': 'Lugia', 'cards': []}]
        result = aggregate_card_data(decks, mock_card_db)
        assert result == []

    def test_invalid_count_skipped(self, mock_card_db):
        decks = [{
            'archetype': 'Test',
            'cards': [{'name': 'Card', 'count': 'not-a-number'}]
        }]
        result = aggregate_card_data(decks, mock_card_db)
        assert result == []

    def test_group_by_tournament_date(self, mock_card_db):
        decks = [{
            'archetype': 'Lugia',
            'cards': [{'name': 'Lugia V', 'count': 2}],
            'tournament_id': 'T1',
            'tournament_date': '15 Jan 25',
        }]
        result = aggregate_card_data(decks, mock_card_db, group_by_tournament_date=True)
        assert len(result) == 1
        assert result[0]['tournament_id'] == 'T1'
        assert 'period' in result[0]

    def test_max_count_tracked(self, mock_card_db):
        decks = [
            {'archetype': 'A', 'cards': [{'name': 'X', 'count': 2}]},
            {'archetype': 'A', 'cards': [{'name': 'X', 'count': 4}]},
        ]
        result = aggregate_card_data(decks, mock_card_db)
        assert result[0]['max_count'] == 4

    def test_ace_spec_detection(self, mock_card_db):
        mock_card_db.is_ace_spec_by_name = lambda n: n == 'Prime Catcher'
        decks = [{
            'archetype': 'A',
            'cards': [{'name': 'Prime Catcher', 'count': 1}]
        }]
        result = aggregate_card_data(decks, mock_card_db)
        assert result[0]['is_ace_spec'] == 'Yes'


# ============================================================================
# _resolve_card_info
# ============================================================================
class TestResolveCardInfo:
    def test_with_set_versions(self, mock_card_db):
        versions = {('OBF', '125'): 5, ('SVI', '1'): 2}
        result = _resolve_card_info('Charizard', versions, mock_card_db)
        assert result['set_code'] == 'OBF'
        assert result['number'] == '125'

    def test_without_set_versions(self, mock_card_db):
        result = _resolve_card_info('Charizard', {}, mock_card_db)
        assert 'set_code' in result

    def test_empty_name(self, mock_card_db):
        mock_card_db.get_card_info = lambda n: None
        result = _resolve_card_info('', {}, mock_card_db)
        assert isinstance(result, dict)
