"""Ein toter Job muss sich melden, auch wenn seine Datei stillsteht.

BEFUND (Agententeam C, 06.09.2026). data/_job_heartbeats.json existiert seit dem
04.09. und wird von den nicht blockierenden Schritten geschrieben — GELESEN hat
sie niemand. Gemessen an diesem Tag stand
`scrapers/champions_replica_scraper.py` auf `zuletzt_erfolgreich: 2026-08-25`,
also zwoelf Tage, bei einem Job, der taeglich um 04:00 laeuft. Der Waechter
meldete 0 CRITICAL.

Der Kommentar in scripts/data_guardian.py sagte seit dem 18.08. selbst, was
fehlt: "Sauber loesen laesst sich das erst mit einem Heartbeat — jeder Job
schreibt bei Erfolg einen Zeitstempel, unabhaengig davon, ob sich Inhalt
geaendert hat. Bewusst nicht in dieser Aenderung." Die Datei kam dann, die
Pruefung nicht.

Warum das die einzige ehrliche Pruefung ist: das Alter einer Datei beantwortet
"hat sich etwas geaendert", nicht "lief der Job". Zwischen zwei Turnieren
aendert sich an den Turnierdateien nichts, obwohl der Scraper sauber laeuft —
und umgekehrt beweist ein ausbleibender Herzschlag den toten Job unabhaengig
davon, ob die Quelle etwas Neues hatte.

Diese Zusicherungen RUFEN die Pruefung auf, statt den Quelltext abzugrasen.
"""
import datetime as dt
import importlib.util
import json
import os

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _guardian():
    pfad = os.path.join(ROOT, "scripts", "data_guardian.py")
    spec = importlib.util.spec_from_file_location("guardian_herzschlag", pfad)
    modul = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modul)
    return modul


def _schreibe(tmp_path, monkeypatch, g, inhalt):
    """Legt eine Herzschlagdatei an und laesst den Waechter dorthin sehen."""
    datenordner = tmp_path / "data"
    datenordner.mkdir(exist_ok=True)
    ziel = datenordner / g.HEARTBEAT_DATEI
    if inhalt is not None:
        ziel.write_text(json.dumps(inhalt), encoding="utf-8")
    monkeypatch.setattr(g, "DATA", str(datenordner))
    return ziel


def _stempel(tage_zurueck):
    t = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=tage_zurueck)
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def test_frischer_herzschlag_meldet_nichts(tmp_path, monkeypatch):
    g = _guardian()
    inhalt = {job: {"status": "OK", "zuletzt_erfolgreich": _stempel(0)}
              for job in g.HERZSCHLAG}
    _schreibe(tmp_path, monkeypatch, g, inhalt)
    findings = []
    g.check_heartbeat(findings)
    assert findings == [], f"ein frischer Herzschlag erzeugt Meldungen: {findings}"


def test_toter_job_wird_kritisch(tmp_path, monkeypatch):
    """Der Fall, der den Befund ausgeloest hat: zwoelf Tage bei taeglicher Kadenz."""
    g = _guardian()
    tot = "scrapers/champions_replica_scraper.py"
    assert tot in g.HERZSCHLAG, "der taegliche Champions-Scraper wird nicht bewacht"
    max_alter = g.HERZSCHLAG[tot][0]

    inhalt = {job: {"status": "OK", "zuletzt_erfolgreich": _stempel(0)}
              for job in g.HERZSCHLAG}
    inhalt[tot]["zuletzt_erfolgreich"] = _stempel(12)
    _schreibe(tmp_path, monkeypatch, g, inhalt)

    findings = []
    g.check_heartbeat(findings)
    kritisch = [t for schwere, t in findings if schwere == "CRITICAL"]
    assert len(kritisch) == 1, f"erwartet genau eine kritische Meldung, bekommen: {findings}"
    assert tot in kritisch[0], "die Meldung nennt den Job nicht"
    assert "12 Tagen" in kritisch[0], f"die Meldung nennt das Alter nicht: {kritisch[0]}"
    assert str(max_alter) in kritisch[0], "die Meldung nennt die erlaubte Schwelle nicht"


def test_die_schwelle_gilt_genau(tmp_path, monkeypatch):
    """Auf der Schwelle noch still, einen Tag darueber laut.

    Wichtig, weil ein Job, der auf seiner Kadenz laeuft, sonst strukturell
    garantiert falsch feuert — dieselbe Lehre wie bei price_guide_6.json.
    """
    g = _guardian()
    job = "scrapers/labs_tournament_scraper.py"
    max_alter = g.HERZSCHLAG[job][0]
    for tage, soll_melden in [(max_alter, False), (max_alter + 1, True)]:
        inhalt = {j: {"status": "OK", "zuletzt_erfolgreich": _stempel(0)}
                  for j in g.HERZSCHLAG}
        inhalt[job]["zuletzt_erfolgreich"] = _stempel(tage)
        _schreibe(tmp_path, monkeypatch, g, inhalt)
        findings = []
        g.check_heartbeat(findings)
        hat = any(s == "CRITICAL" for s, _ in findings)
        assert hat is soll_melden, (
            f"bei {tage} Tagen (Schwelle {max_alter}) meldet der Waechter "
            f"{'etwas' if hat else 'nichts'} — erwartet war das Gegenteil")


