"""Wer eine Quelle des Luecken-Inventars schreibt, schreibt das Inventar mit.

ANLASS (30.09.2026, Online-Einzellisten #3): der Lauf schrieb 252 neue
Listen in data/tournament_decklists_per_player.csv. scripts/datenluecken.py
rechnet aus genau dieser Datei (Klasse "kartentyp"), der Ablauf fuhr es aber
nicht — test_datenluecken.py fand das Inventar veraltet, das Tor war zu,
nichts gepusht. Dieselbe Luecke hatten per-decklist-scrape.yml (schreibt
dieselbe Datei) und kartentexte.yml (schreibt all_cards_database.csv, aus
der CardDatabaseLookup den Kartentyp je Druck liest).

Geprueft wird jeder Ablauf, der nach main schreibt: nimmt sein `git add`
eine Quelle des Inventars mit, muss er scripts/datenluecken.py fahren UND
data/datenluecken.json mit committen.
"""
import os
import re

import yaml

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ABLAEUFE = os.path.join(WURZEL, ".github", "workflows")
ERZEUGER = os.path.join(WURZEL, "scripts", "datenluecken.py")

# Die Kartendatenbank liest datenluecken.py nicht ueber einen Dateinamen,
# sondern ueber card_scraper_shared.CardDatabaseLookup (Klasse "kartentyp").
UEBER_DIE_KARTENDATENBANK = {"all_cards_database.csv"}

# Laeufe, die nichts nach main schreiben, obwohl sie `git add` fahren.
NUR_WEGWERF = {"setwechsel-probe.yml"}


def quellen():
    src = open(ERZEUGER, encoding="utf-8").read()
    namen = set(re.findall(r'_lies\("([^"]+)"\)', src))
    namen |= set(re.findall(r'"(champions_[a-z_]+\.json)"', src))
    namen |= set(re.findall(r'"([a-z_]+\.csv)"', src))
    return namen | UEBER_DIE_KARTENDATENBANK


def _ohne_kommentare(text):
    return "\n".join(z for z in text.splitlines() if not z.lstrip().startswith("#"))


def _git_add(run):
    """Alle `git add`-Aufrufe samt Fortsetzungszeilen, als ein Text."""
    zeilen = _ohne_kommentare(run).splitlines()
    heraus, i = [], 0
    while i < len(zeilen):
        if re.search(r"\bgit add\b", zeilen[i]):
            stueck = zeilen[i]
            while stueck.rstrip().endswith("\\") and i + 1 < len(zeilen):
                i += 1
                stueck = stueck.rstrip()[:-1] + " " + zeilen[i]
            heraus.append(stueck)
        i += 1
    return " ".join(heraus)


def befunde(name, text):
    y = yaml.safe_load(text)
    runs = [str(s.get("run", "")) for j in y.get("jobs", {}).values() for s in j.get("steps", [])]
    adds = " ".join(_git_add(r) for r in runs)
    if not adds:
        return []
    alles = bool(re.search(r"git add\s+(-A\s+)?(--all|\.|data)(\s|$)", adds))
    geschrieben = sorted(q for q in quellen() if q in adds)
    if not (alles or geschrieben):
        return []
    fehlt = []
    if "scripts/datenluecken.py" not in _ohne_kommentare("\n".join(runs)):
        fehlt.append(f"schreibt {geschrieben or 'data/'}, faehrt aber scripts/datenluecken.py nicht")
    if not alles and "data/datenluecken.json" not in adds:
        fehlt.append("committet data/datenluecken.json nicht")
    return fehlt


def _ablaeufe():
    for n in sorted(os.listdir(ABLAEUFE)):
        if n.endswith(".yml") and n not in NUR_WEGWERF:
            yield n, open(os.path.join(ABLAEUFE, n), encoding="utf-8").read()


def test_die_quellen_sind_gefunden():
    q = quellen()
    assert "tournament_decklists_per_player.csv" in q and "champions_usage.json" in q, sorted(q)


def test_wer_eine_quelle_schreibt_schreibt_das_inventar_mit():
    falsch = {n: b for n, t in _ablaeufe() if (b := befunde(n, t))}
    assert not falsch, f"Ablaeufe, die das Luecken-Inventar veralten lassen: {falsch}"


def test_die_pruefung_beisst():
    """Verfaelschungsprobe: der Ablauf vor dem 30.09. wird erkannt."""
    alt = """
jobs:
  j:
    steps:
      - name: Datenstaende fortschreiben
        run: python3 scripts/build_data_stand.py
      - name: Commit + push
        run: |
          git add data/tournament_decklists_per_player.csv data/data_stand.json
          git commit -m x
"""
    assert len(befunde("probe.yml", alt)) == 2
    neu = alt.replace("run: python3 scripts/build_data_stand.py",
                      "run: python3 scripts/datenluecken.py || true") \
             .replace("data/data_stand.json\n", "data/data_stand.json \\\n                  data/datenluecken.json\n")
    assert befunde("probe.yml", neu) == []
