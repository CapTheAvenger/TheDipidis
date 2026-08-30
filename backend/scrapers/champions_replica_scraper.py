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
from datetime import date, datetime, timedelta
from typing import Dict, Iterable, List, Optional, Tuple

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


# ── Zeichensatz ──────────────────────────────────────────────────────
#
# BEFUND (30.08.2026): in data/champions_replica_teams.json stand
# "Sidi I. Haidala's PokÃ©ChampionsDestiny Top 4 Team", in
# data/champions_team_strategies.json "Extreme Speed PokÃ©mon
# Champions #5". Drei Stellen, in der Oberflaeche sichtbar.
#
# URSACHE: `requests` faellt fuer resp.text auf ISO-8859-1 zurueck,
# wenn der Content-Type-Kopf keinen charset nennt (so schreibt es
# RFC 2616 vor). Der CSV-Export von Google Sheets nennt keinen — die
# UTF-8-Bytes von "é" (0xC3 0xA9) wurden also als zwei Latin-1-Zeichen
# gelesen: "Ã©". Kein Fehler, keine Meldung, nur falsche Buchstaben.
#
# Beide Quellen liefern UTF-8. Wenn der Kopf nichts sagt, sagen wir es.


def _text_utf8(resp) -> str:
    """resp.text, aber ohne den Latin-1-Rueckfall von requests."""
    kopf = (resp.headers.get('content-type') or '').lower()
    if 'charset=' not in kopf:
        resp.encoding = 'utf-8'
    return resp.text


# Die Anfangszeichen, an denen ein Fehllesen zu erkennen ist: 0xC3/0xC2
# leiten in UTF-8 fast jeden westeuropaeischen Buchstaben ein, 0xE2 jedes
# typografische Zeichen. Wer keines davon traegt, wird nicht angefasst.
_MOJIBAKE = re.compile(r'[ÃÂâ][\u0080-\u00ff\u0152\u0153\u0160\u0161'
                       r'\u0178\u017d\u017e\u0192\u02c6\u02dc'
                       r'\u2013\u2014\u2018-\u201e\u2020-\u2022'
                       r'\u2026\u2030\u2039\u203a\u20ac\u2122]')

# Zwei Fehllesarten kommen vor: ISO-8859-1 (der Rueckfall von requests,
# RFC 2616) und cp1252 (was Browser und viele Werkzeuge stattdessen
# nehmen). Sie unterscheiden sich nur in 0x80-0x9f — genau dort, wo "ß"
# und die typografischen Anfuehrungszeichen liegen. Beide werden
# probiert, in dieser Reihenfolge.
_FEHLLESARTEN = ('latin-1', 'cp1252')


def entwirre(text):
    """Dreht ein Fehllesen zurueck — oder laesst den Text in Ruhe.

    Das ist keine Schaetzung: `text.encode(<lesart>).decode('utf-8')` ist
    die EXAKTE Umkehrung des Fehlers. Geht sie fuer keine der beiden
    Lesarten auf, war es kein Fehllesen, und der Text bleibt
    unveraendert. Angefasst wird ausserdem nur, was eines der bekannten
    Anfangszeichen traegt.
    """
    if not isinstance(text, str):
        return text
    # Bis zu drei Runden: ein Text kann zweimal fehlgelesen worden sein
    # (einmal beim Abruf, einmal beim Weiterreichen), und dann steht
    # nach der ersten Umkehrung immer noch ein Doppelzeichen da.
    for _ in range(3):
        if not _MOJIBAKE.search(text):
            break
        naechster = None
        for lesart in _FEHLLESARTEN:
            try:
                naechster = text.encode(lesart).decode('utf-8')
            except (UnicodeEncodeError, UnicodeDecodeError):
                continue
            break
        # Geht keine der beiden Lesarten auf, war es kein Fehllesen —
        # dann bleibt der Text, wie er ist.
        if naechster is None or naechster == text:
            break
        text = naechster
    return text


def entwirre_tief(wert):
    """entwirre() ueber verschachtelte Listen und Woerterbuecher."""
    if isinstance(wert, str):
        return entwirre(wert)
    if isinstance(wert, list):
        return [entwirre_tief(x) for x in wert]
    if isinstance(wert, dict):
        return {k: entwirre_tief(v) for k, v in wert.items()}
    return wert

