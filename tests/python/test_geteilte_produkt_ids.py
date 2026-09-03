"""Zwei Karten auf einer Produkt-ID — und wann das ein Fehler ist.

ANLASS (03.09.2026). Der Betreiber schickte zwei Seiten von cardprovs.app:
TWM 25 und TWM 190, dieselbe Karte in zwei Drucken. Cardprovs nennt fuer die
eine 769199, fuer die andere 769364. Unsere Datei fuehrte BEIDE auf 769199.

Die Nachrechnung zeigte, dass das kein Einzelfall war: 93 Produkt-IDs waren
an 186 Karten vergeben. `check_verified_collisions()` sah davon nichts — sie
faengt nur den Fall, dass BEIDE Zeilen 'live-verified' sind, und 82 der 93
Faelle pa aren eine bestaetigte mit einer geratenen Zeile.

DER TEURE FALL: CRI 116 (Special Art Rare) und CRI 122 (Secret Rare) trugen
beide 886515 und zeigten beide 135,45 EUR. Cardmarket fuehrt fuer Mega
Greninja ex in CRI vier Produkte; drei waren bestaetigt, 886509 (169,10 EUR)
lag unbenutzt daneben. Ein Fehler von 34 EUR auf einer teuren Karte.

NICHT JEDE TEILUNG IST EINE. Fuer Paldean Tauros (SSP 18/39), Chikorita
(MEP 46/69) und Deoxys (CRI 32/34) fuehrt Cardmarket unter der Metacard nur
EIN Produkt. Dort ist die gemeinsame ID die richtige Antwort, und eine
Meldung darueber waere Laerm. 55 der 93 Faelle sind von dieser Sorte — eine
Pruefung, die sie mitmeldet, wird zu Recht ueberblaettert.
"""

import csv
import importlib.util
import json
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


guardian = _load("dg_geteilt", "scripts/data_guardian.py")


def _befunde():
    f = []
    guardian.check_geteilte_produkt_ids(f)
    return f


def _text(stufe):
    return " ".join(m for s, m in _befunde() if s == stufe)


# ── Die Pruefung laeuft ueberhaupt und sieht die drei Klassen ────────────

def test_die_pruefung_meldet_etwas():
    """Ohne Befunde koennte sie auch kaputt sein und niemand saehe es."""
    assert _befunde(), (
        "check_geteilte_produkt_ids liefert gar nichts — bei 93 geteilten "
        "IDs in der Datei kann das nicht stimmen"
    )


def test_unteilbare_faelle_werden_nicht_als_fehler_gemeldet():
    """SSP 18/39 & Co.: Cardmarket fuehrt dort nur EIN Produkt."""
    info = _text("INFO")
    assert "KEIN Fehler" in info, (
        "die Faelle, in denen Cardmarket weniger Produkte fuehrt als wir "
        "Kartennummern haben, werden nicht mehr als unproblematisch "
        "ausgewiesen — dann steht ein Drittel Laerm in der harten Meldung"
    )
    hart = _text("CRITICAL") + _text("WARN")
    for karte in ("SSP 18", "MEP 46", "CRI 32"):
        assert karte not in hart, (
            f"{karte} wird wieder als Fehler gemeldet, obwohl Cardmarket "
            f"unter der Metacard nur ein Produkt fuehrt"
        )


def test_rotierte_sets_werden_leiser_gemeldet():
    """Eine falsche Zuordnung an einer nicht mehr legalen Karte kostet
    niemanden etwas — dieselbe Trennung wie in report_unverified_prices."""
    warn = _text("WARN")
    assert "rotierte Sets" in warn, (
        "die Trennung nach Formatfenster ist weg; dann steht die Meldung "
        "wieder zu 90 Prozent aus Irrelevantem"
    )


# ── Die Datenlage, um derentwillen es die Pruefung gibt ─────────────────

