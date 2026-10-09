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


def tor_und_push_befunde(name, y):
    """Passt die Bedingung des Tors zu der des Pushs — und haelt das Tor
    den Push wirklich an?

    Zwei Regeln:
      1. Ein Trockenlauf (inputs.trocken) pusht nicht — dann soll das Tor
         ihn auch nicht rot machen. Wo der Push eine Bedingung traegt,
         traegt das Tor dieselbe.
      2. (30.09.2026) Laeuft der Push auch nach einem Fehler (`always()`,
         `!cancelled()`, `failure()`), laeuft er auch nach einem ROTEN Tor
         — dann haelt das Tor nichts an. Gefunden an pokepricelab-verify:
         Tor und Commit trugen beide `if: always()`. Ein solcher Push muss
         am Erfolg des Tors haengen: `steps.<id>.outcome == 'success'`.
    """
    aus = []
    for job in (y.get("jobs") or {}).values():
        schritte = job.get("steps") or []
        tor = [s for s in schritte if "scripts/tor_vor_dem_push.sh" in str(s.get("run", ""))]
        push = [s for s in schritte if re.search(r"git push|daten_pushen|push_nach_rebase", str(s.get("run", "")))]
        if not (tor and push) or name == "weekly-full-update.yml":
            continue
        t_if, p_if = str(tor[0].get("if") or ""), str(push[0].get("if") or "")
        if re.search(r"always\(\)|!\s*cancelled\(\)|failure\(\)", p_if):
            tid = tor[0].get("id")
            if not tid or not re.search(r"steps\.%s\.outcome\s*==\s*'success'" % re.escape(str(tid)), p_if):
                aus.append(f"{name}: der Push laeuft mit {p_if!r} auch nach rotem Tor")
        elif t_if != p_if:
            aus.append(f"{name}: Tor if={t_if!r}, Push if={p_if!r}")
    return aus


def test_das_tor_folgt_der_bedingung_des_pushs():
    abweichend = []
    for name, roh, y in _alle_ablaeufe():
        abweichend += tor_und_push_befunde(name, y)
    assert not abweichend, "\n".join(abweichend)


def test_die_tor_regel_beisst():
    """Verfaelschungsprobe: der Stand von pokepricelab-verify bis 30.09."""
    def ablauf(tor_if, tor_id, push_if):
        tor = {"name": "Tor", "run": "bash scripts/tor_vor_dem_push.sh kern"}
        if tor_if:
            tor["if"] = tor_if
        if tor_id:
            tor["id"] = tor_id
        push = {"name": "Commit", "run": "bash scripts/daten_pushen.sh x"}
        if push_if:
            push["if"] = push_if
        return {"jobs": {"j": {"steps": [tor, push]}}}
    assert tor_und_push_befunde("p.yml", ablauf("always()", None, "always()"))
    assert tor_und_push_befunde("p.yml", ablauf("always()", "tor", "${{ always() && steps.andere.outcome == 'success' }}"))
    assert not tor_und_push_befunde("p.yml", ablauf("always()", "tor", "${{ always() && steps.tor.outcome == 'success' }}"))
    assert tor_und_push_befunde("p.yml", ablauf("inputs.x", None, None))
    assert not tor_und_push_befunde("p.yml", ablauf(None, None, None))


# ── SC-28 / SC-29 (09.10.2026): JEDER JOB HAT EINE ZEITGRENZE, JEDES TOR EINE SICHERUNG ──
#
# Bei PR #952 hingen `visual-nonmeta` und `sprachreinheit` ueber 1,5 Stunden
# ohne Ergebnis (Median dieser Laeufe: 1,1 bzw. 1,6 Minuten); beide Jobs
# hatten kein `timeout-minutes`, ebenso vier weitere Ablaeufe und alle drei
# Jobs des Deploys. `test_das_tor_hat_node_und_zeit` oben prueft nur Tor-Jobs
# und nimmt bei fehlendem Schluessel stillschweigend 360 an — genau die Luecke.
# Verfaelschungsprobe 09.10.2026: `timeout-minutes` aus ace-spec-reparatur.yml
# entfernt → rot; `id: tor` aus kartentexte.yml entfernt → rot.

def test_jeder_job_jeder_ablaufdatei_hat_eine_zeitgrenze():
    ohne = []
    for name, roh, y in _alle_ablaeufe():
        for job_name, job in (y.get("jobs") or {}).items():
            if "timeout-minutes" not in (job or {}):
                ohne.append(f"{name}: Job {job_name}")
    assert not ohne, ("Jobs ohne timeout-minutes — ein haengender Laeufer blockiert sonst "
                      "stundenlang (SC-28):\n  " + "\n  ".join(ohne))


def test_jedes_tor_sichert_seine_protokolle():
    """Nach einem Zurueckrollen zeigt das Schrittprotokoll nur den zweiten
    Durchlauf (SC-29). `erstlauf/*.log` und `rollback/neu/` liegen nur in
    `$RUNNER_TEMP/tor` — ohne Artefakt sind sie weg, sobald der Laeufer weg
    ist. Der Schritt haengt an `steps.tor`: das Tor braucht dafuer `id: tor`
    und schreibt `rollback=` in GITHUB_OUTPUT (scripts/tor_vor_dem_push.sh)."""
    probleme = []
    for name, roh, y in _alle_ablaeufe():
        if not _schreibt_nach_main(roh) or name == "weekly-full-update.yml":
            continue  # Proben ohne Push (setwechsel-probe) und der Wochenlauf (sichert data/ komplett)
        for job_name, job in (y.get("jobs") or {}).items():
            schritte = (job or {}).get("steps") or []
            tore = [i for i, s in enumerate(schritte)
                    if "scripts/tor_vor_dem_push.sh" in str(s.get("run", ""))]
            if not tore:
                continue
            i_tor = tore[0]
            if schritte[i_tor].get("id") != "tor":
                probleme.append(f"{name}/{job_name}: Tor-Schritt ohne `id: tor`")
            sicherung = [s for s in schritte[i_tor + 1:]
                         if "upload-artifact" in str(s.get("uses", ""))
                         and "/tor" in str((s.get("with") or {}).get("path", ""))]
            if not sicherung:
                probleme.append(f"{name}/{job_name}: kein Schritt, der $RUNNER_TEMP/tor als Artefakt sichert")
                continue
            bedingung = str(sicherung[0].get("if") or "")
            if "always()" not in bedingung or "steps.tor.outcome" not in bedingung:
                probleme.append(f"{name}/{job_name}: Sicherung laeuft nicht nach einem roten Tor "
                                f"(`if` ist {bedingung!r}, braucht always() und steps.tor.outcome)")
    assert not probleme, "\n".join(probleme)


def test_das_tor_meldet_das_zurueckrollen_als_ausgabe():
    """Der Sicherungsschritt oben liest `steps.tor.outputs.rollback`; das Tor
    muss den Wert also schreiben — sonst ist die Bedingung immer falsch und
    ein geheilter Lauf hinterlaesst nichts zum Nachlesen."""
    with open(os.path.join(WURZEL, "scripts", "tor_vor_dem_push.sh"), encoding="utf-8") as f:
        tor = _ohne_kommentare(f.read())
    assert re.search(r'echo "rollback=\$rollback" >> "\$GITHUB_OUTPUT"', tor), (
        "scripts/tor_vor_dem_push.sh schreibt `rollback=` nicht nach GITHUB_OUTPUT")
    assert "erstlauf" in tor and "Rot im ERSTEN Durchlauf" in tor, (
        "das Tor nennt den ersten Durchlauf nicht mehr in der Zusammenfassung")
