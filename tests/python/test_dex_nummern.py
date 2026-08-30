# -*- coding: utf-8 -*-
"""Die Dex-Nummer wird im Namen gesucht, nicht am Namensanfang geraten.

BEFUND (30.08.2026, data/cards_chunk_*.json)
--------------------------------------------
`pokedex_number` fehlte in 1.999 von 17.182 Pokemon-Zeilen — 11,6 %.
Die Luecke folgte vier Mustern, die `get_base_pokemon_name()` nicht
kennt, weil sie nur Suffixe mit Leerzeichen davor abschneidet und eine
feste Praefixliste fuehrt:

    Bindestrich-Zusatz    Mewtwo-EX (16x), Silvally-GX, Charizard-EX
    Besitzer davor        Team Rocket's Mewtwo ex, Iono's Bellibolt ex
    Beiname davor         Teal Mask Ogerpon ex, Mega Lucario ex
    Formangabe dahinter   Castform Sunny Form, Shellos East Sea,
                          Wormadam Plant Cloak, Unown [A], Zapdos G

Was daran hing: die Kartensuche verspricht im Platzhalter die Suche per
Dex-Nummer, und js/app-core.js sortiert Pokemon danach — jede Karte ohne
Nummer landete auf 9999.

`loese_dex_nummer()` probiert stattdessen alle zusammenhaengenden
Wortfolgen des Namens, laengste zuerst. Damit ist es egal, ob die Art
vorne, hinten oder in der Mitte steht.

GEGENPROBE, die diese Datei festhaelt: von den 15.183 Zeilen, die schon
eine Nummer trugen, widerspricht die neue Aufloesung KEINER EINZIGEN.
Sie fuellt 1.878 der 1.999 Luecken (Abdeckung 88,4 % -> 99,3 %).

Was leer bleibt, bleibt es mit Absicht: Tag Teams fuehren zwei Arten,
und eine der beiden Nummern zu nehmen waere eine Behauptung.
"""

import collections
import glob
import json
import os
import sys

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
DATEN = os.path.join(WURZEL, "data")
KERN = os.path.join(WURZEL, "backend", "core")
for pfad in (WURZEL, KERN):
    if pfad not in sys.path:
        sys.path.insert(0, pfad)

from prepare_card_data import (  # noqa: E402
    _dex_entkleide,
    get_base_pokemon_name,
    loese_dex_nummer,
)

POKEMON_TYPEN = {"Basic", "Stage 1", "Stage 2", "VSTAR", "VMAX", "V-UNION",
                 "Restored", "LEGEND", "BREAK"}


