"""Tests for the labs.limitlesstcg.com /standings parser.

The parser feeds the Underdog-Champion-Boost predictor (Predictor 4.6
in app-meta-call.js): it pulls Top-1 / Top-4 / Top-8 finish counts per
deck so the engine can tell "this deck WON a regional at 2.6 % usage"
apart from "this deck has a high aggregate win rate." The Campinas
2026 → Indianapolis surge is the textbook case the predictor exists
for, so the fixture mirrors that shape.
"""

import os
import sys

import pytest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(REPO_ROOT, "backend", "scrapers"))
sys.path.insert(0, os.path.join(REPO_ROOT, "backend", "core"))

bs4 = pytest.importorskip("bs4")
labs_scraper = pytest.importorskip("labs_tournament_scraper")


# Synthetic fixture: Place | Player | Country | Deck | Record
# Mimics the live /standings layout. The fixture intentionally
# includes a Top-1 from an underdog deck, three copies of a Top-4
# mainstream deck, and a non-link row to verify defensiveness.
FIXTURE_HTML = """
<html><body>
<table class="data-table">
  <thead>
    <tr><th>Place</th><th>Player</th><th>Country</th><th>Deck</th><th>Record</th></tr>
  </thead>
  <tbody>
    <tr><td>1</td><td>Matías Matricardi</td><td>AR</td>
        <td><a href="/2156/decks/ogerpon-meganium-hydrapple">Ogerpon Meganium</a></td>
        <td>9-1-2</td></tr>
    <tr><td>2</td><td>Player B</td><td>US</td>
        <td><a href="/2156/decks/dragapult-ex">Dragapult ex</a></td>
        <td>8-1-3</td></tr>
    <tr><td>3</td><td>Player C</td><td>BR</td>
        <td><a href="/2156/decks/dragapult-ex">Dragapult ex</a></td>
        <td>8-2-2</td></tr>
    <tr><td>4</td><td>Player D</td><td>CA</td>
        <td><a href="/2156/decks/raging-bolt-ex">Raging Bolt ex</a></td>
        <td>8-2-2</td></tr>
    <tr><td>5</td><td>Player E</td><td>FR</td>
        <td><a href="/2156/decks/n-zoroark">N's Zoroark</a></td>
        <td>7-2-3</td></tr>
    <tr><td>6</td><td>Player F</td><td>DE</td>
        <td><a href="/2156/decks/dragapult-ex">Dragapult ex</a></td>
        <td>7-2-3</td></tr>
    <tr><td>7</td><td>Player G</td><td>IT</td>
        <td><a href="/2156/decks/ogerpon-meganium-hydrapple">Ogerpon Meganium</a></td>
        <td>7-2-3</td></tr>
    <tr><td>8</td><td>Player H</td><td>UK</td>
        <td><a href="/2156/decks/alakazam-dudunsparce">Alakazam Dudunsparce</a></td>
        <td>7-2-3</td></tr>
    <tr><td>9</td><td>Player I</td><td>ES</td>
        <td><a href="/2156/decks/n-zoroark">N's Zoroark</a></td>
        <td>7-3-2</td></tr>
    <tr><td>10</td><td>Player J</td><td>NL</td>
        <td>no deck link here</td>
        <td>7-3-2</td></tr>
  </tbody>
</table>
</body></html>
"""


@pytest.fixture
def mock_fetch(monkeypatch):
    """Replace labs_tournament_scraper.fetch_page_bs4 with a fixture loader."""
    def _fake_fetch(url, **kwargs):
        return bs4.BeautifulSoup(FIXTURE_HTML, "lxml")
    monkeypatch.setattr(labs_scraper, "fetch_page_bs4", _fake_fetch)


def test_standings_top1_assigned_to_winner_deck(mock_fetch):
    """Top-1 finish is the strongest signal — must land on the actual winner."""
    out = labs_scraper.scrape_tournament_standings("2156")
    assert "ogerpon-meganium-hydrapple" in out
    assert out["ogerpon-meganium-hydrapple"]["top1_count"] == 1


def test_standings_top4_sums_copies_in_top_4(mock_fetch):
    """Two Dragapult copies in places 2+3 = top4_count 2. Ogerpon won (1), no other top-4."""
    out = labs_scraper.scrape_tournament_standings("2156")
    assert out["dragapult-ex"]["top4_count"] == 2
    assert out["ogerpon-meganium-hydrapple"]["top4_count"] == 1
    assert out["raging-bolt-ex"]["top4_count"] == 1


def test_standings_top8_sums_copies_in_top_8(mock_fetch):
    """Three Dragapult copies in places 2,3,6 = top8_count 3. Ogerpon 1+7 = 2."""
    out = labs_scraper.scrape_tournament_standings("2156")
    assert out["dragapult-ex"]["top8_count"] == 3
    assert out["ogerpon-meganium-hydrapple"]["top8_count"] == 2
    assert out["n-zoroark"]["top8_count"] == 1
    assert out["alakazam-dudunsparce"]["top8_count"] == 1


def test_standings_default_top_n_is_8(mock_fetch):
    """Default cuts at 8 — place-9 N's Zoroark must NOT be counted."""
    out = labs_scraper.scrape_tournament_standings("2156")
    # Place 5 = 1× N's Zoroark, place 9 should be excluded.
    assert out["n-zoroark"]["top8_count"] == 1


def test_standings_top_n_can_be_widened(mock_fetch):
    """Caller can ask for Top-16 if they want broader signal."""
    out = labs_scraper.scrape_tournament_standings("2156", top_n=16)
    # With top_n=16, place 9 (N's Zoroark) joins, but bucket counts
    # respect the actual top1/top4/top8 thresholds — those stay
    # capped at <=1, <=4, <=8 respectively.
    assert out["n-zoroark"]["top8_count"] == 1  # place 5 only
    assert out["n-zoroark"]["top4_count"] == 0


def test_standings_skips_rows_without_deck_link(mock_fetch):
    """Place 10 row has no deck-profile <a> — must be silently skipped."""
    out = labs_scraper.scrape_tournament_standings("2156", top_n=10)
    # Place 10 had no link; no phantom bucket should appear.
    slugs = set(out.keys())
    assert "no deck link here" not in slugs


def test_standings_empty_on_fetch_failure(monkeypatch):
    """Network fail → empty dict, never raises."""
    monkeypatch.setattr(labs_scraper, "fetch_page_bs4", lambda url, **kw: None)
    assert labs_scraper.scrape_tournament_standings("9999") == {}


def test_standings_empty_on_missing_table(monkeypatch):
    """Page loads but no data-table → empty dict."""
    monkeypatch.setattr(
        labs_scraper, "fetch_page_bs4",
        lambda url, **kw: bs4.BeautifulSoup("<html><body>empty</body></html>", "lxml"),
    )
    assert labs_scraper.scrape_tournament_standings("9999") == {}


def test_standings_finds_hash_header_variant(monkeypatch):
    """Labs has used '#' instead of 'Place' historically — parser must accept either."""
    html = FIXTURE_HTML.replace("<th>Place</th>", "<th>#</th>")
    monkeypatch.setattr(
        labs_scraper, "fetch_page_bs4",
        lambda url, **kw: bs4.BeautifulSoup(html, "lxml"),
    )
    out = labs_scraper.scrape_tournament_standings("2156")
    assert out["ogerpon-meganium-hydrapple"]["top1_count"] == 1
