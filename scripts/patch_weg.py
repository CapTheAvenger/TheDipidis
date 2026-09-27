#!/usr/bin/env python3
"""Der Patch-Weg: Aenderungen ausliefern, ohne dass ein Rechner dabei ist.

WARUM (27.09.2026)
------------------
Aus der Cowork-Sandkiste ist `git push` dauerhaft 403. Der GitHub-Weg ueber
die MCP-Werkzeuge geht, traegt aber den GANZEN Dateiinhalt durch den Chat —
Rutsch 5–7 waeren 5,5 MB gewesen. Der Browser-Upload braucht Hausis Rechner
mit Chrome. Hausi: „Wieso frage ich dich denn vorher, ob du ohne meinen
Rechner alles machen kannst?"

Der Patch-Weg traegt nur die AENDERUNG: `git format-patch` (~5 % der
Dateigroesse), in Teile zerlegt, ueber MCP auf einen Zweig `patch/…`
gelegt. `.github/workflows/patch-einspielen.yml` setzt ihn dort zusammen,
prueft jede Pruefsumme, entfernt die Anlieferung und spielt die Commits mit
`git am` ein. Danach PR und Merge wie immer.

TRANSPORT
---------
Jede Zeile bekommt ein `|` angehaengt. Leerzeichen am Zeilenende (Kontext-
zeilen leerer Codezeilen, die Signatur `-- `) ueberleben so jede Abschrift
und jeden Editor; entfernt wird genau ein Zeichen je Zeile.

Ein woertliches Schraegstrich-u mit vier Hexziffern (in js/i18n.js steht
so die Auslassung) kam auf dem MCP-Weg zweimal als `…` an (gemessen
27.09.2026, Teil 2 von Rutsch 5–7, Pruefsumme falsch). Ein Schraegstrich-u
wird deshalb als `¤u` getragen, und
`FERTIG.json` vermerkt es unter `flucht`. Kommt `¤` im Patch selbst vor,
bricht `verpacken` ab.

AUFRUF
------
    python3 scripts/patch_weg.py verpacken <patch> <zielordner> [--teil 24000]
    python3 scripts/patch_weg.py auspacken <ordner> <ausgabe.patch>

`auspacken` bricht mit Rueckgabe 1 und dem Namen des Teils ab, dessen
Pruefsumme nicht stimmt — dann ist genau dieser Teil neu zu liefern. Fehlt
die Liste `FERTIG.json`, ist die Anlieferung noch unterwegs: Rueckgabe 3.
"""
import hashlib
import json
import os
import sys

MARKE = '|'
FLUCHT = '¤u'          # traegt ein woertliches Schraegstrich-u
SCHRAEG_U = chr(92) + 'u'   # so geschrieben, damit die Datei selbst keins enthaelt


def _sha(b):
    return hashlib.sha256(b).hexdigest()


def verpacken(patch, ziel, teil=24000):
    roh = open(patch, 'rb').read()
    text = roh.decode('utf-8')
    if '\r' in text:
        raise SystemExit('CR im Patch — nicht unterstuetzt')
    flucht = SCHRAEG_U in text
    if flucht:
        if FLUCHT[0] in text:
            raise SystemExit('Fluchtzeichen im Patch — nicht unterstuetzt')
        text = text.replace(SCHRAEG_U, FLUCHT)
    zeilen = [z + MARKE for z in text.split('\n')]
    os.makedirs(ziel, exist_ok=True)
    teile, puffer, n = {}, [], 0
    for z in zeilen:
        puffer.append(z)
        n += len(z.encode('utf-8')) + 1
        if n >= teil:
            name = f'teil-{len(teile) + 1:02d}.txt'
            daten = ('\n'.join(puffer) + '\n').encode('utf-8')
            open(os.path.join(ziel, name), 'wb').write(daten)
            teile[name] = _sha(daten)
            puffer, n = [], 0
    if puffer:
        name = f'teil-{len(teile) + 1:02d}.txt'
        daten = ('\n'.join(puffer) + '\n').encode('utf-8')
        open(os.path.join(ziel, name), 'wb').write(daten)
        teile[name] = _sha(daten)
    liste = {'teile': teile, 'patch_sha256': _sha(roh), 'patch_bytes': len(roh)}
    if flucht:
        liste['flucht'] = True
    open(os.path.join(ziel, 'FERTIG.json'), 'w', encoding='utf-8').write(
        json.dumps(liste, indent=1, sort_keys=True) + '\n')
    return liste


def auspacken(ordner, ausgabe):
    pfad = os.path.join(ordner, 'FERTIG.json')
    if not os.path.isfile(pfad):
        print('Anlieferung noch nicht vollstaendig (FERTIG.json fehlt).')
        return 3
    liste = json.load(open(pfad, encoding='utf-8'))
    zeilen = []
    for name in sorted(liste['teile']):
        p = os.path.join(ordner, name)
        if not os.path.isfile(p):
            print(f'::error::Teil fehlt: {name}')
            return 1
        daten = open(p, 'rb').read()
        if _sha(daten) != liste['teile'][name]:
            print(f'::error::Pruefsumme stimmt nicht: {name} — diesen Teil neu liefern')
            return 1
        for z in daten.decode('utf-8').split('\n')[:-1]:
            if not z.endswith(MARKE):
                print(f'::error::Zeile ohne Endmarke in {name}: {z[:60]!r}')
                return 1
            zeilen.append(z[:-1])
    text = '\n'.join(zeilen)
    if liste.get('flucht'):
        text = text.replace(FLUCHT, SCHRAEG_U)
    roh = text.encode('utf-8')
    if _sha(roh) != liste['patch_sha256']:
        print('::error::Pruefsumme des ganzen Patches stimmt nicht')
        return 1
    open(ausgabe, 'wb').write(roh)
    print(f'Patch zusammengesetzt: {len(roh)} Bytes aus {len(liste["teile"])} Teilen.')
    return 0


def main(argv):
    if len(argv) >= 3 and argv[0] == 'verpacken':
        teil = int(argv[argv.index('--teil') + 1]) if '--teil' in argv else 24000
        liste = verpacken(argv[1], argv[2], teil)
        print(f'{len(liste["teile"])} Teile, {liste["patch_bytes"]} Bytes')
        return 0
    if len(argv) == 3 and argv[0] == 'auspacken':
        return auspacken(argv[1], argv[2])
    print(__doc__)
    return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
