"""Ein Turnier, ein Abruf, eine Zahl.

BEFUND (25.09.2026, am Wochenlauf 160 gemessen)
-----------------------------------------------
data/city_league_archetypes.csv fuehrte 58 Zeilen, 29 davon doppelt.
Turnier 569 (Champions League Yokohama, 20.09.2026, 10.000 Spieler)
stand zweimal drin:

    20 Sep 26            | JP            | Champions League Yokohama | Champions League (JP)
    20th September 2026  | Special Event | Tournament 569            | City League (JP)

Die zweite Zeile ist derselbe Abruf mit den Platzhaltern, die
get_tournament_by_id() setzt, wenn die Seite eines EINZELNEN Turniers
keine Praefektur fuehrt.

WARUM ZWEIMAL
-------------
Das Turnier kommt ueber ZWEI Wege in die Liste:

  1. get_jp_major_tournaments() findet es in der Hauptliste
     /tournaments (neu seit dem 25.09.2026 — japanische Majors stehen
     nicht in /tournaments/jp).
  2. update_sets.apply_format_window_to_scraper_settings hat es per
     auto_discover_js gleichzeitig in `additional_tournament_ids`
     geschrieben.

Der Dedup-Riegel stand nur im Major-Zweig; die Handliste haengte blind
an.

WAS DAS GEKOSTET HAT
--------------------
In data/city_league_analysis.csv stand danach JEDE Zahl doppelt: 48
Decks statt 24, 24 Kopien Lahmus statt 12. Alle 14 Archetypen trugen
eine gerade Deckzahl — bei 14 unabhaengigen Werten ist das 1 zu 16.384
und damit der Beleg, nicht die Vermutung.

Der Riegel `scraped_ids` greift dagegen nicht: er kennt nur Turniere
FRUEHERER Laeufe, nicht zwei Eintraege im selben Lauf.
"""

import ast
import csv
import importlib.util
import os
import sys

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
DATA = os.path.join(WURZEL, "data")
ARCHETYP = os.path.join(WURZEL, "backend", "scrapers", "city_league_archetype_scraper.py")
ANALYSE = os.path.join(WURZEL, "backend", "scrapers", "city_league_analysis_scraper.py")


def _lade(pfad, name):
    sys.path.insert(0, os.path.join(WURZEL, "backend", "scrapers"))
    sys.path.insert(0, os.path.join(WURZEL, "backend", "core"))
    spec = importlib.util.spec_from_file_location(name, pfad)
    mod = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(mod)
    except Exception as e:  # noqa: BLE001
        pytest.skip("%s nicht ladbar: %s" % (os.path.basename(pfad), e))
    return mod


def _zeilen(name):
    pfad = os.path.join(DATA, name)
    if not os.path.exists(pfad):
        pytest.skip("%s fehlt im Baum" % name)
    csv.field_size_limit(min(sys.maxsize, 2**31 - 1))
    with open(pfad, newline="", encoding="utf-8-sig") as fh:
        return list(csv.DictReader(fh, delimiter=";"))


# ── 1 · Der Riegel, am Verhalten ─────────────────────────────────────

def test_die_handliste_haengt_nicht_blind_an():
    """Der Kern des Befunds: `additional_tournament_ids` respektiert
    dieselbe Sperre wie der Major-Zweig.

    Geprueft am Syntaxbaum, nicht am Wortlaut — und Docstrings zaehlen
    nicht, weil der eigene Kommentar die Probe sonst blind macht
    (CLAUDE.md, und genau so passiert am 25.09.2026 zweimal).
    """
    for pfad in (ARCHETYP, ANALYSE):
        with open(pfad, encoding="utf-8-sig") as fh:
            baum = ast.parse(fh.read())

        # Die Schleife ueber additional_tournament_ids finden.
        schleifen = [k for k in ast.walk(baum) if isinstance(k, ast.For)]
        treffer = []
        for s in schleifen:
            text = ast.dump(s.iter)
            if "additional_tournament_ids" in text or "additional_ids" in text:
                treffer.append(s)
        assert treffer, ("%s: keine Schleife ueber additional_tournament_ids gefunden"
                         % os.path.basename(pfad))

        for s in treffer:
            koerper = ast.Module(body=list(s.body), type_ignores=[])
            namen = {getattr(k, "id", None) for k in ast.walk(koerper)}
            assert "bekannte" in namen, (
                "%s: die Schleife ueber additional_tournament_ids fragt die "
                "Sperre `bekannte` nicht — dann kommt ein Turnier zweimal "
                "herein, sobald es auch in der Turnierliste steht"
                % os.path.basename(pfad))
            # Und sie muss abbrechen koennen.
            assert any(isinstance(k, ast.Continue) for k in ast.walk(koerper)), (
                "%s: die Schleife prueft `bekannte`, ueberspringt aber nichts"
                % os.path.basename(pfad))


