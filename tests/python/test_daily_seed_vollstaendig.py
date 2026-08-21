"""Wer prepare_card_data.py laufen laesst, muss ihm alle Eingaben geben.

BEFUND (gemessen 21.08.2026): .github/workflows/daily-price-refresh.yml
kopierte sieben Dateien nach backend/core/data/, darunter NICHT
japanese_cards_database.csv und nicht pokemonproxies_url_map.json.
prepare_card_data.py liest beide. Ohne sie entsteht eine
zusammengefuehrte Kartendatenbank ohne japanische Karten — und der
Schritt "Commit + push price updates" committet genau diese Datei.

Messung des Tages:
    Wochenlauf 06:20  -> all_cards_merged.json mit 76 M6-Karten
    Preislauf  08:13  -> all_cards_merged.json mit 0 japanischen Karten
    japanese_cards_database.csv unveraendert bei 772 Zeilen

Der Wochenlauf laeuft dienstags und freitags, der Preislauf taeglich.
Japanische Karten waren im Deck Builder also an fuenf von sieben Tagen
verschwunden — und niemand hat einen Fehler gesehen, weil beide Laeufe
gruen waren.

Dieser Test leitet die Pflichtliste AUS DEM QUELLTEXT von
prepare_card_data.py ab. Kommt dort eine Eingabe dazu, faellt er — genau
dann, wenn jemand daran denken muss.
"""

import os
import re

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

WORKFLOWS = {
    "daily-price-refresh.yml": "taeglicher Preislauf",
    "weekly-full-update.yml": "Wochenlauf",
}


def _lies(pfad):
    with open(os.path.join(ROOT, pfad), encoding="utf-8") as f:
        return f.read()


@pytest.fixture(scope="module")
def eingaben():
    """Alle Dateinamen, die prepare_card_data.py aus data_dir liest."""
    quelle = _lies(os.path.join("backend", "core", "prepare_card_data.py"))
    treffer = set(re.findall(r"os\.path\.join\(\s*data_dir\s*,\s*'([^']+)'", quelle))
    treffer |= set(re.findall(r'os\.path\.join\(\s*data_dir\s*,\s*"([^"]+)"', quelle))
    # Ausgaben interessieren hier nicht — nur, was gelesen wird.
    gelesen = {n for n in treffer
               if re.search(r"load_csv\(os\.path\.join\(data_dir, '" + re.escape(n) + r"'\)",
                            quelle)
               or re.search(r"load_json\(os\.path\.join\(data_dir, '" + re.escape(n) + r"'\)",
                            quelle)}
    assert gelesen, f"keine Eingaben erkannt (gefunden: {sorted(treffer)})"
    return gelesen


def _seed_liste(workflow: str) -> set:
    text = _lies(os.path.join(".github", "workflows", workflow))
    i = text.find("Seed backend/core/data/ from data/")
    assert i > 0, f"{workflow}: kein Seed-Schritt gefunden"
    j = text.find("; do", i)
    assert j > i, f"{workflow}: Seed-Schleife nicht lesbar"
    block = text[i:j]
    # Kommentarzeilen raus — sie nennen Dateinamen absichtlich.
    zeilen = [z for z in block.splitlines() if not z.strip().startswith("#")]
    return set(re.findall(r"([a-z0-9_]+\.(?:csv|json))", "\n".join(zeilen)))


@pytest.mark.parametrize("workflow,beschreibung", list(WORKFLOWS.items()))
def test_der_seed_enthaelt_jede_eingabe(workflow, beschreibung, eingaben):
    geseedet = _seed_liste(workflow)
    fehlend = sorted(eingaben - geseedet)
    assert not fehlend, (
        f"{beschreibung} ({workflow}) kopiert diese Eingaben von "
        f"prepare_card_data.py nicht nach backend/core/data/: {fehlend}. "
        "Das Ergebnis wird trotzdem committet — die fehlenden Daten "
        "verschwinden dann aus all_cards_merged.json."
    )


def test_die_japanische_datenbank_steht_in_beiden_listen():
    """Die Datei, an der es konkret hing — beim Namen genannt."""
    for workflow in WORKFLOWS:
        assert "japanese_cards_database.csv" in _seed_liste(workflow), workflow


def test_der_preislauf_committet_die_zusammengefuehrte_datenbank():
    """Belegt, warum das Saatgut ueberhaupt zaehlt: die Datei geht raus."""
    text = _lies(os.path.join(".github", "workflows", "daily-price-refresh.yml"))
    i = text.find("git add")
    assert i > 0
    block = text[i:i + 600]
    assert "all_cards_merged.json" in block, (
        "wenn der Preislauf die Datei nicht mehr committet, ist dieser "
        "Test gegenstandslos — dann bitte streichen statt anpassen"
    )
