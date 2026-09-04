# -*- coding: utf-8 -*-
"""DIE CENT-REGEL DES BETREIBERS, UND WO SIE AUFHOERT

ANLASS (03.09.2026)
-------------------
Vier Zuordnungen lagen bewusst offen — geprueft, aber nicht entschieden.
Auf die Frage, was ich zum Abschliessen brauche, kam die Regel:

    "wenn nur Cent Betraege dann den guenstigeren"

Das ist eine Betreiberentscheidung, keine Messung. Sie steht deshalb in
data/cardmarket_mapping_manual.csv unter der Quelle 'betreiber-regel-cent'
und nicht als stille Reparatur in der gebauten Zuordnung.

WAS DIE REGEL ENTSCHIEDEN HAT
-----------------------------
PRE 96-99 sind VIER Drucke DERSELBEN Karte ("Black Belt's Training"), und
Cardmarket fuehrt in Erweiterung 5944 genau vier Produkte dieses Namens.
Kein Merkmal in unseren Daten trennt sie; die Preisspanne betraegt 3 Cent.
Vorher stand PRE 99 auf derselben Produkt-ID wie PRE 97 (805491) — eine ID
fuer zwei Karten, genau der Fehler, den dieses Projekt seit Wochen
abarbeitet. Jetzt liegt eine Bijektion fest: drei der vier bisherigen
Zuordnungen bleiben, nur PRE 99 wandert auf die freie 805490.

WAS DIE REGEL NICHT ENTSCHIEDEN HAT
-----------------------------------
MEP 4 (Lunastein) hat zwei Kandidaten, 851049 und 851050 — aber sie liegen
rund 1,40 EUR auseinander, nicht Cent. Die Regel greift dort nicht, und
raten waere hier teurer als die gemeldete Luecke. MEP 4 bleibt offen.

WAS OHNE DIE REGEL ENTSCHIEDEN WURDE
------------------------------------
MEP 83 (Slowbro) lag offen, weil cardprovs.app dort die 363685 nennt.
Diese Quelle irrt nachweislich: 363685 heisst "Aurorus EX" und liegt in
Erweiterung 1612, waehrend MEP in 6232 liegt. Ein Widerspruch aus einer
Quelle, die eine andere Karte aus einer anderen Erweiterung nennt, ist
kein Widerspruch — dafuer brauchte es keine Cent-Regel.

WAS HIER GEPRUEFT WIRD
----------------------
Nicht nur, dass die Pins dastehen, sondern die PRAEMISSEN, auf denen sie
ruhen. Waechst die Preisspanne der vier PRE-Produkte, oder faellt die der
beiden MEP-4-Kandidaten in den Centbereich, dann stimmt die Begruendung
nicht mehr und jemand muss noch einmal hinsehen. Genau das melden die
Zusicherungen unten.
"""

import csv
import io
import json
import os

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
DATEN = os.path.join(WURZEL, "data")

PINS = os.path.join(DATEN, "cardmarket_mapping_manual.csv")
ZUORDNUNG = os.path.join(DATEN, "cardmarket_id_mapping.csv")
PRODUKTE = os.path.join(DATEN, "products_singles_6.json")
PREISE = os.path.join(DATEN, "price_guide_6.json")

# Die Erweiterung, in der die vier PRE-Drucke liegen, und die von MEP.
EXP_PRE = 5944
EXP_MEP = 6232

# Die Spanne, bis zu der der Betreiber "nur Cent Betraege" gesagt hat.
# Grosszuegig gesetzt: gemessen waren es 3 Cent (0,02 bis 0,05).
CENT_GRENZE = 0.10


