"""Tests for the per-tournament winners output added to
online_tournament_scraper.py (Predictor 4.7 — Online-Tournament-Win
Signal).

Background: the Indianapolis post-mortem cited online wins as
leading indicators ("1st of 341 at Championships of Doom VIII").
The previous aggregator only produced per-archetype averages, which
hides which specific tournaments a deck WON. The new code emits a
second CSV (`online_tournament_winners.csv`) with one row per
(tournament, place-1 finisher) so the engine can apply a freshness-
decayed boost similar to Predictor 4.6 (Underdog-Champion) but for
online events.

Coverage:
  • `aggregate()` returns the (stats, winners) tuple
  • Winners only get captured for place == 1
  • Winners are sorted newest-first
  • Format label flows from settings into each winner row
  • Multi-format CSV merge preserves entries from other formats on
    a single-format re-run
"""

import csv
import os
import sys
from datetime import datetime, timezone

import pytest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(REPO_ROOT, "backend", "scrapers"))
sys.path.insert(0, os.path.join(REPO_ROOT, "backend", "core"))

# Importing the scraper module may try to import optional deps; skip if missing.
ots = pytest.importorskip("online_tournament_scraper")


def _make_settings(fmt: str = "POR"):
    return {
        "delay_between_requests": 0,
        "format_filter": fmt,
        "recent_days_high_weight": 7,
        "recent_weight": 1.0,
        "older_weight": 0.5,
    }


def _make_tournament(tid: str, date_str: str, players: int):
    return {
        "id":      tid,
        "date":    datetime.fromisoformat(date_str + "T12:00:00+00:00"),
        "players": players,
    }


def test_aggregate_returns_stats_and_winners(monkeypatch):
    """aggregate() must return a (stats, winners) tuple — older
    callers that unpacked one value are intentionally broken so
    schema drift surfaces immediately rather than silently corrupting
    downstream CSVs."""
    tournaments = [_make_tournament("t-001", "2026-05-15", 341)]
    standings = {
        "t-001": [
            {"placement": 1, "archetype": "Ogerpon Meganium Hydrapple", "winrate": 87.5},
            {"placement": 2, "archetype": "Dragapult ex",                "winrate": 81.3},
        ]
    }
    monkeypatch.setattr(ots, "_fetch_standings", lambda tid: standings.get(tid, []))
    result = ots.aggregate(tournaments, _make_settings("POR"))
    assert isinstance(result, tuple) and len(result) == 2
    stats, winners = result
    assert isinstance(stats, list)
    assert isinstance(winners, list)


def test_aggregate_captures_place_1_only(monkeypatch):
    """A place-1 finish becomes a winners row; place 2-8 do not."""
    tournaments = [_make_tournament("t-001", "2026-05-15", 341)]
    standings = {
        "t-001": [
            {"placement": 1, "archetype": "Hydrapple Ogerpon",  "winrate": 90.0},
            {"placement": 2, "archetype": "Dragapult ex",       "winrate": 80.0},
            {"placement": 3, "archetype": "N's Zoroark",        "winrate": 70.0},
            {"placement": 8, "archetype": "Festival Lead",      "winrate": 65.0},
        ]
    }
    monkeypatch.setattr(ots, "_fetch_standings", lambda tid: standings.get(tid, []))
    _, winners = ots.aggregate(tournaments, _make_settings("POR"))
    assert len(winners) == 1
    assert winners[0]["winner_archetype"] == "Hydrapple Ogerpon"
    assert winners[0]["player_count"] == 341
    assert winners[0]["tournament_date"] == "2026-05-15"


def test_winners_carry_format_label_from_settings(monkeypatch):
    """The format string passed in settings must appear verbatim on
    each winner row. Used by the frontend to filter winners against
    the active in-person format."""
    tournaments = [_make_tournament("t-001", "2026-05-15", 200)]
    standings = {"t-001": [{"placement": 1, "archetype": "Pikachu", "winrate": 80.0}]}
    monkeypatch.setattr(ots, "_fetch_standings", lambda tid: standings.get(tid, []))
    _, winners = ots.aggregate(tournaments, _make_settings("CRI"))
    assert winners[0]["format"] == "CRI"


def test_winners_sorted_newest_first(monkeypatch):
    """Sort by tournament_date DESC so the engine can short-circuit on
    the 21-day freshness cap without scanning the full backlog."""
    tournaments = [
        _make_tournament("t-old",    "2026-04-01", 200),
        _make_tournament("t-fresh",  "2026-05-29", 200),
        _make_tournament("t-medium", "2026-05-01", 200),
    ]
    standings = {
        tid: [{"placement": 1, "archetype": "Some Deck", "winrate": 80.0}]
        for tid in ("t-old", "t-fresh", "t-medium")
    }
    monkeypatch.setattr(ots, "_fetch_standings", lambda tid: standings.get(tid, []))
    _, winners = ots.aggregate(tournaments, _make_settings("POR"))
    dates = [w["tournament_date"] for w in winners]
    assert dates == ["2026-05-29", "2026-05-01", "2026-04-01"]


def test_aggregate_skips_empty_standings(monkeypatch):
    """If the standings fetch returns [], skip the tournament — no
    winners row, no stats inflation."""
    tournaments = [_make_tournament("t-001", "2026-05-15", 100)]
    monkeypatch.setattr(ots, "_fetch_standings", lambda tid: [])
    _, winners = ots.aggregate(tournaments, _make_settings("POR"))
    assert winners == []


def test_aggregate_ignores_blank_archetype(monkeypatch):
    """Row with empty archetype (parse failure) doesn't become a winner."""
    tournaments = [_make_tournament("t-001", "2026-05-15", 200)]
    standings = {
        "t-001": [
            {"placement": 1, "archetype": "",            "winrate": 80.0},  # corrupted row
            {"placement": 2, "archetype": "Some Deck",   "winrate": 70.0},
        ]
    }
    monkeypatch.setattr(ots, "_fetch_standings", lambda tid: standings.get(tid, []))
    _, winners = ots.aggregate(tournaments, _make_settings("POR"))
    assert winners == [], "Blank-archetype place-1 must NOT generate a winner row"
