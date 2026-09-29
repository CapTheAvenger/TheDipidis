"""op.gg als zweite Quelle fuer den Champions-Attackenpool.

BEFUND (09.09.2026): das Nachschlagewerk stuetzte sich auf genau eine
Quelle. Zwei Folgen:

  * Der Nachtrag aus den Nutzungsdaten hatte nur EINEN Beleg. Meldete
    scripts/scrape_champions_usage.py nach einem Layout-Wechsel einen
    falschen Attackennamen, waere er ungeprueft ins Nachschlagewerk
    gewandert.
  * 45 Attacken hatten keinen deutschen Beschreibungstext, weil PokéAPI
    fuer sie keinen fuehrt.

op.gg fuehrt eine eigene Champions-Attackenliste auf Deutsch. Im Browser
gegen die ausgelieferte Datei gemessen:

    op.gg fuehrt                        581 Attacken
    unsere Datei                        500
    davon bei op.gg nicht gefunden        0
    Staerke-Abweichungen                  0
    unsere ohne de_effect                45
    davon von op.gg abgedeckt            45

Diese Datei prueft den Parser gegen ein Fixture mit der echten
Seitenstruktur und den Bauer gegen seinen Quelltext. Die Abnahme gegen
die LEBENDE Seite leistet der CI-Lauf — aus dem Bausandkasten ist op.gg
nicht erreichbar (Proxy 403).
"""

import importlib.util
import json
import os

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", "..", ".."))
DATEN = os.path.join(WURZEL, "data")
SKRIPT = os.path.join(WURZEL, "scripts", "scrape_opgg_champions_moves.py")
FIXTURE = os.path.join(WURZEL, "tests", "python", "fixtures", "opgg_moves_ausschnitt.html")
BAUER = os.path.join(WURZEL, "scripts", "build_champions_resources.py")


def _lade_skript():
    spec = importlib.util.spec_from_file_location("opgg", SKRIPT)
    modul = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modul)
    return modul


def test_der_parser_liest_die_karten():
    modul = _lade_skript()
    html = open(FIXTURE, encoding="utf-8").read()
    aus = modul.parse(html)
    assert set(aus) == {"make-it-rain", "no-retreat", "thunderbolt"}, sorted(aus)

    mir = aus["make-it-rain"]
    assert mir["de"] == "Goldrausch"
    assert mir["power"] == 120
    assert mir["accuracy"] == 95
    assert mir["pp"] == 8
    assert "Münzen" in mir["text"]
    assert mir["ziel"] == "alle gegner"

    # Statusattacke: keine Staerke, keine Genauigkeit — aber AP.
    #
    # Seit dem 10.09.2026 schreibt der Parser ein fehlendes Feld GAR
    # NICHT, statt es auf null zu setzen. Grund: im ersten CI-Lauf
    # waren power/accuracy/pp in 581 von 581 Eintraegen null, weil
    # op.gg sie erst im Browser nachrendert. Ein Feld, das in jeder
    # Zeile leer ist, sieht aus wie ein Datenverlust; ein fehlendes
    # Feld ist ehrlich.
    nr = aus["no-retreat"]
    assert "power" not in nr and "accuracy" not in nr, (
        "leere Felder werden wieder als null geschrieben")
    assert nr["pp"] == 8


def test_der_parser_ignoriert_links_ohne_karte():
    """Das Fixture enthaelt einen Navigationslink auf dieselbe Strecke.

    Ohne die h3-Bedingung im Parser wuerde er als Attacke ohne Namen
    mitgezaehlt — und die Mindestzahl unten waere damit wertlos.
    """
    modul = _lade_skript()
    html = open(FIXTURE, encoding="utf-8").read()
    # Zwei Sorten Beifang stehen im Fixture: ein Link ohne Slug
    # ("Zurück zu Attacken") und einer MIT Slug, aber ohne <h3> — so
    # sehen die Querverweise auf verwandte Attacken aus. Nur der zweite
    # prueft die h3-Bedingung wirklich; der erste faellt schon durch den
    # Selektor. Gemerkt beim Mutationstest am 09.09.2026, als das
    # Entfernen der Bedingung gruen blieb.
    assert "Zurück zu Attacken" in html, "Fixture ohne Navigationslink"
    assert "moves/spirit-break" in html, "Fixture ohne Querverweis-Link"
    aus = modul.parse(html)
    assert "spirit-break" not in aus, (
        "ein Link ohne <h3> wurde als Attacke gelesen")
    assert len(aus) == 3


