"""Die Namensbruecke wird geprueft — aber im Guardian, nicht im Deploy-Gate.

Vorgeschichte, weil sie der eigentliche Punkt ist:

PR #517 (25.08.2026) brachte js/champions-names.js und dazu einen Unit-Test
mit der Zusicherung "alle 353 Nutzungs-Slugs loesen auf". Der Test haengt im
Deploy-Gate. Am 26.08.2026 um 14:12 UTC schrieb der Scraper einen frischen
Stand mit 238 Eintraegen — die Quelle hatte rund 115 Zierformen
zurueckgezogen. Der Test fiel, das Gate hielt, `Deploy to GitHub Pages`
uebersprang build und deploy. Die Seite stand still, obwohl an der
Aufloesung nichts kaputt war.

Genau derselbe Fehler, den PR #516 einen Tag zuvor fuer die
Plausibilitaetspruefungen behoben hatte: eine DATEN-Zusicherung im
CODE-Gate. Die Regel dafuer steht in CLAUDE.md — "Absolute quality
thresholds produce noise here" — und die Entscheidung vom 25.08. lautete:
melden statt sperren.

Die Pruefung selbst ist gut und hat im selben Lauf etwas gefunden:
'fan-rotom' war neu (die Quelle fuehrt seither BEIDE Richtungen, 'rotom-fan'
und 'fan-rotom') und loeste nicht auf. Sie lebt jetzt hier.
"""
import importlib.util
import json
import os
import shutil
import subprocess

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _guardian():
    pfad = os.path.join(ROOT, "scripts", "data_guardian.py")
    spec = importlib.util.spec_from_file_location("data_guardian_namen", pfad)
    modul = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modul)
    return modul


def test_die_pruefung_existiert_und_haengt_im_lauf():
    """Eine Pruefung, die main() nicht aufruft, ist keine Pruefung."""
    quelle = open(os.path.join(ROOT, "scripts", "data_guardian.py"), encoding="utf-8").read()
    assert "def check_champions_namen(" in quelle
    # im main()-Block, nicht irgendwo
    start = quelle.index("def main(")
    assert "check_champions_namen(findings)" in quelle[start:]


def test_der_heutige_stand_loest_vollstaendig_auf():
    """Kein Slug der ausgelieferten Datei darf ins Leere zeigen."""
    if shutil.which("node") is None:
        pytest.skip("node ist hier nicht verfuegbar")
    befunde = []
    _guardian().check_champions_namen(befunde)
    ungeloest = [b for b in befunde if "resolve to no species" in b[1]]
    assert not ungeloest, ungeloest


def test_sie_meldet_und_sperrt_nicht():
    """WARN, nie CRITICAL — eine Fremdquelle darf die Auslieferung nicht anhalten.

    Das ist die Zusicherung, an der sich der Fehler vom 26.08. nicht
    wiederholen darf: selbst wenn morgen die Haelfte der Slugs nicht mehr
    aufloest, bleibt es eine Meldung.
    """
    quelle = open(os.path.join(ROOT, "scripts", "data_guardian.py"), encoding="utf-8").read()
    start = quelle.index("def check_champions_namen(")
    ende = quelle.index("def check_champions_freshness(")
    block = quelle[start:ende]
    assert 'findings.append(("CRITICAL"' not in block, \
        "check_champions_namen darf nichts als CRITICAL melden — sonst sperrt es wieder"
    assert 'findings.append(("WARN"' in block


def test_kein_stilles_bestehen_ohne_node():
    """Fehlt node, muss die Pruefung das SAGEN, nicht schweigend gruen sein."""
    quelle = open(os.path.join(ROOT, "scripts", "data_guardian.py"), encoding="utf-8").read()
    start = quelle.index("def check_champions_namen(")
    ende = quelle.index("def check_champions_freshness(")
    block = quelle[start:ende]
    assert "FileNotFoundError" in block
    assert "node ist hier nicht verfuegbar" in block


def test_die_regel_selbst_wird_ausgefuehrt_nicht_nachgebaut():
    """Zwei Implementierungen derselben Namensregeln waeren zwei Wahrheiten.

    Der Guardian fuehrt js/champions-names.js aus. Wer die Regeln hier in
    Python nachbaut, hat ab dem naechsten Sonderfall zwei Ergebnisse.
    """
    quelle = open(os.path.join(ROOT, "scripts", "data_guardian.py"), encoding="utf-8").read()
    start = quelle.index("def check_champions_namen(")
    ende = quelle.index("def check_champions_freshness(")
    block = quelle[start:ende]
    assert "champions-names.js" in block
    assert '"node"' in block


def test_das_deploy_gate_traegt_keine_stueckzahl_mehr():
    """Der Unit-Test darf nicht wieder an einer Tageszahl haengen."""
    pfad = os.path.join(ROOT, "tests", "unit", "test-champions-names.js")
    quelle = open(pfad, encoding="utf-8").read()
    # Nur ausgefuehrte Zeilen zaehlen; im Kommentar darf die alte Schwelle
    # als Beleg stehenbleiben.
    code = [z for z in quelle.splitlines()
            if "assert" in z and not z.strip().startswith(("//", "*", "/*"))]
    schwelle = [z for z in code if "SLUGS.length >" in z and "> 0" not in z]
    assert not schwelle, \
        f"eine feste Slug-Schwelle ist zurueck — genau die hielt am 26.08. den Deploy an: {schwelle}"
    # In Kommentaren darf die Zahl als Beleg stehenbleiben — als lebende
    # Zusicherung nicht. Geprueft wird deshalb der Testtitel, nicht die Datei.
    titel = [z for z in quelle.splitlines() if z.strip().startswith("it(")]
    assert not [z for z in titel if "353" in z], \
        f"ein Testtitel haengt wieder an einer Stueckzahl: {titel}"
    # Was bleiben MUSS: feste Beispiele, die unabhaengig vom Tagesstand gelten.
    assert "'fan-rotom':" in quelle
    assert "'hisuian-zoroark':" in quelle


def test_fan_rotom_loest_auf():
    """Der echte Fund des 26.08. — festgehalten, damit er nicht zurueckkommt."""
    if shutil.which("node") is None:
        pytest.skip("node ist hier nicht verfuegbar")
    skript = (
        "const fs=require('fs'),vm=require('vm');const sb={window:{}};"
        "vm.createContext(sb);"
        "vm.runInContext(fs.readFileSync(process.argv[1],'utf8'),sb);"
        "const DEX=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));"
        "console.log(JSON.stringify({"
        "fan:sb.window.ChampionsNames.zuShowdown('fan-rotom',DEX),"
        "rotom:sb.window.ChampionsNames.zuShowdown('rotom-fan',DEX),"
        "quatsch:sb.window.ChampionsNames.zuShowdown('gibtesnicht-ganzsicher',DEX)}));"
    )
    out = subprocess.run(
        ["node", "-e", skript, "--",
         os.path.join(ROOT, "js", "champions-names.js"),
         os.path.join(ROOT, "data", "pokemon_battle_data.json")],
        cwd=ROOT, capture_output=True, text=True, timeout=60)
    assert out.returncode == 0, out.stderr[-400:]
    res = json.loads(out.stdout.strip().splitlines()[-1])
    assert res["fan"] == "Rotom-Fan"
    assert res["rotom"] == "Rotom-Fan"
    # Die Umkehrregel darf nicht anfangen zu raten.
    assert res["quatsch"] is None
