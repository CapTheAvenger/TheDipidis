"""Das Formatfenster laeuft vorwaerts, nie rueckwaerts.

BEFUND (21.08.2026): write_format_window() schrieb bedingungslos. Zwei
Folgen davon waren messbar:

1. Faellt die Live-Erkennung aus, greifen die Fallback-Tabellen in
   update_sets.py. Die standen auf CRI (22.05.) und M5 — waehrend das
   gespeicherte Fenster laengst PBL (17.07.) und M6 fuehrte. Ein
   einziger geblockter Lauf haette das Format also um zwei Monate
   zurueckgedreht, und jeder nachgelagerte Scraper haette brav
   Vorformat-Daten als aktuell etikettiert.

2. War die vorhandene Datei nicht lesbar, wurde `existing = {}` gesetzt
   und trotzdem geschrieben — previous_format_key und
   set_addition_only waren damit weg. Genau diese beiden Felder
   schalten die Predictor-Stufen 5.5/5.6/5.8/5.9.

Beides ist jetzt ein Abbruch mit Meldung. Der Test misst Verhalten:
Datei vorher, Aufruf, Datei nachher.
"""

import json
import os
import sys

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
sys.path.insert(0, os.path.join(WURZEL, "backend", "core"))

import update_sets  # noqa: E402

FENSTER = {
    "current_set": "PBL",
    "oldest_legal_set": "TEF",
    "set_release_date": "2026-07-17",
    "in_person_legal_date": "2026-07-31",
    "lag_days": 14,
    "current_set_jp": "M6",
    "jp_release_date": "2026-07-31",
    "previous_format_key": "TEF-CRI",
    "set_addition_only": True,
    "_note_previous_format": "von Hand gepflegt",
}


# Die Fallback-Tabellen, die zu DIESER gesetzten Welt gehoeren.
#
# BEFUND 20.09.2026: die Vorrichtung setzte das Fenster (PBL), liess
# `_pick_current_set()` aber die ECHTEN Fallback-Tabellen aus
# update_sets.py lesen. Solange deren neuester Eintrag PBL war, fiel das
# nicht auf. Mit der Rotation auf Set 30C (16.09.2026) gewann 30C gegen
# das gesetzte "XYZ" vom 07.08., und zwei Zusicherungen fielen um —
# ohne dass an ihnen oder am Riegel etwas kaputt gewesen waere.
#
# Dieselbe Klasse wie in tests/python/test_online_fenster.py am selben
# Tag: eine Welt, die zur Haelfte gesetzt und zur Haelfte echt ist,
# haengt am Kalender. Also wird sie ganz gesetzt.
WELT_EN = {"PBL": "2026-07-17", "CRI": "2026-05-22", "POR": "2026-03-27"}
WELT_JP = {"M6": "2026-07-31", "M5": "2026-05-22"}


@pytest.fixture()
def fenster_ordner(tmp_path, monkeypatch):
    ordner = tmp_path / "data"
    ordner.mkdir()
    (ordner / "format_window.json").write_text(
        json.dumps(FENSTER), encoding="utf-8")
    monkeypatch.setattr(update_sets, "data_dir", str(ordner))
    monkeypatch.setattr(update_sets, "FALLBACK_RELEASE_DATES", dict(WELT_EN))
    monkeypatch.setattr(update_sets, "FALLBACK_JP_RELEASE_DATES", dict(WELT_JP))
    assert update_sets._pick_current_set(dict(WELT_EN)) == FENSTER["current_set"], (
        "die gesetzte Welt passt nicht zum gesetzten Fenster — dann prueft "
        "keine Zusicherung darunter das, was sie zu pruefen glaubt")
    return ordner


def _gelesen(ordner):
    return json.loads((ordner / "format_window.json").read_text(encoding="utf-8"))


