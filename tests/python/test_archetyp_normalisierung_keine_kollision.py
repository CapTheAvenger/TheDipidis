"""Verdacht geprueft (10.09.2026): faellt "n-zoroark" mit "Zoroark" zusammen?

DER VERDACHT

`normalize_archetype_name` in backend/core/card_scraper_shared.py streicht
mit `re.sub(r'^Ns?\\s+', '', name, flags=re.IGNORECASE)` einen fuehrenden
"N " oder "Ns "-Praefix. Der Verdacht war: "n-zoroark" (N's Zoroark, ein
eigener Archetyp seit BRS-SFA) und ein blankes "Zoroark" wuerden auf
denselben Namen fallen und ihre Turnierstatistik verschmelzen.

NACHGEMESSEN — DER VERDACHT STIMMT NICHT

`n-zoroark` normalisiert zu `"N-Zoroark"`, nicht zu `"Zoroark"`:

    "n-zoroark".strip().title()  ->  "N-Zoroark"   (Bindestrich bleibt)
    re.sub(r'^Ns?\\s+', ...)      ->  wirkt NICHT, weil nach "N" kein
                                      LEERZEICHEN steht, sondern "-"

Der Regex verlangt woertlich ein Leerzeichen nach "N"/"Ns". Ueber ALLE
Rohwerte, die diese Codebase tatsaechlich als Archetyp-/Decknamen fuehrt
(siehe QUELLEN unten — 829 eindeutige Werte aus 16 Spalten in
data/*.csv, Stand 10.09.2026), matcht dieser Regex KEIN einziges Mal:
jeder Rohname kommt entweder als Apostroph-Form ("N's Zoroark") oder als
Bindestrich-Slug ("n-zoroark") vor, nie als "N " mit echtem Leerzeichen.
Er ist gegen den heutigen Datenbestand totes Gewebe.

EIN BLANKES "ZOROARK" GIBT ES SOGAR WIRKLICH — UND KOLLIDIERT TROTZDEM NICHT

`data/city_league_analysis_M3.csv` fuehrt tatsaechlich 1.443 Zeilen mit
Archetyp "Zoroark" (japanische City-League-Daten; der dortige Scraper
fasst Decks ueber das Pokemon-Icon zusammen, nicht ueber den vollen
Deck-Namen). Genau das war der Verdachtsfall — trotzdem kollidiert
nichts: `normalize_archetype_name("zoroark")` bleibt `"Zoroark"`,
waehrend `normalize_archetype_name("n-zoroark")` bei `"N-Zoroark"`
landet (Bindestrich, kein Leerzeichen) und `normalize_archetype_name
("N's Zoroark")` bei `"N's Zoroark"` (Apostroph, kein Leerzeichen).
Drei Rohformen, drei verschiedene normalisierte Namen. Die
Zoroark-Familie zerfaellt in data/labs_tournament_decks.csv ausserdem in
eigene, UNTERSCHIEDLICHE Archetypen (Partner-Pokemon macht den
Unterschied):

    n-zoroark              -> N-Zoroark            (kein Partner, "N's Zoroark")
    n-zoroark-lucario       -> N-Zoroark-Lucario
    hisuian-zoroark-vstar   -> Hisuian-Zoroark-Vstar
    archaludon-zoroark      -> Archaludon-Zoroark
    blaziken-zoroark        -> Blaziken-Zoroark
    dragapult-zoroark       -> Dragapult-Zoroark
    zoroark-crustle         -> Zoroark-Crustle
    "N's Zoroark"           -> "N's Zoroark"        (unveraendert; kein
                                                       Leerzeichen nach dem
                                                       Apostroph-S)

DIE VOLLSTAENDIGE GEGENPROBE

Diese Datei prueft nicht nur den einen Verdachtsfall, sondern rechnet
ALLE 829 Rohwerte durch `normalize_archetype_name` und gruppiert nach
Ergebnis: gibt es IRGENDEIN Paar strukturell verschiedener Rohnamen
(nicht nur Gross-/Kleinschreibung — das ist der Zweck der Funktion),
das auf denselben Namen faellt? Gemessen: NEIN, null Kollisionen.

Diese Datei ist als REGRESSIONS-STOLPERDRAHT gedacht: aendert jemand
den Regex kuenftig so, dass er auch Bindestrich- oder Apostroph-Formen
faengt, faellt test_keine_kollision_im_gesamten_datenbestand um, bevor
zwei verschiedene Decks in main als ein Archetyp gezaehlt werden.

NACHTRAG 12.09.2026 — DIE URSACHE IST JETZT WEG, NICHT NUR UNGEFAEHRLICH

Der Befund oben bleibt richtig: der Regex greift gegen den heutigen
Datenbestand nirgends. Er war aber eine geladene Waffe. Sobald
IRGENDEIN Zulieferer "N Zoroark" mit Leerzeichen liefert — und genau
das tut `slug_to_archetype("n-zoroark")`, das aus dem Bindestrich ein
Leerzeichen macht —, haette die alte Fassung daraus "Zoroark"
gemacht und zwei Archetypen verschmolzen, die
data/archetype_icons.json getrennt fuehrt ("N's Zoroark" UND
"Zoroark").

Geaendert wurde deshalb die RICHTUNG, nicht die Reichweite:

    alt:  re.sub(r'^Ns?\\s+', '',      name)   # Trainer wegwerfen
    neu:  re.sub(r'^Ns?\\s+', "N's ",  name)   # Apostroph herstellen

Das ist dieselbe Regel, die
`current_meta_analysis_scraper._POSSESSIVE_TRAINERS` fuer alle anderen
Trainer schon faehrt ("rockets-honchkrow" -> "Rocket's Honchkrow");
dort steht `"n": "N's"` woertlich drin.

GEGENPROBE UEBER DIE ECHTEN DATEN (12.09.2026): alle 829 eindeutigen
Rohwerte aus 16 Spalten einmal mit der alten und einmal mit der neuen
Fassung gerechnet — 0 Rohwerte mit abweichendem Ergebnis, 0
Kollisionen vorher wie nachher, 828 eindeutige Namen vorher wie
nachher. An der heutigen Zuordnung aendert sich NICHTS; entfernt ist
nur die Moeglichkeit.
"""

