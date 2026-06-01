#!/usr/bin/env python3
"""
Hausi's Pokemon TCG Analysis - Scraper Dashboard
Launch any scraper from an interactive menu in the logical execution order.
"""

import os
import sys
import subprocess
import time
import urllib.error
import urllib.request

def clear_screen() -> None:
    os.system("cls" if os.name == "nt" else "clear")

def print_menu() -> None:
    print("=" * 52)
    print("  Hausi's Pokemon TCG Analysis – Dashboard")
    print("=" * 52)
    print("  --- BASE DATA (Fundament) ---")
    print("  [1]  Update Sets (sets.json)")
    print("  [2]  All Cards Scraper (EN/DE)")
    print("  [3]  Japanese Cards Scraper")
    print("  [4]  Card Price Scraper (Limitless – Fallback fuer unmapped)")
    print("  [14] Cardmarket Price Merger (taeglich, primaere Preisquelle)")
    print("  [15] Cardmarket ID Mapper (einmalig / bei neuen Sets)")
    print("  [CM] Cardmarket JSONs jetzt frisch laden (force refresh)")
    print("  --- META & TOURNAMENTS ---")
    print("  [5]  Current Meta Analysis (Play! & Live)")
    print("  [6]  Limitless Online Scraper (Trends)")
    print("  [7]  City League Analysis (Deep Dive JP)")
    print("  [8]  City League Archetypes (Trends JP)")
    print("  [7p] City League Analysis PAST (rotated-out meta)")
    print("  [8p] City League Archetypes PAST (rotated-out meta)")
    print("  [9]  Historical Meta Scraper (JH)")
    print("  [10] Labs Major Tournament Scraper")
    print("  [13] Online Tournament Top-8 Scraper (Predictor 2.0)")
    print("  --- CARD INTEL (texts / effects for Consistency Builder) ---")
    print("  [16] Card Effects Scraper (attack/ability text from Limitless)")
    print("  [17] Threat-Intel Builder (active_threats.json for tech audit)")
    print("       (Note: per-tournament dated CSV is produced by [5] now)")
    print("  --- FRONTEND ---")
    print("  [11] Prepare Frontend Data (Merge)")
    print("  [12] Archetype Icons (Pokemon-Bilder Mapping)")
    print("-" * 52)
    print("  --- BATCH SHORTCUTS ---")
    print("  [B]  Base Data Update (1, 2, 3, 4, 14, 11)")
    print("  [M]  Meta Update / Dienstags-Update (5-10, 13, 14, 17, 11, 12)")
    print("  [F]  Full System Update (1, 2, 15, 3-10, 13, 14, 16, 17, 11, 12)")
    print("  [0]  Exit")
    print("=" * 52)

SCRIPTS = {
    "1": os.path.join("core", "update_sets.py"),
    "2": os.path.join("scrapers", "all_cards_scraper.py"),
    "3": os.path.join("scrapers", "japanese_cards_scraper.py"),
    "5": os.path.join("scrapers", "current_meta_analysis_scraper.py"),
    "6": os.path.join("scrapers", "limitless_online_scraper.py"),
    "7": os.path.join("scrapers", "city_league_analysis_scraper.py"),
    "8": os.path.join("scrapers", "city_league_archetype_scraper.py"),
    "7p": os.path.join("scrapers", "city_league_past_analysis_scraper.py"),
    "8p": os.path.join("scrapers", "city_league_past_archetype_scraper.py"),
    "9": os.path.join("scrapers", "tournament_scraper_JH.py"),
    "10": os.path.join("scrapers", "labs_tournament_scraper.py"),
    "11": os.path.join("core", "prepare_card_data.py"),
    "12": os.path.join("scrapers", "archetype_icons_scraper.py"),
    "13": os.path.join("scrapers", "online_tournament_scraper.py"),
    "14": os.path.join("scrapers", "cardmarket_price_merger.py"),
    "15": os.path.join("scrapers", "cardmarket_id_mapper.py"),
    "16": os.path.join("scrapers", "pokemon_card_effects_scraper.py"),
    "17": os.path.join("tools",    "build_threat_intel.py"),
    # [18] (online_tournament_dated_scraper.py) removed: its output —
    # data/online_tournament_dated_cards.csv — is now produced as a
    # second output of [5] current_meta_analysis_scraper.py, since both
    # scripts crawled the exact same per-archetype /decks/<slug> URLs.
}

