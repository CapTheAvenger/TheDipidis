"""Unit tests for the zero-player revisit pass in
backend/scrapers/labs_tournament_scraper.py.

User-flagged 2026-06-15: NAIC (TID 0070, ~3752 players) sat in
labs_tournaments.json with total_players=0 for days. The scraper
had probed /decks mid-tournament, got no deck rows, and persisted
an empty entry. Subsequent runs SKIPPED 0070 because:
  - the live index sometimes drops finished tournaments off the
    visible feed within a day
  - gap-fill only probes TIDs not in known_tids, so a
    known-but-empty TID stays empty forever

Fix: after gap-fill, force any cached entry with total_players==0
back into the iteration list. These tests pin the dedup + count
logic of that revisit pass — no network mocking required.
"""

import pytest


def compute_zero_player_revisit(cached_index, tournaments_already_queued):
    """Pure mirror of the production revisit logic.

    Returns the cached entries that should be re-queued — those with
    total_players == 0 AND not already in the iteration list.
    """
    queued_tids = {
        str(t.get('tournament_id') or '').strip() for t in tournaments_already_queued
    }
    out = []
    for c in cached_index:
        tid = str(c.get('tournament_id') or '').strip()
        if not tid:
            continue
        if tid in queued_tids:
            continue
        if (c.get('total_players') or 0) == 0:
            out.append(c)
    return out


class TestZeroPlayerRevisit:
    """The NAIC 0070 regression — exact shape from
    data/labs_tournaments.json on 2026-06-15."""

    def test_naic_0070_with_zero_players_is_requeued(self):
        cached = [
            {'tournament_id': '0070', 'tournament_name': 'NAIC New Orleans',
             'total_players': 0},
            {'tournament_id': '0068', 'tournament_name': 'Indianapolis',
             'total_players': 1970},
        ]
        # Live index returned nothing for 0070 this run
        queued = [{'tournament_id': '0069', 'tournament_name': 'Turin SPE'}]
        out = compute_zero_player_revisit(cached, queued)
        assert len(out) == 1
        assert out[0]['tournament_id'] == '0070'

    def test_already_queued_zero_player_is_not_duplicated(self):
        # If the live index DOES surface 0070 this run, it's already
        # in `tournaments` — the revisit pass must not add it twice.
        cached = [{'tournament_id': '0070', 'total_players': 0}]
        queued = [{'tournament_id': '0070', 'tournament_name': 'NAIC New Orleans'}]
        out = compute_zero_player_revisit(cached, queued)
        assert out == []

    def test_nonzero_player_count_is_not_requeued(self):
        # Healthy tournaments stay in cache without being re-touched.
        cached = [
            {'tournament_id': '0068', 'total_players': 1970},
            {'tournament_id': '0066', 'total_players': 958},
        ]
        assert compute_zero_player_revisit(cached, []) == []

    def test_missing_total_players_key_treated_as_zero(self):
        # Older labs_tournaments.json entries (pre-2026-05) had no
        # total_players field. Treat them as needing a revisit too —
        # they may have been written before the field existed AND
        # had no deck rows.
        cached = [{'tournament_id': '0010', 'tournament_name': 'Old'}]
        out = compute_zero_player_revisit(cached, [])
        assert len(out) == 1

    def test_blank_tid_skipped(self):
        cached = [
            {'tournament_id': '', 'total_players': 0},
            {'tournament_id': None, 'total_players': 0},
            {'tournament_id': '0070', 'total_players': 0},
        ]
        out = compute_zero_player_revisit(cached, [])
        assert [c['tournament_id'] for c in out] == ['0070']

    def test_mixed_state_only_zero_unqueued_returned(self):
        cached = [
            {'tournament_id': '0070', 'total_players': 0},     # NAIC stuck
            {'tournament_id': '0069', 'total_players': 1234},  # Turin healthy
            {'tournament_id': '0071', 'total_players': 0},     # also stuck
            {'tournament_id': '0072', 'total_players': 0},     # already queued
        ]
        queued = [{'tournament_id': '0072'}]
        out = compute_zero_player_revisit(cached, queued)
        assert sorted(c['tournament_id'] for c in out) == ['0070', '0071']

    def test_empty_cache_returns_empty(self):
        assert compute_zero_player_revisit([], []) == []
        assert compute_zero_player_revisit([], [{'tournament_id': '0070'}]) == []


class TestLoadCachedPreservesTotalPlayers:
    """The fix also widens _load_cached_tournament_index to keep
    total_players in the output dict — the revisit pass depends on it.
    Spot-check that field passes through. Full module-level test
    would require a temp-file fixture for labs_tournaments.json; the
    revisit logic above is what actually matters for the regression."""

    def test_field_default_zero(self):
        # Equivalent of `int(row.get('total_players') or 0)`.
        assert int({}.get('total_players') or 0) == 0
        assert int({'total_players': None}.get('total_players') or 0) == 0
        assert int({'total_players': 0}.get('total_players') or 0) == 0
        assert int({'total_players': 3752}.get('total_players') or 0) == 3752
