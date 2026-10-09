"""Das Tor rollt die rote DATEI zurueck und gibt den Rest frei — am Verhalten.

scripts/tor_vor_dem_push.sh (mit scripts/tor_rollback.py) laeuft in einem
Wegwerf-Git-Baum mit echten, winzigen pytest-Dateien: ein Test liest
data/pokedex.json, einer data/preise.json. Befund 07.10.2026: ein einziger
datenabhaengiger roter Test warf den ganzen Tageslauf weg; fuenf von sieben
roten Planlaeufen seit dem 25.09. waren genau das.
"""
import json
import os
import shutil
import subprocess
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_tor_vor_dem_push import JS_ATTRAPPE, SKRIPT  # noqa: E402

WURZEL = os.path.dirname(SKRIPT).rsplit(os.sep, 1)[0]
ROLLBACK = os.path.join(WURZEL, "scripts", "tor_rollback.py")

TEST = '''import json


def test_pokedex_hat_arten():
    assert len(json.load(open("data/pokedex.json"))) >= 2


def test_preise_sind_zahlen():
    assert all(isinstance(v, (int, float)) for v in json.load(open("data/preise.json")).values())
'''


def git(b, *a):
    return subprocess.run(["git", *a], cwd=str(b), capture_output=True, text=True, check=True).stdout


def _baum(tmp_path, immer_rot=False):
    b = tmp_path / "baum"
    (b / "scripts").mkdir(parents=True)
    (b / "tests" / "python").mkdir(parents=True)
    (b / "data").mkdir()
    shutil.copy(SKRIPT, b / "scripts" / "tor_vor_dem_push.sh")
    shutil.copy(ROLLBACK, b / "scripts" / "tor_rollback.py")
    (b / "scripts" / "run-js-unit-tests.sh").write_text(JS_ATTRAPPE)
    (b / "tests" / "python" / "test_daten.py").write_text(TEST)
    if immer_rot:
        (b / "tests" / "python" / "test_immer_rot.py").write_text("def test_x():\n    assert False\n")
    (b / "data" / "pokedex.json").write_text(json.dumps(["a", "b", "c"]))
    (b / "data" / "preise.json").write_text(json.dumps({"x": 1.5}))
    git(b, "init", "-q", "-b", "main")
    git(b, "config", "user.email", "t@t")
    git(b, "config", "user.name", "t")
    git(b, "add", "-A")
    git(b, "commit", "-qm", "basis")
    return b


def _tor(b, **env):
    e = dict(os.environ, TOR_OHNE_INSTALL="1", RUNNER_TEMP=str(b / "tmp"),
             **{k: str(v) for k, v in env.items()})
    e.pop("GITHUB_STEP_SUMMARY", None)
    r = subprocess.run(["bash", "scripts/tor_vor_dem_push.sh", "kern"], cwd=str(b), env=e,
                       capture_output=True, text=True, timeout=300)
    return r.returncode, r.stdout + r.stderr


@pytest.fixture(autouse=True)
def _braucht_node():
    if not shutil.which("node"):
        pytest.skip("node fehlt")


def _lies(b, name):
    return (b / "data" / name).read_text()


def test_die_rote_datei_bleibt_alt_die_gute_geht_durch(tmp_path):
    b = _baum(tmp_path)
    (b / "data" / "pokedex.json").write_text(json.dumps(["a"]))        # bricht den Test
    (b / "data" / "preise.json").write_text(json.dumps({"x": 2.5}))    # gut
    rc, aus = _tor(b)
    assert rc == 0, aus
    assert json.loads(_lies(b, "pokedex.json")) == ["a", "b", "c"], "rote Datei nicht zurueckgerollt"
    assert json.loads(_lies(b, "preise.json")) == {"x": 2.5}, "gute Datei wurde mitgerollt"
    assert "pokedex.json" in aus and "preise.json" not in aus.split("Tor offen")[-1]


