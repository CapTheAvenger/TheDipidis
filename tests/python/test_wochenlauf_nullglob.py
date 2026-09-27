"""WZ-8 (27.09.2026): der Kopierblock des Wochenlaufs meldet keinen Fehler,
wenn eine seiner Dateien fehlt.

In .github/workflows/weekly-full-update.yml stand im nullglob-Block
``labs_matchups_je_turnier_verzeichnis.json`` als FESTER Name. nullglob laesst
nur Muster verschwinden, die nichts treffen — ein fester Name bleibt stehen,
und ``cp`` schrieb einen Fehler ins Log (kein roter Lauf, ``set +e``, aber
eine Meldung, die jeden Leser des Protokolls in die Irre schickt).

Der Block wird hier AUSGEFUEHRT: in einem leeren Verzeichnis mit einer
einzigen Labs-Datei und OHNE Verzeichnisdatei.
"""
import os
import re
import subprocess

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
ABLAUF = os.path.join(WURZEL, ".github", "workflows", "weekly-full-update.yml")


def _block():
    text = open(ABLAUF, encoding="utf-8").read()
    i = text.index("shopt -s nullglob\n          for f in backend/core/data/labs_tournament_decks_*.csv")
    j = text.index("shopt -u nullglob", i)
    zeilen = text[i:j].splitlines()
    return "\n".join(z[10:] if z.startswith(" " * 10) else z for z in zeilen)


def test_jeder_eintrag_der_liste_ist_ein_muster():
    liste = _block().split("; do")[0]
    eintraege = re.findall(r"backend/core/data/\S+", liste)
    assert len(eintraege) >= 4, eintraege
    feste = [e for e in eintraege if not re.search(r"[*?\[]", e)]
    assert feste == [], "feste Namen im nullglob-Block: " + ", ".join(feste)


def test_fehlt_die_verzeichnisdatei_schweigt_der_block(tmp_path):
    os.makedirs(tmp_path / "backend" / "core" / "data")
    os.makedirs(tmp_path / "data")
    (tmp_path / "backend" / "core" / "data" / "labs_tournament_decks_TEF-PBL.csv").write_text("a\n1\n")
    r = subprocess.run(["bash", "-c", _block() + "\nshopt -u nullglob\n"],
                       cwd=tmp_path, capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    assert "cp:" not in r.stderr and "No such file" not in r.stderr, r.stderr
    assert (tmp_path / "data" / "labs_tournament_decks_TEF-PBL.csv").exists()
    assert not (tmp_path / "data" / "labs_matchups_je_turnier_verzeichnis.json").exists()


def test_ist_sie_da_wird_sie_kopiert(tmp_path):
    os.makedirs(tmp_path / "backend" / "core" / "data")
    os.makedirs(tmp_path / "data")
    (tmp_path / "backend" / "core" / "data" / "labs_matchups_je_turnier_verzeichnis.json").write_text("{}")
    r = subprocess.run(["bash", "-c", _block() + "\nshopt -u nullglob\n"],
                       cwd=tmp_path, capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    assert (tmp_path / "data" / "labs_matchups_je_turnier_verzeichnis.json").read_text() == "{}"
