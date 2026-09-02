"""Gedrosselt ist kein Urteil: ein 403 darf keine Zeilen kosten.

ANLASS (02.09.2026)
-------------------
`scrape_standings_full` gab bei einem fehlgeschlagenen Abruf dieselbe
leere Liste zurueck wie bei einem Turnier ohne Standings. Der Aufrufer
verwirft die vorhandenen Zeilen jedes Turniers, das er neu holen will —
also bedeutete "leer": die Zeilen sind weg.

Nachgestellt mit `fetch_page_bs4` auf None (genau der 403-Zustand):

    VORHER : 4 Zeilen; tid0068 = 3
    NACHHER: 1 Zeilen; tid0068 = 0
    Rueckgabewert main(): 0   (0 = Erfolg)

Ohne `--resume` steht in `target` jedes Turnier aus
labs_tournaments.json. Drosselt Limitless den ganzen Lauf, bleibt von
den derzeit 6131 Zeilen in data/player_continuity.csv nur der Header —
und der Commit-Schritt in .github/workflows/player-continuity-scrape.yml
schiebt das ungeprueft ins Repo.

Limitless drosselt Massenabrufe aus Rechenzentren mit 403 (CLAUDE.md,
"External sources & rate limits"). Derselbe Grundsatz steht schon in
tests/python/test_price_mapping_verification.py: "403 row untouched —
throttled is not a verdict". Dieser Scraper hat sich nicht daran
gehalten.
"""
import csv
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
    spec = importlib.util.spec_from_file_location('pcs', SKRIPT)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


ZEILEN = [
    dict(tournament_id='0068', tournament_date='2026-08-01', meta='PBL', place='1',
         player_name='A', country='DE', deck_slug='dragapult',
         deck_archetype='Dragapult', wins='6', losses='1', ties='0'),
    dict(tournament_id='0068', tournament_date='2026-08-01', meta='PBL', place='2',
         player_name='B', country='FR', deck_slug='slowking',
         deck_archetype='Slowking', wins='5', losses='2', ties='0'),
    dict(tournament_id='0068', tournament_date='2026-08-01', meta='PBL', place='3',
         player_name='C', country='IT', deck_slug='dhelmise',
         deck_archetype='Dhelmise', wins='5', losses='2', ties='0'),
    dict(tournament_id='0099', tournament_date='2026-07-01', meta='PBL', place='1',
         player_name='D', country='ES', deck_slug='toucannon',
         deck_archetype='Toucannon', wins='7', losses='0', ties='0'),
]
FELDER = list(ZEILEN[0].keys())


def baue_datenverzeichnis(tmp_path):
    d = tmp_path / 'data'
    d.mkdir()
    with io.open(d / 'player_continuity.csv', 'w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=FELDER)
        w.writeheader()
        for z in ZEILEN:
            w.writerow(z)
    with io.open(d / 'labs_tournaments.json', 'w', encoding='utf-8') as f:
        json.dump([{'tournament_id': '0068', 'tournament_date': '2026-08-01', 'meta': 'PBL'}], f)
    return d


def lauf(m, tmp_path, monkeypatch, soup_wert):
    d = baue_datenverzeichnis(tmp_path)
    monkeypatch.setattr(m, 'get_data_dir', lambda: str(d))
    monkeypatch.setattr(m, 'fetch_page_bs4', lambda url: soup_wert)
    monkeypatch.setattr(m.time, 'sleep', lambda *_a, **_k: None)
    monkeypatch.setattr(sys, 'argv', ['player_continuity_scraper.py'])
    rc = m.main()
    with io.open(d / 'player_continuity.csv', encoding='utf-8-sig') as f:
        zeilen = list(csv.DictReader(f))
    return rc, zeilen


def test_403_kostet_keine_zeile(tmp_path, monkeypatch):
    """Der eigentliche Beweis: Abruf schlaegt fehl, Bestand bleibt."""
    m = lade_modul()
    rc, zeilen = lauf(m, tmp_path, monkeypatch, None)   # None = 403/Timeout

    tid0068 = [z for z in zeilen if z['tournament_id'] == '0068']
    assert len(tid0068) == 3, (
        f"nach einem fehlgeschlagenen Abruf stehen noch {len(tid0068)} von 3 "
        "Zeilen fuer tid 0068 da — gedrosselt ist kein Urteil")
    assert len(zeilen) == 4, (
        f"die Datei hat {len(zeilen)} statt 4 Zeilen — auch die Turniere, die "
        "gar nicht angefasst wurden, muessen stehen bleiben")


def test_403_meldet_sich_nach_aussen(tmp_path, monkeypatch):
    """Ein Lauf, der nichts gelesen hat, darf nicht Erfolg melden.

    Der Wochenlauf wertet den Rueckgabewert aus und schreibt ihn in die
    Bilanz (weekly-full-update.yml:426). Ein stiller Erfolg waere hier
    das Schlimmste: die Datei saehe gesund aus, waere aber nicht auf dem
    Stand, den sie vorgibt.
    """
    m = lade_modul()
    rc, _ = lauf(m, tmp_path, monkeypatch, None)
    assert rc != 0, (
        "main() meldet Erfolg, obwohl kein einziges Turnier gelesen wurde")


def test_leer_und_nicht_lesbar_sind_zwei_dinge():
    """Die Trennung selbst — an der Quelle, nicht am Verhalten."""
    q = io.open(SKRIPT, encoding='utf-8').read()
    i = q.index('def scrape_standings_full')
    rumpf = q[i:q.index('\ndef ', i + 10)]
    assert 'Optional[List[Dict]]' in rumpf, (
        'scrape_standings_full sagt nicht mehr, dass sie None liefern kann')
    assert 'return None' in rumpf, (
        'der nicht lesbare Fall gibt wieder eine leere Liste zurueck — dann '
        'ist er von "Turnier ohne Standings" nicht mehr zu unterscheiden')
    # Und die beiden Faelle duerfen nicht wieder zusammenfallen.
    vor_table = rumpf[:rumpf.index("data-table")]
    assert 'return None' in vor_table, (
        'der Abruffehler (kein soup) gibt nicht mehr None zurueck')


def test_null_zeilen_wo_vorher_welche_standen_ist_ein_widerspruch(tmp_path, monkeypatch):
    """Seite lesbar, Tabelle weg, aber frueher standen Zeilen da.

    Das ist kein Ergebnis, das ist ein Widerspruch. Er wird gemeldet und
    der Bestand bleibt — "Report, don't silently repair" (CLAUDE.md).
    """
    m = lade_modul()

    class LeererSoup:
        def find(self, *_a, **_k):
            return None

    rc, zeilen = lauf(m, tmp_path, monkeypatch, LeererSoup())
    tid0068 = [z for z in zeilen if z['tournament_id'] == '0068']
    assert len(tid0068) == 3, (
        f"{len(tid0068)} statt 3 Zeilen — eine ploetzlich leere Standings-"
        "Seite hat den Bestand ueberschrieben")
    assert rc != 0, 'der Widerspruch wird nicht nach aussen gemeldet'
