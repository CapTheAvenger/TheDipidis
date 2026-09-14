"""Wer die Daten schreibt, schreibt das Luecken-Inventar darueber mit.

BEFUND (14.09.2026)
-------------------
`test_inventar_stimmt_mit_dem_erzeuger_ueberein` war auf `main` rot.
Kein Defekt im Code, kein Fehler in den Daten — eine Taktfrage:

    data/datenluecken.json nennt, WIE VIELE Eintraege der Quellfehler
    "Unknown Item NNN" betrifft. Am 13.09. abends waren es 174, am
    14.09. frueh 197. Die Nummern blieben dieselben (20), nur die Zahl
    der betroffenen Pokemon waechst mit jedem Nutzungslauf.

Erzeugt wurde die Datei aber nur im WOCHENLAUF. Zwischen zwei
Wochenlaeufen lief das Inventar der Wirklichkeit hinterher, und die
Zusicherung hielt den Deploy der ganzen Seite an — an einer Zahl, die
sich planmaessig aendert.

DIESELBE KLASSE FEHLER wie die abgelaufene Mega-Karenz (12.09.) und die
an 768 px gehaengte Heatmap-Vorkehrung (13.09.): eine Regel an einen
Takt oder ein Band gehaengt statt an die Bedingung, die sie meint.

Diese Pruefung ist die Schwester von
`test_ablaeufe_schreiben_den_datenstand.py` und haelt dasselbe fest:
den SCHRITT und das `git add`. Ein Schritt ohne `git add` erzeugt das
Inventar und wirft es beim naechsten `checkout` wieder weg.
"""
import glob
import os
import re

WURZEL = os.path.dirname(os.path.dirname(
    os.path.dirname(os.path.abspath(__file__))))
ABLAEUFE = os.path.join(WURZEL, '.github', 'workflows')
INVENTAR = 'data/datenluecken.json'

# Die Dateien, aus denen datenluecken.py sein Inventar rechnet. Wer eine
# davon commitet, aendert moeglicherweise das Inventar — und muss es
# deshalb mitziehen. Gelesen aus scripts/datenluecken.py, nicht hier
# gepflegt: zwei Listen gingen auseinander.
def _quelldateien():
    pfad = os.path.join(WURZEL, 'scripts', 'datenluecken.py')
    text = open(pfad, encoding='utf-8').read()
    # _lies("champions_pokedex.json") und Konsorten
    return {'data/' + n for n in re.findall(r'_lies\(\s*["\']([^"\']+)["\']', text)}


# NICHT die Erwaehnung, sondern den AUFRUF suchen — dieselbe Lehre wie
# bei build_data_stand: die erste Fassung jener Pruefung suchte den
# blossen Namen und blieb gruen, weil ihr eigener Kommentar ihn enthielt.
RUFT_AUF = re.compile(r'python3?\s+(?:-\w+\s+)*scripts/datenluecken\.py')


def _ablaeufe():
    for pfad in sorted(glob.glob(os.path.join(ABLAEUFE, '*.yml'))):
        yield os.path.basename(pfad), open(pfad, encoding='utf-8').read()


def _pauschal(text):
    """`git add -A`, `git add .` oder `git add data` erfassen alles unter data/.

    KORRIGIERT BEIM SCHREIBEN (14.09.2026): die erste Fassung suchte nur
    Dateinamen und meldete weekly-full-update.yml als Fehler — der Lauf
    nutzt aber `git add -A` und commitet das Inventar laengst mit. Haette
    ich das nicht nachgesehen, haette ich einen funktionierenden Ablauf
    "repariert". Die Schwesterpruefung
    test_ablaeufe_schreiben_den_datenstand.py kennt denselben Fall.
    """
    adds = re.findall(r'^\s*git add\s+(.+?)(?:\s*\\)?$', text, re.M)
    return any(re.match(r'^(-A|\.|data)\s*$', a.strip()) for a in adds)


def _commitet(text, datei):
    """Kommt die Datei in einem `git add` vor — einzeln oder pauschal?"""
    if _pauschal(text):
        return True
    return re.search(r'git add[^\n]*(?:\\\s*\n[^\n]*)*' + re.escape(datei), text) is not None


def test_die_quellen_des_inventars_sind_auffindbar():
    """Testvoraussetzung: sonst prueft alles darunter gegen eine leere Menge."""
    q = _quelldateien()
    assert len(q) >= 3, f'nur {q} — die Ableitung aus datenluecken.py greift nicht mehr'
    assert 'data/champions_pokedex.json' in q, q


def test_wer_eine_quelle_commitet_zieht_das_inventar_mit():
    quellen = _quelldateien()
    fehlend = []
    for name, text in _ablaeufe():
        beruehrt = sorted(d for d in quellen if _commitet(text, d))
        if not beruehrt:
            continue
        if not RUFT_AUF.search(text):
            fehlend.append(f'{name}: commitet {beruehrt[:3]}, ruft aber '
                           'scripts/datenluecken.py nicht auf')
    assert fehlend == [], (
        'Diese Ablaeufe commiten eine Quelle des Luecken-Inventars, erzeugen '
        'das Inventar aber nicht neu — dann steht es ab dem naechsten Lauf '
        'falsch da und haelt den Deploy an:\n  ' + '\n  '.join(fehlend))


def test_wer_das_inventar_erzeugt_commitet_es_auch():
    """Ein Schritt ohne `git add` wirft das Ergebnis wieder weg."""
    fehlend = []
    for name, text in _ablaeufe():
        if not RUFT_AUF.search(text):
            continue
        if 'git add' not in text:
            continue            # erzeugt es fuer etwas anderes, commitet gar nichts
        if _pauschal(text):
            continue            # `git add -A` nimmt das Inventar ohnehin mit
        if not _commitet(text, INVENTAR):
            fehlend.append(name)
    assert fehlend == [], (
        'Diese Ablaeufe erzeugen data/datenluecken.json, fuehren es aber in '
        'keinem `git add` — beim naechsten checkout ist es wieder weg: '
        + ', '.join(fehlend))
