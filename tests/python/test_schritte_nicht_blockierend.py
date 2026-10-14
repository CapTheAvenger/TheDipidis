"""SC-35 (14.10.2026): ein Ablaufschritt, der einen Fehlercode BEHANDELT, muss ihn
auch ERHALTEN.

GitHub startet jede `run:`-Shell mit `bash -e`. Ein Schritt, der
`rc=$?` liest und darunter `::warning::` schreibt, kommt dort nie an, wenn er
`-e` nicht vorher abschaltet: die Shell stirbt am ersten Fehlercode. Genau so
wurde „Champions Replica Scrape“ #157 am 14.10.2026 rot — pokewiki.de gab 403,
das Skript tat das Richtige (Warnung, Datei behalten, Rueckgabe 1), der Schritt
„Editionen und Pokemon-GO-Liste“ hatte `set -uo pipefail` ohne `+e`, und die
rc-Behandlung darunter war toter Code. Seit dem 07.10. — die ersten sechs Tage
hat die Quelle nur zufaellig geantwortet.

Die Regel hier: wer `rc=$?` schreibt, hat davor `set +e` (oder laesst `-e` nie
an: `set +e` irgendwo vor der ersten Verwendung). Das ist eine Textregel ueber
Shell-Code, keine Verhaltensprobe — deshalb steht unten die Probe am echten
Shell-Verhalten dazu, damit niemand die Regel fuer Aberglauben haelt.
"""
import glob
import os
import re
import subprocess

import yaml

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ABLAEUFE = os.path.join(WURZEL, ".github", "workflows")


def _ohne_kommentare(text):
    return re.sub(r"(?m)^\s*#.*$", "", text)


def _schritte_mit_run():
    for pfad in sorted(glob.glob(os.path.join(ABLAEUFE, "*.yml"))):
        with open(pfad, encoding="utf-8") as f:
            y = yaml.safe_load(f)
        for job_name, job in (y.get("jobs") or {}).items():
            for s in job.get("steps") or []:
                run = s.get("run")
                if isinstance(run, str):
                    yield os.path.basename(pfad), job_name, s.get("name") or "(ohne Namen)", run, s.get("shell")


def _verletzt(run, shell):
    """Wahr, wenn der Schritt rc=$? liest, aber -e nicht vorher abschaltet."""
    code = _ohne_kommentare(run)
    if "rc=$?" not in code:
        return False
    if shell and not shell.startswith("bash"):
        return False  # andere Shells haben andere Vorgaben; hier nicht beurteilt
    erste_rc = code.index("rc=$?")
    davor = code[:erste_rc]
    return not re.search(r"\bset\s+\+e\b", davor)


def test_jeder_schritt_mit_rc_behandlung_schaltet_minus_e_ab():
    schuldig = [f"{name} / {job} / {schritt}"
                for name, job, schritt, run, shell in _schritte_mit_run()
                if _verletzt(run, shell)]
    assert not schuldig, (
        "Schritte, die rc=$? behandeln, aber unter bash -e laufen — die Behandlung ist "
        "toter Code, der Schritt stirbt am ersten Fehlercode (SC-35):\n  "
        + "\n  ".join(schuldig))


def test_die_regel_beisst():
    """Verfaelschungsprobe: der Replica-Schritt ohne set +e muss auffallen."""
    ok = "set +e -uo pipefail\npython x.py\nrc=$?\nif [ $rc -ne 0 ]; then echo warn; fi\n"
    kaputt = "set -uo pipefail\npython x.py\nrc=$?\nif [ $rc -ne 0 ]; then echo warn; fi\n"
    assert not _verletzt(ok, None)
    assert _verletzt(kaputt, None), "die Regel faengt den Fall vom 14.10. nicht"
    # set +e NACH dem rc=$? hilft nichts
    assert _verletzt("set -u\npython x.py\nrc=$?\nset +e\n", None)
    # ein Kommentar, der 'set +e' nur erwaehnt, zaehlt nicht
    assert _verletzt("# hier fehlt set +e\npython x.py\nrc=$?\n", None)
    # ohne rc-Behandlung gilt die Regel nicht (ein Schritt darf blockieren)
    assert not _verletzt("python x.py\n", None)


def test_die_shell_verhaelt_sich_wirklich_so():
    """Die Regel beruht auf gemessenem Verhalten, nicht auf einer Vermutung:
    unter -e laeuft die Zeile nach einem Fehlercode nur mit vorherigem set +e."""
    mit = subprocess.run(["bash", "-e", "-c", "set +e -uo pipefail; false; rc=$?; echo weiter:$rc"],
                         capture_output=True, text=True)
    ohne = subprocess.run(["bash", "-e", "-c", "set -uo pipefail; false; rc=$?; echo weiter:$rc"],
                          capture_output=True, text=True)
    assert mit.stdout.strip() == "weiter:1", mit
    assert ohne.stdout.strip() == "" and ohne.returncode == 1, ohne


def test_der_replica_ablauf_ist_repariert():
    """Die drei Schritte vom 14.10. tragen set +e — und die Datei hat sie noch."""
    with open(os.path.join(ABLAEUFE, "champions-replica-scrape.yml"), encoding="utf-8") as f:
        y = yaml.safe_load(f)
    namen = {s.get("name"): s.get("run", "") for job in y["jobs"].values() for s in job["steps"]}
    for n in ("Attacken-Merkmale nachziehen", "Editionen und Pokemon-GO-Liste",
              "Editionen und Bild-Luecken nachziehen"):
        assert n in namen, f"Schritt {n} fehlt — ist er umbenannt, hier nachziehen"
        assert not _verletzt(namen[n], None), f"{n}: rc-Behandlung ohne set +e"
