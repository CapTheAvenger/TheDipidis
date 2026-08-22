"""Unsortierte Turniere muessen erneut versucht werden.

BEFUND (22.08.2026): data/labs_tournament_decks__unsorted.csv fuehrte 96
Zeilen aus zwei Turnieren — Regional Championship Brisbane (labs 0042)
und Special Event San Juan (labs 0019), beide am 25.05.2026 gescrapt,
beide ohne Datum und damit ohne Meta.

Die Ursachenkette, Glied fuer Glied nachgemessen:

  1. labs.limitlesstcg.com rendert seine Turnierliste teilweise
     clientseitig. Der Abruf sieht das Datum mal und mal nicht — beim
     Lauf am 25.05. sah er es nicht. (Heute steht es wieder da:
     "November 1-2, 2025" und "February 15-16, 2025".)
  2. Der zweite Weg, der Namensabgleich gegen die Kartendaten, konnte
     nicht helfen: zu diesen beiden Turnieren gibt es keinen Eintrag in
     tournament_cards_data_overview.csv.
  3. Ohne Datum und ohne Namenstreffer landen die Zeilen mit leerem
     `meta` in __unsorted. Soweit vorgesehen.
  4. **Und hier war der Fehler:** _list_labs_chunk_paths sammelt alles
     mit dem Praefix "labs_tournament_decks_", worauf auch
     "labs_tournament_decks__unsorted.csv" passt. Die unsortierten
     Zeilen landeten damit in seen_tids, und die Sprungmarke
     "schon gescrapt" uebersprang die beiden bei JEDEM weiteren Lauf.
     Sie konnten sich nie erholen.

Der Datumsparser war nie schuld — er versteht alle Formate, auch
Zeitraeume ueber Monatsgrenzen. Und die Zuordnung greift sofort, sobald
das Datum da ist: 0042 -> SVI-MEG, 0019 -> BRS-PRE.
"""

import csv
import importlib.util
import os
import sys

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
DATEN = os.path.join(WURZEL, "data")
QUELLE = os.path.join(WURZEL, "backend", "scrapers", "labs_tournament_scraper.py")


@pytest.fixture(scope="module")
def labs():
    sys.path.insert(0, os.path.join(WURZEL, "backend", "core"))
    spec = importlib.util.spec_from_file_location("labs_test", QUELLE)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    m._get_data_dir = lambda: DATEN
    return m


def test_der_datumsparser_versteht_zeitraeume(labs):
    """Das war der erste Verdacht — und er war falsch."""
    faelle = {
        "November 1–2, 2025": (2025, 11, 1),      # Halbgeviertstrich
        "February 15–16, 2025": (2025, 2, 15),
        "November 1-2, 2025": (2025, 11, 1),      # Bindestrich
        "February 27–March 1, 2026": (2026, 2, 27),  # ueber Monatsgrenze
        "April 4, 2026": (2026, 4, 4),            # Einzeltag
    }
    for roh, erwartet in faelle.items():
        d = labs._parse_date(roh)
        assert d is not None, f"{roh!r} nicht lesbar"
        assert (d.year, d.month, d.day) == erwartet, f"{roh!r} -> {d}"


def test_mit_datum_greift_die_zuordnung_sofort(labs):
    """Die beiden fallen sauber in bestehende Chunkfenster."""
    for roh, erwartet in [("November 1–2, 2025", "SVI-MEG"),
                          ("February 15–16, 2025", "BRS-PRE")]:
        d = labs._parse_date(roh)
        meta = labs._derive_meta_from_date(d.strftime("%Y-%m-%d"))
        assert meta == erwartet, f"{roh!r} -> {meta!r}, erwartet {erwartet!r}"


def test_unsortierte_zaehlen_nicht_als_erledigt(labs):
    """Der Kern: __unsorted darf nicht in seen_tids landen."""
    rows = labs._reassemble_labs_monolith("labs_tournament_decks", labs.CSV_FIELDS)
    assert rows, "keine Labs-Zeilen gefunden"
    sortiert = {str(r.get("tournament_id") or "").strip()
                for r in rows if (r.get("meta") or "").strip()}
    unsortiert = {str(r.get("tournament_id") or "").strip()
                  for r in rows if not (r.get("meta") or "").strip()} - sortiert
    for tid in unsortiert:
        assert tid not in sortiert, (
            f"{tid} liegt unsortiert UND sortiert — dann ist die Trennung kaputt")
    # Der Scraper muss dieselbe Regel anwenden.
    with open(QUELLE, encoding="utf-8-sig") as f:
        quelle = f.read()
    stelle = quelle.index("seen_tids = {")
    block = quelle[stelle:stelle + 260]
    assert "if (r.get('meta') or '').strip()" in block, (
        "seen_tids filtert nicht auf ein gesetztes meta — unsortierte "
        "Turniere werden dann wieder fuer immer uebersprungen")


def test_die_wiedervorlage_wird_gemeldet():
    with open(QUELLE, encoding="utf-8-sig") as f:
        quelle = f.read()
    assert "Wiedervorlage" in quelle, (
        "ein stiller Wiederversuch ist nur ein anderer stiller Zustand")


def test_das_praefix_faengt_unsorted_mit_ein(labs):
    """Die Falle selbst festhalten: der Dateiname passt auf das Praefix.

    Faellt dieser Test, wurde die Datei umbenannt — dann gehoert die
    Begruendung oben angepasst, nicht der Test geloescht.
    """
    pfade = labs._list_labs_chunk_paths("labs_tournament_decks")
    namen = [os.path.basename(p) for p in pfade]
    assert any("__unsorted" in n for n in namen), (
        "labs_tournament_decks__unsorted.csv wird vom Praefix nicht mehr "
        f"erfasst — gefunden: {namen}")
