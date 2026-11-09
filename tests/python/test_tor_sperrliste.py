"""SC-50 (09.11.2026): nur die Sperrliste haelt einen Datenlauf an.

ENTSCHEIDUNG HAUSI nach Wochenlauf #200: „Feste Sperrliste". Bis dahin
hielt jede der rund 9.000 Zusicherungen, die gegen frische Daten rot
wurde, die ganze Datenfamilie an — acht der 16 Vorfaelle im Fehlerbuch
(07.10.-09.11.) waren genau das: die Quelle aenderte sich, eine
Zusicherung las es als Fehler. Jetzt sperrt nur, was in
scripts/tor_sperrliste.py steht (oder sich keiner Zusicherung zuordnen
laesst); alles andere ist ein Befund, die Daten gehen raus.

Geprueft am VERHALTEN: die Einordnung an echten Protokollzeilen, und das
echte Tor-Skript in einem Wegwerf-Git-Baum (wie test_tor_rollt_rote_datei_
zurueck.py) — Befund geliefert, Sperrendes zurueckgerollt, gemischt nur das
Sperrende zurueckgerollt.
"""
import json
import os
import shutil
import sys

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
sys.path.insert(0, os.path.join(WURZEL, "scripts"))
sys.path.insert(0, HIER)

import tor_rollback  # noqa: E402
import tor_sperrliste as TS  # noqa: E402
from test_tor_rollt_rote_datei_zurueck import _baum, _lies, _tor, git  # noqa: E402

# Die 22 Zusicherungen, die Wochenlauf #200 (09.11.2026, Lauf 42605862317)
# im ersten Durchlauf rot machten — aus dem Tor-Artefakt abgeschrieben.
ROT_200_PY = [
    "tests/python/test_ablaufumgebung_abgeschirmt.py::test_die_tests_mit_unterprozessen_schreiben_nichts_in_den_echten_lauf",
    "tests/python/test_consumers_vertrag_deckt_sich.py::test_der_waechter_meldet_zu_diesem_vertrag_nichts",
    "tests/python/test_consumers_vertrag_deckt_sich.py::test_die_vier_online_api_dateien_haben_einen_spaltenvertrag",
    "tests/python/test_consumers_vertrag_deckt_sich.py::test_jede_dokumentierte_datei_steht_im_waechter",
    "tests/python/test_consumers_vertrag_deckt_sich.py::test_jede_geprueft_datei_steht_auch_im_dokument",
    "tests/python/test_consumers_vertrag_deckt_sich.py::test_jede_vertragsdatei_existiert_wirklich",
    "tests/python/test_masterclass_am_wochenlauf.py::test_die_feldanteile_stehen_so_da_wie_in_der_datei",
    "tests/python/test_masterclass_kartennamen.py::test_die_drei_matchup_quoten_der_live_datei_stehen_wie_die_rohdaten",
    "tests/python/test_masterclass_zahlen_nachziehen.py::test_am_heutigen_stand_ist_nichts_nachzuziehen",
    "tests/python/test_regulation_marks_nachziehen.py::test_datei_zaehlung_stimmt_mit_inhalt_und_quelle",
    "tests/python/test_sets_mapping_allowlist.py::test_repo_mapping_contains_every_carddb_set",
]
ROT_200_JS = [
    "tests/unit/test-anteile-und-konventionen-07-09.js",
    "tests/unit/test-heatmap-major.js",
    "tests/unit/test-online-major-merge.js",
    "tests/unit/test-post-hashtags-und-filter.js",
    "tests/unit/test-win-rate-konvention.js",
]


def _protokolle(tmp_path, py=(), js=(), js_extra="", neben=False):
    o = tmp_path / "prot"
    o.mkdir()
    (o / "py-kern.log").write_text(
        "".join(f"FAILED {z} - AssertionError: x\n" for z in py)
        + (f"{len(py)} failed, 100 passed in 1.0s\n" if py else "100 passed in 1.0s\n"))
    (o / "js-kern.log").write_text(
        "".join(f"✗ {z} — 1 failure(s)\n" for z in js) + js_extra
        + f"JS unit tests: 10 passed, {len(js)} failed\n")
    if neben:
        (o / "js-neben.log").write_text("JS unit tests: 5 passed, 0 failed\n")
    return str(o)


