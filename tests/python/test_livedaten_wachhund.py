"""Wachhund gegen Python-Tests, die eine Zahl der LIVE-Daten festnageln.

WARUM ES DIESE DATEI GIBT
-------------------------
`deploy-pages.yml` bricht bei jedem roten Test ab — auch bei einem
Python-Test. Ein Test, der behauptet "es gibt genau 299 Eintraege" oder
"hoechstens neun Formen ohne Bild", sagt nichts ueber den Code. Er sagt,
wie die DATEN in dieser Woche aussehen. Der naechste Datenlauf macht ihn
rot, und die Auslieferung steht, ohne dass irgendwo ein Defekt ist.

Das ist im September 2026 zweimal genau so passiert:

  11.09.2026  eingefrorene Wochenwerte            Deploy angehalten
  12.09.2026  elf Zusicherungen gegen den          `main` stand ab
              Champions-Kader; der naechtliche     05:12 UTC, rund
              Lauf ergaenzte fuenf Arten und       fuenf Stunden
              verlor drei

Beim zweiten Mal war KEINE der elf Zusicherungen falsch programmiert.
Sie verboten nur alle dieselbe Sache: jede Abweichung — auch Zuwachs.

Die JS-Seite hat diesen Wachhund seit dem 28.08.2026
(`tests/unit/test-testdaten-wachhund.js`). Fuer `tests/python/` gab es
ihn nicht, und genau dort lagen drei der elf Zusicherungen.

DIE REGEL
---------
  Eigenschaften des CODES gehoeren an Daten, die der Test selbst setzt
  (tmp_path, eine eigene CSV, ein Wörterbuch im Test).

  Beobachtungen ueber die AKTUELLEN Daten gehoeren in den Data Guardian
  (`scripts/data_guardian.py`) — der meldet WARN und stoppt nichts.

Zulaessig an Live-Daten sind: Struktur (Spalte da, Schema stimmt),
Parsebarkeit, und RICHTUNGEN statt Punkte ("verloren ist ein Fehler,
Zuwachs nicht"). Nicht zulaessig ist eine enge Gleichung gegen eine
Zahl, die aus dem Bestand dieser Woche abgelesen wurde.

Wer eine braucht, traegt sie unten ein und begruendet sie. Das macht
aus einem Versehen eine Entscheidung.
"""
import ast
import os

WURZEL = os.path.dirname(os.path.dirname(
    os.path.dirname(os.path.abspath(__file__))))
PY_TESTS = os.path.join(WURZEL, 'tests', 'python')

# Namen, hinter denen das ECHTE data/ des Repos steckt.
WURZELNAMEN = {'WURZEL', 'ROOT', 'REPO_ROOT', 'PROJEKT', 'BASE'}

# Unter zehn ist fast immer eine Sorte, kein Bestand ("== 0" als
# Rueckgabewert, "== 2" fuer zwei Spalten). Ab zehn lohnt das Hinsehen.
AB_HIER_BESTAND = 10

