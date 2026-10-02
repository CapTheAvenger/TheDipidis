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


# ── Etappenabruf (SC-12, 02.10.2026) ─────────────────────────────────────
#
# Lauf #4 und #5 (30.09.) hingen stundenlang an pokepricelab.com. Heute holt
# jeder Lauf, was in sein Zeitbudget passt, merkt sich die fertigen Teile und
# macht beim naechsten Mal dort weiter. Geschrieben wird nur bei vollstaendigem
# Satz. Ausgefuehrt, nicht gelesen: main() laeuft mit einer nachgebauten
# Sitzung (TESTDATEN).

import time


class _Antwort:
    def __init__(self, status, text):
        self.status_code, self.text = status, text

    def raise_for_status(self):
        if self.status_code != 200:
            raise RuntimeError(self.status_code)


class _Sitzung:
    def __init__(self, kaputt, protokoll):
        self.kaputt, self.headers, self.protokoll = kaputt, {}, protokoll

    def get(self, url, timeout=None):
        self.protokoll.append(url)
        if url.endswith('/sitemap.xml'):
            return _Antwort(200, '<sitemapindex><sitemap><loc>https://pokepricelab.com/sitemap-1.xml</loc>'
                                 '</sitemap><sitemap><loc>https://pokepricelab.com/sitemap-2.xml</loc>'
                                 '</sitemap></sitemapindex>')
        if url.endswith('sitemap-2.xml') and self.kaputt:
            return _Antwort(503, '')
        return _Antwort(200, '<urlset><url><loc>https://pokepricelab.com/de/catalog/probe-karte-1</loc></url>'
                             '<url><loc>https://pokepricelab.com/de/blog/kein-katalog</loc></url></urlset>')


def _lauf(monkeypatch, tmp_path, kaputt, argv=(), protokoll=None):
    import requests
    ziel = tmp_path / 'index.csv'
    if not ziel.exists():
        ziel.write_text('BESTAND\n', encoding='utf-8')
    protokoll = [] if protokoll is None else protokoll
    monkeypatch.setattr(bpi, 'OUT', str(ziel))
    monkeypatch.setattr(bpi, 'PACE', 0)
    monkeypatch.setattr(requests, 'Session', lambda: _Sitzung(kaputt, protokoll))
    monkeypatch.setattr(bpi, 'load_our_cards', lambda: {})
    monkeypatch.setattr(bpi, 'load_our_expansions', lambda: {})
    monkeypatch.setattr(bpi, 'load_our_names', lambda: {})
    fort = str(tmp_path / 'fortschritt.json.gz')
    rc = bpi.main(['--fortschritt', fort, *argv])
    return rc, ziel.read_text(encoding='utf-8'), fort, protokoll


def test_fehlt_ein_teil_wird_nichts_geschrieben_aber_der_lauf_ist_nicht_rot(monkeypatch, tmp_path, capsys):
    rc, inhalt, fort, _ = _lauf(monkeypatch, tmp_path, kaputt=True)
    assert inhalt == 'BESTAND\n', 'der Index wurde trotz fehlendem Teil neu geschrieben'
    assert rc == 0, 'eine Etappe ohne Fehler im Code darf nicht rot enden'
    out = capsys.readouterr().out
    assert '::notice::' in out and '::error::' not in out
    st = bpi.lade_fortschritt(fort)
    assert list(st['teile']) == ['https://pokepricelab.com/sitemap-1.xml'], st['teile'].keys()
    # nur Katalog-URLs werden gemerkt, der Blog-Link nicht
    assert st['teile']['https://pokepricelab.com/sitemap-1.xml'] == [
        'https://pokepricelab.com/de/catalog/probe-karte-1']


def test_steht_der_satz_zu_lange_offen_wird_der_lauf_rot(monkeypatch, tmp_path, capsys):
    import requests
    fort = tmp_path / 'fortschritt.json.gz'
    bpi.speichere_fortschritt(str(fort), {
        'gestartet': time.time() - (bpi.STEHEN_TAGE + 1) * 86400, 'fertig_am': None,
        'teile': {'https://pokepricelab.com/sitemap-1.xml': []}})
    rc, inhalt, _, _ = _lauf(monkeypatch, tmp_path, kaputt=True)
    assert rc == 1, 'ein Satz, der laenger als STEHEN_TAGE offen steht, muss rot werden'
    assert inhalt == 'BESTAND\n'
    assert '::error::' in capsys.readouterr().out


def test_die_fortsetzung_holt_fertige_teile_nicht_noch_einmal(monkeypatch, tmp_path):
    rc1, _, fort, _ = _lauf(monkeypatch, tmp_path, kaputt=True)
    assert rc1 == 0
    rc2, inhalt, _, prot = _lauf(monkeypatch, tmp_path, kaputt=False)
    assert rc2 == 0
    assert inhalt.lstrip('\ufeff').startswith('set,number'), 'der volle Satz wurde nicht geschrieben'
    teile = [u for u in prot if 'sitemap-' in u]
    assert teile == ['https://pokepricelab.com/sitemap-2.xml'], (
        'die Fortsetzung hat bereits gelesene Teile noch einmal abgerufen: %s' % teile)
    assert bpi.lade_fortschritt(fort)['fertig_am'], 'fertig wird nicht vermerkt'


