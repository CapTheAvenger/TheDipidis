"""Tests for the deck-row deduplication safety net in
`labs_tournament_scraper.save_results` / `overwrite_results`.

Root-cause this guards against: when a tournament gets discovered
through two code paths in one scraper run (e.g. the labs index AND
the ID-walk both return Melbourne TID 0066), `deck_rows` ends up
with two copies of every (tid, slug) pair, and the previous append-
write would double them on disk. Surfaced 2026-05-27 in the
`labs_tournament_decks.csv` snapshot: 124 Melbourne rows but only
62 unique decks. Both Predictor 4.6 (Underdog-Champion-Boost) and
Predictor 5.4 (Day-2 share-growth) read recency-weighted aggregates
from that file, so doubling skews their inputs proportionally —
even though the per-row averages average out, downstream counts
like `_labsConvByDeck[k].n` do not.
"""

import os
import sys

import pytest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(REPO_ROOT, "backend", "scrapers"))
sys.path.insert(0, os.path.join(REPO_ROOT, "backend", "core"))

labs_scraper = pytest.importorskip("labs_tournament_scraper")


def _row(tid: str, slug: str, share: float = 0.0, marker: str = ""):
    """Make a minimal deck row. `marker` lets a test assert which
    duplicate copy survived dedupe (last-wins semantics)."""
    return {
        "tournament_id": tid,
        "tournament_name": "Some Regional",
        "tournament_date": "2026-05-23",
        "deck_slug": slug,
        "deck_name": slug.replace("-", " ").title(),
        "share_pct": share,
        "marker": marker,
    }


def test_dedupe_drops_exact_duplicates_in_one_batch():
    """Same (tid, slug) appearing twice in the input → one row out."""
    rows = [_row("0066", "dragapult-ex"), _row("0066", "dragapult-ex")]
    out = labs_scraper._dedupe_deck_rows(rows)
    assert len(out) == 1
    assert out[0]["deck_slug"] == "dragapult-ex"


def test_dedupe_preserves_distinct_tids():
    """Same deck across different tournaments stays separate — that's
    not a dupe, it's per-tournament tracking."""
    rows = [_row("0066", "dragapult-ex"), _row("0067", "dragapult-ex")]
    out = labs_scraper._dedupe_deck_rows(rows)
    assert len(out) == 2
    assert {r["tournament_id"] for r in out} == {"0066", "0067"}


def test_dedupe_preserves_distinct_decks_in_same_tid():
    """Distinct decks in the same tournament are kept — only same-slug
    same-tournament pairs get collapsed."""
    rows = [_row("0066", "dragapult-ex"), _row("0066", "n-zoroark")]
    out = labs_scraper._dedupe_deck_rows(rows)
    assert len(out) == 2


def test_dedupe_keeps_last_seen_copy():
    """Last-wins semantics: a re-scrape with updated numbers should
    replace the earlier entry, not be silently dropped."""
    rows = [
        _row("0066", "dragapult-ex", share=9.5, marker="first"),
        _row("0066", "dragapult-ex", share=10.02, marker="second"),
    ]
    out = labs_scraper._dedupe_deck_rows(rows)
    assert len(out) == 1
    assert out[0]["marker"] == "second"
    assert out[0]["share_pct"] == 10.02


def test_dedupe_handles_empty_input():
    """Empty input → empty output, no crash."""
    assert labs_scraper._dedupe_deck_rows([]) == []


def test_dedupe_handles_missing_keys_gracefully():
    """Rows with missing tournament_id / deck_slug shouldn't blow up —
    they get bucketed under ('', '') and still go through the same
    last-wins collapse."""
    rows = [
        {"tournament_id": None, "deck_slug": None, "x": 1},
        {"x": 2},  # entirely missing both keys
    ]
    out = labs_scraper._dedupe_deck_rows(rows)
    # Both map to the ('', '') key → collapsed to one row, last-wins.
    assert len(out) == 1
    assert out[0]["x"] == 2


def test_dedupe_matches_melbourne_incident_shape():
    """Reproduce the 2026-05-27 Melbourne scrape failure: each unique
    deck appeared twice with identical scraped_at. Dedupe should leave
    exactly the unique-row count."""
    slugs = [
        "dragapult-ex", "dragapult-dusknoir", "n-zoroark",
        "lopunny-dudunsparce", "rockets-honchkrow", "raging-bolt-ogerpon",
        "rocket-mewtwo-ex", "ogerpon-meganium-hydrapple",
        "festival-lead", "lucario-hariyama",
    ]
    duplicated = []
    for s in slugs:
        duplicated.append(_row("0066", s))
        duplicated.append(_row("0066", s))
    assert len(duplicated) == 20

    out = labs_scraper._dedupe_deck_rows(duplicated)
    assert len(out) == len(slugs)
    assert {r["deck_slug"] for r in out} == set(slugs)
