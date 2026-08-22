#!/usr/bin/env python3
"""
Limitless Labs Major Tournament Scraper
Scrapes deck share data from labs.limitlesstcg.com for use in the Meta Call feature.

Output files (in project /data/):
  labs_tournaments.json        – index of scraped tournaments with metadata
  labs_tournament_decks.csv   – per-deck data rows across all tournaments

Usage examples:
  # All tournaments:
  python labs_tournament_scraper.py

  # Only from a specific date onwards:
  python labs_tournament_scraper.py --from-date 2025-01-01

  # Only regional + international:
  python labs_tournament_scraper.py --tournament-type regional international

  # Single tournament by ID:
  python labs_tournament_scraper.py --tournament-id 0061

  # Combine filters:
  python labs_tournament_scraper.py --from-date 2025-09-01 --tournament-type regional international worlds
"""

import argparse
import csv
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Set, Tuple

# Resolve project root so the scraper can be run from any working directory
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.normpath(os.path.join(_SCRIPT_DIR, '..', '..'))
_CORE_DIR = os.path.join(_SCRIPT_DIR, '..', 'core')
if _CORE_DIR not in sys.path:
    sys.path.insert(0, _CORE_DIR)

from card_scraper_shared import (
    setup_console_encoding,
    fetch_page_bs4,
    setup_logging,
    load_settings,
    get_data_dir,
    fix_mojibake,
)

setup_console_encoding()
logger = setup_logging("labs_tournament_scraper")

BASE_URL    = "https://labs.limitlesstcg.com"
DEFAULT_DELAY = 1.5  # seconds between requests

TOURNAMENT_TYPES = {"regional", "international", "special", "worlds"}

DEFAULT_SETTINGS = {
    "from_date": None,
    "tournament_types": None,
    "delay": DEFAULT_DELAY,
    "overwrite": False,
}

def _get_data_dir() -> str:
    try:
        return get_data_dir()
    except Exception:
        return os.path.join(_PROJECT_ROOT, "data")


# ── Per-meta split helpers (2026-05-24) ──────────────────────────────────────
#
# Without these the scraper re-pulls every tournament from labs.* on every
# weekly run — wasteful for closed metas (their data is frozen). The split
# mirrors the pattern tournament_cards_data_cards_<META>.csv uses:
#
#   data/labs_tournament_decks_<META>.csv      — frozen per closed meta
#   data/labs_tournament_matchups_<META>.csv   — frozen per closed meta
#   data/labs_tournament_decks.csv             — monolith for Meta Call (reassembled)
#   data/labs_tournament_matchups.csv          — monolith for Meta Call (reassembled)
#
# At run start: rebuild monoliths from chunks.
# Skip rule:  tournament with meta != current_meta AND id already in monolith → skip
# At run end: split monoliths back into per-meta chunks.

_META_DATE_LOOKUP: Optional[List[Tuple[datetime, datetime, str]]] = None


def _load_meta_date_lookup() -> List[Tuple[datetime, datetime, str]]:
    """Build (min_date, max_date, meta_key) tuples from
    tournament_cards_manifest.json's chunk_dates. Sorted by date-range width
    ASCENDING — narrower windows take precedence when overlaps exist (the
    historic SVI-ASC chunk e.g. spans 22 months because tournaments tagged
    with that format are scattered; the narrower BRS-TWM / BRS-SFA windows
    within that span are the correct answer for those dates)."""
    global _META_DATE_LOOKUP
    if _META_DATE_LOOKUP is not None:
        return _META_DATE_LOOKUP

    out: List[Tuple[datetime, datetime, str]] = []
    manifest_path = os.path.join(_get_data_dir(), 'tournament_cards_manifest.json')
    if not os.path.isfile(manifest_path):
        # Try project-root fallback (workflow seed step may not have copied it yet)
        manifest_path = os.path.join(_PROJECT_ROOT, 'data', 'tournament_cards_manifest.json')
    if not os.path.isfile(manifest_path):
        _META_DATE_LOOKUP = []
        return _META_DATE_LOOKUP
    try:
        with open(manifest_path, 'r', encoding='utf-8') as f:
            manifest = json.load(f)
        chunk_dates = manifest.get('chunk_dates', {})
        for chunk_name, dates in chunk_dates.items():
            meta = chunk_name.replace('tournament_cards_data_cards_', '').replace('.csv', '')
            mn = dates.get('min_date', '')
            mx = dates.get('max_date', '')
            if not mn or not mx:
                continue
            try:
                d_min = datetime.strptime(mn, '%Y-%m-%d')
                d_max = datetime.strptime(mx, '%Y-%m-%d')
            except ValueError:
                continue
            out.append((d_min, d_max, meta))
    except (json.JSONDecodeError, OSError):
        out = []

    # Narrower first
    out.sort(key=lambda r: (r[1] - r[0]).days)
    _META_DATE_LOOKUP = out
    return _META_DATE_LOOKUP


def _derive_meta_from_date(date_iso: str) -> str:
    """Map a tournament_date (ISO 'YYYY-MM-DD') to its meta key.
    Returns '' when no chunk's date-range contains the date — caller can
    then default to the current_set (from format_window.json) or skip."""
    if not date_iso:
        return ''
    try:
        d = datetime.strptime(date_iso, '%Y-%m-%d')
    except ValueError:
        return ''
    for d_min, d_max, meta in _load_meta_date_lookup():
        if d_min <= d <= d_max:
            return meta
    return ''


# ── Name-based meta derivation (cards-data crossreference) ────────────────────
#
# Background: labs /decks + /standings headers are JS-rendered, so static
# HTML scraping can't pull the tournament_date for ~60 historical entries.
# But tournament_cards_data_cards_<META>.csv files already carry
# (tournament_name, tournament_date, meta) tuples for the same events under
# a slightly different naming convention. We cross-reference labs' tournament
# name against those files to derive the meta tag without needing the date
# from labs.
#
# Coverage: 63/66 (95.5%) on the 2026-05-25 backfill. The 3 misses are real
# edge cases (newer tournaments not yet in cards data, or duplicates beyond
# what cards has).

# Worlds is named differently on each side: cards has "World Championships
# YYYY", labs has "World Championship CITY". This maps city → year so the
# two reconcile.
_WORLD_HOST_BY_CITY: Dict[str, str] = {
    'honolulu': '2024',
    'anaheim' : '2025',
}

# Labs began assigning IDs in late August 2024 (tid 0001 = Baltimore
# 2024-09-14). Cards entries before this can't possibly be a labs
# tournament, so filtering them out prevents older same-name events
# (e.g. Brisbane 2023) from getting matched to younger labs IDs.
_LABS_FOUNDING = datetime(2024, 8, 1)

_LABS_NAME_META_CACHE: Optional[Dict[str, Tuple[str, str]]] = None


def _parse_tournament_name_key(name: str) -> Optional[Tuple[str, str]]:
    """Normalize tournament_name → (class, city_key) so labs ('Regional
    Championship Birmingham') and cards ('Regional Birmingham – Limitless')
    reconcile to the same key. Returns None for names we can't classify
    (those rows just stay in _unsorted)."""
    if not name:
        return None
    n = re.sub(r'\s*[–—-]\s*Limitless\s*$', '', name).strip()
    # EUIC/NAIC/LAIC YYYY[–YR], City  (cards-side international naming)
    m = re.match(r'^(?:EUIC|NAIC|LAIC)\s+\d{4}(?:[–-]\d{2,4})?,\s*(.+)$', n)
    if m:
        return ('international', m.group(1).strip().lower())
    # International [Championship] City  (labs-side)
    m = re.match(r'^International(?:\s+Championship)?\s+(.+)$', n)
    if m:
        return ('international', m.group(1).strip().lower())
    # World Championships YYYY  (cards-side)
    m = re.match(r'^World Championships?\s+(\d{4})$', n)
    if m:
        return ('world', m.group(1))
    # World Championship City  (labs-side) — caller resolves city → year
    m = re.match(r'^World Championship\s+(.+)$', n)
    if m:
        return ('world-by-city', m.group(1).strip().lower())
    # Special Event City
    m = re.match(r'^Special Event\s+(.+)$', n)
    if m:
        city = m.group(1).strip().lower()
        if city == 'seville':       # Limitless spelling drift
            city = 'sevilla'
        return ('special', city)
    # Regional [Championship] City[, State]
    m = re.match(r'^Regional(?:\s+Championship)?\s+(.+)$', n)
    if m:
        city = re.sub(r',\s*[A-Z]{2}\s*$', '', m.group(1)).strip().lower()
        return ('regional', city)
    return None


def _parse_cards_human_date(raw: str) -> Optional[datetime]:
    """Cards CSV stores dates as '18th January 2025'. Strip ordinals + parse."""
    if not raw:
        return None
    cleaned = re.sub(r'(\d+)(st|nd|rd|th)', r'\1', raw).strip()
    for fmt in ('%d %B %Y', '%d %b %Y', '%Y-%m-%d'):
        try:
            return datetime.strptime(cleaned, fmt)
        except ValueError:
            continue
    return None


def _build_labs_name_meta_lookup(labs_tournaments: List[Dict]) -> Dict[str, Tuple[str, str]]:
    """Build {labs_tid: (meta, iso_date)} by matching labs tournaments
    against tournament_cards_data_cards_<META>.csv files.

    Two-pass matching:

    Pass 1 (unambiguous position match) — for each (class, city) key:
      • Filter cards entries to on/after _LABS_FOUNDING.
      • If the number of post-founding cards entries equals the number
        of same-name labs tids (or labs has just one tid), position-match
        by chronological order: lower labs tid → older cards entry.

    Pass 2 (chronological-neighbor disambiguation) — for the remaining
    "ambig" tids where labs_count != cards_count post-founding:
      • Estimate the labs tid's true date from its closest Pass-1-matched
        chronological neighbors (lower tid → older, higher tid → newer).
      • Among the still-available same-name cards entries, pick the one
        whose date falls within [prev_neighbor_date - 14d,
        next_neighbor_date + 14d]. 14-day slack handles back-to-back
        regionals on the same weekend.
      • If no candidate fits, the tid stays unmatched (→ _unsorted),
        signalling that cards data is incomplete for this event.

    Why this matters: an earlier single-pass position match silently
    misassigned 0019 Special Event San Juan (labs Feb 2025) to the only
    cards entry for that name (SVI-ASC March 2026), pushing 0056 (the
    actual March-2026 San Juan) out-of-bounds into _unsorted. The 2-pass
    algorithm gets both right by using the neighbor dates as anchors.
    """
    out: Dict[str, Tuple[str, str]] = {}
    data_dir = _get_data_dir()
    if not os.path.isdir(data_dir):
        return out

    # cards index: key -> sorted [(date_dt, meta, raw_name)]
    cards_idx: Dict[Tuple[str, str], List[Tuple[datetime, str, str]]] = {}
    for fname in sorted(os.listdir(data_dir)):
        if not (fname.startswith('tournament_cards_data_cards_') and fname.endswith('.csv')):
            continue
        meta = fname[len('tournament_cards_data_cards_'):-len('.csv')]
        path = os.path.join(data_dir, fname)
        try:
            seen_in_file: Set[str] = set()
            with open(path, 'r', encoding='utf-8-sig') as f:
                reader = csv.DictReader(f, delimiter=';')
                for row in reader:
                    raw_name = (row.get('tournament_name') or '').strip()
                    raw_date = (row.get('tournament_date') or '').strip()
                    if not raw_name or raw_name in seen_in_file:
                        continue
                    seen_in_file.add(raw_name)
                    key = _parse_tournament_name_key(raw_name)
                    if not key:
                        continue
                    d = _parse_cards_human_date(raw_date)
                    if not d:
                        continue
                    cards_idx.setdefault(key, []).append((d, meta, raw_name))
        except (OSError, csv.Error) as e:
            logger.warning("Could not read %s for name-meta lookup: %s", path, e)
            continue
    for k in cards_idx:
        cards_idx[k].sort(key=lambda x: x[0])

    def _resolve_lookup_key(parsed_key: Tuple[str, str]) -> Optional[Tuple[str, str]]:
        """Convert ('world-by-city', city) → ('world', year) via the
        host-city map; pass other key shapes through unchanged."""
        if parsed_key[0] == 'world-by-city':
            year = _WORLD_HOST_BY_CITY.get(parsed_key[1])
            return ('world', year) if year else None
        return parsed_key

    # labs index: parsed-key -> [tid] sorted ascending
    labs_by_key: Dict[Tuple[str, str], List[str]] = {}
    tid_to_key: Dict[str, Tuple[str, str]] = {}
    for t in labs_tournaments:
        tid = str(t.get('tournament_id') or '')
        if not tid:
            continue
        key = _parse_tournament_name_key(t.get('tournament_name') or '')
        if not key:
            continue
        labs_by_key.setdefault(key, []).append(tid)
        tid_to_key[tid] = key
    for k in labs_by_key:
        labs_by_key[k].sort()

    # Track which cards-entry indices have been consumed per lookup_key so
    # Pass 2 doesn't re-assign the same cards entry to two different labs.
    consumed: Dict[Tuple[str, str], Set[int]] = {}

    # ── Pass 1: position-match where labs/cards counts align ──────────
    ambig_tids: List[str] = []
    for parsed_key, tids in labs_by_key.items():
        lookup_key = _resolve_lookup_key(parsed_key)
        if not lookup_key:
            continue
        all_cands = cards_idx.get(lookup_key) or []
        post_founding = [(i, c) for i, c in enumerate(all_cands) if c[0] >= _LABS_FOUNDING]
        if not post_founding:
            continue
        if len(tids) == len(post_founding) or len(tids) == 1:
            for pos, tid in enumerate(tids):
                if pos >= len(post_founding):
                    continue
                orig_i, (d, meta, _raw) = post_founding[pos]
                out[tid] = (meta, d.strftime('%Y-%m-%d'))
                consumed.setdefault(lookup_key, set()).add(orig_i)
        else:
            ambig_tids.extend(tids)

    # ── Pass 2: disambiguate via chronological neighbors ──────────────
    # Snapshot Pass-1 assignments so newly-disambiguated tids don't
    # influence each other's neighbor lookups (avoids cascading errors
    # when several tids share the same ambig group).
    sorted_pass1 = sorted(out.keys())
    slack = timedelta(days=14)
    for tid in ambig_tids:
        parsed_key = tid_to_key.get(tid)
        if not parsed_key:
            continue
        lookup_key = _resolve_lookup_key(parsed_key)
        if not lookup_key:
            continue
        all_cands = cards_idx.get(lookup_key) or []
        taken = consumed.get(lookup_key) or set()
        avail = [(i, c) for i, c in enumerate(all_cands)
                 if i not in taken and c[0] >= _LABS_FOUNDING]
        if not avail:
            continue
        prev_d = next_d = None
        for st in reversed(sorted_pass1):
            if st < tid:
                _meta, dstr = out[st]
                if dstr:
                    try:
                        prev_d = datetime.strptime(dstr, '%Y-%m-%d')
                        break
                    except ValueError:
                        continue
        for st in sorted_pass1:
            if st > tid:
                _meta, dstr = out[st]
                if dstr:
                    try:
                        next_d = datetime.strptime(dstr, '%Y-%m-%d')
                        break
                    except ValueError:
                        continue
        lo = (prev_d - slack) if prev_d else None
        hi = (next_d + slack) if next_d else None
        for orig_i, (d, meta, _raw) in avail:
            if lo and d < lo:
                continue
            if hi and d > hi:
                continue
            out[tid] = (meta, d.strftime('%Y-%m-%d'))
            consumed.setdefault(lookup_key, set()).add(orig_i)
            break
        # else: tid stays out of `out` → caller routes it to _unsorted
    return out


