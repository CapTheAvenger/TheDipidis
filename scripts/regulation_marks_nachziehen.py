#!/usr/bin/env python3
"""Zieht data/regulation_marks.json aus der Quelle nach (DA-28).

BESTELLUNG (Hausi, 30.09.2026): Die Standard-Legalitaet soll ueber die
Regulierungsmarken laufen, nicht ueber eine Pauschale fuer SVP/SVE
(js/archetyp-box.js PAUSCHAL_LEGAL, getFormatLegalSetCodes). Aktuell steht
in all_cards_database.csv keine Marke.

QUELLE — gemessen am 30.09.2026 im Browser (Geraete-Proxy: 403, NICHT der
Browser)
    limitlesstcg.com/cards?q=regulation%3D<M>&display=list&show=100&page=N
    Marke G 1647 / H 1303 / I 1277 / J 640 englische Drucke (Stand 30.09.)
Jede Zeile einer Seite ist ein Druck; der Link /cards/<SET>/<NR> nennt
(set, number). Eine leere Seite beendet die Liste. Verbunden wird nie ueber
den Namen (CLAUDE.md), nur ueber (set, number).

DATEIFORMAT  marks[<Marke>][<SET>] = "1-5,9,12-14"  (Nummern-Bereiche;
Nicht-Zahlen wie "G" oder "CC30" einzeln). Zaehlung je Marke in counts.

WAS NICHT PASSIERT
  * Liefert eine Marke nichts oder weniger als 90 % ihres bisherigen
    Umfangs, wird NICHTS geschrieben (::warning::). Eine geaenderte Seite
    darf keine Liste aus Unsinn erzeugen.
  * Aendert sich nichts, wird die Datei nicht angefasst (kein Zeitstempel).
  * Gemeldete Luecken: Drucke ohne Marke auf der Quelle (alte Sets), JP-Drucke
    (die Quelle filtert hier auf Englisch) sind NICHT enthalten.

Aufruf:  python3 scripts/regulation_marks_nachziehen.py [--trocken]
Rueckgabe 0 auch bei unerreichbarer Quelle; 2 nur bei unlesbarer Datei.
"""

import argparse
import datetime as dt
import json
import os
import re
import sys
import time

WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATEI = os.path.join(WURZEL, "data", "regulation_marks.json")
MARKEN = ["G", "H", "I", "J"]
QUELLE = "https://limitlesstcg.com/cards?q=regulation%3D{m}&display=list&show=100&page={p}"
MAX_SEITEN = 40
MINDEST_ANTEIL = 0.9

_ZEILE = re.compile(
    r'<tr\b[^>]*>\s*<td><span class="card-set"[\s\S]*?<a href="/cards/([A-Za-z0-9]+)/([^"/]+)"')


def drucke_aus_seite(html):
    """Liefert [(set, number), ...] einer Listenseite, in Reihenfolge."""
    return [(s, n) for s, n in _ZEILE.findall(html)]


def komprimiere(nummern):
    zahlen = sorted({int(n) for n in nummern if n.isdigit()})
    sonst = sorted({n for n in nummern if not n.isdigit()})
    teile, i = [], 0
    while i < len(zahlen):
        j = i
        while j + 1 < len(zahlen) and zahlen[j + 1] == zahlen[j] + 1:
            j += 1
        teile.append(str(zahlen[i]) if i == j else f"{zahlen[i]}-{zahlen[j]}")
        i = j + 1
    return ",".join(teile + sonst)


def expandiere(text):
    out = []
    for p in text.split(","):
        m = re.fullmatch(r"(\d+)-(\d+)", p)
        if m:
            out.extend(str(k) for k in range(int(m.group(1)), int(m.group(2)) + 1))
        elif p:
            out.append(p)
    return out


def baue(drucke_je_marke):
    marks = {}
    for m, drucke in drucke_je_marke.items():
        je_set = {}
        for s, n in drucke:
            je_set.setdefault(s, []).append(n)
        marks[m] = {s: komprimiere(ns) for s, ns in sorted(je_set.items())}
    counts = {m: sum(len(set(expandiere(v))) for v in marks[m].values()) for m in marks}
    return marks, counts


def lade_marke(marke, holen):
    alle = []
    for p in range(1, MAX_SEITEN + 1):
        html = holen(QUELLE.format(m=marke, p=p))
        zeilen = drucke_aus_seite(html)
        if not zeilen:
            break
        alle.extend(zeilen)
    return alle


def http_holen(url):
    import requests
    r = requests.get(url, timeout=30, headers={"User-Agent": "Mozilla/5.0 (TheDipidis Datenabgleich)"})
    r.raise_for_status()
    time.sleep(0.3)
    return r.text


def nachziehen(holen=http_holen, alt=None):
    """(neue_daten | None, meldungen). None = nichts schreiben."""
    meldungen, drucke = [], {}
    for m in MARKEN:
        try:
            drucke[m] = lade_marke(m, holen)
        except Exception as e:  # Quelle nicht erreichbar: benannte Luecke
            meldungen.append(f"Marke {m}: Quelle nicht lesbar ({type(e).__name__}) — Liste bleibt")
            return None, meldungen
    marks, counts = baue(drucke)
    for m in MARKEN:
        bisher = (alt or {}).get("counts", {}).get(m, 0)
        if counts.get(m, 0) == 0 or (bisher and counts[m] < MINDEST_ANTEIL * bisher):
            meldungen.append(f"Marke {m}: {counts.get(m, 0)} Drucke statt bisher {bisher} — nichts geschrieben")
            return None, meldungen
    if alt and alt.get("marks") == marks:
        return None, ["unveraendert"]
    neu = {
        "timestamp": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "https://limitlesstcg.com/cards?q=regulation%3D<Marke>&display=list (nur englische Drucke)",
        "counts": counts,
        "marks": marks,
    }
    return neu, meldungen


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--trocken", action="store_true")
    a = ap.parse_args(argv)
    alt = None
    if os.path.exists(DATEI):
        try:
            alt = json.load(open(DATEI, encoding="utf-8"))
        except Exception as e:
            print(f"::error::{DATEI} nicht lesbar: {e}")
            return 2
    neu, meldungen = nachziehen(alt=alt)
    for t in meldungen:
        print(("::warning::" if neu is None and t != "unveraendert" else "") + t)
    if neu is None:
        return 0
    if a.trocken:
        print("trocken:", neu["counts"])
        return 0
    with open(DATEI, "w", encoding="utf-8") as f:
        json.dump(neu, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print("geschrieben:", neu["counts"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
