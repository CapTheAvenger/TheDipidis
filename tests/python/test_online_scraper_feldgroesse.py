"""Der Online-Decklisten-Scraper schreibt die Feldgroesse mit — und
entscheidet ACE SPEC nach der starken Regel.

WAS AM 10.09.2026 AUFFIEL
-------------------------
Zwei Luecken in derselben Datei, beide aus derselben Umstellung:

1. `is_ace_spec` lief noch ueber `entscheide_zeile` — die ZEILENLOKALE
   Regel. PR #738 hatte card_scraper_shared.py und limitless_dated.py
   auf `entscheide` mit den Bestandsbelegen umgestellt; dieser Scraper
   war uebersehen worden und schrieb weiter nach der schwachen Regel in
   DIESELBE CSV.

2. Die Spielerzahl des Turniers stand nirgends in der Zeile, obwohl der
   Scraper sie aus `data-players` ohnehin liest. Ohne sie fand
   js/deck-builder-consistency.js fuer Online-Turniere keine
   Feldgroesse und vergab still den Notwert 0,5 — gemessen bei 1.319
   Listen mit 24,6 % der gesamten Gewichtsmasse.
"""

import csv
import os
import sys
import re

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCRAPER = os.path.join(WURZEL, "backend", "scrapers",
                       "limitless_online_decklist_scraper.py")
PAPIER = os.path.join(WURZEL, "backend", "scrapers", "per_decklist_scraper.py")
CSV_DATEI = os.path.join(WURZEL, "data")   # SC-45: Ordner mit den Auszuegen je Format und Monat
sys.path.insert(0, os.path.join(WURZEL, "scripts"))
import per_player_auszuege as _ppa  # noqa: E402


def _quelle(pfad):
    with open(pfad, encoding="utf-8") as f:
        return f.read()


def test_spalte_steht_in_der_gemeinsamen_feldliste():
    """`spielerzahl` muss in per_decklist_scraper.CSV_FIELDS stehen.

    Sonst wirft der naechste PAPIER-Lauf sie wieder weg: `write_rows`
    schreibt die Datei bei abweichender Kopfzeile komplett neu — genau
    das ist der Grund, warum `quelle` und `druck_quelle` dort stehen.
    """
    # Die Liste wird AUSGEWERTET, nicht nach Text durchsucht: eine
    # auskommentierte Zeile stuende sonst weiter im Text und die Probe
    # waere durchgerutscht (10.09.2026 gemessen).
    import ast
    q = _quelle(PAPIER)
    baum = ast.parse(q)
    felder = None
    for knoten in ast.walk(baum):
        if isinstance(knoten, ast.Assign):
            for ziel in knoten.targets:
                if isinstance(ziel, ast.Name) and ziel.id == "CSV_FIELDS":
                    felder = [e.value for e in knoten.value.elts
                              if isinstance(e, ast.Constant)]
    assert felder, "CSV_FIELDS nicht gefunden"
    assert "spielerzahl" in felder, (
        "'spielerzahl' fehlt in CSV_FIELDS — der naechste Papier-Lauf "
        f"loescht die Spalte aus dem Bestand. Gefunden: {felder}")


def test_online_scraper_schreibt_die_gemessene_spielerzahl():
    q = _quelle(SCRAPER)
    assert '"spielerzahl":' in q, "Der Scraper schreibt die Spalte nicht."
    # Und er nimmt die GEMESSENE Zahl aus der Turnierliste, keine andere.
    assert 'turnier.get("spieler")' in q, (
        "Die Zahl kommt nicht aus dem Turniersatz (data-players).")
    # Eine 0 wird nicht als Zahl behauptet.
    assert 'else ""' in q, (
        "Fehlt data-players, muss die Spalte LEER bleiben — eine 0 waere "
        "eine Behauptung ueber die Feldgroesse.")


def test_online_scraper_nutzt_die_starke_ace_spec_regel():
    q = _quelle(SCRAPER)
    assert "belege_aus_bestand" in q, (
        "Die Bestandsbelege werden nicht geladen — der Scraper "
        "entscheidet ACE SPEC weiter aus einer einzelnen Zeile.")
    zeile = re.search(r'"is_ace_spec":\s*(.+)', q)
    assert zeile, "is_ace_spec nicht gefunden"
    assert "entscheide(" in zeile.group(1), (
        "is_ace_spec laeuft nicht ueber die starke Regel `entscheide`, "
        f"sondern ueber: {zeile.group(1).strip()}")


def test_belege_werden_nur_einmal_je_lauf_geladen():
    """`belege_aus_bestand()` liest alle ausgelieferten CSVs — gemessen
    rund 3 Sekunden. Pro Kartenzeile aufgerufen waere der Lauf tot."""
    q = _quelle(SCRAPER)
    assert re.search(r"def _belege\(\):", q), "kein Zwischenspeicher"
    assert "global _BELEGE" in q, (
        "_belege() speichert das Ergebnis nicht — jede Kartenzeile "
        "wuerde den ganzen Bestand neu einlesen.")


def test_bestand_bleibt_lesbar_mit_und_ohne_die_neue_spalte():
    """Die ausgelieferte Datei darf die Spalte fuehren oder nicht —
    aber wenn sie sie fuehrt, muss sie fuer Online-Zeilen gefuellt sein
    und fuer Papierzeilen leer bleiben.

    Papier holt die Feldgroesse aus data/labs_tournament_decks.csv;
    eine zweite Zahl danebenzuschreiben hiesse, zwei Wahrheiten zu
    pflegen.
    """
    if not _ppa.quelle_vorhanden(CSV_DATEI):
        return
    if True:
        if "spielerzahl" not in (_ppa.kopfzeile(CSV_DATEI) or []):
            return          # Bestand vor dem 10.09.2026 — nichts zu pruefen
        papier_gefuellt = 0
        online_leer = 0
        online = 0
        for r in _ppa.quelle_zeilen(CSV_DATEI):
            wert = (r.get("spielerzahl") or "").strip()
            if r.get("quelle") == "papier" and wert:
                papier_gefuellt += 1
            if r.get("quelle") == "online":
                online += 1
                if not wert:
                    online_leer += 1
    assert papier_gefuellt == 0, (
        f"{papier_gefuellt} Papierzeile(n) tragen eine spielerzahl. "
        "Fuer Papier ist labs_tournament_decks.csv die Quelle.")
    if online:
        anteil = online_leer / online
        assert anteil < 0.5, (
            f"{online_leer} von {online} Online-Zeilen ohne spielerzahl "
            f"({anteil * 100:.1f} %) — der Scraper liefert die Zahl nicht.")
