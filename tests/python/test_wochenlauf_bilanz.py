"""Vier Schritte des Wochenlaufs konnten nicht scheitern.

BEFUND (21.08.2026): labs_tournament_scraper, player_continuity_scraper,
per_decklist_scraper und champions_replica_scraper endeten alle mit
einem bedingungslosen `exit 0`. Ihr Rueckgabewert wurde in einer
::warning::-Zeile erwaehnt und danach fallengelassen. Vier Schritte
konnten also wochenlang jede Woche scheitern, waehrend der Lauf gruen
blieb und die zugehoerigen Dateien still alt wurden — genau der Zustand,
in dem tournament_jh_scraped.json seit dem 16.06. steht.

Nicht blockierend sollen sie bleiben (ihre Ausgaben sind im Frontend
optional). Aber sie fuehren jetzt Buch: jeder Schritt schreibt OK oder
FAIL in eine Bilanzdatei, ein eigener Schritt wertet sie aus und legt
den Stand zusaetzlich in data/_job_heartbeats.json ab.
"""

import os
import re
import subprocess

import pytest
import yaml

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
WOCHENLAUF = os.path.join(WURZEL, ".github", "workflows", "weekly-full-update.yml")

NICHT_BLOCKIEREND = (
    "scrapers/labs_tournament_scraper.py",
    "scrapers/player_continuity_scraper.py",
    "scrapers/per_decklist_scraper.py",
    "scrapers/champions_replica_scraper.py",
)


@pytest.fixture(scope="module")
def schritte():
    with open(WOCHENLAUF, encoding="utf-8") as f:
        daten = yaml.safe_load(f)
    return daten["jobs"]["scrape"]["steps"]


@pytest.mark.parametrize("skript", NICHT_BLOCKIEREND)
def test_jeder_schritt_schreibt_seinen_rueckgabewert(schritte, skript):
    treffer = [s for s in schritte if skript in (s.get("run") or "")]
    assert treffer, f"{skript} kommt im Wochenlauf nicht vor"
    for s in treffer:
        lauf = s["run"]
        assert "rc_extra.txt" in lauf, (
            f"{skript}: der Rueckgabewert landet in keiner Bilanz")
        assert f"FAIL {skript}" in lauf, (
            f"{skript}: kein FAIL-Eintrag fuer die Bilanz")
        assert f"OK   {skript}" in lauf, (
            f"{skript}: kein OK-Eintrag — dann sieht 'lief nie' aus wie "
            f"'lief gut'")


def test_es_gibt_einen_auswertenden_schritt(schritte):
    bilanz = [s for s in schritte if "rc_extra.txt" in (s.get("run") or "")
              and "GITHUB_STEP_SUMMARY" in (s.get("run") or "")]
    assert bilanz, "kein Schritt wertet die Bilanz aus"
    lauf = bilanz[0]["run"]
    assert "::error::" in lauf, "ein Reihenausfall faerbt den Lauf nicht rot"
    assert "_job_heartbeats.json" in lauf


def test_die_bilanz_laeuft_auch_wenn_vorher_etwas_schiefging(schritte):
    bilanz = [s for s in schritte if "rc_extra.txt" in (s.get("run") or "")
              and "GITHUB_STEP_SUMMARY" in (s.get("run") or "")][0]
    assert str(bilanz.get("if", "")).strip() == "always()", (
        "ohne if: always() faellt die Bilanz genau dann aus, wenn man sie "
        "am dringendsten braucht")


def test_bilanzschritt_ist_ausfuehrbar(schritte, tmp_path):
    """Nicht nur vorhanden — er muss auch laufen."""
    bilanz = [s for s in schritte if "rc_extra.txt" in (s.get("run") or "")
              and "GITHUB_STEP_SUMMARY" in (s.get("run") or "")][0]
    skript = tmp_path / "bilanz.sh"
    skript.write_text(bilanz["run"], encoding="utf-8")
    (tmp_path / "tmp").mkdir()
    (tmp_path / "data").mkdir()
    (tmp_path / "tmp" / "rc_extra.txt").write_text(
        "OK   scrapers/labs_tournament_scraper.py\n"
        "FAIL scrapers/per_decklist_scraper.py (rc=1)\n"
        "FAIL scrapers/champions_replica_scraper.py (rc=2)\n",
        encoding="utf-8")
    umgebung = dict(os.environ,
                    RUNNER_TEMP=str(tmp_path / "tmp"),
                    GITHUB_STEP_SUMMARY=str(tmp_path / "summary.md"))
    ergebnis = subprocess.run(["bash", str(skript)], cwd=tmp_path,
                              capture_output=True, text=True, env=umgebung)
    assert ergebnis.returncode == 0, ergebnis.stderr
    assert "::error::" in ergebnis.stdout, ergebnis.stdout
    herz = tmp_path / "data" / "_job_heartbeats.json"
    assert herz.is_file(), "kein Herzschlag geschrieben"
    import json
    stand = json.loads(herz.read_text(encoding="utf-8"))
    assert stand["scrapers/labs_tournament_scraper.py"]["status"] == "OK"
    assert stand["scrapers/per_decklist_scraper.py"]["status"] == "FAIL"
    assert "zuletzt_erfolgreich" not in stand["scrapers/per_decklist_scraper.py"]


def test_ein_einzelner_ausfall_bleibt_eine_warnung(schritte, tmp_path):
    bilanz = [s for s in schritte if "rc_extra.txt" in (s.get("run") or "")
              and "GITHUB_STEP_SUMMARY" in (s.get("run") or "")][0]
    skript = tmp_path / "bilanz.sh"
    skript.write_text(bilanz["run"], encoding="utf-8")
    (tmp_path / "tmp").mkdir()
    (tmp_path / "tmp" / "rc_extra.txt").write_text(
        "FAIL scrapers/per_decklist_scraper.py (rc=1)\n", encoding="utf-8")
    umgebung = dict(os.environ,
                    RUNNER_TEMP=str(tmp_path / "tmp"),
                    GITHUB_STEP_SUMMARY=str(tmp_path / "summary.md"))
    ergebnis = subprocess.run(["bash", str(skript)], cwd=tmp_path,
                              capture_output=True, text=True, env=umgebung)
    assert "::warning::" in ergebnis.stdout
    assert "::error::" not in ergebnis.stdout