# ── die Liste selbst ──────────────────────────────────────────────────

def test_jede_datei_der_sperrliste_gibt_es_und_jede_nennt_ihren_schaden():
    for datei, schaden in TS.SPERRLISTE.items():
        assert os.path.exists(os.path.join(WURZEL, datei)), f"{datei} gibt es nicht"
        assert len(schaden) >= 30, f"{datei}: der Schaden ist nicht benannt"


def test_die_sperrliste_bleibt_kurz():
    """Waechst die Liste, waechst das Problem von vorher wieder. Wer hier
    erhoeht, schreibt den Grund dazu."""
    assert len(TS.SPERRLISTE) <= 12


# ── die Einordnung ────────────────────────────────────────────────────

def test_wochenlauf_200_haette_nur_am_fehlenden_format_gesperrt(tmp_path):
    o = _protokolle(tmp_path, ROT_200_PY, ROT_200_JS)
    sperrend, befunde, unlesbar = TS.einordnen(o)
    assert unlesbar == []
    assert {TS.datei_von(z) for z in sperrend} == {"tests/python/test_consumers_vertrag_deckt_sich.py"}
    assert len(befunde) == len(ROT_200_PY) + len(ROT_200_JS) - 5


def test_nur_befunde_sperren_nicht(tmp_path):
    o = _protokolle(tmp_path, [ROT_200_PY[6]], ROT_200_JS[:2])
    assert TS.main(["einordnen", o, str(tmp_path / "aus")]) == 0
    befunde = (tmp_path / "aus" / "befunde.txt").read_text().splitlines()
    assert len(befunde) == 3


def test_ein_absturz_ohne_benannte_zusicherung_sperrt(tmp_path):
    o = _protokolle(tmp_path, js_extra="Lauf abgebrochen: heap out of memory\n")
    assert TS.main(["einordnen", o, str(tmp_path / "aus")]) == 1


def test_die_suche_sieht_nur_die_sperrenden_zeilen_und_den_bereich(tmp_path):
    o = _protokolle(tmp_path, ROT_200_PY, ROT_200_JS, neben=True)
    aus = tmp_path / "aus"
    assert TS.main(["einordnen", o, str(aus)]) == 1
    py, js, unlesbar = tor_rollback.rote_zusicherungen(str(aus))
    assert unlesbar == [] and js == []
    assert {p.split("::")[0] for p in py} == {"tests/python/test_consumers_vertrag_deckt_sich.py"}
    # Der Bereich (Nebenbereiche gefahren) bleibt fuer die Suche erkennbar.
    assert tor_rollback.bereich_aus_protokollen(str(aus)) == "alle"


# ── das echte Tor-Skript ─────────────────────────────────────────────

BEFUNDTEST = '''import json


def test_preise_sind_zahlen():
    assert all(isinstance(v, (int, float)) for v in json.load(open("data/preise.json")).values())
'''


def _mit_sperrliste(b, gesperrt):
    """Die echte Sperrliste in den Baum, mit `gesperrt` als einziger Datei."""
    ziel = b / "scripts" / "tor_sperrliste.py"
    text = open(os.path.join(WURZEL, "scripts", "tor_sperrliste.py"), encoding="utf-8").read()
    kopf, rest = text.split("SPERRLISTE = {", 1)
    rest = rest.split("\n}\n", 1)[1]
    eintrag = "".join(f'    "{g}": "Testbaum: diese Datei sperrt, nichts sonst.",\n' for g in gesperrt)
    ziel.write_text(kopf + "SPERRLISTE = {\n" + eintrag + "}\n" + rest)
    git(b, "add", "-A")
    git(b, "commit", "-qm", "sperrliste")


def test_tor_liefert_einen_befund_aus_statt_zurueckzurollen(tmp_path):
    b = _baum(tmp_path)
    _mit_sperrliste(b, [])                                          # nichts sperrt
    (b / "data" / "pokedex.json").write_text(json.dumps(["a"]))    # macht test_daten rot
    rc, aus = _tor(b)
    assert rc == 0, aus
    assert json.loads(_lies(b, "pokedex.json")) == ["a"], "Befund wurde zurueckgerollt"
    assert "Tor-Befund (nicht sperrend): tests/python/test_daten.py::test_pokedex_hat_arten" in aus


