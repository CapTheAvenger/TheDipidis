"""Ein Lauf ohne Ergebnis ist entweder erklaerbar oder ein Defekt.

BEFUND (21.08.2026): city_league_past_archetype_scraper.py schrieb bei
leerem Ergebnis nichts und meldete "ERFOLGREICH BEENDET". Genau so ist
unbemerkt geblieben, dass die Deck-Symbole seit dem 31.07. in einer
anderen Tabellenspalte stehen: data/city_league_archetypes_past.csv hat
73 Byte, die Kartenanalyse desselben Fensters 315 Zeilen. Zwei Dateien,
die dasselbe Fenster beschreiben, widersprachen sich wochenlang, ohne
dass ein Lauf rot wurde.

Der Unterschied, auf den es ankommt: wurden Tabellenzeilen GELESEN und
trotzdem kein Archetyp gewonnen, hat die Quelle ihr Layout geaendert —
das ist ein Fehler. Sind alle Turniere erklaerbar ausgefallen (zu
klein, nicht erreichbar), ist das eine Meldung.
"""

import ast
import os
import re

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
PAST = os.path.join(WURZEL, "backend", "scrapers",
                    "city_league_past_archetype_scraper.py")
AKTUELL = os.path.join(WURZEL, "backend", "scrapers",
                       "city_league_archetype_scraper.py")


def _quelle(pfad):
    with open(pfad, encoding="utf-8-sig") as f:
        return f.read()


def _funktion(pfad, name):
    baum = ast.parse(_quelle(pfad))
    for k in baum.body:
        if isinstance(k, ast.FunctionDef) and k.name == name:
            return k
    raise AssertionError(f"{os.path.basename(pfad)}: {name}() nicht gefunden")


def test_main_gibt_werte_zurueck():
    """Ohne Rueckgabewert kann der Einstieg gar nichts melden."""
    fn = _funktion(PAST, "main")
    werte = [k.value for k in ast.walk(fn) if isinstance(k, ast.Return)]
    assert werte, "main() gibt nirgends etwas zurueck"
    zahlen = {k.value for k in werte
              if isinstance(k, ast.Constant) and isinstance(k.value, int)}
    assert 0 in zahlen and 1 in zahlen, (
        f"main() kennt nur die Rueckgabewerte {sorted(zahlen)} — ein "
        f"Layoutwechsel der Quelle muss zu 1 fuehren koennen.")


def test_einstieg_reicht_den_wert_durch():
    quelle = _quelle(PAST)
    assert re.search(r"sys\.exit\(\s*main\(\)", quelle), (
        "der __main__-Block wirft den Rueckgabewert von main() weg")


def test_zeilenweite_symbolsuche_in_beiden_scrapern():
    """Der Juli-Fix im aktuellen Scraper muss auch im Past-Zwilling stehen."""
    for pfad in (PAST, AKTUELL):
        quelle = _quelle(pfad)
        assert "row.select('img.pokemon')" in quelle, (
            f"{os.path.basename(pfad)}: sucht die Deck-Symbole nicht "
            f"zeilenweit. Japan Championships schieben eine Laender-Spalte "
            f"ein; eine feste Spaltennummer verliert dort genau das eine "
            f"grosse Turnier.")
        assert "cells[2].select('img.pokemon')" not in quelle


def test_verwurfsgruende_werden_gezaehlt():
    quelle = _quelle(PAST)
    for grund in ("kein_symbol", "platzierung_nicht_numerisch",
                  "turnier_zu_klein", "zeilen_gesehen"):
        assert grund in quelle, (
            f"Verwurfsgrund {grund!r} wird nicht gezaehlt — ohne die "
            f"Aufschluesselung sieht Saisonpause aus wie Layoutwechsel.")


def test_gelesene_zeilen_ohne_archetyp_sind_ein_fehler():
    """Die Bedingung selbst, nicht nur ihr Vorhandensein."""
    quelle = _quelle(PAST)
    stelle = quelle.index("erklaert = (")
    ausschnitt = quelle[stelle:stelle + 1600]
    assert "zeilen_gesehen" in ausschnitt
    assert "return 1" in ausschnitt, (
        "der Zweig 'Zeilen gelesen, 0 Archetypen' endet nicht mit 1")
    assert "::error::" in ausschnitt


def test_aktueller_zwilling_meldet_leerlauf_ohne_fehler():
    """Im laufenden JP-Fenster ist leer derzeit richtig (Saisonpause) —
    sichtbar muss es trotzdem sein."""
    quelle = _quelle(AKTUELL)
    assert "::warning::city_league_archetype_scraper" in quelle
    assert "::error::city_league_archetype_scraper: 0 Archetypen" not in quelle
