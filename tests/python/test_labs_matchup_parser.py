"""Tests for the labs.limitlesstcg.com per-archetype matchup parser.

The parser was built defensively from screenshots — the live HTML
hasn't been fetched from the sandbox env (Cloudflare 403 confirmed).
These tests run against a synthetic fixture matching the structure
visible in the user's 2026-05-24 screenshots. First real-scrape run
is the validation step; if the live HTML diverges, defensive
selectors should still parse + we tighten the fixture afterwards.
"""

import os
import sys
import pytest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(REPO_ROOT, "backend", "scrapers"))
sys.path.insert(0, os.path.join(REPO_ROOT, "backend", "core"))

bs4 = pytest.importorskip("bs4")
labs_scraper = pytest.importorskip("labs_tournament_scraper")

FIXTURE_PATH = os.path.join(REPO_ROOT, "tests", "python", "fixtures",
                            "labs_archetype_matchup_dragapult.html")


@pytest.fixture(scope="module")
def soup():
    assert os.path.isfile(FIXTURE_PATH), f"Fixture missing: {FIXTURE_PATH}"
    with open(FIXTURE_PATH, encoding="utf-8") as f:
        return bs4.BeautifulSoup(f.read(), "lxml")


def test_player_summary_parses_screenshot_numbers(soup):
    """Header: 738 players: 2891 wins - 2447 losses - 1004 ties (50.86% WR)"""
    summary = labs_scraper._parse_player_summary(soup)
    assert summary["player_count"] == 738
    assert summary["total_wins"] == 2891
    assert summary["total_losses"] == 2447
    assert summary["total_ties"] == 1004
    assert abs(summary["overall_win_pct"] - 50.86) < 0.01


def test_player_summary_handles_missing_soup():
    assert labs_scraper._parse_player_summary(None) == {
        "player_count": 0,
        "total_wins": 0,
        "total_losses": 0,
        "total_ties": 0,
        "overall_win_pct": 0.0,
    }


def _parse_matchup_table(html_str):
    """Helper that injects the synthetic HTML and returns the parser
    output without the fetch step."""
    s = bs4.BeautifulSoup(html_str, "lxml")
    summary = labs_scraper._parse_player_summary(s)
    # Mirror the body of scrape_archetype_matchups starting from the
    # `table = soup.find(...)` line — we need to test the parsing
    # logic, not the HTTP fetch.
    table = s.find("table", attrs={"class": "data-table"})
    if not table:
        return {"summary": summary, "matchups": [], "day_filter": "overall"}
    rows = []
    for row in table.select("tbody tr"):
        cells = row.find_all("td")
        if len(cells) < 3:
            continue
        link = None
        name_idx = None
        for idx, c in enumerate(cells):
            a = c.find("a")
            if a and a.get("href"):
                link = a
                name_idx = idx
                break
        if not link:
            continue
        opp_name = link.get_text(strip=True)
        opp_slug = link.get("href", "").rsplit("/", 1)[-1].split("?")[0]
        trailing = cells[name_idx + 1:]
        count_val = 0
        win_pct_val = 0.0
        for c in trailing:
            txt = c.get_text(strip=True)
            if "%" in txt and win_pct_val == 0.0:
                try:
                    win_pct_val = round(float(txt.replace("%", "").replace(",", ".").strip()), 4)
                except ValueError:
                    pass
            elif txt and count_val == 0 and "%" not in txt:
                count_val = labs_scraper._parse_int_count(txt)
        if count_val <= 0 and win_pct_val == 0.0:
            continue
        rows.append({
            "opponent_slug": opp_slug,
            "opponent_name": opp_name,
            "vs_count": count_val,
            "vs_win_pct": win_pct_val,
        })
    return {"summary": summary, "matchups": rows, "day_filter": "overall"}


@pytest.fixture(scope="module")
def parsed(soup):
    with open(FIXTURE_PATH, encoding="utf-8") as f:
        return _parse_matchup_table(f.read())


def test_matchup_row_count(parsed):
    """Fixture has 6 opponent rows."""
    assert len(parsed["matchups"]) == 6


def test_first_matchup_is_dragapult_dusknoir(parsed):
    """Top row matches the screenshot's 456 / 58.92%."""
    first = parsed["matchups"][0]
    assert first["opponent_name"] == "Dragapult Dusknoir"
    assert first["opponent_slug"] == "dragapult-dusknoir"
    assert first["vs_count"] == 456
    assert abs(first["vs_win_pct"] - 58.92) < 0.01


