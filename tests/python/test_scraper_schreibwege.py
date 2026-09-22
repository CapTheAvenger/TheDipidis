# -*- coding: utf-8 -*-
"""Wie ein Scraper schreibt, entscheidet, was nach einem Abbruch dasteht.

BEFUNDE VOM 22.09.2026, nachmittags. Ein Pruefagent ist alle 38 Module
unter backend/ durchgegangen und hat vier Bauarten gefunden, die still
das Falsche schreiben koennen:

  1. NICHT ATOMAR. `open(pfad, 'w')` kuerzt die vorhandene Datei, BEVOR
     die erste Zeile drinsteht. Betroffen waren die beiden groessten
     kumulativen Dateien des Projekts — all_cards_database.csv (13,7 MB,
     20.581 Zeilen, traegt card_text_de) und labs_tournament_decks.csv
     (1,0 MB, kumulativ ueber alle Formate) — obwohl der passende Helfer
     in derselben Datei stand und fuer die Matchups auch benutzt wurde.
     Ein Abbruch verliert dort nicht den Lauf, sondern die Historie, und
     der Commit-Schritt committet die halbe Datei.

  2. EIN HALBER ABRUF WIRD AUSGELIEFERT. limitless_online_scraper.py
     erkannte "neuer Stand hat weniger als die Haelfte der bisherigen
     Zeilen", protokollierte das als Fehler — und schrieb trotzdem.

  3. EIN VERWORFENER FEHLER VERSCHIEBT DAS ERGEBNIS. `except: pass` beim
     Lesen eines Chunk-Datums (dann waehlt der Lader ein anderes Meta als
     das laufende) und beim Lesen des Formatfensters (dann meldet der
     Waechter das laufende Set als neu).

  4. EIN LEERER DATENORDNER IST STILL. `get_data_dir()` zeigt im
     Arbeitsbaum auf backend/core/data — gitignoriert und leer. Zwanzig
     Module lesen darueber; lokal liest damit jede Nachschlagetabelle ins
     Leere, in CI nicht. Genau daran ist der Datumsfehler vom 22.09.2026
     DREIMAL vorbeigelaufen.

Diese Datei haelt die Reparaturen fest. Sie prueft Bauart, nicht
Zahlen — nichts hier haengt am Datenstand einer Woche.
"""

import ast
import importlib.util
import io
import json
import os
import re
import sys

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
SCRAPER = os.path.join(WURZEL, "backend", "scrapers")
CORE = os.path.join(WURZEL, "backend", "core")
ABLAEUFE = os.path.join(WURZEL, ".github", "workflows")


def _quelle(pfad):
    with io.open(pfad, encoding="utf-8-sig") as f:
        return f.read()


def _ohne_kommentare(text):
    ohne = "\n".join(z for z in text.split("\n") if not z.lstrip().startswith("#"))
    assert len(ohne) > len(text) * 0.3, "das Ausschneiden hat zu viel entfernt"
    return ohne


# ── 1. Atomar schreiben ─────────────────────────────────────────────

# (Modul, Zielvariablen, die NICHT direkt beschrieben werden duerfen)
GROSSE_SCHREIBER = [
    ("backend/scrapers/all_cards_scraper.py", ("csv_path", "json_path")),
    ("backend/scrapers/labs_tournament_scraper.py", ("csv_path", "json_path")),
]


