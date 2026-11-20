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


# WZ-51 (20.11.2026, Wochenlauf 44686101979): Schrumpfen nach einer Regel,
# die NUR IN DIESEM LAUF gilt. Anders als DARF_SCHRUMPFEN gilt die Erlaubnis
# nicht fuer immer, sondern nur, wenn der Lauf selbst belegt, dass die Regel
# gegriffen hat:
#
#  1. ROTATION. backend/core/update_sets.py leert bei einem Formatwechsel
#     bestimmte Dateien auf die Kopfzeile (CITY_LEAGUE_ROTATION_DATEIEN,
#     CURRENT_META_ROTATION_DATEIEN). Belegt ist der Wechsel, wenn sich der
#     Schluessel in config/scraper_settings.json gegenueber dem Ausgangsstand
#     geaendert hat. Ohne diese Ausnahme hielte der Waechter nach jeder
#     Rotation die alten Daten fest, bis das neue Format die Haelfte des
#     alten Umfangs erreicht — Wochen.
#  2. VICTORY-ROAD-FRIST. Der Replika-Scraper wirft Teams, die laenger als
#     28 Tage nicht mehr auf der Seite stehen, hinaus und zaehlt sie in
#     _meta.entfallen_nach_frist. Am 20.11. fielen so 80 von 86 Teams
#     (zuletzt gesehen 02.10.). Erlaubt nur, wenn die gezaehlten Abgaenge
#     den Schwund vollstaendig erklaeren.
ROTATION_SCHLUESSEL = (
    (("city_league_analysis", "sources", "city_league", "start_date"),
     "CITY_LEAGUE_ROTATION_DATEIEN"),
    (("current_meta_analysis", "sources", "limitless_online", "format_filter"),
     "CURRENT_META_ROTATION_DATEIEN"),
)
EINSTELLUNGEN = "config/scraper_settings.json"
UPDATE_SETS = "backend/core/update_sets.py"
VR_REPLIKA = "data/victory_road_replika_teams.json"


def sh(*a):
    return subprocess.run(list(a), capture_output=True, text=True)


def _rotationsdateien(name):
    """Die Liste aus update_sets.py, ohne das Modul zu laden (es zieht
    Netzwerk-Bibliotheken nach). Fehlt sie, gibt es keine Erlaubnis."""
    import ast  # noqa: PLC0415
    baum = ast.parse(open(UPDATE_SETS, encoding="utf-8").read())
    for knoten in baum.body:
        if (isinstance(knoten, ast.Assign) and len(knoten.targets) == 1
                and getattr(knoten.targets[0], "id", None) == name):
            return tuple(ast.literal_eval(knoten.value))
    return ()


def _wert(einstellungen, pfad):
    for k in pfad:
        if not isinstance(einstellungen, dict):
            return None
        einstellungen = einstellungen.get(k)
    return einstellungen


def _json_aus(basis, f):
    import json  # noqa: PLC0415
    if basis is None:
        with open(f, encoding="utf-8") as h:
            return json.load(h)
    r = sh("git", "show", f"{basis}:{f}")
    return json.loads(r.stdout) if r.returncode == 0 else None


def laufregel(basis, f):
    """Grund, warum f in DIESEM Lauf schrumpfen darf — oder ''."""
    try:
        alt, neu = _json_aus(basis, EINSTELLUNGEN), _json_aus(None, EINSTELLUNGEN)
        for pfad, liste in ROTATION_SCHLUESSEL:
            va, vn = _wert(alt, pfad), _wert(neu, pfad)
            if va and vn and va != vn and \
                    os.path.basename(f) in _rotationsdateien(liste) and \
                    f.startswith("data/"):
                return (f"Rotation in diesem Lauf: {'.'.join(pfad)} "
                        f"{va} -> {vn} leert die Datei ({liste})")
    except Exception:  # noqa: BLE001 — keine Erlaubnis ist die sichere Seite
        pass
    if f == VR_REPLIKA:
        try:
            a, n = _json_aus(basis, f), _json_aus(None, f)
            ma, mn = a.get("_meta") or {}, n.get("_meta") or {}
            weg = int(mn.get("entfallen_nach_frist") or 0)
            vorher, nachher = len(a.get("teams") or []), len(n.get("teams") or [])
            if weg > 0 and nachher == int(mn.get("team_count") or -1) \
                    and vorher - nachher <= weg:
                return (f"28-Tage-Frist des Replika-Scrapers: {weg} Teams "
                        f"entfallen, {vorher} -> {nachher}")
        except Exception:  # noqa: BLE001
            pass
    return ""


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
            grund = laufregel(basis, f)
            if grund:
                LAUFGRUND[f] = grund
                befunde.append(("WARNUNG", f, alt, neu, q))
            else:
                befunde.append(("STOPP", f, alt, neu, q))
        elif q < WARNUNG:
            befunde.append(("WARNUNG", f, alt, neu, q))
    return befunde


LAUFGRUND = {}


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
            grund = (f" — erlaubt: {DARF_SCHRUMPFEN[f]}" if f in DARF_SCHRUMPFEN
                     else f" — erlaubt: {LAUFGRUND[f]}" if f in LAUFGRUND else "")
            print(f"{stufe}: {f} {alt} -> {neu} ({q:.2f}){grund}")
        if familie:
            # EINE Zeile: GitHub nimmt hoechstens 10 Warnungen je Schritt (SC-37).
            print(f"STOPP-FAMILIE: {' '.join(familie)} (gehen mit {' '.join(stopp)} zurueck)")
    except Exception as e:  # noqa: BLE001
        print(f"::warning::schrumpf_waechter: nicht geprueft ({e})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
