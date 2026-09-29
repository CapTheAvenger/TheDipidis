"""Der Wochenlauf: erst alles zurueck, dann nachbearbeiten — und ein Push, der nichts verliert.

ANLASS (29.09.2026, Wochenlauf #168 und Pruefung danach)
-------------------------------------------------------
1. Der Schritt "Erzeugte Dateien zurueck nach data/" lief HINTER
   "Top-Cut-Quoten aus den Platzierungen fuellen", der Zeilenpruefung und
   "Kartentyp nachziehen" — und kopierte deren Ergebnis mit der
   Scraper-Fassung wieder zu. Folge in #168: top8_conv_rate 0.0 fuer ein
   Turnier ohne Platzierungen, das Tor war rot.
2. Die Bilanz der nicht blockierenden Schritte las rc_extra.txt, BEVOR die
   Frischepruefung hineinschrieb.
3. Die Push-Schleife rebaste mit `-X ours` — beim Rebase gewinnt damit
   origin/main, nicht dieser Lauf. Gemessen: ein Konflikt an derselben
   Zeile verwarf den ganzen Wochencommit, der Push meldete "Everything
   up-to-date" mit rc 0, und pushed=true stiess einen Deploy an.

Teil 3 wird AUSGEFUEHRT: der echte Schritt "Commit + push" aus
weekly-full-update.yml laeuft in einem Wegwerf-Repo gegen ein Wegwerf-
origin, in dem waehrenddessen ein "Nachtlauf" dieselbe Datei geaendert hat.
"""
import os
import re
import shutil
import subprocess

import pytest
import yaml

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WOCHENLAUF = os.path.join(WURZEL, ".github", "workflows", "weekly-full-update.yml")


def _schritte():
    with open(WOCHENLAUF, encoding="utf-8") as f:
        y = yaml.safe_load(f)
    return list(y["jobs"].values())[0]["steps"]


def _index(name_anfang):
    for i, s in enumerate(_schritte()):
        if str(s.get("name", "")).startswith(name_anfang):
            return i
    raise AssertionError(f"Schritt '{name_anfang}' fehlt im Wochenlauf")


# ── 1. und 2.: die Reihenfolge ───────────────────────────────────────

def test_der_rueckweg_kommt_vor_jeder_nachbearbeitung():
    rueckweg = _index("Erzeugte Dateien zurueck nach data/")
    letzter_scraper = _index("Online-Einzellisten holen")
    assert rueckweg > letzter_scraper, "der Rueckweg laeuft, bevor alle Scraper fertig sind"
    for nach in ("Top-Cut-Quoten aus den Platzierungen fuellen",
                 "Data sanity check",
                 "Kartentyp im Decklistenbestand nachziehen",
                 "Labs-Verzeichnis aus data/ neu bauen",
                 "Zusicherungen gegen die frischen Daten"):
        assert rueckweg < _index(nach), (
            f"'{nach}' laeuft vor dem Rueckweg — dann kopiert der Rueckweg "
            "sein Ergebnis mit der Scraper-Fassung wieder zu (Wochenlauf #168)")


def test_die_bilanz_liest_erst_nach_der_frischepruefung():
    assert _index("Frischepruefung") < _index("Bilanz der nicht blockierenden Schritte"), (
        "die Bilanz liest rc_extra.txt, bevor die Frischepruefung hineinschreibt")
    assert _index("Bilanz der nicht blockierenden Schritte") < _index("Commit + push")


# ── 3.: die Push-Schleife, ausgefuehrt ───────────────────────────────

def _push_skript():
    s = next(s for s in _schritte() if s.get("name") == "Commit + push")
    text = s["run"]
    text = text.replace("${{ github.repository }}", "probe/probe").replace("${{ github.run_id }}", "1")
    assert "${{" not in text, "der Push-Schritt nutzt einen Ausdruck, den die Probe nicht setzt"
    return text


def _git(cwd, *args, **kw):
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True, **kw)


