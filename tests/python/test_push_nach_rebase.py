"""scripts/push_nach_rebase.sh: ein Datenlauf pusht seinen Commit, auch wenn
main weitergezogen ist — und meldet nie Erfolg fuer einen Push ohne Inhalt.

Befund 30.09.2026 (Scraper-Durchgang): Pocket Tier List #11 war gruen, hatte
pushed=true und stiess einen Deploy an — die neuen B4b-Kennungen kamen nie
auf main. Die alte Schleife `git pull --rebase ... && break` liess einen
gescheiterten Rebase stehen, und `git push origin HEAD:main` schob danach
den Stand von origin/main ("Everything up-to-date", rc 0).

Ausgefuehrt gegen echte Git-Repos in einem Wegwerf-Verzeichnis (TESTDATEN):
ein "origin", ein Laeufer und ein zweiter Schreiber, der ihm zuvorkommt.
Der Datenstand wird von einem Nachbau von build_data_stand.py gestempelt,
der wie das Original nur Dateien stempelt, die `git status` als geaendert
zeigt.
"""
import json
import os
import shutil
import subprocess

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
SKRIPT = os.path.join(WURZEL, "scripts", "push_nach_rebase.sh")

# Wie das Original: nur, was git status unter data/ als geaendert zeigt,
# bekommt einen neuen Stempel; alles andere wird fortgeschrieben.
STAND = r'''import json, os, subprocess, hashlib
pfad = "data/data_stand.json"
d = json.load(open(pfad)) if os.path.exists(pfad) else {}
aus = subprocess.run(["git", "status", "--porcelain", "--", "data/"],
                     capture_output=True, text=True).stdout
for z in aus.splitlines():
    f = z[3:].strip().split("/")[-1]
    if f != "data_stand.json" and os.path.exists("data/" + f):
        d[f] = hashlib.sha1(open("data/" + f, "rb").read()).hexdigest()[:8]
json.dump(d, open(pfad, "w"), sort_keys=True, indent=1)
'''


def _git(cwd, *a):
    return subprocess.run(["git", *a], cwd=cwd, check=True, capture_output=True, text=True).stdout


def _sha(pfad):
    import hashlib
    return hashlib.sha1(open(pfad, "rb").read()).hexdigest()[:8]


def _aufbau(tmp, tor_rc=0):
    origin = os.path.join(tmp, "origin.git")
    _git(tmp, "init", "-q", "--bare", "-b", "main", origin)
    saat = os.path.join(tmp, "saat")
    os.makedirs(os.path.join(saat, "data"))
    os.makedirs(os.path.join(saat, "scripts"))
    _git(tmp, "init", "-q", "-b", "main", saat)
    for k, v in (("user.email", "t@t"), ("user.name", "t")):
        _git(saat, "config", k, v)
    open(os.path.join(saat, "data", "a.csv"), "w").write("x\n1\n")
    open(os.path.join(saat, "data", "b.csv"), "w").write("kopf\nnacht=alt\nmitte\nlauf=alt\n")
    open(os.path.join(saat, "data", "data_stand.json"), "w").write("{}")
    open(os.path.join(saat, "scripts", "build_data_stand.py"), "w").write(STAND)
    open(os.path.join(saat, "scripts", "tor_vor_dem_push.sh"), "w").write(f"#!/bin/bash\nexit {tor_rc}\n")
    shutil.copy(SKRIPT, os.path.join(saat, "scripts", "push_nach_rebase.sh"))
    subprocess.run(["python3", "-c", "import json;json.dump({'a.csv':'saat','b.csv':'saat'},"
                    "open('data/data_stand.json','w'),sort_keys=True,indent=1)"], cwd=saat, check=True)
    _git(saat, "add", "-A")
    _git(saat, "commit", "-q", "-m", "saat")
    _git(saat, "remote", "add", "origin", origin)
    _git(saat, "push", "-q", "origin", "main")
    return origin


def _klon(tmp, name, origin):
    ziel = os.path.join(tmp, name)
    _git(tmp, "clone", "-q", origin, ziel)
    for k, v in (("user.email", "t@t"), ("user.name", "t")):
        _git(ziel, "config", k, v)
    return ziel


