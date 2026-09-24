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
