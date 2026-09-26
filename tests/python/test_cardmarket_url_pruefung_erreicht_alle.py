"""DA-7: die URL-Pruefung erreicht alle positionell zugeordneten Zeilen.

Der Vorschlag vom 22.08.2026 („Mapper auf die gespeicherte Cardmarket-URL
umstellen statt Namensabgleich") ist als Schicht gebaut:
scripts/verify_cardmarket_mapping.py prueft je Druck die Cardmarket-Seite
hinter der Limitless-URL, und apply_live_verification() in
backend/scrapers/cardmarket_id_mapper.py laesst das Ergebnis vor jeder
Positions-Heuristik gewinnen.

Befund 26.09.2026: der woechentliche Lauf lief mit --only-conflicts. Es
gibt 0 Konfliktgruppen mehr, also pruefte er jede Woche nichts — 149
positionell zugeordnete Zeilen (u. a. das ganze Set 30C) waren nie
geprueft, und der Lauf blieb gruen.
"""
import os
import sys

import pytest

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
yaml = pytest.importorskip("yaml")


def _lauf():
    with open(os.path.join(WURZEL, ".github", "workflows", "verify-cardmarket-mapping.yml"),
              encoding="utf-8") as f:
        wf = yaml.safe_load(f)
    for s in wf["jobs"]["verify"]["steps"]:
        if s.get("name") == "Verify mappings against live product pages":
            return wf, s["run"]
    raise AssertionError("Pruefschritt fehlt")


def test_der_zeitplan_prueft_nicht_nur_konfliktgruppen():
    wf, lauf = _lauf()
    # Beim Zeitplan gibt es keine inputs — dann greift der Rueckfall hinter `||`.
    zeile = [z for z in lauf.splitlines() if "only_conflicts" in z and "if [" in z]
    assert zeile, "die Weiche fuer --only-conflicts ist nicht mehr da"
    assert "|| 'false'" in zeile[0], (
        "ohne Eingabe (Zeitplan) laeuft der Lauf wieder nur ueber Konfliktgruppen: " + zeile[0])
    ein = (wf.get("on") or wf.get(True) or {})["workflow_dispatch"]["inputs"]["only_conflicts"]
    assert str(ein.get("default")) == "false"


def test_ohne_konfliktfilter_sind_die_ungeprueften_dabei():
    sys.path.insert(0, os.path.join(WURZEL, "scripts"))
    v = pytest.importorskip("verify_cardmarket_mapping")
    mapping, karten = v.load_rows()
    fertig = v.load_done()
    alle = v.candidate_rows(mapping, karten, False)
    nie = [r for r, _ in alle if (r["set"], r["number"]) not in fertig]
    nur_konflikt = v.candidate_rows(mapping, karten, True)
    assert len(alle) >= len(nur_konflikt)
    if nie:
        # Genau der Befund: was nie geprueft wurde, liegt ausserhalb der
        # Konfliktgruppen und wird nur ohne den Filter erreicht.
        assert len(alle) > len(nur_konflikt), "ungepruefte Zeilen, aber der Filter macht keinen Unterschied"
