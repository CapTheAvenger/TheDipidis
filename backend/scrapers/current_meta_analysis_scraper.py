#!/usr/bin/env python3
"""
Current Meta Analysis Scraper - FAST EDITION
============================================
Combines Limitless Online (Meta Live) and Play! Tournaments (Meta Play!).
- Uses cloudscraper for robust Cloudflare bypass.
- Uses BeautifulSoup4 for stable HTML parsing.
- Uses ThreadPoolExecutor for concurrent decklist fetching.
- Outputs card usage by archetype with shared aggregation logic.
"""

import os
import sys
import csv
import json
import re
import time
import logging
import threading
import concurrent.futures
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional

try:
    from bs4 import BeautifulSoup
except ImportError:
    print("FEHLER: beautifulsoup4 fehlt! pip install beautifulsoup4")
    sys.exit(1)

from card_scraper_shared import (
    setup_console_encoding,
    get_app_path,
    get_data_dir,
    CardDatabaseLookup,
    aggregate_card_data,
    save_to_csv,
    normalize_archetype_name,
    load_scraped_ids,
    save_scraped_ids,
    safe_fetch_html,
    slug_to_archetype,
    setup_logging,
    load_settings,
    fix_mojibake,
)
# Dated-CSV helpers — produce ``data/online_tournament_dated_cards.csv``
# alongside the existing aggregate output. Replaces the standalone
# online_tournament_dated_scraper.py which was crawling the same URLs
# (see commit history). Frontend's recency-decay reads the same path.
from limitless_dated import (
    parse_history_row,
    aggregate_tournament_archetype,
    write_dated_csv,
)

# Phase 4: canonicalize archetype names against the Limitless online
# bare-name list (= what archetype_icons.json holds, scraped from
# Limitless's decks page). Mirrors what city_league_analysis_scraper
# does — without it, slug_to_archetype produces names like "Dragapult
# Ex", "Crustle Dri", "Rockets Honchkrow" that no longer match the
# bare names ("Dragapult", "Crustle", "Rocket's Honchkrow") on the
# share/winrate side, and the Deck Analysis Global tab can't show
# share or winrate for the affected archetype.
try:
    sys.path.append(os.path.join(os.path.dirname(__file__), "..", "core"))
    from archetype_matcher import ArchetypeMatcher  # type: ignore
    _matcher = ArchetypeMatcher().load()
except Exception as _matcher_err:  # pragma: no cover — defensive only
    _matcher = None
    # logger isn't set up yet at import time; print is fine for the
    # one-time CI surface
    print(
        f"[current_meta_analysis_scraper] ArchetypeMatcher unavailable ({_matcher_err}) — "
        "names will not be canonicalised against archetype_icons.json"
    )

# Possessive-without-apostrophe trainer prefixes that Limitless URL
# slugs strip ("rockets-honchkrow") and slug_to_archetype can't
# undo. Restore the apostrophe so the archetype name lines up with
# the canonical Limitless display ("Rocket's Honchkrow").
_POSSESSIVE_TRAINERS = {
    "rocket": "Rocket's", "hop": "Hop's", "steven": "Steven's",
    "cynthia": "Cynthia's", "marnie": "Marnie's", "lillie": "Lillie's",
    "ethan": "Ethan's", "hau": "Hau's", "n": "N's",
    "iono": "Iono's", "arven": "Arven's", "nemona": "Nemona's",
    "kieran": "Kieran's", "kabu": "Kabu's", "raihan": "Raihan's",
    "jacq": "Jacq's", "geeta": "Geeta's",
}

# Trailing English-set-code suffix that current_meta_analysis_scraper
# would otherwise carry into the archetype name ("Crustle Dri"). Same
# list the frontend's normalizeArchetypeForMatch uses — keep in sync
# with update_sets.FALLBACK_SET_ORDER when a new set rotates in.
_SET_CODE_SUFFIX_RE = re.compile(
    r"\s+(?:asc|pfl|meg|mee|mep|blk|wht|dri|jtg|pre|ssp|scr|sfa|"
    r"twm|tef|paf|par|mew|obf|pal|svi|sve|svp|por|m3|m4)$",
    re.IGNORECASE,
)
_TRAILING_EX_RE = re.compile(r"\s+ex$", re.IGNORECASE)


