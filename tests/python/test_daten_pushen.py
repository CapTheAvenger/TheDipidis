"""scripts/daten_pushen.sh: Daten landen auch, wenn gleichzeitig ein anderer
Lauf data_stand.json schreibt (27.09.2026, Verify #15 endete mit Code 128).

Ausgefuehrt gegen echte Git-Repos in einem Temp-Verzeichnis: ein "origin",
ein Laeufer A und ein zweiter Schreiber B, der A zuvorkommt.
"""
import json
import os
import shutil
import subprocess

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
SKRIPT = os.path.join(WURZEL, "scripts", "daten_pushen.sh")

STAND = '''import json, os, hashlib
d = {}
for f in sorted(os.listdir("data")):
    if f != "data_stand.json":
        d[f] = hashlib.sha1(open("data/" + f, "rb").read()).hexdigest()[:8]
json.dump(d, open("data/data_stand.json", "w"), sort_keys=True)
'''


def _git(cwd, *a):
    return subprocess.run(["git", *a], cwd=cwd, check=True, capture_output=True, text=True).stdout


def _klon(tmp, name, origin):
    ziel = os.path.join(tmp, name)
    _git(tmp, "clone", "-q", origin, ziel)
    _git(ziel, "config", "user.email", "t@t")
    _git(ziel, "config", "user.name", "t")
    return ziel


def _aufbau(tmp):
    origin = os.path.join(tmp, "origin.git")
    _git(tmp, "init", "-q", "--bare", "-b", "main", origin)
    saat = os.path.join(tmp, "saat")
    os.makedirs(os.path.join(saat, "data"))
    os.makedirs(os.path.join(saat, "scripts"))
    _git(tmp, "init", "-q", "-b", "main", saat)
    _git(saat, "config", "user.email", "t@t")
    _git(saat, "config", "user.name", "t")
    open(os.path.join(saat, "data", "a.csv"), "w").write("x\n1\n")
    open(os.path.join(saat, "data", "b.csv"), "w").write("y\n1\n")
    open(os.path.join(saat, "scripts", "build_data_stand.py"), "w").write(STAND)
    shutil.copy(SKRIPT, os.path.join(saat, "scripts", "daten_pushen.sh"))
    subprocess.run(["python3", "scripts/build_data_stand.py"], cwd=saat, check=True)
    _git(saat, "add", "-A")
    _git(saat, "commit", "-q", "-m", "saat")
    _git(saat, "remote", "add", "origin", origin)
    _git(saat, "push", "-q", "origin", "main")
    return origin


def _lauf(repo, datei, inhalt, nachricht):
    open(os.path.join(repo, datei), "w").write(inhalt)
    subprocess.run(["python3", "scripts/build_data_stand.py"], cwd=repo, check=True)
    return subprocess.run(["bash", "scripts/daten_pushen.sh", nachricht, datei],
                          cwd=repo, capture_output=True, text=True)


def test_beide_schreiber_landen_und_der_stand_passt(tmp_path):
    tmp = str(tmp_path)
    origin = _aufbau(tmp)
    a = _klon(tmp, "a", origin)
    b = _klon(tmp, "b", origin)
    # B kommt zuerst: aendert b.csv und damit data_stand.json
    rb = _lauf(b, "data/b.csv", "y\n2\n", "B")
    assert rb.returncode == 0, rb.stdout + rb.stderr
    # A hat den alten Stand und aendert a.csv — data_stand.json kollidiert
    ra = _lauf(a, "data/a.csv", "x\n2\n", "A")
    assert ra.returncode == 0, ra.stdout + ra.stderr
    pruef = _klon(tmp, "pruef", origin)
    assert open(os.path.join(pruef, "data", "a.csv")).read() == "x\n2\n"
    assert open(os.path.join(pruef, "data", "b.csv")).read() == "y\n2\n"
    # der Datenstand ist auf dem gemeinsamen Stand neu gebaut, nicht einer von beiden
    vorher = json.load(open(os.path.join(pruef, "data", "data_stand.json")))
    subprocess.run(["python3", "scripts/build_data_stand.py"], cwd=pruef, check=True)
    assert json.load(open(os.path.join(pruef, "data", "data_stand.json"))) == vorher


def test_nichts_zu_schreiben_ist_kein_fehler(tmp_path):
    tmp = str(tmp_path)
    origin = _aufbau(tmp)
    a = _klon(tmp, "a", origin)
    r = subprocess.run(["bash", "scripts/daten_pushen.sh", "leer", "data/a.csv"],
                       cwd=a, capture_output=True, text=True)
    assert r.returncode == 0 and "Nichts zu schreiben" in r.stdout


def test_die_drei_ablaeufe_nutzen_den_weg():
    for f in ("verify-cardmarket-mapping", "pokepricelab-index", "pokepricelab-verify"):
        y = open(os.path.join(WURZEL, ".github", "workflows", f + ".yml"), encoding="utf-8").read()
        ohne = "\n".join(z.split("#")[0] for z in y.splitlines())
        assert "bash scripts/daten_pushen.sh" in ohne, f
        assert "git pull --rebase" not in ohne, f


def test_eine_nicht_uebergebene_aenderung_geht_nicht_verloren(tmp_path):
    """WZ-7 (Befund Abnahmeagent, 26.09.2026): bei abgelehntem Push setzt das
    Skript hart auf origin/main zurueck. Eine Datei, die der Lauf geschrieben,
    aber nicht an das Skript uebergeben hat, waere danach weg. Jetzt bricht es
    VOR dem Zuruecksetzen ab und nennt die Datei."""
    tmp = str(tmp_path)
    origin = _aufbau(tmp)
    a = _klon(tmp, "a", origin)
    b = _klon(tmp, "b", origin)
    assert _lauf(b, "data/b.csv", "y\n2\n", "B").returncode == 0
    # A schreibt zwei Dateien, uebergibt aber nur eine
    open(os.path.join(a, "data", "b.csv"), "w").write("y\nvon A, nicht uebergeben\n")
    ra = _lauf(a, "data/a.csv", "x\n2\n", "A")
    assert ra.returncode == 1, ra.stdout + ra.stderr
    assert "data/b.csv" in ra.stdout + ra.stderr
    assert open(os.path.join(a, "data", "b.csv")).read() == "y\nvon A, nicht uebergeben\n", \
        "die nicht uebergebene Aenderung wurde beim Zuruecksetzen vernichtet"


def test_geht_der_erste_push_durch_stoert_eine_fremde_aenderung_nicht(tmp_path):
    """Die Sperre gilt nur dort, wo zurueckgesetzt wird — ein Lauf, der ohne
    Konkurrenz schreibt, wird durch sie nicht rot."""
    tmp = str(tmp_path)
    origin = _aufbau(tmp)
    a = _klon(tmp, "a", origin)
    open(os.path.join(a, "data", "b.csv"), "w").write("y\nlokal\n")
    ra = _lauf(a, "data/a.csv", "x\n3\n", "A")
    assert ra.returncode == 0, ra.stdout + ra.stderr
    assert open(os.path.join(a, "data", "b.csv")).read() == "y\nlokal\n"
