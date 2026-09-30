"""Der Wochenlauf haelt is_ace_spec selbst richtig — Liste UND Bestand.

ENTSCHEIDUNG HAUSI, 30.09.2026 (DA-22): „Da-22 muss auf jeden Fall
repariert werden. Falls irgendwann mal neue ACE SPECs kommen, dann
muessen die ja korrekt erkannt werden."

Vorher (07.09.–30.09.2026, frueher test_ace_spec_schalter_bleibt_melden.py)
meldete der Wochenlauf nur (`--melden`), geschrieben wurde von Hand ueber
„Daten reparieren". Gemessen am 30.09.: die Drift kommt nach jedem neuen
JP-Set wieder (35 Felder, 29 in city_league_analysis.csv), weil eine neue
Karte beim Schreiben noch keinen Beleg hat — der normale Weg der Belege.
Und die Namensliste data/ace_specs.json hing an keinem Zeitplan.

Jetzt, in dieser Reihenfolge im Wochenlauf:
  1. Erzeugte Dateien zurueck nach data/  (sonst berichtigt man einen Stand,
     den der Rueckweg danach wieder ueberschreibt — Wochenlauf #168)
  2. scripts/ace_specs_nachziehen.py       (die Liste aus der Quelle)
  3. scripts/repariere_ace_spec.py --schreiben (der Bestand nach der Regel)
  4. das Tor (Zusicherungen gegen die frischen Daten)
  5. Commit + push

Geprueft wird die Reihenfolge an den Schritten selbst, nicht an Textstellen,
und die Pruefung wird an einem verfaelschten Ablauf rot gesehen.
"""

import collections
import csv
import json
import os
import re

import yaml

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
DATEN = os.path.join(WURZEL, "data")
WOCHENLAUF = os.path.join(WURZEL, ".github", "workflows", "weekly-full-update.yml")
REPARATUR = os.path.join(WURZEL, ".github", "workflows", "ace-spec-reparatur.yml")


def _ohne_kommentare(text):
    return "\n".join(z for z in str(text).splitlines() if not z.lstrip().startswith("#"))


def befunde(text):
    """Was an der Verdrahtung im Wochenlauf nicht stimmt — leer heisst gut."""
    y = yaml.safe_load(text)
    schritte = [s for j in (y.get("jobs") or {}).values() for s in (j.get("steps") or [])]

    def stelle(pruef):
        for i, s in enumerate(schritte):
            if pruef(s):
                return i
        return None

    run = lambda s: _ohne_kommentare(s.get("run", ""))  # noqa: E731
    i_rueckweg = stelle(lambda s: (s.get("name") or "").startswith("Erzeugte Dateien zurueck nach data/"))
    # Aufgerufen, nicht nur erwaehnt: der Schritt nennt das Skript auch in
    # seinen Herzschlag-Zeilen („OK   scripts/ace_specs_nachziehen.py").
    ruft = lambda s, skript: re.search(r"(?m)^\s*python3?\s+(-u\s+)?%s\b" % re.escape(skript), run(s))  # noqa: E731
    i_liste = stelle(lambda s: ruft(s, "scripts/ace_specs_nachziehen.py"))
    i_rep = stelle(lambda s: ruft(s, "scripts/repariere_ace_spec.py"))
    i_tor = stelle(lambda s: (s.get("name") or "") == "Zusicherungen gegen die frischen Daten")
    i_commit = stelle(lambda s: (s.get("name") or "") == "Commit + push")

    aus = []
    if i_liste is None:
        aus.append("die ACE-SPEC-Liste wird nicht nachgezogen")
    if i_rep is None:
        return aus + ["repariere_ace_spec.py wird nicht aufgerufen"]
    aufruf = run(schritte[i_rep])
    if "--schreiben" not in aufruf or "--melden" in aufruf:
        aus.append("die Berichtigung schreibt nicht: " + aufruf.strip())
    if schritte[i_rep].get("continue-on-error"):
        aus.append("eine gescheiterte Nachpruefung (rc 2) darf den Lauf nicht gruen lassen")
    if i_rueckweg is not None and i_rep < i_rueckweg:
        aus.append("berichtigt VOR dem Rueckweg nach data/ — der ueberschreibt es wieder")
    if i_liste is not None and i_liste > i_rep:
        aus.append("die Liste wird erst NACH der Berichtigung nachgezogen")
    for name, i in (("Tor", i_tor), ("Commit", i_commit)):
        if i is None or i < i_rep:
            aus.append("berichtigt nicht vor dem %s" % name)
    return aus


