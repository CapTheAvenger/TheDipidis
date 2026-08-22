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

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCRIPT = os.path.join(ROOT, 'scripts', 'resolve_by_card_text.py')
BERICHT = os.path.join(ROOT, 'data', 'card_text_resolution.csv')


@pytest.fixture()
def bericht_unangetastet():
    """Legt data/card_text_resolution.csv nach dem Test zurueck.

    Ein Test darf getrackte Dateien nicht veraendern. Wer das Skript
    von Hand laufen laesst, will den neuen Bericht — wer die Tests
    laufen laesst, will ein sauberes Arbeitsverzeichnis."""
    vorher = None
    if os.path.exists(BERICHT):
        with open(BERICHT, 'rb') as f:
            vorher = f.read()
    try:
        yield
    finally:
        if vorher is not None:
            with open(BERICHT, 'wb') as f:
                f.write(vorher)

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
        P(1, 'Pikachu [Thunder Shock | Quick Attack]'),
        P(2, 'Raichu [Thunder Shock | Quick Attack]')])
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


def test_a_product_listing_fewer_attacks_than_the_card_cannot_win():
    """Containment would let a sibling naming only B match a card with
    attacks A+B. Equality is what stops that."""
    hit, _ = rbct.resolve('Claw Drill Peck', [P(1, 'Skarmory [Claw]')])
    assert hit is None


def test_the_variant_tag_counts_as_evidence_not_as_the_whole_evidence():
    """Unown [Z] [Shuffle | Hidden Power]: reading only the first bracket
    decided on the single token 'z'; reading only the last makes every
    Unown in the set identical. Both together identify exactly one."""
    cands = [P(1, 'Unown [Z] [Shuffle | Hidden Power]'),
             P(2, 'Unown [A] [Shuffle | Hidden Power]')]
    hit, _ = rbct.resolve('Shuffle Hidden Power Z', cands)
    assert hit['idProduct'] == 1
    hit, why = rbct.resolve('Shuffle Hidden Power', cands)
    assert hit is None, 'without the tag neither candidate may win'


def test_a_single_shared_token_is_never_enough():
    hit, _ = rbct.resolve('Z', [P(1, 'Unown [Z]')])
    assert hit is None


def test_extra_words_in_our_text_break_the_match():
    """Equality means equality — an unexplained extra token is a reason
    to abstain, not to decide."""
    hit, _ = rbct.resolve('Garbotoxin Offensive Bomb Extra',
                          [P(1, 'Garbodor [Garbotoxin | Offensive Bomb]')])
    assert hit is None


def test_attack_and_species_helpers():
    assert rbct.attacks_of('Axew [Brat Snack | Dragon Claw]') == \
        ['brat', 'snack', 'dragon', 'claw']
    assert rbct.attacks_of('Unown [Z] [Shuffle | Hidden Power]') == \
        ['z', 'shuffle', 'hidden', 'power']
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


def test_apply_refuses_and_says_why(bericht_unangetastet):
    import subprocess
    r = subprocess.run(['python3', SCRIPT, '--apply'],
                       capture_output=True, text=True, cwd=ROOT)
    assert r.returncode == 2
    assert 'rebuilt from' in r.stdout


def test_der_testlauf_hinterlaesst_das_repo_sauber():
    """Der Test oben startet das Skript als Subprozess — dort ist
    __name__ == '__main__', also laeuft main() und schreibt seinen
    Bericht nach data/card_text_resolution.csv, bevor er --apply
    verweigert. Die Datei ist getrackt.

    Gemessen am 22.08.2026: ein `pytest tests/python` liess sie von
    1.314 auf 1.244 Zeilen schrumpfen und das Arbeitsverzeichnis
    schmutzig zurueck — dreimal in einer Nacht, jedes Mal von Hand
    zurueckgenommen. Zwei Merge-Skripte unter redesign/ umgehen das
    seit Monaten mit einem eigenen Handgriff, statt es zu beheben.

    Am Skript ist nichts falsch: es ist ein Berichtsskript, das seinen
    Bericht schreiben soll. Falsch war, dass ein TEST das ausloest und
    den Stand nicht zuruecklegt. Das erledigt jetzt die Fixture."""
    inhalt = open(BERICHT, encoding='utf-8-sig').read()
    assert inhalt.startswith('set,number,name'), (
        'card_text_resolution.csv hat nicht mehr ihren urspruenglichen Kopf — '
        'die Fixture hat den Stand nicht zurueckgelegt')
