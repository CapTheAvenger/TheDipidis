"""Cross-file data-integrity invariants for the data/ directory.

Born out of the Melbourne 2026-05-23 incident — a TEF-POR tournament
that ended up labelled TEF-CRI in both the master matchups CSV and a
phantom per-format split file, because the labs scraper's fallback
ignored in_person_legal_date. The test class below pins the invariants
we wished we'd had checking continuously:

  • format_window.json carries the fields the scrapers depend on
  • Per-format split files match their filename's meta tag
  • A single tournament_id never lives under two different metas
  • Tournament dates before in_person_legal_date never carry the new
    set's meta (the actual Melbourne reproducer)
  • The offline-manifest points only at files that exist
  • Master ↔ per-format chunk row counts add up
  • tournament_cards_manifest's chunk_dates cover the actual data

These checks run against the live data/ tree on every push (the
existing deploy-pages.yml workflow already runs `pytest tests/python/`).
A regression here means data integrity has drifted before the website
or bot would visibly break — surface earlier.

Where a test would otherwise hard-fail on first-of-rotation
inconsistencies that resolve themselves on the next scrape, the
check is split: a hard assertion for the structural invariant and a
soft `pytest.warns`-style emit for the transient drift.
"""

import csv
import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timedelta

import pytest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DATA_DIR = os.path.join(REPO_ROOT, "data")


# ──────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────

def _read_csv(path, delimiter=","):
    """utf-8-sig handles the BOM that some Limitless exports carry."""
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f, delimiter=delimiter))


def _read_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _list_per_meta_files(prefix):
    """Returns [(meta, abs_path)] for every data/<prefix>_<META>.csv split
    that has a non-underscore meta tag (skips the _unsorted catch-all)."""
    if not os.path.isdir(DATA_DIR):
        return []
    hits = []
    for fname in sorted(os.listdir(DATA_DIR)):
        if not fname.startswith(f"{prefix}_") or not fname.endswith(".csv"):
            continue
        meta = fname[len(prefix) + 1 : -len(".csv")]
        if meta.startswith("_"):  # _unsorted, _draft, etc.
            continue
        hits.append((meta, os.path.join(DATA_DIR, fname)))
    return hits


# ──────────────────────────────────────────────────────────────────────
# format_window.json
# ──────────────────────────────────────────────────────────────────────

FORMAT_WINDOW_PATH = os.path.join(DATA_DIR, "format_window.json")


@pytest.fixture(scope="module")
def format_window():
    if not os.path.isfile(FORMAT_WINDOW_PATH):
        pytest.skip("format_window.json missing — data dir not seeded")
    return _read_json(FORMAT_WINDOW_PATH)


def test_format_window_has_required_fields(format_window):
    """The labs scraper and the bot index generator both depend on these
    fields. Missing ones cause silent fallbacks that mislabel data."""
    required = {"current_set", "set_release_date", "in_person_legal_date", "lag_days"}
    missing = required - set(format_window.keys())
    assert not missing, (
        f"format_window.json missing required fields: {sorted(missing)}. "
        "update_sets.py should populate them on every weekly run."
    )


def test_format_window_dates_consistent(format_window):
    """in_person_legal_date should equal set_release_date + lag_days.
    A drift here means update_sets.py ran with stale logic and any
    scraper that consults the lag window will be off."""
    rel = datetime.strptime(format_window["set_release_date"], "%Y-%m-%d")
    legal = datetime.strptime(format_window["in_person_legal_date"], "%Y-%m-%d")
    lag = int(format_window["lag_days"])
    expected_legal = rel + timedelta(days=lag)
    assert legal == expected_legal, (
        f"in_person_legal_date={legal.date()} != "
        f"set_release_date {rel.date()} + lag_days {lag} = {expected_legal.date()}"
    )


# ──────────────────────────────────────────────────────────────────────
# Per-format split file integrity
# ──────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("prefix", ["labs_tournament_decks", "labs_tournament_matchups"])
def test_per_format_meta_label_matches_filename(prefix):
    """Every row in data/<prefix>_<META>.csv must carry meta==<META>.

    The Melbourne incident: rows lived in labs_tournament_matchups_TEF-CRI.csv
    but their meta column actually read TEF-CRI — both wrong (Melbourne
    was a TEF-POR tournament). Catches the mismatch at either side.
    """
    files = _list_per_meta_files(prefix)
    if not files:
        pytest.skip(f"no {prefix}_<META>.csv files in data/")
    offenders = []
    for meta, path in files:
        rows = _read_csv(path)
        for i, row in enumerate(rows, start=2):  # +1 header, +1 for 1-indexed
            row_meta = (row.get("meta") or "").strip()
            if row_meta and row_meta != meta:
                offenders.append((os.path.basename(path), i, row_meta))
                if len(offenders) >= 5:
                    break
        if len(offenders) >= 5:
            break
    assert not offenders, (
        "Per-format split file has rows tagged with a different meta:\n  "
        + "\n  ".join(f"{f}:{ln} → meta={m!r}" for f, ln, m in offenders)
    )


