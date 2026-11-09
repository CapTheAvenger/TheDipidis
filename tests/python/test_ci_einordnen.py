"""SC-50, Befund B2 (09.11.2026): ein Tor-Befund auf main haelt weder den
Deploy noch einen fremden PR an — ein PR, der etwas bricht, aber schon.

Geprueft am Verhalten von scripts/ci_einordnen.py: push = Sperrliste wie im
Tor; pull_request = sperrt alles, was auf main (echter Basis-Baum mit
pytest) NICHT ebenso rot ist.
"""
import os
import sys

import yaml

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
sys.path.insert(0, os.path.join(WURZEL, "scripts"))

import ci_einordnen as CI  # noqa: E402

BEFUND = "tests/python/test_masterclass_am_wochenlauf.py::test_x"
SPERR = "tests/python/test_consumers_vertrag_deckt_sich.py::test_y"


def _prot(tmp_path, py=(), rc=1):
    o = tmp_path / "ci"
    o.mkdir()
    (o / "py-kern.log").write_text("".join(f"FAILED {z} - x\n" for z in py)
                                   + f"{len(py)} failed, 10 passed in 1s\n")
    (o / "py-kern.rc").write_text(f"{rc if py else 0}\n")
    (o / "js-kern.log").write_text("JS unit tests: 5 passed, 0 failed\n")
    (o / "js-kern.rc").write_text("0\n")
    return str(o)


def test_push_laesst_einen_befund_durch(tmp_path):
    assert CI.entscheide(_prot(tmp_path, [BEFUND]), "push") == 0


def test_push_sperrt_die_sperrliste(tmp_path):
    assert CI.entscheide(_prot(tmp_path, [SPERR]), "push") == 1


def test_push_sperrt_einen_abgebrochenen_lauf(tmp_path):
    o = tmp_path / "ci"
    o.mkdir()
    (o / "py-kern.log").write_text("INTERNALERROR> boom\n")
    (o / "py-kern.rc").write_text("3\n")
    assert CI.entscheide(str(o), "push") == 1


def _basis(tmp_path, rot_auf_main: bool):
    b = tmp_path / "basis"
    (b / "tests" / "python").mkdir(parents=True)
    rumpf = "assert False" if rot_auf_main else "assert True"
    (b / "tests" / "python" / "test_pr.py").write_text(f"def test_x():\n    {rumpf}\n")
    return str(b)


def test_pr_sperrt_was_er_selbst_bricht(tmp_path):
    o = _prot(tmp_path, ["tests/python/test_pr.py::test_x"])
    assert CI.entscheide(o, "pull_request", _basis(tmp_path, rot_auf_main=False)) == 1


def test_pr_wird_von_einem_altbefund_auf_main_nicht_angehalten(tmp_path):
    o = _prot(tmp_path, ["tests/python/test_pr.py::test_x"])
    assert CI.entscheide(o, "pull_request", _basis(tmp_path, rot_auf_main=True)) == 0


def test_pr_ohne_basis_sperrt(tmp_path):
    assert CI.entscheide(_prot(tmp_path, [BEFUND]), "pull_request", "") == 1


def test_der_deploy_ruft_die_einordnung_nach_beiden_suiten():
    d = yaml.safe_load(open(os.path.join(WURZEL, ".github", "workflows", "deploy-pages.yml"),
                            encoding="utf-8"))
    schritte = d["jobs"]["test"]["steps"]
    namen = [s.get("name", "") for s in schritte]
    i = namen.index("Rote Zusicherungen einordnen")
    assert i > namen.index("Run JS unit tests") and i > namen.index("Run Python unit tests")
    assert "scripts/ci_einordnen.py" in schritte[i]["run"]
    assert "github.event_name" in str(schritte[i].get("env", {}))
    # die Suiten-Schritte schreiben Rueckgabewerte, die Einordnung braucht sie (B1)
    assert "js-kern.rc" in schritte[namen.index("Run JS unit tests")]["run"]
    assert "py-kern.rc" in schritte[namen.index("Run Python unit tests")]["run"]
    assert "abgebrochen" in schritte[namen.index("Run JS unit tests")]["run"]


# --- Pruefagent Runde 2 (09.11.2026) -------------------------------------

def _js_prot(tmp_path, datei):
    o = tmp_path / "ci"
    o.mkdir()
    (o / "py-kern.log").write_text("10 passed in 1s\n")
    (o / "py-kern.rc").write_text("0\n")
    (o / "js-kern.log").write_text(f"✗ {datei} — 1 failure(s)\nJS unit tests: 5 passed, 1 failed\n")
    (o / "js-kern.rc").write_text("1\n")
    return str(o)


