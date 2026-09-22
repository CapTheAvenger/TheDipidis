"""Warum der Wochenlauf die Ace-Spec-Reparatur nur MELDEN laesst.

FRAGE (07.09.2026): `data/ace_specs.json` traegt `timestamp` =
2026-02-18 und ist seither unveraendert. Der Wochenlauf fuehrt
`scripts/repariere_ace_spec.py --melden`
(`.github/workflows/weekly-full-update.yml`) — er meldet also nur und
schreibt nie. Soll der Schalter fallen?

ANTWORT: nein. Trockenlauf am 07.09.2026, ueber 22 Dateien und
659.506 Zeilen:

    Gesamt: Yes 22961, No 635644, leer 901 — 0 Felder geaendert.
    is_ace_spec: keine Drift — 22 Dateien, 659506 Zeilen geprueft.

`--schreiben` haette also nichts zu schreiben. Der Schalter umzulegen
wuerde kein Feld reparieren und dafuer den Weg oeffnen, dass ein Lauf
ohne Aufsicht 659.506 Zeilen anfasst — genau das, was CLAUDE.md mit
„Report, don't silently repair" ausschliesst.

Der alte Zeitstempel ist auch kein Alarm. Die Liste ist fuer das
aktuelle Format vollstaendig: in
`tournament_cards_data_cards_TEF-PBL.csv` sind alle 879 Zeilen
entschieden (41 Yes, 838 No, **0 leer**). Unentschieden bleiben 901
Zeilen in aelteren Formaten; die 13 haeufigsten Namen darunter
(`Team Yell's Cheer` 348x, `Ruffian` 100x, `Roseanne's Backup` 91x,
`Justified Gloves` 64x …) fuehrt `all_cards_merged.csv` als Supporter,
Item oder Tool mit gewoehnlichen Seltenheiten — kein Hinweis auf einen
uebersehenen Ace Spec. Positiv belegen laesst sich das dort nicht: die
Kartendatenbank fuehrt ueberhaupt kein Ace-Spec-Kennzeichen
(`grep -ic "ace spec" data/all_cards_merged.csv` → 0). Genau deshalb
laesst der Reparaturlauf diese Felder leer, statt sie zu raten.

Geschrieben wird weiterhin von Hand ueber den Workflow „Daten
reparieren" (ace-spec-reparatur.yml) mit seinem `schreiben`-Eingang.

NACHTRAG 10.09.2026 — die Begruendung oben stimmte nicht mehr
-------------------------------------------------------------
Der Lauf vom 10.09.2026 meldete 5276 abweichende Felder, nicht 0. Der
Satz „--schreiben haette also nichts zu schreiben" traf damit nicht mehr
zu, und der Schalter stand ohne seine Begruendung da.

Die Untersuchung ergab, dass die Drift KEIN Scraper-Fehler war, sondern
der Unterschied zwischen zwei richtigen Formen derselben Regel:
`entscheide_zeile` (nur diese Zeile bekannt, so schrieben die Scraper)
gegen `entscheide` (ganzer Bestand bekannt, so rechnet der Abgleich).
Die Differenz steckte in genau zwei Dateien — den beiden, die bei jedem
Lauf vollstaendig neu geschrieben werden:

    current_meta_card_data.csv          770 von  4501 Zeilen
    online_tournament_dated_cards.csv  4506 von 29153 Zeilen

Der Betreiber hat entschieden: Ursache im Scraper beheben. Seither holen
sich beide Schreibstellen die Belege des Gesamtbestands
(`belege_aus_bestand()` in backend/core/ace_spec_regel.py) und schreiben
gleich den starken Wert. Damit hat der Abgleich nichts mehr zu finden —
und der Schalter bleibt aus demselben Grund wie vorher auf „melden":
nicht weil nichts zu tun waere, sondern weil ein unbeaufsichtigter Lauf
ueber 660.000 Zeilen die falsche Antwort auf einen Befund ist.

Abgesichert in tests/python/test_ace_spec_bestandsbelege.py.
"""

import csv
import collections
import json
import os
import re

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
DATEN = os.path.join(WURZEL, "data")
WOCHENLAUF = os.path.join(WURZEL, ".github", "workflows", "weekly-full-update.yml")
REPARATUR = os.path.join(WURZEL, ".github", "workflows", "ace-spec-reparatur.yml")


