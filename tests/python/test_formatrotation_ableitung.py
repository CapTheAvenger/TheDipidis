"""Die Rotation darf nicht an einer handgepflegten Zeile haengen.

ANLASS (12.09.2026)
-------------------
`previous_format_key` und `set_addition_only` in data/format_window.json
wurden vom Wochenlauf nur BEWAHRT. Solange sich nichts dreht, ist das
richtig. Im Moment der Rotation ist es falsch: beim Wechsel PBL -> 30C
am 25.09.2026 waere previous_format_key auf "TEF-CRI" stehen geblieben —
ZWEI Formate zurueck statt eins. Die Predictor-Stufen 5.5/5.6/5.8/5.9
haetten die Archetypanteile eines laengst vorbeigezogenen Formats
gezogen, und zwar in der Woche vor Frankfurt (26.09.2026).

Dasselbe Muster ein zweites Mal: ROTATIONEN in limitless_api_scraper.py
ist ebenfalls eine Handliste. Am Tag der Rotation steht das neue Format
noch nicht drin, und `formatschluessel()` ordnete alle Turniere danach
weiter dem ALTEN Fenster zu. Gemeldet wurde das als ::warning:: auf
einem taeglichen Lauf — also gar nicht.

Beides ist ableitbar, nicht zu raten. Diese Datei haelt die Ableitung
fest UND belegt sie an der letzten echten Rotation.
"""
import json
import os
import re
import shutil
import sys
import tempfile

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.dirname(os.path.dirname(HIER))
DATEN = os.path.join(WURZEL, 'data')
QUELLE_SETS = os.path.join(WURZEL, 'backend', 'core', 'update_sets.py')
QUELLE_API = os.path.join(WURZEL, 'backend', 'scrapers',
                          'limitless_api_scraper.py')


@pytest.fixture
def daten():
    """Echte sets_metadata.json und format_window.json in einem Kopierbaum."""
    tmp = tempfile.mkdtemp()
    for name in ('sets_metadata.json', 'format_window.json'):
        pfad = os.path.join(DATEN, name)
        if not os.path.exists(pfad):
            pytest.skip(f'{name} fehlt — Datenverzeichnis nicht bestueckt')
        shutil.copy(pfad, tmp)
    yield tmp
    shutil.rmtree(tmp, ignore_errors=True)


def _ableiten(alt_aeltest, alt_set, neu_aeltest, neu_set):
    """Dieselbe Regel wie update_sets.py — hier zum Nachrechnen."""
    if not (alt_set and neu_set and neu_set != alt_set):
        return None
    return (f'{alt_aeltest}-{alt_set}', alt_aeltest == neu_aeltest)


# ── 1 · DIE ABLEITUNG SELBST ────────────────────────────────────────

def test_ableitung_trifft_die_letzte_echte_rotation(daten):
    """CRI -> PBL am 17.07.2026 muss genau das ergeben, was dasteht.

    Das ist der Beleg, nicht die Behauptung: der Wert in der Datei wurde
    damals von Hand gesetzt. Rechnet die Regel ihn nach, beschreibt sie
    die Wirklichkeit.
    """
    fw = json.load(open(os.path.join(daten, 'format_window.json'),
                        encoding='utf-8'))
    schluessel, nur_ergaenzt = _ableiten('TEF', 'CRI', 'TEF', 'PBL')
    assert schluessel == fw.get('previous_format_key'), (
        'die Ableitung trifft den handgepflegten Wert nicht mehr — '
        'entweder hat sich die Schreibweise des Schluessels geaendert '
        'oder die Datei wurde von Hand verstellt')
    assert nur_ergaenzt == fw.get('set_addition_only')


def test_set_dazu_und_echte_rotation_sind_verschieden():
    """set_addition_only haengt daran, ob das UNTERSTE Set stehen bleibt."""
    assert _ableiten('TEF', 'PBL', 'TEF', '30C') == ('TEF-PBL', True), \
        'TEF bleibt legal — das ist eine Ergaenzung, keine Rotation'
    assert _ableiten('TEF', 'PBL', 'POR', '30C') == ('TEF-PBL', False), \
        'TEF faellt raus — die Anteile des Vorformats taugen dann nicht'


def test_ohne_wechsel_wird_nichts_abgeleitet():
    assert _ableiten('TEF', 'PBL', 'TEF', 'PBL') is None


# ── 2 · DASS DER QUELLTEXT ES AUCH TUT ──────────────────────────────