def test_zwei_rote_dateien_werden_beide_zurueckgerollt(tmp_path):
    b = _baum(tmp_path)
    (b / "data" / "pokedex.json").write_text(json.dumps(["a"]))
    (b / "data" / "preise.json").write_text(json.dumps({"x": "kaputt"}))
    rc, aus = _tor(b)
    assert rc == 0, aus
    assert json.loads(_lies(b, "pokedex.json")) == ["a", "b", "c"]
    assert json.loads(_lies(b, "preise.json")) == {"x": 1.5}


def test_neue_rote_datei_wird_entfernt(tmp_path):
    b = _baum(tmp_path)
    (b / "data" / "preise.json").write_text(json.dumps({"x": 1.5, "y": "kaputt"}))
    (b / "data" / "neu.json").write_text("{}")
    rc, aus = _tor(b)
    assert rc == 0, aus
    assert _lies(b, "preise.json") == json.dumps({"x": 1.5})
    assert (b / "data" / "neu.json").exists(), "eine unschuldige neue Datei wurde entfernt"


def test_liegt_es_nicht_an_den_daten_bleibt_das_tor_zu_und_alles_unveraendert(tmp_path):
    b = _baum(tmp_path, immer_rot=True)
    (b / "data" / "preise.json").write_text(json.dumps({"x": 2.5}))
    rc, aus = _tor(b)
    assert rc == 1, aus
    assert json.loads(_lies(b, "preise.json")) == {"x": 2.5}, "Datei wurde angefasst, obwohl nicht sie schuld ist"


def test_ohne_rollback_ist_dasselbe_rot(tmp_path):
    """Verfaelschungsprobe: ohne Zurueckrollen bleibt das Tor zu."""
    b = _baum(tmp_path)
    (b / "data" / "pokedex.json").write_text(json.dumps(["a"]))
    rc, aus = _tor(b, TOR_OHNE_ROLLBACK=1)
    assert rc == 1, aus


def test_nach_dem_commit_wird_der_commit_bereinigt(tmp_path):
    """Lauf nach dem Rebase: der Commit steht schon vor origin/main."""
    b = _baum(tmp_path)
    git(b, "update-ref", "refs/remotes/origin/main", "HEAD")
    (b / "data" / "pokedex.json").write_text(json.dumps(["a"]))
    (b / "data" / "preise.json").write_text(json.dumps({"x": 2.5}))
    git(b, "commit", "-qam", "Auto: Lauf")
    rc, aus = _tor(b)
    assert rc == 0, aus
    assert git(b, "status", "--porcelain", "data").strip() == "", "Arbeitsbaum nicht sauber"
    diff = git(b, "diff", "--name-only", "origin/main", "HEAD").split()
    assert diff == ["data/preise.json"], diff


def test_geloeschte_gute_datei_bleibt_geloescht_die_rote_kommt_zurueck(tmp_path):
    """Pruefagent 07.10.: eine im Lauf geloeschte Datei darf beim Heilen nicht wieder auftauchen."""
    b = _baum(tmp_path)
    (b / "data" / "extra.json").write_text("{}")
    git(b, "add", "-A"); git(b, "commit", "-qm", "extra")
    (b / "data" / "extra.json").unlink()
    (b / "data" / "pokedex.json").write_text(json.dumps(["a"]))
    rc, aus = _tor(b)
    assert rc == 0, aus
    assert not (b / "data" / "extra.json").exists(), "geloeschte unschuldige Datei kam zurueck"
    assert json.loads(_lies(b, "pokedex.json")) == ["a", "b", "c"]


def test_gestagte_rote_datei_bleibt_nicht_im_index(tmp_path):
    b = _baum(tmp_path)
    (b / "data" / "pokedex.json").write_text(json.dumps(["a"]))
    git(b, "add", "data")
    rc, aus = _tor(b)
    assert rc == 0, aus
    assert git(b, "diff", "--cached", "--name-only").strip() == "", "rote Fassung steht noch im Index"


