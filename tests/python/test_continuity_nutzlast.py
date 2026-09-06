"""Die Standings-Tabelle im HTML ist eine Ansicht, nicht die Daten.

BEFUND (06.09.2026)
-------------------
`data/player_continuity.csv` fuehrte fuer eintausend Turniere hinweg
exakt 512 Zeilen je Turnier — elf von zwoelf. Die zwoelfte hatte 499,
weil das Turnier nur 499 Teilnehmer hatte. 512 ist keine Eigenschaft
der Turniere, sondern die Deckelung, mit der labs seine Standings-
Seite ausliefert: oben steht "top 512 filter ON", unten ein Knopf
"Show all players". Der Knopf holt nichts nach — die restlichen Zeilen
liegen bereits im HTML, in einem <script data-sveltekit-fetched>-Block
neben der Tabelle. Ein Parser ohne JavaScript sah nur die Tabelle.

Am echten Turnier 0070 (International Championship New Orleans)
gemessen:

    HTML-Tabelle   512 Zeilen
    Nutzlast      3752 Zeilen
    fehlend       3240 Spieler  (ueber alle zwoelf: 15.075)

Und es geht nicht nur um die Anzahl:

    ohne Bilanz     Bestand 71,4 %   Nutzlast 0 von 3752
    ohne Land       Bestand 100  %   Nutzlast 0 von 3752
    Schluessel      Name             player_id, 3752 verschiedene

Der letzte Punkt ist der wichtigste. CLAUDE.md, "Data rules":
*Never join card data by name.* Fuer Spieler gilt dasselbe, und die
Kontinuitaet ueber Turniere hinweg IST eine Verknuepfung ueber
Turniergrenzen. Die Nutzlast liefert einen stabilen Schluessel.

Der Abruf bleibt einer: die Nutzlast steckt in demselben HTML, das der
Scraper ohnehin holt.
"""
import csv
import html
import importlib.util
import io
import json
import os
import sys

import pytest

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SKRIPT = os.path.join(WURZEL, 'backend', 'scrapers', 'player_continuity_scraper.py')


def lade_modul():
    sys.path.insert(0, os.path.join(WURZEL, 'backend', 'core'))
    sys.path.insert(0, os.path.join(WURZEL, 'backend', 'scrapers'))
    spec = importlib.util.spec_from_file_location('pcs_nutzlast', SKRIPT)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


@pytest.fixture(scope='module')
def pcs():
    return lade_modul()


# Genau die Feldnamen, die labs am 06.09.2026 fuer tid=0070 lieferte.
def eintrag(pid, platz, name, **rest):
    e = {
        "player_id": pid, "tp_id": 2000 + pid, "name": name, "country": "US",
        "drop_round": None, "late": 0, "dqed": 0, "placement": platz,
        "points": 49, "wins": 16, "losses": 1, "ties": 1,
        "opw": "0.678359", "opw2": "0.649579", "day2": 1, "topcut": 1,
        "dropped": 0, "decklist": 1, "deck_id": "lillie-clefairy",
        "deck_name": "Lillie's Clefairy", "icons": "clefairy",
    }
    e.update(rest)
    return e


def seite(eintraege, tabellenzeilen=2, mit_nutzlast=True):
    """Baut eine Seite in der Bauart von labs: gefilterte Tabelle plus
    vollstaendige Nutzlast."""
    zeilen = ''.join(
        '<tr><td>%d</td><td>Tabellenspieler %d</td><td></td><td>23</td>'
        '<td>7 - 5 - 2</td></tr>' % (i + 1, i + 1)
        for i in range(tabellenzeilen))
    tabelle = (
        '<table class="data-table striped"><thead><tr><th>#</th><th>Name</th>'
        '<th></th><th>Points</th><th>Record</th></tr></thead>'
        '<tbody>%s</tbody></table>' % zeilen)
    block = ''
    if mit_nutzlast:
        koerper = json.dumps({"ok": True, "message": eintraege})
        huelle = json.dumps({"status": 200, "statusText": "",
                             "headers": {}, "body": koerper})
        block = ('<script type="application/json" data-sveltekit-fetched '
                 'data-url="https://mew.limitlesstcg.com/labs/data/tcg/'
                 'standings?tournamentId=0070&amp;division=MA">%s</script>'
                 % html.escape(huelle, quote=False))
    return '<html><body>%s%s</body></html>' % (tabelle, block)


def suppe(text):
    from bs4 import BeautifulSoup
    return BeautifulSoup(text, 'html.parser')


# --- 1. Die Nutzlast wird gelesen, nicht die Tabelle -----------------

def test_nutzlast_liefert_mehr_zeilen_als_die_tabelle(pcs):
    eintraege = [eintrag(1000 + i, i + 1, 'Spieler %d' % i) for i in range(20)]
    zeilen = pcs.standings_aus_nutzlast(suppe(seite(eintraege, 2)), '0070')
    assert zeilen is not None
    assert len(zeilen) == 20, (
        'Die Tabelle traegt 2 Zeilen, die Nutzlast 20 — genau dieser '
        'Unterschied ist der Befund.')


