"""Leere Pruefdateien behaupten Abdeckung, die es nicht gibt.

BEFUND (12.09.2026)
-------------------
19 Dateien sind 0 Byte gross, alle aus demselben Commit vom 22.05.2026
("phase-4: restore 30 tests deleted by wave-1/wave-2" — die
Wiederherstellung hat leere Dateien wiederhergestellt). `pytest` sammelt
daraus 0 Tests und schweigt dazu; Playwright ueberspringt sie
kommentarlos.

Der JS-Lauf hat diesen Schutz seit dem 30.08.2026
(`scripts/run-js-unit-tests.sh`): leere Dateien zaehlen dort nicht als
bestanden und werden beim Namen genannt. Fuer die drei uebrigen Suiten
gab es nichts Vergleichbares.

DIE ENTSCHEIDUNG IST DIESELBE WIE DAMALS
----------------------------------------
Nicht loeschen — jeder Name benennt eine Luecke, die jemand schliessen
wollte, und ein geloeschter Name ist eine vergessene Luecke. Zaehlen und
benennen, damit niemand die Namen fuer Abdeckung haelt.

Diese Datei ist deshalb ein Bestandsverzeichnis, kein Verbot:
* Kommt eine LEERE Datei DAZU, wird es rot — jemand hat einen Namen
  angelegt und nichts hineingeschrieben.
* Wird eine gefuellt, wird es ebenfalls rot — mit der Aufforderung, die
  Zeile hier zu streichen. So schrumpft die Liste sichtbar.
"""
import os

# .../tests/python/<diese Datei> -> drei Ebenen hoch ist die Wurzel.
WURZEL = os.path.dirname(os.path.dirname(
    os.path.dirname(os.path.abspath(__file__))))

# Dateien, die leer sein DUERFEN: Python braucht sie als Paketmarker
# bzw. als Haken, den pytest von sich aus sucht. Sie behaupten keine
# Abdeckung.
LEER_ERLAUBT = {
    'tests/python/__init__.py',
    'tests/python/conftest.py',
}

# Stand 12.09.2026. Alle aus dem Commit vom 22.05.2026.
ERWARTET_LEER = [
    'tests/e2e/cards-image-keyboard.e2e.spec.js',
    'tests/e2e/cards-keyboard-accessibility.e2e.spec.js',
    'tests/e2e/city-league-hero-combined-navigation.e2e.spec.js',
    'tests/e2e/city-league-language-switch.e2e.spec.js',
    'tests/e2e/proxy-import-errors.e2e.spec.js',
    'tests/e2e/proxy-queue-reset.e2e.spec.js',
    'tests/e2e/rarity-switcher.e2e.spec.js',
    # Diese eine hat als einzige eine Erklaerung: Parkeintrag in
    # docs/geparkte-features.md plus Kommentarkopf in
    # tests/e2e/run-visual-fullpage-ci.js. Der naechtliche Lauf hat
    # deshalb rund 105 Naechte lang einen gruenen Haken ohne einen
    # einzigen Test gemeldet.
    'tests/e2e/visual-full-page-coverage.spec.js',
    'tests/e2e_battle_journal.py',
    'tests/e2e_city_league_meta.py',
    'tests/e2e_current_meta_global.py',
    'tests/e2e_deck_analysis_japan.py',
    'tests/e2e_past_meta.py',
    'tests/python/test_card_database.py',
    'tests/python/test_card_scraper_shared.py',
    'tests/python/test_csv_and_settings.py',
    'tests/python/test_scraper_additional.py',
    'tests/python/test_scraper_extraction.py',
    'tests/python/test_scraper_functions.py',
]


def _leere_dateien():
    gefunden = []
    for ordner, muster in (
        ('tests', ('e2e_', '.py')),
        ('tests/python', ('test_', '.py')),
        ('tests/e2e', ('', '.js')),
    ):
        pfad = os.path.join(WURZEL, ordner)
        if not os.path.isdir(pfad):
            continue
        for name in sorted(os.listdir(pfad)):
            if not name.startswith(muster[0]) or not name.endswith(muster[1]):
                continue
            voll = os.path.join(pfad, name)
            if not os.path.isfile(voll) or os.path.getsize(voll) > 0:
                continue
            rel = f'{ordner}/{name}'
            if rel in LEER_ERLAUBT:
                continue
            gefunden.append(rel)
    return sorted(gefunden)


def test_keine_unbekannte_leere_pruefdatei():
    ist = _leere_dateien()
    dazu = [p for p in ist if p not in ERWARTET_LEER]
    weg = [p for p in ERWARTET_LEER if p not in ist]

    assert not dazu, (
        'NEUE leere Pruefdatei(en): ' + ', '.join(dazu) + '\n'
        'Eine leere Datei sammelt null Tests und meldet nichts — ihr Name '
        'behauptet Abdeckung, die es nicht gibt. Entweder fuellen, oder '
        'hier in ERWARTET_LEER eintragen und im Kommentar begruenden, '
        'warum sie leer bleibt.')

    assert not weg, (
        'Diese Datei(en) sind nicht mehr leer: ' + ', '.join(weg) + '\n'
        'Schoen — bitte die Zeile(n) aus ERWARTET_LEER streichen, damit '
        'die Liste weiter zeigt, was wirklich fehlt.')


def test_die_zahl_steht_ehrlich_da():
    """Damit die Groesse der Luecke nicht in einer Liste verschwindet."""
    ist = _leere_dateien()
    assert len(ist) <= len(ERWARTET_LEER), (
        f'{len(ist)} leere Pruefdateien — mehr als die {len(ERWARTET_LEER)} '
        f'bekannten. Die Abdeckung schrumpft, statt zu wachsen.')
