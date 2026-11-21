"""Deutsche Namen duerfen nicht fuer immer fehlen (UI-163, 21.11.2026).

BEFUND: "Abenteuerlaterne" fand in der Kartendatenbank 0 Karten. 135 von 141
DLR-Karten hatten einen deutschen Kartentext, aber keinen deutschen Namen:
der Scraper holte die deutsche Namensliste nur fuer neue oder
unvollstaendige Karten, eine einmal "vollstaendige" Karte wurde nie wieder
angefasst.

Gehalten wird (1) das Verhalten der beiden Funktionen — ausgefuehrt, nicht
als Text gelesen — und (2) der Bestand: wo ein deutscher Kartentext steht,
steht auch ein Name, sobald der Lauf ihn nachtragen konnte. Fuer (2) gilt
nur das Set, dessen Namen am 21.11.2026 belegt nachgetragen wurden (DLR,
141 Namen aus limitlesstcg.com/cards/de/DLR). Eine Bestandszusicherung ueber
ALLE Sets waere falsch: ein kuenftiges Set, dessen Namen Limitless spaeter
liefert, wuerde das Tor rot machen, obwohl der naechste Lauf es heilt.
"""

import csv
import importlib.util
import json
import os
import sys

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))


def _lade():
    for sub in ("core", "scrapers"):
        sys.path.insert(0, os.path.join(WURZEL, "backend", sub))
    pfad = os.path.join(WURZEL, "backend", "scrapers", "all_cards_scraper.py")
    spec = importlib.util.spec_from_file_location("all_cards_scraper_t", pfad)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_fehlende_namen_nur_mit_deutschem_text():
    m = _lade()
    karten = [
        {"set": "DLR", "number": "1", "name_de": "", "card_text_de": "Text"},
        {"set": "DLR", "number": "2", "name_de": "Gehweiher", "card_text_de": "Text"},
        {"set": "SVP", "number": "9", "name_de": "", "card_text_de": ""},
    ]
    assert m.fehlende_deutsche_namen(karten) == {"DLR::1"}


def test_nachtragen_verbindet_ueber_set_und_nummer_und_ueberschreibt_nie():
    m = _lade()
    karten = [
        # gleicher Name_en, zwei Nummern: nur die Nummer entscheidet
        {"set": "DLR", "number": "92", "name_en": "Emcee's Hype", "name_de": ""},
        {"set": "DLR", "number": "128", "name_en": "Emcee's Hype", "name_de": "Alt"},
        {"set": "DLR", "number": "5", "name_en": "X", "name_de": ""},
    ]
    n = m.deutsche_namen_nachtragen(karten, {"DLR::92": "MCs Hype", "DLR::128": "Neu"})
    assert n == 1
    assert karten[0]["name_de"] == "MCs Hype"
    assert karten[1]["name_de"] == "Alt"
    assert karten[2]["name_de"] == ""


def _csv():
    pfad = os.path.join(WURZEL, "data", "all_cards_database.csv")
    with open(pfad, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def test_aktuelles_set_hat_alle_deutschen_namen():
    ohne = [r["number"] for r in _csv()
            if r["set"] == "DLR" and not r["name_de"].strip()]
    assert not ohne, f"DLR ohne deutschen Namen: {ohne[:10]}"


def test_chunk_und_merged_tragen_denselben_namen():
    def namen(pfad):
        with open(os.path.join(WURZEL, "data", pfad), encoding="utf-8") as f:
            d = json.load(f)
        karten = d["cards"] if isinstance(d, dict) else d
        return {c["number"]: c["name_de"] for c in karten if c.get("set") == "DLR"}

    assert namen("cards_chunk_standard.json") == namen("all_cards_merged.json")
    assert namen("cards_chunk_standard.json").get("90") == "Abenteuerlaterne"
