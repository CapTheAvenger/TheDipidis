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


# ── Ein Teil-Sitemap fehlt: nichts schreiben (30.09.2026) ────────────────
#
# Lauf #4 und #5 hingen stundenlang an pokepricelab.com. Bis dahin wurde
# ein uebersprungenes Teil-Sitemap nur ins Log geschrieben und der Index
# trotzdem neu geschrieben — ohne die fehlenden Zeilen. Ausgefuehrt, nicht
# gelesen: main() laeuft mit einer nachgebauten Sitzung (TESTDATEN).

class _Antwort:
    def __init__(self, status, text):
        self.status_code, self.text = status, text

    def raise_for_status(self):
        if self.status_code != 200:
            raise RuntimeError(self.status_code)


class _Sitzung:
    def __init__(self, kaputt):
        self.kaputt, self.headers = kaputt, {}

    def get(self, url, timeout=None):
        if url.endswith('/sitemap.xml'):
            return _Antwort(200, '<sitemapindex><sitemap><loc>https://pokepricelab.com/sitemap-1.xml</loc>'
                                 '</sitemap><sitemap><loc>https://pokepricelab.com/sitemap-2.xml</loc>'
                                 '</sitemap></sitemapindex>')
        if url.endswith('sitemap-2.xml') and self.kaputt:
            return _Antwort(503, '')
        return _Antwort(200, '<urlset><url><loc>https://pokepricelab.com/de/catalog/probe-karte-1</loc></url></urlset>')


def _lauf(monkeypatch, tmp_path, kaputt):
    import requests
    ziel = tmp_path / 'index.csv'
    ziel.write_text('BESTAND\n', encoding='utf-8')
    monkeypatch.setattr(bpi, 'OUT', str(ziel))
    monkeypatch.setattr(bpi, 'PACE', 0)
    monkeypatch.setattr(requests, 'Session', lambda: _Sitzung(kaputt))
    monkeypatch.setattr(bpi, 'load_our_cards', lambda: {})
    monkeypatch.setattr(bpi, 'load_our_expansions', lambda: {})
    monkeypatch.setattr(bpi, 'load_our_names', lambda: {})
    return bpi.main(), ziel.read_text(encoding='utf-8')


def test_fehlt_ein_teil_wird_nichts_geschrieben(monkeypatch, tmp_path, capsys):
    rc, inhalt = _lauf(monkeypatch, tmp_path, kaputt=True)
    assert rc != 0, 'ein fehlendes Teil-Sitemap endete mit Rueckgabe 0'
    assert inhalt == 'BESTAND\n', 'der Index wurde trotz fehlendem Teil neu geschrieben'
    assert '::error::' in capsys.readouterr().out


def test_vollstaendig_wird_geschrieben(monkeypatch, tmp_path):
    """Gegenprobe: ohne Ausfall schreibt main() wie bisher."""
    rc, inhalt = _lauf(monkeypatch, tmp_path, kaputt=False)
    assert rc == 0, rc
    assert inhalt.lstrip('\ufeff').startswith('set,number'), inhalt[:40]
