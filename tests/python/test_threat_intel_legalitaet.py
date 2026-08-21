"""Was in den Counter-Empfehlungen steht, muss im Format spielbar sein.

BEFUND (21.08.2026): data/active_threats.json trug
`format_label: "TEF-MEZ"`. MEZ ist ein japanisches Set und in keinem
internationalen Format legal. Ursache: load_legal_set_codes() kannte
nur eine UNTERgrenze (TEF) und nahm alles darueber mit — also auch
M4, M5, M6, MEM und MEZ, die in sets.json ueber dem aktuellen Set
rangieren.

Die Grenze nach oben ist jetzt das current_set aus format_window.json,
und der japanische Zweig wird zusaetzlich abgezogen — abgeleitet aus
format_window, der japanischen Kartendatenbank und dem Namensmuster
M<Zahl>, nicht aus einer handgepflegten Liste.

Ausserdem: ein leeres Ergebnis darf active_threats.json nicht
ueberschreiben. Die Datei ist die Grundlage des Technik-Audits; ein
Lauf ohne Eingangsdaten hat kein kleineres Ergebnis, sondern gar keins.
"""

import importlib.util
import json
import os
import sys

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
QUELLE = os.path.join(WURZEL, "backend", "tools", "build_threat_intel.py")


@pytest.fixture(scope="module")
def modul():
    sys.path.insert(0, os.path.join(WURZEL, "backend", "core"))
    spec = importlib.util.spec_from_file_location("bti_test", QUELLE)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_obergrenze_schneidet_alles_ueber_dem_aktuellen_set_ab(modul):
    with open(os.path.join(WURZEL, "data", "sets.json"), encoding="utf-8") as f:
        order = {k: int(v) for k, v in json.load(f).items()
                 if isinstance(v, (int, float))}
    legal, label = modul.load_legal_set_codes(order)
    assert legal, "ohne legale Sets faellt der Filter ganz aus"

    with open(os.path.join(WURZEL, "data", "format_window.json"), encoding="utf-8") as f:
        aktuell = json.load(f)["current_set"]
    assert label == f"{modul.LEGAL_FORMAT_MIN_SET}-{aktuell}"

    grenze = order[aktuell]
    zu_neu = sorted(s for s in legal if order.get(s, 0) > grenze)
    assert not zu_neu, f"Sets oberhalb von {aktuell} als legal gefuehrt: {zu_neu}"
    zu_alt = sorted(s for s in legal
                    if order.get(s, 0) < order[modul.LEGAL_FORMAT_MIN_SET]
                    and s not in modul.ALWAYS_LEGAL_SETS)
    assert not zu_alt, f"rotierte Sets als legal gefuehrt: {zu_alt}"


def test_japanische_sets_sind_nicht_legal(modul):
    with open(os.path.join(WURZEL, "data", "sets.json"), encoding="utf-8") as f:
        order = {k: int(v) for k, v in json.load(f).items()
                 if isinstance(v, (int, float))}
    legal, _ = modul.load_legal_set_codes(order)
    for jp in ("M4", "M5", "M6", "MEM", "MEZ"):
        if jp in order:
            assert jp not in legal, (
                f"{jp} ist ein japanisches Set und darf nicht in den "
                f"Counter-Empfehlungen auftauchen.")


def test_ohne_aufloesbares_aktuelles_set_wird_nicht_gefiltert(modul, monkeypatch, capsys):
    """Lieber gar keine Grenze als eine geratene — und sichtbar sagen."""
    monkeypatch.setattr(modul, "load_format_code", lambda: "GIBTESNICHT")
    legal, label = modul.load_legal_set_codes({"TEF": 136, "PBL": 155})
    ausgabe = capsys.readouterr().out
    assert legal == set() and label == ""
    assert "::warning::" in ausgabe


def test_leeres_ergebnis_ueberschreibt_die_datei_nicht(modul, monkeypatch, capsys):
    geschrieben = []
    monkeypatch.setattr(modul, "save", lambda p: geschrieben.append(p))
    monkeypatch.setattr(modul, "build", lambda: {"threats": {}, "counters": {}})
    rc = modul.main()
    ausgabe = capsys.readouterr().out
    assert rc == 1, "ein leeres Ergebnis muss den Lauf rot faerben"
    assert not geschrieben, "active_threats.json wurde trotz leerem Ergebnis geschrieben"
    assert "::error::" in ausgabe


def test_echtes_ergebnis_wird_geschrieben(modul, monkeypatch):
    geschrieben = []
    monkeypatch.setattr(modul, "save", lambda p: geschrieben.append(p))
    monkeypatch.setattr(modul, "build", lambda: {
        "threats": {"hand_disruption": {"weighted_meta_share": 0.2, "cards": []}},
        "counters": {},
    })
    rc = modul.main()
    assert rc == 0
    assert len(geschrieben) == 1


def test_ausgelieferte_datei_traegt_ein_legales_label():
    """Der Zustand im Repo, nicht nur die Funktion."""
    with open(os.path.join(WURZEL, "data", "active_threats.json"), encoding="utf-8") as f:
        daten = json.load(f)
    with open(os.path.join(WURZEL, "data", "format_window.json"), encoding="utf-8") as f:
        fenster = json.load(f)
    assert daten["format_label"].endswith("-" + fenster["current_set"]), (
        f"active_threats.json ist mit {daten['format_label']!r} beschriftet, "
        f"das aktuelle Set ist {fenster['current_set']!r}.")
