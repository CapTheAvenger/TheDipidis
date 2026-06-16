"""Tests for build_best_online_decklists — the per-archetype best REAL online
decklist (last N days) that feeds the "Latest Online" quick-reference panel.
No averaging: it returns an actual player's list, chosen by best finish.
"""

import sys
from datetime import datetime, timedelta
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_REPO_ROOT / "backend" / "core"))
sys.path.insert(0, str(_REPO_ROOT / "backend" / "scrapers"))

import current_meta_analysis_scraper as cma  # noqa: E402


def _iso(days_ago):
    return (datetime.now() - timedelta(days=days_ago)).strftime("%Y-%m-%d")


def _deck(arch, place, score, days_ago, player, cards=None):
    return {
        "archetype": arch,
        "place": place,
        "score": score,
        "tournament_date": _iso(days_ago),
        "tournament_id": "t" + player,
        "tournament_name": "Event " + player,
        "player": player,
        "total_players": 100,
        "cards": cards if cards is not None else [{"name": "Charcadet", "count": 4,
                 "set_code": "SSP", "set_number": "32", "type": "Basic", "is_ace_spec": False}],
    }


def test_picks_lowest_place_in_window():
    decks = [
        _deck("Ceruledge ex", "5th of 72", "5-2-0", 2, "alice"),
        _deck("Ceruledge ex", "1st of 65", "8-1-0", 3, "bob"),     # best place
        _deck("Ceruledge ex", "2nd of 90", "9-1-0", 1, "carol"),
    ]
    best = cma.build_best_online_decklists(decks, recent_days=7)
    assert set(best) == {"Ceruledge ex"}
    assert best["Ceruledge ex"]["player"] == "bob"
    assert best["Ceruledge ex"]["place_rank"] == 1


def test_excludes_decks_older_than_window():
    decks = [
        _deck("Dragapult", "1st of 200", "9-0-0", 30, "old"),   # out of 7-day window
        _deck("Dragapult", "4th of 120", "7-2-0", 2, "fresh"),  # in window
    ]
    best = cma.build_best_online_decklists(decks, recent_days=7)
    assert best["Dragapult"]["player"] == "fresh"


def test_skips_unranked_and_cardless():
    decks = [
        _deck("Gardevoir", "", "7-2-0", 1, "noplace"),                 # no place → skip
        _deck("Gardevoir", "3rd of 80", "7-2-0", 1, "good"),
        _deck("Gardevoir", "1st of 80", "8-1-0", 1, "nocards", cards=[]),  # no cards → skip
    ]
    best = cma.build_best_online_decklists(decks, recent_days=7)
    assert best["Gardevoir"]["player"] == "good"


def test_tiebreak_winrate_then_recency():
    decks = [
        _deck("Lucario", "1st of 50", "6-2-0", 5, "a"),   # WR 75%
        _deck("Lucario", "1st of 50", "9-1-0", 5, "b"),   # WR 90% → wins tie
    ]
    best = cma.build_best_online_decklists(decks, recent_days=7)
    assert best["Lucario"]["player"] == "b"


def test_returns_real_cards_no_synthesis():
    cards = [
        {"name": "Charcadet", "count": 4, "set_code": "SSP", "set_number": "32",
         "type": "Basic", "is_ace_spec": False},
        {"name": "Fighting Energy", "count": 13, "set_code": "MEE", "set_number": "6",
         "type": "Basic Energy", "is_ace_spec": False},
    ]
    best = cma.build_best_online_decklists([_deck("Ceruledge ex", "1st of 65", "8-1-0", 1, "bob", cards)], 7)
    out = best["Ceruledge ex"]["cards"]
    assert {c["name"]: c["count"] for c in out} == {"Charcadet": 4, "Fighting Energy": 13}
