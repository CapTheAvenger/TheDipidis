#!/usr/bin/env python3
"""Champions Replica Teams Scraper.

Pulls the VGCPastes "Champions M-A Repository" Google Sheet
(https://docs.google.com/spreadsheets/d/e/2PACX-1vTXHOfUSKTZyVoxF7BO-XIEqtbrsq1OSh_4bSaO0bhAMHqtsvYqM_4eZWIMqdZ--SKCb86EXuk75o1i/pubhtml?gid=791705272&single=true)
as CSV, picks the top-N entries with a valid in-game replica code,
fetches the linked pokepast.es paste for each, and writes
data/champions_replica_teams.json — consumed by the Side Quest tab
(js/app-side-quest.js).

Output schema mirrors what the frontend already renders:
{
  "_meta": { "title", "subtitle", "last_updated", "source" },
  "teams": [
    {
      "rank": 1,                       // OUR rank by sheet-rank priority
      "replica_code": "G8JVKBFKXA",
      "team_name": "alaninepoke's PJCS 2026 Runner Up Team",
      "tournament": "PJCS 2026",
      "trainer": "alaninepoke",
      "format": "VGC Champions Reg-A",
      "sheet_rank": "Runner Up",
      "date_shared": "8 Jun 2026",
      "pokepaste_url": "https://pokepast.es/34cb00fce368cd94",
      "pokemon": [
        { "name", "item", "ability", "tera_type", "moves": [4] },
        × 6
      ],
      "strategy": []                  // not in sheet, left empty
    }
  ]
}

Usage:
  python backend/scrapers/champions_replica_scraper.py
  python backend/scrapers/champions_replica_scraper.py --top 30
  python backend/scrapers/champions_replica_scraper.py --dry-run
"""

import argparse
import csv
import io
import json
import logging
import os
import re
import sys
import time
from datetime import datetime
from typing import Dict, List, Optional

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_CORE_DIR = os.path.join(_SCRIPT_DIR, '..', 'core')
if _CORE_DIR not in sys.path:
    sys.path.insert(0, _CORE_DIR)

from card_scraper_shared import (
    setup_console_encoding,
    setup_logging,
    get_data_dir,
)

setup_console_encoding()
logger = setup_logging("champions_replica_scraper")

# Google Sheets "publish to web" CSV export URL. The pubhtml URL the
# user shared exposes the same data at /pub?gid=...&output=csv.
SHEET_CSV_URL = (
    "https://docs.google.com/spreadsheets/d/e/"
    "2PACX-1vTXHOfUSKTZyVoxF7BO-XIEqtbrsq1OSh_4bSaO0bhAMHqtsvYqM_4eZWIMqdZ--SKCb86EXuk75o1i/"
    "pub?gid=791705272&single=true&output=csv"
)
POKEPASTE_BASE = "https://pokepast.es"
OUTPUT_FILE = "champions_replica_teams.json"

# Rank priority — used to sort the top-N picks. The sheet has
# "Champion", "Runner Up", "Top 4", "Top 8", "Top 16", "Top 32" plus
# "(Seniors)" / "(Juniors)" variants we treat as half-step lower.
RANK_PRIORITY = {
    'Champion':  1,
    'Runner Up': 2,
    'Top 4':     3,
    'Top 8':     4,
    'Top 16':    5,
    'Top 32':    6,
    'Top 64':    7,
    'Top 128':   8,
}


def _rank_priority(rank_raw: str) -> float:
    """Lower = higher priority. Champion < Top 32 < unknown."""
    r = (rank_raw or '').strip()
    if not r:
        return 999.0
    # Strip age-group suffix for the base match but record the +0.5 nudge
    nudge = 0.0
    if '(Seniors)' in r:
        r = r.replace('(Seniors)', '').strip()
        nudge = 0.4
    if '(Juniors)' in r:
        r = r.replace('(Juniors)', '').strip()
        nudge = 0.6
    if r in RANK_PRIORITY:
        return RANK_PRIORITY[r] + nudge
    m = re.match(r'^Top\s+(\d+)$', r)
    if m:
        return 5.0 + int(m.group(1)) / 200.0 + nudge
    return 900.0 + nudge


