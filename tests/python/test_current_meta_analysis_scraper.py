"""Smoke tests for the merged Meta-Live → dated-CSV path.

The end-to-end pipeline (cloudscraper, BeautifulSoup against live
Limitless) needs network and isn't run in CI.  These tests cover the
bit we own: ``build_dated_rows_from_meta_live`` — the glue that turns
the per-deck Meta-Live results into ``data/online_tournament_dated_cards.csv``-
shaped rows.  Pure parsers (date / history-row) live in
backend.core.limitless_dated and have their own test file.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

_REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_REPO_ROOT / "backend" / "core"))
sys.path.insert(0, str(_REPO_ROOT / "backend" / "scrapers"))

# `current_meta_analysis_scraper` imports `card_scraper_shared` which
# in turn touches a few Windows-specific encoding helpers — they
# import cleanly, so we just bring them in the same way the runtime
# does.
from current_meta_analysis_scraper import (  # noqa: E402
    build_dated_rows_from_meta_live,
)


class _FakeCardDB:
    """Minimal CardDatabaseLookup stand-in — the aggregator only calls
    ``get_card(set_code, number)`` (and falls back to
    ``get_card_info(name)`` if the first returns nothing). Returning
    None for both is the no-metadata path we exercise here."""

    def get_card(self, set_code, number):
        return None

    def get_card_info(self, card_name):
        return None


def _deck(tid: str, archetype: str, date: str, cards: list, name: str = "",
          total_players: int = 0) -> dict:
    """Helper — assemble a single Meta-Live deck dict matching what
    `_fetch_meta_live_decklist` returns after the merge."""
    return {
        "archetype": archetype,
        "deck_slug": archetype.lower().replace(" ", "-"),
        "cards": cards,
        "source": "limitless_online",
        "tournament_id": tid,
        "tournament_date": date,
        "tournament_name": name,
        "total_players": total_players,
    }


class TestBuildDatedRowsFromMetaLive:
    def test_groups_decks_by_tournament_and_archetype(self):
        # Two Cynthia decks at one tournament, one at another → expect
        # two distinct (tid, archetype) buckets in the output.
        decks = [
            _deck("T1", "Cynthia's Garchomp", "2026-04-04", [
                {"name": "Boss's Orders", "count": 4, "set_code": "PFL", "set_number": "100"},
                {"name": "Switch", "count": 4, "set_code": "PFL", "set_number": "123"},
            ]),
            _deck("T1", "Cynthia's Garchomp", "2026-04-04", [
                {"name": "Boss's Orders", "count": 4, "set_code": "PFL", "set_number": "100"},
            ]),
            _deck("T2", "Cynthia's Garchomp", "2026-04-25", [
                {"name": "Boss's Orders", "count": 4, "set_code": "PFL", "set_number": "100"},
            ]),
        ]
        rows = build_dated_rows_from_meta_live(decks, _FakeCardDB())
        # 2 buckets × cards-per-bucket. T1 has Boss + Switch (2 cards),
        # T2 has only Boss (1 card) → 3 rows total.
        assert len(rows) == 3

        t1_rows = [r for r in rows if r["tournament_id"] == "T1"]
        t2_rows = [r for r in rows if r["tournament_id"] == "T2"]
        assert len(t1_rows) == 2
        assert len(t2_rows) == 1
        # In T1, Boss's Orders is in BOTH decks → deck_inclusion_count=2
        # of total_decks_in_archetype=2; Switch is in 1 of 2.
        boss_t1 = next(r for r in t1_rows if r["card_name"] == "Boss's Orders")
        switch_t1 = next(r for r in t1_rows if r["card_name"] == "Switch")
        assert boss_t1["total_decks_in_archetype"] == 2
        assert boss_t1["deck_inclusion_count"] == 2
        assert switch_t1["total_decks_in_archetype"] == 2
        assert switch_t1["deck_inclusion_count"] == 1

    def test_skips_decks_without_tournament_context(self):
        # Decks scraped from archived URLs may lack tournament_id /
        # tournament_date — they're useless for recency-decay so the
        # builder must drop them rather than emit blank-key rows.
        decks = [
            _deck("", "X", "2026-04-04", [
                {"name": "C", "count": 1, "set_code": "S", "set_number": "1"},
            ]),
            _deck("T1", "X", "", [
                {"name": "C", "count": 1, "set_code": "S", "set_number": "1"},
            ]),
            _deck("T1", "X", "2026-04-04", [
                {"name": "C", "count": 1, "set_code": "S", "set_number": "1"},
            ]),
        ]
        rows = build_dated_rows_from_meta_live(decks, _FakeCardDB())
        # Only the third deck is valid; one card row.
        assert len(rows) == 1
        assert rows[0]["tournament_id"] == "T1"
        assert rows[0]["tournament_date"] == "2026-04-04"

    def test_carries_meta_label_and_card_identifier(self):
        # Schema-stability check — frontend recency-decay matches on
        # `meta == "Online Dated"` to distinguish dated rows from the
        # baseline current_meta_card_data.csv.
        decks = [
            _deck("T1", "X", "2026-04-04", [
                {"name": "C", "count": 1, "set_code": "PFL", "set_number": "100"},
            ]),
        ]
        rows = build_dated_rows_from_meta_live(decks, _FakeCardDB())
        assert rows[0]["meta"] == "Online Dated"
        assert rows[0]["card_identifier"] == "PFL 100"
        assert rows[0]["archetype"] == "X"

    def test_empty_input_returns_empty_list(self):
        assert build_dated_rows_from_meta_live([], _FakeCardDB()) == []

    def test_total_players_propagated_from_deck_to_row(self):
        # W3 Phase 0 — every output row carries the tournament's
        # total_players (parsed upstream from "Nth of TOTAL").
        decks = [
            _deck("T1", "X", "2026-04-04", [
                {"name": "C", "count": 1, "set_code": "S", "set_number": "1"},
            ], total_players=300),
        ]
        rows = build_dated_rows_from_meta_live(decks, _FakeCardDB())
        assert len(rows) == 1
        assert rows[0]["total_players"] == 300

    def test_total_players_max_across_decks_in_same_tournament(self):
        # Multiple decks in the same (tid, archetype) bucket — total_players
        # should land at the MAX, robust against the occasional 0 from a
        # row whose place column was malformed.
        decks = [
            _deck("T1", "X", "2026-04-04", [
                {"name": "C", "count": 1, "set_code": "S", "set_number": "1"},
            ], total_players=0),
            _deck("T1", "X", "2026-04-04", [
                {"name": "C", "count": 1, "set_code": "S", "set_number": "1"},
            ], total_players=200),
            _deck("T1", "X", "2026-04-04", [
                {"name": "C", "count": 1, "set_code": "S", "set_number": "1"},
            ], total_players=200),
        ]
        rows = build_dated_rows_from_meta_live(decks, _FakeCardDB())
        # 1 bucket × 1 card → 1 row, total_players = 200 (max)
        assert len(rows) == 1
        assert rows[0]["total_players"] == 200

    def test_total_players_defaults_to_zero_when_missing(self):
        # Backwards-compat — a deck dict that pre-dates the field still
        # produces a valid row, total_players = 0 (which the frontend
        # filter treats as 'unknown, skip').
        decks = [
            _deck("T1", "X", "2026-04-04", [
                {"name": "C", "count": 1, "set_code": "S", "set_number": "1"},
            ]),
        ]
        # Strip the field to simulate a legacy caller
        del decks[0]["total_players"]
        rows = build_dated_rows_from_meta_live(decks, _FakeCardDB())
        assert len(rows) == 1
        assert rows[0]["total_players"] == 0
