#!/usr/bin/env python3
"""Wie oft wird eine Karte auf Majors gespielt? (UI-166, Hausi 25.11.2026)

Fuer die Wunschliste: „damit ich immer die richtige Menge in der Wishlist setzen
kann“. Je Karte, ueber alle Major-Listen (`quelle == papier` in den Auszuegen
`tournament_decklists_per_player_<META>_<MONAT>.csv`), die die Karte spielen:

    decks  = Zahl der Listen mit der Karte
    meist  = haeufigste Anzahl in diesen Listen (bei Gleichstand die hoehere)
    max    = hoechste Anzahl

Gezaehlt wird je Liste ueber ALLE Prints derselben Karte — die Familie kommt aus
`international_prints` in all_cards_database.csv, verbunden ueber (Set, Nummer),
nie ueber den Namen (zwei Piplup mit verschiedenen Attacken sind zwei Karten).

Fenster: die Majors des aktuellen Formats (`TEF-<current_set>`). Gibt es dort
weniger als MIN_MAJORS Turniere, kommen die Majors des vorigen Formats
(`previous_format_key`) dazu — sonst stuende nach jedem Setwechsel wochenlang
fast nichts da. Welche Formate es waren, steht in `_meta`.

Ausgabe: data/major_kartenmengen.json — {"karten": {"SET-NUM": {...}}, "_meta": {...}}.
Jeder Print einer gespielten Familie bekommt dieselben Zahlen, damit die Seite
ohne Familienlogik nachschlagen kann.
"""

import collections
import csv
import glob
import json
import os
import sys
from datetime import datetime, timezone

MIN_MAJORS = 2


def _fenster(data_dir):
    with open(os.path.join(data_dir, "format_window.json"), encoding="utf-8") as f:
        fw = json.load(f)
    aktuell = "TEF-" + str(fw.get("current_set") or "").strip()
    vorher = str(fw.get("previous_format_key") or "").strip()
    return aktuell, vorher


def _familien(data_dir):
    """(SET, NUM) -> frozenset der Prints derselben Karte."""
    fam = {}
    with open(os.path.join(data_dir, "all_cards_database.csv"), encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            s, n = (r.get("set") or "").strip(), (r.get("number") or "").strip()
            if not s or not n:
                continue
            menge = {(s, n)}
            for p in (r.get("international_prints") or "").split(","):
                p = p.strip()
                if "-" in p:
                    a, b = p.rsplit("-", 1)
                    menge.add((a.strip(), b.strip()))
            fam[(s, n)] = menge
    # Symmetrisch schliessen: steht B in A's Liste, gehoert A auch zu B.
    for k, menge in list(fam.items()):
        for m in menge:
            fam.setdefault(m, {m}).update(menge)
    return {k: frozenset(v) for k, v in fam.items()}


def _major_listen(data_dir, meta):
    """{(turnier, spieler): Counter{(SET, NUM): anzahl}} und die Turniernamen."""
    listen = collections.defaultdict(collections.Counter)
    turniere = set()
    for pfad in sorted(glob.glob(os.path.join(data_dir, f"tournament_decklists_per_player_{meta}_*.csv"))):
        with open(pfad, encoding="utf-8", newline="") as f:
            for r in csv.DictReader(f):
                if (r.get("quelle") or "") != "papier":
                    continue
                try:
                    anzahl = int(r.get("count") or 0)
                except ValueError:
                    continue
                if anzahl <= 0:
                    continue
                schluessel = (r.get("tournament_name") or "", r.get("player_name") or "")
                listen[schluessel][((r.get("set_code") or "").strip(), (r.get("set_number") or "").strip())] += anzahl
                turniere.add((r.get("tournament_date") or "", r.get("tournament_name") or ""))
    return listen, turniere


def kennzahlen(anzahlen):
    """Reine Regel (ausgefuehrt in tests/python/test_major_kartenmengen.py)."""
    werte = [a for a in anzahlen if a > 0]
    if not werte:
        return None
    zaehler = collections.Counter(werte)
    hoechste = max(zaehler.values())
    meist = max(a for a, n in zaehler.items() if n == hoechste)
    return {"decks": len(werte), "meist": meist, "max": max(werte)}


def berechne(data_dir):
    aktuell, vorher = _fenster(data_dir)
    listen, turniere = _major_listen(data_dir, aktuell)
    formate = [aktuell]
    if len(turniere) < MIN_MAJORS and vorher:
        l2, t2 = _major_listen(data_dir, vorher)
        for k, v in l2.items():
            listen[(vorher,) + k] = v
        turniere |= t2
        formate.append(vorher)

    familien = _familien(data_dir)
    # Familie je gespieltem Print; Prints ohne Datenbankeintrag bleiben fuer sich.
    fam_von = {}
    for liste in listen.values():
        for p in liste:
            fam_von.setdefault(p, familien.get(p, frozenset({p})))

    je_familie = {}
    for fam in set(fam_von.values()):
        anzahlen = [sum(n for p, n in liste.items() if p in fam) for liste in listen.values()]
        k = kennzahlen(anzahlen)
        if k:
            je_familie[fam] = k

    karten = {}
    for fam, k in je_familie.items():
        for s, n in fam:
            karten[f"{s}-{n}"] = k
    return {
        "_meta": {
            "erzeugt_am": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "formate": formate,
            "majors": len(turniere),
            "listen": len(listen),
            "turniere": [name for _, name in sorted(turniere)],
            "regel": "Major-Listen (quelle papier); je Liste ueber alle Prints der Karte "
                     "(international_prints); meist = haeufigste Anzahl, bei Gleichstand die hoehere; "
                     f"vorheriges Format dazu, solange das aktuelle weniger als {MIN_MAJORS} Majors hat",
        },
        "karten": dict(sorted(karten.items())),
    }


def main(argv):
    data_dir = argv[1] if len(argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "data")
    data_dir = os.path.abspath(data_dir)
    ergebnis = berechne(data_dir)
    ziel = os.path.join(data_dir, "major_kartenmengen.json")
    tmp = ziel + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(ergebnis, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    os.replace(tmp, ziel)
    m = ergebnis["_meta"]
    print(f"major_kartenmengen.json: {len(ergebnis['karten'])} Prints, "
          f"{m['majors']} Majors, {m['listen']} Listen, Formate {m['formate']}")
    if not ergebnis["karten"]:
        print("::warning::major_kartenmengen.json ist leer — keine Major-Listen im Fenster")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