def test_der_wochenlauf_meldet_und_schreibt_nicht():
    with open(WOCHENLAUF, encoding="utf-8") as f:
        w = f.read()
    ruf = re.search(r"^\s*python3 scripts/repariere_ace_spec\.py.*$", w, re.M)
    assert ruf, "der Wochenlauf ruft repariere_ace_spec.py nicht mehr"
    zeile = ruf.group(0)
    assert "--melden" in zeile, f"Schalter geaendert: {zeile.strip()}"
    assert "--schreiben" not in zeile, (
        "der Wochenlauf schreibt jetzt selbst — der Trockenlauf am 07.09.2026 "
        "fand 0 zu aendernde Felder, das gaebe keinen Gewinn und viel Risiko: "
        + zeile.strip())


def test_geschrieben_wird_von_hand_und_mit_schalter():
    """Der schreibende Weg muss existieren — sonst waere „nur melden"
    eine Sackgasse statt einer Arbeitsteilung."""
    assert os.path.exists(REPARATUR), "ace-spec-reparatur.yml fehlt"
    with open(REPARATUR, encoding="utf-8") as f:
        r = f.read()
    assert "workflow_dispatch" in r, "der Reparaturlauf ist nicht von Hand ausloesbar"
    assert "schreiben" in r, "der Reparaturlauf hat keinen Schreib-Eingang"
    assert "repariere_ace_spec" in r


def test_im_aktuellen_format_ist_jede_zeile_entschieden():
    """Im laufenden Format darf keine Zeile unentschieden bleiben.

    WAS DIESER TEST NICHT MEHR BEHAUPTET (22.09.2026). Er hiess
    `..._liste_deckt_das_aktuelle_format_vollstaendig_ab` und meldete
    beim Umfallen "die Ace-Spec-Liste hinkt der Rotation hinterher". Am
    22.09.2026 fiel er mit 294 unentschiedenen Zeilen um — und die
    Diagnose war falsch:

      * `data/ace_specs.json` fuehrt 39 Namen.
      * limitlesstcg.com/cards?q=is:ace&display=list, abgerufen am
        22.09.2026: 46 Drucke, 39 verschiedene Namen — dieselben.

    Die Liste war also vollstaendig. Unentschieden waren die Zeilen aus
    einem anderen Grund: der Wochenlauf hatte 1.589 neue Zeilen
    geschrieben, und `scripts/repariere_ace_spec.py --melden` wies 2.618
    Felder im Gesamtbestand aus, die anders belegt sind als die Regel es
    vorgibt. Der Bestand hinkte, nicht die Liste.

    Repariert wird das mit dem Ablauf „Daten reparieren"
    (ace-spec-reparatur.yml, `schreiben=true`) — bewusst von Hand und
    bewusst nicht im Wochenlauf, weil ein unbeaufsichtigter Lauf ueber
    660.000 Zeilen die falsche Antwort auf einen Befund ist (siehe
    Kopf dieser Datei).
    """
    pfad = os.path.join(DATEN, "tournament_cards_data_cards_TEF-PBL.csv")
    c = collections.Counter()
    with open(pfad, encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f, delimiter=";"):
            c[(r.get("is_ace_spec") or "").strip()] += 1
    assert c[""] == 0, (
        f"{c['']} von {sum(c.values())} Zeile(n) im aktuellen Format sind "
        "unentschieden. ERST PRUEFEN, WORAN ES LIEGT:\n"
        "  1. `python3 scripts/repariere_ace_spec.py --melden` — weist er "
        "Abweichungen aus, hinkt der BESTAND. Dann den Ablauf "
        "„Daten reparieren\" (ace-spec-reparatur.yml) mit schreiben=true "
        "ausloesen.\n"
        "  2. Meldet er nichts, hinkt die LISTE. Dann "
        "limitlesstcg.com/cards?q=is:ace&display=list abrufen (die "
        "Bildansicht gibt keine Namen her) und data/ace_specs.json "
        "nachziehen.")
    assert c["Yes"] > 0 and c["No"] > 0, dict(c)


def test_die_liste_ist_da_und_lesbar():
    with open(os.path.join(DATEN, "ace_specs.json"), encoding="utf-8") as f:
        d = json.load(f)
    assert d["total_count"] == len(d["ace_specs"]), (
        "total_count passt nicht zur Liste")
    assert d["total_count"] >= 39, (
        f"die Liste ist auf {d['total_count']} Eintraege geschrumpft")
    assert d.get("source", "").startswith("http")
