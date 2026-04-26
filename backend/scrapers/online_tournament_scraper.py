#!/usr/bin/env python3
"""
Online Tournament Scraper (play.limitlesstcg.com)
=================================================
Pulls completed-tournament data for the configured format from
play.limitlesstcg.com so the Meta Call Predictor 2.0 has real-world
top-8 conversion signal alongside the ladder snapshot.

Per qualifying tournament (>= min_players):
  * total_players (= rows on /standings)
  * tournament date (data-time attribute, ms epoch)
  * per row: placement + Pokemon-slug list extracted from <img.pokemon>
  * each row's archetype canonicalised through archetype_matcher
    (so "raging-bolt + ogerpon" rolls up to the Limitless name
    "Raging Bolt Ogerpon" — same naming the rest of the site uses)

Aggregation across all tournaments:
  * brought_count   (= every player playing this archetype)
  * top8_count      (= subset with placement 1..8)
  * top16_count     (= subset with placement 1..16)
  * avg_winrate_in_top8 (mean of per-row winrate strings on standings)
  * tournaments_seen (= distinct tournaments containing this archetype)

Time-weighting:
  * Tournaments within `recent_days_high_weight` days of "now" get
    weight 1.0; older ones get `older_weight` (default 0.5). Both
    counts and "tournaments_seen" are weighted accordingly so the
    predictor reflects the most recent meta more strongly.

Output CSV: data/online_tournament_top8_decks.csv (semicolon-separated,
sorted by brought_share desc).

Usage:
    python online_tournament_scraper.py
    python online_tournament_scraper.py --format PFL --max-tournaments 80
    python online_tournament_scraper.py --days 7 --dry-run
"""

import argparse
import csv
import json
import os
import re
import sys
import time
import urllib.parse
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Tuple, Any

# Resolve repo root + add backend/core to sys.path so the shared helpers
# work regardless of where this script is launched from.
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.normpath(os.path.join(_THIS_DIR, "..", ".."))
_CORE_DIR = os.path.normpath(os.path.join(_THIS_DIR, "..", "core"))
if _CORE_DIR not in sys.path:
    sys.path.insert(0, _CORE_DIR)

from card_scraper_shared import (  # noqa: E402
    setup_console_encoding,
    setup_logging,
    fetch_page_bs4,
    load_settings,
    get_data_dir,
)

# Phase-3 archetype canonicalisation — graceful fallback if the icons
# JSON / matcher module isn't available yet (older repo, fresh clone).
try:
    from archetype_matcher import ArchetypeMatcher  # type: ignore
    _matcher: 'Optional[ArchetypeMatcher]' = ArchetypeMatcher().load()
except Exception as _matcher_err:  # noqa: BLE001
    _matcher = None

setup_console_encoding()
logger = setup_logging("online_tournament_scraper")


# ── Constants & defaults ────────────────────────────────────────────
BASE_URL = "https://play.limitlesstcg.com"
LISTING_PATH = "/tournaments/completed"
STANDINGS_PATH_TPL = "/tournament/{tid}/standings"

DEFAULT_SETTINGS: Dict[str, Any] = {
    "format_filter": "PFL",
    "min_players": 100,
    "max_tournaments": 200,
    "delay_between_requests": 1.5,
    "request_timeout": 20,
    "max_retries": 2,
    "recent_days_high_weight": 7,
    "recent_weight": 1.0,
    "older_weight": 0.5,
    "max_listing_pages": 30,
    "output_file": "online_tournament_top8_decks.csv",
}

# Limitless r2 CDN slug pattern — shared with archetype_icons_scraper.
ICON_URL_PATTERN = re.compile(
    r"r2\.limitlesstcg\.net/pokemon/gen9/([a-z0-9\-]+)\.png", re.IGNORECASE
)

# Format filter flows through to the URL ?format= query parameter.
# Limitless treats the value case-insensitively but lowercase is what
# the live site shows in its querystrings.
def _normalize_format(value: str) -> str:
    return (value or "").strip().lower()


def _repo_data_dir() -> str:
    """Repo /data dir — what the FRONTEND reads. Don't use the
    backend/core/data fallback that other scrapers default to."""
    try:
        gd = get_data_dir()
        # get_data_dir() returns backend/core/data; we want repo root /data
        # (consistent with archetype_icons_scraper).
        if "core" in gd.replace("\\", "/").split("/"):
            return os.path.join(_PROJECT_ROOT, "data")
        return gd
    except Exception:  # noqa: BLE001
        return os.path.join(_PROJECT_ROOT, "data")


