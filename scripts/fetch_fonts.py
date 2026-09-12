#!/usr/bin/env python3
"""Holt die Google-Schrift EINMAL und legt sie zu uns.

WARUM
-----
`index.html` lud Nunito bis zum 12.09.2026 bei jedem Seitenaufruf von
`fonts.googleapis.com`. Dabei geht die IP-Adresse jedes Besuchers an
Google — ohne Einwilligung. Das LG Muenchen I hat das am 20.01.2022
(3 O 17493/20) als Verletzung des allgemeinen Persoenlichkeitsrechts
gewertet und Schadensersatz zugesprochen.

Lokal eingebunden entfaellt der Abruf vollstaendig: die Schrift kommt
von der eigenen Domain, es gibt keinen Drittkontakt, und der Seitenbau
wird schneller (zwei DNS-Aufloesungen und eine Umleitung weniger).

WARUM ALS CI-LAUF UND NICHT VON HAND
------------------------------------
Die Sandkiste erreicht fonts.googleapis.com nicht (Proxy antwortet 403
auf CONNECT) — dieselbe Sperre wie bei pokewiki.de. Der Lauf gehoert
deshalb in CI, und zwar per `workflow_dispatch` auf dem ZWEIG, damit
der PR gruen wird, bevor er gemergt wird (CLAUDE.md).

AUFRUF
    python3 scripts/fetch_fonts.py
    python3 scripts/fetch_fonts.py --pruefen    # nur melden
"""
import argparse
import os
import re
import sys
import urllib.request

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.dirname(HIER)
ZIEL_DIR = os.path.join(WURZEL, 'css', 'fonts')
ZIEL_CSS = os.path.join(WURZEL, 'css', 'schriften.css')

# Genau die Familie und die Schnitte, die index.html bisher geladen hat.
FAMILIE = 'Nunito'
SCHNITTE = '400;600;700;800;900'
QUELLE = (f'https://fonts.googleapis.com/css2?family={FAMILIE}'
          f':wght@{SCHNITTE}&display=swap')

# Ohne Browser-Kennung liefert Google TTF statt WOFF2 — dreimal so gross.
UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')


def _hol(url: str) -> bytes:
    anfrage = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(anfrage, timeout=30) as antwort:
        return antwort.read()


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument('--pruefen', action='store_true',
                   help='nichts laden, nur den Bestand melden')
    a = p.parse_args()

    if a.pruefen:
        da = (sorted(os.listdir(ZIEL_DIR))
              if os.path.isdir(ZIEL_DIR) else [])
        print(f'{len(da)} Schriftdateien, schriften.css '
              f'{"vorhanden" if os.path.exists(ZIEL_CSS) else "FEHLT"}')
        for n in da:
            print('   ', n)
        return 0

    css = _hol(QUELLE).decode('utf-8')
    adressen = sorted(set(re.findall(r'https://fonts\.gstatic\.com/[^)]+', css)))
    if not adressen:
        print('::error::Keine Schriftdateien in der Antwort von Google — '
              'Format geaendert? Es wird NICHTS geschrieben.')
        return 1

    os.makedirs(ZIEL_DIR, exist_ok=True)
    ersetzungen = {}
    for adresse in adressen:
        name = adresse.rsplit('/', 1)[-1].split('?')[0]
        if not name.endswith('.woff2'):
            name += '.woff2'
        # Sprechender Name: nunito-<schnitt>-<subset>.woff2 waere schoen,
        # aber Google vergibt Kennungen. Der Dateiname der Quelle ist
        # eindeutig und nachvollziehbar — das genuegt.
        name = f'{FAMILIE.lower()}-{name}'
        daten = _hol(adresse)
        if daten[:4] != b'wOF2':
            print(f'::error::{name} ist keine WOFF2-Datei — abgebrochen.')
            return 1
        with open(os.path.join(ZIEL_DIR, name), 'wb') as f:
            f.write(daten)
        ersetzungen[adresse] = f'fonts/{name}'
        print(f'  {name:52} {len(daten)/1024:6.1f} KB')

    for alt, neu in ersetzungen.items():
        css = css.replace(alt, neu)

    kopf = (
        '/* Nunito, lokal eingebunden — erzeugt von\n'
        ' * scripts/fetch_fonts.py. NICHT VON HAND AENDERN.\n'
        ' *\n'
        ' * Bis zum 12.09.2026 lud index.html diese Schrift bei jedem\n'
        ' * Seitenaufruf von fonts.googleapis.com. Dabei ging die IP\n'
        ' * jedes Besuchers an Google, ohne Einwilligung — LG Muenchen I,\n'
        ' * 20.01.2022, 3 O 17493/20.\n'
        ' *\n'
        ' * Die Schriftdateien liegen in css/fonts/. Rechteinhaber ist\n'
        ' * das Nunito-Projekt; die Schrift steht unter der SIL Open\n'
        f' * Font License 1.1, die das Weitergeben ausdruecklich erlaubt.\n'
        f' * Quelle: {QUELLE}\n'
        ' */\n')
    with open(ZIEL_CSS, 'w', encoding='utf-8') as f:
        f.write(kopf + css)

    print(f'\n✓ {len(ersetzungen)} Dateien in css/fonts/, '
          f'css/schriften.css geschrieben')
    return 0


if __name__ == '__main__':
    sys.exit(main())
