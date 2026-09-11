"""Wann wird ein Set auf Praesenzturnieren legal?

BEFUND 11.09.2026
-----------------
backend/core/update_sets.py rechnete `IN_PERSON_LEGAL_LAG_DAYS = 14` —
Erscheinen plus vierzehn Kalendertage. Der Betreiber nannte am selben
Abend die tatsaechliche Regel:

  "die Regel ist ja das ein Set am 2. Freitag nach voe legal wird ...
   Also die Regel ist immer voe plus 2 Freitage = legal"

Fuer ein Freitagsrelease fallen beide auf denselben Tag, und genau
deshalb ist es nie aufgefallen: alle dreizehn Sets mit Freitagsdatum in
data/sets_metadata.json ergeben unter beiden Rechnungen dasselbe.

"30th Celebration" erscheint an einem MITTWOCH, dem 16.09.2026:

    feste Frist   16.09. + 14 Tage           = 30.09.2026 (Mittwoch)
    die Regel     16.09. -> 18.09. -> 25.09. = 25.09.2026 (Freitag)

Dazwischen liegt Frankfurt am 26.09.2026.

WAS DIESE DATEI FESTHAELT
-------------------------
1. Die Regel zaehlt Freitage, nicht Tage — und der Erscheinungsfreitag
   zaehlt NICHT mit (sonst waere PBL am 24.07. legal gewesen, war es
   aber erst am 31.07.).
2. Kein einziges Freitagsset aus dem echten Bestand aendert sich.
3. Der Mittwochsfall kommt auf den Freitag davor, nicht danach.
4. lag_days wird abgeleitet und bleibt mit in_person_legal_date
   konsistent — die Zahl hat Verbraucher (js/app-meta-call.js).
"""

import datetime
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from backend.core.turnier_legalitaet import (  # noqa: E402
    FREITAG, FREITAGE_BIS_LEGAL, abstand_in_tagen, zweiter_freitag_nach,
)

WURZEL = os.path.join(os.path.dirname(__file__), "..", "..")


# ── Die Regel selbst ────────────────────────────────────────────────

def test_das_ergebnis_ist_immer_ein_freitag():
    """Egal an welchem Wochentag ein Set erscheint."""
    tag = datetime.date(2026, 1, 1)
    for _ in range(400):
        ergebnis = zweiter_freitag_nach(tag.isoformat())
        assert datetime.date.fromisoformat(ergebnis).weekday() == FREITAG, (
            f"{tag} ({tag.strftime('%a')}) ergab {ergebnis}, keinen Freitag")
        tag += datetime.timedelta(days=1)


def test_der_erscheinungsfreitag_zaehlt_nicht_mit():
    """PBL erschien Fr 17.07.2026 und war ab dem 31.07. legal.

    Zaehlte der Erscheinungstag mit, waere es der 24.07. — das steht
    aber weder in data/format_window.json noch in irgendeiner
    Chunkdatei.
    """
    assert zweiter_freitag_nach("2026-07-17") == "2026-07-31"


def test_es_sind_immer_genau_zwei_freitage():
    """Zwischen Erscheinen und Grenze liegen zwei Freitage, nie drei."""
    for iso in ["2026-09-16", "2026-07-17", "2025-09-25", "2026-01-01"]:
        start = datetime.date.fromisoformat(iso)
        ende = datetime.date.fromisoformat(zweiter_freitag_nach(iso))
        freitage = sum(
            1 for i in range(1, (ende - start).days + 1)
            if (start + datetime.timedelta(days=i)).weekday() == FREITAG)
        assert freitage == FREITAGE_BIS_LEGAL, f"{iso}: {freitage} Freitage"


def test_der_mittwochsfall_kommt_auf_den_freitag_davor():
    """DER Anlass: 30th Celebration, Mittwoch 16.09.2026.

    Die feste Frist ergab den 30.09. und haette Frankfurt am 26.09.
    unter dem alten Format verbucht.
    """
    grenze = zweiter_freitag_nach("2026-09-16")
    assert grenze == "2026-09-25"
    frankfurt = "2026-09-26"
    assert frankfurt >= grenze, "Frankfurt faellt wieder aus dem neuen Format"
    alte_regel = (datetime.date(2026, 9, 16) + datetime.timedelta(days=14)).isoformat()
    assert frankfurt < alte_regel, (
        "die feste Frist haette Frankfurt nicht erfasst — genau das war der Fehler")


