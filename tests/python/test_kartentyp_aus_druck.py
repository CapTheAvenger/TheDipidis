"""Die Spalte `type` stand in allen 30.459 Zeilen leer — und die
naheliegende Fuellung waere schlimmer gewesen als die Luecke.

BEFUND (06.09.2026). `extract_cards_from_decklist_soup()` gab `type`
gar nicht zurueck, waehrend per_decklist_scraper.py:555 verspricht, es
kaeme von dort. Ergebnis: 30.459 von 30.459 Zeilen in
data/tournament_decklists_per_player.csv ohne Kartentyp.

DIE FALLE. Die Decklistenseite gruppiert die Karten in Spalten mit den
Ueberschriften "Pokémon", "Trainer" und "Energy" — der Extraktor kennt
diese Einteilung bereits (`is_pokemon`). Genau diese drei Woerter in die
Spalte zu schreiben waere aber SCHLECHTER als sie leer zu lassen:

    js/deck-builder-consistency.js, kat():
        if (c.type) return String(c.type);      // Spalte gewinnt
        ... sonst Kartendatenbank ueber (set, number)

    Ein "Trainer" trifft dort keinen Zweig (Supporter/Item/Tool/
    Stadium werden EXAKT verglichen) und faellt in den Sammelfall
    'Pokemon'. Die Kategorie-Deckung saehe vollstaendig aus und waere
    falsch — waehrend heute die leere Spalte den funktionierenden
    Rueckfall auf die Kartendatenbank offen laesst.

DIE LOESUNG ist derselbe Schluessel, den CLAUDE.md unter "Data rules"
ohnehin verlangt: *Never join card data by name.* Der Typ wird ueber
(set, number) aufgeloest. Gemessen an den 30.459 Zeilen: 30.459 von
30.459 aufloesbar, neun Werte, alle im Frontend richtig einsortiert.

WAS DAS BRINGT, ausser einer gefuellten Spalte: `is_ace_spec` wird beim
Schreiben aus `entscheide_zeile(name, ace, count, typ)` gebildet, und
`typ` war dort immer ''. Mit dem echten Typ wechseln 5.819 Zeilen von
"" (unbekannt) auf ein BELEGTES "No" — kein einziger Widerspruch zu
einer bereits gesetzten Entscheidung.
"""
import os
import sys

import pytest

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(WURZEL, 'backend', 'core'))

from bs4 import BeautifulSoup  # noqa: E402


@pytest.fixture(scope='module')

def css():
    import card_scraper_shared as m
    m.get_data_dir = lambda: os.path.join(WURZEL, 'data')
    return m


class FalscheDb:
    """Eine Kartendatenbank mit genau drei Druecken."""
    TYPEN = {'SVI-196': 'Item', 'PBL-83': 'Special Energy', 'MEG-18': 'Basic'}

    def typ_von_druck(self, set_code, number):
        return self.TYPEN.get('%s-%s' % (str(set_code).upper(), number), '')

    def get_latest_low_rarity_version(self, name):
        class K:
            set_code = 'SVI'
            number = '196'
        return K() if name == 'Nest Ball' else None


def seite():
    return BeautifulSoup(
        '<div class="decklist-column">'
        '  <div class="decklist-column-heading">Pokémon</div>'
        '  <div class="decklist-card"><span class="card-count">2</span>'
        '    <span class="card-name"><a href="/cards/MEG/18">Excadrill</a></span></div>'
        '</div>'
        '<div class="decklist-column">'
        '  <div class="decklist-column-heading">Trainer</div>'
        '  <div class="decklist-card"><span class="card-count">4</span>'
        '    <span class="card-name">Nest Ball</span></div>'
        '</div>', 'html.parser')


def test_der_feine_typ_landet_in_der_zeile(css):
    karten = css.extract_cards_from_decklist_soup(seite(), FalscheDb())
    nach = {k['name']: k for k in karten}
    assert nach['Excadrill']['type'] == 'Basic'
    assert nach['Nest Ball']['type'] == 'Item', (
        'Auch der Trainer-Zweig, der ueber get_latest_low_rarity_version '
        'geht, muss den Typ mitbringen.')


