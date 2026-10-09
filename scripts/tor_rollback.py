#!/usr/bin/env python3
"""Rote Datendatei zurueckrollen, statt den ganzen Lauf zu verwerfen.

Aufruf (nur aus scripts/tor_vor_dem_push.sh):
    python3 scripts/tor_rollback.py suchen  <protokollordner> <sicherung>
    python3 scripts/tor_rollback.py zurueck <sicherung>

WARUM (07.10.2026): fuenf der sieben roten Planlaeufe seit dem 25.09. waren
das Tor, das an einer DATENABHAENGIGEN Zusicherung haengenblieb — eine neue
Art im Pokedex, ein Name ohne Mehrheit, ein Quellenfehler. Jedes Mal wurde
die eine Zusicherung repariert, und der naechste Tagesstand kippte die
naechste. Wer dann pusht, haelt mit rotem main den Deploy an; wer nicht
pusht, verliert den ganzen Lauf. Dieses Skript tut das Dritte: es findet
die Datendatei(en), die die roten Zusicherungen brechen, laesst sie auf dem
Stand von gestern und gibt den Rest frei. main bleibt gruen.

Ablauf `suchen`:
  1. Die roten Zusicherungen aus den Tor-Protokollen lesen (pytest `FAILED`,
     JS `✗ datei`). Ist etwas rot, das sich nicht benennen laesst (Absturz
     beim Einsammeln, unlesbare Meldung), ist das KEIN Datenbefund: Abbruch.
  2. Kandidaten = geaenderte oder neue Dateien unter data/ gegen den
     Ausgangsstand (origin/main, wenn HEAD davor liegt, sonst HEAD).
  3. Alle Kandidaten zurueck: werden die roten Zusicherungen dadurch nicht
     gruen, liegt es nicht an den Daten: Abbruch, alles wie vorher.
  4. Sonst Datei fuer Datei: bleibt es gruen, wenn die Datei ihren neuen
     Stand behaelt, behaelt sie ihn. Uebrig bleibt eine minimale Menge.
  5. Die Menge steht in der Sicherung/manifest.json; die Dateien liegen
     dort im neuen Stand, damit `zurueck` alles herstellen kann.

Rueckgabe 0 = Menge gefunden und angewendet (der Aufrufer prueft danach
noch einmal ALLE Suiten), 2 = nicht heilbar, alles unveraendert,
3 = beim zweiten Lauf von selbst gruen (unstabiler Test): nichts zurueckgerollt.
"""
import json
import os
import re
import shutil
import subprocess
import sys

MAX_KANDIDATEN = 80
# abgeleitet: data_stand.json wird nach dem Rebase neu gebaut, das
# Luecken-Inventar nach jedem Zurueckrollen (SC-29, siehe LUECKEN).
NIE_ZURUECK = {"data/data_stand.json", "data/datenluecken.json"}

# FAMILIEN (SC-29, 09.10.2026): Dateien, die im selben Lauf auseinander
# gebaut werden, rollen nur GEMEINSAM zurueck. Lauf #150 (Champions Replica
# Scrape) liess champions_usage.json und champions_resources.json alt, den
# daraus gebauten champions_pokedex.json aber neu — die Suche prueft nur die
# zuerst roten Zusicherungen, der Gesamtlauf danach fand den Widerspruch
# ("Mega Baxcalibur: Anteil 58.1 statt 74.4"), und der ganze Tag war weg.
# Die Champions-Bauer lesen sich kreuz und quer (Pokedex <- Nutzung,
# Kader, Namen; Ressourcen <- Nutzung, op.gg; Merkmale <- Ressourcen),
# deshalb ist die Familie das ganze Champions-Datenpaket.
FAMILIEN = [
    ("champions", re.compile(r"^data/(champions_[^/]+|opgg_champions_moves\.json)$")),
]


def sh(*cmd, **kw):
    return subprocess.run(list(cmd), capture_output=True, text=True, **kw)


def ausgangsstand():
    if sh("git", "rev-parse", "-q", "--verify", "origin/main").returncode == 0:
        if sh("git", "rev-list", "origin/main..HEAD").stdout.strip():
            return "origin/main"
    return "HEAD"


def kandidaten(basis):
    geaendert = sh("git", "diff", "--name-only", basis, "--", "data/").stdout.split()
    neu = sh("git", "ls-files", "-o", "--exclude-standard", "data/").stdout.split()
    return sorted({f for f in geaendert + neu if f not in NIE_ZURUECK})


