"""Limitless date-tagged history-row parsing + dated-CSV writer.

Extracted from the now-removed ``online_tournament_dated_scraper.py``
because ``current_meta_analysis_scraper.py`` already crawls the exact
same `/decks/<slug>` listing pages — running a second scraper just to
capture dates was a 100 % duplicate crawl.

Pure helpers only — no network, no CLI, no state file. The owning
scraper handles those concerns. Frontend reads the produced CSV via
``loadOnlineTournamentDatedRows()`` in ``js/app-deck-builder.js``;
schema must therefore stay byte-stable with what the old scraper
produced.
"""
from __future__ import annotations

import csv
import os
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

try:
    from zoneinfo import ZoneInfo  # Python 3.9+
    # Limitless renders dates in the user's browser timezone. Primary
    # audience is Europe (Germany), so convert UTC ms-epoch to
    # Europe/Berlin and take the CALENDAR DATE from there. ZoneInfo
    # handles CET ↔ CEST DST automatically.
    _DISPLAY_TZ = ZoneInfo("Europe/Berlin")
except Exception:
    # Older Python or missing tzdata: fall back to fixed UTC+1.
    # Off by one hour during DST, but never off by a full day in the
    # way pure-UTC parsing was. Better than nothing on stripped runners.
    _DISPLAY_TZ = timezone(__import__("datetime").timedelta(hours=1))


# CSV schema — kept byte-stable with the previous standalone scraper so
# downstream code (frontend mergeOnlineMajorAdditive, threat-intel
# classifier scoring) treats both files uniformly.
DATED_CSV_FIELDNAMES = [
    "tournament_id", "tournament_name", "meta", "tournament_date",
    "archetype", "card_name", "card_identifier",
    "total_count", "max_count", "deck_inclusion_count", "average_count",
    "total_decks_in_archetype", "percentage_in_archetype",
    "set_code", "set_name", "set_number", "rarity", "type",
    "image_url", "is_ace_spec",
]
DATED_META_LABEL = "Online Dated"


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


def parse_date(text: str) -> Optional[str]:
    """Return ``YYYY-MM-DD`` for any of the date strings Limitless might
    emit (ISO, German "02. Mai 2026", English ordinal "25th April 2026").
    Returns ``None`` if no format matched."""
    if not text:
        return None
    s = (text or "").strip()
    if not s:
        return None

    iso_match = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})", s)
    if iso_match:
        try:
            return datetime(int(iso_match.group(1)), int(iso_match.group(2)),
                            int(iso_match.group(3))).strftime("%Y-%m-%d")
        except ValueError:
            pass

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
# History-page row parser — every HTML selector lives here so a single
# function captures the upstream-fragility surface.  Returns a dict per
# parseable row (or None for header / malformed rows).
# ────────────────────────────────────────────────────────────────


def parse_history_row(tr) -> Optional[Dict[str, str]]:
    """Parse one ``<tr>`` from the per-archetype `/decks/<slug>` history
    table.  Returns ``None`` for header rows or rows we couldn't
    identify."""
    cells = tr.find_all(["td", "th"])
    if len(cells) < 5:
        return None
    if all(c.name == "th" for c in cells):
        return None

    player = (cells[0].get_text(" ", strip=True) if cells[0] else "").strip()

    # Tournament name + ID — anchor pointing at /tournament/<id>.
    # Skip anchors with "/player/" in href: those are per-player decklist
    # links (text = player handle, NOT tournament name). Mid-2026
    # Limitless added a /tournament/<tid>/player/<handle>/decklist anchor
    # inside the player cell, which is the FIRST /tournament/ anchor in
    # document order — without this filter we'd record the player name
    # as the tournament name.
    tournament_name = ""
    tournament_id = ""
    for a in tr.select('a[href*="/tournament/"]'):
        href = a.get("href", "")
        if "/player/" in href:
            continue
        tournament_name = a.get_text(" ", strip=True)
        m = re.search(r"/tournament/([^/?]+)", href)
        if m:
            tournament_id = m.group(1)
        break

    # Date — Limitless's date column is `<a class="date" data-time="<ms>">`
    # with the visible text rendered CLIENT-SIDE by JavaScript reading
    # the data-time attribute.  Server-rendered HTML therefore has empty
    # text in the date cell and a populated data-time attribute. Convert
    # data-time → calendar date in Europe/Berlin so the result matches
    # what a German Limitless user reads (a tournament starting at
    # 00:30 CEST has data-time 23:30 UTC the previous day → display
    # "01. April" in CEST is the right answer, not "31. März"; pure-UTC
    # parsing was wrong by exactly that case). Visible text remains a
    # fallback for hand-curated rows or older archived markup.
    tournament_date_iso = ""
    date_raw = ""
    for a in tr.select("a[data-time]"):
        attr = a.get("data-time")
        try:
            ms = int(attr)
            tournament_date_iso = datetime.fromtimestamp(
                ms / 1000, tz=_DISPLAY_TZ
            ).strftime("%Y-%m-%d")
            date_raw = a.get_text(" ", strip=True) or attr
            break
        except (TypeError, ValueError):
            continue
    if not tournament_date_iso:
        for c in cells:
            txt = c.get_text(" ", strip=True)
            iso = parse_date(txt)
            if iso:
                tournament_date_iso = iso
                date_raw = txt
                break

    place = ""
    score = ""
    for c in cells:
        t = c.get_text(" ", strip=True)
        if re.match(r"^\d+(st|nd|rd|th)\s+of\s+\d+", t, re.IGNORECASE):
            place = t
        elif re.match(r"^\d+\s*-\s*\d+\s*-\s*\d+\s*$", t):
            score = t

    # List link — Limitless's per-deck URL changed mid-2026:
    #   NEW: /tournament/<tid>/player/<handle>/decklist
    #   OLD: /decks/<archetype-slug>/<list-id>
    #   OLD: /decklist[s]?/<id>
    # New pattern first; legacy as fallback for archived snapshots.
    list_url = ""
    deck_slug_id = ""
    for a in tr.select('a[href*="/decklist"]'):
        href = a.get("href", "")
        m = re.search(r"/tournament/([^/?]+)/player/([^/?]+)/decklist", href)
        if m:
            deck_slug_id = f"player/{m.group(2)}"
            list_url = href
            break
    if not list_url:
        for a in tr.select('a[href*="/decks/"]'):
            href = a.get("href", "")
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

    return {
        "player": player,
        "tournament_id": tournament_id,
        "tournament_name": tournament_name,
        "tournament_date": tournament_date_iso,
        "tournament_date_raw": date_raw,
        "place": place,
        "score": score,
        "deck_slug_id": deck_slug_id,
        "list_url": list_url,
    }


