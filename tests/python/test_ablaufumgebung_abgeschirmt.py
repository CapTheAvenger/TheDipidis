"""Kein Test schreibt in die Umgebung des echten Ablaufs.

ANLASS (29.09.2026, Wochenlauf #170)
-----------------------------------
Tor gruen (JS 6.219, Python 1.913), Daten gepusht, Deploy angestossen — und
trotzdem ein rotes X: "2 nicht blockierende Schritte gescheitert", obwohl
die Bilanz 9 von 9 OK zeigte. Die Zeile kam aus dem TOR: es faehrt die
Suite innerhalb des Ablaufs, test_wochenlauf_bilanz.py spielt die Bilanz mit
zwei erfundenen FAIL-Zeilen durch und reicht `os.environ` weiter — samt
GITHUB_ENV des echten Laufs. Seit die Bilanz ab zwei Ausfaellen
WEEKLY_FAIL_REASON setzt (PR #869), landete die erfundene Zahl im Lauf.
Lokal nachgestellt: ohne Abschirmung steht genau diese Zeile in GITHUB_ENV.

Abgeschirmt wird in tests/python/conftest.py und
tests/nebenbereiche/python/conftest.py. Beides wird hier AUSGEFUEHRT:
1. jede der beiden conftest-Dateien an einem Test, der wirklich in
   GITHUB_ENV/GITHUB_OUTPUT/GITHUB_STEP_SUMMARY schreibt;
2. alle Testdateien, die Unterprozesse starten, als eigener pytest-Lauf mit
   gesetzten Ablaufdateien — die muessen danach leer sein.
"""
import os
import shutil
import subprocess
import sys

import pytest

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ORDNER = [os.path.join(WURZEL, "tests", "python"),
          os.path.join(WURZEL, "tests", "nebenbereiche", "python")]
DATEIEN = ("GITHUB_ENV", "GITHUB_OUTPUT", "GITHUB_STEP_SUMMARY")

SCHREIBER = '''
import os, subprocess
def test_schreibt_wie_ein_ablaufschritt():
    subprocess.run(["bash", "-c",
        'echo "WEEKLY_FAIL_REASON=probe" >> "$GITHUB_ENV"; '
        'echo "gruen=false" >> "$GITHUB_OUTPUT"; '
        'echo "probe" >> "$GITHUB_STEP_SUMMARY"'], check=True)
'''


def _ablaufdateien(tmp_path):
    env = dict(os.environ)
    pfade = {}
    for name in DATEIEN:
        p = tmp_path / ("echt_" + name.lower())
        p.write_text("", encoding="utf-8")
        env[name] = str(p)
        pfade[name] = p
    return env, pfade


def _inhalt(pfade):
    return {n: p.read_text(encoding="utf-8") for n, p in pfade.items() if p.read_text(encoding="utf-8")}


@pytest.mark.parametrize("ordner", ORDNER, ids=["kern", "nebenbereiche"])
def test_die_abschirmung_jedes_ordners_haelt(tmp_path, ordner):
    conftest = os.path.join(ordner, "conftest.py")
    assert os.path.isfile(conftest), f"{conftest} fehlt — dort ist nichts abgeschirmt"
    probe = tmp_path / "probe"
    probe.mkdir()
    shutil.copy(conftest, probe / "conftest.py")
    (probe / "test_schreiber.py").write_text(SCHREIBER, encoding="utf-8")
    env, pfade = _ablaufdateien(tmp_path)
    r = subprocess.run([sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider", str(probe)],
                       cwd=str(probe), env=env, capture_output=True, text=True, timeout=120)
    assert r.returncode == 0, r.stdout + r.stderr
    assert not _inhalt(pfade), (
        f"die conftest in {os.path.relpath(ordner, WURZEL)} laesst einen Test in die "
        f"Umgebung des echten Laufs schreiben: {_inhalt(pfade)}")


def test_die_probe_selbst_beisst(tmp_path):
    """Gegenprobe: ohne conftest MUSS der Schreiber durchkommen, sonst prueft
    der Test oben nichts."""
    probe = tmp_path / "ohne"
    probe.mkdir()
    (probe / "test_schreiber.py").write_text(SCHREIBER, encoding="utf-8")
    env, pfade = _ablaufdateien(tmp_path)
    r = subprocess.run([sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider", str(probe)],
                       cwd=str(probe), env=env, capture_output=True, text=True, timeout=120)
    assert r.returncode == 0, r.stdout + r.stderr
    assert "WEEKLY_FAIL_REASON=probe" in _inhalt(pfade).get("GITHUB_ENV", "")


def test_die_tests_mit_unterprozessen_schreiben_nichts_in_den_echten_lauf(tmp_path):
    ich = os.path.abspath(__file__)
    dateien = []
    for ordner in ORDNER:
        for name in sorted(os.listdir(ordner)):
            pfad = os.path.join(ordner, name)
            if not (name.startswith("test_") and name.endswith(".py")) or pfad == ich:
                continue
            with open(pfad, encoding="utf-8") as f:
                if "subprocess" in f.read():
                    dateien.append(pfad)
    assert any(p.endswith("test_wochenlauf_bilanz.py") for p in dateien), (
        "test_wochenlauf_bilanz.py ist nicht in der Liste — dann prueft das hier den Fall #170 nicht")
    env, pfade = _ablaufdateien(tmp_path)
    r = subprocess.run([sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider", *dateien],
                       cwd=WURZEL, env=env, capture_output=True, text=True, timeout=900)
    assert r.returncode == 0, r.stdout[-3000:] + r.stderr[-2000:]
    assert not _inhalt(pfade), (
        "diese Tests schreiben in die Ablaufdateien des echten Laufs (so wurde "
        f"Wochenlauf #170 rot): {_inhalt(pfade)}")