def rote_zusicherungen(ordner):
    py, js, unlesbar = [], [], []
    for name in sorted(os.listdir(ordner)):
        if not name.endswith(".log"):
            continue
        text = open(os.path.join(ordner, name), encoding="utf-8", errors="replace").read()
        vorher = (len(py), len(js))
        py += re.findall(r"^FAILED (\S+?::.+?)(?: - .*)?$", text, re.M)
        js += re.findall(r"^✗ (\S+) —", text, re.M)
        if re.search(r"^ERROR ", text, re.M):
            unlesbar.append(name + ": Fehler beim Einsammeln")
        if name.startswith("js") and re.search(r"abgebrochen|gemeldet, aber nur", text):
            unlesbar.append(name + ": Absturz ohne gezaehlten Fehlschlag")
        rot = re.search(r"[1-9]\d* (failed|error)|^✗", text, re.M)
        if rot and (len(py), len(js)) == vorher:
            unlesbar.append(name + ": rot, aber keine Zusicherung benennbar")
    return sorted(set(py)), sorted(set(js)), unlesbar


def einheiten(dateien):
    """Kandidaten zu Einheiten buendeln: eine Familie ist EINE Einheit."""
    familien, einzeln = {}, []
    for f in dateien:
        name = next((n for n, muster in FAMILIEN if muster.match(f)), None)
        if name:
            familien.setdefault(name, []).append(f)
        else:
            einzeln.append([f])
    return [familien[n] for n in sorted(familien)] + einzeln


LUECKEN = "scripts/datenluecken.py"


def luecken_neu():
    """SC-29: data/datenluecken.json ist aus den Daten abgeleitet. Nach jedem
    Umschalten neu erzeugen, sonst ist es nach dem Zurueckrollen veraltet
    (test_datenluecken.py: "datenluecken.json ist veraltet")."""
    if os.path.exists(LUECKEN):
        sh(sys.executable, LUECKEN)


def nachschlagetabellen():
    os.makedirs("backend/core/data", exist_ok=True)
    for f in os.listdir("data"):
        if f.endswith((".csv", ".json")):
            ziel = os.path.join("backend/core/data", f)
            if os.path.lexists(ziel):
                os.remove(ziel)  # Hartverknuepfung vom Tor loesen, sonst schreibt man data/ mit
            shutil.copyfile(os.path.join("data", f), ziel)


def stand_setzen(basis, dateien, sicherung, zuruck):
    """zuruck=True: Dateien auf den Ausgangsstand; False: auf den neuen Stand."""
    for f in dateien:
        if zuruck:
            alt = subprocess.run(["git", "show", f"{basis}:{f}"], capture_output=True)
            if alt.returncode == 0:
                open(f, "wb").write(alt.stdout)
            elif os.path.exists(f):
                os.remove(f)
        else:
            src = os.path.join(sicherung, "neu", f)
            if os.path.exists(src):
                os.makedirs(os.path.dirname(f), exist_ok=True)
                shutil.copyfile(src, f)
            elif os.path.exists(os.path.join(sicherung, "geloescht", f)) and os.path.exists(f):
                os.remove(f)  # der Lauf hat die Datei geloescht: so wieder herstellen
    sh("git", "reset", "-q", "--", *dateien) if dateien else None  # nichts Rotes im Index
    nachschlagetabellen()
    luecken_neu()


STAND = "data/data_stand.json"


def stand_nachziehen(basis, zurueck):
    """DA-53 (07.10.2026): data_stand.json wird VOR dem Tor gestempelt. Eine
    zurueckgerollte Datei behielte sonst den Zeitpunkt dieses Laufs, obwohl
    sie den Stand von gestern traegt. Fuer jede zurueckgerollte Datei gelten
    wieder die Angaben des Ausgangsstands (oder keine, wenn es dort keine gab)."""
    if not zurueck or not os.path.exists(STAND):
        return []
    alt_roh = subprocess.run(["git", "show", f"{basis}:{STAND}"], capture_output=True, text=True)
    try:
        alt = json.loads(alt_roh.stdout) if alt_roh.returncode == 0 else {}
        neu = json.load(open(STAND, encoding="utf-8"))
    except ValueError:
        return []
    namen = {os.path.basename(f) for f in zurueck}
    geaendert = []
    for feld in ("dateien", "inhalt_bis"):
        a, n = alt.get(feld) or {}, neu.get(feld)
        if not isinstance(n, dict):
            continue
        for name in namen:
            vorher = n.get(name)
            if name in a:
                n[name] = a[name]
            else:
                n.pop(name, None)
            if n.get(name) != vorher:
                geaendert.append(f"{feld}/{name}")
    for feld in ("leer", "ohne_stand", "inhaltsspalte_unlesbar"):
        a, n = alt.get(feld) or [], neu.get(feld)
        if not isinstance(n, list):
            continue
        rest = [x for x in n if not any(name in str(x) for name in namen)]
        rest += [x for x in a if any(name in str(x) for name in namen)]
        if rest != n:
            neu[feld] = rest
            geaendert.append(feld)
    if geaendert:
        with open(STAND, "w", encoding="utf-8") as fh:
            json.dump(neu, fh, indent=2, ensure_ascii=False)
            fh.write("\n")
    return geaendert


