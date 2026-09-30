"""Kern und Nebenbereiche sind getrennt — und wer nach main schreibt, prueft vorher.

ANLASS (29.09.2026, Wochenaudit nach dem roten Wochenlauf #168)
--------------------------------------------------------------
1. Das Tor des Wochenlaufs und der test-Job von deploy-pages.yml fuhren
   auch alle Champions-, Pocket- und Side-Quest-Tests. Gemessen: eine neue
   Art im Champions-Pokedex macht zwei davon rot — Deploy steht, der
   Wochenlauf pusht keine TCG-Daten. Entscheidung Hausi: ganz trennen.
2. Zehn geplante Ablaeufe schrieben nach main, ohne vorher eine einzige
   Zusicherung zu fahren. Ein roter Tagesstand hielt damit den Deploy UND
   das Tor des naechsten Wochenlaufs an (das Tor prueft main + Frischdaten).

Was hier steht, ist Ablaufkonfiguration — also wirklich Text. Die Form der
Pruefung: jede Aussage an genau dem Schritt, der sie tragen muss, mit
herausgeschnittenen Kommentaren (CLAUDE.md, "Dein eigener Kommentar macht
die Verfaelschungsprobe blind"). Das VERHALTEN des Tors selbst prueft
tests/python/test_tor_vor_dem_push.py, indem es das Skript ausfuehrt.
"""
import glob
import os
import re

import yaml

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ABLAEUFE = os.path.join(WURZEL, ".github", "workflows")
NEBEN_JS = os.path.join(WURZEL, "tests", "nebenbereiche", "unit")
NEBEN_PY = os.path.join(WURZEL, "tests", "nebenbereiche", "python")

# Ablaeufe, die Champions-/Pocket-Daten schreiben: ihr Tor prueft Kern UND
# Nebenbereiche. Alle anderen geplanten Schreiber pruefen den Kern.
SCHREIBEN_NEBENBEREICHE = {
    "champions-replica-scrape.yml", "champions-usage-refresh.yml",
    "champions-sprites.yml", "pocket-tierlist.yml",
}


def _ohne_kommentare(text):
    return re.sub(r"(?m)^\s*#.*$", "", text)


def _laden(name):
    with open(os.path.join(ABLAEUFE, name), encoding="utf-8") as f:
        return yaml.safe_load(f)


def _ausloeser(y):
    return y.get(True) or y.get("on") or {}


def _schritte(y):
    for job in (y.get("jobs") or {}).values():
        for s in job.get("steps") or []:
            yield s


def _schreibt_nach_main(roh):
    return bool(re.search(r"git push|daten_pushen|push_nach_rebase", _ohne_kommentare(roh)))


def _alle_ablaeufe():
    for pfad in sorted(glob.glob(os.path.join(ABLAEUFE, "*.yml"))):
        with open(pfad, encoding="utf-8") as f:
            roh = f.read()
        yield os.path.basename(pfad), roh, yaml.safe_load(roh)


# ── 1. Die Trennung ──────────────────────────────────────────────────

def test_die_nebenbereiche_haben_eigene_ordner_mit_tests():
    js = glob.glob(os.path.join(NEBEN_JS, "test-*.js"))
    py = glob.glob(os.path.join(NEBEN_PY, "test_*.py"))
    assert len(js) >= 40 and len(py) >= 20, (
        f"unter tests/nebenbereiche liegen nur {len(js)} JS- und {len(py)} "
        "Python-Tests — die Trennung ist verloren gegangen")


def test_kein_champions_oder_pocket_test_liegt_wieder_im_kern():
    """Eine neue Testdatei landet aus Gewohnheit in tests/unit. Heisst sie
    nach einem Nebenbereich, gehoert sie nach tests/nebenbereiche."""
    muster = re.compile(r"^test[-_](champions|pocket|side[-_]quest|rechner[-_](kader|kampflage|reiter|schnellleiste|items)|team[-_]rechner|victory[-_]road|opgg|qr[-_]svg)")
    im_kern = [os.path.basename(p) for p in
               glob.glob(os.path.join(WURZEL, "tests", "unit", "test-*.js"))
               + glob.glob(os.path.join(WURZEL, "tests", "python", "test_*.py"))
               if muster.match(os.path.basename(p))]
    # test_champions_nur_ein_scraper.py prueft den WOCHENLAUF (dass er keine
    # Champions-Datei zurueckkopiert) — das ist Kern.
    im_kern = [n for n in im_kern if n != "test_champions_nur_ein_scraper.py"]
    assert im_kern == [], (
        "diese Nebenbereich-Tests liegen im Kern und halten damit Tor und "
        "Deploy an: " + ", ".join(im_kern))


def test_tor_und_deploy_fahren_nur_den_kern():
    wochen = _ohne_kommentare(open(os.path.join(ABLAEUFE, "weekly-full-update.yml"),
                                   encoding="utf-8").read())
    deploy = _ohne_kommentare(open(os.path.join(ABLAEUFE, "deploy-pages.yml"),
                                   encoding="utf-8").read())
    for name, text in (("weekly-full-update.yml", wochen), ("deploy-pages.yml", deploy)):
        assert "nebenbereiche" not in text, (
            f"{name} faehrt die Nebenbereich-Suite — dann haelt ein "
            "Champions-Fehler wieder den Kern an")
    # und sie fahren den Kern wirklich (sonst waere "nicht nebenbereiche"
    # auch mit einer leeren Pruefung erfuellt)
    assert "tests/unit/test-*.js" in deploy and re.search(r"pytest tests/python", deploy)
    assert "run-js-unit-tests.sh" in wochen and "pytest tests/python" in wochen


