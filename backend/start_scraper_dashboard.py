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

BATCH_BASE = ["1", "2", "3", "4", "10"]
BATCH_META = ["5", "6", "7", "8", "9", "10"]
BATCH_FULL = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]

def run_script(script_filename: str, wait_at_end: bool = True) -> None:
    backend_dir = os.path.dirname(__file__)
    script_path = os.path.join(backend_dir, script_filename)
    if not os.path.exists(script_path):
        print(f"\n  [ERROR] Script not found: {script_filename}")
        time.sleep(2)
        return

    # Prefer .venv Python so that pip-installed packages (seleniumbase etc.) are available
    project_root = os.path.dirname(backend_dir)
    venv_python = os.path.join(project_root, ".venv", "Scripts", "python.exe")
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