def test_tor_rollt_das_sperrende_weiter_zurueck(tmp_path):
    b = _baum(tmp_path)
    _mit_sperrliste(b, ["tests/python/test_daten.py"])
    (b / "data" / "pokedex.json").write_text(json.dumps(["a"]))
    rc, aus = _tor(b)
    assert rc == 0, aus
    assert json.loads(_lies(b, "pokedex.json")) == ["a", "b", "c"], "Sperrendes nicht zurueckgerollt"


def test_gemischt_rollt_nur_das_sperrende_zurueck_der_befund_geht_raus(tmp_path):
    b = _baum(tmp_path)
    (b / "tests" / "python" / "test_befund.py").write_text(BEFUNDTEST)
    (b / "tests" / "python" / "test_daten.py").write_text(
        'import json\n\n\ndef test_pokedex_hat_arten():\n'
        '    assert len(json.load(open("data/pokedex.json"))) >= 2\n')
    _mit_sperrliste(b, ["tests/python/test_daten.py"])
    (b / "data" / "pokedex.json").write_text(json.dumps(["a"]))          # sperrend
    (b / "data" / "preise.json").write_text(json.dumps({"x": "kaputt"}))  # nur Befund
    rc, aus = _tor(b)
    assert rc == 0, aus
    assert json.loads(_lies(b, "pokedex.json")) == ["a", "b", "c"]
    assert json.loads(_lies(b, "preise.json")) == {"x": "kaputt"}, \
        "die Suche hat fuer einen Befund zurueckgerollt"
    assert "Tor-Befund (nicht sperrend): tests/python/test_befund.py::test_preise_sind_zahlen" in aus


def test_sperrendes_das_sich_nicht_heilen_laesst_haelt_alles_an(tmp_path):
    b = _baum(tmp_path, immer_rot=True)
    _mit_sperrliste(b, ["tests/python/test_immer_rot.py"])
    (b / "data" / "preise.json").write_text(json.dumps({"x": 2.5}))
    rc, aus = _tor(b)
    assert rc == 1, aus


def test_fehlt_die_sperrliste_sperrt_jedes_rot_wie_vorher(tmp_path):
    """Sichere Vorgabe: ohne scripts/tor_sperrliste.py sperrt das Tor wie
    vor SC-50 — so laufen auch die aelteren Tor-Tests weiter."""
    b = _baum(tmp_path, immer_rot=True)
    rc, aus = _tor(b)
    assert rc == 1, aus
    assert "Tor-Befund" not in aus


@pytest.fixture(autouse=True)
def _braucht_node_fuer_die_echten_laeufe(request):
    if "tmp_path" in request.fixturenames and request.function.__name__.startswith("test_tor_") \
            and not shutil.which("node"):
        pytest.skip("node fehlt")


# ── WZ-48: ein stehender Befund macht den Guardian rot ───────────────

import importlib.util  # noqa: E402
from datetime import date  # noqa: E402

_spec = importlib.util.spec_from_file_location(
    "zurueckgehalten_sc50", os.path.join(WURZEL, "scripts", "zurueckgehalten.py"))
ZH = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ZH)

B = "tests/unit/test-heatmap-major.js"


def _lauf(n, befunde):
    return {"id": n, "nummer": n, "zeit": f"2026-11-0{n}T06:00", "url": f"u/{n}",
            "gehalten": [], "erstlauf": [], "befunde": befunde}


def test_ein_befund_zwei_laeufe_in_folge_steht():
    funde = ZH.stehende_befunde({"w.yml": [_lauf(9, [B]), _lauf(8, [B]), _lauf(7, [])]})
    assert [(f["befund"], f["serie"]) for f in funde] == [(B, 2)]
    assert "**CRITICAL**" in ZH.befunde_als_markdown(funde)


def test_ein_befund_nur_im_juengsten_lauf_steht_nicht():
    assert ZH.stehende_befunde({"w.yml": [_lauf(9, [B]), _lauf(8, [])]}) == []


def test_ein_unterbrochener_befund_steht_nicht():
    assert ZH.stehende_befunde({"w.yml": [_lauf(9, []), _lauf(8, [B]), _lauf(7, [B])]}) == []


