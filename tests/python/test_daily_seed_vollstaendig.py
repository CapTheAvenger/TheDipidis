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
    """Alle Dateinamen, die prepare_card_data.py aus data_dir LIEST.

    NACHGESCHAERFT (30.08.2026). Die Erkennung verlangte vorher, dass
    der Pfad direkt in `load_csv(os.path.join(data_dir, '...'))` oder
    `load_json(...)` steht. Damit sah sie 2 von 5 echten Eingaben:
    price_data.csv, pokemonproxies_url_map.json und
    pokemon_dex_numbers.json werden ueber eine Zwischenvariable und ein
    blankes `open()` gelesen und fielen durch.

    Das war teuer: `pokemon_dex_numbers.json` wurde nirgends geseedet,
    `load_pokedex()` gab still {} zurueck, und `pokedex_number` stand in
    20.878 von 20.878 Kartenzeilen leer — die Pokedex-Suche im Frontend
    lieferte nie einen Treffer. Der Waechter hier war dafuer gebaut und
    hat es nicht gesehen.

    Jetzt wird jeder data_dir-Pfad erfasst und danach entschieden, ob er
    gelesen oder geschrieben wird. Eine neue Eingabe faellt damit
    automatisch auf, egal mit welchem Leser sie geholt wird.
    """
    quelle = _lies(os.path.join("backend", "core", "prepare_card_data.py"))

    # Jeder os.path.join(data_dir, '<datei>') — samt der Variable, der er
    # zugewiesen wird (falls es eine gibt).
    muster = re.compile(
        r"(?:(\w+)\s*=\s*)?os\.path\.join\(\s*data_dir\s*,\s*['\"]([^'\"]+)['\"]\s*\)")
    kandidaten = {}          # datei -> variablenname oder None
    for m in muster.finditer(quelle):
        kandidaten.setdefault(m.group(2), m.group(1))

    assert kandidaten, "keine data_dir-Pfade erkannt — die Erkennung greift nicht"

    def wird_geschrieben(datei, var):
        # Ein Ausgabepfad landet in open(..., 'w') oder in einem Writer.
        if var:
            if re.search(r"open\(\s*" + re.escape(var) + r"\s*,\s*['\"][wa]", quelle):
                return True
        return bool(re.search(
            r"open\(\s*os\.path\.join\(\s*data_dir\s*,\s*['\"]"
            + re.escape(datei) + r"['\"]\s*\)\s*,\s*['\"][wa]", quelle))

    def wird_gelesen(datei, var):
        if re.search(r"load_(?:csv|json)\(\s*os\.path\.join\(\s*data_dir\s*,\s*"
                     r"['\"]" + re.escape(datei) + r"['\"]", quelle):
            return True
        if not var:
            return False
        # open(var) ohne Modus ist Lesen; os.path.exists/isfile davor auch.
        return bool(re.search(r"open\(\s*" + re.escape(var) + r"\s*[,)]", quelle)
                    or re.search(r"load_(?:csv|json)\(\s*" + re.escape(var) + r"\s*\)", quelle))

    gelesen = {d for d, v in kandidaten.items()
               if wird_gelesen(d, v) and not wird_geschrieben(d, v)}
    assert len(gelesen) >= 4, (
        f"nur {len(gelesen)} Eingaben erkannt ({sorted(gelesen)}) — die "
        f"Erkennung greift nicht mehr, und dann winkt dieser Waechter alles "
        f"durch. Kandidaten waren: {sorted(kandidaten)}"
    )
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
    # KEINE Ausnahme fuer "liegt doch im Repo unter data/". Ich hatte am
    # 30.08.2026 eine eingebaut und damit den Waechter entschaerft: die
    # Gegenprobe (pokemonproxies_url_map.json aus dem Seed streichen) lief
    # danach gruen durch, obwohl der Lauf die Datei nicht mehr bekommen
    # haette. Ob eine Datei im Repo liegt, sagt nichts darueber, ob der
    # Leser sie DORT sucht — prepare_card_data.py liest sie aus data_dir.
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