def _canonicalize_archetype(raw_name: str) -> str:
    """Return the bare Limitless-style archetype name.

    Pipeline:
      1. Title-cased slug ("Crustle Dri")
      2. Strip set-code suffix → "Crustle"
      3. Strip trailing " Ex" → "Crustle"  (no-op here, "Dragapult Ex"
         would collapse to "Dragapult")
      4. Restore apostrophe on known possessive trainer prefixes
         ("Rockets Honchkrow" → "Rocket's Honchkrow")
      5. Try ArchetypeMatcher.canonicalize_by_name as a final pass —
         if archetype_icons.json knows this archetype under a
         different but equivalent name, prefer that one.
    """
    name = (raw_name or "").strip()
    if not name:
        return name
    name = _SET_CODE_SUFFIX_RE.sub("", name).strip()
    name = _TRAILING_EX_RE.sub("", name).strip()
    parts = name.split(" ", 1)
    head_lower = parts[0].lower()
    if head_lower in _POSSESSIVE_TRAINERS:
        rest = parts[1] if len(parts) > 1 else ""
        name = (_POSSESSIVE_TRAINERS[head_lower] + (" " + rest if rest else "")).strip()
    if _matcher is not None:
        canonical = _matcher.canonicalize_by_name(name)
        if canonical:
            return canonical
    return name


# Fix Windows console encoding
setup_console_encoding()

# ============================================================================
# LOGGING SETUP
# ============================================================================
logger = setup_logging("current_meta_scraper")

# ============================================================================
# TOURNAMENT TRACKING (Incremental Scraping for Meta Play!)
# ============================================================================
def get_scraped_meta_tournaments_file() -> str:
    return os.path.join(get_data_dir(), 'current_meta_scraped_tournaments.json')

def load_scraped_meta_tournaments() -> set:
    return load_scraped_ids(get_scraped_meta_tournaments_file())

def save_scraped_meta_tournaments(tournament_ids: set) -> None:
    save_scraped_ids(get_scraped_meta_tournaments_file(), tournament_ids, 'scraped_tournament_ids')


# ── Meta Play! raw-deck cache ────────────────────────────────────────────────
# The ledger above gates FETCHING (a major is scraped once). This cache holds
# the raw decks of every scraped major keyed by tournament_id, so the full
# cumulative Meta Play! aggregate — and its total_decks_in_archetype
# denominators — can be recomputed every run WITHOUT re-scraping. Reset on
# rotation by backend/core/update_sets.py (lockstep with the ledger); seeded
# into backend/core/data/ and synced back by the weekly workflow +
# prepare_card_data.SYNC_PATTERNS (lockstep with the ledger).
def get_meta_play_cache_file() -> str:
    return os.path.join(get_data_dir(), 'meta_play_decks_cache.json')

def load_meta_play_cache() -> Dict[str, list]:
    path = get_meta_play_cache_file()
    if not os.path.exists(path):
        return {}
    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}

def save_meta_play_cache(cache: Dict[str, list]) -> None:
    try:
        with open(get_meta_play_cache_file(), 'w', encoding='utf-8') as f:
            json.dump(cache, f, ensure_ascii=False)
    except OSError as e:
        logger.warning("Konnte Meta-Play!-Deck-Cache nicht speichern: %s", e)


# ============================================================================
# FORMAT-WINDOW HELPER
# ============================================================================
# The CI / Auto-Update-Pipeline writes data/format_window.json with the
# live rotation set code (e.g. 'CRI'). Scrapers that filter by set must
# read this at runtime — hardcoded defaults rot every rotation. Used
# as a safety net when the per-scraper settings file is missing or its
# format_filter has not been updated for the current rotation.
def _current_set_code(fallback: str = 'CRI') -> str:
    candidates = [
        os.path.join(get_data_dir(), 'format_window.json'),
        os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'format_window.json')),
    ]
    for p in candidates:
        if os.path.isfile(p):
            try:
                with open(p, 'r', encoding='utf-8') as f:
                    fw = json.load(f)
                v = str(fw.get('current_set') or '').strip().upper()
                if v:
                    return v
            except (OSError, json.JSONDecodeError):
                pass
    return fallback

# ============================================================================
# SETTINGS
# ============================================================================
DEFAULT_SETTINGS: Dict[str, Any] = {
    "sources": {
        "limitless_online": {
            "enabled": True,
            "max_decks": 60,
            "max_lists_per_deck": 20,
            "format_filter": "CRI"
        },
        "tournaments": {
            "enabled": True,
            "start_date": "",
            "max_tournaments": 60,
            "max_decks_per_tournament": 128,
            "format_filter": ["Standard", "Standard (JP)"],
            "tournament_types": []
        }
    },
    "delay_between_requests": 1.5,
    "max_workers": 5,
    "request_timeout": 20,
    "max_retries": 2,
    "append_mode": True,
    "output_file": "current_meta_card_data.csv",
}