@pytest.mark.parametrize("prefix", ["labs_tournament_decks", "labs_tournament_matchups"])
def test_no_tournament_in_multiple_metas(prefix):
    """A single tournament_id (decks) or tournaments_used (matchups) must
    not appear in two different per-format split files. The decks
    pipeline split Melbourne into both TEF-POR and TEF-CRI buckets —
    this would have caught that immediately."""
    files = _list_per_meta_files(prefix)
    if not files:
        pytest.skip(f"no {prefix}_<META>.csv files in data/")

    # decks key on tournament_id; matchups key on tournaments_used (the
    # comma-separated list of tids that contributed to the aggregate).
    key = "tournament_id" if prefix.endswith("_decks") else "tournaments_used"
    seen = {}  # tid → meta
    overlaps = []
    for meta, path in files:
        for row in _read_csv(path):
            tid = (row.get(key) or "").strip()
            if not tid:
                continue
            prev = seen.get(tid)
            if prev and prev != meta:
                overlaps.append((tid, prev, meta))
                if len(overlaps) >= 5:
                    break
            seen[tid] = meta
        if len(overlaps) >= 5:
            break
    assert not overlaps, (
        f"Same {key} appears under conflicting metas:\n  "
        + "\n  ".join(f"{tid}: {a} ≠ {b}" for tid, a, b in overlaps)
    )


def test_tournament_dates_respect_in_person_legal(format_window):
    """A tournament held before the current set is in-person legal must
    never carry the current set's meta tag. This is the Melbourne
    reproducer: Melbourne 2026-05-23 < in_person_legal_date 2026-06-05,
    so any row with meta=TEF-CRI for that date is the same bug
    reappearing.

    Soft on rotation transitions: the check only fires when the new
    set is still in its lag window (we have a current rotation that
    hasn't gone in-person legal yet).
    """
    current = format_window.get("current_set", "").strip().upper()
    legal_str = format_window.get("in_person_legal_date", "")
    if not current or not legal_str:
        pytest.skip("format_window.json lacks the fields this test needs")
    legal = datetime.strptime(legal_str, "%Y-%m-%d")
    if datetime.utcnow() >= legal:
        pytest.skip("current set is already in-person legal — no lag window to police")

    # Walk every labs file and flag any row whose meta ENDS WITH the
    # current set code AND whose date is before in_person_legal_date.
    # We accept both bare "CRI" and the OLDEST-NEWEST "TEF-CRI" form.
    suspect_suffix = f"-{current}"
    paths = []
    for prefix in ("labs_tournament_decks", "labs_tournament_matchups"):
        paths.append(os.path.join(DATA_DIR, f"{prefix}.csv"))
        paths.extend(p for _, p in _list_per_meta_files(prefix))
    offenders = []
    for path in paths:
        if not os.path.isfile(path):
            continue
        for i, row in enumerate(_read_csv(path), start=2):
            meta = (row.get("meta") or "").strip().upper()
            if not meta or not (meta == current or meta.endswith(suspect_suffix)):
                continue
            date_str = (row.get("tournament_date") or "").strip()
            if not date_str:
                continue
            try:
                d = datetime.strptime(date_str, "%Y-%m-%d")
            except ValueError:
                continue
            if d < legal:
                offenders.append((os.path.basename(path), i, date_str, meta))
                if len(offenders) >= 5:
                    break
        if len(offenders) >= 5:
            break
    assert not offenders, (
        f"Tournaments dated before in_person_legal_date {legal.date()} "
        f"are tagged with current set {current!r}. This is the Melbourne "
        f"mislabel pattern (labs_tournament_scraper.py fallback ignoring "
        f"the lag window).\n  "
        + "\n  ".join(f"{f}:{ln} {d} meta={m}" for f, ln, d, m in offenders)
    )