def test_scrape_bevorzugt_die_nutzlast(pcs, monkeypatch):
    eintraege = [eintrag(1000 + i, i + 1, 'Spieler %d' % i) for i in range(5)]
    monkeypatch.setattr(pcs, 'fetch_page_bs4', lambda url: suppe(seite(eintraege, 2)))
    zeilen = pcs.scrape_standings_full('0070')
    assert len(zeilen) == 5
    assert [z['player_name'] for z in zeilen][:2] == ['Spieler 0', 'Spieler 1'], (
        'Die Tabellenspieler duerfen nicht gewinnen.')


def test_nur_ein_abruf(pcs, monkeypatch):
    """Die Nutzlast ist KEIN zweiter Abruf — CLAUDE.md, Drosselung."""
    eintraege = [eintrag(1, 1, 'A')]
    zaehler = {'n': 0}

    def gezaehlt(url):
        zaehler['n'] += 1
        return suppe(seite(eintraege, 2))

    monkeypatch.setattr(pcs, 'fetch_page_bs4', gezaehlt)
    pcs.scrape_standings_full('0070')
    assert zaehler['n'] == 1


# --- 2. Die Felder, die nur die Nutzlast kennt -----------------------

def test_stabiler_schluessel_landet_in_der_zeile(pcs):
    zeilen = pcs.standings_aus_nutzlast(suppe(seite([eintrag(1587, 1, 'James Kowalski')])), '0070')
    z = zeilen[0]
    assert z['player_id'] == '1587', (
        'Ohne player_id bleibt der Name der Schluessel — genau das, was '
        'CLAUDE.md fuer Karten verbietet und fuer Spieler genauso gilt.')
    assert z['day2'] == 1
    assert z['points'] == 49
    assert z['dropped'] == 0
    assert z['dqed'] == 0
    assert z['country'] == 'US'
    assert z['deck_slug'] == 'lillie-clefairy'
    assert z['deck_name_roh'] == "Lillie's Clefairy"


def test_bilanz_kommt_aus_der_nutzlast(pcs):
    zeilen = pcs.standings_aus_nutzlast(
        suppe(seite([eintrag(1, 300, 'X', wins=3, losses=4, ties=2)])), '0070')
    assert (zeilen[0]['wins'], zeilen[0]['losses'], zeilen[0]['ties']) == (3, 4, 2), (
        '71,4 % der Bestandszeilen standen auf 0-0-0, weil die Record-'
        'Spalte der HTML-Tabelle leer war.')


def test_ohne_platzierung_bleibt_der_platz_leer(pcs):
    """Ein disqualifizierter Spieler hat keine Platzierung. 0 waere
    eine Behauptung, '' ist die Wahrheit."""
    zeilen = pcs.standings_aus_nutzlast(
        suppe(seite([eintrag(45749, None, 'Kevin Cuello',
                             dqed=1, dropped=1, drop_round=6,
                             deck_id=None, deck_name=None)])), '0070')
    z = zeilen[0]
    assert z['place'] == ''
    assert z['place'] != 0
    assert z['dqed'] == 1
    assert z['drop_round'] == 6
    assert z['deck_slug'] == ''


def test_platzierung_bleibt_eine_zahl(pcs):
    zeilen = pcs.standings_aus_nutzlast(suppe(seite([eintrag(1, 512, 'A')])), '0070')
    assert zeilen[0]['place'] == 512


# --- 3. Rueckfallweg bleibt heil ------------------------------------

def test_ohne_nutzlast_wird_die_tabelle_gelesen(pcs, monkeypatch):
    monkeypatch.setattr(pcs, 'fetch_page_bs4',
                        lambda url: suppe(seite([], 3, mit_nutzlast=False)))
    zeilen = pcs.scrape_standings_full('0070')
    assert len(zeilen) == 3
    for z in zeilen:
        for feld in ('player_id', 'points', 'day2', 'dropped', 'drop_round', 'dqed'):
            assert feld in z, (
                'Der Rueckfallweg muss die neuen Felder mitfuehren, sonst '
                'faellt der DictWriter beim ersten Turnier ohne Nutzlast um.')
        assert z['player_id'] == ''


def test_kaputte_nutzlast_faellt_auf_die_tabelle_zurueck(pcs, monkeypatch):
    kaputt = ('<table class="data-table"><thead><tr><th>#</th><th>Name</th>'
              '<th>Record</th></tr></thead><tbody>'
              '<tr><td>1</td><td>A</td><td>6 - 1 - 0</td></tr></tbody></table>'
              '<script data-sveltekit-fetched data-url="https://mew.'
              'limitlesstcg.com/labs/data/tcg/standings?x=1">{kein json'
              '</script>')
    monkeypatch.setattr(pcs, 'fetch_page_bs4', lambda url: suppe(kaputt))
    zeilen = pcs.scrape_standings_full('0070')
    assert len(zeilen) == 1
    assert zeilen[0]['player_name'] == 'A'


