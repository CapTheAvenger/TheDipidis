"""Unit tests for CSV export, atomic_write, and load_settings."""
import csv
import json
import os
import tempfile
from unittest.mock import patch

import pytest

from backend.core.card_scraper_shared import (
    atomic_write_file,
    load_settings,
    save_to_csv,
)


# ============================================================================
# atomic_write_file
# ============================================================================
class TestAtomicWriteFile:
    def test_creates_new_file(self, tmp_path):
        path = str(tmp_path / "test.txt")
        atomic_write_file(path, lambda f: f.write("hello"))
        assert os.path.exists(path)
        with open(path) as f:
            assert f.read() == "hello"

    def test_overwrites_existing(self, tmp_path):
        path = str(tmp_path / "test.txt")
        with open(path, 'w') as f:
            f.write("old")
        atomic_write_file(path, lambda f: f.write("new"))
        with open(path) as f:
            assert f.read() == "new"

    def test_no_partial_write_on_error(self, tmp_path):
        path = str(tmp_path / "crash.txt")
        with open(path, 'w') as f:
            f.write("original")

        with pytest.raises(ValueError):
            def bad_writer(f):
                f.write("partial")
                raise ValueError("boom")
            atomic_write_file(path, bad_writer)

        with open(path) as f:
            assert f.read() == "original"

    def test_creates_parent_directories(self, tmp_path):
        path = str(tmp_path / "a" / "b" / "c" / "file.txt")
        atomic_write_file(path, lambda f: f.write("nested"))
        assert os.path.exists(path)


# ============================================================================
# load_settings
# ============================================================================
class TestLoadSettings:
    def test_returns_defaults_when_missing(self, tmp_path):
        defaults = {"key": "value", "num": 42}
        with patch('backend.core.card_scraper_shared.get_config_path', return_value=str(tmp_path / "missing.json")):
            result = load_settings("missing.json", defaults)
        assert result == defaults

    def test_loads_from_file(self, tmp_path):
        settings_path = str(tmp_path / "settings.json")
        with open(settings_path, 'w') as f:
            json.dump({"key": "custom", "extra": True}, f)

        defaults = {"key": "default", "num": 42}
        with patch('backend.core.card_scraper_shared.get_config_path', return_value=settings_path):
            result = load_settings("settings.json", defaults)
        assert result["key"] == "custom"
        assert result["num"] == 42  # filled from defaults
        assert result["extra"] is True

    def test_deep_merge(self, tmp_path):
        settings_path = str(tmp_path / "settings.json")
        with open(settings_path, 'w') as f:
            json.dump({"sources": {"a": {"enabled": True}}}, f)

        defaults = {"sources": {"a": {"enabled": False, "max": 10}, "b": {"enabled": True}}}
        with patch('backend.core.card_scraper_shared.get_config_path', return_value=settings_path):
            result = load_settings("settings.json", defaults, deep_merge_keys=["sources"])
        assert result["sources"]["a"]["enabled"] is True  # from file
        assert result["sources"]["a"]["max"] == 10  # from defaults
        assert result["sources"]["b"]["enabled"] is True  # from defaults

    def test_creates_if_missing(self, tmp_path):
        settings_path = str(tmp_path / "new_settings.json")
        defaults = {"key": "value"}
        with patch('backend.core.card_scraper_shared.get_config_path', return_value=settings_path):
            result = load_settings("new_settings.json", defaults, create_if_missing=True)
        assert os.path.exists(settings_path)
        assert result == defaults

    def test_corrupted_file_returns_defaults(self, tmp_path):
        settings_path = str(tmp_path / "bad.json")
        with open(settings_path, 'w') as f:
            f.write("not valid json{{{")

        defaults = {"key": "value"}
        with patch('backend.core.card_scraper_shared.get_config_path', return_value=settings_path):
            result = load_settings("bad.json", defaults)
        assert result == defaults

    def test_empty_file_returns_defaults(self, tmp_path):
        settings_path = str(tmp_path / "empty.json")
        with open(settings_path, 'w') as f:
            f.write("")

        defaults = {"key": "value"}
        with patch('backend.core.card_scraper_shared.get_config_path', return_value=settings_path):
            result = load_settings("empty.json", defaults)
        assert result == defaults


# ============================================================================
# save_to_csv
# ============================================================================
class TestSaveToCsv:
    def test_saves_basic_data(self, tmp_path):
        data = [{'archetype': 'Test', 'card_name': 'Pikachu', 'percentage_in_archetype': 50.5}]
        with patch('backend.core.card_scraper_shared.get_data_dir', return_value=str(tmp_path)):
            save_to_csv(data, "test.csv")

        csv_path = str(tmp_path / "test.csv")
        with open(csv_path, 'r', encoding='utf-8-sig') as f:
            reader = list(csv.DictReader(f, delimiter=';'))
        assert len(reader) == 1
        # Percentage should be formatted with comma for German Excel
        assert reader[0]['percentage_in_archetype'] == '50,5'

    def test_empty_data_no_file(self, tmp_path):
        with patch('backend.core.card_scraper_shared.get_data_dir', return_value=str(tmp_path)):
            save_to_csv([], "empty.csv")
        assert not os.path.exists(str(tmp_path / "empty.csv"))

    def test_append_mode_merges(self, tmp_path):
        data1 = [{'archetype': 'A', 'card_name': 'X', 'percentage_in_archetype': 10.0}]
        data2 = [{'archetype': 'B', 'card_name': 'Y', 'percentage_in_archetype': 20.0}]

        with patch('backend.core.card_scraper_shared.get_data_dir', return_value=str(tmp_path)):
            save_to_csv(data1, "merge.csv")
            save_to_csv(data2, "merge.csv", append_mode=True)

        csv_path = str(tmp_path / "merge.csv")
        with open(csv_path, 'r', encoding='utf-8-sig') as f:
            reader = list(csv.DictReader(f, delimiter=';'))
        assert len(reader) == 2

    def test_append_mode_deduplicates(self, tmp_path):
        data = [{'archetype': 'A', 'card_name': 'X', 'percentage_in_archetype': 10.0}]

        with patch('backend.core.card_scraper_shared.get_data_dir', return_value=str(tmp_path)):
            save_to_csv(data, "dedup.csv")
            # Same data again — should replace, not duplicate
            save_to_csv(data, "dedup.csv", append_mode=True)

        csv_path = str(tmp_path / "dedup.csv")
        with open(csv_path, 'r', encoding='utf-8-sig') as f:
            reader = list(csv.DictReader(f, delimiter=';'))
        assert len(reader) == 1

    def test_period_column_reordered(self, tmp_path):
        data = [{'archetype': 'A', 'card_name': 'X', 'period': '2025-W03', 'percentage_in_archetype': 10.0}]

        with patch('backend.core.card_scraper_shared.get_data_dir', return_value=str(tmp_path)):
            save_to_csv(data, "period.csv")

        csv_path = str(tmp_path / "period.csv")
        with open(csv_path, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f, delimiter=';')
            fieldnames = reader.fieldnames
        assert fieldnames[0] == 'period'