def test_status_nicht_ok_ist_kritisch_auch_bei_frischem_stempel(tmp_path, monkeypatch):
    """Ein Job kann puenktlich laufen und trotzdem scheitern."""
    g = _guardian()
    job = "scrapers/per_decklist_scraper.py"
    inhalt = {j: {"status": "OK", "zuletzt_erfolgreich": _stempel(0)}
              for j in g.HERZSCHLAG}
    inhalt[job]["status"] = "FEHLER"
    _schreibe(tmp_path, monkeypatch, g, inhalt)
    findings = []
    g.check_heartbeat(findings)
    kritisch = [t for s, t in findings if s == "CRITICAL"]
    assert len(kritisch) == 1 and job in kritisch[0], (
        f"ein Job mit Status FEHLER und frischem Stempel bleibt unbemerkt: {findings}")


def test_fehlende_datei_ist_nur_eine_warnung(tmp_path, monkeypatch):
    """Ohne Herzschlagdatei ist die Pruefung BLIND, nicht der Job tot.

    Das ist der Unterschied, den der Waechter sonst nirgends macht: "nichts
    gemessen" und "schlecht gemessen" sind zwei Aussagen. Ein CRITICAL hier
    waere genau das Rauschen, vor dem der Modulkommentar warnt.
    """
    g = _guardian()
    _schreibe(tmp_path, monkeypatch, g, None)
    findings = []
    g.check_heartbeat(findings)
    assert findings and all(s == "WARN" for s, _ in findings), (
        f"eine fehlende Herzschlagdatei erzeugt etwas anderes als WARN: {findings}")


def test_fehlender_eintrag_ist_nur_eine_warnung(tmp_path, monkeypatch):
    """Ein Job, der keinen Herzschlag schreibt, beweist mit seinem Schweigen nichts."""
    g = _guardian()
    inhalt = {j: {"status": "OK", "zuletzt_erfolgreich": _stempel(0)}
              for j in g.HERZSCHLAG}
    fehlt = sorted(g.HERZSCHLAG)[0]
    del inhalt[fehlt]
    _schreibe(tmp_path, monkeypatch, g, inhalt)
    findings = []
    g.check_heartbeat(findings)
    assert [s for s, _ in findings] == ["WARN"], f"erwartet genau ein WARN: {findings}"
    assert fehlt in findings[0][1]


def test_unlesbarer_zeitstempel_kippt_nicht_die_pruefung(tmp_path, monkeypatch):
    g = _guardian()
    job = sorted(g.HERZSCHLAG)[0]
    inhalt = {j: {"status": "OK", "zuletzt_erfolgreich": _stempel(0)}
              for j in g.HERZSCHLAG}
    inhalt[job]["zuletzt_erfolgreich"] = "vorgestern"
    _schreibe(tmp_path, monkeypatch, g, inhalt)
    findings = []
    g.check_heartbeat(findings)          # darf nicht werfen
    assert [s for s, _ in findings] == ["WARN"]


def test_kaputte_json_datei_kippt_nicht_die_pruefung(tmp_path, monkeypatch):
    g = _guardian()
    datenordner = tmp_path / "data"
    datenordner.mkdir(exist_ok=True)
    (datenordner / g.HEARTBEAT_DATEI).write_text("{kaputt", encoding="utf-8")
    monkeypatch.setattr(g, "DATA", str(datenordner))
    findings = []
    g.check_heartbeat(findings)          # darf nicht werfen
    assert [s for s, _ in findings] == ["WARN"]


def test_check_heartbeat_haengt_wirklich_im_lauf():
    """Eine Pruefung, die main() nicht aufruft, ist toter Code."""
    quelle = open(os.path.join(ROOT, "scripts", "data_guardian.py"),
                  encoding="utf-8").read()
    assert "check_heartbeat(findings)" in quelle, \
        "check_heartbeat wird nirgends aufgerufen"
    ab_main = quelle[quelle.index("def main("):]
    assert "check_heartbeat(findings)" in ab_main, \
        "check_heartbeat steht nicht in main() — die Pruefung laeuft nie"


