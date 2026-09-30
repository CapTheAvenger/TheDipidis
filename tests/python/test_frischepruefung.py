"""Die Frischepruefung trennt "lief nicht" von "Quelle hat nichts Neues".

WARUM ES DIESE DATEI GIBT
-------------------------
Frage des Betreibers am 10.09.2026: „Erledigt der Lauf eigentlich
wirklich alle Scraper, oder sind danach irgendwelche Daten noch nicht
auf dem aktuellsten Stand?"

Sie liess sich nicht beantworten. Vier City-League-Dateien sahen 41 Tage
alt aus — und das kann zweierlei heissen. Nachgesehen im Browser stand
auf limitlesstcg.com/tournaments/jp: „The current City League season has
concluded". Die Scraper liefen also, die Quelle war leer. Kein Fehler.

Gleichzeitig war eine echte Luecke da: `limitless_online_decklist_scraper`
hatte ueberhaupt keinen Herzschlag, weil sein Ablauf keinen Zeitplan hat
und ihn niemand von Hand startete.

Die Pruefung muss beide Faelle auseinanderhalten — sonst meldet sie
entweder alles oder nichts. Genau das haelt diese Datei fest.
"""

import datetime as dt
import json
import os
import sys

import pytest

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(WURZEL, "scripts"))

import pruefe_frische as pf  # noqa: E402


@pytest.fixture
def daten(tmp_path, monkeypatch):
    monkeypatch.setattr(pf, "DATEN", str(tmp_path))
    return tmp_path


def _schreibe(ordner, herz, stand):
    (ordner / "_job_heartbeats.json").write_text(
        json.dumps(herz), encoding="utf-8")
    (ordner / "data_stand.json").write_text(
        json.dumps(stand), encoding="utf-8")


JETZT = dt.datetime(2026, 9, 10, 12, 0, tzinfo=dt.timezone.utc)


def _vor(tagen):
    return (JETZT - dt.timedelta(days=tagen)).isoformat().replace("+00:00", "Z")


def test_ein_erzeuger_ohne_herzschlag_ist_ein_befund(daten):
    """Der gemessene Fall: limitless_online_decklist_scraper."""
    _schreibe(daten, {}, {"dateien": {}})
    _, stille, _ = pf.pruefe(JETZT)
    namen = [j for j, _ in stille]
    assert "scrapers/limitless_online_decklist_scraper.py" in namen, (
        "ein Erzeuger ganz ohne Herzschlag faellt nicht auf — genau so "
        "lief der Online-Einzellisten-Scraper monatelang nie")
    assert len(stille) == len(pf.RHYTHMUS), (
        "ohne Herzschlagdatei muessten ALLE Erzeuger mit Zeitplan stumm "
        "sein")


def test_alles_frisch_meldet_nichts(daten):
    herz = {job: {"zuletzt_erfolgreich": _vor(0.2), "status": "OK"}
            for job in pf.RHYTHMUS}
    _schreibe(daten, herz, {"dateien": {}})
    _, stille, _ = pf.pruefe(JETZT)
    assert stille == [], f"frische Erzeuger melden sich trotzdem: {stille}"


def test_eine_stille_datei_allein_ist_kein_befund(daten):
    """Der City-League-Fall: Erzeuger frisch, Inhalt seit Wochen gleich."""
    herz = {job: {"zuletzt_erfolgreich": _vor(0.1), "status": "OK"}
            for job in pf.RHYTHMUS}
    stand = {"dateien": {"city_league_analysis.csv": _vor(41)}}
    _schreibe(daten, herz, stand)
    _, stille, _ = pf.pruefe(JETZT)
    assert stille == [], (
        "eine Datei, deren Quelle nichts Neues liefert, wird als Fehler "
        "gemeldet — dann meldet die Pruefung die japanische Saisonpause "
        "jede Woche")
    ruhig = pf.ruhige_dateien(JETZT)
    assert [n for _, n in ruhig] == ["city_league_analysis.csv"], (
        "die stille Datei wird gar nicht erst benannt — dann sieht "
        "niemand nach, ob es die Quelle oder der Scraper ist")


def test_taeglicher_erzeuger_darf_nicht_drei_tage_schweigen(daten):
    herz = {job: {"zuletzt_erfolgreich": _vor(0.1)} for job in pf.RHYTHMUS}
    herz["scrapers/champions_replica_scraper.py"] = {
        "zuletzt_erfolgreich": _vor(3)}
    _schreibe(daten, herz, {"dateien": {}})
    _, stille, _ = pf.pruefe(JETZT)
    assert [j for j, _ in stille] == ["scrapers/champions_replica_scraper.py"]


def test_der_di_fr_lauf_darf_uebers_wochenende_schweigen(daten):
    """Zwischen Freitag und Dienstag liegen vier Tage. Eine Frist von
    zwei Tagen haette jeden Montag gemeldet."""
    herz = {job: {"zuletzt_erfolgreich": _vor(4.2)} for job in pf.RHYTHMUS}
    for job, r in pf.RHYTHMUS.items():
        if r == "taeglich":
            herz[job] = {"zuletzt_erfolgreich": _vor(0.1)}
    _schreibe(daten, herz, {"dateien": {}})
    _, stille, _ = pf.pruefe(JETZT)
    assert stille == [], (
        f"der Montag nach dem Freitagslauf meldet: {stille}")


def test_bewusst_planlose_erzeuger_melden_nie(daten):
    _schreibe(daten, {}, {"dateien": {}})
    zeilen, stille, _ = pf.pruefe(JETZT)
    planlos = {job for _, job, rh, _, _ in zeilen if rh == "auf Zuruf"}
    assert planlos == set(pf.OHNE_ZEITPLAN)
    assert not (planlos & {j for j, _ in stille}), (
        "ein bewusst planloser Erzeuger meldet sich als Befund — dann "
        "warnt der Lauf jede Nacht wegen eines Erzeugers, der nie faellig ist")


def test_jeder_planlose_traegt_seine_begruendung():
    """Ohne Begruendung ist 'kein Zeitplan' eine Bequemlichkeit."""
    for job, grund in pf.OHNE_ZEITPLAN.items():
        assert len(grund) > 60, f"{job} steht ohne echte Begruendung da"


def test_der_wochenlauf_ruft_die_pruefung_auf():
    pfad = os.path.join(WURZEL, ".github", "workflows", "weekly-full-update.yml")
    with open(pfad, encoding="utf-8") as fh:
        w = fh.read()
    # Auf den AUFRUF pruefen, nicht auf die blosse Erwaehnung: ein
    # Schrittname oder ein Kommentar nennt den Pfad auch dann noch, wenn
    # die Zeile darunter laengst etwas anderes tut.
    import re
    assert re.search(r"^\s*python3?\s+scripts/pruefe_frische\.py", w, re.M), (
        "der Di/Fr-Lauf ruft die Frischepruefung nicht mehr auf — dann "
        "ist 'alles aktuell' wieder eine Annahme statt einer Messung")
    assert re.search(
        r"^\s*python3?\s+backend/scrapers/limitless_online_decklist_scraper\.py",
        w, re.M), (
        "die Online-Einzellisten laufen nicht mehr im Di/Fr-Lauf mit; "
        "ihr eigener Ablauf hat keinen Zeitplan, also aktualisiert sie "
        "dann niemand")