def _load_settings() -> Dict[str, Any]:
    return load_settings(
        "current_meta_analysis_settings.json", DEFAULT_SETTINGS,
        deep_merge_keys=["sources"], create_if_missing=True
    )

# safe_fetch_html imported from card_scraper_shared

# ============================================================
# META LIVE (play.limitlesstcg.com)
# ============================================================
def _fetch_meta_live_decklist(list_url: str, deck_name: str, deck_slug: str, card_db: CardDatabaseLookup, timeout: int,
                              tournament_id: str = "", tournament_date: str = "", tournament_name: str = "",
                              total_players: int = 0, place: str = "", score: str = "", player: str = "") -> dict:
    """
    Extrahiert Deckliste von play.limitlesstcg.com mit 100%iger Set-Genauigkeit.
    Priorität:
    1. href-Link (/cards/twm/128 -> TWM 128)
    2. <span class="set"> oder <span class="card-set">
    3. Fallback auf CardDB

    ``tournament_id``, ``tournament_date``, ``tournament_name`` are
    captured by the caller while parsing the per-archetype listing
    page; threading them through here lets us emit the dated-CSV in the
    same crawl rather than running a second scraper over the same URLs.
    """
    html = safe_fetch_html(list_url, timeout)
    if not html:
        return None

    soup = BeautifulSoup(html, 'lxml')
    cards = []

    for a in soup.select('a[href*="/cards/"]'):
        text = a.get_text(strip=True)
        if not text:
            continue

        match = re.match(r'^(\d+)\s+(.+?)(?:\s+\(.*?\))?$', text)
        if not match:
            continue

        count = int(match.group(1))
        name = match.group(2).strip()

        set_code, set_num = "", ""
        
        # METHODE 1: Aus href-Link extrahieren (höchste Priorität)
        href = a.get('href', '')
        parts = href.split('/cards/')[-1].split('/')
        if len(parts) >= 3:
            set_code, set_num = parts[1].upper(), parts[2]
        elif len(parts) == 2:
            set_code, set_num = parts[0].upper(), parts[1]

        # METHODE 2: <span class="set"> oder <span class="card-set">
        if not set_code or not set_num:
            # Suche im parent element oder im link selbst
            parent = a.parent
            set_span = a.find('span', class_=['set', 'card-set']) or (parent.find('span', class_=['set', 'card-set']) if parent else None)
            if set_span:
                set_text = set_span.get_text(strip=True)
                set_match = re.match(r'([A-Z0-9]+)[\s-]+([0-9]+)', set_text, re.IGNORECASE)
                if set_match:
                    set_code, set_num = set_match.group(1).upper(), set_match.group(2)

        # METHODE 3: Fallback auf CardDB (nur wenn nichts gefunden)
        if not set_code or not set_num:
            latest_card = card_db.get_latest_low_rarity_version(name)
            if latest_card:
                set_code, set_num = latest_card.set_code, latest_card.number

        cards.append({
            'name': name,
            'count': count,
            'set_code': set_code,
            'set_number': set_num
        })

    if cards:
        total = sum(c['count'] for c in cards)
        if not (59 <= total <= 61):
            logger.warning("Ungueltige Deckgroesse %d fuer '%s' – uebersprungen.", total, deck_name)
            return None
        return {
            "archetype": _canonicalize_archetype(normalize_archetype_name(deck_name)),
            "deck_slug": deck_slug,
            "cards": cards,
            "source": "limitless_online",
            # Dated-CSV plumbing — empty strings when caller didn't pass
            # tournament context (kept optional so any test or other call
            # site that hasn't been updated still returns valid data).
            "tournament_id": tournament_id,
            "tournament_date": tournament_date,
            "tournament_name": tournament_name,
            "total_players": int(total_players or 0),
            # Per-deck finish data (parsed from the /decks/<slug> "Best
            # Finishes" row) — lets us surface the single best-placed REAL
            # decklist of the last N days instead of a synthesized average.
            "place": place,
            "score": score,
            "player": player,
        }
    return None

