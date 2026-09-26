"""DA-1 / UI-2: Galerienummern der Prize-Pack-Serie 7 und Sichtpruefung.

Gemessen 27.09.2026 (Galeriebild neben Basisdruck, alle 266 Bilder):
Serie 7 fuehrt Leafeon ex (PRE 6) in der PDF als Zeile 36, in der Galerie
als Bild 58; die Zeilen 37–58 sind die Bilder 36–57. Die Korrektur steht
benannt in data/prizepack_galerie_korrekturen.json.
"""
import csv
import importlib.util
import json
import os

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
DATA = os.path.join(WURZEL, "data")

spec = importlib.util.spec_from_file_location(
    "bppi", os.path.join(WURZEL, "scripts", "build_prizepack_official_images.py"))
B = importlib.util.module_from_spec(spec)
spec.loader.exec_module(B)

KORR = json.load(open(os.path.join(DATA, "prizepack_galerie_korrekturen.json"), encoding="utf-8"))
ROWS = list(csv.DictReader(open(os.path.join(DATA, "prizepack_official_images.csv"), encoding="utf-8-sig")))
INDEX = json.load(open(os.path.join(DATA, "prizepack_official_images.json"), encoding="utf-8"))


def _zeile(serie, nr, sc, num):
    return {"series": str(serie), "gallery_number": str(nr), "set_code": sc, "set_number": str(num),
            "image_url_de": "", "image_url_en": ""}


def test_verschieben_und_neu_nummerieren():
    rows = [_zeile(7, i, "X", i) for i in range(1, 6)]
    k = {"verschiebungen": [{"serie": 7, "karte": "X-2", "galerie": 5}]}
    neu = B.galerie_korrigieren(rows, k)
    assert [r["set_number"] for r in neu] == ["1", "3", "4", "5", "2"]
    assert [r["gallery_number"] for r in neu] == ["1", "2", "3", "4", "5"]
    assert neu[-1]["image_url_en"].endswith("_EN_5-2x.png")


def test_verschieben_in_die_mitte():
    rows = [_zeile(7, i, "X", i) for i in range(1, 6)]
    neu = B.galerie_korrigieren(rows, {"verschiebungen": [{"serie": 7, "karte": "X-5", "galerie": 2}]})
    assert [r["set_number"] for r in neu] == ["1", "5", "2", "3", "4"]


def test_zweimal_angewandt_aendert_nichts():
    rows = [_zeile(7, i, "X", i) for i in range(1, 6)]
    k = {"verschiebungen": [{"serie": 7, "karte": "X-2", "galerie": 5}]}
    einmal = [dict(r) for r in B.galerie_korrigieren(rows, k)]
    zweimal = B.galerie_korrigieren([dict(r) for r in einmal], k)
    assert [r["set_number"] for r in zweimal] == [r["set_number"] for r in einmal]


def test_andere_serien_bleiben_unberuehrt():
    rows = [_zeile(8, i, "Y", i) for i in range(1, 4)] + [_zeile(7, i, "X", i) for i in range(1, 4)]
    neu = B.galerie_korrigieren(rows, {"verschiebungen": [{"serie": 7, "karte": "X-1", "galerie": 3}]})
    assert [r["set_number"] for r in neu if r["series"] == "8"] == ["1", "2", "3"]


def test_die_daten_tragen_die_gemessene_reihenfolge():
    s7 = {int(r["gallery_number"]): r for r in ROWS if r["series"] == "7"}
    assert (s7[58]["set_code"], s7[58]["set_number"]) == ("PRE", "6")      # Leafeon ex
    assert (s7[36]["set_code"], s7[36]["set_number"]) == ("JTG", "56")     # Lillie's Clefairy ex
    assert (s7[40]["set_code"], s7[40]["set_number"]) == ("TEF", "114")    # Metang (Befund 25.09.)
    assert (s7[59]["set_code"], s7[59]["set_number"]) == ("SCR", "131")    # ab hier wie PDF
    assert s7[40]["image_url_en"].endswith("_EN_40-2x.png")
    assert INDEX["TEF-114"]["num"] in (40, "40") and INDEX["TEF-114"]["en"].endswith("_EN_40-2x.png")


def test_bestaetigt_ist_kein_friedhof_und_ohne_falsche_schluessel():
    da = {(r["series"], "%s-%s" % (r["set_code"].upper(), r["set_number"])) for r in ROWS}
    nummer = {(r["series"], "%s-%s" % (r["set_code"].upper(), r["set_number"])): int(r["gallery_number"]) for r in ROWS}
    for serie, keys in KORR["sichtpruefung"]["bestaetigt"].items():
        for k, nr in keys.items():
            assert (serie, k) in da, k
            assert nummer[(serie, k)] == nr, k
            assert not k.startswith(("SHF-", "PLF-")), k


def test_nur_bestaetigte_bilder_gelten_als_geprueft():
    sicht, _ = B.sichtpruefung(KORR)
    for key, e in INDEX.items():
        if e.get("pruefung") == "sichtpruefung":
            assert sicht.get((str(e["series"]), key)) == int(e["num"]), key
            assert e["pruefadresse"] == e["en"]
    assert sum(1 for e in INDEX.values() if e.get("geprueft") is True) > 200


def test_der_index_setzt_das_urteil_nur_fuer_bestaetigte(tmp_path, monkeypatch):
    monkeypatch.setattr(B, "load_pps_cardmarket_products", lambda: {})
    monkeypatch.setattr(B, "load_price_guide", lambda: {})
    monkeypatch.setattr(B, "sichtpruefung", lambda *a: ({("7", "X-1"): 1, ("7", "X-2"): 9}, "2026-09-27"))
    rows = [dict(_zeile(7, 1, "X", 1), name_de="a", name_en="a", image_url_en="u1"),
            dict(_zeile(7, 2, "X", 2), name_de="b", name_en="b", image_url_en="u2")]
    idx = B.write_json_index(rows, str(tmp_path / "i.json"))
    assert idx["X-1"]["geprueft"] is True and idx["X-1"]["pruefadresse"] == "u1"
    assert "geprueft" not in idx["X-2"]


def test_beide_wege_wenden_die_korrektur_an():
    # Aufruf-Pruefung (Text), Kommentare vorher entfernt.
    import re
    src = open(os.path.join(WURZEL, "scripts", "build_prizepack_official_images.py"), encoding="utf-8").read()
    ohne = re.sub(r"#[^\n]*", "", src)
    main = ohne[ohne.index("def main("):]
    assert main.count("galerie_korrigieren(rows)") == 2