@pytest.mark.parametrize("modul,ziele", GROSSE_SCHREIBER)
def test_die_grossen_dateien_werden_atomar_geschrieben(modul, ziele):
    """Erst daneben, dann umbenennen — und kein open(..., 'w') daneben.

    Geprueft wird die Bauart am Quelltext, nicht eine Zahl: jeder
    Schreibhelfer dieser Datei muss ueber eine .tmp-Datei gehen und mit
    os.replace umbenennen.
    """
    text = _ohne_kommentare(_quelle(os.path.join(WURZEL, modul)))
    assert "os.replace(" in text, (
        f"{modul} benennt nirgends um — dann werden die grossen Dateien "
        f"direkt ueberschrieben, und ein Abbruch hinterlaesst eine halbe")
    assert ".tmp" in text, f"{modul} schreibt nicht ueber eine vorlaeufige Datei"

    # Und die Schreibstellen der GROSSEN Dateien: kein open(ziel, 'w')
    # mehr auf den Pfaden, die die kumulativen Dateien tragen. Kleine
    # Nebendateien (Quarantaene, Protokolle) sind hier nicht gemeint —
    # bei ihnen kostet ein Abbruch nichts, was nicht der naechste Lauf
    # wieder herstellt.
    baum = ast.parse(text)
    verdaechtig = []
    for knoten in ast.walk(baum):
        if not isinstance(knoten, ast.With):
            continue
        for eintrag in knoten.items:
            ruf = eintrag.context_expr
            if not (isinstance(ruf, ast.Call) and getattr(ruf.func, "id", "") == "open"):
                continue
            if len(ruf.args) < 2:
                continue
            modus = ruf.args[1]
            if not (isinstance(modus, ast.Constant) and "w" in str(modus.value)):
                continue
            ziel = ruf.args[0]
            if isinstance(ziel, ast.Name) and ziel.id in ziele:
                verdaechtig.append(ziel.id)
    assert not verdaechtig, (
        f"{modul} schreibt noch direkt auf {sorted(set(verdaechtig))} — ein "
        f"Abbruch mittendrin hinterlaesst dort eine gekuerzte Datei")


