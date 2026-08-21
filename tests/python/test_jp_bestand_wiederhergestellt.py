"""Der japanische Kartenbestand ist wieder vollstaendig — und bleibt es.

BEFUND (21.08.2026): data/japanese_cards_database.csv fuehrte 772
Zeilen und genau ein regulaeres Set (M6) neben vier Promo-Sets. M5, M4
und M3 waren verschwunden. Zwei Ursachen, beide inzwischen behoben:

  * Der Schreibweg ersetzte die Datei, statt zusammenzulegen (28fd007f).
  * keep_latest_sets steht in config/scraper_settings.json auf 1 — der
    Lauf holt also bewusst nur das neueste Set. Zusammen mit dem
    Ersetzen hiess das: alles ausser dem neuesten Set faellt weg.

Offen war danach nur noch der Datenzustand. M4 (83 Zeilen, aus
3589ecc1) und M5 (81 Zeilen, aus 5b2117ca) wurden aus der eigenen
Git-Historie zurueckgespielt — wiederhergestellt, nicht geraten.

Zusaetzlich ist der Selbstabbruch weg, der den Lauf beendete, sobald
die neuesten Set-CODES bekannt waren: Sets wachsen nach ihrem
Erscheinen, und M6 stand deswegen seit dem 28.07. bei 76 Karten fest.
"""

import ast
import collections
import csv
import json
import os

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
CSV_PFAD = os.path.join(WURZEL, "data", "japanese_cards_database.csv")
SCRAPER = os.path.join(WURZEL, "backend", "scrapers", "japanese_cards_scraper.py")


@pytest.fixture(scope="module")
def zeilen():
    with open(CSV_PFAD, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def test_die_drei_letzten_jp_sets_stehen_drin(zeilen):
    je_set = collections.Counter(z["set"] for z in zeilen)
    for code in ("M4", "M5", "M6"):
        assert je_set.get(code, 0) > 50, (
            f"{code} fuehrt nur {je_set.get(code, 0)} Karten — der Bestand "
            f"ist wieder auf ein Set zusammengefallen. je Set: {dict(je_set)}")


def test_keine_dubletten_auf_set_und_nummer(zeilen):
    """Namen sind in dieser Datei nicht eindeutig — (set, number) ist es."""
    schluessel = [(z["set"], z["number"]) for z in zeilen]
    doppelt = [k for k, n in collections.Counter(schluessel).items() if n > 1]
    assert not doppelt, f"doppelte (set, number): {doppelt[:10]}"


def test_keine_zeile_ohne_pflichtfelder(zeilen):
    luecken = [z for z in zeilen
               if not (z.get("name") or "").strip()
               or not (z.get("set") or "").strip()
               or not (z.get("number") or "").strip()]
    assert not luecken, f"{len(luecken)} Zeile(n) ohne Pflichtfeld"


def test_bildadressen_zeigen_auf_die_bekannte_quelle(zeilen):
    fremd = {z["image_url"].split("/")[2] for z in zeilen
             if (z.get("image_url") or "").startswith("http")}
    assert fremd <= {"limitlesstcg.nyc3.cdn.digitaloceanspaces.com"}, fremd


def test_der_selbstabbruch_ist_weg():
    """`latest_online.issubset(existing_sets) -> return` beendete den Lauf,
    bevor er Nachtraege holen konnte."""
    with open(SCRAPER, encoding="utf-8") as f:
        quelle = f.read()
    baum = ast.parse(quelle)
    fn = next(k for k in baum.body
              if isinstance(k, ast.FunctionDef) and k.name == "main")
    for knoten in ast.walk(fn):
        if not isinstance(knoten, ast.If):
            continue
        if "issubset" not in ast.dump(knoten.test):
            continue
        rueckgaben = [k for k in knoten.body if isinstance(k, ast.Return)]
        assert not rueckgaben, (
            "der issubset-Zweig bricht den Lauf wieder ab — dann kommen "
            "Karten, die einem Set nachtraeglich hinzugefuegt werden, nie an.")


def test_schwelle_faengt_den_bekannten_zusammenbruch_ab():
    """772 Zeilen waren der kaputte Zustand. Die Schwelle muss darueber
    liegen, sonst wiederholt er sich unbemerkt."""
    import sys
    sys.path.insert(0, os.path.join(WURZEL, "scripts"))
    import sanity_check_data as tor
    schwelle = tor.THRESHOLDS["japanese_cards_database.csv"]
    assert schwelle > 772, (
        f"Schwelle {schwelle} liegt unter dem Zusammenbruch von 772 Zeilen — "
        f"derselbe Verlust ginge wieder durch.")
    with open(CSV_PFAD, encoding="utf-8-sig") as f:
        anzahl = sum(1 for _ in f) - 1
    assert anzahl >= schwelle


def test_waechter_bewacht_die_datei():
    """Die absolute Schwelle ist der grobe Balken; die Veraenderungspruefung
    ist die eigentliche Absicherung."""
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "dg_jp", os.path.join(WURZEL, "scripts", "data_guardian.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    assert "japanese_cards_database.csv" in m.CONSUMERS, (
        "ohne Eintrag in CONSUMERS greift weder die Schemapruefung noch "
        "check_shrink")
    befunde = []
    jetzt = m.check_jp_setbestand(befunde)
    assert not befunde, befunde
    # Ein verschwundenes Set muss auffallen.
    vorher = dict(jetzt)
    vorher["M5"] = 81
    jetzt_ohne_m5 = {k: v for k, v in jetzt.items() if k != "M5"}
    befunde = []
    m.check_jp_setbestand_vergleich(befunde, jetzt_ohne_m5, vorher)
    assert any(s == "CRITICAL" and "M5" in t for s, t in befunde), befunde
