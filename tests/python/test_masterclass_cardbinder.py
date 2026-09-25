"""Die Kartenmappe je Masterclass — was drinsteht, steht in den Quellen.

ANLASS (Betreiber, 24.09.2026): „alle Karten, die jemals fuer diesen
Archetype benutzt worden sind, egal ob City League, Past Meta, Current
Meta … wenn ich hier schon Geld investiere, um mir eine Masterclass zu
kaufen, dann moechte ich auch mit den Informationen, die wir selber zu
dem Deck haben, die Masterclass erweitern."

Zwei Fallen, die dieser Erzeuger im ersten Durchlauf am 25.09.2026
wirklich hatte und die hier festgehalten sind:

  * Preise stehen in data/price_data.csv als "0,04€". `float()` darauf
    gibt ValueError — der erste Lauf lieferte 228 Karten OHNE einen
    einzigen Preis, und nichts wurde rot.
  * Daten stehen in zwei Schreibweisen nebeneinander ("2026-09-18" und
    "19th September 2026"). Ein String-Vergleich meldete fuer TEF-PBL
    „von 19th September 2026 bis 28th August 2026".
"""

import importlib.util
import json
import os
import re

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
SKRIPT = os.path.join(WURZEL, "scripts", "build_masterclass_cardbinder.py")
REGISTER = os.path.join(WURZEL, "config", "masterclass_cardbinder.json")
MAPPEN = os.path.join(WURZEL, "data", "masterclass_cardbinder")
JS = os.path.join(WURZEL, "js", "ds-masterclass.js")


@pytest.fixture(scope="module")
def mod():
    spec = importlib.util.spec_from_file_location("bmc", SKRIPT)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


@pytest.fixture(scope="module")
def register():
    with open(REGISTER, encoding="utf-8") as f:
        return (json.load(f) or {}).get("masterclasses") or {}


# ── Register ──────────────────────────────────────────────────────────

def test_jede_masterclass_hat_einen_eintrag(register):
    """Die Auflage: kuenftige Masterclasses bekommen den Cardbinder von
    Anfang an. Wer eine ergaenzt und das Register vergisst, faellt hier
    auf — nicht erst dem Betreiber im Browser."""
    with open(JS, encoding="utf-8") as f:
        js = f.read()
    ids = re.findall(r"id:\s*'([a-z0-9-]+)',\s*\n\s*titel:", js)
    assert ids, "keine Masterclass in GUIDES gefunden"
    fehlen = [i for i in ids if i not in register]
    assert fehlen == [], (
        f"ohne Cardbinder-Eintrag in config/masterclass_cardbinder.json: {fehlen}")


def test_jeder_eintrag_nennt_kopf_und_beleg(register):
    for mc, e in register.items():
        assert e.get("kopf_pokemon"), f"{mc}: kein kopf_pokemon"
        assert re.fullmatch(r"[a-z0-9-]+", e["kopf_pokemon"]), (
            f"{mc}: {e['kopf_pokemon']!r} ist kein Limitless-Slug")
        assert e.get("_beleg"), (
            f"{mc}: kein Beleg, woher das Kopf-Pokemon kommt — dann ist es "
            f"geraten")


# ── Zahlen lesen ──────────────────────────────────────────────────────

@pytest.mark.parametrize("roh,erwartet", [
    ("0,04€", 0.04),
    ("31,50€", 31.5),
    ("1.23", 1.23),
    ("", 0.0),
    (None, 0.0),
    ("keine Zahl", 0.0),
])
def test_preise_werden_gelesen(mod, roh, erwartet):
    assert mod._zahl(roh) == pytest.approx(erwartet)


@pytest.mark.parametrize("roh,erwartet", [
    ("2026-09-18", "2026-09-18"),
    ("19th September 2026", "2026-09-19"),
    ("1st August 2026", "2026-08-01"),
    ("28th August 2026", "2026-08-28"),
    ("", None),
    ("irgendwann", None),
    ("Montag", None),
])
def test_daten_werden_gelesen_oder_gar_nicht(mod, roh, erwartet):
    assert mod._datum(roh) == erwartet


def test_die_datumsspanne_verdreht_sich_nicht(mod):
    """Der Fehler von 25.09.2026 in einer Zeile: 'von 19th September 2026
    bis 28th August 2026'. Sortiert wird nach ISO, nicht nach Buchstaben."""
    a, b = mod._datum("19th September 2026"), mod._datum("28th August 2026")
    assert min(a, b) == "2026-08-28"
    assert max(a, b) == "2026-09-19"


# ── Die gebaute Mappe ─────────────────────────────────────────────────

def _mappen():
    if not os.path.isdir(MAPPEN):
        return []
    return [os.path.join(MAPPEN, f) for f in sorted(os.listdir(MAPPEN))
            if f.endswith(".json")]


def test_es_gibt_zu_jedem_registereintrag_eine_mappe(register):
    vorhanden = {os.path.basename(p)[:-5] for p in _mappen()}
    fehlen = sorted(set(register) - vorhanden)
    assert fehlen == [], (
        f"keine Kartenmappe gebaut fuer: {fehlen} — "
        f"scripts/build_masterclass_cardbinder.py laufen lassen")


