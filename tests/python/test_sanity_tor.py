"""Das Sanity-Tor darf keine leiseren Faelle haben als "zu wenige Zeilen".

BEFUND (21.08.2026): scripts/sanity_check_data.py hatte zwei `continue`.
Eine ueberwachte Datei, die GAR NICHT MEHR da war, und eine, die sich
nicht lesen liess, gingen mit einer SKIP-Zeile durch — waehrend eine
Datei mit einer Zeile zu wenig zurueckgesetzt und gemeldet wurde. Das
Loch war leiser als die Delle.

Zusaetzlich prueft dieser Test die Glob-Regeln (S19): die Chunkdateien
heissen nach ihrem Format und kommen mit jeder Rotation dazu, eine feste
Schwellenliste veraltet dort zwangslaeufig. Sie werden deshalb gegen
ihren eigenen letzten committeten Stand gemessen.
"""

import os
import subprocess
import sys

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
sys.path.insert(0, os.path.join(WURZEL, "scripts"))

import sanity_check_data as tor  # noqa: E402


def _git(*args, cwd):
    return subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True)


@pytest.fixture()
def repo(tmp_path):
    """Ein Wegwerf-Repo mit zwei ueberwachten Dateien."""
    ordner = tmp_path / "repo"
    (ordner / "data").mkdir(parents=True)
    _git("init", "-q", ".", cwd=ordner)
    _git("config", "user.email", "t@example.invalid", cwd=ordner)
    _git("config", "user.name", "Test", cwd=ordner)

    def schreibe(name, zeilen):
        (ordner / "data" / name).write_text(
            "a;b\n" + "".join(f"{i};x\n" for i in range(zeilen)), encoding="utf-8")

    # Alle ueberwachten Dateien anlegen, sonst meldet das Tor zu Recht
    # ein Dutzend fehlende Dateien und der Test misst das Falsche.
    for name, schwelle in tor.THRESHOLDS.items():
        schreibe(name, max(schwelle + 10, 1))
    for name in tor.ANOMALY_WATCH:
        schreibe(name, 0)
    schreibe("limitless_online_decks.csv", 120)
    schreibe("limitless_online_decks_comparison.csv", 120)
    schreibe("tournament_cards_data_cards_TEF-CRI.csv", 1000)
    _git("add", "-A", cwd=ordner)
    _git("commit", "-qm", "stand", cwd=ordner)
    return ordner


def _lauf(ordner, streng=True):
    argv = ["sanity_check_data.py", str(ordner / "data")] + (["--strict"] if streng else [])
    alt = os.getcwd()
    os.chdir(ordner)
    try:
        return tor.main(argv)
    finally:
        os.chdir(alt)


def test_fehlende_datei_wird_zurueckgeholt(repo, capsys):
    ziel = repo / "data" / "limitless_online_decks.csv"
    ziel.unlink()
    rc = _lauf(repo)
    ausgabe = capsys.readouterr().out
    assert "::error::" in ausgabe and "limitless_online_decks.csv" in ausgabe
    assert "SKIP" not in ausgabe.split("Summary")[0].replace("SKIP  city", "")
    assert ziel.exists(), "die fehlende Datei wurde nicht aus HEAD zurueckgeholt"
    assert rc == 1, "--strict muss bei einem Revert ungleich 0 enden"


def test_unlesbare_datei_wird_zurueckgesetzt(repo, capsys):
    ziel = repo / "data" / "limitless_online_decks_comparison.csv"
    ziel.write_bytes(b"a;b\n\xe9\xff\xfe;x\n")
    rc = _lauf(repo)
    ausgabe = capsys.readouterr().out
    assert "nicht lesbar" in ausgabe
    assert tor.count_csv_rows(str(ziel)) == 120, "der gute Stand ist nicht zurueck"
    assert rc == 1


def test_heiler_stand_meldet_nichts(repo, capsys):
    rc = _lauf(repo)
    ausgabe = capsys.readouterr().out
    assert "::error::" not in ausgabe
    assert rc == 0


def test_chunk_verliert_zeilen_und_wird_zurueckgesetzt(repo, capsys):
    ziel = repo / "data" / "tournament_cards_data_cards_TEF-CRI.csv"
    zeilen = ziel.read_text(encoding="utf-8").split("\n")
    ziel.write_text("\n".join(zeilen[:700]), encoding="utf-8")
    rc = _lauf(repo)
    ausgabe = capsys.readouterr().out
    assert "verliert" in ausgabe
    assert tor.count_csv_rows(str(ziel)) == 1000, "der Chunk wurde nicht zurueckgeholt"
    assert rc == 1


def test_chunk_darf_wachsen(repo, capsys):
    ziel = repo / "data" / "tournament_cards_data_cards_TEF-CRI.csv"
    with ziel.open("a", encoding="utf-8") as f:
        for i in range(1000, 1500):
            f.write(f"{i};x\n")
    rc = _lauf(repo)
    assert rc == 0
    assert tor.count_csv_rows(str(ziel)) == 1500, "Wachstum darf nicht zurueckgesetzt werden"


def test_kleiner_verlust_bleibt_erlaubt(repo):
    """5 % weniger ist normale Bewegung, keine Meldung wert."""
    ziel = repo / "data" / "tournament_cards_data_cards_TEF-CRI.csv"
    zeilen = ziel.read_text(encoding="utf-8").rstrip("\n").split("\n")
    ziel.write_text("\n".join(zeilen[:951]) + "\n", encoding="utf-8")
    rc = _lauf(repo)
    assert rc == 0
    assert tor.count_csv_rows(str(ziel)) == 950


def test_alle_ueberwachten_dateien_existieren_im_repo():
    """Sonst meldet das schaerfere Tor ab sofort taeglich Fehlalarm."""
    fehlend = [
        name for name in list(tor.THRESHOLDS) + list(tor.ANOMALY_WATCH)
        if not os.path.isfile(os.path.join(WURZEL, "data", name))
    ]
    assert not fehlend, f"ueberwacht, aber nicht im Repo: {fehlend}"
