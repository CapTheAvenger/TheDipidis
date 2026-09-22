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


def _hat_handelsgeschichte(eintrag):
    """Traegt dieser Preiseintrag einen MARKT oder ein einzelnes Angebot?

    Ein Produkt, das nie gehandelt wurde, aber gelistet ist, bekommt bei
    Cardmarket den Listenpreis in jedes Durchschnittsfeld geschrieben:
    avg = avg1 = avg7 = avg30 = trend, und `low` bleibt leer. Ein
    Produkt mit echten Verkaeufen hat ein `low` und Durchschnitte, die
    sich ueber die Zeitraeume unterscheiden.

    Der Unterschied ist genau der, auf den es beim Pin ankommt — nicht
    "hat einen Preis", sondern "hat eine Preisgrundlage".
    """
    if not eintrag:
        return False
    if eintrag.get("low") in (None, ""):
        return False
    reihe = [eintrag.get(f) for f in ("avg", "avg1", "avg7", "avg30")]
    if any(w in (None, "") for w in reihe):
        return False
    return len({round(float(w), 2) for w in reihe}) > 1


def test_der_pin_zeigt_auf_das_produkt_mit_der_belastbaren_preisgrundlage(produkte, preise):
    """Warum 894262 und nicht 903006.

    HIER STAND BIS ZUM 22.09.2026 `_preis(preise.get(903006)) is None`
    — "903006 fuehrt keinen einzigen Wert". Das war am 03.09.2026 wahr.
    Am 22.09.2026 stand dort avg 125,00 EUR, die Zusicherung fiel um,
    und die Deploy-Kette stand.

    Die Entscheidung war trotzdem unveraendert richtig. Falsch war ihre
    BEGRUENDUNG: "das einzige mit Preis" ist eine Aussage ueber einen
    Tagesstand des Preisfuehrers, nicht ueber die Produkte. Gemessen am
    22.09.2026:

        894262  low 5,99 · avg1 18,00 · avg7 17,52 · avg30 16,52
        903006  low —    · avg1 = avg7 = avg30 = trend = 125,00

    Das eine hat einen Markt, das andere ein einzelnes Angebot. Genau
    das wird jetzt geprueft — und die Tripwire bleibt scharf: bekommt
    903006 je eine echte Handelsgeschichte, gibt es zwei belastbare
    Kandidaten und die Wahl gehoert neu entschieden.
    """
    assert produkte.get(903006), "Produkt 903006 ist aus dem Abzug verschwunden"
    assert _hat_handelsgeschichte(preise.get(894262)), (
        "894262 traegt keine belastbare Preisgrundlage mehr — dann traegt der "
        "Pin seine Begruendung nicht mehr und gehoert neu geprueft")
    assert not _hat_handelsgeschichte(preise.get(903006)), (
        "903006 traegt inzwischen eine echte Handelsgeschichte (low gesetzt und "
        "unterschiedliche Durchschnitte). Damit gibt es zwei belastbare "
        "Slowbro-Produkte in Erweiterung 6232, und die Wahl zwischen ihnen "
        "gehoert neu entschieden — nicht weitergeschrieben")


# ── MEP 4: die Regel greift NICHT, und das ist der Punkt ───────────────

def test_mep_4_bleibt_bewusst_ungepinnt(pins):
    assert ("MEP", "4") not in pins, (
        "MEP 4 ist gepinnt. Die Cent-Regel deckt diesen Fall NICHT — die "
        "beiden Lunastein-Produkte liegen rund 1,40 EUR auseinander. Ein Pin "
        "hier waere geraten, nicht entschieden")


# Kennzahlen, ueber die die Naehe belegt sein muss, bevor die Cent-Regel
# greift. EINE Kennzahl reicht nicht — siehe die Begruendung im Test.
CENT_KENNZAHLEN = ("trend", "avg", "avg7", "avg30")


def _spannen_je_kennzahl(preise, kandidaten):
    """Abstand der beiden Kandidaten, je Kennzahl. Fehlende werden
    ausgelassen — ein fehlender Wert ist kein Beleg fuer Naehe."""
    heraus = {}
    for feld in CENT_KENNZAHLEN:
        werte = [(preise.get(pid) or {}).get(feld) for pid in kandidaten]
        if any(w is None or w == "" for w in werte):
            continue
        werte = [float(w) for w in werte]
        heraus[feld] = max(werte) - min(werte)
    return heraus


