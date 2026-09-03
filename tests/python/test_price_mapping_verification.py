"""Live verification of Cardmarket product mappings (the OBF 223<->228 case).

The positional mapper pairing (card-number rank <-> trend-price rank) is a
monotonicity assumption that provably inverted all 40 SAR-vs-Secret-Rare
groups. The fix chain under test:
  1. scripts/verify_cardmarket_mapping.py extracts the REAL idProduct from
     the product page behind Limitless' per-print URL — never guessing.
  2. cardmarket_id_mapper.apply_live_verification prefers verified ids.
  3. cardmarket_price_merger flags still-unverified positional rows as
     price_status='unverified_mapping' (display unchanged by maintainer
     decision; consumers get the honest flag).
  4. data_guardian baseline-diffs filled prices, method distribution and
     duplicate idProducts — the class of regression that row counts and
     set coverage can never see.
"""

import csv
import importlib.util
import json
import os
import sys

import pytest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def _load(name, relpath):
    spec = importlib.util.spec_from_file_location(name, os.path.join(ROOT, relpath))
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


verify = _load("verify_cm", "scripts/verify_cardmarket_mapping.py")
mapper = _load("cm_mapper", "backend/scrapers/cardmarket_id_mapper.py")
merger = _load("cm_merger", "backend/scrapers/cardmarket_price_merger.py")
guardian = _load("dg2", "scripts/data_guardian.py")


# ── 1. idProduct extraction — identity or nothing, never a guess ─────────

def test_form_input_is_authoritative():
    html = '<form>...<input name="idProduct" value="725303">...</form>' \
           '<script>{"idProduct":999999}</script>'
    pid, evidence = verify.extract_id_product(html)
    assert pid == 725303
    assert evidence == 'form-input'


def test_unanimous_json_accepted():
    html = '{"idProduct":725303} ... data-product-id="725303"'
    pid, evidence = verify.extract_id_product(html)
    assert pid == 725303
    assert evidence.startswith('json-unanimous')


def test_conflicting_ids_are_ambiguous_not_guessed():
    html = '{"idProduct":725303} {"idProduct":725308}'
    pid, reason = verify.extract_id_product(html)
    assert pid is None
    assert reason == 'ambiguous_html'


def test_no_id_is_unparseable():
    pid, reason = verify.extract_id_product('<html>Cloudflare says hi</html>')
    assert pid is None
    assert reason == 'unparseable'


# ── conflict-group detection: exactly the proven failure mode ────────────

def test_conflict_group_detects_sar_below_secret():
    cards = {
        ('OBF', '223'): {'rarity': 'Special Art Rare'},
        ('OBF', '228'): {'rarity': 'Secret Rare'},
    }
    group = [{'set': 'OBF', 'number': '223'}, {'set': 'OBF', 'number': '228'}]
    assert verify.is_conflict_group_member(group, cards) is True


def test_plain_group_is_not_flagged():
    cards = {
        ('OBF', '125'): {'rarity': 'Double Rare'},
        ('OBF', '215'): {'rarity': 'Ultra Rare'},
    }
    group = [{'set': 'OBF', 'number': '125'}, {'set': 'OBF', 'number': '215'}]
    assert verify.is_conflict_group_member(group, cards) is False


# ── 2. mapper: verified ids win, everything else untouched ───────────────

def _write_csv(path, fieldnames, rows):
    with open(path, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)