@pytest.mark.parametrize("pfad", _mappen() or [pytest.param(None, marks=pytest.mark.skip)])
def test_jede_mappe_traegt_karten_und_metas(pfad):
    with open(pfad, encoding="utf-8") as f:
        d = json.load(f)
    name = os.path.basename(pfad)
    assert d["karten"], f"{name}: keine einzige Karte"
    assert d["metas"], f"{name}: kein Meta"
    assert d["_meta"]["archetypen"] or d["_meta"]["archetyp_kennungen"], (
        f"{name}: die Mappe nennt nicht, welchen Archetyp sie beschreibt")


@pytest.mark.parametrize("pfad", _mappen() or [pytest.param(None, marks=pytest.mark.skip)])
def test_keine_karte_zaehlt_mehr_listen_als_es_gibt(pfad):
    """Die haerteste Rechenprobe: eine Karte kann nicht in mehr Listen
    stehen, als es Listen gibt. Geht das schief, zaehlt eine Quelle
    doppelt — genau der Fall, den die Rangfolge verhindern soll."""
    with open(pfad, encoding="utf-8") as f:
        d = json.load(f)
    name = os.path.basename(pfad)
    for k in d["karten"]:
        g = k["gesamt"]
        assert g["listen_mit_karte"] <= g["listen_gesamt"], (
            f"{name}: {k['name']} steht in {g['listen_mit_karte']} von "
            f"{g['listen_gesamt']} Listen — eine Quelle zaehlt doppelt")
        for meta, w in k["je_meta"].items():
            assert w["listen_mit_karte"] <= w["listen_gesamt"], (
                f"{name}: {k['name']} in {meta}: {w['listen_mit_karte']} von "
                f"{w['listen_gesamt']}")
            if w["anteil"] is not None:
                assert 0 <= w["anteil"] <= 100, (
                    f"{name}: {k['name']} in {meta} hat Anteil {w['anteil']}")


@pytest.mark.parametrize("pfad", _mappen() or [pytest.param(None, marks=pytest.mark.skip)])
def test_die_meta_summen_gehen_auf(pfad):
    with open(pfad, encoding="utf-8") as f:
        d = json.load(f)
    je_id = {m["id"]: m["listen"] for m in d["metas"]}
    for k in d["karten"]:
        summe = sum(je_id[m] for m in k["je_meta"] if m in je_id)
        assert k["gesamt"]["listen_gesamt"] == summe, (
            f"{k['name']}: gesamt {k['gesamt']['listen_gesamt']} != "
            f"Summe der Metas {summe}")


@pytest.mark.parametrize("pfad", _mappen() or [pytest.param(None, marks=pytest.mark.skip)])
def test_die_spanne_laeuft_vorwaerts(pfad):
    with open(pfad, encoding="utf-8") as f:
        d = json.load(f)
    for m in d["metas"]:
        for feld in ("von", "bis"):
            w = m.get(feld)
            if w is None:
                continue
            # ISO oder gar nichts. Ein "19th September 2026" in diesem
            # Feld heisst, dass irgendwo Text statt Datum verglichen
            # wurde — und dann steht die Spanne falsch herum da, ohne
            # dass ein Vergleich es merkt.
            assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", w), (
                f"{m['id']}.{feld} = {w!r} ist kein ISO-Datum")
        if m.get("von") and m.get("bis"):
            assert m["von"] <= m["bis"], (
                f"{m['id']}: von {m['von']} liegt nach bis {m['bis']}")


@pytest.mark.parametrize("pfad", _mappen() or [pytest.param(None, marks=pytest.mark.skip)])
def test_kein_turnier_liegt_in_zwei_metas(pfad):
    """Die Probe, die die Rangfolge wirklich prueft.

    Ohne sie blieb am 25.09.2026 eine Verfaelschung gruen: nimmt man die
    Rangfolge heraus, zaehlt dasselbe Turnier einmal unter TEF-PBL und
    einmal unter „Online Dated". Innerhalb eines Metas faellt das nicht
    auf — die Summe ueber alle Metas ist dann aber doppelt.
    """
    with open(pfad, encoding="utf-8") as f:
        d = json.load(f)
    summe = sum(m["turniere"] for m in d["metas"])
    gesamt = d["_meta"].get("turniere_gesamt")
    assert gesamt is not None, "die Mappe nennt keine Gesamtzahl der Turniere"
    assert summe == gesamt, (
        f"{summe} Turniere ueber die Metas summiert, aber nur {gesamt} "
        f"unterschiedliche — ein Turnier steht in zwei Meta-Toepfen und "
        f"jede Gesamtzahl waere doppelt gezaehlt")


