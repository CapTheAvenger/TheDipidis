"""DA-52 (07.10.2026): eine per Hand gepinnte Produktnummer wird keiner
anderen Karte als bestaetigt zugeschrieben.

Daily Price #144 hielt am Tor: der Fingerabdruck gab CRI 31 die 886424
(vier Deoxys-Drucke zu je 0,03 EUR), die in data/cardmarket_mapping_manual.csv
an CRI 32 gepinnt ist. Der Pruefer kannte nur andere bestaetigte Zeilen,
der Zuordner uebernahm die Zeile — zwei Karten, eine Nummer.
Ausgefuehrt geprueft: Pruefer UND Zuordner."""
import csv
import importlib.util
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def _load(name, relpath):
    spec = importlib.util.spec_from_file_location(name, os.path.join(ROOT, relpath))
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


verify = _load("verify_cm_da52", "scripts/verify_cardmarket_mapping.py")
mapper = _load("cm_mapper_da52", "backend/scrapers/cardmarket_id_mapper.py")


def _schreibe(pfad, felder, zeilen):
    with open(pfad, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=felder)
        w.writeheader()
        w.writerows(zeilen)


def test_pruefer_kennt_die_pins(tmp_path):
    pins_pfad = tmp_path / "cardmarket_mapping_manual.csv"
    _schreibe(pins_pfad, ["set", "number", "cardmarket_product_id", "source", "note"],
              [{"set": "CRI", "number": "32", "cardmarket_product_id": "886424",
                "source": "test", "note": ""}])
    pins = verify.gepinnte_nummern(str(pins_pfad))
    assert pins == {"886424": ("CRI", "32")}
    assert verify.besetzt_von({}, "886424", ("CRI", "31"), pins) == "CRI-32 (Pin)"
    assert verify.besetzt_von({}, "886424", ("CRI", "32"), pins) == ""      # der Pin selbst
    assert verify.besetzt_von({}, "886424", ("CRI", "31")) == ""            # ohne Pins wie bisher


def test_pruefer_uebergibt_die_pins():
    import re
    src = open(os.path.join(ROOT, "scripts", "verify_cardmarket_mapping.py"), encoding="utf-8").read()
    ohne = re.sub(r"#[^\n]*", "", src)
    assert "pins = gepinnte_nummern()" in ohne
    assert "besetzt_von(done, str(pid), key, pins)" in ohne


def test_zuordner_uebernimmt_keine_fremd_gepinnte_nummer(tmp_path):
    _schreibe(tmp_path / "cardmarket_mapping_verified.csv",
              ["set", "number", "verified_product_id", "status"],
              [{"set": "CRI", "number": "31", "verified_product_id": "886424", "status": "verified"},
               {"set": "CRI", "number": "33", "verified_product_id": "886425", "status": "verified"}])
    _schreibe(tmp_path / "cardmarket_mapping_manual.csv",
              ["set", "number", "cardmarket_product_id", "source", "note"],
              [{"set": "CRI", "number": "32", "cardmarket_product_id": "886424", "source": "t", "note": ""}])
    zeilen = [{"set": "CRI", "number": "31", "cardmarket_product_id": 886426, "match_method": "priced-by-date"},
              {"set": "CRI", "number": "33", "cardmarket_product_id": 886425, "match_method": "priced-by-date"}]
    mapper.apply_live_verification(zeilen, str(tmp_path))
    assert zeilen[0]["cardmarket_product_id"] == 886426          # nicht auf die Pin-Nummer gesetzt
    assert zeilen[0]["match_method"] == "priced-by-date"
    assert zeilen[1]["match_method"] == "live-verified"          # andere Zeilen wie bisher


def test_daten_cri_31_traegt_nicht_die_nummer_von_cri_32():
    with open(os.path.join(ROOT, "data", "cardmarket_mapping_verified.csv"), encoding="utf-8-sig") as f:
        zeile = {(r["set"], r["number"]): r for r in csv.DictReader(f)}.get(("CRI", "31"))
    assert zeile is None or not (zeile["status"] == "verified" and zeile["verified_product_id"] == "886424")