def test_fehlende_kampfwerte_werden_benannt():
    """Wenn KEIN Eintrag Zahlen traegt, muss die Datei das sagen.

    Sonst liest sich eine Datei mit 581 vollstaendig aussehenden
    Eintraegen so, als haette sie alles — und niemand merkt, dass drei
    Felder fehlen.
    """
    quelle = open(SKRIPT, encoding="utf-8").read()
    assert "warnung_kampfwerte" in quelle, (
        "die Datei benennt fehlende Kampfwerte nicht")
    assert "mit_kampfwerten" in quelle, (
        "die Zahl der Eintraege mit Kampfwerten wird nicht gefuehrt")

    pfad = os.path.join(DATEN, "opgg_champions_moves.json")
    if not os.path.exists(pfad):
        return
    d = json.load(open(pfad, encoding="utf-8"))
    mt = d.get("_meta", {})
    mit = sum(1 for v in (d.get("attacken") or {}).values()
              if "power" in v or "pp" in v)
    if mit == 0:
        assert (mt.get("warnung_kampfwerte") or "").strip(), (
            "kein Eintrag traegt Kampfwerte, und die Datei sagt nichts "
            "dazu")


def test_eine_halb_geladene_seite_schreibt_nichts():
    modul = _lade_skript()
    assert modul.MINDEST_ATTACKEN >= 300, (
        "die Mindestzahl ist zu niedrig, um eine halb geladene Seite zu "
        "fangen")
    # Der Wert muss unter der gemessenen Zahl liegen, sonst faellt jeder
    # Lauf um; und deutlich darueber liegen als das Fixture.
    assert modul.MINDEST_ATTACKEN < 581


def test_der_bauer_nutzt_die_zweitquelle():
    quelle = open(BAUER, encoding="utf-8").read()
    assert 'os.path.join(DATA, "opgg_champions_moves.json")' in quelle, (
        "der Bauer oeffnet die op.gg-Datei nicht")
    assert 'de_quelle = "opgg"' in quelle, (
        "der Bauer traegt die deutschen Texte von op.gg nicht nach")
    assert "if opgg and key not in opgg:" in quelle, (
        "der Nachtrag prueft den zweiten Beleg nicht — er haengt dann "
        "weiter an einem einzigen Scraper. (Auf den Ausdruck pruefen, "
        "nicht auf den Variablennamen: beim Mutationstest am 09.09.2026 "
        "blieb der Name stehen, waehrend der Zweig tot war.)")
    assert "ohne_zweitbeleg.append" in quelle, (
        "abgelehnte Nachtraege werden nicht gemeldet")
    assert "opgg_konflikte" in quelle, (
        "der Bauer meldet Abweichungen zwischen den Quellen nicht")


def test_die_zweitquelle_ueberschreibt_keine_gepruefte_angabe():
    """op.gg steht in der Kette HINTEN. Das ist die ganze Vorsicht.

    Ein Text von op.gg darf nur einspringen, wo weder die
    hand-gepruefte Datei noch PokéAPI etwas haben. Steht die Zuweisung
    davor, ersetzt die juengste und am wenigsten gepruefte Quelle die
    aelteste und best gepruefte.
    """
    quelle = open(BAUER, encoding="utf-8").read()
    i_kette = quelle.index('de_eff = (v or {}).get("effect") or pk.get("de_eff") or ""')
    i_opgg = quelle.index('de_eff = op["text"]')
    assert i_kette < i_opgg, (
        "op.gg wird zugewiesen, BEVOR die gepruefte Kette laeuft")
    zwischen = quelle[i_kette:i_opgg]
    assert "if not de_eff.strip()" in zwischen, (
        "op.gg springt nicht nur bei leerem Text ein")


def test_die_ausgelieferte_datei_passt_zur_zweitquelle():
    """Nur wenn die Datei schon da ist — sie entsteht im CI-Lauf."""
    pfad = os.path.join(DATEN, "opgg_champions_moves.json")
    if not os.path.exists(pfad):
        return
    d = json.load(open(pfad, encoding="utf-8"))
    attacken = d.get("attacken") or {}
    assert len(attacken) >= 400, f"nur {len(attacken)} Attacken"
    assert d["_meta"]["attacken"] == len(attacken)

    res = json.load(open(os.path.join(DATEN, "champions_resources.json"),
                        encoding="utf-8"))
    import re
    def norm(s):
        return re.sub(r"[^a-z0-9]", "", str(s or "").lower())
    op = {norm(k) for k in attacken}
    unsere = [e for e in res["entries"] if e.get("cat") == "move"]
    fehlend = [e["en"] for e in unsere if norm(e["en"]) not in op]
    assert not fehlend, (
        "diese Attacken stehen in unserer Datei, aber nicht bei op.gg — "
        "entweder ist der Pool falsch oder die Zweitquelle unvollstaendig: "
        + ", ".join(sorted(fehlend)[:10]))
