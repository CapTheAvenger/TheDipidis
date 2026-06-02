"""
Verifies the recent-TID gap-fill logic added to labs_tournament_scraper
catches missing TIDs in a sequence. User-flagged 2026-06: Special
Event Lima (TID 0067, between Melbourne 0066 and Indianapolis 0068)
was published on labs.limitlesstcg.com but didn't appear on the labs
index page, so the weekly run missed it. The gap-fill walks the last
N TIDs back from the discovered max and probes any missing ones.

The test exercises the SET-DIFFERENCE logic that computes which TIDs
need probing — this is the cheap, pure part of the gap-fill that
doesn't need network mocking.
"""

import pytest


GAP_FILL_LOOKBACK = 10


def compute_gap_fill_targets(discovered_tids, cached_tids, lookback=GAP_FILL_LOOKBACK):
    """Mirror of the gap-fill set logic inside labs_tournament_scraper.

    Returns the sorted list of TIDs (as ints) that need probing —
    those in [max_known - lookback .. max_known] that are NOT in the
    known set.
    """
    known = set(discovered_tids) | set(cached_tids)
    if not known:
        return []
    max_tid = max(known)
    gap_window = set(range(max_tid - lookback, max_tid + 1))
    return sorted(gap_window - known)


def test_lima_indianapolis_gap_caught():
    """TEF-POR rotation: Melbourne 0066, Lima MISSING 0067, Indy 0068.
    The gap-fill should surface 0067 as the only missing TID in the
    lookback window — everything else in [0058..0068] is already known."""
    discovered = [62, 63, 64, 65, 66, 68]  # weekly index returned these
    cached = [62, 63, 64, 65, 66, 68]      # labs_tournaments.json matches
    targets = compute_gap_fill_targets(discovered, cached)
    assert 67 in targets, "Lima TID 0067 should be in the gap-fill probe set"
    # Older TIDs not in the cache also surface — that's fine, the
    # actual /standings probe will 404 silently for non-existent IDs.
    assert all(58 <= t <= 68 for t in targets), \
        f"Probes should stay within the lookback window: {targets}"


def test_no_known_tids_returns_empty():
    """Edge case — empty initial state means no max to anchor from."""
    assert compute_gap_fill_targets([], []) == []


def test_no_gaps_returns_empty():
    """Sequence with no gaps in the lookback window — nothing to probe."""
    # Cache spans further back than the lookback window so every TID
    # in [max - lookback .. max] is accounted for.
    discovered = list(range(60, 69))   # 0060..0068
    cached = list(range(50, 69))       # 0050..0068
    targets = compute_gap_fill_targets(discovered, cached)
    assert targets == [], f"No gaps expected; got {targets}"


def test_multiple_gaps_in_window():
    """If the scraper missed several recent events, gap-fill should
    surface them all — not just the most recent one."""
    discovered = [60, 62, 64, 66, 68]
    cached = [60, 62, 64, 66, 68]
    targets = compute_gap_fill_targets(discovered, cached, lookback=10)
    # Window is [58..68]; missing = {58, 59, 61, 63, 65, 67}
    assert set(targets) == {58, 59, 61, 63, 65, 67}, \
        f"Expected all gaps in window; got {targets}"


def test_discovered_and_cached_merge():
    """Cached index may have TIDs the current discovery missed (e.g.
    weekly run blocked by Cloudflare). The union determines what
    counts as 'known'."""
    discovered = [68]                  # weekly only got the newest
    cached = [62, 63, 64, 65, 66, 68]  # but cache has the recent history
    targets = compute_gap_fill_targets(discovered, cached)
    # Missing in window [58..68] = {58, 59, 60, 61, 67}
    assert 67 in targets
    # 0062..0066 are in the cached set → NOT in targets
    assert all(t not in targets for t in [62, 63, 64, 65, 66])


def test_lookback_window_size():
    """Lookback window is configurable — covers ~2 weeks of regional
    cadence by default. A smaller window catches less; a bigger one
    costs more HTTP. Window size N means we probe N TIDs older than
    the discovered max (max itself is by definition already known)."""
    discovered = [70]
    cached = [70]
    # Lookback 5: probe {65, 66, 67, 68, 69} — 5 older TIDs.
    targets_5 = compute_gap_fill_targets(discovered, cached, lookback=5)
    assert set(targets_5) == {65, 66, 67, 68, 69}
    # Lookback 3: probe {67, 68, 69}.
    targets_3 = compute_gap_fill_targets(discovered, cached, lookback=3)
    assert set(targets_3) == {67, 68, 69}