def gruen(py, js):
    if py:
        r = sh(sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider", *py)
        if r.returncode != 0:
            return False
    for datei in js:
        r = sh("node", "--test", datei)
        if r.returncode != 0 or re.search(r"^not ok ", r.stdout, re.M):
            return False
    return True


def suchen(ordner, sicherung):
    py, js, unlesbar = rote_zusicherungen(ordner)
    if unlesbar or not (py or js):
        print("Kein Datenbefund — nicht zurueckgerollt: " + ("; ".join(unlesbar) or "keine rote Zusicherung benennbar"))
        return 2
    basis = ausgangsstand()
    kand = kandidaten(basis)
    if not kand or len(kand) > MAX_KANDIDATEN:
        print(f"Kein Datenbefund — {len(kand)} geaenderte Dateien unter data/ (1..{MAX_KANDIDATEN} noetig)")
        return 2
    for f in kand:  # neuen Stand sichern (auch: geloescht)
        if os.path.exists(f):
            os.makedirs(os.path.dirname(os.path.join(sicherung, "neu", f)), exist_ok=True)
            shutil.copyfile(f, os.path.join(sicherung, "neu", f))
        else:
            ziel = os.path.join(sicherung, "geloescht", f)
            os.makedirs(os.path.dirname(ziel), exist_ok=True)
            open(ziel, "w").close()
    if os.path.exists("data/datenluecken.json"):  # SC-29: so, wie der Lauf es baute
        shutil.copyfile("data/datenluecken.json", os.path.join(sicherung, "datenluecken.vorher.json"))
    json.dump({"basis": basis, "kandidaten": kand, "zurueck": []},
              open(os.path.join(sicherung, "manifest.json"), "w"))
    stand_setzen(basis, kand, sicherung, True)
    if not gruen(py, js):
        stand_setzen(basis, kand, sicherung, False)
        luecken_zurueck(sicherung)
        print(f"Kein Datenbefund — auch mit allen {len(kand)} Dateien auf dem Stand von {basis} bleiben "
              f"{len(py) + len(js)} Zusicherung(en) rot")
        return 2
    zurueck = list(kand)
    for einheit in einheiten(kand):
        rest = [x for x in zurueck if x not in einheit]
        stand_setzen(basis, einheit, sicherung, False)
        if gruen(py, js):
            zurueck = rest
        else:
            stand_setzen(basis, einheit, sicherung, True)
    manifest = {"basis": basis, "kandidaten": kand, "zurueck": zurueck,
                "rot": py + js}
    json.dump(manifest, open(os.path.join(sicherung, "manifest.json"), "w"), indent=1)
    if not zurueck:
        luecken_zurueck(sicherung)
        print("Kein Datenbefund — die Zusicherungen wurden beim zweiten Lauf von selbst gruen "
              "(unstabiler Test?). Nichts zurueckgerollt, aber gemeldet.")
        print("ZURUECK: ")
        return 3
    if os.path.exists(STAND):
        shutil.copyfile(STAND, os.path.join(sicherung, "data_stand.vorher.json"))
    nachgezogen = stand_nachziehen(basis, zurueck)
    if nachgezogen:
        print("data_stand.json fuer die zurueckgerollten Dateien auf den Ausgangsstand gesetzt: "
              + ", ".join(nachgezogen))
    print("ZURUECK: " + " ".join(zurueck))
    return 0


def luecken_zurueck(sicherung):
    vorher = os.path.join(sicherung, "datenluecken.vorher.json")
    if os.path.exists(vorher):
        shutil.copyfile(vorher, "data/datenluecken.json")


def zurueck(sicherung):
    m = json.load(open(os.path.join(sicherung, "manifest.json")))
    stand_setzen(m["basis"], m["kandidaten"], sicherung, False)
    luecken_zurueck(sicherung)  # SC-29: das Inventar wie der Lauf es baute
    vorher = os.path.join(sicherung, "data_stand.vorher.json")
    if os.path.exists(vorher):
        shutil.copyfile(vorher, STAND)  # DA-53: auch den Datenstand wie der Lauf ihn baute
    print("Alle Dateien wieder auf dem Stand des Laufs.")
    return 0


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == "suchen":
        sys.exit(suchen(sys.argv[2], sys.argv[3]))
    if len(sys.argv) == 3 and sys.argv[1] == "zurueck":
        sys.exit(zurueck(sys.argv[2]))
    print(__doc__)
    sys.exit(1)
