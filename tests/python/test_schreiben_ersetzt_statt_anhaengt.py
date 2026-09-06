"""Der Scraper-Lauf vom 06.09.2026 hat die Ausgabedatei beschaedigt.

Zwei Fallen, beide erst im echten Lauf zugeschnappt, beide vorher von
keiner Zusicherung gedeckt:

  1. **Kopfzeile veraltet.** PR #687 nahm `druck_quelle` in `CSV_FIELDS`
     auf. Der naechste Lauf haengte 21-Feld-Zeilen unter die alte
     20-Feld-Kopfzeile: `seite` stand danach in der Spalte `scraped_at`,
     alles dahinter war um eine Stelle verschoben. Der Lauf meldete
     Erfolg — kaputt war die Datei erst beim LESEN.

  2. **Anhaengen verdoppelt.** Ein Lauf ohne `--resume` holt Turniere
     neu, die schon drinstehen. Danach stand Worlds zweimal in der
     Datei: einmal mit `Team Rocket's Petrel ASC 207` (falsch), einmal
     mit `DRI 176` (richtig). Gemessen: 889 doppelte Schluessel,
     34.158 Zeilen statt 30.459.

Diese Datei prueft VERHALTEN: `write_rows` wird mit echten Dateien auf
der Platte ausgefuehrt, danach wird die Datei gelesen. Ein Test, der nur
den Quelltext liest, haette beide Faelle durchgelassen — genau das ist
passiert.
"""

import csv
import importlib.util
import os
import sys
import tempfile

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

_spec = importlib.util.spec_from_file_location(
    'per_decklist_scraper',
    os.path.join(ROOT, 'backend', 'scrapers', 'per_decklist_scraper.py'))
PD = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(PD)


def _zeile(**kw):
    """Eine vollstaendige Zeile mit sinnvollen Standardwerten."""
    r = {k: '' for k in PD.CSV_FIELDS}
    r.update({
        'limitless_tournament_id': '515',
        'player_name': 'Boming Wang',
        'deck_slug': '28784',
        'card_name': "Team Rocket's Petrel",
        'card_identifier': 'DRI 176',
        'set_code': 'DRI',
        'set_number': '176',
        'count': '4',
        'druck_quelle': 'seite',
        'scraped_at': '2026-09-06T12:00:00+00:00',
    })
    r.update(kw)
    return r


def _lies(pfad):
    with open(pfad, newline='', encoding='utf-8') as f:
        rd = csv.DictReader(f)
        return list(rd.fieldnames or []), list(rd)


@pytest.fixture()
def pfad():
    with tempfile.TemporaryDirectory() as d:
        yield os.path.join(d, 'out.csv')


# ───────────────────────────────────────────────────────────────────
# 1. Veraltete Kopfzeile
# ───────────────────────────────────────────────────────────────────

def test_alte_kopfzeile_wird_migriert_statt_ueberschrieben(pfad):
    """Eine Datei mit der Kopfzeile von VOR druck_quelle."""
    alt_felder = [f for f in PD.CSV_FIELDS if f != 'druck_quelle']
    with open(pfad, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=alt_felder)
        w.writeheader()
        w.writerow({k: '' for k in alt_felder} | {
            'limitless_tournament_id': '515', 'player_name': 'Alte Zeile',
            'deck_slug': '111', 'card_name': 'Beldum',
            'card_identifier': 'TEF 113', 'scraped_at': '2026-09-01T00:00:00+00:00'})

    PD.write_rows([_zeile()], pfad, append=True)

    kopf, zeilen = _lies(pfad)
    assert kopf == PD.CSV_FIELDS, (
        'Die Kopfzeile wurde nicht auf die aktuelle Spaltenliste gezogen — '
        'genau so landete am 06.09.2026 "seite" in der Spalte scraped_at.')
    assert len(zeilen) == 2, 'die alte Zeile ist verlorengegangen'
    alt = [z for z in zeilen if z['player_name'] == 'Alte Zeile'][0]
    assert alt['scraped_at'] == '2026-09-01T00:00:00+00:00', (
        f"Spalten verrutscht: scraped_at = {alt['scraped_at']!r}")
    assert alt['druck_quelle'] == '', (
        'die neue Spalte muss bei alten Zeilen LEER bleiben — leer heisst '
        '"ungeprueft", ein geratener Wert waere schlimmer als die Luecke')


def test_seite_landet_nie_in_scraped_at(pfad):
    """Die Signatur des Schadens, direkt geprueft."""
    alt_felder = [f for f in PD.CSV_FIELDS if f != 'druck_quelle']
    with open(pfad, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=alt_felder)
        w.writeheader()
        w.writerow({k: '' for k in alt_felder} | {'player_name': 'Alt'})

    PD.write_rows([_zeile(player_name='Neu')], pfad, append=True)

    _, zeilen = _lies(pfad)
    for z in zeilen:
        assert z['scraped_at'] != 'seite', (
            'die Herkunftsangabe steht in der Zeitstempelspalte — '
            'die Zeile ist um ein Feld verschoben')
        assert z['druck_quelle'] in ('', 'seite', 'name')