# CLI args appended per task. Keys map to the same task IDs as SCRIPTS;
# missing keys mean "run with no args". Kept narrow on purpose — every
# entry here is a deliberate departure from the script's own default.
TASK_CLI_ARGS = {
    # [10] Labs Major Tournament Scraper — match the weekly workflow's
    # invocation so local dashboard runs surface the same matchup data
    # the weekly job produces. --matchups pulls the per-archetype
    # matrix; --matchup-days overall day2 feeds Meta Call's Day-2
    # preference path (getBaseMatchup picks Day-2 over Overall when a
    # pair has ≥5 Day-2 games). Skip-if-already-scraped logic in the
    # scraper keeps closed metas frozen, so only the current meta gets
    # both filters re-fetched on every run.
    "10": ["--matchups", "--matchup-days", "overall", "day2"],
}

TASK_NAMES = {
    "1": "Update Sets",
    "2": "All Cards Scraper",
    "3": "Japanese Cards Scraper",
    "4": "Card Price Scraper",
    "5": "Current Meta Analysis",
    "6": "Limitless Online Scraper",
    "7": "City League Analysis",
    "8": "City League Archetypes",
    "7p": "City League Analysis PAST (rotated-out meta)",
    "8p": "City League Archetypes PAST (rotated-out meta)",
    "9": "Historical Meta Scraper",
    "10": "Labs Major Tournament Scraper",
    "11": "Prepare Frontend Data",
    "12": "Archetype Icons Scraper",
    "13": "Online Tournament Top-8 Scraper",
    "14": "Cardmarket Price Merger",
    "15": "Cardmarket ID Mapper",
    "16": "Card Effects Scraper (attack/ability text from Limitless)",
    "17": "Threat-Intel Builder (active_threats.json for tech audit)",
}

BATCH_BASE = ["1", "2", "3", "4", "14", "11"]
# 17 (threat-intel) depends on 5+6 (current meta + online decks) plus the
# rotation-stable 16 effects file; both meta inputs are refreshed by
# BATCH_META so 17 runs there too.  Dated-tournament rows that feed the
# deck-builder's time-decay scoring are now produced by [5] itself
# (single crawl, dual output), so they no longer need a dedicated
# script.  16 (effects) is heavy (~20 k card pages) and only needs to
# re-run on rotation — kept out of META, only in FULL.
BATCH_META = ["5", "6", "7", "8", "7p", "8p", "9", "10", "13", "14", "17", "11", "12"]
# 16 / 17 included so local FULL refreshes the same intel files the
# CI weekly-update produces.  Order matters: 16 (effects) must run
# BEFORE 17 (threat-intel reads pokemon_card_effects.json), and 11
# must come last so prepare_card_data picks up everything written above.
BATCH_FULL = ["1", "2", "15", "3", "4", "5", "6", "7", "8", "7p", "8p", "9", "10", "13", "14", "16", "17", "11", "12"]

def git_commit_push(description: str) -> None:
    """Bump version, stage all changes, commit, and push to origin main."""
    project_root = os.path.dirname(os.path.dirname(__file__))

    # 1) Bump version via PowerShell script
    bump_script = os.path.join(project_root, "bump-version.ps1")
    if os.path.isfile(bump_script):
        print("\n  Version bump ...")
        subprocess.run(
            ["powershell", "-ExecutionPolicy", "Bypass", "-File", bump_script],
            cwd=project_root, check=False,
        )

    # 2) git add -A
    print("  Git: Staging changes ...")
    r = subprocess.run(["git", "add", "-A"], cwd=project_root,
                        capture_output=True, text=True)
    if r.returncode != 0:
        print(f"  [GIT ERROR] git add: {r.stderr.strip()}")
        return

    # 3) Check if there's anything to commit
    r = subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=project_root)
    if r.returncode == 0:
        print("  Git: Keine Aenderungen zum Committen.")
        return

    # 4) git commit
    msg = f"Auto: {description}"
    r = subprocess.run(["git", "commit", "-m", msg], cwd=project_root,
                        capture_output=True, text=True)
    if r.returncode != 0:
        print(f"  [GIT ERROR] git commit: {r.stderr.strip()}")
        return
    print(f"  Git: Committed - {msg}")

    # 5) git push — push the current branch, not hard-coded "main"
    # (the user may run a batch from a feature branch, in which case
    # pushing "main" would silently no-op and the batch's auto-commit
    # would never reach the remote).
    r = subprocess.run(["git", "rev-parse", "--abbrev-ref", "HEAD"],
                        cwd=project_root, capture_output=True, text=True)
    current_branch = (r.stdout or "").strip() or "main"
    print(f"  Git: Pushing to origin/{current_branch} ...")
    r = subprocess.run(["git", "push", "origin", current_branch],
                        cwd=project_root, capture_output=True, text=True)
    if r.returncode != 0:
        print(f"  [GIT ERROR] git push: {r.stderr.strip()}")
        return
    print("  Git: Push erfolgreich!")

