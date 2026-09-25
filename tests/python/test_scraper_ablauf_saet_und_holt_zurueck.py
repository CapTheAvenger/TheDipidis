"""Wer einen Scraper laufen laesst, muss ihm sein Verzeichnis geben — und
das Ergebnis wieder abholen.

BEFUND (25.09.2026, erster Lauf von city-league-nachziehen.yml)
--------------------------------------------------------------
Der Lauf war nach 2 Sekunden GRUEN und hatte nichts getan. Die
Anmerkung sagte, warum:

    „/home/runner/work/TheDipidis/TheDipidis/backend/core/data fuehrt
     keine einzige CSV- oder JSON-Datei. Jede Nachschlagetabelle, die
     von hier gelesen wird, ist damit leer — ohne dass irgendwo ein
     Fehler entsteht."

Die Scraper unter backend/scrapers/ lesen ihre Nachschlagetabellen aus
backend/core/data/, nicht aus data/. Ohne Kartendatenbank bricht
city_league_analysis_scraper.py sofort ab („Karten-Datenbank ist
leer!") — mit Rueckgabewert 0. Und was ein Scraper schreibt, landet
ebenfalls dort; ohne Rueckweg fasst `git add data` es nie an.

Beides ist unsichtbar: der Lauf ist gruen, der Commit ist leer, und auf
der Seite steht der alte Stand. Genau die Sorte Fehler, die
weekly-full-update.yml mit Saat, Saat-Marke und Rueckweg schon einmal
geloest hat — und die ein neuer Ablauf sofort wieder mitbringt, wenn
niemand daran denkt.

WAS HIER GEPRUEFT WIRD
----------------------
Jeder Ablauf, der ein Skript aus backend/scrapers/ oder backend/core/
startet UND danach nach data/ commitet, braucht:

    1. eine Saat nach backend/core/data/
    2. einen Rueckweg von dort nach data/

Geprueft wird am Text des Ablaufs, weil genau das die Stelle ist, an der
es fehlt.
"""

import os
import re

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ABLAEUFE = os.path.join(ROOT, ".github", "workflows")

# Ablaeufe, die ausdruecklich KEINEN Rueckweg brauchen — mit Grund.
AUSNAHMEN = {
    # prepare_card_data.py schreibt selbst nach data/ zurueck
    # (SYNC_PATTERNS); das prueft test_sync_patterns_consistency.py.
    "daily-price-refresh.yml": "prepare_card_data.py synchronisiert selbst",
}


def _ablaeufe():
    if not os.path.isdir(ABLAEUFE):
        pytest.skip("kein .github/workflows im Baum")
    return sorted(n for n in os.listdir(ABLAEUFE)
                  if n.endswith((".yml", ".yaml")))


def _lies(name):
    with open(os.path.join(ABLAEUFE, name), encoding="utf-8") as f:
        return f.read()


def _skripte_mit_get_data_dir():
    """Die Skripte, die ihr Verzeichnis ueber get_data_dir() beziehen.

    Nur SIE lesen und schreiben backend/core/data/. Ein Scraper, der
    „data" fest verdrahtet hat (limitless_api_scraper.py:
    `datenverzeichnis: str = "data"`), arbeitet direkt im Projektstamm
    und braucht weder Saat noch Rueckweg. Die Liste wird deshalb AUS
    DEM QUELLTEXT abgeleitet und nicht hier gepflegt.
    """
    namen = set()
    for unter in ("scrapers", "core"):
        ordner = os.path.join(ROOT, "backend", unter)
        if not os.path.isdir(ordner):
            continue
        for datei in os.listdir(ordner):
            if not datei.endswith(".py"):
                continue
            with open(os.path.join(ordner, datei), encoding="utf-8",
                      errors="replace") as f:
                if "get_data_dir" in f.read():
                    namen.add("%s/%s" % (unter, datei))
    return namen


def _startet_backend_skript(text):
    """Startet der Ablauf ein Skript, das backend/core/data/ benutzt?"""
    for pfad in _skripte_mit_get_data_dir():
        if re.search(r"(backend/)?" + re.escape(pfad), text):
            return True
    return False


def _commitet_data(text):
    return bool(re.search(r"git add\s+(-A\s+)?data\b", text))


def test_jeder_scraper_ablauf_saet_und_holt_zurueck():
    fehlend = []
    for name in _ablaeufe():
        if name in AUSNAHMEN:
            continue
        text = _lies(name)
        if not _startet_backend_skript(text) or not _commitet_data(text):
            continue
        saet = "backend/core/data" in text and re.search(
            r"cp\s+[\"']?data/", text) is not None
        holt = re.search(r"cp\s+[\"']?\$?\{?q\}?[\"']?\s+[\"']?data/", text) \
            or re.search(r"cp\s+[\"']?backend/core/data/", text) \
            or "SYNC_PATTERNS" in text \
            or "prepare_card_data" in text
        if not saet:
            fehlend.append("%s: startet einen Scraper und commitet data/, "
                           "saet aber backend/core/data/ nicht" % name)
        elif not holt:
            fehlend.append("%s: saet backend/core/data/, holt aber nichts "
                           "zurueck — der Commit bliebe leer" % name)
    assert fehlend == [], (
        "Diese Ablaeufe laufen ins Leere, ohne dass es auffaellt "
        "(gruener Lauf, leerer Commit, alter Stand auf der Seite):\n  "
        + "\n  ".join(fehlend))


def test_wer_saet_setzt_auch_eine_marke():
    """Der Rueckweg darf nur zurueckschreiben, was DIESER Lauf erzeugt
    hat. Ohne Zeitmarke kaeme auch die Saat zurueck — und ueberschriebe
    data/ mit dem Stand, den sie von dort geholt hat."""
    fehlend = []
    for name in _ablaeufe():
        text = _lies(name)
        if "backend/core/data" not in text:
            continue
        if not re.search(r"cp\s+[\"']?data/", text):
            continue          # saet nicht
        if not re.search(r"cp\s+[\"']?\$?\{?q\}?[\"']?\s+[\"']?data/", text):
            continue          # hat keinen Rueckweg dieser Bauart
        if "saat.marke" not in text:
            fehlend.append(name)
    assert fehlend == [], (
        "Diese Ablaeufe schreiben aus backend/core/data/ zurueck, ohne die "
        "Saat-Marke zu setzen — dann kaeme auch die Saat zurueck: %s"
        % fehlend)


def test_der_nachzieh_ablauf_saet_die_kartendatenbank():
    """Der Anlass, an der Datei selbst: ohne all_cards_database bricht
    der Scraper mit „Karten-Datenbank ist leer!" ab — und zwar mit
    Rueckgabewert 0."""
    name = "city-league-nachziehen.yml"
    if not os.path.exists(os.path.join(ABLAEUFE, name)):
        pytest.skip("%s nicht im Baum" % name)
    text = _lies(name)
    for noetig in ("all_cards_database.csv", "sets_metadata.json",
                   "format_window.json", "city_league_analysis_scraped.json",
                   "city_league_analysis.csv", "city_league_archetypes.csv"):
        assert noetig in text, (
            "%s saet %s nicht — ohne diese Datei laeuft der Scraper ins "
            "Leere oder streicht den Bestand auf die Zeilen dieses Laufs "
            "zusammen" % (name, noetig))