def _load_in_person_legal_date() -> str:
    """ISO date string from format_window.json — the day from which the
    current EN set is tournament-legal in person. Empty when the field
    is missing (older format_window.json files without the lag
    column). Cached on first call."""
    global _IN_PERSON_LEGAL_DATE
    try:
        return _IN_PERSON_LEGAL_DATE  # type: ignore[name-defined]
    except NameError:
        pass
    legal = ''
    try:
        fw_path = os.path.join(_get_data_dir(), 'format_window.json')
        if not os.path.isfile(fw_path):
            fw_path = os.path.join(_PROJECT_ROOT, 'data', 'format_window.json')
        if os.path.isfile(fw_path):
            with open(fw_path, 'r', encoding='utf-8') as f:
                fw = json.load(f)
            legal = str(fw.get('in_person_legal_date') or '').strip()
    except (OSError, json.JSONDecodeError):
        legal = ''
    globals()['_IN_PERSON_LEGAL_DATE'] = legal
    return legal


def _previous_meta_for_date(date_iso: str) -> str:
    """The youngest meta whose chunk min_date is on-or-before `date_iso`.
    Used as the lag-window fallback so a tournament held BEFORE the
    current set becomes in-person legal lands in the previous bucket
    (e.g. Melbourne 2026-05-23 → TEF-POR), not in the just-released
    current bucket. Returns '' when no eligible chunk exists.

    Note we look at min_date (start of a set's tournament window), not
    max_date — the manifest's max_date for an active set keeps drifting
    as more tournaments are added, so a fresh in-window tournament can
    fall past max_date during the same scrape that created the bucket.
    min_date is stable.
    """
    if not date_iso:
        return ''
    try:
        d = datetime.strptime(date_iso, '%Y-%m-%d')
    except ValueError:
        return ''
    eligible = [(d_min, meta) for (d_min, _d_max, meta) in _load_meta_date_lookup() if d_min <= d]
    if not eligible:
        return ''
    eligible.sort(key=lambda x: x[0], reverse=True)  # youngest min_date first
    return eligible[0][1]


def _derive_meta_for_labs_tournament(
    tid: str,
    tournament_name: str,
    iso_date: str,
    labs_name_meta_lookup: Dict[str, Tuple[str, str]],
    current_meta: str,
) -> Tuple[str, str]:
    """Combined derivation: ISO date first (most reliable), then name-based
    cards lookup, then current_meta if at least the date is non-empty.
    Returns (meta, effective_iso_date) — effective_iso_date is non-empty
    when the cards lookup supplied a date that labs couldn't extract."""
    effective_date = (iso_date or '').strip()
    # 1. Date-based (works when labs gave us a parseable date)
    m = _derive_meta_from_date(effective_date) if effective_date else ''
    if m:
        return (m, effective_date)
    # 2. Name-based (cards-data crossreference)
    name_hit = labs_name_meta_lookup.get(str(tid) or '')
    if name_hit:
        derived_meta, derived_date = name_hit
        return (derived_meta, effective_date or derived_date)
    # 3. Empty date + no name match → leave for _unsorted UNLESS we have a
    # non-empty date that just doesn't fit any chunk window (brand-new
    # tournament in current set).
    #
    # CRITICAL: the new set isn't tournament-legal until
    # in_person_legal_date (release + lag_days). A tournament held in
    # the lag window belongs to the previous set's bucket. Without this
    # guard, fresh post-release/pre-legal tournaments get mislabeled
    # under the new set — e.g. Melbourne 2026-05-23 landed under
    # TEF-CRI even though CRI wasn't in-person legal until 2026-06-05
    # (see format_window.json's in_person_legal_date).
    if effective_date and current_meta:
        in_person_legal = _load_in_person_legal_date()
        if in_person_legal and effective_date < in_person_legal:
            prev_meta = _previous_meta_for_date(effective_date)
            if prev_meta:
                return (prev_meta, effective_date)
            # No previous chunk known either — punt to _unsorted rather
            # than guess. Better surfaces in operator review than a
            # silent mislabel. Log it so the operator notices the
            # punt instead of finding orphan rows in __unsorted weeks
            # later.
            logger.warning(
                "Tournament tid=%s name=%r date=%s sits in the in-person lag "
                "window (current set %r becomes legal %s) but no previous "
                "rotation chunk covers it either. Routing to _unsorted; "
                "manual classification needed.",
                tid, tournament_name, effective_date, current_meta, in_person_legal,
            )
            return ('', effective_date)
        return (current_meta, effective_date)
    # Kein Datum, kein Namenstreffer, kein current_meta: die Zeile geht
    # nach __unsorted. Das war bis zum 22.08.2026 der einzige Weg
    # dorthin, der SCHWEIGEND war — die Lag-Fenster-Meldung oben deckt
    # nur den Fall mit Datum ab. Gemessen: Turnier 0042 (Regional
    # Brisbane) und 0019 (Special Event San Juan) liegen seit dem
    # 25.05.2026 unsortiert, ohne dass irgendwo eine Zeile davon stand.
    # Der Labs-Index wird teilweise clientseitig gerendert; faellt das
    # Datum dabei aus, greift keine der drei Ableitungen.
    logger.warning(
        "Tournament tid=%s name=%r hat kein verwertbares Datum (Labs "
        "lieferte %r), keinen Namenstreffer in der Kartenuebersicht und "
        "kein current_meta. Geht nach __unsorted und wird beim naechsten "
        "Lauf erneut versucht.",
        tid, tournament_name, iso_date,
    )
    return ('', effective_date)


def _current_meta_key() -> str:
    """Read format_window.json and return the full OLDEST-NEWEST rotation key
    (e.g. 'TEF-CRI'). When the date-based lookup finds no chunk for a
    brand-new tournament in the current set, this becomes the bucket name so
    the new chunk follows the same OLDEST-NEWEST convention as every other
    per-meta CSV in data/. Falls back to bare current_set if oldest_legal_set
    is unset (legacy format_window.json without the new field)."""
    try:
        fw_path = os.path.join(_get_data_dir(), 'format_window.json')
        if not os.path.isfile(fw_path):
            fw_path = os.path.join(_PROJECT_ROOT, 'data', 'format_window.json')
        if not os.path.isfile(fw_path):
            return ''
        with open(fw_path, 'r', encoding='utf-8') as f:
            fw = json.load(f)
        current = str(fw.get('current_set') or '').strip().upper()
        oldest = str(fw.get('oldest_legal_set') or '').strip().upper()
        if oldest and current:
            return f'{oldest}-{current}'
        return current
    except (OSError, json.JSONDecodeError):
        return ''


def _active_in_person_meta_key() -> str:
    """The meta key that is actively producing in-person tournament data
    right now. Differs from `_current_meta_key()` only during the
    in-person lag window — between the day a new set becomes online-
    legal and the day it becomes in-person-legal. In that window:

      • `current_meta` = the just-released set (e.g. 'TEF-CRI')
      • `active_in_person_meta` = the PREVIOUS rotation (e.g. 'TEF-POR'),
        because that's still what every Regional / Special Event is
        playing.

    Once `in_person_legal_date` arrives, the two values converge.

    Why this matters: the skip-if-already-scraped logic uses
    `current_meta` to decide which already-on-disk tournaments to
    re-fetch each weekly run. Without this helper, the 14-day lag
    window FREEZES every previous-rotation tournament (no top-cut
    backfill, no Day-1 / Day-2 matchup matrix update) while ALSO
    finding no new tournaments under the new rotation key (no tids
    exist yet). The labs CSV stops growing for 2 weeks. This helper
    fixes that gap by treating the previous rotation as "current"
    until the in-person date flips."""
    current = _current_meta_key()
    legal = _load_in_person_legal_date()
    if legal:
        today = datetime.utcnow().strftime('%Y-%m-%d')
        if today < legal:
            prev = _previous_meta_for_date(today)
            if prev:
                return prev
    return current


def _list_labs_chunk_paths(prefix: str) -> List[str]:
    """Return all data/<prefix>_<META>.csv paths (project-root data/ dir)."""
    data_dir = _get_data_dir()
    paths: List[str] = []
    if not os.path.isdir(data_dir):
        return paths
    for fname in sorted(os.listdir(data_dir)):
        if fname.startswith(f'{prefix}_') and fname.endswith('.csv'):
            paths.append(os.path.join(data_dir, fname))
    return paths


def _reassemble_labs_monolith(prefix: str, header: List[str]) -> List[Dict]:
    """Concatenate all per-meta chunk rows into a single list. Used at the
    start of a run to learn which tournament_ids are already scraped (so
    we can skip closed-meta re-scrapes)."""
    rows: List[Dict] = []
    for chunk_path in _list_labs_chunk_paths(prefix):
        try:
            with open(chunk_path, 'r', encoding='utf-8-sig', newline='') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    # Defensive: backfill any missing keys with empty string
                    norm = {k: row.get(k, '') for k in header}
                    rows.append(norm)
        except OSError as e:
            logger.warning("Could not read %s: %s", chunk_path, e)
    return rows


def _split_labs_by_meta(rows: List[Dict], prefix: str, header: List[str]) -> Dict[str, int]:
    """Write rows back to per-meta chunks (data/<prefix>_<META>.csv).
    `meta` column on each row drives the bucket. Rows with empty meta
    are bucketed under '_unsorted' so they don't get silently dropped."""
    data_dir = _get_data_dir()
    os.makedirs(data_dir, exist_ok=True)
    by_meta: Dict[str, List[Dict]] = {}
    for row in rows:
        meta = (row.get('meta') or '').strip() or '_unsorted'
        by_meta.setdefault(meta, []).append(row)
    counts: Dict[str, int] = {}
    for meta, bucket in by_meta.items():
        out_path = os.path.join(data_dir, f'{prefix}_{meta}.csv')
        with open(out_path, 'w', encoding='utf-8', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=header, extrasaction='ignore')
            writer.writeheader()
            writer.writerows(bucket)
        counts[meta] = len(bucket)
        logger.info("  → %s: %d rows", os.path.basename(out_path), len(bucket))
    return counts


# ── ID-walk discovery (backfill — 2026-05-24) ────────────────────────────────
#
# The labs index page only lists the most-recent tournaments. To backfill
# historical labs IDs (0001..0066) we walk the ID space and probe each
# /standings page. 200 OK → tournament exists, 404 → skip.
# Used with the --id-range CLI flag.

def discover_tournament_ids_by_walk(from_id: int, to_id: int, delay: float = 0.5) -> List[str]:
    """Probe sequential 4-digit IDs and return those that have a /standings
    page. Used for historical backfill when the labs index doesn't list
    older tournaments."""
    found: List[str] = []
    logger.info("Walking labs tournament IDs %04d..%04d (probing /standings)", from_id, to_id)
    for n in range(from_id, to_id + 1):
        tid = str(n).zfill(4)
        soup = fetch_page_bs4(f"{BASE_URL}/{tid}/standings")
        if soup:
            found.append(tid)
            logger.info("  [%s] exists", tid)
        time.sleep(delay)
    logger.info("Walk complete — %d tournaments found in range", len(found))
    return found


# ── Date helpers ──────────────────────────────────────────────────────────────

def _parse_date(raw: str) -> Optional[datetime]:
    """Parse date strings like 'April 4–5, 2026', 'April 4, 2026', 'Apr 4 2026'."""
    if not raw:
        return None
    # Repair mojibake first so the en-dash matches the range pattern.
    cleaned_input = fix_mojibake(raw)
    # Strip the second half of a date range. Two flavours occur in the
    # wild on Limitless:
    #   "April 25\u201326, 2026"            (same month \u2014 strip "\u201326")
    #   "February 27\u2013March 1, 2026"    (cross-month \u2014 strip "\u2013March 1")
    # The combined regex tolerates an optional month-name word between
    # the dash and the trailing digits.
    cleaned = re.sub(r'[\u2013\u2014\-]\s*[A-Za-z]*\s*\d+', '', cleaned_input).strip()
    cleaned = ' '.join(cleaned.split())
    for fmt in ('%B %d, %Y', '%b %d, %Y', '%B %d %Y', '%b %d %Y'):
        try:
            return datetime.strptime(cleaned, fmt)
        except ValueError:
            continue
    logger.debug("Could not parse date: %r (cleaned: %r)", raw, cleaned)
    return None


# Month-name pattern used to locate the date NavigableString anywhere
# inside a tournament link. Tolerates both full ("April") and 3-letter
# ("Apr") forms; case-insensitive.
_DATE_TEXT_RE = re.compile(
    r'\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|'
    r'Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|'
    r'Dec(?:ember)?)\s+\d',
    re.I,
)


