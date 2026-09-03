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
    # Wortlaut am 03.09.2026 korrigiert (siehe unten): "still above ...
    # AFTER the scraper nulled its outlier" behauptete eine Reparatur, die
    # in diesem Zweig nie stattfindet. Geprueft wird deshalb die Aussage,
    # nicht mehr der alte Satz.
    assert "could NOT pin a single culprit" in text, \
        f"'markiert und trotzdem zu hoch' fehlt: {text}"
    assert "carry the same row twice" in text, f"doppelte Zeile nicht erkannt: {text}"
    assert "stat spread" in text, f"der Spread-Fehler fehlt: {text}"


def test_die_stufen_sind_richtig_verteilt(monkeypatch, tmp_path):
    """CRITICAL nur, wo die Erkennung des Scrapers versagt hat."""
    f = _befunde(monkeypatch, tmp_path, _kaputter_stand())
    stufen = {}
    for stufe, text in f:
        for marke in ("sum to more than", "could NOT pin a single culprit",
                      "carry the same row twice", "stat spread"):
            if marke in text:
                stufen[marke] = stufe
    assert stufen.get("sum to more than") == "CRITICAL", (
        "eine Liste ueber der Grenze OHNE Markierung heisst: die Quelle hat "
        "ihre Form geaendert und der Scraper hat es nicht gemerkt"
    )
    # GEAENDERT 03.09.2026: dieser Fall ist nicht mehr fest WARN, sondern
    # haengt an der Richtung — WARN nur, wenn die Zahl gegenueber der
    # Baseline gewachsen ist (siehe die Beobachtungs-Tests unten). Hier
    # laeuft die Pruefung ohne Baseline, das ist die Erstmessung.
    # Unveraendert bleibt die Aussage, auf die es ankommt: markiert und
    # trotzdem zu hoch ist KEIN Notfall, also niemals CRITICAL.
    assert stufen.get("could NOT pin a single culprit") in ("INFO", "WARN")
    assert stufen.get("could NOT pin a single culprit") != "CRITICAL"
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


# ── Die Meldung darf keine Reparatur behaupten (Befund 03.09.2026) ────
#
# Der Meldungstext lautete "still above 105 % AFTER the scraper nulled its
# outlier". Nachgezaehlt am 03.09.2026: von den 22 gemeldeten Listen trug
# KEINE einen genullten Wert; im ganzen Bestand waren es zwei. Der Text
# beschrieb den falschen Zweig von pruefe_plausibel(): genullt wird nur,
# wenn GENAU EIN Wert ausser der Reihe steht und sein Wegfall die Summe
# rettet. Sonst bleibt die Liste absichtlich unveraendert.
#
# Eine Meldung, die eine nicht erfolgte Reparatur behauptet, laesst den
# Leser eine kleinere Luecke sehen als die echte — deshalb steht sie hier
# fest.

def _ueber_grenze_ohne_nullwert():
    """Summe 121,4 %, absteigend sortiert, kein Wert genullt — genau die
    Lage von beartic/singles/nature am 03.09.2026."""
    return {"pokemon": {"beartic": {"singles": {
        "_warnungen": ["nature: Anteile summierten sich auf 121.4 %"],
        "nature": [{"name": "Adamant", "pct": 57.2}, {"name": "Jolly", "pct": 34.5},
                   {"name": "Brave", "pct": 7.6}, {"name": "Naughty", "pct": 7.6},
                   {"name": "Careful", "pct": 7.5}, {"name": "Lonely", "pct": 7.0}]}}}}


def _ueber_grenze_mit_nullwert():
    return {"pokemon": {"absol": {"singles": {
        "_warnungen": ["nature: Anteile summierten sich auf 130.0 %"],
        "nature": [{"name": "Adamant", "pct": 60.0}, {"name": "Jolly", "pct": 50.0},
                   {"name": "Brave", "pct": None}]}}}}


def test_meldung_behauptet_keine_nullung(monkeypatch, tmp_path):
    f = _befunde(monkeypatch, tmp_path, _ueber_grenze_ohne_nullwert())
    text = " || ".join(t for _, t in f)
    assert "nulled its outlier" not in text, \
        "die Meldung behauptet wieder eine Reparatur, die nicht stattgefunden hat"
    assert "davon 0 mit bereits genulltem Wert" in text, \
        f"die Zahl der genullten Werte fehlt oder stimmt nicht: {text}"


def test_genullte_liste_wird_als_solche_gezaehlt(monkeypatch, tmp_path):
    """Die Gegenprobe: steht wirklich ein Nullwert drin, muss die Zahl
    mitgehen — sonst ist sie eine Konstante und sagt nichts."""
    f = _befunde(monkeypatch, tmp_path, _ueber_grenze_mit_nullwert())
    text = " || ".join(t for _, t in f)
    assert "davon 1 mit bereits genulltem Wert" in text, text


