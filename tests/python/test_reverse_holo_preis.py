"""Reverse-Holo-Preis vom Cardmarket-Preisfuehrer bis in die Karten-Chunks (UI-165, 24.11.2026).

Die Kartendatenbank zeigt Normal und Reverse Holo getrennt. OB eine Karte eine
Reverse hat, entscheidet die Seite am Feld `eur_price_reverse` — leer oder
fehlend heisst „keine Reverse“. Cardmarket fuehrt die Reverse-Fassung im selben
Produkt unter `trend-holo`; 0 bedeutet dort „gibt es nicht“ (ex, Full Arts,
Special Rares), nicht „wertlos“.

Gehalten wird (1) das VERHALTEN des Mischers, ausgefuehrt auf einem kleinen
gebauten Datenstand, und (2) dass das Feld unterwegs nicht verloren geht:
price_data.csv -> all_cards_merged.csv -> Chunk, Karte fuer Karte ueber
(Set, Nummer). Die zweite Pruefung behauptet keinen Wochenwert — sie vergleicht
die Dateien untereinander.
"""

import csv
import importlib.util
import io
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DATA = os.path.join(ROOT, "data")


def _mischer():
    sys.path.insert(0, os.path.join(ROOT, "backend", "core"))
    pfad = os.path.join(ROOT, "backend", "scrapers", "cardmarket_price_merger.py")
    spec = importlib.util.spec_from_file_location("cm_merger_ui165", pfad)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _schreibe_csv(pfad, felder, zeilen):
    with io.open(pfad, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=felder)
        w.writeheader()
        w.writerows(zeilen)


def test_der_mischer_schreibt_den_reverse_trend_und_laesst_0_leer(tmp_path, monkeypatch):
    m = _mischer()
    d = tmp_path
    _schreibe_csv(d / "all_cards_database.csv", ["name_en", "set", "number", "cardmarket_url"], [
        {"name_en": "Musharna", "set": "BLK", "number": "36", "cardmarket_url": ""},
        {"name_en": "Mega Sharpedo ex", "set": "PFL", "number": "61", "cardmarket_url": ""},
        {"name_en": "Ohne Fuehrer", "set": "PFL", "number": "62", "cardmarket_url": ""},
    ])
    _schreibe_csv(d / "cardmarket_id_mapping.csv", ["set", "number", "cardmarket_product_id", "match_method"], [
        {"set": "BLK", "number": "36", "cardmarket_product_id": "1", "match_method": "unique"},
        {"set": "PFL", "number": "61", "cardmarket_product_id": "2", "match_method": "unique"},
        {"set": "PFL", "number": "62", "cardmarket_product_id": "3", "match_method": "unique"},
    ])
    (d / "price_guide_6.json").write_text(json.dumps({"priceGuides": [
        {"idProduct": 1, "trend": 0.04, "low": 0.02, "trend-holo": 0.08},
        {"idProduct": 2, "trend": 0.59, "low": 0.40, "trend-holo": 0},
    ]}), encoding="utf-8")
    # Ein Vortag, an dem PFL 62 eine Reverse hatte — heute fehlt der Fuehrer-Eintrag.
    _schreibe_csv(d / "price_data.csv",
                  ["name", "set", "number", "eur_price", "eur_low", "cardmarket_url",
                   "last_updated", "price_status", "mapping_status", "eur_price_reverse"],
                  [{"name": "Ohne Fuehrer", "set": "PFL", "number": "62", "eur_price": "0,10€",
                    "eur_low": "0,05€", "cardmarket_url": "", "last_updated": "2026-11-23",
                    "price_status": "ok", "mapping_status": "ok", "eur_price_reverse": "0,30€"}])
    monkeypatch.setattr(m, "get_project_data_dir", lambda: str(d))
    m.main()
    with io.open(d / "price_data.csv", encoding="utf-8-sig", newline="") as f:
        zeilen = {(r["set"], r["number"]): r for r in csv.DictReader(f)}
    assert zeilen[("BLK", "36")]["eur_price_reverse"] == "0,08€"
    assert zeilen[("PFL", "61")]["eur_price_reverse"] == ""          # 0 heisst: keine Reverse
    assert zeilen[("PFL", "62")]["eur_price_reverse"] == "0,30€"     # stale: Vortag bleibt


def _lies_csv(name):
    with io.open(os.path.join(DATA, name), encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def test_das_feld_kommt_unveraendert_bis_in_die_chunks():
    preise = {(r["set"], r["number"]): r.get("eur_price_reverse", "") for r in _lies_csv("price_data.csv")}
    merged = {(r["set"], r["number"]): r.get("eur_price_reverse", "") for r in _lies_csv("all_cards_merged.csv")}
    abweichend = [k for k, v in merged.items() if k in preise and preise[k] != v]
    assert not abweichend, f"merged weicht von price_data ab: {abweichend[:5]}"

    gesehen = 0
    for name in ("cards_chunk_standard.json", "cards_chunk_extended.json", "cards_chunk_legacy.json"):
        with io.open(os.path.join(DATA, name), encoding="utf-8") as f:
            for c in json.load(f):
                k = (c.get("set"), c.get("number"))
                if k not in merged:
                    continue
                erwartet = merged[k]
                assert c.get("eur_price_reverse", "") == erwartet, (name, k, c.get("eur_price_reverse"), erwartet)
                gesehen += 1
    # Vorpruefung gegen ein leeres Bestehen: die Schleife hat wirklich Karten verglichen.
    assert gesehen > 0
