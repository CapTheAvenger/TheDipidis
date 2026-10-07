"""Das Tor rollt die rote DATEI zurueck und gibt den Rest frei — am Verhalten.

scripts/tor_vor_dem_push.sh (mit scripts/tor_rollback.py) laeuft in einem
Wegwerf-Git-Baum mit echten, winzigen pytest-Dateien: ein Test liest
data/pokedex.json, einer data/preise.json. Befund 07.10.2026: ein einziger
datenabhaengiger roter Test warf den ganzen Tageslauf weg; fuenf von sieben
roten Planlaeufen seit dem 25.09. waren genau das.
"""
import json
import os
import shutil
import subprocess
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_tor_vor_dem_push import JS_ATTRAPPE, SKRIPT  # noqa: E402

WURZEL = os.path.dirname(SKRIPT).rsplit(os.sep, 1)[0]
ROLLBACK = os.path.join(WURZEL, "scripts", "tor_rollback.py")

TEST = '''import json


def test_pokedex_hat_arten():
    assert len(json.load(open("data/pokedex.json"))) >= 2


def test_preise_sind_zahlen():
    assert all(isinstance(v, (int, float)) for v in json.load(open("data/preise.json")).values())
'''


def git(b, *a):
    return subprocess.run(["git", *a], cwd=str(b), capture_output=True, text=True, check=True).stdout


def _baum(tmp_path, immer_rot=False):
    b = tmp_path / "baum"
    (b / "scripts").mkdir(parents=True)
    (b / "tests" / "python").mkdir(parents=True)
    (b / "data").mkdir()
    shutil.copy(SKRIPT, b / "scripts" / "tor_vor_dem_push.sh")
    shutil.copy(ROLLBACK, b / "scripts" / "tor_rollback.py")
    (b / "scripts" / "run-js-unit-tests.sh").write_text(JS_ATTRAPPE)
    (b / "tests" / "python" / "test_daten.py").write_text(TEST)
    if immer_rot:
        (b / "tests" / "python" / "test_immer_rot.py").write_text("def test_x():\n    assert False\n")
    (b / "data" / "pokedex.json").write_text(json.dumps(["a", "b", "c"]))
    (b / "data" / "preise.json").write_text(json.dumps({"x": 1.5}))
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


def _lies(b, name):
    return (b / "data" / name).read_text()


def test_die_rote_datei_bleibt_alt_die_gute_geht_durch(tmp_path):
    b = _baum(tmp_path)
    (b / "data" / "pokedex.json").write_text(json.dumps(["a"]))        # bricht den Test
    (b / "data" / "preise.json").write_text(json.dumps({"x": 2.5}))    # gut
    rc, aus = _tor(b)
    assert rc == 0, aus
    assert json.loads(_lies(b, "pokedex.json")) == ["a", "b", "c"], "rote Datei nicht zurueckgerollt"
    assert json.loads(_lies(b, "preise.json")) == {"x": 2.5}, "gute Datei wurde mitgerollt"
    assert "pokedex.json" in aus and "preise.json" not in aus.split("Tor offen")[-1]


def test_zwei_rote_dateien_werden_beide_zurueckgerollt(tmp_path):
    b = _baum(tmp_path)
    (b / "data" / "pokedex.json").write_text(json.dumps(["a"]))
    (b / "data" / "preise.json").write_text(json.dumps({"x": "kaputt"}))
    rc, aus = _tor(b)
    assert rc == 0, aus
    assert json.loads(_lies(b, "pokedex.json")) == ["a", "b", "c"]
    assert json.loads(_lies(b, "preise.json")) == {"x": 1.5}


def test_neue_rote_datei_wird_entfernt(tmp_path):
    b = _baum(tmp_path)
    (b / "data" / "preise.json").write_text(json.dumps({"x": 1.5, "y": "kaputt"}))
    (b / "data" / "neu.json").write_text("{}")
    rc, aus = _tor(b)
    assert rc == 0, aus
    assert _lies(b, "preise.json") == json.dumps({"x": 1.5})
    assert (b / "data" / "neu.json").exists(), "eine unschuldige neue Datei wurde entfernt"


def test_liegt_es_nicht_an_den_daten_bleibt_das_tor_zu_und_alles_unveraendert(tmp_path):
    b = _baum(tmp_path, immer_rot=True)
    (b / "data" / "preise.json").write_text(json.dumps({"x": 2.5}))
    rc, aus = _tor(b)
    assert rc == 1, aus
    assert json.loads(_lies(b, "preise.json")) == {"x": 2.5}, "Datei wurde angefasst, obwohl nicht sie schuld ist"


def test_ohne_rollback_ist_dasselbe_rot(tmp_path):
    """Verfaelschungsprobe: ohne Zurueckrollen bleibt das Tor zu."""
    b = _baum(tmp_path)
    (b / "data" / "pokedex.json").write_text(json.dumps(["a"]))
    rc, aus = _tor(b, TOR_OHNE_ROLLBACK=1)
    assert rc == 1, aus


def test_nach_dem_commit_wird_der_commit_bereinigt(tmp_path):
    """Lauf nach dem Rebase: der Commit steht schon vor origin/main."""
    b = _baum(tmp_path)
    git(b, "update-ref", "refs/remotes/origin/main", "HEAD")
    (b / "data" / "pokedex.json").write_text(json.dumps(["a"]))
    (b / "data" / "preise.json").write_text(json.dumps({"x": 2.5}))
    git(b, "commit", "-qam", "Auto: Lauf")
    rc, aus = _tor(b)
    assert rc == 0, aus
    assert git(b, "status", "--porcelain", "data").strip() == "", "Arbeitsbaum nicht sauber"
    diff = git(b, "diff", "--name-only", "origin/main", "HEAD").split()
    assert diff == ["data/preise.json"], diff
