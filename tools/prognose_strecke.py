#!/usr/bin/env python3
"""Messstrecke fuer die Meta-Anteilsprognose — leckfrei, ueber alle Epochen.

WARUM ES DIESE DATEI GIBT

Der ausgelieferte Motor hat 46 Stufen. Sein eigenes Kalibrierwerkzeug misst
ihn bei 2,92 pp gegen eine naive Grundlinie von 2,81 pp — er ist schlechter
als nichts zu tun. Trotzdem wurde jede dieser Stufen einmal eingebaut, weil
sie plausibel klang. Plausibel ist keine Messung.

Diese Datei ist die Messung. Ein Modell ist eine Funktion, die aus Daten VOR
einem Turnier die Deckanteile DIESES Turniers vorhersagt. Sie wird gegen die
tatsaechlichen Anteile gehalten, ueber 54 Turniere aus zehn Formatepochen.
Kein Modell kommt in den Motor, das hier nicht gegen die Grundlinien gewinnt.

ZWEI GLEISE, UND WARUM

  Gleis A — 54 Ziele. Modelle, die nur Praesenzturniere lesen.
  Gleis B —  7 Ziele. Modelle, die zusaetzlich die Online-Leiter lesen.

Der Unterschied ist keine Designentscheidung, sondern die Datenlage:
data/online_share_history reicht bis 2026-04-29 zurueck, die Turniere bis
2024-09-14. Vor sieben Turnieren gibt es eine Leiter, vor 47 nicht.

Das ist der wichtigste Satz dieser Datei: der ausgelieferte Motor gewichtet
die Online-Leiter mit 15 % (Betriebsart B) bzw. 30 % (Betriebsart A) — und
diese Gewichtung war noch nie an mehr als sieben Turnieren pruefbar. Wer auf
Gleis B optimiert, optimiert auf sieben Punkte.

DIE KENNZAHL

Mittlerer absoluter Fehler in Prozentpunkten ueber die Decks, die beim
Zielturnier tatsaechlich mindestens MIN_ANTEIL Prozent hatten. Dazu der
Standardfehler — ohne ihn liest sich jede Differenz wie ein Ergebnis.

Ein Modell, das ein Deck gar nicht kennt, sagt 0 % vorher. Das ist kein
Sonderfall, sondern die ehrliche Antwort, und wird auch so gewertet.
"""

import csv
import glob
import io
import os
import statistics
from collections import defaultdict

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.dirname(HIER)
DATEN = os.path.join(WURZEL, "data")

MIN_ANTEIL = 1.0     # Decks unter 1 % beim Ziel zaehlen nicht in den Fehler
MIN_DECKS = 8        # Turniere mit weniger verwertbaren Decks sind kein Ziel


def zahl(w, standard=0.0):
    try:
        return float(str(w).replace(",", "."))
    except (TypeError, ValueError):
        return standard


def schluessel(name):
    import re
    return re.sub(r"[^a-z0-9]+", "", (name or "").lower())


# ── Daten ────────────────────────────────────────────────────────────────

def lies_turniere(datenordner=DATEN):
    """Alle Praesenzturniere, JEDES GENAU EINMAL.

    Die Sammeldatei labs_tournament_decks.csv enthaelt alle 70 Turniere, und
    die 13 Epochendateien enthalten dieselben Turniere noch einmal. Wer beide
    einliest, zaehlt jeden Spieler doppelt. Fuer Anteile faellt das nicht auf
    (Zaehler und Nenner verdoppeln sich), aber jedes Modell, das mit absoluten
    Spielerzahlen rechnet — und jede Schrumpfung gegen eine feste Staerke k —
    bekommt dadurch die halbe Wirkung. Deshalb: erste Datei gewinnt, spaetere
    Zeilen derselben Turnier-ID werden verworfen.
    """
    zeilen = []
    gesehen = set()
    for pfad in sorted(glob.glob(os.path.join(datenordner, "labs_tournament_decks*.csv"))):
        with open(pfad, encoding="utf-8-sig", newline="") as f:
            for r in csv.DictReader(f):
                tid = (r.get("tournament_id") or "").strip()
                deck = (r.get("deck_name") or "").strip()
                if not tid:
                    continue
                marke = (tid, deck)
                if marke in gesehen:
                    continue
                gesehen.add(marke)
                zeilen.append(r)
    t = {}
    for r in zeilen:
        tid = (r.get("tournament_id") or "").strip()
        if not tid:
            continue
        e = t.setdefault(tid, {
            "id": tid,
            "datum": (r.get("tournament_date") or "").strip(),
            "meta": (r.get("meta") or "").strip(),
            "name": (r.get("tournament_name") or "").strip(),
            "spieler": int(zahl(r.get("total_players"))),
            "zeilen": [],
        })
        e["zeilen"].append(r)
    return sorted((x for x in t.values() if x["datum"] and x["meta"]),
                  key=lambda x: (x["datum"], x["id"]))


