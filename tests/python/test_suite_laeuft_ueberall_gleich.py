# -*- coding: utf-8 -*-
"""Jeder Ablauf, der die Python-Suite faehrt, muss sie in DERSELBEN
Umgebung fahren.

BEFUND 24.09.2026 — DER GRUND FUER ZWEI ROTE DEPLOYS HINTEREINANDER
-------------------------------------------------------------------
`get_data_dir()` loest auf `backend/core/data` auf. Der Ordner steht in
.gitignore und ist im Checkout LEER. Befuellt wird er von den Ablaeufen
selbst — der Wochenlauf tut es mit ueber zwanzig Dateien, `deploy-pages`
tat es mit KEINER.

Damit lief dieselbe Suite in zwei verschiedenen Welten: was im
Wochenlauf eine gefuellte Kartendatenbank sah, sah im Deploy eine leere.
Kein Fehler, keine Meldung — nur ein anderes Ergebnis.

Aufgeflogen an `data/datenluecken.json`: der Wochenlauf schrieb acht
benannte Luecken hinein (er hatte die Datenbank), der Deploy rechnete
sie neu, fand keine einzige Karte und meldete die Datei als veraltet.
Sie war es nicht. Deploy 3040 und 3041 fielen, die Seite hing auf dem
alten Stand, und kaputt war nichts.

`card_scraper_shared._melde_leeren_datenordner` beschreibt genau diese
Falle schon seit dem 22.09.2026 — mit dem Satz "Geheilt ist das damit
nicht". Zwei Tage spaeter hat sie zugeschlagen.

WAS DIESE ZUSICHERUNG HAELT
---------------------------
Sie verlangt nicht, dass der Ordner gesaet WIRD — manche Ablaeufe
brauchen ihn nicht. Sie verlangt: **wer die ganze Suite faehrt, saet ihn
vorher.** Denn die ganze Suite enthaelt Zusicherungen, die daran
haengen, und welche das sind, weiss beim Schreiben eines Ablaufs
niemand auswendig.
"""

import os
import re

import pytest

yaml = pytest.importorskip("yaml")

WURZEL = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ABLAEUFE = os.path.join(WURZEL, ".github", "workflows")

# Ein Lauf ueber das GANZE Verzeichnis — nicht ueber eine einzelne Datei.
# Wer gezielt eine Datei prueft, weiss, was er tut; wer alles faehrt,
# faehrt auch die Zusicherungen mit, die an den Nachschlagetabellen
# haengen.
GANZE_SUITE = re.compile(r"pytest\s+tests/python/?(?:\s|$)")
SAAT = "backend/core/data"


def _schritte(job):
    return job.get("steps") or []


def _text(schritt):
    return "\n".join(str(schritt.get(k) or "") for k in ("run", "name"))


def ablaeufe():
    for name in sorted(os.listdir(ABLAEUFE)):
        if not name.endswith((".yml", ".yaml")):
            continue
        with open(os.path.join(ABLAEUFE, name), encoding="utf-8") as f:
            try:
                daten = yaml.safe_load(f)
            except Exception as e:                            # noqa: BLE001
                pytest.fail("%s ist kein gueltiges YAML: %s" % (name, e))
        if isinstance(daten, dict) and daten.get("jobs"):
            yield name, daten


def test_es_gibt_ueberhaupt_ablaeufe_zu_pruefen():
    """Vorpruefung gegen ein leeres Bestehen.

    Ohne sie bestuende die Zusicherung darunter auch dann, wenn der
    Ordner umbenannt wurde und die Schleife ueber nichts laeuft.
    """
    assert len(list(ablaeufe())) >= 5


def test_wer_die_ganze_suite_faehrt_saet_vorher_die_nachschlagetabellen():
    """Der eigentliche Waechter.

    Gemessen am 24.09.2026 fuhren drei Ablaeufe pytest ueber
    tests/python: weekly-full-update (saete), deploy-pages (saete NICHT)
    und data-consistency (faehrt nur EINE Datei, faellt also nicht
    darunter).
    """
    versaeumt = []
    for name, daten in ablaeufe():
        for job_name, job in (daten.get("jobs") or {}).items():
            schritte = _schritte(job)
            stelle = None
            for i, schritt in enumerate(schritte):
                if GANZE_SUITE.search(str(schritt.get("run") or "")):
                    stelle = i
                    break
            if stelle is None:
                continue
            # Wird VOR dem Lauf gesaet? Spaeter saeen hilft nicht.
            gesaet = any(SAAT in _text(s) for s in schritte[:stelle])
            if not gesaet:
                versaeumt.append("%s → Job %s" % (name, job_name))

    assert versaeumt == [], (
        "Diese Ablaeufe fahren die ganze Python-Suite, ohne vorher "
        "backend/core/data zu saeen — sie pruefen damit eine ANDERE "
        "Welt als der Wochenlauf, und der Unterschied faellt erst auf, "
        "wenn ein Lauf rot wird:\n  " + "\n  ".join(versaeumt))


