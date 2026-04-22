#!/usr/bin/env python3
"""
Archetype Matcher (Phase 3)
===========================
Cross-source archetype canonicalisation via Pokemon-icon signatures.

The problem: Limitless names a deck "Lucario Hariyama" while the Japanese
City League HTML lists it as two <img.pokemon> slugs "lucario-mega" and
"hariyama" — fuzzy name matching drifts and misses. But both sources
eventually boil down to the SAME sorted tuple of Pokemon slugs. That tuple
is a reliable cross-source key.

This module:
- Loads data/archetype_icons.json (the same file the frontend reads and
  the archetype_icons_scraper writes).
- Builds a signature index: sorted(slugs) -> canonical name.
- Exposes canonicalize_by_slugs() and canonicalize_by_name() so scrapers
  can hand off a slug list or a raw name and get back the Limitless
  canonical form.

Consumers (planned):
- backend/scrapers/city_league_archetype_scraper.py — instead of joining
  cleaned pokemon names into a string and calling normalize_archetype_name,
  hand the slugs to canonicalize_by_slugs() first for a true match.
"""

import json
import os
import re
from typing import Dict, List, Optional, Tuple, Any


# ── Paths ────────────────────────────────────────────────────────────────────
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.normpath(os.path.join(_THIS_DIR, "..", ".."))
DEFAULT_ICON_JSON = os.path.join(_REPO_ROOT, "data", "archetype_icons.json")


# ── Normalisation (mirrors JS normalize() in js/archetype-icons.js) ─────────
_APOSTROPHES = "'\u2018\u2019\u201B\u0060\u00B4\u02BC"
_NORM_STRIP = re.compile(r"[\s\-" + re.escape(_APOSTROPHES) + r"]")


def normalize_name(name: str) -> str:
    """Lowercase + strip whitespace/hyphens/all apostrophe variants.
    Must stay identical to archetype_icons_scraper._normalize and
    js/archetype-icons.js normalize()."""
    return _NORM_STRIP.sub("", (name or "").lower())


# ── Slug cleaning ────────────────────────────────────────────────────────────
# Limitless sometimes decorates slugs with form suffixes we want to keep
# (e.g. "ogerpon-cornerstone", "charizard-mega-x"). We only strip whitespace
# and lowercase — no suffix collapsing.
def normalize_slug(slug: str) -> str:
    return (slug or "").strip().lower().replace(" ", "-")


def signature(slugs: List[str]) -> Tuple[str, ...]:
    """Stable cross-source key for a set of Pokemon slugs.
    Sorted so argument order doesn't matter; tuple so it's hashable."""
    return tuple(sorted(normalize_slug(s) for s in slugs if s))


# ── Index build ──────────────────────────────────────────────────────────────
class ArchetypeMatcher:
    """Holds the archetype_icons.json data and the derived lookup indexes.
    Instantiate once per process and reuse — building the indexes scans
    every entry."""

    def __init__(self, icon_json_path: str = DEFAULT_ICON_JSON):
        self.icon_json_path = icon_json_path
        self._data: Dict[str, Any] = {}
        self._by_signature: Dict[Tuple[str, ...], str] = {}
        self._by_normalized_name: Dict[str, str] = {}
        self._loaded = False

    def load(self) -> "ArchetypeMatcher":
        if not os.path.exists(self.icon_json_path):
            raise FileNotFoundError(
                f"archetype_icons.json not found at {self.icon_json_path}. "
                "Run archetype_icons_scraper.py first."
            )
        with open(self.icon_json_path, "r", encoding="utf-8") as f:
            self._data = json.load(f)

        archetypes: Dict[str, List[str]] = self._data.get("archetypes", {}) or {}
        self._by_signature.clear()
        self._by_normalized_name.clear()

        for name, slugs in archetypes.items():
            if not isinstance(slugs, list):
                continue
            sig = signature(slugs)
            # On signature collision, first-seen wins. The scraper usually
            # writes Limitless-order, which maps best to the English name
            # a user would recognise. Manually curated names should come
            # first in the JSON for predictability.
            self._by_signature.setdefault(sig, name)
            self._by_normalized_name[normalize_name(name)] = name

        self._loaded = True
        return self

    def _ensure_loaded(self) -> None:
        if not self._loaded:
            self.load()

    # ── Lookups ──────────────────────────────────────────────────────────────
    def canonicalize_by_slugs(self, slugs: List[str]) -> Optional[str]:
        """Given a set of Pokemon slugs (in any order), return the Limitless
        canonical archetype name, or None if the signature doesn't match
        any known archetype. Callers should fall back to their original
        name-based matching when this returns None."""
        self._ensure_loaded()
        return self._by_signature.get(signature(slugs))

    def canonicalize_by_name(self, name: str) -> Optional[str]:
        """Normalize-aware name lookup — treats "N's Zoroark" with straight
        and curly apostrophes as the same entry."""
        self._ensure_loaded()
        return self._by_normalized_name.get(normalize_name(name))

    def canonicalize(self, name: str = "", slugs: Optional[List[str]] = None) -> Optional[str]:
        """Try slug-signature first (most reliable), fall back to name.
        Returns None if neither match."""
        self._ensure_loaded()
        if slugs:
            hit = self.canonicalize_by_slugs(slugs)
            if hit:
                return hit
        if name:
            return self.canonicalize_by_name(name)
        return None

    def slugs_for(self, name: str) -> Optional[List[str]]:
        """Reverse: given an archetype name, return its slug list."""
        self._ensure_loaded()
        canonical = self.canonicalize_by_name(name)
        if not canonical:
            return None
        return list(self._data.get("archetypes", {}).get(canonical, []))

    def all_names(self) -> List[str]:
        self._ensure_loaded()
        return list(self._data.get("archetypes", {}).keys())


# ── Module-level convenience ────────────────────────────────────────────────
_default_matcher: Optional[ArchetypeMatcher] = None


def get_default_matcher() -> ArchetypeMatcher:
    """Lazy-loaded singleton — first caller pays the load cost, rest reuse."""
    global _default_matcher
    if _default_matcher is None:
        _default_matcher = ArchetypeMatcher().load()
    return _default_matcher


def canonicalize_by_slugs(slugs: List[str]) -> Optional[str]:
    return get_default_matcher().canonicalize_by_slugs(slugs)


def canonicalize_by_name(name: str) -> Optional[str]:
    return get_default_matcher().canonicalize_by_name(name)


def canonicalize(name: str = "", slugs: Optional[List[str]] = None) -> Optional[str]:
    return get_default_matcher().canonicalize(name, slugs)


# ── CLI for debugging ────────────────────────────────────────────────────────
if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Probe the archetype matcher")
    parser.add_argument("--name", type=str, help="Look up by archetype name")
    parser.add_argument("--slugs", type=str, nargs="+", help="Look up by Pokemon slug list")
    parser.add_argument("--list", action="store_true", help="List all known archetype names")
    args = parser.parse_args()

    m = ArchetypeMatcher().load()
    if args.list:
        for n in sorted(m.all_names()):
            print(n)
    elif args.slugs:
        hit = m.canonicalize_by_slugs(args.slugs)
        print(hit if hit else f"(no match for signature {signature(args.slugs)})")
    elif args.name:
        hit = m.canonicalize_by_name(args.name)
        print(hit if hit else "(not found)")
    else:
        parser.print_help()
