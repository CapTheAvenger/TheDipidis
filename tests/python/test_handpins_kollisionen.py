"""Die neun doppelt belegten Cardmarket-IDs sind aufgeloest.

BEFUND (Altbestand, zuletzt gemeldet am 22.08.2026): neun Cardmarket-
Produkt-IDs standen gleichzeitig fuer ZWEI verschiedene Karten, alle
neun als 'live-verified' — eine Pruefung, die zwei Antworten liefert,
ist keine Pruefung. Es war der letzte verbliebene CRITICAL des
Waechters.

Aufgeloest ueber data/cardmarket_mapping_manual.csv, den dafuer
gebauten Weg (apply_manual_overrides: "der einzige Ort, an dem ein
Mensch das Produkt wirklich angesehen hat").

Die Belege, dreifach und unabhaengig:

  1. tcggo.com fuehrt auf jeder Kartenseite die Cardmarket-ID. Die
     Methode stammt vom Betreiber dieses Repos, der zwei Beispiele
     mitgeliefert hat: 276103 -> beldum-29, 276311 -> dark-tyranitar-19.
  2. Unser eigener Kartentext (data/pokemon_card_text.json), der
     Cardmarket nie beruehrt hat.
  3. Der Cardmarket-Produktname selbst, der die Attacken in Klammern
     fuehrt: "Beldum [Levitate | Tackle]".

Alle drei stimmen ueberein, wo alle drei etwas sagen. Zwei Faelle waren
KEINE Verwechslung zwischen den beiden Kandidaten, sondern zwei falsche
Zuordnungen auf einmal:

  * 817297 gehoert zu JTG-145 — weder zu 143 noch zu 144.
  * 363531 gehoert weder zu DRM-60 noch zu DRM-60a; tcggo nennt fuer
    DRM-60 die 585901, die in unserem Produktabzug gar nicht steht.
    DRM-60 bleibt deshalb bewusst ungepinnt und offen.

Und eine Falle, die jede Positionsheuristik reisst: bei BWP stehen die
IDs NICHT in Kartenreihenfolge (30 -> 279947, 31 -> 279943).
"""

import csv
import collections
import io
import json
import os

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
DATEN = os.path.join(WURZEL, "data")

PINS = os.path.join(DATEN, "cardmarket_mapping_manual.csv")
ZUORDNUNG = os.path.join(DATEN, "cardmarket_id_mapping.csv")
KARTEN = os.path.join(DATEN, "all_cards_database.csv")
PRODUKTE = os.path.join(DATEN, "products_singles_6.json")

# Die neun IDs, die der Waechter als doppelt belegt gemeldet hat.
STRITTIG = ("276103", "276311", "279943", "281502", "282722",
            "299540", "315951", "363531", "817297")

# Bewusst ohne Pin: tcggo nennt fuer DRM-60 die 585901, und die steht
# nicht in unserem Produktabzug. Raten waere hier billiger als richtig.
OFFEN = {("DRM", "60")}


