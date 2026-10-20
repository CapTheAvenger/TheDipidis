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


# ── SC-41 (20.10.2026, Wochenlauf #186) ─────────────────────────────────────
#
# Der Waechter setzte data/masterclass_online_listen.json zurueck (0 Listen im
# 7-Tage-Fenster, 5976 -> 63 Bytes — nach DA-26 richtig), die daraus schon
# gebaute masterclass_live/mega-stalobor.json blieb frisch. Das Tor fand den
# Widerspruch und hielt nach 2 h 37 min die ganze Turnierwoche zurueck.

def test_eine_erlaubt_leere_datei_bleibt_frisch(tmp_path):
    b = _baum(tmp_path)
    p = b / "data" / "masterclass_online_listen.json"
    p.write_text(json.dumps({"listen": list(range(2000))}))
    git(b, "add", "-A")
    git(b, "commit", "-qm", "listen")
    p.write_text(json.dumps({"listen": []}))
    rc, aus = _tor(b)
    assert rc == 0, aus
    assert json.loads(p.read_text()) == {"listen": []}, "die leere Gruppe wurde zurueckgesetzt"
    assert "WARNUNG: data/masterclass_online_listen.json" in aus and "erlaubt: DA-26" in aus, aus


def test_die_familie_geht_mit_zurueck(tmp_path):
    b = _baum(tmp_path)
    (b / "data" / "champions_usage.json").write_text(json.dumps(list(range(2000))))
    (b / "data" / "champions_pokedex.json").write_text(json.dumps({"v": 1}))
    git(b, "add", "-A")
    git(b, "commit", "-qm", "familie")
    (b / "data" / "champions_usage.json").write_text(json.dumps(list(range(300))))  # STOPP
    (b / "data" / "champions_pokedex.json").write_text(json.dumps({"v": 2}))        # abgeleitet
    (b / "data" / "champions_neu.json").write_text("{}")                            # neu, Familie
    (b / "data" / "gross.json").write_text(json.dumps(list(range(1900))))          # fremd
    rc, aus = _tor(b)
    assert rc == 0, aus
    assert len(json.loads((b / "data" / "champions_usage.json").read_text())) == 2000
    assert json.loads((b / "data" / "champions_pokedex.json").read_text()) == {"v": 1}, \
        "die abgeleitete Datei blieb frisch, die Quelle alt — genau der Widerspruch vom 20.10."
    assert not (b / "data" / "champions_neu.json").exists()
    assert len(json.loads((b / "data" / "gross.json").read_text())) == 1900, "fremde Datei mitgerollt"
    zeilen = [z for z in aus.splitlines() if z.startswith("::warning::Schrumpf-Waechter STOPP-FAMILIE")]
    assert len(zeilen) == 1, "eine Sammelzeile, nicht eine Warnung je Datei (10er-Grenze, SC-37)"
    assert "data/champions_pokedex.json" in zeilen[0] and "data/champions_neu.json" in zeilen[0]
    gemerkt = (b / "tmp" / "tor_zurueckgerollt.txt").read_text().split()
    assert {"data/champions_usage.json", "data/champions_pokedex.json"} <= set(gemerkt), gemerkt


def test_steht_der_commit_schon_kommt_die_ganze_familie_hinein(tmp_path):
    """Prueffund SC-41: ein gemeinsames `git add` mit einer geloeschten, nie
    getrackten Datei scheitert — dann waere auch die STOPP-Datei nicht im Commit."""
    b = _baum(tmp_path)
    (b / "data" / "champions_usage.json").write_text(json.dumps(list(range(2000))))
    git(b, "add", "-A")
    git(b, "commit", "-qm", "familie")
    git(b, "update-ref", "refs/remotes/origin/main", "HEAD")
    (b / "data" / "champions_usage.json").write_text(json.dumps(list(range(300))))
    (b / "data" / "gross.json").write_text(json.dumps(list(range(1900))))   # der Rest des Laufs
    git(b, "add", "data/champions_usage.json", "data/gross.json")
    git(b, "commit", "-qm", "lauf")                                   # Commit vor dem Tor
    (b / "data" / "champions_neu.json").write_text("{}")              # ungetrackt, Familie
    rc, aus = _tor(b)
    assert rc == 0, aus
    im_commit = json.loads(git(b, "show", "HEAD:data/champions_usage.json"))
    assert len(im_commit) == 2000, "der geschrumpfte Stand steht noch im Commit"
    assert len(json.loads(git(b, "show", "HEAD:data/gross.json"))) == 1900, "der Rest fehlt im Commit"


def test_der_waechter_kennt_jeden_erlaubten_eintrag_mit_grund():
    sys.path.insert(0, os.path.join(WURZEL, "scripts"))
    import schrumpf_waechter as W
    for f, grund in W.DARF_SCHRUMPFEN.items():
        assert f.startswith("data/") and len(grund) > 30, (f, grund)
        assert os.path.exists(os.path.join(WURZEL, f)), f"{f} gibt es nicht mehr — Eintrag streichen"
