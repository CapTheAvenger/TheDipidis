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


@pytest.fixture()
def fenster_ordner(tmp_path, monkeypatch):
    ordner = tmp_path / "data"
    ordner.mkdir()
    (ordner / "format_window.json").write_text(
        json.dumps(FENSTER), encoding="utf-8")
    monkeypatch.setattr(update_sets, "data_dir", str(ordner))
    return ordner


def _gelesen(ordner):
    return json.loads((ordner / "format_window.json").read_text(encoding="utf-8"))


def test_ruecksprung_wird_nicht_geschrieben(fenster_ordner, monkeypatch, capsys):
    # Fallbacks kuenstlich auf den alten Stand: simuliert "Quelle weg".
    alt_en = dict(update_sets.FALLBACK_RELEASE_DATES)
    alt_jp = dict(update_sets.FALLBACK_JP_RELEASE_DATES)
    alt_en.pop("PBL", None)
    alt_jp.pop("M6", None)
    monkeypatch.setattr(update_sets, "FALLBACK_RELEASE_DATES", alt_en)
    monkeypatch.setattr(update_sets, "FALLBACK_JP_RELEASE_DATES", alt_jp)

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
    # Die manuellen Felder ueberleben die Rotation.
    assert danach["previous_format_key"] == "TEF-CRI"
    assert danach["set_addition_only"] is True
    assert danach["_note_previous_format"] == "von Hand gepflegt"


def test_gleichstand_wird_geschrieben(fenster_ordner):
    """Derselbe Stand ist kein Ruecksprung — der Lauf muss durchgehen."""
    ergebnis = update_sets.write_format_window("", en_release_dates={}, jp_release_dates={})
    assert ergebnis
    assert _gelesen(fenster_ordner)["current_set"] == "PBL"


def test_fallbacks_kennen_den_aktuellen_stand():
    """Der Riegel ist die zweite Verteidigungslinie. Die erste ist, dass
    die Fallback-Tabellen nicht auf einem alten Format stehen."""
    assert update_sets.FALLBACK_RELEASE_DATES.get("PBL") == "2026-07-17"
    assert update_sets.FALLBACK_JP_RELEASE_DATES.get("M6") == "2026-07-31"
    for code in ("PBL", "M6"):
        assert code in update_sets.FALLBACK_SET_ORDER, (
            f"{code} hat keine Ordnungszahl — der Chunker wuerde seine "
            f"Karten in den Legacy-Chunk werfen.")
    with open(os.path.join(WURZEL, "data", "format_window.json"), encoding="utf-8") as f:
        echt = json.load(f)
    assert update_sets._pick_current_set(
        dict(update_sets.FALLBACK_RELEASE_DATES)) == echt["current_set"]
    assert update_sets._pick_current_set(
        dict(update_sets.FALLBACK_JP_RELEASE_DATES)) == echt["current_set_jp"]
