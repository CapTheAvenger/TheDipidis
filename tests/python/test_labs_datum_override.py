"""Eine Datumskorrektur muss BEIDE Dateien erreichen, sonst erzeugt sie den
Widerspruch, den sie beheben soll.

BEFUND (22.09.2026, zweiter Lauf des Tors im Wochenlauf).

`tests/python/test_per_decklist_datum_override.py` verlangt, dass
`data/labs_tournament_decks.csv` und
`data/tournament_decklists_per_player.csv` fuer dasselbe Turnier
dasselbe Datum fuehren. Sonst zeigt die Seite je nach Reiter ein
anderes Datum fuer dasselbe Ereignis.

Das Tor meldete:

    0072: per_player=2026-09-18  labs=2026-09-19

Am selben Morgen war es genau andersherum gewesen (labs 18., per_player
19.). Nachgemessen an der Quelle, labs.limitlesstcg.com/0072/decks:

    "Regional Championship Baltimore  September 18-20, 2026  3122 players"

Der erste Turniertag ist der 18. — so fuehrt diese Datei alle
mehrtaegigen Turniere (siehe den Eintrag 518 in
data/labs_tournament_id_overrides.json). Der Wert, den der
Labs-Scraper aus der UEBERSICHTSSEITE zieht, war dagegen zwischen zwei
Laeufen verschieden. Er ist nicht stabil.

DIE URSACHE war nicht das Datum, sondern die Reichweite der Korrektur.
`data/labs_tournament_id_overrides.json` traegt seit dem 22.08.2026
optional ein korrigiertes `tournament_date`. Gelesen hat es bis zum
22.09.2026 **nur** die JH-Seite und ueber sie der Decklisten-Scraper.
Der Labs-Scraper schrieb weiter, was er auf der Seite fand.

Eine Korrektur, die nur eine der beiden Dateien erreicht, kann die
beiden nicht zur Deckung bringen — sie garantiert das Gegenteil.

Seit dem 22.09.2026 liest der Labs-Scraper dieselbe Datei. Diese
Zusicherung haelt fest, dass er es weiter tut, und dass beide Seiten
die Datei GLEICH verstehen.
"""

import importlib.util
import io
import json
import os
import sys

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
DATEN = os.path.join(WURZEL, "data")
OVERRIDES = os.path.join(DATEN, "labs_tournament_id_overrides.json")
LABS_QUELLE = os.path.join(WURZEL, "backend", "scrapers",
                           "labs_tournament_scraper.py")
JH_QUELLE = os.path.join(WURZEL, "backend", "scrapers",
                         "tournament_scraper_JH.py")


def _lade(name, pfad):
    sys.path.insert(0, os.path.join(WURZEL, "backend", "core"))
    sys.path.insert(0, os.path.join(WURZEL, "backend", "scrapers"))
    spec = importlib.util.spec_from_file_location(name, pfad)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


@pytest.fixture(scope="module")
def labs():
    return _lade("labs_datum_test", LABS_QUELLE)


@pytest.fixture(scope="module")
def jh():
    return _lade("jh_datum_test", JH_QUELLE)


@pytest.fixture(scope="module")
def eintraege():
    with io.open(OVERRIDES, encoding="utf-8") as f:
        return (json.load(f).get("overrides") or {})


# ── Die Korrektur kommt an ───────────────────────────────────────────

def test_der_labs_scraper_liest_die_korrekturen(labs, eintraege):
    mit_datum = {
        str(e["labs_tournament_id"]).strip(): str(e["tournament_date"]).strip()
        for e in eintraege.values()
        if isinstance(e, dict) and e.get("labs_tournament_id")
        and e.get("tournament_date")
    }
    if not mit_datum:
        pytest.skip("kein Eintrag traegt ein korrigiertes Datum")

    gelesen = labs._labs_datum_overrides()
    fehlt = sorted(set(mit_datum) - set(gelesen))
    assert not fehlt, (
        f"der Labs-Scraper kennt die Datumskorrektur fuer {fehlt} nicht. "
        f"Dann schreibt er weiter, was auf der Uebersichtsseite steht — und "
        f"die beiden Dateien widersprechen sich, sobald sich der Wert dort "
        f"bewegt (gemessen am 22.09.2026 fuer 0072: zwei Laeufe, zwei Daten).")


def test_beide_seiten_verstehen_dasselbe_datum_gleich(labs, jh, eintraege):
    """Die Datei ist eine, die Umwandlung muss es auch sein.

    Die Eintraege stehen in Limitless-Form ("18th September 2026"). Der
    Labs-Scraper kannte urspruenglich nur "September 18, 2026" und haette
    still `None` geliefert — die Korrektur waere wirkungslos geblieben,
    ohne dass irgendwo etwas auffaellt.
    """
    for e in eintraege.values():
        if not (isinstance(e, dict) and e.get("tournament_date")):
            continue
        roh = str(e["tournament_date"]).strip()
        assert labs._iso_aus_limitless_datum(roh) == jh._parse_iso_date(roh), (
            f"{roh!r}: der Labs-Scraper macht "
            f"{labs._iso_aus_limitless_datum(roh)!r} daraus, die JH-Seite "
            f"{jh._parse_iso_date(roh)!r}. Dieselbe Datei, zwei Lesarten — "
            f"dann tragen die beiden CSVs wieder verschiedene Daten.")


