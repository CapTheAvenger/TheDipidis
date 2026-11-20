"""WZ-51 (20.11.2026): Wochenlauf 44686101979 — ein Deckset drehte das
japanische Format, und der Schrumpf-Waechter hielt danach die Rotation fest.

1. Am 13.11.2026 erschien bei Limitless "Special Deck Set MEGA" (Code MG,
   38 Karten). update_sets nahm das juengste Datum als current_set_jp; die
   City League rotierte (Daten ab 16.09. ins Archiv) und drei Pruefungen,
   die "M<n>" erwarten, brachen ab. Jetzt dreht nur eine JP-Erweiterung.
2. Der Schrumpf-Waechter setzte die von der Rotation geleerten Dateien
   zurueck — er haette es bei jeder Rotation getan, wochenlang. Ebenso die
   Victory-Road-Replika (80 Teams nach der 28-Tage-Frist entfallen). Beides
   ist jetzt erlaubt, aber nur, wenn der Lauf selbst den Grund belegt.
3. Das Tor gibt die Fehlerzeilen als Hinweis aus, nicht nur den Dateinamen.

Alles ausgefuehrt: die Setwahl an gesetzten Daten, der Waechter und das
Tor im Wegwerf-Baum.
"""
import importlib.util
import json
import os
import shutil
import subprocess
import sys

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
sys.path.insert(0, HIER)


