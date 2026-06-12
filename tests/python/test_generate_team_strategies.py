"""Unit tests for scripts/generate_team_strategies.py — the pure
helpers that decide WHICH teams get a Claude API call and how the
response is parsed/validated. No network access anywhere here.

Covers:
  • team_hash stability (cosmetic fields don't change it, gameplay
    fields do)
  • teams_needing_generation diff (new team, changed team, cached team)
  • extract_json robustness (fences, prose, garbage)
  • validate_strategy schema enforcement
  • prune_cache eviction order (oldest absent first, present kept)
"""

import os
import sys

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(REPO_ROOT, "scripts"))

from generate_team_strategies import (  # noqa: E402
    PROMPT_VERSION,
    extract_json,
    prune_cache,
    team_hash,
    teams_needing_generation,
    validate_strategy,
)


def _team(code="ABC123", name="Incineroar", moves=None, rank=1, team_name="T"):
    return {
        "rank": rank,
        "replica_code": code,
        "team_name": team_name,
        "pokemon": [
            {
                "name": name,
                "item": "Sitrus Berry",
                "ability": "Intimidate",
                "tera_type": "",
                "evs": "32 HP",
                "nature": "Careful",
                "moves": moves or ["Fake Out", "Flare Blitz"],
            }
        ],
    }


def _valid_lang_block():
    return {
        "overview": "Ein Team.",
        "roles": [{"name": "Incineroar", "role": "Support."}],
        "game_plan": ["Schritt 1", "Schritt 2", "Schritt 3"],
        "tips": ["Tipp 1"],
    }


def _valid_strategy():
    return {"de": _valid_lang_block(), "en": _valid_lang_block()}


# ── team_hash ────────────────────────────────────────────────────────

class TestTeamHash:
    def test_stable_for_identical_input(self):
        assert team_hash(_team()) == team_hash(_team())

    def test_cosmetic_fields_dont_change_hash(self):
        a = _team(rank=1, team_name="Old name")
        b = _team(rank=7, team_name="New name")
        assert team_hash(a) == team_hash(b)

    def test_move_change_changes_hash(self):
        a = _team(moves=["Fake Out", "Flare Blitz"])
        b = _team(moves=["Fake Out", "Knock Off"])
        assert team_hash(a) != team_hash(b)

    def test_item_change_changes_hash(self):
        a = _team()
        b = _team()
        b["pokemon"][0]["item"] = "Assault Vest"
        assert team_hash(a) != team_hash(b)


# ── teams_needing_generation ─────────────────────────────────────────

class TestDiff:
    def test_new_team_needs_generation(self):
        teams = [_team("AAA")]
        cache = {"strategies": {}}
        assert [t["replica_code"] for t in teams_needing_generation(teams, cache)] == ["AAA"]

    def test_cached_team_with_matching_hash_skipped(self):
        t = _team("AAA")
        cache = {"strategies": {"AAA": {
            "team_hash": team_hash(t),
            "prompt_version": PROMPT_VERSION,
        }}}
        assert teams_needing_generation([t], cache) == []

    def test_changed_team_regenerates(self):
        old = _team("AAA", moves=["Fake Out", "Flare Blitz"])
        new = _team("AAA", moves=["Fake Out", "Parting Shot"])
        cache = {"strategies": {"AAA": {
            "team_hash": team_hash(old),
            "prompt_version": PROMPT_VERSION,
        }}}
        assert [t["replica_code"] for t in teams_needing_generation([new], cache)] == ["AAA"]

    def test_old_prompt_version_regenerates(self):
        t = _team("AAA")
        cache = {"strategies": {"AAA": {
            "team_hash": team_hash(t),
            "prompt_version": PROMPT_VERSION - 1,
        }}}
        assert [x["replica_code"] for x in teams_needing_generation([t], cache)] == ["AAA"]

    def test_missing_prompt_version_regenerates(self):
        # Entries written before versioning existed have no field at
        # all — they must refresh too.
        t = _team("AAA")
        cache = {"strategies": {"AAA": {"team_hash": team_hash(t)}}}
        assert [x["replica_code"] for x in teams_needing_generation([t], cache)] == ["AAA"]

    def test_team_without_code_or_mons_ignored(self):
        no_code = _team("")
        no_mons = _team("BBB")
        no_mons["pokemon"] = []
        assert teams_needing_generation([no_code, no_mons], {"strategies": {}}) == []


