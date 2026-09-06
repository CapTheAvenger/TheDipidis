"""Der Druck steht auf der Seite — wir haben ihn fuer Trainer weggeworfen.

BEFUND (Agententeam DATEN, 06.09.2026). `extract_cards_from_decklist_soup`
las `(set, number)` nur fuer Pokemon von der Decklistenseite. Trainer und
Energie wurden AUSSCHLIESSLICH ueber den Kartennamen aufgeloest, mit
`get_latest_low_rarity_version()` — genau das, was CLAUDE.md unter
"Data rules" verbietet: *Never join card data by name.*

Nachgemessen an zehn Listen von limitlesstcg.com, 232 Kartenzeilen:

    Pokemon          85 von  85 richtig
    Trainer/Energie  70 von 147 FALSCH   (47,6 %)

Betroffen: 19.003 der 30.459 Zeilen in
data/tournament_decklists_per_player.csv (62,4 %).

DIE SEITE LIEFERT DIE RICHTIGE ANGABE DIE GANZE ZEIT MIT. An Boming
Wangs Mega-Excadrill-Liste (Worlds, Platz 37, /decks/list/28784) live
nachgesehen:

    <div class="decklist-card" data-set="DRI" data-number="176">
        Team Rocket's Petrel        wir schrieben ASC 207

    Lillie's Determination   MEG 119  ->  wir: ASC 192
    Buddy-Buddy Poffin       TEF 144  ->  wir: ASC 184
    Boss's Orders            MEG 114  ->  wir: ASC 183
    Ultra Ball               MEG 131  ->  wir: ASC 213
    Pokegear 3.0             SVI 186  ->  wir: BLK  84
    Kieran                   TWM 154  ->  wir: PRE 113
    Metal Energy             MEE   8  ->  wir: EVO  98

Acht von elf Trainer-/Energiezeilen einer einzigen Liste.

WAS DAS KOSTET — ehrlich gemessen. Der Preis nicht viel: der Namensweg
waehlte absichtlich den guenstigsten Druck, fuer diese Liste 5,25 statt
4,90 EUR gegen data/price_data.csv. Der Schaden liegt woanders: falsches
Kartenbild im Deckbauer und im Proxy-Druck, keine Aussage darueber,
WELCHEN Druck die Spieler wirklich spielen, und eine Zuordnung, die
genau dann teuer wird, wenn ein Name mehrere Drucke mit sehr
verschiedenen Preisen traegt. CLAUDE.md nennt das Beispiel: vier
Produkte "Mega Darkrai ex" zu 1,03 / 9,69 / 184,03 / 331,99 EUR.
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


class Db:
    """Kartendatenbank mit genau den Druecken, die hier gebraucht werden."""
    TYPEN = {'TEF-113': 'Basic', 'DRI-176': 'Supporter', 'MEG-119': 'Supporter',
             'MEE-8': 'Basic Energy', 'ASC-207': 'Supporter'}

    def typ_von_druck(self, set_code, number):
        return self.TYPEN.get('%s-%s' % (str(set_code).upper(), number), '')

    def get_latest_low_rarity_version(self, name):
        """Der Namensweg — er zeigt bewusst auf den FALSCHEN Druck, damit
        eine Zusicherung merkt, wenn er wieder greift."""
        class K:
            set_code = 'ASC'
            number = '207'
        return K() if name == "Team Rocket's Petrel" else None


def karte(set_code, nummer, name, anzahl, mit_attribut=True, mit_href=True):
    attr = ' data-set="%s" data-number="%s"' % (set_code, nummer) if mit_attribut else ''
    innen = ('<a href="/cards/%s/%s">%s</a>' % (set_code, nummer, name)) if mit_href else name
    return ('<div class="decklist-card"%s><span class="card-count">%d</span>'
            '<span class="card-name">%s</span></div>' % (attr, anzahl, innen))


def spalte(kopf, *karten):
    return ('<div class="decklist-column"><div class="decklist-column-heading">%s</div>%s</div>'
            % (kopf, ''.join(karten)))


def suppe(html):
    return BeautifulSoup(html, 'html.parser')


# --- Der Befund selbst -----------------------------------------------

def test_der_trainer_bekommt_seinen_druck_von_der_seite(css):
    """Die Zeile aus dem Befund, wortgetreu nachgestellt."""
    html = spalte('Trainer (23)', karte('DRI', '176', "Team Rocket's Petrel", 4))
    k = css.extract_cards_from_decklist_soup(suppe(html), Db())
    assert len(k) == 1
    assert (k[0]['set_code'], k[0]['set_number']) == ('DRI', '176'), (
        'Der Namensweg hat wieder gewonnen — das ist der Befund vom '
        '06.09.2026: die Seite sagt DRI 176, wir schrieben ASC 207.')
    assert k[0]['druck_quelle'] == 'seite'


def test_die_energie_bekommt_ihren_druck_von_der_seite(css):
    html = spalte('Energy (17)', karte('MEE', '8', 'Metal Energy', 17))
    k = css.extract_cards_from_decklist_soup(suppe(html), Db())
    assert (k[0]['set_code'], k[0]['set_number']) == ('MEE', '8')
    assert k[0]['type'] == 'Basic Energy'


def test_pokemon_bleiben_richtig(css):
    """Sie waren nie falsch — 85 von 85 in der Stichprobe."""
    html = spalte('Pokémon (20)', karte('TEF', '113', 'Beldum', 4))
    k = css.extract_cards_from_decklist_soup(suppe(html), Db())
    assert (k[0]['set_code'], k[0]['set_number']) == ('TEF', '113')


def test_alle_drei_spalten_in_einem_lauf(css):
    html = (spalte('Pokémon (20)', karte('TEF', '113', 'Beldum', 4))
            + spalte('Trainer (23)', karte('DRI', '176', "Team Rocket's Petrel", 4),
                                     karte('MEG', '119', "Lillie's Determination", 4))
            + spalte('Energy (17)', karte('MEE', '8', 'Metal Energy', 17)))
    k = css.extract_cards_from_decklist_soup(suppe(html), Db())
    assert len(k) == 4
    assert all(c['druck_quelle'] == 'seite' for c in k)
    ist = {c['name']: (c['set_code'], c['set_number']) for c in k}
    assert ist == {
        'Beldum': ('TEF', '113'),
        "Team Rocket's Petrel": ('DRI', '176'),
        "Lillie's Determination": ('MEG', '119'),
        'Metal Energy': ('MEE', '8'),
    }
    assert sum(c['count'] for c in k) == 29


# --- Der Rueckfall darf ein Rueckfall bleiben ------------------------

def test_ohne_angabe_auf_der_seite_greift_der_name_und_wird_gekennzeichnet(css):
    """Er ist nicht verboten — er darf nur nicht der Normalfall sein,
    und er muss erkennbar sein."""
    html = spalte('Trainer (1)',
                  karte('', '', "Team Rocket's Petrel", 1, mit_attribut=False, mit_href=False))
    k = css.extract_cards_from_decklist_soup(suppe(html), Db())
    assert len(k) == 1
    assert (k[0]['set_code'], k[0]['set_number']) == ('ASC', '207')
    assert k[0]['druck_quelle'] == 'name', (
        'Ohne Kennzeichnung ist von aussen nicht zu sehen, welche Zeilen '
        'geraten sind')


def test_weder_seite_noch_datenbank_gibt_keine_zeile(css):
    """Gemeldet statt geraten: lieber eine Zeile weniger als eine falsche."""
    html = spalte('Trainer (1)',
                  karte('', '', 'Voellig Unbekannte Karte', 1, mit_attribut=False, mit_href=False))
    assert css.extract_cards_from_decklist_soup(suppe(html), Db()) == []


def test_der_href_gewinnt_vor_dem_attribut(css):
    """Beide Wege stehen auf der Seite; die Reihenfolge muss festliegen,
    sonst haengt das Ergebnis am Zufall des Markups."""
    html = spalte('Trainer (1)',
                  '<div class="decklist-card" data-set="XXX" data-number="999">'
                  '<span class="card-count">1</span>'
                  '<span class="card-name"><a href="/cards/DRI/176">'
                  "Team Rocket's Petrel</a></span></div>")
    k = css.extract_cards_from_decklist_soup(suppe(html), Db())
    assert (k[0]['set_code'], k[0]['set_number']) == ('DRI', '176')


def test_japanische_sets_behalten_ihre_saubere_nummer(css):
    """Limitless haengt bei JP-Karten ein ?translate=en an."""
    html = spalte('Pokémon (1)',
                  '<div class="decklist-card"><span class="card-count">1</span>'
                  '<span class="card-name"><a href="/cards/M5/37?translate=en">'
                  'Dhelmise</a></span></div>')
    k = css.extract_cards_from_decklist_soup(suppe(html), Db())
    assert (k[0]['set_code'], k[0]['set_number']) == ('M5', '37')


# --- Rueckfallsperren -------------------------------------------------

def test_die_spalteneinteilung_entscheidet_nichts_mehr(css):
    """`is_pokemon` war die Weiche zum Namensweg. Sie ist weg, und das
    soll sie bleiben."""
    quelle = open(os.path.join(WURZEL, 'backend', 'core', 'card_scraper_shared.py'),
                  encoding='utf-8-sig').read()
    assert 'is_pokemon' not in quelle, (
        'die Weiche ist zurueck — dann loest der Trainerzweig wieder ueber '
        'den Namen auf')


def test_der_befund_steht_mit_seinen_zahlen_im_quelltext():
    quelle = open(os.path.join(WURZEL, 'backend', 'core', 'card_scraper_shared.py'),
                  encoding='utf-8-sig').read()
    for zahl in ['70 von 147', '19.003', '62,4', 'DRI', 'ASC 207']:
        assert zahl in quelle, f'die Angabe {zahl} fehlt in der Begruendung'


# --- Der Waechter meldet den ungeprueften Bestand ---------------------

def test_der_waechter_zaehlt_die_zeilen_ohne_herkunft(tmp_path, monkeypatch):
    """Der Extraktor ist behoben, der Bestand nicht — und anders als beim
    Kartentyp laesst sich das NICHT lokal nachziehen: welchen Druck ein
    Spieler gespielt hat, steht nur auf der Quellseite."""
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        'g_druck', os.path.join(WURZEL, 'scripts', 'data_guardian.py'))
    g = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(g)

    ordner = tmp_path / 'data'
    ordner.mkdir()
    (ordner / 'tournament_decklists_per_player.csv').write_text(
        'card_name,set_code,set_number,druck_quelle\n'
        'A,TEF,1,seite\n'
        'B,DRI,2,name\n'
        'C,MEG,3,\n'
        'D,MEE,4,\n', encoding='utf-8')
    monkeypatch.setattr(g, 'DATA', str(ordner))
    findings = []
    g.check_druck_herkunft(findings)

    stufen = [s for s, _ in findings]
    assert stufen == ['WARN', 'WARN'], findings
    assert '2 von 4' in findings[0][1], findings[0][1]
    assert '1 von 4' in findings[1][1], findings[1][1]
    assert 'KARTENNAMEN' in findings[0][1], 'die Ursache wird nicht genannt'


def test_der_waechter_schweigt_bei_sauberem_bestand(tmp_path, monkeypatch):
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        'g_druck2', os.path.join(WURZEL, 'scripts', 'data_guardian.py'))
    g = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(g)
    ordner = tmp_path / 'data'
    ordner.mkdir()
    (ordner / 'tournament_decklists_per_player.csv').write_text(
        'card_name,set_code,set_number,druck_quelle\nA,TEF,1,seite\nB,DRI,2,seite\n',
        encoding='utf-8')
    monkeypatch.setattr(g, 'DATA', str(ordner))
    findings = []
    g.check_druck_herkunft(findings)
    assert findings == [], findings


def test_die_pruefung_haengt_im_lauf():
    quelle = open(os.path.join(WURZEL, 'scripts', 'data_guardian.py'),
                  encoding='utf-8').read()
    assert '    check_druck_herkunft(findings)\n' in quelle, (
        'eine Pruefung, die niemand aufruft, ist keine Pruefung')


def test_die_spalte_steht_im_schema():
    quelle = open(os.path.join(WURZEL, 'backend', 'scrapers',
                               'per_decklist_scraper.py'), encoding='utf-8').read()
    assert "'druck_quelle'," in quelle, 'die Spalte fehlt in CSV_FIELDS'
    assert "'druck_quelle':              c.get('druck_quelle', '')" in quelle, \
        'die Spalte wird nicht befuellt'