def _update_sets():
    spec = importlib.util.spec_from_file_location(
        "us_wz51", os.path.join(WURZEL, "backend", "core", "update_sets.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# Gelesen auf limitlesstcg.com/cards/jp am 20.11.2026 (Ausschnitt).
JP_DATEN = {
    "MG": "2026-11-13",    # Special Deck Set MEGA
    "M6A": "2026-09-16",   # 30th Celebration
    "MF": "2026-09-16",    # Premium Deck Set Espeon & Umbreon
    "M6": "2026-07-31",    # Storm Emeralda
    "MEE": "2026-07-31",   # ex Starter Set
    "MC": "2025-12-19",    # Starter Decks 100 Battle Collection
}


class TestJapanischeSetwahl:
    def test_ein_deckset_dreht_das_format_nicht(self):
        us = _update_sets()
        assert us._pick_current_jp_set(JP_DATEN) == "M6A"
        # Gegenprobe: die alte Wahl nahm genau das Deckset — der Fehler vom 20.11.
        assert us._pick_current_set(JP_DATEN) == "MG"

    def test_die_naechste_erweiterung_dreht_es(self):
        us = _update_sets()
        assert us._pick_current_jp_set(dict(JP_DATEN, M7="2026-11-14")) == "M7"
        assert us._pick_current_jp_set(dict(JP_DATEN, M7a="2026-11-14")) == "M7a"

    def test_ohne_erweiterung_bleibt_das_alte_verhalten(self):
        us = _update_sets()
        assert us._pick_current_jp_set({"MC": "2025-12-19", "SV9": "2025-01-01"}) == "MC"

    def test_das_formatfenster_nimmt_die_erweiterung(self, tmp_path, monkeypatch):
        """write_format_window selbst, nicht nur die Hilfsfunktion."""
        us = _update_sets()
        meta = tmp_path / "sets_metadata.json"
        meta.write_text("{}")
        monkeypatch.setattr(us, "data_dir", str(tmp_path))
        monkeypatch.setattr(us, "rueckfall_jp_release_dates", lambda *a, **k: {})
        monkeypatch.setattr(us, "rueckfall_release_dates", lambda *a, **k: {})
        monkeypatch.setattr(us, "_derive_oldest_legal_set", lambda *a, **k: "TEF")
        monkeypatch.setattr(us, "anker_belegt", lambda *a, **k: (True, 0, "Probe"))
        us.write_format_window(str(meta), {"DLR": "2026-11-06"}, JP_DATEN)
        fw = json.loads((tmp_path / "format_window.json").read_text())
        assert fw["current_set_jp"] == "M6A"
        assert fw["jp_release_date"] == "2026-09-16"


# ── Schrumpf-Waechter im Wegwerf-Baum ─────────────────────────────────

def git(b, *a):
    return subprocess.run(["git", *a], cwd=str(b), capture_output=True,
                          text=True, check=True).stdout


def _baum(tmp_path):
    b = tmp_path / "baum"
    (b / "scripts").mkdir(parents=True)
    (b / "backend" / "core").mkdir(parents=True)
    (b / "config").mkdir()
    (b / "data").mkdir()
    for f in ("schrumpf_waechter.py", "tor_rollback.py"):
        shutil.copy(os.path.join(WURZEL, "scripts", f), b / "scripts" / f)
    shutil.copy(os.path.join(WURZEL, "backend", "core", "update_sets.py"),
                b / "backend" / "core" / "update_sets.py")
    kopf = "tournament_id,card_name,count\n"
    (b / "data" / "city_league_analysis.csv").write_text(
        kopf + "".join(f"{i},Karte {i},4\n" for i in range(400)))
    (b / "config" / "scraper_settings.json").write_text(json.dumps({
        "city_league_analysis": {"sources": {"city_league": {"start_date": "16.09.2026"}}},
        "current_meta_analysis": {"sources": {"limitless_online": {"format_filter": "DLR"}}},
    }))
    teams = [{"replica_code": f"C{i}", "pokemon": ["x"] * 30,
              "zuletzt_gesehen": "2026-10-02"} for i in range(86)]
    (b / "data" / "victory_road_replika_teams.json").write_text(json.dumps(
        {"_meta": {"team_count": 86, "entfallen_nach_frist": 0}, "teams": teams}))
    git(b, "init", "-q", "-b", "main")
    git(b, "config", "user.email", "t@t")
    git(b, "config", "user.name", "t")
    git(b, "add", "-A")
    git(b, "commit", "-qm", "basis")
    return b


def _waechter(b):
    r = subprocess.run([sys.executable, "scripts/schrumpf_waechter.py", "pruefen"],
                       cwd=str(b), capture_output=True, text=True, timeout=60)
    return r.stdout + r.stderr


def _rotation(b, start="13.11.2026"):
    p = b / "config" / "scraper_settings.json"
    s = json.loads(p.read_text())
    s["city_league_analysis"]["sources"]["city_league"]["start_date"] = start
    p.write_text(json.dumps(s))


def _leere_city_league(b):
    (b / "data" / "city_league_analysis.csv").write_text(
        "tournament_id,card_name,count\n1,Neu,4\n")


def test_die_rotation_darf_die_city_league_leeren(tmp_path):
    b = _baum(tmp_path)
    _rotation(b)
    _leere_city_league(b)
    aus = _waechter(b)
    assert "WARNUNG: data/city_league_analysis.csv" in aus, aus
    assert "Rotation in diesem Lauf" in aus
    assert "STOPP" not in aus
    assert (b / "data" / "city_league_analysis.csv").read_text().count("\n") == 2


def test_ohne_rotation_bleibt_der_stopp(tmp_path):
    """Verfaelschungsprobe der Erlaubnis: derselbe Schwund ohne geaendertes
    Startdatum ist ein kaputter Lauf und geht zurueck."""
    b = _baum(tmp_path)
    _leere_city_league(b)
    aus = _waechter(b)
    assert "STOPP: data/city_league_analysis.csv" in aus, aus
    assert (b / "data" / "city_league_analysis.csv").read_text().count("\n") == 401


def test_eine_rotation_erlaubt_nur_ihre_eigenen_dateien(tmp_path):
    b = _baum(tmp_path)
    _rotation(b)
    vr = b / "data" / "victory_road_replika_teams.json"
    d = json.loads(vr.read_text())
    d["teams"] = d["teams"][:6]
    d["_meta"]["team_count"] = 6
    vr.write_text(json.dumps(d))
    aus = _waechter(b)
    assert "STOPP: data/victory_road_replika_teams.json" in aus, aus


def _vr(b, bleiben, entfallen, team_count=None):
    vr = b / "data" / "victory_road_replika_teams.json"
    d = json.loads(vr.read_text())
    d["teams"] = d["teams"][:bleiben]
    d["_meta"] = {"team_count": bleiben if team_count is None else team_count,
                  "entfallen_nach_frist": entfallen}
    vr.write_text(json.dumps(d))


def test_die_frist_erklaert_den_schwund(tmp_path):
    b = _baum(tmp_path)
    _vr(b, 6, 80)
    aus = _waechter(b)
    assert "WARNUNG: data/victory_road_replika_teams.json" in aus, aus
    assert "28-Tage-Frist" in aus
    assert len(json.loads((b / "data" / "victory_road_replika_teams.json")
                          .read_text())["teams"]) == 6


@pytest.mark.parametrize("entfallen, team_count", [(0, None), (10, None), (80, 7)])
def test_ohne_erklaerung_bleibt_der_stopp(tmp_path, entfallen, team_count):
    """0 entfallen, zu wenige entfallen, oder die Datei widerspricht sich."""
    b = _baum(tmp_path)
    _vr(b, 6, entfallen, team_count)
    aus = _waechter(b)
    assert "STOPP: data/victory_road_replika_teams.json" in aus, aus
    assert len(json.loads((b / "data" / "victory_road_replika_teams.json")
                          .read_text())["teams"]) == 86


def test_die_liste_des_waechters_ist_die_von_update_sets(tmp_path):
    """Keine Abschrift: der Waechter liest die Konstanten aus update_sets.py."""
    us = _update_sets()
    sys.path.insert(0, os.path.join(WURZEL, "scripts"))
    alt = os.getcwd()
    try:
        os.chdir(WURZEL)
        spec = importlib.util.spec_from_file_location(
            "sw_wz51", os.path.join(WURZEL, "scripts", "schrumpf_waechter.py"))
        sw = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(sw)
        for _, name in sw.ROTATION_SCHLUESSEL:
            assert sw._rotationsdateien(name) == getattr(us, name), name
            assert sw._rotationsdateien(name), f"{name} leer"
    finally:
        os.chdir(alt)


# ── Tor: die Meldung, nicht nur der Name ──────────────────────────────

def test_das_tor_nennt_die_meldung(tmp_path):
    if not shutil.which("node"):
        pytest.skip("node fehlt")
    from test_tor_vor_dem_push import JS_ATTRAPPE, SKRIPT  # noqa: PLC0415
    b = tmp_path / "tor"
    (b / "scripts").mkdir(parents=True)
    (b / "tests" / "python").mkdir(parents=True)
    (b / "data").mkdir()
    for f in ("tor_vor_dem_push.sh", "tor_rollback.py", "schrumpf_waechter.py",
              "tor_sperrliste.py"):
        quelle = os.path.join(os.path.dirname(SKRIPT), f)
        if os.path.exists(quelle):
            shutil.copy(quelle, b / "scripts" / f)
    # JS-Laeufer, der wie scripts/run-js-unit-tests.sh einen roten Test meldet
    # (Zeilenform aus dem echten Laeufer: "✗ datei — N failure(s)" + TAP-Auszug).
    (b / "scripts" / "run-js-unit-tests.sh").write_text(
        "echo '✗ tests/unit/test-x.js — 1 failure(s)'\n"
        "echo \"  error: 'Feldgroesse 2032 steht im Code, aber in keiner Datei'\"\n"
        "echo 'JS unit tests: 0 passed, 1 failed'\nexit 1\n")
    (b / "tests" / "python" / "test_rot.py").write_text(
        "import pytest\n\n@pytest.fixture\ndef vorrichtung():\n"
        "    assert False, 'current_set_jp unbrauchbar: MG'\n\n"
        "def test_a(vorrichtung):\n    pass\n\n"
        "def test_b(vorrichtung):\n    pass\n\n"
        "def test_c():\n    assert 1 == 2, '100% kaputt'\n")
    (b / "data" / "x.json").write_text("[1]")
    git(b, "init", "-q", "-b", "main")
    git(b, "config", "user.email", "t@t")
    git(b, "config", "user.name", "t")
    git(b, "add", "-A")
    git(b, "commit", "-qm", "basis")
    e = dict(os.environ, TOR_OHNE_INSTALL="1", RUNNER_TEMP=str(b / "tmp"),
             TOR_OHNE_ROLLBACK="1")
    e.pop("GITHUB_STEP_SUMMARY", None)
    r = subprocess.run(["bash", "scripts/tor_vor_dem_push.sh", "kern"], cwd=str(b),
                       env=e, capture_output=True, text=True, timeout=300)
    aus = r.stdout + r.stderr
    assert "::notice::Tor-Detail py-kern: " in aus, aus
    assert "test_rot.py::test_a" in aus, aus
    assert "current_set_jp unbrauchbar: MG" in aus or "test_b" in aus, aus
    assert "::notice::Tor-Detail js-kern: error: 'Feldgroesse 2032" in aus, aus
    # EINE Zeile je Suite — sonst verdraengen die Details die Sammelzeile
    # "Tor-Befunde" aus dem Kontingent von 10 Hinweisen (Prueffund 20.11.).
    zeilen = [z for z in aus.splitlines() if z.startswith("::notice::Tor-Detail ")]
    assert len(zeilen) == 2, zeilen
    assert "%" not in "".join(zeilen).replace("%25", ""), zeilen
