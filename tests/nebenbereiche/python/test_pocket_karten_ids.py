"""FE-11: die Kartentabelle fuer eigene Pocket-Scan-Codes.

data/pocket_karten_ids.json ordnet (Set, Nummer) die Kennung zu, die im
Scan-Code steht. Gebaut von scripts/build_pocket_karten_ids.py aus
github.com/flibustier/pokemon-tcg-pocket-database (MIT).

Die Zusicherungen FUEHREN die Funktionen des Bauskripts aus.
"""
import copy
import importlib.util
import json
import os

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
_spec = importlib.util.spec_from_file_location(
    "build_pocket_karten_ids", os.path.join(WURZEL, "scripts", "build_pocket_karten_ids.py"))
bk = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bk)

DATEI = os.path.join(WURZEL, "data", "pocket_karten_ids.json")
DECKS = json.load(open(os.path.join(WURZEL, "data", "pocket_tierlist.json"), encoding="utf-8"))["decks"]


def _tabelle():
    return bk.lies_tabelle(DATEI)


def test_was_beim_bau_gepasst_hat_passt_weiter():
    """Die Tabelle darf nicht rueckwaerts brechen: jedes Deck, dessen Code beim
    Bau der Tabelle aus seiner Kartenliste herauskam (_meta.gegenprobe.
    gleich_codes), muss das heute noch tun, solange es in der Tier-Liste
    steht. Neue Decks werden hier bewusst NICHT verlangt — die Tier-Liste
    aendert sich jede Woche, und Game8s Textliste widerspricht manchmal
    Game8s eigenem Muster (siehe _meta.gegenprobe.abweichend)."""
    gespeichert = json.load(open(DATEI, encoding="utf-8"))["_meta"]["gegenprobe"]
    assert gespeichert["gleich_codes"], "die Tabelle nennt kein einziges passendes Deck"
    heute = bk.gegenprobe(_tabelle(), DECKS)
    noch_da = [d for d in DECKS if bk.code_kennung(d["code"]) in set(gespeichert["gleich_codes"])]
    passt = set(heute["gleich_codes"])
    gebrochen = [d["name"] for d in noch_da if bk.code_kennung(d["code"]) not in passt]
    assert not gebrochen, f"passte beim Bau, passt heute nicht mehr: {gebrochen}"


def test_jede_karte_eines_bekannten_sets_steht_in_der_tabelle():
    """Fehlt eine Karte, deren Set die Tabelle fuehrt, ist die Tabelle
    unvollstaendig. Ein ganz neues Set darf fehlen, bis der naechste Bau es
    bringt — das steht dann als fehlt_in_tabelle mit unbekanntem Set da."""
    tab = _tabelle()
    sets = {k.rsplit("-", 1)[0] for k in tab}
    probe = bk.gegenprobe(tab, DECKS)
    fehlt = [(a["deck"], k) for a in probe["abweichend"] for k in a["fehlt_in_tabelle"]
             if k.rsplit("-", 1)[0] in sets]
    assert not fehlt, f"Karten bekannter Sets fehlen in der Tabelle: {fehlt}"
    assert probe["gleich"] + len(probe["abweichend"]) == probe["decks"] == len(DECKS)


def test_eine_falsche_kennung_faellt_in_der_gegenprobe_auf():
    """Verfaelschungsprobe fuer die Gegenprobe selbst: eine Kennung um 10
    verschoben, und das Deck, das die Karte fuehrt, muss abweichen."""
    tab = _tabelle()
    probe = bk.gegenprobe(tab, DECKS)
    abw = {a["deck"] for a in probe["abweichend"]}
    deck = next(d for d in DECKS if d["name"] not in abw)
    karte = deck["pokemon"][0]
    schl = bk.schluessel(karte["set"], karte["nummer"])
    falsch = copy.deepcopy(tab)
    falsch[schl][1] += 10
    neu = {a["deck"] for a in bk.gegenprobe(falsch, DECKS)["abweichend"]}
    assert deck["name"] in neu


def test_verbunden_wird_ueber_set_und_nummer_nicht_ueber_den_namen():
    """Zwei Drucke derselben Karte, zwei Kennungen — gemessen 28.09.2026 an
    Game8s Charizard-Deck, dessen Textliste den einen und dessen Muster den
    anderen Druck nennt."""
    tab = _tabelle()
    assert tab["B1a-12"][2] == tab["B2b-8"][2] == "Charmeleon"
    assert tab["B1a-12"][1] != tab["B2b-8"][1]


def test_eine_verlorene_karte_bricht_den_bau_ab(tmp_path, monkeypatch):
    """Neu ist erlaubt, verloren nicht: fehlt in der Quelle eine Karte, die
    die Tabelle schon kennt, wird nichts geschrieben."""
    ziel = tmp_path / "ids.json"
    ziel.write_bytes(open(DATEI, "rb").read())
    monkeypatch.setattr(bk, "ZIEL", str(ziel))
    tab = _tabelle()
    quelle = []
    for schl, (art, kennung, name) in tab.items():
        set_, nr = schl.rsplit("-", 1)
        set_q = {"P-A": "PROMO-A", "P-B": "PROMO-B"}.get(set_, set_)
        quelle.append({"set": set_q, "number": int(nr), "name": name,
                       "image": f"c{'TR' if art == 'T' else 'PK'}_10_{kennung:06d}_00_X.webp"})
    q_voll = tmp_path / "voll.json"
    q_voll.write_text(json.dumps(quelle), encoding="utf-8")
    assert bk.main(["--quelle", str(q_voll)]) == 0
    vorher = ziel.read_bytes()
    q_kurz = tmp_path / "kurz.json"
    q_kurz.write_text(json.dumps(quelle[1:]), encoding="utf-8")
    assert bk.main(["--quelle", str(q_kurz)]) == 1
    assert ziel.read_bytes() == vorher, "trotz verlorener Karte wurde geschrieben"
