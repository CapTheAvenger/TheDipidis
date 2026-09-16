"""data_stand.json muss die Dateien fuehren, die das Frontend wirklich liest.

BEFUND (09.09.2026): die Datei fuehrte 24 Dateien und 8 Inhaltsdaten.
Alle sieben Quellen, die auf der Seite als Frischechip erscheinen, waren
darunter — der urspruengliche Befund „deckt nur 4 von 9" stimmte also
nicht mehr.

Echte Luecke war eine andere: die Auszuege je Formatfenster. Das
Frontend liest NICHT den Monolithen labs_tournament_decks.csv, sondern
den Auszug labs_tournament_decks_TEF-PBL.csv (js/app-core.js waehlt ihn
ueber format_window.json) — und fuer den stand kein Stand in der Datei.
Dazu fehlten tournament_decklists_per_player.csv und
player_continuity.csv, beide Grundlage sichtbarer Ansichten.

Jetzt: 45 Dateien mit Stand, 23 mit Inhaltsdatum, keine ohne Stand.

Am 10.09.2026 kam ein zweiter Befund dazu: data_stand.json wies fuer
champions_usage.json den 30.08. aus, obwohl die Datei taeglich frisch
committet wird — ZEHN Tage daneben. Der Normalbetrieb schreibt nur
Dateien fort, die im LAUFENDEN Lauf geaendert wurden, und
build_data_stand.py lief nie im Champions-Lauf. Behoben (Schritt dort
ergaenzt) und der Rueckstand einmalig mit --aus-git aufgeholt: 11
Staende korrigiert.
"""

import json
import os

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
DATEN = os.path.join(WURZEL, "data")
STAND = os.path.join(DATEN, "data_stand.json")


def _stand():
    with open(STAND, encoding="utf-8") as f:
        return json.load(f)


def test_die_rotierenden_auszuege_sind_gefuehrt():
    """Der Auszug des laufenden Fensters ist der, den die Seite laedt."""
    d = _stand()
    gefuehrt = set(d["dateien"])
    import glob
    auszuege = [os.path.basename(p) for p in
                glob.glob(os.path.join(DATEN, "labs_tournament_decks_*.csv"))]
    assert auszuege, "keine Labs-Auszuege gefunden"
    fehlend = sorted(set(auszuege) - gefuehrt)
    assert not fehlend, (
        "diese Auszuege haben keinen Datenstand, obwohl das Frontend "
        "genau sie laedt: " + ", ".join(fehlend))


def test_die_champions_dateien_werden_gefuehrt():
    """Die drei Dateien der Nachtlaeufe plus die Nutzungsdaten.

    Sie stehen in data/_consumers.md als oeffentliche Schnittstelle,
    standen aber in keinem Datenstand. champions_usage.json wurde
    taeglich frisch committet, waehrend data_stand.json den 30.08.
    auswies.
    """
    quelle = open(os.path.join(WURZEL, "scripts", "build_data_stand.py"),
                  encoding="utf-8").read()
    for name in ("champions_editionen.json", "pokemon_go_liste.json",
                 "pokemon_go_shiny.json", "champions_usage.json",
                 "opgg_champions_moves.json"):
        assert f'"{name}"' in quelle, (
            f"{name} steht nicht in der Liste des Bauers")


def test_die_beiden_turnierdateien_werden_gefuehrt():
    """Gefuehrt heisst: in DATEIEN eingetragen, nicht zwingend mit Stand.

    Der Stand kommt aus dem Git-Verlauf. In einem flachen Klon — und
    dieser Bausandkasten ist einer — steht eine gerade erst
    aufgenommene Datei deshalb in `ohne_stand`, bis ein Lauf mit vollem
    Verlauf sie datiert. Geprueft wird darum die Aufnahme, nicht das
    Datum.
    """
    d = _stand()
    quelle = open(os.path.join(WURZEL, "scripts", "build_data_stand.py"),
                  encoding="utf-8").read()
    for name in ("tournament_decklists_per_player.csv", "player_continuity.csv"):
        assert f'"{name}"' in quelle, (
            f"{name} steht nicht in der Liste des Bauers")
        gefuehrt = name in d["dateien"] or name in d["ohne_stand"]
        assert gefuehrt, f"{name} taucht in data_stand.json gar nicht auf"


def test_die_abdeckung_faellt_nicht_zurueck():
    """Ratsche: die Zahl der gefuehrten Dateien darf nicht sinken.

    38 und 21 sind die am 09.09.2026 gemessenen Werte. Ein Rueckgang
    heisst, dass jemand eine Datei aus der Liste genommen hat — das darf
    passieren, aber nicht unbemerkt.
    """
    d = _stand()
    assert len(d["dateien"]) >= 45, (
        f"nur noch {len(d[chr(39)+chr(100)+chr(97)+chr(116)+chr(101)+chr(105)+chr(101)+chr(110)+chr(39)])} gefuehrte Dateien (waren 45)")
    assert len(d["inhalt_bis"]) >= 23, (
        f"nur noch {len(d['inhalt_bis'])} Inhaltsdaten (waren 23)")