def scrape_limitless_online(settings: dict, card_db: CardDatabaseLookup) -> list:
    config = settings.get("sources", {}).get("limitless_online", {})
    if not config.get("enabled", False):
        logger.info("Meta Live (Limitless Online) deaktiviert.")
        return []

    logger.info("=" * 60)
    logger.info("SCRAPING LIMITLESS ONLINE (META LIVE)")
    logger.info("=" * 60)

    max_decks = config.get("max_decks", 60)
    max_lists_per_deck = config.get("max_lists_per_deck", 20)
    # Self-heal: format_window.json is the rotation source of truth. If the
    # settings file's format_filter has drifted (manual edits get forgotten
    # after each set release), prefer the live current_set and log the
    # mismatch instead of silently scraping the stale format.
    configured = str(config.get("format_filter") or '').strip().upper()
    live = _current_set_code()
    if configured and live and configured != live:
        logger.warning(
            "format_filter=%s in settings does not match format_window.current_set=%s — using %s",
            configured, live, live,
        )
        format_filter = live
    else:
        format_filter = configured or live
    timeout = settings.get("request_timeout", 20)
    max_workers = settings.get("max_workers", 5)

    decks_url = "https://play.limitlesstcg.com/decks?game=PTCG"
    logger.info("Lade Deck-Uebersicht: %s", decks_url)

    html = safe_fetch_html(decks_url, timeout)
    if not html:
        return []

    soup = BeautifulSoup(html, 'lxml')
    deck_links = []
    seen_slugs = set()

    for a in soup.select(f'a[href*="set={format_filter}"]'):
        href = a.get('href', '')
        if '/matchups' in href.lower():
            continue

        slug_match = re.search(r'/decks/([^"?]+)', href)
        if slug_match:
            slug = slug_match.group(1)
            if slug not in seen_slugs:
                seen_slugs.add(slug)
                deck_links.append((slug, f"https://play.limitlesstcg.com{href}"))

    deck_links = deck_links[:max_decks]
    logger.info("%s Archetypes zum Scrapen gefunden.", len(deck_links))

    all_decks = []

    for idx, (slug, url) in enumerate(deck_links, 1):
        deck_name = _canonicalize_archetype(slug_to_archetype(slug))
        logger.info("[%s/%s] %s (Sammle Decklisten...)", idx, len(deck_links), deck_name)

        deck_html = safe_fetch_html(url, timeout)
        if not deck_html:
            continue

        dsoup = BeautifulSoup(deck_html, 'lxml')

        # Walk per-<tr> instead of grabbing all decklist anchors flat —
        # parse_history_row() captures (tournament_id, tournament_date,
        # list_url) together so we can emit dated-CSV rows from this
        # same crawl. Dedupe on list_url (each row holds two anchors:
        # player-cell + list-cell, both pointing at the same decklist).
        history_rows: list = []
        seen_list_urls: set = set()
        for tr in dsoup.find_all("tr"):
            row = parse_history_row(tr)
            if not row:
                continue
            lh = row.get("list_url")
            if not lh or lh in seen_list_urls:
                continue
            seen_list_urls.add(lh)
            history_rows.append(row)
            if len(history_rows) >= max_lists_per_deck:
                break

        if not history_rows:
            continue

        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = [
                executor.submit(
                    _fetch_meta_live_decklist,
                    f"https://play.limitlesstcg.com{r['list_url']}",
                    deck_name, slug, card_db, timeout,
                    r.get("tournament_id", ""),
                    r.get("tournament_date", ""),
                    r.get("tournament_name", ""),
                    int(r.get("total_players") or 0),
                    r.get("place", ""),
                    r.get("score", ""),
                    r.get("player", ""),
                )
                for r in history_rows
            ]
            for future in concurrent.futures.as_completed(futures):
                res = future.result()
                if res:
                    all_decks.append(res)

    logger.info("Meta Live: %s vollstaendige Decklisten extrahiert.", len(all_decks))
    return all_decks


def build_dated_rows_from_meta_live(
    limitless_decks: list,
    card_db: CardDatabaseLookup,
) -> list:
    """Group Meta-Live decks by ``(tournament_id, archetype)`` and run
    :func:`aggregate_tournament_archetype` on each bucket. Replaces the
    standalone ``online_tournament_dated_scraper.py`` — same input
    crawl, same output schema."""
    buckets: Dict[tuple, dict] = {}
    for deck in limitless_decks:
        tid = (deck.get("tournament_id") or "").strip()
        if not tid:
            continue  # archived snapshots without tid context — skip
        date = (deck.get("tournament_date") or "").strip()
        if not date:
            continue  # date missing → recency-decay can't use the row
        archetype = deck.get("archetype") or ""
        if not archetype:
            continue
        key = (tid, archetype)
        bucket = buckets.setdefault(key, {
            "tournament_id": tid,
            "tournament_name": deck.get("tournament_name") or "",
            "tournament_date": date,
            "archetype": archetype,
            "decks": [],
            "total_players": 0,
        })
        # Update the human-readable tournament_name if a later deck has
        # a richer string (some rows leave it blank when the parser hits
        # an archived row).
        if deck.get("tournament_name") and not bucket["tournament_name"]:
            bucket["tournament_name"] = deck["tournament_name"]
        # total_players: take MAX across decks in the same tournament —
        # every deck in this tournament should report the same value
        # (parsed from "Nth of TOTAL" on each player's history row).
        # Use max to be robust to occasional 0/missing values.
        bucket["total_players"] = max(
            bucket["total_players"], int(deck.get("total_players") or 0)
        )
        bucket["decks"].append(deck.get("cards") or [])

    out: list = []
    for b in buckets.values():
        out.extend(aggregate_tournament_archetype(
            b["tournament_id"], b["tournament_name"], b["tournament_date"],
            b["archetype"], b["decks"], card_db,
            total_players=b["total_players"],
        ))
    return out