def test_die_annotation_des_tors_wird_als_befund_gelesen():
    zeile = f"Tor-Befund (nicht sperrend): {B}"
    m = ZH.TORBEFUND.match(zeile)
    assert m and m.group(1) == B
    # und genau so schreibt das Tor sie
    tor = open(os.path.join(WURZEL, "scripts", "tor_vor_dem_push.sh"), encoding="utf-8").read()
    assert "::warning::Tor-Befund (nicht sperrend): " in tor


def _ohne_kommentare(pfad):
    with open(os.path.join(WURZEL, pfad), encoding="utf-8") as f:
        return "\n".join(z for z in f.read().splitlines() if not z.strip().startswith("#"))


def test_der_guardian_wird_rot_wenn_ein_befund_steht():
    import yaml
    yml = yaml.safe_load(open(os.path.join(WURZEL, ".github", "workflows", "data-guardian.yml"),
                              encoding="utf-8"))
    schritte = next(iter(yml["jobs"].values()))["steps"]
    namen = [s.get("name", "") for s in schritte]
    i_rot = next(i for i, n in enumerate(namen) if "WZ-48" in n)
    i_issue = namen.index("Report findings")
    assert i_rot > i_issue, "erst das Issue mit Ursache, dann rot"
    s = schritte[i_rot]
    assert "always()" in s.get("if", "")
    assert "steps.still.outputs.anzahl" in str(s.get("env", {}))
    assert "exit 1" in s["run"]


# ── SC-49: der Formatwechsel holt die Dateien des neuen Formats ──────

import tage_seit_release  # noqa: E402


def test_tage_seit_release_deckt_das_neue_format_ab():
    fw = {"set_release_date": "2026-11-06"}
    assert tage_seit_release.tage(fw, date(2026, 11, 9)) == 4
    assert tage_seit_release.tage(fw, date(2026, 11, 6)) == 3      # Untergrenze
    assert tage_seit_release.tage(fw, date(2027, 3, 1)) == 60      # Obergrenze
    assert tage_seit_release.tage({}, date(2026, 11, 9)) == 14     # kein Datum


def test_der_wochenlauf_holt_die_online_api_dateien_beim_formatwechsel():
    import yaml
    yml = yaml.safe_load(open(os.path.join(WURZEL, ".github", "workflows",
                                           "weekly-full-update.yml"), encoding="utf-8"))
    schritte = next(iter(yml["jobs"].values()))["steps"]
    namen = [s.get("name", "") for s in schritte]
    i = next(k for k, n in enumerate(namen) if "SC-49" in n)
    run = schritte[i]["run"]
    assert "git show HEAD:data/format_window.json" in run, "vergleicht nicht mit dem Stand vor dem Lauf"
    assert "limitless_api_scraper.py" in run and "tage_seit_release.py" in run
    assert "build_meta_prognose.py" in run
    assert "LIMITLESS_API_KEY" in str(schritte[i].get("env", {}))
    # vor allem, was die Online-Dateien des laufenden Formats liest
    for spaeter in ("Deckempfehlung neu rechnen", "Masterclass nachziehen (Zahlen, Feldanteile, Online-Listen)",
                    "Zusicherungen gegen die frischen Daten"):
        assert namen.index(spaeter) > i, f"{spaeter} laeuft vor dem Formatwechsel-Schritt"
    # und nach dem Schritt, der format_window.json aus dem Saatordner zurueckholt
    assert namen.index("Erzeugte Dateien zurueck nach data/") < i


def test_hole_liest_die_befunde_aus_den_annotationen_eines_laufs(monkeypatch):
    """Der Weg vom Tor zum Guardian: Annotation -> hole() -> stehende_befunde."""
    antworten = {
        "runs": {"workflow_runs": [
            {"id": 2, "run_number": 2, "conclusion": "success", "created_at": "2026-11-09T06:00",
             "html_url": "u/2"},
            {"id": 1, "run_number": 1, "conclusion": "success", "created_at": "2026-11-06T06:00",
             "html_url": "u/1"}]},
    }

    def gh(pfad):
        if "/runs?" in pfad:
            return antworten["runs"]
        if pfad.endswith("/jobs"):
            return {"jobs": [{"id": int(pfad.split("/runs/")[1].split("/")[0]) * 10}]}
        if "/annotations" in pfad:
            return [{"message": f"Tor-Befund (nicht sperrend): {B}"},
                    {"message": "irgendeine andere Warnung"}]
        raise AssertionError(pfad)

    monkeypatch.setattr(ZH, "_gh", gh)
    laeufe = ZH.hole(["w.yml"], 4)
    assert laeufe["w.yml"][0]["befunde"] == [B]
    assert [f["befund"] for f in ZH.stehende_befunde(laeufe)] == [B]


