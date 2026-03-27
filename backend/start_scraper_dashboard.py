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
    "1": "core/update_sets.py",
    "2": "scrapers/all_cards_scraper.py",
    "3": "scrapers/japanese_cards_scraper.py",
    "4": "scrapers/card_price_scraper.py",
    "5": "scrapers/current_meta_analysis_scraper.py",
    "6": "scrapers/limitless_online_scraper.py",
    "7": "scrapers/city_league_analysis_scraper.py",
    "8": "scrapers/city_league_archetype_scraper.py",
    "9": "scrapers/tournament_scraper_JH.py",
    "10": "core/prepare_card_data.py"
}

BATCH_BASE = ["1", "2", "3", "4", "10"]
BATCH_META = ["5", "6", "7", "8", "9", "10"]
BATCH_FULL = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]

def resolve_script_path(script_filename: str) -> str:
    backend_root = os.path.abspath(os.path.dirname(__file__))
    project_root = os.path.abspath(os.path.dirname(backend_root))

    direct_path = os.path.abspath(script_filename)
    if os.path.exists(direct_path):
        return direct_path

    backend_relative_path = os.path.join(backend_root, script_filename)
    if os.path.exists(backend_relative_path):
        return backend_relative_path

    project_relative_path = os.path.join(project_root, script_filename)
    if os.path.exists(project_relative_path):
        return project_relative_path

    basename_project_path = os.path.join(project_root, os.path.basename(script_filename))
    if os.path.exists(basename_project_path):
        return basename_project_path

    return backend_relative_path

def run_script(script_filename: str, wait_at_end: bool = True) -> None:
    script_path = resolve_script_path(script_filename)
    if not os.path.exists(script_path):
        print(f"\n  [ERROR] Script not found: {script_filename}")
        time.sleep(2)
        return

    print(f"\n  Launching {script_filename} ...\n")
    project_root = os.path.dirname(os.path.dirname(__file__))
    env = os.environ.copy()
    env["PYTHONPATH"] = project_root
    subprocess.run([sys.executable, script_path], check=False, cwd=project_root, env=env)
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

