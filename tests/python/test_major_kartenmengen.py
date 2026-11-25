"""Major-Mengen je Karte fuer die Wunschliste (UI-166, 25.11.2026).

Gehalten wird die REGEL, ausgefuehrt auf einem gebauten Datenstand — kein
Wochenwert: meist = haeufigste Anzahl (bei Gleichstand die hoehere), max,
Zaehlung je Liste ueber alle Prints der Karte (international_prints, nie der
Name), nur Major-Listen (quelle papier), und das vorige Format kommt nur dazu,
solange das aktuelle weniger als MIN_MAJORS Turniere hat.
"""

import csv
import importlib.util
import io
import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def _mod():
    spec = importlib.util.spec_from_file_location(
        "major_km", os.path.join(ROOT, "scripts", "build_major_kartenmengen.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_kennzahlen():
    m = _mod()
    assert m.kennzahlen([2, 2, 2, 4, 4, 0]) == {"decks": 5, "meist": 2, "max": 4}
    assert m.kennzahlen([1, 2]) == {"decks": 2, "meist": 2, "max": 2}   # Gleichstand -> hoehere
    assert m.kennzahlen([0, 0]) is None


FELDER = ["tournament_name", "tournament_date", "player_name", "set_code", "set_number", "count", "quelle"]


def _schreibe(pfad, felder, zeilen):
    with io.open(pfad, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=felder)
        w.writeheader()
        w.writerows(zeilen)


def _stand(d, aktuell_turniere):
    (d / "format_window.json").write_text(json.dumps(
        {"current_set": "NEU", "previous_format_key": "TEF-ALT"}), encoding="utf-8")
    _schreibe(d / "all_cards_database.csv", ["name_en", "set", "number", "international_prints"], [
        {"name_en": "Piplup", "set": "AAA", "number": "1", "international_prints": "BBB-7"},
        {"name_en": "Piplup", "set": "BBB", "number": "7", "international_prints": ""},
        {"name_en": "Piplup", "set": "CCC", "number": "9", "international_prints": ""},  # andere Karte, gleicher Name
    ])
    zeilen = []
    for t in range(aktuell_turniere):
        zeilen += [
            {"tournament_name": f"Regional {t}", "tournament_date": f"2026-11-2{t}", "player_name": "A",
             "set_code": "AAA", "set_number": "1", "count": "1", "quelle": "papier"},
            {"tournament_name": f"Regional {t}", "tournament_date": f"2026-11-2{t}", "player_name": "A",
             "set_code": "BBB", "set_number": "7", "count": "1", "quelle": "papier"},
            {"tournament_name": f"Regional {t}", "tournament_date": f"2026-11-2{t}", "player_name": "B",
             "set_code": "CCC", "set_number": "9", "count": "4", "quelle": "papier"},
            {"tournament_name": "Online", "tournament_date": "2026-11-20", "player_name": "C",
             "set_code": "AAA", "set_number": "1", "count": "4", "quelle": "online"},
        ]
    _schreibe(d / "tournament_decklists_per_player_TEF-NEU_2026-11.csv", FELDER, zeilen)
    _schreibe(d / "tournament_decklists_per_player_TEF-ALT_2026-10.csv", FELDER, [
        {"tournament_name": "Alt-Regional", "tournament_date": "2026-10-01", "player_name": "D",
         "set_code": "AAA", "set_number": "1", "count": "3", "quelle": "papier"},
    ])


def test_familie_statt_name_nur_majors(tmp_path):
    m = _mod()
    _stand(tmp_path, aktuell_turniere=2)
    e = m.berechne(str(tmp_path))
    assert e["_meta"]["formate"] == ["TEF-NEU"]
    # A spielt 1x AAA-1 + 1x BBB-7 = 2 Piplup derselben Karte, je Turnier
    assert e["karten"]["AAA-1"] == {"decks": 2, "meist": 2, "max": 2}
    assert e["karten"]["BBB-7"] == e["karten"]["AAA-1"]
    # der andere Piplup ist eine andere Karte — nicht zusammengezaehlt
    assert e["karten"]["CCC-9"] == {"decks": 2, "meist": 4, "max": 4}


def test_voriges_format_nur_solange_das_neue_zu_duenn_ist(tmp_path):
    m = _mod()
    _stand(tmp_path, aktuell_turniere=1)
    e = m.berechne(str(tmp_path))
    assert e["_meta"]["formate"] == ["TEF-NEU", "TEF-ALT"]
    assert e["karten"]["AAA-1"] == {"decks": 2, "meist": 3, "max": 3}   # 2 (neu) und 3 (alt): Gleichstand -> 3