def _lies(pfad):
    with io.open(pfad, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


@pytest.fixture(scope="module")
def pins():
    return _lies(PINS)


def test_pins_sind_wohlgeformt(pins):
    for r in pins:
        assert r["set"].strip(), f"Pin ohne Set: {r}"
        assert r["number"].strip(), f"Pin ohne Nummer: {r}"
        assert r["cardmarket_product_id"].strip().isdigit(), (
            f"apply_manual_overrides ueberspringt nicht-numerische IDs "
            f"stillschweigend — dieser Pin waere wirkungslos: {r}")
        assert r["source"].strip(), (
            f"ohne Quelle ist ein Pin eine Behauptung, keine Messung: {r}")
        assert r["note"].strip(), f"Pin ohne Begruendung: {r}"


def test_jeder_pin_zeigt_auf_eine_echte_karte(pins):
    karten = {(r["set"].strip().upper(), r["number"].strip())
              for r in _lies(KARTEN)}
    fehlend = [(r["set"], r["number"]) for r in pins
               if (r["set"].strip().upper(), r["number"].strip()) not in karten]
    assert not fehlend, f"Pin auf eine Karte, die es nicht gibt: {fehlend}"


def test_jeder_pin_zeigt_auf_ein_echtes_produkt(pins):
    with io.open(PRODUKTE, encoding="utf-8") as f:
        ids = {str(p["idProduct"]) for p in json.load(f)["products"]}
    fehlend = [(r["set"], r["number"], r["cardmarket_product_id"]) for r in pins
               if r["cardmarket_product_id"].strip() not in ids]
    assert not fehlend, (
        f"Pin auf eine Produkt-ID, die products_singles_6.json nicht "
        f"kennt: {fehlend}")


def test_keine_zwei_karten_auf_einer_id(pins):
    """Der eigentliche Befund. Pins schlagen live-verified, also wird die
    Zuordnung mit angewandten Pins geprueft — so, wie der Mapper sie
    schreibt."""
    festgelegt = {(r["set"].strip().upper(), r["number"].strip()):
                  r["cardmarket_product_id"].strip() for r in pins}
    belegung = collections.defaultdict(set)
    for r in _lies(ZUORDNUNG):
        k = (r["set"].strip().upper(), r["number"].strip())
        if k in festgelegt:
            belegung[festgelegt[k]].add(k)
        elif r["match_method"].strip() in ("live-verified", "manual-pin"):
            belegung[r["cardmarket_product_id"].strip()].add(k)
    doppelt = {pid: sorted(v) for pid, v in belegung.items() if len(v) > 1}
    assert not doppelt, (
        f"eine Verifikation, die zwei Antworten liefert, ist keine "
        f"Verifikation: {doppelt}")


# 363531 bekommt bewusst KEINEN Besitzer: tcggo weist DRM-60 die 585901
# zu und DRM-60a die 448143. Die 363531 ist ein drittes "Fiery Flint"-
# Produkt derselben Expansion und gehoert zu keiner unserer beiden
# Karten. Sie einer von beiden zuzuweisen waere genau der Fehler, der
# den Befund erzeugt hat.
OHNE_BESITZER = {"363531"}


@pytest.mark.parametrize("pid", STRITTIG)
def test_jede_strittige_id_hat_hoechstens_einen_besitzer(pins, pid):
    besitzer = [(r["set"], r["number"]) for r in pins
                if r["cardmarket_product_id"].strip() == pid]
    erwartet = 0 if pid in OHNE_BESITZER else 1
    assert len(besitzer) == erwartet, (
        f"{pid} hat {len(besitzer)} gepinnte Besitzer ({besitzer}) — "
        f"erwartet {erwartet}")


def test_die_beiden_belege_des_betreibers_stimmen(pins):
    """Die zwei tcggo-Links, die er selbst mitgeliefert hat. Wenn unsere
    Aufloesung diesen beiden widerspricht, ist die Methode falsch und
    alle anderen 16 Pins sind es auch."""
    fest = {(r["set"], r["number"]): r["cardmarket_product_id"] for r in pins}
    assert fest[("HL", "29")] == "276103", "tcggo /ex-hidden-legends/beldum-29"
    assert fest[("TRR", "19")] == "276311", (
        "tcggo /ex-team-rocket-returns/dark-tyranitar-19")


def test_der_kartentext_widerspricht_keinem_pin(pins):
    """Gegenprobe aus einer Quelle, die Cardmarket nie beruehrt hat: wo
    der Cardmarket-Produktname die Attacken in Klammern fuehrt, muessen
    sie zu unserem eigenen Kartentext passen."""
    with io.open(os.path.join(DATEN, "pokemon_card_text.json"),
                 encoding="utf-8") as f:
        text = json.load(f)
    with io.open(PRODUKTE, encoding="utf-8") as f:
        prod = {str(p["idProduct"]): p["name"] for p in json.load(f)["products"]}

    def worte(s):
        return [w for w in "".join(
            c if c.isalnum() else " " for c in s.lower()).split() if w]

    geprueft = 0
    for r in pins:
        name = prod.get(r["cardmarket_product_id"].strip(), "")
        if "[" not in name or "]" not in name:
            continue          # Trainer o. ae. — kein Attackenteil im Namen
        unser = text.get(f'{r["set"].strip().upper()}|{r["number"].strip()}')
        if not unser:
            continue
        klammer = name[name.index("[") + 1:name.rindex("]")]
        # Der Set-Code steht bei manchen Produkten mit in der Klammer
        # ("Chimchar [Flare | UPR]"); er gehoert nicht zum Kartentext.
        aus_cm = [w for w in worte(klammer)
                  if w != r["set"].strip().lower()]
        assert worte(unser) == aus_cm, (
            f'{r["set"]}-{r["number"]}: unser Kartentext {unser!r} passt '
            f'nicht zum Cardmarket-Produktnamen {name!r}')
        geprueft += 1
    assert geprueft >= 8, (
        f"nur {geprueft} Pins liessen sich gegen den Kartentext pruefen — "
        f"die Gegenprobe ist dann keine")


def test_drm_60_bleibt_bewusst_offen(pins):
    """Report, don't repair: tcggo nennt fuer DRM-60 die 585901, die in
    unserem Produktabzug fehlt. Ein Pin darauf waere geraten. Dieser Test
    haelt die Luecke sichtbar, statt sie zu vergessen."""
    gepinnt = {(r["set"].strip().upper(), r["number"].strip()) for r in pins}
    for k in OFFEN:
        assert k not in gepinnt, (
            f"{k} wurde gepinnt — wenn die ID inzwischen belegt ist, "
            f"gehoert dieser Test angepasst statt umgangen")


# ── Der Waechter muss den Unterschied kennen ───────────────────────────
#
# Die Pins wirken erst, wenn cardmarket_id_mapper.py das naechste Mal
# laeuft. Bis dahin steht die Doppelbelegung weiter in
# cardmarket_id_mapping.csv. Sie deshalb zu verschweigen waere falsch —
# sie unveraendert als CRITICAL zu melden aber auch: der Befund ist dann
# beantwortet und wartet nur noch auf den Lauf.

def _waechter():
    import sys
    sys.path.insert(0, os.path.join(WURZEL, "scripts"))
    import data_guardian
    return data_guardian


def _pindatei(ordner, eintraege):
    ordner.mkdir(parents=True, exist_ok=True)
    with io.open(ordner / "cardmarket_mapping_manual.csv", "w",
                 encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["set", "number", "cardmarket_product_id", "source", "note"])
        for e in eintraege:
            w.writerow(e)


ZWEI_KARTEN = {"999001": [("HL", "28"), ("HL", "29")]}


def test_ungepinnte_kollision_bleibt_critical(tmp_path, monkeypatch):
    w = _waechter()
    _pindatei(tmp_path, [])
    monkeypatch.setattr(w, "DATA", str(tmp_path))
    findings = []
    w.check_verified_collisions(findings, {
        "verified_collisions": ["999001"],
        "verified_collision_owners": ZWEI_KARTEN})
    assert [lvl for lvl, _ in findings] == ["CRITICAL"]


def test_beidseitig_gepinnte_kollision_wird_warn(tmp_path, monkeypatch):
    w = _waechter()
    _pindatei(tmp_path, [("HL", "28", "276102", "tcggo", "x"),
                         ("HL", "29", "276103", "tcggo", "x")])
    monkeypatch.setattr(w, "DATA", str(tmp_path))
    findings = []
    w.check_verified_collisions(findings, {
        "verified_collisions": ["999001"],
        "verified_collision_owners": ZWEI_KARTEN})
    assert [lvl for lvl, _ in findings] == ["WARN"]
    assert "cardmarket_id_mapper.py" in findings[0][1], (
        "die Meldung muss sagen, worauf sie wartet")


def test_halb_gepinnte_kollision_bleibt_critical(tmp_path, monkeypatch):
    """Ein Pin auf nur eine der beiden Karten loest nichts: die andere
    behaelt ihre falsche ID. Genau hier waere ein zu grosszuegiger
    Waechter gefaehrlich."""
    w = _waechter()
    _pindatei(tmp_path, [("HL", "29", "276103", "tcggo", "x")])
    monkeypatch.setattr(w, "DATA", str(tmp_path))
    findings = []
    w.check_verified_collisions(findings, {
        "verified_collisions": ["999001"],
        "verified_collision_owners": ZWEI_KARTEN})
    assert [lvl for lvl, _ in findings] == ["CRITICAL"]


def test_ohne_besitzerangabe_bleibt_es_critical(tmp_path, monkeypatch):
    """Alte Grundlinien kennen verified_collision_owners nicht. Fehlt die
    Angabe, wird nicht heruntergestuft — im Zweifel lauter."""
    w = _waechter()
    _pindatei(tmp_path, [("HL", "28", "276102", "tcggo", "x"),
                         ("HL", "29", "276103", "tcggo", "x")])
    monkeypatch.setattr(w, "DATA", str(tmp_path))
    findings = []
    w.check_verified_collisions(findings, {"verified_collisions": ["999001"]})
    assert [lvl for lvl, _ in findings] == ["CRITICAL"]


def test_echter_stand_keine_unentschiedene_kollision():
    """Am echten Datenstand.

    Bewusst als Obergrenze und nicht als feste Zahl formuliert: sobald
    cardmarket_id_mapper.py mit den Pins gelaufen ist, verschwinden die
    acht entschiedenen Kollisionen aus cardmarket_id_mapping.csv und das
    WARN mit ihnen. Ein Test auf "genau ein CRITICAL, genau ein WARN"
    waere dann rot, ohne dass etwas kaputt ist — dieselbe Bauart, die am
    21.08.2026 main rot gefaerbt hat.

    Was hier wirklich gilt: es darf keine Doppelbelegung geben, die
    weder von einem Pin entschieden noch als offener Fall dokumentiert
    ist."""
    w = _waechter()
    zustand = w.price_integrity()
    findings = []
    w.check_verified_collisions(findings, zustand)
    kritisch = [f for lvl, f in findings if lvl == "CRITICAL"]
    if not kritisch:
        return                      # alle Pins sind durchgelaufen
    assert len(kritisch) == 1, f"mehr als eine offene Kollision: {kritisch}"
    text = kritisch[0]
    unentschieden = [pid for pid in zustand.get("verified_collisions", [])
                     if pid in text]
    assert set(unentschieden) <= {"363531"}, (
        f"neue, undokumentierte Doppelbelegung: {unentschieden}. Entweder "
        f"pinnen (data/cardmarket_mapping_manual.csv) oder hier als "
        f"offenen Fall eintragen — nicht raten.")
