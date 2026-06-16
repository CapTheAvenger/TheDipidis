"""Tests for the Champions strategy guardrails:
find_offteam_moves (prompt rule #2) and reference_coverage.
"""

import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_REPO_ROOT / "scripts"))

import generate_team_strategies as g  # noqa: E402

# moves_idx: normalized key -> (canonical English, entry). de_name keys are
# aliases that point at the same canonical (this is the 'Felswurf' trap).
MOVES = {
    "tailwind": ("Tailwind", {"de_name": "Rückenwind"}),
    "rückenwind": ("Tailwind", {"de_name": "Rückenwind"}),
    "rock slide": ("Rock Slide", {"de_name": "Steinhagel"}),
    "rock tomb": ("Rock Tomb", {"de_name": "Felswurf"}),
    "felswurf": ("Rock Tomb", {"de_name": "Felswurf"}),  # de_name alias trap
    "heat wave": ("Heat Wave", {"de_name": "Hitzewelle"}),
}


def _setup(monkeypatch):
    monkeypatch.setattr(g, "_MOVES_IDX", MOVES)
    monkeypatch.setattr(g, "_ITEMS_IDX", {})
    monkeypatch.setattr(g, "_ABILITIES_IDX", {})


def _team(moves, item="", ability=""):
    return {"pokemon": [{"name": "Mon", "moves": moves, "item": item, "ability": ability}]}


def _obj_de(text):
    return {"de": {"overview": text, "roles": [], "game_plan": [], "tips": []}}


def test_offteam_move_is_flagged(monkeypatch):
    _setup(monkeypatch)
    team = _team(["Heat Wave"])
    obj = _obj_de("Nutze Hitzewelle (Heat Wave) und dann Rückenwind (Tailwind).")
    assert g.find_offteam_moves(obj, team) == ["Tailwind"]  # Tailwind not on team


def test_team_move_is_not_flagged(monkeypatch):
    _setup(monkeypatch)
    team = _team(["Heat Wave", "Tailwind"])
    obj = _obj_de("Hitzewelle (Heat Wave) und Rückenwind (Tailwind).")
    assert g.find_offteam_moves(obj, team) == []


def test_de_name_alias_is_not_a_false_positive(monkeypatch):
    # A German-name parenthetical ('(Felswurf)') must NOT resolve to its
    # canonical ('Rock Tomb') and get flagged — the real-data false positive.
    _setup(monkeypatch)
    team = _team(["Rock Slide"])
    obj = _obj_de("Steinhagel (Felswurf) trifft beide Gegner.")
    assert g.find_offteam_moves(obj, team) == []


def test_unknown_parenthetical_is_ignored(monkeypatch):
    _setup(monkeypatch)
    team = _team(["Heat Wave"])
    obj = _obj_de("Schicke deinen Angreifer (zum Beispiel zuerst) ins Feld.")
    assert g.find_offteam_moves(obj, team) == []


def test_reference_coverage_fraction(monkeypatch):
    _setup(monkeypatch)
    team = {"pokemon": [{"name": "Mon", "moves": ["Heat Wave", "Splash"],
                         "item": "", "ability": ""}]}
    assert g.reference_coverage(team) == 0.5  # Heat Wave covered, Splash not


def test_reference_coverage_empty_team_is_full(monkeypatch):
    _setup(monkeypatch)
    assert g.reference_coverage({"pokemon": []}) == 1.0