def test_testname_mit_leerzeichen_wird_erkannt(tmp_path):
    b = _baum(tmp_path)
    (b / "tests" / "python" / "test_param.py").write_text(
        "import json, pytest\n@pytest.mark.parametrize('n', ['a b'])\n"
        "def test_p(n):\n    assert len(json.load(open('data/pokedex.json'))) >= 2\n")
    git(b, "add", "-A"); git(b, "commit", "-qm", "param")
    (b / "data" / "pokedex.json").write_text(json.dumps(["a"]))
    rc, aus = _tor(b)
    assert rc == 0, aus
    assert json.loads(_lies(b, "pokedex.json")) == ["a", "b", "c"]


def test_da53_datenstand_der_zurueckgerollten_datei_bleibt_alt(tmp_path):
    """DA-53 (07.10.2026): data_stand.json wird vor dem Tor gestempelt; die
    zurueckgerollte Datei darf danach nicht den Zeitpunkt dieses Laufs tragen."""
    b = _baum(tmp_path)
    alt = {"erzeugt_am": "gestern", "dateien": {"pokedex.json": "2026-10-06T00:00:00+00:00",
                                                 "preise.json": "2026-10-06T00:00:00+00:00"},
           "inhalt_bis": {}, "leer": [], "ohne_stand": [], "inhaltsspalte_unlesbar": []}
    (b / "data" / "data_stand.json").write_text(json.dumps(alt))
    git(b, "add", "-A")
    git(b, "commit", "-qm", "stand")
    (b / "data" / "pokedex.json").write_text(json.dumps(["a"]))        # rot
    (b / "data" / "preise.json").write_text(json.dumps({"x": 2.5}))    # gut
    neu = json.loads(json.dumps(alt))
    neu["dateien"] = {"pokedex.json": "2026-10-07T04:00:00+00:00", "preise.json": "2026-10-07T04:00:00+00:00"}
    (b / "data" / "data_stand.json").write_text(json.dumps(neu))
    rc, aus = _tor(b)
    assert rc == 0, aus
    stand = json.loads(_lies(b, "data_stand.json"))["dateien"]
    assert stand["pokedex.json"] == "2026-10-06T00:00:00+00:00", "zurueckgerollte Datei behaelt den neuen Stempel"
    assert stand["preise.json"] == "2026-10-07T04:00:00+00:00", "die gute Datei verliert ihren Stempel"


def test_wz35_bei_zwei_commits_traegt_keiner_die_rote_datei(tmp_path):
    """WZ-35 (07.10.2026): stehen zwei Commits vor main, stand die Ruecknahme
    nur im obersten. Jetzt traegt kein Commit vor main die rote Datei."""
    b = _baum(tmp_path)
    git(b, "update-ref", "refs/remotes/origin/main", "HEAD")
    (b / "data" / "pokedex.json").write_text(json.dumps(["a"]))
    git(b, "commit", "-qam", "Auto: Lauf 1")
    (b / "data" / "preise.json").write_text(json.dumps({"x": 2.5}))
    git(b, "commit", "-qam", "Auto: Lauf 2")
    rc, aus = _tor(b)
    assert rc == 0, aus
    for sha in git(b, "rev-list", "origin/main..HEAD").split():
        geaendert = git(b, "show", "--name-only", "--format=", sha).split()
        assert "data/pokedex.json" not in geaendert, (sha, geaendert)
    botschaft = git(b, "log", "-1", "--format=%B")
    assert "Lauf 1" in botschaft and "Lauf 2" in botschaft


# --- SC-29 (09.10.2026) -----------------------------------------------------
# Champions Replica Scrape #150 (Lauf 37882102698) blieb rot, obwohl das Tor
# eine "heilende" Menge fand: es rollte champions_usage.json und
# champions_resources.json zurueck, liess aber champions_pokedex.json (aus der
# Nutzungsdatei gebaut) auf dem neuen Stand. Die Suche prueft nur die zuerst
# roten Zusicherungen; der Gesamtlauf danach fand den Widerspruch
# ("Mega Baxcalibur: Anteil 58.1 statt 74.4") und das veraltete
# Luecken-Inventar — nicht heilbar, ganzer Lauf verworfen. Die Zusammenfassung
# zeigte dazu nur die Meldungen des ZWEITEN Laufs.

