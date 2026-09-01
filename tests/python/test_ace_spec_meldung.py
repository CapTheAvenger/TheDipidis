# -*- coding: utf-8 -*-
"""Der Berichtsmodus von scripts/repariere_ace_spec.py — das Netz im Wochenlauf.

WARUM ES DIESEN MODUS GIBT
--------------------------
Am 01.09.2026 kam die is_ace_spec-Drift zurueck (7.790 unbelegte Felder,
darunter Pokemon). Gemerkt hat es niemand, bis test_ace_spec_bestand.py im
Deploy rot wurde — und ein roter Deploy heisst: die ganze Seite bleibt auf
dem alten Stand stehen, wegen einer Spalte, die das Frontend nicht liest.

Seitdem laeuft das Skript mit --melden im Wochenlauf mit, BEVOR committet
wird. Es schreibt dort nichts (CLAUDE.md: "Report, don't silently repair") —
es sagt nur Bescheid, solange der Deploy noch gruen ist.

Was diese Tests halten:
  1. Ohne Drift meldet der Lauf nicht nur "OK", sondern auch WIEVIEL er
     geprueft hat — sonst liesse sich "sauber" nicht von "nichts angesehen"
     unterscheiden.
  2. Mit Drift kommt eine ::warning::-Zeile mit der Zahl.
  3. --melden schreibt nichts. Das ist der ganze Punkt.
  4. --streng beendet sich mit 1, --melden allein mit 0 — sonst wuerde die
     Meldung den Wochenlauf abbrechen, den sie eigentlich retten soll.
  5. --schreiben und --melden zusammen sind ein Fehler, keine stille
     Vorrangregel.
  6. Der Wochenlauf ruft den Schritt wirklich auf, und zwar vor dem Commit.
"""

import io
import os
import subprocess
import sys

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
SKRIPT = os.path.join(WURZEL, "scripts", "repariere_ace_spec.py")

KOPF = "card_name;type;max_count;is_ace_spec\n"


def _datenordner(tmp_path, zeilen):
    """Ein Miniaturbestand mit genau der einen Spalte."""
    d = tmp_path / "data"
    d.mkdir()
    (d / "ace_specs.json").write_text(
        '{"_hinweis": "Testliste", "ace_specs": ["Unfair Stamp"]}', encoding="utf-8")
    (d / "mini_card_data.csv").write_text(KOPF + "".join(zeilen), encoding="utf-8")
    return d


def _lauf(datenordner, *argumente):
    """Das Skript gegen einen anderen Datenordner laufen lassen.

    Der Ordner wird ueber die Modulglobale gesetzt, nicht ueber einen
    Schalter — das Skript hat keinen. Deshalb ein Unterprozess mit einem
    kleinen Vorspann statt eines Imports: so bleibt der echte Datenbestand
    des Repos unberuehrt, egal was der Test tut.
    """
    vorspann = (
        "import runpy, sys, os\n"
        "import importlib.util\n"
        "spec = importlib.util.spec_from_file_location('ras', %r)\n"
        "m = importlib.util.module_from_spec(spec)\n"
        "spec.loader.exec_module(m)\n"
        "m.DATA = %r\n"
        "import backend.core.ace_spec_regel as regel\n"
        "_alt = regel.lade_ace_liste\n"
        "regel.lade_ace_liste = lambda pfad=None: _alt(os.path.join(%r, 'ace_specs.json'))\n"
        "m.lade_ace_liste = regel.lade_ace_liste\n"
        "sys.argv = ['repariere_ace_spec.py'] + %r\n"
        "sys.exit(m.main())\n"
    ) % (SKRIPT, str(datenordner), str(datenordner), list(argumente))
    return subprocess.run([sys.executable, "-c", vorspann], cwd=WURZEL,
                          capture_output=True, text=True)


# ── 1. Ohne Drift ───────────────────────────────────────────────────

def test_sauberer_bestand_meldet_auch_den_umfang(tmp_path):
    d = _datenordner(tmp_path, [
        "Unfair Stamp;Item;1;Yes\n",
        "Switch;Item;4;No\n",
        "Pikachu;Basic;4;No\n",
    ])
    e = _lauf(d, "--melden")
    assert e.returncode == 0, e.stdout + e.stderr
    assert "::warning::" not in e.stdout, "sauberer Bestand darf nicht warnen"
    assert "keine Drift" in e.stdout
    assert "3 Zeilen geprueft" in e.stdout, (
        "die geprueften Zeilen fehlen in der Meldung — dann liesse sich "
        "'sauber' nicht von 'nichts angesehen' unterscheiden:\n" + e.stdout)


# ── 2. Mit Drift ────────────────────────────────────────────────────

def test_drift_wird_als_warning_gemeldet(tmp_path):
    # "Unfair Stamp" steht auf der Liste und traegt trotzdem No;
    # "Switch" traegt Yes bei 4 Kopien — beides muss auffallen.
    d = _datenordner(tmp_path, [
        "Unfair Stamp;Item;1;No\n",
        "Switch;Item;4;Yes\n",
    ])
    e = _lauf(d, "--melden")
    assert e.returncode == 0, "eine Meldung darf den Wochenlauf nicht abbrechen"
    assert "::warning::is_ace_spec driftet wieder: 2 Felder" in e.stdout, e.stdout
    assert "Daten reparieren" in e.stdout, (
        "die Meldung sagt nicht, was zu tun ist:\n" + e.stdout)