def test_niemals_die_spaltenueberschrift(css):
    """Der Kern des Befunds: 'Pokémon'/'Trainer'/'Energy' duerfen dort
    nicht stehen — das Frontend wuerde sie fuer bare Muenze nehmen."""
    karten = css.extract_cards_from_decklist_soup(seite(), FalscheDb())
    fuer_frontend = {'Basic', 'Stage 1', 'Stage 2', 'Supporter', 'Item',
                     'Tool', 'Stadium', 'Basic Energy', 'Special Energy',
                     'VSTAR', 'VMAX', 'V-UNION', 'Mega Evolution',
                     'Level Up', 'Restored', 'BREAK Evolution'}
    for k in karten:
        assert k['type'] not in ('Pokémon', 'Pokemon', 'Trainer', 'Energy'), k
        assert k['type'] in fuer_frontend, k


def test_unbekannter_druck_bleibt_leer(css):
    """Gemeldet statt geraten: findet die Datenbank den Druck nicht,
    bleibt das Feld leer und der Rueckfall im Frontend greift."""
    class Leer(FalscheDb):
        TYPEN = {}
    karten = css.extract_cards_from_decklist_soup(seite(), Leer())
    assert [k['type'] for k in karten] == ['', '']


def test_alte_attrappen_ohne_typ_kosten_keinen_lauf(css):
    """Ein card_db-Objekt ohne typ_von_druck darf nichts umwerfen."""
    class Alt:
        def get_latest_low_rarity_version(self, name):
            return None
    karten = css.extract_cards_from_decklist_soup(seite(), Alt())
    assert len(karten) == 1
    assert karten[0]['type'] == ''


# --- Der Druckindex --------------------------------------------------

def test_der_index_verknuepft_ueber_set_und_nummer(css):
    """CLAUDE.md: *Never join card data by name.* Namen sind innerhalb
    eines Sets nicht eindeutig."""
    db = css.CardDatabaseLookup()
    if not db.nach_druck:
        pytest.skip('Kartendatenbank in dieser Umgebung nicht vorhanden')
    assert db.typ_von_druck('SVI', '196') == 'Item'
    assert db.typ_von_druck('SVE', '9') == 'Basic Energy'
    assert db.typ_von_druck('svi', ' 196 ') == 'Item', (
        'Schreibweise und Leerzeichen duerfen den Schluessel nicht brechen.')
    assert db.typ_von_druck('ZZZ', '999') == ''


def test_get_card_liefert_dasselbe_wie_vorher(css):
    db = css.CardDatabaseLookup()
    if not db.nach_druck:
        pytest.skip('Kartendatenbank in dieser Umgebung nicht vorhanden')
    k = db.get_card('SVI', '196')
    assert k and k['type'] == 'Item'
    assert set(k) == {'set_name', 'rarity', 'type', 'image_url'}
    assert db.get_card('ZZZ', '999') is None


