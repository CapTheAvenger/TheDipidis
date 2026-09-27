"""Der Cardmarket-Pruefer bestaetigt keine Nummer, die schon einer anderen
Karte gehoert (27.09.2026).

Lauf #16 (erstmals mit allen positionsbasierten Zeilen, DA-7) gab BLW-59
per Fingerabdruck — Pool 2, eine Kennzahl — dieselbe Nummer 279796 wie dem
seit dem 09.08. bestaetigten BLW-58. Der Zuordner uebernahm das, und der
Wochenlauf #166 blieb an vier Zusicherungen haengen. Ausgefuehrt geprueft.
"""
import csv
import importlib.util
import os
import re

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
spec = importlib.util.spec_from_file_location(
    "vcm", os.path.join(WURZEL, "scripts", "verify_cardmarket_mapping.py"))
V = importlib.util.module_from_spec(spec)
spec.loader.exec_module(V)


def test_besetzt_meldet_die_andere_karte():
    done = {("BLW", "58"): {"status": "verified", "verified_product_id": "279796"},
            ("BLW", "60"): {"status": "no_price_on_page", "verified_product_id": ""}}
    assert V.besetzt_von(done, "279796", ("BLW", "59")) == "BLW-58"
    assert V.besetzt_von(done, "279796", ("BLW", "58")) == ""      # sich selbst nicht
    assert V.besetzt_von(done, "111", ("BLW", "59")) == ""


def test_nur_bestaetigte_zaehlen():
    done = {("BLW", "58"): {"status": "kollision", "verified_product_id": "279796"}}
    assert V.besetzt_von(done, "279796", ("BLW", "59")) == ""


def test_der_pruefer_fragt_vor_dem_bestaetigen():
    src = open(os.path.join(WURZEL, "scripts", "verify_cardmarket_mapping.py"), encoding="utf-8").read()
    ohne = re.sub(r"#[^\n]*", "", src)
    block = ohne[ohne.index("pid, evidence = consensus_match"):]
    block = block[:block.index("new_rows.append(row_out)")]
    assert block.index("besetzt_von(") < block.index("'verified'")


def test_blw_59_ist_als_kollision_gemeldet_nicht_bestaetigt():
    rows = list(csv.DictReader(open(os.path.join(WURZEL, "data", "cardmarket_mapping_verified.csv"),
                                    encoding="utf-8-sig")))
    r = [x for x in rows if x["set"] == "BLW" and x["number"] == "59"]
    assert r and r[0]["status"] == "kollision" and r[0]["verified_product_id"] == ""
    assert "BLW-58" in r[0]["evidence"]