def test_melden_veraendert_die_dateien_nicht(tmp_path):
    zeilen = ["Unfair Stamp;Item;1;No\n", "Switch;Item;4;Yes\n"]
    d = _datenordner(tmp_path, zeilen)
    pfad = os.path.join(str(d), "mini_card_data.csv")
    vorher = io.open(pfad, encoding="utf-8").read()
    _lauf(d, "--melden")
    assert io.open(pfad, encoding="utf-8").read() == vorher, (
        "--melden hat geschrieben — genau das soll es nicht")


def test_streng_beendet_sich_mit_eins(tmp_path):
    d = _datenordner(tmp_path, ["Unfair Stamp;Item;1;No\n"])
    assert _lauf(d, "--melden", "--streng").returncode == 1
    assert _lauf(d, "--melden").returncode == 0


def test_streng_ohne_drift_bleibt_gruen(tmp_path):
    d = _datenordner(tmp_path, ["Unfair Stamp;Item;1;Yes\n"])
    e = _lauf(d, "--melden", "--streng")
    assert e.returncode == 0, e.stdout + e.stderr


def test_schreiben_mit_streng_ist_kein_fehlschlag(tmp_path):
    """Wer raeumt, hat nichts falsch gemacht.

    --streng fragt "steht noch Drift in den Dateien?". Nach --schreiben
    steht keine mehr — die Zeilen sind soeben geraeumt worden. Zaehlte man
    dort dieselbe Zahl, wuerde ein erfolgreicher Reparaturlauf sich selbst
    rot melden.
    """
    d = _datenordner(tmp_path, ["Unfair Stamp;Item;1;No\n", "Switch;Item;4;Yes\n"])
    e = _lauf(d, "--schreiben", "--streng")
    assert e.returncode == 0, (
        "ein geglueckter Reparaturlauf meldet sich selbst rot:\n" + e.stdout)
    pfad = os.path.join(str(d), "mini_card_data.csv")
    inhalt = io.open(pfad, encoding="utf-8").read()
    assert "Unfair Stamp;Item;1;Yes" in inhalt and "Switch;Item;4;No" in inhalt, inhalt


def test_schreiben_und_melden_schliessen_sich_aus(tmp_path):
    d = _datenordner(tmp_path, ["Unfair Stamp;Item;1;No\n"])
    e = _lauf(d, "--schreiben", "--melden")
    assert e.returncode == 1
    assert "schliessen sich aus" in e.stdout, e.stdout
    pfad = os.path.join(str(d), "mini_card_data.csv")
    assert "No" in io.open(pfad, encoding="utf-8").read(), (
        "trotz Fehler geschrieben")


def test_nach_dem_schreiben_meldet_der_naechste_lauf_nichts(tmp_path):
    """Wiederholbarkeit — sonst warnte der Wochenlauf ewig weiter."""
    d = _datenordner(tmp_path, ["Unfair Stamp;Item;1;No\n", "Switch;Item;4;Yes\n"])
    assert _lauf(d, "--schreiben").returncode == 0
    e = _lauf(d, "--melden")
    assert "::warning::" not in e.stdout, e.stdout


# ── 3. Der Wochenlauf ruft es wirklich auf ──────────────────────────

def test_wochenlauf_prueft_vor_dem_commit():
    """Ein Skript, das niemand aufruft, ist kein Netz.

    Geprueft wird die REIHENFOLGE: die Meldung muss vor dem Commit stehen,
    sonst erfaehrt man von der Drift erst, wenn sie schon auf main liegt.
    """
    pfad = os.path.join(WURZEL, ".github", "workflows", "weekly-full-update.yml")
    text = io.open(pfad, encoding="utf-8").read()
    assert "repariere_ace_spec.py --melden" in text, (
        "der Wochenlauf ruft die ace_spec-Pruefung nicht auf")
    assert "--schreiben" not in text.split("repariere_ace_spec.py")[1][:200], (
        "der Wochenlauf schreibt — er soll nur melden")
    i_pruefung = text.index("repariere_ace_spec.py --melden")
    i_commit = text.index("- name: Commit + push")
    assert i_pruefung < i_commit, (
        "die Pruefung steht hinter dem Commit — dann ist die Drift schon "
        "auf main, bevor jemand sie sieht")


def test_reparaturworkflow_bleibt_von_hand():
    """Das Schreiben bleibt eine Entscheidung, kein Automatismus."""
    pfad = os.path.join(WURZEL, ".github", "workflows", "ace-spec-reparatur.yml")
    text = io.open(pfad, encoding="utf-8").read()
    assert "workflow_dispatch:" in text
    for auslöser in ("schedule:", "  push:", "pull_request:"):
        assert auslöser not in text, (
            f"{auslöser.strip()} im Reparaturworkflow — der Bestand wuerde "
            "unbeaufsichtigt ueberschrieben")
