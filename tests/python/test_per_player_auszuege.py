"""SC-45 (04.11.2026): die Decklisten je Spieler liegen als Auszuege je Format
und Monat im Repo, der Monolith (99,5 MiB, mit Puebla/Danzig 106,5 MiB >
GitHubs 100-MiB-Grenze) nicht mehr.

Zusicherungen:
  1. Schluessel = Format + Monat des Turnierdatums; ohne Format `_unsorted`,
     ohne Datum `<META>_unbekannt`.
  2. aufteilen -> zusammensetzen ist verlustfrei (Zeilen als Menge gleich,
     Kopfzeile gleich), das Verzeichnis nennt jeden Auszug mit Zeilenzahl.
  3. Ein Schluessel, der im Monolithen nicht mehr vorkommt, verliert seinen
     Auszug (kein Geist, der beim naechsten Zusammensetzen zurueckkaeme).
  4. Schrumpf-Waechter: unter 0,5 der bisherigen Zeilen wird nichts
     geschrieben (rc 2), unter 0,75 gewarnt — Prague-Fall (halb gesaeter
     Arbeitsordner) ueberschreibt die Historie nicht.
  5. pfade(meta=...) liefert nur die Auszuege dieses Formats, in fester
     Reihenfolge, aus dem Verzeichnis.
  6. In data/ liegt kein Monolith, jeder Auszug steht im Verzeichnis, keiner
     ist ueber 100 MiB.
Verfaelschungsproben (gemessen 04.11.): Schluessel ohne Monat -> 1 und 2 rot;
Entfernen weg -> 3 rot; Waechter weg -> 4 rot.
"""
import csv
import importlib.util
import json
import os

import pytest

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SKRIPT = os.path.join(WURZEL, 'scripts', 'per_player_auszuege.py')
DATA = os.path.join(WURZEL, 'data')

KOPF = ['tournament_id', 'limitless_tournament_id', 'tournament_name', 'tournament_date',
        'meta', 'place', 'player_name', 'deck_archetype', 'deck_slug', 'wins', 'losses',
        'ties', 'card_name', 'card_identifier', 'set_code', 'set_number', 'count', 'type',
        'is_ace_spec', 'quelle', 'spielerzahl', 'druck_quelle', 'scraped_at']


def _modul():
    spec = importlib.util.spec_from_file_location('per_player_auszuege', SKRIPT)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def _zeile(tid, datum, meta, name='Dreepy', quelle='papier'):
    z = {k: '' for k in KOPF}
    z.update(tournament_id=tid, tournament_date=datum, meta=meta, place='1',
             player_name='P ' + tid, deck_archetype='Dragapult', card_name=name,
             set_code='TWM', set_number='128', count='4', quelle=quelle)
    return z


def _schreibe_monolith(ordner, zeilen):
    os.makedirs(ordner, exist_ok=True)
    with open(os.path.join(ordner, 'tournament_decklists_per_player.csv'), 'w',
              newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=KOPF)
        w.writeheader()
        w.writerows(zeilen)


BEISPIEL = [
    _zeile('0078', '2026-10-25', 'TEF-30C'),
    _zeile('0078', '2026-10-25', 'TEF-30C', name='Drakloak'),
    _zeile('0079', '2026-11-01', 'TEF-30C'),
    _zeile('', '2026-10-09', 'TEF-30C', quelle='online'),
    _zeile('0071', '2026-08-28', 'TEF-PBL'),
    _zeile('0099', '', 'TEF-30C'),          # ohne Datum
    _zeile('0100', '2026-10-10', ''),        # ohne Format
]


def test_schluessel_ist_format_und_monat():
    m = _modul()
    assert m.schluessel(_zeile('0078', '2026-10-25', 'TEF-30C')) == 'TEF-30C_2026-10'
    assert m.schluessel(_zeile('0079', '2026-11-01', 'TEF-30C')) == 'TEF-30C_2026-11'
    assert m.schluessel(_zeile('0099', '', 'TEF-30C')) == 'TEF-30C_unbekannt'
    assert m.schluessel(_zeile('0100', '2026-10-10', '')) == '_unsorted'
    assert m.meta_aus_schluessel('TEF-30C_2026-10') == 'TEF-30C'
    assert m.monat_aus_schluessel('TEF-30C_2026-10') == '2026-10'
    assert m.meta_aus_schluessel('_unsorted') == ''
    assert m.dateiname('TEF-30C_2026-10') == 'tournament_decklists_per_player_TEF-30C_2026-10.csv'


