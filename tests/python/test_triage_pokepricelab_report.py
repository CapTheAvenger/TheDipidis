"""Triage of the pokepricelab cross-check.

The raw report calls 384 of 760 cards "disagree". Treating that as 384
mapping errors would be wrong in two directions, and both are pinned
here:

  - 94 are the same card twice in Cardmarket's catalogue (`duplicate`).
    Neither id is wrong; only one of them carries the prices.
  - 61 are our OWN index pointing at a different card altogether
    (`bad-index`) — BS 52 resolved to base-set-2-marowak-52, several FLI
    numbers to a Japanese set. Those verdicts are evidence about step 1,
    not about the mapping, and must never reach a repair worklist.

What remains is decided by a third source we already own: Cardmarket
puts a card's attacks in the product name, and pokemon_card_text.json
holds ours. Where they agree, identity is settled without trusting
either mapping.
"""

import importlib.util
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCRIPT = os.path.join(ROOT, 'scripts', 'triage_pokepricelab_report.py')

spec = importlib.util.spec_from_file_location('triage', SCRIPT)
triage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(triage)


def _row(set_, num, ours, ppl, url=''):
    return {'set': set_, 'number': num, 'our_product_id': str(ours),
            'ppl_product_id': str(ppl), 'url': url, 'verdict': 'disagree'}


def _prods(*specs):
    return {pid: {'idProduct': pid, 'name': name, 'idExpansion': exp}
            for pid, name, exp in specs}


# ── the money parser that a plain float() gets wrong ─────────────────

def test_money_survives_the_euro_suffix():
    # price_data.csv stores '0,15€'. float() on that raises, and a naive
    # guard turns every price into 0.00 — which reads as "no card is
    # expensive" and quietly buries the finding.
    assert triage.money('0,15€') == 0.15
    assert triage.money('1.234,56€') == 1234.56
    assert triage.money('260,24 €') == 260.24
    assert triage.money('') == 0.0
    assert triage.money(None) == 0.0
    assert triage.money('12.50') == 12.5


# ── classification ──────────────────────────────────────────────────

def test_our_mapping_is_wrong_when_the_card_text_matches_the_other_product():
    prods = _prods((1, 'Skarmory [Metal Sound | Swift]', 100),
                   (2, 'Skarmory [Claw | Drill Peck]', 100))
    klasse, _, _ = triage.classify(
        _row('BCR', '95', 1, 2), prods,
        {'BCR|95': 'Claw Drill Peck'},
        {('BCR', '95'): {'name': 'Skarmory'}})
    assert klasse == 'wrong-product'


def test_the_reverse_is_reported_too_not_assumed_away():
    prods = _prods((1, 'Talonflame [Acrobatics | Jet Shoot]', 100),
                   (2, 'Talonflame (Theme Deck)', 100))
    klasse, _, _ = triage.classify(
        _row('PHF', '10', 1, 2), prods,
        {'PHF|10': 'Acrobatics Jet Shoot'},
        {('PHF', '10'): {'name': 'Talonflame'}})
    assert klasse == 'ppl-wrong'


def test_two_products_for_one_card_are_not_an_identity_error():
    prods = _prods((1, 'Irida', 100), (2, 'Irida', 100))
    klasse, _, _ = triage.classify(
        _row('ASR', '147', 1, 2), prods, {}, {('ASR', '147'): {'name': 'Irida'}})
    assert klasse == 'duplicate'


def test_a_url_pointing_at_another_card_is_our_index_bug():
    # BS 52 is Machop; the indexed URL is base-set-2-marowak-52.
    prods = _prods((1, 'Machop [Low Kick]', 1523),
                   (2, 'Marowak [Bonemerang | Call for Friend]', 1527))
    klasse, _, _ = triage.classify(
        _row('BS', '52', 1, 2, 'https://pokepricelab.com/de/catalog/base-set-2-marowak-52'),
        prods, {}, {('BS', '52'): {'name': 'Machop'}})
    assert klasse == 'bad-index'


def test_another_printing_of_the_same_card_is_not_a_bad_index():
    prods = _prods((1, 'Nidoking [Thrash | Toxic]', 1523),
                   (2, 'Nidoking [Thrash | Toxic]', 1527))
    klasse, _, _ = triage.classify(
        _row('BS', '11', 1, 2), prods, {}, {('BS', '11'): {'name': 'Nidoking'}})
    assert klasse != 'bad-index'


def test_no_card_text_means_undecided_never_a_guess():
    prods = _prods((1, 'Axew [Extra Chop | Dragon Claw]', 100),
                   (2, 'Axew [Brat Snack | Dragon Claw]', 100))
    klasse, _, _ = triage.classify(
        _row('BKT', '108', 1, 2), prods, {}, {('BKT', '108'): {'name': 'Axew'}})
    assert klasse == 'undecided'


def test_ambiguous_attack_text_is_undecided():
    """Both products' attacks appear in the card text — no evidence."""
    prods = _prods((1, 'Pikachu [Thunder Shock]', 100),
                   (2, 'Pikachu [Thunder Shock | Quick Attack]', 100))
    klasse, _, _ = triage.classify(
        _row('BS', '58', 1, 2), prods,
        {'BS|58': 'Thunder Shock Quick Attack'},
        {('BS', '58'): {'name': 'Pikachu'}})
    assert klasse == 'undecided'


# ── helpers ─────────────────────────────────────────────────────────

def test_attack_and_species_extraction():
    assert triage.attacks_of('Skarmory [Claw | Drill Peck]') == 'claw drill peck'
    assert triage.attacks_of('Irida') == ''
    assert triage.species_of('Hisuian Overqwil [Dirty Press]') == 'hisuian overqwil'
    assert triage.species_of('Talonflame (Theme Deck)') == 'talonflame'


def test_the_triage_never_writes_the_mapping():
    src = open(SCRIPT, encoding='utf-8').read()
    assert 'cardmarket_id_mapping' not in src
    assert src.count("open(OUT, 'w'") == 1
