"""Karten ohne internationalen Druck fuer TCG Showdown (scripts/showdown_jp_karten.py).

Bestellung Hausi 05.11.2026: Japan-Vorlagen; Entscheidung: inoffizielle
Uebersetzung von Limitless uebernehmen. Die Fixtures sind die Kartenbloecke
`.card-text` der Seiten /cards/jp/<SET>/<NR>?translate=en, gelesen am
05.11.2026 (Attribute ausser `class` entfernt).
"""
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
FX = ROOT / "tests" / "fixtures" / "showdown_jp"
spec = importlib.util.spec_from_file_location("showdown_jp_karten", ROOT / "scripts" / "showdown_jp_karten.py")
M = importlib.util.module_from_spec(spec)
spec.loader.exec_module(M)


def karte(name):
    s, n = name.split("-")
    return M.karte_aus_html((FX / f"{name}.html").read_text(encoding="utf-8"), s, n)


def test_pokemon_ex_mit_faehigkeit_und_attacke():
    k = karte("M6-62")
    assert (k["name"], k["cardType"], k["hp"], k["energyType"], k["stage"]) == ("Talonflame ex", "pokemon", 280, "colorless", 2)
    assert k["evolvesFrom"] == "Fletchinder"
    assert k["ability"]["name"] == "Exciting Dive"
    # Energiesymbol [C] wird zum Wort wie im offiziellen Englisch, ohne Klammern
    assert "Colorless Mega Evolution Pokémon ex" in k["ability"]["effect"]
    assert "[" not in k["ability"]["effect"]
    assert k["attacks"] == [{"name": "Talon Hunt", "cost": "**", "damage": 150, "effect": "You may search your deck for up to 2 cards and put them into your hand. Then, shuffle your deck.", "manual": True}]
    assert (k["weakness"], k["resistance"], k["retreatCost"], k["mechanic"]) == ("lightning", "fighting", "", "ex")
    assert k["jp"] is True and k["inoffiziell"] is True
    assert k["ability"]["manual"] is True


def test_mega_basis_mit_mal_schaden_und_rueckzug():
    k = karte("M6-58")
    assert (k["stage"], k["mega"], k["mechanic"], k["retreatCost"]) == (0, True, "ex", "**")
    a = k["attacks"][0]
    assert (a["name"], a["cost"], a["damage"], a["damageText"]) == ("Storm Emeralda", "RL*", 50, "50×")
    assert "Fire Energy and Lightning Energy" in a["effect"]


def test_trainer_stadion_werkzeug_item():
    assert {k: karte("M6-75")[k] for k in ("cardType", "trainerType", "manual")} == {"cardType": "trainer", "trainerType": "stadium", "manual": True}
    assert "Evolution Pokémon in play have no Abilities." in karte("M6-75")["effect"]
    vest = karte("M6-65")
    assert vest["trainerType"] == "tool"
    assert vest["effect"].startswith("The Pokémon this card is attached to (except Mega Evolution Pokémon ex) takes 60 less damage")
    assert "Basic Fire Energy card and a Basic Lightning Energy card" in karte("M6-64")["effect"]


def test_basis_ohne_attackentext_und_entwicklung():
    s, d = karte("MEM-6"), karte("MEM-7")
    assert s["attacks"] == [{"name": "Spray Fluid", "cost": "G", "damage": 20}]
    assert "resistance" not in s and s["weakness"] == "fire" and s["retreatCost"] == "*"
    assert (d["stage"], d["evolvesFrom"], d["hp"]) == (1, "Smoliv", 90)


def test_kennung_aus_set_und_nummer_bild_jp():
    k = karte("M6-62")
    assert k["id"] == "jp-m6-talonflame-ex-62"
    assert (k["setCode"], k["number"]) == ("M6", "62")
    assert k["imageUrl"].endswith("/tpc/M6/M6_62_R_JP_LG.png")


def test_leere_uebersetzung_wird_benannt_nicht_geraten():
    leer = (FX / "M6-62.html").read_text(encoding="utf-8").replace("<a>Talonflame ex</a>", "<a></a>")
    try:
        M.karte_aus_html(leer, "M6", "62")
    except ValueError as e:
        assert "leer" in str(e)
    else:
        raise AssertionError("eine Karte ohne Namen darf nicht entstehen")


def test_datei_im_bestand_passt_zu_den_vorlagen():
    """Jede Karte der Japan-Vorlagen, die Showdown nicht kennt, steht in der Datei
    oder ist mit Grund als fehlend benannt — keine stille Luecke."""
    d = json.loads((ROOT / "data" / "showdown_jp_karten.json").read_text(encoding="utf-8"))
    da = {(k["setCode"], k["number"]) for k in d["karten"]}
    fehlt = {(f["set"], f["nummer"]) for f in d["_meta"]["fehlend"]}
    for s, n, name in M.benoetigt():
        assert (s, n) in da or (s, n) in fehlt, f"{s} {n} {name} weder geholt noch benannt"
    assert all(k["jp"] and k["inoffiziell"] for k in d["karten"])