# The VGCPastes "Champions" repository is a public Google Sheet with one
# tab per regulation (plus non-Champions tabs we ignore). We DISCOVER the
# Champions regulation tabs dynamically from the sheet's tab list (via the
# doc's htmlview), so a new regulation (e.g. M-C) is picked up
# automatically with no code change. Each tab's CSV is then pulled from the
# stable "publish to web" endpoint — the /export endpoint redirects to a
# googleusercontent host that times out, whereas /pub is fast and reliable.
SHEET_DOC_ID = "1axlwmzPA49rYkqXh7zHvAtSP-TKbM0ijGYBPRflLSWw"
SHEET_HTMLVIEW_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_DOC_ID}/htmlview"
SHEET_CSV_TEMPLATE = (
    "https://docs.google.com/spreadsheets/d/e/"
    "2PACX-1vTXHOfUSKTZyVoxF7BO-XIEqtbrsq1OSh_4bSaO0bhAMHqtsvYqM_4eZWIMqdZ--SKCb86EXuk75o1i/"
    "pub?gid={gid}&single=true&output=csv"
)
# Fallback if tab discovery fails (e.g. Google changes its markup) — the
# last-known Champions regulation tabs, newest first, so the scraper never
# goes dark.
FALLBACK_TABS = [('M-B', '1458357160'), ('M-A', '791705272')]
# Back-compat alias for metadata / older references.
SHEET_CSV_URL = SHEET_CSV_TEMPLATE.format(gid=FALLBACK_TABS[0][1])
POKEPASTE_BASE = "https://pokepast.es"
OUTPUT_FILE = "champions_replica_teams.json"
# Speed corpus: a separate analytical artefact built from a wider slice
# of the same sheet — every team within the date window, not just the
# top-N selected for UI display. Used by the Side Quest "Play this team"
# panel to compute typical opponent Speed from a much larger sample than
# the 20 teams we render. User-flagged 2026-06-15: 14-day mode estimate
# is dominated by the active set of decklists, top-20 is too narrow.
SPEED_CORPUS_FILE = "champions_speed_corpus.json"

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