# ============================================================
# META PLAY! (labs.limitlesstcg.com)
# ============================================================
def _fetch_meta_play_decklist(url: str, archetype: str, card_db: CardDatabaseLookup, timeout: int) -> dict:
    import html as html_module

    html = safe_fetch_html(url, timeout)
    if not html:
        return None

    soup = BeautifulSoup(html, 'lxml')
    cards = []

    for script in soup.find_all('script'):
        content = script.string
        if not content:
            continue
        if 'pokemon' in content.lower() and 'message' in content.lower():
            try:
                data = json.loads(content)
                body_data = json.loads(data.get('body', '{}'))
                msg = body_data.get('message', {})

                for category in ['pokemon', 'trainer', 'energy']:
                    for c in msg.get(category, []):
                        name = fix_mojibake(html_module.unescape(c.get('name', ''))).replace("\u2019", "'")
                        count = int(c.get('count', 0))
                        set_code = str(c.get('set', '')).strip().upper()
                        set_num = str(c.get('number', '')).strip()

                        if name and count > 0:
                            cards.append({
                                'name': name,
                                'count': count,
                                'set_code': set_code,
                                'set_number': set_num
                            })
                break
            except Exception as exc:
                logger.debug("JSON parse attempt failed: %s", exc)

    total = sum(c['count'] for c in cards)
    if cards and 59 <= total <= 61:
        return {
            'archetype': _canonicalize_archetype(normalize_archetype_name(archetype)),
            'cards': cards,
            'source': 'Tournament'
        }
    return None

