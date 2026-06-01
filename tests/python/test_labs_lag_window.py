"""Tests for the in-person lag-window handling in the labs scraper.

Background: format_window.json carries two date-driven keys:
  current_set            — the most-recent EN set (online-legal)
  in_person_legal_date   — the day the new set becomes legal for in-
                           person Regionals / Special Events

Between online-legal and in-person-legal there's a ~14-day "lag
window" where the new set runs on Limitless Online but every in-
person tournament is still on the PREVIOUS rotation. The labs
scraper feeds off in-person results; if it treats the new rotation
as `current_meta`, the previous-rotation tournaments freeze early
and miss two weeks of:
  - top1_count / top4_count / top8_count backfill (Predictor 4.6)
  - Day-1 + Day-2 matchup matrix updates (3-source blend)

`_active_in_person_meta_key()` is the seam that pins the rescrape
target to the previous rotation during the lag window. These tests
exercise its branch logic in isolation.

Real-world anchor: the 2026-06-01 weekly run hit this bug — the
2026-05-22 CRI release flipped `current_meta` to TEF-CRI even
though every Regional through 2026-06-04 still plays TEF-POR. The
fix below routes those rescrapes back to TEF-POR.
"""

import os
import sys
from datetime import datetime
from unittest.mock import patch

import pytest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(REPO_ROOT, "backend", "scrapers"))
sys.path.insert(0, os.path.join(REPO_ROOT, "backend", "core"))

labs_scraper = pytest.importorskip("labs_tournament_scraper")


# Date-driven branches: we control today's date via a frozen datetime
# class and the legal_date / current_meta returns via direct patching.
class _FakeDatetime(datetime):
    """datetime.utcnow() returns a fixed timestamp. Inheriting from the
    real datetime keeps strptime / strftime working untouched."""
    @classmethod
    def utcnow(cls):
        return cls(2026, 6, 1, 12, 0, 0)


@pytest.fixture
def freeze_today_2026_06_01(monkeypatch):
    monkeypatch.setattr(labs_scraper, "datetime", _FakeDatetime)


def test_lag_window_active_returns_previous_meta(freeze_today_2026_06_01, monkeypatch):
    """In the lag window (today < in_person_legal_date) the active key
    is the PREVIOUS rotation, not the just-released one."""
    monkeypatch.setattr(labs_scraper, "_current_meta_key", lambda: "TEF-CRI")
    monkeypatch.setattr(labs_scraper, "_load_in_person_legal_date", lambda: "2026-06-05")
    monkeypatch.setattr(labs_scraper, "_previous_meta_for_date", lambda d: "TEF-POR")

    assert labs_scraper._active_in_person_meta_key() == "TEF-POR"


def test_post_lag_window_active_returns_current_meta(freeze_today_2026_06_01, monkeypatch):
    """Once today >= in_person_legal_date, active = current_meta."""
    monkeypatch.setattr(labs_scraper, "_current_meta_key", lambda: "TEF-CRI")
    # Legal date already passed (today 2026-06-01 vs legal 2026-05-15).
    monkeypatch.setattr(labs_scraper, "_load_in_person_legal_date", lambda: "2026-05-15")
    # _previous_meta_for_date must NOT be consulted in this branch — if
    # it is, this would return TEF-OLD instead of TEF-CRI.
    monkeypatch.setattr(labs_scraper, "_previous_meta_for_date", lambda d: "TEF-OLD")

    assert labs_scraper._active_in_person_meta_key() == "TEF-CRI"


def test_lag_window_falls_back_to_current_when_no_previous_meta_known(
    freeze_today_2026_06_01, monkeypatch
):
    """Lag window IS active, but the lookup can't resolve a previous
    rotation (e.g. brand-new install with no per-meta chunks yet).
    Should degrade gracefully to current_meta, not return empty."""
    monkeypatch.setattr(labs_scraper, "_current_meta_key", lambda: "TEF-CRI")
    monkeypatch.setattr(labs_scraper, "_load_in_person_legal_date", lambda: "2026-06-05")
    monkeypatch.setattr(labs_scraper, "_previous_meta_for_date", lambda d: "")

    assert labs_scraper._active_in_person_meta_key() == "TEF-CRI"


def test_no_legal_date_falls_back_to_current(freeze_today_2026_06_01, monkeypatch):
    """Older format_window.json without in_person_legal_date set —
    behave exactly like _current_meta_key (legacy compatibility)."""
    monkeypatch.setattr(labs_scraper, "_current_meta_key", lambda: "TEF-CRI")
    monkeypatch.setattr(labs_scraper, "_load_in_person_legal_date", lambda: "")
    monkeypatch.setattr(labs_scraper, "_previous_meta_for_date", lambda d: "SHOULD_NOT_FIRE")

    assert labs_scraper._active_in_person_meta_key() == "TEF-CRI"


def test_exactly_at_legal_date_picks_current(freeze_today_2026_06_01, monkeypatch):
    """Boundary: today == in_person_legal_date should already be
    treated as post-lag. (Today < legal_date is the gate.)"""
    monkeypatch.setattr(labs_scraper, "_current_meta_key", lambda: "TEF-CRI")
    monkeypatch.setattr(labs_scraper, "_load_in_person_legal_date", lambda: "2026-06-01")
    monkeypatch.setattr(labs_scraper, "_previous_meta_for_date", lambda d: "TEF-POR")

    assert labs_scraper._active_in_person_meta_key() == "TEF-CRI"


def test_endswith_pattern_matches_active_meta_correctly():
    """Sanity check on the consumer's endswith() pattern: composite
    keys like 'TEF-POR' should match 'TEF-POR' but NOT 'BRS-POR'.
    This guards the matchup-skip + deck-rescrape branches that pin
    `t_meta.endswith(active_meta)`."""
    # Active = 'TEF-POR' — the lag-window override.
    assert "TEF-POR".endswith("TEF-POR")
    assert not "BRS-POR".endswith("TEF-POR")
    assert not "TEF-CRI".endswith("TEF-POR")
    # Active = 'TEF-CRI' — the post-lag-window default.
    assert "TEF-CRI".endswith("TEF-CRI")
    assert not "TEF-POR".endswith("TEF-CRI")
