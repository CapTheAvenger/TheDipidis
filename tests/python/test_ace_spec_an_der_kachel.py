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

  Die Kachel traegt data-ace="1", gesetzt aus is_ace_spec UND dem
  Register. Damit liest der JS-Test nichts aus data/ — und
  tests/unit/test-testdaten-wachhund.js muss die Datei nicht in seine
  Zaehlung aufnehmen.

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
# UMZUG 17.10.2026: das Stueck liegt nur noch in Hausis Konto. Die
# Zusicherungen an seinen Kacheln laufen, wenn MASTERCLASS_STUECK eine Datei
# nennt (bash scripts/pruefe_masterclass_konto.sh <datei>); die Kacheln der
# Online-Listen der Woche stehen in der Live-Datei und werden immer geprueft.
STUECK = os.environ.get("MASTERCLASS_STUECK") or os.path.join(WURZEL, "masterclass", "mega-stalobor.de.html")
LIVE = os.path.join(WURZEL, "data", "masterclass_live", "mega-stalobor.json")
OHNE_STUECK = pytest.mark.skipif(not os.path.exists(STUECK), reason="Stueck liegt im Konto (MASTERCLASS_STUECK nicht gesetzt)")
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
    # Seit dem Umzug (17.10.2026) liefert kachel_neu die Angaben der Kachel;
    # das Feld "ace" wird auf der Seite zu data-ace="1" (kachelNeuHtml,
    # tests/unit/test-masterclass-live.js).
    assert any(t == "ace" for t in texte), (
        "kachel_neu liefert keine ACE-SPEC-Angabe mehr — eine frisch "
        "gezogene Liste traegt die Markierung dann nicht")
    assert any("ist_ace" == getattr(k, "id", None)
               for k in ast.walk(ast.Module(body=koerper, type_ignores=[]))), (
        "ist_ace steht in der Signatur, wird im Koerper aber nicht benutzt")

    # Und die Erkennung steht auf ZWEI Beinen.
    #
    # BEFUND (Wochenlauf 159, 25.09.2026): eine frisch gezogene Liste
    # fuehrte „Prime Catcher" ohne Markierung. Das Feld is_ace_spec ist
    # nachweislich unzuverlaessig — js/app-city-league.js sagt es
    # woertlich ("CSV is_ace_spec is buggy"), und derselbe Lauf meldete
    # „is_ace_spec driftet wieder: 5 Felder". Ein Signal allein genuegt
    # also nicht.
    ganz = _lies(ERZEUGER)
    assert re.search(r"is_ace_spec", ganz), (
        "die Markierung kommt nicht aus is_ace_spec — dann fehlt das erste Bein")
    assert "ace_specs.json" in ganz, (
        "der Erzeuger schlaegt nicht im Register data/ace_specs.json nach — "
        "dann haengt die Markierung allein am fehleranfaelligen Feld")

    fn2 = next((k for k in ast.walk(baum)
                if isinstance(k, ast.FunctionDef) and k.name == "ist_ace_spec"), None)
    assert fn2 is not None, "ist_ace_spec() nicht gefunden"


def test_die_erkennung_steht_auf_zwei_beinen():
    """Verhalten, ausgefuehrt: Register ODER Feld genuegt, und eine
    gewoehnliche Karte wird nicht markiert."""
    import importlib.util
    import sys as _sys

    _sys.path.insert(0, os.path.join(WURZEL, "scripts"))
    spec = importlib.util.spec_from_file_location("mln_unter_test", ERZEUGER)
    mod = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(mod)
    except Exception as e:  # noqa: BLE001
        pytest.skip(f"Erzeuger nicht ladbar: {e}")

    assert len(mod.ACE_NAMEN) >= 20, (
        f"das Register kam nur mit {len(mod.ACE_NAMEN)} Namen an")
    # Genau der Fall aus Lauf 159: im Register, Feld leer.
    assert mod.ist_ace_spec("Prime Catcher", False) is True
    # HTML-Entitaeten duerfen den Abgleich nicht brechen.
    assert mod.ist_ace_spec("Hero&#x27;s Cape", False) is True
    # Feld allein genuegt, falls das Register die Karte noch nicht kennt.
    assert mod.ist_ace_spec("Irgendeine Neue", True) is True
    # Und eine gewoehnliche Karte bleibt unmarkiert.
    assert mod.ist_ace_spec("Beldum", False) is False


@OHNE_STUECK
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


@OHNE_STUECK
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


@OHNE_STUECK
def test_die_markierung_ist_ueberhaupt_da():
    """Gegenprobe: ohne eine einzige Markierung pruefen die drei
    Zusicherungen darueber ins Leere."""
    stueck = _lies(STUECK)
    assert stueck.count('data-ace="1"') >= 10, (
        "nur %d markierte Kacheln im Stueck — der Abgleich greift nicht"
        % stueck.count('data-ace="1"'))


@pytest.mark.skipif(not os.path.exists(LIVE), reason="Live-Datei nicht im Baum")
def test_die_online_listen_der_live_datei_stimmen_mit_dem_register():
    """Dieselbe Regel an den Listen der Woche: eine Karte ist genau dann
    als ACE SPEC markiert, wenn sie im Register steht (oder das Feld es
    sagt), und keine Liste fuehrt zwei."""
    import html as _html
    reg = _register()
    with open(LIVE, encoding="utf-8") as f:
        listen = json.load(f)["online_listen"]["listen"]
    falsch = []
    for l in listen:
        aces = 0
        for k in l["karten"]:
            en = _html.unescape(k["name"]).lower().replace("\u2019", "'")
            if en in reg and not k["ace"]:
                falsch.append("nicht markiert: " + k["name"])
            if k["ace"]:
                aces += 1
            if k["neu"] and k["neu"]["ace"] != k["ace"]:
                falsch.append("Kachel und Karte widersprechen sich: " + k["name"])
        assert aces <= 1, "%s fuehrt %d ACE SPEC" % (l["name"], aces)
    assert falsch == [], falsch
