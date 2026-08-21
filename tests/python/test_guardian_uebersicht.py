"""Der Waechter haelt die Turnieruebersicht gegen die Chunkdateien.

BEFUND (21.08.2026): data/tournament_cards_data_overview.csv und die
Chunkdateien tournament_cards_data_cards_<FORMAT>.csv beschreiben
dieselben Turniere, wurden aber nie gegeneinander gehalten. Darin
standen drei Abweichungen:

  * Turnier 539 zweimal, einmal mit total_cards=5783 — der Chunk hat
    1019 Zeilen fuer dieses Turnier.
  * Turnier 540 und 518 ohne Format.
  * Turnier 443 und 444 stehen in der Uebersicht, in keinem Chunk.

Die ersten beiden sind repariert (belegt durch die meta-Spalte des
Chunks bzw. durch Loeschen der unmoeglichen Dublette). 443/444 bleiben
stehen und werden gemeldet — welches Format sie hatten, sagt keine
Datei im Repo, und Raten waere hier die schlechtere Antwort
(CLAUDE.md: "Report, don't silently repair").

Der Test prueft die Pruefung: erkennt sie eine eingebaute Dublette und
eine falsche Kartenzahl wieder?
"""

import importlib.util
import os
import sys

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
QUELLE = os.path.join(WURZEL, "scripts", "data_guardian.py")

KOPF_UEBERSICHT = ("tournament_id;tournament_name;tournament_date;players;"
                   "format;cards_url;total_cards;status;labs_tournament_id")
KOPF_CHUNK = "tournament_id;tournament_name;meta;card_name"


@pytest.fixture()
def waechter(tmp_path, monkeypatch):
    spec = importlib.util.spec_from_file_location("dg_test", QUELLE)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    daten = tmp_path / "data"
    daten.mkdir()
    monkeypatch.setattr(m, "DATA", str(daten))
    return m, daten


def _schreibe_uebersicht(daten, zeilen):
    (daten / "tournament_cards_data_overview.csv").write_text(
        KOPF_UEBERSICHT + "\n" + "\n".join(zeilen) + "\n", encoding="utf-8")


def _schreibe_chunk(daten, meta, turnier_id, n):
    (daten / f"tournament_cards_data_cards_{meta}.csv").write_text(
        KOPF_CHUNK + "\n"
        + "".join(f"{turnier_id};T;{meta};Karte {i}\n" for i in range(n)),
        encoding="utf-8")


def test_stimmige_daten_melden_nichts(waechter):
    m, daten = waechter
    _schreibe_uebersicht(daten, ["500;Turnier;1st May 2026;100;TEF-CRI;u;3;success;1"])
    _schreibe_chunk(daten, "TEF-CRI", "500", 3)
    befunde = []
    m.check_uebersicht_gegen_chunks(befunde)
    assert befunde == []


def test_dublette_ist_kritisch(waechter):
    m, daten = waechter
    zeile = "500;Turnier;1st May 2026;100;TEF-CRI;u;3;success;1"
    _schreibe_uebersicht(daten, [zeile, zeile])
    _schreibe_chunk(daten, "TEF-CRI", "500", 3)
    befunde = []
    m.check_uebersicht_gegen_chunks(befunde)
    stufen = [s for s, _ in befunde]
    assert "CRITICAL" in stufen, befunde
    assert any("mehrfach" in t for _, t in befunde)


def test_falsche_kartenzahl_wird_gemeldet(waechter):
    m, daten = waechter
    _schreibe_uebersicht(daten, ["500;Turnier;1st May 2026;100;TEF-CRI;u;5783;success;1"])
    _schreibe_chunk(daten, "TEF-CRI", "500", 1019)
    befunde = []
    m.check_uebersicht_gegen_chunks(befunde)
    assert any("5783" in t and "1019" in t for _, t in befunde), befunde


def test_turnier_ohne_chunk_wird_gemeldet(waechter):
    m, daten = waechter
    _schreibe_uebersicht(daten, ["443;Turnier;1st May 2026;100;;u;875;success;1"])
    _schreibe_chunk(daten, "TEF-CRI", "500", 3)
    befunde = []
    m.check_uebersicht_gegen_chunks(befunde)
    assert any("keiner Chunkdatei" in t and "443" in t for _, t in befunde), befunde


def test_echte_uebersicht_hat_keine_dubletten_und_keine_zahlfehler():
    """Der ausgelieferte Stand, nicht nur die Pruefung."""
    spec = importlib.util.spec_from_file_location("dg_echt", QUELLE)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    befunde = []
    m.check_uebersicht_gegen_chunks(befunde)
    kritisch = [t for s, t in befunde if s == "CRITICAL"]
    assert not kritisch, kritisch
    zahlfehler = [t for _, t in befunde if "abweichender Kartenzahl" in t]
    assert not zahlfehler, zahlfehler
    # 443/444 duerfen stehen bleiben — sie sind gemeldet, nicht geraten.
    ohne_chunk = [t for _, t in befunde if "keiner Chunkdatei" in t]
    assert len(ohne_chunk) <= 1
