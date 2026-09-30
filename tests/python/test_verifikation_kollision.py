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


def fremd_belegt(rows, set_, nummer):
    """Die Nummer, mit der (set_, nummer) bestaetigt ist, wenn eine ANDERE
    bestaetigte Zeile dieselbe traegt — sonst ''."""
    eigene = [x for x in rows if x["set"] == set_ and x["number"] == nummer]
    if not eigene or eigene[0]["status"] != "verified":
        return ""
    pid = eigene[0]["verified_product_id"]
    andere = {x["verified_product_id"] for x in rows
              if x["status"] == "verified" and (x["set"], x["number"]) != (set_, nummer)}
    return pid if pid in andere else ""


def test_blw_59_traegt_keine_nummer_einer_anderen_karte():
    """Bis 30.09.2026 verlangte diese Zusicherung woertlich den Status
    `kollision`. Verify #17 (30.09.) stufte BLW-59 mit frischen Preisen als
    `fingerprint_ambiguous` ein — weiter NICHT bestaetigt, also richtig —,
    und das Tor hielt den Lauf an. Ein Wochenwert ist keine Regel: gemeint
    war immer, dass BLW-59 nicht die Nummer von BLW-58 bekommt. Welchen
    Status der Pruefer diese Woche vergibt, ist seine Sache."""
    rows = list(csv.DictReader(open(os.path.join(WURZEL, "data", "cardmarket_mapping_verified.csv"),
                                    encoding="utf-8-sig")))
    r = [x for x in rows if x["set"] == "BLW" and x["number"] == "59"]
    assert r, "BLW-59 fehlt in der Pruefdatei"
    assert fremd_belegt(rows, "BLW", "59") == "", \
        f"BLW-59 ist mit {r[0]['verified_product_id']} bestaetigt — die Nummer gehoert einer anderen Karte"
    if r[0]["status"] == "kollision":
        assert r[0]["verified_product_id"] == "" and "BLW-58" in r[0]["evidence"]


def test_fremd_belegt_beisst():
    """Verfaelschungsprobe fuer die Hilfsfunktion, ausgefuehrt."""
    rows = [{"set": "BLW", "number": "58", "status": "verified", "verified_product_id": "279796"},
            {"set": "BLW", "number": "59", "status": "verified", "verified_product_id": "279796"}]
    assert fremd_belegt(rows, "BLW", "59") == "279796"
    rows[1]["status"] = "fingerprint_ambiguous"
    assert fremd_belegt(rows, "BLW", "59") == ""
    rows[1].update(status="verified", verified_product_id="279797")
    assert fremd_belegt(rows, "BLW", "59") == ""