def fetch_sheet_csv(url: str = SHEET_CSV_URL) -> str:
    """Fetch the published Google Sheet as CSV. Uses plain requests
    because the pub-CSV endpoint is unauthenticated and doesn't sit
    behind Cloudflare."""
    import requests
    logger.info("Fetching Google Sheet CSV …")
    resp = requests.get(url, timeout=30, headers={
        'User-Agent': 'TheDipidisChampionsBot/1.0 (+https://thedipidis.app)',
    })
    resp.raise_for_status()
    text = resp.text
    logger.info("  → %d bytes received", len(text))
    return text


def parse_sheet(csv_text: str) -> List[Dict[str, str]]:
    """Parse the CSV — find the header row (anywhere in the first
    50 rows), then return each subsequent data row as a dict.

    The VGCPastes sheet has decorative banner rows above the actual
    header. Those banners contain prose like "DM us in Discord if
    Replica Code is not available anymore!" — a substring match for
    'replica code' alone hits that banner first and picks the wrong
    row (2026-06-09 weekly run regression).

    Header detection now requires the matched cell to look like an
    actual column name: short ( ≤ 40 chars) AND the row carries
    several other short, header-like cells. Real header rows are
    things like ['Rank', 'Replica Code', 'Pokepaste', 'Team
    Description', 'Full Name', 'Tournament / Event', …]."""
    reader = csv.reader(io.StringIO(csv_text))
    rows = list(reader)
    if not rows:
        return []

    def _looks_like_header(row: List[str]) -> bool:
        short_nonempty = [c.strip() for c in row if c and 0 < len(c.strip()) <= 40]
        if len(short_nonempty) < 4:
            return False
        # The matched 'replica code' cell must itself be a short header,
        # not a sentence containing the substring.
        for c in short_nonempty:
            if 'replica code' in c.lower():
                return True
        return False

    header_idx = None
    for i, row in enumerate(rows[:50]):
        if _looks_like_header(row):
            header_idx = i
            break
    if header_idx is None:
        logger.warning("Could not find header row with 'Replica Code' (short-header heuristic)")
        return []
    headers = [h.strip() for h in rows[header_idx]]
    logger.info("  → header row at index %d, %d columns", header_idx, len(headers))

    out: List[Dict[str, str]] = []
    for row in rows[header_idx + 1:]:
        # Pad short rows so dict access is safe
        if len(row) < len(headers):
            row = row + [''] * (len(headers) - len(row))
        rec = {}
        for h, v in zip(headers, row):
            if not h:
                continue
            rec[h] = (v or '').strip()
        # Skip entirely-empty rows
        if any(rec.values()):
            out.append(rec)
    logger.info("  → %d data rows", len(out))
    return out


def _get_field(row: Dict[str, str], *names: str) -> str:
    """Look up a value by ANY of the given header names — the sheet
    uses slightly different wording across tabs ('Tournament / Event'
    vs 'Tournament', 'Replica Code (Click text for image)' vs
    'Replica Code')."""
    for n in names:
        if n in row and row[n].strip():
            return row[n].strip()
    # Loose match (case-insensitive substring)
    lower_targets = [n.lower() for n in names]
    for k, v in row.items():
        kl = k.lower()
        if any(t in kl for t in lower_targets):
            if v and v.strip():
                return v.strip()
    return ''


def _is_valid_replica(code: str) -> bool:
    """Replica codes are usually 10 alphanumeric chars. Reject 'None',
    'Extracted', blanks, and anything obviously not a code."""
    if not code:
        return False
    c = code.strip()
    if c.lower() in ('none', 'extracted', 'n/a', '-'):
        return False
    # Real codes look like SQMPYRW6BP, G8JVKBFKXA — letters + digits,
    # typically 8-12 chars. Be permissive on length but require
    # at-least-some alphanumerics.
    if not re.match(r'^[A-Za-z0-9]{6,16}$', c):
        return False
    return True


POKEPASTE_ID_RE = re.compile(r'pokepast\.es/([a-f0-9]+)', re.IGNORECASE)