def test_apply_live_verification_corrects_and_confirms(tmp_path):
    _write_csv(tmp_path / 'cardmarket_mapping_verified.csv',
               ['set', 'number', 'verified_product_id', 'status'],
               [
                   {'set': 'OBF', 'number': '223', 'verified_product_id': '725303', 'status': 'verified'},
                   {'set': 'OBF', 'number': '125', 'verified_product_id': '725205', 'status': 'verified'},
                   # non-verified statuses must be ignored
                   {'set': 'OBF', 'number': '228', 'verified_product_id': '999', 'status': 'http_403'},
               ])
    mappings = [
        {'set': 'OBF', 'number': '223', 'cardmarket_product_id': 725308, 'match_method': 'priced-by-date(4↔5)'},
        {'set': 'OBF', 'number': '125', 'cardmarket_product_id': 725205, 'match_method': 'priced-by-date(4↔5)'},
        {'set': 'OBF', 'number': '228', 'cardmarket_product_id': 725303, 'match_method': 'priced-by-date(4↔5)'},
    ]
    corrected, confirmed = mapper.apply_live_verification(mappings, str(tmp_path))
    assert (corrected, confirmed) == (1, 1)
    by_num = {m['number']: m for m in mappings}
    assert by_num['223']['cardmarket_product_id'] == 725303
    assert by_num['223']['match_method'] == 'live-verified'
    assert by_num['125']['match_method'] == 'live-verified'
    # 403 row untouched — throttled is not a verdict
    assert by_num['228']['cardmarket_product_id'] == 725303
    assert by_num['228']['match_method'].startswith('priced-by')


def test_apply_live_verification_missing_file_is_noop(tmp_path):
    mappings = [{'set': 'X', 'number': '1', 'cardmarket_product_id': 5, 'match_method': 'unique'}]
    assert mapper.apply_live_verification(mappings, str(tmp_path)) == (0, 0)
    assert mappings[0]['match_method'] == 'unique'


# ── 3. merger end-to-end: unverified flag + precedence + display parity ──

def test_merger_flags_unverified_mapping(tmp_path, monkeypatch):
    _write_csv(tmp_path / 'all_cards_database.csv',
               ['name_en', 'set', 'number', 'cardmarket_url'],
               [
                   {'name_en': 'Charizard ex', 'set': 'OBF', 'number': '223',
                    'cardmarket_url': 'https://cm/OBF223'},
                   {'name_en': 'Charizard ex', 'set': 'OBF', 'number': '125',
                    'cardmarket_url': 'https://cm/OBF125'},
                   {'name_en': 'Pikachu', 'set': 'MEW', 'number': '25',
                    'cardmarket_url': 'https://cm/MEW25'},
                   {'name_en': 'Boss', 'set': 'RCL', 'number': '200',
                    'cardmarket_url': 'https://cm/RCL200'},
               ])
    _write_csv(tmp_path / 'cardmarket_id_mapping.csv',
               ['set', 'number', 'cardmarket_product_id', 'match_method', 'base_name'],
               [
                   {'set': 'OBF', 'number': '223', 'cardmarket_product_id': '725308',
                    'match_method': 'priced-by-date(4↔5)', 'base_name': 'Charizard ex'},
                   {'set': 'OBF', 'number': '125', 'cardmarket_product_id': '725205',
                    'match_method': 'live-verified', 'base_name': 'Charizard ex'},
                   {'set': 'MEW', 'number': '25', 'cardmarket_product_id': '111',
                    'match_method': 'unique', 'base_name': 'Pikachu'},
                   {'set': 'RCL', 'number': '200', 'cardmarket_product_id': '653295',
                    'match_method': 'priced-by-date(2↔2)', 'base_name': 'Boss'},
               ])
    with open(tmp_path / 'price_guide_6.json', 'w', encoding='utf-8') as f:
        json.dump({'priceGuides': [
            {'idProduct': 725308, 'trend': 32.75, 'low': 14.99},
            {'idProduct': 725205, 'trend': 5.19, 'low': 1.98},
            {'idProduct': 111, 'trend': 1.0, 'low': 0.5},
            # no_trend must OUTRANK unverified_mapping (precedence)
            {'idProduct': 653295, 'trend': 0, 'low': 85},
        ]}, f)

    monkeypatch.setattr(merger, 'get_project_data_dir', lambda: str(tmp_path))
    merger.main()

    with open(tmp_path / 'price_data.csv', encoding='utf-8-sig', newline='') as f:
        rows = {(r['set'], r['number']): r for r in csv.DictReader(f)}

    assert rows[('OBF', '223')]['price_status'] == 'unverified_mapping'
    assert rows[('OBF', '223')]['eur_price'] == '32,75€', \
        'display value unchanged by maintainer decision — flag only'
    assert rows[('OBF', '125')]['price_status'] == 'ok', 'live-verified is trusted'
    assert rows[('MEW', '25')]['price_status'] == 'ok'
    assert rows[('RCL', '200')]['price_status'] == 'no_trend', \
        'trend-quality flags outrank mapping trust — they change WHICH number to read'


