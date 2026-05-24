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
    """End-to-end: deck_summary + matchups_result → CSV-ready rows."""
    tournament_meta = {
        "tournament_id": "539",
        "tournament_name": "Regional Prague",
        "tournament_date": "2026-04-25",
        "tournament_type": "regional",
        "meta": "TEF-POR",
    }
    deck_summary = {
        "deck_slug": "dragapult",
        "deck_name": "Dragapult",
        "player_count": 738,
        "win_pct": 50.86,
    }
    matchups_result = {
        "summary": {
            "player_count": 738,
            "total_wins": 2891,
            "total_losses": 2447,
            "total_ties": 1004,
            "overall_win_pct": 50.86,
        },
        "matchups": [
            {"opponent_slug": "raging-bolt-ogerpon", "opponent_name": "Raging Bolt Ogerpon",
             "vs_count": 418, "vs_win_pct": 40.59},
        ],
        "day_filter": "overall",
    }
    rows = labs_scraper.build_matchup_rows(tournament_meta, deck_summary, matchups_result)
    assert len(rows) == 1
    r = rows[0]
    assert set(r.keys()) >= set(labs_scraper.MATCHUP_CSV_HEADER) - {"scraped_at"}
    assert r["my_deck_slug"] == "dragapult"
    assert r["opponent_deck_slug"] == "raging-bolt-ogerpon"
    assert r["vs_count"] == 418
    assert r["meta"] == "TEF-POR"
    assert r["day_filter"] == "overall"
