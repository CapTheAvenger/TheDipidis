import importlib.util, os
ROOT='/home/user/TheDipidis'
spec=importlib.util.spec_from_file_location('bpi', os.path.join(ROOT,'scripts','build_pokepricelab_index.py'))
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)

def test_vetoes_a_slug_naming_a_different_card():
    assert m.name_vetoes('base-set-2-marowak', 'Machop') is True
    assert m.name_vetoes('forbidden-light-jp-litleo', 'Fennekin') is True
    assert m.name_vetoes('sword-shield-starter-set-lucario-vstar-crobat-v', 'Grookey') is True

def test_keeps_a_legitimate_slug_with_extras():
    assert m.name_vetoes('arceus-charizard-lv-60', 'Charizard') is False
    assert m.name_vetoes('ancient-origins-mampharos-ex', 'M Ampharos EX') is False
    assert m.name_vetoes('sv-black-star-promos-n-s-darmanitan', "N's Darmanitan") is False
    assert m.name_vetoes('base-set-machop', 'Machop') is False

def test_short_names_never_veto():
    # The trainer card "N" flattens to "n" and would match everything.
    assert m.name_vetoes('anything-at-all', 'N') is False
    assert m.name_vetoes('anything-at-all', '') is False