def test_die_nebenbereiche_laufen_trotzdem_bei_jedem_push_und_pr():
    y = _laden("nebenbereiche-tests.yml")
    an = _ausloeser(y)
    assert "push" in an and "pull_request" in an, (
        "die Nebenbereich-Suite laeuft nicht bei jedem Push und PR — dann "
        "prueft sie niemand mehr")
    befehle = " ".join(str(s.get("run", "")) for s in _schritte(y))
    assert "run-js-unit-tests.sh tests/nebenbereiche/unit" in befehle
    assert "pytest tests/nebenbereiche/python" in befehle
    deploy = open(os.path.join(ABLAEUFE, "deploy-pages.yml"), encoding="utf-8").read()
    assert "nebenbereiche-tests" not in _ohne_kommentare(deploy), (
        "deploy-pages.yml haengt an der Nebenbereich-Suite")


# ── 2. Wer nach main schreibt, prueft vorher ─────────────────────────

def _tor_vor_push(y):
    """(Bereich des Tors, Index Tor, Index Push) im ersten Job mit Push."""
    for job in (y.get("jobs") or {}).values():
        schritte = job.get("steps") or []
        tor = [(i, s) for i, s in enumerate(schritte)
               if "scripts/tor_vor_dem_push.sh" in str(s.get("run", ""))]
        push = [i for i, s in enumerate(schritte)
                if re.search(r"git push|daten_pushen|push_nach_rebase", str(s.get("run", "")))]
        if push:
            if not tor:
                return None, None, push[0]
            i, s = tor[0]
            m = re.search(r"tor_vor_dem_push\.sh\s+(\w+)", str(s.get("run", "")))
            return (m.group(1) if m else "kern"), i, push[0]
    return None, None, None


# Schreiber OHNE Tor, jeder mit Grund (30.09.2026). Bis dahin galt die
# Regel nur fuer GEPLANTE Ablaeufe, und fuenf handgestartete Scraper
# (City League, Kartentexte, Online-Decklisten, Spielerkontinuitaet,
# is_ace_spec-Reparatur) schrieben ungeprueft nach main.
OHNE_TOR = {
    "weekly-full-update.yml": "eigenes Tor (test_tor_und_testschritt_ziehen_gleich.py)",
    "patch-einspielen.yml": "schreibt nur auf patch/*-Zweige, nie nach main",
    "schriften-spiegeln.yml": "spiegelt Schriftdateien, keine Daten",
    "tutorial-screenshots.yml": "schreibt Bildschirmfotos, keine Daten",
}


def test_jeder_schreiber_hat_ein_tor_vor_dem_push():
    fehlt = []
    for name, roh, y in _alle_ablaeufe():
        if name in OHNE_TOR:
            continue
        if not _schreibt_nach_main(roh):
            continue
        bereich, i_tor, i_push = _tor_vor_push(y)
        if i_tor is None or i_tor > i_push:
            fehlt.append(f"{name}: kein Tor vor dem Push")
            continue
        soll = "alle" if name in SCHREIBEN_NEBENBEREICHE else "kern"
        if bereich != soll:
            fehlt.append(f"{name}: Tor mit Bereich {bereich!r}, soll {soll!r}")
    assert not fehlt, ("Ablaeufe, die ungeprueft nach main schreiben:\n  "
                       + "\n  ".join(fehlt))


def test_das_tor_hat_node_und_zeit():
    """Ohne Node schliesst das Tor (Absicht) — dann pusht der Ablauf nie
    wieder. Und das Tor braucht im Deploy-Test gemessene 6,5 Minuten; ein
    Job mit 10 Minuten Limit stirbt daran."""
    probleme = []
    for name, roh, y in _alle_ablaeufe():
        if "scripts/tor_vor_dem_push.sh" not in _ohne_kommentare(roh):
            continue
        for job in (y.get("jobs") or {}).values():
            schritte = job.get("steps") or []
            i_tor = next((i for i, s in enumerate(schritte)
                          if "scripts/tor_vor_dem_push.sh" in str(s.get("run", ""))), None)
            if i_tor is None:
                continue
            if not any("setup-node" in str(s.get("uses", "")) for s in schritte[:i_tor]):
                probleme.append(f"{name}: kein setup-node vor dem Tor")
            if int(job.get("timeout-minutes", 360)) < 25:
                probleme.append(f"{name}: timeout-minutes {job.get('timeout-minutes')} < 25")
    assert not probleme, "\n".join(probleme)


def test_das_tor_folgt_der_bedingung_des_pushs():
    """Ein Trockenlauf (inputs.trocken) pusht nicht — dann soll das Tor ihn
    auch nicht rot machen. Wo der Push eine Bedingung traegt, traegt das
    Tor dieselbe."""
    abweichend = []
    for name, roh, y in _alle_ablaeufe():
        for job in (y.get("jobs") or {}).values():
            schritte = job.get("steps") or []
            tor = [s for s in schritte if "scripts/tor_vor_dem_push.sh" in str(s.get("run", ""))]
            push = [s for s in schritte if re.search(r"git push|daten_pushen|push_nach_rebase", str(s.get("run", "")))]
            if tor and push and name != "weekly-full-update.yml":
                if tor[0].get("if") != push[0].get("if"):
                    abweichend.append(f"{name}: Tor if={tor[0].get('if')!r}, Push if={push[0].get('if')!r}")
    assert not abweichend, "\n".join(abweichend)