# ── Beobachten statt jeden Tag dasselbe melden (03.09.2026) ───────────
#
# Der Betreiber hat die 22 Listen gegen weitere Quellen gehalten: die
# Fehler stehen dort auch. Sie sind von hier aus nicht heilbar, und die
# Hoffnung ist, dass sie sich an der Quelle wieder legen.
#
# Eine WARN-Zeile, die jeden Tag dieselbe unveränderliche Zahl meldet,
# wird nach dem dritten Mal überblättert — und dann fällt auch die
# Verschlechterung nicht mehr auf. CLAUDE.md hält dieselbe Lehre schon
# fest: "Absolute quality thresholds produce noise here. Detect *change*
# against a baseline instead."
#
# Also: WARN nur beim Wachstum. Gleichstand und Rückgang sind INFO mit
# Richtungsangabe, damit sichtbar bleibt, wohin es läuft.

def _n_listen_ueber_grenze(n):
    """n Wesenslisten, jede über 105 %, jede vom Scraper markiert."""
    pk = {}
    for i in range(n):
        pk[f"mon{i}"] = {"singles": {
            "_warnungen": ["nature: Anteile summierten sich auf 121.4 %"],
            "nature": [{"name": "Adamant", "pct": 60.0},
                       {"name": "Jolly", "pct": 60.0}]}}
    return {"pokemon": pk}


def _stufen_und_text(monkeypatch, tmp_path, daten, vorher):
    ordner = tmp_path / "data"
    ordner.mkdir(exist_ok=True)
    (ordner / "champions_usage.json").write_text(json.dumps(daten), encoding="utf-8")
    monkeypatch.setattr(guardian, "DATA", str(ordner))
    f = []
    rueck = guardian.check_champions_usage(f, vorher)
    return [s for s, _ in f], " || ".join(t for _, t in f), rueck


def test_wachstum_ist_eine_warnung(monkeypatch, tmp_path):
    stufen, text, _ = _stufen_und_text(
        monkeypatch, tmp_path, _n_listen_ueber_grenze(5),
        {"champions_ueber_grenze": 3})
    assert "WARN" in stufen, f"eine gewachsene Zahl muss warnen: {text}"
    assert "zuletzt waren es 3, jetzt 5" in text, text


def test_gleichstand_warnt_nicht(monkeypatch, tmp_path):
    stufen, text, _ = _stufen_und_text(
        monkeypatch, tmp_path, _n_listen_ueber_grenze(5),
        {"champions_ueber_grenze": 5})
    assert "WARN" not in stufen, f"unveraendert ist kein Handlungsbedarf: {text}"
    assert "unveraendert bei 5" in text, text


def test_rueckgang_warnt_nicht_und_nennt_die_richtung(monkeypatch, tmp_path):
    stufen, text, _ = _stufen_und_text(
        monkeypatch, tmp_path, _n_listen_ueber_grenze(5),
        {"champions_ueber_grenze": 9})
    assert "WARN" not in stufen, text
    assert "zurueck von 9 auf 5" in text, \
        'ob sich die Fehler legen, ist genau die Frage — die Richtung muss dastehen'


def test_erste_messung_ist_kein_alarm(monkeypatch, tmp_path):
    stufen, text, _ = _stufen_und_text(
        monkeypatch, tmp_path, _n_listen_ueber_grenze(5), {})
    assert "WARN" not in stufen, text
    assert "Erste Messung" in text, text


def test_die_zahl_geht_in_die_baseline(monkeypatch, tmp_path):
    """Ohne Rueckgabewert kann der naechste Lauf nichts vergleichen —
    dann ist die ganze Beobachtung wirkungslos."""
    _, _, rueck = _stufen_und_text(
        monkeypatch, tmp_path, _n_listen_ueber_grenze(7),
        {"champions_ueber_grenze": 7})
    assert rueck == 7, f"check_champions_usage muss die Zahl liefern, gab {rueck!r}"


def test_baseline_traegt_das_feld():
    """Die Gegenprobe zum Test darueber: main() muss den Wert auch
    wirklich wegschreiben."""
    assert 'champions_ueber_grenze = check_champions_usage(' in GUARD_SRC, \
        "der Rueckgabewert wird nicht eingesammelt"
    assert '"champions_ueber_grenze": champions_ueber_grenze,' in GUARD_SRC, \
        "der Wert landet nicht in der Baseline — der naechste Lauf sieht wieder nichts"
