"""Der Schreibweg prueft, was er schreibt — und der Waechter meldet Paare.

Am 20.08.2026 lagen in data/tournament_cards_data_cards_TEF-CRI.csv 1.263
von 2.737 Zeilen (46,1 %) zerrissen vor, alle aus Turnier 540: ein
Python-Listen-Text war in die Zeile geraten und hatte average_count,
percentage_in_archetype und is_ace_spec auseinandergeschnitten. Die Datei
ist der Standard-Chunk des Reiters "Vergangenes Meta" und wurde
ausgeliefert und angezeigt. Kein Lauf hatte je geprueft, was er schreibt.

Zweiter Befund derselben Gruppe: city_league_archetypes_past.csv hat nur
die Kopfzeile, city_league_analysis_past.csv 315 Datenzeilen. Zwei Dateien
desselben Fensters widersprechen sich; einzeln ist jede erklaerbar, und
genau deshalb sah die vorhandene Leerstands-Pruefung nichts.
"""

import ast
import importlib.util
import io
import os
import re
import sys

import pytest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


# ---------------------------------------------------------------------------
# Ausgangspruefung des Turnier-Scrapers
# ---------------------------------------------------------------------------

def _lade_pruefung():
    """Nur die Pruefung herausschneiden — die Datei zieht beim Import Netz."""
    quelle = io.open(
        os.path.join(ROOT, "backend", "scrapers", "tournament_scraper_JH.py"),
        encoding="utf-8-sig").read()
    baum = ast.parse(quelle)
    fn = next(n for n in baum.body
              if isinstance(n, ast.FunctionDef) and n.name == "_pruefe_kartenzeilen")
    konst = next(n for n in baum.body
                 if isinstance(n, ast.Assign)
                 and getattr(n.targets[0], "id", "") == "_ZAHL_FORM")
    mod = ast.Module(body=[ast.Import(names=[ast.alias(name="re")]), konst, fn],
                     type_ignores=[])
    ast.fix_missing_locations(mod)
    raum = {}
    exec(compile(mod, "<pruefung>", "exec"), raum)
    return raum["_pruefe_kartenzeilen"]


def test_saubere_zeilen_kommen_durch():
    pruefe = _lade_pruefung()
    pruefe([
        {"average_count": "3,50", "percentage_in_archetype": "100,0", "is_ace_spec": "No"},
        {"average_count": "4", "percentage_in_archetype": "12,5", "is_ace_spec": "Yes"},
        {"average_count": "", "percentage_in_archetype": "", "is_ace_spec": ""},
    ], "x.csv")


def test_die_echte_kaputte_zeile_wird_abgewiesen():
    """Genau die Form, die in TEF-CRI steht."""
    pruefe = _lade_pruefung()
    with pytest.raises(ValueError) as e:
        pruefe([{
            "average_count": "4,\"['0",
            "percentage_in_archetype": "100', '0",
            "is_ace_spec": "No']\"",
        }], "tournament_cards_data_cards_TEF-CRI.csv")
    text = str(e.value)
    assert "Nichts geschrieben" in text
    assert "average_count" in text
    assert "percentage_in_archetype" in text
    assert "is_ace_spec" in text


def test_die_pruefung_haengt_vor_dem_schreiben():
    """Die Wertpruefung muss vor JEDEM Schreiben liegen.

    Der Anker war bis zum 06.09.2026 `writer.writerows(rows)` und wurde
    ueber die GANZE Datei gesucht. Seit das Schreiben in
    `_schreibe_csv_kopftreu` liegt — der Helfer, der die Spalten gegen die
    vorhandene Kopfzeile abgleicht —, gibt es diese Zeile dort nicht mehr,
    und der Helfer steht ausserdem OBERHALB von save_csv_files. Ueber die
    ganze Datei gemessen waere die Reihenfolge damit scheinbar verletzt,
    obwohl sie stimmt.

    Deshalb wird jetzt innerhalb von save_csv_files gemessen. Das ist
    schaerfer als vorher: ein Schreibaufruf, der irgendwo anders in der
    Datei auftaucht, kann die Zusicherung nicht mehr erfuellen."""
    quelle = io.open(
        os.path.join(ROOT, "backend", "scrapers", "tournament_scraper_JH.py"),
        encoding="utf-8-sig").read()
    a = quelle.index("def save_csv_files(")
    block = quelle[a:]
    aufruf = block.index("_pruefe_kartenzeilen(c_rows, cards_f)")
    schreiben = block.index("_schreibe_csv_kopftreu(f_path, rows, append_mode)")
    assert aufruf < schreiben, "die Pruefung laeuft erst nach dem Schreiben"

    # Und: es gibt in save_csv_files keinen zweiten, ungeprueften Schreibweg.
    ende = block.index("return overview_f, cards_f")
    rumpf = block[:ende]
    assert "csv.DictWriter" not in rumpf, (
        "save_csv_files schreibt wieder selbst, statt ueber den kopftreuen "
        "Helfer — dann greift weder die Wert- noch die Spaltenpruefung.")