import csv
import os
import re
import sys

WURZEL = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
DATEN = os.path.join(WURZEL, "data")

sys.path.insert(0, os.path.join(WURZEL, "backend", "core"))
from card_scraper_shared import normalize_archetype_name as norm  # noqa: E402

# Jede Spalte in data/*.csv, die diese Codebase als Archetyp- oder
# Decknamen fuehrt (also plausibel durch normalize_archetype_name lief
# oder liefe). Trennzeichen wie in der jeweiligen Datei.
QUELLEN = [
    ("city_league_analysis.csv", ";", ["archetype"]),
    ("city_league_analysis_M3.csv", ";", ["archetype"]),
    ("city_league_analysis_past.csv", ";", ["archetype"]),
    ("city_league_archetypes.csv", ";", ["archetype"]),
    ("city_league_archetypes_comparison.csv", ";", ["archetype"]),
    ("city_league_archetypes_comparison_M3.csv", ";", ["archetype"]),
    ("city_league_archetypes_deck_stats.csv", ";", ["archetype"]),
    ("city_league_archetypes_past.csv", ";", ["archetype"]),
    ("city_league_archetypes_past_comparison.csv", ";", ["archetype"]),
    ("city_league_archetypes_past_deck_stats.csv", ";", ["archetype"]),
    ("current_meta_card_data.csv", ";", ["archetype"]),
    ("labs_tournament_decks.csv", ",", ["deck_name", "deck_slug"]),
    ("labs_tournament_matchups.csv", ",", ["my_deck_name", "opponent_deck_name"]),
    ("online_api_archetypes.csv", ";", ["archetype_name"]),
    ("limitless_online_decks.csv", ";", ["deck_name"]),
    ("limitless_online_decks_comparison.csv", ";", ["deck_name"]),
]


def _rohwerte():
    werte = set()
    for datei, sep, spalten in QUELLEN:
        pfad = os.path.join(DATEN, datei)
        if not os.path.exists(pfad):
            continue
        with open(pfad, encoding="utf-8-sig") as f:
            for row in csv.DictReader(f, delimiter=sep):
                for sp in spalten:
                    v = (row.get(sp) or "").strip()
                    if v:
                        werte.add(v)
    return werte


def test_der_verdachtsfall_kollidiert_nicht():
    """Der konkret geaeusserte Verdacht: n-zoroark gegen Zoroark."""
    assert norm("n-zoroark") == "N-Zoroark"
    assert norm("N's Zoroark") == "N's Zoroark"
    assert norm("zoroark") == "Zoroark"
    # Die drei muessen sich paarweise unterscheiden — genau das war der
    # Verdacht: dass die ersten beiden auf den dritten Wert fallen.
    werte = {norm("n-zoroark"), norm("N's Zoroark"), norm("zoroark")}
    assert len(werte) == 3, (
        f"n-zoroark, N's Zoroark und Zoroark normalisieren nicht mehr "
        f"auf drei verschiedene Werte: {werte}")


