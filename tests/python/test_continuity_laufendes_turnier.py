"""Eine Momentaufnahme ist kein Ergebnis: laufende Turniere bleiben draussen.

ANLASS (29.09.2026, Wochenlauf #168, Tor rot)
---------------------------------------------
Der Wochenlauf vom 26.09.2026 lief um 09:05 UTC, waehrend die Regionals
Brisbane (0073) und Frankfurt (0074) noch liefen. labs zeigt die
Standings eines laufenden Turniers schon mit JEDEM Spieler an. Der
Scraper schrieb sie weg:

    0073:  817 Zeilen, day2 = 0, topcut = 0, hoechste Bilanz 8 Runden
    0074: 2793 Zeilen, day2 = 0, topcut = 0, Platz 1 mit 2-0-0

Die Zeilenzahl passte zum gemeldeten Feld, `bestand_ist_fertig` hielt
den Stand fuer fertig, `--resume` hat ihn am 29.09. uebersprungen. Als
die Decklisten beider Turniere erschienen, fand
tests/unit/test-tag2-grundgesamtheit.js 148 Listen, aber 0 Day-2-Spieler
— und das Tor hielt den ganzen Wochenlauf an.

Die Bedingung, die gemeint ist: ein abgeschlossenes Major hat einen
Top-Cut. Alle 72 Turniere davor tragen einen, keine Momentaufnahme.

Diese Zusicherungen fuehren `main()` aus — mit einem gesetzten Abruf,
ohne Netz — und pruefen, was in der Datei steht.
"""
import csv
import importlib.util
import io
import json
import os
import sys

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SKRIPT = os.path.join(WURZEL, 'backend', 'scrapers', 'player_continuity_scraper.py')

FELDER = ['tournament_id', 'tournament_date', 'meta', 'place', 'player_name',
          'country', 'deck_slug', 'deck_archetype', 'wins', 'losses', 'ties',
          'player_id', 'points', 'day2', 'topcut', 'dropped', 'drop_round', 'dqed']


def lade_modul():
    sys.path.insert(0, os.path.join(WURZEL, 'backend', 'core'))
    sys.path.insert(0, os.path.join(WURZEL, 'backend', 'scrapers'))
    spec = importlib.util.spec_from_file_location('pcs_laufend', SKRIPT)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def zeile(tid, platz, name, w, l, day2, topcut, pid):
    return dict(tournament_id=tid, tournament_date='2026-09-26', meta='TEF-30C',
                place=str(platz), player_name=name, country='DE', deck_slug='',
                deck_archetype='', wins=str(w), losses=str(l), ties='0',
                player_id=str(pid), points=str(3 * w), day2=str(day2),
                topcut=str(topcut), dropped='0', drop_round='', dqed='0')


def abruf(platz, name, w, l, day2, topcut, pid):
    """So, wie scrape_standings_full eine Zeile zurueckgibt."""
    return dict(place=platz, player_name=name, country='DE', deck_slug='',
                wins=w, losses=l, ties=0, player_id=str(pid), points=3 * w,
                day2=day2, topcut=topcut, dropped=0, drop_round='', dqed=0)


# Momentaufnahme Runde 2 — genau die Form aus data/player_continuity.csv, 0074.
MOMENT = [abruf(1, 'Tom', 2, 0, 0, 0, 1), abruf(2, 'Ana', 2, 0, 0, 0, 2),
          abruf(3, 'Ben', 1, 1, 0, 0, 3), abruf(4, 'Cem', 0, 2, 0, 0, 4)]
# Endstand desselben Turniers.
ENDE = [abruf(1, 'Ana', 9, 1, 1, 1, 2), abruf(2, 'Tom', 8, 2, 1, 1, 1),
        abruf(3, 'Ben', 6, 3, 1, 0, 3), abruf(4, 'Cem', 3, 5, 0, 0, 4)]


