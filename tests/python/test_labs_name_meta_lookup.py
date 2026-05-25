"""Tests for the labs-tournament name → meta lookup.

Labs /decks and /standings headers are partly JS-rendered, so static
scraping can't extract tournament_date for many archive entries. The
name-based lookup crossreferences labs tournament names against the
tournament_cards_data_cards_<META>.csv files to derive the meta tag
without needing a date from labs.

These tests exercise the name parser + positional disambiguation
(Stuttgart appears in 3 metas, Brisbane in 2, etc.) + the labs-founding
filter that prevents pre-labs cards entries from getting matched.
"""

import csv
import json
import os
import sys

import pytest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(REPO_ROOT, "backend", "scrapers"))
sys.path.insert(0, os.path.join(REPO_ROOT, "backend", "core"))

labs = pytest.importorskip("labs_tournament_scraper")


def test_parse_name_regional_with_state_suffix():
    """'Regional Championship Los Angeles, CA' → ('regional', 'los angeles')"""
    key = labs._parse_tournament_name_key("Regional Championship Los Angeles, CA")
    assert key == ("regional", "los angeles")


def test_parse_name_regional_labs_vs_cards():
    """Labs ('Regional Championship Birmingham') and cards
    ('Regional Birmingham – Limitless') reconcile to the same key."""
    assert labs._parse_tournament_name_key("Regional Championship Birmingham") == \
           labs._parse_tournament_name_key("Regional Birmingham – Limitless")


def test_parse_name_international_euic_vs_labs():
    """Cards 'EUIC 2026, London' and labs 'International Championship London'
    map to the same key."""
    assert labs._parse_tournament_name_key("EUIC 2026, London") == \
           labs._parse_tournament_name_key("International Championship London") == \
           ("international", "london")


def test_parse_name_world_year_vs_city():
    """Cards 'World Championships 2025' is keyed by year; labs
    'World Championship Anaheim' is keyed by city → caller resolves
    Anaheim → 2025 via _WORLD_HOST_BY_CITY."""
    cards_key = labs._parse_tournament_name_key("World Championships 2025")
    labs_key = labs._parse_tournament_name_key("World Championship Anaheim")
    assert cards_key == ("world", "2025")
    assert labs_key == ("world-by-city", "anaheim")
    assert labs._WORLD_HOST_BY_CITY["anaheim"] == "2025"


def test_parse_name_seville_alias():
    """Limitless inconsistently spells Sevilla/Seville. The parser
    canonicalises to 'sevilla' so labs (Seville) and cards (Sevilla) match."""
    assert labs._parse_tournament_name_key("Special Event Seville") == \
           labs._parse_tournament_name_key("Special Event Sevilla – Limitless") == \
           ("special", "sevilla")


def test_parse_cards_human_date():
    """Cards CSV uses '18th January 2025' format. Parser strips the ordinal."""
    d = labs._parse_cards_human_date("18th January 2025")
    assert d is not None
    assert (d.year, d.month, d.day) == (2025, 1, 18)


def test_lookup_with_synthetic_data(tmp_path, monkeypatch):
    """Full lookup roundtrip — synthetic cards CSVs + labs tournaments
    list → expected (meta, date) tuples per tid."""
    # Build a synthetic cards data directory
    monkeypatch.setattr(labs, "_get_data_dir", lambda: str(tmp_path))

    # Cards CSV: Stuttgart in 2 metas, Birmingham in 1
    cards_brs_ssp = tmp_path / "tournament_cards_data_cards_BRS-SSP.csv"
    cards_brs_ssp.write_text(
        "tournament_id;tournament_name;tournament_date\n"
        "1;Regional Stuttgart – Limitless;30th November 2024\n"
        "2;Regional Birmingham – Limitless;18th January 2025\n"
    )
    cards_svi_pfl = tmp_path / "tournament_cards_data_cards_SVI-PFL.csv"
    cards_svi_pfl.write_text(
        "tournament_id;tournament_name;tournament_date\n"
        "3;Regional Stuttgart – Limitless;29th November 2025\n"
    )
    # Pre-labs entry — should be filtered out by LABS_FOUNDING
    cards_bst_par = tmp_path / "tournament_cards_data_cards_BST-PAR.csv"
    cards_bst_par.write_text(
        "tournament_id;tournament_name;tournament_date\n"
        "4;Regional Stuttgart – Limitless;9th December 2023\n"
    )

    labs_list = [
        {"tournament_id": "0011", "tournament_name": "Regional Championship Stuttgart"},
        {"tournament_id": "0015", "tournament_name": "Regional Championship Birmingham"},
        {"tournament_id": "0047", "tournament_name": "Regional Championship Stuttgart"},
    ]
    lookup = labs._build_labs_name_meta_lookup(labs_list)

    # Stuttgart positional match: older labs tid → older cards entry
    # After founding filter: cards Stuttgart = [2024-11-30 BRS-SSP, 2025-11-29 SVI-PFL]
    # labs tid 0011 (pos 0) → BRS-SSP, labs tid 0047 (pos 1) → SVI-PFL
    assert lookup["0011"] == ("BRS-SSP", "2024-11-30")
    assert lookup["0047"] == ("SVI-PFL", "2025-11-29")
    assert lookup["0015"] == ("BRS-SSP", "2025-01-18")