def test_aufteilen_und_zusammensetzen_sind_verlustfrei(tmp_path):
    m = _modul()
    ordner = str(tmp_path / 'arbeit')
    _schreibe_monolith(ordner, BEISPIEL)
    assert m.aufteilen(ordner) == 0
    dateien = sorted(os.path.basename(p) for p in m.pfade(ordner))
    assert dateien == [
        'tournament_decklists_per_player_TEF-30C_2026-10.csv',
        'tournament_decklists_per_player_TEF-30C_2026-11.csv',
        'tournament_decklists_per_player_TEF-30C_unbekannt.csv',
        'tournament_decklists_per_player_TEF-PBL_2026-08.csv',
        'tournament_decklists_per_player__unsorted.csv',
    ]
    vz = json.load(open(os.path.join(ordner, m.VERZEICHNIS), encoding='utf-8'))
    assert vz['zeilen'] == len(BEISPIEL)
    assert vz['meta_keys'] == ['TEF-30C', 'TEF-PBL']
    assert {a['schluessel']: a['zeilen'] for a in vz['auszuege']} == {
        'TEF-30C_2026-10': 3, 'TEF-30C_2026-11': 1, 'TEF-30C_unbekannt': 1,
        'TEF-PBL_2026-08': 1, '_unsorted': 1}
    # Jeder Auszug traegt dieselbe Kopfzeile
    for p in m.pfade(ordner):
        with open(p, newline='', encoding='utf-8') as f:
            assert next(csv.reader(f)) == KOPF
    ziel = str(tmp_path / 'mono.csv')
    os.remove(os.path.join(ordner, m.MONOLITH))
    assert m.zusammensetzen(ordner, ziel) == len(BEISPIEL)
    with open(ziel, newline='', encoding='utf-8') as f:
        zurueck = list(csv.DictReader(f))
    assert sorted(map(sorted, (z.items() for z in zurueck))) == \
        sorted(map(sorted, (z.items() for z in BEISPIEL)))
    # zeilen() und text() liefern dasselbe wie der Monolith
    assert sorted(z['card_name'] + z['tournament_id'] for z in m.zeilen(ordner)) == \
        sorted(z['card_name'] + z['tournament_id'] for z in BEISPIEL)
    assert m.text(ordner).count('\n') == len(BEISPIEL) + 1
    assert m.anzahl_zeilen(ordner) == len(BEISPIEL)


def test_verschwundener_schluessel_verliert_seinen_auszug(tmp_path):
    m = _modul()
    ordner = str(tmp_path / 'arbeit')
    _schreibe_monolith(ordner, BEISPIEL)
    assert m.aufteilen(ordner) == 0
    assert os.path.exists(os.path.join(ordner, m.dateiname('TEF-PBL_2026-08')))
    ohne_pbl = [z for z in BEISPIEL if z['meta'] != 'TEF-PBL']
    _schreibe_monolith(ordner, ohne_pbl)
    assert m.aufteilen(ordner) == 0
    assert not os.path.exists(os.path.join(ordner, m.dateiname('TEF-PBL_2026-08')))
    vz = json.load(open(os.path.join(ordner, m.VERZEICHNIS), encoding='utf-8'))
    assert 'TEF-PBL' not in vz['meta_keys']
    assert m.anzahl_zeilen(ordner) == len(ohne_pbl)


def test_schrumpf_waechter_stoppt_unter_der_haelfte(tmp_path, capsys):
    m = _modul()
    ordner = str(tmp_path / 'arbeit')
    _schreibe_monolith(ordner, BEISPIEL * 10)              # 70 Zeilen
    assert m.aufteilen(ordner) == 0
    vorher = sorted(os.listdir(ordner))
    _schreibe_monolith(ordner, BEISPIEL[:3])                 # 3 Zeilen: Prague-Fall
    assert m.aufteilen(ordner) == 2
    assert 'Schrumpf-Waechter STOPP' in capsys.readouterr().out
    assert sorted(os.listdir(ordner)) == vorher
    assert m.anzahl_zeilen(ordner) == 70
    # unter 0,75 wird gewarnt, aber geschrieben
    _schreibe_monolith(ordner, BEISPIEL * 7)                 # 49 von 70 = 0,70
    assert m.aufteilen(ordner) == 0
    assert '::warning::per_player_auszuege' in capsys.readouterr().out
    assert m.anzahl_zeilen(ordner) == 49
    # mit --schrumpfen-erlauben geht auch der Stopp-Fall
    _schreibe_monolith(ordner, BEISPIEL[:3])
    assert m.aufteilen(ordner, schrumpfen_erlauben=True) == 0
    assert m.anzahl_zeilen(ordner) == 3


def test_pfade_je_format_aus_dem_verzeichnis(tmp_path):
    m = _modul()
    ordner = str(tmp_path / 'arbeit')
    _schreibe_monolith(ordner, BEISPIEL)
    assert m.aufteilen(ordner) == 0
    nur_30c = [os.path.basename(p) for p in m.pfade(ordner, meta='TEF-30C')]
    assert nur_30c == ['tournament_decklists_per_player_TEF-30C_2026-10.csv',
                       'tournament_decklists_per_player_TEF-30C_2026-11.csv',
                       'tournament_decklists_per_player_TEF-30C_unbekannt.csv']
    assert [z['tournament_id'] for z in m.zeilen(ordner, meta='TEF-PBL')] == ['0071']
    assert m.metas(ordner) == ['TEF-30C', 'TEF-PBL']
    # Eine Datei, die neben dem Verzeichnis liegt, aber nicht drinsteht, zaehlt nicht
    fremd = os.path.join(ordner, m.dateiname('TEF-30C_2026-12'))
    with open(fremd, 'w', encoding='utf-8') as f:
        f.write(','.join(KOPF) + '\n')
    assert fremd not in m.pfade(ordner)


