"""SC-43 (03.11.2026): Puebla und Danzig fehlten fuenf Wochenlaeufe lang.

URSACHE, GEMESSEN am Tor-Artefakt tor-41588410600 und am Job-Protokoll:
der Wochenlauf-Schritt "Top-Cut-Quoten aus den Platzierungen fuellen"
brach mit rc 1 ab (Gegenprobe: 0077/other 0 <-> 0.041667,
0077/mega-absol-mega-audino 1 <-> 0 — labs hatte Nizza Platz 7 umbenannt,
player_continuity.csv zog es per --resume nie nach) und machte dann
`git checkout -- data/labs_tournament_decks*.csv`. Weg waren alle frischen
Deckzeilen (Puebla 80 Decks, Danzig 66), Matchups und labs_tournaments.json
blieben frisch, zwei Zusicherungen wurden rot, das Tor rollte die Familie
zurueck. Zweiter Fehler: player_continuity.csv 0078 hatte 0 von 2.234
Zeilen mit deck_slug (Momentaufnahme vor der Deckzuordnung), und
bestand_ist_fertig hielt das fuer fertig.

Drei Regeln, jede mit gebautem Fall:
  1. eine abweichende Gegenprobe leert die Zelle und meldet — sie
     verwirft nicht den Bestand (fuelle_conv_rate schreibt, rc 0);
  2. ein Bestand ohne Decks ist nicht fertig; Turniere des aktiven
     Formats werden jede Woche neu geholt;
  3. der Ablaufschritt enthaelt keinen `git checkout` der Deckdateien.
"""
import csv
import importlib.util
import io
import os
import sys

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CONV = os.path.join(WURZEL, 'scripts', 'fuelle_conv_rate.py')
PCS = os.path.join(WURZEL, 'backend', 'scrapers', 'player_continuity_scraper.py')
ABLAUF = os.path.join(WURZEL, '.github', 'workflows', 'weekly-full-update.yml')

DECK_FELDER = ['tournament_id', 'deck_slug', 'player_count', 'top8_count',
               'top8_conv_rate', 'top16_conv_rate', 'top32_conv_rate']
CONT_FELDER = ['tournament_id', 'place', 'deck_slug', 'player_id', 'topcut']


