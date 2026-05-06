"""Unit tests for backend.scrapers.online_tournament_dated_scraper.

The scraper itself depends on network (Limitless) so we can't drive
the full pipeline in CI. These tests cover the parts that don't —
date parsing across both German and English formats, and the HTML
row-parser against synthetic BS4 trees. Together they cover the
non-network failure surface so a Limitless layout change shows up
as a failing test rather than silently empty output.
"""
from __future__ import annotations

from pathlib import Path

from bs4 import BeautifulSoup

from backend.scrapers.online_tournament_dated_scraper import (
    _extract_archetype_slugs_from_soup,
    _parse_date,
    _parse_history_row,
)

FIXTURE_DIR = Path(__file__).parent / "fixtures"


class TestParseDate:
    def test_german_numeric_long_month(self):
        assert _parse_date("02. Mai 2026") == "2026-05-02"
        assert _parse_date("25. April 2026") == "2026-04-25"
        assert _parse_date("01. Januar 2026") == "2026-01-01"
        assert _parse_date("31. Dezember 2025") == "2025-12-31"

    def test_german_numeric_short_month(self):
        assert _parse_date("02. Mai 2026") == "2026-05-02"
        assert _parse_date("15. Apr. 2026") == "2026-04-15"

    def test_english_ordinal(self):
        assert _parse_date("25th April 2026") == "2026-04-25"
        assert _parse_date("2nd May 2026") == "2026-05-02"
        assert _parse_date("1st January 2026") == "2026-01-01"
        assert _parse_date("3rd June 2025") == "2025-06-03"

    def test_iso_passthrough(self):
        assert _parse_date("2026-04-25") == "2026-04-25"
        assert _parse_date("2026-1-1") == "2026-01-01"

    def test_garbage_returns_none(self):
        assert _parse_date("") is None
        assert _parse_date(None) is None  # type: ignore[arg-type]
        assert _parse_date("not a date") is None
        assert _parse_date("yesterday") is None
        # Real February has only 28 days in a non-leap year
        assert _parse_date("31. Februar 2025") is None


class TestParseHistoryRow:
    def _parse(self, html: str):
        soup = BeautifulSoup(f"<table><tbody>{html}</tbody></table>", "lxml")
        return _parse_history_row(soup.find("tr"))

    def test_typical_row_with_german_date(self):
        # Mimics the user's screenshot — 6-column row.
        row = self._parse("""
            <tr>
              <td>angeellg098</td>
              <td><a href="/tournament/abc123">TOURNAMENT OF DOOM!</a></td>
              <td>02. Mai 2026</td>
              <td>1st of 374</td>
              <td>11 - 1 - 0</td>
              <td><a href="/decks/cynthia-garchomp-ex/dl-99">List</a></td>
            </tr>
        """)
        assert row is not None
        assert row["player"] == "angeellg098"
        assert row["tournament_id"] == "abc123"
        assert row["tournament_name"] == "TOURNAMENT OF DOOM!"
        assert row["tournament_date"] == "2026-05-02"
        assert row["tournament_date_raw"] == "02. Mai 2026"
        assert row["place"] == "1st of 374"
        assert row["score"] == "11 - 1 - 0"
        assert row["deck_slug_id"] == "cynthia-garchomp-ex/dl-99"
        assert "/decks/cynthia-garchomp-ex/dl-99" in row["list_url"]

    def test_data_time_converted_to_europe_berlin(self):
        # Limitless's data-time is a UTC ms-epoch; the visible date is
        # rendered client-side in the user's local timezone. We convert
        # to Europe/Berlin (CET/CEST with auto-DST) so the calendar
        # date we record matches what a German user reads.
        #
        # 1774998300000 ms = 2026-03-31 23:05 UTC = 2026-04-01 01:05 CEST
        # → display reads "01. April 2026" in DE locale, even though
        # pure-UTC parsing would say "2026-03-31".
        row = self._parse("""
            <tr>
              <td>Sdaomayo</td>
              <td><a href="/tournament/xyz789">Last Prize Season 2</a></td>
              <td><a class="date" data-time="1774998300000"></a></td>
              <td>1st of 178</td>
              <td>7 - 1 - 0</td>
              <td><a href="/decks/cynthia-garchomp-ex/dl-77">List</a></td>
            </tr>
        """)
        assert row is not None
        assert row["tournament_date"] == "2026-04-01"  # what DE user reads

    def test_data_time_pure_utc_midday_unaffected(self):
        # ms-epoch that's already mid-UTC-day stays the same calendar
        # date in Europe/Berlin too — the timezone shift only matters
        # near midnight. 1777680000000 ms = 2026-05-02 00:00 UTC →
        # 2026-05-02 02:00 CEST, same calendar day on both sides.
        row = self._parse("""
            <tr>
              <td>angeellg098</td>
              <td><a href="/tournament/abc123">TOURNAMENT OF DOOM!</a></td>
              <td><a class="date" data-time="1777680000000"></a></td>
              <td>1st of 374</td>
              <td>11 - 1 - 0</td>
              <td><a href="/decks/cynthia-garchomp-ex/dl-99">List</a></td>
            </tr>
        """)
        assert row is not None
        assert row["tournament_date"] == "2026-05-02"

    def test_text_fallback_when_no_data_time(self):
        # Pre-rendered visible text without a data-time attribute (= an
        # archived snapshot or a hand-curated row) still parses via the
        # text-format fallback. Exercises the legacy path so a future
        # regression in attribute handling doesn't silently drop these.
        row = self._parse("""
            <tr>
              <td>Vadelot</td>
              <td><a href="/tournament/asr-153">ASRcristiano #153</a></td>
              <td>16. April 2026</td>
              <td>1st of 143</td>
              <td>10 - 1 - 0</td>
              <td><a href="/decks/cynthia-garchomp-ex/dl-77">List</a></td>
            </tr>
        """)
        assert row is not None
        assert row["tournament_date"] == "2026-04-16"

    def test_english_ordinal_date(self):
        row = self._parse("""
            <tr>
              <td>Vadelot</td>
              <td><a href="/tournament/asr-153">ASRcristiano #153</a></td>
              <td>16th April 2026</td>
              <td>1st of 143</td>
              <td>10 - 1 - 0</td>
              <td><a href="/decks/cynthia-garchomp-ex/dl-77">List</a></td>
            </tr>
        """)
        assert row is not None
        assert row["tournament_date"] == "2026-04-16"

    def test_header_row_is_skipped(self):
        row = self._parse("""
            <tr>
              <th>Player</th>
              <th>Tournament</th>
              <th>Date</th>
              <th>Place</th>
              <th>Score</th>
              <th>List</th>
            </tr>
        """)
        assert row is None

    def test_row_without_tournament_or_deck_link_skipped(self):
        # No /tournament/ AND no /decks/ link → can't identify the row.
        row = self._parse("""
            <tr>
              <td>Player</td>
              <td>Some text</td>
              <td>02. Mai 2026</td>
              <td>1st of 100</td>
              <td>9 - 1 - 0</td>
              <td>—</td>
            </tr>
        """)
        assert row is None

    def test_short_row_returns_none(self):
        row = self._parse("<tr><td>only one cell</td></tr>")
        assert row is None

    def test_modern_limitless_markup(self):
        # Mid-2026 Limitless changed the per-deck URL pattern from
        # /decks/<slug>/<id> to /tournament/<tid>/player/<handle>/decklist
        # AND now puts a player-decklist anchor inside the player cell —
        # which means the FIRST /tournament/ anchor in document order
        # belongs to the player, not the tournament name. Without
        # filtering we'd end up with tournament_name=player-handle and
        # an empty list_url, both of which broke the live full update.
        row = self._parse("""
            <tr>
              <td>
                <a href="/tournament/abc123/player/calcal206/decklist">Cal Connor</a>
              </td>
              <td>
                <a href="/tournament/abc123">TOURNAMENT OF DOOM!</a>
              </td>
              <td><a class="date" data-time="1777680000000"></a></td>
              <td>1st of 390</td>
              <td>10 - 1 - 1</td>
              <td>
                <a href="/tournament/abc123/player/calcal206/decklist">List</a>
              </td>
            </tr>
        """)
        assert row is not None
        assert row["tournament_name"] == "TOURNAMENT OF DOOM!"
        assert row["tournament_id"] == "abc123"
        assert row["player"] == "Cal Connor"
        assert row["deck_slug_id"] == "player/calcal206"
        assert "/tournament/abc123/player/calcal206/decklist" in row["list_url"]