def test_jeder_typwert_wird_vom_frontend_einsortiert(css):
    """Die Werte, die tatsaechlich in den ausgelieferten Zeilen
    vorkommen, muessen in kat() einen Zweig treffen — sonst waere die
    gefuellte Spalte wieder eine stille Fehlaussage."""
    db = css.CardDatabaseLookup()
    if not db.nach_druck:
        pytest.skip('Kartendatenbank in dieser Umgebung nicht vorhanden')
    import csv as _csv
    pfad = os.path.join(WURZEL, 'data', 'tournament_decklists_per_player.csv')
    if not os.path.exists(pfad):
        pytest.skip('Zeilendatei nicht vorhanden')
    erlaubt = {'Basic', 'Stage 1', 'Stage 2', 'Supporter', 'Item', 'Tool',
               'Stadium', 'Basic Energy', 'Special Energy'}
    gesehen = set()
    with open(pfad, encoding='utf-8-sig') as f:
        for r in _csv.DictReader(f):
            gesehen.add(db.typ_von_druck((r.get('set_code') or '').strip(),
                                         (r.get('set_number') or '').strip()))
    # BENANNT STATT NULL (23.09.2026). Hier stand `'' not in gesehen`.
    # Der Wochenlauf #147 brachte 455 Zeilen mit den JP-Drucken MEE-9 bis
    # MEE-16 (Energien und Items), zu denen die Kartendatenbank keinen Typ
    # kennt — und kennen kann sie ihn nicht: sie fuehrt MEE-13 als
    # "Poke Pad", die Turnierliste nennt es "Psychic Energy". Die
    # JP-Nummerierung der Decklisten ist eine andere als die der
    # jp_prints. Wer sie aufloeste, schriebe den FALSCHEN Typ hinein; der
    # Scraper laesst das Feld deshalb absichtlich leer, damit der
    # Rueckfall im Frontend greift.
    #
    # Null bleibt das Ziel. Verlangt wird deshalb nicht "keine Luecke",
    # sondern "keine UNBENANNTE Luecke" — dieselbe Form wie in
    # test_paldea_tauros.py. Jeder unaufloesbare Druck steht mit Anzahl in
    # data/datenluecken.json und damit im Admin-Bereich.
    assert gesehen <= erlaubt | {''}, sorted(gesehen - erlaubt - {''})
    if '' in gesehen:
        _benannte_drucke_pruefen(pfad, db)


# --- Der Bestand ----------------------------------------------------

def test_die_ausgelieferte_spalte_ist_gefuellt():
    """Der Extraktor wirkt nur auf NEUE Zeilen. Den Bestand hat
    scripts/fuelle_kartentyp.py nachgezogen — ohne einen einzigen
    Abruf, weil der Typ lokal steht (CLAUDE.md: *never re-fetch data
    you already have*)."""
    import csv as _csv
    pfad = os.path.join(WURZEL, 'data', 'tournament_decklists_per_player.csv')
    if not os.path.exists(pfad):
        pytest.skip('Zeilendatei nicht vorhanden')
    n = leer = 0
    with open(pfad, encoding='utf-8-sig') as f:
        for r in _csv.DictReader(f):
            n += 1
            if not (r.get('type') or '').strip():
                leer += 1
    assert n > 0
    # BEFUND 10.09.2026, NICHT REPARIERT SONDERN AN DER WURZEL BEHOBEN:
    # drei Zeilen (Slowpoke MEP 86, aus drei Online-Turnieren) standen
    # ohne Typ da. Grund war KEINE Luecke der Quelle — limitlesstcg.com
    # schreibt auf /cards/MEP/86 "Pokémon - Basic". Gefehlt hat der Typ
    # in data/all_cards_database.csv, weil `scrape_promo_set_pages` in
    # backend/scrapers/all_cards_scraper.py Karten ohne Listenzeile
    # anlegt und der Detaillauf zwar Name, Energie und KP nachholte,
    # den Typ aber nicht. Betroffen waren 51 von 5.146 Karten, alle aus
    # den Promo-Sets MEP und SVP.
    #
    # Die Kartendatenbank ist nachgezogen (51 Werte, jeder einzeln an
    # der Quelle nachgesehen und ueber den Kartennamen gegengeprueft),
    # und der Detaillauf holt den Typ jetzt selbst. Die drei Zeilen
    # hier fuellt `python scripts/fuelle_kartentyp.py --schreiben` beim
    # naechsten Lauf — der Schritt steht im Wochenlauf.
    #
    # Bis dahin wird VERAENDERUNG geprueft, nicht Hoehe (CLAUDE.md:
    # "Absolute quality thresholds produce noise here"). Ein Anstieg
    # ueber den Grundstand heisst, dass eine NEUE Luecke dazugekommen
    # ist.
    # BENANNT STATT GEZAEHLT (23.09.2026). Hier stand `leer <= 3`. Eine
    # Zahl sagt nicht, WELCHE Luecke dazugekommen ist, und sie haelt den
    # Deploy an, sobald die Quelle einen Druck fuehrt, den die
    # Kartendatenbank nicht kennt — im Wochenlauf #147 waren das 455
    # Zeilen aus MEE-9 bis MEE-16, die sich nicht aufloesen LASSEN
    # (siehe die Begruendung weiter oben).
    #
    # Geprueft wird deshalb die Benennung: jeder Druck ohne Typ steht in
    # data/datenluecken.json. Verschwindet er dort, faellt dieser Test
    # wie bisher.
    if leer:
        import backend.core.card_scraper_shared as _css  # noqa: F401
    if leer:
        _benannte_drucke_pruefen(pfad, None)


