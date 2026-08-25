"""Die Plausibilitaetsregeln stehen im Guardian, nicht im Deploy-Gate.

Am 25.08.2026 hat dasselbe Muster zweimal die komplette Auslieferung
angehalten:

  * morgens die Champions-Teamzahl (ein Unit-Test verlangte > 50 Teams,
    die Quelle lieferte 46) — PR #509,
  * abends die Nutzungsdaten. Der erste frische Scrape seit 39 Tagen trug
    16 Anteilslisten ueber 105 %, zwei doppelte Attackenzeilen und zwei
    Statuswert-Spreads ausserhalb des Spielbudgets (araquanid/doubles:
    173 Angriffspunkte, erlaubt sind 32). Drei rote Deploys in Folge,
    auch fuer alles, was mit Champions nichts zu tun hat.

Beide Male hatten die Pruefungen inhaltlich recht. Beide Male war der
Ort falsch. Ein Datenthema an einer Fremdquelle gehoert gemeldet, nicht
in eine Sperre — so steht es auch in CLAUDE.md: "Report, don't silently
repair". Eine Sperre ist auch eine Art zu reparieren.

Die Regeln liegen jetzt an zwei Stellen, und beide sind besser als das
Gate:

  1. scripts/scrape_champions_usage.py -> unmoegliche_bloecke()
     verweigert einen solchen Stand, BEVOR er committet wird.
  2. scripts/data_guardian.py -> check_champions_usage()
     meldet taeglich, was trotzdem in data/ liegt.

Diese Tests halten fest, dass sie dort bleiben — und dass sie nicht ins
Gate zurueckwandern.
"""

import importlib
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
guardian = importlib.import_module("data_guardian")

GUARD_SRC = open(os.path.join(ROOT, "scripts", "data_guardian.py"),
                 encoding="utf-8").read()


def _kaputter_stand():
    """Ein Stand mit genau den drei Fehlern vom 25.08.2026."""
    return {"pokemon": {
        # Liste ueber 105 %, MIT Markierung durch den Scraper
        "absol": {"doubles": {
            "_warnungen": ["nature: Anteile summierten sich auf 111.5 %"],
            "nature": [{"name": "Adamant", "pct": 53.5}, {"name": "Jolly", "pct": 23.2},
                       {"name": "Brave", "pct": 10.9}, {"name": "Lonely", "pct": 8.3},
                       {"name": "Naive", "pct": 7.9}, {"name": "Timid", "pct": 7.7}]}},
        # Liste ueber 105 %, OHNE Markierung — die Quelle hat die Form geaendert
        "beartic": {"doubles": {
            "held_item": [{"name": "A", "pct": 60.0}, {"name": "B", "pct": 50.0}]}},
        # doppelte Zeile in einer ATTACKEN-Liste
        "musharna": {"doubles": {
            "move": [{"name": "Yawn", "pct": 60.0}, {"name": "Yawn", "pct": 55.0}]}},
        # Spread ausserhalb des Spielbudgets
        "araquanid": {"doubles": {
            "stat_points": [{"evs": "2 HP / 173 Atk / 2 Def",
                             "points": {"hp": 2, "atk": 173, "def": 2}}]}},
    }}


def _befunde(monkeypatch, tmp_path, daten):
    ordner = tmp_path / "data"
    ordner.mkdir(exist_ok=True)
    (ordner / "champions_usage.json").write_text(json.dumps(daten), encoding="utf-8")
    monkeypatch.setattr(guardian, "DATA", str(ordner))
    f = []
    guardian.check_champions_usage(f)
    return f


def test_der_guardian_findet_alle_drei_fehlerarten(monkeypatch, tmp_path):
    f = _befunde(monkeypatch, tmp_path, _kaputter_stand())
    text = " || ".join(t for _, t in f)
    assert "sum to more than" in text, f"die Summenregel schweigt: {text}"
    assert "still above" in text, f"'markiert und trotzdem zu hoch' fehlt: {text}"
    assert "carry the same row twice" in text, f"doppelte Zeile nicht erkannt: {text}"
    assert "stat spread" in text, f"der Spread-Fehler fehlt: {text}"


