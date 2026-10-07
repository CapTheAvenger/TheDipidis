"""WZ-38 (Hausi 07.10.2026): stark geschrumpfte Datendateien — Warnung unter
0,75, Stopp unter 0,5. Ausgefuehrt im Wegwerf-Baum mit dem echten Tor."""
import json
import os
import shutil
import subprocess
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_tor_vor_dem_push import JS_ATTRAPPE, SKRIPT  # noqa: E402

WURZEL = os.path.dirname(SKRIPT).rsplit(os.sep, 1)[0]


def git(b, *a):
    return subprocess.run(["git", *a], cwd=str(b), capture_output=True, text=True, check=True).stdout


def _baum(tmp_path):
    b = tmp_path / "baum"
    (b / "scripts").mkdir(parents=True)
    (b / "tests" / "python").mkdir(parents=True)
    (b / "data").mkdir()
    for f in ("tor_vor_dem_push.sh", "tor_rollback.py", "schrumpf_waechter.py"):
        shutil.copy(os.path.join(WURZEL, "scripts", f), b / "scripts" / f)
    (b / "scripts" / "run-js-unit-tests.sh").write_text(JS_ATTRAPPE)
    (b / "tests" / "python" / "test_ok.py").write_text("def test_ok():\n    assert True\n")
    (b / "data" / "gross.json").write_text(json.dumps(list(range(2000))))   # ~10 KB
    (b / "data" / "klein.json").write_text(json.dumps([1, 2, 3]))
    git(b, "init", "-q", "-b", "main")
    git(b, "config", "user.email", "t@t")
    git(b, "config", "user.name", "t")
    git(b, "add", "-A")
    git(b, "commit", "-qm", "basis")
    return b


def _tor(b, **env):
    e = dict(os.environ, TOR_OHNE_INSTALL="1", RUNNER_TEMP=str(b / "tmp"),
             **{k: str(v) for k, v in env.items()})
    e.pop("GITHUB_STEP_SUMMARY", None)
    r = subprocess.run(["bash", "scripts/tor_vor_dem_push.sh", "kern"], cwd=str(b), env=e,
                       capture_output=True, text=True, timeout=300)
    return r.returncode, r.stdout + r.stderr


@pytest.fixture(autouse=True)
def _braucht_node():
    if not shutil.which("node"):
        pytest.skip("node fehlt")


def test_unter_der_haelfte_bleibt_die_datei_alt(tmp_path):
    b = _baum(tmp_path)
    (b / "data" / "gross.json").write_text(json.dumps(list(range(700))))    # ~0,33
    rc, aus = _tor(b)
    assert rc == 0, aus
    assert "STOPP: data/gross.json" in aus
    assert len(json.loads((b / "data" / "gross.json").read_text())) == 2000


def test_zwischen_haelfte_und_dreiviertel_nur_warnung(tmp_path):
    b = _baum(tmp_path)
    (b / "data" / "gross.json").write_text(json.dumps(list(range(1250))))   # ~0,6
    rc, aus = _tor(b)
    assert rc == 0, aus
    assert "WARNUNG: data/gross.json" in aus and "STOPP" not in aus
    assert len(json.loads((b / "data" / "gross.json").read_text())) == 1250


def test_kleine_dateien_zaehlen_nicht(tmp_path):
    b = _baum(tmp_path)
    (b / "data" / "klein.json").write_text(json.dumps([1]))
    rc, aus = _tor(b)
    assert rc == 0, aus
    assert "klein.json" not in aus


def test_abgeschaltet_bleibt_die_geschrumpfte_datei(tmp_path):
    """Verfaelschungsprobe: ohne Waechter geht die halbe Datei durch."""
    b = _baum(tmp_path)
    (b / "data" / "gross.json").write_text(json.dumps(list(range(700))))
    rc, aus = _tor(b, TOR_OHNE_SCHRUMPF=1)
    assert rc == 0, aus
    assert len(json.loads((b / "data" / "gross.json").read_text())) == 700