def anteile(turnier):
    """{deckschluessel: anteil_prozent} eines Turniers, aus day1 wenn vorhanden."""
    aus = defaultdict(float)
    namen = {}
    d1 = sum(zahl(r.get("day1_players")) for r in turnier["zeilen"])
    for r in turnier["zeilen"]:
        k = schluessel(r.get("deck_name"))
        if not k:
            continue
        if d1 > 0:
            aus[k] += zahl(r.get("day1_players")) / d1 * 100.0
        else:
            aus[k] += zahl(r.get("share_pct"))
        namen.setdefault(k, (r.get("deck_name") or "").strip())
    return dict(aus), namen


def lies_leiter(datenordner=DATEN):
    """{stichtag: {deckschluessel: anteil}} aus data/online_share_history."""
    aus = {}
    for pfad in sorted(glob.glob(os.path.join(datenordner, "online_share_history", "20??-??-??.csv"))):
        tag = os.path.basename(pfad)[:-4]
        d = {}
        with open(pfad, encoding="utf-8-sig", newline="") as f:
            for r in csv.DictReader(f, delimiter=";"):
                k = schluessel(r.get("deck_name"))
                if k:
                    d[k] = zahl(r.get("share"))
        if d:
            aus[tag] = d
    return aus


# ── Strecke ──────────────────────────────────────────────────────────────

def ziele(turniere, braucht_leiter=False, leiter=None):
    """Alle Turniere, die als Ziel taugen, mit dem was VOR ihnen bekannt war."""
    aus = []
    for i, z in enumerate(turniere):
        ist, namen = anteile(z)
        gross = {k: v for k, v in ist.items() if v >= MIN_ANTEIL}
        if len(gross) < MIN_DECKS:
            continue
        vorher = [t for t in turniere if t["datum"] < z["datum"]]
        gleiche = [t for t in vorher if t["meta"] == z["meta"]]
        if not gleiche:
            continue
        stichtag = None
        if leiter:
            frueher = [d for d in sorted(leiter) if d < z["datum"]]
            stichtag = frueher[-1] if frueher else None
        if braucht_leiter and not stichtag:
            continue
        aus.append({
            "ziel": z, "ist": ist, "gross": gross, "namen": namen,
            "vorher": vorher, "gleiche": gleiche,
            "leiter": leiter.get(stichtag) if (leiter and stichtag) else None,
            "leiter_stichtag": stichtag,
        })
    return aus


def messe(modell, faelle, name=""):
    """Ein Modell ueber die Faelle laufen lassen. Gibt Kennzahlen zurueck."""
    fehler_je_fall = []
    detail = []
    for f in faelle:
        vorhersage = modell(f) or {}
        summe = sum(vorhersage.values())
        if summe > 0:
            vorhersage = {k: v / summe * 100.0 for k, v in vorhersage.items()}
        abweichungen = [abs(vorhersage.get(k, 0.0) - v) for k, v in f["gross"].items()]
        mae = statistics.mean(abweichungen) if abweichungen else None
        if mae is None:
            continue
        fehler_je_fall.append(mae)
        detail.append({"turnier": f["ziel"]["name"], "datum": f["ziel"]["datum"],
                       "meta": f["ziel"]["meta"], "mae": mae, "decks": len(f["gross"])})
    if not fehler_je_fall:
        return None
    n = len(fehler_je_fall)
    mw = statistics.mean(fehler_je_fall)
    se = statistics.stdev(fehler_je_fall) / (n ** 0.5) if n > 1 else 0.0
    return {"name": name, "n": n, "mae": mw, "se": se,
            "median": statistics.median(fehler_je_fall),
            "schlechtester": max(fehler_je_fall), "detail": detail,
            "roh": fehler_je_fall}


