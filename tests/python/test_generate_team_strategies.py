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
    build_lookup_index,
    build_system_prompt,
    collect_team_facts,
    extract_json,
    find_hallucinated_megas,
    format_facts_block,
    prune_cache,
    team_hash,
    teams_needing_generation,
    validate_strategy,
    validate_strategy_facts,
)
import generate_team_strategies as _gen  # for monkey-patching module state


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


# ── v3: factual-grounding reference DB ─────────────────────────────

# A tiny synthetic reference matching the production schema so the
# tests don't load the real JSON files (keeps them fast and avoids
# coupling to real-world content that may change).
_MOVES_REF = {
    "moves": {
        "Tailwind":    {"de_name": "Rückenwind",  "type": "Flying",
                        "effect": "Verdoppelt die Initiative aller Pokémon auf der eigenen Seite für 4 Runden."},
        "Will-O-Wisp": {"de_name": "Irrlicht",    "type": "Fire", "accuracy": 85,
                        "effect": "Verbrennt das Ziel: 1/16 KP pro Runde, physischer Angriff halbiert."},
        "Protect":     {"de_name": "Schutzschild","type": "Normal",
                        "effect": "Schützt 1 Runde."},
    },
}
_ITEMS_REF = {
    "items": {
        "Charizardite Y": {"de_name": "Glurakit Y",
                           "effect": "Mega-Stein: Charizard wird zu Mega-Glurak Y."},
        "Focus Sash":     {"de_name": "Fokusgurt",
                           "effect": "Überlebt 1-Hit-KO mit 1 KP."},
        "Glimmorite":     {"de_name": "Mortipotit",
                           "effect": "EXISTIERT NICHT — Glimmora hat keine Mega-Form."},
    },
}


def _team_with_starter():
    """Team for the Mega-form tests. Charizard (real Mega via item),
    Glimmora (the user-reported hallucination case), Kingambit (NEVER_MEGA,
    no item)."""
    return {
        "pokemon": [
            {"name": "Charizard", "item": "Charizardite Y", "ability": "Blaze",
             "moves": ["Heat Wave", "Solar Beam", "Protect", "Tailwind"]},
            {"name": "Glimmora", "item": "Focus Sash", "ability": "Toxic Debris",
             "moves": ["Sludge Bomb", "Earth Power", "Protect"]},
            {"name": "Kingambit", "item": "Focus Sash", "ability": "Defiant",
             "moves": ["Kowtow Cleave", "Protect", "Will-O-Wisp"]},
        ],
    }


# ── Reference loading + lookup ─────────────────────────────────────

class TestReferenceLookup:
    def test_build_lookup_index_keys_by_english_and_german(self):
        idx = build_lookup_index(_MOVES_REF, "moves")
        # Both names resolve to the same canonical entry
        assert idx["tailwind"][0] == "Tailwind"
        assert idx["rückenwind"][0] == "Tailwind"
        assert idx["will-o-wisp"][0] == "Will-O-Wisp"
        assert idx["irrlicht"][0] == "Will-O-Wisp"

    def test_lookup_is_case_insensitive(self):
        idx = build_lookup_index(_MOVES_REF, "moves")
        assert "rückenwind" in idx
        # Verify both casings of input would find it (lookup helper
        # normalizes via _norm_lookup)
        from generate_team_strategies import _norm_lookup
        assert idx.get(_norm_lookup("RÜCKENWIND")) is not None
        assert idx.get(_norm_lookup("  Tailwind  ")) is not None


class TestCollectTeamFacts:
    def test_collects_known_moves_and_items_dedups(self):
        moves_idx = build_lookup_index(_MOVES_REF, "moves")
        items_idx = build_lookup_index(_ITEMS_REF, "items")
        facts = collect_team_facts(_team_with_starter(), moves_idx, items_idx)
        move_names = {m[0] for m in facts["moves"]}
        item_names = {i[0] for i in facts["items"]}
        # Protect appears on multiple Pokémon — must dedupe
        assert move_names == {"Tailwind", "Protect", "Will-O-Wisp"}
        # Focus Sash on both Glimmora + Kingambit — must dedupe too
        assert "Focus Sash" in item_names
        assert "Charizardite Y" in item_names

    def test_ignores_unknown_moves_and_items(self):
        moves_idx = build_lookup_index(_MOVES_REF, "moves")
        items_idx = build_lookup_index(_ITEMS_REF, "items")
        team = {"pokemon": [{
            "name": "X", "item": "Mythical-Item", "ability": "",
            "moves": ["UnknownMove", "Tailwind"],
        }]}
        facts = collect_team_facts(team, moves_idx, items_idx)
        assert [m[0] for m in facts["moves"]] == ["Tailwind"]
        assert facts["items"] == []


