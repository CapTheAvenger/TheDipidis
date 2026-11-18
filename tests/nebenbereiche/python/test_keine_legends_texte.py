"""Keine deutschen Effekttexte aus den Legends-Spielen (WZ-50, 18.11.2026).

BEFUND. Der Champions-Lauf vom 18.11.2026 04:17 UTC setzte 181 deutsche
Attackentexte auf Legends Z-A: PokéAPI fuehrt seit kurzem dessen
Flavor-Texte (version_group 30), und der Bauer nahm je Attacke "die
neueste Spielgruppe". Legends-Spiele haben eigene Kampfregeln — Fadenschuss
hiess danach "Getroffene Gegner bewegen sich für kurze Zeit langsamer."
statt "senkt ihren Initiative-Wert", und die Stufenmarke verschwand auf
Deutsch, waehrend Englisch -2 zeigte.

Diese Datei prueft (1) die Auswahl im Bauer an gesetzten PokéAPI-Zeilen
— ausgefuehrt, nicht im Quelltext gesucht — und (2) die ausgelieferte
Datei: kein Effekttext, den PokéAPI NUR fuer ein Legends-Spiel fuehrt,
gemessen an einer kleinen, festen Belegliste aus dem Lauf vom 18.11.
"""

import importlib.util
import json
import os

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", "..", ".."))
BAUER = os.path.join(WURZEL, "scripts", "build_champions_resources.py")
RES = os.path.join(WURZEL, "data", "champions_resources.json")


def _bauer():
    spec = importlib.util.spec_from_file_location("bcr_wz50", BAUER)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


GRUPPEN = [
    {"id": "25", "identifier": "scarlet-violet"},
    {"id": "24", "identifier": "legends-arceus"},
    {"id": "30", "identifier": "legends-za"},
    {"id": "31", "identifier": "mega-dimension"},
    {"id": "32", "identifier": "champions"},
]
NAMEN = [
    {"move_id": "81", "local_language_id": "9", "name": "String Shot"},
    {"move_id": "81", "local_language_id": "6", "name": "Fadenschuss"},
]
TEXTE = [
    {"move_id": "81", "version_group_id": "25", "language_id": "6",
     "flavor_text": "Senkt den Initiative-Wert."},
    {"move_id": "81", "version_group_id": "30", "language_id": "6",
     "flavor_text": "Bewegen sich kurz langsamer."},
]


def _mit_attrappe(mod, tabellen):
    mod.fetch_csv = lambda name: [dict(r) for r in tabellen[name]]


def test_legends_gruppen_kommen_aus_der_tabelle():
    mod = _bauer()
    _mit_attrappe(mod, {"version_groups": GRUPPEN})
    assert mod.legends_version_groups() == {24, 30, 31}


def test_neuere_legends_zeile_verliert_gegen_die_hauptreihe():
    mod = _bauer()
    _mit_attrappe(mod, {"version_groups": GRUPPEN, "move_names": NAMEN,
                        "move_flavor_text": TEXTE})
    ohne = mod.legends_version_groups()
    erg = mod.pokeapi_de_map("move_names", "move_flavor_text", "move_id", ohne)
    assert erg[mod.norm("String Shot")]["de_eff"] == "Senkt den Initiative-Wert."
    # Gegenprobe: ohne Ausschluss gewinnt die neuere Legends-Zeile — genau
    # der Fehler vom 18.11. Faellt diese Zeile, prueft die obere nichts.
    alt = mod.pokeapi_de_map("move_names", "move_flavor_text", "move_id")
    assert alt[mod.norm("String Shot")]["de_eff"] == "Bewegen sich kurz langsamer."


def test_nur_legends_texte_ergeben_keinen_text():
    """Fuehrt PokéAPI fuer eine Attacke NUR einen Legends-Text, bleibt der
    Text leer (dann greift die naechste Quelle) statt falsch."""
    mod = _bauer()
    nur_za = [t for t in TEXTE if t["version_group_id"] == "30"]
    _mit_attrappe(mod, {"version_groups": GRUPPEN, "move_names": NAMEN,
                        "move_flavor_text": nur_za})
    erg = mod.pokeapi_de_map("move_names", "move_flavor_text", "move_id",
                             mod.legends_version_groups())
    assert erg[mod.norm("String Shot")]["de_eff"] == ""


# Belege aus dem Lauf 44234394726 (18.11.2026): Texte, die PokéAPI nur fuer
# Legends Z-A fuehrt und die an diesem Tag ausgeliefert waren.
NUR_LEGENDS = [
    "Der Anwender schießt Fäden aus dem Mund und umwickelt damit das Ziel. "
    "Getroffene Gegner bewegen sich für kurze Zeit langsamer.",
]


def test_ausgelieferte_datei_fuehrt_keinen_beleg_aus_legends():
    with open(RES, encoding="utf-8") as f:
        texte = {e.get("de_effect", "") for e in json.load(f)["entries"]}
    treffer = [t for t in NUR_LEGENDS if t in texte]
    assert not treffer, f"Legends-Text ausgeliefert: {treffer}"
