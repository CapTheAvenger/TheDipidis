"""Tests for scripts/reconcile_tournament_coverage.py."""

import json
import os
import sys
from datetime import datetime, timedelta

import pytest

sys.path.insert(
    0,
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "scripts")),
)

import reconcile_tournament_coverage as rec  # noqa: E402


def _write_format_window(data_dir, current="CRI", oldest="TEF"):
    with open(os.path.join(data_dir, "format_window.json"), "w", encoding="utf-8") as fh:
        json.dump({"current_set": current, "oldest_legal_set": oldest}, fh)


def _write_labs(data_dir, fmt, rows):
    # labs files are COMMA-delimited
    path = os.path.join(data_dir, f"labs_tournament_decks_{fmt}.csv")
    with open(path, "w", encoding="utf-8", newline="") as fh:
        fh.write("tournament_id,tournament_name,tournament_date,total_players,deck_name\n")
        for tid, name, date, players in rows:
            fh.write(f"{tid},{name},{date},{players},SomeDeck\n")


def _write_cards(data_dir, fmt, rows):
    # cards files are SEMICOLON-delimited
    path = os.path.join(data_dir, f"tournament_cards_data_cards_{fmt}.csv")
    with open(path, "w", encoding="utf-8", newline="") as fh:
        fh.write("tournament_id;tournament_name;meta;tournament_date;archetype\n")
        for tid, name, date in rows:
            fh.write(f"{tid};{name};{fmt};{date};SomeArch\n")


def _days_ago_iso(n):
    return (datetime.utcnow() - timedelta(days=n)).strftime("%Y-%m-%d")


def test_missing_major_is_flagged(tmp_path):
    d = str(tmp_path)
    _write_format_window(d)
    old = _days_ago_iso(10)
    _write_labs(d, "TEF-CRI", [("0070", "International Championship New Orleans", old, "3743")])
    _write_cards(d, "TEF-CRI", [])  # cards file present but empty
    gaps = rec.find_coverage_gaps(d, grace_days=3)
    assert len(gaps) == 1
    assert "New Orleans" in gaps[0]


def test_present_major_with_different_name_matches(tmp_path):
    # labs "Special Event Turin" vs cards "Special Event Turin – Limitless",
    # same date → must reconcile (no gap) despite the name suffix.
    d = str(tmp_path)
    _write_format_window(d)
    old = _days_ago_iso(10)
    _write_labs(d, "TEF-CRI", [("0069", "Special Event Turin", old, "2032")])
    _write_cards(d, "TEF-CRI", [("540", "Special Event Turin – Limitless", old)])
    assert rec.find_coverage_gaps(d, grace_days=3) == []


def test_fresh_major_within_grace_is_not_flagged(tmp_path):
    d = str(tmp_path)
    _write_format_window(d)
    fresh = _days_ago_iso(1)
    _write_labs(d, "TEF-CRI", [("0071", "Regional Somewhere", fresh, "900")])
    _write_cards(d, "TEF-CRI", [])
    assert rec.find_coverage_gaps(d, grace_days=3) == []


def test_small_event_is_ignored(tmp_path):
    d = str(tmp_path)
    _write_format_window(d)
    old = _days_ago_iso(10)
    _write_labs(d, "TEF-CRI", [("0072", "Tiny Locals", old, "40")])
    _write_cards(d, "TEF-CRI", [])
    assert rec.find_coverage_gaps(d, grace_days=3) == []


def test_no_labs_file_reports_not_checked(tmp_path):
    # No labs file at all → the script must say NOT CHECKED, not "OK".
    # It used to return [] here, which main() printed as "OK (no gaps)"
    # while examining zero tournaments — a green check that measured nothing.
    d = str(tmp_path)
    _write_format_window(d)
    with pytest.raises(rec.NotChecked):
        rec.find_coverage_gaps(d, grace_days=3)


