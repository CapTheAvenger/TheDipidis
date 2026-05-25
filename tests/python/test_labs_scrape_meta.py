"""Tests for the strengthened scrape_tournament_meta date extractor.

Regression for the 2026-05-25 backfill bug — the old single-regex
parser only matched full-name months in the first 1500 chars of body
text. For ~60 historical labs tournaments (Limitless archive layout
varies) the regex missed and the rows fell through to current_meta,
polluting the CRI chunk with 3859 misattributed rows.

These tests exercise _extract_meta_from_soup against synthetic HTML
covering the layout variations we care about.
"""

import os
import sys

import pytest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(REPO_ROOT, "backend", "scrapers"))
sys.path.insert(0, os.path.join(REPO_ROOT, "backend", "core"))

bs4 = pytest.importorskip("bs4")
labs = pytest.importorskip("labs_tournament_scraper")


def _soup(html: str):
    return bs4.BeautifulSoup(html, "lxml")


def test_extracts_full_month_with_range():
    """Modern layout: '<div>April 25–26, 2026 • 1370 players</div>'."""
    out = {}
    labs._extract_meta_from_soup(_soup(
        "<html><head><title>Decks: Regional Championship Prague – Limitless Labs</title></head>"
        "<body><h1>Regional Championship Prague</h1>"
        "<div>April 25–26, 2026 • 1370 players</div></body></html>"
    ), out)
    assert out["tournament_name"] == "Regional Championship Prague"
    assert out["tournament_date"] == "2026-04-25"


def test_extracts_abbreviated_month():
    """Old layout some archive pages use: 'Apr 5, 2024'."""
    out = {}
    labs._extract_meta_from_soup(_soup(
        "<html><body><h1>Some Old Tournament</h1>"
        "<span>Apr 5, 2024</span></body></html>"
    ), out)
    assert out["tournament_date"] == "2024-04-05"


def test_extracts_when_date_sits_with_other_text_in_same_node():
    """Inline header: 'Held on June 7, 2024 in Birmingham'.

    The first pass (NavigableString walk + _parse_date(whole-string))
    fails because _parse_date is strict. The second pass (regex over
    body text) catches it."""
    out = {}
    labs._extract_meta_from_soup(_soup(
        "<html><body>Held on June 7, 2024 in Birmingham</body></html>"
    ), out)
    assert out["tournament_date"] == "2024-06-07"


def test_extracts_iso_date_when_only_format_available():
    """Some archive pages render the start date in ISO form (e.g. as
    a footer or sidebar 'Started: 2024-12-01' line). The body-text
    fallback should catch it."""
    out = {}
    labs._extract_meta_from_soup(_soup(
        "<html><body><div>Started: 2024-12-01</div></body></html>"
    ), out)
    assert out["tournament_date"] == "2024-12-01"


def test_empty_html_returns_no_date():
    """No date anywhere → tournament_date is never set (caller defaults
    to empty string, which routes the rows to _unsorted bucket)."""
    out = {}
    labs._extract_meta_from_soup(_soup(
        "<html><body><h1>Some Event</h1></body></html>"
    ), out)
    assert out.get("tournament_date") is None or out["tournament_date"] == ""


def test_name_from_h1_overrides_title():
    """H1 is the cleanest source — it wins even when title is set first."""
    out = {}
    labs._extract_meta_from_soup(_soup(
        "<html><head><title>Decks: Old Event Name – Limitless Labs</title></head>"
        "<body><h1>Regional Championship Stuttgart</h1></body></html>"
    ), out)
    assert out["tournament_name"] == "Regional Championship Stuttgart"


def test_already_set_date_is_not_overwritten():
    """Caller can prime `out` with values from /decks; /standings call
    should not stomp them."""
    out = {"tournament_date": "2024-06-07"}
    labs._extract_meta_from_soup(_soup(
        "<html><body><span>July 15, 2025</span></body></html>"
    ), out)
    assert out["tournament_date"] == "2024-06-07"


def test_full_month_in_navigablestring_is_preferred_over_body_regex():
    """When both passes would hit, the NavigableString walk should win
    because it sees the date in isolation (less ambiguity)."""
    out = {}
    labs._extract_meta_from_soup(_soup(
        "<html><body>"
        "<div>March 15, 2025</div>"
        "<p>This event happened on November 22, 2024 in Vegas.</p>"
        "</body></html>"
    ), out)
    # NavigableString walk hits "March 15, 2025" first
    assert out["tournament_date"] == "2025-03-15"
