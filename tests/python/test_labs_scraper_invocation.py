"""Tests for the labs-scraper CLI invocation in the dashboard +
weekly workflow.

The Meta Call engine's Day-2 preference path requires `day_filter='day2'`
rows in labs_tournament_matchups.csv. Both the local-dev dashboard
(backend/start_scraper_dashboard.py) and the weekly CI workflow
(.github/workflows/weekly-full-update.yml) invoke the same scraper,
and BOTH must pass `--matchups --matchup-days overall day2` for the
Day-2 path to ever populate.

A maintainer can accidentally drop those args (e.g. while refactoring
the dashboard to "simplify", or while editing the workflow YAML in
GitHub's web UI). These tests guard against that — they don't
exercise the scraper itself, just the invocation surface.
"""

import os
import re
import sys

import pytest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(REPO_ROOT, "backend"))


def test_dashboard_task_10_passes_matchups_with_day2():
    """The dashboard's task 10 (Labs Major Tournament Scraper) must run
    the scraper with `--matchups --matchup-days overall day2` so the
    Day-2 matchup matrix gets populated alongside Overall."""
    import start_scraper_dashboard as d

    # Task 10 is the labs scraper — drift-check the script name first
    # so a future task-id renumbering doesn't silently bypass this.
    assert d.SCRIPTS["10"].endswith("labs_tournament_scraper.py"), (
        "Task 10 should point at labs_tournament_scraper.py — task IDs may "
        "have been renumbered. Move TASK_CLI_ARGS['10'] to the new ID."
    )

    args = d.TASK_CLI_ARGS.get("10")
    assert args is not None, "Task 10 must have CLI args configured"
    assert "--matchups" in args, "Task 10 must pass --matchups"
    assert "--matchup-days" in args, "Task 10 must pass --matchup-days"
    # Argparse's nargs='+' accepts values as separate tokens following
    # the flag. All three filters must appear so the Meta Call 3-source
    # blend (Day-2 45 % / Day-1 35 % / Online 20 %) has populated
    # inputs; 'overall' stays in the list as the fallback anchor for
    # pairs where neither Day-1 nor Day-2 has enough samples.
    days_idx = args.index("--matchup-days")
    day_values = args[days_idx + 1:]
    for required in ("overall", "day1", "day2"):
        assert required in day_values, (
            f"Task 10 must include {required!r} in --matchup-days (3-source blend)"
        )


def test_weekly_workflow_invokes_scraper_with_day2():
    """The weekly CI workflow must invoke the labs scraper with the same
    Day-2 args as the dashboard. If they drift, the dashboard would
    produce different data than the published CSVs on main."""
    yml_path = os.path.join(REPO_ROOT, ".github", "workflows", "weekly-full-update.yml")
    assert os.path.isfile(yml_path), f"Workflow YAML missing: {yml_path}"
    with open(yml_path, encoding="utf-8") as f:
        text = f.read()

    # Look for the scraper invocation line. Defensive regex — tolerates
    # `python ` / `python3 ` / `python -m` and arbitrary spacing.
    scraper_lines = [
        line for line in text.splitlines()
        if "labs_tournament_scraper.py" in line and "python" in line
    ]
    assert scraper_lines, (
        "Couldn't find the labs scraper invocation in weekly-full-update.yml. "
        "If you reorganised the workflow, update this test."
    )

    # At least one invocation must carry all three day-filters. The
    # workflow may eventually grow multiple lines (e.g. a separate
    # backfill step) — we want the primary run to populate all three
    # sources of the Meta Call 3-source blend.
    has_full_invocation = any(
        "--matchups" in line
        and re.search(r"--matchup-days\b.*\bday1\b", line)
        and re.search(r"--matchup-days\b.*\bday2\b", line)
        for line in scraper_lines
    )
    assert has_full_invocation, (
        "weekly-full-update.yml must invoke labs_tournament_scraper.py with "
        "`--matchups --matchup-days overall day1 day2`. Found these lines:\n  " +
        "\n  ".join(scraper_lines)
    )


def test_dashboard_and_workflow_use_the_same_day_filters():
    """Drift-guard: dashboard's Day filters must match what the workflow
    runs. If a maintainer adds 'day1' to one but not the other, this
    catches it. Past metas keep their Overall-only snapshot (skip-if-
    already-scraped logic), but the dashboard/weekly invocation set
    must stay in lockstep so a local-dev run produces the same CSV the
    weekly job would."""
    import start_scraper_dashboard as d
    args = d.TASK_CLI_ARGS.get("10", [])
    days_idx = args.index("--matchup-days")
    dashboard_days = set(args[days_idx + 1:])

    yml_path = os.path.join(REPO_ROOT, ".github", "workflows", "weekly-full-update.yml")
    with open(yml_path, encoding="utf-8") as f:
        text = f.read()
    # Find the actual command line — ignore comments (lines starting
    # with `#` after the YAML indent) so explanatory text mentioning
    # `--matchup-days …` doesn't trip the match. We want the LINE that
    # invokes the scraper, not the LINE that describes it.
    workflow_days = None
    for line in text.splitlines():
        stripped = line.lstrip()
        if stripped.startswith("#"):
            continue
        if "labs_tournament_scraper.py" not in line:
            continue
        if "--matchup-days" not in line:
            continue
        # Take everything after --matchup-days, then split off any
        # subsequent --flag and grab the values.
        after = line.split("--matchup-days", 1)[1].strip()
        # Stop at the next `--` token (defensive; today there are none
        # after --matchup-days but a future arg add shouldn't poison
        # the test).
        if " --" in after:
            after = after.split(" --", 1)[0]
        workflow_days = set(after.split())
        break
    assert workflow_days is not None, (
        "Couldn't find a non-comment line in weekly-full-update.yml "
        "that invokes labs_tournament_scraper.py with --matchup-days."
    )

    assert dashboard_days == workflow_days, (
        f"Dashboard day-filter set {dashboard_days} != workflow set "
        f"{workflow_days}. Keep them in sync so local-dev runs match CI."
    )