def fetch_pokepaste_raw(url: str, timeout: int = 15) -> Optional[str]:
    """Pokepaste exposes the Showdown-format team text at /<id>/raw —
    far more reliable than scraping the HTML."""
    if not url:
        return None
    m = POKEPASTE_ID_RE.search(url)
    if not m:
        return None
    paste_id = m.group(1)
    raw_url = f"{POKEPASTE_BASE}/{paste_id}/raw"
    import requests
    try:
        resp = requests.get(raw_url, timeout=timeout, headers={
            'User-Agent': 'TheDipidisChampionsBot/1.0 (+https://thedipidis.app)',
        })
        if resp.ok and resp.text.strip():
            return resp.text
        logger.warning("  pokepaste %s returned HTTP %d", paste_id, resp.status_code)
    except Exception as e:
        logger.warning("  pokepaste %s fetch failed: %s", paste_id, e)
    return None


# Showdown-format mon block:
#   Charizard @ Charizardite Y
#   Ability: Blaze
#   Level: 50
#   Tera Type: Fire   (optional)
#   EVs: 16 HP / 25 Def / 12 SpA / 13 Spe   (optional)
#   Modest Nature   (optional)
#   - Heat Wave
#   - Weather Ball
#   - Solar Beam
#   - Protect

_MON_FIRST_LINE_RE = re.compile(
    r'^\s*'
    r'([^()@\n]+?)'           # name (greedy but no @, parens)
    r'(?:\s*\(([^)]+)\))?'    # optional gender / nickname
    r'(?:\s*@\s*(.+))?'       # optional @ Item
    r'\s*$'
)


def parse_pokemon_text(text: str) -> List[Dict]:
    """Split the paste text on blank-line boundaries and parse each
    block into a {name, item, ability, tera_type, moves[]} dict.
    Skips comment / nickname-only blocks gracefully."""
    if not text:
        return []
    text = text.replace('\r\n', '\n').replace('\r', '\n').strip()
    blocks = re.split(r'\n\s*\n+', text)
    mons: List[Dict] = []
    for block in blocks:
        lines = [l.rstrip() for l in block.split('\n') if l.strip()]
        if not lines:
            continue
        first = lines[0].strip()
        m = _MON_FIRST_LINE_RE.match(first)
        if not m:
            continue
        # Showdown lets builders nickname mons — when they do, the real
        # species is in parens: "Mr. Fancy (Incineroar) @ Sitrus Berry".
        # We need the species (not the nickname) so the Limitless R2
        # icon lookup hits. The parens are skipped when they hold a
        # gender token (M/F) or a single-word non-species hint.
        name = (m.group(1) or '').strip()
        species_in_parens = (m.group(2) or '').strip()
        if species_in_parens and species_in_parens.upper() not in ('M', 'F'):
            name = species_in_parens
        if not name:
            continue
        item = (m.group(3) or '').strip()
        mon = {
            'name': name,
            'item': item,
            'ability': '',
            'tera_type': '',
            'moves': [],
        }
        for line in lines[1:]:
            s = line.strip()
            if s.lower().startswith('ability:'):
                mon['ability'] = s.split(':', 1)[1].strip()
            elif s.lower().startswith('tera type:'):
                mon['tera_type'] = s.split(':', 1)[1].strip()
            elif s.startswith('-'):
                move = s.lstrip('-').strip()
                if move:
                    mon['moves'].append(move)
        if mon['moves'] or mon['ability']:
            mons.append(mon)
    return mons