@pytest.mark.parametrize("pfad", _mappen() or [pytest.param(None, marks=pytest.mark.skip)])
def test_preise_sind_zahlen_oder_fehlen_ganz(pfad):
    with open(pfad, encoding="utf-8") as f:
        d = json.load(f)
    mit = 0
    for k in d["karten"]:
        p = k.get("preis")
        if p is None:
            continue
        mit += 1
        assert isinstance(p["eur"], (int, float)), (
            f"{k['name']}: Preis {p['eur']!r} ist keine Zahl — "
            f"das Waehrungszeichen aus price_data.csv ist nicht abgeschnitten")
        assert p["eur"] >= 0
    assert mit > 0, (
        "keine einzige Karte hat einen Preis. Genau so sah der erste "
        "Durchlauf am 25.09.2026 aus: float('0,04€') wirft, und der "
        "Fehler blieb still.")


@pytest.mark.parametrize("pfad", _mappen() or [pytest.param(None, marks=pytest.mark.skip)])
def test_matchups_nennen_ihren_nenner(pfad):
    with open(pfad, encoding="utf-8") as f:
        d = json.load(f)
    for m in d.get("matchups") or []:
        assert m["partien"] > 0, f"{m['gegner']}: Siegquote ohne Partien"
        assert 0 <= m["siegquote"] <= 100, f"{m['gegner']}: {m['siegquote']}"
        assert m["quelle"], f"{m['gegner']}: keine Quelle genannt"


@pytest.mark.parametrize("pfad", _mappen() or [pytest.param(None, marks=pytest.mark.skip)])
def test_turnierzeilen_nennen_ihre_feldgroesse(pfad):
    with open(pfad, encoding="utf-8") as f:
        d = json.load(f)
    for t in d.get("turniere") or []:
        assert t["turnier"], "Turnierzeile ohne Namen"
        assert t["spieler_deck"] <= t["spieler_gesamt"] or t["spieler_gesamt"] == 0, (
            f"{t['turnier']}: {t['spieler_deck']} Deckspieler bei "
            f"{t['spieler_gesamt']} Teilnehmern")
        assert t["quelle"], f"{t['turnier']}: keine Quelle genannt"


@pytest.mark.parametrize("pfad", _mappen() or [pytest.param(None, marks=pytest.mark.skip)])
def test_jede_karte_nennt_ihre_quelle(pfad):
    with open(pfad, encoding="utf-8") as f:
        d = json.load(f)
    erlaubt = set(json.load(open(pfad, encoding="utf-8"))["_meta"]
                  ["rangfolge_bei_doppelten_turnieren"])
    for k in d["karten"]:
        assert k["quellen"], f"{k['name']}: keine Quelle"
        unbekannt = set(k["quellen"]) - erlaubt
        assert not unbekannt, f"{k['name']}: unbekannte Quelle {unbekannt}"


# ── Der Erzeuger laeuft im selben Lauf wie die Kartendaten ────────────

def test_der_wochenlauf_baut_die_kartenmappen():
    """Sonst steht im Cardbinder nach jedem Turnierwochenende ein
    aelterer Kartenbestand als im Rest der Seite."""
    yaml = pytest.importorskip("yaml")
    pfad = os.path.join(WURZEL, ".github", "workflows", "weekly-full-update.yml")
    with open(pfad, encoding="utf-8") as f:
        ablauf = yaml.safe_load(f)
    schritte = ablauf["jobs"]["scrape"]["steps"]
    namen = [s.get("name", "") for s in schritte]

    baut = [i for i, s in enumerate(schritte)
            if "build_masterclass_cardbinder.py" in str(s.get("run") or "")]
    assert baut, (
        "der Wochenlauf ruft scripts/build_masterclass_cardbinder.py nicht "
        "auf — die Kartenmappen veralten dann still")

    rueck = [i for i, n in enumerate(namen) if "zurueck nach data" in n]
    assert rueck, "der Rueckweg nach data/ fehlt"
    assert baut[0] > rueck[0], (
        f"die Kartenmappen werden in Schritt {baut[0] + 1} gebaut, der "
        f"Rueckweg nach data/ laeuft aber erst in Schritt {rueck[0] + 1} — "
        f"der Erzeuger liest dann den Stand von vorletzter Woche")


def test_ein_fehlender_erzeuger_haelt_den_lauf_nicht_an():
    """Eine alte Kartenmappe ist schlechter als eine frische, aber weit
    besser als ein Lauf, der die Turnierdaten gar nicht erst pusht."""
    yaml = pytest.importorskip("yaml")
    pfad = os.path.join(WURZEL, ".github", "workflows", "weekly-full-update.yml")
    with open(pfad, encoding="utf-8") as f:
        ablauf = yaml.safe_load(f)
    for s in ablauf["jobs"]["scrape"]["steps"]:
        text = str(s.get("run") or "")
        if "build_masterclass_cardbinder.py" not in text:
            continue
        assert "exit 0" in text, (
            "der Schritt bricht den Lauf ab, wenn eine Mappe nicht gebaut "
            "werden kann")
        assert "::warning::" in text, (
            "ein Fehlschlag verschwindet still — er muss im Protokoll "
            "stehen")
        return
    pytest.fail("Schritt nicht gefunden")
