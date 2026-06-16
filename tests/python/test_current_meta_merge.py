"""Tests for current_meta_analysis_scraper._merge_current_meta_rows.

Covers the denominator-bug fix: Meta Live is a full snapshot (replace all),
Meta Play! is incremental (preserve prior, supersede colliding), and the two
metas never collide on archetype|card_name.
"""

import csv
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


def test_meta_play_incremental_preserves_prior(tmp_path, monkeypatch):
    monkeypatch.setattr(cma, "get_data_dir", lambda: str(tmp_path))
    _write_csv(os.path.join(str(tmp_path), OUT), [
        _row("Gardevoir", "Kirlia", "66", "9,0", "Meta Play!"),
        _row("Charizard", "Charmander", "66", "9,0", "Meta Play!"),
    ])
    new = [_row("Gardevoir", "Kirlia", "30", "8,0", "Meta Play!")]
    merged = cma._merge_current_meta_rows(new, OUT)
    play = {(r["archetype"], r["card_name"]): r for r in merged if r["meta"] == "Meta Play!"}
    assert play[("Gardevoir", "Kirlia")]["total_decks_in_archetype"] == "30"  # superseded
    assert ("Charizard", "Charmander") in play                               # preserved


def test_empty_meta_live_does_not_wipe(tmp_path, monkeypatch):
    monkeypatch.setattr(cma, "get_data_dir", lambda: str(tmp_path))
    _write_csv(os.path.join(str(tmp_path), OUT), [
        _row("Dragapult", "Drifloon", "20", "4,8", "Meta Live"),
    ])
    new = [_row("Gardevoir", "Kirlia", "30", "8,0", "Meta Play!")]  # no Meta Live this run
    merged = cma._merge_current_meta_rows(new, OUT)
    assert len([r for r in merged if r["meta"] == "Meta Live"]) == 1  # preserved


def test_cross_meta_no_collision(tmp_path, monkeypatch):
    monkeypatch.setattr(cma, "get_data_dir", lambda: str(tmp_path))
    _write_csv(os.path.join(str(tmp_path), OUT), [
        _row("Dragapult", "Drifloon", "19", "5,0", "Meta Live"),
        _row("Dragapult", "Drifloon", "66", "6,0", "Meta Play!"),
    ])
    new = [_row("Dragapult", "Drifloon", "20", "4,8", "Meta Live")]
    merged = cma._merge_current_meta_rows(new, OUT)
    play = [r for r in merged if r["meta"] == "Meta Play!"]
    live = [r for r in merged if r["meta"] == "Meta Live"]
    assert len(play) == 1 and play[0]["total_decks_in_archetype"] == "66"  # not clobbered
    assert len(live) == 1 and live[0]["total_decks_in_archetype"] == "20"


def test_no_existing_file_returns_new(tmp_path, monkeypatch):
    monkeypatch.setattr(cma, "get_data_dir", lambda: str(tmp_path))
    new = [_row("X", "Y", "5", "1,0", "Meta Live")]
    assert cma._merge_current_meta_rows(new, OUT) == new
