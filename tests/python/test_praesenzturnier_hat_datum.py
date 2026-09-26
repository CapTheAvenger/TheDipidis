"""DA-3: ein Praesenzturnier hat ein Datum.

Regel Hausi (26.09.2026): ein Praesenzturnier (Regional, SPE,
International, Worlds) muss ein Datum haben — fehlt es, wird es
nachgetragen. Bei einem Online-Turnier ist es egal.

Befund: 96 Zeilen (Labs 0019 Special Event San Juan, 0042 Regional
Brisbane) lagen seit dem 25.05.2026 datumslos in
labs_tournament_decks__unsorted.csv. Nachgetragen aus der Quelle
(labs.limitlesstcg.com/<id>/decks, gemessen 26.09.2026) und in
data/labs_tournament_id_overrides.json hinterlegt, damit der naechste
Lauf das Datum nicht wieder verliert.
"""
import csv
import os
import sys

import pytest

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATEN = os.path.join(WURZEL, "data")
PRAESENZ = {"regional", "special", "international", "worlds"}


def _zeilen(name):
    with open(os.path.join(DATEN, name), encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def test_jedes_praesenzturnier_hat_ein_datum():
    ohne = sorted({(z["tournament_id"], z["tournament_name"])
                   for z in _zeilen("labs_tournament_decks.csv")
                   if (z.get("tournament_type") or "").strip().lower() in PRAESENZ
                   and not (z.get("tournament_date") or "").strip()})
    assert not ohne, f"Praesenzturniere ohne Datum: {ohne}"


def test_nichts_praesenzturnier_liegt_unsortiert():
    pfad = os.path.join(DATEN, "labs_tournament_decks__unsorted.csv")
    if not os.path.exists(pfad):
        return
    rest = [z for z in _zeilen("labs_tournament_decks__unsorted.csv")
            if (z.get("tournament_type") or "").strip().lower() in PRAESENZ]
    assert not rest, f"{len(rest)} Zeilen eines Praesenzturniers liegen unsortiert"


def test_die_nachtraege_sind_hinterlegt_und_werden_gelesen():
    sys.path.insert(0, os.path.join(WURZEL, "backend", "scrapers"))
    sys.path.insert(0, os.path.join(WURZEL, "backend", "core"))
    labs = pytest.importorskip("labs_tournament_scraper")
    labs._DATUM_OVERRIDES_CACHE = None
    ov = labs._labs_datum_overrides()
    assert ov.get("0019") == "2025-02-15"
    assert ov.get("0042") == "2025-11-01"
    # und die Daten stehen dort, wo das Datum das Format bestimmt
    for tid, meta in (("0019", "BRS-PRE"), ("0042", "SVI-MEG")):
        zeilen = [z for z in _zeilen(f"labs_tournament_decks_{meta}.csv") if z["tournament_id"] == tid]
        assert zeilen and all(z["tournament_date"] == ov[tid] for z in zeilen), (tid, meta)
        assert labs._derive_meta_from_date(ov[tid]) == meta