# Die Dateinamen stehen NICHT im Testtext, sondern in _quellen.py: seit dem
# zweiten Teil von SC-29 nimmt die Suche jede Testdatei ins Orakel, die zwei
# geaenderte Dateien nennt — damit waere der Fall unten auch OHNE Familie
# geheilt, und die Gegenprobe der Familie bewiese nichts mehr. Ein Test, der
# seine Dateien ueber ein Hilfsmodul liest, ist fuer das Orakel unsichtbar;
# genau dafuer bleibt die Familie noetig.
FAMILIE_TEST = '''import json

from _quellen import ABGELEITET, NUTZUNG


def lies(n):
    return json.load(open("data/" + n))


def test_nutzung_ohne_kaputt():
    assert "kaputt" not in lies(NUTZUNG)


def test_abgeleitet_passt_zur_nutzung():
    assert lies(ABGELEITET)["anteil"] == lies(NUTZUNG)["anteil"]
'''


def _familienbaum(tmp_path, nutzung, abgeleitet):
    b = _baum(tmp_path)
    (b / "tests" / "python" / "_quellen.py").write_text(
        f"NUTZUNG = {nutzung!r}\nABGELEITET = {abgeleitet!r}\n")
    (b / "tests" / "python" / "conftest.py").write_text(
        "import os, sys\nsys.path.insert(0, os.path.dirname(__file__))\n")
    (b / "tests" / "python" / "test_familie.py").write_text(FAMILIE_TEST)
    (b / "data" / nutzung).write_text(json.dumps({"anteil": 74.4}))
    (b / "data" / abgeleitet).write_text(json.dumps({"anteil": 74.4}))
    git(b, "add", "-A"); git(b, "commit", "-qm", "familie")
    # der Lauf: neue Nutzung bricht eine Zusicherung, die abgeleitete Datei passt zu ihr
    (b / "data" / nutzung).write_text(json.dumps({"anteil": 58.1, "kaputt": 1}))
    (b / "data" / abgeleitet).write_text(json.dumps({"anteil": 58.1}))
    return b


def test_sc29_abgeleitete_champions_datei_rollt_mit_zurueck(tmp_path):
    b = _familienbaum(tmp_path, "champions_usage.json", "champions_pokedex.json")
    rc, aus = _tor(b)
    assert rc == 0, aus
    assert json.loads(_lies(b, "champions_usage.json")) == {"anteil": 74.4}
    assert json.loads(_lies(b, "champions_pokedex.json")) == {"anteil": 74.4}, \
        "abgeleitete Datei blieb neu — Widerspruch zur zurueckgerollten Nutzung"


def test_sc29_verfaelschung_ohne_familie_bleibt_es_rot(tmp_path):
    """Gegenprobe: dieselben Dateien ausserhalb einer Familie — einzeln
    zurueckgerollt, Gesamtlauf rot (das alte Verhalten aus Lauf #150)."""
    b = _familienbaum(tmp_path, "nutzung.json", "abgeleitet.json")
    rc, aus = _tor(b)
    assert rc == 1, aus


def test_sc29_zusammenfassung_zeigt_die_meldungen_des_ersten_laufs(tmp_path):
    b = _familienbaum(tmp_path, "nutzung.json", "abgeleitet.json")
    zf = tmp_path / "zusammenfassung.md"
    zf.write_text("")
    e = dict(os.environ, TOR_OHNE_INSTALL="1", RUNNER_TEMP=str(b / "tmp"), GITHUB_STEP_SUMMARY=str(zf))
    r = subprocess.run(["bash", "scripts/tor_vor_dem_push.sh", "kern"], cwd=str(b), env=e,
                       capture_output=True, text=True, timeout=300)
    assert r.returncode == 1, r.stdout + r.stderr
    text = zf.read_text()
    rot = text.split("Rot — die Meldungen")[-1]
    assert "test_nutzung_ohne_kaputt" in rot, "die Meldung des ERSTEN Laufs fehlt:\n" + text
    assert "Zweiter Lauf" in text and "test_abgeleitet_passt_zur_nutzung" in text, \
        "der zweite Lauf nach dem Zurueckrollen wird nicht benannt:\n" + text


