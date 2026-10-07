#!/usr/bin/env python3
"""UI-118 Stufe 2 (Hausi 07.10.2026: „Alles in Stufe 2“): Schriftstufen und Radien
auf die Skala aus css/tokens.css ziehen.

  Schrift:  11 / 12 / 14 / 17 / 21 / 30 px  (--fs-xs … --fs-hero)
  Radien:   6 / 10 / 14 / 999 px            (--r-sm, --r-md, --r-lg, Pille)

Gezogen werden nur feste Angaben `font-size: N px|rem` und `border-radius` in px.
Unangetastet: em/%/calc/clamp/var, Werte ueber 30 px, Haarlinien-Radien (0–1 px),
Kreise (50 %), alles in `@media print`, und die Dateien, die Bilder zeichnen
(ds-share.css) oder die Skala selbst festlegen (tokens.css, schriften.css).

Aufruf:  python3 scripts/gestaltung_stufe2.py            # zieht und schreibt
         python3 scripts/gestaltung_stufe2.py --pruefen  # zaehlt nur, Rueckgabe 1 bei Abweichung
"""
import os
import re
import sys

WURZEL = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
SCHRIFT = [11, 12, 14, 17, 21, 30]
AUSNAHMEN = {'ds-share.css', 'tokens.css', 'schriften.css'}

FS = re.compile(r'(font-size\s*:\s*)(\d*\.?\d+)(px|rem)(\s*(?:!important)?\s*[;}])')
BR = re.compile(r'(border-radius\s*:\s*)([^;{}]+?)(\s*(?:!important)?\s*[;}])')


def schrift(px):
    if px > 30:
        return None
    if px <= 11:
        return 11
    # naechste Stufe; bei Gleichstand die groessere (lesbarer)
    return min(SCHRIFT, key=lambda s: (abs(s - px), -s))


def radius(px):
    if px <= 1:
        return None
    if px < 8:
        return 6
    if px < 12:
        return 10
    if px < 19:
        return 14
    return 999


def _fs(m):
    wert = float(m.group(2)) * (16 if m.group(3) == 'rem' else 1)
    neu = schrift(wert)
    if neu is None or abs(neu - wert) < 0.01 and m.group(3) == 'px':
        return m.group(0)
    return f'{m.group(1)}{neu}px{m.group(4)}'


def _br(m):
    teile = m.group(2).split()
    neu = []
    geaendert = False
    for t in teile:
        tm = re.fullmatch(r'(\d*\.?\d+)px', t)
        if not tm:
            neu.append(t)
            continue
        r = radius(float(tm.group(1)))
        if r is None:
            neu.append(t)
            continue
        neu.append(f'{r}px')
        geaendert = geaendert or f'{r}px' != t
    if not geaendert:
        return m.group(0)
    return m.group(1) + ' '.join(neu) + m.group(3)


def ziehen(text):
    """Zieht Schrift und Radien, ausser in @media print."""
    aus = []
    i = 0
    while True:
        j = text.find('@media print', i)
        if j < 0:
            aus.append(_ersetzen(text[i:]))
            break
        aus.append(_ersetzen(text[i:j]))
        k = text.find('{', j)
        tiefe, e = 0, k
        while e < len(text):
            if text[e] == '{':
                tiefe += 1
            elif text[e] == '}':
                tiefe -= 1
                if tiefe == 0:
                    break
            e += 1
        aus.append(text[j:e + 1])
        i = e + 1
    return ''.join(aus)


def _ersetzen(teil):
    return BR.sub(_br, FS.sub(_fs, teil))


def main(argv):
    pruefen = '--pruefen' in argv
    css = os.path.join(WURZEL, 'css')
    abweichend = 0
    for name in sorted(os.listdir(css)):
        if not name.endswith('.css') or name in AUSNAHMEN:
            continue
        pfad = os.path.join(css, name)
        alt = open(pfad, encoding='utf-8').read()
        neu = ziehen(alt)
        if neu != alt:
            abweichend += 1
            if not pruefen:
                open(pfad, 'w', encoding='utf-8').write(neu)
            print(('weicht ab: ' if pruefen else 'gezogen:   ') + name)
    print(f'{abweichend} Dateien {"weichen ab" if pruefen else "gezogen"}')
    return 1 if (pruefen and abweichend) else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
