"""Der Abgleich limitless -> labs braucht keinen Handgriff mehr.

BEFUND (13.10.2026, Wochenlauf #181, Regional Louisville):

    limitless  581   "Regional Lousville, KY – Limitless"   10.10.2026
    labs       0076  "Regional Championship Louisville"     09.10.2026

Tippfehler der Quelle im Namen UND ein Tag Abstand (labs fuehrt den ersten
Turniertag, limitless den Samstag). `_resolve_labs_tournament_id` verlangte
den exakten Treffer (normalisierter Name, Datum) -> leer. Folge: 547
Day-2-Listen ohne `tournament_id`, ohne Bilanz-Rueckfall (0-0-0), drei
Zusicherungen rot, das Tor zu, eine Stunde Scrapen verworfen.

Dasselbe war am 22.09.2026 mit Baltimore passiert (577 -> 0072, Name und
Datum weichen ab) und wurde mit einem Override VON HAND geheilt. Eine
Reparatur, die beim naechsten grossen Regional wieder einen Handgriff
braucht, ist keine. Seitdem:

  1. der Override (bleibt die erste Stufe),
  2. der exakte Treffer,
  3. der tolerante Treffer: aehnlicher Name, Datum hoechstens
     LABS_ABGLEICH_TAGE entfernt, GENAU EIN Kandidat.

Und die Decklisten-Datei traegt das Datum der Labs-Datei, sobald die
Kennung steht — am Ende jedes Laufs auch fuer den Bestand
(`labs_datum_abgleichen`), damit beide Dateien dasselbe Ereignis am selben
Tag nennen (tests/python/test_per_decklist_datum_override.py).
"""

import csv
import importlib.util
import os
import sys

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
CORE = os.path.join(WURZEL, "backend", "core")
SCRAPERS = os.path.join(WURZEL, "backend", "scrapers")
JH_QUELLE = os.path.join(SCRAPERS, "tournament_scraper_JH.py")
PDS_QUELLE = os.path.join(SCRAPERS, "per_decklist_scraper.py")

LOUISVILLE_LIMITLESS = ("Regional Lousville, KY – Limitless", "2026-10-10", "581")
LOUISVILLE_LABS = ("0076", "Regional Championship Louisville", "2026-10-09", "2927")
FRANKFURT_LABS = ("0074", "Regional Championship Frankfurt", "2026-09-26", "2793")


def _pfade():
    for p in (CORE, SCRAPERS):
        if p not in sys.path:
            sys.path.insert(0, p)


@pytest.fixture()
def jh():
    """Eine EIGENE Kopie des JH-Moduls: Caches und get_data_dir duerfen hier
    umgebogen werden, ohne das echte Modul in sys.modules anzufassen."""
    _pfade()
    spec = importlib.util.spec_from_file_location("jh_abgleich_tolerant_test", JH_QUELLE)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


@pytest.fixture()
def jh_echt():
    """Das ECHTE JH-Modul — der Decklisten-Scraper importiert daraus."""
    _pfade()
    import tournament_scraper_JH as m  # noqa: PLC0415
    return m


@pytest.fixture()
def pds():
    _pfade()
    spec = importlib.util.spec_from_file_location("pds_abgleich_tolerant_test", PDS_QUELLE)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def _labs_schreiben(ordner, turniere):
    pfad = os.path.join(ordner, "labs_tournament_decks_TEF-30C.csv")
    with open(pfad, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["tournament_id", "tournament_name", "tournament_date",
                    "total_players", "deck_name"])
        for tid, name, datum, spieler in turniere:
            w.writerow([tid, name, datum, spieler, "Dragapult"])
    return pfad


def _zeige_auf(modul, monkeypatch, ordner, overrides=None):
    monkeypatch.setattr(modul, "get_data_dir", lambda *a, **k: ordner)
    monkeypatch.setattr(modul, "_LABS_ID_LOOKUP_CACHE", None)
    monkeypatch.setattr(modul, "_LABS_ID_INDEX_CACHE", None)
    monkeypatch.setattr(modul, "_LABS_ID_OVERRIDES_CACHE", dict(overrides or {}))


# ── 1. Die Aufloesung ──────────────────────────────────────────────────────

def test_louisville_wird_ohne_override_aufgeloest(jh, monkeypatch, tmp_path):
    """DER Fall aus #181 — Tippfehler im Namen und ein Tag Abstand."""
    _labs_schreiben(str(tmp_path), [LOUISVILLE_LABS, FRANKFURT_LABS])
    _zeige_auf(jh, monkeypatch, str(tmp_path))
    assert jh._resolve_labs_tournament_id(*LOUISVILLE_LIMITLESS) == "0076"