def build_team_record(row: Dict[str, str], rank_position: int) -> Dict:
    code = _get_field(row, 'Replica Code (Click text for image)', 'Replica Code')
    pokepaste = _get_field(row, 'Pokepaste', 'PokePaste', 'Paste')
    team_name = _get_field(row, 'Team Description', 'Team Name', 'Description')
    trainer = _get_field(row, 'Full Name', 'Owner', 'Trainer', 'Player')
    tournament = _get_field(row, 'Tournament / Event', 'Tournament', 'Event')
    sheet_rank = _get_field(row, 'Rank', 'Placement')
    date_shared = _get_field(row, 'Date Shared', 'Date')

    pokemon: List[Dict] = []
    if pokepaste:
        text = fetch_pokepaste_raw(pokepaste)
        if text:
            pokemon = parse_pokemon_text(text)
            logger.info("    → parsed %d mons from %s", len(pokemon), pokepaste)
        else:
            logger.warning("    no paste text for %s", pokepaste)

    return {
        'rank':          rank_position,
        'replica_code':  code,
        'team_name':     team_name or f'Team #{rank_position}',
        'tournament':    tournament,
        'trainer':       trainer,
        'format':        'VGC Champions',
        'sheet_rank':    sheet_rank,
        'date_shared':   date_shared,
        'pokepaste_url': pokepaste,
        'pokemon':       pokemon,
        'strategy':      [],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--top', type=int, default=20,
                    help='Number of top teams to include (default 20)')
    ap.add_argument('--delay', type=float, default=0.7,
                    help='Seconds between pokepaste fetches (default 0.7)')
    ap.add_argument('--dry-run', action='store_true',
                    help='Print the result instead of writing the JSON')
    args = ap.parse_args()

    csv_text = fetch_sheet_csv()
    rows = parse_sheet(csv_text)

    # Filter to rows with a real replica code (skip "None" / "Extracted"
    # / blanks the sheet uses for entries waiting on a code).
    candidates = []
    rejected_samples: List[str] = []
    for row in rows:
        code = _get_field(row, 'Replica Code (Click text for image)', 'Replica Code')
        if not _is_valid_replica(code):
            if code and len(rejected_samples) < 8:
                rejected_samples.append(code)
            continue
        candidates.append((row, _rank_priority(_get_field(row, 'Rank', 'Placement'))))

    logger.info("Candidate teams with valid replica codes: %d", len(candidates))
    if not candidates and rows:
        # Diagnostic: the sheet was reachable and parsed, but no row passed
        # _is_valid_replica(). Surface the columns we saw + sample values
        # for the columns whose names look promising so we can re-tune
        # the regex / header lookup on the next run without another
        # round-trip.
        sample_row = rows[0]
        logger.warning("No valid replica codes found. Sheet columns: %s",
                       sorted(sample_row.keys()))
        if rejected_samples:
            logger.warning("Sample REJECTED values from the 'Replica Code'-like column: %s",
                           rejected_samples)
        for h, v in sample_row.items():
            if 'replica' in h.lower() or 'code' in h.lower() or 'paste' in h.lower():
                col_vals = [r.get(h, '') for r in rows[:5] if r.get(h, '').strip()]
                logger.warning("  Column %r — first 5 non-empty: %s", h, col_vals)

    # Sort by rank priority (lower = better), then take top N
    candidates.sort(key=lambda x: x[1])
    chosen = candidates[:args.top]
    logger.info("Selected top %d", len(chosen))

    teams: List[Dict] = []
    for i, (row, _prio) in enumerate(chosen, 1):
        logger.info("[%d/%d] %s",
                    i, len(chosen),
                    _get_field(row, 'Team Description', 'Team Name')[:60])
        rec = build_team_record(row, i)
        teams.append(rec)
        if i < len(chosen):
            time.sleep(args.delay)

    output = {
        '_meta': {
            'title':        'Pokémon Champions — Current Top Doubles Teams',
            'subtitle':     'Replica codes from top tournament finishes. Tap a code to copy.',
            'last_updated': datetime.utcnow().strftime('%Y-%m-%d'),
            'source':       'VGCPastes Champions M-A spreadsheet (gid=791705272)',
            'source_url':   SHEET_CSV_URL,
            'team_count':   len(teams),
        },
        'teams': teams,
    }

    if args.dry_run:
        print(json.dumps(output, indent=2, ensure_ascii=False))
        return 0

    out_path = os.path.join(get_data_dir(), OUTPUT_FILE)

    # FAIL-SOFT: if this run produced zero teams (parser regression,
    # Google Sheet temporarily empty, column renamed, etc.), keep the
    # last good JSON on disk instead of replacing the user-visible Side
    # Quest tab with an empty list. Users get the previous snapshot
    # rather than a blank panel; the diagnostic warnings above tell us
    # what to fix next run.
    if not teams and os.path.exists(out_path):
        logger.warning("0 teams parsed — keeping previous %s untouched", out_path)
        return 0

    tmp_path = out_path + '.tmp'
    with open(tmp_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    os.replace(tmp_path, out_path)
    logger.info("Wrote %s (%d teams)", out_path, len(teams))
    return 0


if __name__ == '__main__':
    sys.exit(main() or 0)
