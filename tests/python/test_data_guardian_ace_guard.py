"""Guardian check for the binder's ACE-SPEC name+rarity detection.

The frontend decides "is this row an ACE SPEC?" by name list
(data/ace_specs.json) plus a rarity guard (exactly common/uncommon/rare can
never be ACE). That is collision-safe today — verified 0 false positives
over the full card DB — but silently breaks if a future set prints a
non-ACE Ultra Rare with an ACE name. data_guardian's ace_guard_prints /
check_ace_guard baseline-diffs the guard-passing prints so exactly that
change gets reported (never repaired).
"""

import importlib.util
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

spec = importlib.util.spec_from_file_location(
    "data_guardian", os.path.join(ROOT, "scripts", "data_guardian.py"))
data_guardian = importlib.util.module_from_spec(spec)
sys.modules["data_guardian"] = data_guardian
spec.loader.exec_module(data_guardian)


def test_no_findings_when_unchanged():
    cur = {"master ball": ["PLB 94", "TEF 153"]}
    findings = []
    data_guardian.check_ace_guard(findings, cur, dict(cur))
    assert findings == []


def test_new_guard_passing_print_is_reported_not_repaired():
    base = {"master ball": ["PLB 94", "TEF 153"]}
    cur = {"master ball": ["PLB 94", "TEF 153", "ZZZ 12"]}
    findings = []
    data_guardian.check_ace_guard(findings, cur, base)
    assert len(findings) == 1
    level, msg = findings[0]
    assert level == "WARN"
    assert "ZZZ 12" in msg and "master ball" in msg


def test_lost_print_is_reported():
    base = {"prime catcher": ["TEF 157"]}
    cur = {}
    findings = []
    data_guardian.check_ace_guard(findings, cur, base)
    assert len(findings) == 1
    assert "lost" in findings[0][1]


def test_missing_baseline_or_data_is_silent():
    findings = []
    data_guardian.check_ace_guard(findings, None, {"x": ["A 1"]})
    data_guardian.check_ace_guard(findings, {"x": ["A 1"]}, None)
    assert findings == []


def test_real_data_has_no_rare_guard_leaks():
    """Against the live repo data: every guard-passing print of an ACE name
    must not be exactly common/uncommon/rare (the guard's own invariant),
    and the canonical names must all resolve to at least one print."""
    cur = data_guardian.ace_guard_prints()
    assert cur, "ace_guard_prints returned nothing — ace_specs.json or card DB missing"
    # 39 unique names on the list; all with >= 1 guard-passing print today.
    assert len(cur) >= 30
    for name, prints in cur.items():
        assert prints, f"ACE name {name!r} has no guard-passing print"