def test_der_exakte_treffer_hat_weiter_vorrang(jh, monkeypatch, tmp_path):
    _labs_schreiben(str(tmp_path), [LOUISVILLE_LABS, FRANKFURT_LABS])
    _zeige_auf(jh, monkeypatch, str(tmp_path))
    assert jh._resolve_labs_tournament_id(
        "Regional Frankfurt – Limitless", "2026-09-26", "579") == "0074"


def test_baltimore_braucht_keinen_override_mehr(jh, monkeypatch):
    """Gegen den ECHTEN Bestand, mit geleerten Overrides: der Fall vom
    22.09.2026 loest sich jetzt von selbst."""
    _zeige_auf(jh, monkeypatch, os.path.join(WURZEL, "data"))
    assert jh._resolve_labs_tournament_id(
        "Regional Baltimore, MD – Limitless", "2026-09-19", "577") == "0072"


def test_eine_fremde_stadt_am_selben_wochenende_bleibt_leer(jh, monkeypatch, tmp_path):
    _labs_schreiben(str(tmp_path), [LOUISVILLE_LABS, FRANKFURT_LABS])
    _zeige_auf(jh, monkeypatch, str(tmp_path))
    assert jh._resolve_labs_tournament_id(
        "Regional Lexington, KY – Limitless", "2026-10-10", "999") == ""


def test_ausserhalb_des_fensters_bleibt_leer(jh, monkeypatch, tmp_path):
    """Verfaelschungsprobe fuer das Fenster: LABS_ABGLEICH_TAGE + 1 Tage
    Abstand sind nicht mehr dasselbe Ereignis."""
    from datetime import datetime, timedelta  # noqa: PLC0415
    _labs_schreiben(str(tmp_path), [LOUISVILLE_LABS])
    _zeige_auf(jh, monkeypatch, str(tmp_path))
    zu_weit = (datetime.strptime(LOUISVILLE_LABS[2], "%Y-%m-%d")
               + timedelta(days=jh.LABS_ABGLEICH_TAGE + 1)).strftime("%Y-%m-%d")
    assert jh._resolve_labs_tournament_id(LOUISVILLE_LIMITLESS[0], zu_weit, "581") == ""
    # ... und genau an der Grenze noch dasselbe Ereignis.
    grenze = (datetime.strptime(LOUISVILLE_LABS[2], "%Y-%m-%d")
              + timedelta(days=jh.LABS_ABGLEICH_TAGE)).strftime("%Y-%m-%d")
    assert jh._resolve_labs_tournament_id(LOUISVILLE_LIMITLESS[0], grenze, "581") == "0076"


def test_mehrdeutig_bleibt_leer_statt_zu_raten(jh, monkeypatch, tmp_path):
    """Zwei aehnliche Kandidaten im Fenster: geraten wird nicht."""
    _labs_schreiben(str(tmp_path), [
        LOUISVILLE_LABS,
        ("0077", "Special Event Louisville", "2026-10-11", "400"),
    ])
    _zeige_auf(jh, monkeypatch, str(tmp_path))
    assert jh._resolve_labs_tournament_id(*LOUISVILLE_LIMITLESS) == ""


def test_der_override_schlaegt_weiter_alles(jh, monkeypatch, tmp_path):
    _labs_schreiben(str(tmp_path), [LOUISVILLE_LABS])
    _zeige_auf(jh, monkeypatch, str(tmp_path), overrides={"581": "0099"})
    assert jh._resolve_labs_tournament_id(*LOUISVILLE_LIMITLESS) == "0099"


def test_labs_datum_fuer_kennung(jh, monkeypatch, tmp_path):
    _labs_schreiben(str(tmp_path), [LOUISVILLE_LABS, FRANKFURT_LABS])
    _zeige_auf(jh, monkeypatch, str(tmp_path))
    assert jh._labs_datum_fuer("0076") == "2026-10-09"
    assert jh._labs_datum_fuer("0074") == "2026-09-26"
    assert jh._labs_datum_fuer("9999") == ""


# ── 2. Der Scrape-Weg: Kennung UND Datum der Labs-Datei in der Zeile ────────

def _turnier_scrapen(pds, monkeypatch, name, quelldatum, lid):
    monkeypatch.setattr(pds, "get_tournament_info",
                        lambda url: {"name": name, "date": quelldatum, "format": "TEF-30C"})
    monkeypatch.setattr(pds, "parse_standings_rows", lambda url: [
        {"place": "1", "player_name": "Riley McKay", "deck_id": "abc",
         "deck_url": "https://example.invalid/decks/list/abc",
         "deck_name": "Testdeck", "wins": "0", "losses": "0", "ties": "0"},
    ])
    monkeypatch.setattr(pds, "fetch_decklist_cards_and_title",
                        lambda url, db: ([{"name": "Testkarte", "set_code": "MEE",
                                           "card_number": "1", "count": 4,
                                           "type": "Pokemon", "is_ace_spec": False}],
                                         "Testdeck"))
    zeilen = pds.scrape_one_tournament(
        {"id": lid, "url": f"https://example.invalid/tournaments/{lid}"},
        card_db=None, delay=0, continuity_records=None)
    assert zeilen, "der Stub hat keine Zeile erzeugt"
    return zeilen[0]


