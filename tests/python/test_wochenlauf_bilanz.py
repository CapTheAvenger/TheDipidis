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
import textwrap

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
WOCHENLAUF = os.path.join(WURZEL, ".github", "workflows", "weekly-full-update.yml")
CHAMPIONS = os.path.join(WURZEL, ".github", "workflows",
                         "champions-replica-scrape.yml")

# Bewusst ohne PyYAML — die CI installiert nur pytest, beautifulsoup4,
# requests und lxml (deploy-pages.yml). Ein `import yaml` bricht pytest
# schon in der Sammlung mit Exit-Code 2 ab, und weil der Deploy am
# Test-Job haengt, blockiert ausgerechnet der Waechter den Deploy, den er
# schuetzen soll. Dieselbe Falle steht in test_deploy_dispatch.py
# beschrieben; gemessen wieder am 21.08.2026, Run 32532643519.


def _schritte_lesen(pfad):
    """Die Schritte eines Workflows als [{name, run, if}] — von Hand.

    Reicht fuer diesen Zweck vollstaendig aus: die Datei ist mit festen
    zwei Leerzeichen je Ebene geschrieben, und gebraucht werden nur der
    Name, der `run`-Block und ein etwaiges `if`.
    """
    with open(pfad, encoding="utf-8") as f:
        zeilen = f.read().splitlines()

    schritte = []
    aktuell = None
    run_einzug = None

    for zeile in zeilen:
        nackt = zeile.strip()
        treffer_name = re.match(r"^(\s*)-\s+name:\s*(.+?)\s*$", zeile)
        if treffer_name:
            if aktuell:
                schritte.append(aktuell)
            aktuell = {"name": treffer_name.group(2).strip().strip("'\""),
                       "run": "", "if": None,
                       "_einzug": len(treffer_name.group(1))}
            run_einzug = None
            continue
        if aktuell is None:
            continue

        if run_einzug is not None:
            # Innerhalb eines run-Blocks: alles, was tiefer eingerueckt ist
            # als der Schluessel selbst, gehoert dazu.
            if nackt == "" or (len(zeile) - len(zeile.lstrip())) > run_einzug:
                aktuell["run"] += zeile + "\n"
                continue
            run_einzug = None

        treffer_run = re.match(r"^(\s*)run:\s*\|\s*$", zeile)
        if treffer_run:
            run_einzug = len(treffer_run.group(1))
            continue
        treffer_if = re.match(r"^\s*if:\s*(.+?)\s*$", zeile)
        if treffer_if:
            aktuell["if"] = treffer_if.group(1).strip()
            continue

    if aktuell:
        schritte.append(aktuell)

    for s in schritte:
        s["run"] = textwrap.dedent(s["run"])
    return schritte

# champions_replica_scraper stand hier bis zum 25.08.2026 mit drin.
# Seitdem laeuft er in diesem Workflow gar nicht mehr: er lief hier mit
# --top 20, waehrend champions-replica-scrape.yml ihn taeglich mit
# --top 40 startet, und ueberschrieb Stunden spaeter das breitere
# Ergebnis mit dem schmaleren (18.08. 96->86, 21.08. 66->53, 22.08.
# 62->48, 25.08. 60->46). Ein Schritt, den es nicht gibt, kann auch
# nicht stillschweigend scheitern — die Regel bleibt fuer die drei
# uebrigen unveraendert scharf. Dass er nicht zurueckkehrt, haelt
# test_champions_nur_ein_scraper.py fest.
NICHT_BLOCKIEREND = (
    "scrapers/labs_tournament_scraper.py",
    "scrapers/player_continuity_scraper.py",
    "scrapers/per_decklist_scraper.py",
)