def _modul(name, pfad):
    sys.path.insert(0, os.path.join(WURZEL, 'backend', 'core'))
    sys.path.insert(0, os.path.join(WURZEL, 'backend', 'scrapers'))
    spec = importlib.util.spec_from_file_location(name, pfad)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def _schreibe(pfad, felder, zeilen):
    with io.open(pfad, 'w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=felder)
        w.writeheader()
        w.writerows(zeilen)


def _lies(pfad):
    with io.open(pfad, encoding='utf-8', newline='') as f:
        return {(z['tournament_id'], z['deck_slug']): z for z in csv.DictReader(f)}


def _nizza_fall(tmp_path):
    """Der Fall vom 03.11.: labs sagt Platz 7 = mega-absol-mega-audino,
    die Platzierungsdatei sagt other. Dazu Puebla, dessen Zeilen der alte
    Weg mit weggeworfen hat."""
    d = tmp_path / 'data'
    d.mkdir()
    decks = [
        dict(tournament_id='0077', deck_slug='other', player_count='24', top8_count='0'),
        dict(tournament_id='0077', deck_slug='mega-absol-mega-audino', player_count='1', top8_count='1'),
        dict(tournament_id='0077', deck_slug='dragapult-ex', player_count='10', top8_count='1'),
        dict(tournament_id='0078', deck_slug='dragapult-ex', player_count='391', top8_count='8'),
    ]
    for z in decks:
        z.update(top8_conv_rate='0.0', top16_conv_rate='0.0', top32_conv_rate='0.0')
    _schreibe(d / 'labs_tournament_decks.csv', DECK_FELDER, decks)
    cont = [dict(tournament_id='0077', place='7', deck_slug='other', player_id='1', topcut='1'),
            dict(tournament_id='0077', place='5', deck_slug='dragapult-ex', player_id='2', topcut='1')]
    cont += [dict(tournament_id='0077', place=str(p), deck_slug='other', player_id=str(p), topcut='0')
             for p in range(9, 32)]
    cont += [dict(tournament_id='0077', place=str(p), deck_slug='dragapult-ex', player_id=str(p), topcut='0')
             for p in range(40, 49)]
    # Puebla: Platzierungen mit Deck (so, wie labs sie heute liefert)
    cont += [dict(tournament_id='0078', place=str(p), deck_slug='dragapult-ex', player_id=str(100 + p),
                  topcut='1' if p <= 8 else '0') for p in range(1, 392)]
    _schreibe(d / 'player_continuity.csv', CONT_FELDER, cont)
    return d


def test_eine_abweichende_gegenprobe_leert_die_zelle_statt_den_bestand(tmp_path, monkeypatch, capsys):
    d = _nizza_fall(tmp_path)
    m = _modul('fcr_sc43', CONV)
    monkeypatch.setattr(m, 'DATA', str(d))
    monkeypatch.setattr(m, 'DECKS', str(d / 'labs_tournament_decks.csv'))
    monkeypatch.setattr(m, 'CONT', str(d / 'player_continuity.csv'))
    monkeypatch.setattr(sys, 'argv', ['fuelle_conv_rate.py'])
    rc = m.main()
    out = capsys.readouterr().out
    assert rc == 0, (
        'rc %r — mit rc 1 warf der Wochenlauf bis 03.11.2026 per git checkout '
        'alle frischen Deckzeilen weg (Puebla, Danzig)' % rc)
    z = _lies(d / 'labs_tournament_decks.csv')
    assert z[('0077', 'other')]['top8_conv_rate'] == '', 'die abweichende Zelle muss leer sein (unbekannt), nicht 0'
    assert z[('0077', 'mega-absol-mega-audino')]['top8_conv_rate'] == ''
    assert z[('0077', 'dragapult-ex')]['top8_conv_rate'] == '0.100000', (
        'eine stimmige Zeile desselben Turniers wurde nicht gefuellt — der Bestand wurde verworfen')
    assert z[('0078', 'dragapult-ex')]['top8_conv_rate'] == '%.6f' % (8 / 391), (
        'Puebla wurde nicht gefuellt — genau die Zeilen, die fuenf Wochen fehlten')
    assert '::warning::' in out and '0077/other' in out and 'mega-absol-mega-audino' in out, (
        'die Abweichung wird nicht gemeldet — dann heilt sie niemand')


def test_ohne_abweichung_keine_warnung(tmp_path, monkeypatch, capsys):
    d = _nizza_fall(tmp_path)
    # Platzierungsdatei nachgezogen: Platz 7 traegt den neuen Slug.
    zeilen = list(csv.DictReader(io.open(d / 'player_continuity.csv', encoding='utf-8')))
    for z in zeilen:
        if z['tournament_id'] == '0077' and z['place'] == '7':
            z['deck_slug'] = 'mega-absol-mega-audino'
    _schreibe(d / 'player_continuity.csv', CONT_FELDER, zeilen)
    m = _modul('fcr_sc43b', CONV)
    monkeypatch.setattr(m, 'DATA', str(d))
    monkeypatch.setattr(m, 'DECKS', str(d / 'labs_tournament_decks.csv'))
    monkeypatch.setattr(m, 'CONT', str(d / 'player_continuity.csv'))
    monkeypatch.setattr(sys, 'argv', ['fuelle_conv_rate.py'])
    assert m.main() == 0
    out = capsys.readouterr().out
    assert '::warning::' not in out
    z = _lies(d / 'labs_tournament_decks.csv')
    assert z[('0077', 'mega-absol-mega-audino')]['top8_conv_rate'] == '1.000000'


def _bestand(n, mit_deck, topcut=1):
    raus = []
    for p in range(1, n + 1):
        raus.append(dict(tournament_id='0078', place=str(p), player_id=str(p),
                         deck_slug='dragapult-ex' if p <= mit_deck else '',
                         topcut='1' if (topcut and p <= 8) else '0'))
    return raus


def test_ein_bestand_ohne_decks_ist_nicht_fertig():
    m = _modul('pcs_sc43', PCS)
    fertig, grund = m.bestand_ist_fertig(_bestand(100, 0), 0)
    assert not fertig, (
        'der Puebla-Fall: 2.234 Zeilen mit player_id und Top-Cut, 0 mit Deck — '
        'galt als fertig und wurde nie wieder geholt')
    assert 'ohne Deck' in grund
    assert m.bestand_ist_fertig(_bestand(100, 100), 100) == (True, '')
    # Grenze: 95 % reichen (labs laesst einzelne Spieler ohne Deck), 94 nicht.
    assert m.bestand_ist_fertig(_bestand(100, 95), 100)[0]
    assert not m.bestand_ist_fertig(_bestand(100, 94), 100)[0]


def test_resume_holt_das_aktive_format_neu_und_den_rest_nicht():
    m = _modul('pcs_sc43c', PCS)
    nizza = dict(tournament_id='0077', tournament_date='2026-10-17', total_players=2330)
    baltimore = dict(tournament_id='0072', tournament_date='2026-09-18', total_players=3119)
    puebla = dict(tournament_id='0078', tournament_date='2026-10-24', total_players=0)
    danzig = dict(tournament_id='0079', tournament_date='2026-10-31', total_players=1738)
    vorhanden = {'0077': _bestand(2330, 2330), '0072': _bestand(3119, 3119),
                 '0078': _bestand(2234, 0)}
    meta_map = {'0077': 'TEF-30C', '0072': 'TEF-PBL', '0078': 'TEF-30C'}
    raus = m.zu_holen([nizza, baltimore, puebla, danzig], vorhanden, meta_map, 'TEF-30C')
    tids = {t['tournament_id']: grund for t, grund in raus}
    assert '0077' in tids and 'aktives Format' in tids['0077'], (
        'Nizza (aktives Format) wird nicht neu geholt — die Umbenennung '
        'other -> mega-absol-mega-audino kaeme nie an')
    assert '0078' in tids and 'ohne Deck' in tids['0078']
    assert tids.get('0079') == '', 'ein Turnier ohne Bestand wird geholt'
    assert '0072' not in tids, 'ein fertiges Turnier eines alten Formats wird nicht neu geholt'
    # Verfaelschung: ohne aktives Format bleibt Nizza liegen (nur Regel 1).
    raus = m.zu_holen([nizza], vorhanden, meta_map, '')
    assert raus == []


def test_der_ablaufschritt_wirft_die_deckdateien_nicht_mehr_weg():
    text = io.open(ABLAUF, encoding='utf-8').read()
    kopf = 'name: Top-Cut-Quoten aus den Platzierungen fuellen'
    assert kopf in text
    schritt = text.split(kopf, 1)[1].split('- name:', 1)[0]
    assert 'git checkout' not in schritt, (
        'der Schritt setzt die Deckdateien bei rc != 0 zurueck — genau das '
        'hat Puebla und Danzig fuenf Wochenlaeufe lang verworfen')
    assert 'fuelle_conv_rate.py' in schritt and 'set +e' in schritt
