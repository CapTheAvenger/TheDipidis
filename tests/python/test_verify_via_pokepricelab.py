"""Step 2 of the pokepricelab identity cross-check.

The one thing this script must never get wrong is WHICH id it reads.
The probe run showed that the same card has two ids depending on the URL
form — the base page states the card's own product, a `-eu-<id>` URL
states a sibling's:

    /de/catalog/sv-black-star-promos-n-s-darmanitan-181            -> 816614
    /fr/catalog/sv-black-star-promos-n-s-darmanitan-181-eu-817772  -> 817772

Reading identity out of the slug instead of the page therefore produces
contradictions that are pure artefact. These tests pin that the script
only ever targets base URLs, that extraction refuses when a page names
several ids, and that it cannot silently rewrite our mapping.
"""

import csv
import importlib.util
import os

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCRIPT = os.path.join(ROOT, 'scripts', 'verify_via_pokepricelab.py')


def _load(monkeypatch=None):
    spec = importlib.util.spec_from_file_location('vvp', SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


vvp = _load()


# ── extraction ──────────────────────────────────────────────────────

def test_reads_explicit_id_product_parameter():
    html = '<a href="https://www.cardmarket.com/de/Pokemon/Products/Singles/x?idProduct=816614">CM</a>'
    assert vvp.extract_id(html) == ('816614', 'idProduct-param')


def test_falls_back_to_a_bare_cardmarket_link():
    html = '<a href="https://www.cardmarket.com/de/Pokemon/Products/Singles/725303">buy</a>'
    pid, via = vvp.extract_id(html)
    assert pid == '725303'
    assert via == 'cardmarket-link'


def test_refuses_when_a_page_names_several_products():
    """A page that links siblings gives no evidence for a single id."""
    html = ('<a href="https://www.cardmarket.com/x?idProduct=816614">a</a>'
            '<a href="https://www.cardmarket.com/x?idProduct=817772">b</a>')
    pid, via = vvp.extract_id(html)
    assert pid is None
    assert via.startswith('ambiguous:')
    assert '816614' in via and '817772' in via


def test_repeated_mentions_of_one_id_are_still_decisive():
    html = ('idProduct=816614 ... idProduct=816614 ... '
            'https://www.cardmarket.com/de/Pokemon/Products/Singles/y?idProduct=816614')
    assert vvp.extract_id(html) == ('816614', 'idProduct-param')


def test_no_cardmarket_link_at_all():
    assert vvp.extract_id('<html><body>nothing here</body></html>') == (None, 'no-id')


def test_an_explicit_parameter_beats_a_bare_link_on_the_same_page():
    """Ordering of ID_PATTERNS is the guarantee — assert it, don't trust it."""
    html = ('<a href="https://www.cardmarket.com/de/Pokemon/Products/Singles/999999">x</a>'
            '<a href="https://www.cardmarket.com/de/Pokemon/Products/Singles/z?idProduct=816614">y</a>')
    pid, via = vvp.extract_id(html)
    assert (pid, via) == ('816614', 'idProduct-param')


# ── target selection ────────────────────────────────────────────────

def _write_fixture(tmp_path, index_rows, price_rows, mapping_rows):
    data = tmp_path / 'data'
    data.mkdir()
    def dump(name, fields, rows, bom=True):
        p = data / name
        with open(p, 'w', encoding='utf-8-sig' if bom else 'utf-8', newline='') as f:
            w = csv.DictWriter(f, fieldnames=fields)
            w.writeheader()
            w.writerows(rows)
        return str(p)
    idx = dump('idx.csv', ['set', 'number', 'url', 'product_id_in_url', 'lang'], index_rows)
    pr = dump('pr.csv', ['set', 'number', 'mapping_status'], price_rows)
    mp = dump('mp.csv', ['set', 'number', 'cardmarket_product_id'], mapping_rows)
    return idx, pr, mp


@pytest.fixture
def patched(tmp_path, monkeypatch):
    def _apply(index_rows, price_rows, mapping_rows):
        idx, pr, mp = _write_fixture(tmp_path, index_rows, price_rows, mapping_rows)
        monkeypatch.setattr(vvp, 'INDEX', idx)
        monkeypatch.setattr(vvp, 'PRICES', pr)
        monkeypatch.setattr(vvp, 'MAPPING', mp)
        monkeypatch.setattr(vvp, 'OUT', str(tmp_path / 'out.csv'))
    return _apply


def test_sibling_urls_are_never_targeted(patched):
    """The `-eu-<id>` rows must not become fetch targets — that is the bug
    the whole design exists to avoid."""
    patched(
        index_rows=[
            {'set': 'SVP', 'number': '181', 'lang': 'de', 'product_id_in_url': '',
             'url': 'https://pokepricelab.com/de/catalog/x-181'},
            {'set': 'SVP', 'number': '181', 'lang': 'fr', 'product_id_in_url': '817772',
             'url': 'https://pokepricelab.com/fr/catalog/x-181-eu-817772'},
        ],
        price_rows=[{'set': 'SVP', 'number': '181', 'mapping_status': 'unverified'}],
        mapping_rows=[{'set': 'SVP', 'number': '181', 'cardmarket_product_id': '816614'}],
    )
    targets, _ = vvp.load_targets()
    assert targets == [(('SVP', '181'), 'https://pokepricelab.com/de/catalog/x-181')]


def test_prefers_the_german_page(patched):
    patched(
        index_rows=[
            {'set': 'OBF', 'number': '223', 'lang': 'it', 'product_id_in_url': '',
             'url': 'it-url'},
            {'set': 'OBF', 'number': '223', 'lang': 'de', 'product_id_in_url': '',
             'url': 'de-url'},
            {'set': 'OBF', 'number': '223', 'lang': '', 'product_id_in_url': '',
             'url': 'default-url'},
        ],
        price_rows=[{'set': 'OBF', 'number': '223', 'mapping_status': 'unverified'}],
        mapping_rows=[],
    )
    targets, _ = vvp.load_targets()
    assert targets[0][1] == 'de-url'


def test_only_unverified_cards_are_in_scope_by_default(patched):
    patched(
        index_rows=[
            {'set': 'A', 'number': '1', 'lang': 'de', 'product_id_in_url': '', 'url': 'u1'},
            {'set': 'B', 'number': '2', 'lang': 'de', 'product_id_in_url': '', 'url': 'u2'},
        ],
        price_rows=[
            {'set': 'A', 'number': '1', 'mapping_status': 'unverified'},
            {'set': 'B', 'number': '2', 'mapping_status': 'ok'},
        ],
        mapping_rows=[],
    )
    assert [k for k, _ in vvp.load_targets()[0]] == [('A', '1')]
    assert sorted(k for k, _ in vvp.load_targets(only_unverified=False)[0]) == \
        [('A', '1'), ('B', '2')]


# ── resume behaviour ────────────────────────────────────────────────

def test_failed_fetches_are_retried_but_verdicts_are_not(tmp_path, monkeypatch):
    out = tmp_path / 'out.csv'
    with open(out, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=vvp.FIELDS)
        w.writeheader()
        w.writerow({'set': 'A', 'number': '1', 'our_product_id': '1',
                    'ppl_product_id': '1', 'verdict': 'agree', 'extracted_via': '',
                    'url': '', 'checked_at': ''})
        w.writerow({'set': 'B', 'number': '2', 'our_product_id': '2',
                    'ppl_product_id': '', 'verdict': 'fetch-failed', 'extracted_via': '',
                    'url': '', 'checked_at': ''})
    monkeypatch.setattr(vvp, 'OUT', str(out))
    done = vvp.load_done()
    assert ('A', '1') in done, 'a settled verdict should not be re-fetched'
    assert ('B', '2') not in done, 'a failed fetch must be retried'


# ── trust discipline ────────────────────────────────────────────────

def test_the_script_cannot_write_the_mapping():
    """Report, don't repair — assert it at the source level, because this
    is the property that protects card identity."""
    src = open(SCRIPT, encoding='utf-8').read()
    body = src.split('def main(')[1]
    assert 'MAPPING' not in body.replace('load_our_mapping', ''), \
        'main() must not touch the mapping file'
    # The only file it opens for writing is the report.
    assert src.count("open(OUT, 'w'") == 1
    assert "open(MAPPING, 'w'" not in src


def test_promote_is_refused():
    import subprocess
    r = subprocess.run(['python3', SCRIPT, '--promote'],
                       capture_output=True, text=True, cwd=ROOT)
    assert r.returncode == 2
    assert 'deliberately not implemented' in r.stdout