def test_quelle_weg_haelt_den_gespeicherten_stand(fenster_ordner, monkeypatch, capsys):
    """Quelle weg, Grundstock-Tabellen alt — das Fenster bleibt stehen.

    SEIT 29.09.2026 (SC-7) nimmt der Rueckfall den gespeicherten Stand
    aus format_window.json dazu (update_sets.rueckfall_release_dates).
    Vorher hiess derselbe Fall "Ruecksprung erkannt, nichts geschrieben,
    ::error::" — richtig im Ergebnis, aber nur, weil jemand die Tabellen
    bei jeder Rotation nachzog. Jetzt faellt das Fenster gar nicht erst
    zurueck, und die Handfelder bleiben."""
    alt_en = dict(WELT_EN)
    alt_jp = dict(WELT_JP)
    alt_en.pop("PBL", None)
    alt_jp.pop("M6", None)
    monkeypatch.setattr(update_sets, "FALLBACK_RELEASE_DATES", alt_en)
    monkeypatch.setattr(update_sets, "FALLBACK_JP_RELEASE_DATES", alt_jp)

    update_sets.write_format_window("", en_release_dates={}, jp_release_dates={})
    ausgabe = capsys.readouterr().out
    assert "zurueckfallen" not in ausgabe
    danach = _gelesen(fenster_ordner)
    assert danach["current_set"] == "PBL"
    assert danach["set_release_date"] == "2026-07-17"
    assert danach["current_set_jp"] == "M6"
    assert danach["previous_format_key"] == "TEF-CRI"


def test_ruecksprung_wird_nicht_geschrieben(fenster_ordner, monkeypatch, capsys):
    """Der Monotonieriegel bleibt die zweite Linie: kennt der Rueckfall den
    gespeicherten Stand NICHT (hier erzwungen), wird nicht rueckwaerts
    geschrieben."""
    alt_en = dict(WELT_EN)
    alt_jp = dict(WELT_JP)
    alt_en.pop("PBL", None)
    alt_jp.pop("M6", None)
    monkeypatch.setattr(update_sets, "FALLBACK_RELEASE_DATES", alt_en)
    monkeypatch.setattr(update_sets, "FALLBACK_JP_RELEASE_DATES", alt_jp)
    monkeypatch.setattr(update_sets, "_gespeicherte_anker", lambda verzeichnis=None: ({}, {}))

    ergebnis = update_sets.write_format_window("", en_release_dates={}, jp_release_dates={})
    ausgabe = capsys.readouterr().out

    assert ergebnis == "", "ein Ruecksprung darf keinen Schreibpfad zurueckgeben"
    assert "::error::" in ausgabe and "zurueckfallen" in ausgabe
    danach = _gelesen(fenster_ordner)
    assert danach["current_set"] == "PBL"
    assert danach["set_release_date"] == "2026-07-17"
    assert danach["previous_format_key"] == "TEF-CRI"


def test_unlesbare_datei_wird_nicht_ueberschrieben(fenster_ordner, capsys):
    (fenster_ordner / "format_window.json").write_text("{kaputt", encoding="utf-8")
    ergebnis = update_sets.write_format_window("", en_release_dates={}, jp_release_dates={})
    ausgabe = capsys.readouterr().out
    assert ergebnis == ""
    assert "unlesbar" in ausgabe
    assert (fenster_ordner / "format_window.json").read_text(encoding="utf-8") == "{kaputt"


def test_vorwaerts_wird_geschrieben(fenster_ordner):
    # Datum bewusst in der Vergangenheit: _pick_current_set laesst
    # angekuendigte, aber noch nicht erschienene Sets nicht an die
    # Spitze — sonst wuerde der Chunker sie als aktuell behandeln.
    ergebnis = update_sets.write_format_window(
        "", en_release_dates={"XYZ": "2026-08-07"},
        jp_release_dates={"M7": "2026-08-14"})
    assert ergebnis, "ein neueres Set muss durchgehen"
    danach = _gelesen(fenster_ordner)
    assert danach["current_set"] == "XYZ"
    assert danach["current_set_jp"] == "M7"
    # AB 12.09.2026 WERDEN DIE BEIDEN FELDER ABGELEITET, NICHT BEWAHRT.
    #
    # Bis dahin stand hier `== "TEF-CRI"` — also: der alte Wert
    # ueberlebt die Rotation. Genau das war der Fehler. Beim echten
    # Wechsel PBL -> 30C am 25.09.2026 waere "TEF-CRI" ZWEI Formate
    # zurueck gewesen, und die Predictor-Stufen 5.5/5.6/5.8/5.9 haetten
    # in der Woche vor Frankfurt (26.09.) die Anteile eines laengst
    # vorbeigezogenen Formats gezogen.
    #
    # Richtig ist das Format, das gerade abgeloest wurde:
    # <altes oldest_legal>-<altes current> = TEF-PBL.
    assert danach["previous_format_key"] == "TEF-PBL", (
        "das Vorformat muss das gerade abgeloeste sein, nicht das "
        "davor")

    # set_addition_only faellt hier auf false, weil dieser Fall kein
    # neues oldest_legal_set liefert (kein Kartenbestand im Ordner).
    # Unbekannt -> false ist die VORSICHTIGE Richtung: false schaltet
    # die Stufen aus. Ein faelschliches true wuerde sie mit den
    # Anteilen eines Formats fuettern, dessen Schluesselkarten
    # herausrotiert sein koennen.
    assert danach["set_addition_only"] is False, (
        "ohne bekanntes neues oldest_legal_set gehoeren die Stufen aus, "
        "nicht an")

    # Die _note_*-Felder des Betreibers bleiben unangetastet.
    assert danach["_note_previous_format"] == "von Hand gepflegt"


