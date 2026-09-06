"""Der JH-Scraper haengte mit den Spalten der NEUEN Zeile an die ALTE Kopfzeile.

Gefunden am 06.09.2026 bei der Durchsicht aller Schreibwege, nachdem
derselbe Fehler in per_decklist_scraper.py eine Datei auf `main`
beschaedigt hatte. Hier war die Bauart sogar schaerfer:

    fields = list(rows[0].keys())        # aus der ersten NEUEN Zeile
    mode = "a" if append_mode ... else "w"
    if mode == "w": writer.writeheader()

Die Spaltenliste kam aus dem dict der neuen Zeile, die Kopfzeile aus dem
letzten Lauf. In Python bestimmt die Schluesselreihenfolge des dict die
Spaltenreihenfolge — es genuegte also, dass irgendwo weiter oben ein Feld
dazukam ODER die Reihenfolge sich aenderte, und die angehaengten Zeilen
standen verschoben unter einer Kopfzeile, die etwas anderes verspricht.

Betroffen waeren tournament_cards_data_overview.csv und die
tournament_cards_data_cards_*.csv — die groessten Dateien, die die Seite
liest.

Diese Datei prueft VERHALTEN: es wird wirklich auf die Platte geschrieben
und danach gelesen. Die vorhandene Pruefung `_pruefe_kartenzeilen` prueft
WERTE (Zahlformat, is_ace_spec) und haette den Versatz nie bemerkt.
"""

import csv
import importlib.util
import os
import stat
import sys
import tempfile

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)
# Der Scraper importiert seine Nachbarn ohne Paketpfad — dieselben zwei
# Zeilen stehen in tests/python/test_druck_von_der_seite.py.
sys.path.insert(0, os.path.join(ROOT, 'backend', 'core'))
sys.path.insert(0, os.path.join(ROOT, 'backend', 'scrapers'))

_spec = importlib.util.spec_from_file_location(
    'tournament_scraper_JH',
    os.path.join(ROOT, 'backend', 'scrapers', 'tournament_scraper_JH.py'))
JH = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(JH)


def _lies(pfad):
    with open(pfad, newline='', encoding='utf-8-sig') as f:
        rd = csv.DictReader(f, delimiter=';')
        return list(rd.fieldnames or []), list(rd)


@pytest.fixture()
def pfad():
    with tempfile.TemporaryDirectory() as d:
        yield os.path.join(d, 'cards.csv')


def test_neue_datei_bekommt_kopfzeile_und_zeilen(pfad):
    JH._schreibe_csv_kopftreu(pfad, [{'a': '1', 'b': '2'}], append_mode=True)
    kopf, zeilen = _lies(pfad)
    assert kopf == ['a', 'b']
    assert zeilen == [{'a': '1', 'b': '2'}]


def test_gleiche_spalten_werden_angehaengt(pfad):
    JH._schreibe_csv_kopftreu(pfad, [{'a': '1', 'b': '2'}], append_mode=True)
    JH._schreibe_csv_kopftreu(pfad, [{'a': '3', 'b': '4'}], append_mode=True)
    kopf, zeilen = _lies(pfad)
    assert kopf == ['a', 'b']
    assert len(zeilen) == 2, 'der schnelle Anhaengeweg hat die alte Zeile verloren'
    assert zeilen[0]['a'] == '1' and zeilen[1]['a'] == '3'


def test_neue_spalte_verschiebt_nichts(pfad):
    """Der Fall, der per_decklist_scraper.py am selben Tag zerlegt hat."""
    JH._schreibe_csv_kopftreu(pfad, [{'a': '1', 'b': '2'}], append_mode=True)
    JH._schreibe_csv_kopftreu(pfad, [{'a': '3', 'b': '4', 'c': 'neu'}],
                              append_mode=True)
    kopf, zeilen = _lies(pfad)
    assert kopf == ['a', 'b', 'c'], f'Kopfzeile nicht mitgezogen: {kopf}'
    assert len(zeilen) == 2
    alt = zeilen[0]
    assert alt['a'] == '1' and alt['b'] == '2', 'alte Zeile verrutscht'
    assert alt['c'] == '', ('die neue Spalte muss bei alten Zeilen LEER bleiben — '
                            'leer heisst "nicht erhoben", ein geratener Wert waere '
                            'schlimmer als die Luecke')
    assert zeilen[1]['c'] == 'neu'


