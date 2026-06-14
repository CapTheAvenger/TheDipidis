"""Auto-validate that weekly-full-update.yml's seed list and
prepare_card_data.SYNC_PATTERNS stay in lockstep.

Background: the workflow seeds backend/core/data/ from data/ at the
start of each scraper run (so historical rows aren't overwritten by
a one-row scrape), and prepare_card_data.sync_scraper_data_to_frontend
writes the freshly-produced files back from backend/core/data/ to
data/. Each entry must appear in BOTH lists — otherwise we get one
of two failure modes:

  • In seed but not in SYNC_PATTERNS → file lands in backend/core
    but never makes it back to data/ where the deploy reads from →
    Frontend silently shows stale data.

  • In SYNC_PATTERNS but not in seed → file is treated as
    "scraper-produced" without an incremental base → every run
    starts from an empty backend/core/data/ entry, the scraper
    appends to nothing, and historical rows can vanish (the Prague
    1-row regression that the comment in weekly-full-update.yml
    warns about).

Comments in the workflow / prepare_card_data both call out
"keep these in lockstep" — this test enforces it.
"""

import os
import re

import pytest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
WORKFLOW = os.path.join(REPO_ROOT, ".github", "workflows", "weekly-full-update.yml")
PREPARE = os.path.join(REPO_ROOT, "backend", "core", "prepare_card_data.py")

# Some entries are legitimately one-sided. Whitelist them here with
# the reason so the test passes and the asymmetry is documented.
ALLOWED_SEED_ONLY = {
    # Card-database tables produced by all_cards_scraper /
    # cardmarket_price_merger. They write directly to backend/core/data/
    # (the SOURCE of truth for these) — sync_scraper_data does not need
    # to copy them back because they're not regenerated frontend-side.
    "all_cards_database.csv": "produced backend-side; no frontend writer",
    "japanese_cards_database.csv": "produced backend-side; no frontend writer",
    "cardmarket_id_mapping.csv": "produced backend-side; no frontend writer",
    "price_data.csv": "produced backend-side; no frontend writer",
    # Frontend-derived but not part of the SYNC pipeline (different code path)
    "pokemon_card_text.json": "card-effects scraper writes directly to data/",
    "archetype_icons.json": "icon mapper writes directly to data/",
    "tournament_cards_manifest.json": "split_tournament_cards regenerates this on every run",
}
ALLOWED_SYNC_ONLY = {
    # HTML reports — produced by scrapers, not seeded back because they
    # are read-only artifacts that get fully regenerated each run.
    "limitless_online_decks.html": "HTML report — regenerated each run",
    "limitless_online_decks_comparison.html": "HTML report — regenerated each run",
    "limitless_online_decks_comparison_local.html": "HTML report — regenerated each run",
    # Merged card master — prepare_card_data.create_merged_database()
    # rewrites these whole each run from the EN + JP card DBs (which
    # ARE seeded). No historical-row preservation: a fresh merge
    # makes a fresh file, so seeding the prior copy would be wasted
    # I/O. Consumed by js/app-core.js (chunk-load fallback) and the
    # service-worker offline manifest (data/offline-manifest.json).
    "all_cards_merged.json": "regenerated whole each run from seeded EN+JP DBs",
    "all_cards_merged.csv":  "regenerated whole each run from seeded EN+JP DBs",
}


def _parse_workflow_seed():
    """Pull the file list out of the `for f in ... ; do` block in the
    'Seed backend/core/data/ from data/' step."""
    with open(WORKFLOW) as f:
        lines = f.readlines()
    in_block = False
    seed = set()
    for line in lines:
        s = line.strip()
        if s.startswith("for f in"):
            in_block = True
            continue
        if in_block and s.startswith(";"):
            break
        if in_block:
            cleaned = s.rstrip("\\").strip()
            if cleaned and not cleaned.startswith("#"):
                seed.add(cleaned)
    return seed


def _parse_sync_patterns():
    """Pull the SYNC_PATTERNS list literal out of prepare_card_data.py.
    Strips Python-style # comments from each line before pulling the
    quoted strings so comment text like 'Past Meta' doesn't get
    mistaken for a file name."""
    with open(PREPARE) as f:
        src = f.read()
    m = re.search(r"SYNC_PATTERNS\s*=\s*\[(.+?)\n\]", src, re.MULTILINE | re.DOTALL)
    if not m:
        pytest.fail("SYNC_PATTERNS not found in backend/core/prepare_card_data.py")
    files = set()
    for line in m.group(1).split("\n"):
        # Drop everything after the first # — Python comments inside
        # the list. Quoted '#' inside a string would be a false match
        # here, but no filename in the project legitimately contains #.
        code = line.split("#", 1)[0]
        files.update(re.findall(r'"([^"]+)"', code))
    return files


def test_seed_and_sync_patterns_are_in_sync():
    seed = _parse_workflow_seed()
    sync = _parse_sync_patterns()
    seed_only = (seed - sync) - set(ALLOWED_SEED_ONLY)
    sync_only = (sync - seed) - set(ALLOWED_SYNC_ONLY)

    msg = []
    if seed_only:
        msg.append(
            "In the workflow seed list but not in SYNC_PATTERNS — the file "
            "lands in backend/core/data/ each run but never gets written back "
            "to data/, so frontend reads stale content:\n"
            + "\n".join(f"  • {f}" for f in sorted(seed_only))
        )
    if sync_only:
        msg.append(
            "In SYNC_PATTERNS but not in the workflow seed — sync expects to "
            "write the file back but the scraper started from an empty input, "
            "which can drop history (Prague 1-row regression pattern):\n"
            + "\n".join(f"  • {f}" for f in sorted(sync_only))
        )
    if msg:
        msg.append(
            "\nResolution: either add the file to the OTHER list (weekly-full-update.yml's "
            "seed block or prepare_card_data.SYNC_PATTERNS) so both sides know about it, "
            "or document the asymmetry by adding it to ALLOWED_SEED_ONLY / ALLOWED_SYNC_ONLY "
            "in tests/python/test_sync_patterns_consistency.py with a brief reason."
        )
        pytest.fail("\n\n".join(msg))
