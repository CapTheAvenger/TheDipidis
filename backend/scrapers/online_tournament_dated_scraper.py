#!/usr/bin/env python3
"""
Online Tournament Dated Scraper
================================
Phase B of the meta-aware tech-card feature. Scrapes the per-archetype
deck-history page on play.limitlesstcg.com — the list at, e.g.,

  https://play.limitlesstcg.com/decks/cynthia-garchomp-ex
      ?format=standard&rotation=2026&set=POR

— which carries one row per tournament appearance with the columns
Player | Tournament | Date | Place | Score | List. We capture each row
PLUS the actual deck-list at the row's "List" link, so we end up with
per-tournament-per-card data for online tournaments — analogous to
tournament_cards_data_cards.csv but for the online side and tagged
with explicit dates.

Once this output ships the consistency builder can time-weight ALL
date-tagged data uniformly (Major + Online), addressing the user's
observation that "after Prague, Online players also shifted to Neo
Upper Energy — that should be reflected when I build a deck today".

Output files (in project-root data/)
─────────────────────────────────────
- online_tournament_dated_cards.csv
    Mirrors tournament_cards_data_cards.csv schema: one row per
    (tournament_id, archetype, card). Used for time-weighted
    consistency-build math downstream.
- online_tournament_dated_scraped.json
    State file: { "list_ids": [<tournament_id|deck_slug>, …] }.
    Re-runs skip already-fetched (tournament, deck-slug) pairs so CI
    stays fast (only new appearances since last scrape land each run).

CLI flags
─────────
    --archetypes       comma-separated archetype slugs to limit the run
                       (e.g. "cynthia-garchomp-ex,n-zoroark"). Default:
                       all archetypes from /decks listing.
    --max-archetypes   stop after N archetypes (default unlimited).
    --max-lists        cap deck-lists fetched per archetype (default 50).
    --rebuild          ignore the state file and re-fetch everything.
    --workers          parallel deck-list fetchers (default 5).
    --dry-run          parse the history table but skip card-level
                       fetches; useful for selector debugging.

HTML assumptions
────────────────
The /decks/<slug> page uses a single <table> with one <tr> per
appearance. Each row has anchor links: one to /tournament/<id> for
the tournament name + ID, one to /decks/<slug>/<deck-id> (or similar)
for the actual deck list. The Date column is plain text; we accept
both English ordinal ("25th April 2026") and German numeric
("25. April 2026") formats.

If Limitless changes the HTML, edit ``_parse_history_row`` — every
selector + parsing rule lives there.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Any, Dict, List, Optional, Set, Tuple
import urllib.parse

try:
    from bs4 import BeautifulSoup
except ImportError:
    print("FEHLER: beautifulsoup4 fehlt! pip install beautifulsoup4")
    sys.exit(1)

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "core"))
from card_scraper_shared import (
    setup_console_encoding, setup_logging, safe_fetch_html, fetch_page_bs4,
    fix_mojibake, slug_to_archetype, normalize_archetype_name,
    CardDatabaseLookup,
)

setup_console_encoding()
logger = setup_logging("online_tournament_dated_scraper")

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(os.path.dirname(HERE))
DATA_DIR = os.path.join(PROJECT_ROOT, "data")
OUTPUT_CSV = os.path.join(DATA_DIR, "online_tournament_dated_cards.csv")
STATE_JSON = os.path.join(DATA_DIR, "online_tournament_dated_scraped.json")

BASE_URL = "https://play.limitlesstcg.com"
DECKS_URL_TMPL = (
    "https://play.limitlesstcg.com/decks?game=PTCG&format={fmt}"
    "&rotation={rot}&set={set_code}"
)
ARCHETYPE_HISTORY_URL_TMPL = (
    "https://play.limitlesstcg.com/decks/{slug}?format={fmt}"
    "&rotation={rot}&set={set_code}"
)

# Default rotation anchors. Override via CLI / scraper_settings.json
# when the next set rotates in.
DEFAULT_GAME = "PTCG"
DEFAULT_FORMAT = "standard"
DEFAULT_ROTATION = "2026"
DEFAULT_SET = "POR"

# CSV schema mirrors tournament_cards_data_cards.csv so downstream
# code (frontend mergeOnlineMajorAdditive, classifier scoring) can
# treat both files uniformly.
CSV_FIELDNAMES = [
    "tournament_id", "tournament_name", "meta", "tournament_date",
    "archetype", "card_name", "card_identifier",
    "total_count", "max_count", "deck_inclusion_count", "average_count",
    "total_decks_in_archetype", "percentage_in_archetype",
    "set_code", "set_name", "set_number", "rarity", "type",
    "image_url", "is_ace_spec",
]


# ────────────────────────────────────────────────────────────────
# Date parsing — Limitless uses both English ordinal and German
# numeric formats depending on the user's browser locale. Try both.
# ────────────────────────────────────────────────────────────────

_GERMAN_MONTHS = {
    "januar": 1, "jan": 1, "februar": 2, "feb": 2, "märz": 3, "marz": 3, "mar": 3,
    "april": 4, "apr": 4, "mai": 5, "juni": 6, "jun": 6, "juli": 7, "jul": 7,
    "august": 8, "aug": 8, "september": 9, "sep": 9, "sept": 9,
    "oktober": 10, "okt": 10, "oct": 10, "november": 11, "nov": 11,
    "dezember": 12, "dez": 12, "dec": 12,
}
_ENGLISH_MONTHS = {
    "january": 1, "jan": 1, "february": 2, "feb": 2, "march": 3, "mar": 3,
    "april": 4, "apr": 4, "may": 5, "june": 6, "jun": 6, "july": 7, "jul": 7,
    "august": 8, "aug": 8, "september": 9, "sep": 9, "sept": 9,
    "october": 10, "oct": 10, "november": 11, "nov": 11,
    "december": 12, "dec": 12,
}
_MONTHS = {**_GERMAN_MONTHS, **_ENGLISH_MONTHS}


def _parse_date(text: str) -> Optional[str]:
    """Return ``YYYY-MM-DD`` for any of the date strings Limitless
    might emit. Returns ``None`` if no format matched (caller decides
    whether to skip the row or warn)."""
    if not text:
        return None
    s = (text or "").strip()
    if not s:
        return None

    # 1. ISO already
    iso_match = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})", s)
    if iso_match:
        try:
            return datetime(int(iso_match.group(1)), int(iso_match.group(2)),
                            int(iso_match.group(3))).strftime("%Y-%m-%d")
        except ValueError:
            pass

    # 2. German "02. Mai 2026" or "25. April 2026"
    de_match = re.match(r"^(\d{1,2})\.\s*([A-Za-zÄÖÜäöüß]+)\.?\s+(\d{4})", s)
    if de_match:
        day = int(de_match.group(1))
        mon_key = de_match.group(2).lower().replace(".", "")
        year = int(de_match.group(3))
        if mon_key in _MONTHS:
            try:
                return datetime(year, _MONTHS[mon_key], day).strftime("%Y-%m-%d")
            except ValueError:
                pass

    # 3. English ordinal "25th April 2026" / "2nd May 2026"
    en_match = re.match(r"^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})", s, re.IGNORECASE)
    if en_match:
        day = int(en_match.group(1))
        mon_key = en_match.group(2).lower()
        year = int(en_match.group(3))
        if mon_key in _MONTHS:
            try:
                return datetime(year, _MONTHS[mon_key], day).strftime("%Y-%m-%d")
            except ValueError:
                pass

    return None


# ────────────────────────────────────────────────────────────────
# History-page row parser — every HTML selector lives here so a
# single function captures the upstream-fragility surface.
# ────────────────────────────────────────────────────────────────


def _parse_history_row(tr) -> Optional[Dict[str, str]]:
    """Parse one <tr> from the per-archetype history table.
    Returns None for header rows / malformed entries."""
    cells = tr.find_all(["td", "th"])
    if len(cells) < 5:
        return None
    if all(c.name == "th" for c in cells):
        return None  # header row

    # Player — usually the first cell with text.
    player = (cells[0].get_text(" ", strip=True) if cells[0] else "").strip()

    # Tournament name + ID — anchor pointing at /tournament/<id>
    tournament_name = ""
    tournament_id = ""
    for a in tr.select('a[href*="/tournament/"]'):
        tournament_name = a.get_text(" ", strip=True)
        href = a.get("href", "")
        m = re.search(r"/tournament/([^/?]+)", href)
        if m:
            tournament_id = m.group(1)
        break

    # Date — first cell whose text parses as a date.
    tournament_date_iso = ""
    date_raw = ""
    for c in cells:
        txt = c.get_text(" ", strip=True)
        iso = _parse_date(txt)
        if iso:
            tournament_date_iso = iso
            date_raw = txt
            break

    # Place / Score — left as raw text so callers can decide to use them.
    place = ""
    score = ""
    for c in cells:
        t = c.get_text(" ", strip=True)
        if re.match(r"^\d+(st|nd|rd|th)\s+of\s+\d+", t, re.IGNORECASE):
            place = t
        elif re.match(r"^\d+\s*-\s*\d+\s*-\s*\d+\s*$", t):
            score = t

    # List link — anchor pointing at deck-list URL with a numeric / slug suffix.
    list_url = ""
    deck_slug_id = ""
    for a in tr.select('a[href*="/decks/"]'):
        href = a.get("href", "")
        # Match per-deck list paths. Limitless uses both:
        #   /decks/<slug>/<id>
        #   /decks/<slug>?...&list=<id>
        # Also bare /decklist URLs occasionally surface.
        m = re.search(r"/decks/([^/?]+)/([^/?]+)", href)
        if m:
            deck_slug_id = f"{m.group(1)}/{m.group(2)}"
            list_url = href
            break
        m = re.search(r"/decklist[s]?/([^/?]+)", href)
        if m:
            deck_slug_id = f"decklist/{m.group(1)}"
            list_url = href
            break

    if not tournament_id and not deck_slug_id:
        return None

    if list_url and not list_url.startswith("http"):
        list_url = BASE_URL + list_url

    return {
        "player": fix_mojibake(player),
        "tournament_id": tournament_id,
        "tournament_name": fix_mojibake(tournament_name),
        "tournament_date": tournament_date_iso,
        "tournament_date_raw": date_raw,
        "place": place,
        "score": score,
        "deck_slug_id": deck_slug_id,
        "list_url": list_url,
    }


def fetch_archetype_history(slug: str, fmt: str, rotation: str, set_code: str,
                            timeout: int = 20) -> List[Dict[str, str]]:
    """Fetch one archetype's tournament-appearance history. Returns one
    dict per parsed row (see _parse_history_row)."""
    url = ARCHETYPE_HISTORY_URL_TMPL.format(slug=slug, fmt=fmt, rot=rotation, set_code=set_code)
    soup = fetch_page_bs4(url, timeout=timeout)
    if soup is None:
        logger.warning("  [%s] history fetch failed: %s", slug, url)
        return []
    rows: List[Dict[str, str]] = []
    for tbl in soup.find_all("table"):
        for tr in tbl.find_all("tr"):
            row = _parse_history_row(tr)
            if row:
                row["archetype_slug"] = slug
                rows.append(row)
        if rows:
            break  # first table with data wins
    logger.info("  [%s] %d history rows parsed", slug, len(rows))
    return rows


# ────────────────────────────────────────────────────────────────
# Card extraction — reused logic shape from the existing meta-live
# scraper. Stays inline so this file doesn't entangle with the
# meta-live aggregation pipeline.
# ────────────────────────────────────────────────────────────────


def _extract_cards_from_decklist(list_url: str, card_db: CardDatabaseLookup,
                                 timeout: int = 20) -> List[Dict[str, Any]]:
    html = safe_fetch_html(list_url, timeout)
    if not html:
        return []
    soup = BeautifulSoup(html, "lxml")
    cards: List[Dict[str, Any]] = []
    for a in soup.select('a[href*="/cards/"]'):
        text = a.get_text(strip=True)
        if not text:
            continue
        m = re.match(r"^(\d+)\s+(.+?)(?:\s+\(.*?\))?$", text)
        if not m:
            continue
        try:
            count = int(m.group(1))
        except ValueError:
            continue
        name = m.group(2).strip()
        set_code, set_num = "", ""
        href = a.get("href", "")
        parts = href.split("/cards/")[-1].split("/")
        if len(parts) >= 3:
            set_code, set_num = parts[1].upper(), parts[2]
        elif len(parts) == 2:
            set_code, set_num = parts[0].upper(), parts[1]
        if not set_code or not set_num:
            latest = card_db.get_latest_low_rarity_version(name)
            if latest:
                set_code, set_num = latest.set_code, latest.number
        cards.append({
            "name": name,
            "count": count,
            "set_code": set_code,
            "set_number": set_num,
        })
    return cards


# ────────────────────────────────────────────────────────────────
# State + CSV helpers
# ────────────────────────────────────────────────────────────────


def load_state() -> Set[str]:
    if not os.path.isfile(STATE_JSON):
        return set()
    try:
        with open(STATE_JSON, "r", encoding="utf-8") as f:
            d = json.load(f)
        return set(d.get("list_ids", []))
    except Exception as e:
        logger.warning("State file unreadable, starting fresh: %s", e)
        return set()


def save_state(state: Set[str]) -> None:
    os.makedirs(os.path.dirname(STATE_JSON), exist_ok=True)
    with open(STATE_JSON, "w", encoding="utf-8") as f:
        json.dump({"list_ids": sorted(state)}, f, indent=2)


def load_existing_csv() -> List[Dict[str, str]]:
    if not os.path.isfile(OUTPUT_CSV):
        return []
    with open(OUTPUT_CSV, "r", encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f, delimiter=";"))


def write_csv(rows: List[Dict[str, str]]) -> None:
    os.makedirs(os.path.dirname(OUTPUT_CSV), exist_ok=True)
    with open(OUTPUT_CSV, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES, delimiter=";", extrasaction="ignore")
        w.writeheader()
        for r in rows:
            for k in ("percentage_in_archetype", "average_count"):
                if k in r and r[k] is not None:
                    r[k] = str(r[k]).replace(".", ",")
            w.writerow(r)


# ────────────────────────────────────────────────────────────────
# Aggregation — turn raw deck-by-deck card lists into
# tournament_cards_data-shaped per-card rows.
# ────────────────────────────────────────────────────────────────


def aggregate_tournament_archetype(
    tournament_id: str, tournament_name: str, tournament_date: str,
    archetype: str, decks: List[List[Dict[str, Any]]],
    card_db: CardDatabaseLookup,
) -> List[Dict[str, Any]]:
    """``decks`` is a list of card-lists (one entry per appearance of
    ``archetype`` at this tournament). Returns one row per unique
    card matching the tournament_cards_data_cards.csv schema."""
    if not decks:
        return []
    total_decks = len(decks)
    per_card_total: Dict[Tuple[str, str, str], Dict[str, Any]] = {}

    for deck in decks:
        seen_keys: Set[Tuple[str, str, str]] = set()
        for c in deck:
            name = (c.get("name") or "").strip()
            if not name:
                continue
            try:
                cnt = int(c.get("count", 0))
            except (TypeError, ValueError):
                continue
            if cnt <= 0:
                continue
            sc = (c.get("set_code") or "").upper()
            sn = (c.get("set_number") or "").strip()
            key = (name, sc, sn)
            agg = per_card_total.setdefault(key, {
                "total_count": 0, "max_count": 0, "deck_inclusion_count": 0,
            })
            agg["total_count"] += cnt
            agg["max_count"] = max(agg["max_count"], cnt)
            if key not in seen_keys:
                agg["deck_inclusion_count"] += 1
                seen_keys.add(key)

    out: List[Dict[str, Any]] = []
    for (name, sc, sn), agg in per_card_total.items():
        info = card_db.get_card(name, set_code=sc, set_number=sn) if hasattr(card_db, "get_card") else None
        rarity = (getattr(info, "rarity", "") or "") if info else ""
        type_ = (getattr(info, "type", "") or "") if info else ""
        image_url = (getattr(info, "image_url", "") or "") if info else ""
        avg = agg["total_count"] / agg["deck_inclusion_count"] if agg["deck_inclusion_count"] else 0
        pct = (agg["deck_inclusion_count"] / total_decks * 100) if total_decks else 0
        out.append({
            "tournament_id": tournament_id,
            "tournament_name": tournament_name,
            "meta": "Online Dated",
            "tournament_date": tournament_date,
            "archetype": archetype,
            "card_name": name,
            "card_identifier": f"{sc} {sn}".strip(),
            "total_count": agg["total_count"],
            "max_count": agg["max_count"],
            "deck_inclusion_count": agg["deck_inclusion_count"],
            "average_count": round(avg, 2),
            "total_decks_in_archetype": total_decks,
            "percentage_in_archetype": round(pct, 2),
            "set_code": sc,
            "set_name": "",
            "set_number": sn,
            "rarity": rarity,
            "type": type_,
            "image_url": image_url,
            "is_ace_spec": "",
        })
    return out


# ────────────────────────────────────────────────────────────────
# Main
# ────────────────────────────────────────────────────────────────


def list_archetype_slugs(fmt: str, rotation: str, set_code: str,
                         timeout: int = 20) -> List[str]:
    url = DECKS_URL_TMPL.format(fmt=fmt, rot=rotation, set_code=set_code)
    soup = fetch_page_bs4(url, timeout=timeout)
    if soup is None:
        logger.error("decks-overview fetch failed: %s", url)
        return []
    slugs: List[str] = []
    seen: Set[str] = set()
    for a in soup.select('a[href*="/decks/"]'):
        href = a.get("href", "")
        if "/matchups" in href.lower():
            continue
        m = re.search(r"/decks/([^/?]+)", href)
        if m:
            slug = m.group(1)
            if slug and slug not in seen:
                seen.add(slug)
                slugs.append(slug)
    return slugs


def main() -> None:
    parser = argparse.ArgumentParser(description="Scrape date-tagged online tournament decks per archetype.")
    parser.add_argument("--archetypes", help="Comma-separated archetype slugs (default: all).")
    parser.add_argument("--max-archetypes", type=int, default=0, help="Stop after N archetypes (0 = unlimited).")
    parser.add_argument("--max-lists", type=int, default=50, help="Cap deck-lists per archetype (default 50).")
    parser.add_argument("--rebuild", action="store_true", help="Re-scrape every list, ignore state file.")
    parser.add_argument("--workers", type=int, default=5, help="Parallel deck-list fetchers (default 5).")
    parser.add_argument("--dry-run", action="store_true", help="Skip card-level fetches; print history rows only.")
    parser.add_argument("--game", default=DEFAULT_GAME)
    parser.add_argument("--format", default=DEFAULT_FORMAT, dest="fmt")
    parser.add_argument("--rotation", default=DEFAULT_ROTATION)
    parser.add_argument("--set", default=DEFAULT_SET, dest="set_code")
    parser.add_argument("--timeout", type=int, default=20)
    args = parser.parse_args()

    logger.info("=" * 60)
    logger.info("ONLINE TOURNAMENT DATED SCRAPER — Phase B")
    logger.info("=" * 60)
    logger.info("Filter: %s / rotation=%s / set=%s", args.fmt, args.rotation, args.set_code)

    state = set() if args.rebuild else load_state()
    existing_rows = [] if args.rebuild else load_existing_csv()
    logger.info("Existing CSV rows: %d, scraped state entries: %d", len(existing_rows), len(state))

    # Resolve archetype slugs
    if args.archetypes:
        slugs = [s.strip() for s in args.archetypes.split(",") if s.strip()]
    else:
        slugs = list_archetype_slugs(args.fmt, args.rotation, args.set_code, args.timeout)
        if args.max_archetypes:
            slugs = slugs[: args.max_archetypes]
    logger.info("Scraping %d archetypes", len(slugs))

    try:
        card_db = CardDatabaseLookup()
    except Exception as e:
        logger.error("Card DB load failed: %s", e)
        sys.exit(1)

    new_rows: List[Dict[str, Any]] = []
    new_state_entries: Set[str] = set()

    for idx, slug in enumerate(slugs, 1):
        archetype = normalize_archetype_name(slug_to_archetype(slug))
        logger.info("[%d/%d] %s (%s)", idx, len(slugs), archetype, slug)
        history = fetch_archetype_history(slug, args.fmt, args.rotation, args.set_code, args.timeout)
        if not history:
            continue

        # Group rows by tournament so we aggregate per-(tournament, archetype)
        per_tournament: Dict[str, List[Dict[str, str]]] = {}
        for h in history[: args.max_lists]:
            tid = h.get("tournament_id") or h.get("deck_slug_id") or "unknown"
            per_tournament.setdefault(tid, []).append(h)

        for tid, rows in per_tournament.items():
            tournament_name = rows[0].get("tournament_name") or ""
            tournament_date = rows[0].get("tournament_date") or ""
            if not tournament_date:
                logger.debug("    skip — no parseable date for tournament %s", tid)
                continue
            if args.dry_run:
                logger.info("    [dry-run] %s | %s | %s | %d decks",
                            tid, tournament_date, tournament_name, len(rows))
                continue

            decks_to_fetch = []
            for r in rows:
                key = f"{tid}|{r.get('deck_slug_id') or ''}"
                if key in state:
                    continue
                if not r.get("list_url"):
                    continue
                decks_to_fetch.append((key, r["list_url"]))

            if not decks_to_fetch:
                continue

            decks_cards: List[List[Dict[str, Any]]] = []
            with ThreadPoolExecutor(max_workers=args.workers) as pool:
                fut_to_key = {
                    pool.submit(_extract_cards_from_decklist, url, card_db, args.timeout): key
                    for key, url in decks_to_fetch
                }
                for fut in as_completed(fut_to_key):
                    key = fut_to_key[fut]
                    try:
                        cards = fut.result()
                    except Exception as e:  # pragma: no cover — defensive
                        logger.warning("    list fetch error %s: %s", key, e)
                        cards = []
                    new_state_entries.add(key)
                    if cards:
                        decks_cards.append(cards)

            agg = aggregate_tournament_archetype(
                tid, tournament_name, tournament_date,
                archetype, decks_cards, card_db,
            )
            new_rows.extend(agg)
            logger.info("    %s on %s — %d decks → %d card-rows",
                        tournament_name or tid, tournament_date,
                        len(decks_cards), len(agg))

        # Periodic flush
        if (idx % 10) == 0 and new_rows:
            merged = existing_rows + new_rows
            write_csv(merged)
            save_state(state | new_state_entries)
            logger.info("  partial flush: %d rows on disk, %d new state entries",
                        len(merged), len(new_state_entries))

    # Final write
    merged = existing_rows + new_rows
    write_csv(merged)
    save_state(state | new_state_entries)
    logger.info("DONE: %d existing + %d new = %d rows total | %d new state entries",
                len(existing_rows), len(new_rows), len(merged), len(new_state_entries))


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logger.warning("Interrupted by user.")