# ── B1 des Pruefagenten: eine gestorbene Suite oeffnet das Tor nicht ──

def _mit_rc(tmp_path, name, text, rc):
    o = tmp_path / "rc"
    o.mkdir(exist_ok=True)
    (o / f"{name}.log").write_text(text)
    (o / f"{name}.rc").write_text(f"{rc}\n")
    return str(o)


@pytest.mark.parametrize("text,rc", [
    ("....\n", 9),                                                   # os._exit / Signal
    ("INTERNALERROR> Traceback\n", 3),                               # interner Fehler
    ("/usr/bin/python3: No module named pytest\n", 1),               # Modul fehlt
    (f"FAILED {ROT_200_PY[6]} - x\n3 failed, 10 passed in 1s\n", 1),  # 3 gemeldet, 1 benannt
])
def test_ein_toter_pytest_lauf_sperrt(tmp_path, text, rc):
    o = _mit_rc(tmp_path, "py-kern", text, rc)
    sperrend, befunde, unlesbar = TS.einordnen(o)
    assert unlesbar, f"rc {rc} ohne lesbares Ergebnis ging als Befund durch"


def test_ein_toter_js_lauf_sperrt(tmp_path):
    o = _mit_rc(tmp_path, "js-kern", "ok 1 - a\n", 1)               # keine Schlusszeile
    assert TS.einordnen(o)[2]


def test_ein_normaler_roter_lauf_bleibt_ein_befund(tmp_path):
    o = _mit_rc(tmp_path, "py-kern", f"FAILED {ROT_200_PY[6]} - x\n1 failed, 10 passed in 1s\n", 1)
    sperrend, befunde, unlesbar = TS.einordnen(o)
    assert unlesbar == [] and sperrend == [] and befunde == [ROT_200_PY[6]]


def test_tor_bleibt_zu_wenn_pytest_stirbt(tmp_path):
    """Am echten Skript: vor dem Fix hiess das „Tor offen: alle Suiten gruen"."""
    b = _baum(tmp_path)
    _mit_sperrliste(b, [])
    (b / "tests" / "python" / "test_stirbt.py").write_text("import os\n\n\ndef test_x():\n    os._exit(9)\n")
    rc, aus = _tor(b)
    assert rc == 1, aus
    assert "Tor offen" not in aus


def test_ein_befund_als_konsistenztest_rollt_nichts_zurueck(tmp_path):
    """Pruefagent S1: der Konsistenztest preise <-> nutzung ist ein Befund.
    Vor dem Fix nahm die Suche ihn ins Orakel und rollte preise.json zurueck."""
    b = _baum(tmp_path)
    (b / "data" / "nutzung.json").write_text(json.dumps({"x": 1}))
    (b / "tests" / "python" / "test_befund.py").write_text(
        'import json\n\n\ndef test_preise_passen_zur_nutzung():\n'
        '    p = json.load(open("data/preise.json"))\n'
        '    n = json.load(open("data/nutzung.json"))\n'
        '    assert set(p) == set(n)\n')
    _mit_sperrliste(b, ["tests/python/test_daten.py"])
    (b / "data" / "pokedex.json").write_text(json.dumps(["a"]))          # sperrend
    (b / "data" / "preise.json").write_text(json.dumps({"x": 2, "y": 3}))  # Befund
    (b / "data" / "nutzung.json").write_text(json.dumps({"x": 9}))        # geaendert, passt
    rc, aus = _tor(b)
    assert rc == 0, aus
    assert json.loads(_lies(b, "pokedex.json")) == ["a", "b", "c"]
    assert json.loads(_lies(b, "preise.json")) == {"x": 2, "y": 3}, "Befund-Datei zurueckgerollt"
    assert json.loads(_lies(b, "nutzung.json")) == {"x": 9}


# ── S2-S4 des Pruefagenten ────────────────────────────────────────────