def _lies(pfad):
    with io.open(pfad, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


@pytest.fixture(scope="module")
def pins():
    return {(r["set"].strip().upper(), r["number"].strip()): r
            for r in _lies(PINS)}


@pytest.fixture(scope="module")
def produkte():
    with io.open(PRODUKTE, encoding="utf-8") as f:
        return {p["idProduct"]: p for p in json.load(f)["products"]}


@pytest.fixture(scope="module")
def preise():
    with io.open(PREISE, encoding="utf-8") as f:
        return {g["idProduct"]: g for g in json.load(f)["priceGuides"]}


def _preis(eintrag):
    """Der belastbarste Wert, den der Preisfuehrer je Produkt fuehrt.

    trend zuerst, sonst avg30, sonst avg. Ein Produkt ohne jeden Wert
    liefert None — das ist selbst ein Befund (siehe MEP 83).
    """
    for feld in ("trend", "avg30", "avg"):
        wert = (eintrag or {}).get(feld)
        if wert:
            return float(wert)
    return None


# ── Die vier PRE-Drucke ────────────────────────────────────────────────

PRE_NUMMERN = ["96", "97", "98", "99"]


def test_alle_vier_pre_drucke_sind_gepinnt(pins):
    fehlend = [n for n in PRE_NUMMERN if ("PRE", n) not in pins]
    assert not fehlend, (
        f"PRE {', '.join(fehlend)} ist nicht gepinnt. Ohne Pin mischt die "
        f"Positionsheuristik die vier gleichnamigen Produkte bei jedem Lauf "
        f"neu, und die Doppelbelegung PRE 97/PRE 99 kommt zurueck")


def test_die_vier_pins_sind_eine_bijektion(pins):
    """Vier Karten, vier Produkte, keine ID zweimal.

    Das ist der eigentliche Gewinn. Vorher trugen PRE 97 und PRE 99
    beide die 805491, waehrend die 805490 unbenutzt danebenlag.
    """
    ids = [pins[("PRE", n)]["cardmarket_product_id"].strip() for n in PRE_NUMMERN]
    assert len(set(ids)) == 4, (
        f"die vier PRE-Pins belegen nur {len(set(ids))} verschiedene "
        f"Produkte: {dict(zip(PRE_NUMMERN, ids))} — eine ID fuer zwei Karten "
        f"ist genau der Befund, den diese Pins beheben sollten")


def test_die_vier_produkte_sind_dieselbe_karte_in_derselben_erweiterung(pins, produkte):
    namen, erweiterungen = set(), set()
    for n in PRE_NUMMERN:
        pid = int(pins[("PRE", n)]["cardmarket_product_id"])
        p = produkte.get(pid)
        assert p, f"PRE {n} ist auf Produkt {pid} gepinnt, das es nicht gibt"
        namen.add(p["name"])
        erweiterungen.add(p["idExpansion"])
    assert namen == {"Black Belt's Training"}, (
        f"die vier Pins zeigen nicht mehr auf dieselbe Karte: {sorted(namen)} — "
        f"dann war die Annahme falsch, dass hier vier Drucke EINER Karte "
        f"nebeneinanderliegen, und die Bijektion ist willkuerlich")
    assert erweiterungen == {EXP_PRE}, (
        f"die vier Pins liegen nicht mehr alle in Erweiterung {EXP_PRE}: "
        f"{sorted(erweiterungen)}")


def test_die_praemisse_haelt_die_spanne_bleibt_im_centbereich(pins, produkte, preise):
    """Die Regel des Betreibers gilt fuer Cent-Unterschiede.

    Waechst die Spanne zwischen den vier Produkten, ist die Begruendung
    hinfaellig — dann entscheidet die Zuordnung wieder ueber Geld, das man
    merkt, und jemand muss hinsehen statt sich auf den Pin zu verlassen.
    """
    werte = {}
    for n in PRE_NUMMERN:
        pid = int(pins[("PRE", n)]["cardmarket_product_id"])
        werte[n] = _preis(preise.get(pid))
    fehlend = [n for n, v in werte.items() if v is None]
    assert not fehlend, f"kein Preis fuer PRE {', '.join(fehlend)}"
    spanne = max(werte.values()) - min(werte.values())
    assert spanne <= CENT_GRENZE, (
        f"die vier Kandidaten liegen inzwischen {spanne:.2f} EUR auseinander "
        f"({werte}). Die Betreiberregel 'wenn nur Cent Betraege dann den "
        f"guenstigeren' hat diese Zuordnung getragen, solange es Cent waren — "
        f"jetzt nicht mehr")


def test_die_pins_tragen_die_quelle_der_entscheidung(pins):
    """Eine Entscheidung ohne ihren Grund ist eine Behauptung."""
    for n in PRE_NUMMERN:
        quelle = pins[("PRE", n)]["source"].strip()
        assert quelle == "betreiber-regel-cent", (
            f"PRE {n} traegt die Quelle {quelle!r}. Diese vier Zuordnungen "
            f"sind NICHT gemessen, sondern nach einer Betreiberregel gesetzt; "
            f"eine Quelle, die das verschweigt, laesst sie belegt aussehen")
        assert "Cent" in pins[("PRE", n)]["note"], (
            f"die Begruendung von PRE {n} nennt die Regel nicht mehr")


def test_die_gebaute_zuordnung_hat_die_pins_uebernommen():
    """Der Pin wirkt erst, wenn der Mapper gelaufen ist.

    Stuende hier noch priced-by-date, waere die Entscheidung getroffen und
    nicht angekommen — und die Doppelbelegung bestuende weiter.
    """
    zeilen = {(r["set"].strip().upper(), r["number"].strip()): r
              for r in _lies(ZUORDNUNG)}
    for n in PRE_NUMMERN:
        r = zeilen.get(("PRE", n))
        assert r, f"PRE {n} steht nicht in der gebauten Zuordnung"
        assert r["match_method"].strip() == "manual-pin", (
            f"PRE {n} steht in cardmarket_id_mapping.csv auf "
            f"{r['match_method']!r} statt auf manual-pin — der Pin ist "
            f"geschrieben, aber nicht angewandt. "
            f"Neu bauen: python backend/scrapers/cardmarket_id_mapper.py")
    ids = [zeilen[("PRE", n)]["cardmarket_product_id"].strip() for n in PRE_NUMMERN]
    assert len(set(ids)) == 4, (
        f"in der gebauten Zuordnung teilen sich zwei PRE-Karten ein Produkt: "
        f"{dict(zip(PRE_NUMMERN, ids))}")


# ── MEP 83: die Quelle war widerlegt, nicht knapp ──────────────────────

def test_mep_83_ist_gepinnt_und_nennt_den_widerlegten_widerspruch(pins):
    r = pins.get(("MEP", "83"))
    assert r, ("MEP 83 ist nicht mehr gepinnt. Ohne Pin lebt der Streit mit "
               "cardprovs.app wieder auf, obwohl er entschieden ist")
    assert r["cardmarket_product_id"].strip() == "894262"
    assert "363685" in r["note"], (
        "die Begruendung nennt die widerlegte ID nicht mehr — dann steht da "
        "eine Entscheidung ohne den Grund, aus dem sie getroffen wurde")


def test_die_widerlegung_von_cardprovs_haelt(produkte):
    """Der Beleg selbst, nicht die Behauptung ueber ihn.

    cardprovs nennt fuer MEP 83 die 363685. Das ist eine ANDERE Karte in
    einer ANDEREN Erweiterung — pruefbar in unserem eigenen Produktabzug.
    Sollte sich das je aendern, faellt die Begruendung des Pins.
    """
    p = produkte.get(363685)
    assert p, "Produkt 363685 steht nicht mehr im Produktabzug"
    assert not p["name"].startswith("Slowbro"), (
        f"363685 heisst inzwischen {p['name']!r} — die Quelle koennte doch "
        f"recht haben, und der Pin auf 894262 gehoert neu geprueft")
    assert p["idExpansion"] != EXP_MEP, (
        f"363685 liegt inzwischen in der MEP-Erweiterung {EXP_MEP} — "
        f"dieselbe Konsequenz")


def test_der_zweite_slowbro_traegt_weiterhin_keinen_preis(produkte, preise):
    """Warum 894262 und nicht 903006.

    Beide heissen "Slowbro" und liegen in 6232. 903006 fuehrt im
    Preisfuehrer keinen einzigen Wert — kein Verkauf, keine Grundlage.
    Bekommt es je einen, ist die Wahl wieder offen.
    """
    assert produkte.get(903006), "Produkt 903006 ist aus dem Abzug verschwunden"
    assert _preis(preise.get(903006)) is None, (
        "903006 fuehrt inzwischen einen Preis. Damit gibt es zwei "
        "bepreiste Slowbro-Produkte in Erweiterung 6232, und die "
        "Begruendung des Pins auf 894262 ('das einzige mit Preis') "
        "traegt nicht mehr")


# ── MEP 4: die Regel greift NICHT, und das ist der Punkt ───────────────

def test_mep_4_bleibt_bewusst_ungepinnt(pins):
    assert ("MEP", "4") not in pins, (
        "MEP 4 ist gepinnt. Die Cent-Regel deckt diesen Fall NICHT — die "
        "beiden Lunastein-Produkte liegen rund 1,40 EUR auseinander. Ein Pin "
        "hier waere geraten, nicht entschieden")


def test_die_beiden_mep_4_kandidaten_liegen_weiterhin_ueber_dem_centbereich(produkte, preise):
    """Die Gegenprobe zur Aussage oben.

    Faellt die Spanne der beiden Kandidaten je in den Centbereich, dann
    GILT die Betreiberregel auch hier, und MEP 4 gehoert entschieden statt
    offengelassen. Dieser Test macht aus 'bleibt offen' eine pruefbare
    Aussage statt einer Gewohnheit.
    """
    kandidaten = [pid for pid, p in produkte.items()
                  if p["idExpansion"] == EXP_MEP and p["name"].startswith("Lunatone")]
    assert len(kandidaten) == 2, (
        f"in Erweiterung {EXP_MEP} stehen {len(kandidaten)} Lunatone-Produkte "
        f"({sorted(kandidaten)}) statt zwei — die Lage hat sich geaendert")
    werte = [_preis(preise.get(pid)) for pid in kandidaten]
    assert all(w is not None for w in werte), \
        f"ein Lunatone-Kandidat hat keinen Preis mehr: {dict(zip(kandidaten, werte))}"
    spanne = max(werte) - min(werte)
    assert spanne > CENT_GRENZE, (
        f"die beiden MEP-4-Kandidaten liegen nur noch {spanne:.2f} EUR "
        f"auseinander ({dict(zip(kandidaten, werte))}). Damit greift die "
        f"Betreiberregel 'bei Cent-Betraegen den guenstigeren', und MEP 4 "
        f"sollte auf den guenstigeren gepinnt werden statt offenzubleiben")