# ─────────────────────────────────────────────────────────────────────
# Cardmarket public-S3 JSON sync
#
# The Cardmarket scrapers (cardmarket_id_mapper [15], cardmarket_price_
# merger [14]) READ these three files from data/ but don't fetch them.
# In CI they're freshly pulled by a curl step in
# .github/workflows/weekly-full-update.yml; locally that step doesn't
# exist, so a manual dashboard run would silently use stale (or
# missing) JSONs. This helper mirrors the CI step inside the dashboard.
#
# Idempotent: files that are present + younger than 24 h are skipped.
# That keeps repeated dashboard runs from hammering Cardmarket while
# still guaranteeing a freshly-downloaded snapshot on each truly-new
# scrape session.
# ─────────────────────────────────────────────────────────────────────
CARDMARKET_JSONS = {
    'products_singles_6.json':    'https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_6.json',
    'products_nonsingles_6.json': 'https://downloads.s3.cardmarket.com/productCatalog/productList/products_nonsingles_6.json',
    'price_guide_6.json':         'https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json',
}
CARDMARKET_STALE_AFTER_SECONDS = 24 * 3600  # 1 day

# Scripts that depend on a fresh data/products_*_6.json + price_guide_6.json
# state. Listed explicitly (not by substring match) so the contract is
# obvious to future readers — the pre-fetch only fires for these two:
#
#   cardmarket_id_mapper.py
#     [15] Reads products_singles_6.json + products_nonsingles_6.json
#     to derive the set-name → idExpansion mapping that lands in
#     cardmarket_id_mapping.csv. Sanity-checks against price_guide_6.json
#     for coverage.
#
#   cardmarket_price_merger.py
#     [14] Reads price_guide_6.json as the primary price source and
#     merges it with the id mapping into the final price data CSV.
CARDMARKET_DEPENDENT_SCRIPTS = frozenset({
    'cardmarket_id_mapper.py',
    'cardmarket_price_merger.py',
})


def _data_dir() -> str:
    """Resolve <project_root>/data/. The dashboard lives in backend/,
    so the project root is one level up."""
    backend_dir = os.path.dirname(__file__)
    return os.path.join(os.path.dirname(backend_dir), 'data')


def download_cardmarket_jsons_if_stale(force: bool = False) -> bool:
    """Pull the three Cardmarket public-S3 JSON dumps into data/ when
    they're missing or older than CARDMARKET_STALE_AFTER_SECONDS.

    Mirrors the 'Download Cardmarket JSONs' step in
    .github/workflows/weekly-full-update.yml so a local dashboard run
    ends up with the same data state as a CI weekly-update. Atomic per
    file (writes to .tmp then os.replace) so a mid-download interrupt
    leaves the previous good file in place.

    Returns True iff at least one file was (re)downloaded.
    """
    data_dir = _data_dir()
    os.makedirs(data_dir, exist_ok=True)
    now = time.time()
    downloaded_any = False

    for filename, url in CARDMARKET_JSONS.items():
        target = os.path.join(data_dir, filename)
        present = os.path.isfile(target)
        age_secs = (now - os.path.getmtime(target)) if present else float('inf')
        stale = age_secs > CARDMARKET_STALE_AFTER_SECONDS
        if present and not stale and not force:
            print(f"  [skip] {filename} present + fresh (age {age_secs / 3600:.1f}h)")
            continue

        reason = 'forced' if force else ('missing' if not present else 'stale')
        print(f"  [pull] {filename}  ({reason})  <- cardmarket.com S3")

        tmp = target + '.tmp'
        try:
            with urllib.request.urlopen(url, timeout=60) as resp:
                with open(tmp, 'wb') as out:
                    while True:
                        chunk = resp.read(64 * 1024)
                        if not chunk:
                            break
                        out.write(chunk)
            os.replace(tmp, target)
            size_mb = os.path.getsize(target) / (1024 * 1024)
            print(f"         -> {target}  ({size_mb:.1f} MB)")
            downloaded_any = True
        except (urllib.error.URLError, urllib.error.HTTPError, OSError, TimeoutError) as e:
            print(f"         FAILED ({e}); leaving previous file in place — scraper may use stale data")
            try:
                if os.path.isfile(tmp):
                    os.remove(tmp)
            except OSError:
                pass

    return downloaded_any