def test_die_beiden_mep_4_kandidaten_liegen_weiterhin_ueber_dem_centbereich(produkte, preise):
    """Die Gegenprobe zur Aussage oben.

    Faellt die Spanne der beiden Kandidaten je in den Centbereich, dann
    GILT die Betreiberregel auch hier, und MEP 4 gehoert entschieden statt
    offengelassen. Dieser Test macht aus 'bleibt offen' eine pruefbare
    Aussage statt einer Gewohnheit.

    WARUM ES NICHT AN EINER EINZIGEN KENNZAHL HAENGT (10.09.2026)
    ------------------------------------------------------------
    An diesem Tag stand der Test auf rot: `trend` lag bei 15,47 gegen
    15,51 — vier Cent. Nach der Regel waere MEP 4 damit entschieden
    gewesen. Die uebrigen Kennzahlen desselben Tages sagten aber etwas
    ganz anderes:

        trend    15,47   15,51   ->  0,04
        avg      17,75   16,40   ->  1,35
        low       9,00    7,80   ->  1,20
        avg1     15,75    9,00   ->  6,75
        avg7     16,16   18,86   ->  2,70
        avg30    16,95   15,39   ->  1,56

    Die Naehe war also eine Tageslaune einer einzigen Kennzahl, nicht die
    Lage der beiden Produkte. Eine Zuordnung von Kartenidentitaet, die an
    so etwas kippt, waere geraten — und Raten ist genau das, was
    CLAUDE.md hier ausschliesst ("card identity is not something a
    scraper gets to decide").

    Deshalb muss die Naehe ueber MEHRERE Kennzahlen belegt sein. Erst
    dann ist es die Lage der Produkte und nicht das Rauschen eines Tages.
    """
    kandidaten = [pid for pid, p in produkte.items()
                  if p["idExpansion"] == EXP_MEP and p["name"].startswith("Lunatone")]
    assert len(kandidaten) == 2, (
        f"in Erweiterung {EXP_MEP} stehen {len(kandidaten)} Lunatone-Produkte "
        f"({sorted(kandidaten)}) statt zwei — die Lage hat sich geaendert")
    werte = [_preis(preise.get(pid)) for pid in kandidaten]
    assert all(w is not None for w in werte), \
        f"ein Lunatone-Kandidat hat keinen Preis mehr: {dict(zip(kandidaten, werte))}"

    spannen = _spannen_je_kennzahl(preise, kandidaten)
    assert len(spannen) >= 2, (
        f"nur {len(spannen)} Kennzahl(en) fuer beide Kandidaten vorhanden "
        f"({spannen}) — auf dieser Grundlage laesst sich die Naehe weder "
        "belegen noch widerlegen")
    nah = sorted(f for f, s in spannen.items() if s <= CENT_GRENZE)
    assert len(nah) < len(spannen), (
        f"ALLE Kennzahlen liegen im Centbereich ({spannen}). Damit greift "
        "die Betreiberregel 'bei Cent-Betraegen den guenstigeren' auch "
        f"hier, und MEP 4 gehoert auf {min(kandidaten, key=lambda k: _preis(preise.get(k)))} "
        "gepinnt statt offengelassen.")


# ─────────────────────────────────────────────────────────────────────
# Die Regel wird jetzt ANGEWANDT, nicht abgewartet (10.09.2026)
# ─────────────────────────────────────────────────────────────────────
#
# Bis heute lag die Regel hier fest und wurde von Hand auf einen
# gemeldeten Fall angewandt. Der naechste Fall wartete wieder darauf,
# dass jemand hinsieht. `check_geteilte_produkt_ids` in
# scripts/data_guardian.py sagt jetzt selbst, ob die Regel greift, und
# nennt die fertige Zeile fuer data/cardmarket_mapping_manual.csv.
#
# GESCHRIEBEN WIRD NICHTS. Eine Betreiberentscheidung gehoert in die
# Handdatei, nicht in eine gebaute Zuordnung (CLAUDE.md: "Report, don't
# silently repair").
#
# NACHGEMESSEN AM 10.09.2026 ueber alle 28 trennbaren Doppelbelegungen
# des Bestands: KEINE liegt im Centbereich. Kleinste Spanne 0,65 EUR
# (SP 3/SP 73), zweitkleinste 1,64 EUR. Die Regel entscheidet heute
# also nichts mehr — die vier Faelle, die sie entscheiden konnte, sind
# am 03.09. entschieden worden.

import importlib.util as _ilu
import sys as _sys

_WURZEL = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def _guardian_quelle():
    with open(os.path.join(_WURZEL, "scripts", "data_guardian.py"),
              encoding="utf-8") as f:
        return f.read()


def test_die_regel_steht_im_waechter_und_schreibt_nicht():
    q = _guardian_quelle()
    # Auf die VERWENDUNG geprueft, nicht auf den Namen: der steht auch
    # im Kommentar darueber, und eine Probe, die nur die Zuweisung
    # umbenennt, waere sonst durchgerutscht (10.09.2026 gemessen).
    assert "abs(w) < CENT_GRENZE" in q, (
        "Die Cent-Grenze wird nicht mehr angewandt — die Regel muesste "
        "weiter von Hand auf jeden neuen Fall gelegt werden.")
    assert "betreiber-regel-cent" in q, (
        "Die Meldung nennt die Quelle nicht, unter der der Pin stehen muss.")
    assert "Geschrieben wird hier nichts" in q, (
        "Der Hinweis fehlt, dass der Waechter nur meldet. Ohne ihn liest "
        "sich die Meldung wie eine erledigte Reparatur.")