def test_gleichstand_wird_geschrieben(fenster_ordner):
    """Derselbe Stand ist kein Ruecksprung — der Lauf muss durchgehen."""
    ergebnis = update_sets.write_format_window("", en_release_dates={}, jp_release_dates={})
    assert ergebnis
    assert _gelesen(fenster_ordner)["current_set"] == "PBL"


def test_fallbacks_kennen_den_aktuellen_stand():
    """Der Rueckfall kennt den Stand, den data/format_window.json fuehrt.

    KEIN SET-KUERZEL IM TESTCODE (20.09.2026) — und seit 29.09.2026 (SC-7)
    auch keine Handarbeit im Code mehr: bis dahin verlangte diese
    Zusicherung, dass die HANDTABELLEN in update_sets.py den Anker kennen.
    Beim Wechsel auf 30C hielt das die Deploy-Kette drei Tage an, bis
    jemand die Tabelle nachzog (Commit 6ffcd00). Gefragt wird jetzt der
    Rueckfall, der wirklich greift: Grundstock plus gespeicherter Stand.
    """
    with open(os.path.join(WURZEL, "data", "format_window.json"), encoding="utf-8") as f:
        echt = json.load(f)
    daten = os.path.join(WURZEL, "data")
    en, jp = echt["current_set"], echt["current_set_jp"]
    en_rf = update_sets.rueckfall_release_dates(daten)
    jp_rf = update_sets.rueckfall_jp_release_dates(daten)
    assert en_rf.get(en) == echt["set_release_date"], (
        f"der EN-Anker {en} fehlt im Rueckfall oder traegt ein anderes Datum "
        f"als data/format_window.json")
    assert jp_rf.get(jp) == echt["jp_release_date"], (
        f"der JP-Anker {jp} fehlt im Rueckfall oder traegt ein anderes Datum "
        f"als data/format_window.json")
    assert en in update_sets.rueckfall_set_order(daten), (
        f"{en} hat keine Ordnungszahl — der Chunker wuerde seine "
        f"Karten in den Legacy-Chunk werfen.")
    assert update_sets._pick_current_set(dict(en_rf)) == en
    assert update_sets._pick_current_set(dict(jp_rf)) == jp


def test_ein_neues_set_braucht_keinen_eintrag_im_code(tmp_path, monkeypatch):
    """Verhalten, nicht Text: ein Set, das KEINE Tabelle in update_sets.py
    kennt, steht im gespeicherten Fenster — der Rueckfall kennt es trotzdem,
    und ein Lauf ohne Quelle faellt nicht dahinter zurueck."""
    ordner = tmp_path / "data"
    ordner.mkdir()
    fenster = dict(FENSTER, current_set="ZQX", set_release_date="2026-08-20",
                   current_set_jp="M9Q", jp_release_date="2026-08-21",
                   previous_format_key="TEF-PBL")
    (ordner / "format_window.json").write_text(json.dumps(fenster), encoding="utf-8")
    (ordner / "sets.json").write_text(json.dumps({"ZQX": 999}), encoding="utf-8")
    monkeypatch.setattr(update_sets, "data_dir", str(ordner))
    monkeypatch.setattr(update_sets, "FALLBACK_RELEASE_DATES", dict(WELT_EN))
    monkeypatch.setattr(update_sets, "FALLBACK_JP_RELEASE_DATES", dict(WELT_JP))
    assert "ZQX" not in update_sets.FALLBACK_RELEASE_DATES
    assert update_sets.rueckfall_release_dates()["ZQX"] == "2026-08-20"
    assert update_sets.rueckfall_jp_release_dates()["M9Q"] == "2026-08-21"
    assert update_sets.rueckfall_set_order()["ZQX"] == 999

    update_sets.write_format_window("", en_release_dates={}, jp_release_dates={})
    danach = _gelesen(ordner)
    assert danach["current_set"] == "ZQX" and danach["current_set_jp"] == "M9Q", (
        "ohne Quelle ist das Fenster hinter den gespeicherten Stand gefallen")