# Tolerant parser for the "Date Shared" column. The sheet writes dates
# inconsistently ("8 Jun 2026", "24 May 2026", sometimes "2026-06-08",
# rarely "08/06/2026"). Falls back to None on garbage — downstream
# filtering treats None as "out of window".
_MONTHS = {m: i for i, m in enumerate(
    ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'], 1)}


def parse_date_shared(raw: str) -> Optional[date]:
    """Parse the verbatim Date Shared cell into a date. Permissive —
    the sheet has been manually maintained for years so the formats
    aren't normalised."""
    if not raw:
        return None
    s = str(raw).strip()
    if not s:
        return None
    # "8 Jun 2026" / "24 May 2026" — the common case
    m = re.match(r'^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$', s)
    if m:
        mon = _MONTHS.get(m.group(2)[:3].lower())
        if mon:
            try:
                return date(int(m.group(3)), mon, int(m.group(1)))
            except ValueError:
                return None
    # ISO "2026-06-08"
    m = re.match(r'^(\d{4})-(\d{1,2})-(\d{1,2})$', s)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            return None
    # Slash-separated "08/06/2026" — assume DMY (sheet is European)
    m = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{4})$', s)
    if m:
        try:
            return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        except ValueError:
            return None
    return None


def filter_within_window(
    candidates: List[Tuple[Dict[str, str], float]],
    today: date,
    window_days: int,
) -> List[Tuple[Dict[str, str], float]]:
    """Keep candidates whose Date Shared sits within
    [today - window_days, today]. Unparseable dates are dropped (we
    can't safely include them in a moving-window stat). Maintains the
    input order — caller has already sorted by rank-priority."""
    if window_days <= 0:
        return list(candidates)
    cutoff = today - timedelta(days=window_days)
    out = []
    for row, prio in candidates:
        raw = _get_field(row, 'Date Shared', 'Date')
        d = parse_date_shared(raw)
        if d is None:
            continue
        if cutoff <= d <= today:
            out.append((row, prio))
    return out


def build_speed_samples(team_records: Iterable[Dict]) -> List[Dict]:
    """Flatten team records into per-mon (species, evs, nature, date,
    replica) sample objects. Skips mons missing an evs string — those
    contribute nothing to a Speed-investment mode estimate."""
    out: List[Dict] = []
    for t in team_records:
        date_shared = t.get('date_shared', '')
        replica = t.get('replica_code', '')
        for p in t.get('pokemon', []):
            evs = (p.get('evs') or '').strip()
            if not evs:
                continue
            name = (p.get('name') or '').strip()
            if not name:
                continue
            out.append({
                'species': name,
                'evs': evs,
                'nature': (p.get('nature') or '').strip(),
                'date': date_shared,
                'replica': replica,
            })
    return out


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
    text = _text_utf8(resp)
    logger.info("  → %d bytes received", len(text))
    return text


def discover_regulation_tabs() -> List[Tuple[str, str]]:
    """Read the sheet's tab list and return [(regulation, gid)] for every
    'Champions M-x' tab, newest regulation first (so M-C outranks M-B
    outranks M-A automatically). The "… Featured Teams" tabs and any
    non-Champions tabs (e.g. 'SV Regulation I') are ignored.

    Falls back to FALLBACK_TABS on any error so a Google markup change
    never takes the scraper offline."""
    import requests
    try:
        resp = requests.get(SHEET_HTMLVIEW_URL, timeout=30, headers={
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 '
                          '(KHTML, like Gecko) Chrome/124 Safari/537.36',
        })
        resp.raise_for_status()
        html = _text_utf8(resp)
        # The tab switcher embeds JS like:
        #   {name: "Champions M-B", pageUrl: "...gid=1458357160", gid: "1458357160", …}
        items = re.findall(r'name:\s*"([^"]+)"[^}]*?gid:\s*"(\d+)"', html)
        tabs: List[Tuple[str, str]] = []
        for name, gid in items:
            # Match exactly 'Champions M-<letters>' (no trailing words like
            # 'Featured Teams'); capture the regulation suffix.
            m = re.match(r'champions\s+m-?([a-z]+)\s*$', name.strip(), re.IGNORECASE)
            if m:
                tabs.append(('M-' + m.group(1).upper(), gid))
        # De-dupe by regulation, newest (lexically-largest letter) first.
        tabs.sort(key=lambda t: t[0], reverse=True)
        seen, out = set(), []
        for reg, gid in tabs:
            if reg not in seen:
                seen.add(reg)
                out.append((reg, gid))
        if out:
            logger.info("Discovered Champions regulation tabs: %s", out)
            return out
        logger.warning("No 'Champions M-x' tabs found in sheet — using fallback")
    except Exception as e:  # noqa: BLE001 — discovery is best-effort
        logger.warning("Tab discovery failed (%s) — using fallback", e)
    return FALLBACK_TABS


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
            return _text_utf8(resp)
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

# Cosmetic-only form suffixes — visually identical to the base species
# sprite, so dropping the suffix in both the display name and the slug
# gives us a working Limitless R2 icon. Sinistcha / Polteageist / Sinistea
# have three rarity variants (Masterpiece / Unremarkable / Counterfeit /
# Antique / Phony) that the CDN doesn't host as form-specific sprites.
# Extend this list when new cosmetic-only forms show up.
_COSMETIC_FORM_SUFFIXES = {
    'masterpiece', 'unremarkable', 'counterfeit',
    'antique', 'phony',
}


def _strip_cosmetic_form(name: str) -> str:
    """If the last hyphen-separated token is a purely-cosmetic form
    marker, drop it. 'Sinistcha-Masterpiece' → 'Sinistcha'."""
    if '-' not in name:
        return name
    head, _, tail = name.rpartition('-')
    if tail.lower() in _COSMETIC_FORM_SUFFIXES and head:
        return head
    return name


def parse_pokemon_text(text: str) -> List[Dict]:
    """Split the paste text on blank-line boundaries and parse each
    block into a {name, item, ability, tera_type, evs, nature, moves[]}
    dict. Skips comment / nickname-only blocks gracefully."""
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
        name = _strip_cosmetic_form(name)
        if not name:
            continue
        item = (m.group(3) or '').strip()
        mon = {
            'name': name,
            'item': item,
            'ability': '',
            'tera_type': '',
            'evs': '',
            'nature': '',
            'moves': [],
        }
        for line in lines[1:]:
            s = line.strip()
            if s.lower().startswith('ability:'):
                mon['ability'] = s.split(':', 1)[1].strip()
            elif s.lower().startswith('tera type:'):
                mon['tera_type'] = s.split(':', 1)[1].strip()
            elif s.lower().startswith('evs:'):
                # Keep the verbatim "15 HP / 18 Def / 1 SpA / 32 Spe"
                # spread — easier to render and matches what users
                # already read on pokepaste.
                mon['evs'] = s.split(':', 1)[1].strip()
            elif s.lower().endswith(' nature'):
                # Showdown writes the nature on its own line as
                # "Modest Nature" / "Adamant Nature" — no colon.
                mon['nature'] = s[:-len(' nature')].strip()
            elif s.startswith('-'):
                move = s.lstrip('-').strip()
                if move:
                    mon['moves'].append(move)
        if mon['moves'] or mon['ability']:
            mons.append(mon)
    return mons


# Champions regulation timeline (newest first). M-A ran from the
# 2026-04-08 launch; M-B from 2026-06-16. The active meta should always
# fill the top of the UI list, so selection sorts current-regulation
# teams ahead of older ones (see the sort in main()).
REGULATIONS = [('M-B', date(2026, 6, 16)), ('M-A', date(2026, 4, 8))]
CURRENT_REGULATION = 'M-B'


def team_regulation(row: Dict[str, str]) -> str:
    """Which Champions regulation a team belongs to. Prefers an explicit
    sheet column (Regulation / Format / Reg) if the maintainers ever add
    one; otherwise derives it from Date Shared against the timeline."""
    # The row was tagged with the regulation of the sheet tab it came
    # from — authoritative, so prefer it over date/column heuristics.
    tab = (row.get('__regulation') or '').strip()
    if tab:
        return tab
    col = _get_field(row, 'Regulation', 'Format', 'Reg', 'Ruleset').strip().lower()
    if col:
        flat = col.replace('-', '').replace(' ', '')
        for rid, _ in REGULATIONS:
            if rid.lower().replace('-', '') in flat:
                return rid
    d = parse_date_shared(_get_field(row, 'Date Shared', 'Date'))
    if d:
        for rid, start in REGULATIONS:  # newest-first
            if d >= start:
                return rid
    return REGULATIONS[-1][0]


def _reg_order(rid: str) -> int:
    """Sort key: current regulation first, then the rest newest-first."""
    order = [CURRENT_REGULATION] + [r for r, _ in REGULATIONS if r != CURRENT_REGULATION]
    return order.index(rid) if rid in order else len(order)


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
        'regulation':    team_regulation(row),
        'sheet_rank':    sheet_rank,
        'date_shared':   date_shared,
        'pokepaste_url': pokepaste,
        'pokemon':       pokemon,
        'strategy':      [],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--top', type=int, default=40,
                    help='Number of top teams to include (default 40)')
    ap.add_argument('--delay', type=float, default=0.7,
                    help='Seconds between pokepaste fetches (default 0.7)')
    ap.add_argument('--speed-window-days', type=int, default=14,
                    help='Date window (days back from today) for the Speed corpus '
                         '(default 14). 0 disables corpus build.')
    ap.add_argument('--speed-max-teams', type=int, default=120,
                    help='Hard cap on teams fetched for the Speed corpus '
                         '(default 120). Includes the top-N already fetched.')
    ap.add_argument('--dry-run', action='store_true',
                    help='Print the result instead of writing the JSON')
    args = ap.parse_args()

    # Discover the Champions regulation tabs (newest first), fetch each,
    # and tag every row with its regulation (the tab it came from is the
    # authoritative regulation). New regulations like M-C are picked up
    # automatically — no code change needed.
    sheet_tabs = discover_regulation_tabs()
    reg_rank = {reg: i for i, (reg, _) in enumerate(sheet_tabs)}
    rows: List[Dict[str, str]] = []
    for reg, gid in sheet_tabs:
        try:
            tab_csv = fetch_sheet_csv(SHEET_CSV_TEMPLATE.format(gid=gid))
        except Exception as e:  # noqa: BLE001 — one bad tab shouldn't sink the rest
            logger.warning("Tab %s (gid %s) fetch failed: %s", reg, gid, e)
            continue
        tab_rows = parse_sheet(tab_csv)
        for r in tab_rows:
            r['__regulation'] = reg
        logger.info("Tab %s (gid %s): %d data rows", reg, gid, len(tab_rows))
        rows.extend(tab_rows)

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

    # Sort current-regulation teams first (so the active meta is never
    # crowded out of the top-N by higher-ranked teams from a past
    # regulation), then by rank priority within each regulation. Take
    # top N for the UI display. Speed corpus uses a wider slice.
    # Order by the discovered tab order (newest regulation first), then by
    # rank priority within each regulation.
    candidates.sort(key=lambda x: (reg_rank.get(team_regulation(x[0]), len(reg_rank)), x[1]))
    chosen = candidates[:args.top]
    from collections import Counter
    _reg_breakdown = Counter(team_regulation(r) for r, _ in chosen)
    logger.info("Selected top %d for UI (by regulation: %s)",
                len(chosen), dict(_reg_breakdown))

    today = date.today()
    corpus_pool: List[Tuple[Dict[str, str], float]] = []
    if args.speed_window_days > 0:
        corpus_pool = filter_within_window(candidates, today, args.speed_window_days)
        # Always include the top-N in the corpus so we don't double-
        # fetch and the corpus is at least as broad as what we display.
        chosen_keys = {id(r) for r, _ in chosen}
        merged = list(chosen)
        for row, prio in corpus_pool:
            if id(row) not in chosen_keys:
                merged.append((row, prio))
                chosen_keys.add(id(row))
        merged = merged[:max(args.top, args.speed_max_teams)]
        logger.info("Speed corpus pool: %d teams within %d-day window (capped to %d)",
                    len(merged), args.speed_window_days, args.speed_max_teams)
        full_fetch_list = merged
    else:
        full_fetch_list = list(chosen)

    teams: List[Dict] = []
    for i, (row, _prio) in enumerate(full_fetch_list, 1):
        logger.info("[%d/%d] %s",
                    i, len(full_fetch_list),
                    _get_field(row, 'Team Description', 'Team Name')[:60])
        rec = build_team_record(row, i)
        teams.append(rec)
        if i < len(full_fetch_list):
            time.sleep(args.delay)

    # UI list = the FULL fetched pool, not just the rank-capped top-N.
    # full_fetch_list already = top-N by (regulation, rank) ∪ every team
    # within the recent date window (capped to --speed-max-teams), and
    # we've already paid the pokepaste fetch for all of them for the
    # Speed corpus — so exposing them is free and just gives the user
    # more selection. They're regulation-ordered (current meta first) and
    # the frontend regroups + sorts within each regulation block, so the
    # list scales automatically as M-B teams arrive. `--top` is now a
    # floor (teams guaranteed by rank), `--speed-max-teams` the ceiling.
    ui_teams = teams
    corpus_teams = teams

    output = {
        '_meta': {
            'title':        'Pokémon Champions — Current Top Doubles Teams',
            'subtitle':     'Replica codes from top tournament finishes. Tap a code to copy.',
            'last_updated': datetime.utcnow().strftime('%Y-%m-%d'),
            'source':       'VGCPastes Champions spreadsheet (auto-discovered tabs: '
                            + ', '.join(f'{r}=gid{g}' for r, g in sheet_tabs) + ')',
            'source_url':   SHEET_CSV_URL,
            'current_regulation': sheet_tabs[0][0] if sheet_tabs else None,
            'regulations':  [r for r, _ in sheet_tabs],
            'team_count':   len(ui_teams),
        },
        'teams': ui_teams,
    }

    # Build the Speed corpus from the full fetch list, then attach a
    # window-meta block. The corpus is consumed by the Side Quest
    # "Play this team" panel for typical-Speed mode estimation.
    samples = build_speed_samples(corpus_teams)
    species_counts: Dict[str, int] = {}
    for s in samples:
        species_counts[s['species']] = species_counts.get(s['species'], 0) + 1
    corpus_output = {
        '_meta': {
            'last_updated':  datetime.utcnow().strftime('%Y-%m-%d'),
            'window_days':   args.speed_window_days,
            'window_start':  (today - timedelta(days=args.speed_window_days)).isoformat()
                              if args.speed_window_days > 0 else None,
            'window_end':    today.isoformat(),
            'team_count':    len(corpus_teams),
            'sample_count':  len(samples),
            'species_count': len(species_counts),
            'source':        'VGCPastes Champions M-A spreadsheet (gid=791705272)',
        },
        'samples': samples,
    }

    if args.dry_run:
        print(json.dumps({'top_n': output, 'corpus': corpus_output},
                         indent=2, ensure_ascii=False))
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

    # Letzte Bereinigung vor dem Schreiben: was aus einem frueheren Lauf
    # noch als Fehllesen im Zwischenspeicher liegt, wird hier geheilt.
    output = entwirre_tief(output)
    tmp_path = out_path + '.tmp'
    with open(tmp_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    os.replace(tmp_path, out_path)
    logger.info("Wrote %s (%d teams)", out_path, len(ui_teams))

    # Speed corpus: written only when there's something to write.
    # Fail-soft like the UI JSON above.
    corpus_path = os.path.join(get_data_dir(), SPEED_CORPUS_FILE)
    if samples:
        tmp_corpus = corpus_path + '.tmp'
        with open(tmp_corpus, 'w', encoding='utf-8') as f:
            json.dump(corpus_output, f, indent=2, ensure_ascii=False)
        os.replace(tmp_corpus, corpus_path)
        logger.info("Wrote %s (%d samples across %d species, %d-day window)",
                    corpus_path,
                    len(samples),
                    len(species_counts),
                    args.speed_window_days)
    elif os.path.exists(corpus_path):
        logger.warning("0 samples — keeping previous %s untouched", corpus_path)

    return 0


if __name__ == '__main__':
    sys.exit(main() or 0)
