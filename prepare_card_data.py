#!/usr/bin/env python3
"""
prepare_card_data.py (Shim)

This is a compatibility shim for the new location of prepare_card_data.py.
It simply imports and runs the main function from backend.core.prepare_card_data.
"""
import sys
import os

# Ensure backend/core is in sys.path
script_dir = os.path.dirname(os.path.abspath(__file__))
core_dir = os.path.join(script_dir, 'backend', 'core')
if core_dir not in sys.path:
    sys.path.insert(0, core_dir)

from backend.core.prepare_card_data import create_merged_database

if __name__ == "__main__":
    try:
        create_merged_database()
    except Exception as exc:
        print(f"Fehler: {exc}")
        sys.exit(1)