def test_der_deploy_saet_ohne_von_hand_gepflegte_dateiliste():
    """Eine Dateiliste von Hand ist die naechste Fehlerquelle.

    `_melde_leeren_datenordner` nennt sie beim Namen: sieben Ablaeufe
    saeen mit einer handgepflegten Liste, und fehlt ihr ein Eintrag,
    sieht der Test eine leere Tabelle statt eines Fehlers. Der
    Deploy-Job nimmt deshalb ALLES, was data/ an Tabellen fuehrt.
    """
    with open(os.path.join(ABLAEUFE, "deploy-pages.yml"), encoding="utf-8") as f:
        quelle = f.read()
    treffer = [z for z in quelle.splitlines()
               if SAAT in z and ("cp " in z or "cp\t" in z)]
    assert treffer, "der Deploy saet backend/core/data nicht mehr"
    assert any("*." in z for z in treffer), (
        "der Deploy saet mit einer aufgezaehlten Dateiliste statt mit "
        "einem Muster — genau die Bauart, die still eine leere Tabelle "
        "hinterlaesst, wenn ein Eintrag fehlt:\n  " + "\n  ".join(treffer))


# ══════════════════════════════════════════════════════════════════════
# WER IN DEN SAATORDNER SCHREIBT, MUSS AUCH ZURUECKKOMMEN (25.09.2026)
#
# get_data_dir() loest auf backend/core/data auf. Der Ordner ist
# gitignored: was dort landet, faellt mit dem Runner weg, wenn es nicht
# jemand zurueckkopiert. Bis heute tat das eine VON HAND GEPFLEGTE
# Liste — und die hat im September dreimal etwas verloren:
#
#   05.09.  champions_speed_corpus.json
#   17.-23.09.  champions_move_flags.json (sieben Tage)
#   24.09.  victory_road_major_teams.json + _replika_teams.json
#
# Die letzten beiden liefen GRUEN durch und meldeten status OK. Ein Lauf,
# der gruen ist und nichts liefert, ist schlimmer als einer, der rot wird.
# ══════════════════════════════════════════════════════════════════════

RUECKWEG = "Erzeugte Dateien zurueck nach data/"


def test_der_wochenlauf_holt_alles_zurueck_was_er_erzeugt_hat():
    """Ein Rueckweg ohne Dateiliste, gebunden an eine Zeitmarke."""
    with open(os.path.join(ABLAEUFE, "weekly-full-update.yml"), encoding="utf-8") as f:
        quelle = f.read()

    assert RUECKWEG in quelle, (
        "der Wochenlauf hat keinen Schritt mehr, der die erzeugten Dateien "
        "aus backend/core/data zurueck nach data/ holt")
    assert "saat.marke" in quelle, (
        "die Saat-Marke fehlt — ohne sie kann der Rueckweg nicht "
        "unterscheiden, was dieser Lauf geschrieben hat und was nur "
        "geseedet war")


def test_die_marke_wird_vor_den_scrapern_gesetzt_und_danach_gelesen():
    """Reihenfolge ist hier alles.

    Wird die Marke NACH den Scrapern gesetzt, ist nichts neuer als sie
    und der Rueckweg holt nichts. Wird sie vor der Saat gesetzt, gilt
    jede geseedete Datei als erzeugt und ueberschreibt data/ mit dem
    Stand, von dem sie kam.
    """
    daten = None
    with open(os.path.join(ABLAEUFE, "weekly-full-update.yml"), encoding="utf-8") as f:
        daten = yaml.safe_load(f)
    schritte = daten["jobs"]["scrape"]["steps"]

    def stelle(pruefung):
        for i, s in enumerate(schritte):
            if pruefung(str(s.get("name") or ""), str(s.get("run") or "")):
                return i
        return None

    i_saat = stelle(lambda n, r: "Seed backend/core/data" in n)
    i_marke = stelle(lambda n, r: "saat.marke" in r and "touch" in r)
    i_rueck = stelle(lambda n, r: n == RUECKWEG)
    i_zusicherungen = stelle(lambda n, r: "Zusicherungen" in n)

    assert None not in (i_saat, i_marke, i_rueck, i_zusicherungen), {
        "saat": i_saat, "marke": i_marke, "rueckweg": i_rueck,
        "zusicherungen": i_zusicherungen}

    assert i_marke == i_saat, (
        "die Marke wird nicht im Saat-Schritt gesetzt (Saat %s, Marke %s) — "
        "dann passt sie nicht zum Saatzeitpunkt" % (i_saat, i_marke))
    assert i_rueck > i_saat, "der Rueckweg laeuft vor der Saat"
    assert i_rueck < i_zusicherungen, (
        "der Rueckweg laeuft NACH den Zusicherungen — dann prueft die Suite "
        "einen anderen Stand als den, der committet wird")