# ── Tournament listing ──────────────────────────────────────────────
def _fetch_listing_page(format_filter: str, page: int) -> List[Dict[str, Any]]:
    """Pull one page of completed tournaments. Each entry:
       { 'id': '69e..', 'date': datetime|None, 'players': int }"""
    params = {"game": "PTCG", "format": _normalize_format(format_filter)}
    if page > 1:
        params["page"] = str(page)
    url = f"{BASE_URL}{LISTING_PATH}?{urllib.parse.urlencode(params)}"
    logger.debug("Listing fetch: %s", url)
    soup = fetch_page_bs4(url)
    if not soup:
        return []

    table = soup.find("table")
    if not table:
        return []

    out: List[Dict[str, Any]] = []
    for row in table.find_all("tr"):
        if row.find("th"):
            continue
        cells = row.find_all("td")
        if len(cells) < 6:
            continue
        # Date cell holds the link to the tournament + data-time epoch.
        link = cells[1].find("a", class_="date") if len(cells) > 1 else None
        if not link:
            link = row.find("a", href=re.compile(r"/tournament/[^/]+/(standings|details)"))
        if not link:
            continue
        href = link.get("href", "")
        m = re.search(r"/tournament/([^/]+)/", href)
        if not m:
            continue
        tid = m.group(1)
        # Date from data-time (ms epoch). Falls back to None if missing.
        date_attr = link.get("data-time") if link else None
        try:
            date = (
                datetime.fromtimestamp(int(date_attr) / 1000, tz=timezone.utc)
                if date_attr else None
            )
        except (TypeError, ValueError):
            date = None
        # Player-count cell (index 5 in current layout).
        players = 0
        for cell in cells:
            txt = cell.get_text(strip=True)
            if txt.isdigit() and 1 < int(txt) < 9999:
                players = int(txt)
                break
        if players <= 0:
            continue
        out.append({"id": tid, "date": date, "players": players})
    return out


