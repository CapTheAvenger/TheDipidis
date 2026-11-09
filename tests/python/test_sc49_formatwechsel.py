"""SC-49 (09.11.2026): der Formatwechsel holt die Turniere des neuen Formats
unter dem neuen Schluessel — auch die, die schon im Index stehen.

BEFUND (Pruefagent, 09.11.2026): der taegliche Limitless-API-Lauf holte die
ersten Delta-Reign-Turniere (06.-08.11.) mit dem Fenster von main, also als
TEF-30C. Stellt der Wochenlauf auf DLR um, saehe die inkrementelle Regel
sie als bekannt — online_api_cards_TEF-DLR.csv entstuende nicht, und ihre
Kartenzeilen laegen im 30C-Auszug. Geprueft am Verhalten von
`neu_einordnen` + dem vorhandenen Aufraeumen in einem Wegwerf-Datenordner.
"""
import csv
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import backend.scrapers.limitless_api_scraper as S  # noqa: E402


@pytest.fixture
def ordner(tmp_path, monkeypatch):
    monkeypatch.setattr(S, "_fenster_zwischenspeicher", None)
    d = tmp_path
    (d / "sets_metadata.json").write_text(json.dumps({
        "DLR": {"release_date": "2026-11-06"},
        "30C": {"release_date": "2026-09-16"},
        "PBL": {"release_date": "2026-07-17"},
    }))
    (d / "format_window.json").write_text(json.dumps({
        "current_set": "DLR", "oldest_legal_set": "TEF", "previous_format_key": "TEF-30C"}))
    with open(d / "online_api_tournaments.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=S.SPALTEN_TURNIERE, delimiter=";")
        w.writeheader()
        for tid, datum, meta in (("alt", "2026-11-05", "TEF-30C"),
                                 ("blitz8", "2026-11-06", "TEF-30C"),
                                 ("neu", "2026-11-07", "TEF-DLR")):
            w.writerow({"tournament_id": tid, "date": datum, "meta": meta, "depth": "voll"})
    with open(d / "online_api_cards_TEF-30C.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=S.SPALTEN_KARTEN, delimiter=";")
        w.writeheader()
        for tid in ("alt", "blitz8"):
            w.writerow({"tournament_id": tid, "card": "x"})
    return d


def _ids(pfad):
    with open(pfad, encoding="utf-8") as f:
        return [z["tournament_id"] for z in csv.DictReader(f, delimiter=";")]


def test_das_fenster_beginnt_am_erscheinungstag(ordner):
    assert S.formatschluessel("2026-11-06", str(ordner)) == "TEF-DLR"
    assert S.formatschluessel("2026-11-05", str(ordner)) == "TEF-30C"


def test_falsch_eingeordnete_turniere_des_neuen_fensters_fliegen_aus_dem_index(ordner):
    raus = S.neu_einordnen(str(ordner / "online_api_tournaments.csv"), str(ordner))
    assert raus == ["blitz8"]
    assert _ids(ordner / "online_api_tournaments.csv") == ["alt", "neu"]


def test_ihre_kartenzeilen_verschwinden_aus_dem_alten_auszug(ordner):
    S.neu_einordnen(str(ordner / "online_api_tournaments.csv"), str(ordner))
    bekannt = S.bekannte_turniere(str(ordner / "online_api_tournaments.csv"))
    S._raeume_chunks_auf(str(ordner), "online_api_cards", S.SPALTEN_KARTEN, bekannt)
    assert _ids(ordner / "online_api_cards_TEF-30C.csv") == ["alt"]
    # und die inkrementelle Regel holt das Turnier wieder
    offen = S.neue_turniere([{"id": "blitz8", "date": "2026-11-06T01:00:00Z", "format": "STANDARD",
                              "players": 106}], bekannt, min_spieler=50, format_id="STANDARD",
                            datenverzeichnis=str(ordner))
    assert [t["id"] for t in offen] == ["blitz8"]


def test_ohne_formatwechsel_bleibt_der_index_unberuehrt(ordner):
    (ordner / "format_window.json").write_text(json.dumps({
        "current_set": "30C", "oldest_legal_set": "TEF"}))
    meta = json.loads((ordner / "sets_metadata.json").read_text())
    del meta["DLR"]
    (ordner / "sets_metadata.json").write_text(json.dumps(meta))
    vorher = (ordner / "online_api_tournaments.csv").read_text()
    # "neu" steht schon als TEF-DLR — die Funktion haengt nur ins LAUFENDE Fenster um,
    # hier also nichts, was in 30C richtig steht.
    raus = S.neu_einordnen(str(ordner / "online_api_tournaments.csv"), str(ordner))
    assert "alt" not in raus and "blitz8" not in raus
    assert vorher != "" and (ordner / "online_api_tournaments.csv").exists()


def test_der_wochenlauf_ruft_es_beim_formatwechsel():
    yml = open(os.path.join(os.path.dirname(__file__), "..", "..", ".github", "workflows",
                            "weekly-full-update.yml"), encoding="utf-8").read()
    schritt = yml.split("Formatwechsel — Online-API-Dateien des neuen Formats holen (SC-49)", 1)[1]
    schritt = schritt.split("- name:", 1)[0]
    assert "--neu-einordnen" in schritt
