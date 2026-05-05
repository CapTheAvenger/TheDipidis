"""One-shot cleanup for data/current_meta_card_data.csv.

Append-mode preserves stale rows whenever the canonical archetype name
shifts between scrape runs (e.g. "Cynthia Garchomp Ex" vs "Cynthia's
Garchomp"). After the frontend canonicalisation collapses both spellings
into one, the per-source aggregations stack and break the share math:
the Online+Major divisor picks max(20, 16)=20 instead of the correct
sum=36, so cards like Petrel that only appear in Online keep an inflated
share.

This script:
  1. Reads the existing CSV.
  2. Applies _canonicalize_archetype() to every archetype name.
  3. Dedupes by (archetype, card_name, meta, set_code, set_number),
     keeping the LATEST occurrence (CSV row order = scrape recency).
  4. Writes the cleaned data back atomically.

Run it once after the canonicalisation rollout. Future scrape runs
will append cleanly because the new save_to_csv() dedup key now lines
up across runs.

Standalone wrt scraper imports (no bs4 / requests dependency).
"""
from __future__ import annotations

import csv
import os
import re
import sys
from typing import Any, Dict, List, Optional

# Make backend/core importable for atomic_write_file
THIS_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(THIS_DIR)
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)
sys.path.insert(0, os.path.join(BACKEND_DIR, "core"))

from card_scraper_shared import atomic_write_file  # type: ignore  # noqa: E402

CSV_NAME = "current_meta_card_data.csv"


def _resolve_csv_path(explicit: Optional[str] = None) -> str:
    """Find the CSV. Prefer explicit arg, then CI's backend/core/data/,
    then the project-root data/ where the deployed copy lives."""
    if explicit and os.path.isabs(explicit):
        return explicit
    if explicit:
        if os.path.exists(explicit):
            return os.path.abspath(explicit)
    candidates = [
        os.path.join(BACKEND_DIR, "core", "data", CSV_NAME),
        os.path.join(PROJECT_ROOT, "data", CSV_NAME),
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    # Fall back to project-root path even if missing — script will warn.
    return os.path.join(PROJECT_ROOT, "data", CSV_NAME)

# Mirror of current_meta_analysis_scraper._SET_CODE_SUFFIX_RE / _TRAILING_EX_RE.
# Kept inline so the cleanup tool has no scraper-module dependency
# (scrapers import bs4 / requests at module load).
_SET_CODE_SUFFIX_RE = re.compile(
    r"\s+(?:asc|pfl|meg|mee|mep|blk|wht|dri|jtg|pre|ssp|scr|sfa|"
    r"twm|tef|paf|par|mew|obf|pal|svi|sve|svp|por|m3|m4)$",
    re.IGNORECASE,
)
_TRAILING_EX_RE = re.compile(r"\s+ex$", re.IGNORECASE)
_POSSESSIVE_TRAINERS = {
    "rocket": "Rocket's", "hop": "Hop's", "steven": "Steven's",
    "cynthia": "Cynthia's", "marnie": "Marnie's", "lillie": "Lillie's",
    "ethan": "Ethan's", "hau": "Hau's", "n": "N's",
    "iono": "Iono's", "arven": "Arven's", "nemona": "Nemona's",
    "kieran": "Kieran's", "kabu": "Kabu's", "raihan": "Raihan's",
    "jacq": "Jacq's", "geeta": "Geeta's",
}

# Optional: archetype_matcher is bs4-free → safe to import.
_matcher: Optional[Any] = None
try:
    from archetype_matcher import ArchetypeMatcher  # type: ignore
    _matcher = ArchetypeMatcher().load()
except Exception as e:  # pragma: no cover
    print(f"[cleanup] ArchetypeMatcher unavailable ({e}) — using regex pipeline only.")


def _canonicalize_archetype(raw_name: str) -> str:
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
        try:
            canonical = _matcher.canonicalize_by_name(name)
            if canonical:
                return canonical
        except Exception:
            pass
    return name


def cleanup(csv_path: Optional[str] = None) -> Dict[str, int]:
    path = _resolve_csv_path(csv_path)
    if not os.path.exists(path):
        print(f"[cleanup] {path} not found — nothing to do.")
        return {"input": 0, "output": 0, "removed": 0, "renamed": 0}
    print(f"[cleanup] target: {path}")

    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f, delimiter=";")
        fieldnames = list(reader.fieldnames or [])
        rows: List[Dict[str, Any]] = list(reader)

    if not rows or not fieldnames:
        print("[cleanup] CSV is empty — nothing to do.")
        return {"input": 0, "output": 0, "removed": 0, "renamed": 0}

    input_count = len(rows)

    # 1. Canonicalise archetype names in place.
    rename_count = 0
    for r in rows:
        old = (r.get("archetype") or "").strip()
        new = _canonicalize_archetype(old)
        if new != old:
            rename_count += 1
            r["archetype"] = new

    # 2. Dedupe by (archetype, card_name, meta, set_code, set_number),
    # keeping the LATEST row (CSV order = scrape recency).
    latest: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        key = "|||".join([
            (r.get("archetype") or "").strip(),
            (r.get("card_name") or "").strip(),
            (r.get("meta") or "").strip(),
            (r.get("set_code") or "").strip(),
            (r.get("set_number") or "").strip(),
        ])
        latest[key] = r

    cleaned = list(latest.values())
    output_count = len(cleaned)

    # 3. Write back atomically. Mirror save_to_csv's German-decimal
    # convention so subsequent scrape runs don't see a mixed file.
    decimal_keys = ("percentage_in_archetype", "average_count", "average_count_overall")

    def _write_csv(fh):
        writer = csv.DictWriter(fh, fieldnames=fieldnames, delimiter=";", extrasaction="ignore")
        writer.writeheader()
        for r in cleaned:
            out = dict(r)
            for k in decimal_keys:
                if k in out and out[k] is not None:
                    out[k] = str(out[k]).replace(".", ",")
            writer.writerow(out)

    atomic_write_file(path, _write_csv, encoding="utf-8-sig", newline="")

    stats = {
        "input": input_count,
        "output": output_count,
        "removed": input_count - output_count,
        "renamed": rename_count,
    }
    print(
        f"[cleanup] input={stats['input']} → output={stats['output']} "
        f"(removed {stats['removed']} stale duplicates, "
        f"renamed {stats['renamed']} archetypes to canonical form)"
    )
    return stats


if __name__ == "__main__":
    arg = sys.argv[1] if len(sys.argv) > 1 else None
    cleanup(arg)