def test_jeder_bewachte_job_hat_eine_begruendete_kadenz():
    """Eine Schwelle ohne genannte Kadenz ist eine geratene Zahl."""
    g = _guardian()
    assert g.HERZSCHLAG, "es wird kein Job bewacht"
    for job, (max_alter, kadenz) in g.HERZSCHLAG.items():
        assert isinstance(max_alter, int) and max_alter > 0, \
            f"{job} hat keine brauchbare Schwelle"
        assert kadenz and len(kadenz) > 8, \
            f"{job} hat eine Schwelle von {max_alter} Tagen ohne genannte Kadenz"


def test_die_echte_datei_passt_zur_bewachten_liste():
    """Die Bewachungsliste darf nicht an der echten Datei vorbeigehen.

    Ein Tippfehler im Job-Schluessel wuerde sonst zu einem stillen WARN
    ('schreibt keinen Herzschlag') statt zu einer Bewachung.
    """
    g = _guardian()
    pfad = os.path.join(ROOT, "data", g.HEARTBEAT_DATEI)
    if not os.path.exists(pfad):
        pytest.skip("data/_job_heartbeats.json liegt in diesem Baum nicht vor")
    with open(pfad, encoding="utf-8") as f:
        echt = json.load(f)
    vorhanden = {k for k in echt if not k.startswith("_")}
    fehlend = set(g.HERZSCHLAG) - vorhanden
    assert not fehlend, (
        f"bewacht, aber in der echten Datei nicht vorhanden: {sorted(fehlend)} — "
        f"vorhanden sind {sorted(vorhanden)}")


def test_die_bewachten_spalten_stehen_wirklich_im_kopf():
    """Eine geratene Spalte meldet dauerhaft falschen Alarm.

    GENAU DAS ist beim Bauen dieser Pruefung passiert: die erste Fassung von
    FRONTEND_PFLICHTSPALTEN listete `deck_name`, `opponent`, `win_rate` und
    `tournament` — die Dateien fuehren aber `my_deck_name`,
    `opponent_deck_name`, `vs_win_pct` und `tournament_name`. Der Waechter
    meldete daraufhin drei kritische Befunde ueber Spalten, die es nicht gibt.
    Aufgefallen ist es nur, weil ich ihn danach laufen liess.
    """
    import csv
    g = _guardian()
    for datei, spalten in g.FRONTEND_PFLICHTSPALTEN.items():
        pfad = os.path.join(ROOT, "data", datei)
        if not os.path.exists(pfad):
            continue
        with open(pfad, encoding="utf-8-sig", newline="") as f:
            kopf = next(csv.reader(f), [])
        kopf = {k.strip() for k in kopf}
        fehlend = [sp for sp in spalten if sp not in kopf]
        assert not fehlend, (
            f"data/{datei}: bewacht werden {fehlend}, im Kopf stehen aber "
            f"{sorted(kopf)}")


def test_bekannt_leer_beschreibt_nur_wirklich_leere_spalten():
    """Ein 'bekannter Fall', der nicht mehr zutrifft, ist eine Luege im Bericht."""
    g = _guardian()
    ist_leer = g.tote_spalten()
    for datei, spalten in g.BEKANNT_LEER.items():
        for sp, grund in spalten.items():
            assert sp in ist_leer.get(datei, []), (
                f"data/{datei}: '{sp}' ist als bekannt leer deklariert, traegt aber "
                f"wieder Werte — der Eintrag gehoert entfernt. Begruendung stand: "
                f"{grund[:80]}...")
            assert len(grund) > 60, (
                f"data/{datei}/{sp}: die Begruendung ist zu kurz, um beim naechsten "
                f"Lesen noch etwas zu erklaeren")


# Bis zum 06.09.2026 hingen die beiden folgenden Zusicherungen am echten
# Eintrag `tournament_decklists_per_player.csv: type`. Der ist weg — die
# Spalte ist gefuellt (Extraktor plus scripts/fuelle_kartentyp.py), und
# ein "bekannt leer", das nicht mehr zutrifft, waere eine Luege im
# Bericht. Geprueft wird deshalb jetzt der MECHANISMUS mit einem
# eingesetzten Eintrag, nicht mehr ein bestimmter Befund. Die Zusicherung
# darueber (test_bekannt_leer_beschreibt_nur_wirklich_leere_spalten)
# haelt weiterhin fest, dass jeder echte Eintrag auch stimmen muss.
_GRUND = ("Erfundener Fall fuer diese Zusicherung. Der Text muss lang genug "
          "sein, um beim naechsten Lesen noch etwas zu erklaeren, und er "
          "nennt die Ursache: erfundenes_modul.py liefert die Spalte nicht.")