def test_update_sets_leitet_ab_statt_nur_zu_bewahren():
    quelle = open(QUELLE_SETS, encoding='utf-8').read()
    assert "out['previous_format_key'] = abgeleitet" in quelle, \
        'update_sets.py bewahrt den Wert wieder nur, statt ihn abzuleiten'
    assert "out['set_addition_only'] = nur_ergaenzt" in quelle
    # Der Bewahrpfad muss bleiben — ohne Rotation ist Bewahren richtig.
    assert re.search(r"for k in \('previous_format_key', 'set_addition_only'\)",
                     quelle), 'der Bewahrpfad ohne Rotation ist verschwunden'


def test_riegel_gegen_vorformat_gleich_laufendes_format():
    """Der stillste Fehler: jemand traegt den NEUEN Schluessel ein.

    Dann rechnen die Stufen das Format gegen sich selbst und melden
    ueberhaupt keine Veraenderung — nichts sieht kaputt aus.
    """
    quelle = open(QUELLE_SETS, encoding='utf-8').read()
    assert 'das ist das LAUFENDE Format' in quelle, \
        'der Riegel gegen previous_format_key == laufendes Format fehlt'


# ── 3 · DAS FENSTER DER API-KETTE ───────────────────────────────────

def _api_modul():
    pfad = os.path.join(WURZEL, 'backend', 'scrapers')
    if pfad not in sys.path:
        sys.path.insert(0, pfad)
    try:
        import limitless_api_scraper as modul
    except Exception as fehler:          # pragma: no cover
        pytest.skip(f'limitless_api_scraper nicht ladbar: {fehler}')
    return modul


def test_laufendes_fenster_kommt_aus_format_window(daten):
    """Am Tag der Rotation kennt die Handliste das neue Format noch nicht."""
    modul = _api_modul()
    meta_pfad = os.path.join(daten, 'sets_metadata.json')
    fw_pfad = os.path.join(daten, 'format_window.json')

    meta = json.load(open(meta_pfad, encoding='utf-8'))
    meta['30C'] = {'release_date': '2026-09-16', 'name': 'Pruefset'}
    json.dump(meta, open(meta_pfad, 'w', encoding='utf-8'))

    fw = json.load(open(fw_pfad, encoding='utf-8'))
    fw['current_set'] = '30C'
    fw['oldest_legal_set'] = 'TEF'
    json.dump(fw, open(fw_pfad, 'w', encoding='utf-8'))

    modul._fenster_zwischenspeicher = None
    fenster = modul.formatfenster(daten)
    assert fenster[0][0] == 'TEF-30C', (
        '30C steht nicht in ROTATIONEN — genau dafuer ist die Ableitung da. '
        f'Oberstes Fenster ist {fenster[0][0]}')

    # Frankfurt, 26.09.2026.
    assert modul.formatschluessel('2026-09-26', daten) == 'TEF-30C'
    # Ein Turnier VOR dem Release gehoert weiter ins alte Fenster.
    assert modul.formatschluessel('2026-09-15', daten) == 'TEF-PBL'
    modul._fenster_zwischenspeicher = None


def test_abgeleitetes_fenster_loest_keinen_fehlalarm_aus(daten):
    """Der Waechter darf nicht das Set melden, das gerade richtig laeuft."""
    modul = _api_modul()
    meta_pfad = os.path.join(daten, 'sets_metadata.json')
    fw_pfad = os.path.join(daten, 'format_window.json')

    meta = json.load(open(meta_pfad, encoding='utf-8'))
    meta['30C'] = {'release_date': '2026-09-16', 'name': 'Pruefset'}
    json.dump(meta, open(meta_pfad, 'w', encoding='utf-8'))
    fw = json.load(open(fw_pfad, encoding='utf-8'))
    fw['current_set'] = '30C'
    fw['oldest_legal_set'] = 'TEF'
    json.dump(fw, open(fw_pfad, 'w', encoding='utf-8'))

    modul._fenster_zwischenspeicher = None
    assert modul.fehlendes_fenster(daten) is None, \
        'der Waechter meldet das Set, das die Ableitung gerade einordnet'
    modul._fenster_zwischenspeicher = None


def test_ohne_format_window_gilt_die_handliste(daten):
    """Faellt die Datei weg, ist der Stand von vorher — nicht schlechter."""
    modul = _api_modul()
    os.remove(os.path.join(daten, 'format_window.json'))
    modul._fenster_zwischenspeicher = None
    fenster = modul.formatfenster(daten)
    assert fenster, 'ohne format_window.json bleibt gar kein Fenster uebrig'
    assert fenster[0][0] == 'TEF-PBL'
    modul._fenster_zwischenspeicher = None