def test_die_sperre_steht_vor_beiden_zweigen():
    """`bekannte` wurde bisher IM if-Block der Majors angelegt. Steht es
    dort, ist es bei abgeschalteten Majors gar nicht definiert — und die
    Handliste haette keine Sperre, an der sie sich pruefen koennte."""
    for pfad in (ARCHETYP, ANALYSE):
        with open(pfad, encoding="utf-8-sig") as fh:
            quelle = fh.read()
        baum = ast.parse(quelle)
        zuweisungen = []
        for k in ast.walk(baum):
            if isinstance(k, ast.Assign):
                for z in k.targets:
                    if isinstance(z, ast.Name) and z.id == "bekannte":
                        zuweisungen.append(k)
        assert zuweisungen, "%s: `bekannte` wird nirgends gesetzt" % os.path.basename(pfad)

        # Keine dieser Zuweisungen darf in einem `if` ueber
        # include_jp_majors stecken.
        for k in ast.walk(baum):
            if not isinstance(k, ast.If):
                continue
            if "include_jp_majors" not in ast.dump(k.test):
                continue
            drin = [z for z in zuweisungen if z in list(ast.walk(k))]
            assert not drin, (
                "%s: `bekannte` wird im if-Block der Majors angelegt — bei "
                "include_jp_majors=false gibt es dann keine Sperre"
                % os.path.basename(pfad))


def test_der_abruf_selbst_hat_einen_zweiten_riegel():
    """Ein zweiter Riegel direkt an der Abrufschleife der
    Kartenauswertung: kommt spaeter ein dritter Weg dazu, haelt er
    trotzdem."""
    with open(ANALYSE, encoding="utf-8-sig") as fh:
        quelle = fh.read()
    baum = ast.parse(quelle)
    gefunden = False
    for k in ast.walk(baum):
        if not isinstance(k, ast.If):
            continue
        t = ast.dump(k.test)
        if "newly_scraped_ids" in t and "t_id" in t:
            gefunden = any(isinstance(x, ast.Continue) for x in ast.walk(k))
            if gefunden:
                break
    assert gefunden, (
        "in der Abrufschleife steht kein `if t_id in newly_scraped_ids: continue` — "
        "ein Turnier, das zweimal in der Liste steht, wird dann zweimal abgerufen "
        "und jede Deckzahl verdoppelt")


# ── 2 · Die Selbstheilung ─────────────────────────────────────────────

def test_entdoppeln_nimmt_die_bessere_zeile():
    mod = _lade(ARCHETYP, "cla_unter_test")
    echt = {"date": "20 Sep 26", "tournament_id": "569", "prefecture": "JP",
            "shop": "Champions League Yokohama", "format": "Champions League (JP)",
            "placement": "1", "player": "Keiyo Watanabe", "archetype": "Mega Excadrill"}
    platzhalter = {"date": "20th September 2026", "tournament_id": "569",
                   "prefecture": "Special Event", "shop": "Tournament 569",
                   "format": "City League (JP)", "placement": "1",
                   "player": "Keiyo Watanabe", "archetype": "Mega Excadrill"}

    # Beide Reihenfolgen muessen dasselbe ergeben: sonst haengt das
    # Ergebnis daran, wer zuerst gescrapt wurde.
    for eingabe in ([echt, platzhalter], [platzhalter, echt]):
        raus = mod.entdoppeln(eingabe)
        assert len(raus) == 1
        assert raus[0]["format"] == "Champions League (JP)", (
            "die Platzhalterzeile hat gewonnen — dann heisst die Champions "
            "League Yokohama auf der Seite weiter „City League“")
        assert raus[0]["shop"] == "Champions League Yokohama"
        assert raus[0]["prefecture"] == "JP"


def test_entdoppeln_laesst_echte_zeilen_stehen():
    mod = _lade(ARCHETYP, "cla_unter_test2")
    zeilen = [
        {"tournament_id": "1", "placement": "1", "player": "A", "format": "City League (JP)",
         "prefecture": "Tokyo", "shop": "Laden"},
        {"tournament_id": "1", "placement": "2", "player": "B", "format": "City League (JP)",
         "prefecture": "Tokyo", "shop": "Laden"},
        {"tournament_id": "2", "placement": "1", "player": "A", "format": "City League (JP)",
         "prefecture": "Osaka", "shop": "Laden"},
    ]
    assert len(mod.entdoppeln(zeilen)) == 3, (
        "drei verschiedene Platzierungen sind keine Doppel")