# ── Tournament list ───────────────────────────────────────────────────────────

def _extract_tournament_type(img_src: str) -> str:
    """Derive tournament type from the logo image filename."""
    filename = img_src.rsplit('/', 1)[-1].replace('.png', '').lower()
    return filename if filename in TOURNAMENT_TYPES else 'other'


def _load_cached_tournament_index() -> List[Dict]:
    """Load labs_tournaments.json — the previously-scraped tournament
    index. Used as a fallback when the live index page is blocked."""
    cache_path = os.path.join(_get_data_dir(), 'labs_tournaments.json')
    if not os.path.isfile(cache_path):
        return []
    try:
        with open(cache_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        if not isinstance(data, list):
            return []
        # Defensive: ensure each row has the keys downstream expects
        out: List[Dict] = []
        for row in data:
            if not isinstance(row, dict):
                continue
            tid = str(row.get('tournament_id') or '').strip()
            if not tid:
                continue
            out.append({
                'tournament_id'  : tid,
                'tournament_name': row.get('tournament_name', f'Tournament {tid}'),
                'tournament_date': row.get('tournament_date', ''),
                'tournament_type': row.get('tournament_type', 'regional'),
                'country'        : row.get('country', ''),
                # Preserve total_players so the next run can tell
                # "previously-scraped, real data" apart from
                # "previously-scraped, mid-tournament 0-row response".
                # The zero-player re-add pass below uses this.
                'total_players'  : int(row.get('total_players') or 0),
            })
        return out
    except (json.JSONDecodeError, OSError) as e:
        logger.warning("Could not load cached tournament index: %s", e)
        return []


def _filter_cached_tournaments(
    rows: List[Dict],
    from_date: Optional[datetime],
    tournament_types: Optional[List[str]],
) -> List[Dict]:
    """Re-apply the date/type filters scrape_tournament_list normally
    enforces — needed when the cached list bypasses them."""
    out: List[Dict] = []
    for r in rows:
        if tournament_types and r.get('tournament_type') not in tournament_types:
            continue
        if from_date:
            d = _parse_date(r.get('tournament_date') or '')
            if d and d < from_date:
                continue
        out.append(r)
    return out


def scrape_tournament_list(
    from_date: Optional[datetime] = None,
    tournament_types: Optional[List[str]] = None,
) -> List[Dict]:
    """
    Fetch the main labs page and return a list of tournament dicts.
    Applies date and type filters when provided.

    Cache-fallback (2026-05-24): when the index fetch returns nothing
    (Cloudflare bot-detect blocking the root page), load the previously
    persisted labs_tournaments.json so per-tournament pages can still
    be attempted. This lets the scraper keep refreshing decks for known
    tournaments even when Limitless temporarily blocks the index page.
    """
    logger.info("Fetching tournament index from %s", BASE_URL)
    soup = fetch_page_bs4(BASE_URL)
    if not soup:
        logger.error("Failed to fetch tournament list — index page blocked")
        cached = _load_cached_tournament_index()
        if cached:
            logger.warning(
                "Falling back to %d cached tournaments from labs_tournaments.json",
                len(cached),
            )
            return _filter_cached_tournaments(cached, from_date, tournament_types)
        return []

    tournaments: List[Dict] = []

    # Every tournament is an <a> linking to /XXXX/standings
    for link in soup.select('a[href]'):
        href = link.get('href', '')
        m = re.match(r'^/(\d+)/standings', href)
        if not m:
            continue
        tournament_id = m.group(1)

        # ── Name ──────────────────────────────────────────────────────────────
        # _fix_mojibake repairs UTF-8 served-as-Latin-1 corruption (e.g.
        # "QuerÃ©taro" → "Querétaro", "GdaÅsk" → "Gdańsk") on the index
        # page so the names downstream don't carry the mojibake all the
        # way into the field-card UI.
        name_el = link.find(attrs={'class': re.compile(r'font-bold')})
        raw_name = name_el.get_text(strip=True) if name_el else f'Tournament {tournament_id}'
        name = fix_mojibake(raw_name)

        # ── Type logo (larger image) ──────────────────────────────────────────
        tournament_type = 'regional'
        all_imgs = link.find_all('img')
        flag_img = None
        for img in all_imgs:
            src = img.get('src', '')
            if 'tournaments' in src:
                tournament_type = _extract_tournament_type(src)
            if 'flags' in src:
                flag_img = img

        # ── Country code ──────────────────────────────────────────────────────
        country = ''
        if flag_img:
            country = flag_img.get('alt') or flag_img.get('title') or ''

        # ── Date ──────────────────────────────────────────────────────────────
        # Limitless changed the index HTML in 2026-04: the date now lives
        # inside an inner div ("flex gap-2 items-center") wrapped in an
        # outer div ("flex flex-col gap-1") that ALSO has class "flex...gap".
        # The previous selector grabbed the OUTER wrapper which has no
        # NavigableString date children — only nested <div>s. Result:
        # date_text was empty, _parse_date returned None, the date filter
        # short-circuited (None is falsy), and EVERY tournament leaked
        # through the filter.
        #
        # New strategy: walk all NavigableString descendants of the link
        # and grab the first one matching a month-name pattern. Resilient
        # to further HTML restructures as long as the date stays in
        # human-readable "Month D[, Y]" prose.
        from bs4 import NavigableString
        date_text = ''
        for el in link.descendants:
            if isinstance(el, NavigableString):
                txt = str(el).strip()
                if txt and _DATE_TEXT_RE.search(txt):
                    date_text = txt
                    break

        date_obj = _parse_date(date_text)
        date_str = date_obj.strftime('%Y-%m-%d') if date_obj else ''

        # ── Filters ───────────────────────────────────────────────────────────
        # Strict mode when from_date is set: a tournament with no parseable
        # date is excluded. Earlier this was silently let through, which
        # combined with a broken date parser meant the scraper hit every
        # major in the archive instead of just the recent ones. If the
        # parser breaks again, the user sees zero rows + a warning rather
        # than a silent multi-hour scrape.
        if from_date and not date_obj:
            logger.warning("Skip %s (%s) – no parseable date (raw: %r)",
                           name, tournament_id, date_text)
            continue
        if from_date and date_obj and date_obj < from_date:
            logger.debug("Skip %s (%s) – before %s", name, date_str, from_date.date())
            continue

        if tournament_types and tournament_type not in tournament_types:
            logger.debug("Skip %s – type %r not in filter", name, tournament_type)
            continue

        tournaments.append({
            'tournament_id'  : tournament_id,
            'tournament_name': name,
            'tournament_date': date_str,
            'tournament_type': tournament_type,
            'country'        : country,
        })
        logger.info("  [%s] %s – %s (%s, %s)", tournament_id, name, date_str, tournament_type, country)

    logger.info("Tournaments matched: %d", len(tournaments))
    return tournaments


# ── Deck data for one tournament ──────────────────────────────────────────────

def _extract_meta_from_soup(soup, out: Dict[str, str]) -> None:
    """Pull tournament_name + tournament_date out of a /decks or /standings
    BeautifulSoup. Mutates `out` in place; only fills missing keys so the
    first source (usually /decks) wins on duplicates.

    Strategy for the date — three layered fallbacks, each tolerant of
    Limitless layout variations:
      1. Walk every NavigableString and try _DATE_TEXT_RE (the same
         permissive month-name pattern the index parser uses — full or
         abbreviated month, case-insensitive).
      2. Search the full body text for "Month Day[, Year]" (handles dates
         that sit inside elements with sibling text rather than alone).
      3. Last-ditch: look for an ISO YYYY-MM-DD anywhere in the body
         (some archive pages embed the start date as a data attribute or
         JSON blob rendered into the DOM).
    """
    from bs4 import NavigableString

    # Title: "Decks: Regional Championship Prague – Limitless Labs"
    title_el = soup.find('title')
    if title_el:
        title = title_el.get_text(strip=True)
        if 'Limitless' in title:
            head = title.rsplit('Limitless', 1)[0]
            head = head.rstrip(' \t–—-â\x80\x93\x94')
            head = re.sub(r'\s*[âÂ\x80-\x9f]+\s*$', '', head).strip()
            m = re.match(r'(?:Decks|Standings|Pairings|Metagame):\s*(.+)', head)
            cleaned = (m.group(1).strip() if m else head)
            cleaned = fix_mojibake(cleaned)
            if cleaned and not out.get('tournament_name'):
                out['tournament_name'] = cleaned
    h1 = soup.find('h1')
    if h1:
        h1_text = h1.get_text(strip=True)
        if h1_text:
            out['tournament_name'] = fix_mojibake(h1_text)

    if out.get('tournament_date'):
        return

    # 1. NavigableString walk (most reliable when the date sits in its
    # own element — the typical "April 25–26, 2026 • 1370 players" header).
    for el in soup.descendants:
        if isinstance(el, NavigableString):
            txt = str(el).strip()
            if txt and _DATE_TEXT_RE.search(txt):
                date_obj = _parse_date(txt)
                if date_obj:
                    out['tournament_date'] = date_obj.strftime('%Y-%m-%d')
                    return

    # 2. Full body scan with a broader regex (abbreviated months OK).
    body_text = soup.get_text(' ', strip=True)
    body_match = re.search(
        r'((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|'
        r'Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|'
        r'Dec(?:ember)?)\s+\d{1,2}(?:[–—\-]\d{1,2})?(?:,)?\s*(?:20\d{2})?)',
        body_text,
        re.I,
    )
    if body_match:
        date_obj = _parse_date(body_match.group(1))
        if date_obj:
            out['tournament_date'] = date_obj.strftime('%Y-%m-%d')
            return

    # 3. ISO date anywhere in the page (data attributes, JSON-LD, etc.)
    iso = re.search(r'\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b', body_text)
    if iso:
        out['tournament_date'] = iso.group(0)


def scrape_tournament_meta(tournament_id: str) -> Dict[str, str]:
    """Fetch the tournament's display name + date from its labs page.

    Used in --tournament-id and --id-range modes where the caller only
    knows the numeric ID. Tries /decks first; if the date can't be
    extracted (older archive pages sometimes render a stripped header),
    falls back to /standings as a second source. Returns {} when both
    pages 404 — the caller's defaults (e.g. "Tournament 0062") then stay.

    When the date can't be extracted from either page, logs a short body
    excerpt from each so we can see what's actually rendered (vs. the
    layout the parser expects) and iterate on the regexes.
    """
    out: Dict[str, str] = {}
    body_samples: List[str] = []  # for diagnostic logging on failure

    soup = fetch_page_bs4(f"{BASE_URL}/{tournament_id}/decks")
    if soup:
        _extract_meta_from_soup(soup, out)
        if 'tournament_date' not in out:
            body_samples.append('/decks: ' + soup.get_text(' ', strip=True)[:600])

    # Some historical tournaments (pre-2025) render /decks with no
    # parseable date in the header. /standings often still carries it.
    if 'tournament_date' not in out:
        soup_st = fetch_page_bs4(f"{BASE_URL}/{tournament_id}/standings")
        if soup_st:
            _extract_meta_from_soup(soup_st, out)
            if 'tournament_date' not in out:
                body_samples.append('/standings: ' + soup_st.get_text(' ', strip=True)[:600])

    if 'tournament_date' not in out and body_samples:
        for sample in body_samples:
            logger.warning("  [%s] no date in body — sample: %s", tournament_id, sample)

    return out


def scrape_tournament_decks(tournament_id: str) -> Tuple[List[Dict], int]:
    """
    Scrape the /decks page for a single tournament, then merge in
    conversion-rate data from /decks?conversion.

    Returns (deck_rows, total_player_count). Each deck dict is augmented
    with `top8_conv_rate`, `top16_conv_rate`, `top32_conv_rate` (0..1
    fractions; missing columns stay 0.0).
    """
    url = f"{BASE_URL}/{tournament_id}/decks"
    logger.info("  Fetching %s", url)
    soup = fetch_page_bs4(url)
    if not soup:
        logger.warning("  Failed to fetch %s", url)
        return [], 0

    table = soup.find('table', attrs={'class': re.compile(r'data-table')})
    if not table:
        logger.warning("  No data-table found for tournament %s", tournament_id)
        return [], 0

    decks: List[Dict] = []
    total_players = 0

    for row in table.select('tbody tr'):
        cells = row.find_all('td')
        if len(cells) < 5:
            continue

        # ── Cell 0: Pokémon images ─────────────────────────────────────────
        pokemon_names = [img.get('alt', '').strip()
                         for img in cells[0].find_all('img', class_='pokemon')]

        # ── Cell 1: Player count (players using this deck) ─────────────────
        count_text = cells[1].get_text(strip=True)
        try:
            player_count = int(count_text)
        except ValueError:
            logger.debug("  Skipping row – non-numeric count: %r", count_text)
            continue

        # ── Cell 2: Deck name + slug ───────────────────────────────────────
        deck_link = cells[2].find('a')
        if not deck_link:
            continue
        deck_name = deck_link.get_text(strip=True)
        deck_href = deck_link.get('href', '')
        deck_slug = deck_href.rsplit('/', 1)[-1]

        # ── Cell 3: Meta share % ───────────────────────────────────────────
        share_text = cells[3].get_text(strip=True).replace('%', '').strip()
        try:
            share_pct = round(float(share_text), 4)
        except ValueError:
            share_pct = 0.0

        # ── Cell 4: W-L-T record ──────────────────────────────────────────
        record_text = cells[4].get_text(strip=True)
        wins = losses = ties = 0
        rm = re.match(r'(\d+)\s*-\s*(\d+)\s*-\s*(\d+)', record_text)
        if rm:
            wins, losses, ties = int(rm.group(1)), int(rm.group(2)), int(rm.group(3))

        # ── Cell 5: Win % ─────────────────────────────────────────────────
        win_pct = 0.0
        if len(cells) > 5:
            wp_text = cells[5].get_text(strip=True).replace('%', '').strip()
            try:
                win_pct = round(float(wp_text), 4)
            except ValueError:
                pass

        total_players += player_count
        decks.append({
            'deck_name'      : deck_name,
            'deck_slug'      : deck_slug,
            'pokemon'        : ', '.join(pokemon_names),
            'player_count'   : player_count,
            'share_pct'      : share_pct,
            'wins'           : wins,
            'losses'         : losses,
            'ties'           : ties,
            'win_pct'        : win_pct,
            'top8_conv_rate' : 0.0,
            'top16_conv_rate': 0.0,
            'top32_conv_rate': 0.0,
            # Day-1 / Day-2 split (populated below from the per-day tabs).
            'day1_players'      : 0,
            'day1_share_pct'    : 0.0,
            'day1_wins'         : 0,
            'day1_losses'       : 0,
            'day1_ties'         : 0,
            'day1_win_pct'      : 0.0,
            'day2_players'      : 0,
            'day2_share_pct'    : 0.0,
            'day2_wins'         : 0,
            'day2_losses'       : 0,
            'day2_ties'         : 0,
            'day2_win_pct'      : 0.0,
            'day1_to_day2_conv' : 0.0,
            # Top-cut placement counts — populated from /standings below.
            # `top1_count` is the strongest predictor of next-event share
            # bumps when paired with a low `share_pct` (cf. Campinas
            # 2026: Ogerpon Meganium won at 2.6 % usage → Indianapolis
            # ~7.9 %). See Predictor 4.6 in app-meta-call.js.
            'top1_count'        : 0,
            'top4_count'        : 0,
            'top8_count'        : 0,
        })

    # ── Merge in conversion-rate data ────────────────────────────────────
    conv_data = scrape_tournament_conversion(tournament_id)
    if conv_data:
        merged = 0
        for deck in decks:
            slug = deck['deck_slug']
            if slug in conv_data:
                deck.update(conv_data[slug])
                merged += 1
        logger.info("  → conv-rates merged for %d/%d decks", merged, len(decks))

    # ── Merge in Day-1 + Day-2 splits (separate tabs on labs) ────────────
    day1_data = scrape_tournament_day(tournament_id, 'day1')
    if day1_data:
        merged = 0
        for deck in decks:
            slug = deck['deck_slug']
            if slug in day1_data:
                d = day1_data[slug]
                deck['day1_players']   = d.get('player_count', 0)
                deck['day1_share_pct'] = d.get('share_pct', 0.0)
                deck['day1_wins']      = d.get('wins', 0)
                deck['day1_losses']    = d.get('losses', 0)
                deck['day1_ties']      = d.get('ties', 0)
                deck['day1_win_pct']   = d.get('win_pct', 0.0)
                merged += 1
        logger.info("  → Day-1 split merged for %d/%d decks", merged, len(decks))

    day2_data = scrape_tournament_day(tournament_id, 'day2')
    if day2_data:
        merged = 0
        for deck in decks:
            slug = deck['deck_slug']
            if slug in day2_data:
                d = day2_data[slug]
                deck['day2_players']   = d.get('player_count', 0)
                deck['day2_share_pct'] = d.get('share_pct', 0.0)
                deck['day2_wins']      = d.get('wins', 0)
                deck['day2_losses']    = d.get('losses', 0)
                deck['day2_ties']      = d.get('ties', 0)
                deck['day2_win_pct']   = d.get('win_pct', 0.0)
                merged += 1
        logger.info("  → Day-2 split merged for %d/%d decks", merged, len(decks))

    # Compute Day-1 → Day-2 conversion per deck. Conversion comes directly
    # from the labs Conversion tab when scrape_tournament_conversion ran;
    # if that didn't capture it but we have both day counts, derive it.
    for deck in decks:
        if deck['day1_to_day2_conv'] > 0:
            continue  # already captured from the conversion tab
        if deck['day1_players'] > 0 and deck['day2_players'] >= 0:
            deck['day1_to_day2_conv'] = round(deck['day2_players'] / deck['day1_players'], 4)

    # ── Merge in Top-1 / Top-4 / Top-8 finish counts from /standings ─────
    # Used by Predictor 4.6 (Underdog-Champion-Boost) to forecast the
    # share spike that follows a low-play-rate regional win.
    standings = scrape_tournament_standings(tournament_id)
    if standings:
        merged = 0
        for deck in decks:
            slug = deck['deck_slug']
            if slug in standings:
                deck.update(standings[slug])
                merged += 1
        logger.info("  → top-cut counts merged for %d/%d decks", merged, len(decks))

    logger.info("  → %d decks, %d total players", len(decks), total_players)
    return decks, total_players


# ── Conversion-rate page parser ──────────────────────────────────────────────

# Column-header → output-key mapping. Limitless may use any subset; missing
# columns just stay at 0.0 in the deck dict. Header text is matched
# case-insensitively after stripping % signs and whitespace.
#
# Some columns hold integer player counts (Day 1 / Day 2), others hold
# percentages (Day-1 → Day-2 conversion). The mapping value is
# `(output_key, kind)` where kind is 'pct' (0..1 fraction) or 'int'.
#
# As of 2026-04, the live `/decks?conversion` page exposes only:
#     Deck | Day 1 | Day 2 | Conversion
# i.e. Day-1 player count, Day-2 player count, and the Day-1 → Day-2
# conversion rate. There is NO Top-8 / Top-16 / Top-32 conversion
# column on this page anymore (it may have existed historically — the
# old mappings were just dead matches and produced 0 for every row).
#
# Cut-performance amplification (= "did this deck overperform in the
# top cut") is therefore handled FRONTEND-SIDE in Predictor 4.4b
# (see js/app-meta-call.js _labsQualityByDeck) which derives the
# signal from `day2_share_pct / day1_share_pct`. The CSV column
# `top8_conv_rate` stays in the schema for backward compat but is
# expected to be 0 until/unless we add a standings-page scraper that
# counts each deck's Top-8 placements explicitly.
_CONV_HEADER_KEYS = {
    # Day-1 → Day-2 conversion view (only live conv-relevant columns).
    'day 1':        ('day1_players',       'int'),
    'day1':         ('day1_players',       'int'),
    'day 2':        ('day2_players',       'int'),
    'day2':         ('day2_players',       'int'),
    'conversion':   ('day1_to_day2_conv',  'pct'),
}


def _parse_pct_to_fraction(txt: str) -> float:
    """'15.6%' / '15,6 %' / '0.156' → 0.156 (clipped to 0..1)."""
    if not txt:
        return 0.0
    cleaned = txt.replace('%', '').replace(',', '.').strip()
    try:
        v = float(cleaned)
    except ValueError:
        return 0.0
    # Heuristic: values > 1 are percentage points; convert to fraction.
    if v > 1.0:
        v = v / 100.0
    return max(0.0, min(1.0, round(v, 4)))


def _parse_int_count(txt: str) -> int:
    """'188' / '1,300' / '—' → integer (0 on failure)."""
    if not txt:
        return 0
    cleaned = txt.replace(',', '').replace('.', '').strip()
    if not cleaned or not cleaned.isdigit():
        return 0
    try:
        return int(cleaned)
    except ValueError:
        return 0


def scrape_tournament_conversion(tournament_id: str) -> Dict[str, Dict[str, float]]:
    """
    Fetch labs.limitlesstcg.com/{id}/decks?conversion and return
    { deck_slug: { 'top8_conv_rate': ..., 'day1_players': ..., 'day2_players': ...,
                   'day1_to_day2_conv': ..., ... } }.

    Defensive parser: discovers conversion columns from <th> headers.
    On first run logs the headers it found, so any unexpected column
    naming on a future tournament becomes visible. Returns empty dict
    on failure (caller treats missing data as 0.0).

    Output values are floats for percentages and ints for raw counts —
    the column kind comes from _CONV_HEADER_KEYS.
    """
    url = f"{BASE_URL}/{tournament_id}/decks?conversion"
    logger.info("    Fetching conversion: %s", url)
    soup = fetch_page_bs4(url)
    if not soup:
        logger.warning("    Conversion page fetch failed for %s — skipping", tournament_id)
        return {}

    table = soup.find('table', attrs={'class': re.compile(r'data-table')})
    if not table:
        logger.warning("    No conversion table found for %s", tournament_id)
        return {}

    # Map column index → (output key, kind) based on header text.
    headers_raw = [th.get_text(strip=True) for th in table.select('thead th')]
    logger.info("    Conversion headers: %s", headers_raw)
    col_keys: Dict[int, Tuple[str, str]] = {}
    for i, h in enumerate(headers_raw):
        norm = h.lower().replace('%', '').strip()
        for hint, mapping in _CONV_HEADER_KEYS.items():
            if hint in norm:
                col_keys[i] = mapping
                break

    if not col_keys:
        logger.warning(
            "    No recognised conversion columns in %s — headers were %s. "
            "Add the new header text to _CONV_HEADER_KEYS.", tournament_id, headers_raw
        )
        return {}
    logger.info("    Conversion column mapping: %s", {headers_raw[i]: m for i, m in col_keys.items()})

    out: Dict[str, Dict[str, float]] = {}
    for row in table.select('tbody tr'):
        cells = row.find_all('td')
        if len(cells) < max(col_keys.keys()) + 1:
            continue
        # Find the deck slug — the deck-name cell carries an <a href=".../deck-slug">.
        slug = ''
        for c in cells:
            a = c.find('a', href=True)
            if a and '/' in a['href']:
                slug = a['href'].rsplit('/', 1)[-1]
                if slug:
                    break
        if not slug:
            continue
        entry: Dict[str, float] = {}
        for idx, (key, kind) in col_keys.items():
            txt = cells[idx].get_text(strip=True)
            entry[key] = _parse_int_count(txt) if kind == 'int' else _parse_pct_to_fraction(txt)
        if entry:
            out[slug] = entry

    logger.info("    Conversion: %d decks parsed", len(out))
    return out


# Pre-compiled regex for the embedded deck-data JSON blob. The Day-1/Day-2
# pages render the OVERALL share in the visible table (so HTML-table
# parsing was wrong); the day-specific share + record live in a Vue/Nuxt
# data-blob inside the page where each deck appears as:
#   {"identifier":"...","name":"...","players":N,"day2s":M,"wins":...,
#    "losses":...,"ties":...,"records":"{\"1\":{...},\"2\":{...}}"}
# `players` is the Day-1 player count, `day2s` is the Day-2 player count.
# We match the records-block by spelling out its full nested shape so the
# inner braces don't trip a non-greedy `.*?` (which would stop at the first
# `}` and lose the per-day W-L-T entirely).
# Outer fields use single-level escaping (\"foo\":\"bar\"), but the
# `records` field is itself a JSON-string-inside-JSON-string, so its
# inner quotes are doubly escaped as \\\". Both levels are matched
# explicitly here so we never silently fall back to mangled data.
_DAY_BLOB_PATTERN = re.compile(
    r'\\"identifier\\":\\"(?P<id>.+?)\\".*?'
    r'\\"players\\":(?P<day1_players>\d+),'
    r'\\"day2s\\":(?P<day2_players>\d+),'
    r'\\"wins\\":\d+,'
    r'\\"losses\\":\d+,'
    r'\\"ties\\":\d+,'
    r'\\"records\\":\\"\{'
    r'\\\\\\"1\\\\\\":\{\\\\\\"wins\\\\\\":(?P<d1_w>\d+),\\\\\\"losses\\\\\\":(?P<d1_l>\d+),\\\\\\"ties\\\\\\":(?P<d1_t>\d+)\},'
    r'\\\\\\"2\\\\\\":\{\\\\\\"wins\\\\\\":(?P<d2_w>\d+),\\\\\\"losses\\\\\\":(?P<d2_l>\d+),\\\\\\"ties\\\\\\":(?P<d2_t>\d+)\}'
    r'\}\\"',
    re.DOTALL,
)


# ── Standings page parser — Top-1 / Top-4 / Top-8 counts per deck ────────────
#
# The /standings page lists every Day-2 finisher in placement order with
# a column linking to the deck profile (same slug we use on /decks). We
# walk the first N rows (N = 8 by default), bucket by deck_slug, and
# count Top-1 / Top-4 / Top-8 finishes per deck. Output drops into
# `scrape_tournament_decks` as three extra columns per row.
#
# Why parse this here instead of deriving from the deck-page rollup:
# the /decks rollup tells you the deck's *aggregate* win rate, not who
# actually won. The Underdog-Champion-Boost predictor (Predictor 4.6 in
# app-meta-call.js) specifically needs "did this deck WIN the event at
# low play rate" — which is only knowable from /standings. Campinas
# 2026 → Indianapolis surge was the textbook case.
#
# Defensive parser: discovers the "Place" column by header text so a
# layout shuffle on the labs side doesn't silently mis-attribute wins
# to the wrong deck.

def scrape_tournament_standings(tournament_id: str, top_n: int = 8) -> Dict[str, Dict[str, int]]:
    """
    Fetch labs.limitlesstcg.com/{id}/standings and return
    { deck_slug: { 'top1_count': int, 'top4_count': int, 'top8_count': int } }
    for the top-N finishers (default 8).

    Returns empty dict on fetch / parse failure. Caller treats missing
    keys as 0 across all three counts.
    """
    url = f"{BASE_URL}/{tournament_id}/standings"
    logger.info("    Fetching standings: %s", url)
    soup = fetch_page_bs4(url)
    if not soup:
        logger.warning("    Standings fetch failed for %s — skipping top-cut signal", tournament_id)
        return {}

    table = soup.find('table', attrs={'class': re.compile(r'data-table')})
    if not table:
        logger.warning("    No standings data-table found for %s", tournament_id)
        return {}

    # Find the Place / # column by header text. Labs has used both
    # variants over time; default to col 0 if neither matches.
    headers_raw = [th.get_text(strip=True).lower() for th in table.select('thead th')]
    place_col = None
    for i, h in enumerate(headers_raw):
        h_clean = h.strip(' #')
        if h_clean in ('place', 'rank', 'pos', 'position') or h == '#':
            place_col = i
            break
    if place_col is None:
        place_col = 0

    out: Dict[str, Dict[str, int]] = {}
    rows_scanned = 0
    for row in table.select('tbody tr'):
        cells = row.find_all('td')
        if len(cells) <= place_col:
            continue
        place_text = cells[place_col].get_text(strip=True)
        place_match = re.match(r'\d+', place_text)
        if not place_match:
            continue
        place = int(place_match.group())
        if place > top_n:
            # Standings table is rendered in placement order, so once
            # we've passed top-N we can stop — saves time on big events.
            break
        rows_scanned += 1

        # Locate the deck-profile link to extract slug. Labs uses
        # /<tid>/decks/<slug> for the deck cell.
        slug = ''
        for c in cells:
            a = c.find('a', href=re.compile(r'/decks?/'))
            if a:
                href = a['href']
                candidate = href.rsplit('/', 1)[-1]
                # Skip back-links to the deck index ('decks' / '').
                if candidate and candidate not in ('decks', 'standings'):
                    slug = candidate
                    break
        if not slug:
            continue

        bucket = out.setdefault(slug, {'top1_count': 0, 'top4_count': 0, 'top8_count': 0})
        if place == 1:
            bucket['top1_count'] += 1
        if place <= 4:
            bucket['top4_count'] += 1
        if place <= 8:
            bucket['top8_count'] += 1

    logger.info("    → standings: %d top-%d rows scanned, %d distinct decks", rows_scanned, top_n, len(out))
    return out


def scrape_tournament_day(tournament_id: str, day: str) -> Dict[str, Dict[str, float]]:
    """
    Fetch labs.limitlesstcg.com/{id}/decks?{day1|day2} and return
    { deck_slug: { 'player_count', 'share_pct', 'wins', 'losses',
                   'ties', 'win_pct' } }.

    `day` ∈ {'day1','day2'}. We parse the embedded JSON data-blob, NOT
    the rendered HTML table — the table only carries OVERALL stats and
    led PR #32 to write share_pct == day1_share_pct == day2_share_pct
    for every row. The blob has the real per-day player counts and records.

    Returns empty dict when the page is missing or the blob isn't found
    (small tournaments without a Day-2 cut won't have any Day-2 entries).
    """
    if day not in ('day1', 'day2'):
        return {}
    url = f"{BASE_URL}/{tournament_id}/decks?{day}"
    logger.info("    Fetching %s: %s", day, url)
    # Need the raw HTML to access the embedded JSON blob — fetch_page_bs4
    # parses to lxml/bs4 and we'd lose the script-context anyway.
    from card_scraper_shared import safe_fetch_html
    html = safe_fetch_html(url)
    if not html:
        logger.warning("    %s page fetch failed for %s — skipping", day, tournament_id)
        return {}

    matches = list(_DAY_BLOB_PATTERN.finditer(html))
    if not matches:
        logger.info("    No %s data blob for %s — small event, no day-2 cut, or page format changed", day, tournament_id)
        return {}

    # Compute totals for share normalisation. Tournaments without a Day-2
    # cut return all 0s for day2s — we then return an empty dict so the
    # caller knows there's nothing to merge.
    total_day1 = sum(int(m['day1_players']) for m in matches)
    total_day2 = sum(int(m['day2_players']) for m in matches)
    total = total_day1 if day == 'day1' else total_day2
    if total <= 0:
        logger.info("    %s: total players = 0 (event has no %s data)", day, day)
        return {}

    out: Dict[str, Dict[str, float]] = {}
    for m in matches:
        slug = m['id']
        if day == 'day1':
            player_count = int(m['day1_players'])
            wins   = int(m['d1_w'])
            losses = int(m['d1_l'])
            ties   = int(m['d1_t'])
        else:
            player_count = int(m['day2_players'])
            wins   = int(m['d2_w'])
            losses = int(m['d2_l'])
            ties   = int(m['d2_t'])
        if player_count <= 0:
            continue

        games   = wins + losses + ties
        # Limitless reports "Win %" as match-point percentage, not raw
        # win-rate: (wins×3 + ties) / (games×3). E.g. 24-41-6 = 36.62%
        # rather than 24/71 = 33.80%. Match the upstream formula so
        # Day-1/Day-2 numbers line up with what users see on labs.
        win_pct = round((wins * 3 + ties) / (games * 3) * 100, 4) if games > 0 else 0.0
        share_pct = round(player_count / total * 100, 4)

        out[slug] = {
            'player_count': player_count,
            'share_pct'   : share_pct,
            'wins'        : wins,
            'losses'      : losses,
            'ties'        : ties,
            'win_pct'     : win_pct,
        }

    logger.info("    %s: %d decks parsed (JSON blob, total %d players)", day, len(out), total)
    return out


# ── Output ────────────────────────────────────────────────────────────────────

CSV_FIELDS = [
    'tournament_id', 'tournament_name', 'tournament_date',
    'tournament_type', 'country', 'total_players',
    'meta',  # Per-meta split (2026-05-24) — derived from tournament_date via tournament_cards_manifest's chunk_dates
    'deck_name', 'deck_slug', 'pokemon',
    'player_count', 'share_pct',
    'wins', 'losses', 'ties', 'win_pct',
    'top8_conv_rate', 'top16_conv_rate', 'top32_conv_rate',
    # Day-1 / Day-2 split (added with Day-1+Day-2 tab scraping).
    # Existing rows get '' for these on schema-drift rewrites; the
    # frontend treats missing values as 0 and falls back to overall.
    'day1_players', 'day1_share_pct', 'day1_wins', 'day1_losses', 'day1_ties', 'day1_win_pct',
    'day2_players', 'day2_share_pct', 'day2_wins', 'day2_losses', 'day2_ties', 'day2_win_pct',
    'day1_to_day2_conv',
    # Top-cut placement counts (added 2026-06). Existing rows backfill
    # to 0 on schema-drift rewrite; frontend treats missing as 0.
    'top1_count', 'top4_count', 'top8_count',
    'scraped_at',
]


# ── Per-archetype matchup scraper (W3 Phase 7 — May 2026) ─────────────
# The screenshots labs.limitlesstcg.com surfaces per-archetype detail
# pages at /{tournament_id}/decks/{deck_slug} with a per-opponent table
# (count + win %). User flagged this for the Meta Call upgrade: Major
# matchup matrix gets 3× weight over the online proxy.
#
# Parser is intentionally defensive — selectors fall through multiple
# patterns because we synthesized the fixture from screenshots without
# fetching the live HTML (Cloudflare blocks WebFetch from the sandbox
# environment). The first real-world dry-run is the validation step:
# if a structural mismatch surfaces, fix forward.
MATCHUP_DAY_OVERALL = 'overall'
MATCHUP_DAY_DAY1 = 'day1'
MATCHUP_DAY_DAY2 = 'day2'
_MATCHUP_DAYS = (MATCHUP_DAY_OVERALL, MATCHUP_DAY_DAY1, MATCHUP_DAY_DAY2)

MATCHUP_CSV_HEADER = [
    'meta',                  # format key (e.g. TEF-POR) — the matchup view is
                             # an aggregate ACROSS all tournaments in this meta
    'tournaments_used',      # comma-separated tids included in this combined
                             # view (provenance — lets downstream code recompute
                             # / regenerate the labs URL)
    'tournament_count',      # convenience — len(tournaments_used)
    'my_deck_slug',
    'my_deck_name',
    'my_deck_player_count',  # AGGREGATED across all tournaments_used
    'my_deck_total_wins',
    'my_deck_total_losses',
    'my_deck_total_ties',
    'my_deck_overall_win_pct',
    'opponent_deck_slug',
    'opponent_deck_name',
    'vs_count',              # games played vs this opponent (aggregated)
    'vs_win_pct',            # win % vs this opponent (aggregated)
    'day_filter',            # 'overall' | 'day1' | 'day2'
    'scraped_at',
]


def _parse_player_summary(soup) -> Dict[str, float]:
    """Extract the "{N} players: {W} wins - {L} losses - {T} ties ({WR}% WR)"
    summary line. Defensive — tries several elements and returns zeros on
    failure rather than raising.
    """
    out = {
        'player_count'  : 0,
        'total_wins'    : 0,
        'total_losses'  : 0,
        'total_ties'    : 0,
        'overall_win_pct': 0.0,
    }
    if not soup:
        return out
    # Search the whole page text — the summary is short and unmistakable
    text_blocks = []
    for el in soup.find_all(['p', 'div', 'h2', 'h3', 'span']):
        txt = el.get_text(' ', strip=True)
        if txt and 'players' in txt.lower() and 'wins' in txt.lower():
            text_blocks.append(txt)
    for txt in text_blocks:
        m = re.search(
            r'(\d[\d,]*)\s*players?\s*[:\-]\s*(\d[\d,]*)\s*wins?\s*[-–]\s*(\d[\d,]*)\s*losses?\s*[-–]\s*(\d[\d,]*)\s*ties?\s*\(([\d.,]+)\s*%',
            txt,
            re.IGNORECASE,
        )
        if m:
            out['player_count'] = _parse_int_count(m.group(1))
            out['total_wins'] = _parse_int_count(m.group(2))
            out['total_losses'] = _parse_int_count(m.group(3))
            out['total_ties'] = _parse_int_count(m.group(4))
            out['overall_win_pct'] = round(float(m.group(5).replace(',', '.')), 4)
            return out
    return out


def scrape_archetype_matchups(
    deck_slug: str,
    tournament_ids: List[str],
    day_filter: str = MATCHUP_DAY_OVERALL,
) -> Dict:
    """
    Fetch the labs metagame "combined view" for one archetype across a
    list of tournaments, and parse the per-opponent matchup table.

    URL: https://labs.limitlesstcg.com/decks/{deck_slug}?tournaments={ids}
      where {ids} is a comma-separated list of UNPADDED tids (61,60,...).
      The view aggregates players + matchups across all listed tids.

    Until 2026-05-25 this hit /{tid}/decks/{deck_slug} — a per-tournament
    deck-detail page that shows PLAYERS (not deck-vs-deck matchups). The
    parser dutifully scraped player names as "opponent_deck_name", which
    is why PR #205 disabled matchups + deleted 6773 garbage rows.

    Day filter:
      • 'overall' → no extra query flag
      • 'day2'    → adds `&d2` (user-confirmed 2026-05-25)
      • 'day1'    → adds `&d1` (inferred symmetric pattern — verify when
        the first populated day1 scrape lands)

    Returns a dict:
      {
        'summary': { player_count, total_wins, ..., overall_win_pct },
        'matchups': [
          { 'opponent_slug', 'opponent_name', 'vs_count', 'vs_win_pct' },
          ...
        ],
        'day_filter': day_filter,
        'tournaments_used': sorted-tids-list,
      }

    Returns empty matchups list on parse failure (caller decides whether
    to skip the row or treat as zero-sample).
    """
    if day_filter not in _MATCHUP_DAYS:
        day_filter = MATCHUP_DAY_OVERALL

    # Labs URL uses UNPADDED integer tids in the query. Strip leading zeros
    # and sort for stable URLs (caching + dedup).
    clean_tids: List[str] = []
    for raw in tournament_ids:
        s = str(raw or '').strip()
        if not s:
            continue
        try:
            clean_tids.append(str(int(s)))
        except ValueError:
            continue
    tids_sorted = sorted(set(clean_tids), key=int)
    if not tids_sorted:
        logger.warning("    No valid tournament_ids passed for %s", deck_slug)
        return {
            'summary': _parse_player_summary(None),
            'matchups': [],
            'day_filter': day_filter,
            'tournaments_used': [],
        }

    url = f"{BASE_URL}/decks/{deck_slug}?tournaments={','.join(tids_sorted)}"
    # Day-filter query flag — user confirmed `&d2` for Day 2 on 2026-05-25.
    # `&d1` for Day 1 is inferred from the symmetric pattern (the labs UI
    # exposes Overall / Day 1 / Day 2 tabs on the meta summary page); if
    # the assumed flag is wrong, the scraped page will fall back to the
    # Overall view and rows are still valid — just mis-labeled as day1.
    # Confirm the d1 pattern when we first see a populated day1 scrape.
    if day_filter == MATCHUP_DAY_DAY2:
        url += '&d2'
    elif day_filter == MATCHUP_DAY_DAY1:
        url += '&d1'
    logger.info("    Fetching matchups %s", url)
    soup = fetch_page_bs4(url)
    if not soup:
        logger.warning("    Matchup fetch failed for %s", url)
        return {
            'summary': _parse_player_summary(None),
            'matchups': [],
            'day_filter': day_filter,
            'tournaments_used': tids_sorted,
        }

    summary = _parse_player_summary(soup)

    # Find the matchup table — prefer .data-table (matches the deck-list
    # scraper's selector) and fall back to any table whose header row
    # contains "Win %" / "#".
    table = soup.find('table', attrs={'class': re.compile(r'data-table')})
    if not table:
        for cand in soup.find_all('table'):
            header_txt = cand.get_text(' ', strip=True).lower()
            if 'win %' in header_txt or 'win%' in header_txt:
                table = cand
                break
    if not table:
        logger.debug("    No matchup table for %s (tids=%s)", deck_slug, tids_sorted)
        return {
            'summary': summary,
            'matchups': [],
            'day_filter': day_filter,
            'tournaments_used': tids_sorted,
        }

    matchups: List[Dict] = []
    for row in table.select('tbody tr') if table.find('tbody') else table.find_all('tr')[1:]:
        cells = row.find_all('td')
        if len(cells) < 3:
            continue
        # Deck-name cell: prefer the one with an <a>; opponent slug is the
        # last segment of href.
        link = None
        name_cell_idx = None
        for idx, c in enumerate(cells):
            a = c.find('a')
            if a and a.get('href'):
                link = a
                name_cell_idx = idx
                break
        if not link or name_cell_idx is None:
            continue
        opp_name = link.get_text(strip=True)
        if not opp_name:
            continue
        opp_href = link.get('href', '')
        opp_slug = opp_href.rsplit('/', 1)[-1].split('?')[0] if opp_href else ''

        # Count + Win% are the two trailing numeric cells after the name
        # cell. Walk from the right so we don't depend on header order.
        trailing = cells[name_cell_idx + 1:]
        count_val = 0
        win_pct_val = 0.0
        for c in trailing:
            txt = c.get_text(strip=True)
            if '%' in txt and win_pct_val == 0.0:
                try:
                    win_pct_val = round(float(txt.replace('%', '').replace(',', '.').strip()), 4)
                except ValueError:
                    pass
            elif txt and count_val == 0 and not '%' in txt:
                count_val = _parse_int_count(txt)
        if count_val <= 0 and win_pct_val == 0.0:
            continue
        matchups.append({
            'opponent_slug': opp_slug,
            'opponent_name': opp_name,
            'vs_count'     : count_val,
            'vs_win_pct'   : win_pct_val,
        })

    return {
        'summary': summary,
        'matchups': matchups,
        'day_filter': day_filter,
        'tournaments_used': tids_sorted,
    }


def build_matchup_rows(
    meta: str,
    deck_slug: str,
    deck_name: str,
    matchups_result: Dict,
) -> List[Dict]:
    """Combine meta tag + per-archetype combined-view matchup payload into
    CSV row dicts ready for save. The summary numbers (player_count, wins,
    etc.) are AGGREGATED across all tournaments_used by the labs page —
    we just pass them through.
    """
    rows: List[Dict] = []
    summary = matchups_result.get('summary') or {}
    day_filter = matchups_result.get('day_filter') or MATCHUP_DAY_OVERALL
    tids_used: List[str] = list(matchups_result.get('tournaments_used') or [])
    tids_csv = ','.join(tids_used)
    scraped_at = datetime.now(timezone.utc).isoformat()
    for m in matchups_result.get('matchups', []):
        rows.append({
            'meta'                  : meta,
            'tournaments_used'      : tids_csv,
            'tournament_count'      : len(tids_used),
            'my_deck_slug'          : deck_slug,
            'my_deck_name'          : deck_name,
            'my_deck_player_count'  : summary.get('player_count', 0),
            'my_deck_total_wins'    : summary.get('total_wins', 0),
            'my_deck_total_losses'  : summary.get('total_losses', 0),
            'my_deck_total_ties'    : summary.get('total_ties', 0),
            'my_deck_overall_win_pct': summary.get('overall_win_pct', 0.0),
            'opponent_deck_slug'    : m.get('opponent_slug', ''),
            'opponent_deck_name'    : m.get('opponent_name', ''),
            'vs_count'              : m.get('vs_count', 0),
            'vs_win_pct'            : m.get('vs_win_pct', 0.0),
            'day_filter'            : day_filter,
            'scraped_at'            : scraped_at,
        })
    return rows


def save_matchup_rows(matchup_rows: List[Dict], data_dir: Optional[str] = None) -> str:
    """Write matchup rows to data/labs_tournament_matchups.csv (append-or-replace
    semantics — caller decides). Returns the output path."""
    out_dir = data_dir or _get_data_dir()
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, 'labs_tournament_matchups.csv')
    with open(out_path, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=MATCHUP_CSV_HEADER, extrasaction='ignore')
        writer.writeheader()
        for row in matchup_rows:
            writer.writerow(row)
    logger.info("Wrote %d matchup rows → %s", len(matchup_rows), out_path)
    return out_path


