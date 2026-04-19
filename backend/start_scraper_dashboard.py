#!/usr/bin/env python3
"""
Hausi's Pokemon TCG Analysis - Scraper Dashboard
Launch any scraper from an interactive menu in the logical execution order.
"""

import os
import sys
import subprocess
import time

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
    print("  [4]  Card Price Scraper")
    print("  --- META & TOURNAMENTS ---")
    print("  [5]  Current Meta Analysis (Play! & Live)")
    print("  [6]  Limitless Online Scraper (Trends)")
    print("  [7]  City League Analysis (Deep Dive JP)")
    print("  [8]  City League Archetypes (Trends JP)")
    print("  [9]  Historical Meta Scraper (JH)")
    print("  --- FRONTEND ---")
    print("  [10] Prepare Frontend Data (Merge)")
    print("-" * 52)
    print("  --- BATCH SHORTCUTS ---")
    print("  [B]  Base Data Update (1, 2, 3, 4 + 10)")
    print("  [M]  Meta Update / Dienstags-Update (5 bis 10)")
    print("  [F]  Full System Update (1 bis 10)")
    print("  [0]  Exit")
    print("=" * 52)

SCRIPTS = {
    "1": os.path.join("core", "update_sets.py"),
    "2": os.path.join("scrapers", "all_cards_scraper.py"),
    "3": os.path.join("scrapers", "japanese_cards_scraper.py"),
    "4": os.path.join("scrapers", "card_price_scraper.py"),
    "5": os.path.join("scrapers", "current_meta_analysis_scraper.py"),
    "6": os.path.join("scrapers", "limitless_online_scraper.py"),
    "7": os.path.join("scrapers", "city_league_analysis_scraper.py"),
    "8": os.path.join("scrapers", "city_league_archetype_scraper.py"),
    "9": os.path.join("scrapers", "tournament_scraper_JH.py"),
    "10": os.path.join("core", "prepare_card_data.py")
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
    "9": "Historical Meta Scraper",
    "10": "Prepare Frontend Data",
}

BATCH_BASE = ["1", "2", "3", "4", "10"]
BATCH_META = ["5", "6", "7", "8", "9", "10"]
BATCH_FULL = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]

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

    # 5) git push
    print("  Git: Pushing to origin/main ...")
    r = subprocess.run(["git", "push", "origin", "main"], cwd=project_root,
                        capture_output=True, text=True)
    if r.returncode != 0:
        print(f"  [GIT ERROR] git push: {r.stderr.strip()}")
        return
    print("  Git: Push erfolgreich!")

def run_script(script_filename: str, wait_at_end: bool = True) -> None:
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

    print(f"\n  Launching {script_filename} ...\n")
    subprocess.run([python_exe, script_path], env=env, check=False)
    print(f"\n  {script_filename} finished.")
    if wait_at_end:
        input("\n  Press Enter to return to menu...")

def run_batch(batch_list: list, batch_name: str) -> None:
    print("\n" + "=" * 52)
    print(f"  STARTE BATCH: {batch_name}")
    print("  Lehne dich zurueck, die Skripte laufen nacheinander.")
    print("=" * 52)

    for key in batch_list:
        script = SCRIPTS[key]
        run_script(script, wait_at_end=False)
        if key != batch_list[-1]:
            print("\n  Warte 3 Sekunden vor dem naechsten Skript ...")
            time.sleep(3)

    print("\n" + "=" * 52)
    print(f"  BATCH '{batch_name}' KOMPLETT ABGESCHLOSSEN!")
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
            run_script(SCRIPTS[choice])
            git_commit_push(TASK_NAMES.get(choice, f"Task {choice}"))
        elif choice == "b":
            run_batch(BATCH_BASE, "BASE DATA UPDATE")
        elif choice == "m":
            run_batch(BATCH_META, "META UPDATE")
        elif choice == "f":
            run_batch(BATCH_FULL, "FULL SYSTEM UPDATE")
        else:
            print("\n  Invalid choice. Please try again.")
            time.sleep(1)

if __name__ == "__main__":
    main()

