"""Paldea-Tauros: drei Varianten, drei Eintraege, drei Ladder-Datensaetze.

BEFUND (31.08.2026, letzter offener Punkt der Lueckeninventur):
`data/champions_usage.json` fuehrt drei Ladder-Datensaetze
(`paldean-tauros-combat-breed`, `-blaze-breed`, `-aqua-breed`), der
Roster von otterlyclueless dagegen nur einen Eintrag "Paldean Tauros" —
reiner Kampf-Typ, 75/110/105/30/70/100. Das IST die Gefechtvariante; sie
trug aber den Namen aller drei, und die beiden anderen fehlten ganz.
Ergebnis im Admin-Bereich: "Tauros (Paldea) — kein Nutzungsdatensatz",
weil kein Ladder-Slug auf den Sammelnamen passt.

Zwei unabhaengige Quellen, beide am 31.08.2026 geprueft:
  * pokebase.app Champions-Dex listet alle drei Formen mit den Typen
    Kampf / Kampf-Feuer / Kampf-Wasser und identischen Basiswerten.
  * data/pokemon_battle_data.json (Smogon) fuehrt Tauros-Paldea-Combat,
    -Blaze und -Aqua mit denselben Typen und denselben Basiswerten.
Deutsche Formnamen von pokewiki.de/Tauros: Gefechtvariante,
Flammenvariante, Flutenvariante.

Der englische Name traegt hier zugleich die Verknuepfung: normalisiert
ist "Paldean Tauros (Combat Breed)" genau "paldean-tauros-combat-breed".
Wer den Namen wieder zusammenfasst, reisst die Verknuepfung mit ab —
genau das haelt diese Datei fest.
"""
import json
import os
import re

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, "data")


def _lies(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def dex():
    return _lies("champions_pokedex.json")


@pytest.fixture(scope="module")
def usage():
    return _lies("champions_usage.json")


def _norm(s):
    return re.sub(r"[^a-z0-9]", "", str(s).lower())


VARIANTEN = {
    "Paldean Tauros (Combat Breed)": ("Tauros (Paldea, Gefechtvariante)",
                                      "Fighting", "", "paldean-tauros-combat-breed"),
    "Paldean Tauros (Blaze Breed)": ("Tauros (Paldea, Flammenvariante)",
                                     "Fighting", "Fire", "paldean-tauros-blaze-breed"),
    "Paldean Tauros (Aqua Breed)": ("Tauros (Paldea, Flutenvariante)",
                                    "Fighting", "Water", "paldean-tauros-aqua-breed"),
}


def test_alle_drei_varianten_stehen_im_pokedex(dex):
    da = {e["en"] for e in dex["entries"]}
    fehlen = sorted(set(VARIANTEN) - da)
    assert fehlen == [], f"Varianten fehlen im Pokedex: {fehlen}"


def test_der_sammelname_ist_verschwunden(dex):
    """"Paldean Tauros" ohne Variante meint drei verschiedene Pokemon."""
    da = {e["en"] for e in dex["entries"]}
    assert "Paldean Tauros" not in da, (
        "der Sammelname ist zurueck — er passt auf keinen Ladder-Slug "
        "und beschriftet drei Formen als eine")


@pytest.mark.parametrize("en", sorted(VARIANTEN))
def test_deutscher_name_und_typen(dex, en):
    de, t1, t2, _slug = VARIANTEN[en]
    e = next(x for x in dex["entries"] if x["en"] == en)
    assert e["de"] == de
    assert e["t1"] == t1
    assert e["t2"] == t2, f"{en}: Zweittyp {e['t2']!r} statt {t2!r}"
    assert e["form"] == "Regional"


@pytest.mark.parametrize("en", sorted(VARIANTEN))
def test_jede_variante_haengt_an_ihrem_eigenen_ladder_satz(dex, usage, en):
    _de, _t1, _t2, slug = VARIANTEN[en]
    assert slug in usage["pokemon"], f"Ladder-Slug {slug} fehlt in champions_usage.json"
    e = next(x for x in dex["entries"] if x["en"] == en)
    meta = e.get("meta") or {}
    assert meta, f"{en} hat keinen Nutzungsdatensatz — genau die Luecke von damals"
    assert meta.get("slug") == slug, (
        f"{en} zeigt {meta.get('slug')!r} statt {slug!r} — eine Variante "
        "traegt die Werte einer anderen")


@pytest.mark.parametrize("en", sorted(VARIANTEN))
def test_der_name_normalisiert_auf_den_slug(en):
    """Die Verknuepfung haengt am Namen. Ohne diese Gleichheit findet der
    Bauer den Datensatz nicht mehr, ohne dass irgendetwas rot wird."""
    _de, _t1, _t2, slug = VARIANTEN[en]
    assert _norm(en) == _norm(slug)


def test_basiswerte_stimmen_mit_smogon_ueberein(dex):
    """Alle drei teilen sich die Basiswerte — abweichende Werte waeren ein
    stiller Datenfehler, den im Pokedex niemand sieht."""
    smogon = _lies("pokemon_battle_data.json")
    paare = [("Paldean Tauros (Combat Breed)", "Tauros-Paldea-Combat"),
             ("Paldean Tauros (Blaze Breed)", "Tauros-Paldea-Blaze"),
             ("Paldean Tauros (Aqua Breed)", "Tauros-Paldea-Aqua")]
    for en, key in paare:
        e = next(x for x in dex["entries"] if x["en"] == en)
        st = smogon[key]["baseStats"]
        for k in ("hp", "atk", "def", "spa", "spd", "spe"):
            assert e[k]["base"] == st[k], f"{en}.{k}: {e[k]['base']} statt {st[k]}"
        assert smogon[key]["types"][0] == e["t1"]
        assert (smogon[key]["types"][1] if len(smogon[key]["types"]) > 1 else "") == e["t2"]


def test_kein_pokedex_eintrag_ohne_nutzungsdatensatz(dex):
    """Der Grund, warum es diese Datei gibt: die Inventur stand auf 1."""
    ohne = [e["en"] for e in dex["entries"] if not e.get("meta")]
    assert ohne == [], f"{len(ohne)} Eintraege ohne Nutzungsdatensatz: {ohne[:5]}"