def test_falls_back_to_previous_format_when_current_has_no_files(tmp_path):
    # The two weeks between a set's release and its in-person legality are
    # the normal state, and the check must stay useful through them.
    d = str(tmp_path)
    _write_format_window(d, current="PBL", oldest="TEF")   # no TEF-PBL files
    old = _days_ago_iso(10)
    _write_labs(d, "TEF-CRI", [("0070", "International Championship New Orleans", old, "3743")])
    _write_cards(d, "TEF-CRI", [])
    checked, gaps = rec.find_coverage_gaps_detailed(d, grace_days=3)
    assert checked == "TEF-CRI"
    assert len(gaps) == 1
    assert "New Orleans" in gaps[0]


def test_regional_name_divergence_is_not_a_false_gap(tmp_path):
    # labs "Regional Championship Merida" vs cards "Regional Merida - Limitless".
    # Neither string contains the other, which is why the old flat-substring
    # test flagged 58 of 58 real majors as gaps.
    d = str(tmp_path)
    _write_format_window(d)
    old = _days_ago_iso(10)
    _write_labs(d, "TEF-CRI", [("0065", "Regional Championship Merida", old, "800")])
    _write_cards(d, "TEF-CRI", [("530", "Regional Merida - Limitless", old)])
    assert rec.find_coverage_gaps(d, grace_days=3) == []


def test_acronym_rename_is_not_a_false_gap(tmp_path):
    # labs "International Championship New Orleans" vs cards "NAIC 2026, New
    # Orleans - Limitless": no shared substring at all, only shared city tokens.
    d = str(tmp_path)
    _write_format_window(d)
    old = _days_ago_iso(10)
    _write_labs(d, "TEF-CRI", [("0070", "International Championship New Orleans", old, "3743")])
    _write_cards(d, "TEF-CRI", [("518", "NAIC 2026, New Orleans - Limitless", old)])
    assert rec.find_coverage_gaps(d, grace_days=3) == []


def test_locale_spelling_divergence_is_not_a_false_gap(tmp_path):
    # labs "Seville" vs cards "Sevilla" — same date, near-identical spelling.
    d = str(tmp_path)
    _write_format_window(d)
    old = _days_ago_iso(10)
    _write_labs(d, "TEF-CRI", [("0059", "Special Event Seville", old, "600")])
    _write_cards(d, "TEF-CRI", [("533", "Special Event Sevilla - Limitless", old)])
    assert rec.find_coverage_gaps(d, grace_days=3) == []


def test_different_city_same_day_is_still_a_gap(tmp_path):
    # The matcher must not degenerate into "same date = matched": two majors
    # on one weekend are common, and a missing one still has to be caught.
    d = str(tmp_path)
    _write_format_window(d)
    old = _days_ago_iso(10)
    _write_labs(d, "TEF-CRI", [("0066", "Regional Championship Melbourne", old, "900")])
    _write_cards(d, "TEF-CRI", [("536", "Regional Lima - Limitless", old)])
    gaps = rec.find_coverage_gaps(d, grace_days=3)
    assert len(gaps) == 1
    assert "Melbourne" in gaps[0]


def test_ordinal_date_matches_iso_date(tmp_path):
    # labs ISO date vs cards ordinal date, same day, same event → match.
    d = str(tmp_path)
    _write_format_window(d)
    iso = _days_ago_iso(10)
    ordinal = datetime.strptime(iso, "%Y-%m-%d").strftime("%-d{} %B %Y")
    # build an ordinal like "6th June 2026"
    day = datetime.strptime(iso, "%Y-%m-%d").day
    suffix = "th" if 11 <= day % 100 <= 13 else {1: "st", 2: "nd", 3: "rd"}.get(day % 10, "th")
    ordinal = datetime.strptime(iso, "%Y-%m-%d").strftime(f"{day}{suffix} %B %Y")
    _write_labs(d, "TEF-CRI", [("0069", "Special Event Turin", iso, "2032")])
    _write_cards(d, "TEF-CRI", [("540", "Special Event Turin", ordinal)])
    assert rec.find_coverage_gaps(d, grace_days=3) == []