def test_andere_reihenfolge_verschiebt_nichts(pfad):
    """Reicht schon: gleiche Schluessel, andere Reihenfolge im dict.

    Das ist der Grund, warum diese Fassung schaerfer war als die in
    per_decklist_scraper.py — dort stand die Spaltenliste wenigstens fest
    verdrahtet in CSV_FIELDS."""
    JH._schreibe_csv_kopftreu(pfad, [{'a': '1', 'b': '2'}], append_mode=True)
    # dasselbe Feldpaar, umgekehrt aufgebaut
    JH._schreibe_csv_kopftreu(pfad, [{'b': '4', 'a': '3'}], append_mode=True)
    kopf, zeilen = _lies(pfad)
    assert kopf == ['a', 'b']
    assert len(zeilen) == 2
    assert zeilen[1]['a'] == '3' and zeilen[1]['b'] == '4', (
        f'Werte vertauscht: {zeilen[1]} — die Zeile wurde nach der Reihenfolge '
        'des neuen dict geschrieben statt nach der Kopfzeile')


def test_ohne_append_mode_wird_neu_geschrieben(pfad):
    JH._schreibe_csv_kopftreu(pfad, [{'a': '1', 'b': '2'}], append_mode=True)
    JH._schreibe_csv_kopftreu(pfad, [{'a': '9', 'b': '9'}], append_mode=False)
    kopf, zeilen = _lies(pfad)
    assert kopf == ['a', 'b']
    assert len(zeilen) == 1 and zeilen[0]['a'] == '9'


def test_die_alte_bauart_kommt_nicht_zurueck():
    """Quelltextsperre gegen genau das Muster.

    Ausnahmsweise am Text statt am Verhalten: die alte Fassung LIESSE sich
    nicht mehr aufrufen, ohne den Helfer zu umgehen — und genau das soll
    auffallen."""
    quelle = open(os.path.join(ROOT, 'backend', 'scrapers',
                               'tournament_scraper_JH.py'), encoding='utf-8').read()
    a = quelle.index('def save_csv_files(')
    block = quelle[a:a + 4000]
    assert 'fields = list(rows[0].keys())' not in block, (
        'Die Spaltenliste wird wieder aus der ersten neuen Zeile abgeleitet.')
    assert '_schreibe_csv_kopftreu(' in block, (
        'save_csv_files schreibt wieder am kopftreuen Helfer vorbei.')


def test_der_semikolon_trenner_bleibt(pfad):
    """Diese Dateien sind semikolongetrennt.

    Die erste Fassung dieses Docstrings berief sich auf data/_consumers.md
    — falsch, tournament_cards_data kommt dort ueberhaupt nicht vor.
    Angemerkt von der unabhaengigen Pruefung am 06.09.2026. Der Beleg ist
    stattdessen der Verbraucher selbst: backend/core/prepare_card_data.py
    liest die Datei bei :1104 mit `csv.DictReader(f, delimiter=";")`, und
    data/tournament_cards_data_overview.csv auf `main` traegt eine
    semikolongetrennte Kopfzeile. Ein Trennerwechsel waere ein stiller
    Bruch bei jedem Leser."""
    JH._schreibe_csv_kopftreu(pfad, [{'a': '1', 'b': '2'}], append_mode=True)
    roh = open(pfad, encoding='utf-8-sig').read()
    assert roh.splitlines()[0] == 'a;b', f'Trenner geaendert: {roh.splitlines()[0]!r}'


# ── Was die unabhaengige Pruefung am 06.09.2026 zusaetzlich verlangt hat ──
#
# Die erste Fassung des Helfers behob den Versatz, brachte aber drei
# Verschlechterungen mit, die keine Zusicherung abgedeckt hat. Die
# folgenden Faelle halten sie fest.