# ── 4. guardian: the checks that would have caught the 04.06 swap ────────

def test_guardian_flags_price_blanking():
    findings = []
    guardian.check_price_integrity(
        findings,
        {'nonempty_eur_price': 14000, 'match_methods': {}, 'duplicate_idproducts': 0},
        {'nonempty_eur_price': 20000, 'match_methods': {}, 'duplicate_idproducts': 0})
    assert any(lvl == 'CRITICAL' and 'blanking' in msg for lvl, msg in findings)


def test_guardian_flags_method_shift_and_new_duplicates():
    findings = []
    guardian.check_price_integrity(
        findings,
        {'nonempty_eur_price': 20000,
         'match_methods': {'unique': 5000, 'priced-by-date': 500},
         'duplicate_idproducts': 12},
        {'nonempty_eur_price': 20000,
         'match_methods': {'unique': 11000, 'priced-by-date': 6300},
         'duplicate_idproducts': 8})
    assert any('unique' in msg for _, msg in findings)
    assert any('multiple prints' in msg for _, msg in findings)


def test_guardian_quiet_when_stable():
    findings = []
    cur = {'nonempty_eur_price': 20000,
           'match_methods': {'unique': 11033, 'priced-by-date': 5000},
           'duplicate_idproducts': 8}
    guardian.check_price_integrity(findings, cur, dict(cur))
    assert findings == []


def test_guardian_price_integrity_reads_real_repo():
    cur = guardian.price_integrity()
    assert cur['nonempty_eur_price'] > 15000, 'live repo should have filled prices'
    assert cur['match_methods'].get('unique', 0) > 0
    assert cur['match_methods'].get('priced-by-date', 0) > 0


# ── 5. Limitless price-fingerprint (Cardmarket 403s all CI runners) ──────

def test_parse_limitless_eur_us_format_only():
    assert verify.parse_limitless_eur('348.81€') == 348.81
    assert verify.parse_limitless_eur('1,234.56€') == 1234.56
    assert verify.parse_limitless_eur('0.56€') == 0.56
    # German format / junk must NOT silently mis-parse (the 1000x bug class)
    assert verify.parse_limitless_eur('348,81€') is None
    assert verify.parse_limitless_eur('N/A') is None
    assert verify.parse_limitless_eur('') is None


def test_fingerprint_unique_match_verifies():
    # OBF 223: Limitless shows ~130, pool = the five real candidates.
    pid, evidence = verify.fingerprint_match(
        130.17, {725205: 5.19, 725294: 17.66, 725308: 32.75,
                 725303: 137.44, 749033: 7.58})
    assert pid == 725303
    assert 'limitless-fingerprint' in evidence


def test_fingerprint_two_in_band_stays_unverified():
    pid, reason = verify.fingerprint_match(100.0, {1: 98.0, 2: 105.0, 3: 5.0})
    assert pid is None
    assert reason.startswith('fingerprint_ambiguous')


def test_fingerprint_near_miss_gap_stays_unverified():
    # One candidate in band, but a second sits just outside (1.2x) — the
    # separation is not clean enough to call it identity.
    pid, reason = verify.fingerprint_match(100.0, {1: 100.0, 2: 120.0})
    assert pid is None
    assert reason == 'fingerprint_ambiguous(gap)'


def test_fingerprint_no_price_is_not_a_verdict():
    pid, reason = verify.fingerprint_match(None, {1: 10.0})
    assert (pid, reason) == (None, 'no_price_shown')


