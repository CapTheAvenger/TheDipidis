"""SC-4: die Pocket-Daten kommen aus der Cowork-Ernte, bewacht wird ihr Alter.

Gemessen 26.09.2026: der GitHub-Laeufer bekommt von game8.co auf allen
drei Wegen HTTP 202 (pocket-tierlist.yml, Lauf #5), die Cowork-Umgebung
die echte Seite (voller Lauf, 34 Decks mit Scan-Code). Geerntet wird
woechentlich dort ueber scripts/pocket_ernte.sh.

Zwei Dinge werden hier festgehalten:
1. Das Skript fuehrt die drei Schritte in der richtigen Reihenfolge aus und
   liefert nach einem Abbruch des Scrapers NICHTS aus. Geprueft am
   Verhalten: das Skript laeuft gegen ein nachgebautes `python3`.
2. Der Datenwaechter bewacht nicht mehr den letzten Lauf von
   pocket-tierlist.yml (ein Probelauf von Hand stellte die Ampel dauerhaft
   rot), sondern das Alter der Datei.
"""
import os
import re
import stat
import subprocess

import pytest

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SKRIPT = os.path.join(WURZEL, "scripts", "pocket_ernte.sh")


def _lauf(tmp_path, scraper_rc=0):
    """pocket_ernte.sh in einer Kopie ausfuehren, `python3` ist eine Attrappe."""
    repo = tmp_path / "repo"
    (repo / "scripts").mkdir(parents=True)
    (repo / "data").mkdir()
    (repo / "scripts" / "pocket_ernte.sh").write_text(
        open(SKRIPT, encoding="utf-8").read(), encoding="utf-8")
    subprocess.run(["git", "init", "-q"], cwd=repo, check=True)
    bin_ = tmp_path / "bin"
    bin_.mkdir()
    protokoll = tmp_path / "aufrufe.txt"
    attrappe = bin_ / "python3"
    attrappe.write_text(
        "#!/bin/sh\n"
        f'echo "$1" >> "{protokoll}"\n'
        f'case "$1" in *scrape_pocket_tierlist.py) exit {scraper_rc};; esac\n'
        "exit 0\n", encoding="utf-8")
    attrappe.chmod(attrappe.stat().st_mode | stat.S_IEXEC)
    env = dict(os.environ, PATH=f"{bin_}{os.pathsep}{os.environ['PATH']}")
    r = subprocess.run(["bash", str(repo / "scripts" / "pocket_ernte.sh")],
                       cwd=repo, env=env, capture_output=True, text=True)
    aufrufe = protokoll.read_text().split() if protokoll.exists() else []
    return r, aufrufe


def test_die_ernte_laeuft_in_der_richtigen_reihenfolge(tmp_path):
    r, aufrufe = _lauf(tmp_path)
    assert r.returncode == 0, r.stderr
    assert aufrufe == ["scripts/scrape_pocket_tierlist.py",
                       "scripts/build_pocket_sets.py",
                       "scripts/build_data_stand.py"], aufrufe
    assert "UNVERAENDERT" in r.stdout


def test_nach_einem_abbruch_wird_nichts_ausgeliefert(tmp_path):
    r, aufrufe = _lauf(tmp_path, scraper_rc=3)
    assert r.returncode == 3, "der Abbruch des Scrapers wird verschluckt"
    assert aufrufe == ["scripts/scrape_pocket_tierlist.py"], (
        f"nach dem Abbruch lief trotzdem weiter: {aufrufe}")
    assert "GEAENDERT" not in r.stdout


def _laufkontrolle():
    yaml = pytest.importorskip("yaml")
    with open(os.path.join(WURZEL, ".github", "workflows", "data-guardian.yml"),
              encoding="utf-8") as f:
        wf = yaml.safe_load(f)
    for s in wf["jobs"]["guard"]["steps"]:
        if s.get("name") == "Datenlaeufe auf Rot pruefen":
            return s["run"]
    raise AssertionError("Laufkontrolle fehlt")


def test_der_waechter_bewacht_das_alter_nicht_den_letzten_lauf():
    lauf = _laufkontrolle()
    genannt = set(re.findall(r"^\s+([a-z0-9-]+\.yml)$", lauf, re.M))
    assert genannt, "die Wachliste ist leer"
    assert "pocket-tierlist.yml" not in genannt, (
        "pocket-tierlist.yml steht wieder in der Wachliste — jeder Probelauf "
        "auf dem Laeufer (HTTP 202) stellt die Ampel dann dauerhaft rot")
    guardian = open(os.path.join(WURZEL, "scripts", "data_guardian.py"),
                    encoding="utf-8").read()
    ohne = re.sub(r"#[^\n]*", "", guardian)
    assert re.search(r"^\s+check_pocket_frische\(findings\)", ohne, re.M), (
        "ohne Wachliste UND ohne Alterspruefung bewacht niemand die Pocket-Daten")
