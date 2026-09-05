"""Der Tagesfilter 'day1' ist eine Kopie von 'overall' — nachgewiesen.

BEFUND 05.09.2026. In data/labs_tournament_matchups_TEF-PBL.csv sind alle
769 Paare unter day_filter='day1' byteweise identisch mit denen unter
'overall'; in TEF-CRI ebenso (2.528 von 2.528).

Der Beweis, dass 'day1' dort nicht echt sein KANN, ist eine Ungleichung:
in 238 von 238 Paaren, die in allen drei Filtern stehen, gilt

    day1 + day2 > overall

Eine echte Tag-1-Teilmenge kann zusammen mit Tag 2 nicht mehr Spiele
haben als das Ganze. Ursache steht im Scraper: das Abfrage-Flag `&d1`
wurde geraten, `&d2` wurde am 25.05.2026 bestaetigt und wirkt (day2
weicht in 205 von 238 Paaren ab).

WARUM DAS NICHT KOSMETISCH IST: die Oberflaeche mischt Day-2 mit 0,45 und
Day-1 mit 0,35, Overall ist nur Rueckfall. Ist "Day 1" in Wahrheit
Overall — und Overall enthaelt die Tag-2-Spiele —, dann zaehlen die
Tag-2-Ergebnisse zweimal, auf jedem Deck.

WAS DIESE DATEI TUT: sie haelt den Zustand fest und meldet, wenn er sich
aendert — in BEIDE Richtungen.

  • Wird der Scraper repariert und 'day1' echt, faellt die zweite
    Zusicherung um. Das ist dann kein Fehler, sondern die Aufforderung,
    den Verband in js/app-meta-call.js (_day1IstKopie) und den
    zugehoerigen JS-Test wieder zu entfernen.
  • Bleibt es, wie es ist, haelt die erste Zusicherung fest, dass der
    Verband gebraucht wird.

Bewusst ohne PyYAML und ohne Netz — dieselbe Falle wie in
test_wochenlauf_bilanz.py: die CI installiert nur pytest, bs4, requests
und lxml, und der Deploy haengt am Test-Job.
"""

import csv
import os

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
DATEN = os.path.join(WURZEL, "data")

# Nur die Formate, die ueberhaupt Tagesfilter fuehren. Die aelteren
# Dateien (BRS-*, SVI-*) haben ausschliesslich 'overall' — dort gab es
# den Tagesscrape noch nicht, und ein fehlender Filter ist kein Befund.
FORMATE = ("TEF-PBL", "TEF-CRI", "TEF-POR")

FELDER = ("vs_count", "vs_wins", "vs_losses", "vs_ties", "vs_win_pct")


def _lies(format_key):
    pfad = os.path.join(DATEN, f"labs_tournament_matchups_{format_key}.csv")
    if not os.path.isfile(pfad):
        pytest.skip(f"{os.path.basename(pfad)} fehlt")
    with open(pfad, encoding="utf-8") as f:
        zeilen = list(csv.DictReader(f))
    if not zeilen or "day_filter" not in zeilen[0]:
        pytest.skip(f"{os.path.basename(pfad)} fuehrt keinen Tagesfilter")
    nach_filter = {}
    for z in zeilen:
        schluessel = (z["my_deck_slug"], z["opponent_deck_slug"])
        nach_filter.setdefault(z.get("day_filter") or "overall", {})[schluessel] = z
    return nach_filter


@pytest.mark.parametrize("format_key", FORMATE)
def test_day1_ist_noch_immer_eine_kopie_von_overall(format_key):
    """Solange das gilt, wird der Verband in app-meta-call.js gebraucht."""
    f = _lies(format_key)
    ov, d1 = f.get("overall") or {}, f.get("day1") or {}
    if not d1:
        pytest.skip(f"{format_key} hat keine day1-Zeilen")

    gemeinsam = [k for k in d1 if k in ov]
    assert gemeinsam, f"{format_key}: day1 und overall haben kein Paar gemeinsam"
    gleich = sum(
        1 for k in gemeinsam if all(d1[k][x] == ov[k][x] for x in FELDER)
    )
    anteil = gleich / len(gemeinsam)
    assert anteil > 0.95, (
        f"{format_key}: nur {gleich} von {len(gemeinsam)} day1-Paaren sind noch "
        f"identisch mit overall ({anteil:.1%}). Wenn das Flag &d1 im Scraper "
        f"repariert wurde, ist das die gute Nachricht — dann gehoeren "
        f"_day1IstKopie in js/app-meta-call.js und der zugehoerige JS-Test "
        f"(tests/unit/test-vorzeichen-und-tageskopie.js) entfernt, und diese "
        f"Zusicherung mit ihnen."
    )