class TestFactsBlock:
    def test_empty_facts_returns_empty_string(self):
        assert format_facts_block({"moves": [], "items": []}) == ""

    def test_block_contains_verbatim_effect_text(self):
        moves_idx = build_lookup_index(_MOVES_REF, "moves")
        items_idx = build_lookup_index(_ITEMS_REF, "items")
        facts = collect_team_facts(_team_with_starter(), moves_idx, items_idx)
        block = format_facts_block(facts)
        # The exact Tailwind duration must appear (the v2 bug was
        # "2 Runden" — this asserts the real value 4 lands in the prompt)
        assert "4 Runden" in block
        # The burn mechanic detail the user wanted
        assert "1/16 KP pro Runde" in block
        # Hard rule about not inventing values
        assert "erfinde NIEMALS" in block.lower() or "NIEMALS" in block


class TestSystemPromptBuilder:
    def test_includes_facts_block_when_provided(self):
        block = "=== VERBINDLICHE FAKTEN ===\ndummy fact"
        prompt = build_system_prompt(block)
        assert "VERBINDLICHE FAKTEN" in prompt
        assert "Du bist ein erfahrener Pokémon-VGC-Coach" in prompt

    def test_no_facts_still_includes_accuracy_rules(self):
        prompt = build_system_prompt("")
        assert "GENAUIGKEITS-REGELN" in prompt
        # The Mega-form rule has to survive into the no-facts branch
        assert "Mega-Formen" in prompt


# ── Hallucination guards ───────────────────────────────────────────

class TestMegaHallucinationGuard:
    """Pre-load the items index so _team_legitimate_mega_species can
    resolve Charizardite Y. monkey-patches the module-level _ITEMS_IDX
    instead of touching disk."""
    def setup_method(self):
        _gen._ITEMS_REF = _ITEMS_REF
        _gen._ITEMS_IDX = build_lookup_index(_ITEMS_REF, "items")
        _gen._MOVES_REF = _MOVES_REF
        _gen._MOVES_IDX = build_lookup_index(_MOVES_REF, "moves")

    def test_no_mega_mention_is_clean(self):
        assert find_hallucinated_megas(
            "Charizard greift mit Heat Wave an.", _team_with_starter()
        ) == []

    def test_legit_mega_via_mega_stone_passes(self):
        # Charizard with Charizardite Y → 'Mega Charizard' is legitimate
        assert find_hallucinated_megas(
            "Charizard mega-entwickelt sich zu Mega Charizard.", _team_with_starter()
        ) == []

    def test_glimmora_mega_is_flagged(self):
        # The exact pattern from the user's bug report
        offenders = find_hallucinated_megas(
            "Lass Glimmora Mega werden, wenn du Flächenschaden brauchst.",
            _team_with_starter(),
        )
        assert offenders
        assert any("glimmora" in o for o in offenders)

    def test_kingambit_mega_is_flagged_in_team_but_no_mega(self):
        offenders = find_hallucinated_megas(
            "Mega Kingambit räumt im Endgame auf.", _team_with_starter()
        )
        assert offenders
        assert any("kingambit" in o for o in offenders)

    def test_german_imperative_does_not_false_positive(self):
        # "Schick" / "Lass" are German verbs, not Pokémon names — the
        # guard must not flag them
        assert find_hallucinated_megas(
            "Schick Charizard vor und lass es mega-entwickeln.",
            _team_with_starter(),
        ) == []


class TestValidateStrategyFacts:
    def setup_method(self):
        _gen._ITEMS_REF = _ITEMS_REF
        _gen._ITEMS_IDX = build_lookup_index(_ITEMS_REF, "items")
        _gen._MOVES_REF = _MOVES_REF
        _gen._MOVES_IDX = build_lookup_index(_MOVES_REF, "moves")

    def _strategy(self, prose):
        # Minimal valid strategy with the given prose inserted into
        # game_plan — _validate_strategy_facts scans ALL prose fields
        return {
            "de": {"overview": "Team-Übersicht.",
                   "roles": [{"name": "Charizard", "role": prose}],
                   "game_plan": [prose, "S2", "S3"],
                   "tips": []},
            "en": {"overview": "Overview.",
                   "roles": [{"name": "Charizard", "role": "role"}],
                   "game_plan": ["S1", "S2", "S3"],
                   "tips": []},
        }

    def test_clean_strategy_passes(self):
        ok, reason = validate_strategy_facts(
            self._strategy("Charizard mega-entwickelt sich für mehr Schaden."),
            _team_with_starter(),
        )
        assert ok, reason

    def test_glimmora_mega_rejected(self):
        ok, reason = validate_strategy_facts(
            self._strategy("Lass Glimmora Mega werden für AoE."),
            _team_with_starter(),
        )
        assert not ok
        assert "glimmora" in reason.lower()

    def test_kingambit_mega_rejected(self):
        ok, reason = validate_strategy_facts(
            self._strategy("Mega Kingambit räumt am Ende auf."),
            _team_with_starter(),
        )
        assert not ok
        assert "kingambit" in reason.lower()


class TestPromptVersionBumped:
    def test_prompt_version_is_v3_or_higher(self):
        # The bump is what triggers regeneration of all cached
        # strategies. If a maintainer reverts SYSTEM_PROMPT changes
        # without bumping, this assertion is the tripwire.
        assert PROMPT_VERSION >= 3
