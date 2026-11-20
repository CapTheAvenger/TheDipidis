"""Das Messwerkzeug fuer SC-7 (29.09.2026) — ausgefuehrt, nicht gelesen.

scripts/simuliere_setwechsel.py stellt den Stand her, den der erste
Wochenlauf nach einem neuen Set schreibt; .github/workflows/
setwechsel-probe.yml faehrt die Kern-Suiten dagegen. Geprueft wird hier:
1. es verweigert den echten Repo-Baum (es schreibt Daten um),
2. die Quelle wird so umbeschriftet wie bei Limitless: Turniere NACH dem
   Erscheinen tragen den neuen Schluessel, ihre Karten- und Matchupzeilen
   wandern in die Dateien des neuen Formats, der Rest bleibt,
3. der automatisch gewaehlte Tag laesst genug Turniere fuer den
   Ankerriegel uebrig und liegt nach dem laufenden Set.
"""
import json
import os
import sys

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(WURZEL, "scripts"))

import simuliere_setwechsel as sim  # noqa: E402


def test_der_echte_baum_wird_verweigert(capsys):
    assert sim.main([WURZEL, "--datum", "2026-01-01"]) == 2
    assert "nur in einer Kopie" in capsys.readouterr().out


def _baum(tmp_path):
    d = tmp_path / "data"
    d.mkdir()
    (d / "format_window.json").write_text(json.dumps(
        {"current_set": "AAA", "oldest_legal_set": "TEF", "set_release_date": "2026-09-01"}))
    kopf_t = "tournament_id;date;meta;players"
    (d / "online_api_tournaments.csv").write_text("\n".join([
        kopf_t, "t1;2026-09-05;TEF-AAA;10", "t2;2026-09-10;TEF-AAA;10",
        "t3;2026-09-11;TEF-AAA;10", "t4;2026-09-12;TEF-AAA;10",
        "t0;2026-08-20;TEF-OLD;10"]) + "\n")
    (d / "online_api_archetypes.csv").write_text("\n".join([
        "tournament_id;date;meta;archetype_id", "t1;2026-09-05;TEF-AAA;x",
        "t3;2026-09-11;TEF-AAA;y"]) + "\n")
    for art in ("cards", "matchups"):
        (d / f"online_api_{art}_TEF-AAA.csv").write_text("\n".join([
            "tournament_id;date;meta;wert", "t1;2026-09-05;TEF-AAA;1",
            "t3;2026-09-11;TEF-AAA;2", "t4;2026-09-12;TEF-AAA;3"]) + "\n")
    return d


def test_die_quelle_wird_wie_bei_limitless_umbeschriftet(tmp_path):
    d = _baum(tmp_path)
    n = sim.quelle_umbeschriften(str(d), "TEF-AAA", "TEF-ZZN", "2026-09-10")
    assert n == 2, "t3 und t4 liegen nach dem Erscheinen"
    _, t = sim._csv(str(d / "online_api_tournaments.csv"))
    meta = {z["tournament_id"]: z["meta"] for z in t}
    assert meta == {"t1": "TEF-AAA", "t2": "TEF-AAA", "t3": "TEF-ZZN",
                    "t4": "TEF-ZZN", "t0": "TEF-OLD"}
    _, alt = sim._csv(str(d / "online_api_cards_TEF-AAA.csv"))
    _, neu = sim._csv(str(d / "online_api_cards_TEF-ZZN.csv"))
    assert [z["tournament_id"] for z in alt] == ["t1"]
    assert [(z["tournament_id"], z["meta"]) for z in neu] == [("t3", "TEF-ZZN"), ("t4", "TEF-ZZN")]


def test_der_automatische_tag_traegt_den_ankerriegel(tmp_path):
    _baum(tmp_path)
    tag = sim.auto_datum(str(tmp_path), mindestens=3)
    assert tag == "2026-09-05", tag
    assert tag > "2026-09-01"