def extract_archetype_slugs_from_soup(soup) -> List[str]:
    """Pure parser — extract archetype slugs from a /decks listing
    page's BeautifulSoup tree. Skip /matchups anchors so a slug isn't
    double-counted."""
    slugs: List[str] = []
    seen: Set[str] = set()
    for a in soup.select('a[href*="/decks/"]'):
        href = a.get("href", "")
        if "/matchups" in href.lower():
            continue
        m = re.search(r"/decks/([^/?]+)", href)
        if not m:
            continue
        slug = m.group(1)
        if slug and slug not in seen:
            seen.add(slug)
            slugs.append(slug)
    return slugs


# ────────────────────────────────────────────────────────────────
# Aggregation — turn raw deck-by-deck card lists into
# tournament_cards_data-shaped per-card rows.
# ────────────────────────────────────────────────────────────────


def aggregate_tournament_archetype(
    tournament_id: str, tournament_name: str, tournament_date: str,
    archetype: str, decks: List[List[Dict[str, Any]]],
    card_db,
) -> List[Dict[str, Any]]:
    """``decks`` is a list of card-lists (one entry per appearance of
    ``archetype`` at this tournament). Returns one row per unique card
    matching the dated-CSV schema."""
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
        # CardDatabaseLookup.get_card takes (set_code, number)
        # positionally and returns a dict (or None).  Name fallback via
        # get_card_info() for cards whose decklist anchor didn't carry
        # set/number.
        info: Optional[Dict[str, str]] = None
        if sc and sn and hasattr(card_db, "get_card"):
            info = card_db.get_card(sc, sn)
        if not info and hasattr(card_db, "get_card_info"):
            info = card_db.get_card_info(name)
        rarity = (info.get("rarity", "") if info else "") or ""
        type_ = (info.get("type", "") if info else "") or ""
        image_url = (info.get("image_url", "") if info else "") or ""
        avg = agg["total_count"] / agg["deck_inclusion_count"] if agg["deck_inclusion_count"] else 0
        pct = (agg["deck_inclusion_count"] / total_decks * 100) if total_decks else 0
        out.append({
            "tournament_id": tournament_id,
            "tournament_name": tournament_name,
            "meta": DATED_META_LABEL,
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


def write_dated_csv(rows: List[Dict[str, Any]], output_path: str) -> None:
    """Write the dated CSV with the European decimal-comma convention
    used by the rest of the data/ folder.  Schema is fixed by
    ``DATED_CSV_FIELDNAMES``."""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=DATED_CSV_FIELDNAMES, delimiter=";", extrasaction="ignore")
        w.writeheader()
        for r in rows:
            for k in ("percentage_in_archetype", "average_count"):
                if k in r and r[k] is not None:
                    r[k] = str(r[k]).replace(".", ",")
            w.writerow(r)
