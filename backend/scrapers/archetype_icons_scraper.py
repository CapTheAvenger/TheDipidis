#!/usr/bin/env python3
"""
Archetype Icons Scraper
=======================
Scrapes current-meta archetype → Pokemon-icon mappings from
https://play.limitlesstcg.com/decks and writes them to
repo-root/data/archetype_icons.json (the same file the frontend
ArchetypeIcons helper reads).

Behaviour:
- Each deck row on Limitless has an <img class="pokemon" ...> whose
  src matches r2.limitlesstcg.net/pokemon/gen9/<slug>.png.
- We extract (deck_name, [slug, ...]) for every visible deck.
- The output JSON is MERGED, not overwritten: existing entries stay
  intact (so manual curation and renames aren't lost), new archetypes
  are appended. Run with --force to overwrite existing entries too
  (useful after a format rotation when slugs shift).

Usage:
    python backend/scrapers/archetype_icons_scraper.py [--force] [--dry-run]
"""

import argparse
import json
import os
import re
import sys
import urllib.parse
from datetime import datetime
from typing import Dict, List, Tuple, Any

# Make backend/core importable no matter where this script is launched from.
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
_CORE_DIR = os.path.normpath(os.path.join(_THIS_DIR, "..", "core"))
if _CORE_DIR not in sys.path:
    sys.path.insert(0, _CORE_DIR)

from card_scraper_shared import (  # noqa: E402
    setup_console_encoding,
    setup_logging,
    fetch_page_bs4,
    load_settings,
)

setup_console_encoding()
logger = setup_logging("archetype_icons_scraper")


# ── Settings ─────────────────────────────────────────────────────────────────
DEFAULT_SETTINGS: Dict[str, Any] = {
    "game": "PTCG",
    "format": "standard",
    # rotation/set left empty so the listing returns the current-season
    # decks Limitless is actively showing. Override via settings file if
    # you specifically want historical snapshots.
    "rotation": "",
    "set": "",
    "output_file": "archetype_icons.json",  # resolved relative to repo-root/data
}

# Limitless r2 CDN — must match data/archetype_icons.json _meta.urlPrefix.
ICON_URL_PATTERN = re.compile(
    r"r2\.limitlesstcg\.net/pokemon/gen9/([a-z0-9\-]+)\.png", re.IGNORECASE
)


def _repo_data_dir() -> str:
    """Repo-root /data, which is what the frontend actually reads.
    NOT card_scraper_shared.get_data_dir() — that's backend/core/data."""
    repo_root = os.path.normpath(os.path.join(_THIS_DIR, "..", ".."))
    data_dir = os.path.join(repo_root, "data")
    os.makedirs(data_dir, exist_ok=True)
    return data_dir


def _clean_deck_name(raw: str) -> str:
    return " ".join(raw.split()).strip()


def _extract_slugs_from_row(row) -> List[str]:
    """Pull unique pokemon slugs from a deck row, preserving first-seen order."""
    slugs: List[str] = []
    seen = set()
    for img in row.find_all("img"):
        src = img.get("src") or ""
        m = ICON_URL_PATTERN.search(src)
        if not m:
            # Fallback: some Limitless pages ship slugs via alt only.
            alt = (img.get("alt") or "").strip().lower()
            if img.get("class") and "pokemon" in img.get("class") and alt:
                slug = alt.replace(" ", "-")
            else:
                continue
        else:
            slug = m.group(1).lower()
        if slug and slug not in seen:
            seen.add(slug)
            slugs.append(slug)
    return slugs


def scrape_archetype_icons(settings: Dict[str, Any]) -> List[Tuple[str, List[str]]]:
    """Return list of (deck_name, [slug,...]) from the Limitless decks page."""
    game = settings.get("game", "PTCG")
    if game.upper() == "POKEMON":
        game = "PTCG"
    params: Dict[str, str] = {"game": game, "format": settings.get("format", "STANDARD")}
    if settings.get("rotation"):
        params["rotation"] = settings["rotation"]
    if settings.get("set"):
        params["set"] = settings["set"]

    url = f"https://play.limitlesstcg.com/decks?{urllib.parse.urlencode(params)}"
    logger.info("Fetching deck listing: %s", url)

    soup = fetch_page_bs4(url)
    if not soup:
        logger.error("Failed to fetch Limitless decks page")
        return []

    table = soup.find("table")
    if not table:
        logger.error("No table found on decks page — layout may have changed")
        return []

    results: List[Tuple[str, List[str]]] = []
    for row in table.find_all("tr"):
        deck_link = row.find("a", href=re.compile(r"^/decks/"))
        if not deck_link:
            continue
        deck_name = _clean_deck_name(deck_link.get_text(strip=True))
        if not deck_name or deck_name.lower() == "other":
            continue

        slugs = _extract_slugs_from_row(row)
        if not slugs:
            logger.warning("No pokemon icons found for deck '%s' — skipped", deck_name)
            continue

        # Cap at 2 slugs for the frontend (we only render up to 2 icons).
        slugs = slugs[:2]
        results.append((deck_name, slugs))

    logger.info("Extracted %d archetype-icon entries", len(results))
    return results


