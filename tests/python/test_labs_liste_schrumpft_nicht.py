"""Die Turnierliste darf nicht schrumpfen, ohne dass es jemand merkt.

BEFUND (06.09.2026). `data/labs_tournaments.json` pendelte wochenlang
zwischen acht und elf Eintraegen — je nach Lauf. Immer dieselben fehlten.

Der Grund ist das Zusammenspiel zweier Stellen in
`backend/scrapers/labs_tournament_scraper.py`:

  * Der Filter laesst nur durch, was `from_date` und `tournament_types`
    erlauben (`:886-896`, und `:781-786` fuer die zwischengespeicherte
    Liste).
  * Der Gap-Fill (`:2306-2318`) sammelt aus dem Fenster
    `[max_tid-10 .. max_tid+5]` nachtraeglich wieder ein — **ohne**
    Datums- und Typfilter.

Solange `max_tid` 0070 war, fing das Fenster 0060 Orlando mit auf. Mit
0071 Worlds rutschte 0060 heraus und faellt seither nur noch unter den
Filter. 0061 Queretaro haelt sich bis heute allein durch das Fenster und
faellt beim naechsten Turnier ebenfalls heraus. 0067 Lima und 0069 Turin
haengen am fehlenden Typ `special`.

Geschrieben wird die Liste in BEIDEN Wegen komplett neu (`:1978`,
`:2033`) — die Fahne `overwrite` betrifft nur `labs_tournament_decks.csv`,
nicht diese Datei. Was der Lauf nicht durchlaesst, ist danach weg.

Der Schaden ist LEISE, und genau das macht ihn teuer:
`player_continuity_scraper.py` zieht seine Zielliste aus dieser Datei
(`:67-70`, gefiltert in `:490-500`) und laesst Turniere, die nicht darin
stehen, als "fremde Zeilen" unveraendert stehen (`:531-541`). Es gibt
dafuer keine einzige Meldung — die laute Meldung in `:653-663` gilt nur
fuer Turniere, die IN der Zielliste stehen und nicht gelesen werden
konnten. Die Daten gehen also nicht verloren, sie werden nur **nie wieder
aufgefrischt**. 0060 Orlando steckt deshalb auf 512 Zeilen (der Deckelung
der HTML-Tabelle) ohne `player_id`, obwohl der Code, der die Deckelung
umgeht, seit PR #682 im Repo liegt.

Diese Datei prueft nicht die Liste selbst — die haengt vom letzten Lauf
ab und pendelt. Sie prueft die EINSTELLUNG: was wir schon an Daten haben,
muss der Filter auch durchlassen, damit es nicht am Gap-Fill-Fenster
haengt.
"""

import csv
import json
import os
import re

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EINSTELLUNGEN = os.path.join(ROOT, 'config', 'scraper_settings.json')
KONTINUITAET = os.path.join(ROOT, 'data', 'player_continuity.csv')
WOCHENLAUF = os.path.join(ROOT, '.github', 'workflows', 'weekly-full-update.yml')


def _labs_einstellungen():
    with open(EINSTELLUNGEN, encoding='utf-8') as f:
        return json.load(f)['labs_tournament_scraper']


def _turniere_im_bestand():
    """{tid: ISO-Datum} aus player_continuity.csv."""
    if not os.path.exists(KONTINUITAET):
        pytest.skip('data/player_continuity.csv fehlt — nichts zu messen')
    daten = {}
    with open(KONTINUITAET, encoding='utf-8-sig') as f:
        for r in csv.DictReader(f):
            tid = (r.get('tournament_id') or '').strip()
            dat = (r.get('tournament_date') or '').strip()[:10]
            if tid and re.fullmatch(r'\d{4}-\d{2}-\d{2}', dat):
                daten.setdefault(tid, dat)
    if not daten:
        pytest.skip('player_continuity.csv fuehrt keine datierten Turniere')
    return daten


