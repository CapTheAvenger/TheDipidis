#!/usr/bin/env python3
"""
Pipeline Orchestrator for TheDipidis scrapers.

Run order (dependency-aware):
  Stage 1 – Independent data sources (run in parallel):
    - city_league_archetype_scraper   → city_league_archetypes.csv
    - labs_tournament_scraper         → labs_tournament_decks.csv / labs_tournaments.json
    - online_tournament_scraper       → online_tournament_top8_decks.csv (Meta Call Predictor 2.0)

  Stage 2 – Depends on Stage 1 outputs:
    - city_league_analysis_scraper    → reads city_league_archetypes.csv
    - current_meta_analysis_scraper   → reads labs / online data
    - limitless_online_scraper        → standalone, but grouped here

  Stage 3 – Enrichment (run after Stage 2, sequential — both touch price_data.csv):
    - card_price_scraper              → Limitless-fallback for unmapped cards
    - cardmarket_price_merger         → primary price source (reads data/price_guide_6.json + mapping)
    - generate_tooltips               → reads card data from Stage 2

Usage:
    python run_pipeline.py                 # full pipeline
    python run_pipeline.py --stage 1       # only Stage 1
    python run_pipeline.py --stage 2       # only Stage 2
    python run_pipeline.py --stage 3       # only Stage 3
    python run_pipeline.py --scraper city_league_archetype_scraper
"""

import argparse
import logging
import os
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

SCRAPER_DIR = Path(__file__).parent
DATA_DIR = SCRAPER_DIR.parent / "data"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [pipeline] %(levelname)s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("pipeline")

# ---------------------------------------------------------------------------
# Stage definitions
# ---------------------------------------------------------------------------
STAGES = {
    1: [
        "city_league_archetype_scraper",
        "labs_tournament_scraper",
        "online_tournament_scraper",
    ],
    2: [
        "city_league_analysis_scraper",
        "current_meta_analysis_scraper",
        "limitless_online_scraper",
    ],
    3: [
        "card_price_scraper",
        "cardmarket_price_merger",
        "generate_tooltips",
    ],
}

# Stages where order matters (no parallel execution within the stage).
SEQUENTIAL_STAGES = {3}

# Validation: check that these output files exist after each stage
STAGE_OUTPUTS = {
    1: [
        "city_league_archetypes.csv",
    ],
    2: [
        "limitless_meta_stats.json",
    ],
    3: [],
}


def run_scraper(name: str) -> tuple[str, bool, float]:
    script = SCRAPER_DIR / f"{name}.py"
    if not script.exists():
        logger.warning("  [%s] Skipped – script not found.", name)
        return name, True, 0.0

    logger.info("  → Starting %s ...", name)
    t0 = time.time()
    result = subprocess.run(
        [sys.executable, str(script)],
        cwd=str(SCRAPER_DIR),
        capture_output=True,
        text=True,
    )
    elapsed = time.time() - t0

    if result.returncode != 0:
        logger.error("  [%s] FAILED (%.1fs)\n%s", name, elapsed, result.stderr[-2000:])
        return name, False, elapsed

    logger.info("  [%s] OK (%.1fs)", name, elapsed)
    return name, True, elapsed


def validate_stage_outputs(stage: int) -> bool:
    missing = []
    for fname in STAGE_OUTPUTS.get(stage, []):
        path = DATA_DIR / fname
        if not path.exists():
            missing.append(str(path))
    if missing:
        logger.error("Stage %d validation FAILED – missing outputs:\n  %s", stage, "\n  ".join(missing))
        return False
    return True


def run_stage(stage_num: int, parallel: bool = True) -> bool:
    scrapers = STAGES.get(stage_num, [])
    if not scrapers:
        return True

    if stage_num in SEQUENTIAL_STAGES:
        parallel = False

    logger.info("=" * 60)
    logger.info("STAGE %d  (%s)", stage_num, "parallel" if parallel else "sequential")
    logger.info("=" * 60)

    results = {}
    if parallel and len(scrapers) > 1:
        with ThreadPoolExecutor(max_workers=len(scrapers)) as pool:
            futures = {pool.submit(run_scraper, s): s for s in scrapers}
            for future in as_completed(futures):
                name, ok, elapsed = future.result()
                results[name] = ok
    else:
        for s in scrapers:
            name, ok, elapsed = run_scraper(s)
            results[name] = ok

    failed = [n for n, ok in results.items() if not ok]
    if failed:
        logger.error("Stage %d: %d scraper(s) failed: %s", stage_num, len(failed), ", ".join(failed))
        return False

    if not validate_stage_outputs(stage_num):
        return False

    logger.info("Stage %d complete.\n", stage_num)
    return True


def main():
    parser = argparse.ArgumentParser(description="TheDipidis scraper pipeline")
    parser.add_argument("--stage", type=int, choices=[1, 2, 3], help="Run only this stage")
    parser.add_argument("--scraper", help="Run a single scraper by name")
    parser.add_argument("--sequential", action="store_true", help="Disable parallel execution within stages")
    args = parser.parse_args()

    if args.scraper:
        name, ok, _ = run_scraper(args.scraper)
        sys.exit(0 if ok else 1)

    stages_to_run = [args.stage] if args.stage else [1, 2, 3]
    parallel = not args.sequential

    t_total = time.time()
    for stage_num in stages_to_run:
        ok = run_stage(stage_num, parallel=parallel)
        if not ok:
            logger.error("Pipeline aborted at stage %d.", stage_num)
            sys.exit(1)

    logger.info("Pipeline finished in %.1fs.", time.time() - t_total)


if __name__ == "__main__":
    main()