# ── DIE AUSNAHMEN ───────────────────────────────────────────────────
#
# Der Schluessel ist `datei.py::funktion`, nicht die Datei. Eine
# Ausnahme fuer eine ganze Datei deckt still jede spaetere Zusicherung
# darin mit ab — genau das, was der Wachhund verhindern soll.
#
# Die Frage fuer jede Zeile ist immer dieselbe: KANN das, was hier
# gezaehlt wird, ueberhaupt noch wachsen? Kann es nicht, bricht die
# Zusicherung auch nicht.
AUSNAHMEN = {
    'test_cross_surface_consistency.py::*':
        'vergleicht zwei Oberflaechen miteinander — beide Seiten bewegen '
        'sich mit den Daten, die Zahl selbst ist egal',

    # 20 Karten sind die REGEL eines Pocket-Decks, kein abgelesener
    # Bestand. Waere die Summe 21, waere das Deck kaputt.
    'test_pocket_tierlist.py::test_der_scan_code_nennt_die_trennstelle_und_sie_geht_auf':
        '20 Karten sind die Deckregel von Pocket, kein Bestandswert',
    'test_pocket_tierlist.py::test_die_trennstelle_liegt_dort_wo_der_code_sie_nennt':
        'dieselbe Deckregel, aufgeteilt in Pokemon und Trainer',
    'test_pocket_tierlist.py::test_der_lauf_haengt_die_kartenliste_ans_deck':
        'dieselbe Deckregel',
    'test_pocket_tierlist.py::test_eine_trennstelle_zwischen_zwei_karten_wird_abgelehnt':
        'dieselbe Deckregel',

    # Ein ABGESCHLOSSENES Formatfenster. Der Test sagt es selbst: "Er
    # kann nicht wachsen — entweder wurden alte Zeilen entfernt oder das
    # Fenster ist nicht mehr sauber begrenzt." Genau das soll er fangen.
    'test_meta_prognose.py::test_der_gemessene_fall_von_mega_excadrill_bleibt_stehen':
        'abgeschlossenes Formatfenster, der Nenner KANN nicht wachsen',

    # Die 29 sind die Summe des HTML, das der Test SELBST baut
    # (suppe(html) ein paar Zeilen darueber). Die Live-Daten kommen nur
    # ueber Db() herein und aendern daran nichts.
    'test_druck_von_der_seite.py::test_alle_drei_spalten_in_einem_lauf':
        'zaehlt das HTML, das der Test selbst zusammensetzt',

    # Eine ABGESCHLOSSENE Runde vom 03.09.2026. Was sie damals gezaehlt
    # hat, kann nicht mehr wachsen.
    'test_datenluecken.py::test_jeder_entschiedene_name_traegt_seine_quelle':
        'abgeschlossene Runde vom 03.09.2026, das Ergebnis steht fest',

    # 828 ist die Pokedex-Nummer von Thievul — eine Tatsache, kein
    # Bestand. 41 ist die Kantenlaenge eines QR-Codes der Version 6.
    'test_dex_nummern.py::test_unsichtbare_zeichen_stoeren_nicht':
        'Dexnummer einer Art, keine gezaehlte Menge',
    'test_qr_svg.py::test_der_leser_wuerde_ein_kaputtes_muster_auch_ablehnen':
        'Kantenlaenge eines QR-Codes der Version 6, aus der Norm',

    # Feste Chunkdatei einer vergangenen Rotation, dazu ein weites Band
    # (20 < n < 150) statt eines Punktes.
    'test_past_meta_aggregation.py::test_svi_pfl_price_tag_collapses_archetype_count':
        'eingefrorene Chunkdatei einer vergangenen Rotation, weites Band',
}


def _ausgenommen(datei, funktion):
    return (f'{datei}::{funktion}' in AUSNAHMEN
            or f'{datei}::*' in AUSNAHMEN)


def _live_wurzel(knoten):
    """os.path.join(WURZEL, 'data', ...) — das echte Datenverzeichnis."""
    for k in ast.walk(knoten):
        if not isinstance(k, ast.Call):
            continue
        namen = {a.id for a in ast.walk(k) if isinstance(a, ast.Name)}
        werte = {a.value for a in ast.walk(k)
                 if isinstance(a, ast.Constant) and isinstance(a.value, str)}
        if (namen & WURZELNAMEN) and 'data' in werte:
            return True
    return False


