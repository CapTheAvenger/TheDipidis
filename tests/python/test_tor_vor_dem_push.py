"""Das Tor vor dem Push schliesst, wenn eine Suite rot ist — und nur dann.

scripts/tor_vor_dem_push.sh wird hier AUSGEFUEHRT, in einem Wegwerf-Baum
mit gesetzten Suiten: eine Attrappe fuer den JS-Runner (Rueckgabewert per
Umgebung) und echte, winzige pytest-Dateien in tests/python und
tests/nebenbereiche/python. Keine Textsuche im Skript.

Dazu die Beziehung, die schon fuer das Tor des Wochenlaufs gilt: was der
Testschritt von deploy-pages.yml installiert, installiert auch dieses Tor —
sonst bricht pytest beim Einsammeln ab (Rueckgabewert 2), und das Tor
blockiert jeden Lauf, egal wie gut die Daten sind (Befund 22.09.2026).
"""
import os
import shutil
import subprocess
import sys

import pytest

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SKRIPT = os.path.join(WURZEL, "scripts", "tor_vor_dem_push.sh")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_tor_und_testschritt_ziehen_gleich import _pakete, DEPLOY  # noqa: E402

JS_ATTRAPPE = """#!/bin/bash
ordner="${1:-tests/unit}"
echo "Attrappe fuer $ordner"
if [ "$ordner" = "tests/nebenbereiche/unit" ]; then rc="${JS_NEBEN_RC:-0}"; else rc="${JS_KERN_RC:-0}"; fi
echo "JS unit tests: 1 passed, $rc failed"
exit "$rc"
"""


def _baum(tmp_path, py_kern_rot=False, py_neben_rot=False):
    b = tmp_path / "baum"
    (b / "scripts").mkdir(parents=True)
    shutil.copy(SKRIPT, b / "scripts" / "tor_vor_dem_push.sh")
    (b / "scripts" / "run-js-unit-tests.sh").write_text(JS_ATTRAPPE)
    for teil, rot in (("tests/python", py_kern_rot), ("tests/nebenbereiche/python", py_neben_rot)):
        d = b / teil
        d.mkdir(parents=True)
        (d / "test_probe.py").write_text(
            "def test_probe():\n    assert %s\n" % ("False" if rot else "True"))
    (b / "data").mkdir()
    (b / "data" / "probe.csv").write_text("a,b\n1,2\n")
    return b


def _tor(baum, bereich, **umgebung):
    env = dict(os.environ, TOR_OHNE_INSTALL="1", **{k: str(v) for k, v in umgebung.items()})
    env.pop("GITHUB_STEP_SUMMARY", None)
    env["RUNNER_TEMP"] = str(baum / "tmp")
    r = subprocess.run(["bash", str(baum / "scripts" / "tor_vor_dem_push.sh"), bereich],
                       cwd=str(baum), env=env, capture_output=True, text=True, timeout=300)
    return r.returncode, r.stdout + r.stderr


@pytest.fixture(autouse=True)
def _braucht_node():
    if not shutil.which("node"):
        pytest.skip("node fehlt — das Tor schliesst dann absichtlich")


def test_alles_gruen_das_tor_ist_offen(tmp_path):
    rc, aus = _tor(_baum(tmp_path), "alle")
    assert rc == 0, aus


def test_js_kern_rot_das_tor_ist_zu(tmp_path):
    rc, aus = _tor(_baum(tmp_path), "kern", JS_KERN_RC=1)
    assert rc == 1, "die JS-Suite ist rot, und das Tor laesst trotzdem durch:\n" + aus


def test_python_kern_rot_das_tor_ist_zu(tmp_path):
    rc, aus = _tor(_baum(tmp_path, py_kern_rot=True), "kern")
    assert rc == 1, "die Python-Suite ist rot, und das Tor laesst trotzdem durch:\n" + aus


def test_ein_roter_nebenbereich_haelt_den_kern_nicht_an(tmp_path):
    """Die Trennung, am Verhalten: Bereich `kern` sieht die Nebenbereiche
    nicht — Bereich `alle` schon."""
    b = _baum(tmp_path, py_neben_rot=True)
    rc_kern, aus = _tor(b, "kern", JS_NEBEN_RC=1)
    assert rc_kern == 0, "ein roter Nebenbereich schliesst das Kern-Tor:\n" + aus
    rc_alle, aus = _tor(b, "alle")
    assert rc_alle == 1, "Bereich alle prueft die Nebenbereiche nicht:\n" + aus


def test_das_tor_installiert_was_der_deploy_test_installiert():
    testschritt = _pakete(DEPLOY, ab="Install Python test dependencies", bis="Run Python unit tests")
    tor = _pakete(SKRIPT)
    assert testschritt and tor
    fehlt = sorted(testschritt - tor)
    assert not fehlt, f"das Tor installiert {fehlt} nicht, der Deploy-Test schon"