def _dedupe_deck_rows(rows: List[Dict]) -> List[Dict]:
    """Drop rows that share (tournament_id, deck_slug). Keeps the LAST
    seen — assumes the latest write reflects the latest scrape.

    Root-cause is when a tournament gets discovered through two paths
    in one run (e.g. the labs index and the ID-walk both return it),
    `deck_rows` ends up with the same (tid, slug) pair twice and the
    append-write doubles every row. Surfaced 2026-05-27 in Melbourne
    (TID 0066): 124 rows / 62 unique. Both Predictor 4.6 and 5.4 read
    recency-weighted aggregates from this file so doubling skews their
    inputs proportionally.
    """
    seen: Dict[Tuple[str, str], int] = {}
    out: List[Dict] = []
    for r in rows:
        key = (str(r.get('tournament_id') or ''), str(r.get('deck_slug') or ''))
        if key in seen:
            out[seen[key]] = r  # overwrite earlier copy
        else:
            seen[key] = len(out)
            out.append(r)
    return out


def save_results(tournaments_meta: List[Dict], deck_rows: List[Dict]) -> None:
    data_dir = _get_data_dir()
    os.makedirs(data_dir, exist_ok=True)

    # Tournament index JSON
    json_path = os.path.join(data_dir, 'labs_tournaments.json')
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(tournaments_meta, f, indent=2, ensure_ascii=False)
    logger.info("Saved tournament index → %s", json_path)

    csv_path = os.path.join(data_dir, 'labs_tournament_decks.csv')
    # Detect schema drift — if the existing file lacks any of the current
    # CSV_FIELDS (e.g. after we added top8_conv_rate columns), we re-read
    # all existing rows and write the file back with the new schema before
    # appending. Missing fields default to '' so old data stays intact.
    existing_rows: List[Dict] = []
    if os.path.exists(csv_path):
        with open(csv_path, 'r', newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            file_fields = set(reader.fieldnames or [])
            schema_drift = not set(CSV_FIELDS).issubset(file_fields)
            if schema_drift:
                logger.info("CSV schema drift detected — rewriting %s with new columns", csv_path)
                existing_rows = list(reader)

    if existing_rows:
        # Schema-upgrade rewrite: existing + new in one shot. Dedupe
        # across the combined set so re-scraped tournaments don't
        # produce two rows per (tid, slug).
        combined = _dedupe_deck_rows(existing_rows + list(deck_rows))
        with open(csv_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=CSV_FIELDS, extrasaction='ignore')
            writer.writeheader()
            writer.writerows(combined)
        logger.info("Saved deck data → %s  (rewrote %d rows; %d after dedupe)",
                    csv_path, len(existing_rows) + len(deck_rows), len(combined))
    else:
        # Pure append path: still dedupe new rows against themselves
        # AND against on-disk content. The latter catches the case
        # where the same tournament gets discovered twice in one run
        # via two code paths (cf. Melbourne 2026-05-27 incident).
        on_disk: List[Dict] = []
        if os.path.exists(csv_path):
            with open(csv_path, 'r', newline='', encoding='utf-8') as f:
                on_disk = list(csv.DictReader(f))
        combined = _dedupe_deck_rows(on_disk + list(deck_rows))
        write_header = True  # always include header in the full rewrite
        with open(csv_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=CSV_FIELDS, extrasaction='ignore')
            if write_header:
                writer.writeheader()
            writer.writerows(combined)
        logger.info("Saved deck data → %s  (%d total after dedupe; %d new)",
                    csv_path, len(combined), len(deck_rows))


def overwrite_results(tournaments_meta: List[Dict], deck_rows: List[Dict]) -> None:
    data_dir = _get_data_dir()
    os.makedirs(data_dir, exist_ok=True)

    json_path = os.path.join(data_dir, 'labs_tournaments.json')
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(tournaments_meta, f, indent=2, ensure_ascii=False)
    logger.info("Overwrote tournament index → %s", json_path)

    csv_path = os.path.join(data_dir, 'labs_tournament_decks.csv')
    deduped = _dedupe_deck_rows(deck_rows)
    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(deduped)
    logger.info("Overwrote deck data → %s  (%d rows; %d after dedupe)",
                csv_path, len(deck_rows), len(deduped))


# ── CLI ───────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description='Scrape deck share data from labs.limitlesstcg.com',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        '--from-date', metavar='YYYY-MM-DD', default=None,
        help='Only include tournaments on or after this date',
    )
    parser.add_argument(
        '--tournament-id', metavar='ID', default=None,
        help='Scrape exactly one tournament by its numeric ID (e.g. 0061)',
    )
    parser.add_argument(
        '--tournament-type', nargs='+',
        choices=sorted(TOURNAMENT_TYPES),
        metavar='TYPE', default=None,
        help='Filter by type: regional, international, special, worlds (space-separated)',
    )
    parser.add_argument(
        '--delay', type=float, default=DEFAULT_DELAY, metavar='SEC',
        help=f'Delay between requests in seconds (default: {DEFAULT_DELAY})',
    )
    parser.add_argument(
        '--overwrite', action='store_true',
        help='Overwrite output files instead of appending to the CSV',
    )
    parser.add_argument(
        '--matchups', action='store_true',
        help='Second pass — fetch /{tid}/decks/{slug} per archetype and write '
             'data/labs_tournament_matchups.csv. Slow (one HTTP per deck per '
             'tournament). Default OFF.',
    )
    parser.add_argument(
        '--matchup-days', nargs='+',
        choices=list(_MATCHUP_DAYS), default=[MATCHUP_DAY_OVERALL],
        help='Which day filter(s) to scrape per archetype when --matchups is '
             'set (default: overall). Adds one HTTP per filter per deck. '
             'Day-2 data feeds the Meta Call "Day-2 preference" path: '
             'when a pair has >=5 Day-2 games, the Day-2 WR replaces the '
             'Overall WR as the Major-side input before the 65/35 online '
             'blend in getBaseMatchup. Recommended invocation for a fresh '
             'meta is `--matchup-days overall day2`.',
    )
    parser.add_argument(
        '--matchup-meta', metavar='META', default='',
        help='Format key to tag matchup rows with (e.g. TEF-POR). Useful for '
             'targeted per-format backfills.',
    )
    parser.add_argument(
        '--id-range', nargs=2, type=int, metavar=('FROM', 'TO'), default=None,
        help='Backfill historical tournaments by ID-walking labs.* /standings '
             'pages (e.g. --id-range 1 66 probes 0001..0066). Use this when '
             'the labs index page only lists recent tournaments and you need '
             'to seed older metas into the per-meta chunks.',
    )
    parser.add_argument(
        '--ignore-cache', action='store_true',
        help='Force-rescrape ALL discovered tournaments even if they belong to '
             'closed metas already present in per-meta chunks. Default skips '
             'closed-meta tournaments to save HTTP cost on weekly runs.',
    )
    args = parser.parse_args()

    # ── Load settings (CLI args take priority over scraper_settings.json) ──
    cfg = load_settings("labs_tournament_scraper_settings.json", DEFAULT_SETTINGS)
    raw_from_date = args.from_date or cfg.get("from_date")
    tournament_types = args.tournament_type or cfg.get("tournament_types") or None
    delay = args.delay if args.delay != DEFAULT_DELAY else cfg.get("delay", DEFAULT_DELAY)
    overwrite = args.overwrite or cfg.get("overwrite", False)

    # ── Parse date filter ──────────────────────────────────────────────────
    from_date: Optional[datetime] = None
    if raw_from_date:
        try:
            fmt = '%Y-%m-%d' if '-' in str(raw_from_date) else '%d.%m.%Y'
            from_date = datetime.strptime(str(raw_from_date), fmt)
            logger.info("Date filter: on/after %s", raw_from_date)
        except ValueError:
            logger.error("Invalid from_date %r – use YYYY-MM-DD", raw_from_date)
            sys.exit(1)

    # ── Per-meta cache: rebuild monolith FIRST so ID-walk can prefer cached
    # meta over a fresh scrape_tournament_meta call (the labs /decks header
    # is sometimes JS-rendered so date extraction fails — preserving the
    # cached date avoids losing it on every run). Loaded once and shared
    # between the ID-walk pre-fill and the SKIP-frozen branch below.
    current_meta = _current_meta_key()
    # Active in-person meta: same as current_meta outside the lag window;
    # during the lag window (CRI online-legal but not yet in-person-legal)
    # this is the previous rotation (TEF-POR) — the meta that's still
    # producing real tournament data. Used by the re-fetch + matchup
    # skip gates below so previous-rotation rows don't freeze for the
    # entire lag period.
    active_meta = _active_in_person_meta_key()
    if active_meta != current_meta:
        logger.info(
            "Lag-window detected: current_meta=%s but active in-person meta=%s "
            "(today < in_person_legal_date). Treating %s as the rescrape "
            "target for skip gates.",
            current_meta, active_meta, active_meta,
        )
    existing_deck_rows = _reassemble_labs_monolith('labs_tournament_decks', CSV_FIELDS)
    existing_matchup_rows = _reassemble_labs_monolith('labs_tournament_matchups', MATCHUP_CSV_HEADER)
    # Ein Turnier gilt als erledigt, wenn seine Zeilen in einem ECHTEN
    # Meta-Chunk liegen. Zeilen in __unsorted zaehlen NICHT.
    #
    # BEFUND (22.08.2026): _list_labs_chunk_paths sammelt alles mit dem
    # Praefix "labs_tournament_decks_" — und
    # labs_tournament_decks__unsorted.csv passt darauf. Damit landeten
    # unsortierte Turniere in seen_tids und wurden bei JEDEM weiteren Lauf
    # uebersprungen. Sie konnten sich nie erholen.
    #
    # Gemessen: 0042 (Regional Brisbane) und 0019 (Special Event San Juan),
    # beide am 25.05.2026 gescrapt, beide seither ohne Datum und ohne Meta.
    # Die Quelle liefert ihr Datum inzwischen wieder ("November 1-2, 2025"
    # bzw. "February 15-16, 2025"); die Seite ist teilweise clientseitig
    # gerendert, weshalb der Abruf es mal sieht und mal nicht. Mit Datum
    # ordnet _derive_meta_from_date sie sauber SVI-MEG bzw. BRS-PRE zu —
    # die Zuordnung war nie das Problem, nur die Wiedervorlage.
    #
    # Kosten: die unsortierten Turniere werden je Lauf einmal neu versucht.
    # Das sind heute zwei.
    seen_tids = {
        str(r.get('tournament_id') or '').strip()
        for r in existing_deck_rows
        if (r.get('meta') or '').strip()
    }
    _unsortiert = {
        str(r.get('tournament_id') or '').strip()
        for r in existing_deck_rows
        if not (r.get('meta') or '').strip()
    } - seen_tids - {''}
    if _unsortiert:
        logger.info(
            "Wiedervorlage: %d Turnier(e) liegen unsortiert und werden erneut "
            "versucht: %s", len(_unsortiert), ", ".join(sorted(_unsortiert)))
    # tid → full meta dict (name, date, type, country, total_players).
    # First occurrence per tid wins (we only care that we have *some* known-
    # good values; chunks shouldn't disagree within a tid).
    cached_tournament_meta: Dict[str, Dict] = {}
    cached_player_counts: Dict[str, int] = {}
    for r in existing_deck_rows:
        tid_key = str(r.get('tournament_id') or '').strip()
        if not tid_key:
            continue
        if tid_key not in cached_tournament_meta:
            cached_tournament_meta[tid_key] = {
                'tournament_name': r.get('tournament_name') or '',
                'tournament_date': r.get('tournament_date') or '',
                'tournament_type': r.get('tournament_type') or 'regional',
                'country'        : r.get('country') or '',
            }
        try:
            cached_player_counts[tid_key] = max(
                cached_player_counts.get(tid_key, 0),
                int(r.get('total_players') or 0),
            )
        except (TypeError, ValueError):
            continue

    def _meta_from_cache_or_scrape(tid: str, fallback_type: str = 'regional') -> Dict[str, str]:
        """Use cached meta when we already have a non-empty date; only hit
        scrape_tournament_meta when the cache can't tell us the date. Saves
        a network round-trip per known tid AND preserves the cached date
        when the live parser can't read it from JS-rendered headers."""
        cached = cached_tournament_meta.get(tid) or {}
        if cached.get('tournament_date'):
            return {
                'tournament_name': cached.get('tournament_name') or f'Tournament {tid}',
                'tournament_date': cached['tournament_date'],
                'tournament_type': cached.get('tournament_type') or fallback_type,
                'country'        : cached.get('country') or '',
            }
        scraped = scrape_tournament_meta(tid)
        return {
            'tournament_name': scraped.get('tournament_name') or cached.get('tournament_name') or f'Tournament {tid}',
            'tournament_date': scraped.get('tournament_date') or '',
            'tournament_type': cached.get('tournament_type') or fallback_type,
            'country'        : cached.get('country') or '',
        }

    # ── Build tournament list ──────────────────────────────────────────────
    if args.tournament_id:
        # Single-tournament mode – skip the main page, but still fetch the
        # tournament's own page so we get the real name + date instead of
        # a placeholder "Tournament 0062" string flowing into the field
        # cards downstream.
        tid = args.tournament_id.zfill(4)
        meta = _meta_from_cache_or_scrape(tid, fallback_type='unknown')
        tournaments = [{
            'tournament_id'  : tid,
            'tournament_name': meta['tournament_name'],
            'tournament_date': meta['tournament_date'],
            'tournament_type': meta['tournament_type'],
            'country'        : meta['country'],
        }]
        logger.info("Single-tournament mode: %s (%s)",
                    tournaments[0]['tournament_name'],
                    tournaments[0]['tournament_date'] or 'date n/a')
    elif args.id_range:
        # Backfill mode — walk the labs ID space and probe each tournament's
        # /standings page. Used to seed historical metas (SVI-PFL, SVI-ASC
        # etc.) that no longer appear on the labs index page.
        from_id, to_id = args.id_range
        found_ids = discover_tournament_ids_by_walk(from_id, to_id, delay=min(delay, 0.5))
        tournaments = []
        for tid in found_ids:
            meta = _meta_from_cache_or_scrape(tid)
            tournaments.append({
                'tournament_id'  : tid,
                'tournament_name': meta['tournament_name'],
                'tournament_date': meta['tournament_date'],
                'tournament_type': meta['tournament_type'],
                'country'        : meta['country'],
            })
            # Only delay when we actually hit the network (cache hits are free)
            if not (cached_tournament_meta.get(tid) or {}).get('tournament_date'):
                time.sleep(delay)
    else:
        tournaments = scrape_tournament_list(
            from_date=from_date,
            tournament_types=tournament_types,
        )

        # ── Recent-TID gap-fill (2026-06) ───────────────────────────
        # User-flagged: Special Event Lima (TID 0067, 499 players,
        # 2026-05-23) existed on labs but wasn't picked up by the
        # weekly run. The index-page scrape at scrape_tournament_list()
        # only lists tournaments labs HIGHLIGHTS on their landing page
        # — Special Events and smaller / regional events sometimes get
        # filtered out of that listing even though their /standings +
        # /decks pages are fully published.
        #
        # Fix: after the index fetch, walk the GAP between the highest
        # TID we found AND the highest TID we already know about (from
        # labs_tournaments.json) — plus a small lookback window of
        # GAP_FILL_LOOKBACK so we catch any TIDs the index NEVER
        # listed. Each probed TID hits /standings; 200 → add to the
        # discovery list, 404 → skip silently.
        #
        # Two windows are probed:
        #   • LOOKBACK (rückwärts): max_tid-10 ... max_tid — catches
        #     completed tournaments that fell off the index page (Lima
        #     0067 pattern: small Special Event indexed below the
        #     visible cutoff).
        #   • LOOKAHEAD (vorwärts, added 2026-06-09): max_tid+1 ...
        #     max_tid+5 — catches tournaments whose /standings page
        #     EXISTS on labs.limitlesstcg.com but isn't linked yet from
        #     the homepage feed (Turin 0069 pattern: tournament ran
        #     2026-06-07, standings posted within hours, but the labs
        #     index feed lagged 1-3 days). Without lookahead, our
        #     Tuesday weekly run kept missing Turin even though its
        #     data WAS reachable at https://labs.limitlesstcg.com/0069/standings.
        #
        # Cost: GAP_FILL_LOOKBACK + GAP_FILL_LOOKAHEAD HTTP requests
        # per weekly run (15 → ~8 seconds at default delay). Trivial
        # compared to the ~1500 HTTP for the matchup pass.
        GAP_FILL_LOOKBACK  = 10
        GAP_FILL_LOOKAHEAD = 5
        try:
            cached_index = _load_cached_tournament_index()
            known_tids = {
                int(t['tournament_id']) for t in (tournaments + cached_index)
                if str(t.get('tournament_id', '')).isdigit()
            }
            if known_tids:
                max_tid = max(known_tids)
                gap_window = set(range(
                    max_tid - GAP_FILL_LOOKBACK,
                    max_tid + GAP_FILL_LOOKAHEAD + 1,
                ))
                missing = sorted(gap_window - known_tids)
                if missing:
                    logger.info(
                        "Gap-fill: probing %d missing TIDs in [%04d..%04d]: %s",
                        len(missing), missing[0], missing[-1],
                        ', '.join(f'{t:04d}' for t in missing),
                    )
                    new_tids = discover_tournament_ids_by_walk(
                        min(missing), max(missing), delay=delay,
                    )
                    # Only the actually-missing ones get added (the walk
                    # also surfaces TIDs we already have).
                    new_to_add = [tid for tid in new_tids if int(tid) in set(missing)]
                    for tid in new_to_add:
                        meta = _meta_from_cache_or_scrape(tid, fallback_type='special')
                        tournaments.append({
                            'tournament_id'  : tid,
                            'tournament_name': meta['tournament_name'],
                            'tournament_date': meta['tournament_date'],
                            'tournament_type': meta['tournament_type'],
                            'country'        : meta['country'],
                        })
                        logger.info(
                            "Gap-fill: added %s — %s (%s, %s)",
                            tid, meta['tournament_name'],
                            meta['tournament_type'], meta['tournament_date'] or 'date n/a',
                        )
                else:
                    logger.info("Gap-fill: no missing TIDs in lookback window of %d",
                                GAP_FILL_LOOKBACK)
        except Exception as e:
            # Gap-fill is best-effort — never let it kill the run.
            logger.warning("Gap-fill skipped due to error: %s", e)

        # ── Zero-player revisit (2026-06-15) ─────────────────────────
        # User-flagged: NAIC (TID 0070) sat in labs_tournaments.json
        # with total_players=0 for days — the scraper had probed the
        # /decks page mid-tournament, found no deck rows, persisted
        # an empty entry, and then SKIPPED 0070 on every subsequent
        # run because:
        #   - the live index sometimes drops finished tournaments
        #     off the visible feed within a day
        #   - gap-fill probes only TIDs that aren't in known_tids,
        #     so a known-but-empty TID stays empty forever
        # Fix: after gap-fill, force any cached entry with
        # total_players==0 back into the iteration list. The downstream
        # rescrape will hit /decks again with the now-populated data.
        try:
            tournaments_tids = {
                str(t.get('tournament_id') or '').strip() for t in tournaments
            }
            cached_zero = [
                c for c in cached_index
                if (c.get('total_players') or 0) == 0
                and str(c.get('tournament_id') or '').strip() not in tournaments_tids
            ]
            for c in cached_zero:
                tid = str(c.get('tournament_id') or '').strip()
                if not tid:
                    continue
                meta = _meta_from_cache_or_scrape(
                    tid, fallback_type=c.get('tournament_type', 'special'),
                )
                tournaments.append({
                    'tournament_id'  : tid,
                    'tournament_name': meta['tournament_name'] or c.get('tournament_name', ''),
                    'tournament_date': meta['tournament_date'] or c.get('tournament_date', ''),
                    'tournament_type': meta['tournament_type'] or c.get('tournament_type', ''),
                    'country'        : meta['country'] or c.get('country', ''),
                })
                logger.info(
                    "Zero-player revisit: re-queueing %s — %s (cached total_players=0)",
                    tid, meta['tournament_name'] or c.get('tournament_name', ''),
                )
            if cached_zero:
                logger.info("Zero-player revisit: queued %d previously-empty tournaments", len(cached_zero))
        except Exception as e:
            logger.warning("Zero-player revisit skipped due to error: %s", e)

    if not tournaments:
        logger.warning("No tournaments matched the given filters – nothing to do.")
        return

    logger.info(
        "Per-meta cache: %d tournaments already scraped across all chunks, current_set=%s",
        len(seen_tids), current_meta or '(unknown)',
    )

    # ── Name-based meta lookup (fallback when labs date is empty) ──────────
    # Builds {labs_tid: (meta, iso_date)} by crossreferencing tournament
    # names against tournament_cards_data_cards_<META>.csv files. Used as
    # the second-tier derivation when labs returns an empty date (its
    # /decks header is partially JS-rendered, so the parser can't always
    # see it). See _build_labs_name_meta_lookup for the matching strategy.
    # The lookup is also applied to existing rows during the merge below so
    # that previously-unsorted rows get re-classified once a new run lands.
    #
    # IMPORTANT: include ALL known tids (= freshly-scraped index + cached
    # historical entries from existing chunks), not just `tournaments`. The
    # normal weekly run only sees 5 tournaments via the live index, but the
    # cached monolith holds 60+ historical tids. Without them in the lookup
    # input, _build_labs_name_meta_lookup can't match historical rows
    # → the 4072 _unsorted rows never get re-classified
    # (regression observed in the 2026-05-25 13:46 UTC run).
    known_labs: List[Dict] = list(tournaments)
    seen_in_known = {str(t.get('tournament_id') or '') for t in tournaments}
    for tid, cached in cached_tournament_meta.items():
        if tid and tid not in seen_in_known and cached.get('tournament_name'):
            known_labs.append({
                'tournament_id'  : tid,
                'tournament_name': cached.get('tournament_name') or '',
            })
    name_meta_lookup = _build_labs_name_meta_lookup(known_labs)
    if name_meta_lookup:
        logger.info(
            "Name-based meta lookup: matched %d/%d labs tournaments via cards data",
            len(name_meta_lookup), len(known_labs),
        )

    # ── Scrape each tournament ─────────────────────────────────────────────
    all_deck_rows: List[Dict] = []
    tournaments_meta: List[Dict] = []
    scraped_at = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    skipped_frozen = 0
    rescraped_tids: Set[str] = set()

    for idx, t in enumerate(tournaments):
        tid = t['tournament_id']
        # Skip closed-meta tournaments that are already cached.
        # Use the cached date (not just t['tournament_date']) when computing
        # is_current — the live scrape may have returned an empty date for
        # JS-rendered pages, but the chunks still know the real value.
        cached_for_skip = cached_tournament_meta.get(tid) or {}
        effective_date = t.get('tournament_date') or cached_for_skip.get('tournament_date') or ''
        # Combined derivation: date first, then name-based cards lookup.
        t_meta, effective_date = _derive_meta_for_labs_tournament(
            tid, t.get('tournament_name', ''), effective_date,
            name_meta_lookup, current_meta='',  # don't fall back to current here
        )
        # Backfill the labs entry with the derived date so it persists into
        # labs_tournaments.json + per-row tournament_date columns.
        if effective_date and not t.get('tournament_date'):
            t['tournament_date'] = effective_date
        if not args.ignore_cache and tid in seen_tids:
            # active_meta check: an active-meta tournament always re-scrapes
            # (data still updates as more rounds finish). Closed metas freeze.
            # During the in-person lag window, active_meta = previous rotation
            # so its tournaments don't freeze prematurely.
            is_current = bool(active_meta) and bool(t_meta) and t_meta.endswith(active_meta)
            if not is_current:
                logger.info(
                    "[%d/%d] %s (%s) — SKIP (frozen, meta=%s, date=%s)",
                    idx + 1, len(tournaments), t['tournament_name'], tid,
                    t_meta or '?', effective_date or 'unknown',
                )
                skipped_frozen += 1
                # Preserve cached metadata in the index file so the next
                # weekly run still sees it (otherwise labs_tournaments.json
                # shrinks and the cache-fallback loses every previously-
                # known tournament).
                if cached_player_counts.get(tid):
                    t['total_players'] = cached_player_counts[tid]
                if cached_for_skip.get('country') and not t.get('country'):
                    t['country'] = cached_for_skip['country']
                tournaments_meta.append(t)
                continue

        logger.info("[%d/%d] %s (%s)", idx + 1, len(tournaments), t['tournament_name'], tid)
        decks, total_players = scrape_tournament_decks(tid)
        # Loud warning when a tournament produces zero deck rows — this
        # is the "stuck cache" failure mode the zero-player revisit pass
        # exists to recover from. Surfacing it here makes the failure
        # obvious in the workflow log instead of silently dropping the
        # event for weeks (NAIC 0070 pattern, 2026-06-15).
        if not decks:
            logger.warning(
                "  ⚠ %s (%s) returned 0 deck rows — will retry next run via zero-player revisit",
                t.get('tournament_name', ''), tid,
            )
        t['total_players'] = total_players
        tournaments_meta.append(t)
        rescraped_tids.add(tid)

        # Derive deck_meta with the same combined logic — but now allow the
        # current_meta fallback for tournaments whose date IS known but
        # doesn't fit any chunk window (= brand-new in current set, the
        # manifest hasn't picked it up yet).
        deck_meta, row_date = _derive_meta_for_labs_tournament(
            tid, t.get('tournament_name', ''), effective_date,
            name_meta_lookup, current_meta=current_meta,
        )

        for deck in decks:
            all_deck_rows.append({
                'tournament_id'  : tid,
                'tournament_name': t['tournament_name'],
                'tournament_date': row_date or t.get('tournament_date', ''),
                'tournament_type': t['tournament_type'],
                'country'        : t['country'],
                'total_players'  : total_players,
                'meta'           : deck_meta,
                'scraped_at'     : scraped_at,
                **deck,
            })

        # Polite delay between tournaments
        if idx < len(tournaments) - 1:
            time.sleep(delay)

    if skipped_frozen:
        logger.info("Frozen-meta cache: skipped %d tournaments (use --ignore-cache to force re-scrape)", skipped_frozen)

    # Merge new rows with existing (un-rescraped) rows so the per-meta
    # split contains the full historical archive.
    merged_deck_rows = [r for r in existing_deck_rows if str(r.get('tournament_id') or '').strip() not in rescraped_tids]
    merged_deck_rows.extend(all_deck_rows)

    # ── Meta-tag consistency check ──────────────────────────────────────
    # After a merge, no tournament_id should carry two different meta
    # tags across its rows. When it does, an earlier scrape mislabelled
    # the tournament (Melbourne 2026-05-23 landed under TEF-CRI for
    # weeks because the lag-window fallback ignored in_person_legal_date)
    # and the current run is now stacking new rows in the correct
    # bucket alongside the stale wrong-meta rows. Drop the stale meta
    # in favour of whatever the freshly-scraped rows for the same tid
    # have, and log loudly so the operator notices.
    rows_by_tid: Dict[str, List[Dict]] = {}
    for r in merged_deck_rows:
        tid = str(r.get('tournament_id') or '').strip()
        if not tid:
            continue
        rows_by_tid.setdefault(tid, []).append(r)
    rescraped_set = set(rescraped_tids) if not isinstance(rescraped_tids, set) else rescraped_tids
    fixed_clashes = 0
    for tid, rows in rows_by_tid.items():
        metas = {(r.get('meta') or '').strip() for r in rows if r.get('meta')}
        if len(metas) <= 1:
            continue
        # Prefer the meta carried by freshly-scraped rows. When the
        # tid wasn't rescraped this run we still have a divergence;
        # pick the meta with the highest row count as a tie-breaker
        # (the freshest scrape almost always brings the largest cohort).
        if tid in rescraped_set:
            fresh_metas = {
                (r.get('meta') or '').strip()
                for r in rows if r in all_deck_rows and r.get('meta')
            }
            winner = next(iter(fresh_metas)) if len(fresh_metas) == 1 else None
        else:
            winner = None
        if not winner:
            counts: Dict[str, int] = {}
            for r in rows:
                m = (r.get('meta') or '').strip()
                if m:
                    counts[m] = counts.get(m, 0) + 1
            winner = max(counts, key=counts.get)
        loser_metas = metas - {winner}
        logger.warning(
            "Meta clash on tid=%s — rows carry metas %s; consolidating onto %r "
            "(rescrape=%s). This usually means an earlier run mislabelled the "
            "tournament; check labs_tournament_id_overrides.json + the cards-data "
            "name lookup for this tid.",
            tid, sorted(metas), winner, tid in rescraped_set,
        )
        for r in rows:
            row_meta = (r.get('meta') or '').strip()
            if row_meta and row_meta in loser_metas:
                r['meta'] = winner
                fixed_clashes += 1
    if fixed_clashes:
        logger.warning("Resolved %d row(s) with stale meta tags during merge", fixed_clashes)

    # Re-classify existing rows against the name-meta lookup. Two cases:
    #
    #   (A) RESCUE — row has empty meta (= sitting in _unsorted) and the
    #       lookup now matches it. Promote to the matched meta + populate
    #       tournament_date.
    #
    #   (B) CORRECT — row's current (meta, date) was a stale wrong
    #       assignment from the old single-pass position-match algo.
    #       Specifically: this tid is NOT in the new lookup, but the
    #       row's date matches the lookup-derived date of ANOTHER labs
    #       tid with the same parsed name. That's the fingerprint of the
    #       old algo's mis-match (e.g. 0019 Special San Juan inherited
    #       0056's SVI-ASC slot before chronological-neighbor disambig
    #       was added). Reset meta + date so the next split routes them
    #       to _unsorted, where they correctly stay until cards data
    #       fills in the gap.
    #
    # Reverse map: parsed name-key → {tid: lookup_iso_date} for tids the
    # current run's lookup has resolved. Used for stale-detection in (B).
    name_to_lookup_dates: Dict[Tuple[str, str], Dict[str, str]] = {}
    for t in known_labs:
        key = _parse_tournament_name_key(t.get('tournament_name') or '')
        if not key:
            continue
        tid_known = str(t.get('tournament_id') or '')
        hit = name_meta_lookup.get(tid_known)
        if hit and hit[1]:
            name_to_lookup_dates.setdefault(key, {})[tid_known] = hit[1]

    rescued = 0
    corrected = 0
    for row in merged_deck_rows:
        tid = str(row.get('tournament_id') or '').strip()
        if not tid:
            continue
        cur_meta = (row.get('meta') or '').strip()
        cur_date = (row.get('tournament_date') or '').strip()

        lookup_hit = name_meta_lookup.get(tid)
        if lookup_hit:
            new_meta, new_date = lookup_hit
            # (A) RESCUE or refresh
            if not cur_meta:
                row['meta'] = new_meta
                if new_date:
                    row['tournament_date'] = new_date
                rescued += 1
            elif cur_meta != new_meta:
                row['meta'] = new_meta
                if new_date:
                    row['tournament_date'] = new_date
                corrected += 1
            elif new_date and cur_date != new_date:
                # meta agrees, but the row has a stale/missing date
                row['tournament_date'] = new_date
        elif cur_meta and cur_date:
            # (B) CORRECT — lookup has nothing for this tid, but the row
            # is currently classified. Check if its date came from
            # another same-name tid's lookup slot.
            row_key = _parse_tournament_name_key(row.get('tournament_name') or '')
            siblings = name_to_lookup_dates.get(row_key, {}) if row_key else {}
            if any(other_tid != tid and other_date == cur_date
                   for other_tid, other_date in siblings.items()):
                row['meta'] = ''
                row['tournament_date'] = ''
                corrected += 1
    if rescued:
        logger.info("Re-classified %d previously-unsorted rows via name lookup", rescued)
    if corrected:
        logger.info("Corrected %d stale row assignments via name lookup", corrected)

    # ── Save ───────────────────────────────────────────────────────────────
    if overwrite:
        overwrite_results(tournaments_meta, merged_deck_rows)
    else:
        save_results(tournaments_meta, merged_deck_rows)

    logger.info(
        "Done. %d tournaments, %d deck entries written.",
        len(tournaments_meta), len(all_deck_rows),
    )

    # ── Optional Phase B: per-archetype matchups ───────────────────────────
    # User-flagged 2026-05-24: labs exposes per-deck matchup matrices
    # (count + WR per opponent, with Day-2 filter). We scrape them as a
    # second pass to keep the main run fast and the matchup CSV optional
    # (Meta Call degrades gracefully when the file is absent).
    if args.matchups:
        # The labs combined-view exposes ONE matchup matrix per
        # (deck_slug, list_of_tournaments) — i.e. it's aggregated across
        # tournaments. Grain shift from the old per-(tid, slug) loop:
        # we now scrape ONE URL per (meta, slug) and the row holds the
        # aggregated counts. Reduces total HTTP count by ~6x for a meta
        # with 6 tournaments (e.g. TEF-POR), keeps the CSV smaller, and
        # matches what Meta Call actually needs (per-meta blends).
        matchup_rows: List[Dict] = []
        # Group: meta -> {slug -> deck_name} and meta -> [tids]
        # Iterate MERGED rows (not just freshly-scraped) so past metas
        # with cached decks are included. Skip-if-already-scraped logic
        # below prevents redundant re-scraping for closed metas.
        meta_to_tids: Dict[str, List[str]] = {}
        meta_slug_to_name: Dict[Tuple[str, str], str] = {}
        for deck_row in merged_deck_rows:
            slug = (deck_row.get('deck_slug') or '').strip()
            deck_meta = (deck_row.get('meta') or '').strip()
            if not slug or not deck_meta or deck_meta == '_unsorted':
                continue
            tid = str(deck_row.get('tournament_id') or '').strip()
            if tid:
                meta_to_tids.setdefault(deck_meta, [])
                if tid not in meta_to_tids[deck_meta]:
                    meta_to_tids[deck_meta].append(tid)
            meta_slug_to_name.setdefault(
                (deck_meta, slug),
                (deck_row.get('deck_name') or slug),
            )

        # Skip-if-already-scraped: don't re-fetch closed-meta matchups
        # every weekly run. We refresh ONLY the current meta (data
        # evolves as new rounds + new tournaments land) and any meta
        # that has no matchup rows yet (= first scrape for that meta).
        # CLI --matchup-meta forces a specific meta regardless of state
        # (useful for ad-hoc backfills + day1/day2 fills after a parser
        # tweak).
        existing_matchup_metas = {
            (r.get('meta') or '').strip() for r in existing_matchup_rows
        }
        existing_matchup_metas.discard('')
        if args.matchup_meta:
            metas_to_scrape = {args.matchup_meta} & set(meta_to_tids.keys())
        else:
            metas_to_scrape = set()
            for m in meta_to_tids:
                # active meta — endswith covers BRS-SSP/SVI-PFL style
                # composite meta keys whose tail is the current set code.
                # During the in-person lag window, active_meta = previous
                # rotation so its matchups keep refreshing instead of
                # freezing for the 14-day gap.
                if active_meta and m.endswith(active_meta):
                    metas_to_scrape.add(m)
                # first-time fill: meta has decks but no matchups yet
                elif m not in existing_matchup_metas:
                    metas_to_scrape.add(m)
        meta_to_tids = {k: v for k, v in meta_to_tids.items() if k in metas_to_scrape}
        meta_slug_to_name = {ks: n for ks, n in meta_slug_to_name.items()
                             if ks[0] in metas_to_scrape}
        skipped_metas = existing_matchup_metas - metas_to_scrape
        if skipped_metas:
            logger.info(
                "Matchup cache: skipping %d already-scraped metas (%s) — active=%s (current=%s)",
                len(skipped_metas), ', '.join(sorted(skipped_metas)),
                active_meta or '(unknown)',
                current_meta or '(unknown)',
            )

        total_combos = sum(
            len([s for (m, s) in meta_slug_to_name if m == meta]) * len(args.matchup_days)
            for meta in meta_to_tids
        )
        logger.info(
            "Matchup pass: scraping %d (meta, archetype, day) combos across %d metas (one HTTP each, ~%.1f min @ %ss delay)",
            total_combos, len(meta_to_tids), total_combos * delay / 60, delay,
        )
        combo_idx = 0
        for meta, tids in meta_to_tids.items():
            slugs_for_meta = sorted(s for (m, s) in meta_slug_to_name if m == meta)
            for slug in slugs_for_meta:
                deck_name = meta_slug_to_name.get((meta, slug), slug)
                for day in args.matchup_days:
                    combo_idx += 1
                    logger.info(
                        "  [matchup %d/%d] %s · %s · %s (tids=%d)",
                        combo_idx, total_combos, meta, slug, day, len(tids),
                    )
                    try:
                        result = scrape_archetype_matchups(slug, tids, day_filter=day)
                        matchup_rows.extend(build_matchup_rows(meta, slug, deck_name, result))
                    except Exception as e:  # noqa: BLE001 — log + continue per-deck
                        logger.warning("    Matchup scrape failed for %s/%s/%s: %s", meta, slug, day, e)
                    time.sleep(delay)

        # Aggregated matchups are keyed by (meta, slug, day) rather than
        # tournament_id, so the old per-tid carryover dedup doesn't apply.
        # Drop the entire existing meta+slug+day tuple before overwriting —
        # this lets a re-run with a narrower --matchup-meta still preserve
        # the rest of the file.
        replaced_keys = {
            (r['meta'], r['my_deck_slug'], r['day_filter'])
            for r in matchup_rows
        }
        merged_matchup_rows = [
            r for r in existing_matchup_rows
            if (r.get('meta', ''), r.get('my_deck_slug', ''), r.get('day_filter', '')) not in replaced_keys
        ]
        merged_matchup_rows.extend(matchup_rows)
        save_matchup_rows(merged_matchup_rows)
        logger.info(
            "Matchup pass done. %d new rows + %d carried-over from chunks = %d total.",
            len(matchup_rows), len(merged_matchup_rows) - len(matchup_rows), len(merged_matchup_rows),
        )

    # ── Per-meta split (2026-05-24) ────────────────────────────────────────
    # Write the monolithic CSVs out to data/labs_tournament_decks_<META>.csv
    # and data/labs_tournament_matchups_<META>.csv so the next weekly run
    # can skip closed-meta tournaments via the cache logic above.
    # Dedupe before splitting — same rationale as save_results: if a
    # tournament was discovered through two code paths in one run, both
    # the monolith and the per-meta chunks would otherwise carry the
    # duplicate (Melbourne 2026-05-27 incident).
    merged_deck_rows = _dedupe_deck_rows(merged_deck_rows)
    logger.info("Per-meta split — decks:")
    _split_labs_by_meta(merged_deck_rows, 'labs_tournament_decks', CSV_FIELDS)
    if args.matchups:
        logger.info("Per-meta split — matchups:")
        _split_labs_by_meta(merged_matchup_rows, 'labs_tournament_matchups', MATCHUP_CSV_HEADER)


if __name__ == '__main__':
    main()