# ── extract_json ─────────────────────────────────────────────────────

class TestExtractJson:
    def test_plain_json(self):
        assert extract_json('{"a": 1}') == {"a": 1}

    def test_fenced_json(self):
        text = 'Hier:\n```json\n{"a": 1}\n```\nfertig'
        assert extract_json(text) == {"a": 1}

    def test_json_with_surrounding_prose(self):
        text = 'Sure! {"de": {"x": 1}} hope that helps'
        assert extract_json(text) == {"de": {"x": 1}}

    def test_garbage_returns_none(self):
        assert extract_json("kein json hier") is None
        assert extract_json("") is None
        assert extract_json(None) is None

    def test_nested_braces_survive(self):
        text = '{"de": {"roles": [{"name": "A", "role": "B {c}"}]}}'
        out = extract_json(text)
        assert out["de"]["roles"][0]["role"] == "B {c}"


# ── validate_strategy ────────────────────────────────────────────────

class TestValidate:
    def test_valid_passes(self):
        ok, reason = validate_strategy(_valid_strategy())
        assert ok, reason

    def test_missing_language_fails(self):
        s = _valid_strategy()
        del s["en"]
        ok, reason = validate_strategy(s)
        assert not ok and "en" in reason

    def test_empty_overview_fails(self):
        s = _valid_strategy()
        s["de"]["overview"] = "  "
        ok, reason = validate_strategy(s)
        assert not ok and "overview" in reason

    def test_short_game_plan_fails(self):
        s = _valid_strategy()
        s["en"]["game_plan"] = ["only one step"]
        ok, reason = validate_strategy(s)
        assert not ok and "game_plan" in reason

    def test_malformed_role_fails(self):
        s = _valid_strategy()
        s["de"]["roles"] = [{"name": "X"}]  # role text missing
        ok, _ = validate_strategy(s)
        assert not ok

    def test_tips_optional_but_must_be_list(self):
        s = _valid_strategy()
        s["de"]["tips"] = None
        ok, _ = validate_strategy(s)
        assert ok
        s["de"]["tips"] = "ein String"
        ok, _ = validate_strategy(s)
        assert not ok

    def test_non_dict_fails(self):
        ok, _ = validate_strategy(None)
        assert not ok


# ── prune_cache ──────────────────────────────────────────────────────

class TestPrune:
    def _cache(self, n, present_codes=()):
        strategies = {}
        for i in range(n):
            code = f"C{i:03d}"
            strategies[code] = {
                "team_hash": "x",
                "generated_at": f"2026-01-{(i % 28) + 1:02d}T00:00:00Z",
            }
        return {"strategies": strategies}

    def test_under_limit_no_eviction(self):
        cache = self._cache(5)
        assert prune_cache(cache, ["C000"], max_entries=10) == 0
        assert len(cache["strategies"]) == 5

    def test_evicts_oldest_absent_first(self):
        cache = {"strategies": {
            "OLD": {"generated_at": "2026-01-01T00:00:00Z"},
            "MID": {"generated_at": "2026-03-01T00:00:00Z"},
            "CUR": {"generated_at": "2026-02-01T00:00:00Z"},
        }}
        evicted = prune_cache(cache, ["CUR"], max_entries=2)
        assert evicted == 1
        assert "OLD" not in cache["strategies"]
        assert set(cache["strategies"]) == {"MID", "CUR"}

    def test_present_entries_never_evicted(self):
        cache = {"strategies": {
            "A": {"generated_at": "2026-01-01T00:00:00Z"},
            "B": {"generated_at": "2026-01-02T00:00:00Z"},
        }}
        # Both on the current list → nothing can go even over limit
        evicted = prune_cache(cache, ["A", "B"], max_entries=1)
        assert evicted == 0
        assert set(cache["strategies"]) == {"A", "B"}