def test_der_chunk_ist_wieder_sauber():
    """Am 21.08.2026 repariert — vorher stand hier die Umkehrung.

    Bis dahin hielt dieser Test fest, dass die Datei kaputt IST, damit
    die Sonderbehandlung im Frontend eine Begruendung hat. Die 1.263
    zerrissenen Zeilen sind jetzt nachgerechnet
    (scripts/repariere_turnier_kartenzeilen.py), also dreht sich die
    Zusicherung um.

    Die Sonderbehandlung in js/app-past-meta.js bleibt trotzdem stehen:
    sie kostet nichts und faengt den naechsten Schreibfehler ab, bevor er
    als Zahl auf dem Schirm landet. Das prueft der Test darunter.
    """
    pfad = os.path.join(ROOT, "data", "tournament_cards_data_cards_TEF-CRI.csv")
    roh = io.open(pfad, encoding="utf-8-sig").read()
    assert "['0" not in roh, "TEF-CRI enthaelt wieder Listen-Text"


def test_die_sonderbehandlung_im_frontend_bleibt():
    """Ein Netz nimmt man nicht weg, weil gerade niemand faellt."""
    quelle = io.open(os.path.join(ROOT, "js", "app-past-meta.js"),
                     encoding="utf-8").read()
    assert "function pastMetaZahlFeld(" in quelle
    assert "PM_ZAHL_FORM" in quelle


# ---------------------------------------------------------------------------
# Waechter: Paare, die nur gemeinsam etwas bedeuten
# ---------------------------------------------------------------------------

spec = importlib.util.spec_from_file_location(
    "data_guardian_paare", os.path.join(ROOT, "scripts", "data_guardian.py"))
data_guardian = importlib.util.module_from_spec(spec)
sys.modules["data_guardian_paare"] = data_guardian
spec.loader.exec_module(data_guardian)


def test_widerspruch_zwischen_zwei_dateien_desselben_fensters():
    findings = []
    data_guardian.check_paired_emptiness(findings, {
        "city_league_archetypes_past.csv": True,
        "city_league_analysis_past.csv": False,
    })
    assert len(findings) == 1
    stufe, text = findings[0]
    assert stufe == "CRITICAL"
    assert "city_league_archetypes_past.csv" in text
    assert "disagree" in text


def test_beide_leer_ist_kein_widerspruch():
    findings = []
    data_guardian.check_paired_emptiness(findings, {
        "city_league_archetypes_past.csv": True,
        "city_league_analysis_past.csv": True,
    })
    assert findings == []


def test_beide_gefuellt_ist_kein_widerspruch():
    findings = []
    data_guardian.check_paired_emptiness(findings, {
        "city_league_archetypes_past.csv": False,
        "city_league_analysis_past.csv": False,
    })
    assert findings == []


def test_der_waechter_laeuft_auch_beim_ersten_lauf():
    """Der Paar-Widerspruch ist eine Aussage ueber den Zustand, nicht ueber
    eine Veraenderung — er darf nicht hinter der Grundlinie haengen."""
    quelle = io.open(os.path.join(ROOT, "scripts", "data_guardian.py"),
                     encoding="utf-8").read()
    aufruf = quelle.index("\n    check_paired_emptiness(findings, empties)")
    else_block = quelle.index("\n        check_emptiness(findings, empties")
    assert aufruf > else_block, "steht vor dem else-Zweig"
    # Vier Leerzeichen Einrueckung = Funktionsebene, nicht im else.
    zeile = quelle[aufruf + 1:].split("\n", 1)[0]
    assert zeile.startswith("    check_paired"), zeile