class TestExtractArchetypeSlugs:
    """Fixture-based regression test for the /decks listing-page parser.
    The fixture is a real captured snippet of the table from
    play.limitlesstcg.com/decks (mid-2026 markup) — if Limitless changes
    the listing structure (e.g. wraps slugs in /decks/PTCG/<slug>) this
    test will fail loudly instead of letting a Full Update silently
    process zero archetypes."""

    def test_extracts_six_archetypes_from_fixture(self):
        html = (FIXTURE_DIR / "limitless_decks_listing_2026_05.html").read_text(encoding="utf-8")
        soup = BeautifulSoup(html, "lxml")
        slugs = _extract_archetype_slugs_from_soup(soup)

        # Fixture contains 6 archetype rows + header. Each row has the
        # archetype-name anchor AND a matchups anchor; the parser must
        # dedupe on slug and skip the /matchups variants.
        expected = [
            "dragapult-ex",
            "lucario-hariyama",
            "dragapult-blaziken",
            "alakazam-dudunsparce",
            "n-zoroark",
            "dragapult-dusknoir",
        ]
        assert slugs == expected, f"expected {expected}, got {slugs}"

    def test_rejects_matchups_links(self):
        # Hand-rolled minimal table: same archetype shows up as both a
        # name-link and a /matchups link. Only the bare slug should be
        # returned.
        html = """
        <table>
          <tr>
            <td><a href="/decks/dragapult-ex?format=standard">Dragapult</a></td>
            <td><a href="/decks/dragapult-ex/matchups?format=standard">52.46%</a></td>
          </tr>
        </table>
        """
        soup = BeautifulSoup(html, "lxml")
        assert _extract_archetype_slugs_from_soup(soup) == ["dragapult-ex"]

    def test_returns_empty_on_unrecognized_markup(self):
        # Limitless changing the table to a `/build/<slug>` URL pattern
        # (hypothetical) means our parser should return [] rather than
        # crash, so the caller logs an error and we don't silently keep
        # a stale list.
        html = """
        <table>
          <tr><td><a href="/build/dragapult-ex">Dragapult</a></td></tr>
        </table>
        """
        soup = BeautifulSoup(html, "lxml")
        assert _extract_archetype_slugs_from_soup(soup) == []

    def test_preserves_order_of_first_occurrence(self):
        html = """
        <table>
          <tr><td><a href="/decks/lucario-hariyama">L</a></td></tr>
          <tr><td><a href="/decks/dragapult-ex">D</a></td></tr>
          <tr><td><a href="/decks/lucario-hariyama">L-dup</a></td></tr>
          <tr><td><a href="/decks/n-zoroark">Z</a></td></tr>
        </table>
        """
        soup = BeautifulSoup(html, "lxml")
        assert _extract_archetype_slugs_from_soup(soup) == [
            "lucario-hariyama", "dragapult-ex", "n-zoroark"
        ]