def run_script(script_filename: str, wait_at_end: bool = True,
               extra_args: list = None) -> None:
    # Cardmarket-dependent scrapers ([4], [14], [15]) consume the three
    # public-S3 JSONs in data/ but don't download them. Mirror the CI
    # weekly-update curl step here so local runs see the same fresh
    # data state. The 24h-idempotency in the helper means back-to-back
    # cardmarket-dependent runs in a batch share one download.
    if os.path.basename(script_filename) in CARDMARKET_DEPENDENT_SCRIPTS:
        print("\n  [Cardmarket pre-fetch] Ensuring data/products_*_6.json + price_guide_6.json are fresh...")
        download_cardmarket_jsons_if_stale()

    backend_dir = os.path.dirname(__file__)
    script_path = os.path.join(backend_dir, script_filename)
    if not os.path.exists(script_path):
        print(f"\n  [ERROR] Script not found: {script_filename}")
        time.sleep(2)
        return

    # Prefer venv Python so that pip-installed packages (seleniumbase etc.) are available
    project_root = os.path.dirname(backend_dir)
    # Check both "venv" and ".venv" folder names
    venv_python = os.path.join(project_root, "venv", "Scripts", "python.exe")
    if not os.path.isfile(venv_python):
        venv_python = os.path.join(project_root, ".venv", "Scripts", "python.exe")
    if not os.path.isfile(venv_python):
        venv_python = os.path.join(project_root, "venv", "bin", "python")
    if not os.path.isfile(venv_python):
        venv_python = os.path.join(project_root, ".venv", "bin", "python")
    python_exe = venv_python if os.path.isfile(venv_python) else sys.executable

    # Ensure backend/core/ is on PYTHONPATH so scrapers can import card_scraper_shared
    env = os.environ.copy()
    core_dir = os.path.join(backend_dir, "core")
    existing = env.get("PYTHONPATH", "")
    env["PYTHONPATH"] = core_dir + (os.pathsep + existing if existing else "")

    cmd = [python_exe, script_path]
    if extra_args:
        cmd.extend(extra_args)
        print(f"\n  Launching {script_filename} {' '.join(extra_args)} ...\n")
    else:
        print(f"\n  Launching {script_filename} ...\n")
    subprocess.run(cmd, env=env, check=False)
    print(f"\n  {script_filename} finished.")
    if wait_at_end:
        input("\n  Press Enter to return to menu...")

def run_batch(batch_list: list, batch_name: str) -> None:
    print("\n" + "=" * 52)
    print(f"  STARTE BATCH: {batch_name}")
    print("  Lehne dich zurueck, die Skripte laufen nacheinander.")
    print(f"  ({len(batch_list)} Skripte werden ausgefuehrt)")
    # FULL kann ueber 1h dauern — sag das vorher, damit niemand den
    # Tab schliesst bevor der dated-scraper durch ist und denkt das
    # Ergebnis sei vollstaendig (frueher Praezedenzfall: nur Dragapult
    # Ex hatte Rows in der CSV, weil der Run vorher abgebrochen wurde).
    if batch_name.upper().startswith("FULL"):
        print("  HINWEIS: Full Update kann 60-120 Minuten dauern.")
        print("           Lass das Fenster offen bis 'BATCH KOMPLETT'.")
    print("=" * 52)

    batch_started = time.monotonic()
    for key in batch_list:
        script = SCRIPTS[key]
        run_script(script, wait_at_end=False, extra_args=TASK_CLI_ARGS.get(key))
        if key != batch_list[-1]:
            print("\n  Warte 3 Sekunden vor dem naechsten Skript ...")
            time.sleep(3)

    elapsed = time.monotonic() - batch_started
    print("\n" + "=" * 52)
    print(f"  BATCH '{batch_name}' KOMPLETT ABGESCHLOSSEN!")
    print(f"  Dauer: {int(elapsed // 60)} min {int(elapsed % 60)} s")
    print("  Das Frontend ist jetzt auf dem neuesten Stand.")
    print("=" * 52)
    git_commit_push(f"Batch {batch_name}")
    input("\n  Press Enter to return to menu...")

def main() -> None:
    while True:
        clear_screen()
        print_menu()
        choice = input("\n  Your choice: ").strip().lower()

        if choice == "0":
            print("\n  Goodbye!\n")
            break
        elif choice in SCRIPTS:
            run_script(SCRIPTS[choice], extra_args=TASK_CLI_ARGS.get(choice))
            git_commit_push(TASK_NAMES.get(choice, f"Task {choice}"))
        elif choice == "b":
            run_batch(BATCH_BASE, "BASE DATA UPDATE")
        elif choice == "m":
            run_batch(BATCH_META, "META UPDATE")
        elif choice == "f":
            run_batch(BATCH_FULL, "FULL SYSTEM UPDATE")
        elif choice == "cm":
            print("\n  [Cardmarket] Manual force-refresh of all 3 public-S3 JSONs:")
            download_cardmarket_jsons_if_stale(force=True)
            input("\n  Press Enter to return to menu...")
        else:
            print("\n  Invalid choice. Please try again.")
            time.sleep(1)

if __name__ == "__main__":
    main()

