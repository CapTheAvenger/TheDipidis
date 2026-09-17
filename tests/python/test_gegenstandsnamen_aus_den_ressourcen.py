"""Was das Nachschlagewerk auf Deutsch kennt, muss die Tabelle fuehren.

ANLASS (Betreiber, 16.09.2026): „bei Psychic Seed fehlt der deutsche
Name".

Er fehlte nicht in den Daten. data/champions_resources.json fuehrte ihn
als „Psycho-Samen", von PokeAPI geliefert — und er kam nie in
data/champions_names_de.json an, weil write_names_de() in
scripts/build_champions_pokedex.py die Gegenstaende AUSSCHLIESSLICH aus
data/de_name_overrides.json (pokemonexperte) befuellte, waehrend es die
Faehigkeiten drei Zeilen darueber schon immer aus den Ressourcen las.

Die Oberflaeche liest nur die Tabelle (js/champions-namen.js, deName()).
Was dort fehlt, steht auf der deutschen Seite englisch da.

GEMESSEN vor dem Fix, ueber die 160 Gegenstaende, die
data/champions_usage.json wirklich fuehrt: 55 ohne deutschen Namen, 32
davon in den Ressourcen vorhanden. Danach: 24 ohne — 23
Champions-eigene Mega-Steine, fuer die es keinen deutschen Namen gibt,
plus „Magnet", das auf Deutsch genauso heisst.

Diese Datei prueft die LEITUNG, nicht eine Namensliste: kein deutscher
Name, den eine unserer Quellen kennt, darf unterwegs verloren gehen.
"""
import json
import os

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, "data")


def _json(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def tabelle():
    return _json("champions_names_de.json")


@pytest.fixture(scope="module")
def ressourcen():
    return _json("champions_resources.json")


@pytest.fixture(scope="module")
def benutzte():
    namen = set()
    for _k, v in (_json("champions_usage.json").get("pokemon") or {}).items():
        for modus in ("doubles", "singles"):
            for it in ((v.get(modus) or {}).get("held_item") or []):
                n = str((it or {}).get("name") or "").strip()
                if n:
                    namen.add(n)
    return namen


def test_kein_deutscher_gegenstandsname_geht_unterwegs_verloren(tabelle, ressourcen):
    items = tabelle["items"]
    verloren = sorted(
        e["en"] for e in ressourcen.get("entries", [])
        if e.get("cat") == "item" and e.get("en") and e.get("de")
        and e["de"] != e["en"] and not items.get(e["en"]))
    assert not verloren, (
        "Diese Gegenstaende haben im Nachschlagewerk einen deutschen Namen und "
        "fehlen in der Namenstabelle, die die Oberflaeche liest: "
        + ", ".join(verloren[:30]) + (" …" if len(verloren) > 30 else ""))


def test_die_uebersteuerung_gewinnt_weiter(tabelle):
    """Der Lueckenfueller darf nichts ueberschreiben.

    de_name_overrides.json ist die geprueftere Quelle (pokemonexperte +
    Entscheidungsdatei). Wuerde sie von den Ressourcen ueberstimmt, kaeme
    jede einzeln nachgeschlagene Korrektur beim naechsten Bau wieder weg
    — derselbe Fehler, der am 31.08.2026 schon einmal zwei Namen
    gekostet hat.
    """
    ov = (_json("de_name_overrides.json").get("items") or {})
    anders = sorted(f"{en}: Tabelle {tabelle['items'][en]!r}, Uebersteuerung {de!r}"
                    for en, de in ov.items()
                    if de and tabelle["items"].get(en) and tabelle["items"][en] != de)
    # Die Entscheidungsdatei darf gegen BEIDE gewinnen — ihre Namen sind
    # hier ausgenommen, sonst prueft die Zusicherung die falsche Stufe.
    ent = ((_json("champions_namen_entschieden.json").get("namen") or {}).get("items") or {})
    anders = [z for z in anders if z.split(":")[0] not in ent]
    assert not anders, ("die Ressourcen haben eine Uebersteuerung verdraengt: "
                        + "; ".join(anders[:10]))


def test_die_abdeckung_der_benutzten_gegenstaende(tabelle, benutzte):
    """Eine Zahl, damit ein stiller Einbruch auffaellt.

    Gemessen am 16.09.2026: 136 von 160 benutzten Gegenstaenden tragen
    einen deutschen Namen. Der Rest sind Champions-eigene Mega-Steine.
    Faellt die Abdeckung unter vier Fuenftel, ist die Leitung wieder
    unterbrochen.
    """
    mit = sum(1 for n in benutzte if tabelle["items"].get(n))
    assert mit >= 0.80 * len(benutzte), (
        f"nur {mit} von {len(benutzte)} benutzten Gegenstaenden haben einen deutschen Namen")


def test_die_vier_samen_haben_einen_namen(tabelle):
    """Der gemeldete Fall selbst — samt seiner drei Geschwister.

    Nicht als Namensliste, sondern als Beleg fuer den Anlass: alle vier
    Samen stehen in den Nutzungsdaten, alle vier hatten keinen Namen.
    """
    for en in ("Psychic Seed", "Electric Seed", "Grassy Seed", "Misty Seed"):
        de = tabelle["items"].get(en)
        assert de and de != en, f"{en} hat weiterhin keinen deutschen Namen"