def _schreiben(repo, datei, inhalt, nachricht):
    """Wie ein Ablauf: Datei schreiben, Stand bauen, committen, direkt pushen."""
    open(os.path.join(repo, datei), "w").write(inhalt)
    subprocess.run(["python3", "scripts/build_data_stand.py"], cwd=repo, check=True)
    _git(repo, "add", "-A")
    _git(repo, "commit", "-q", "-m", nachricht)


def _push(repo, tmp, tor=""):
    ausgabe = os.path.join(tmp, "github_output_" + os.path.basename(repo))
    open(ausgabe, "w").close()
    env = dict(os.environ, GITHUB_OUTPUT=ausgabe, PUSH_WARTEN="0")
    r = subprocess.run(["bash", "scripts/push_nach_rebase.sh"] + ([tor] if tor else []),
                       cwd=repo, env=env, capture_output=True, text=True, timeout=120)
    gesetzt = [z for z in open(ausgabe).read().splitlines() if z.startswith("pushed=")]
    return r.returncode, (gesetzt[-1] if gesetzt else ""), r.stdout + r.stderr


def _auf_origin(tmp, origin, datei):
    blick = os.path.join(tmp, "blick")
    if os.path.exists(blick):
        shutil.rmtree(blick)
    _git(tmp, "clone", "-q", origin, blick)
    return open(os.path.join(blick, datei)).read()


def test_ohne_konkurrenz_wird_gepusht(tmp_path):
    tmp = str(tmp_path)
    origin = _aufbau(tmp)
    a = _klon(tmp, "a", origin)
    _schreiben(a, "data/a.csv", "x\n2\n", "A")
    rc, pushed, log = _push(a, tmp)
    assert rc == 0 and pushed == "pushed=true", log
    assert _auf_origin(tmp, origin, "data/a.csv") == "x\n2\n"


def test_konflikt_auf_dem_datenstand_verliert_keine_daten(tmp_path):
    """Genau Pocket #11: ein anderer Lauf schrieb dazwischen, beide
    aenderten data_stand.json. Beide Dateien muessen landen, und der
    Datenstand stempelt beide."""
    tmp = str(tmp_path)
    origin = _aufbau(tmp)
    a = _klon(tmp, "a", origin)
    b = _klon(tmp, "b", origin)
    _schreiben(b, "data/b.csv", "kopf\nnacht=neu\nmitte\nlauf=alt\n", "B")
    _git(b, "push", "-q", "origin", "main")
    _schreiben(a, "data/a.csv", "x\n2\n", "A")
    rc, pushed, log = _push(a, tmp)
    assert rc == 0 and pushed == "pushed=true", log
    assert _auf_origin(tmp, origin, "data/a.csv") == "x\n2\n", "die Daten dieses Laufs fehlen auf main"
    assert _auf_origin(tmp, origin, "data/b.csv").count("nacht=neu") == 1, "die Daten des anderen Laufs fehlen"
    stand = json.loads(_auf_origin(tmp, origin, "data/data_stand.json"))
    blick = os.path.join(tmp, "blick")
    assert stand["a.csv"] == _sha(os.path.join(blick, "data", "a.csv")), stand
    assert stand["b.csv"] == _sha(os.path.join(blick, "data", "b.csv")), stand


def test_im_konflikt_gewinnt_dieser_lauf(tmp_path):
    tmp = str(tmp_path)
    origin = _aufbau(tmp)
    a = _klon(tmp, "a", origin)
    b = _klon(tmp, "b", origin)
    _schreiben(b, "data/b.csv", "kopf\nnacht=anderer\nmitte\nlauf=alt\n", "B")
    _git(b, "push", "-q", "origin", "main")
    _schreiben(a, "data/b.csv", "kopf\nnacht=dieser\nmitte\nlauf=neu\n", "A")
    rc, pushed, log = _push(a, tmp)
    assert rc == 0 and pushed == "pushed=true", log
    stand = _auf_origin(tmp, origin, "data/b.csv")
    assert "nacht=dieser" in stand and "lauf=neu" in stand, (
        "im Konflikt hat der andere Lauf gewonnen — beim Rebase heisst "
        "`-X ours` 'origin/main gewinnt':\n" + stand)