def test_special_events_sind_nicht_ausgeschlossen():
    """Turin und Lima sind Special Events — ohne den Typ fallen sie raus.

    Der Ausschluss war keine Entwurfsentscheidung: der Abschnitt entstand
    am 29.04.2026 in einem Sammelcommit, `special` ist im Scraper ein
    regulaerer Typ (`:59`, CLI-Hilfe `:2066`), der Schwesterscraper fuehrt
    "Special Event" in seinen Vorgaben (`tournament_scraper_JH.py:72`),
    und der Gap-Fill wurde eigens gebaut, um Lima und Turin
    einzusammeln (`:2275-2305`) — die Typenliste arbeitete also gegen eine
    andere Stelle desselben Programms.
    """
    typen = _labs_einstellungen()['tournament_types']
    assert 'special' in typen, (
        "Der Typ 'special' fehlt in labs_tournament_scraper.tournament_types. "
        "Special Event Turin (0069) und Lima (0067) fallen damit aus der "
        "Turnierliste, sobald das Gap-Fill-Fenster an ihnen vorbeigezogen "
        f"ist. Aktuell: {typen}")


def test_das_datumsfenster_deckt_alle_turniere_ab_die_wir_schon_haben():
    """Kein Turnier im Bestand darf unter das Datumsfenster fallen.

    Sonst haengt es allein am Gap-Fill-Fenster und friert ein, sobald ein
    neues Turnier den oberen Rand verschiebt.
    """
    daten = _turniere_im_bestand()
    fenster = _labs_einstellungen()['from_date']
    zu_alt = {t: d for t, d in daten.items() if d < fenster}
    assert not zu_alt, (
        f"from_date steht auf {fenster}, aber wir fuehren bereits Daten zu "
        f"Turnieren davor: {sorted(zu_alt.items())}. Diese Turniere haengen "
        "am Gap-Fill-Fenster [max_tid-10 .. max_tid+5] und fallen heraus, "
        "sobald ein neueres Turnier dazukommt — danach werden sie nie wieder "
        "aufgefrischt, ohne dass irgendetwas meldet.")


def test_der_wochenlauf_und_die_einstellung_nennen_dasselbe_fenster():
    """Zwei Stellen, ein Fenster — sonst laeuft es wieder auseinander.

    `.github/workflows/weekly-full-update.yml` faehrt den
    Continuity-Scraper mit `--from-date`. Steht dort ein anderes Datum als
    in dieser Einstellung, holt der eine Scraper Turniere, die der andere
    aus der Zielliste wirft. Genau diese Abweichung war der Ausloeser.
    """
    if not os.path.exists(WOCHENLAUF):
        pytest.skip('Wochenlauf-Workflow nicht vorhanden')
    text = open(WOCHENLAUF, encoding='utf-8').read()
    treffer = re.findall(
        r'player_continuity_scraper\.py[^\n]*--from-date\s+(\d{4}-\d{2}-\d{2})',
        text)
    if not treffer:
        pytest.skip('Der Wochenlauf nennt kein --from-date fuer den '
                    'Continuity-Scraper')
    fenster = _labs_einstellungen()['from_date']
    abweichend = sorted(set(t for t in treffer if t != fenster))
    assert not abweichend, (
        f"Der Wochenlauf faehrt den Continuity-Scraper mit --from-date "
        f"{abweichend}, die Labs-Einstellung steht auf {fenster}. Die beiden "
        "muessen dasselbe Fenster nennen, sonst holt der eine Scraper "
        "Turniere, die der andere aus labs_tournaments.json wirft.")


def test_overwrite_bleibt_bewusst_gesetzt():
    """Kein Aufruf, das Loch durch Anhaengen zu 'reparieren'.

    Wichtig: `overwrite` betrifft `labs_tournament_decks.csv`, NICHT die
    Turnierliste — die wird ohnehin in beiden Schreibwegen komplett neu
    geschrieben. Abschalten wuerde die Liste also gar nicht retten, aber
    die Deck-CSV nur noch wachsen lassen, bis sie Turniere fuehrt, die es
    an der Quelle nicht mehr gibt. Dieser Fall haelt die Entscheidung
    fest, damit sie nicht in der irrigen Annahme umgedreht wird, sie sei
    die Ursache.
    """
    assert _labs_einstellungen()['overwrite'] is True, (
        'overwrite wurde abgeschaltet. Es ist NICHT die Ursache der '
        'schrumpfenden Turnierliste — wenn das Abschalten trotzdem Absicht '
        'war, gehoert der Grund in den _comment und dieser Fall angepasst.')
