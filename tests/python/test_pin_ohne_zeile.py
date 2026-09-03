"""Ein Pin, der nichts trifft, tut nichts — und sagte es nicht.

ANLASS (03.09.2026). SFA 98 und SFA 99 (Basic Darkness Energy und Basic
Metal Energy, beide Secret Rare, 36,14 und 34,66 EUR) standen auf
"unmapped": der Mapper hatte fuer sie keinen Kandidaten gefunden. Ueber
cardprovs.app liessen sich die Produkte belegen (780993 und 780994,
direkt hinter SFA 97 = 780992), also bekamen beide einen Pin.

Nach dem Lauf standen sie unveraendert auf "unmapped".

URSACHE: apply_manual_overrides() aenderte nur VORHANDENE Zeilen. Fuer
eine Karte ohne Zeile fiel der Pin still unter den Tisch — er stand in
der Datei, sah richtig aus und wirkte nie. Es gab dazu nicht einmal eine
Warnung; die Zusammenfassung sagte nur "20 applied (73 in file)", und
die Differenz erklaerte sich von selbst durch rotierte Karten.

WARUM EIN PIN EINE ZEILE ANLEGEN DARF: er ist die einzige Quelle, bei der
ein Mensch das Produkt wirklich angesehen hat. Findet die Automatik
nichts, ist er nicht weniger wert, sondern mehr. Er darf aber nur fuer
eine Karte anlegen, die es in der Kartendatenbank ueberhaupt gibt — ein
Pin auf eine erfundene Nummer bleibt ein Fehler und wird gemeldet.
"""

import csv
import importlib.util
import io
import logging
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DATA = os.path.join(ROOT, "data")


def _load(name, relpath):
    spec = importlib.util.spec_from_file_location(name, os.path.join(ROOT, relpath))
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


mapper = _load("cm_mapper_pin", "backend/scrapers/cardmarket_id_mapper.py")


def _pin_datei(tmp_path, zeilen):
    p = tmp_path / "cardmarket_mapping_manual.csv"
    with io.open(p, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["set", "number", "cardmarket_product_id",
                                          "source", "note"])
        w.writeheader()
        for z in zeilen:
            w.writerow(z)
    return str(tmp_path)


def test_ein_pin_legt_die_fehlende_zeile_an(tmp_path):
    """Der Fall SFA 98: Karte da, Pin da, Mapper-Zeile fehlt."""
    ordner = _pin_datei(tmp_path, [
        {"set": "SFA", "number": "98", "cardmarket_product_id": "780993",
         "source": "cardprovs", "note": ""},
    ])
    mappings = []          # der Mapper hat nichts gefunden
    karten = [{"set": "SFA", "number": "98", "name_en": "Darkness Energy"}]
    n = mapper.apply_manual_overrides(mappings, ordner, karten)
    assert n == 1, "der Pin wirkte wieder nicht"
    assert len(mappings) == 1, "es wurde keine Zeile angelegt"
    z = mappings[0]
    assert z["cardmarket_product_id"] == 780993
    assert z["match_method"] == "manual-pin"
    assert z["base_name"] == "Darkness Energy", (
        "die angelegte Zeile traegt keinen Namen — sie waere in jeder "
        "Fehlermeldung danach namenlos"
    )


def test_eine_vorhandene_zeile_wird_geaendert_und_nicht_verdoppelt(tmp_path):
    """Der Normalfall darf sich durch die Neuerung nicht aendern."""
    ordner = _pin_datei(tmp_path, [
        {"set": "CRI", "number": "116", "cardmarket_product_id": "886509",
         "source": "ausschluss", "note": ""},
    ])
    mappings = [{"set": "CRI", "number": "116", "cardmarket_product_id": 886515,
                 "match_method": "priced-by-date(4↔4)", "base_name": "Mega Greninja ex"}]
    karten = [{"set": "CRI", "number": "116", "name_en": "Mega Greninja ex"}]
    n = mapper.apply_manual_overrides(mappings, ordner, karten)
    assert n == 1
    assert len(mappings) == 1, "der Pin hat die Zeile verdoppelt statt geaendert"
    assert mappings[0]["cardmarket_product_id"] == 886509
    assert mappings[0]["match_method"] == "manual-pin"


def test_ein_pin_auf_eine_karte_die_es_nicht_gibt_wird_gemeldet(tmp_path, caplog):
    """Report, don't repair: eine erfundene Nummer wird nicht erfuellt.

    Ohne diese Grenze wuerde ein Tippfehler in set oder number stillschweigend
    eine Zeile fuer eine Karte anlegen, die es nicht gibt — und die stuende
    dann in einer veroeffentlichten Datei."""
    ordner = _pin_datei(tmp_path, [
        {"set": "XXX", "number": "999", "cardmarket_product_id": "123456",
         "source": "tippfehler", "note": ""},
    ])
    mappings = []
    karten = [{"set": "SFA", "number": "98", "name_en": "Darkness Energy"}]
    with caplog.at_level(logging.WARNING):
        n = mapper.apply_manual_overrides(mappings, ordner, karten)
    assert n == 0, "ein Pin auf eine nicht existierende Karte wurde erfuellt"
    assert mappings == [], "es wurde eine Zeile fuer eine erfundene Karte angelegt"
    text = " ".join(r.getMessage() for r in caplog.records)
    assert "XXX 999" in text, (
        "der nicht zutreffende Pin wird nicht gemeldet — genau das war der "
        "Fehler: er stand in der Datei, sah richtig aus und wirkte nie"
    )


def test_ohne_kartenliste_bleibt_alles_beim_alten(tmp_path):
    """Rueckwaertsvertraeglich: wer die Karten nicht mitgibt, bekommt das
    alte Verhalten (nur vorhandene Zeilen aendern) und keinen Absturz."""
    ordner = _pin_datei(tmp_path, [
        {"set": "SFA", "number": "98", "cardmarket_product_id": "780993",
         "source": "cardprovs", "note": ""},
    ])
    mappings = []
    n = mapper.apply_manual_overrides(mappings, ordner)
    assert n == 0
    assert mappings == []


def test_die_beiden_energien_stehen_in_der_ausgelieferten_zuordnung():
    """Und zwar wirklich — nicht nur in der Pin-Datei."""
    with open(os.path.join(DATA, "cardmarket_id_mapping.csv"),
              encoding="utf-8-sig", newline="") as f:
        zeilen = {(r["set"], r["number"]): r for r in csv.DictReader(f)}
    for nummer, pid in (("98", "780993"), ("99", "780994")):
        z = zeilen.get(("SFA", nummer))
        assert z, (
            f"SFA {nummer} fehlt weiter in cardmarket_id_mapping.csv — der Pin "
            f"wirkt nicht, und die Karte bleibt ohne belegten Preis"
        )
        assert z["cardmarket_product_id"] == pid
        assert z["match_method"] == "manual-pin"