# ───────────────────────────────────────────────────────────────────
# 2. Ersetzen statt Verdoppeln
# ───────────────────────────────────────────────────────────────────

def test_erneuter_lauf_ersetzt_die_zeile_statt_sie_zu_verdoppeln(pfad):
    """Derselbe Spieler, dasselbe Deck, dieselbe Karte — anderer Druck."""
    PD.write_rows([_zeile(card_identifier='ASC 207', set_code='ASC',
                          set_number='207', druck_quelle='')], pfad, append=True)
    PD.write_rows([_zeile(card_identifier='DRI 176')], pfad, append=True)

    _, zeilen = _lies(pfad)
    assert len(zeilen) == 1, (
        f'{len(zeilen)} Zeilen statt einer — der Lauf vom 06.09.2026 hat auf '
        'diese Weise 889 Schluessel verdoppelt, mit widersprechenden Drucken')
    assert zeilen[0]['card_identifier'] == 'DRI 176', 'die neue Zeile muss gewinnen'
    assert zeilen[0]['druck_quelle'] == 'seite'


def test_fremde_zeilen_bleiben_unangetastet(pfad):
    """Ersetzt wird nur, was denselben Schluessel traegt."""
    PD.write_rows([
        _zeile(player_name='Boming Wang', card_name="Team Rocket's Petrel"),
        _zeile(player_name='Andrew Hedrick', card_name='Dreepy', deck_slug='28752'),
    ], pfad, append=True)
    PD.write_rows([_zeile(player_name='Boming Wang',
                          card_name="Team Rocket's Petrel",
                          card_identifier='DRI 176')], pfad, append=True)

    _, zeilen = _lies(pfad)
    assert len(zeilen) == 2
    namen = sorted(z['player_name'] for z in zeilen)
    assert namen == ['Andrew Hedrick', 'Boming Wang'], (
        'eine unbeteiligte Zeile wurde mitgeloescht')


def test_der_schluessel_unterscheidet_spieler_und_deck(pfad):
    """Zwei Spieler mit derselben Karte sind zwei Zeilen, keine Dublette."""
    PD.write_rows([
        _zeile(player_name='A'), _zeile(player_name='B'),
    ], pfad, append=True)
    _, zeilen = _lies(pfad)
    assert len(zeilen) == 2


def test_append_false_schreibt_kompromisslos_neu(pfad):
    PD.write_rows([_zeile(player_name='Alt')], pfad, append=True)
    PD.write_rows([_zeile(player_name='Neu')], pfad, append=False)
    kopf, zeilen = _lies(pfad)
    assert kopf == PD.CSV_FIELDS
    assert [z['player_name'] for z in zeilen] == ['Neu']


def test_neue_datei_bekommt_die_kopfzeile(pfad):
    PD.write_rows([_zeile()], pfad, append=True)
    kopf, zeilen = _lies(pfad)
    assert kopf == PD.CSV_FIELDS
    assert len(zeilen) == 1


# ───────────────────────────────────────────────────────────────────
# 3. Dieselbe Karte in zwei Drucken ist KEINE Dublette
# ───────────────────────────────────────────────────────────────────

def test_zwei_drucke_derselben_karte_ueberleben_beide(pfad):
    """Ein Spieler fuehrt sehr wohl 2x Abra TWM 80 UND 2x Abra MEG 54 —
    gemessen an der echten Worlds-Liste von Mateusz Laszkiewicz
    (Deck 28757). Beim Aufraeumen am 06.09.2026 habe ich zuerst nach
    `(Turnier, Spieler, Deck, Kartenname)` zusammengefasst und damit im
    Reparaturskript 122 solcher Zeilen weggeworfen. Aufgefallen ist es
    beim Nachzaehlen, nicht beim Schreiben."""
    PD.write_rows([
        _zeile(player_name='Mateusz', deck_slug='28757', card_name='Abra',
               card_identifier='TWM 80', set_code='TWM', set_number='80', count='2'),
        _zeile(player_name='Mateusz', deck_slug='28757', card_name='Abra',
               card_identifier='MEG 54', set_code='MEG', set_number='54', count='2'),
    ], pfad, append=True)

    _, zeilen = _lies(pfad)
    assert len(zeilen) == 2, (
        'Zwei Drucke derselben Karte wurden zu einer Zeile zusammengefasst — '
        'genau die Unterscheidung, die dieser Scraper sichtbar machen soll')
    assert sorted(z['card_identifier'] for z in zeilen) == ['MEG 54', 'TWM 80']