@pytest.mark.parametrize("format_key", FORMATE)
def test_die_ungleichung_beweist_dass_day1_nicht_echt_ist(format_key):
    """day1 + day2 > overall kann fuer eine echte Teilmenge nicht gelten."""
    f = _lies(format_key)
    ov, d1, d2 = f.get("overall") or {}, f.get("day1") or {}, f.get("day2") or {}
    drei = [k for k in ov if k in d1 and k in d2]
    if not drei:
        pytest.skip(f"{format_key} hat keine Paarung in allen drei Filtern")

    def n(zeile):
        try:
            return int(zeile["vs_count"] or 0)
        except ValueError:
            return 0

    verletzt = [k for k in drei if n(d1[k]) + n(d2[k]) > n(ov[k])]
    assert len(verletzt) == len(drei), (
        f"{format_key}: die Ungleichung gilt nur noch in {len(verletzt)} von "
        f"{len(drei)} Paaren. Falls day1 jetzt eine echte Teilmenge ist, ist "
        f"der Scraper repariert — siehe den Hinweis in der anderen Zusicherung."
    )


def test_day2_wirkt_und_ist_keine_kopie():
    """Die Gegenprobe: `&d2` wurde bestaetigt und liefert etwas anderes.

    Ohne diese Zusicherung koennte man den Befund oben auch so lesen, dass
    der Tagesscrape generell nichts tut. Er tut etwas — nur nicht fuer
    Tag 1.
    """
    f = _lies("TEF-PBL")
    ov, d2 = f.get("overall") or {}, f.get("day2") or {}
    gemeinsam = [k for k in d2 if k in ov]
    assert gemeinsam, "keine gemeinsamen Paare fuer die Gegenprobe"
    abweichend = sum(
        1 for k in gemeinsam if any(d2[k][x] != ov[k][x] for x in FELDER)
    )
    assert abweichend / len(gemeinsam) > 0.5, (
        f"nur {abweichend} von {len(gemeinsam)} day2-Paaren weichen von overall "
        f"ab — dann wirkt auch `&d2` nicht mehr, und der ganze Tagesscrape ist "
        f"in Frage zu stellen, nicht nur `&d1`."
    )


def test_der_scraper_gibt_die_vermutung_nicht_mehr_als_gesichert_aus():
    """Was ein Test liest, ist Code — hier ist es ein Kommentar.

    Der alte Kommentar nannte den Fall "still valid — just mis-labeled as
    day1". Genau diese Einschaetzung war falsch und hat den Befund vier
    Monate lang gedeckt.
    """
    pfad = os.path.join(WURZEL, "backend", "scrapers", "labs_tournament_scraper.py")
    with open(pfad, encoding="utf-8") as f:
        quelle = f.read()
    assert "&d1` WAR EINE VERMUTUNG, UND SIE IST WIDERLEGT" in quelle, (
        "der Scraper behauptet wieder, `&d1` sei eine offene Vermutung — sie "
        "ist widerlegt, und das gehoert an die Stelle geschrieben, an der "
        "jemand das naechste Flag raten wuerde"
    )
    # Geprueft wird der ORIGINALSATZ, nicht das Zitat davon. Der neue
    # Kommentar zitiert die alte Einschaetzung ausdruecklich, um zu
    # erklaeren, warum sie falsch war — dieses Zitat darf die Zusicherung
    # nicht ausloesen.
    assert "rows are still valid" not in quelle, (
        "die alte Einschaetzung steht wieder als Aussage da. Sie ist falsch: "
        "eine falsche Beschriftung ist hier ein Rechenfehler, kein "
        "Schoenheitsfehler."
    )
    # Und der Weg nach vorn muss dastehen: der Sandkasten erreicht
    # labs.limitlesstcg.com nicht, also ist der CI-Lauf der einzige Ort,
    # an dem sich das richtige Flag ueberhaupt feststellen laesst.
    assert "workflow_dispatch" in quelle, (
        "der Kommentar sagt nicht mehr, WIE das richtige Flag zu ermitteln "
        "ist. Ohne diesen Hinweis raet der naechste wieder — und das letzte "
        "Raten ist vier Monate unbemerkt geblieben."
    )
