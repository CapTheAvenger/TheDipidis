"""The card-database set allowlist (pokemon_sets_mapping.csv).

How all 120 PBL cards vanished from the site 2026-07-17..08-01 while
every other data file was correct: js/app-cards-db.js filters
window.allCardsData through englishSetCodes, built solely from the
hand-maintained pokemon_sets_mapping.csv — and nobody added PBL.
Adversarially verified: simulating the real pipeline reproduced the
user's "9 cards found" exactly; adding the one row makes PBL 104 appear.

Under test: (1) the auto-append in update_sets that closes the
propagation gap at every future rotation, (2) the guardian invariant
that screams if the current set is ever missing again, (3) the repo
data itself, (4) the jp_prints whitelist fix in the scraper (the
measured 464->334 oscillation).
"""

import csv
import importlib.util
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def _load(name, relpath):
    spec = importlib.util.spec_from_file_location(name, os.path.join(ROOT, relpath))
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


guardian = _load("dg3", "scripts/data_guardian.py")


def _write_mapping(path, codes):
    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.write('set_code,set_name\n')
        for c in codes:
            f.write(f'{c},{c} Name\n')


def _make_update_sets(tmp_path):
    """Load update_sets with its data_dir pointed at a temp dir."""
    us = _load("us_test", "backend/core/update_sets.py")
    us.data_dir = str(tmp_path)
    return us


def test_auto_append_adds_missing_current_set(tmp_path):
    us = _make_update_sets(tmp_path)
    _write_mapping(tmp_path / 'pokemon_sets_mapping.csv', ['CRI', 'POR'])
    with open(tmp_path / 'format_window.json', 'w', encoding='utf-8') as f:
        json.dump({'current_set': 'PBL'}, f)
    with open(tmp_path / 'cm_expansions.csv', 'w', encoding='utf-8', newline='') as f:
        f.write('id_expansion,expansion_code,name,release_date,code_source,n_singles\n')
        f.write('6569,PBL,Pitch Black 24,2026-04-30,tcg,120\n')

    assert us.ensure_set_in_pokemon_sets_mapping(str(tmp_path / 'format_window.json')) is True
    rows = list(csv.DictReader(open(tmp_path / 'pokemon_sets_mapping.csv', encoding='utf-8-sig')))
    codes = [r['set_code'] for r in rows]
    assert codes == ['CRI', 'POR', 'PBL'], 'append-only: existing rows untouched, new set last'
    assert rows[-1]['set_name'] == 'Pitch Black 24', 'name resolved from cm_expansions'


def test_auto_append_is_idempotent_and_never_rewrites(tmp_path):
    us = _make_update_sets(tmp_path)
    _write_mapping(tmp_path / 'pokemon_sets_mapping.csv', ['CRI', 'PBL'])
    with open(tmp_path / 'format_window.json', 'w', encoding='utf-8') as f:
        json.dump({'current_set': 'PBL'}, f)
    before = open(tmp_path / 'pokemon_sets_mapping.csv', encoding='utf-8').read()
    assert us.ensure_set_in_pokemon_sets_mapping(str(tmp_path / 'format_window.json')) is False
    assert open(tmp_path / 'pokemon_sets_mapping.csv', encoding='utf-8').read() == before


def test_auto_append_missing_files_fail_open(tmp_path):
    us = _make_update_sets(tmp_path)
    # no mapping file → must NOT create one blind
    with open(tmp_path / 'format_window.json', 'w', encoding='utf-8') as f:
        json.dump({'current_set': 'PBL'}, f)
    assert us.ensure_set_in_pokemon_sets_mapping(str(tmp_path / 'format_window.json')) is False
    assert not os.path.exists(tmp_path / 'pokemon_sets_mapping.csv')
    # unreadable format_window → no crash, no change
    assert us.ensure_set_in_pokemon_sets_mapping(str(tmp_path / 'nope.json')) is False


def test_guardian_flags_missing_current_set_in_mapping(tmp_path, monkeypatch):
    monkeypatch.setattr(guardian, 'DATA', str(tmp_path))
    with open(tmp_path / 'format_window.json', 'w', encoding='utf-8') as f:
        json.dump({'current_set': 'PBL'}, f)
    with open(tmp_path / 'sets.json', 'w', encoding='utf-8') as f:
        json.dump({'PBL': 155}, f)
    _write_mapping(tmp_path / 'pokemon_sets_mapping.csv', ['CRI', 'POR'])

    findings = []
    guardian.check_set_order(findings)
    assert any(lvl == 'CRITICAL' and 'pokemon_sets_mapping' in msg for lvl, msg in findings), \
        'the exact regression that hid 120 PBL cards must be CRITICAL'

    # and quiet once the row exists
    _write_mapping(tmp_path / 'pokemon_sets_mapping.csv', ['CRI', 'POR', 'PBL'])
    findings2 = []
    guardian.check_set_order(findings2)
    assert not any('pokemon_sets_mapping' in msg for _, msg in findings2)


def test_repo_mapping_contains_every_carddb_set():
    """The live invariant, on real repo data: every set that appears in
    all_cards_database.csv must be in the allowlist — a missing one means
    invisible cards. (PBL was the single missing one.)"""
    db_sets = set()
    with open(os.path.join(ROOT, 'data', 'all_cards_database.csv'),
              encoding='utf-8-sig', newline='') as f:
        for r in csv.DictReader(f):
            if (r.get('set') or '').strip():
                db_sets.add(r['set'].strip().upper())
    mapping_sets = set()
    with open(os.path.join(ROOT, 'data', 'pokemon_sets_mapping.csv'),
              encoding='utf-8-sig', newline='') as f:
        for r in csv.DictReader(f):
            mapping_sets.add((r.get('set_code') or '').strip().upper())
    missing = sorted(db_sets - mapping_sets)
    assert missing == [], f'sets with cards but no allowlist row (invisible on site): {missing}'


def test_scraper_carries_jp_prints_through_the_whitelist():
    """load_existing_cards' card_data dict is a field whitelist; jp_prints
    missing from it blanked the column for every non-rescraped row on
    every full save (the 464->334 oscillation that resurfaced JP
    duplicates)."""
    src = open(os.path.join(ROOT, 'backend', 'scrapers', 'all_cards_scraper.py'),
               encoding='utf-8').read()
    assert '"jp_prints": (row.get("jp_prints") or "").strip(),' in src, \
        'jp_prints dropped from the load whitelist again — the oscillation returns'