def test_ein_neulauf_ersetzt_die_ganze_deckliste(pfad):
    """Beim Neulauf AENDERT sich der Druck. Waere der Druck Teil des
    Schluessels, stuende die alte Zeile daneben statt ersetzt zu werden —
    so entstanden am 06.09.2026 die widersprechenden Petrel-Zeilen."""
    PD.write_rows([
        _zeile(player_name='Boming Wang', deck_slug='28784',
               card_name="Team Rocket's Petrel", card_identifier='ASC 207',
               set_code='ASC', set_number='207', druck_quelle=''),
        _zeile(player_name='Boming Wang', deck_slug='28784',
               card_name='Beldum', card_identifier='TEF 113',
               set_code='TEF', set_number='113', druck_quelle=''),
    ], pfad, append=True)

    # Neulauf derselben Deckliste, Petrel jetzt mit dem richtigen Druck
    PD.write_rows([
        _zeile(player_name='Boming Wang', deck_slug='28784',
               card_name="Team Rocket's Petrel", card_identifier='DRI 176',
               set_code='DRI', set_number='176'),
        _zeile(player_name='Boming Wang', deck_slug='28784',
               card_name='Beldum', card_identifier='TEF 113',
               set_code='TEF', set_number='113'),
    ], pfad, append=True)

    _, zeilen = _lies(pfad)
    assert len(zeilen) == 2, f'{len(zeilen)} Zeilen — die alte Liste steht noch daneben'
    petrel = [z for z in zeilen if 'Petrel' in z['card_name']]
    assert len(petrel) == 1, 'Petrel steht zweimal drin, mit widersprechenden Drucken'
    assert petrel[0]['card_identifier'] == 'DRI 176'
    assert petrel[0]['druck_quelle'] == 'seite'


def test_eine_karte_die_aus_der_liste_faellt_verschwindet_auch(pfad):
    """Der Fall, an dem sich der Schluessel entscheidet.

    Ersetzt wird die ganze Deckliste. Waere stattdessen der Kartenname
    Teil des Schluessels, wuerde nur ersetzt, was im neuen Lauf WIEDER
    vorkommt — Karten, die der Spieler herausgenommen hat, blieben als
    Leichen stehen. Das faellt in keiner Zaehlung auf, nur in der
    Deckliste, die dann 62 Karten hat."""
    PD.write_rows([
        _zeile(player_name='Aleksi', deck_slug='28780', card_name='Goldeen',
               card_identifier='TWM 44', set_code='TWM', set_number='44'),
        _zeile(player_name='Aleksi', deck_slug='28780', card_name='Goldeen',
               card_identifier='PBL 13', set_code='PBL', set_number='13'),
    ], pfad, append=True)

    # Neulauf: Goldeen ist raus, Seaking drin.
    PD.write_rows([
        _zeile(player_name='Aleksi', deck_slug='28780', card_name='Seaking',
               card_identifier='TWM 45', set_code='TWM', set_number='45'),
    ], pfad, append=True)

    _, zeilen = _lies(pfad)
    namen = sorted(z['card_name'] for z in zeilen)
    assert namen == ['Seaking'], (
        f'Uebrig geblieben: {namen} — eine herausgenommene Karte steht noch '
        'in der Liste. Der Schluessel ersetzt nicht die ganze Deckliste.')


def test_andere_spieler_desselben_decks_bleiben_stehen(pfad):
    """Mehrere Spieler koennen dieselbe deck_slug fahren. Ersetzt wird
    nur die Liste DES Spielers, nicht das Deck aller."""
    PD.write_rows([
        _zeile(player_name='A', deck_slug='28757', card_name='Abra'),
        _zeile(player_name='B', deck_slug='28757', card_name='Abra'),
    ], pfad, append=True)
    PD.write_rows([_zeile(player_name='A', deck_slug='28757', card_name='Abra',
                          card_identifier='MEG 54')], pfad, append=True)
    _, zeilen = _lies(pfad)
    assert sorted(z['player_name'] for z in zeilen) == ['A', 'B']


# ───────────────────────────────────────────────────────────────────
# 4. Die Spaltenliste selbst
# ───────────────────────────────────────────────────────────────────

def test_druck_quelle_steht_vor_scraped_at():
    """Reihenfolge festhalten: sie ist eine veroeffentlichte Schnittstelle
    (data/_consumers.md). Eine Umsortierung bricht fremde Leser."""
    assert 'druck_quelle' in PD.CSV_FIELDS
    assert PD.CSV_FIELDS[-1] == 'scraped_at'
    assert PD.CSV_FIELDS[-2] == 'druck_quelle'
