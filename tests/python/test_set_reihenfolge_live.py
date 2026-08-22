"""Die Set-Reihenfolge muss von der Seite kommen, nicht aus der Fallback-Tabelle.

BEFUND (Wochenlauf vom 22.08.2026, Lauf 32548777571): der Lauf meldete
"Set order scrape failed — limitlesstcg.com order scrape returned <10
sets". sets.json haengt seither vollstaendig an FALLBACK_SET_ORDER, und
ein neu erscheinendes Set bekommt seine Ordnungszahl nur noch ueber den
Datums-Nachtrag. Ohne Ordnungszahl landen seine Karten im Legacy-Chunk,
der Deckbauer findet sie nicht, und die Oberflaeche sortiert sie ans
Ende — das ist die "neues Set wird nicht automatisch erkannt"-Symptomatik,
die in update_sets.py schon einmal dokumentiert ist.

URSACHE, an der echten Seite abgenommen: scrape_live_sets() kannte zwei
Strategien, und beide zielen auf Markup, das es dort nicht mehr gibt.
  * Strategie 1 sucht ein <select> mit >= 10 Set-Codes. Die Seite hat
    vier <select>: Sprachwahl (EN_US, JP_JP, DE_DE …), Bereichswahl
    (CARDS, DECKS), Geltungsbereich (ALL, MAIN, SIDE) und noch eine
    Sprachliste. Kein einziges mit Set-Codes.
  * Strategie 2 sucht Tabellenzeilen. Die Seite hat auf /cards keine
    Tabelle mehr — gemessen: 0 Treffer.

Ausgezeichnet sind die Sets als <span class="code annotation">, in
Erscheinungsreihenfolge, neuestes zuerst: 153 Codes von PBL bis
BS/JU/FO. Derselbe Marker, den quick_check_latest_sets() im japanischen
Scraper seit jeher liest — der EN-Zweig hat ihn nie bekommen.

Die Fixture daneben ist echtes Markup von der Seite, samt der beiden
irrefuehrenden <select>: der Test beweist damit auch, dass die neue
Strategie sich nicht an der Sprachwahl festhaelt.
"""

import os
import sys

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
FIXTURE = os.path.join(HIER, "fixtures", "limitless_cards_seite.html")
sys.path.insert(0, os.path.join(WURZEL, "backend", "core"))

import update_sets  # noqa: E402


@pytest.fixture()
def seite():
    with open(FIXTURE, encoding="utf-8") as f:
        return f.read()


@pytest.fixture()
def scrape(monkeypatch, seite):
    monkeypatch.setattr(update_sets, "safe_fetch_html",
                        lambda url, timeout=15: seite)
    return update_sets.scrape_live_sets


def test_die_sets_werden_gefunden(scrape):
    erg = scrape()
    assert len(erg) >= 10, (
        f"nur {len(erg)} Sets erkannt — unter 10 faellt update_sets auf die "
        f"Fallback-Tabelle zurueck, und neue Sets bekommen keine Ordnungszahl")


def test_das_neueste_set_bekommt_die_hoechste_ordnung(scrape):
    erg = scrape()
    hoechstes = max(erg, key=lambda k: erg[k])
    assert hoechstes == "PBL", (
        f"hoechste Ordnungszahl hat {hoechstes}, erwartet PBL (das erste "
        f"Set auf der Seite). Ist die Reihenfolge gedreht, sortiert die "
        f"Oberflaeche das aelteste Set als neuestes.")
    assert erg["PBL"] > erg["CRI"] > erg["POR"] > erg["ASC"]


def test_sprachwahl_wird_nicht_fuer_sets_gehalten(scrape):
    """Die Fixture enthaelt die echten <select> der Seite."""
    erg = scrape()
    for kein_set in ("EN_US", "JP_JP", "DE_DE", "CARDS", "DECKS", "PT_BR"):
        assert kein_set not in erg, (
            f"{kein_set} stammt aus der Sprach- bzw. Bereichswahl und ist "
            f"kein Set-Code")


def test_ohne_erkennbare_sets_wird_nichts_erfunden(monkeypatch):
    monkeypatch.setattr(update_sets, "safe_fetch_html",
                        lambda url, timeout=15: "<html><body>nichts</body></html>")
    erg = update_sets.scrape_live_sets()
    assert erg == {} or len(erg) < 10, (
        "aus einer Seite ohne Set-Codes darf keine Reihenfolge entstehen — "
        "der Aufrufer faellt dann bewusst auf die Fallback-Tabelle zurueck "
        "und sagt es laut")


def test_reihenfolge_deckt_sich_mit_der_fallback_tabelle(scrape):
    """Live und Fallback duerfen sich nicht widersprechen.

    Nicht die Zahlen selbst (die skaliert main() ohnehin um), sondern die
    REIHENFOLGE der Sets, die beide kennen.
    """
    erg = scrape()
    fb = update_sets.FALLBACK_SET_ORDER
    gemeinsam = [k for k in erg if k in fb]
    assert len(gemeinsam) >= 8, f"zu wenig Ueberschneidung: {gemeinsam}"
    nach_live = sorted(gemeinsam, key=lambda k: erg[k])
    nach_fb = sorted(gemeinsam, key=lambda k: fb[k])
    assert nach_live == nach_fb, (
        "Live-Reihenfolge und Fallback-Tabelle widersprechen sich:\n"
        f"  live:     {nach_live}\n  fallback: {nach_fb}")
