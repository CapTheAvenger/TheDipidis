"""Unit tests for CardDatabaseLookup — no file I/O, patch _load_databases."""
import csv
import os
import tempfile
from unittest.mock import patch, MagicMock

import pytest

from backend.core.card_scraper_shared import CardDatabaseLookup


@pytest.fixture
def empty_db():
    """CardDatabaseLookup with no cards loaded (patched I/O)."""
    with patch.object(CardDatabaseLookup, '_load_databases'), \
         patch.object(CardDatabaseLookup, '_load_dynamic_set_order', return_value={'SVI': 100, 'PAL': 110}):
        db = CardDatabaseLookup()
        db.cards = {}
        return db


class TestNormalizeName:
    def test_basic(self, empty_db):
        assert empty_db.normalize_name("Charizard ex") == "charizard ex"

    def test_strips_quotes(self, empty_db):
        assert empty_db.normalize_name("Boss's Orders") == "bosss orders"

    def test_strips_right_quote(self, empty_db):
        assert empty_db.normalize_name("Farfetch\u2019d") == "farfetchd"

    def test_strips_dashes(self, empty_db):
        assert empty_db.normalize_name("V-UNION") == "v union"

    def test_collapses_whitespace(self, empty_db):
        assert empty_db.normalize_name("  hello   world  ") == "hello world"

    def test_empty(self, empty_db):
        assert empty_db.normalize_name("") == ""

    def test_dots_removed(self, empty_db):
        assert empty_db.normalize_name("Mr. Mime") == "mr mime"


class TestAddCard:
    def test_adds_card(self, empty_db):
        seen = set()
        row = {'set': 'SVI', 'number': '1', 'type': 'Basic', 'rarity': 'Common', 'image_url': ''}
        empty_db._add_card('Pikachu', row, 'english', seen)
        assert 'pikachu' in empty_db.cards
        assert len(empty_db.cards['pikachu']) == 1

    def test_deduplicates_by_set_number(self, empty_db):
        seen = set()
        row = {'set': 'SVI', 'number': '1', 'type': 'Basic', 'rarity': 'Common', 'image_url': ''}
        empty_db._add_card('Pikachu', row, 'english', seen)
        empty_db._add_card('Pikachu', row, 'japanese', seen)  # same set+number
        assert len(empty_db.cards['pikachu']) == 1

    def test_different_versions_added(self, empty_db):
        seen = set()
        empty_db._add_card('Pikachu', {'set': 'SVI', 'number': '1', 'type': 'Basic', 'rarity': 'Common', 'image_url': ''}, 'english', seen)
        empty_db._add_card('Pikachu', {'set': 'PAL', 'number': '50', 'type': 'Basic', 'rarity': 'Uncommon', 'image_url': ''}, 'english', seen)
        assert len(empty_db.cards['pikachu']) == 2

    def test_energy_supertype(self, empty_db):
        seen = set()
        empty_db._add_card('Fire Energy', {'set': 'SVI', 'number': '2', 'type': 'Basic Fire Energy', 'rarity': '', 'image_url': ''}, 'english', seen)
        assert empty_db.cards['fire energy'][0]['supertype'] == 'Energy'

    def test_trainer_supertype(self, empty_db):
        seen = set()
        empty_db._add_card("Boss's Orders", {'set': 'SVI', 'number': '3', 'type': 'Supporter', 'rarity': 'Uncommon', 'image_url': ''}, 'english', seen)
        assert empty_db.cards['bosss orders'][0]['supertype'] == 'Trainer'

    def test_pokemon_supertype(self, empty_db):
        seen = set()
        empty_db._add_card('Mewtwo', {'set': 'SVI', 'number': '4', 'type': 'Basic', 'rarity': 'Rare', 'image_url': ''}, 'english', seen)
        assert empty_db.cards['mewtwo'][0]['supertype'] == 'Pokemon'


class TestGetCard:
    def test_existing_card(self, empty_db):
        seen = set()
        empty_db._add_card('Pikachu', {'set': 'SVI', 'number': '25', 'type': 'Basic', 'rarity': 'Common', 'image_url': 'img.png'}, 'english', seen)
        result = empty_db.get_card('SVI', '25')
        assert result is not None
        assert result['rarity'] == 'Common'

    def test_case_insensitive_set(self, empty_db):
        seen = set()
        empty_db._add_card('Pikachu', {'set': 'SVI', 'number': '25', 'type': 'Basic', 'rarity': 'Common', 'image_url': ''}, 'english', seen)
        result = empty_db.get_card('svi', '25')
        assert result is not None

    def test_nonexistent_card(self, empty_db):
        assert empty_db.get_card('XYZ', '999') is None


class TestGetCardInfo:
    def test_existing(self, empty_db):
        seen = set()
        empty_db._add_card('Charizard ex', {'set': 'OBF', 'number': '125', 'type': 'Stage 2', 'rarity': 'Double Rare', 'image_url': 'img.png'}, 'english', seen)
        result = empty_db.get_card_info('Charizard ex')
        assert result['set_code'] == 'OBF'
        assert result['rarity'] == 'Double Rare'

    def test_nonexistent(self, empty_db):
        assert empty_db.get_card_info('Nonexistent Card') is None