def test_unlesbare_datei_bricht_ab_statt_zu_ueberschreiben(pfad):
    """Der schlimmste Fall der ersten Fassung: stiller Totalverlust.

    `_vorhandene_kopfzeile` fing jede Ausnahme und lieferte None — genau
    das, was auch "die Datei gibt es nicht" bedeutet. Der Aufrufer ging
    dann in den Neuschreib-Weg und ersetzte einen Bestand von bis zu
    111 MB durch die paar Zeilen des laufenden Aufrufs, ohne Meldung.
    """
    with open(pfad, 'wb') as f:
        f.write(b'\xff\xfe a;b\r\n1;2\r\n9;9\r\n')
    vorher = open(pfad, 'rb').read()

    with pytest.raises(JH.KopfzeileUnlesbar):
        JH._schreibe_csv_kopftreu(pfad, [{'a': '7', 'b': '8'}], append_mode=True)

    assert open(pfad, 'rb').read() == vorher, (
        'die unlesbare Datei wurde trotzdem angefasst')


def test_beschaedigte_altzeilen_brechen_ab_statt_gekuerzt_zu_werden(pfad):
    """So sieht aus, was die alte Falle hinterlassen hat.

    Kopfzeile mit 2 Spalten, Zeilen mit 3 Werten. Beim Neuschreiben liesse
    sich der dritte Wert keiner Spalte zuordnen — die erste Fassung warf
    ihn wortlos weg, und der erste Lauf nach der Auslieferung haette
    geloescht, was von der Beschaedigung noch zu bergen war.
    "Report, don't silently repair" (CLAUDE.md).
    """
    with open(pfad, 'w', newline='', encoding='utf-8-sig') as f:
        f.write('a;b\r\n1;2\r\n7;8;UEBERZAEHLIG\r\n')
    vorher = open(pfad, 'rb').read()

    with pytest.raises(JH.KopfzeileUnlesbar) as e:
        JH._schreibe_csv_kopftreu(pfad, [{'a': '9', 'b': '9', 'c': 'neu'}],
                                  append_mode=True)
    assert 'UEBERZAEHLIG' not in str(e.value), 'Datenwert in der Meldung'
    assert '1 von 2' in str(e.value), (
        f'die Meldung nennt die Zahl der betroffenen Zeilen nicht: {e.value}')
    assert open(pfad, 'rb').read() == vorher, 'Bestand angefasst'


def test_unbekanntes_feld_faellt_weiterhin_laut_um(pfad):
    """`extrasaction="ignore"` gehoert hier NICHT hin.

    Der alte DictWriter stand auf dem Vorgabewert "raise". Eine neue Zeile
    mit einem Feld, das die Kopfzeile nicht kennt, ist derselbe Fehler,
    gegen den diese Funktion antritt — nur innerhalb einer Charge.
    test_jh_reassembly_header.py haelt einen echten Vorfall fest, bei dem
    genau diese Ausnahme ihn sichtbar gemacht hat.
    """
    JH._schreibe_csv_kopftreu(pfad, [{'a': '1', 'b': '2'}], append_mode=True)
    with pytest.raises(ValueError):
        JH._schreibe_csv_kopftreu(
            pfad,
            [{'a': '3', 'b': '4'}, {'a': '5', 'b': '6', 'unbekannt': 'x'}],
            append_mode=True)


def test_rechte_bleiben_wie_sie_waren(pfad):
    """tempfile.mkstemp legt mit 0600 an — ohne Gegenmassnahme verengt
    jedes Neuschreiben die Rechte stillschweigend."""
    JH._schreibe_csv_kopftreu(pfad, [{'a': '1', 'b': '2'}], append_mode=True)
    os.chmod(pfad, 0o640)
    JH._schreibe_csv_kopftreu(pfad, [{'a': '3', 'b': '4', 'c': 'neu'}],
                              append_mode=True)
    assert stat.S_IMODE(os.stat(pfad).st_mode) == 0o640, (
        'die Rechte haben sich beim Neuschreiben veraendert')