def scrape_tournaments(settings: dict, card_db: CardDatabaseLookup) -> list:
    config = settings.get("sources", {}).get("tournaments", {})
    if not config.get("enabled", False):
        logger.info("Meta Play! (Tournaments) deaktiviert.")
        return []

    logger.info("=" * 60)
    logger.info("SCRAPING TOURNAMENTS (META PLAY! - labs.limitlesstcg.com)")
    logger.info("=" * 60)

    max_tournaments = config.get("max_tournaments", 60)
    max_decks_per_tourney = config.get("max_decks_per_tournament", 128)
    timeout = settings.get("request_timeout", 20)
    max_workers = settings.get("max_workers", 5)
    format_filter = config.get("format_filter", [])

    start_date = None
    if config.get("start_date"):
        try:
            fmt = "%d.%m.%Y" if '.' in config["start_date"] else "%Y-%m-%d"
            start_date = datetime.strptime(config["start_date"], fmt)
        except ValueError:
            logger.warning("Ungueltiges Datumsformat in settings. Nutze DD.MM.YYYY")

    base_url = "https://labs.limitlesstcg.com/"
    html = safe_fetch_html(base_url, timeout)
    if not html:
        return []

    scraped_ids = load_scraped_meta_tournaments()
    t_ids = sorted(list(set(re.findall(r'/(\d+)/standings', html))), key=int, reverse=True)
    new_t_ids = [tid for tid in t_ids if tid not in scraped_ids][:max_tournaments]

    logger.info("Zu verarbeitende neue Turniere: %s (uebersprungen: %s)", len(new_t_ids), len(t_ids) - len(new_t_ids))

    all_decks = []
    newly_scraped_ids = set()

    for idx, tid in enumerate(new_t_ids, 1):
        url = f"https://labs.limitlesstcg.com/{tid}/standings"
        logger.info("[%s/%s] Lade Turnier %s", idx, len(new_t_ids), tid)

        t_html = safe_fetch_html(url, timeout)
        if not t_html:
            continue

        tsoup = BeautifulSoup(t_html, 'lxml')

        title_tag = tsoup.find('title')
        title = title_tag.get_text(strip=True).replace('| Limitless', '').strip() if title_tag else "Unknown"
        is_jp = 'Standard (JP)' in t_html or 'Champions League' in title
        t_format = 'Standard (JP)' if is_jp else ('Expanded' if 'Expanded' in t_html else 'Standard')

        if format_filter and t_format not in format_filter:
            logger.info("   Uebersprungen (Format %s nicht in Filter)", t_format)
            continue

        # Apply date filter – extract date from the tournament header area only
        if start_date:
            # Search only in the text near the title, not the whole HTML
            # Limitless labs shows date like "September 13–15, 2024" or "Apr 5, 2026"
            # Two-part fix for the "Kein Datum erkannt" loop:
            # 1) fix_mojibake — Limitless serves /XXXX/standings UTF-8
            #    that requests decodes as Latin-1 (no charset header).
            #    The en-dash bytes \xe2\x80\x93 arrive split into three
            #    single chars 'â\x80\x93' which the [-–] regex class
            #    cannot match.
            # 2) [:10000] window (was :3000) — Limitless migrated the
            #    standings template to SvelteKit; the boot scripts push
            #    the actual content (incl. the date "April 25–26,
            #    2026") past byte ~5000. The old 3000-char window
            #    saw only the SvelteKit scaffolding, not the data.
            header_area = fix_mojibake(t_html[:10000])
            date_match = re.search(
                r'(\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\b)\s+(\d{1,2})(?:\s*[-\u2013]\s*(?:\w+\s+)?\d{1,2})?[^,\d]*,?\s*(\d{4})',
                header_area
            )
            if date_match:
                try:
                    t_date = datetime.strptime(
                        f"{date_match.group(1)} {date_match.group(2)} {date_match.group(3)}",
                        "%B %d %Y"
                    )
                    if t_date < start_date:
                        logger.info(f"   Uebersprungen (Datum {t_date.strftime('%d.%m.%Y')} vor Filter) - breche ab.")
                        break
                except ValueError:
                    logger.warning("   Datum erkannt aber Parse-Fehler fuer Turnier %s – ueberspringe.", tid)
                    continue
            else:
                logger.warning("   Kein Datum erkannt fuer Turnier %s – ueberspringe (fail-closed).", tid)
                continue

        deck_tasks = []
        for row in tsoup.select('tr'):
            player_link = row.select_one(f'a[href^="/{tid}/player/"]')
            if not player_link:
                continue

            # Decklist link may be separate from the player link (labs HTML structure)
            decklist_link = row.select_one('a[href*="decklist"]')
            if decklist_link:
                deck_url = f"https://labs.limitlesstcg.com{decklist_link['href']}"
            elif 'decklist' in player_link.get('href', ''):
                deck_url = f"https://labs.limitlesstcg.com{player_link['href']}"
            else:
                # Construct decklist URL from player link
                deck_url = f"https://labs.limitlesstcg.com{player_link['href']}/decklist"

            arch_link = row.select_one(f'a[href^="/{tid}/decks/"]')
            if arch_link:
                archetype = _canonicalize_archetype(
                    slug_to_archetype(arch_link['href'].split('/')[-1])
                )
            else:
                # Fallback: build name from <img.pokemon alt> attributes,
                # then run through the canonicalizer so img-derived names
                # also collapse to the bare Limitless form.
                imgs = row.select('img.pokemon')
                slugs = [i['alt'].lower() for i in imgs if i.has_attr('alt')]
                # Try slug-signature lookup first (more reliable when we
                # have multiple icons), fall back to title-cased join.
                from_signature = _matcher.canonicalize_by_slugs(slugs) if _matcher else None
                archetype = from_signature or _canonicalize_archetype(
                    ' '.join(s.title() for s in slugs)
                ) or "Unknown"

            deck_tasks.append((deck_url, archetype))

        deck_tasks = deck_tasks[:max_decks_per_tourney]
        logger.info("   %s (%s) -> Lade %s Decks parallel...", title, t_format, len(deck_tasks))

        decks_before = len(all_decks)
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = [executor.submit(_fetch_meta_play_decklist, u, a, card_db, timeout) for u, a in deck_tasks]
            for future in concurrent.futures.as_completed(futures):
                res = future.result()
                if res:
                    res['tournament_id'] = tid   # tag for the Meta Play! deck cache
                    all_decks.append(res)

        # Only mark as scraped if we actually retrieved deck data
        if len(all_decks) > decks_before:
            newly_scraped_ids.add(tid)
        else:
            logger.warning("   Keine Decks gefunden fuer Turnier %s – wird NICHT als erledigt markiert.", tid)

    if newly_scraped_ids:
        save_scraped_meta_tournaments(scraped_ids | newly_scraped_ids)
        logger.info("%s neue Turnier-IDs gespeichert.", len(newly_scraped_ids))

    return all_decks