def test_lookup_resolves_worlds_by_city(tmp_path, monkeypatch):
    """Regression: the world-by-city → world-by-year mapping was iterating
    the dict with swapped variable names (yr,city instead of city,yr) so
    Anaheim never matched and 45 World Championships 2025 rows stayed in
    _unsorted after the 2026-05-25 backfill."""
    monkeypatch.setattr(labs, "_get_data_dir", lambda: str(tmp_path))
    cards = tmp_path / "tournament_cards_data_cards_SVI-BLK.csv"
    cards.write_text(
        "tournament_id;tournament_name;tournament_date\n"
        "1;World Championships 2025 – Limitless;15th August 2025\n"
    )
    lookup = labs._build_labs_name_meta_lookup([
        {"tournament_id": "0035", "tournament_name": "World Championship Anaheim"},
    ])
    assert lookup.get("0035") == ("SVI-BLK", "2025-08-15")


def test_derive_meta_combined_prefers_date_when_available(tmp_path, monkeypatch):
    """Date-based derivation wins over name-based when both are valid."""
    monkeypatch.setattr(labs, "_get_data_dir", lambda: str(tmp_path))
    # No cards CSVs → empty name lookup
    name_lookup = {}
    # Pretend manifest knows TEF-POR window
    monkeypatch.setattr(labs, "_META_DATE_LOOKUP", None)
    manifest = tmp_path / "tournament_cards_manifest.json"
    manifest.write_text(json.dumps({
        "chunk_dates": {
            "tournament_cards_data_cards_TEF-POR.csv": {
                "min_date": "2026-04-25", "max_date": "2026-05-16"
            }
        }
    }))
    meta, date = labs._derive_meta_for_labs_tournament(
        "0062", "Regional Championship Prague", "2026-04-25",
        name_lookup, current_meta="",
    )
    assert meta == "TEF-POR"
    assert date == "2026-04-25"


def test_derive_meta_combined_falls_back_to_name_lookup():
    """When date is empty, the name-based lookup is the second source."""
    name_lookup = {"0011": ("BRS-SSP", "2024-11-30")}
    meta, date = labs._derive_meta_for_labs_tournament(
        "0011", "Regional Championship Stuttgart", "",
        name_lookup, current_meta="CRI",
    )
    assert meta == "BRS-SSP"
    # The derived date is propagated when labs had none
    assert date == "2024-11-30"


def test_derive_meta_combined_empty_date_no_name_match_returns_empty():
    """When BOTH sources fail, return empty (→ _unsorted bucket).
    Falling back to current_meta here would silently bury failures —
    that's exactly the 2026-05-25 CRI-pollution bug we're guarding against."""
    name_lookup = {}
    meta, date = labs._derive_meta_for_labs_tournament(
        "9999", "Unknown Random Event", "",
        name_lookup, current_meta="CRI",
    )
    assert meta == ""
    assert date == ""


def test_derive_meta_combined_falls_back_to_current_meta_only_with_date():
    """If we have a date but no chunk window AND no name match, current_meta
    is acceptable (brand-new tournament whose meta is presumably current)."""
    name_lookup = {}
    meta, date = labs._derive_meta_for_labs_tournament(
        "0099", "Some Tournament", "2099-12-31",
        name_lookup, current_meta="CRI",
    )
    assert meta == "CRI"
    assert date == "2099-12-31"