def test_der_scrape_weg_traegt_kennung_und_labs_datum(pds, jh_echt, monkeypatch, tmp_path):
    _labs_schreiben(str(tmp_path), [LOUISVILLE_LABS, FRANKFURT_LABS])
    _zeige_auf(jh_echt, monkeypatch, str(tmp_path))
    zeile = _turnier_scrapen(pds, monkeypatch, LOUISVILLE_LIMITLESS[0],
                             "10th October 2026", "581")
    assert zeile["tournament_id"] == "0076"
    assert zeile["tournament_date"] == "2026-10-09", (
        "die Zeile traegt das Quelldatum statt des Labs-Datums — dann nennen "
        "beide Dateien dasselbe Turnier an zwei Tagen")


def test_ohne_labs_treffer_bleibt_das_quelldatum(pds, jh_echt, monkeypatch, tmp_path):
    """Die andere Haelfte: ohne Kennung wird kein Datum erfunden."""
    _labs_schreiben(str(tmp_path), [FRANKFURT_LABS])
    _zeige_auf(jh_echt, monkeypatch, str(tmp_path))
    zeile = _turnier_scrapen(pds, monkeypatch, LOUISVILLE_LIMITLESS[0],
                             "10th October 2026", "581")
    assert zeile["tournament_id"] == ""
    assert zeile["tournament_date"] == "2026-10-10"


# ── 3. Der Bestand: labs_datum_abgleichen ───────────────────────────────────

KOPF = ["tournament_id", "limitless_tournament_id", "tournament_name",
        "tournament_date", "place", "player_name", "card_name", "wins"]


def _bestand(pfad, zeilen):
    with open(pfad, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=KOPF)
        w.writeheader()
        for z in zeilen:
            w.writerow(z)


