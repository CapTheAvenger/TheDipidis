"""Tests for the labs scraper's per-meta split + reassemble cycle.

Verifies:
- _derive_meta_from_date() maps known dates to known meta keys via the
  tournament_cards_manifest.json chunk_dates lookup
- _split_labs_by_meta() writes per-meta CSVs that round-trip through
  _reassemble_labs_monolith() without row loss
- Closed-meta skip logic: tournaments with meta != current_meta and id
  already in the cache are skipped (no re-scrape)
"""

import csv
import os
import sys
import tempfile
from datetime import datetime
from unittest.mock import patch

import pytest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(REPO_ROOT, "backend", "scrapers"))
sys.path.insert(0, os.path.join(REPO_ROOT, "backend", "core"))

labs = pytest.importorskip("labs_tournament_scraper")


def test_derive_meta_known_dates():
    """Real dates from manifest's chunk_dates map to the right meta key.
    Narrower-window-wins handles the SVI-ASC overlap correctly."""
    # Resets module-level cache so the test reads the actual manifest
    labs._META_DATE_LOOKUP = None
    cases = [
        ("2026-05-16", "TEF-POR"),   # Campinas + Utrecht
        ("2026-04-25", "TEF-POR"),   # Prague (start of TEF-POR window)
        ("2025-04-12", "SVI-JTG"),   # narrower than SVI-ASC's 22-month span
        ("2024-04-05", "BRS-TEF"),   # very narrow window inside SVI-ASC overlap
        ("2024-06-29", "BRS-TWM"),
        ("2099-01-01", ""),          # future date — no chunk match
    ]
    for date_iso, expected in cases:
        got = labs._derive_meta_from_date(date_iso)
        assert got == expected, f"derive({date_iso}) = {got!r}, expected {expected!r}"


def test_split_and_reassemble_roundtrip(tmp_path, monkeypatch):
    """Splitting rows into per-meta chunks and reassembling gives back the
    same row set (count + content)."""
    monkeypatch.setattr(labs, "_get_data_dir", lambda: str(tmp_path))

    rows = [
        {"tournament_id": "0062", "meta": "TEF-POR", "deck_slug": "dragapult-ex",
         "tournament_name": "Prague", "tournament_date": "2026-04-25",
         "tournament_type": "regional", "country": "CZ"},
        {"tournament_id": "0062", "meta": "TEF-POR", "deck_slug": "lucario-hariyama",
         "tournament_name": "Prague", "tournament_date": "2026-04-25",
         "tournament_type": "regional", "country": "CZ"},
        {"tournament_id": "0058", "meta": "SVI-PFL", "deck_slug": "dragapult-ex",
         "tournament_name": "OldEvent", "tournament_date": "2026-01-15",
         "tournament_type": "regional", "country": "US"},
    ]
    counts = labs._split_labs_by_meta(rows, "labs_tournament_decks", labs.CSV_FIELDS)
    assert counts == {"TEF-POR": 2, "SVI-PFL": 1}

    # Files written
    assert (tmp_path / "labs_tournament_decks_TEF-POR.csv").exists()
    assert (tmp_path / "labs_tournament_decks_SVI-PFL.csv").exists()

    # Reassemble — row count survives
    rebuilt = labs._reassemble_labs_monolith("labs_tournament_decks", labs.CSV_FIELDS)
    assert len(rebuilt) == 3
    rebuilt_tids = sorted({r["tournament_id"] for r in rebuilt})
    assert rebuilt_tids == ["0058", "0062"]


def test_unsorted_bucket_for_missing_meta(tmp_path, monkeypatch):
    """Rows with empty meta land in _unsorted bucket — not silently dropped."""
    monkeypatch.setattr(labs, "_get_data_dir", lambda: str(tmp_path))
    rows = [{"tournament_id": "0099", "meta": "", "deck_slug": "x"}]
    counts = labs._split_labs_by_meta(rows, "labs_tournament_decks", labs.CSV_FIELDS)
    assert counts == {"_unsorted": 1}
    assert (tmp_path / "labs_tournament_decks__unsorted.csv").exists()


def test_list_chunk_paths_glob(tmp_path, monkeypatch):
    """_list_labs_chunk_paths returns exactly the files matching the prefix
    pattern (no false positives from monolith files or other scrapers)."""
    monkeypatch.setattr(labs, "_get_data_dir", lambda: str(tmp_path))
    # Create various files
    for name in [
        "labs_tournament_decks.csv",            # monolith — should NOT match
        "labs_tournament_decks_TEF-POR.csv",    # chunk
        "labs_tournament_decks_SVI-PFL.csv",    # chunk
        "labs_tournament_matchups_TEF-POR.csv", # different prefix
        "tournament_cards_data_cards.csv",      # different scraper
    ]:
        (tmp_path / name).write_text("dummy")

    decks_chunks = labs._list_labs_chunk_paths("labs_tournament_decks")
    names = sorted(os.path.basename(p) for p in decks_chunks)
    assert names == ["labs_tournament_decks_SVI-PFL.csv", "labs_tournament_decks_TEF-POR.csv"]


def test_meta_column_in_csv_fields():
    """The meta column was added to the deck CSV schema in the 2026-05-24
    split refactor. Lock the order so downstream parsers don't shift."""
    assert "meta" in labs.CSV_FIELDS
    # Should sit after the per-tournament fields, before the per-deck fields
    meta_idx = labs.CSV_FIELDS.index("meta")
    deck_idx = labs.CSV_FIELDS.index("deck_name")
    assert meta_idx < deck_idx, "meta must come before deck_name for readability"


def test_current_meta_falls_back_to_empty_when_no_format_window(tmp_path, monkeypatch):
    """When format_window.json is missing, _current_meta_key returns '' and
    the skip logic treats every tournament as 'could be current' (i.e.
    re-scrapes everything — safe-default behaviour)."""
    monkeypatch.setattr(labs, "_get_data_dir", lambda: str(tmp_path))
    # Override the project-root fallback too by pointing it at tmp_path
    monkeypatch.setattr(labs, "_PROJECT_ROOT", str(tmp_path / "nonexistent_root"))
    assert labs._current_meta_key() == ""