def test_ein_leerer_commit_nach_dem_rebase_ist_kein_erfolg(tmp_path):
    tmp = str(tmp_path)
    origin = _aufbau(tmp)
    a = _klon(tmp, "a", origin)
    b = _klon(tmp, "b", origin)
    # Beide schreiben dasselbe — nach dem Rebase bleibt von A nichts uebrig.
    _schreiben(b, "data/a.csv", "x\n9\n", "B")
    _git(b, "push", "-q", "origin", "main")
    _schreiben(a, "data/a.csv", "x\n9\n", "A")
    rc, pushed, log = _push(a, tmp)
    assert rc == 0, log
    assert pushed == "pushed=false", "ein Push ohne eigenen Inhalt wurde als Erfolg gemeldet:\n" + log


def test_nichts_eigenes_ist_nichts_gepusht(tmp_path):
    tmp = str(tmp_path)
    origin = _aufbau(tmp)
    a = _klon(tmp, "a", origin)
    rc, pushed, log = _push(a, tmp)
    assert rc == 0 and pushed == "pushed=false", log


def test_ein_zu_gebliebenes_tor_nach_dem_rebase_pusht_nichts(tmp_path):
    tmp = str(tmp_path)
    origin = _aufbau(tmp, tor_rc=1)
    a = _klon(tmp, "a", origin)
    b = _klon(tmp, "b", origin)
    _schreiben(b, "data/b.csv", "kopf\nnacht=neu\nmitte\nlauf=alt\n", "B")
    _git(b, "push", "-q", "origin", "main")
    _schreiben(a, "data/a.csv", "x\n2\n", "A")
    rc, pushed, log = _push(a, tmp, tor="kern")
    assert rc != 0, "das Tor nach dem Rebase ist zu, und der Lauf meldet Erfolg:\n" + log
    assert pushed == "pushed=false"
    assert _auf_origin(tmp, origin, "data/a.csv") == "x\n1\n", "ungepruefter Stand ist auf main gelandet"


# ── Bauart: keine Push-Schleife mehr am Skript vorbei ─────────────────

ABLAEUFE = os.path.join(WURZEL, ".github", "workflows")

# Der Wochenlauf hat seine eigene, ausgefuehrt gepruefte Schleife
# (tests/python/test_wochenlauf_reihenfolge_und_push.py); patch-einspielen
# schreibt auf einen PR-Zweig, nicht nach main; drei Ablaeufe nutzen
# scripts/daten_pushen.sh (tests/python/test_daten_pushen.py).
EIGENER_WEG = {
    "weekly-full-update.yml": "eigene Schleife, ausgefuehrt geprueft",
    "patch-einspielen.yml": "schreibt einen PR-Zweig",
    "schriften-spiegeln.yml": "Handlauf ohne Datenstand, schreibt Schriftdateien",
    "tutorial-screenshots.yml": "Handlauf, schreibt Bilder fuer das Tutorial",
}


def _ohne_kommentare(text):
    return "\n".join(z for z in text.splitlines() if not z.lstrip().startswith("#"))


def _laeufe():
    for name in sorted(os.listdir(ABLAEUFE)):
        if name.endswith(".yml") and name not in EIGENER_WEG:
            yield name, _ohne_kommentare(open(os.path.join(ABLAEUFE, name), encoding="utf-8").read())


def _falsche_schleifen(text):
    befunde = []
    if "pull --rebase" in text or "git rebase" in text:
        befunde.append("eigener Rebase statt scripts/push_nach_rebase.sh")
    if "git push" in text:
        befunde.append("eigener git push statt scripts/push_nach_rebase.sh")
    return befunde


def test_kein_datenlauf_pusht_am_skript_vorbei():
    falsch = {n: b for n, t in _laeufe() if (b := _falsche_schleifen(t))}
    assert not falsch, f"Ablaeufe mit eigener Push-Schleife: {falsch}"


def test_die_datenlaeufe_nutzen_das_skript():
    nutzer = [n for n, t in _laeufe() if "scripts/push_nach_rebase.sh" in t]
    assert len(nutzer) >= 14, f"nur {len(nutzer)} Ablaeufe nutzen das Skript: {nutzer}"


def test_die_bauartpruefung_beisst():
    """Verfaelschungsprobe: die alte Pocket-Schleife wird erkannt."""
    alt = ("git commit -m x\nfor i in 1 2 3; do\n  git pull --rebase --autostash origin main && break\n"
           "done\nif git push origin HEAD:main; then echo pushed=true; fi\n")
    assert len(_falsche_schleifen(alt)) == 2
    assert not _falsche_schleifen("bash scripts/push_nach_rebase.sh alle\n")
