"""Deciding Cardmarket identity from our own card text.

Cardmarket disambiguates same-name products by the attacks in the
product name; pokemon_card_text.json holds ours. Where they agree,
identity is evidence rather than position.

The properties worth pinning are the ones that keep it honest: it
abstains on every kind of tie, it does not edit the mapping (which is
rebuilt daily anyway, so an edit would silently vanish), and a
half-resolved shift is held back rather than applied into a state where
two cards claim one product.
"""

import importlib.util
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCRIPT = os.path.join(ROOT, 'scripts', 'resolve_by_card_text.py')

spec = importlib.util.spec_from_file_location('rbct', SCRIPT)
rbct = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rbct)


def P(pid, name):
    return {'idProduct': pid, 'name': name}


def test_a_single_attack_match_decides():
    hit, why = rbct.resolve('Claw Drill Peck', [
        P(1, 'Skarmory [Metal Sound | Swift]'),
        P(2, 'Skarmory [Claw | Drill Peck]')])
    assert (hit['idProduct'], why) == (2, 'unique-attack-match')


def test_two_matching_candidates_are_a_tie_not_a_decision():
    hit, why = rbct.resolve('Thunder Shock Quick Attack', [
        P(1, 'Pikachu [Thunder Shock]'),
        P(2, 'Pikachu [Quick Attack]')])
    assert hit is None
    assert why.startswith('ambiguous')


def test_no_card_text_decides_nothing():
    hit, why = rbct.resolve('', [P(1, 'Skarmory [Claw | Drill Peck]')])
    assert (hit, why) == (None, 'no-card-text')


def test_products_without_an_attack_list_are_no_evidence():
    # Trainers and energies carry no attacks; a bare name must never win.
    hit, why = rbct.resolve('Some Text', [P(1, 'Irida'), P(2, 'Irida (Full Art)')])
    assert (hit, why) == (None, 'no-candidate-matches')


def test_a_partial_attack_overlap_does_not_count():
    """All of the product's attacks must appear, not just one."""
    hit, why = rbct.resolve('Claw', [P(1, 'Skarmory [Claw | Drill Peck]')])
    assert hit is None


def test_extra_attacks_in_our_text_are_tolerated():
    """Our text may carry an ability name too; the product's attacks
    still have to be fully present."""
    hit, _ = rbct.resolve('Garbotoxin Offensive Bomb Extra',
                          [P(1, 'Garbodor [Garbotoxin | Offensive Bomb]')])
    assert hit['idProduct'] == 1


def test_attack_and_species_helpers():
    assert rbct.attacks_of('Axew [Brat Snack | Dragon Claw]') == \
        ['brat', 'snack', 'dragon', 'claw']
    assert rbct.attacks_of('Irida') == []
    assert rbct.species_of("N's Darmanitan [Blaze]") == 'nsdarmanitan'


def test_money_reads_the_euro_suffixed_prices():
    assert rbct.money('255,45€') == 255.45
    assert rbct.money('1.234,56€') == 1234.56
    assert rbct.money('') == 0.0


def test_the_script_cannot_write_the_mapping():
    """cardmarket_id_mapping.csv is rebuilt from scratch on every scrape
    (data/_consumers.md), so an edit here would vanish silently. The
    corrections have to travel through a mapper layer instead."""
    src = open(SCRIPT, encoding='utf-8').read()
    assert "open(MAPPING, 'w'" not in src
    assert src.count("open(OUT, 'w'") == 1


def test_apply_refuses_and_says_why():
    import subprocess
    r = subprocess.run(['python3', SCRIPT, '--apply'],
                       capture_output=True, text=True, cwd=ROOT)
    assert r.returncode == 2
    assert 'rebuilt from' in r.stdout