def _mapping():
    with open(os.path.join(DATA, "cardmarket_id_mapping.csv"),
              encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def _pins():
    with open(os.path.join(DATA, "cardmarket_mapping_manual.csv"),
              encoding="utf-8-sig", newline="") as f:
        return {((r["set"] or "").strip().upper(), (r["number"] or "").strip()):
                (r["cardmarket_product_id"] or "").strip()
                for r in csv.DictReader(f)}


def test_die_beiden_teuren_faelle_sind_gepinnt():
    """TWM 190 und CRI 116 — die zwei, fuer die es einen Beleg gibt.

    TWM 190: cardprovs.app nennt 769364, UND es ist das einzige Produkt der
    Metacard 433705, das nach 25/211/221 uebrig bleibt. Zwei unabhaengige
    Wege, dieselbe Zahl.

    CRI 116: kein cardprovs-Beleg, aber ein vollstaendiger Ausschluss —
    vier Kartennummern, vier Produkte, drei live-verified.
    """
    pins = _pins()
    assert pins.get(("TWM", "190")) == "769364", (
        "der Pin fuer TWM 190 fehlt oder zeigt woandershin — die Karte "
        "trug die ID von TWM 25 und damit deren Preis"
    )
    assert pins.get(("CRI", "116")) == "886509", (
        "der Pin fuer CRI 116 fehlt — die Karte zeigte 135,45 EUR statt "
        "169,10 EUR, weil sie auf der ID von CRI 122 stand"
    )


def test_die_gepinnten_produkte_gibt_es_wirklich():
    """Ein Pin auf eine Produkt-ID, die es nicht gibt, ist schlimmer als
    keiner: er sieht bestaetigt aus und liefert keinen Preis."""
    with open(os.path.join(DATA, "products_singles_6.json"), encoding="utf-8") as f:
        roh = json.load(f)
    produkte = roh.get("products") if isinstance(roh, dict) else roh
    nach_id = {p["idProduct"]: p for p in produkte}
    for pid, erwartete_expansion in ((769364, 769199), (886509, 886515)):
        assert pid in nach_id, f"Produkt {pid} steht nicht im Katalog"
        # Und es gehoert zur GLEICHEN Erweiterung und Metacard wie die
        # bestaetigte Nachbarkarte — sonst ist es die Karte eines anderen.
        a, b = nach_id[pid], nach_id[erwartete_expansion]
        assert a["idExpansion"] == b["idExpansion"], (
            f"Produkt {pid} liegt in einer anderen Erweiterung als "
            f"{erwartete_expansion}"
        )
        assert a["idMetacard"] == b["idMetacard"], (
            f"Produkt {pid} gehoert zu einer anderen Karte als "
            f"{erwartete_expansion} — der Pin waere dann falsch"
        )


def test_der_pin_ist_angekommen():
    """Die beiden Karten teilen ihre Produkt-ID nicht mehr.

    DIESE ZUSICHERUNG STAND BIS ZUM 03.09.2026 ANDERSHERUM da und war
    damit falsch gebaut: sie verlangte die Meldung "bereits von Hand
    entschieden". Die gibt es aber nur im ZWISCHENZUSTAND — zwischen dem
    Pin und dem naechsten Lauf von cardmarket_id_mapper.py. Kaum lief der
    Mapper, war die Meldung weg und der Test rot, obwohl genau das
    passiert war, was passieren sollte. Eine Zusicherung auf einen
    voruebergehenden Zustand ist keine.

    Geprueft wird jetzt das Ergebnis: die ausgelieferte Zuordnung gibt
    jeder der beiden Karten eine eigene ID.
    """
    zeilen = {(r["set"], r["number"]): r for r in _mapping()}
    for karte, nachbar in ((("CRI", "116"), ("CRI", "122")),
                           (("TWM", "190"), ("TWM", "25"))):
        a = zeilen.get(karte)
        b = zeilen.get(nachbar)
        assert a and b, f"{karte} oder {nachbar} fehlt in der Zuordnung"
        assert a["cardmarket_product_id"] != b["cardmarket_product_id"], (
            f"{karte[0]} {karte[1]} traegt wieder dieselbe Produkt-ID wie "
            f"{nachbar[0]} {nachbar[1]} ({a['cardmarket_product_id']}) — "
            f"beide zeigen dann denselben Preis, und einer ist falsch"
        )
        assert a["match_method"] == "manual-pin", (
            f"{karte[0]} {karte[1]} steht wieder auf "
            f"'{a['match_method']}' statt auf dem Pin"
        )
    assert "CRI 116" not in _text("CRITICAL") + _text("WARN"), (
        "CRI 116 wird weiter als Doppelbelegung gemeldet, obwohl der Pin "
        "in der Zuordnung angekommen ist"
    )


def test_ein_frischer_pin_wird_als_beantwortet_erkannt():
    """Zwischen einem Pin und dem naechsten Mapperlauf steht die
    Doppelbelegung weiter in der ausgelieferten Datei. Sie zu verschweigen
    waere falsch, sie unveraendert als CRITICAL zu melden auch — genauso
    trennt es check_verified_collisions() daneben.

    Hier steht nur, dass es diesen Zweig GIBT; ob er gerade feuert, haengt
    daran, ob zufaellig ein frischer Pin offen ist, und darauf darf keine
    Zusicherung bauen."""
    with open(os.path.join(ROOT, "scripts", "data_guardian.py"),
              encoding="utf-8") as f:
        quelle = f.read()
    rumpf = quelle.split("def check_geteilte_produkt_ids", 1)[1] \
                  .split("\ndef ", 1)[0]
    assert "_gepinnte_karten()" in rumpf, (
        "die Pruefung sieht die Handpins nicht mehr an — ein frisch "
        "gepinnter Fall wuerde bis zum naechsten Mapperlauf als CRITICAL "
        "gemeldet, obwohl er beantwortet ist"
    )
    assert "bereits von Hand entschieden" in rumpf, (
        "der Zweig fuer beantwortete Doppelbelegungen ist weg"
    )


def test_centbetraege_sind_nicht_dringend():
    """PRE 97/99 unterscheiden sich um 0,03 EUR, CRI 116/122 um 34 EUR.
    Beides als CRITICAL zu melden verwaessert die Dringlichkeit des
    zweiten — dieselbe Hausregel wie gegen absolute Schwellen."""
    assert "PRE 97" not in _text("CRITICAL"), (
        "eine Doppelbelegung im Centbereich wird wieder als CRITICAL "
        "gemeldet"
    )
    assert "PRE 97" in _text("WARN"), (
        "PRE 97/99 wird gar nicht mehr gemeldet — richtig ist es trotzdem "
        "nicht, nur nicht dringend"
    )


def test_die_pruefung_haengt_im_lauf():
    """Eine Pruefung, die main() nicht aufruft, ist eine Datei."""
    with open(os.path.join(ROOT, "scripts", "data_guardian.py"),
              encoding="utf-8") as f:
        quelle = f.read()
    ohne_def = quelle.split("def check_geteilte_produkt_ids", 1)[1]
    assert "check_geteilte_produkt_ids(findings)" in ohne_def, (
        "check_geteilte_produkt_ids wird nirgends aufgerufen"
    )