def test_die_korrektur_gewinnt_ueber_die_seite(labs):
    """Der ganze Zweck: was auf der Seite steht, zaehlt nicht mehr."""
    ov = labs._labs_datum_overrides()
    if not ov:
        pytest.skip("kein Eintrag traegt ein korrigiertes Datum")
    tid, soll = sorted(ov.items())[0]
    for aus_der_seite in ("2026-01-01", "", "2099-12-31"):
        assert labs._datum_mit_override(tid, aus_der_seite) == soll, (
            f"labs {tid}: die Seite sagt {aus_der_seite!r} und gewinnt — "
            f"dann ist die hinterlegte Korrektur wirkungslos")


def test_ohne_eintrag_bleibt_die_seite_stehen(labs):
    """Geraten wird nicht. Wer keinen Eintrag hat, behaelt sein Datum."""
    assert labs._datum_mit_override("0000-gibt-es-nicht", "2026-08-14") == "2026-08-14"


# ── Der Weg im Schreibpfad ───────────────────────────────────────────

def test_die_korrektur_wirkt_vor_dem_datumsfilter():
    """Sonst filtert der Lauf nach einem Datum, das er nicht schreibt.

    `from_date` schliesst Turniere vor einem Stichtag aus. Wuerde die
    Korrektur erst beim Schreiben greifen, koennte ein Turnier durch den
    Filter fallen, dessen korrigiertes Datum ihn bestanden haette — oder
    umgekehrt. Beides waere still.
    """
    with io.open(LABS_QUELLE, encoding="utf-8") as f:
        quelle = f.read()
    ohne = "\n".join(z for z in quelle.split("\n")
                     if not z.lstrip().startswith("#"))
    assert len(ohne) > len(quelle) * 0.3, "das Ausschneiden hat zu viel entfernt"

    ruf = ohne.find("_datum_mit_override(tournament_id, date_str)")
    filt = ohne.find("if from_date and not date_obj:")
    assert ruf > 0, (
        "der Labs-Scraper ruft die Korrektur im Uebersichts-Zweig nicht mehr "
        "auf — dann schreibt er wieder das Datum der Seite")
    assert filt > 0, "der Datumsfilter heisst anders; diese Pruefung greift ins Leere"
    assert ruf < filt, (
        "die Korrektur steht NACH dem Datumsfilter. Dann filtert der Lauf "
        "nach einem Datum, das er hinterher nicht schreibt")


def test_die_korrektur_greift_auch_am_zwischenspeicher_vorbei():
    """Der Uebersichts-Zweig allein reicht NICHT.

    BEFUND (22.09.2026, zweiter Anlauf). Die erste Fassung wandte den
    Override nur dort an, wo der Datumstext der Uebersichtsseite gelesen
    wird. Das Datum kommt aber aus drei Quellen:

      1. die frisch gelesene Uebersichtsseite,
      2. `labs_tournaments.json` — der zwischengespeicherte Index,
      3. `cached_tournament_meta` — die Metadaten des letzten Laufs.

    Fuer ein Turnier, das der Lauf nicht neu einliest, kam das Datum aus
    (2) oder (3), und die Korrektur lief ins Leere. Das Tor im
    Wochenlauf schlug daraufhin ein zweites Mal mit derselben Meldung
    an: labs 2026-09-19 gegen per_player 2026-09-18.

    Geprueft wird deshalb die Stelle HINTER allen drei Quellen.
    """
    with io.open(LABS_QUELLE, encoding="utf-8") as f:
        quelle = f.read()
    ohne = "\n".join(z for z in quelle.split("\n")
                      if not z.lstrip().startswith("#"))
    assert len(ohne) > len(quelle) * 0.3, "das Ausschneiden hat zu viel entfernt"

    sammel = ohne.find(
        "effective_date = t.get('tournament_date') or "
        "cached_for_skip.get('tournament_date') or ''")
    assert sammel > 0, (
        "die Stelle, an der das Datum aus allen drei Quellen zusammenlaeuft, "
        "heisst anders — diese Pruefung greift ins Leere")
    korr = ohne.find("effective_date = _datum_mit_override(tid, effective_date)")
    assert korr > sammel, (
        "die Korrektur steht nicht HINTER der Stelle, an der das Datum aus "
        "Uebersicht, Zwischenspeicher und Vorlauf zusammenlaeuft. Dann "
        "erreicht sie genau die Turniere nicht, die der Lauf nicht neu "
        "einliest — und das sind die meisten")
    verwendung = ohne.find("_derive_meta_for_labs_tournament(", korr)
    assert verwendung > korr, (
        "die Korrektur steht nach der ersten Verwendung des Datums")
