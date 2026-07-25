#!/usr/bin/env python3
"""Cross-pipeline tournament-coverage reconciliation.

Companion to scripts/sanity_check_data.py. That script guards against EMPTY
or truncated files (row-count thresholds). This one guards against a subtler
failure the row-count gate can't see: a tournament that was scraped on one
surface but never propagated to the files the tabs actually read — the files
are full, just missing a tournament.

Concretely: every in-person major in the current format's labs file
(``labs_tournament_decks_<FMT>.csv``) should also appear in the current
format's cards file (``tournament_cards_data_cards_<FMT>.csv``). When it
doesn't — as happened with NAIC (in labs as id 0070, absent from the cards
chunk for weeks) — we emit a GitHub ``::warning::`` so it shows up on the run
page on day one instead of being noticed by eye weeks later.

Matching is by normalised tournament DATE (labs writes ISO ``2026-06-12``;
cards writes the ordinal ``12th June 2026``) plus a fuzzy name check, because
the two surfaces name the same event differently ("Special Event Turin" vs
"Special Event Turin – Limitless"). Only majors at/above MAJOR_MIN_PLAYERS
and older than the grace period are checked, so a tournament that finished a
day ago (and simply hasn't propagated yet) never trips a false alarm.

Exit-code policy (matches sanity_check_data.py — soft by default):
    0  → ran successfully, regardless of how many gaps were found (gaps are
         surfaced as ``::warning::`` lines for the build summary)
    1  → script error (missing format_window.json etc.), OR any gap found
         when --strict is given (for local/manual verification)

Usage:
    python3 scripts/reconcile_tournament_coverage.py [DATA_DIR] [--strict] \
        [--grace-days N]
"""

from __future__ import annotations

import argparse
import csv
import difflib
import glob
import json
import os
import re
import sys
from datetime import datetime, timedelta

SEMI = ";"
COMMA = ","

# Ignore tiny local events that may legitimately live on one surface only.
MAJOR_MIN_PLAYERS = 200


class NotChecked(Exception):
    """The reconciliation could not run because a required file is absent.

    Distinct from "ran and found nothing": the caller must report
    NOT CHECKED, never OK. Right after a rotation neither file for the new
    format exists yet, and the previous code returned an empty gap list --
    printing a green "OK (no gaps)" while examining zero tournaments.
    """


def _load_overrides(data_dir: str) -> dict:
    """data/labs_tournament_id_overrides.json -> {cards_tid: labs_tid}.

    Same file the scraper uses for the renames name-matching cannot bridge.
    Missing or unreadable is fine -- the matcher just loses one layer.
    """
    path = os.path.join(data_dir, "labs_tournament_id_overrides.json")
    try:
        with open(path, encoding="utf-8-sig") as fh:
            blob = json.load(fh)
    except (OSError, json.JSONDecodeError):
        return {}
    out = {}
    for cards_tid, entry in (blob.get("overrides") or {}).items():
        labs_tid = entry.get("labs_tournament_id") if isinstance(entry, dict) else entry
        if labs_tid:
            out[str(cards_tid)] = str(labs_tid)
    return out


def _parse_date(raw: str):
    """Accept ISO 'YYYY-MM-DD' and English-ordinal '12th June 2026'."""
    raw = (raw or "").strip()
    if not raw:
        return None
    try:
        return datetime.strptime(raw, "%Y-%m-%d")
    except ValueError:
        pass
    m = re.match(r"(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})", raw)
    if not m:
        return None
    try:
        return datetime.strptime(
            f"{m.group(1)} {m.group(2)[:3]} {m.group(3)}", "%d %b %Y"
        )
    except ValueError:
        return None


def _norm_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


# Keep in sync with _US_STATE_CODES in backend/scrapers/tournament_scraper_JH.py.
# Duplicated rather than imported: this script runs standalone in CI with only
# data/ available, and importing the scraper drags in its whole dependency tree.
_US_STATE_CODES = {
    'al', 'ak', 'az', 'ar', 'ca', 'co', 'ct', 'de', 'fl', 'ga', 'hi', 'id',
    'il', 'in', 'ia', 'ks', 'ky', 'la', 'me', 'md', 'ma', 'mi', 'mn', 'ms',
    'mo', 'mt', 'ne', 'nv', 'nh', 'nj', 'nm', 'ny', 'nc', 'nd', 'oh', 'ok',
    'or', 'pa', 'ri', 'sc', 'sd', 'tn', 'tx', 'ut', 'vt', 'va', 'wa', 'wv',
    'wi', 'wy', 'dc',
}

_BOILERPLATE_RE = re.compile(
    r'\b(championships?|limitless|regional|special\s+event|international|world|'
    r'stadium|tcg|pokemon|pokémon)\b'
)