def test_in_data_liegt_kein_monolith_und_jeder_auszug_steht_im_verzeichnis():
    m = _modul()
    assert not os.path.exists(os.path.join(DATA, m.MONOLITH)), \
        'data/tournament_decklists_per_player.csv darf nicht mehr im Repo liegen (SC-45)'
    vz = m.verzeichnis_lesen(DATA)
    assert vz and vz.get('auszuege'), 'Verzeichnis fehlt'
    im_vz = {a['datei'] for a in vz['auszuege']}
    auf_platte = {n for n in os.listdir(DATA) if m._ist_auszug(n)}
    assert auf_platte == im_vz, f'nur auf der Platte: {auf_platte - im_vz}; nur im Verzeichnis: {im_vz - auf_platte}'
    grenze = 100 * 1024 * 1024
    for name in auf_platte:
        groesse = os.path.getsize(os.path.join(DATA, name))
        assert groesse < grenze, f'{name} ist {groesse / 2**20:.1f} MiB — ueber GitHubs Grenze'
    assert m.anzahl_zeilen(DATA) == vz['zeilen']


# ---------------------------------------------------------------------------
# Die Ablaeufe: Auszuege saeen, zusammensetzen, nach den Scrapern aufteilen
# ---------------------------------------------------------------------------
ABLAEUFE = os.path.join(WURZEL, '.github', 'workflows')


def _schritte(name):
    import yaml
    with open(os.path.join(ABLAEUFE, name), encoding='utf-8') as f:
        y = yaml.safe_load(f)
    return [s for j in y['jobs'].values() for s in j.get('steps', [])]


def _ohne_kommentare(text):
    return '\n'.join(z for z in str(text).splitlines() if not z.lstrip().startswith('#'))


def _index(schritte, muster):
    for i, s in enumerate(schritte):
        if muster in _ohne_kommentare(s.get('run', '')):
            return i
    return -1


@pytest.mark.parametrize('ablauf,scraper', [
    ('weekly-full-update.yml', 'per_decklist_scraper.py --resume'),
    ('per-decklist-scrape.yml', 'per_decklist_scraper.py $ARGS'),
    ('online-decklists.yml', 'limitless_online_decklist_scraper.py $args'),
])
def test_der_ablauf_setzt_vor_dem_scraper_zusammen_und_teilt_danach_auf(ablauf, scraper):
    schritte = _schritte(ablauf)
    zusammen = _index(schritte, 'per_player_auszuege.py zusammensetzen backend/core/data')
    lauf = _index(schritte, scraper)
    teilen = _index(schritte, 'per_player_auszuege.py aufteilen backend/core/data --ziel data')
    assert 0 <= zusammen < lauf < teilen, (ablauf, zusammen, lauf, teilen)
    alles = _ohne_kommentare('\n'.join(str(s.get('run', '')) for s in schritte))
    assert 'cp "data/$f" "backend/core/data/$f"' in alles or 'cp "$f" "backend/core/data/$(basename "$f")"' in alles
    assert 'data/tournament_decklists_per_player_*.csv' in alles, 'die Auszuege werden nicht gesaet'
    # Der Monolith darf nie nach data/ kopiert werden
    for zeile in alles.splitlines():
        if 'tournament_decklists_per_player.csv' in zeile and 'data/tournament_decklists_per_player.csv' in zeile:
            assert 'backend/core/data' in zeile.split('data/tournament_decklists_per_player.csv')[0] or 'cp' not in zeile, zeile
    tor = _index(schritte, 'tor_vor_dem_push.sh')
    if tor >= 0:
        assert teilen < tor, 'aufgeteilt wird VOR dem Tor, sonst prueft es den alten Stand'


def test_prepare_card_data_synct_den_monolithen_nicht_mehr():
    quelle = open(os.path.join(WURZEL, 'backend', 'core', 'prepare_card_data.py'), encoding='utf-8').read()
    import re
    muster = [z for z in quelle.splitlines() if re.match(r'\s*"tournament_decklists_per_player\.csv",', z)]
    assert muster == [], 'der Monolith stuende wieder in SYNC_PATTERNS und landete in data/'


def test_gitignore_sperrt_den_monolithen():
    text = open(os.path.join(WURZEL, '.gitignore'), encoding='utf-8').read().splitlines()
    assert 'data/tournament_decklists_per_player.csv' in text