def test_die_stufen_sind_richtig_verteilt(monkeypatch, tmp_path):
    """CRITICAL nur, wo die Erkennung des Scrapers versagt hat."""
    f = _befunde(monkeypatch, tmp_path, _kaputter_stand())
    stufen = {}
    for stufe, text in f:
        for marke in ("sum to more than", "still above",
                      "carry the same row twice", "stat spread"):
            if marke in text:
                stufen[marke] = stufe
    assert stufen.get("sum to more than") == "CRITICAL", (
        "eine Liste ueber der Grenze OHNE Markierung heisst: die Quelle hat "
        "ihre Form geaendert und der Scraper hat es nicht gemerkt"
    )
    assert stufen.get("still above") == "WARN"
    assert stufen.get("carry the same row twice") == "WARN"
    assert stufen.get("stat spread") == "WARN"


def test_ein_sauberer_stand_ist_still(monkeypatch, tmp_path):
    sauber = {"pokemon": {"pelipper": {"doubles": {
        "nature": [{"name": "Modest", "pct": 53.9}, {"name": "Timid", "pct": 30.1}],
        # Vier Attacken summieren sich naturgemaess weit ueber 100 % —
        # eine Pruefung, die dort anschlaegt, ist nur Rauschen.
        "move": [{"name": "Hurricane", "pct": 98.4}, {"name": "Tailwind", "pct": 89.3},
                 {"name": "Protect", "pct": 85.0}, {"name": "Weather Ball", "pct": 60.0}],
        "stat_points": [{"evs": "32 HP / 32 SpA / 2 Spe",
                         "points": {"hp": 32, "spa": 32, "spe": 2}}]}}}}
    assert _befunde(monkeypatch, tmp_path, sauber) == []


def test_die_spread_grenzen_stimmen_mit_dem_rechner_ueberein():
    """Drei Stellen, dieselben zwei Zahlen. Laufen sie auseinander, meldet
    der Guardian Spreads, die die Oberflaeche klaglos anzeigt."""
    assert "SP_BUDGET, SP_MAX = 66, 32" in GUARD_SRC
    scraper = open(os.path.join(ROOT, "scripts", "scrape_champions_usage.py"),
                   encoding="utf-8").read()
    assert "SP_BUDGET = 66" in scraper and "SP_MAX = 32" in scraper
    js = open(os.path.join(ROOT, "js", "app-side-quest-matchups.js"),
              encoding="utf-8").read()
    assert "const SP_BUDGET = 66;" in js and "const SP_MAX = 32;" in js


def _ohne_kommentar_js(text):
    return re.sub(r"(?m)^\s*//.*$", "", re.sub(r"/\*[\s\S]*?\*/", "", text))


def test_die_datenpruefungen_sind_nicht_ins_gate_zurueckgewandert():
    """Der eigentliche Punkt dieser Runde.

    Beide Dateien laufen im Deploy-Gate (deploy-pages.yml). Liest dort
    wieder jemand die ausgelieferte champions_usage.json und stellt
    Bedingungen an ihre ZAHLEN, haelt der naechste schlechte Tagesstand
    wieder die ganze Auslieferung an.
    """
    for name in ("test-scraper-selbstkontrolle.js", "test-champions-matchups.js"):
        pfad = os.path.join(ROOT, "tests", "unit", name)
        code = _ohne_kommentar_js(open(pfad, encoding="utf-8").read())
        assert "spreadTotal(p) <= api.SP_BUDGET" not in code, (
            f"{name}: die Spread-Regel prueft wieder die Datei"
        )
        assert not re.search(r"reduce\(\(a, x\) => a \+ \(x\.pct \|\| 0\)", code), (
            f"{name}: die Summenregel prueft wieder die Datei"
        )
        assert not re.search(r"execFileSync\([^)]*data_guardian", code), (
            f"{name}: der Guardian wird im Gate ausgefuehrt. Dann muss er "
            f"dort schweigen — und jeder echte Befund ist wieder eine Sperre"
        )
