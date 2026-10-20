#!/usr/bin/env python3
"""Schrumpf-Waechter: eine Datendatei, die ein Lauf stark verkleinert, wird
gemeldet oder nicht gepusht (WZ-38, Hausi 07.10.2026).

Aufruf (aus scripts/tor_vor_dem_push.sh, vor den Suiten):
    python3 scripts/schrumpf_waechter.py pruefen

Regel (Hausi 07.10.2026: „Warnung < 0,75, Stopp < 0,5"):
  Verhaeltnis neu/alt in Bytes je geaenderter Datei unter data/ gegen den
  Ausgangsstand (origin/main, wenn HEAD davor liegt, sonst HEAD).
  - unter 0,75: Warnung (::warning:: und Zeile in der Zusammenfassung)
  - unter 0,5:  die Datei bleibt auf dem Stand von gestern (wie beim
                Zurueckrollen des Tors), der Rest des Laufs geht durch.
  Dateien unter MIN_BYTES im Ausgangsstand zaehlen nicht: bei wenigen
  Zeilen ist jedes Verhaeltnis Rauschen. Geloeschte Dateien zaehlen nicht
  (eine Loeschung ist eine Entscheidung des Laufs, kein Schrumpfen).

Gemessen 07.10.2026 ueber 206 Auto-Commits seit 15.09. (Bytes, alt >= 2 KB):
6 Dateien unter 0,75 (kleinste 0,668 victory_road_major_teams.json, Weekly
29.09.), 0 unter 0,5 — der Stopp haette keinen echten Lauf angehalten.

Ausgabe-Zeilen fuer den Aufrufer:
    WARNUNG: <datei> <alt> -> <neu> (<q>)
    STOPP: <datei> <alt> -> <neu> (<q>)
Rueckgabe 0 immer (ein Fehler hier darf das Tor nicht aushebeln — das Tor
prueft danach ohnehin alle Suiten).
"""
import os
import subprocess
import sys

WARNUNG = 0.75
STOPP = 0.5
MIN_BYTES = 2048
NIE = {"data/data_stand.json"}

# SC-41 (20.10.2026, Wochenlauf #186): Dateien, deren Umfang nach einer
# festgelegten Regel legitim auf (fast) null fallen kann. Sie werden weiter
# gemeldet (WARNUNG), aber nie zurueckgesetzt. Jeder Eintrag nennt die Regel.
DARF_SCHRUMPFEN = {
    "data/masterclass_online_listen.json":
        "DA-26 (Hausi 30.09.2026): genau die Listen des 7-Tage-Fensters, 0 bis 5 — "
        "eine leere Gruppe ist richtig, nicht kaputt",
}


def sh(*a):
    return subprocess.run(list(a), capture_output=True, text=True)


def ausgangsstand():
    if sh("git", "rev-parse", "-q", "--verify", "origin/main").returncode == 0:
        if sh("git", "rev-list", "origin/main..HEAD").stdout.strip():
            return "origin/main"
    return "HEAD"


def groesse_alt(basis, f):
    r = sh("git", "cat-file", "-s", f"{basis}:{f}")
    return int(r.stdout) if r.returncode == 0 else None


def bewerten(basis):
    """[(stufe, datei, alt, neu, q)] fuer jede geschrumpfte Datei."""
    geaendert = sh("git", "diff", "--name-only", "--diff-filter=M", basis, "--", "data/").stdout.split()
    befunde = []
    for f in sorted(set(geaendert) - NIE):
        alt = groesse_alt(basis, f)
        if not alt or alt < MIN_BYTES or not os.path.exists(f):
            continue
        neu = os.path.getsize(f)
        q = neu / alt
        if q < STOPP and f not in DARF_SCHRUMPFEN:
            befunde.append(("STOPP", f, alt, neu, q))
        elif q < WARNUNG:
            befunde.append(("WARNUNG", f, alt, neu, q))
    return befunde


def mit_familie(basis, stopp):
    """SC-41: eine Datei geht nie ALLEIN zurueck. Am 20.10. setzte der Waechter
    data/masterclass_online_listen.json zurueck, die daraus schon gebaute
    data/masterclass_live/mega-stalobor.json blieb frisch — das Tor fand den
    Widerspruch und hielt nach 2,5 h Suche die ganze Turnierwoche zurueck.
    Dieselbe Regel wie beim Zuruecksetzen des Tors (SC-29/SC-38): die
    Familie aus scripts/tor_rollback.py geht gemeinsam — mit denselben
    Kandidaten (data/ UND die Bildordner der Ablaeufe, SC-36)."""
    if not stopp:
        return []
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from tor_rollback import einheiten, kandidaten  # noqa: PLC0415
    alle = sorted((set(kandidaten(basis)) | set(stopp)) - NIE)
    mit = set(stopp)
    for e in einheiten(alle):
        if any(f in stopp for f in e):
            mit.update(e)
    return sorted(mit - set(stopp))


def zuruecksetzen(basis, dateien):
    for f in dateien:
        alt = subprocess.run(["git", "show", f"{basis}:{f}"], capture_output=True)
        if alt.returncode == 0:
            open(f, "wb").write(alt.stdout)
        elif os.path.exists(f):  # neu in diesem Lauf: gestern gab es sie nicht
            os.remove(f)
    if dateien:
        sh("git", "reset", "-q", "--", *dateien)
        try:
            sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
            from tor_rollback import stand_nachziehen  # noqa: PLC0415
            stand_nachziehen(basis, dateien)
        except Exception as e:  # noqa: BLE001
            print(f"::warning::schrumpf_waechter: data_stand.json nicht nachgezogen ({e})")


def main():
    if len(sys.argv) != 2 or sys.argv[1] != "pruefen":
        print(__doc__)
        return 1
    try:
        basis = ausgangsstand()
        befunde = bewerten(basis)
        stopp = [f for stufe, f, *_ in befunde if stufe == "STOPP"]
        try:
            familie = mit_familie(basis, stopp)
        except Exception as e:  # noqa: BLE001 — die STOPP-Dateien gehen trotzdem zurueck
            print(f"::warning::schrumpf_waechter: Familie nicht bestimmt ({e})")
            familie = []
        zuruecksetzen(basis, stopp + familie)
        for stufe, f, alt, neu, q in befunde:
            grund = f" — erlaubt: {DARF_SCHRUMPFEN[f]}" if f in DARF_SCHRUMPFEN else ""
            print(f"{stufe}: {f} {alt} -> {neu} ({q:.2f}){grund}")
        if familie:
            # EINE Zeile: GitHub nimmt hoechstens 10 Warnungen je Schritt (SC-37).
            print(f"STOPP-FAMILIE: {' '.join(familie)} (gehen mit {' '.join(stopp)} zurueck)")
    except Exception as e:  # noqa: BLE001
        print(f"::warning::schrumpf_waechter: nicht geprueft ({e})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