def _enumerate_tournaments(settings: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Walk listing pages until we hit the max-tournaments cap, the
    max-pages cap, or run out of qualifying entries."""
    fmt = settings.get("format_filter", "PFL")
    min_players = int(settings.get("min_players", 100))
    max_tournaments = int(settings.get("max_tournaments", 200))
    max_pages = int(settings.get("max_listing_pages", 30))
    delay = float(settings.get("delay_between_requests", 1.5))

    qualifying: List[Dict[str, Any]] = []
    seen_ids = set()
    for page in range(1, max_pages + 1):
        page_rows = _fetch_listing_page(fmt, page)
        if not page_rows:
            logger.info("No more tournaments at page %d — stopping listing walk.", page)
            break
        added_this_page = 0
        for row in page_rows:
            if row["id"] in seen_ids:
                continue
            seen_ids.add(row["id"])
            if row["players"] < min_players:
                continue
            qualifying.append(row)
            added_this_page += 1
            if len(qualifying) >= max_tournaments:
                break
        logger.info(
            "Page %d: scanned %d tournaments, kept %d (>= %d players). Total so far: %d",
            page, len(page_rows), added_this_page, min_players, len(qualifying),
        )
        if len(qualifying) >= max_tournaments:
            break
        time.sleep(delay)
    return qualifying


# ── Standings parsing ───────────────────────────────────────────────
def _parse_winrate(text: str) -> Optional[float]:
    """Pull a "65.45%" style number out of a standings cell. Returns
    None for blank / "-" cells."""
    if not text:
        return None
    m = re.search(r"(-?\d+(?:\.\d+)?)\s*%?", text.replace(",", "."))
    if not m:
        return None
    try:
        return float(m.group(1))
    except ValueError:
        return None


def _slugs_from_row(row) -> List[str]:
    """Same logic as archetype_icons_scraper: read the r2 image URLs
    and return up to 2 slugs in document order."""
    slugs: List[str] = []
    seen = set()
    for img in row.find_all("img"):
        src = img.get("src") or ""
        m = ICON_URL_PATTERN.search(src)
        if m:
            slug = m.group(1).lower()
        else:
            alt = (img.get("alt") or "").strip().lower().replace(" ", "-")
            classes = img.get("class") or []
            if not (classes and "pokemon" in classes and alt):
                continue
            slug = alt
        if slug and slug not in seen:
            seen.add(slug)
            slugs.append(slug)
    return slugs[:2]


def _archetype_for_slugs(slugs: List[str]) -> str:
    """Canonicalise via Phase-3 matcher; fall back to a Title-Case join
    so the name still renders something readable when the matcher
    isn't available or the signature is unknown."""
    if not slugs:
        return ""
    if _matcher is not None:
        canonical = _matcher.canonicalize_by_slugs(slugs)
        if canonical:
            return canonical
    parts = [s.replace("-", " ").title() for s in slugs]
    return " ".join(parts)


def _fetch_standings(tid: str) -> List[Dict[str, Any]]:
    """Return one row per player: { placement, archetype, winrate }."""
    url = f"{BASE_URL}{STANDINGS_PATH_TPL.format(tid=tid)}"
    soup = fetch_page_bs4(url)
    if not soup:
        return []
    table = soup.find("table")
    if not table:
        return []
    out: List[Dict[str, Any]] = []
    for row in table.find_all("tr"):
        if row.find("th"):
            continue
        cells = row.find_all("td")
        if len(cells) < 4:
            continue
        place_text = cells[0].get_text(strip=True)
        try:
            placement = int(place_text)
        except ValueError:
            continue
        slugs = _slugs_from_row(row)
        if not slugs:
            continue
        archetype = _archetype_for_slugs(slugs)
        # Standings rows show two percentages: the player's actual
        # win-rate first, then resistance / opponent-win-rate. Take the
        # FIRST percent-shaped cell so we capture the player's WR, not
        # the OMW which is typically higher and meaningless to us here.
        winrate = None
        for cell in cells[2:]:
            wr = _parse_winrate(cell.get_text(strip=True))
            if wr is not None and 0 <= wr <= 100:
                winrate = wr
                break
        out.append({
            "placement": placement,
            "archetype": archetype,
            "winrate": winrate,
        })
    return out


# ── Aggregation ─────────────────────────────────────────────────────
def _tournament_weight(date: Optional[datetime], settings: Dict[str, Any]) -> float:
    """Recent tournaments get full weight, older get the discount.
    Tournaments without a date get the discount weight too — better to
    under-count than to falsely promote stale data to recent."""
    if not date:
        return float(settings.get("older_weight", 0.5))
    days = (datetime.now(tz=timezone.utc) - date).total_seconds() / 86400.0
    if days <= float(settings.get("recent_days_high_weight", 7)):
        return float(settings.get("recent_weight", 1.0))
    return float(settings.get("older_weight", 0.5))


def aggregate(tournaments: List[Dict[str, Any]],
              settings: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Walk the tournament rows, return per-archetype aggregate stats."""
    delay = float(settings.get("delay_between_requests", 1.5))
    stats: Dict[str, Dict[str, Any]] = {}

    for i, t in enumerate(tournaments, 1):
        weight = _tournament_weight(t.get("date"), settings)
        date_iso = t["date"].isoformat() if t.get("date") else ""
        logger.info(
            "[%d/%d] standings %s (%d players, weight %.2f, %s)",
            i, len(tournaments), t["id"], t["players"], weight, date_iso[:10],
        )
        rows = _fetch_standings(t["id"])
        if not rows:
            logger.warning("  empty standings — skipping")
            time.sleep(delay)
            continue
        for r in rows:
            arch = r["archetype"]
            if not arch:
                continue
            entry = stats.setdefault(arch, {
                "tournaments_seen": set(),
                "total_brought_weighted": 0.0,
                "top8_count_weighted": 0.0,
                "top16_count_weighted": 0.0,
                "winrate_sum_top8": 0.0,
                "winrate_n_top8": 0,
                "last_seen_date": None,
            })
            entry["tournaments_seen"].add(t["id"])
            entry["total_brought_weighted"] += weight
            place = r["placement"]
            if place <= 8:
                entry["top8_count_weighted"] += weight
                wr = r.get("winrate")
                if isinstance(wr, (int, float)):
                    entry["winrate_sum_top8"] += wr
                    entry["winrate_n_top8"] += 1
            if place <= 16:
                entry["top16_count_weighted"] += weight
            tdate = t.get("date")
            if tdate is not None:
                cur = entry["last_seen_date"]
                if cur is None or tdate > cur:
                    entry["last_seen_date"] = tdate
        time.sleep(delay)

    # Finalise into list with conv-rates + last-seen string.
    out: List[Dict[str, Any]] = []
    for arch, e in stats.items():
        brought = e["total_brought_weighted"]
        top8_rate = (e["top8_count_weighted"] / brought) if brought > 0 else 0.0
        top16_rate = (e["top16_count_weighted"] / brought) if brought > 0 else 0.0
        avg_wr_top8 = (
            e["winrate_sum_top8"] / e["winrate_n_top8"]
            if e["winrate_n_top8"] > 0 else 0.0
        )
        last_seen = (
            e["last_seen_date"].strftime("%Y-%m-%d")
            if e["last_seen_date"] else ""
        )
        out.append({
            "deck_name": arch,
            "tournaments_seen": len(e["tournaments_seen"]),
            "total_brought_weighted": round(brought, 3),
            "top8_count_weighted": round(e["top8_count_weighted"], 3),
            "top16_count_weighted": round(e["top16_count_weighted"], 3),
            "top8_conv_rate": round(top8_rate, 4),
            "top16_conv_rate": round(top16_rate, 4),
            "avg_winrate_in_top8": round(avg_wr_top8, 2),
            "last_seen_date": last_seen,
            "source_format": settings.get("format_filter", "PFL").upper(),
        })
    out.sort(key=lambda r: r["total_brought_weighted"], reverse=True)
    return out


def write_csv(rows: List[Dict[str, Any]], path: str) -> None:
    fields = [
        "deck_name", "tournaments_seen", "total_brought_weighted",
        "top8_count_weighted", "top16_count_weighted",
        "top8_conv_rate", "top16_conv_rate",
        "avg_winrate_in_top8", "last_seen_date", "source_format",
    ]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fields, delimiter=";")
        writer.writeheader()
        for r in rows:
            writer.writerow(r)
    logger.info("Wrote %d rows -> %s", len(rows), path)


# ── Entry point ─────────────────────────────────────────────────────
def main() -> int:
    parser = argparse.ArgumentParser(description="Scrape Limitless online-tournament top-8 data")
    parser.add_argument("--format", type=str, help="Override format_filter (e.g. PFL)")
    parser.add_argument("--days", type=int, help="Override recent_days_high_weight")
    parser.add_argument("--max-tournaments", type=int, help="Override max_tournaments")
    parser.add_argument("--min-players", type=int, help="Override min_players")
    parser.add_argument("--dry-run", action="store_true",
                        help="Walk listing + log counts but skip standings + CSV write")
    args = parser.parse_args()

    settings = load_settings("online_tournament_scraper_settings.json", DEFAULT_SETTINGS)
    if args.format:
        settings["format_filter"] = args.format
    if args.days is not None:
        settings["recent_days_high_weight"] = args.days
    if args.max_tournaments is not None:
        settings["max_tournaments"] = args.max_tournaments
    if args.min_players is not None:
        settings["min_players"] = args.min_players

    logger.info(
        "Settings: format=%s min_players=%d max_tournaments=%d recent_days=%d",
        settings.get("format_filter"), int(settings.get("min_players", 100)),
        int(settings.get("max_tournaments", 200)),
        int(settings.get("recent_days_high_weight", 7)),
    )
    if _matcher is None:
        logger.warning("ArchetypeMatcher unavailable — archetype names will be slug-joined")

    tournaments = _enumerate_tournaments(settings)
    if not tournaments:
        logger.error("No qualifying tournaments found.")
        return 1
    logger.info("Qualifying tournaments: %d", len(tournaments))

    if args.dry_run:
        logger.info("[DRY RUN] skipping standings fetch + CSV write")
        for t in tournaments[:10]:
            logger.info("  %s  %s  players=%d",
                        t["id"], t["date"].strftime("%Y-%m-%d") if t.get("date") else "????-??-??",
                        t["players"])
        return 0

    rows = aggregate(tournaments, settings)
    out_path = os.path.join(_repo_data_dir(), settings.get("output_file", "online_tournament_top8_decks.csv"))
    write_csv(rows, out_path)
    print(json.dumps({
        "tournaments_scraped": len(tournaments),
        "archetypes_seen": len(rows),
        "top_3": [r["deck_name"] for r in rows[:3]],
        "output": out_path,
    }, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
