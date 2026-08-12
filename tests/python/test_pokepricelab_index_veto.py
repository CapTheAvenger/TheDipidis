"""The name veto in the pokepricelab catalog index.

Step 1's set-slug fold-up keeps the longest unambiguous prefix per set
code and then matches any URL starting with it. `base-set` also prefixes
`base-set-2-…`, so BS 52 (Machop) was indexed to Base Set 2's Marowak,
`forbidden-light` swallowed `forbidden-light-jp-…`, and a run of SSH
numbers landed on `sword-shield-starter-set-…`. 61 such rows reached the
step-2 cross-check and produced verdicts read off the wrong card's page.

The guard is a veto: identity stays structural (set slug + trailing
number) and the name may only REJECT a URL the structure accepted. These
tests pin the two escape hatches that keep it from over-rejecting.
"""

import importlib.util
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCRIPT = os.path.join(ROOT, 'scripts', 'build_pokepricelab_index.py')

spec = importlib.util.spec_from_file_location('bpi', SCRIPT)
bpi = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bpi)


def test_vetoes_a_slug_naming_a_different_card():
    assert bpi.name_vetoes('base-set-2-marowak', 'Machop') is True
    assert bpi.name_vetoes('forbidden-light-jp-litleo', 'Fennekin') is True
    assert bpi.name_vetoes('sword-shield-starter-set-lucario-vstar-crobat-v',
                           'Grookey') is True


def test_keeps_a_legitimate_slug_with_extras():
    # Old-era slugs carry the card's level; Mega forms differ only in
    # where the hyphen falls.
    assert bpi.name_vetoes('arceus-charizard-lv-60', 'Charizard') is False
    assert bpi.name_vetoes('ancient-origins-mampharos-ex', 'M Ampharos EX') is False
    assert bpi.name_vetoes('sv-black-star-promos-n-s-darmanitan',
                           "N's Darmanitan") is False
    assert bpi.name_vetoes('base-set-machop', 'Machop') is False


def test_short_names_never_veto():
    # The trainer card "N" flattens to "n" and would match everything.
    assert bpi.name_vetoes('anything-at-all', 'N') is False
    assert bpi.name_vetoes('anything-at-all', '') is False