class TestGetLatestLowRarityVersion:
    def test_picks_newest_set(self, empty_db):
        seen = set()
        empty_db._add_card('Pikachu', {'set': 'SVI', 'number': '1', 'type': 'Basic', 'rarity': 'Common', 'image_url': ''}, 'english', seen)
        empty_db._add_card('Pikachu', {'set': 'PAL', 'number': '50', 'type': 'Basic', 'rarity': 'Uncommon', 'image_url': ''}, 'english', seen)
        result = empty_db.get_latest_low_rarity_version('Pikachu')
        assert result.set_code == 'PAL'  # PAL has higher SET_ORDER (110 > 100)

    def test_prefers_low_rarity(self, empty_db):
        seen = set()
        empty_db._add_card('Mew', {'set': 'SVI', 'number': '1', 'type': 'Basic', 'rarity': 'Common', 'image_url': ''}, 'english', seen)
        empty_db._add_card('Mew', {'set': 'PAL', 'number': '50', 'type': 'Basic', 'rarity': 'Ultra Rare', 'image_url': ''}, 'english', seen)
        result = empty_db.get_latest_low_rarity_version('Mew')
        assert result.set_code == 'SVI'  # Only Common is low-rarity

    def test_nonexistent(self, empty_db):
        assert empty_db.get_latest_low_rarity_version('Ghost Card') is None


class TestGetCardType:
    def test_pokemon(self, empty_db):
        seen = set()
        empty_db._add_card('Pikachu', {'set': 'SVI', 'number': '1', 'type': 'Basic', 'rarity': 'Common', 'image_url': ''}, 'english', seen)
        assert empty_db.get_card_type('Pikachu') == 'Pokemon'

    def test_trainer(self, empty_db):
        seen = set()
        empty_db._add_card("Boss's Orders", {'set': 'SVI', 'number': '2', 'type': 'Supporter', 'rarity': 'Uncommon', 'image_url': ''}, 'english', seen)
        assert empty_db.get_card_type("Boss's Orders") == 'Trainer'

    def test_energy(self, empty_db):
        seen = set()
        empty_db._add_card('Fire Energy', {'set': 'SVI', 'number': '3', 'type': 'Basic Fire Energy', 'rarity': '', 'image_url': ''}, 'english', seen)
        assert empty_db.get_card_type('Fire Energy') == 'Energy'

    def test_unknown_defaults_pokemon(self, empty_db):
        assert empty_db.get_card_type('Unknown Card') == 'Pokemon'


class TestIsAceSpecByName:
    def test_ace_spec_type(self, empty_db):
        seen = set()
        empty_db._add_card('Prime Catcher', {'set': 'TEF', 'number': '157', 'type': 'Ace Spec Item', 'rarity': 'Rare', 'image_url': ''}, 'english', seen)
        assert empty_db.is_ace_spec_by_name('Prime Catcher') is True

    def test_ultra_rare_trainer(self, empty_db):
        seen = set()
        empty_db._add_card('Master Ball', {'set': 'PAL', 'number': '153', 'type': 'Item', 'rarity': 'Ultra Rare', 'image_url': ''}, 'english', seen)
        assert empty_db.is_ace_spec_by_name('Master Ball') is True

    def test_normal_card_not_ace(self, empty_db):
        seen = set()
        empty_db._add_card('Nest Ball', {'set': 'SVI', 'number': '181', 'type': 'Item', 'rarity': 'Uncommon', 'image_url': ''}, 'english', seen)
        assert empty_db.is_ace_spec_by_name('Nest Ball') is False

    def test_unknown_card(self, empty_db):
        assert empty_db.is_ace_spec_by_name('Nonexistent') is False


class TestGetNameBySetNumber:
    def test_exact_match(self, empty_db):
        seen = set()
        empty_db._add_card('Pikachu', {'set': 'SVI', 'number': '25', 'type': 'Basic', 'rarity': 'Common', 'image_url': ''}, 'english', seen)
        assert empty_db.get_name_by_set_number('SVI', '25') == 'Pikachu'

    def test_leading_zero_stripped(self, empty_db):
        seen = set()
        empty_db._add_card('Pikachu', {'set': 'SVI', 'number': '25', 'type': 'Basic', 'rarity': 'Common', 'image_url': ''}, 'english', seen)
        assert empty_db.get_name_by_set_number('SVI', '025') == 'Pikachu'

    def test_not_found(self, empty_db):
        assert empty_db.get_name_by_set_number('XYZ', '999') is None

    def test_case_insensitive_set(self, empty_db):
        seen = set()
        empty_db._add_card('Pikachu', {'set': 'SVI', 'number': '25', 'type': 'Basic', 'rarity': 'Common', 'image_url': ''}, 'english', seen)
        assert empty_db.get_name_by_set_number('svi', '25') == 'Pikachu'