def lauf(m, tmp_path, monkeypatch, bestand, abgerufen, resume=False):
    d = tmp_path / 'data'
    d.mkdir()
    with io.open(d / 'player_continuity.csv', 'w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=FELDER)
        w.writeheader()
        for z in bestand:
            w.writerow(z)
    with io.open(d / 'labs_tournaments.json', 'w', encoding='utf-8') as f:
        json.dump([{'tournament_id': '0074', 'tournament_date': '2026-09-26',
                    'meta': 'TEF-30C', 'total_players': 4}], f)
    monkeypatch.setattr(m, 'get_data_dir', lambda: str(d))
    monkeypatch.setattr(m, 'scrape_standings_full', lambda tid: [dict(r) for r in abgerufen])
    monkeypatch.setattr(m.time, 'sleep', lambda *_a, **_k: None)
    argv = ['player_continuity_scraper.py'] + (['--resume'] if resume else [])
    monkeypatch.setattr(sys, 'argv', argv)
    rc = m.main()
    with io.open(d / 'player_continuity.csv', encoding='utf-8-sig') as f:
        return rc, [z for z in csv.DictReader(f) if z['tournament_id'] == '0074']


def test_eine_momentaufnahme_gilt_nicht_als_fertig():
    m = lade_modul()
    moment = [zeile('0074', i + 1, n, 2, 0, 0, 0, i) for i, n in enumerate('ABCD')]
    fertig, grund = m.bestand_ist_fertig(moment, 4)
    assert not fertig, (
        'ein Bestand ohne einen einzigen Top-Cut-Spieler gilt als fertig — '
        '--resume ueberspringt dann ein Turnier, das beim Abruf noch lief '
        '(0073/0074, 26.09.2026)')
    assert 'Top-Cut' in grund
    ende = moment[:1] + [zeile('0074', 2, 'B', 8, 2, 1, 1, 9)] + moment[2:]
    assert m.bestand_ist_fertig(ende, 4) == (True, ''), (
        'ein abgeschlossener Bestand wird trotzdem neu geholt — dann holt '
        'jeder Wochenlauf alle 74 Turniere noch einmal')


def test_ein_laufendes_turnier_wird_nicht_geschrieben(tmp_path, monkeypatch, capsys):
    m = lade_modul()
    rc, zeilen = lauf(m, tmp_path, monkeypatch, [], MOMENT)
    assert zeilen == [], (
        '%d Zeilen eines laufenden Turniers stehen in der Datei — Zwischen'
        'plaetze, die sich wie Endplaetze lesen' % len(zeilen))
    assert rc == 0, 'ein laufendes Turnier ist kein Fehler des Abrufs'
    assert '::warning::' in capsys.readouterr().out, (
        'das Weglassen wird nicht gemeldet — dann sieht niemand, warum das '
        'Turnier fehlt')


def test_eine_alte_momentaufnahme_wird_durch_den_endstand_ersetzt(tmp_path, monkeypatch):
    """Genau der Weg, den 0073/0074 beim naechsten Wochenlauf gehen."""
    m = lade_modul()
    bestand = [zeile('0074', i + 1, n, 2, 0, 0, 0, i + 1) for i, n in enumerate(['Tom', 'Ana', 'Ben', 'Cem'])]
    rc, zeilen = lauf(m, tmp_path, monkeypatch, bestand, ENDE, resume=True)
    assert rc == 0
    assert len(zeilen) == 4
    assert sum(z['topcut'] == '1' for z in zeilen) == 2, (
        'der Endstand wurde nicht uebernommen — --resume ist ueber die '
        'Momentaufnahme hinweggesprungen')
    assert zeilen[0]['player_name'] == 'Ana'


def test_ein_fertiger_bestand_ueberlebt_einen_rueckfall_der_quelle(tmp_path, monkeypatch):
    """Hatte das Turnier schon einen Top-Cut und liefert die Quelle jetzt
    keinen, ist das ein Widerspruch: melden, Bestand behalten."""
    m = lade_modul()
    bestand = [zeile('0074', 1, 'Ana', 9, 1, 1, 1, 2), zeile('0074', 2, 'Tom', 8, 2, 1, 1, 1),
               zeile('0074', 3, 'Ben', 6, 3, 1, 0, 3), zeile('0074', 4, 'Cem', 3, 5, 0, 0, 4)]
    rc, zeilen = lauf(m, tmp_path, monkeypatch, bestand, MOMENT)
    assert len(zeilen) == 4 and zeilen[0]['player_name'] == 'Ana', (
        'ein abgeschlossener Bestand wurde von einer Momentaufnahme ersetzt')
    assert rc != 0, 'der Widerspruch meldet sich nicht nach aussen'