def test_entdoppeln_haelt_den_platzhalter_wenn_es_nur_ihn_gibt():
    """Ein Turnier, das NUR ueber den Einzelabruf hereinkam, darf nicht
    verschwinden — der Platzhalter ist dann die einzige Auskunft."""
    mod = _lade(ARCHETYP, "cla_unter_test3")
    nur = [{"tournament_id": "9", "placement": "1", "player": "X",
            "format": "City League (JP)", "prefecture": "Special Event",
            "shop": "Tournament 9"}]
    raus = mod.entdoppeln(nur)
    assert len(raus) == 1
    assert raus[0]["shop"] == "Tournament 9"


# ── 3 · Die Daten im Baum ─────────────────────────────────────────────

def test_keine_platzierung_steht_doppelt():
    """Der Befund selbst, an den ausgelieferten Dateien."""
    for name in ("city_league_archetypes.csv", "city_league_archetypes_past.csv"):
        zeilen = _zeilen(name)
        if not zeilen:
            continue
        gesehen = {}
        for z in zeilen:
            s = (str(z.get("tournament_id") or "").strip(),
                 str(z.get("placement") or "").strip(),
                 str(z.get("player") or "").strip())
            gesehen[s] = gesehen.get(s, 0) + 1
        doppelt = sorted(s for s, n in gesehen.items() if n > 1)
        assert doppelt == [], (
            "%s: %d Platzierungen stehen doppelt — jede Archetypzahl dieses "
            "Turniers zaehlt damit doppelt: %s" % (name, len(doppelt), doppelt[:5]))


def test_kein_turnier_steht_unter_zwei_turnierklassen():
    """Derselbe Befund von der anderen Seite — und der, den man auf der
    Seite sieht: „Champions League (JP) + City League (JP)" stand am
    25.09.2026 woertlich in city_league_archetypes_deck_stats.csv."""
    for name in ("city_league_archetypes.csv", "city_league_archetypes_past.csv"):
        zeilen = _zeilen(name)
        if not zeilen:
            continue
        klassen = {}
        for z in zeilen:
            klassen.setdefault(str(z.get("tournament_id") or "").strip(),
                               set()).add((z.get("format") or "").strip())
        mehrfach = {t: sorted(k) for t, k in klassen.items() if len(k) > 1}
        assert mehrfach == {}, (
            "%s: diese Turniere stehen unter zwei Turnierklassen: %s"
            % (name, mehrfach))


def test_keine_kartenzeile_steht_doppelt():
    for name in ("city_league_analysis.csv", "city_league_analysis_past.csv"):
        zeilen = _zeilen(name)
        if not zeilen:
            continue
        gesehen = {}
        for z in zeilen:
            s = (str(z.get("tournament_id") or "").strip(),
                 str(z.get("archetype") or "").strip(),
                 str(z.get("card_identifier") or "").strip(),
                 str(z.get("period") or "").strip())
            gesehen[s] = gesehen.get(s, 0) + 1
        doppelt = sorted(s for s, n in gesehen.items() if n > 1)
        assert doppelt == [], (
            "%s: %d Kartenzeilen stehen doppelt: %s" % (name, len(doppelt), doppelt[:5]))


def test_die_abgeleiteten_dateien_passen_zu_den_platzierungen():
    """city_league_archetypes_deck_stats.csv zaehlt Auftritte. Die Zahl
    muss der Zahl der Platzierungen in derselben Turnierklasse
    entsprechen — sie war am 25.09.2026 genau doppelt so hoch."""
    zeilen = _zeilen("city_league_archetypes.csv")
    stats = _zeilen("city_league_archetypes_deck_stats.csv")
    if not zeilen or not stats:
        pytest.skip("Archetyp- oder Statistikdatei leer")
    gezaehlt = {}
    for z in zeilen:
        a = (z.get("archetype") or "").strip()
        gezaehlt[a] = gezaehlt.get(a, 0) + 1
    falsch = []
    for s in stats:
        a = (s.get("archetype") or "").strip()
        try:
            n = int(str(s.get("total_appearances") or "0").strip())
        except ValueError:
            continue
        if a in gezaehlt and n != gezaehlt[a]:
            falsch.append((a, n, gezaehlt[a]))
    assert falsch == [], (
        "die Statistik zaehlt andere Auftritte als die Archetypdatei "
        "Platzierungen fuehrt (Archetyp, Statistik, gezaehlt): %s" % falsch[:8])