def test_nutzlast_mit_fehlerstatus_zaehlt_nicht(pcs):
    koerper = json.dumps({"ok": False, "message": "Not Logged in."})
    huelle = json.dumps({"status": 400, "statusText": "", "headers": {},
                         "body": koerper})
    text = ('<script data-sveltekit-fetched data-url="https://mew.'
            'limitlesstcg.com/labs/data/tcg/standings?x=1">%s</script>'
            % html.escape(huelle, quote=False))
    assert pcs.standings_aus_nutzlast(suppe(text), '0070') is None


# --- 4. Das Schema waechst, es bricht nicht -------------------------

ALTE_SPALTEN = ['tournament_id', 'tournament_date', 'meta', 'place',
                'player_name', 'country', 'deck_slug', 'deck_archetype',
                'wins', 'losses', 'ties']


def test_die_elf_alten_spalten_stehen_unveraendert_vorn(pcs, tmp_path):
    ziel = str(tmp_path / 'p.csv')
    pcs.write_output([{k: '' for k in ALTE_SPALTEN}], ziel)
    with open(ziel, encoding='utf-8') as f:
        kopf = next(csv.reader(f))
    assert kopf[:11] == ALTE_SPALTEN, (
        'data/_consumers.md: eine Spalte ergaenzen ist gefahrlos, eine '
        'umbenennen bricht fremde Projekte.')
    assert 'player_id' in kopf


def test_zusatzfelder_stolpern_den_writer_nicht(pcs, tmp_path):
    """deck_name_roh ist ein Arbeitsfeld, keine Spalte."""
    ziel = str(tmp_path / 'p.csv')
    zeile = {k: '' for k in ALTE_SPALTEN}
    zeile['deck_name_roh'] = "Lillie's Clefairy"
    pcs.write_output([zeile], ziel)
    with open(ziel, encoding='utf-8') as f:
        kopf = next(csv.reader(f))
    assert 'deck_name_roh' not in kopf


# --- 5. --resume darf nur ueberspringen, was FERTIG ist --------------

def _bestandszeilen(n, mit_id=True):
    return [{'tournament_id': '0070', 'player_id': str(i) if mit_id else '',
             'place': str(i + 1)} for i in range(n)]


def test_resume_ueberspringt_keinen_rumpf(pcs):
    fertig, grund = pcs.bestand_ist_fertig(_bestandszeilen(512), 3743)
    assert fertig is False
    assert '512' in grund and '3743' in grund, (
        'Der Grund muss die Zahlen nennen — sonst steht im Protokoll '
        'wieder nur, dass etwas uebersprungen wurde.')


def test_resume_ueberspringt_alten_aufbau_nicht(pcs):
    fertig, grund = pcs.bestand_ist_fertig(_bestandszeilen(3743, mit_id=False), 3743)
    assert fertig is False
    assert 'player_id' in grund


def test_resume_ueberspringt_was_fertig_ist(pcs):
    fertig, grund = pcs.bestand_ist_fertig(_bestandszeilen(3743), 3743)
    assert fertig is True
    assert grund == ''


def test_kleine_abweichung_gilt_als_fertig(pcs):
    """labs zaehlt im Seitenkopf gelegentlich ein paar Spieler mehr."""
    assert pcs.bestand_ist_fertig(_bestandszeilen(3700), 3743)[0] is True


def test_leerer_bestand_ist_nicht_fertig(pcs):
    assert pcs.bestand_ist_fertig([], 3743) == (False, 'keine Zeilen')


def test_ohne_gemeldete_teilnehmerzahl_entscheidet_der_schluessel(pcs):
    """Kennt der Index die Teilnehmerzahl nicht, bleibt nur die Frage,
    ob die Zeilen aus der Nutzlast stammen."""
    assert pcs.bestand_ist_fertig(_bestandszeilen(512), 0)[0] is True
    assert pcs.bestand_ist_fertig(_bestandszeilen(512, mit_id=False), 0)[0] is False


# --- 6. Der Befund selbst, als Rueckfallsperre ----------------------

def test_der_gemessene_befund_steht_im_kopf_der_datei():
    text = open(__file__, encoding='utf-8').read()
    for zahl in ('512', '3752', '15.075'):
        assert zahl in text


def test_ein_objekt_ohne_find_all_kostet_kein_turnier(pcs):
    """Ein Turnier zu verlieren waere teurer als 512 Zeilen davon.

    Der Rueckfallweg steht direkt hinter der Nutzlast — also darf ein
    unerwartetes Objekt hier nicht den ganzen Lauf abbrechen."""
    class OhneFindAll:
        def find(self, *a, **k):
            return None

    assert pcs.standings_aus_nutzlast(OhneFindAll(), '0070') is None