def test_das_blanke_zoroark_ist_real_und_bleibt_trotzdem_getrennt():
    """Der Verdachtsfall existiert wirklich (City-League-JP-Daten), nur
    kollidiert er nicht: normalize_archetype_name haelt die drei
    Schreibweisen auseinander, weil weder Bindestrich noch Apostroph
    das Leerzeichen liefern, das der Praefix-Regex ^Ns?\\s+ verlangt."""
    rohwerte = _rohwerte()
    blank = {v for v in rohwerte if v.strip().lower() == "zoroark"}
    assert blank == {"Zoroark"}, (
        f"erwartet genau die Schreibweise 'Zoroark' als realen Rohwert, "
        f"gefunden: {blank} — Vorpruefung fuer den naechsten Schritt")
    normalisiert = {norm(v) for v in ("Zoroark", "n-zoroark", "N's Zoroark")}
    assert normalisiert == {"Zoroark", "N-Zoroark", "N's Zoroark"}, (
        f"die drei Schreibweisen fallen jetzt zusammen: {normalisiert}")


def test_der_praefix_regex_greift_bei_keinem_heutigen_rohwert():
    """Zeigt, warum der Verdacht nicht eintritt: der Regex verlangt ein
    Leerzeichen nach N/Ns, das in der heutigen Datenlage nie vorkommt."""
    rohwerte = _rohwerte()
    assert len(rohwerte) > 500, (
        f"nur {len(rohwerte)} Rohwerte gefunden — Vorpruefung gegen ein "
        "leeres Bestehen dieses Tests")
    treffer = [v for v in rohwerte
               if re.match(r"^Ns?\s+", v.strip().title(), re.IGNORECASE)]
    assert treffer == [], (
        f"diese Rohwerte matchen jetzt doch den N/Ns-Praefixregex und "
        f"muessen einzeln auf Kollisionen geprueft werden: {treffer}")


def test_keine_kollision_im_gesamten_datenbestand():
    """Die vollstaendige Gegenprobe, nicht nur der eine Verdachtsfall.

    Gemessen am 10.09.2026: 829 eindeutige Rohwerte aus 16 Spalten,
    NULL Kollisionen (mehr als eine strukturell verschiedene
    Schreibweise auf demselben normalisierten Namen). Faellt diese
    Zusicherung, hat ein Datenlauf oder eine Regex-Aenderung zwei
    bislang getrennte Archetypen zusammengelegt."""
    rohwerte = _rohwerte()
    assert len(rohwerte) > 500, f"nur {len(rohwerte)} Rohwerte — zu wenig Grundlage"

    gruppen = {}
    for v in rohwerte:
        gruppen.setdefault(norm(v), set()).add(v)

    kollisionen = {
        out: rohs for out, rohs in gruppen.items()
        if len({r.lower() for r in rohs}) > 1
    }
    assert kollisionen == {}, (
        "normalize_archetype_name fasst verschiedene Decknamen zusammen:\n"
        + "\n".join(f"  {out!r} <- {sorted(rohs)}"
                     for out, rohs in sorted(kollisionen.items()))
    )


def test_ein_fuehrendes_n_wird_zum_trainer_und_nicht_weggeworfen():
    """Die eigentliche Korrektur vom 12.09.2026.

    Kommt der Name je mit LEERZEICHEN an — `slug_to_archetype`
    macht aus jedem Bindestrich eines —, dann darf daraus nicht
    "Zoroark" werden. "N" ist ein Trainername, kein Rauschen."""
    assert norm("N Zoroark") == "N's Zoroark"
    assert norm("Ns Zoroark") == "N's Zoroark"
    assert norm("n zoroark") == "N's Zoroark"
    # Der Fehlerfall, den es zu verhindern gilt:
    assert norm("N Zoroark") != norm("Zoroark"), (
        "ein fuehrendes 'N ' wird wieder ersatzlos gestrichen — "
        "N's Zoroark und Zoroark fallen dann zusammen")


def test_beide_zoroark_archetypen_stehen_getrennt_in_den_icons():
    """Vorpruefung: der Schaden waere real, nicht theoretisch.

    data/archetype_icons.json ist die kanonische Namensliste der
    Seite. Fuehrt sie beide Namen, ist ein Zusammenfallen ein
    Datenfehler und keine Vereinfachung."""
    import json
    pfad = os.path.join(DATEN, "archetype_icons.json")
    with open(pfad, encoding="utf-8") as f:
        icons = json.load(f)
    namen = set(icons.get("archetypes", icons).keys())
    assert "N's Zoroark" in namen, "Vorpruefung: der Trainer-Archetyp fehlt in den Icons"
    assert "Zoroark" in namen, "Vorpruefung: der blanke Archetyp fehlt in den Icons"


def test_die_apostroph_form_wird_nicht_doppelt_angefasst():
    """Kein 'N's N's Zoroark': die Apostroph-Form hat kein Leerzeichen
    nach dem N und matcht deshalb gar nicht erst."""
    assert norm("N's Zoroark") == "N's Zoroark"
    assert norm("N's Zorua") == "N's Zorua"
    assert norm("n-zoroark") == "N-Zoroark"
    # Und ein Pokemon, das zufaellig mit N anfaengt, bleibt heil.
    for name in ("Nidoking", "Noivern", "Ninetales Duskull"):
        assert norm(name) == name, f"{name} wurde angefasst: {norm(name)}"