LUECKEN_ERZEUGER = '''import json
n = len(json.load(open("data/pokedex.json")))
json.dump({"n": n}, open("data/datenluecken.json", "w"))
'''


def test_sc29_luecken_inventar_wird_nach_dem_zurueckrollen_neu_erzeugt(tmp_path):
    b = _baum(tmp_path)
    (b / "scripts" / "datenluecken.py").write_text(LUECKEN_ERZEUGER)
    (b / "tests" / "python" / "test_luecken.py").write_text(
        "import json\n\ndef test_inventar_aktuell():\n"
        "    assert json.load(open('data/datenluecken.json'))['n'] == len(json.load(open('data/pokedex.json')))\n")
    (b / "data" / "datenluecken.json").write_text(json.dumps({"n": 3}))
    git(b, "add", "-A"); git(b, "commit", "-qm", "luecken")
    (b / "data" / "pokedex.json").write_text(json.dumps(["a"]))     # rot
    (b / "data" / "datenluecken.json").write_text(json.dumps({"n": 1}))  # passt zum Lauf
    rc, aus = _tor(b)
    assert rc == 0, aus
    assert json.loads(_lies(b, "pokedex.json")) == ["a", "b", "c"]
    assert json.loads(_lies(b, "datenluecken.json")) == {"n": 3}, "Inventar nicht neu erzeugt"


# ── SC-29, zweiter Teil (09.10.2026): KONSISTENZTESTS ALS ORAKEL ─────────
#
# Dieselbe Bauart wie die Champions-Familie gibt es ueberall, wo ein Bauer aus
# einer Datei eine zweite macht. Hier OHNE Familie: nutzung.json (rot),
# kader.json (daraus gebaut, selbst gruen) und ein Test, der beide
# gegeneinander haelt und beide Dateien im Quelltext NENNT — den nimmt die
# Suche ins Orakel, und kader geht mit zurueck. Verfaelschungsprobe
# 09.10.2026: gegen die Skripte vor diesem Teil 3 der 4 Zusicherungen rot.

def _baum_sc29(tmp_path, mit_inventar=False):
    b = _baum(tmp_path)
    (b / "data" / "nutzung.json").write_text(json.dumps({"wert": 1}))
    (b / "data" / "kader.json").write_text(json.dumps({"wert": 1}))
    (b / "tests" / "python" / "test_nutzung.py").write_text(
        "import json\n\ndef test_nutzung_ohne_fehlerspalte():\n"
        "    assert 'kaputt' not in json.load(open('data/nutzung.json'))\n")
    (b / "tests" / "python" / "test_kader_konsistenz.py").write_text(
        "import json\n\ndef test_kader_passt_zur_nutzung():\n"
        "    k = json.load(open('data/kader.json'))\n"
        "    n = json.load(open('data/nutzung.json'))\n"
        "    assert k['wert'] == n['wert'], f\"Anteil {k['wert']} statt {n['wert']}\"\n")
    if mit_inventar:
        (b / "scripts" / "datenluecken.py").write_text(
            "import json\nn = json.load(open('data/nutzung.json'))['wert']\n"
            "json.dump({'n': n}, open('data/datenluecken.json', 'w'))\n")
        (b / "data" / "datenluecken.json").write_text(json.dumps({"n": 1}))
        (b / "tests" / "python" / "test_inventar.py").write_text(
            "import json\n\ndef test_inventar_stimmt_mit_dem_erzeuger_ueberein():\n"
            "    n = json.load(open('data/nutzung.json'))['wert']\n"
            "    assert json.load(open('data/datenluecken.json')) == {'n': n}, 'datenluecken.json ist veraltet'\n")
    git(b, "add", "-A")
    git(b, "commit", "-qm", "sc29 basis")
    # Der Lauf: nutzung frisch UND kaputt, kader daraus frisch gebaut (konsistent).
    (b / "data" / "nutzung.json").write_text(json.dumps({"wert": 2, "kaputt": True}))
    (b / "data" / "kader.json").write_text(json.dumps({"wert": 2}))
    if mit_inventar:
        (b / "data" / "datenluecken.json").write_text(json.dumps({"n": 2}))
    (b / "data" / "preise.json").write_text(json.dumps({"x": 2.5}))    # unschuldig, geht durch
    return b