def test_gescheiterte_charge_schreibt_keine_halbe_zeile(pfad):
    """Der Anhaengeweg ist als einziger nicht atomar.

    Faellt der DictWriter erst bei Zeile 2 einer Charge um, stuenden die
    Zeilen davor schon in der echten Datei — und der naechste Lauf haenge
    sie ein zweites Mal an. `_pruefe_felder` zieht die Ausnahme deshalb
    VOR das Oeffnen.

    (Die erste Fassung dieses Falls hiess "keine Zwischendatei bleibt
    liegen" und mass etwas anderes als ihr Name behauptete — der
    Anhaengeweg legt naemlich gar keine Zwischendatei an. Aufgefallen bei
    der Mutationsprobe der unabhaengigen Pruefung am 06.09.2026.)
    """
    JH._schreibe_csv_kopftreu(pfad, [{'a': '1', 'b': '2'}], append_mode=True)
    with pytest.raises(ValueError):
        JH._schreibe_csv_kopftreu(
            pfad, [{'a': '3', 'b': '4'}, {'a': '5', 'b': '6', 'weg': 'x'}],
            append_mode=True)
    kopf, zeilen = _lies(pfad)
    assert kopf == ['a', 'b'] and len(zeilen) == 1, (
        f'die gescheiterte Charge hat {len(zeilen) - 1} Zeile(n) hinterlassen')


def test_keine_zwischendatei_bleibt_liegen(pfad):
    """Jetzt wirklich im NEUSCHREIB-Weg — nur dort entsteht ueberhaupt eine.

    Der eigene tmp/replace-Weg der ersten Fassung liess bei einem Abbruch
    eine Datei mit festem Namen liegen: beim Monolithen 111 MB Muell je
    Fehlschlag, und bei zwei gleichzeitigen Laeufen kollidierte der Name.
    atomic_write_file benutzt mkstemp und raeumt auf.

    Der Weg wird betreten, weil rows[0] eine Spalte mehr traegt als die
    Kopfzeile; das fremde Feld steckt erst in Zeile 2.
    """
    JH._schreibe_csv_kopftreu(pfad, [{'a': '1', 'b': '2'}], append_mode=True)
    with pytest.raises(ValueError):
        JH._schreibe_csv_kopftreu(
            pfad,
            [{'a': '3', 'b': '4', 'c': 'neu'},
             {'a': '5', 'b': '6', 'c': 'neu', 'weg': 'x'}],
            append_mode=True)
    verzeichnis = os.path.dirname(pfad)
    reste = [n for n in os.listdir(verzeichnis) if n != os.path.basename(pfad)]
    assert reste == [], f'Zwischendateien liegen geblieben: {reste}'
    kopf, zeilen = _lies(pfad)
    assert kopf == ['a', 'b'] and len(zeilen) == 1, (
        'der gescheiterte Lauf hat den Bestand angefasst')


def test_frisch_angelegte_datei_bekommt_die_ueblichen_rechte(pfad):
    """mkstemp legt mit 0600 an — eine NEUE Datei bekaeme sonst engere
    Rechte als bisher, wo ein schlichtes open(pfad, "w") galt.

    Angemerkt von der unabhaengigen Pruefung am 06.09.2026: die
    Wiederherstellung deckte nur den Fall ab, dass es schon eine Datei gab.
    """
    umask = os.umask(0)
    os.umask(umask)
    erwartet = 0o666 & ~umask

    JH._schreibe_csv_kopftreu(pfad, [{'a': '1', 'b': '2'}], append_mode=True)
    assert stat.S_IMODE(os.stat(pfad).st_mode) == erwartet, (
        'eine frisch angelegte Datei traegt andere Rechte als ein '
        'schlichtes open(pfad, "w") gegeben haette')


