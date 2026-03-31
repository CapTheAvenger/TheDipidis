"""Unit tests for backend.core.prepare_card_data — data merge & formatting."""
import pytest

from backend.core.prepare_card_data import get_base_pokemon_name


class TestGetBasePokemonName:
    """Tests for Pokédex lookup normalization."""

    def test_basic_name(self):
        assert get_base_pokemon_name("Charizard") == "charizard"

    def test_ex_suffix(self):
        assert get_base_pokemon_name("Charizard ex") == "charizard"

    def test_vstar_suffix(self):
        assert get_base_pokemon_name("Arceus VSTAR") == "arceus"

    def test_vmax_suffix(self):
        assert get_base_pokemon_name("Mew VMAX") == "mew"

    def test_gx_suffix(self):
        assert get_base_pokemon_name("Pikachu GX") == "pikachu"

    def test_v_union(self):
        assert get_base_pokemon_name("Mewtwo V-UNION") == "mewtwo"

    def test_radiant_prefix(self):
        assert get_base_pokemon_name("Radiant Charizard") == "charizard"

    def test_galarian_prefix(self):
        assert get_base_pokemon_name("Galarian Moltres") == "moltres"

    def test_hisuian_prefix(self):
        assert get_base_pokemon_name("Hisuian Zoroark") == "zoroark"

    def test_alolan_prefix(self):
        assert get_base_pokemon_name("Alolan Vulpix") == "vulpix"

    def test_paldean_prefix(self):
        assert get_base_pokemon_name("Paldean Tauros") == "tauros"

    def test_mr_mime(self):
        result = get_base_pokemon_name("Mr. Mime")
        assert result == "mr-mime"

    def test_farfetchd(self):
        result = get_base_pokemon_name("Farfetch'd")
        assert result == "farfetchd"

    def test_multiple_words(self):
        result = get_base_pokemon_name("Roaring Moon")
        assert result == "roaring-moon"

    def test_empty_string(self):
        assert get_base_pokemon_name("") == ""

    def test_break_suffix(self):
        assert get_base_pokemon_name("Greninja BREAK") == "greninja"

    def test_lv_x_suffix(self):
        assert get_base_pokemon_name("Dialga LV.X") == "dialga"

    def test_dark_prefix(self):
        assert get_base_pokemon_name("Dark Charizard") == "charizard"

    def test_shining_prefix(self):
        assert get_base_pokemon_name("Shining Mew") == "mew"

    def test_right_single_quote(self):
        # Unicode right single quotation mark (U+2019)
        result = get_base_pokemon_name("Farfetch\u2019d")
        assert result == "farfetchd"

    def test_combined_prefix_suffix(self):
        # Galarian + ex
        result = get_base_pokemon_name("Galarian Rapidash ex")
        assert result == "rapidash"