def test_der_wochenlauf_zieht_die_liste_nach_und_berichtigt():
    with open(WOCHENLAUF, encoding="utf-8") as f:
        assert befunde(f.read()) == []


def test_die_pruefung_beisst():
    """Verfaelschungsprobe: der Stand bis 30.09. (nur melden, keine
    Listenpflege) und eine vertauschte Reihenfolge werden erkannt."""
    alt = """
jobs:
  scrape:
    steps:
      - name: Erzeugte Dateien zurueck nach data/
        run: cp a b
      - name: is_ace_spec nachrechnen
        run: python3 scripts/repariere_ace_spec.py --melden
      - name: Zusicherungen gegen die frischen Daten
        run: bash tor.sh
      - name: Commit + push
        run: git push
"""
    b = befunde(alt)
    assert any("nicht nachgezogen" in x for x in b) and any("schreibt nicht" in x for x in b), b
    gut = alt.replace("      - name: is_ace_spec nachrechnen\n",
                      "      - name: Liste\n        run: python3 scripts/ace_specs_nachziehen.py\n"
                      "      - name: is_ace_spec nachrechnen\n").replace("--melden", "--schreiben")
    assert befunde(gut) == []
    vertauscht = gut.replace("      - name: Erzeugte Dateien zurueck nach data/\n        run: cp a b\n", "") \
                    .replace("      - name: Commit + push\n", "      - name: Erzeugte Dateien zurueck nach data/\n"
                             "        run: cp a b\n      - name: Commit + push\n")
    assert any("VOR dem Rueckweg" in x for x in befunde(vertauscht)), befunde(vertauscht)


def test_der_handlauf_bleibt_als_reserve():
    """„Daten reparieren" bleibt als Knopf fuer den Fall dazwischen — noetig
    ist er nicht mehr, der Wochenlauf berichtigt Di/Fr selbst."""
    with open(REPARATUR, encoding="utf-8") as f:
        r = f.read()
    assert "workflow_dispatch" in r and "schreiben" in r and "repariere_ace_spec" in r


def test_im_aktuellen_format_ist_jede_zeile_entschieden():
    """Im laufenden Format darf keine Zeile unentschieden bleiben.

    Faellt das um, ERST PRUEFEN, woran es liegt (Befund 22.09.2026: nicht
    die Liste hinkte, sondern der Bestand). Seit 30.09.2026 berichtigt der
    Wochenlauf den Bestand selbst und zieht die Liste nach — bleibt hier
    trotzdem etwas leer, steht die Ursache auf der Laufseite des letzten
    Wochenlaufs (ace_specs_nachziehen / repariere_ace_spec)."""
    pfad = os.path.join(DATEN, "tournament_cards_data_cards_TEF-PBL.csv")
    c = collections.Counter()
    with open(pfad, encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f, delimiter=";"):
            c[(r.get("is_ace_spec") or "").strip()] += 1
    assert c[""] == 0, (
        f"{c['']} von {sum(c.values())} Zeile(n) im aktuellen Format sind "
        "unentschieden — Laufseite des letzten Wochenlaufs ansehen "
        "(Schritte „ACE-SPEC-Liste aus der Quelle nachziehen“ und "
        "„is_ace_spec nach der Regel berichtigen“).")
    assert c["Yes"] > 0 and c["No"] > 0, dict(c)


def test_die_liste_ist_da_und_lesbar():
    with open(os.path.join(DATEN, "ace_specs.json"), encoding="utf-8") as f:
        d = json.load(f)
    assert d["total_count"] == len(d["ace_specs"]), "total_count passt nicht zur Liste"
    assert d["total_count"] >= 39, f"die Liste ist auf {d['total_count']} Eintraege geschrumpft"
    assert d.get("source", "").startswith("http")
