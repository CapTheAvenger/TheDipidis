"""Die ACE-SPEC-Liste sieht alt aus — ist sie es auch?

DER VERDACHT (10.09.2026, abends)
---------------------------------
`data/ace_specs.json` traegt `timestamp: 2026-02-18` — also VOR dem
Erscheinen von POR, CRI und PBL. Eine ACE SPEC aus einem dieser drei
Sets stuende nicht in der Liste, und `ace_spec_regel.entscheide()`
wuerde sie still als "unentschieden" (leeres Feld) durchlassen statt
als "Yes".

WAS GEMESSEN WURDE
------------------
Am 10.09.2026 gegen die Quelle selbst gehalten
(https://limitlesstcg.com/cards?q=is%3Aace, im Browser des Betreibers,
weil der Sandkasten limitlesstcg.com nicht erreicht):

    Quelle:            46 Drucke
    davon in unserer Kartendatenbank aufloesbar: 46
    Namen daraus:      39
    fehlen in der Liste:      0
    ueberzaehlig in der Liste: 0

    Sets der Quelle: PRE, SSP, SCR, SFA, TWM, TEF, PLB, PLF, PLS, BCR
    KEIN einziger Druck aus POR, CRI oder PBL.

Die Liste ist also inhaltlich aktuell; nur ihr Zeitstempel sieht alt
aus. Neu gezogen wurde nichts — deshalb bleibt `timestamp` stehen und
der Befund steht als `_geprueft` daneben.

WARUM 46 UND 39 KEIN WIDERSPRUCH SIND
-------------------------------------
Die Quelle zaehlt DRUCKE, die Liste fuehrt NAMEN. Mehrere ACE SPECs
wurden nachgedruckt — `Prime Catcher` etwa in TEF und in PRE.

WAS DIESER TEST NICHT KANN
--------------------------
Er kann die Quelle nicht abrufen. Er haelt fest, dass die Pruefung
stattgefunden hat, mit welchen Zahlen, und dass die Liste seither nicht
stillschweigend geschrumpft ist. Ein neues Set mit einer ACE SPEC macht
die Liste unvollstaendig, und weder sie noch dieser Test merken das von
selbst — die Datei hing an keinem Zeitplan.

NACHTRAG 30.09.2026 (DA-22): jetzt haengt sie an einem. Der Wochenlauf
faehrt scripts/ace_specs_nachziehen.py und schreibt diesen Vermerk bei
jeder Aenderung neu (tests/python/test_ace_specs_nachziehen.py).
"""

import json
import os

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PFAD = os.path.join(WURZEL, "data", "ace_specs.json")


def _liste():
    with open(PFAD, encoding="utf-8") as f:
        return json.load(f)


def test_die_pruefung_steht_in_der_datei():
    d = _liste()
    g = d.get("_geprueft")
    assert g, (
        "Der Pruefvermerk fehlt. Ohne ihn sieht die Datei mit ihrem "
        "timestamp vom 18.02.2026 aus wie ein vergessener Stand — und "
        "jemand zieht sie unnoetig neu, oder schlimmer: verlaesst sich "
        "darauf, dass sie jemand geprueft hat.")
    for feld in ("am", "gegen", "quelle_drucke", "liste_namen",
                 "fehlend", "ueberzaehlig"):
        assert feld in g, f"Feld '{feld}' fehlt im Pruefvermerk"
    assert g["gegen"].startswith("https://limitlesstcg.com/cards"), (
        "Die Quelle des Vergleichs ist nicht genannt.")


def test_die_pruefung_war_ergebnislos_und_sagt_das_auch():
    """Kein Name der Quelle fehlt in der Liste.

    Seit 30.09.2026 schreibt scripts/ace_specs_nachziehen.py den Vermerk
    und nimmt dabei jeden Namen der Quelle auf — `fehlend` ist danach 0.
    `ueberzaehlig` (Namen, die die Quelle nicht mehr fuehrt) darf dagegen
    stehen: entfernt wird nie, gemeldet wird es als ::notice::. Eine
    Karte hoert nicht auf, ACE SPEC zu sein."""
    g = _liste()["_geprueft"]
    assert g["fehlend"] == 0, (
        f"Die Pruefung fand {g['fehlend']} Namen der Quelle, die in der "
        "Liste fehlen — dann muss die Liste nachgezogen werden, nicht der Vermerk.")
    assert 0 <= g["ueberzaehlig"] <= g["liste_namen"]


def test_die_zahl_der_namen_stimmt_mit_dem_vermerk_ueberein():
    """Sonst ist der Vermerk eine Behauptung ueber eine andere Datei."""
    d = _liste()
    assert len(d["ace_specs"]) == d["_geprueft"]["liste_namen"], (
        f"Die Liste fuehrt {len(d['ace_specs'])} Namen, der Pruefvermerk "
        f"spricht von {d['_geprueft']['liste_namen']}. Einer von beiden "
        "wurde geaendert, ohne den anderen nachzuziehen.")
    assert len(d["ace_specs"]) == d.get("total_count"), (
        "total_count passt nicht zur Liste.")


def test_drucke_und_namen_duerfen_auseinanderfallen_aber_nur_so_herum():
    """46 Drucke auf 39 Namen ist der Normalfall (Nachdrucke). MEHR
    Namen als Drucke waere ein Befund: dann stuende in der Liste ein
    Name, den die Quelle gar nicht fuehrt."""
    g = _liste()["_geprueft"]
    # Seit 30.09.2026 kommen Namen auch ueber JP-Drucke dazu (jp_drucke).
    aus_quelle = g["liste_namen"] - g["ueberzaehlig"]
    assert g["quelle_drucke"] + g.get("jp_drucke", 0) >= aus_quelle, (
        f"{aus_quelle} Namen aus der Quelle bei nur {g['quelle_drucke']} + "
        f"{g.get('jp_drucke', 0)} Drucken — die Liste fuehrt mehr, als die Quelle hergibt.")
    assert "warum_die_zahlen_verschieden_sind" in g, (
        "Ohne diese Erklaerung liest die naechste Person 46 gegen 39 als "
        "Fehler und zieht die Liste neu.")


def test_die_einschraenkung_steht_daneben():
    g = _liste()["_geprueft"]
    assert "was_das_NICHT_heisst" in g and g["was_das_NICHT_heisst"], (
        "Der Vermerk sagt nicht, was er NICHT abdeckt. Eine Pruefung von "
        "gestern ist kein Zeitplan — ein neues Set mit einer ACE SPEC "
        "macht die Liste unvollstaendig, ohne dass es hier auffaellt.")


def test_die_liste_ist_kleingeschrieben_und_ohne_doppelte():
    """Der Vergleich in ace_spec_regel.py laeuft ueber kleingeschriebene
    Namen. Ein Grossbuchstabe hier waere eine Karte, die nie trifft."""
    a = _liste()["ace_specs"]
    falsch = [n for n in a if n != n.strip().lower()]
    assert not falsch, f"nicht kleingeschrieben/getrimmt: {falsch[:5]}"
    doppelt = [n for n in set(a) if a.count(n) > 1]
    assert not doppelt, f"doppelte Eintraege: {doppelt}"
