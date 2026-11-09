"""Tage seit dem Erscheinen des laufenden Sets, plus ein Tag Rand (SC-49).

Fuer den Formatwechsel im Wochenlauf: der Limitless-API-Lauf soll alle
Online-Turniere des neuen Formats holen, also mindestens seit dem
Erscheinungstag (`set_release_date` in data/format_window.json). Gibt
mindestens 3 aus (die Vorgabe des taeglichen Laufs) und hoechstens 60.
"""
import json
import sys
from datetime import date


def tage(format_window: dict, heute: date) -> int:
    try:
        release = date.fromisoformat(str(format_window.get("set_release_date", ""))[:10])
    except ValueError:
        return 14
    return max(3, min(60, (heute - release).days + 1))


if __name__ == "__main__":
    pfad = sys.argv[1] if len(sys.argv) > 1 else "data/format_window.json"
    with open(pfad, encoding="utf-8") as f:
        print(tage(json.load(f), date.today()))
