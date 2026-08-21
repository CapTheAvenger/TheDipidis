"""Das Dashboard darf keinen Stapel anbieten, der mittendrin abbricht.

BEFUND (21.08.2026): BATCH_BASE und BATCH_FULL enthielten den Eintrag
"4" (Card Price Scraper), den es in SCRIPTS nicht mehr gibt — das
Skript wurde entfernt, die Menuezeile blieb. `SCRIPTS[key]` haette den
Stapel beim vierten von neunzehn Schritten mit einem KeyError beendet.

Ausserdem liefen lokal und in CI zwei verschiedene Reihenfolgen
desselben Stapels: [11]/[12] standen im Dashboard NACH [16]/[17], im
Wochenlauf davor. Welche stimmt, stand nirgends. Jetzt richtet sich
BATCH_FULL nach dem Wochenlauf, und dieser Test haelt die beiden
gegeneinander.
"""

import os
import re

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
DASHBOARD = os.path.join(WURZEL, "backend", "start_scraper_dashboard.py")
WOCHENLAUF = os.path.join(WURZEL, ".github", "workflows", "weekly-full-update.yml")


@pytest.fixture(scope="module")
def dash():
    raum = {"os": os}
    with open(DASHBOARD, encoding="utf-8") as f:
        quelle = f.read()
    ausschnitt = quelle[quelle.index("SCRIPTS = {"):quelle.index("def git_commit_push")]
    exec(compile(ausschnitt, DASHBOARD, "exec"), raum)
    raum["_quelle"] = quelle
    return raum


def _ci_reihenfolge():
    with open(WOCHENLAUF, encoding="utf-8") as f:
        inhalt = f.read()
    block = re.search(r"for step in \\\n(.*?)\n\s*; do", inhalt, re.S)
    assert block, "Skriptliste im Wochenlauf nicht gefunden"
    return [z.strip().strip('"\\ ') for z in block.group(1).split("\n")
            if z.strip().endswith('.py"') or z.strip().endswith(".py")]


@pytest.mark.parametrize("name", ["BATCH_BASE", "BATCH_META", "BATCH_FULL"])
def test_jeder_stapeleintrag_hat_ein_skript(dash, name):
    fehlend = [k for k in dash[name] if k not in dash["SCRIPTS"]]
    assert not fehlend, (
        f"{name} enthaelt {fehlend}, wozu es keinen SCRIPTS-Eintrag gibt — "
        f"der Stapel bricht an dieser Stelle ab.")


def test_jedes_skript_existiert_auf_der_platte(dash):
    fehlend = [(k, v) for k, v in dash["SCRIPTS"].items()
               if not os.path.isfile(os.path.join(WURZEL, "backend", v))]
    assert not fehlend, f"Menueeintraege ohne Datei: {fehlend}"


def test_jeder_stapeleintrag_hat_einen_namen(dash):
    alle = set(dash["BATCH_BASE"] + dash["BATCH_META"] + dash["BATCH_FULL"])
    ohne = sorted(k for k in alle if k not in dash["TASK_NAMES"])
    assert not ohne, f"Stapeleintraege ohne Anzeigenamen: {ohne}"


def test_task_names_beschreibt_nur_vorhandene_skripte(dash):
    verwaist = sorted(k for k in dash["TASK_NAMES"] if k not in dash["SCRIPTS"])
    assert not verwaist, (
        f"TASK_NAMES nennt {verwaist}, wozu es kein Skript gibt — genau so "
        f"hat der Eintrag '4' das Menue ueberlebt.")


def test_full_stapel_deckt_den_wochenlauf_ab(dash):
    ci = {p.replace("/", os.sep) for p in _ci_reihenfolge()}
    voll = {dash["SCRIPTS"][k] for k in dash["BATCH_FULL"]}
    fehlt_lokal = sorted(ci - voll)
    assert not fehlt_lokal, (
        f"laeuft in CI, aber nicht im lokalen FULL: {fehlt_lokal} — ein "
        f"lokaler Vollauf liefert dann ein anderes Ergebnis als der "
        f"Wochenlauf, ohne dass das irgendwo steht.")


def test_full_stapel_folgt_der_ci_reihenfolge(dash):
    """Nur die gemeinsamen Schritte, und nur ihre relative Ordnung."""
    ci = [p.replace("/", os.sep) for p in _ci_reihenfolge()]
    voll = [dash["SCRIPTS"][k] for k in dash["BATCH_FULL"]]
    gemeinsam_ci = [p for p in ci if p in set(voll)]
    gemeinsam_voll = [p for p in voll if p in set(ci)]
    assert gemeinsam_voll == gemeinsam_ci, (
        "die Reihenfolge weicht vom Wochenlauf ab:\n"
        f"  Dashboard: {gemeinsam_voll}\n"
        f"  CI:        {gemeinsam_ci}")


def test_menue_nennt_keine_entfernten_eintraege(dash):
    """Die Menuezeilen sind die einzige Stelle, die der Nutzer sieht."""
    quelle = dash["_quelle"]
    menue = quelle[quelle.index("def print_menu"):quelle.index("SCRIPTS = {")]
    genannt = set(re.findall(r'\[(\d+[a-z]?)\]', menue))
    genannt.discard("0")          # Menuepunkt "Beenden", kein Skript
    verwaist = sorted(genannt - set(dash["SCRIPTS"]))
    assert not verwaist, f"Menue bietet {verwaist} an, es gibt kein Skript dazu."