def test_stdout_traegt_nur_die_ergebniszeile(tmp_path, capsys, monkeypatch):
    """setwechsel-probe.yml liest stdout als JSON (30.09.2026: die erste
    Probe scheiterte am Protokoll von update_sets.py davor). Ausgefuehrt:
    ein setwechsel(), der wie update_sets.py protokolliert."""
    def laut(baum, en, jp, datum):
        print("[Update Sets] + New set ZZN (2026-09-28) -> order 162")
        return {"current_set": en, "current_set_jp": jp}
    monkeypatch.setattr(sim, "setwechsel", laut)
    assert sim.main([str(tmp_path), "--datum", "2026-09-28"]) == 0
    aus = capsys.readouterr()
    assert json.loads(aus.out)["datum"] == "2026-09-28"
    assert "[Update Sets]" in aus.err


# --- SC-53 (10.11.2026): junges laufendes Format ---------------------------

def _stand(d, tag):
    (d / "data_stand.json").write_text(json.dumps({"erzeugt_am": tag + "T08:00:00+00:00"}))


def test_junges_laufendes_format_ueberspringt_die_en_probe_benannt(tmp_path, capsys, monkeypatch):
    """Probe zu PR #1041: DLR war 4 Tage alt, das erfundene Set lag 2 Tage
    dahinter — fuenf Zusicherungen fielen an einem Setwechsel, den es so nie
    gibt. Jetzt: benannt uebersprungen, setwechsel() laeuft gar nicht."""
    d = _baum(tmp_path)
    _stand(d, "2026-09-05")
    gelaufen = []
    monkeypatch.setattr(sim, "setwechsel", lambda *a: gelaufen.append(a) or {})
    assert sim.main([str(tmp_path)]) == 0
    erg = json.loads(capsys.readouterr().out)
    assert "uebersprungen" in erg and "4 Tag(e) alt" in erg["uebersprungen"]
    assert "wieder ab 2026-09-29" in erg["uebersprungen"]
    assert gelaufen == []


def test_ab_tag_28_laeuft_die_probe_wieder(tmp_path):
    d = _baum(tmp_path)
    _stand(d, "2026-09-28")
    assert sim.laufendes_format_zu_jung(str(tmp_path)) is not None
    _stand(d, "2026-09-29")
    assert sim.laufendes_format_zu_jung(str(tmp_path)) is None


def test_jp_probe_und_festes_datum_werden_nie_uebersprungen(tmp_path, capsys, monkeypatch):
    d = _baum(tmp_path)
    _stand(d, "2026-09-05")
    monkeypatch.setattr(sim, "setwechsel", lambda b, en, jp, datum: {"current_set": en,
                                                                     "current_set_jp": jp})
    assert sim.main([str(tmp_path), "--en", ""]) == 0
    assert "uebersprungen" not in json.loads(capsys.readouterr().out)
    assert sim.main([str(tmp_path), "--datum", "2026-09-04"]) == 0
    assert "uebersprungen" not in json.loads(capsys.readouterr().out)


def test_der_ablauf_laesst_schritt_1_und_2_nur_bei_einer_probe_laufen():
    import yaml
    wf = yaml.safe_load(open(os.path.join(WURZEL, ".github", "workflows", "setwechsel-probe.yml"),
                             encoding="utf-8"))
    schritte = {s.get("name", ""): s for s in wf["jobs"]["probe"]["steps"]}
    assert "uebersprungen" in schritte["Wegwerf-Baeume mit neuem Set"]["run"]
    for n in ("1 — neues EN-Set, am Tag danach", "2 — dasselbe 30 Tage spaeter"):
        assert "steps.baeume.outputs.en == 'probe'" in schritte[n]["if"], n
    assert "outputs.en" not in str(schritte["3 — nur ein neues JP-Set"].get("if", ""))


def test_schritt_2_haelt_die_dateizeiten_echt_und_der_aufbau_verliert_keinen_fehler():
    import yaml
    wf = yaml.safe_load(open(os.path.join(WURZEL, ".github", "workflows", "setwechsel-probe.yml"),
                             encoding="utf-8"))
    schritte = {s.get("name", ""): s for s in wf["jobs"]["probe"]["steps"]}
    assert "NO_FAKE_STAT=1" in schritte["2 — dasselbe 30 Tage spaeter"]["run"]
    assert "set -eo pipefail" in schritte["Wegwerf-Baeume mit neuem Set"]["run"]


