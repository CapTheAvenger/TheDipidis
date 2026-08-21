"""Kein Turnier-Chunk darf zerrissene Kartenzeilen enthalten.

BEFUND (gemessen 20./21.08.2026): in
data/tournament_cards_data_cards_TEF-CRI.csv waren 1.263 von 2.737 Zeilen
(46,1 %) zerrissen — alle aus Turnier 540 (Special Event Turin). Ein
Python-Listen-Text war in die Zeile geraten und hatte drei Werte
unbrauchbar gemacht: average_count, percentage_in_archetype und
is_ace_spec.

Der Schutz davor (_pruefe_kartenzeilen in tournament_scraper_JH.py) kam
erst am 20.08.2026 dazu und wirkt nur beim Schreiben. Die bereits
ausgelieferte Datei blieb kaputt — TEF-CRI ist der Standard-Chunk des
Reiters "Vergangenes Meta", die Zahlen standen also live auf der Seite.
Repariert am 21.08.2026 mit scripts/repariere_turnier_kartenzeilen.py:
die beiden Zahlen aus den unversehrten Spalten derselben Zeile
nachgerechnet, is_ace_spec geleert statt geraten.

Dieser Test haelt beides fest: dass keine Datei mehr zerrissen ist, und
dass der Schutz beim Schreiben noch steht.
"""

import csv
import glob
import os
import re

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, "data")

ZAHL = re.compile(r"^-?\d+(?:[.,]\d+)?$")
ACE_ERLAUBT = ("", "Yes", "No", "True", "False", "1", "0")

CHUNKS = sorted(glob.glob(os.path.join(DATA, "tournament_cards_data_cards*.csv")))


def _zeilen(pfad):
    with open(pfad, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f, delimiter=";"))


def test_es_gibt_ueberhaupt_chunks():
    assert len(CHUNKS) >= 10, f"nur {len(CHUNKS)} Chunks gefunden"


@pytest.mark.parametrize("pfad", CHUNKS, ids=[os.path.basename(p) for p in CHUNKS])
def test_kartenzeilen_haben_die_erwartete_form(pfad):
    zeilen = _zeilen(pfad)
    if not zeilen or "average_count" not in zeilen[0]:
        pytest.skip("kein Kartenformat")
    fehler = []
    for i, z in enumerate(zeilen, start=2):
        for feld in ("average_count", "percentage_in_archetype"):
            wert = str(z.get(feld, ""))
            if wert and not ZAHL.match(wert):
                fehler.append(f"Zeile {i}: {feld}={wert!r} (Turnier {z.get('tournament_id')})")
        ace = str(z.get("is_ace_spec", "")).strip()
        if ace not in ACE_ERLAUBT:
            fehler.append(f"Zeile {i}: is_ace_spec={ace!r} (Turnier {z.get('tournament_id')})")
        if len(fehler) >= 5:
            break
    assert not fehler, (
        f"{os.path.basename(pfad)}: {len(fehler)}+ zerrissene Werte\n  "
        + "\n  ".join(fehler)
    )


@pytest.mark.parametrize("pfad", CHUNKS, ids=[os.path.basename(p) for p in CHUNKS])
def test_die_zahlen_stimmen_mit_ihren_eingaben_ueberein(pfad):
    """average_count und percentage_in_archetype sind aus derselben Zeile
    ableitbar. Weicht der Wert ab, stimmt etwas anderes nicht — das faellt
    sonst nirgends auf."""
    zeilen = _zeilen(pfad)
    if not zeilen or "average_count" not in zeilen[0]:
        pytest.skip("kein Kartenformat")

    def zahl(w):
        return float(str(w).replace(",", "."))

    abweichungen = []
    geprueft = 0
    for i, z in enumerate(zeilen, start=2):
        try:
            gesamt = int(z["total_count"])
            listen = int(z["deck_inclusion_count"])
            decks = int(z["total_decks_in_archetype"])
            schnitt = zahl(z["average_count"])
            anteil = zahl(z["percentage_in_archetype"])
        except (KeyError, ValueError):
            continue
        if listen <= 0 or decks <= 0:
            continue
        geprueft += 1
        if abs(schnitt - round(gesamt / listen, 2)) > 0.011:
            abweichungen.append(
                f"Zeile {i}: average_count {schnitt} statt {round(gesamt/listen, 2)}")
        if abs(anteil - round(listen / decks * 100, 2)) > 0.011:
            abweichungen.append(
                f"Zeile {i}: percentage {anteil} statt {round(listen/decks*100, 2)}")
        if len(abweichungen) >= 5:
            break
    assert geprueft > 0, "nichts pruefbar"
    assert not abweichungen, (
        f"{os.path.basename(pfad)}: {len(abweichungen)}+ Abweichungen\n  "
        + "\n  ".join(abweichungen)
    )


class TestSchutzBeimSchreiben:
    def test_die_pruefung_vor_dem_schreiben_steht_noch(self):
        pfad = os.path.join(ROOT, "backend", "scrapers", "tournament_scraper_JH.py")
        with open(pfad, encoding="utf-8-sig") as f:
            quelle = f.read()
        assert "def _pruefe_kartenzeilen(" in quelle
        assert "_pruefe_kartenzeilen(" in quelle.split("def _pruefe_kartenzeilen(", 1)[1], (
            "die Pruefung wird nirgends aufgerufen"
        )
        assert "raise ValueError" in quelle

    def test_das_reparaturskript_liegt_bei(self):
        pfad = os.path.join(ROOT, "scripts", "repariere_turnier_kartenzeilen.py")
        assert os.path.exists(pfad), (
            "ohne das Skript ist nicht nachvollziehbar, wie die Zahlen entstanden sind"
        )
        with open(pfad, encoding="utf-8") as f:
            quelle = f.read()
        assert 'zeile["is_ace_spec"] = ""' in quelle, (
            "is_ace_spec darf nicht geraten werden"
        )