def test_der_helfer_benennt_wirklich_um(tmp_path):
    """Verhalten, nicht nur Quelltext: die Zieldatei bleibt heil, bis sie
    vollstaendig ist."""
    sys.path.insert(0, CORE)
    sys.path.insert(0, SCRAPER)
    spec = importlib.util.spec_from_file_location(
        "labs_schreibweg_test", os.path.join(SCRAPER, "labs_tournament_scraper.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)

    ziel = str(tmp_path / "x.csv")
    m._schreibe_csv_atomar(ziel, ["a", "b"], [{"a": "1", "b": "2"}])
    with io.open(ziel, encoding="utf-8") as f:
        assert f.read().replace("\r\n", "\n") == "a,b\n1,2\n"
    assert not os.path.exists(ziel + ".tmp"), "die vorlaeufige Datei blieb liegen"

    m._schreibe_json_atomar(str(tmp_path / "y.json"), {"k": 1})
    with io.open(str(tmp_path / "y.json"), encoding="utf-8") as f:
        assert json.load(f) == {"k": 1}


# ── 2. Ein halber Abruf wird nicht ausgeliefert ─────────────────────

def test_ein_halber_abruf_wird_nicht_geschrieben():
    """Die Datei der Vorwoche ist besser als eine halbe von heute.

    Dieselbe Regel traegt das Tor im Wochenlauf. Vorher stand hier
    "overwriting anyway" — der Waechter erkannte den halben Abruf und
    schrieb ihn trotzdem aus.
    """
    text = _ohne_kommentare(_quelle(os.path.join(SCRAPER, "limitless_online_scraper.py")))
    i = text.find("existing_row_count > 0 and len(data)")
    assert i > 0, "der Zeilenzahl-Waechter heisst anders — diese Pruefung greift ins Leere"
    block = text[i:i + 1200]
    assert "overwriting anyway" not in block.lower(), (
        "der Waechter schreibt den halben Abruf weiterhin aus")
    assert "return False" in block, (
        "der Waechter meldet, blockiert aber nicht — dann ist er eine Notiz, "
        "keine Sicherung")
    assert "::error::" in block, (
        "der halbe Abruf erscheint nicht als Fehler am Lauf — dann sieht ihn "
        "niemand, der nicht ins Protokoll schaut")


# ── 3. Verworfene Fehler ────────────────────────────────────────────

VERWORFEN = [
    ("backend/core/prepare_card_data.py", "total_rows_manifest += 1",
     "ein unlesbarer Chunk bekommt kein Datum — und der Lader waehlt "
     "'latest' NACH max_date"),
    ("backend/scrapers/limitless_api_scraper.py", 'bekannt.add(str((json.load(datei)).get("current_set")',
     "ohne das laufende Set meldet die Neues-Set-Erkennung genau das Set, "
     "das gerade richtig eingeordnet wird"),
]


@pytest.mark.parametrize("modul,anker,warum", VERWORFEN)
def test_der_fehler_wird_gemeldet_statt_verworfen(modul, anker, warum):
    text = _quelle(os.path.join(WURZEL, modul))
    i = text.find(anker)
    assert i > 0, f"{modul}: {anker!r} nicht gefunden — die Pruefung greift ins Leere"
    block = text[i:i + 1200]
    j = block.find("except")
    assert j > 0, f"{modul}: kein except hinter {anker!r}"
    danach = block[j:j + 800]
    assert "pass" not in danach.split("\n")[1][:40], (
        f"{modul} verwirft den Fehler weiterhin still. {warum}")
    assert "::warning::" in danach or "logger." in danach, (
        f"{modul} meldet den Fehler nicht. {warum}")


# ── 4. Ein leerer Datenordner meldet sich ───────────────────────────

def test_der_leere_datenordner_meldet_sich(tmp_path, monkeypatch, capsys):
    """Der Ermoeglicher des Fehlers vom 22.09.2026.

    Lokal eine Warnung, in CI eine Anmerkung am Lauf — gesperrt wird
    nichts, denn nicht jeder Ablauf saet diesen Ordner.
    """
    sys.path.insert(0, CORE)
    spec = importlib.util.spec_from_file_location(
        "csh_leer_test", os.path.join(CORE, "card_scraper_shared.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)

    leer = tmp_path / "data"
    leer.mkdir()
    (leer / "lauf.log").write_text("nur ein Protokoll", encoding="utf-8")

    monkeypatch.setenv("GITHUB_ACTIONS", "true")
    m._DATENORDNER_GEMELDET = False
    m._melde_leeren_datenordner(str(leer))
    ausgabe = capsys.readouterr().out
    assert "::warning::" in ausgabe, (
        "ein leerer Datenordner erscheint in CI nicht am Lauf — dann liest "
        "ihn niemand, wenn ein Ergebnis nicht stimmt")
    assert "leer" in ausgabe.lower() or "keine einzige" in ausgabe.lower()

    # Eine .log-Datei macht den Ordner nicht voll, eine .json schon.
    (leer / "echt.json").write_text("{}", encoding="utf-8")
    m._DATENORDNER_GEMELDET = False
    m._melde_leeren_datenordner(str(leer))
    assert capsys.readouterr().out.strip() == "", (
        "der Waechter meldet auch bei gefuelltem Ordner — dann schlaegt er "
        "falschen Alarm und wird beim naechsten Mal nicht gelesen")

    # Und er meldet nur EINMAL je Lauf.
    m._DATENORDNER_GEMELDET = True
    m._melde_leeren_datenordner(str(tmp_path / "gibt-es-nicht"))
    assert capsys.readouterr().out.strip() == ""


def test_get_data_dir_ruft_den_waechter():
    text = _ohne_kommentare(_quelle(os.path.join(CORE, "card_scraper_shared.py")))
    i = text.find("def get_data_dir")
    assert i > 0
    block = text[i:i + 900]
    assert "_melde_leeren_datenordner(" in block, (
        "get_data_dir ruft den Waechter nicht mehr — dann ist ein leerer "
        "Datenordner wieder still, und genau daran ist der Datumsfehler vom "
        "22.09.2026 dreimal vorbeigelaufen")


# ── 5. Alle Ablaeufe fahren denselben Python ────────────────────────

def test_alle_ablaeufe_pinnen_dieselbe_python_fassung():
    """Sonst laeuft dieselbe Datei in einem Ablauf und im naechsten nicht.

    BEFUND 22.09.2026: fuenf Ablaeufe standen auf 3.11, dreiundzwanzig auf
    3.12 — und backend/scrapers/limitless_online_scraper.py laesst sich
    unter 3.11 nicht einmal einlesen (verschachtelte Anfuehrungszeichen in
    f-Strings, eine Neuerung von 3.12). Welcher Ablauf welche Datei
    anfasst, entschied damit, ob sie ueberhaupt startet.
    """
    fassungen = {}
    for name in sorted(os.listdir(ABLAEUFE)):
        if not name.endswith((".yml", ".yaml")):
            continue
        for treffer in re.finditer(r"python-version:\s*['\"]?([0-9.]+)['\"]?",
                                   _quelle(os.path.join(ABLAEUFE, name))):
            fassungen.setdefault(treffer.group(1), []).append(name)
    assert fassungen, "kein Ablauf pinnt mehr eine Python-Fassung"
    assert len(fassungen) == 1, (
        "die Ablaeufe fahren verschiedene Python-Fassungen: "
        + "; ".join(f"{v} -> {', '.join(sorted(set(d)))}"
                    for v, d in sorted(fassungen.items()))
        + ". Dann laeuft dieselbe Datei in einem Ablauf und im naechsten nicht.")