def _live_fixtures(baum, livenamen):
    """pytest-Fixtures, die aus dem echten data/ lesen.

    WICHTIG — hier ist der Wachhund am 12.09.2026 beim ersten Versuch
    durchgefallen: die teuerste Zusicherung dieses Projekts
    (`len(pokedex["entries"]) == 299`) steht in einer Pruefung, die den
    Pokedex als FIXTURE-ARGUMENT bekommt. Wer nur modulweite Namen
    verfolgt, sieht davon nichts — und meldet gruen fuer genau den
    Fehler, den er verhindern soll. Eine Probe hat das gezeigt, nicht
    eine Ueberlegung.
    """
    namen = set()
    for knoten in ast.walk(baum):
        if not isinstance(knoten, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        ist_fixture = any(
            'fixture' in ast.dump(d) for d in knoten.decorator_list)
        if not ist_fixture:
            continue
        # Zwei Wege in die Daten, und der zweite ist der haeufigere:
        # entweder baut die Fixture den Pfad selbst, ODER sie benutzt
        # einen modulweiten Namen wie DATA / DATEN. Beim ersten Versuch
        # kannte der Wachhund nur den ersten Weg — und lief deshalb
        # gruen ueber genau die Zusicherung, die heute frueh den Deploy
        # angehalten hat.
        benutzt = {a.id for a in ast.walk(knoten) if isinstance(a, ast.Name)}
        if _live_wurzel(knoten) or (benutzt & livenamen):
            namen.add(knoten.name)
    return namen


def _livenamen(baum):
    """Modulweite Namen, die aus dem echten data/ gefuellt werden."""
    namen = set()
    for _ in range(3):          # DATEN = join(WURZEL,'data'); X = load(DATEN)
        vorher = len(namen)
        for knoten in baum.body:
            if not isinstance(knoten, (ast.Assign, ast.AnnAssign)):
                continue
            ziele = (knoten.targets if isinstance(knoten, ast.Assign)
                     else [knoten.target])
            if not knoten.value:
                continue
            benutzt = {a.id for a in ast.walk(knoten.value)
                       if isinstance(a, ast.Name)}
            if _live_wurzel(knoten.value) or (benutzt & namen):
                for z in ziele:
                    if isinstance(z, ast.Name):
                        namen.add(z.id)
        if len(namen) == vorher:
            break
    return namen


def _enge_zahlen(fn):
    """`== 299` / `<= 9` gegen eine Zahl — die Formen, die durch
    ZUWACHS brechen. Ein Boden `> 100000` bricht nie und bleibt aussen
    vor; die Kopfzeile nennt ihn ausdruecklich zulaessig."""
    heraus = []
    for k in ast.walk(fn):
        if not isinstance(k, ast.Compare) or len(k.ops) != 1:
            continue
        if not isinstance(k.ops[0], (ast.Eq, ast.LtE, ast.Lt)):
            continue
        rechts = k.comparators[0]
        if not (isinstance(rechts, ast.Constant)
                and isinstance(rechts.value, (int, float))
                and not isinstance(rechts.value, bool)
                and rechts.value >= AB_HIER_BESTAND):
            continue
        # Reine Funktionspruefung: links steht ein Aufruf, dessen
        # Argumente alle Literale sind. money('255,45€') == 255.45
        links = k.left
        if isinstance(links, ast.Call) and links.args and all(
                isinstance(a, ast.Constant) for a in links.args):
            continue
        heraus.append((getattr(k, 'lineno', 0), rechts.value))
    return heraus


def _befunde():
    schuldig = []
    if not os.path.isdir(PY_TESTS):
        return schuldig
    for name in sorted(os.listdir(PY_TESTS)):
        if not name.startswith('test_') or not name.endswith('.py'):
            continue
        quelle = open(os.path.join(PY_TESTS, name),
                      encoding='utf-8', errors='replace').read()
        try:
            baum = ast.parse(quelle)
        except SyntaxError:
            continue
        livenamen = _livenamen(baum)
        fixtures = _live_fixtures(baum, livenamen)
        for fn in ast.walk(baum):
            if not isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            if fn.name in fixtures:
                continue
            benutzt = {a.id for a in ast.walk(fn) if isinstance(a, ast.Name)}
            # Fixtures kommen als ARGUMENT herein, nicht als Name im Rumpf.
            argumente = {a.arg for a in fn.args.args}
            beruehrt_live = (bool(benutzt & livenamen)
                             or bool(argumente & fixtures)
                             or _live_wurzel(fn))
            if not beruehrt_live or _ausgenommen(name, fn.name):
                continue
            for zeile, wert in _enge_zahlen(fn):
                schuldig.append(f'{name}:{zeile}  {fn.name}()  gegen {wert}')
    return schuldig


def test_kein_python_test_nagelt_eine_livedaten_zahl_fest():
    schuldig = _befunde()
    assert not schuldig, (
        'Diese Pruefungen lesen das echte data/ UND nageln eine Zahl '
        'fest, die durch ZUWACHS bricht:\n  ' + '\n  '.join(schuldig) +
        '\n\nDer naechste Datenlauf macht sie rot und haelt den Deploy '
        'an, ohne dass ein Defekt vorliegt — am 11. und 12.09.2026 '
        'zusammen rund sechs Stunden.\n'
        'Entweder: den Fall selbst bauen (tmp_path) statt data/ zu lesen.\n'
        'Oder: eine RICHTUNG zusichern statt eines Punktes — "verloren '
        'ist ein Fehler, Zuwachs nicht".\n'
        'Oder: die Beobachtung nach scripts/data_guardian.py verschieben, '
        'der meldet und stoppt nichts.\n'
        'Oder, wenn es wirklich richtig ist: oben in ERLAUBT eintragen, '
        'mit Grund.')


def test_die_ausnahmeliste_zeigt_auf_echte_pruefungen():
    """Eine Ausnahme fuer eine geloeschte Pruefung deckt still die naechste.

    Der teuerste Zustand einer Ausnahmeliste ist der, in dem niemand
    mehr weiss, wofuer die Zeilen stehen.
    """
    verwaist = []
    for schluessel in AUSNAHMEN:
        datei, _, funktion = schluessel.partition('::')
        pfad = os.path.join(PY_TESTS, datei)
        if not os.path.exists(pfad):
            verwaist.append(f'{schluessel} (Datei weg)')
            continue
        if funktion == '*':
            continue
        quelle = open(pfad, encoding='utf-8', errors='replace').read()
        try:
            baum = ast.parse(quelle)
        except SyntaxError:
            continue
        namen = {k.name for k in ast.walk(baum)
                 if isinstance(k, (ast.FunctionDef, ast.AsyncFunctionDef))}
        if funktion not in namen:
            verwaist.append(f'{schluessel} (Funktion weg)')
    assert not verwaist, (
        'AUSNAHMEN nennt Pruefungen, die es nicht mehr gibt: '
        + ', '.join(verwaist) + ' — Zeile streichen.')