@pytest.fixture(scope="module")
def schritte():
    gelesen = _schritte_lesen(WOCHENLAUF)
    assert len(gelesen) > 5, f"nur {len(gelesen)} Schritte gelesen — Parser pruefen"
    return gelesen


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
    assert str(bilanz.get("if") or "").strip() == "always()", (
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
        "FAIL scrapers/player_continuity_scraper.py (rc=2)\n",
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


# ── Derselbe Befund, ein Workflow weiter (05.09.2026) ──────────────────
#
# Was am 21.08.2026 im Wochenlauf repariert wurde, stand in
# champions-replica-scrape.yml unveraendert weiter: ACHT Schritte mit
# `set +e ... exit 0`, jeder mit einer ::warning::-Zeile und sonst
# nichts. Der Lauf laeuft naechtlich; acht Dateien konnten also Nacht
# fuer Nacht still alt werden, ohne dass ein Lauf rot wurde.
#
# Aufgefallen ist es ueber einen zweiten Fehler im selben Workflow:
# champions_speed_corpus.json wurde gebaut, nach data/ kopiert und dann
# weggeworfen, weil sie in der `git add`-Liste fehlte. Zehn Tage lang
# lieferte der Lauf einen Stand vom 25.08. aus. Beide Fehler haben
# dieselbe Form — etwas passiert, und niemand fuehrt Buch darueber.

CHAMPIONS_NICHT_BLOCKIEREND = (
    "scrapers/champions_replica_scraper.py",
    "scripts/scrape_de_names.py",
    "scripts/scrape_champions_items.py",
    "scripts/build_champions_resources.py",
    "scripts/scrape_champions_roster.py",
    "scripts/scrape_champions_usage.py",
    "scripts/scrape_pokemonproxies.py",
    "scripts/build_champions_pokedex.py",
)


@pytest.fixture(scope="module")
def champions_schritte():
    gelesen = _schritte_lesen(CHAMPIONS)
    assert len(gelesen) > 5, f"nur {len(gelesen)} Schritte gelesen — Parser pruefen"
    return gelesen


@pytest.mark.parametrize("skript", CHAMPIONS_NICHT_BLOCKIEREND)
def test_champions_jeder_schritt_schreibt_seinen_rueckgabewert(
        champions_schritte, skript):
    treffer = [s for s in champions_schritte if skript in (s.get("run") or "")]
    assert treffer, f"{skript} kommt im champions-Lauf nicht vor"
    for s in treffer:
        lauf = s["run"]
        assert "rc_extra.txt" in lauf, (
            f"{skript}: der Rueckgabewert landet in keiner Bilanz")
        assert f"FAIL {skript}" in lauf, (
            f"{skript}: kein FAIL-Eintrag fuer die Bilanz")
        assert f"OK   {skript}" in lauf, (
            f"{skript}: kein OK-Eintrag — dann sieht 'lief nie' aus wie "
            f"'lief gut'")


@pytest.mark.parametrize("skript", CHAMPIONS_NICHT_BLOCKIEREND)
def test_champions_der_rueckgabewert_wird_vor_dem_aufraeumen_gelesen(
        champions_schritte, skript):
    """`$?` nach dem `git checkout` waere der rc von git, nicht der des Skripts.

    Die Wiederherstellung der committeten Datei steht in sieben der acht
    Schritte ZWISCHEN dem Aufruf und der Meldung. Wer dort `$?` liest,
    protokolliert den Rueckgabewert von `git checkout` — und der ist
    praktisch immer 0. Die Bilanz sagte dann "OK" ueber einen Schritt,
    der gerade gescheitert ist. Deshalb: rc einmal direkt nach dem
    Aufruf sichern, danach nur noch `$rc` verwenden.
    """
    s = [x for x in champions_schritte if skript in (x.get("run") or "")][0]
    lauf = s["run"]
    aufruf = max(lauf.index("python -u " + skript) if "python -u " + skript in lauf
                 else lauf.index(skript), 0)
    rest = lauf[aufruf:]
    assert "rc=$?" in rest, f"{skript}: der Rueckgabewert wird nicht gesichert"
    # Nach dem Sichern darf kein nacktes "$?" mehr vorkommen.
    nach = rest[rest.index("rc=$?") + len("rc=$?"):]
    assert '"$?"' not in nach, (
        f"{skript}: nach rc=$? wird noch einmal $? gelesen — das ist der "
        f"Rueckgabewert des dazwischenliegenden Befehls")


def test_champions_es_gibt_einen_auswertenden_schritt(champions_schritte):
    bilanz = [s for s in champions_schritte
              if "rc_extra.txt" in (s.get("run") or "")
              and "GITHUB_STEP_SUMMARY" in (s.get("run") or "")]
    assert bilanz, "kein Schritt wertet die Bilanz aus"
    lauf = bilanz[0]["run"]
    assert "::error::" in lauf, "ein Reihenausfall faerbt den Lauf nicht rot"
    assert "_job_heartbeats.json" in lauf
    assert str(bilanz[0].get("if") or "").strip() == "always()", (
        "ohne if: always() faellt die Bilanz genau dann aus, wenn man sie "
        "am dringendsten braucht")


def test_champions_bilanzschritt_ist_ausfuehrbar(champions_schritte, tmp_path):
    bilanz = [s for s in champions_schritte
              if "rc_extra.txt" in (s.get("run") or "")
              and "GITHUB_STEP_SUMMARY" in (s.get("run") or "")][0]
    skript = tmp_path / "bilanz.sh"
    skript.write_text(bilanz["run"], encoding="utf-8")
    (tmp_path / "tmp").mkdir()
    (tmp_path / "data").mkdir()
    (tmp_path / "tmp" / "rc_extra.txt").write_text(
        "OK   scrapers/champions_replica_scraper.py\n"
        "FAIL scripts/scrape_de_names.py (rc=1)\n"
        "FAIL scripts/scrape_champions_usage.py (rc=2)\n",
        encoding="utf-8")
    umgebung = dict(os.environ,
                    RUNNER_TEMP=str(tmp_path / "tmp"),
                    GITHUB_STEP_SUMMARY=str(tmp_path / "summary.md"))
    ergebnis = subprocess.run(["bash", str(skript)], cwd=tmp_path,
                              capture_output=True, text=True, env=umgebung)
    assert ergebnis.returncode == 0, ergebnis.stderr
    assert "::error::" in ergebnis.stdout, ergebnis.stdout
    import json
    stand = json.loads((tmp_path / "data" / "_job_heartbeats.json")
                       .read_text(encoding="utf-8"))
    assert stand["scrapers/champions_replica_scraper.py"]["status"] == "OK"
    assert stand["scripts/scrape_de_names.py"]["status"] == "FAIL"


def test_champions_der_speed_korpus_wird_auch_committet(champions_schritte):
    """BEFUND 05.09.2026: gebaut, kopiert — und nie committet.

    `champions_speed_corpus.json` entsteht im Scraper-Schritt, wird im
    Schritt "Copy output back to data/" nach data/ kopiert und fehlte
    dann in der `git add`-Liste. Der Lauf committete jede Nacht die
    uebrigen neun Dateien und warf diese eine weg; ausgeliefert war
    zuletzt ein Stand vom 25.08.2026 aus dem Wochenlauf.

    Die Regel dahinter ist allgemein: was der Lauf nach data/ kopiert,
    muss er auch committen — sonst ist die Arbeit weg, und zwar
    lautlos.
    """
    kopieren = [s for s in champions_schritte
                if "cp " in (s.get("run") or "") and "data/" in (s.get("run") or "")]
    commit = [s for s in champions_schritte if "git add" in (s.get("run") or "")]
    assert commit, "kein Commit-Schritt gefunden"
    committet = "\n".join(s["run"] for s in commit)

    kopiert = set()
    for s in kopieren:
        for zeile in s["run"].splitlines():
            zeile = zeile.strip()
            if zeile.startswith("cp ") and " data/" in zeile:
                ziel = zeile.split()[-1]
                if ziel.startswith("data/"):
                    kopiert.add(ziel)
    assert "data/champions_speed_corpus.json" in kopiert, (
        "der Speed-Korpus wird nicht mehr nach data/ kopiert — dann ist "
        "dieser Waechter stumpf geworden und gehoert angepasst")
    fehlend = sorted(z for z in kopiert if z not in committet)
    assert not fehlend, (
        "nach data/ kopiert, aber nie committet: " + ", ".join(fehlend))

