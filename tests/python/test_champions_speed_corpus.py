"""Unit tests for the Speed-corpus helpers in
backend/scrapers/champions_replica_scraper.py.

User-flagged 2026-06-15: the top-20 teams the scraper writes for the
Side Quest UI are too narrow a sample to compute a meaningful
"typical Speed" per species. The scraper now ALSO emits a broader
14-day corpus to data/champions_speed_corpus.json. These tests pin:

  - parse_date_shared (the sheet's mixed date formats)
  - filter_within_window (rank-priority order preserved, dropouts for
    unparseable dates)
  - build_speed_samples (flattening team records into per-mon rows)
"""

import os
import sys
from datetime import date

import pytest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'backend', 'scrapers'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'backend', 'core'))

from champions_replica_scraper import (  # noqa: E402
    parse_date_shared,
    filter_within_window,
    build_speed_samples,
)


class TestParseDateShared:
    def test_short_day_short_month(self):
        assert parse_date_shared('8 Jun 2026') == date(2026, 6, 8)

    def test_two_digit_day_full_month_lowercase(self):
        # Sheet has shown 'May' / 'may' / 'MAY' in different rows
        # depending on who edited last. Mixed-case fine.
        assert parse_date_shared('24 may 2026') == date(2026, 5, 24)
        assert parse_date_shared('24 MAY 2026') == date(2026, 5, 24)

    def test_long_month_name_still_truncates_to_3(self):
        # 'November' / 'November 2026' — we look at first 3 chars
        assert parse_date_shared('1 November 2026') == date(2026, 11, 1)

    def test_iso_format(self):
        assert parse_date_shared('2026-06-08') == date(2026, 6, 8)

    def test_european_slash_format_dmy(self):
        # 08/06/2026 → 8 June (sheet maintainers are EU-region)
        assert parse_date_shared('08/06/2026') == date(2026, 6, 8)

    def test_invalid_strings_return_none(self):
        for s in ['', None, 'tbd', '???', '8 Foo 2026', '40 Jun 2026', '2026']:
            assert parse_date_shared(s) is None, f'should reject {s!r}'

    def test_whitespace_tolerated(self):
        assert parse_date_shared('  8 Jun 2026  ') == date(2026, 6, 8)


class TestFilterWithinWindow:
    """Window is [today - window_days, today]. Order preserved."""

    def _row(self, date_str: str, label: str = 'X') -> dict:
        return {'Date Shared': date_str, 'Team Description': label}

    def test_keeps_rows_inside_window(self):
        today = date(2026, 6, 15)
        cands = [
            (self._row('14 Jun 2026', 'fresh'), 1.0),
            (self._row('1 Jun 2026', 'edge'), 2.0),
        ]
        out = filter_within_window(cands, today, window_days=14)
        labels = [r['Team Description'] for r, _ in out]
        assert labels == ['fresh', 'edge']

    def test_drops_rows_outside_window(self):
        today = date(2026, 6, 15)
        cands = [
            (self._row('1 Jun 2026', 'in'), 1.0),
            (self._row('1 May 2026', 'old'), 2.0),
        ]
        out = filter_within_window(cands, today, window_days=14)
        assert [r['Team Description'] for r, _ in out] == ['in']

    def test_unparseable_dates_dropped(self):
        today = date(2026, 6, 15)
        cands = [
            (self._row('???', 'junk'), 1.0),
            (self._row('8 Jun 2026', 'ok'), 2.0),
        ]
        out = filter_within_window(cands, today, window_days=14)
        assert [r['Team Description'] for r, _ in out] == ['ok']

    def test_preserves_caller_order(self):
        today = date(2026, 6, 15)
        cands = [
            (self._row('8 Jun 2026', 'A'), 2.0),
            (self._row('14 Jun 2026', 'B'), 1.0),
            (self._row('1 Jun 2026', 'C'), 3.0),
        ]
        out = filter_within_window(cands, today, window_days=14)
        # No re-sort — caller already chose rank order.
        assert [r['Team Description'] for r, _ in out] == ['A', 'B', 'C']

    def test_window_zero_disables_filter(self):
        today = date(2026, 6, 15)
        cands = [(self._row('1 Jan 2020'), 1.0), (self._row('1 Jan 2024'), 2.0)]
        out = filter_within_window(cands, today, window_days=0)
        assert len(out) == 2

    def test_edges_inclusive(self):
        today = date(2026, 6, 15)
        # exactly window_days back → inside (cutoff <= d <= today)
        cands = [(self._row('1 Jun 2026', 'edge'), 1.0)]
        out = filter_within_window(cands, today, window_days=14)
        assert len(out) == 1


class TestBuildSpeedSamples:
    def test_flattens_team_records_to_per_mon_rows(self):
        teams = [
            {
                'date_shared': '8 Jun 2026',
                'replica_code': 'ABC123',
                'pokemon': [
                    {'name': 'Garchomp',  'evs': '32 Atk / 32 Spe', 'nature': 'Jolly'},
                    {'name': 'Kingambit', 'evs': '32 HP / 32 Atk',  'nature': 'Adamant'},
                ],
            },
            {
                'date_shared': '7 Jun 2026',
                'replica_code': 'DEF456',
                'pokemon': [
                    {'name': 'Garchomp', 'evs': '32 Spe', 'nature': 'Jolly'},
                ],
            },
        ]
        out = build_speed_samples(teams)
        assert len(out) == 3
        assert out[0] == {
            'species': 'Garchomp', 'evs': '32 Atk / 32 Spe',
            'nature': 'Jolly', 'date': '8 Jun 2026', 'replica': 'ABC123',
        }
        assert out[2]['replica'] == 'DEF456'

    def test_drops_mons_without_evs_string(self):
        teams = [{
            'date_shared': '8 Jun 2026', 'replica_code': 'X',
            'pokemon': [
                {'name': 'Garchomp', 'evs': '', 'nature': 'Jolly'},
                {'name': 'Kingambit', 'evs': '   ', 'nature': 'Adamant'},
                {'name': 'Talonflame', 'evs': '32 Spe', 'nature': 'Jolly'},
            ],
        }]
        out = build_speed_samples(teams)
        assert [s['species'] for s in out] == ['Talonflame']

    def test_drops_blank_species_names(self):
        teams = [{
            'date_shared': '8 Jun 2026', 'replica_code': 'X',
            'pokemon': [
                {'name': '', 'evs': '32 Spe', 'nature': 'Jolly'},
                {'name': '   ', 'evs': '32 Spe', 'nature': 'Jolly'},
                {'name': 'Garchomp', 'evs': '32 Spe', 'nature': 'Jolly'},
            ],
        }]
        out = build_speed_samples(teams)
        assert [s['species'] for s in out] == ['Garchomp']

    def test_empty_input_returns_empty_list(self):
        assert build_speed_samples([]) == []
        assert build_speed_samples(iter([])) == []

    def test_missing_nature_field_passes_through_empty(self):
        # Some older pokepastes don't declare a nature — corpus should
        # still keep the row (frontend treats '' as neutral mod 1.0).
        teams = [{
            'date_shared': '8 Jun 2026', 'replica_code': 'X',
            'pokemon': [{'name': 'Garchomp', 'evs': '32 Spe'}],
        }]
        out = build_speed_samples(teams)
        assert out[0]['nature'] == ''