def test_abbruch_an_der_zweiten_datei_laesst_die_erste_unberuehrt(tmp_path):
    """Das halbe Turnier.

    save_csv_files schreibt erst die Uebersicht, dann die Karten. Bricht
    es an der ZWEITEN ab, traegt die Uebersicht eine Zeile mit
    `total_cards`, die Kartendatei aber nichts — und weil
    save_scraped_tournaments die Kennung vorher vermerkt, holt auch kein
    spaeterer Lauf sie nach. Nachgestellt von der unabhaengigen Pruefung
    am 06.09.2026.

    Deshalb prueft save_csv_files jetzt BEIDE Ziele, bevor es in das erste
    schreibt. Dieser Fall haelt die Reihenfolge fest.
    """
    uebersicht = str(tmp_path / 'x_overview.csv')
    karten = str(tmp_path / 'x_cards.csv')

    JH._schreibe_csv_kopftreu(uebersicht, [{'id': 'T0'}], append_mode=True)
    # Die Kartendatei so beschaedigen, wie die alte Falle es hinterliess:
    # Kopf mit 2 Spalten, eine Zeile mit 3 Werten.
    with open(karten, 'w', newline='', encoding='utf-8-sig') as f:
        f.write('k;v\r\n1;2\r\n7;8;UEBERZAEHLIG\r\n')

    uebersicht_vorher = open(uebersicht, 'rb').read()

    with pytest.raises(JH.KopfzeileUnlesbar):
        for pf, zeilen in [(uebersicht, [{'id': 'T9'}]),
                           (karten, [{'k': '9', 'v': '9', 'neu': 'x'}])]:
            JH._pruefe_ziel_schreibbar(pf, zeilen, append_mode=True)

    assert open(uebersicht, 'rb').read() == uebersicht_vorher, (
        'die Uebersicht wurde geschrieben, obwohl die Kartendatei den Lauf '
        'abgebrochen hat — das ist das halbe Turnier')


def test_die_vorpruefung_steht_vor_dem_schreiben():
    """Quelltextsperre gegen das Zurueckdrehen der Reihenfolge."""
    quelle = open(os.path.join(ROOT, 'backend', 'scrapers',
                               'tournament_scraper_JH.py'), encoding='utf-8').read()
    a = quelle.index('def save_csv_files(')
    block = quelle[a:a + 4000]
    i_pruef = block.index('_pruefe_ziel_schreibbar(')
    i_schreib = block.index('_schreibe_csv_kopftreu(')
    assert i_pruef < i_schreib, (
        'save_csv_files schreibt wieder, bevor beide Ziele geprueft sind')


def test_leere_vorhandene_datei_bekommt_eine_kopfzeile(pfad):
    """Die alte Fassung hing ohne Kopfzeile an und hinterliess ein dauerhaft
    kopfloses Ergebnis. Das ist eine stille Verbesserung — sie gehoert
    festgehalten, damit sie niemand versehentlich zuruecknimmt."""
    open(pfad, 'w').close()
    JH._schreibe_csv_kopftreu(pfad, [{'a': '1', 'b': '2'}], append_mode=True)
    kopf, zeilen = _lies(pfad)
    assert kopf == ['a', 'b']
    assert zeilen == [{'a': '1', 'b': '2'}]


def test_eine_spalte_darf_heissen_wie_der_sammelschluessel(pfad):
    """Der Sammelschluessel darf keine Kopfzeilenspalte sein koennen.

    Solange er eine Zeichenkette war, konnte eine heile Datei mit genau
    dieser Spalte als beschaedigt gemeldet werden — ein Falsch-Positiv mit
    lautem Abbruch. Angemerkt von der unabhaengigen Pruefung am
    06.09.2026; behoben, indem _UEBERZAEHLIG ein object() ist.
    """
    assert not isinstance(JH._UEBERZAEHLIG, str), (
        'der Sammelschluessel ist wieder eine Zeichenkette und damit als '
        'Spaltenname erreichbar')
    with open(pfad, 'w', newline='', encoding='utf-8-sig') as f:
        f.write('a;__ueberzaehlige_werte__\r\n1;2\r\n')
    # Neue Spalte erzwingt den Neuschreib-Weg, der die Beschaedigung prueft.
    JH._schreibe_csv_kopftreu(
        pfad, [{'a': '3', '__ueberzaehlige_werte__': '4', 'c': 'neu'}],
        append_mode=True)
    kopf, zeilen = _lies(pfad)
    assert kopf == ['a', '__ueberzaehlige_werte__', 'c']
    assert len(zeilen) == 2 and zeilen[0]['__ueberzaehlige_werte__'] == '2'
