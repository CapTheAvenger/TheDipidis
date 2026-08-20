"""Preise: was der Mischer nicht weiss, heisst nicht mehr 'ok'.

Bis zum 20.08.2026 hatte mapping_status genau zwei Werte, und 'ok' war der
stille Vorgabewert eines FEHLENDEN Zuordnungseintrags:

    method = mapping_method.get(key, '')
    mapping_status = 'unverified' if method.startswith('priced-by') else 'ok'

Eine Karte ohne Eintrag liefert '' — das beginnt nicht mit 'priced-by' und
fiel damit in den ok-Zweig. 3.015 Preiszeilen (66.549 EUR, 24,8 % des
Katalogwerts, seit dem 01.04.2026 unberuehrt) trugen dadurch dieselbe
Kennzeichnung wie eine live gepruefte Zuordnung. data/_consumers.md
versprach fuer 'ok' ausdruecklich "unique or live-verified".

Dazu: 100 Produktnummern stehen in je zwei Zeilen. Neun Paare tragen auf
beiden Seiten 'live-verified' — dieselbe Nummer kann nicht zwei
Identitaeten belegen.
"""

import ast
import collections
import csv
import importlib.util
import io
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DATA = os.path.join(ROOT, "data")


def _mapping():
    with io.open(os.path.join(DATA, "cardmarket_id_mapping.csv"),
                 encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def _merger_quelle():
    return io.open(os.path.join(ROOT, "backend", "scrapers",
                                "cardmarket_price_merger.py"),
                   encoding="utf-8-sig").read()


# ---------------------------------------------------------------------------
# Der neue Zweig
# ---------------------------------------------------------------------------

def test_der_stille_ok_zweig_ist_weg():
    quelle = _merger_quelle()
    assert "mapping_status = 'unverified' if method.startswith('priced-by') else 'ok'" \
        not in quelle
    assert "mapping_status = 'unmapped'" in quelle
    assert "mapping_status = 'collision'" in quelle


def test_der_zweig_ist_syntaktisch_gueltig():
    ast.parse(_merger_quelle())


def test_die_einteilung_reproduziert_die_pruefzahlen():
    """Denselben Zweig ueber die echten Dateien laufen lassen."""
    mapping, method = {}, {}
    for m in _mapping():
        key = (m["set"], m["number"])
        mapping[key] = int(m["cardmarket_product_id"])
        method[key] = m.get("match_method", "")
    zaehler = collections.Counter(mapping.values())
    kollidierend = {i for i, n in zaehler.items() if n > 1}

    with io.open(os.path.join(DATA, "all_cards_database.csv"),
                 encoding="utf-8-sig", newline="") as f:
        cards = list(csv.DictReader(f))

    c = collections.Counter()
    for x in cards:
        if not x.get("number"):
            continue
        key = (x["set"], x["number"])
        idp = mapping.get(key)
        mth = method.get(key, "")
        if idp is None:
            c["unmapped"] += 1
        elif idp in kollidierend:
            c["collision"] += 1
        elif mth.startswith("priced-by"):
            c["unverified"] += 1
        else:
            c["ok"] += 1

    # Die Pruefung vom 20.08.2026: 3.015 ohne Zuordnung, 200 Kollisionszeilen.
    assert c["unmapped"] > 1000, c
    assert c["collision"] > 0 and c["collision"] % 2 == 0, c
    assert c["ok"] > c["unmapped"], c
    # Und keine dieser Zeilen faellt mehr in den ok-Topf.
    assert sum(c.values()) == sum(1 for x in cards if x.get("number"))


def test_neun_nummern_sind_doppelt_verifiziert():
    nach_id = collections.defaultdict(list)
    for m in _mapping():
        nach_id[m["cardmarket_product_id"]].append(m)
    beide = [k for k, v in nach_id.items()
             if len(v) > 1 and all(x.get("match_method") == "live-verified" for x in v)]
    assert beide, "keine mehr — Waechter-Pruefung und Kommentare pruefen"
    assert len(beide) <= 20, len(beide)


# ---------------------------------------------------------------------------
# Der Waechter meldet den Widerspruch ohne Grundlinie
# ---------------------------------------------------------------------------

spec = importlib.util.spec_from_file_location(
    "data_guardian_preise", os.path.join(ROOT, "scripts", "data_guardian.py"))
data_guardian = importlib.util.module_from_spec(spec)
sys.modules["data_guardian_preise"] = data_guardian
spec.loader.exec_module(data_guardian)


def test_waechter_meldet_doppelt_verifizierte_nummern():
    findings = []
    data_guardian.check_verified_collisions(findings, {"verified_collisions": ["1", "2"]})
    assert len(findings) == 1
    stufe, text = findings[0]
    assert stufe == "CRITICAL"
    assert "two answers for one product" in text


def test_waechter_schweigt_ohne_widerspruch():
    findings = []
    data_guardian.check_verified_collisions(findings, {"verified_collisions": []})
    data_guardian.check_verified_collisions(findings, {})
    assert findings == []


def test_waechter_findet_sie_in_den_echten_daten():
    kol = data_guardian.price_integrity().get("verified_collisions")
    assert kol, "price_integrity liefert die Kollisionen nicht mehr"


# ---------------------------------------------------------------------------
# Vortagspreise altern nicht mehr gemeinsam mit ihrem Vertrauensflag
# ---------------------------------------------------------------------------

def test_uebernommene_preise_werden_als_stale_gekennzeichnet():
    quelle = io.open(os.path.join(ROOT, "backend", "core", "prepare_card_data.py"),
                     encoding="utf-8-sig").read()
    ast.parse(quelle)
    assert "alt_zeile['price_status'] = 'stale'" in quelle
    # Und die Zahl wird berichtet, nicht verschluckt.
    assert "Preise vom Vortag uebernommen" in quelle