def _js_basis(tmp_path, rumpf):
    b = tmp_path / "basis"
    (b / "tests" / "unit").mkdir(parents=True)
    (b / "tests" / "unit" / "test-a.js").write_text(rumpf)
    return str(b)


ROT_JS = ("const test = require('node:test'); const assert = require('node:assert');\n"
          "test('x', () => assert.strictEqual(1, 2));\n")


def test_s_a_ein_absturz_im_basis_baum_ist_kein_altbefund(tmp_path):
    """Stirbt die Datei auf main (OOM, fehlendes Modul), darf der PR nicht
    gruen werden — sonst lieesse jeder Absturz einen echten Bruch durch."""
    o = _js_prot(tmp_path, "tests/unit/test-a.js")
    b = _js_basis(tmp_path, "process.exit(9);\n")
    assert CI.entscheide(o, "pull_request", b) == 1


def test_s_a_ein_echtes_rot_im_basis_baum_bleibt_altbefund(tmp_path):
    o = _js_prot(tmp_path, "tests/unit/test-a.js")
    assert CI.entscheide(o, "pull_request", _js_basis(tmp_path, ROT_JS)) == 0


def test_s_a_pytest_sammelfehler_im_basis_baum_ist_kein_altbefund(tmp_path):
    o = _prot(tmp_path, ["tests/python/test_pr.py::test_x"])
    b = tmp_path / "basis"
    (b / "tests" / "python").mkdir(parents=True)
    (b / "tests" / "python" / "test_pr.py").write_text(
        "import gibt_es_nicht\ndef test_x():\n    assert False\n")
    assert CI.entscheide(o, "pull_request", str(b)) == 1


def test_s_b_ein_code_push_wird_gegen_den_vorgaenger_geprueft(tmp_path):
    o = _prot(tmp_path, [BEFUND])
    # BEFUND steht nicht auf der Sperrliste — als Datenlauf ginge er durch,
    # als Code-Push mit gruenem Vorgaenger nicht.
    assert CI.entscheide(o, "push") == 0
    assert CI.entscheide(o, "code", "") == 1


def _regel(tmp_path, dateien_je_commit, ereignis="push"):
    """Fuehrt den echten Einordnungs-Schritt aus deploy-pages.yml in einem
    Wegwerf-Repo aus; ci_einordnen.py ist durch ein Echo ersetzt."""
    import subprocess
    d = yaml.safe_load(open(os.path.join(WURZEL, ".github", "workflows", "deploy-pages.yml"),
                            encoding="utf-8"))
    schritt = [s for s in d["jobs"]["test"]["steps"]
               if s.get("name") == "Rote Zusicherungen einordnen"][0]
    skript = schritt["run"].replace("python3 scripts/ci_einordnen.py", "echo REGEL")
    repo = tmp_path / "repo"
    repo.mkdir()
    g = lambda *a: subprocess.run(["git", *a], cwd=repo, check=True, capture_output=True)  # noqa: E731
    g("init", "-q")
    g("config", "user.email", "t@t")
    g("config", "user.name", "t")
    for dateien in dateien_je_commit:
        for p in dateien:
            (repo / p).parent.mkdir(parents=True, exist_ok=True)
            (repo / p).write_text(str(len(list(repo.rglob("*")))))
        g("add", "-A")
        g("commit", "-qm", "c")
    rt = tmp_path / "rt"
    (rt / "ci").mkdir(parents=True)
    (rt / "ci" / "py-kern.log").write_text("1 passed\n")
    r = subprocess.run(["bash", "-c", skript], cwd=repo, capture_output=True, text=True,
                       env={**os.environ, "EREIGNIS": ereignis, "RUNNER_TEMP": str(rt),
                            "GITHUB_WORKSPACE": str(repo)})
    zeile = [z for z in r.stdout.splitlines() if z.startswith("REGEL")]
    assert zeile, r.stdout + r.stderr
    return zeile[0].split()[2]


def test_s_b_ein_datenlauf_bekommt_die_sperrliste(tmp_path):
    assert _regel(tmp_path, [["js/a.js"], ["data/x.csv", "images/champions/y.png"]]) == "push"


def test_s_b_ein_push_mit_code_bekommt_die_altbefund_regel(tmp_path):
    assert _regel(tmp_path, [["js/a.js"], ["data/x.csv", "js/a.js"]]) == "code"


def test_s_b_ohne_vorgaenger_sperrt_alles(tmp_path):
    assert _regel(tmp_path, [["data/x.csv"]]) == "code"


def test_s_b_der_test_job_holt_zwei_commits():
    d = yaml.safe_load(open(os.path.join(WURZEL, ".github", "workflows", "deploy-pages.yml"),
                            encoding="utf-8"))
    co = d["jobs"]["test"]["steps"][0]
    assert co.get("with", {}).get("fetch-depth") == 2