@pytest.fixture(scope="module")
def dex():
    with open(os.path.join(DATEN, "pokemon_dex_numbers.json"), encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def karten():
    aus = []
    for pfad in sorted(glob.glob(os.path.join(DATEN, "cards_chunk_*.json"))):
        with open(pfad, encoding="utf-8") as f:
            for c in json.load(f):
                if (c.get("type") or "").strip() in POKEMON_TYPEN:
                    aus.append(c)
    return aus


# ── Die vier Muster, an denen die alte Funktion gescheitert ist ──────

@pytest.mark.parametrize("name,erwartet", [
    ("Mewtwo-EX", 150),                 # Bindestrich statt Leerzeichen
    ("Silvally-GX", 773),
    ("Alolan Ninetales-GX", 38),        # Praefix UND Bindestrich-Suffix
    ("Team Rocket's Mewtwo ex", 150),   # Besitzer davor
    ("Iono's Bellibolt ex", 939),
    ("N's Zoroark ex", 571),
    ("Teal Mask Ogerpon ex", 1017),     # Beiname davor
    ("Bloodmoon Ursaluna ex", 901),
    ("Mega Lucario ex", 448),
    ("Detective Pikachu", 25),
    ("Mega Charizard X ex", 6),         # Art in der MITTE
    ("Mega Charizard Y ex", 6),
    ("Castform Sunny Form", 351),       # Formangabe dahinter
    ("Shellos East Sea", 422),
    ("Wormadam Plant Cloak", 413),
    ("Zapdos G", 145),
    ("Lucario GL", 448),
    ("Rhyperior E4", 464),
    ("Blaziken FB", 257),
    ("Type: Null", 772),                # Doppelpunkt
    ("Unown [A]", 201),                 # Klammer
    ("Ash-Greninja-EX", 658),           # Bindestrich mitten im Namen
    ("Flabébé", 669),                   # Akzent
    ("Ho-Oh", 250),                     # Bindestrich gehoert zum Namen
    ("Mr. Mime-GX", 122),               # Punkt gehoert zum Namen
    ("Porygon-Z", 474),
    ("Tapu Koko Prism Star", 785),      # zweiteiliger Artname
    ("Farfetch'd", 83),
    ("Roaring Moon ex", 1005),
    ("Iron Valiant ex", 1006),
])
def test_muster_werden_aufgeloest(name, erwartet, dex):
    nummer, grund = loese_dex_nummer(name, dex)
    assert nummer == erwartet, "%s -> %r (%s)" % (name, nummer, grund)


def test_die_alte_funktion_haette_das_nicht_geschafft(dex):
    """Belegt, dass die Faelle oben wirklich Luecken waren und der Test
    nicht bloss beschreibt, was ohnehin schon ging."""
    frueher_blind = ["Mewtwo-EX", "Team Rocket's Mewtwo ex",
                     "Teal Mask Ogerpon ex", "Castform Sunny Form",
                     "Mega Charizard X ex", "Type: Null", "Unown [A]"]
    for name in frueher_blind:
        assert get_base_pokemon_name(name) not in dex, (
            "%s war offenbar nie eine Luecke — Beispiel im Test veraltet" % name)
        assert loese_dex_nummer(name, dex)[0], "%s bleibt ungeloest" % name


# ── Was absichtlich leer bleibt ──────────────────────────────────────

@pytest.mark.parametrize("name", [
    "Mewtwo & Mew-GX",
    "Reshiram & Charizard-GX",
    "Arceus & Dialga & Palkia-GX",
    "Raichu & Alolan Raichu-GX",
])
def test_tag_teams_bekommen_keine_nummer(name, dex):
    nummer, grund = loese_dex_nummer(name, dex)
    assert nummer is None, "%s hat eine Nummer bekommen (%s)" % (name, nummer)
    assert "Tag Team" in grund


def test_ohne_dex_liste_wird_nichts_behauptet():
    nummer, grund = loese_dex_nummer("Pikachu", {})
    assert nummer is None
    assert "Dex-Liste" in grund


def test_unbekannter_name_bleibt_leer(dex):
    nummer, grund = loese_dex_nummer("Buried Fossil", dex)
    assert nummer is None
    assert "kein Treffer" in grund


def test_leerer_name_bleibt_leer(dex):
    assert loese_dex_nummer("", dex)[0] is None
    assert loese_dex_nummer(None, dex)[0] is None
    assert loese_dex_nummer("   ", dex)[0] is None


def test_mehrdeutigkeit_entscheidet_nichts():
    """Passen bei gleicher Wortlaenge zwei Arten, wird nichts gesetzt."""
    mini = {"pikachu": 25, "raichu": 26}
    nummer, grund = loese_dex_nummer("Pikachu Raichu", mini)
    assert nummer is None
    assert "mehrdeutig" in grund


@pytest.mark.parametrize("roh,sauber", [
    ("Mewtwo-EX", "mewtwo"),          # Bindestrich trennt das Kuerzel ab
    ("Silvally-GX", "silvally"),
    ("Charizard ex", "charizard"),
    ("Ho-Oh", "ho-oh"),               # ... gehoert aber zum Namen
    ("Porygon-Z", "porygon-z"),
    ("Type: Null", "type null"),
    ("Unown [A]", "unown a"),
])
def test_entkleiden_schneidet_nur_kartenzusaetze_ab(roh, sauber):
    assert _dex_entkleide(roh) == sauber


def test_unsichtbare_zeichen_stoeren_nicht(dex):
    """In den Chunks stand ein Zero-Width Space vor 'Thievul'."""
    assert _dex_entkleide("​Thievul") == "thievul"
    assert loese_dex_nummer("​Thievul", dex)[0] == 828


def test_nidoran_geschlecht_kommt_aus_dem_symbol(dex):
    assert loese_dex_nummer("Nidoran ♀", dex)[0] == pytest.approx(29)
    assert loese_dex_nummer("Nidoran ♂", dex)[0] == pytest.approx(32)


# ── Der ausgelieferte Bestand ────────────────────────────────────────

def test_bestand_wurde_gelesen(karten):
    assert len(karten) > 15000, "zu wenige Pokemon-Zeilen — Test greift ins Leere"


def test_kein_widerspruch_zu_bereits_gesetzten_nummern(karten, dex):
    """Die schaerfste Zusicherung: 15.183 Zeilen trugen schon eine Nummer.
    Wenn die neue Aufloesung auch nur einer davon widerspricht, ist sie
    nicht schaerfer, sondern falsch."""
    schlecht = []
    geprueft = 0
    for c in karten:
        alt = (c.get("pokedex_number") or "").strip()
        if not alt:
            continue
        geprueft += 1
        neu, _ = loese_dex_nummer(c.get("name_en", ""), dex)
        if neu is not None and str(neu) != alt:
            schlecht.append((c.get("name_en"), alt, neu))
    assert geprueft > 10000, "zu wenige belegte Zeilen geprueft: %d" % geprueft
    assert not schlecht, "%d Widersprueche, z. B. %s" % (len(schlecht), schlecht[:5])


def test_abdeckung_ist_deutlich_besser(karten, dex):
    loesbar = sum(1 for c in karten
                  if loese_dex_nummer(c.get("name_en", ""), dex)[0] is not None)
    anteil = loesbar / len(karten)
    assert anteil > 0.98, "Abdeckung nur %.1f %% (vorher 88,4 %%)" % (anteil * 100)


def test_was_offen_bleibt_sind_tag_teams(karten, dex):
    gruende = collections.Counter()
    namen = collections.defaultdict(set)
    for c in karten:
        nummer, grund = loese_dex_nummer(c.get("name_en", ""), dex)
        if nummer is None:
            gruende[grund] += 1
            namen[grund].add(c.get("name_en"))
    andere = {g: sorted(namen[g]) for g, a in gruende.items()
              if "Tag Team" not in g}
    # "Buried Fossil" ist als Basic gefuehrt, ist aber kein Pokemon.
    uebrig = {g: [n for n in ns if n != "Buried Fossil"]
              for g, ns in andere.items()}
    uebrig = {g: ns for g, ns in uebrig.items() if ns}
    assert not uebrig, "ungeklaerte Luecken: %s" % uebrig