def _token_key(name: str) -> set:
    """City tokens of a tournament name, boilerplate removed.

    This is the same idea as _normalize_tournament_name_for_match in
    backend/scrapers/tournament_scraper_JH.py, which is the normaliser that
    actually works on this data. The substring test this script used before
    ("is one flat string inside the other") flagged 58 of 58 checked majors
    as gaps -- a 100% false-positive rate -- because labs writes
    "Regional Championship Merida" and the cards pipeline writes
    "Regional Merida - Limitless": the interposed "Championship" and the
    appended "Limitless" mean neither string contains the other. Only
    "Special Event X" ever passed, and only by accident of prefixing.
    """
    s = (name or "").lower()
    s = re.sub(r'[–—\-]', ' ', s)
    s = _BOILERPLATE_RE.sub(' ', s)
    s = re.sub(r'[^a-z0-9]+', ' ', s)
    # Drop state codes and bare years ("NAIC 2026" -> {"naic"}).
    return {tok for tok in s.split()
            if tok not in _US_STATE_CODES and not re.fullmatch(r'(19|20)\d{2}', tok)}


def _fuzzy_close(a: set, b: set) -> bool:
    """Last-resort match for locale spellings the token overlap misses --
    labs "Seville" vs cards "Sevilla", "Nuremberg" vs "Nurnberg".

    Compares the boilerplate-stripped TOKEN keys, not the raw names: against
    the full strings, "specialeventseville" vs "specialeventsevillalimitless"
    scores below the threshold purely because of the "Limitless" suffix, and
    the one case this layer exists for would fail. Only ever consulted for
    tournaments that already share a date.
    """
    if not a or not b:
        return False
    return difflib.SequenceMatcher(None, ' '.join(sorted(a)),
                                   ' '.join(sorted(b))).ratio() >= 0.82


def _distinct_tournaments(path: str, delimiter: str):
    """{tournament_id: (name, date_obj, players)} for a tournament CSV."""
    out: dict[str, tuple] = {}
    if not os.path.isfile(path):
        return out
    with open(path, encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh, delimiter=delimiter):
            tid = (row.get("tournament_id") or "").strip()
            if not tid or tid in out:
                continue
            try:
                players = int(float(row.get("total_players") or 0))
            except ValueError:
                players = 0
            out[tid] = (
                (row.get("tournament_name") or "").strip(),
                _parse_date(row.get("tournament_date") or ""),
                players,
            )
    return out


def find_coverage_gaps(data_dir: str, grace_days: int) -> list[str]:
    """Gap descriptions only (empty list = all covered).

    Kept as the stable entry point; use find_coverage_gaps_detailed when the
    caller needs to report WHICH format was actually reconciled.
    """
    return find_coverage_gaps_detailed(data_dir, grace_days)[1]


def find_coverage_gaps_detailed(data_dir: str, grace_days: int):
    """(checked_format, gaps).

    Raises FileNotFoundError if format_window.json is missing/unreadable and
    NotChecked when there is no labs/cards pair to reconcile at all.
    """
    overrides = _load_overrides(data_dir)
    fw_path = os.path.join(data_dir, "format_window.json")
    with open(fw_path, encoding="utf-8-sig") as fh:
        fw = json.load(fh)
    current = (fw.get("current_set") or "").strip().upper()
    oldest = (fw.get("oldest_legal_set") or "").strip().upper()
    if not current or not oldest:
        raise ValueError("format_window.json lacks current_set/oldest_legal_set")
    fmt = f"{oldest}-{current}"

    def paths_for(f):
        return (os.path.join(data_dir, f"labs_tournament_decks_{f}.csv"),
                os.path.join(data_dir, f"tournament_cards_data_cards_{f}.csv"))

    labs_path, cards_path = paths_for(fmt)
    if os.path.isfile(labs_path) and os.path.isfile(cards_path):
        return fmt, _gaps_for_pair(fmt, labs_path, cards_path, grace_days, overrides)

    # The current format has no files yet. That is the NORMAL state for the
    # two weeks between a set's release and its in-person legality (PBL:
    # released 2026-07-17, legal 2026-07-31), and the previous code returned
    # an empty gap list here -- printing a green "OK (no gaps)" while
    # examining zero tournaments, the same vacuous green as the "0 of 36
    # images OK" incident.
    #
    # Rather than going dormant for a fortnight, fall back to the newest
    # format that DOES have both files: propagation gaps in the format that
    # just closed are exactly as worth catching, and the caller is told which
    # format was actually checked.
    candidates = []
    for p in glob.glob(os.path.join(data_dir, "labs_tournament_decks_*.csv")):
        other = os.path.basename(p)[len("labs_tournament_decks_"):-len(".csv")]
        lp, cp = paths_for(other)
        if os.path.isfile(cp):
            candidates.append((os.path.getmtime(p), other, lp, cp))
    if not candidates:
        raise NotChecked(f"no labs/cards file pair for {fmt} and no earlier format to fall back to")

    _mtime, prev_fmt, lp, cp = max(candidates)
    gaps = _gaps_for_pair(prev_fmt, lp, cp, grace_days, overrides)
    return (prev_fmt,
            [f"(checked {prev_fmt}; {fmt} has no files yet) {g}" for g in gaps])