def _aufbau(tmp_path, tor_rc=0, gleiche_zeile=False):
    origin = tmp_path / "origin.git"
    _git(tmp_path, "init", "-q", "--bare", "-b", "main", str(origin))
    saat = tmp_path / "saat"
    _git(tmp_path, "clone", "-q", str(origin), str(saat))
    for k, v in (("user.email", "p@p"), ("user.name", "p")):
        _git(saat, "config", k, v)
    (saat / "data").mkdir()
    (saat / "data" / "stand.csv").write_text("kopf\nnacht=alt\nmitte\nwoche=alt\n")
    (saat / "scripts").mkdir()
    (saat / "scripts" / "build_data_stand.py").write_text("")
    (saat / "scripts" / "tor_vor_dem_push.sh").write_text(f"#!/bin/bash\nexit {tor_rc}\n")
    _git(saat, "add", "-A"); _git(saat, "commit", "-qm", "start"); _git(saat, "push", "-q", "origin", "main")

    laeufer = tmp_path / "laeufer"
    _git(tmp_path, "clone", "-q", str(origin), str(laeufer))
    # Der Wochenlauf aendert seine Zeile (und bei gleiche_zeile auch die des Nachtlaufs).
    neu = "kopf\nnacht=woche\nmitte\nwoche=neu\n" if gleiche_zeile else "kopf\nnacht=alt\nmitte\nwoche=neu\n"
    (laeufer / "data" / "stand.csv").write_text(neu)

    # Waehrenddessen schreibt ein Nachtlauf nach main.
    (saat / "data" / "stand.csv").write_text("kopf\nnacht=neu\nmitte\nwoche=alt\n" if not gleiche_zeile
                                              else "kopf\nnacht=nacht\nmitte\nwoche=neu\n")
    _git(saat, "commit", "-qam", "nachtlauf"); _git(saat, "push", "-q", "origin", "main")
    return origin, laeufer


def _lauf(laeufer, tmp_path):
    ausgabe = tmp_path / "github_output"
    ausgabe.write_text("")
    env = dict(os.environ, GITHUB_OUTPUT=str(ausgabe))
    r = subprocess.run(["bash", "-e", "-c", _push_skript()], cwd=str(laeufer), env=env,
                       capture_output=True, text=True, timeout=300)
    return r.returncode, ausgabe.read_text(), r.stdout + r.stderr


def _auf_origin(origin, tmp_path):
    blick = tmp_path / "blick"
    if blick.exists():
        shutil.rmtree(blick)
    _git(tmp_path, "clone", "-q", str(origin), str(blick))
    return (blick / "data" / "stand.csv").read_text()


@pytest.fixture(autouse=True)
def _ohne_warten(monkeypatch):
    # `sleep $((attempt * 20))` — in der Probe nicht abwarten.
    monkeypatch.setenv("PATH", os.pathsep.join([str(_schlafattrappe()), os.environ["PATH"]]))


_SCHLAF = None


def _schlafattrappe():
    global _SCHLAF
    if _SCHLAF is None:
        import tempfile
        d = tempfile.mkdtemp(prefix="schlaf-")
        p = os.path.join(d, "sleep")
        with open(p, "w") as f:
            f.write("#!/bin/sh\nexit 0\n")
        os.chmod(p, 0o755)
        _SCHLAF = d
    return _SCHLAF


def test_nach_dem_nachtlauf_landen_beide_aenderungen(tmp_path):
    origin, laeufer = _aufbau(tmp_path)
    rc, out, log = _lauf(laeufer, tmp_path)
    assert rc == 0, log
    assert "pushed=true" in out, log
    stand = _auf_origin(origin, tmp_path)
    assert "woche=neu" in stand and "nacht=neu" in stand, (
        "nach dem Rebase fehlt eine der beiden Aenderungen:\n" + stand)


def test_im_konflikt_gewinnt_dieser_lauf(tmp_path):
    origin, laeufer = _aufbau(tmp_path, gleiche_zeile=True)
    rc, out, log = _lauf(laeufer, tmp_path)
    stand = _auf_origin(origin, tmp_path)
    assert rc == 0 and "pushed=true" in out, log
    assert "nacht=woche" in stand, (
        "im Konflikt hat der Nachtlauf gewonnen — `-X ours` beim Rebase heisst "
        "'origin/main gewinnt':\n" + stand)


def test_ein_zu_gebliebenes_tor_nach_dem_rebase_pusht_nichts(tmp_path):
    origin, laeufer = _aufbau(tmp_path, tor_rc=1)
    rc, out, log = _lauf(laeufer, tmp_path)
    assert rc != 0, "das Tor nach dem Rebase ist zu, und der Lauf meldet Erfolg:\n" + log
    assert "pushed=true" not in out
    assert "woche=neu" not in _auf_origin(origin, tmp_path), (
        "ungepruefter zusammengefuehrter Stand ist auf main gelandet")