def test_das_fuellskript_schreibt_nur_ohne_zutun_nichts(tmp_path):
    """Ohne --schreiben wird berichtet, nicht geaendert."""
    import importlib.util
    import csv as _csv
    quelle = os.path.join(WURZEL, 'data', 'tournament_decklists_per_player.csv')
    if not os.path.exists(quelle):
        pytest.skip('Zeilendatei nicht vorhanden')
    ziel = tmp_path / 'p.csv'
    with open(quelle, encoding='utf-8-sig') as f:
        zeilen = list(_csv.DictReader(f))[:50]
    spalten = list(zeilen[0].keys())
    for r in zeilen:
        r['type'] = ''
    with open(ziel, 'w', encoding='utf-8', newline='') as f:
        w = _csv.DictWriter(f, fieldnames=spalten)
        w.writeheader()
        w.writerows(zeilen)
    vorher = ziel.read_text(encoding='utf-8')

    spec = importlib.util.spec_from_file_location(
        'fuelle', os.path.join(WURZEL, 'scripts', 'fuelle_kartentyp.py'))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)

    assert m.lauf(str(ziel), schreiben=False) == 0
    assert ziel.read_text(encoding='utf-8') == vorher, 'ohne --schreiben geaendert'

    assert m.lauf(str(ziel), schreiben=True) == 0
    with open(ziel, encoding='utf-8-sig') as f:
        neu = list(_csv.DictReader(f))
    assert len(neu) == len(zeilen)
    assert all((r.get('type') or '').strip() for r in neu)
    assert list(neu[0].keys()) == spalten, 'das Schema darf sich nicht aendern'


def _benannte_drucke_pruefen(pfad, db):
    """Jeder Druck ohne Kartentyp steht namentlich im Lueckeninventar.

    Der Vergleich laeuft ueber (set_code, set_number) — dieselbe
    Schluesselbildung wie in scripts/datenluecken.py, damit beide Seiten
    nicht auseinanderlaufen koennen.
    """
    import csv as _csv
    import json as _json

    if db is None:
        sys.path.insert(0, os.path.join(WURZEL, 'backend', 'core'))
        import card_scraper_shared as _css
        db = _css.CardDatabaseLookup()
        if not db.nach_druck:
            pytest.skip('Kartendatenbank in dieser Umgebung nicht vorhanden')

    offen = {}
    with open(pfad, encoding='utf-8-sig') as f:
        for r in _csv.DictReader(f):
            satz = (r.get('set_code') or '').strip()
            nummer = (r.get('set_number') or '').strip()
            if not satz or not nummer:
                continue
            if db.typ_von_druck(satz, nummer):
                continue
            offen['%s %s' % (satz, nummer)] = offen.get('%s %s' % (satz, nummer), 0) + 1

    inventar = os.path.join(WURZEL, 'data', 'datenluecken.json')
    with open(inventar, encoding='utf-8') as f:
        luecken = _json.load(f)['luecken']
    benannt = {
        l['id'].split('/', 1)[1]
        for l in luecken if l['klasse'] == 'kartentyp'
    }
    fehlend = sorted(
        k for k in offen if k.lower().replace(' ', '-') not in benannt)
    assert not fehlend, (
        '%d Drucke ohne Kartentyp stehen NICHT im Lueckeninventar: %s. '
        'Neu erzeugen mit "python3 scripts/datenluecken.py" — eine geduldete '
        'Luecke ist in Ordnung, eine unbenannte nicht.'
        % (len(fehlend), fehlend[:8]))
