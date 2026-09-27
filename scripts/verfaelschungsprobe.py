#!/usr/bin/env python3
"""Verfaelschungsprobe: beisst eine Zusicherung wirklich?

Projektregel 3: jede neue Zusicherung bekommt eine Verfaelschungsprobe.
Bisher war das ein Handgriff je Sitzung (sed, Test fahren, zuruecksetzen) —
und ein zeilenbasiertes sed auf einen mehrzeiligen Block aendert still
NICHTS und „beweist" dann alles. Dieses Werkzeug macht daraus einen Befehl
und bricht ab, wenn die Mutation den Text gar nicht trifft.

AUFRUF
------
    python3 scripts/verfaelschungsprobe.py PROBEN.json

PROBEN.json ist eine Liste von Proben:

    [{"name":  "Abschnitt bleibt zu",
      "datei": "js/ds-sections.js",
      "alt":   "sec.classList.add('is-open');",
      "neu":   "sec.classList.toggle('is-open', false);",
      "test":  "tests/unit/test-abschnitte-immer-offen.js"}]

Je Probe: `alt` muss GENAU EINMAL in der Datei stehen (sonst Abbruch —
eine Mutation, die nichts aendert, beweist nichts), dann wird ersetzt, der
Test mit `node --test` (bzw. pytest fuer .py) gefahren und die Datei
byte-gleich zurueckgeschrieben — auch bei Abbruch.

Ergebnis je Probe: ROT (gut: der Test faellt) oder GRUEN (schlecht: die
Zusicherung beisst nicht). Rueckgabe 1, sobald eine Probe gruen bleibt.
"""
import json
import subprocess
import sys
from pathlib import Path

WURZEL = Path(__file__).resolve().parent.parent


def fahre(test):
    if test.endswith('.py'):
        befehl = [sys.executable, '-m', 'pytest', '-q', '-x', test]
    else:
        befehl = ['node', '--test', test]
    r = subprocess.run(befehl, cwd=WURZEL, capture_output=True, text=True)
    return r.returncode


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    proben = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    gruen = 0
    for p in proben:
        pfad = WURZEL / p['datei']
        vorher = pfad.read_bytes()
        text = vorher.decode('utf-8')
        n = text.count(p['alt'])
        if n != 1:
            print(f"ABBRUCH  {p['name']}: `alt` steht {n}-mal in {p['datei']} (verlangt: genau einmal)")
            return 2
        try:
            pfad.write_text(text.replace(p['alt'], p['neu']), encoding='utf-8')
            rc = fahre(p['test'])
        finally:
            pfad.write_bytes(vorher)
        if rc == 0:
            gruen += 1
            print(f"GRUEN    {p['name']}  — die Zusicherung beisst NICHT ({p['test']})")
        else:
            print(f"ROT      {p['name']}")
    print(f"{len(proben)} Proben, {len(proben) - gruen} rot, {gruen} gruen")
    return 1 if gruen else 0


if __name__ == '__main__':
    sys.exit(main())