def test_parse_prints_prices_from_recon_html():
    # Structure copied from the real recon log (2026-08-01 run): each print
    # row links its own /cards/SET/NUM and shows the EUR price; the current
    # row has an anchor WITHOUT href.
    html = '''
    <table>
      <tr><td><a href="/cards/DRI/230">Destined Rivals
        <span class="prints-table-card-number">#230</span></a></td>
        <td><a class="card-price usd" href="x">$171.90</a></td>
        <td><a class="card-price eur" href="y">256.06€</a></td></tr>
      <tr class="current"><td><a>Destined Rivals
        <span class="prints-table-card-number">#239</span></a></td>
        <td><a class="card-price usd" href="x">$27.93</a></td>
        <td><a class="card-price eur" href="y">21.47€</a></td></tr>
      <tr><td><a href="/cards/jp/SV10/230">JP print</a></td>
        <td><a class="card-price eur" href="y">99.99€</a></td></tr>
    </table>'''
    prices = verify.parse_prints_prices(html, ('DRI', '239'))
    assert prices[('DRI', '230')] == 256.06
    assert prices[('DRI', '239')] == 21.47, 'current row (no href) keys to the requested page'
    assert ('SV10', '230') not in prices and len(prices) == 2, 'JP prints skipped'


# ── 6. Consensus across guide metrics (the SVP 181 class of failure) ─────

def test_consensus_uses_the_stable_metric_first():
    """N's Darmanitan SVP 181, real numbers from 2026-07-31: the two
    candidates' TRENDS were 7.7% apart (one distorted by a single 101 EUR
    sale) so both landed in the band -> ambiguous. Their 30-day means were
    1.83x apart and decide cleanly."""
    pools = {
        'avg30': {816614: 14.77, 817772: 27.03},
        'avg7':  {816614: 15.0,  817772: 26.0},
        'trend': {816614: 14.64, 817772: 13.59},
        'avg':   {816614: 14.6,  817772: 14.0},
    }
    pid, evidence = verify.consensus_match(14.5, pools)
    assert pid == 816614
    assert 'metric avg30' in evidence
    # single-metric on trend is exactly what failed before
    assert verify.fingerprint_match(14.5, pools['trend'])[0] is None


def test_consensus_refuses_when_metrics_disagree():
    pools = {
        'avg30': {1: 10.0, 2: 40.0},
        'avg7':  {1: 40.0, 2: 10.0},
        'trend': {}, 'avg': {},
    }
    pid, reason = verify.consensus_match(10.0, pools)
    assert pid is None
    assert reason.startswith('metrics_disagree')


def test_consensus_reports_the_stable_metric_reason_when_nothing_decides():
    pools = {'avg30': {1: 10.0, 2: 10.5}, 'avg7': {}, 'trend': {}, 'avg': {}}
    pid, reason = verify.consensus_match(10.0, pools)
    assert pid is None
    assert reason.startswith('fingerprint_ambiguous')


def test_consensus_empty_pools():
    assert verify.consensus_match(10.0, {})[0] is None


# ── 7. Manual pins beat everything ──────────────────────────────────────

def test_manual_pin_overrides_heuristic_and_verification(tmp_path):
    _write_csv(tmp_path / 'cardmarket_mapping_manual.csv',
               ['set', 'number', 'cardmarket_product_id', 'source', 'note'],
               [
                   {'set': 'SVP', 'number': '181', 'cardmarket_product_id': '816614',
                    'source': 'maintainer', 'note': 'read off the product page'},
                   # garbage must be skipped, never guessed at
                   {'set': 'XXX', 'number': '1', 'cardmarket_product_id': '',
                    'source': '', 'note': ''},
               ])
    mappings = [
        {'set': 'SVP', 'number': '181', 'cardmarket_product_id': 999,
         'match_method': 'priced-by-date(1↔2)'},
        {'set': 'XXX', 'number': '1', 'cardmarket_product_id': 5,
         'match_method': 'unique'},
    ]
    applied = mapper.apply_manual_overrides(mappings, str(tmp_path))
    assert applied == 1
    assert mappings[0]['cardmarket_product_id'] == 816614
    assert mappings[0]['match_method'] == 'manual-pin'
    assert mappings[1]['cardmarket_product_id'] == 5, 'invalid pin must not touch the row'