def test_die_sammelzeile_traegt_alle_befunde():
    texte = ["Tor-Befunde: tests/unit/a.js | tests/python/test_b.py::test_c",
             "Tor-Befund (nicht sperrend): tests/unit/d.js"]
    assert ZH.befunde_aus(texte) == ["tests/python/test_b.py::test_c", "tests/unit/a.js",
                                     "tests/unit/d.js"]


def test_das_tor_schreibt_die_sammelzeile_mit_allen_befunden(tmp_path):
    b = _baum(tmp_path)
    for i in range(12):
        (b / "tests" / "python" / f"test_rot_{i:02d}.py").write_text(
            'import json\n\n\ndef test_x():\n    assert len(json.load(open("data/pokedex.json"))) >= 2\n')
    _mit_sperrliste(b, [])
    (b / "data" / "pokedex.json").write_text(json.dumps(["a"]))
    rc, aus = _tor(b)
    assert rc == 0, aus
    zeile = next(z for z in aus.splitlines() if z.startswith("::notice::Tor-Befunde: "))
    gelesen = ZH.befunde_aus([zeile[len("::notice::"):]])
    assert len(gelesen) == 13, gelesen          # 12 + test_daten
    assert sum(1 for z in aus.splitlines() if z.startswith("::warning::Tor-Befund")) <= 5


def test_ein_heute_behobener_befund_haelt_den_guardian_nicht_rot():
    stehend = [{"befund": B}, {"befund": "tests/nebenbereiche/unit/x.js"}]
    assert ZH.heute_noch_rot(stehend, set()) == [{"befund": "tests/nebenbereiche/unit/x.js"}]
    assert ZH.heute_noch_rot(stehend, {B}) == stehend
    assert ZH.heute_noch_rot(stehend, None) == stehend


def test_main_zaehlt_stehende_befunde_in_anzahl(tmp_path, monkeypatch, capsys):
    laeufe = {"w.yml": [_lauf(9, [B]), _lauf(8, [B])]}
    monkeypatch.setattr(ZH, "ablaeufe_mit_tor", lambda *a, **k: ["w.yml"])
    monkeypatch.setattr(ZH, "hole", lambda ablaeufe, anzahl: laeufe)
    monkeypatch.setattr(ZH, "geliefert", lambda dateien: {})
    ausgabe = tmp_path / "out"
    monkeypatch.setenv("GITHUB_OUTPUT", str(ausgabe))
    heute = tmp_path / "heute.txt"
    heute.write_text(B + "\n")
    monkeypatch.setenv("TOR_BEFUNDE_HEUTE", str(heute))
    assert ZH.main([]) == 0
    assert "anzahl=1" in ausgabe.read_text()
    assert "Tor-Befund steht" in capsys.readouterr().out
    heute.write_text("")                                   # heute gruen -> 0
    ausgabe.write_text("")
    ZH.main([])
    assert "anzahl=0" in ausgabe.read_text()


def test_ein_gestorbener_js_prozess_ist_kein_befund_sondern_sperrt(tmp_path):
    """Pruefagent Runde 2 / eigene Messung (09.11.2026): node meldet
    process.exit/OOM/fehlendes Modul als '# fail 1' — der Runner muss das
    als 'abgebrochen' ausgeben, sonst waere es ein durchgelassener Befund."""
    import subprocess
    import tor_sperrliste as TS
    d = tmp_path / "w"
    (d / "tests" / "unit").mkdir(parents=True)
    (d / "tests" / "unit" / "test-tot.js").write_text("require('gibt-es-nicht');\n")
    # Der Runner wechselt in sein eigenes Wurzelverzeichnis — also eine Kopie.
    (d / "scripts").mkdir()
    import shutil
    shutil.copy(os.path.join(WURZEL, "scripts", "run-js-unit-tests.sh"), d / "scripts")
    r = subprocess.run(["bash", str(d / "scripts" / "run-js-unit-tests.sh"), "tests/unit"],
                       cwd=d, capture_output=True, text=True, timeout=60)
    o = tmp_path / "prot"
    o.mkdir()
    (o / "js-kern.log").write_text(r.stdout + r.stderr)
    (o / "js-kern.rc").write_text(f"{r.returncode}\n")
    sperrend, befunde, unlesbar = TS.einordnen(str(o))
    assert unlesbar, r.stdout
