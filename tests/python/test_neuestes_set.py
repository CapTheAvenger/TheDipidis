"""Was zuletzt ERSCHIENEN ist — getrennt von dem, was gespielt wird.

BEFUND 16.09.2026
-----------------
Der Filter „Neues Set" in den meistgespielten Karten las
`format_window.current_set`. Das ist das laufende FORMAT, und es
wechselt erst, wenn echte Turnierlisten das neue Set belegen
(`anker_belegt`). Fuer ein Sammelset wie 30C, das am 16.09.2026
erscheint, wechselt es womoeglich nie — der Filter haette dann dauerhaft
das alte Set gezeigt und sich „Neues Set" genannt.

Beide Fragen sind berechtigt, es sind nur zwei:

    current_set    unter welchem Format wird gespielt   (mit Riegel)
    neuestes_set   was ist zuletzt erschienen           (ohne Riegel)

DIE KARENZ VON EINEM TAG ist eine Anweisung des Betreibers vom
16.09.2026: "Nur die meiste genutzten Karten aus dem neuen Set muessen
halt sofort in dem Fall von PBL auf 30C umspringen aber halt auch erst
ab 1 Tag nach Release." `neues_set_filter_ab` haelt genau das fest —
abgeleitet, nicht in der Oberflaeche gerechnet.
"""

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from backend.core.update_sets import (  # noqa: E402
    aktualisiere_neuestes_set, neuestes_set_felder,
)

WURZEL = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", ".."))
FENSTER = os.path.join(WURZEL, "data", "format_window.json")


# ── Die Ableitung ────────────────────────────────────────────────────

def test_die_karenz_ist_genau_ein_tag():
    felder = neuestes_set_felder({"PBL": "2026-07-17", "30C": "2026-09-16"})
    assert felder["neuestes_set"] == "30C"
    assert felder["neuestes_set_release_date"] == "2026-09-16"
    assert felder["neues_set_filter_ab"] == "2026-09-17"


def test_ueber_einen_monatswechsel_hinweg():
    """Ein Tag dazu ist keine Zeichenkettenrechnung.

    Die Daten liegen in der VERGANGENHEIT: _pick_current_set() nimmt nur
    Sets, die schon erschienen sind — ein kuenftiges Datum kaeme hier
    gar nicht an und die Zusicherung liefe ins Leere.
    """
    felder = neuestes_set_felder({"X": "2025-09-30"})
    assert felder["neues_set_filter_ab"] == "2025-10-01"
    felder = neuestes_set_felder({"X": "2025-12-31"})
    assert felder["neues_set_filter_ab"] == "2026-01-01"


def test_ohne_datum_wird_nichts_behauptet():
    """Lieber kein Feld als ein geratenes."""
    assert neuestes_set_felder({}) == {}
    assert neuestes_set_felder({"X": ""}) == {}


def test_ein_kuenftiges_set_zaehlt_noch_nicht():
    import datetime as dt
    morgen = (dt.date.today() + dt.timedelta(days=1)).isoformat()
    felder = neuestes_set_felder({"PBL": "2026-07-17", "XYZ": morgen})
    assert felder["neuestes_set"] == "PBL"


# ── Das Nachtragen in eine bestehende Datei ──────────────────────────

def _fenster(tmp_path, **zusatz):
    daten = {"current_set": "PBL", "oldest_legal_set": "TEF",
             "set_release_date": "2026-07-17",
             "previous_format_key": "TEF-CRI", "set_addition_only": True}
    daten.update(zusatz)
    pfad = tmp_path / "format_window.json"
    pfad.write_text(json.dumps(daten), encoding="utf-8")
    return str(pfad)


def test_nachtragen_laesst_alles_andere_in_ruhe(tmp_path):
    """Die HANDFELDER des Betreibers duerfen dabei nicht verschwinden."""
    pfad = _fenster(tmp_path)
    assert aktualisiere_neuestes_set(pfad, {"PBL": "2026-07-17", "30C": "2026-09-16"})
    d = json.loads(open(pfad, encoding="utf-8").read())
    assert d["neuestes_set"] == "30C"
    assert d["neues_set_filter_ab"] == "2026-09-17"
    # unveraendert:
    assert d["current_set"] == "PBL", (
        "Das Nachtragen darf das FORMAT nicht anfassen — genau dafuer "
        "gibt es den Ankerriegel.")
    assert d["previous_format_key"] == "TEF-CRI"
    assert d["set_addition_only"] is True


def test_ein_ruecksprung_wird_abgelehnt(tmp_path):
    """Derselbe Monotonieriegel wie beim Formatfenster."""
    pfad = _fenster(tmp_path, neuestes_set="30C",
                    neuestes_set_release_date="2026-09-16",
                    neues_set_filter_ab="2026-09-17")
    assert not aktualisiere_neuestes_set(pfad, {"PBL": "2026-07-17"})
    d = json.loads(open(pfad, encoding="utf-8").read())
    assert d["neuestes_set"] == "30C", "ein aelteres Set darf nicht zurueckschreiben"


def test_zweimal_hintereinander_schreibt_nur_einmal(tmp_path):
    pfad = _fenster(tmp_path)
    daten = {"PBL": "2026-07-17", "30C": "2026-09-16"}
    assert aktualisiere_neuestes_set(pfad, daten)
    assert not aktualisiere_neuestes_set(pfad, daten), (
        "unveraendert heisst: kein Schreibvorgang, kein Commit-Rauschen")


# ── Die ausgelieferte Datei ──────────────────────────────────────────

def test_das_gelieferte_formatfenster_fuehrt_die_felder():
    """js/app-tier-meta.js liest sie; fehlen sie, faellt der Filter
    stillschweigend auf current_set zurueck — und niemand merkt es."""
    d = json.loads(open(FENSTER, encoding="utf-8").read())
    for k in ("neuestes_set", "neuestes_set_release_date", "neues_set_filter_ab"):
        assert d.get(k), f"{k} fehlt in data/format_window.json"


def test_die_karenz_in_der_gelieferten_datei_stimmt():
    import datetime as dt
    d = json.loads(open(FENSTER, encoding="utf-8").read())
    erschienen = dt.date.fromisoformat(d["neuestes_set_release_date"])
    ab = dt.date.fromisoformat(d["neues_set_filter_ab"])
    assert (ab - erschienen).days == 1, (
        "Der Filter springt genau einen Tag nach dem Erscheinen um — "
        "Anweisung vom 16.09.2026.")