def test_unlesbares_datum_erfindet_keinen_tag():
    for murks in ["", "irgendwann", "2026-13-45", None]:
        assert zweiter_freitag_nach(murks) == ""


def test_abstand_rechnet_die_tage_fuer_lag_days():
    assert abstand_in_tagen("2026-07-17", "2026-07-31") == 14
    assert abstand_in_tagen("2026-09-16", "2026-09-25") == 9
    assert abstand_in_tagen("murks", "2026-09-25") is None


# ── Der echte Bestand ───────────────────────────────────────────────

def test_kein_freitagsset_im_bestand_verschiebt_sich():
    """Die Umstellung darf die Geschichte nicht umschreiben.

    Fuer jedes Set mit Freitagsdatum muss die neue Regel exakt das
    liefern, was die feste Frist lieferte. Gemessen am 11.09.2026:
    dreizehn Sets, dreizehn Treffer.
    """
    pfad = os.path.join(WURZEL, "data", "sets_metadata.json")
    with open(pfad, encoding="utf-8") as f:
        meta = json.load(f)
    geprueft = 0
    for code, eintrag in meta.items():
        iso = (eintrag or {}).get("release_date") if isinstance(eintrag, dict) else None
        if not iso:
            continue
        try:
            d = datetime.date.fromisoformat(iso)
        except ValueError:
            continue
        if d.weekday() != FREITAG:
            continue
        geprueft += 1
        alt = (d + datetime.timedelta(days=14)).isoformat()
        assert zweiter_freitag_nach(iso) == alt, (
            f"{code} ({iso}) verschiebt sich von {alt} nach "
            f"{zweiter_freitag_nach(iso)} — die Geschichte aendert sich")
    assert geprueft >= 10, f"nur {geprueft} Freitagssets geprueft — zu duenne Probe"


def test_das_geschriebene_formatfenster_haelt_sich_an_die_regel():
    """data/format_window.json ist das Ergebnis dieser Rechnung."""
    pfad = os.path.join(WURZEL, "data", "format_window.json")
    with open(pfad, encoding="utf-8") as f:
        fw = json.load(f)
    erschienen = fw.get("set_release_date")
    legal = fw.get("in_person_legal_date")
    assert erschienen and legal
    assert legal == zweiter_freitag_nach(erschienen), (
        f"in_person_legal_date {legal} ist nicht der zweite Freitag nach "
        f"{erschienen} ({zweiter_freitag_nach(erschienen)})")
    assert int(fw.get("lag_days")) == abstand_in_tagen(erschienen, legal), (
        "lag_days passt nicht zum Abstand — die Zahl hat Verbraucher, "
        "u. a. die Altersgrenze des Lag-Fensters in js/app-meta-call.js")


def test_die_feste_frist_steht_nicht_mehr_als_regel_im_code():
    """Sie darf nur noch Rueckfall sein, nicht die Rechnung."""
    pfad = os.path.join(WURZEL, "backend", "core", "update_sets.py")
    with open(pfad, encoding="utf-8") as f:
        quelle = f.read()
    assert "_add_days(en_release, IN_PERSON_LEGAL_LAG_DAYS)" in quelle, (
        "der Rueckfall fuer ein unlesbares Datum fehlt")
    assert "in_person_legal = zweiter_freitag_nach(en_release)" in quelle, (
        "die Grenze wird nicht mehr nach der Freitagsregel gerechnet")
    assert "'lag_days':             lag_days," in quelle, (
        "lag_days wird wieder vorgegeben statt abgeleitet")


def test_das_vorformat_fenster_rechnet_dieselbe_regel():
    """per_decklist_scraper.py darf nicht mit lag_days weiterrechnen.

    lag_days gehoert zum LAUFENDEN Set. Auf das Erscheinungsdatum
    eines anderen Sets angewandt ergibt es einen Tag, den es nie gab —
    bei einem Mittwochs-Release neun statt vierzehn Tage.
    """
    pfad = os.path.join(WURZEL, "backend", "scrapers", "per_decklist_scraper.py")
    with open(pfad, encoding="utf-8") as f:
        quelle = f.read()
    assert "zweiter_freitag_nach(erschienen)" in quelle
    assert "int(fw.get('lag_days')" not in quelle, (
        "das Vorformat-Fenster rechnet wieder mit lag_days")
