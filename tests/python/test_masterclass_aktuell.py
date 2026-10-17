# -*- coding: utf-8 -*-
"""Block „Aktuelle Daten“ fuer jede Masterclass (scripts/masterclass_aktuell.py).

BESTELLUNG (Hausi, 17.10.2026): jede Masterclass — gekauft oder aus Videos
gebaut — immer mit aktuellen Daten, Online UND vor Ort nebeneinander.

Geprueft wird am Erzeuger selbst, gegen die Rohdaten nachgerechnet.
"""
import csv
import json
import os
import sys

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
sys.path.insert(0, os.path.join(WURZEL, "scripts"))

import masterclass_aktuell as A  # noqa: E402

csv.field_size_limit(10 ** 9)
BLOECKE = A.baue()


def test_jede_masterclass_hat_einen_block_und_eine_datei():
    assert set(BLOECKE) == set(A.DECKS), sorted(BLOECKE)
    for gid in A.DECKS:
        with open(os.path.join(WURZEL, "data", "masterclass_live", gid + ".json"), encoding="utf-8") as f:
            d = json.load(f)
        assert d.get("aktuell", {}).get("deck") == A.DECKS[gid], gid


def test_vor_ort_ist_die_summe_der_regionals():
    """Gegen labs_tournament_decks.csv nachgerechnet, unabhaengig vom Erzeuger."""
    for gid, slug in A.DECKS.items():
        b = BLOECKE[gid]["vor_ort"]
        zeilen = [r for r in csv.DictReader(open(A.LABS_DECKS, encoding="utf-8-sig"))
                  if r["deck_slug"] == slug and r["meta"].replace("-", "–") == b["format"]]
        assert len(zeilen) == len(b["turniere"]), gid
        assert b["summe"]["decks"] == sum(int(r["player_count"]) for r in zeilen), gid
        assert b["summe"]["bilanz"][0] == sum(int(r["wins"]) for r in zeilen), gid


def test_online_bilanz_gegen_die_rohdaten():
    lauf = A.online(A.laufendes_format())["format"]   # nach einem Setwechsel ggf. das juengste Format
    for gid, slug in A.DECKS.items():
        s = sum(int(r["wins"]) for r in csv.DictReader(open(A.ONLINE_ARCH, encoding="utf-8-sig"), delimiter=";")
                if r["meta"] == lauf and r["archetype_id"] == slug)
        assert BLOECKE[gid]["online"]["bilanz"][0] == s, gid


def test_gegner_tragen_online_und_vor_ort():
    for gid, b in BLOECKE.items():
        assert len(b["gegner"]) >= 10, gid
        assert all(g["slug"] != b["deck"] and g["slug"] != "other" for g in b["gegner"]), gid
        beide = [g for g in b["gegner"] if sum(g["online"]) and sum(g["vor_ort"])]
        assert len(beide) >= 10, "%s: nur %d Gegner mit beiden Quellen" % (gid, len(beide))


def test_listen_sind_ganze_decks():
    for gid, b in BLOECKE.items():
        for l in b["listen_vor_ort"] + ([b["liste_online"]] if b["liste_online"] else []):
            assert sum(k[0] for k in l["karten"]) == 60, (gid, l.get("spieler"))


def test_verfaelschung_falscher_slug_faellt_auf():
    """VERFAELSCHUNGSPROBE: ein Deck ohne Daten erzeugt keinen Block."""
    leer = A.baue({"probe": "gibt-es-nicht-xyz"})
    assert leer == {}


def test_setwechsel_ohne_online_turniere_haelt_nichts_an(tmp_path, monkeypatch):
    """Erstes neues Set: format_window nennt ein Format ohne Online-Zeilen.
    Der Block nimmt das juengste vorhandene Format statt abzubrechen
    (sonst wird der Wochenlauf rot)."""
    fw = json.load(open(os.path.join(WURZEL, "data", "format_window.json"), encoding="utf-8"))
    fw["current_set"] = "ZZZ"
    p = tmp_path / "format_window.json"
    p.write_text(json.dumps(fw), encoding="utf-8")
    echt = A.laufendes_format
    monkeypatch.setattr(A, "laufendes_format", lambda pfad=None: echt(str(p)))
    b = A.baue()
    assert set(b) == set(A.DECKS)
    assert all(x["online"]["format"] != "TEF\u2013ZZZ" for x in b.values())