def test_verfaelschung_ohne_gedaechtnis_holt_alles_noch_einmal(monkeypatch, tmp_path):
    """Probe: wirft die Fortsetzung ihren Stand weg, schlaegt die Pruefung oben an."""
    orig = bpi.hole_etappe

    def ohne_gedaechtnis(session, subs, st, **kw):
        st['teile'].clear()
        return orig(session, subs, st, **kw)
    _lauf(monkeypatch, tmp_path, kaputt=True)
    monkeypatch.setattr(bpi, 'hole_etappe', ohne_gedaechtnis)
    _, _, _, prot = _lauf(monkeypatch, tmp_path, kaputt=False)
    assert [u for u in prot if 'sitemap-' in u] == [
        'https://pokepricelab.com/sitemap-1.xml', 'https://pokepricelab.com/sitemap-2.xml']


def test_ein_frischer_index_wird_nicht_neu_geholt(monkeypatch, tmp_path, capsys):
    bpi.speichere_fortschritt(str(tmp_path / 'fortschritt.json.gz'), {
        'gestartet': time.time() - 86400, 'fertig_am': time.time() - 86400, 'teile': {}})
    rc, inhalt, _, prot = _lauf(monkeypatch, tmp_path, kaputt=False)
    assert rc == 0 and inhalt == 'BESTAND\n'
    assert prot == [], 'ein aktueller Index loest trotzdem Abrufe aus: %s' % prot
    assert 'aktuell' in capsys.readouterr().out


def test_ein_abgelaufener_index_beginnt_von_vorn(monkeypatch, tmp_path):
    bpi.speichere_fortschritt(str(tmp_path / 'fortschritt.json.gz'), {
        'gestartet': time.time() - 20 * 86400,
        'fertig_am': time.time() - (bpi.FRISCH_TAGE + 1) * 86400, 'teile': {}})
    rc, inhalt, _, prot = _lauf(monkeypatch, tmp_path, kaputt=False)
    assert rc == 0 and inhalt.lstrip('\ufeff').startswith('set,number')
    assert len([u for u in prot if 'sitemap-' in u]) == 2


def test_das_zeitbudget_haelt_die_etappe_an(tmp_path):
    uhr = iter(range(0, 1000, 10))
    protokoll = []
    sitzung = _Sitzung(False, protokoll)
    subs = ['https://pokepricelab.com/sitemap-%d.xml' % i for i in range(1, 7)]
    st = {'gestartet': 1, 'fertig_am': None, 'teile': {}}
    offen = bpi.hole_etappe(sitzung, subs, st, jetzt=lambda: next(uhr), budget_s=35, pace=0)
    assert 0 < len(st['teile']) < len(subs), 'das Budget hat nichts begrenzt'
    assert offen == [u for u in subs if u not in st['teile']]
    # Gegenprobe: ohne Budget kommt alles
    st2 = {'gestartet': 1, 'fertig_am': None, 'teile': {}}
    assert bpi.hole_etappe(_Sitzung(False, []), subs, st2, pace=0) == []


def test_vollstaendig_wird_geschrieben(monkeypatch, tmp_path):
    """Gegenprobe: ohne Ausfall schreibt main() wie bisher."""
    rc, inhalt, _, _ = _lauf(monkeypatch, tmp_path, kaputt=False)
    assert rc == 0, rc
    assert inhalt.lstrip('\ufeff').startswith('set,number'), inhalt[:40]


# ── Der Ablauf pusht nur bei vollstaendigem Satz ─────────────────────────

def _schritte(text):
    import yaml
    y = yaml.safe_load(text)
    return y['jobs']['index']['steps'], y


def _ablauf_text():
    return open(os.path.join(ROOT, '.github', 'workflows', 'pokepricelab-index.yml'),
                encoding='utf-8').read()


def _pruefe_tor(text):
    """Jeder Schritt nach `bau` haengt an steps.bau.outputs.schreiben."""
    schritte, y = _schritte(text)
    ids = [s.get('id') for s in schritte]
    assert 'bau' in ids, 'der Bau-Schritt hat keine id'
    nach = schritte[ids.index('bau') + 1:]
    assert any('daten_pushen' in (s.get('run') or '') for s in nach), 'der Push-Schritt fehlt'
    ungedeckt = [s.get('name') for s in nach
                 if 'bau.outputs.schreiben' not in str(s.get('if', ''))]
    return ungedeckt, y


def test_der_ablauf_pusht_nur_wenn_der_satz_vollstaendig_ist():
    ungedeckt, y = _pruefe_tor(_ablauf_text())
    assert not ungedeckt, 'diese Schritte laufen auch bei unvollstaendigem Satz: %s' % ungedeckt
    assert '--budget-min' in _ablauf_text(), 'der Lauf hat kein Zeitbudget'
    assert 'schedule' in (y.get('on') or y.get(True) or {}), 'der Ablauf hat keinen Zeitplan'


def test_verfaelschung_ohne_tor_am_push_schritt_wird_erkannt():
    kaputt = _ablauf_text().replace(
        "      - name: Commit index\n        if: steps.bau.outputs.schreiben == 'true'\n",
        "      - name: Commit index\n")
    assert kaputt != _ablauf_text()
    ungedeckt, _ = _pruefe_tor(kaputt)
    assert 'Commit index' in ungedeckt


def test_der_stand_der_etappe_wird_zwischen_laeufen_gemerkt():
    schritte, _ = _schritte(_ablauf_text())
    cache = [s for s in schritte if str(s.get('uses', '')).startswith('actions/cache@')]
    assert cache and cache[0]['with']['path'] == '.cache'
    assert cache[0]['with']['restore-keys'], 'ohne restore-keys findet die naechste Etappe den Stand nicht'
    assert os.path.basename(os.path.dirname(bpi.FORTSCHRITT)) == '.cache', (
        'das Skript schreibt den Stand nicht dorthin, wo der Cache ihn holt')