def test_all_matchups_have_required_fields(parsed):
    for m in parsed["matchups"]:
        assert m["opponent_name"], "opponent_name must be non-empty"
        assert m["opponent_slug"], "opponent_slug must be non-empty"
        assert m["vs_count"] > 0, f"{m['opponent_name']} has zero count"
        assert 0.0 <= m["vs_win_pct"] <= 100.0, f"{m['opponent_name']} win % out of range"


def test_lucario_hariyama_matchup_data(parsed):
    """Sanity check on a non-Dragapult opponent row."""
    luc = next((m for m in parsed["matchups"] if m["opponent_slug"] == "lucario-hariyama"), None)
    assert luc is not None
    assert luc["vs_count"] == 238
    assert abs(luc["vs_win_pct"] - 55.18) < 0.01


def test_build_matchup_rows_produces_full_csv_shape():
    """End-to-end: meta + slug + matchups_result → CSV-ready rows.

    Schema shifted with the 2026-05-25 URL fix: matchups are now keyed by
    (meta, deck_slug) — aggregated across all tournaments_used by the
    labs combined view — instead of per-(tid, slug). The row carries
    `tournaments_used` (provenance) + `tournament_count` (convenience)
    instead of the old per-tournament fields."""
    matchups_result = {
        "summary": {
            "player_count": 1598,
            "total_wins": 5417,
            "total_losses": 5534,
            "total_ties": 1802,
            "overall_win_pct": 47.19,
        },
        "matchups": [
            {"opponent_slug": "ns-zoroark", "opponent_name": "N's Zoroark",
             "vs_count": 1224, "vs_win_pct": 42.84},
        ],
        "day_filter": "overall",
        "tournaments_used": ["56", "57", "58", "59", "60", "61"],
    }
    rows = labs_scraper.build_matchup_rows(
        "SVI-ASC", "dragapult-dusknoir", "Dragapult Dusknoir", matchups_result,
    )
    assert len(rows) == 1
    r = rows[0]
    # All CSV header fields except `scraped_at` (which is timestamp-derived)
    # should be present on the row.
    assert set(r.keys()) >= set(labs_scraper.MATCHUP_CSV_HEADER) - {"scraped_at"}
    assert r["meta"] == "SVI-ASC"
    assert r["tournaments_used"] == "56,57,58,59,60,61"
    assert r["tournament_count"] == 6
    assert r["my_deck_slug"] == "dragapult-dusknoir"
    assert r["my_deck_name"] == "Dragapult Dusknoir"
    assert r["my_deck_player_count"] == 1598
    assert r["opponent_deck_slug"] == "ns-zoroark"
    assert r["opponent_deck_name"] == "N's Zoroark"
    assert r["vs_count"] == 1224
    assert abs(r["vs_win_pct"] - 42.84) < 0.01
    assert r["day_filter"] == "overall"


def test_scrape_archetype_matchups_url_format(monkeypatch):
    """Regression: the URL pattern must be
    `/decks/{slug}?tournaments={unpadded_tids_csv}` (the combined-view
    page), NOT the old `/{tid}/decks/{slug}` (which returns players, not
    matchups — see PR #205). Tids must be unpadded ints, sorted."""
    captured_url = {}

    def fake_fetch(url):
        captured_url["url"] = url
        return None  # short-circuit — we just want the URL build

    monkeypatch.setattr(labs_scraper, "fetch_page_bs4", fake_fetch)
    labs_scraper.scrape_archetype_matchups(
        "dragapult-dusknoir", ["0061", "0060", "0059", "0058", "0057", "0056"],
    )
    assert captured_url["url"] == (
        "https://labs.limitlesstcg.com/decks/dragapult-dusknoir"
        "?tournaments=56,57,58,59,60,61"
    )


def test_scrape_archetype_matchups_empty_tid_list(monkeypatch):
    """Empty / all-invalid tids → no fetch, empty result with safe defaults."""
    called = {"fetch": 0}

    def fake_fetch(url):
        called["fetch"] += 1
        return None

    monkeypatch.setattr(labs_scraper, "fetch_page_bs4", fake_fetch)
    result = labs_scraper.scrape_archetype_matchups("dragapult-dusknoir", [])
    assert called["fetch"] == 0
    assert result["matchups"] == []
    assert result["tournaments_used"] == []