def test_manual_pin_missing_file_is_noop(tmp_path):
    mappings = [{'set': 'A', 'number': '1', 'cardmarket_product_id': 7, 'match_method': 'unique'}]
    assert mapper.apply_manual_overrides(mappings, str(tmp_path)) == 0
    assert mappings[0]['match_method'] == 'unique'


def test_guardian_reports_the_unverified_worklist(tmp_path, monkeypatch):
    monkeypatch.setattr(guardian, 'DATA', str(tmp_path))
    _write_csv(tmp_path / 'price_data.csv',
               ['set', 'number', 'eur_price', 'mapping_status'],
               [
                   {'set': 'SVP', 'number': '181', 'eur_price': '16,70€', 'mapping_status': 'unverified'},
                   {'set': 'AAA', 'number': '1', 'eur_price': '0,10€', 'mapping_status': 'unverified'},
                   {'set': 'BBB', 'number': '2', 'eur_price': '99,00€', 'mapping_status': 'ok'},
               ])
    findings = []
    guardian.report_unverified_prices(findings)
    assert len(findings) == 1
    lvl, msg = findings[0]
    assert lvl == 'WARN'
    # Wortlaut am 03.09.2026 geaendert: die Meldung zaehlt jetzt nur noch
    # Zeilen in aktuell legalen Sets (Betreiberregel — eine rotierte Karte
    # kostet niemanden etwas). Ohne format_window.json/sets.json gibt es
    # hier keine Grenze, also faellt die Pruefung bewusst auf "alles
    # melden" zurueck: 2 unbestaetigte von 3 Zeilen, davon 1 ueber 5 EUR.
    # Geprueft wird weiter die Aussage, nicht der alte Satz.
    assert msg.startswith('2 Preiszeilen'), msg
    assert '1 davon ueber 5 EUR' in msg, msg
    assert 'Formatgrenze nicht lesbar' in msg, \
        'der Rueckfall muss benannt sein, sonst liest sich die Zahl wie gefiltert'
    assert 'SVP 181' in msg, 'the priciest unverified row must be named first'


# ── 8. Pin from what a human can actually READ on the page ──────────────
# The product id is not in the Cardmarket URL and not on the page, so the
# pin workflow takes the price block instead (Price Trend / 30-days /
# 7-days average) and resolves it to the id.

pinner = _load("pin_obs", "scripts/pin_from_observation.py")


def test_parse_eur_accepts_what_the_page_shows():
    assert pinner.parse_eur('16,11 €') == 16.11
    assert pinner.parse_eur('1.234,56 €') == 1234.56
    assert pinner.parse_eur('16.11') == 16.11
    assert pinner.parse_eur('') is None
    assert pinner.parse_eur('—') is None


def test_score_rejects_a_candidate_out_of_tolerance():
    obs = {'trend': 16.11, 'avg30': 15.68}
    assert pinner.score(obs, {'trend': 16.7, 'avg30': 15.24}) is not None
    assert pinner.score(obs, {'trend': 34.37, 'avg30': 28.71}) is None
    # a metric the guide lacks disqualifies rather than passes
    assert pinner.score(obs, {'trend': 16.7}) is None


def test_score_is_the_worst_metric_not_the_best():
    obs = {'trend': 10.0, 'avg30': 10.0}
    s = pinner.score(obs, {'trend': 10.0, 'avg30': 11.5})
    assert abs(s - 1.15) < 1e-9, 'a perfect trend must not hide a weak avg30'


