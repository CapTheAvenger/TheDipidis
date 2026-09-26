"""DA-4: jedes Set mit hinterlegtem Datum hat auch eine Ordnungszahl.

Befund (Wochenlaeufe bis 26.09.2026): M6A und MF standen mit
Erscheinungsdatum, aber ohne Ordnungszahl da und wurden jede Woche
gemeldet. Ein Set ohne Ordnungszahl liest der Chunker als 0 — seine
Karten landen im Altbestand, der Deckbauer findet sie nicht.
"""
import json
import os
import sys

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(WURZEL, "backend", "core"))

import update_sets as us  # noqa: E402


def _json(name):
    with open(os.path.join(WURZEL, "data", name), encoding="utf-8") as f:
        return json.load(f)


def test_jedes_datierte_rueckfall_set_hat_eine_ordnung():
    datiert = set(us.FALLBACK_RELEASE_DATES) | set(us.FALLBACK_JP_RELEASE_DATES)
    ohne = sorted(c for c in datiert
                  if c not in us.FALLBACK_SET_ORDER and c.upper() not in us.INTENTIONALLY_UNORDERED_SETS)
    assert not ohne, f"Datum, aber keine Ordnungszahl im Rueckfall: {ohne}"


def test_m6a_und_mf_stimmen_in_allen_drei_quellen():
    sets = _json("sets.json")
    meta = _json("sets_metadata.json")
    for code in ("M6A", "MF"):
        assert us.FALLBACK_SET_ORDER.get(code) == sets.get(code) == (meta.get(code) or {}).get("order"), code
        assert (meta.get(code) or {}).get("release_date") == "2026-09-16", code


def test_der_nachtrag_haette_dieselben_zahlen_vergeben():
    """Gegenprobe zur Wahl der Zahlen: ohne die beiden Eintraege, aber mit
    einem Datum NACH 30C, stapelt backfill_order_from_release_dates() sie
    genau so oben auf."""
    ordnung = {k: v for k, v in us.FALLBACK_SET_ORDER.items() if k not in ("M6A", "MF")}
    daten = {"M6A": "2026-09-17", "MF": "2026-09-17"}
    us.backfill_order_from_release_dates(ordnung, daten, {})
    assert (ordnung.get("M6A"), ordnung.get("MF")) == (159, 160)