def test_sc29_konsistenztest_im_orakel_rollt_den_partner_mit_zurueck(tmp_path):
    b = _baum_sc29(tmp_path)
    rc, aus = _tor(b)
    assert rc == 0, aus
    assert json.loads(_lies(b, "nutzung.json")) == {"wert": 1}, "rote Datei nicht zurueckgerollt"
    assert json.loads(_lies(b, "kader.json")) == {"wert": 1}, (
        "die aus der roten Datei gebaute Datei blieb frisch — der Fehler vom 09.10.2026, ohne Familie")
    assert json.loads(_lies(b, "preise.json")) == {"x": 2.5}, "unschuldige Datei wurde mitgerollt"
    zurueck = aus.split("ZURUECK:")[-1].split("\n")[0]
    assert "data/kader.json" in zurueck and "data/nutzung.json" in zurueck, zurueck
    assert "test_kader_konsistenz.py" in aus.split("Konsistenztests im Orakel:")[-1].split("\n")[0]


def test_sc29_inventar_passt_nach_dem_zurueckrollen_zum_endstand(tmp_path):
    b = _baum_sc29(tmp_path, mit_inventar=True)
    rc, aus = _tor(b)
    assert rc == 0, aus
    assert json.loads(_lies(b, "datenluecken.json")) == {"n": 1}, (
        "das Inventar traegt noch den frischen Stand, obwohl seine Quelle zurueckging")
    assert "data/datenluecken.json" not in aus.split("ZURUECK:")[-1].split("\n")[0], (
        "ein neu erzeugtes Inventar ist nicht ‚zurueckgerollt'")


def test_sc29_zusammenfassung_nennt_den_ersten_durchlauf_auch_nach_dem_heilen(tmp_path):
    """Geheilt heisst nicht erledigt: die Ursache, wegen der eine Datei alt
    bleibt, muss in Zusammenfassung und Protokoll stehen."""
    b = _baum_sc29(tmp_path)
    zf = tmp_path / "summary.md"
    e = dict(os.environ, TOR_OHNE_INSTALL="1", RUNNER_TEMP=str(b / "tmp"), GITHUB_STEP_SUMMARY=str(zf))
    r = subprocess.run(["bash", "scripts/tor_vor_dem_push.sh", "kern"], cwd=str(b), env=e,
                       capture_output=True, text=True, timeout=300)
    assert r.returncode == 0, r.stdout + r.stderr
    text = zf.read_text()
    assert "Rot im ERSTEN Durchlauf" in text
    assert "test_nutzung.py::test_nutzung_ohne_fehlerspalte" in text, text
    assert "Konsistenztests im Orakel" in text and "test_kader_konsistenz.py" in text, text
    assert "::warning::Tor, erster Durchlauf: FAILED tests/python/test_nutzung.py" in r.stdout


def test_sc29_ohne_konsistenztest_geht_der_partner_durch(tmp_path):
    """Gegenprobe: ohne einen Test, der kader und nutzung gegeneinander haelt,
    gibt es keinen Grund, kader zurueckzurollen — die frische Datei geht durch."""
    b = _baum_sc29(tmp_path)
    git(b, "rm", "-q", "tests/python/test_kader_konsistenz.py")
    git(b, "commit", "-qm", "ohne konsistenztest")   # die Datenaenderungen bleiben ungestaged
    rc, aus = _tor(b)
    assert rc == 0, aus
    assert json.loads(_lies(b, "kader.json")) == {"wert": 2}, "kader wurde ohne Grund zurueckgerollt"
    assert json.loads(_lies(b, "nutzung.json")) == {"wert": 1}