def test_keine_datei_bleibt_ohne_stand():
    """Nach dem --aus-git-Lauf traegt jede gefuehrte Datei ein Datum.

    Frueher stand hier: format_window.json sei die bekannte Ausnahme.
    Sie ist es nicht mehr — der volle Git-Verlauf datiert auch sie.
    Ein Eintrag in dieser Liste heisst jetzt: die Datei liegt da, aber
    niemand weiss, wie alt sie ist. Das ist ein Befund, keine Ausnahme.
    """
    d = _stand()
    assert d["ohne_stand"] == [], (
        "Dateien ohne Stand: " + ", ".join(d["ohne_stand"])
        + " — ein Lauf mit `python3 scripts/build_data_stand.py --aus-git` "
        + "holt sie nach, sofern der Klon den vollen Verlauf hat.")


def _in_utc(iso: str) -> str:
    """Einen ISO-Zeitstempel auf UTC drehen; Unlesbares bleibt, wie es ist."""
    from datetime import datetime, timezone
    roh = (iso or "").strip()
    if not roh:
        return ""
    try:
        return datetime.fromisoformat(roh).astimezone(timezone.utc).isoformat()
    except ValueError:
        return roh


def test_der_stand_stimmt_mit_dem_git_verlauf_ueberein():
    """Die eigentliche Zusicherung: das Datum ist nicht nur da, es stimmt.

    Genau hier lag der Fehler — champions_usage.json trug ein Datum,
    es war nur zehn Tage alt. Ein vorhandenes falsches Datum ist
    schlimmer als ein fehlendes.

    Uebersprungen, wenn der Klon flach ist (in CI mit fetch-depth 1
    liefert git log fuer jede Datei denselben Commit).
    """
    import subprocess
    tief = subprocess.run(["git", "rev-parse", "--is-shallow-repository"],
                          cwd=WURZEL, capture_output=True, text=True)
    if tief.stdout.strip() != "false":
        return

    d = _stand()
    schief = []
    for name, wert in d["dateien"].items():
        aus_git = subprocess.run(
            ["git", "log", "-1", "--format=%cI", "--", "data/" + name],
            cwd=WURZEL, capture_output=True, text=True).stdout.strip()
        # BEIDE Seiten in UTC, bevor der Tag abgeschnitten wird.
        # BEFUND 16.09.2026: git gibt die ORTSZEIT des Commits aus
        # (2026-09-16T00:02:19+02:00), data_stand.json schreibt UTC
        # (2026-09-15T21:52:32+00:00). Dasselbe Ereignis, zwei
        # Tagesdaten — die Zusicherung fiel um, sobald ein Commit
        # zwischen 22:00 und 24:00 UTC landete, und meldete einen
        # Datenfehler, wo keiner war. Die Zeitzone ist keine
        # Eigenschaft des Standes, sondern der Ausgabe.
        aus_git = _in_utc(aus_git)
        if aus_git and aus_git[:10] != _in_utc(str(wert))[:10]:
            schief.append(f"{name}: Datei sagt {str(wert)[:10]}, "
                          f"git sagt {aus_git[:10]}")
    assert not schief, (
        "Diese Staende weichen vom Git-Verlauf ab:\n  "
        + "\n  ".join(schief[:8])
        + "\n\nDer Normalbetrieb schreibt nur Dateien fort, die im "
        + "LAUFENDEN Lauf geaendert wurden. Faellt das hier um, fehlt "
        + "einem Lauf der Schritt `build_data_stand.py` vor dem Commit.")


def test_der_champions_lauf_schreibt_den_stand_fort():
    """Der Lauf, der die Champions-Dateien committet, muss ihn bauen.

    Ohne diesen Schritt bleibt der Stand stehen, waehrend die Datei
    taeglich neu geschrieben wird — genau der Zehn-Tage-Versatz.
    """
    pfad = os.path.join(WURZEL, ".github", "workflows",
                        "champions-replica-scrape.yml")
    text = open(pfad, encoding="utf-8").read()
    AUFRUF = "python3 -u scripts/build_data_stand.py"
    assert AUFRUF in text, (
        "champions-replica-scrape.yml schreibt den Datenstand nicht fort")
    anfang = text.index("git add ")
    ende = text.index("git diff --cached", anfang)
    assert "data/data_stand.json" in text[anfang:ende], (
        "data_stand.json wird nicht mitcommittet — der Neubau bliebe im "
        "Runner liegen")
    assert text.index(AUFRUF) < anfang, (
        "der Datenstand wird NACH dem Commit gebaut")
