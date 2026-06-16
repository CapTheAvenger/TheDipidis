"""Tests for current_meta_analysis_scraper: the per-meta merge and the
Meta Play! raw-deck cache.

Both metas are complete snapshots each run (Meta Live = full ladder, Meta
Play! = full aggregate recomputed from the cumulative deck cache), so any
meta present in the new rows replaces its prior rows wholesale, and a meta
that's absent keeps its last good rows.
"""

import csv
import json
import os
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_REPO_ROOT / "backend" / "core"))
sys.path.insert(0, str(_REPO_ROOT / "backend" / "scrapers"))

import current_meta_analysis_scraper as cma  # noqa: E402

HEADER = ["archetype", "card_name", "total_decks_in_archetype",
          "percentage_in_archetype", "meta"]
OUT = "current_meta_card_data.csv"


def _write_csv(path, rows):
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=HEADER, delimiter=";")
        w.writeheader()
        for r in rows:
            w.writerow(r)


def _row(arch, card, denom, pct, meta):
    return {"archetype": arch, "card_name": card,
            "total_decks_in_archetype": denom,
            "percentage_in_archetype": pct, "meta": meta}


# ── per-meta merge ───────────────────────────────────────────────────────────
def test_meta_live_full_replace(tmp_path, monkeypatch):
    monkeypatch.setattr(cma, "get_data_dir", lambda: str(tmp_path))
    _write_csv(os.path.join(str(tmp_path), OUT), [
        _row("Dragapult", "Drifloon", "19", "5,0", "Meta Live"),
        _row("Dragapult", "OldTech", "19", "5,0", "Meta Live"),  # leaves the ladder
    ])
    new = [_row("Dragapult", "Drifloon", "20", "4,8", "Meta Live")]
    merged = cma._merge_current_meta_rows(new, OUT)
    live = [r for r in merged if r["meta"] == "Meta Live"]
    assert len(live) == 1                                  # stale rows dropped
    assert live[0]["total_decks_in_archetype"] == "20"     # fresh denominator
    assert all(r["card_name"] != "OldTech" for r in live)


def test_meta_play_full_replace(tmp_path, monkeypatch):
    # Meta Play! is now a full recompute from the cache → prior rows replaced.
    monkeypatch.setattr(cma, "get_data_dir", lambda: str(tmp_path))
    _write_csv(os.path.join(str(tmp_path), OUT), [
        _row("Gardevoir", "Kirlia", "66", "9,0", "Meta Play!"),
        _row("Charizard", "Charmander", "66", "9,0", "Meta Play!"),
    ])
    new = [_row("Gardevoir", "Kirlia", "103", "8,0", "Meta Play!")]  # full recompute
    merged = cma._merge_current_meta_rows(new, OUT)
    play = [r for r in merged if r["meta"] == "Meta Play!"]
    assert len(play) == 1                                   # old rows wholesale-replaced
    assert play[0]["total_decks_in_archetype"] == "103"     # consistent denominator


def test_meta_absent_is_preserved(tmp_path, monkeypatch):
    # New run has only Meta Live → Meta Play! kept untouched (no wipe, no
    # cross-meta collision even on the same archetype+card).
    monkeypatch.setattr(cma, "get_data_dir", lambda: str(tmp_path))
    _write_csv(os.path.join(str(tmp_path), OUT), [
        _row("Dragapult", "Drifloon", "19", "5,0", "Meta Live"),
        _row("Dragapult", "Drifloon", "66", "6,0", "Meta Play!"),
    ])
    new = [_row("Dragapult", "Drifloon", "20", "4,8", "Meta Live")]
    merged = cma._merge_current_meta_rows(new, OUT)
    play = [r for r in merged if r["meta"] == "Meta Play!"]
    live = [r for r in merged if r["meta"] == "Meta Live"]
    assert len(play) == 1 and play[0]["total_decks_in_archetype"] == "66"   # preserved
    assert len(live) == 1 and live[0]["total_decks_in_archetype"] == "20"   # replaced


def test_no_existing_file_returns_new(tmp_path, monkeypatch):
    monkeypatch.setattr(cma, "get_data_dir", lambda: str(tmp_path))
    new = [_row("X", "Y", "5", "1,0", "Meta Live")]
    assert cma._merge_current_meta_rows(new, OUT) == new


# ── Meta Play! deck cache ────────────────────────────────────────────────────
def _deck(tid, arch):
    return {"tournament_id": tid, "archetype": arch,
            "cards": [{"name": "Card", "count": 4, "set_code": "CRI", "set_number": "1"}]}


def test_cache_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setattr(cma, "get_data_dir", lambda: str(tmp_path))
    assert cma.load_meta_play_cache() == {}            # absent → empty
    cache = {"0069": [_deck("0069", "Turin Deck")], "0070": [_deck("0070", "NAIC Deck")]}
    cma.save_meta_play_cache(cache)
    loaded = cma.load_meta_play_cache()
    assert set(loaded) == {"0069", "0070"}
    flat = [d for decks in loaded.values() for d in decks]
    assert len(flat) == 2


def test_cache_replaces_per_tournament(tmp_path, monkeypatch):
    # Re-scraping a tournament replaces its decks, never duplicates them.
    monkeypatch.setattr(cma, "get_data_dir", lambda: str(tmp_path))
    cma.save_meta_play_cache({"0070": [_deck("0070", "old"), _deck("0070", "old2")]})
    cache = cma.load_meta_play_cache()
    cache["0070"] = [_deck("0070", "fresh")]           # supersede
    cma.save_meta_play_cache(cache)
    reloaded = cma.load_meta_play_cache()
    assert len(reloaded["0070"]) == 1
    assert reloaded["0070"][0]["archetype"] == "fresh"


def test_cache_corrupt_file_returns_empty(tmp_path, monkeypatch):
    monkeypatch.setattr(cma, "get_data_dir", lambda: str(tmp_path))
    with open(os.path.join(str(tmp_path), "meta_play_decks_cache.json"), "w") as f:
        f.write("{ not valid json")
    assert cma.load_meta_play_cache() == {}