def test_ein_jp_deckset_ist_fuer_die_probe_kein_en_set(tmp_path):
    """WZ-51 (20.11.2026): sets_metadata.json fuehrt EN- und JP-Codes. Seit
    dem JP-Deckset MG (13.11.) war MG dort das juengste — die Probe hielt es
    fuer das neue EN-Set, der Ankerriegel lehnte ab, Probe rot (PR #1050).
    Ausgefuehrt mit dem echten update_sets an einem gesetzten Formatfenster."""
    import importlib
    sys.path.insert(0, os.path.join(WURZEL, "backend", "core"))
    us = importlib.import_module("update_sets")
    d = tmp_path / "data"
    d.mkdir()
    (d / "format_window.json").write_text(json.dumps({
        "current_set": "DLR", "set_release_date": "2026-11-06",
        "neuestes_set": "DLR", "neuestes_set_release_date": "2026-11-06",
        "current_set_jp": "M6A", "jp_release_date": "2026-09-16"}))
    (d / "sets_metadata.json").write_text(json.dumps({
        "DLR": {"order": 160, "release_date": "2026-11-06"},
        "MG": {"order": 161, "release_date": "2026-11-13"}}))
    daten = sim.en_erscheinungsdaten(us, str(d), "", "2026-11-17")
    assert "MG" not in daten
    # Gegen den EN-Rueckfall selbst, nicht gegen ein festes Kuerzel — sonst
    # faellt der Test, sobald der Grundstock ein neueres EN-Set kennt.
    assert us._pick_current_set(daten) == us._pick_current_set(
        us.rueckfall_release_dates(str(d))) != "MG"
    assert sim.en_erscheinungsdaten(us, str(d), "ZZN", "2026-11-17")["ZZN"] == "2026-11-17"


def test_die_probe_waehlt_das_format_mit_den_en_daten(tmp_path, monkeypatch):
    """Die Aufrufstelle: wochenlauf_update_sets gibt write_format_window genau
    das, was en_erscheinungsdaten liefert (Prueffund 20.11.: der Test oben
    prueft nur den Helfer). Gemessen mit einer Attrappe, die den Lauf an
    write_format_window anhaelt — kein Netz, kein Schreiben ins Formatfenster."""
    import shutil
    b = tmp_path / "baum"
    (b / "backend" / "core").mkdir(parents=True)
    (b / "data").mkdir()
    for f in ("update_sets.py", "turnier_legalitaet.py", "card_scraper_shared.py"):
        q = os.path.join(WURZEL, "backend", "core", f)
        if os.path.exists(q):
            shutil.copy(q, b / "backend" / "core" / f)
    (b / "data" / "format_window.json").write_text(json.dumps({
        "current_set": "DLR", "set_release_date": "2026-11-06",
        "current_set_jp": "M6A", "jp_release_date": "2026-09-16"}))
    (b / "data" / "sets_metadata.json").write_text(json.dumps({
        "DLR": {"order": 160, "release_date": "2026-11-06"},
        "MG": {"order": 161, "release_date": "2026-11-13"}}))
    (b / "data" / "sets.json").write_text(json.dumps({"DLR": 160, "MG": 161}))
    MARKE = {"PROBE": "2026-11-17"}
    monkeypatch.setattr(sim, "en_erscheinungsdaten", lambda *a, **k: dict(MARKE))
    gesehen = {}

    class Halt(Exception):
        pass

    import importlib
    echt = importlib.import_module

    def import_mit_attrappe(name, *a, **k):
        mod = echt(name, *a, **k)
        if name == "update_sets":
            def wfw(meta, en_release_dates=None, jp_release_dates=None):
                gesehen["en"] = en_release_dates
                raise Halt()
            monkeypatch.setattr(mod, "write_format_window", wfw)
        return mod

    monkeypatch.setattr(sim.importlib, "import_module", import_mit_attrappe)
    try:
        sim.wochenlauf_update_sets(str(b), "", "M7Z", "2026-11-17")
    except Halt:
        pass
    assert gesehen.get("en") == MARKE, gesehen
