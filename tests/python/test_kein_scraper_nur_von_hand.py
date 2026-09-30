"""Kein Scraper, der nur laeuft, wenn jemand einen Knopf drueckt.

Hausi, 30.09.2026: „Die sieben Scraper, die du von Hand startest —> ich
will eigentlich keine Scraper von Hand starten. Es soll alles automatisch
laufen."

Gemessen am selben Tag (data/_job_heartbeats.json nach Wochenlauf #173):
vier der sieben Handlaeufe fahren Scraper, die der Wochenlauf ohnehin
Di/Fr faehrt — City League (vier Scraper), Kartentexte, Online-
Einzellisten, Spielerkontinuitaet, alle mit Herzschlag „OK" vom
30.09.2026 16:12 UTC. Ihre eigenen Ablaeufe sind Reserveknoepfe, keine
Pflicht. „Daten reparieren" faehrt seit DA-22 der Wochenlauf selbst
(scripts/repariere_ace_spec.py --schreiben). pokepricelab-verify hat seit
30.09. einen Zeitplan.

Geprueft wird die REGEL, nicht die Liste von heute: jedes Python-Skript,
das ein Ablauf OHNE Zeitplan startet, muss auch in einem Ablauf MIT
Zeitplan vorkommen — oder hier mit Grund als Ausnahme stehen. Wer einen
neuen Scraper nur als Knopf baut, faellt hier um.
"""
import os
import re

import yaml

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ABLAEUFE = os.path.join(WURZEL, ".github", "workflows")

# Ablauf -> warum er nur von Hand laeuft. Jede Zeile ist eine Entscheidung.
NUR_VON_HAND = {
    "probe-cardmarket-expansions.yml": "Messwerkzeug, kein Scraper — einmalige Probe",
    "probe-pokepricelab.yml": "Messwerkzeug, kein Scraper — einmalige Probe",
    "schriften-spiegeln.yml": "Schriftdateien, keine Daten; laeuft nur, wenn eine Schrift dazukommt",
    "pokepricelab-index.yml": (
        "SC-12 (Backlog): pokepricelab.com liefert die Sitemap zur Zeit nicht "
        "vollstaendig (#4 nach 60 min, #5 nach 120 min abgebrochen). Ein Zeitplan "
        "erzeugte jede Woche einen roten Lauf. Bekommt seinen Zeitplan mit dem "
        "Etappenabruf aus SC-12."),
}


def _ohne_kommentare(text):
    return "\n".join(z for z in str(text).splitlines() if not z.lstrip().startswith("#"))


def _ausloeser(y):
    on = y.get(True, y.get("on")) or {}
    if isinstance(on, str):
        return {on}
    return set(on)


def _laeufe(y):
    return _ohne_kommentare("\n".join(
        str(s.get("run", "")) for j in (y.get("jobs") or {}).values() for s in (j.get("steps") or [])))


def gestartete_skripte(run):
    """Was ein Ablauf mit python startet (Basisname)."""
    return {os.path.basename(p) for p in re.findall(r"python3?\s+(?:-u\s+)?([\w./-]+\.py)", run)}


def erwaehnte_skripte(run):
    """Was ein Ablauf ueberhaupt nennt — der Wochenlauf startet seine
    Scraper in einer Schleife ueber eine Liste von Pfaden."""
    return {os.path.basename(p) for p in re.findall(r"([\w./-]+\.py)", run)}


def befunde(ablaeufe):
    """ablaeufe: {name: yaml}. Gibt {Ablauf: [Skripte ohne Zeitplan]}."""
    automatisch = set()
    for y in ablaeufe.values():
        if _ausloeser(y) & {"schedule", "workflow_run"}:
            automatisch |= erwaehnte_skripte(_laeufe(y))
    aus = {}
    for name, y in ablaeufe.items():
        if _ausloeser(y) & {"schedule", "workflow_run", "push", "pull_request"}:
            continue
        if name in NUR_VON_HAND:
            continue
        fehlt = sorted(gestartete_skripte(_laeufe(y)) - automatisch)
        if fehlt:
            aus[name] = fehlt
    return aus


def _alle():
    aus = {}
    for n in sorted(os.listdir(ABLAEUFE)):
        if n.endswith(".yml"):
            with open(os.path.join(ABLAEUFE, n), encoding="utf-8") as f:
                aus[n] = yaml.safe_load(f)
    return aus


def test_jeder_scraper_laeuft_auch_ohne_knopfdruck():
    b = befunde(_alle())
    assert not b, (
        "Diese Skripte laufen nur, wenn jemand den Knopf drueckt — Zeitplan "
        "geben, in den Wochenlauf nehmen oder in NUR_VON_HAND begruenden: %s" % b)


def test_die_ausnahmen_gibt_es_noch():
    """Eine Ausnahme fuer einen Ablauf, den es nicht mehr gibt, oder der
    inzwischen einen Zeitplan hat, ist eine tote Zeile."""
    alle = _alle()
    for n in NUR_VON_HAND:
        assert n in alle, "%s steht in NUR_VON_HAND, gibt es aber nicht" % n
        assert "schedule" not in _ausloeser(alle[n]), "%s hat jetzt einen Zeitplan — Ausnahme streichen" % n


def test_die_handlaeufe_vom_30_09_laufen_automatisch():
    """Die sieben, die am 30.09.2026 von Hand gestartet wurden."""
    alle = _alle()
    auto = set()
    for y in alle.values():
        if _ausloeser(y) & {"schedule"}:
            auto |= erwaehnte_skripte(_laeufe(y))
    for skript in ("city_league_analysis_scraper.py", "city_league_archetype_scraper.py",
                   "scrape_kartentexte.py", "limitless_online_decklist_scraper.py",
                   "player_continuity_scraper.py", "repariere_ace_spec.py",
                   "verify_via_pokepricelab.py"):
        assert skript in auto, "%s laeuft nicht automatisch" % skript


def test_die_pruefung_beisst():
    """Verfaelschungsprobe: ein neuer Scraper nur mit Knopf faellt auf,
    derselbe mit Zeitplan nicht."""
    knopf = yaml.safe_load("on:\n  workflow_dispatch:\njobs:\n  j:\n    steps:\n"
                           "      - run: python backend/scrapers/neu_scraper.py\n")
    plan = yaml.safe_load("on:\n  schedule:\n    - cron: '0 1 * * *'\njobs:\n  j:\n    steps:\n"
                          "      - run: python3 -u backend/scrapers/neu_scraper.py --x\n")
    assert befunde({"neu.yml": knopf}) == {"neu.yml": ["neu_scraper.py"]}
    assert befunde({"neu.yml": knopf, "plan.yml": plan}) == {}
