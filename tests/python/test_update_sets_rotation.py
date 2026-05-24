"""Tests for the current-meta rotation reset in update_sets.

When a new English set rotates in (format_filter PFL → CRI), the
existing aggregated current-meta CSVs still carry the previous format's
decklists. Without an explicit truncate the new scrape mixes the
rotated-out decks with the new format, polluting per-card averages for
weeks until the old data ages out of the recency window. The reset
block in apply_format_window_to_scraper_settings is the safety net that
prevents that pollution.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

_REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_REPO_ROOT / "backend" / "core"))

import update_sets  # noqa: E402


@pytest.fixture
def isolated_data_dir(tmp_path, monkeypatch):
    """Redirect update_sets.data_dir to a per-test scratch directory so
    we can assert against the truncated files without touching real data."""
    d = tmp_path / "data"
    d.mkdir()
    monkeypatch.setattr(update_sets, "data_dir", str(d))
    return d


def _write_format_window(path: Path, current_set: str = "CRI",
                         set_release: str = "2026-06-05",
                         jp_release: str = "2026-05-22",
                         in_person: str = "2026-06-05"):
    payload = {
        "current_set": current_set,
        "set_release_date": set_release,
        "jp_release_date": jp_release,
        "in_person_legal_date": in_person,
    }
    path.write_text(json.dumps(payload), encoding="utf-8")


def _write_settings(path: Path, current_meta_format: str = "PFL",
                    cl_start_date: str = "13.03.2026"):
    payload = {
        "city_league_analysis": {
            "sources": {
                "city_league": {"start_date": cl_start_date}
            }
        },
        "city_league_archetype": {"start_date": cl_start_date},
        "limitless_online": {"set": current_meta_format},
        "current_meta_analysis": {
            "sources": {
                "limitless_online": {"format_filter": current_meta_format},
                "tournaments": {"start_date": "01.03.2026"},
            }
        },
    }
    path.write_text(json.dumps(payload), encoding="utf-8")


def _write_csv_with_rows(path: Path, header: str, rows: int = 5):
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        f.write(header + "\n")
        for i in range(rows):
            f.write(f"row{i};data;here\n")


class TestCurrentMetaRotationReset:
    def test_rotation_truncates_current_meta_csvs(self, isolated_data_dir, tmp_path):
        # PFL → CRI rotation. Old CSVs full of PFL data must come out
        # header-only so the next scraper produces a clean CRI snapshot.
        fw_path = tmp_path / "format_window.json"
        settings_path = tmp_path / "scraper_settings.json"
        _write_format_window(fw_path, current_set="CRI")
        _write_settings(settings_path, current_meta_format="PFL")

        cmd_path = isolated_data_dir / "current_meta_card_data.csv"
        dated_path = isolated_data_dir / "online_tournament_dated_cards.csv"
        _write_csv_with_rows(cmd_path, "name;count;meta", rows=10)
        _write_csv_with_rows(dated_path, "tournament_id;archetype;card_name", rows=20)

        update_sets.apply_format_window_to_scraper_settings(
            str(fw_path), str(settings_path)
        )

        # Both files should be header-only now
        cmd_lines = cmd_path.read_text(encoding="utf-8-sig").splitlines()
        dated_lines = dated_path.read_text(encoding="utf-8-sig").splitlines()
        assert cmd_lines == ["name;count;meta"], f"cmd not truncated: {cmd_lines}"
        assert dated_lines == ["tournament_id;archetype;card_name"], (
            f"dated not truncated: {dated_lines}"
        )

    def test_rotation_resets_scraped_tournaments_json(self, isolated_data_dir, tmp_path):
        # The labs de-dup state file must reset so the new format's
        # tournaments aren't silently skipped because their IDs were
        # in the previous format's "already scraped" list.
        fw_path = tmp_path / "format_window.json"
        settings_path = tmp_path / "scraper_settings.json"
        _write_format_window(fw_path, current_set="CRI")
        _write_settings(settings_path, current_meta_format="PFL")

        scraped_path = isolated_data_dir / "current_meta_scraped_tournaments.json"
        scraped_path.write_text(
            json.dumps({"scraped_tournament_ids": ["t1", "t2", "t3"]}),
            encoding="utf-8",
        )

        update_sets.apply_format_window_to_scraper_settings(
            str(fw_path), str(settings_path)
        )

        reset = json.loads(scraped_path.read_text(encoding="utf-8"))
        assert reset == {"scraped_tournament_ids": []}, (
            f"scraped IDs not reset: {reset}"
        )

    def test_no_rotation_no_truncate(self, isolated_data_dir, tmp_path):
        # Same format_filter on both sides → no rotation → CSVs must
        # remain untouched. Idempotency guard against accidental wipes
        # when CI re-runs the sync on a stable format.
        fw_path = tmp_path / "format_window.json"
        settings_path = tmp_path / "scraper_settings.json"
        _write_format_window(fw_path, current_set="CRI")
        _write_settings(settings_path, current_meta_format="CRI")

        cmd_path = isolated_data_dir / "current_meta_card_data.csv"
        _write_csv_with_rows(cmd_path, "name;count;meta", rows=10)
        original = cmd_path.read_text(encoding="utf-8-sig")

        update_sets.apply_format_window_to_scraper_settings(
            str(fw_path), str(settings_path)
        )

        assert cmd_path.read_text(encoding="utf-8-sig") == original, (
            "current_meta_card_data.csv was modified despite no rotation"
        )

    def test_first_time_setup_no_truncate(self, isolated_data_dir, tmp_path):
        # First-ever sync (no previous format_filter) is NOT a rotation —
        # nothing to clear out. CSVs may not even exist; the code must
        # not crash and must not flag the absence as an error.
        fw_path = tmp_path / "format_window.json"
        settings_path = tmp_path / "scraper_settings.json"
        _write_format_window(fw_path, current_set="CRI")
        # Settings without any format_filter set — fresh install scenario
        settings_path.write_text(json.dumps({
            "city_league_analysis": {"sources": {"city_league": {"start_date": ""}}},
            "city_league_archetype": {"start_date": ""},
            "limitless_online": {"set": ""},
            "current_meta_analysis": {
                "sources": {
                    "limitless_online": {},
                    "tournaments": {},
                }
            },
        }), encoding="utf-8")

        # No CSVs exist — code must not crash
        update_sets.apply_format_window_to_scraper_settings(
            str(fw_path), str(settings_path)
        )

        # Settings should have been updated
        updated = json.loads(settings_path.read_text(encoding="utf-8"))
        assert (updated["current_meta_analysis"]["sources"]
                ["limitless_online"]["format_filter"]) == "CRI"

    def test_rotation_handles_missing_csvs_gracefully(self, isolated_data_dir, tmp_path):
        # A rotation when one or both CSVs are missing (= fresh install
        # that has scrolled forward by a set without ever running the
        # current-meta scraper) must not crash.
        fw_path = tmp_path / "format_window.json"
        settings_path = tmp_path / "scraper_settings.json"
        _write_format_window(fw_path, current_set="CRI")
        _write_settings(settings_path, current_meta_format="PFL")
        # No CSV files created — function must skip them quietly

        update_sets.apply_format_window_to_scraper_settings(
            str(fw_path), str(settings_path)
        )

        # Settings still get updated even if no CSVs exist to truncate
        updated = json.loads(settings_path.read_text(encoding="utf-8"))
        assert (updated["current_meta_analysis"]["sources"]
                ["limitless_online"]["format_filter"]) == "CRI"

    def test_rotation_preserves_empty_file(self, isolated_data_dir, tmp_path):
        # An empty CSV (= 0 bytes) shouldn't crash the truncate logic.
        # The `if not header: continue` branch handles this case.
        fw_path = tmp_path / "format_window.json"
        settings_path = tmp_path / "scraper_settings.json"
        _write_format_window(fw_path, current_set="CRI")
        _write_settings(settings_path, current_meta_format="PFL")

        cmd_path = isolated_data_dir / "current_meta_card_data.csv"
        cmd_path.write_text("", encoding="utf-8-sig")

        update_sets.apply_format_window_to_scraper_settings(
            str(fw_path), str(settings_path)
        )

        # File stays empty — not crashed, not crashed-and-truncated-to-nothing
        assert cmd_path.read_text(encoding="utf-8-sig") == ""

    def test_rotation_logs_old_and_new_set_in_change_message(
        self, isolated_data_dir, tmp_path, capsys
    ):
        # The audit trail printed by the function must name BOTH old and
        # new format so an operator scanning the CI log can verify the
        # rotation was the one they expected.
        fw_path = tmp_path / "format_window.json"
        settings_path = tmp_path / "scraper_settings.json"
        _write_format_window(fw_path, current_set="CRI")
        _write_settings(settings_path, current_meta_format="PFL")

        cmd_path = isolated_data_dir / "current_meta_card_data.csv"
        _write_csv_with_rows(cmd_path, "name;count;meta", rows=3)

        update_sets.apply_format_window_to_scraper_settings(
            str(fw_path), str(settings_path)
        )

        out = capsys.readouterr().out
        assert "'PFL'" in out and "'CRI'" in out, (
            f"change log should reference both formats; got:\n{out}"
        )
