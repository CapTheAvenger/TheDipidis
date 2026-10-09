"""SC-30 (09.10.2026): der Usage-Scraper holt je Format nur noch die
Saison-Gesamtdatei — nicht alle 58 Verweise.

Gemessen am 09.10.2026 (Lauf #114, Chrome auf
championsbattledata.com/api/pokemon/baxcalibur): `battleDataCsvs` fuehrt 58
Verweise — zwei Gesamtdateien ("Current", ohne Datum, zuletzt in der Liste)
und 56 taegliche Momentaufnahmen (`daily: true`, Saisons M7/M6, Datum
`TT_MM_JJJJ`). Der Scraper holte alle und behielt die letzte erfolgreiche:
dasselbe Ergebnis wie jetzt, aber 10.418 Anfragen mit 404 je Lauf.

Geprueft wird das VERHALTEN der Auswahl (Funktion ausgefuehrt), nicht ihr
Wortlaut. Verfaelschungsprobe 09.10.2026: `gesamt + taeglich` zu
`taeglich + gesamt` gedreht -> 3 rot; Sortierung entfernt -> 1 rot; alter Code -> 4 rot.
"""
import importlib.util
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
PFAD = os.path.join(ROOT, "scripts", "scrape_champions_usage.py")

spec = importlib.util.spec_from_file_location("scrape_champions_usage", PFAD)
modul = importlib.util.module_from_spec(spec)
spec.loader.exec_module(modul)

# Die echte Form der API-Antwort (Baxcalibur, 09.10.2026), gekuerzt.
REFS = [
    {"season": "M7", "format": "Doubles", "path": "battle_data/M7/09_10_2026/Doubles/Baxcalibur.csv", "date": "09_10_2026", "daily": True},
    {"season": "M7", "format": "Singles", "path": "battle_data/M7/09_10_2026/Singles/Baxcalibur.csv", "date": "09_10_2026", "daily": True},
    {"season": "M7", "format": "Doubles", "path": "battle_data/M7/08_10_2026/Doubles/Baxcalibur.csv", "date": "08_10_2026", "daily": True},
    {"season": "M6", "format": "Doubles", "path": "battle_data/M6/30_09_2026/Doubles/Baxcalibur.csv", "date": "30_09_2026", "daily": True},
    {"season": "M6", "format": "Singles", "path": "battle_data/M6/12_09_2026/Singles/Baxcalibur.csv", "date": "12_09_2026", "daily": True},
    {"season": "Current", "format": "Singles", "path": "battle_data/Singles/Baxcalibur.csv"},
    {"season": "Current", "format": "Doubles", "path": "battle_data/Doubles/Baxcalibur.csv"},
]


def test_die_gesamtdatei_kommt_zuerst_dann_die_juengste_momentaufnahme():
    # Reihenfolge der Quelle absichtlich durcheinander: die Auswahl muss
    # sortieren, nicht die Listenreihenfolge uebernehmen.
    durcheinander = [REFS[3], REFS[6], REFS[2], REFS[4], REFS[0], REFS[5], REFS[1]]
    k = modul.csv_kandidaten(durcheinander)
    assert set(k) == {"doubles", "singles"}
    assert k["doubles"][0]["season"] == "Current" and "date" not in k["doubles"][0]
    assert k["singles"][0]["season"] == "Current"
    # danach die Momentaufnahmen, juengste zuerst — Monat vor Tag, Jahr vor Monat
    assert [r["date"] for r in k["doubles"][1:]] == ["09_10_2026", "08_10_2026", "30_09_2026"]
    assert [r["date"] for r in k["singles"][1:]] == ["09_10_2026", "12_09_2026"]


def test_verweise_ohne_format_oder_pfad_fallen_weg():
    k = modul.csv_kandidaten(REFS + [{"season": "Current", "format": "", "path": "x"},
                                      {"season": "Current", "format": "Doubles"}])
    assert len(k["doubles"]) == 4 and "" not in k


def test_es_wird_je_format_hoechstens_dreimal_versucht_und_beim_treffer_aufgehoert(monkeypatch):
    """Die Schleife in scrape_pokemon, ausgefuehrt: die Gesamtdatei trifft
    sofort -> genau EINE Anfrage je Format statt 29."""
    geholt = []

    def fetch_text(url, timeout=45):
        geholt.append(url)
        return "pokemon,column_position,category,rank,name,percentage\nBaxcalibur,1,nature,1,Adamant,50.0\n"

    monkeypatch.setattr(modul, "fetch_text", lambda url, timeout=45: (
        __import__("json").dumps({"battleName": "Baxcalibur", "summary": {}, "battleDataCsvs": REFS})
        if url.endswith("/api/pokemon/baxcalibur") else fetch_text(url, timeout)))
    name, rec, fehlt = modul.scrape_pokemon("baxcalibur")
    assert not fehlt and rec and set(rec) >= {"doubles", "singles"}
    assert len(geholt) == 2, geholt
    assert all(url.endswith(("battle_data/Doubles/Baxcalibur.csv", "battle_data/Singles/Baxcalibur.csv")) for url in geholt)
    assert rec["doubles"]["season"] == "Current"


def test_faellt_die_gesamtdatei_aus_kommt_die_juengste_momentaufnahme(monkeypatch):
    import json
    import urllib.error
    geholt = []

    def fetch_text(url, timeout=45):
        if url.endswith("/api/pokemon/baxcalibur"):
            return json.dumps({"battleName": "Baxcalibur", "summary": {}, "battleDataCsvs": REFS})
        geholt.append(url)
        if "battle_data/Doubles/" in url or "battle_data/Singles/" in url:
            raise urllib.error.HTTPError(url, 404, "Not Found", None, None)
        return "pokemon,column_position,category,rank,name,percentage\nBaxcalibur,1,nature,1,Adamant,50.0\n"

    monkeypatch.setattr(modul, "fetch_text", fetch_text)
    name, rec, fehlt = modul.scrape_pokemon("baxcalibur")
    assert rec["doubles"]["season"] == "M7" and rec["singles"]["season"] == "M7"
    assert len(geholt) == 4, geholt  # je Format: Gesamtdatei (404) + juengste Momentaufnahme
    assert modul.CSV_VERSUCHE_JE_FORMAT == 3