def test_bekannter_leerstand_wird_gemeldet_statt_verschwiegen(monkeypatch):
    """Bekannt heisst sichtbar, nicht stumm.

    Sonst waere die Spalte in einem halben Jahr vergessen — dieselbe Lehre wie
    bei den vier leeren City-League-Dateien, die der Waechter mit Datum meldet.
    """
    g = _guardian()
    monkeypatch.setattr(g, "BEKANNT_LEER", {"erfunden.csv": {"kennung": _GRUND}})
    cur = {"erfunden.csv": ["kennung"]}
    base = {"erfunden.csv": ["kennung"]}   # laengst bekannt
    findings = []
    g.check_tote_spalten(findings, cur, base)
    assert findings, "ein bekannter Leerstand wird gar nicht gemeldet"
    assert all(s == "WARN" for s, _ in findings), \
        f"ein bekannter Leerstand eskaliert: {findings}"
    assert "kennung" in findings[0][1] and "erfundenes_modul" in findings[0][1], \
        "die Meldung nennt die Ursache nicht"


def test_neu_leergelaufene_spalte_bleibt_kritisch(monkeypatch):
    """Bekannt darf nicht heissen, dass ALLES durchgeht."""
    g = _guardian()
    monkeypatch.setattr(g, "BEKANNT_LEER", {"erfunden.csv": {"kennung": _GRUND}})
    cur = {"erfunden.csv": ["kennung", "card_name"]}
    base = {"erfunden.csv": ["kennung"]}
    findings = []
    g.check_tote_spalten(findings, cur, base)
    kritisch = [t for s, t in findings if s == "CRITICAL"]
    assert len(kritisch) == 1, f"erwartet genau ein CRITICAL: {findings}"
    assert "card_name" in kritisch[0] and "kennung" not in kritisch[0], \
        "die kritische Meldung vermischt neuen und bekannten Leerstand"


def test_ohne_bekannte_leerstaende_ist_jede_leere_spalte_kritisch(monkeypatch):
    """Der Grundzustand, den der leere BEKANNT_LEER herstellt."""
    g = _guardian()
    monkeypatch.setattr(g, "BEKANNT_LEER", {})
    findings = []
    g.check_tote_spalten(findings, {"x.csv": ["a"]}, {"x.csv": []})
    assert [s for s, _ in findings] == ["CRITICAL"], findings


def test_matchup_bilanzen_kritisch_nur_beim_laufenden_format(tmp_path, monkeypatch):
    """Zwoelf historische Dateien sind Rauschen, das laufende Format ist ein Befund."""
    import csv as _csv
    g = _guardian()
    daten = tmp_path / "data"
    daten.mkdir()
    monkeypatch.setattr(g, "DATA", str(daten))
    (daten / "format_window.json").write_text(
        json.dumps({"oldest_legal_set": "TEF", "current_set": "PBL"}), encoding="utf-8")

    def schreibe(name, mit_bilanz):
        with open(daten / name, "w", encoding="utf-8", newline="") as f:
            w = _csv.writer(f)
            w.writerow(["my_deck_name", "opponent_deck_name", "vs_wins",
                        "vs_losses", "vs_ties"])
            w.writerow(["A", "B"] + (["3", "1", "0"] if mit_bilanz else ["", "", ""]))

    # Fall 1: das laufende Format hat Bilanzen, zwei alte nicht -> nur INFO
    schreibe("labs_tournament_matchups_TEF-PBL.csv", True)
    schreibe("labs_tournament_matchups_TEF-POR.csv", False)
    schreibe("labs_tournament_matchups_SVI-ASC.csv", False)
    findings = []
    g.check_matchup_bilanzen(findings)
    assert not [t for s, t in findings if s == "CRITICAL"], \
        f"historische Leerstaende schlagen Alarm: {findings}"
    info = [t for s, t in findings if s == "INFO"]
    assert info and "2 von 3" in info[0], f"die Bilanz der Auszuege fehlt: {findings}"

    # Fall 2: das laufende Format verliert sie -> CRITICAL
    schreibe("labs_tournament_matchups_TEF-PBL.csv", False)
    findings = []
    g.check_matchup_bilanzen(findings)
    kritisch = [t for s, t in findings if s == "CRITICAL"]
    assert len(kritisch) == 1, f"der Verlust im laufenden Format bleibt unbemerkt: {findings}"
    assert "TEF-PBL" in kritisch[0], "die Meldung nennt das betroffene Format nicht"


def test_matchup_pruefung_haengt_im_lauf():
    quelle = open(os.path.join(ROOT, "scripts", "data_guardian.py"),
                  encoding="utf-8").read()
    ab_main = quelle[quelle.index("def main("):]
    assert "check_matchup_bilanzen(findings)" in ab_main, \
        "check_matchup_bilanzen steht nicht in main() — die Pruefung laeuft nie"