def test_der_rueckweg_nennt_keine_einzelnen_dateinamen():
    """Der Punkt der Uebung.

    Sobald dort wieder Dateinamen stehen, ist es dieselbe handgepflegte
    Liste wie vorher — und die naechste neue Datei fehlt darin.
    """
    with open(os.path.join(ABLAEUFE, "weekly-full-update.yml"), encoding="utf-8") as f:
        zeilen = f.read().split("\n")
    start = next(i for i, z in enumerate(zeilen) if RUECKWEG in z)
    ende = next((i for i in range(start + 1, len(zeilen))
                 if zeilen[i].startswith("      - name:")), len(zeilen))
    block = "\n".join(zeilen[start:ende])

    verdaechtig = re.findall(r"[a-z0-9_]+\.(?:json|csv)", block)
    # Das Muster backend/core/data/*.json ist erlaubt, ein Name nicht.
    echte_namen = [n for n in verdaechtig if not n.startswith("*")]
    assert echte_namen == [], (
        "im Rueckweg stehen wieder einzelne Dateinamen: %s — damit ist er "
        "erneut eine Liste, die jemand pflegen muss" % echte_namen)


# ── DIE SUITEN GEHOEREN VOR DEN MERGE ─────────────────────────────────
#
# BEFUND (25.09.2026): deploy-pages.yml lief ausschliesslich auf
# `push: main`. Der `test`-Job — beide grossen Suiten — sah einen PR
# damit nie; auf einem PR liefen nur Sprachreinheit, Visual Non-Meta und
# Data Consistency. Ein Fehler in den Suiten wurde deshalb erst NACH dem
# Merge sichtbar, auf main, wo `build` und `deploy` uebersprungen werden
# und die Seite auf dem alten Stand haengt, ohne dass etwas kaputt
# aussieht. Die Deploys 3040, 3041, 3048 und 3049 sind genau so
# entstanden.

def _deploy_yaml():
    import os
    hier = os.path.dirname(os.path.abspath(__file__))
    wurzel = os.path.normpath(os.path.join(hier, "..", ".."))
    pfad = os.path.join(wurzel, ".github", "workflows", "deploy-pages.yml")
    import pytest as _p
    yaml = _p.importorskip("yaml")
    with open(pfad, encoding="utf-8") as f:
        d = yaml.safe_load(f)
    # PyYAML liest das nackte `on:` als Wahrheitswert True.
    d["_on"] = d.get("on", d.get(True))
    return d


def test_die_suiten_laufen_auch_auf_einem_pr():
    d = _deploy_yaml()
    ausloeser = d["_on"]
    assert "pull_request" in ausloeser, (
        "deploy-pages.yml laeuft nicht auf Pull Requests — die beiden "
        "grossen Suiten sehen einen PR dann nie, und ein Fehler faellt "
        "erst nach dem Merge auf main auf")
    assert d["jobs"]["test"].get("if") in (None, ""), (
        "der test-Job traegt eine Bedingung — er muss auf JEDEM Ausloeser "
        "laufen, sonst ist die PR-Pruefung wieder weg")


def test_ein_pr_liefert_nicht_aus():
    d = _deploy_yaml()
    for job in ("build", "deploy"):
        bed = str(d["jobs"][job].get("if") or "")
        assert "pull_request" in bed, (
            f"Job {job} hat keine Bedingung gegen pull_request — ein PR "
            f"wuerde die Seite ausliefern")


def test_ein_pr_schiesst_den_deploy_von_main_nicht_ab():
    d = _deploy_yaml()
    gruppe = str(d.get("concurrency", {}).get("group") or "")
    abbrechen = d.get("concurrency", {}).get("cancel-in-progress")
    if abbrechen:
        assert "github.ref" in gruppe or "github.event" in gruppe, (
            f"concurrency.group ist fest ({gruppe!r}) und "
            f"cancel-in-progress ist an — ein PR-Lauf bricht damit den "
            f"laufenden Deploy von main ab")