def vergleiche(a, b):
    """Paarweiser Vergleich zweier Messungen ueber DIESELBEN Faelle."""
    if not a or not b or len(a["roh"]) != len(b["roh"]):
        return None
    d = [x - y for x, y in zip(a["roh"], b["roh"])]   # a minus b
    n = len(d)
    mw = statistics.mean(d)
    se = statistics.stdev(d) / (n ** 0.5) if n > 1 else 0.0
    return {"differenz": mw, "se": se, "t": (mw / se) if se > 0 else 0.0,
            "a_besser_in": sum(1 for x in d if x < 0), "n": n}


# ── Grundlinien ──────────────────────────────────────────────────────────

def gl_letztes_turnier(f):
    """Das letzte Turnier derselben Epoche, unveraendert uebernommen."""
    ist, _ = anteile(f["gleiche"][-1])
    return ist


def gl_mittel_epoche(f):
    """Mittel ueber alle bisherigen Turniere derselben Epoche."""
    summe = defaultdict(float)
    for t in f["gleiche"]:
        ist, _ = anteile(t)
        for k, v in ist.items():
            summe[k] += v
    n = len(f["gleiche"])
    return {k: v / n for k, v in summe.items()}


def gl_letzte_zwei(f):
    """Mittel der letzten zwei Turniere derselben Epoche."""
    letzte = f["gleiche"][-2:]
    summe = defaultdict(float)
    for t in letzte:
        ist, _ = anteile(t)
        for k, v in ist.items():
            summe[k] += v
    return {k: v / len(letzte) for k, v in summe.items()}


def gl_leiter(f):
    """Die Online-Leiter unveraendert. Nur auf Gleis B verfuegbar."""
    return dict(f["leiter"]) if f["leiter"] else {}


def gl_gleichverteilt(f):
    """Alle bekannten Decks gleich. Die duemmste denkbare Antwort."""
    bekannt = set()
    for t in f["gleiche"]:
        ist, _ = anteile(t)
        bekannt.update(ist)
    return {k: 1.0 for k in bekannt}


GRUNDLINIEN = [
    ("letztes Turnier", gl_letztes_turnier),
    ("letzte zwei", gl_letzte_zwei),
    ("Mittel der Epoche", gl_mittel_epoche),
    ("gleichverteilt", gl_gleichverteilt),
]


def bericht(messungen, referenz=None):
    breite = max(len(m["name"]) for m in messungen if m)
    print(f"{'Modell'.ljust(breite)}  {'n':>3}  {'MAE':>6}  {'SE':>5}  {'Median':>6}  {'schlecht.':>9}")
    print("-" * (breite + 40))
    for m in sorted((x for x in messungen if x), key=lambda x: x["mae"]):
        print(f"{m['name'].ljust(breite)}  {m['n']:>3}  {m['mae']:6.3f}  {m['se']:5.3f}  "
              f"{m['median']:6.3f}  {m['schlechtester']:9.3f}")
    if referenz:
        print()
        for m in sorted((x for x in messungen if x and x is not referenz), key=lambda x: x["mae"]):
            v = vergleiche(m, referenz)
            if not v:
                continue
            urteil = "besser" if v["t"] < -2 else ("schlechter" if v["t"] > 2 else "nicht unterscheidbar")
            print(f"  {m['name']:<28} gegen {referenz['name']}: {v['differenz']:+6.3f} pp "
                  f"(SE {v['se']:.3f}, t={v['t']:+5.2f}) — {urteil}, besser in {v['a_besser_in']}/{v['n']}")


def main():
    turniere = lies_turniere()
    leiter = lies_leiter()
    for gleis, brauchtL in (("A (nur Praesenz)", False), ("B (mit Online-Leiter)", True)):
        faelle = ziele(turniere, braucht_leiter=brauchtL, leiter=leiter)
        print(f"\n=== Gleis {gleis}: {len(faelle)} Ziele ===")
        if not faelle:
            continue
        modelle = list(GRUNDLINIEN) + ([("Online-Leiter roh", gl_leiter)] if brauchtL else [])
        messungen = [messe(fn, faelle, nm) for nm, fn in modelle]
        ref = next((m for m in messungen if m and m["name"] == "letztes Turnier"), None)
        bericht(messungen, ref)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