def test_pin_write_replaces_the_row_for_that_card(tmp_path, monkeypatch):
    path = tmp_path / 'cardmarket_mapping_manual.csv'
    monkeypatch.setattr(pinner, 'MANUAL', str(path))
    pinner.write_pin('SVP', '181', 111, 'first')
    pinner.write_pin('OBF', '223', 222, 'other')
    pinner.write_pin('SVP', '181', 333, 'corrected')
    rows = list(csv.DictReader(open(path, encoding='utf-8-sig')))
    assert len(rows) == 2, 'a re-pin must replace, not duplicate'
    by = {(r['set'], r['number']): r for r in rows}
    assert by[('SVP', '181')]['cardmarket_product_id'] == '333'
    assert by[('SVP', '181')]['note'] == 'corrected'
    assert by[('OBF', '223')]['cardmarket_product_id'] == '222'


# The guide snapshot the maintainer's observation was matched against on
# 09.08.2026 (data/price_guide_6.json at 2026-08-07T02:45:09+0200). Frozen on
# purpose: the live file is refreshed daily, so a fixed observation drifts out
# of tolerance as prices move — by 01.09.2026 the 7-day average of the correct
# product had moved from 16,25 € to 13,02 €, a factor of 1,41 against the
# observed 18,42 €. That is price movement, not a mapping error, and a test
# that cannot tell the two apart is worse than none.
PIN_SNAPSHOT = {
    816614: {'trend': 16.70, 'avg30': 15.24, 'avg7': 16.25},
    817772: {'trend': 34.37, 'avg30': 28.71, 'avg7': 22.95},
}
PIN_OBSERVATION = {'trend': 16.11, 'avg30': 15.68, 'avg7': 18.42}
PIN_ID = 816614


def test_the_reported_observation_identifies_exactly_one_product():
    """The maintainer's numbers for N's Darmanitan SVP 181, against the guide
    they were read against. This is what justified the pin and it must stay
    reproducible forever — hence the frozen snapshot above."""
    fits = [(pinner.score(PIN_OBSERVATION, e), pid)
            for pid, e in PIN_SNAPSHOT.items()]
    fits = [(s, pid) for s, pid in fits if s]
    assert len(fits) == 1, f'observation must identify exactly one product, got {fits}'
    assert fits[0][1] == PIN_ID


def test_the_pin_in_the_repo_is_the_product_that_was_identified():
    """What the CSV carries must be what the observation resolved to."""
    with open(os.path.join(ROOT, 'data', 'cardmarket_mapping_manual.csv'),
              encoding='utf-8-sig', newline='') as f:
        row = next((r for r in csv.DictReader(f)
                    if r['set'].upper() == 'SVP' and r['number'] == '181'), None)
    assert row, 'the SVP 181 pin is gone from data/cardmarket_mapping_manual.csv'
    assert int(row['cardmarket_product_id']) == PIN_ID


def test_the_candidate_pool_on_live_data_still_needs_the_pin():
    """Live data, not a fixture: SVP 181 must still be ambiguous by name, the
    pinned product must still be among the candidates, and the candidates must
    still be far enough apart in price that reading the page separates them.

    Deliberately NOT checked here: whether the observation from 09.08.2026
    still fits today's prices. It does not, and it should not have to — see
    PIN_SNAPSHOT. What has to hold is that the METHOD still works today.
    """
    current, cands, _ = pinner.load_candidates('SVP', '181')
    if not cands:
        pytest.skip('no candidate pool — price guide not present')
    ids = [pid for pid, _ in cands]
    assert len(ids) > 1, (
        'SVP 181 is no longer ambiguous by expansion+name — then the pin has '
        'lost its reason and this test should be rewritten, not deleted')
    assert PIN_ID in ids, f'the pinned product {PIN_ID} is no longer a candidate: {ids}'
    heute = dict(cands)[PIN_ID]
    beobachtung = {m: heute[m] for m in ('trend', 'avg30')
                   if heute.get(m) and heute[m] > 0}
    assert beobachtung, f'the pinned product carries no live price: {heute}'
    treffer = [pid for pid, e in cands if pinner.score(beobachtung, e)]
    assert treffer == [PIN_ID], (
        'reading trend and 30-day average off the page no longer identifies '
        f'the product: {treffer}')