def build_best_online_decklists(limitless_decks: list, recent_days: int = 7) -> dict:
    """Per archetype, pick the single BEST-placed REAL decklist from the last
    `recent_days` days of Meta-Live results — no averaging/synthesis, an actual
    list a player ran. Feeds the "Latest Online" quick-reference panel.

    Best = lowest finishing place; ties broken by higher win%, then more recent.
    Returns { archetype: { tournament_name, tournament_date, player, place,
    place_rank, total_players, score, win_pct, cards: [...] } }.
    """
    cutoff = datetime.now() - timedelta(days=recent_days)

    def _place_rank(place_str):
        m = re.match(r'^\s*(\d+)(?:st|nd|rd|th)\b', str(place_str or ''), re.IGNORECASE)
        return int(m.group(1)) if m else None

    def _win_pct(score_str):
        m = re.match(r'^\s*(\d+)\s*-\s*(\d+)\s*-\s*(\d+)\s*$', str(score_str or ''))
        if not m:
            return 0.0
        w, l, t = int(m.group(1)), int(m.group(2)), int(m.group(3))
        g = w + l + t
        return ((w + 0.5 * t) / g * 100.0) if g else 0.0

    def _date_num(date_iso):
        try:
            return int((date_iso or '').strip().replace('-', ''))
        except ValueError:
            return 0

    def _within_window(date_iso):
        try:
            return datetime.strptime((date_iso or '').strip(), '%Y-%m-%d') >= cutoff
        except ValueError:
            return False

    best: Dict[str, dict] = {}
    for d in limitless_decks:
        arch = (d.get('archetype') or '').strip()
        cards = d.get('cards') or []
        date_iso = (d.get('tournament_date') or '').strip()
        rank = _place_rank(d.get('place'))
        if not arch or not cards or rank is None or not _within_window(date_iso):
            continue  # only ranked, carded, in-window decks qualify
        wp = _win_pct(d.get('score'))
        key = (rank, -wp, -_date_num(date_iso))   # lower place, higher WR, newer
        cur = best.get(arch)
        if cur is not None and key >= cur['_key']:
            continue
        best[arch] = {
            '_key':            key,
            'tournament_id':   d.get('tournament_id') or '',
            'tournament_name': d.get('tournament_name') or '',
            'tournament_date': date_iso,
            'player':          d.get('player') or '',
            'place':           d.get('place') or '',
            'place_rank':      rank,
            'total_players':   int(d.get('total_players') or 0),
            'score':           d.get('score') or '',
            'win_pct':         round(wp, 1),
            'cards': [
                {
                    'name':        c.get('name') or c.get('card_name') or '',
                    'count':       int(c.get('count') or 0),
                    'set_code':    c.get('set_code') or '',
                    'set_number':  c.get('set_number') or '',
                    'type':        c.get('type') or '',
                    'is_ace_spec': bool(c.get('is_ace_spec')),
                }
                for c in cards
            ],
        }
    for v in best.values():
        v.pop('_key', None)
    return best


# ============================================================
# AGGREGATION + OUTPUT
# ============================================================
def aggregate_with_meta(all_decks: list, card_db: CardDatabaseLookup, meta_label: str) -> list:
    if not all_decks:
        return []
    aggregated = aggregate_card_data(all_decks, card_db)
    for row in aggregated:
        row["meta"] = meta_label
    return aggregated


def _merge_current_meta_rows(new_rows: list, output_file: str) -> list:
    """Replace, per meta, the prior rows with the freshly-aggregated ones.

    Both sources are complete snapshots each run: "Meta Live" is the full
    online ladder; "Meta Play!" is the full aggregate recomputed from the
    cumulative raw-deck cache (data/meta_play_decks_cache.json). So any meta
    present in `new_rows` REPLACES all of its prior rows wholesale — which fixes
    the stale-denominator bug (a card that left the ladder, or a per-run partial
    deck count, no longer lingers). A meta ABSENT from `new_rows` (the ladder
    fetch failed, or the Play! cache is still empty) keeps its last good rows so
    a transient failure never wipes data. Keying on `meta` also stops a Meta
    Live row from clobbering a Meta Play! row for the same archetype+card, which
    the old save_to_csv append-merge (key without `meta`) allowed.
    """
    out_path = os.path.join(get_data_dir(), output_file)
    if not os.path.exists(out_path):
        return new_rows
    with open(out_path, 'r', encoding='utf-8-sig') as f:
        existing = list(csv.DictReader(f, delimiter=';'))
    refreshed = {r.get('meta') for r in new_rows}
    result = [r for r in existing if r.get('meta') not in refreshed]
    result.extend(new_rows)
    return result

