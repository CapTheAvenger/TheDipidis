"""Wer Daten commitet, schreibt vorher den Datenstand fort.

BEFUND (12.09.2026)
-------------------
`tests/python/test_datenstand_abdeckung.py` war auf `main` rot:

    price_data.csv:            Datei sagt 2026-09-11, git sagt 2026-09-12
    champions_editionen.json:  Datei sagt 2026-09-09, git sagt 2026-09-12

Kein Defekt im Code — **14 von 17 Ablaeufen**, die nach `data/`
commiten, fehlte der Schritt `python3 scripts/build_data_stand.py` vor
dem Commit. `build_data_stand.py` schreibt den Stand einer Datei nur
fort, wenn der LAUFENDE Job sie angefasst hat (`geaendert()` liest
`git status --porcelain`). Faellt der Schritt weg, commitet der Job neue
Daten und laesst `data/data_stand.json` auf dem alten Datum stehen.

Die Folge steht auf der Seite: ueber den Zahlen steht ein Datum, das
nicht zu ihnen gehoert. Das sieht nicht kaputt aus — es ist nur falsch.

Diese Pruefung haelt beides fest: den Schritt UND dass die Datei auch
im Commit landet. Ein Schritt ohne `git add` schreibt den Stand fort
und wirft ihn beim naechsten `checkout` wieder weg.
"""
import glob
import os
import re

WURZEL = os.path.dirname(os.path.dirname(
    os.path.dirname(os.path.abspath(__file__))))
ABLAEUFE = os.path.join(WURZEL, '.github', 'workflows')
STAND = 'data/data_stand.json'

# Ablaeufe, die zwar commiten, aber nachweislich keine Datei unter
# data/ anfassen. Jede Zeile mit Grund — sonst wird die Liste zur
# Ausrede.
OHNE_DATEN = {
    # Traegt nur den Heartbeat nach, keine Nutzdaten.
    # (Stand 12.09.2026 leer — alle commitenden Ablaeufe fassen Daten an.)
}


def _ablaeufe():
    for pfad in sorted(glob.glob(os.path.join(ABLAEUFE, '*.yml'))):
        yield os.path.basename(pfad), open(pfad, encoding='utf-8').read()


# NICHT die Erwaehnung, sondern den AUFRUF suchen.
#
# Die erste Fassung prueste `'build_data_stand' in text`. Die
# Verfaelschungsprobe hat den Schritt entfernt — und der Test blieb
# gruen, weil der Name im Kommentarblock darueber weiter vorkam. Eine
# Zusicherung, die Text liest, prueft die Schreibweise; hier zaehlt,
# dass der Befehl wirklich laeuft.
# Schalter zwischen `python3` und dem Pfad zulassen — champions-replica
# ruft mit `python3 -u` auf.
RUFT_AUF = re.compile(
    r'python3?\s+(?:-\w+\s+)*scripts/build_data_stand\.py')


def _commitet_daten(text):
    if 'git commit' not in text:
        return False
    return bool(re.search(r'^\s*git add\s+.*\bdata\b', text, re.M))


def test_jeder_ablauf_der_daten_commitet_schreibt_den_stand_fort():
    fehlt = []
    for name, text in _ablaeufe():
        if name in OHNE_DATEN or not _commitet_daten(text):
            continue
        if not RUFT_AUF.search(text):
            fehlt.append(name)
    assert not fehlt, (
        'Diese Ablaeufe commiten Daten, ohne vorher den Datenstand '
        'fortzuschreiben:\n  ' + '\n  '.join(fehlt) + '\n\n'
        'Ohne den Schritt steht auf der Seite ein Datum an Zahlen, das '
        'nicht zu ihnen gehoert — und `test_datenstand_abdeckung.py` '
        'wird rot, ohne dass ein Defekt vorliegt (12.09.2026, 14 von 17 '
        'Ablaeufen betroffen).\n'
        'Einzufuegen ist VOR dem Commit-Schritt:\n'
        '      - name: Datenstaende fortschreiben\n'
        '        run: python3 scripts/build_data_stand.py')


def test_der_fortgeschriebene_stand_landet_auch_im_commit():
    """Ein `git add` mit Dateiliste nimmt data_stand.json nicht von selbst mit."""
    fehlt = []
    for name, text in _ablaeufe():
        if not RUFT_AUF.search(text):
            continue
        adds = re.findall(r'^\s*git add\s+(.+?)(?:\s*\\)?$', text, re.M)
        if not adds:
            fehlt.append(f'{name} (kein git add gefunden)')
            continue
        # `git add data`, `git add -A`, `git add .` erfassen alles unter
        # data/ ohnehin. Eine Dateiliste tut das nicht.
        pauschal = any(
            re.match(r'^(-A|\.|data)\s*$', a.strip()) for a in adds)
        if pauschal or STAND in text:
            continue
        fehlt.append(name)
    assert not fehlt, (
        'Diese Ablaeufe schreiben den Stand fort, commiten ihn aber '
        'nicht:\n  ' + '\n  '.join(fehlt) + '\n'
        f'Entweder {STAND} in die `git add`-Liste aufnehmen oder '
        'pauschal `git add data` verwenden. Sonst wird die Aktualisierung '
        'beim naechsten Checkout weggeworfen.')


def test_die_ausnahmeliste_zeigt_auf_echte_ablaeufe():
    da = {n for n, _ in _ablaeufe()}
    verwaist = [n for n in OHNE_DATEN if n not in da]
    assert not verwaist, (
        'OHNE_DATEN nennt Ablaeufe, die es nicht gibt: '
        + ', '.join(verwaist))