def _gaps_for_pair(fmt, labs_path, cards_path, grace_days, overrides):
    labs = _distinct_tournaments(labs_path, COMMA)
    cards = _distinct_tournaments(cards_path, SEMI)

    # Pre-compute both keys for every cards-side tournament once.
    cards_entries = []   # (tid, flat_name, token_set, date_or_None)
    for tid, (name, dobj, _players) in cards.items():
        cards_entries.append((tid, _norm_name(name), _token_key(name),
                              dobj.date() if dobj else None))
    cards_by_date: dict = {}
    for entry in cards_entries:
        if entry[3]:
            cards_by_date.setdefault(entry[3], []).append(entry)

    cutoff = datetime.utcnow() - timedelta(days=grace_days)
    gaps: list[str] = []
    for tid, (name, dobj, players) in sorted(labs.items()):
        if players < MAJOR_MIN_PLAYERS:
            continue
        if dobj is None or dobj > cutoff:
            continue  # too fresh / undated — give the cards pipeline time

        flat = _norm_name(name)
        tokens = _token_key(name)
        same_day = cards_by_date.get(dobj.date(), [])

        # Layer 1 — same date plus a shared city token. This is the one that
        # does the work: the date already pins the event down, and the token
        # overlap distinguishes two majors on the same weekend.
        matched = any(tokens & c_tokens for (_t, _f, c_tokens, _d) in same_day)

        # Layer 2 — the manual override table. It exists precisely for the
        # renames no normaliser can bridge (labs "International Championship
        # New Orleans" vs cards "NAIC 2026, New Orleans"), so consult it
        # instead of re-flagging what a human already reconciled.
        if not matched and overrides:
            mapped = {c_tid for c_tid, labs_tid in overrides.items()
                      if str(labs_tid).lstrip('0') == str(tid).lstrip('0')}
            matched = any(c_tid in mapped for (c_tid, _f, _tk, _d) in cards_entries)

        # Layer 3 — same date and a near-identical spelling ("Seville" vs
        # "Sevilla"). Date-gated, so it can only rescue, never invent.
        if not matched:
            matched = any(_fuzzy_close(tokens, c_tokens) for (_t, _f, c_tokens, _d) in same_day)

        # Layer 4 — the old flat-substring test, kept as a floor so this
        # change can only ever match MORE than before, never less.
        if not matched:
            matched = any(flat in c_flat or c_flat in flat
                          for (_t, c_flat, _tk, _d) in cards_entries)

        if not matched:
            gaps.append(
                f"{fmt}: labs major '{name}' ({dobj.date()}, {players} players, "
                f"id {tid}) is missing from tournament_cards_data_cards_{fmt}.csv"
            )
    return gaps


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("data_dir", nargs="?", default="data")
    ap.add_argument("--grace-days", type=int, default=3,
                    help="Only flag majors older than this many days (default 3).")
    ap.add_argument("--strict", action="store_true",
                    help="Exit 1 when a gap is found (for local verification).")
    args = ap.parse_args(argv[1:])

    data_dir = os.path.abspath(args.data_dir)
    if not os.path.isdir(data_dir):
        print(f"::error::data dir not found: {data_dir}", file=sys.stderr)
        return 1

    try:
        checked_fmt, gaps = find_coverage_gaps_detailed(data_dir, args.grace_days)
    except NotChecked as exc:
        # Explicitly NOT "OK". Nothing was compared, and saying otherwise is
        # how a check quietly stops checking. Exit 0 because this is the
        # expected state in the two weeks between a set release and its
        # in-person legality.
        print(f"Tournament coverage reconciliation: NOT CHECKED — {exc}")
        print(f"::notice::Tournament coverage not reconciled — {exc}")
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"::error::reconciliation could not run: {exc}", file=sys.stderr)
        return 1

    if not gaps:
        # Always name the format that was compared. "OK" on its own cannot be
        # distinguished from "OK because nothing was examined".
        print(f"Tournament coverage reconciliation: OK (no gaps) — checked {checked_fmt}")
        return 0

    print(f"Tournament coverage reconciliation: {len(gaps)} gap(s) found in {checked_fmt}")
    for g in gaps:
        print(f"  - {g}")
        print(f"::warning::Tournament coverage gap — {g}")
    return 1 if args.strict else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