# ── Merge strategy ───────────────────────────────────────────────────────────
def _normalize(name: str) -> str:
    """Mirror of JS normalize(): apostrophe + whitespace + hyphen insensitive."""
    out = (name or "").lower()
    for ch in [" ", "-", "'", "\u2018", "\u2019", "\u201B", "\u0060", "\u00B4", "\u02BC"]:
        out = out.replace(ch, "")
    return out


def _load_existing(path: str) -> Dict[str, Any]:
    if not os.path.exists(path):
        return {
            "_meta": {
                "urlPrefix": "https://r2.limitlesstcg.net/pokemon/gen9/",
                "urlSuffix": ".png",
                "description": "Auto-generated by archetype_icons_scraper. Manual entries are preserved on merge.",
            },
            "archetypes": {},
        }
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def merge_into_json(
    scraped: List[Tuple[str, List[str]]],
    path: str,
    force: bool = False,
    dry_run: bool = False,
) -> Dict[str, int]:
    """Merge scraped entries into the JSON file. Returns stats dict."""
    data = _load_existing(path)
    archetypes: Dict[str, List[str]] = data.get("archetypes", {})

    # Build normalized-key index of existing entries for case/apostrophe-
    # insensitive dedup.
    norm_to_key: Dict[str, str] = {_normalize(k): k for k in archetypes}

    added: List[str] = []
    updated: List[str] = []
    unchanged: List[str] = []

    for deck_name, slugs in scraped:
        norm = _normalize(deck_name)
        existing_key = norm_to_key.get(norm)
        if existing_key is None:
            archetypes[deck_name] = slugs
            norm_to_key[norm] = deck_name
            added.append(deck_name)
            continue

        if archetypes[existing_key] == slugs:
            unchanged.append(existing_key)
            continue

        # Empty list is a deliberate "no icons — show the name" marker.
        # Never overwrite those, even on --force, since the source of
        # truth is human judgement (decks with ambiguous visual identity).
        if archetypes[existing_key] == []:
            unchanged.append(existing_key)
            continue

        if force:
            archetypes[existing_key] = slugs
            updated.append(existing_key)
        else:
            # Manual entry exists but differs from scraper — keep manual.
            unchanged.append(existing_key)

    # Stamp _meta with last-update info.
    data.setdefault("_meta", {})
    data["_meta"]["lastScrapedAt"] = datetime.now().isoformat(timespec="seconds")
    data["_meta"]["lastScrapedCount"] = len(scraped)
    data["archetypes"] = archetypes

    if dry_run:
        logger.info("[DRY RUN] Would add %d, update %d, leave %d unchanged",
                    len(added), len(updated), len(unchanged))
    else:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2, sort_keys=False)
        logger.info("Wrote %s (+%d new, ~%d updated, =%d unchanged)",
                    path, len(added), len(updated), len(unchanged))

    if added:
        logger.info("  New entries: %s", ", ".join(added))
    if updated:
        logger.info("  Updated entries: %s", ", ".join(updated))

    return {
        "added": len(added),
        "updated": len(updated),
        "unchanged": len(unchanged),
        "total": len(archetypes),
    }


# ── Entry point ──────────────────────────────────────────────────────────────
def main() -> int:
    parser = argparse.ArgumentParser(description="Scrape Limitless archetype icons")
    parser.add_argument("--force", action="store_true",
                        help="Overwrite existing entries (default: keep manual edits)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would change without writing the file")
    args = parser.parse_args()

    settings = load_settings("archetype_icons_settings.json", DEFAULT_SETTINGS)
    scraped = scrape_archetype_icons(settings)
    if not scraped:
        logger.error("No archetypes scraped — aborting merge")
        return 1

    out_path = os.path.join(_repo_data_dir(), settings.get("output_file", "archetype_icons.json"))
    stats = merge_into_json(scraped, out_path, force=args.force, dry_run=args.dry_run)

    print(json.dumps(stats, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