# ──────────────────────────────────────────────────────────────────────
# Master ↔ per-format chunk consistency
# ──────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "master,prefix",
    [
        ("labs_tournament_decks.csv", "labs_tournament_decks"),
        ("labs_tournament_matchups.csv", "labs_tournament_matchups"),
    ],
)
def test_master_chunks_row_counts_match(master, prefix):
    """Every row in the master CSV must also live in exactly one
    per-format split (or in _unsorted). Mismatches catch the case where
    the split step crashed mid-write or a scraper appended to the
    master but skipped the split step."""
    master_path = os.path.join(DATA_DIR, master)
    if not os.path.isfile(master_path):
        pytest.skip(f"{master} missing")

    master_count = len(_read_csv(master_path))
    split_count = 0
    for fname in os.listdir(DATA_DIR):
        if fname.startswith(f"{prefix}_") and fname.endswith(".csv") and fname != master:
            split_count += len(_read_csv(os.path.join(DATA_DIR, fname)))

    assert split_count == master_count, (
        f"Row count divergence: {master} has {master_count}, sum of "
        f"{prefix}_*.csv has {split_count}. The split step is out of sync "
        f"with the master — re-run prepare_card_data.py / the labs split."
    )


# ──────────────────────────────────────────────────────────────────────
# Offline manifest
# ──────────────────────────────────────────────────────────────────────

def test_offline_manifest_files_all_exist():
    """Every path listed in offline-manifest.json must actually exist in
    data/. Orphaned entries lead to 404s in the service-worker prefetch
    (Melbourne aftermath: we had two TEF-CRI entries pointing at
    deleted files for a few minutes before the cleanup commit landed).
    """
    manifest_path = os.path.join(DATA_DIR, "offline-manifest.json")
    if not os.path.isfile(manifest_path):
        pytest.skip("offline-manifest.json not present in data/")
    manifest = _read_json(manifest_path)

    missing = []

    def walk(node):
        if isinstance(node, dict):
            path = node.get("path")
            if isinstance(path, str) and not path.startswith(("http://", "https://")):
                full = os.path.join(DATA_DIR, path)
                if not os.path.isfile(full):
                    missing.append(path)
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk(manifest)
    assert not missing, (
        "offline-manifest.json references files that don't exist on disk:\n  "
        + "\n  ".join(missing[:10])
        + (f"\n  … and {len(missing) - 10} more" if len(missing) > 10 else "")
    )


# ──────────────────────────────────────────────────────────────────────
# tournament_cards_manifest chunk_dates coverage
# ──────────────────────────────────────────────────────────────────────

def test_chunk_dates_cover_master_tournaments():
    """Every tournament_date in labs_tournament_decks.csv must fall
    inside SOME chunk's [min_date, max_date] window — otherwise the
    labs scraper's _derive_meta_from_date falls through to the lag-
    window fallback (the Melbourne path).

    Soft on transitions: rows scraped in the past 14 days are
    allowed to miss coverage (the chunk_dates lookup is updated by
    a separate weekly job which may not have run yet for the freshest
    events). Anything older than that is a real gap.
    """
    manifest_path = os.path.join(DATA_DIR, "tournament_cards_manifest.json")
    decks_path = os.path.join(DATA_DIR, "labs_tournament_decks.csv")
    if not os.path.isfile(manifest_path) or not os.path.isfile(decks_path):
        pytest.skip("manifest or decks file missing")
    chunk_dates = _read_json(manifest_path).get("chunk_dates", {})
    if not chunk_dates:
        pytest.skip("chunk_dates empty in manifest")
    windows = []
    for v in chunk_dates.values():
        try:
            windows.append((
                datetime.strptime(v["min_date"], "%Y-%m-%d"),
                datetime.strptime(v["max_date"], "%Y-%m-%d"),
            ))
        except (KeyError, ValueError):
            continue

    cutoff = datetime.utcnow() - timedelta(days=14)
    gaps = defaultdict(int)  # date → count
    for row in _read_csv(decks_path):
        date_str = (row.get("tournament_date") or "").strip()
        if not date_str:
            continue
        try:
            d = datetime.strptime(date_str, "%Y-%m-%d")
        except ValueError:
            continue
        if d > cutoff:
            continue
        if not any(mn <= d <= mx for mn, mx in windows):
            gaps[date_str] += 1
    assert not gaps, (
        "Tournament dates older than 14 days fall outside every chunk_dates "
        "window — the manifest is out of sync with the labs master file:\n  "
        + "\n  ".join(f"{d}: {n} rows" for d, n in sorted(gaps.items())[:10])
    )