def test_ein_unbekannter_preis_ist_kein_kleiner():
    """DER FEHLER, DEN DIESE ZUSICHERUNG FESTHAELT.

    Beim ersten Anlauf feuerte die Regel auf UL 56/UL 57: der belegte
    Preis lag im Centbereich, fuer die freie Produkt-ID 902393 kannte
    die Preisdatei aber GAR KEINEN Wert. "nur Cent Betraege" waere dort
    eine Behauptung ueber eine Zahl gewesen, die niemand gesehen hat.
    """
    q = _guardian_quelle()
    assert "len(werte) == len(frei)" in q, (
        "Der Waechter verlangt nicht mehr, dass JEDER freie Kandidat "
        "einen bekannten Preis hat — ein unbekannter Preis rutscht dann "
        "wieder als Centbetrag durch.")


def test_die_regel_faellt_auf_den_guenstigeren():
    """Nicht auf den erstbesten, nicht auf den teuersten."""
    q = _guardian_quelle()
    assert "min(frei, key=lambda x: preise.get(x" in q, (
        "Die Regel waehlt nicht den guenstigsten freien Kandidaten — "
        'der Betreibersatz lautet aber "dann den guenstigeren".')


def test_die_regel_laeuft_wirklich_durch_und_entscheidet_richtig():
    """AUSGEFUEHRT, nicht nur gelesen.

    Die Zusicherungen darueber lesen den Quelltext. Das faengt eine
    entfernte Zeile, aber keinen Tippfehler: beim Proben am 10.09.2026
    liess sich `CENT_GRENZE = 1.0` in `_CENT = 1.0` umbenennen, ohne
    dass eine einzige Textpruefung umfiel — die Verwendung stand ja
    weiter da, und der Waechter waere erst zur Laufzeit an einem
    NameError gestorben.

    Hier laeuft die Pruefung deshalb gegen einen GESETZTEN Datensatz:
    eine Karte belegt, eine geraten, beide auf derselben Produkt-ID,
    drei Cent-Produkte unter derselben Metacard.
    """
    import csv as _csv
    import json as _json
    import tempfile

    with tempfile.TemporaryDirectory() as ordner:
        # Zwei Karten, eine ID — und Cardmarket fuehrt drei Produkte.
        with open(os.path.join(ordner, "cardmarket_id_mapping.csv"), "w",
                  encoding="utf-8", newline="") as f:
            w = _csv.writer(f)
            w.writerow(["set", "number", "cardmarket_product_id",
                        "match_method", "name_en"])
            w.writerow(["PRE", "200", "900001", "live-verified", "Testkarte"])
            w.writerow(["PRE", "201", "900001", "heuristic", "Testkarte"])
        with open(os.path.join(ordner, "products_singles_6.json"), "w",
                  encoding="utf-8") as f:
            _json.dump({"products": [
                {"idProduct": 900001, "idMetacard": 77, "idExpansion": 1},
                {"idProduct": 900002, "idMetacard": 77, "idExpansion": 1},
                {"idProduct": 900003, "idMetacard": 77, "idExpansion": 1},
            ]}, f)
        with open(os.path.join(ordner, "price_guide_6.json"), "w",
                  encoding="utf-8") as f:
            _json.dump({"priceGuides": [
                {"idProduct": 900001, "trend": 0.05},
                {"idProduct": 900002, "trend": 0.04},
                {"idProduct": 900003, "trend": 0.02},
            ]}, f)

        spec = _ilu.spec_from_file_location(
            "dg_cent_lauf", os.path.join(_WURZEL, "scripts", "data_guardian.py"))
        mod = _ilu.module_from_spec(spec)
        _sys.modules["dg_cent_lauf"] = mod
        spec.loader.exec_module(mod)
        mod.DATA = ordner

        befunde = []
        mod.check_geteilte_produkt_ids(befunde)

    text = " ".join(m for _, m in befunde)
    assert "Centbereich" in text, (
        f"Die Cent-Regel hat nicht gegriffen. Befunde: {befunde}")
    # Der guenstigste FREIE Kandidat ist 900003 (0,02) — nicht 900002.
    assert "PRE,201,900003,betreiber-regel-cent" in text, (
        f"Falsche Zeile vorgeschlagen. Befunde: {befunde}")
    # Und die belegte Zeile wandert NICHT.
    assert "PRE,200," not in text, (
        f"Die bestaetigte Zeile wurde umgehaengt. Befunde: {befunde}")
