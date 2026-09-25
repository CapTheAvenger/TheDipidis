"""Ein Icon-Slug wird gelesen, nicht aus dem Anzeigenamen gebaut.

BEFUND (Wochenlauf 157, 25.09.2026):

  Der Lauf schrieb `mega-starmie` in data/archetype_icons.json. Die
  Regel dort lautet seit je: der Formzusatz gehoert ans ENDE
  (`starmie-mega`, `excadrill-mega`, `absol-mega`). Drei Zusicherungen
  fielen um.

  Ursache: die beiden City-League-Scraper bauten die Slugs aus
  `cleaned_names` — den ANZEIGENAMEN. Die laufen durch
  fix_mega_pokemon_name(), das aus `starmie-mega` den Namen
  `mega starmie` macht; kleingeschrieben wurde daraus `mega-starmie`.

  Damit schlug auch canonicalize_by_slugs() nie an: es sucht in
  archetype_icons.json, und dort steht `starmie-mega`.

  Aufgefallen ist es erst an diesem Tag, weil mit der Champions League
  Yokohama die ersten Mega-Formen in den japanischen Bestand kamen.

Die `alt`-Werte der Deck-Symbole auf Limitless SIND die Slugs. Gemessen
am 25.09.2026 an Turnier 569: excadrill-mega, clefairy, ogerpon,
slowking, dragapult, dudunsparce, blaziken.
"""

import json
import os
import re

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
SCRAPER = [
    os.path.join(WURZEL, "backend", "scrapers", "city_league_archetype_scraper.py"),
    os.path.join(WURZEL, "backend", "scrapers", "city_league_past_archetype_scraper.py"),
]
ICONS = os.path.join(WURZEL, "data", "archetype_icons.json")


def _quelle(pfad):
    with open(pfad, encoding="utf-8-sig") as f:
        return f.read()


def _ohne_kommentare(text):
    return re.sub(r"(?m)^\s*#.*$", "", text)


@pytest.mark.parametrize("pfad", SCRAPER, ids=lambda p: os.path.basename(p))
def test_die_slugs_kommen_aus_den_rohnamen(pfad):
    quelle = _ohne_kommentare(_quelle(pfad))
    assert len(quelle) > len(_quelle(pfad)) * 0.3, "zu viel ausgeschnitten"
    treffer = re.search(r"slug_candidates\s*=\s*\[([^\]]+)\]", quelle)
    assert treffer, f"{os.path.basename(pfad)}: slug_candidates nicht gefunden"
    zeile = treffer.group(1)
    assert "raw_names" in zeile, (
        f"{os.path.basename(pfad)}: die Slugs werden aus {zeile.strip()!r} "
        f"gebaut. Das sind Anzeigenamen — aus starmie-mega wird darueber "
        f"mega-starmie.")
    assert "cleaned_names" not in zeile, (
        f"{os.path.basename(pfad)}: cleaned_names steht noch in der Zeile")


def test_die_gefuehrten_slugs_halten_die_regel_ein():
    """Gegenprobe an den Daten: kein Slug faengt mit einem Formzusatz an."""
    with open(ICONS, encoding="utf-8") as f:
        tabelle = (json.load(f) or {}).get("archetypes") or {}
    assert tabelle, "archetype_icons.json fuehrt keine Archetypen"
    vorne = sorted({s for slugs in tabelle.values() for s in (slugs or [])
                    if re.match(r"^(mega|alolan|galarian|hisuian|paldean)-", str(s))})
    assert vorne == [], (
        "diese Slugs tragen den Formzusatz vorn statt hinten: %s" % vorne)


def test_die_mega_formen_stehen_hinten():
    """Und die positive Richtung: es GIBT welche mit Zusatz hinten —
    sonst prueft der Test oben ins Leere."""
    with open(ICONS, encoding="utf-8") as f:
        tabelle = (json.load(f) or {}).get("archetypes") or {}
    hinten = {s for slugs in tabelle.values() for s in (slugs or [])
              if str(s).endswith("-mega")}
    assert len(hinten) >= 5, (
        "nur %d Slugs mit Formzusatz hinten — dann sagt die Gegenprobe "
        "nichts" % len(hinten))


def test_fix_mega_pokemon_name_bleibt_der_anzeigename():
    """Der Namensumbau ist nicht falsch — er ist nur kein Slug.

    Diese Zusicherung haelt beides auseinander, damit niemand die
    Funktion 'repariert' und dabei die Anzeigenamen kaputtmacht.
    """
    import sys
    sys.path.insert(0, os.path.join(WURZEL, "backend", "core"))
    shared = pytest.importorskip("card_scraper_shared")
    assert shared.fix_mega_pokemon_name("starmie-mega") == "mega starmie"
    assert shared.fix_mega_pokemon_name("excadrill-mega") == "mega excadrill"
    assert shared.fix_mega_pokemon_name("clefairy") == "clefairy"
