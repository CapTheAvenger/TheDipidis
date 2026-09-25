"""Die Kachel sagt selbst, ob sie eine ACE SPEC ist.

BEFUND (Wochenlauf 158, 25.09.2026): „Liste 23 hat 0 ACE SPEC".

  tests/unit/test-masterclass.js zaehlte ACE SPEC gegen vier deutsche
  Namen, die im Test standen — Heldenumhang, Edler Rollwagen, Geheime
  Box, Unfairer Stempel. Das Format kennt 39 (data/ace_specs.json,
  Quelle limitlesstcg.com/cards?q=is:ace). Eine frisch gezogene
  Online-Liste mit einer FUENFTEN zaehlte als null, und der Lauf wurde
  rot, ohne dass etwas kaputt war.

  Die Namensliste im Test nachzupflegen waere derselbe Fehler, den
  js/app-city-league.js schon gemacht hat: eine handgefuehrte Kopie der
  Registerdatei, um 12 fehlende und 3 erfundene Namen abgedriftet. Der
  Kommentar dort steht noch.

DIE LOESUNG UND WARUM SIE HIER GEPRUEFT WIRD

  Die Kachel traegt data-ace="1", gesetzt aus is_ace_spec. Damit liest
  der JS-Test nichts aus data/ — und tests/unit/test-testdaten-wachhund.js
  muss die Datei nicht in seine Zaehlung aufnehmen.

  Der Abgleich gegen das Register gehoert dafuer hierher: Python hat
  keinen solchen Wachhund, und die Frage „stimmen die Markierungen mit
  dem Register ueberein" ist genau eine Frage an die Daten.
"""

import json
import os
import re

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
ERZEUGER = os.path.join(WURZEL, "scripts", "masterclass_listen_nachziehen.py")
STUECK = os.path.join(WURZEL, "masterclass", "mega-stalobor.de.html")
REGISTER = os.path.join(WURZEL, "data", "ace_specs.json")

KACHEL = re.compile(r'<button[^>]*class="mcl-kk"[^>]*>')
BLOCK = re.compile(r'data-mcl-listenblock="(\d+)"[\s\S]*?</div>\s*<p class="mcl-quelle">')


def _lies(pfad):
    with open(pfad, encoding="utf-8") as f:
        return f.read()


def _register():
    with open(REGISTER, encoding="utf-8") as f:
        namen = (json.load(f) or {}).get("ace_specs") or []
    return {str(n).lower().replace("’", "'") for n in namen}


def test_der_erzeuger_setzt_die_markierung():
    """Der Baum, nicht der Text.

    Erster Anlauf las den Quelltext als Zeichenkette und strich nur die
    `#`-Kommentare. Die Verfaelschungsprobe blieb gruen: der
    Docstring von kachel_neu erklaert die Markierung und nennt sie
    woertlich. Genau die Falle aus CLAUDE.md — „dein eigener Kommentar
    macht die Verfaelschungsprobe blind", nur diesmal ein Docstring.

    Geprueft wird deshalb am Syntaxbaum, und Docstrings zaehlen nicht.
    """
    import ast

    baum = ast.parse(_lies(ERZEUGER))
    fn = next((k for k in ast.walk(baum)
               if isinstance(k, ast.FunctionDef) and k.name == "kachel_neu"), None)
    assert fn is not None, "kachel_neu() nicht gefunden"

    argumente = [a.arg for a in fn.args.args]
    assert "ist_ace" in argumente, (
        f"kachel_neu({', '.join(argumente)}) kennt kein ist_ace")

    koerper = list(fn.body)
    if koerper and isinstance(koerper[0], ast.Expr) and \
            isinstance(koerper[0].value, ast.Constant) and \
            isinstance(koerper[0].value.value, str):
        koerper = koerper[1:]          # Docstring raus
    texte = [k.value for k in ast.walk(ast.Module(body=koerper, type_ignores=[]))
             if isinstance(k, ast.Constant) and isinstance(k.value, str)]
    assert any('data-ace="1"' in t for t in texte), (
        "kachel_neu schreibt keine ACE-SPEC-Markierung mehr — eine frisch "
        "gezogene Liste traegt sie dann nicht")
    assert any("ist_ace" == getattr(k, "id", None)
               for k in ast.walk(ast.Module(body=koerper, type_ignores=[]))), (
        "ist_ace steht in der Signatur, wird im Koerper aber nicht benutzt")

    # Und der Aufrufer reicht is_ace_spec durch.
    ganz = _lies(ERZEUGER)
    assert re.search(r"is_ace_spec", ganz), (
        "die Markierung kommt nicht aus is_ace_spec — dann ist sie geraten")


def test_die_markierungen_stimmen_mit_dem_register_ueberein():
    """Der Abgleich an den Daten: jede markierte Kachel steht im
    Register, und jede Kachel aus dem Register ist markiert."""
    import html as _html
    stueck = _lies(STUECK)
    reg = _register()
    assert len(reg) >= 20, f"das Register fuehrt nur {len(reg)} Karten"

    falsch_markiert, nicht_markiert = [], []
    for kachel in KACHEL.findall(stueck):
        m = re.search(r'data-en="([^"]*)"', kachel)
        if not m:
            continue
        en = _html.unescape(m.group(1)).lower().replace("’", "'")
        markiert = 'data-ace="1"' in kachel
        if markiert and en not in reg:
            falsch_markiert.append(en)
        if en in reg and not markiert:
            nicht_markiert.append(en)
    assert falsch_markiert == [], (
        "diese Kacheln sind als ACE SPEC markiert, stehen aber nicht im "
        "Register: %s" % sorted(set(falsch_markiert)))
    assert nicht_markiert == [], (
        "diese Kacheln stehen im Register, tragen aber keine Markierung: "
        "%s" % sorted(set(nicht_markiert)))


def test_keine_liste_fuehrt_zwei_ace_spec():
    """Die Spielregel: hoechstens eine. Null ist erlaubt."""
    stueck = _lies(STUECK)
    bloecke = BLOCK.findall(stueck)
    voll = re.findall(r'data-mcl-listenblock="\d+"[\s\S]*?</div>\s*<p class="mcl-quelle">',
                      stueck)
    assert len(voll) >= 20, f"nur {len(voll)} Listenbloecke gefunden"
    zuviel = [(nr, b.count('data-ace="1"'))
              for nr, b in zip(bloecke, voll) if b.count('data-ace="1"') > 1]
    assert zuviel == [], "diese Listen fuehren mehr als eine ACE SPEC: %s" % zuviel


def test_die_markierung_ist_ueberhaupt_da():
    """Gegenprobe: ohne eine einzige Markierung pruefen die drei
    Zusicherungen darueber ins Leere."""
    stueck = _lies(STUECK)
    assert stueck.count('data-ace="1"') >= 10, (
        "nur %d markierte Kacheln im Stueck — der Abgleich greift nicht"
        % stueck.count('data-ace="1"'))