def _lesen(pfad):
    with open(pfad, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def test_der_abgleich_zieht_den_bestand_auf_das_labs_datum(pds, jh_echt, monkeypatch, tmp_path):
    _labs_schreiben(str(tmp_path), [LOUISVILLE_LABS, FRANKFURT_LABS])
    _zeige_auf(jh_echt, monkeypatch, str(tmp_path))
    ziel = str(tmp_path / "bestand.csv")
    _bestand(ziel, [
        {"tournament_id": "0076", "limitless_tournament_id": "581",
         "tournament_name": LOUISVILLE_LIMITLESS[0], "tournament_date": "2026-10-10",
         "place": "1", "player_name": "Riley McKay", "card_name": "A", "wins": "12"},
        {"tournament_id": "0076", "limitless_tournament_id": "581",
         "tournament_name": LOUISVILLE_LIMITLESS[0], "tournament_date": "2026-10-10",
         "place": "2", "player_name": "B", "card_name": "B", "wins": "11"},
        {"tournament_id": "0074", "limitless_tournament_id": "579",
         "tournament_name": "Regional Frankfurt – Limitless", "tournament_date": "2026-09-26",
         "place": "1", "player_name": "C", "card_name": "C", "wins": "10"},
        {"tournament_id": "", "limitless_tournament_id": "600",
         "tournament_name": "Irgendein Online-Turnier", "tournament_date": "2026-10-11",
         "place": "1", "player_name": "D", "card_name": "D", "wins": "9"},
    ])
    vorher = _lesen(ziel)
    b = pds.labs_datum_abgleichen(ziel)
    assert b["geaendert"] == 2 and b["geschrieben"] is True, b
    assert b["je_turnier"] == {"0076": {"von": "2026-10-10", "auf": "2026-10-09", "zeilen": 2}}
    nachher = _lesen(ziel)
    assert [z["tournament_date"] for z in nachher] == \
        ["2026-10-09", "2026-10-09", "2026-09-26", "2026-10-11"]
    # Nur die Datumsspalte — jede andere Zelle unveraendert.
    for alt, neu in zip(vorher, nachher):
        for k in KOPF:
            if k != "tournament_date":
                assert alt[k] == neu[k], (k, alt, neu)


def test_der_abgleich_schreibt_nichts_wenn_alles_stimmt(pds, jh_echt, monkeypatch, tmp_path):
    _labs_schreiben(str(tmp_path), [LOUISVILLE_LABS])
    _zeige_auf(jh_echt, monkeypatch, str(tmp_path))
    ziel = str(tmp_path / "bestand.csv")
    _bestand(ziel, [
        {"tournament_id": "0076", "limitless_tournament_id": "581",
         "tournament_name": LOUISVILLE_LIMITLESS[0], "tournament_date": "2026-10-09",
         "place": "1", "player_name": "Riley McKay", "card_name": "A", "wins": "12"},
    ])
    stempel = os.path.getmtime(ziel)
    b = pds.labs_datum_abgleichen(ziel)
    assert b["geaendert"] == 0 and b["geschrieben"] is False
    assert os.path.getmtime(ziel) == stempel


def _ohne_kommentare(quelltext: str) -> str:
    """Kommentarzeilen raus — sonst macht ein Kommentar, der den Aufruf
    nennt, die Probe blind (CLAUDE.md, 13./14.09.2026)."""
    zeilen = [z for z in quelltext.splitlines() if not z.lstrip().startswith("#")]
    return "\n".join(zeilen)


def test_der_lauf_endet_mit_dem_abgleich():
    """Ein vorhandener Aufruf, als Text: main() ruft labs_datum_abgleichen
    NACH der Scrape-Schleife auf — sonst kippt die Labs-Datei ihr Datum und
    der Bestand hier bleibt stehen (Baltimore, dreimal am 22.09.2026).
    Verfaelschungsprobe (Pruefagent 13.10.2026): der Aufruf auskommentiert
    muss rot sein — deshalb werden Kommentarzeilen vor der Suche entfernt."""
    with open(PDS_QUELLE, encoding="utf-8-sig") as f:
        roh = f.read()
    s = _ohne_kommentare(roh)
    assert len(s) > len(roh) * 0.3, "das Ausschneiden hat zu viel entfernt"
    anfang = s.index("def main():")
    schleife = s.index("rows = scrape_one_tournament(t, card_db, args.delay, continuity_records)", anfang)
    aufruf = s.find("b = labs_datum_abgleichen(out_path)", schleife)
    assert aufruf > schleife, "main() ruft labs_datum_abgleichen nach der Schleife nicht auf"
    assert "'--labs-datum-abgleichen'" in s, "der Schalter fuer den Bestand fehlt"


def test_das_fenster_ist_drei_tage_und_nicht_mehr(jh):
    """Die 3 ist gemessen (ein Tag Abstand bei dreitaegigen Regionals, zwei
    Tage Reserve) — und sie ist die Grenze, hinter der zwei verschiedene
    Turniere derselben Stadt moeglich werden. Ein stilles Verbreitern
    bliebe sonst gruen (Pruefagent 13.10.2026)."""
    assert jh.LABS_ABGLEICH_TAGE == 3
    assert jh.LABS_ABGLEICH_AEHNLICHKEIT == 0.8


# ── 4. Override > Labs > Quelle ────────────────────────────────────────────

def test_ein_datums_override_gewinnt_gegen_die_labs_datei(pds, jh_echt, monkeypatch, tmp_path):
    """Befund Pruefagent 13.10.2026: die Labs-Datei kann einen Lauf lang
    noch das alte Datum fuehren, waehrend die Korrektur schon hinterlegt ist.
    Dann gilt die Korrektur — im Scrape-Weg UND im Abgleich des Bestands."""
    _labs_schreiben(str(tmp_path), [LOUISVILLE_LABS])
    _zeige_auf(jh_echt, monkeypatch, str(tmp_path))
    monkeypatch.setattr(jh_echt, "_DATE_OVERRIDES_CACHE",
                        {"581": {"tournament_date": "2026-10-11", "reason": "Probe"}})
    # Scrape-Weg: die Quelle sagt 10.10., der Override 11.10., labs 09.10.
    zeile = _turnier_scrapen(pds, monkeypatch, LOUISVILLE_LIMITLESS[0],
                             "10th October 2026", "581")
    assert zeile["tournament_id"] == "0076"
    assert zeile["tournament_date"] == "2026-10-11", (
        "das Labs-Datum hat die hinterlegte Korrektur ueberschrieben")
    # Bestand: die Zeile mit Override bleibt, die ohne wird angeglichen.
    ziel = str(tmp_path / "bestand.csv")
    _bestand(ziel, [
        {"tournament_id": "0076", "limitless_tournament_id": "581",
         "tournament_name": LOUISVILLE_LIMITLESS[0], "tournament_date": "2026-10-11",
         "place": "1", "player_name": "Riley McKay", "card_name": "A", "wins": "12"},
        {"tournament_id": "0076", "limitless_tournament_id": "582",
         "tournament_name": "Irgendwas", "tournament_date": "2026-10-10",
         "place": "2", "player_name": "B", "card_name": "B", "wins": "11"},
    ])
    b = pds.labs_datum_abgleichen(ziel)
    assert b["geaendert"] == 1, b
    assert [z["tournament_date"] for z in _lesen(ziel)] == ["2026-10-11", "2026-10-09"]
