"""Die Antrittszahl, die auf den Schirm geht, muss eine Zahl sein.

ANLASS (02.09.2026)
-------------------
Die Meta-Performance zeigte "532,5 Turnier-Antritte" und "35,5 Top 8".
Der Betreiber: "wie kann es hier ,5 Antritte geben? entweder man hat
teilgenommen oder nicht aber halb teilnehmen geht nicht."

Er hat recht. Die Halben waren echt, aber sie waren keine Antritte: der
Scraper gewichtet nach AKTUALITAET — Turniere der letzten sieben Tage
zaehlen 1,0, aeltere 0,5 — und schrieb nur diese gewichtete Summe in die
Datei. Die Gewichtung gehoert in die QUOTE (frische Turniere sollen
schwerer wiegen); in einer Zahl, ueber der "Antritte" steht, hat sie
nichts zu suchen.

Seitdem fuehrt die Datei beides: `total_brought_weighted` fuer die
Rechnung, `total_brought` fuer die Anzeige.
"""
import csv
import io
import os
import sys
from datetime import datetime, timedelta, timezone

import pytest

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, WURZEL)

SKRIPT = os.path.join(WURZEL, 'backend', 'scrapers', 'online_tournament_scraper.py')


def quelle():
    with io.open(SKRIPT, encoding='utf-8') as f:
        return f.read()


def test_die_rohen_spalten_werden_geschrieben():
    s = quelle()
    i = s.index('fields = [', s.index('def write_csv'))
    kopf = s[i:s.index(']', i)]
    for spalte in ('total_brought', 'top8_count', 'top16_count'):
        assert f'"{spalte}"' in kopf, (
            f'{spalte} fehlt in der Kopfzeile — dann steht auf dem Schirm '
            f'weiter eine halbe Teilnehmerzahl')


def test_die_rohen_spalten_stehen_hinten():
    """data/_consumers.md: eine Spalte dazu ist sicher, eine verschobene nicht.

    Andere Projekte lesen diese Datei aus main. Wer die neuen Spalten
    vorne einschiebt, verschiebt jede folgende.
    """
    s = quelle()
    i = s.index('fields = [', s.index('def write_csv'))
    kopf = s[i:s.index(']', i)]
    assert kopf.index('"deck_name"') < kopf.index('"total_brought"')
    assert kopf.index('"source_format"') < kopf.index('"total_brought"'), (
        'die neuen Spalten stehen nicht am Ende — das verschiebt die '
        'bestehenden und bricht die Leser aus data/_consumers.md')


def test_roh_zaehlt_koepfe_und_gewichtet_zaehlt_gewichte():
    """Der eigentliche Beweis: mit echten Zeilen durch aggregate().

    Zwei Turniere, eines frisch (Gewicht 1,0) und eines alt (0,5), mit
    je einem Antritt desselben Decks. Roh muessen 2 herauskommen,
    gewichtet 1,5.
    """
    import importlib.util
    spec = importlib.util.spec_from_file_location('ots', SKRIPT)
    ots = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(ots)

    jetzt = datetime.now(tz=timezone.utc)
    turniere = [
        {'id': 'frisch', 'players': 100, 'date': jetzt - timedelta(days=1)},
        {'id': 'alt',    'players': 100, 'date': jetzt - timedelta(days=30)},
    ]
    ots._fetch_standings = lambda tid: [
        {'archetype': 'Dragapult', 'placement': 1, 'winrate': 60.0},
    ]
    einstellungen = dict(ots.DEFAULT_SETTINGS) if hasattr(ots, 'DEFAULT_SETTINGS') else {}
    einstellungen.update({
        'delay_between_requests': 0,
        'recent_days_high_weight': 7,
        'recent_weight': 1.0,
        'older_weight': 0.5,
        'format_filter': 'PBL',
    })
    zeilen, _ = ots.aggregate(turniere, einstellungen)
    d = [r for r in zeilen if r['deck_name'] == 'Dragapult'][0]

    assert d['total_brought'] == 2, (
        f"roh gezaehlt sind es {d['total_brought']} Antritte, erwartet 2 — "
        'zwei Turniere, zwei Starts, da gibt es nichts zu halbieren')
    assert d['top8_count'] == 2, f"top8_count ist {d['top8_count']}, erwartet 2"
    assert abs(d['total_brought_weighted'] - 1.5) < 1e-9, (
        f"gewichtet sind es {d['total_brought_weighted']}, erwartet 1,5 — "
        'die Aktualitaetsgewichtung ist weg, und mit ihr der Sinn der Quote')
    assert isinstance(d['total_brought'], int), (
        'die rohe Zahl ist keine ganze Zahl mehr — genau der gemeldete Fehler')
    # Und die Quote rechnet weiter mit den GEWICHTETEN Zahlen.
    assert abs(d['top8_conv_rate'] - 1.0) < 1e-9


def test_die_ausgelieferte_datei_wird_nicht_stillschweigend_schlechter():
    """Solange die Datei die rohen Spalten noch nicht hat, ist das in
    Ordnung — sie kommen mit dem naechsten Wochenlauf. Was NICHT in
    Ordnung waere: die gewichteten Spalten zu verlieren."""
    p = os.path.join(WURZEL, 'data', 'online_tournament_top8_decks.csv')
    if not os.path.exists(p):
        pytest.skip('online_tournament_top8_decks.csv liegt nicht vor')
    with io.open(p, encoding='utf-8-sig', newline='') as f:
        kopf = next(csv.reader(f, delimiter=';'))
    for spalte in ('total_brought_weighted', 'top8_count_weighted', 'top8_conv_rate'):
        assert spalte in kopf, f'{spalte} fehlt in der ausgelieferten Datei'
