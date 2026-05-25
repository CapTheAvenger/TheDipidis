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


def test_lookup_matches_cached_historical_tids(tmp_path, monkeypatch):
    """Regression: the normal weekly run only sees 5 live-index
    tournaments, but the cached monolith holds 60+ historical tids. The
    lookup input must include both — otherwise the _unsorted re-classify
    pass can't match anything (observed in the 2026-05-25 13:46 UTC run:
    'matched 5/5' instead of 'matched 63/66', 4072 rows stuck unsorted).

    Test mirrors the production flow: build a lookup from a small live
    list + a larger cached set, verify ALL tids resolve."""
    monkeypatch.setattr(labs, "_get_data_dir", lambda: str(tmp_path))
    cards = tmp_path / "tournament_cards_data_cards_BRS-SSP.csv"
    cards.write_text(
        "tournament_id;tournament_name;tournament_date\n"
        "1;Regional Stuttgart – Limitless;30th November 2024\n"
        "2;Regional Toronto – Limitless;12th December 2024\n"
    )
    cards2 = tmp_path / "tournament_cards_data_cards_TEF-POR.csv"
    cards2.write_text(
        "tournament_id;tournament_name;tournament_date\n"
        "10;Regional Prague – Limitless;25th April 2026\n"
    )
    live_only = [
        {"tournament_id": "0062", "tournament_name": "Regional Championship Prague"},
    ]
    cached_only = [
        {"tournament_id": "0011", "tournament_name": "Regional Championship Stuttgart"},
        {"tournament_id": "0014", "tournament_name": "Regional Championship Toronto"},
    ]
    # Buggy behaviour (pre-fix): live_only alone → historical tids miss
    bug_lookup = labs._build_labs_name_meta_lookup(live_only)
    assert "0011" not in bug_lookup
    assert "0014" not in bug_lookup
    # Fixed behaviour: combined list → all three resolve
    combined = live_only + cached_only
    fix_lookup = labs._build_labs_name_meta_lookup(combined)
    assert fix_lookup["0011"] == ("BRS-SSP", "2024-11-30")
    assert fix_lookup["0014"] == ("BRS-SSP", "2024-12-12")
    assert fix_lookup["0062"] == ("TEF-POR", "2026-04-25")


def test_lookup_disambiguates_via_chronological_neighbors(tmp_path, monkeypatch):
    """Regression: labs has 2 same-named tids but cards has only 1
    post-founding match. Old single-pass algo always picked labs[0] →
    cards[0], misassigning the older labs tid when its true date didn't
    match the cards entry's date. The 2-pass algo uses chronological
    neighbors to pick which labs tid actually fits the cards date.

    Scenario mirrors the real 2026-05-25 San Juan bug:
      • Labs 0019 (chronologically Feb 2025, sandwiched between
        Feb-2025 BRS-PRE events at 0018 + 0020).
      • Labs 0056 (chronologically Mar 2026, between SVI-PFL 0055
        and SVI-ASC 0057).
      • Cards has only one San Juan entry: SVI-ASC March 2026.
    Expected: 0056 → SVI-ASC, 0019 → unmatched."""
    monkeypatch.setattr(labs, "_get_data_dir", lambda: str(tmp_path))

    # Surrounding tournaments with unambiguous matches (Pass 1 anchors)
    (tmp_path / "tournament_cards_data_cards_BRS-PRE.csv").write_text(
        "tournament_id;tournament_name;tournament_date\n"
        "100;Regional Mérida – Limitless;8th February 2025\n"
        "101;EUIC 2025, London – Limitless;21st February 2025\n"
    )
    (tmp_path / "tournament_cards_data_cards_SVI-PFL.csv").write_text(
        "tournament_id;tournament_name;tournament_date\n"
        "200;Regional Seattle – Limitless;28th February 2026\n"
    )
    (tmp_path / "tournament_cards_data_cards_SVI-ASC.csv").write_text(
        "tournament_id;tournament_name;tournament_date\n"
        "300;Special Event San Juan – Limitless;7th March 2026\n"
        "301;Regional Curitiba – Limitless;14th March 2026\n"
    )

    labs_list = [
        {"tournament_id": "0018", "tournament_name": "Regional Championship Mérida"},
        {"tournament_id": "0019", "tournament_name": "Special Event San Juan"},
        {"tournament_id": "0020", "tournament_name": "International Championship London"},
        {"tournament_id": "0055", "tournament_name": "Regional Championship Seattle"},
        {"tournament_id": "0056", "tournament_name": "Special Event San Juan"},
        {"tournament_id": "0057", "tournament_name": "Regional Championship Curitiba"},
    ]
    lookup = labs._build_labs_name_meta_lookup(labs_list)

    # Pass-1 anchors resolve normally
    assert lookup["0018"] == ("BRS-PRE", "2025-02-08")
    assert lookup["0020"] == ("BRS-PRE", "2025-02-21")
    assert lookup["0055"] == ("SVI-PFL", "2026-02-28")
    assert lookup["0057"] == ("SVI-ASC", "2026-03-14")
    # Pass-2 picks the right San Juan
    assert lookup["0056"] == ("SVI-ASC", "2026-03-07")
    # 0019's neighbors (Feb 2025) don't bracket cards' Mar 2026 entry → unmatched
    assert "0019" not in lookup


def test_lookup_no_double_assignment_to_same_cards_entry(tmp_path, monkeypatch):
    """Pass 1's consumed-index tracking + Pass 2's `taken` filter must
    prevent two labs tids from claiming the same cards entry."""
    monkeypatch.setattr(labs, "_get_data_dir", lambda: str(tmp_path))
    (tmp_path / "tournament_cards_data_cards_BRS-SSP.csv").write_text(
        "tournament_id;tournament_name;tournament_date\n"
        "1;Regional Stuttgart – Limitless;30th November 2024\n"
    )
    # Two same-named labs tids but only one cards slot. Pass 1 marks both
    # ambig; Pass 2 picks the closer one and leaves the other unmatched.
    labs_list = [
        # Anchor: Nov 2024 neighbor for 0011
        {"tournament_id": "0010", "tournament_name": "Regional Championship Sacramento"},
        {"tournament_id": "0011", "tournament_name": "Regional Championship Stuttgart"},
        {"tournament_id": "0047", "tournament_name": "Regional Championship Stuttgart"},
    ]
    (tmp_path / "tournament_cards_data_cards_BRS-SSP.csv").write_text(
        "tournament_id;tournament_name;tournament_date\n"
        "1;Regional Stuttgart – Limitless;30th November 2024\n"
        "2;Regional Sacramento – Limitless;23rd November 2024\n"
    )
    lookup = labs._build_labs_name_meta_lookup(labs_list)
    # 0010 anchors Nov 2024
    assert lookup["0010"] == ("BRS-SSP", "2024-11-23")
    # 0011 (Pass 2 with 0010 as neighbor) gets the only Stuttgart
    assert lookup["0011"] == ("BRS-SSP", "2024-11-30")
    # 0047 has no anchor "before" closer than 0010-0011; no Pass-1 anchor
    # "after" either in this minimal scenario, so it doesn't have a date
    # range to bracket — and the only cards Stuttgart is consumed.
    assert "0047" not in lookup


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