# ============================================================
# MAIN
# ============================================================
def main():
    logger.info("=" * 60)
    logger.info("CURRENT META ANALYSIS SCRAPER - FAST EDITION")
    logger.info("=" * 60)

    settings = _load_settings()

    logger.info("Lade einheitliche Karten-Datenbank...")
    try:
        card_db = CardDatabaseLookup()
    except Exception as e:
        logger.error("Konnte Karten-Datenbank nicht laden: %s", e)
        return

    if not card_db.cards:
        logger.error("Karten-Datenbank ist leer!")
        return

    limitless_decks = scrape_limitless_online(settings, card_db)
    tournament_decks = scrape_tournaments(settings, card_db)

    # Meta Play! cumulative cache: persist the raw decks of every major keyed by
    # tournament_id, then recompute the FULL aggregate from the whole cache each
    # run. The ledger still gates fetching (no major is re-scraped), but the
    # denominators are now consistent across runs instead of carrying each run's
    # partial deck count. scrape_tournaments tags each deck with its
    # tournament_id for this.
    play_cache = load_meta_play_cache()
    if tournament_decks:
        new_by_tid: Dict[str, list] = {}
        for d in tournament_decks:
            tid = str(d.get('tournament_id', '') or '')
            if tid:
                new_by_tid.setdefault(tid, []).append(d)
        for tid, decks in new_by_tid.items():
            play_cache[tid] = decks   # replace this tournament's decks (re-scrape safe)
        save_meta_play_cache(play_cache)
        logger.info("Meta-Play!-Cache: %d Turniere, %d Decks gesamt",
                    len(play_cache), sum(len(v) for v in play_cache.values()))
    all_play_decks = [d for decks in play_cache.values() for d in decks]

    aggregated_data = []
    aggregated_data.extend(aggregate_with_meta(limitless_decks, card_db, "Meta Live"))
    aggregated_data.extend(aggregate_with_meta(all_play_decks, card_db, "Meta Play!"))

    if not aggregated_data:
        logger.info("Keine Daten gesammelt. Vorgang beendet.")
        return

    # Per-meta merge: any meta refreshed this run (Meta Live always; Meta Play!
    # whenever the cache is non-empty) fully REPLACES its prior rows; a meta we
    # did NOT refresh (failed ladder fetch, still-empty cache) keeps its last
    # good rows. Both sources are complete snapshots now, so no stale rows
    # survive. Then write in one shot.
    if settings.get('append_mode', False):
        aggregated_data = _merge_current_meta_rows(aggregated_data, settings["output_file"])
    save_to_csv(aggregated_data, settings["output_file"], append_mode=False)

    # Dated CSV — same crawl, second output. Frontend's recency-decay
    # (_aggregateWeightedSource in app-deck-builder.js) reads this path
    # via loadOnlineTournamentDatedRows().
    dated_rows = build_dated_rows_from_meta_live(limitless_decks, card_db)
    dated_csv_path = os.path.join(get_data_dir(), "online_tournament_dated_cards.csv")
    write_dated_csv(dated_rows, dated_csv_path)
    distinct_tids = len({(r["tournament_id"], r["archetype"]) for r in dated_rows})
    logger.info(
        "Online Dated CSV: %d Karten-Rows aus %d (Tournament, Archetyp)-Buckets → %s",
        len(dated_rows), distinct_tids, dated_csv_path,
    )

    # Best REAL online decklist per archetype (last 7 days) — the actual list a
    # player ran, for the "Latest Online" quick-reference panel (no synthesis).
    best_online = build_best_online_decklists(limitless_decks, recent_days=7)
    best_path = os.path.join(get_data_dir(), "online_best_decklists.json")
    try:
        with open(best_path, "w", encoding="utf-8") as f:
            json.dump(best_online, f, ensure_ascii=False)
        logger.info("Best Online Decklists: %d Archetypen (letzte 7 Tage) → %s",
                    len(best_online), best_path)
    except OSError as e:
        logger.warning("Konnte online_best_decklists.json nicht schreiben: %s", e)

    logger.info("=" * 60)
    logger.info("SCRAPING KOMPLETT!")
    logger.info("=" * 60)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logger.warning("Scraper durch Benutzer abgebrochen.")
    except Exception as e:
        logger.critical(f"Unerwarteter Fehler: {e}", exc_info=True)
