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
