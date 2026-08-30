# -*- coding: utf-8 -*-
"""Zwei Befunde aus der Abnahmerunde vom 30.08.2026.

BEFUND 1 — der URL-Rest in der Setnummer
----------------------------------------
`data/city_league_analysis_M3.csv`: 3.451 von 133.437 Zeilen (2,59 %)
tragen die Abfrage der Herkunfts-URL in der Nummer:

    set_number       61?translate=en      statt  61
    card_identifier  M3 61?translate=en   statt  M3 61

30 Karten, Sets M3 (3.442) und MP (9). Keine davon kommt in derselben
Datei auch sauber vor. Limitless verlinkt Karten aus japanischen Sets
so; der Scraper schneidet die Abfrage inzwischen ab
(card_scraper_shared.py, METHODE 1) — diese Datei ist der eingefrorene
Vergangenheits-Schnappschuss von davor und wird nicht neu erzeugt.

Das Frontend rettet sich an zwei Stellen selbst
(js/app-city-league.js, js/firebase-collection.js schneiden `?…` ab).
Die ausgelieferte Datei ist trotzdem eine veroeffentlichte
Schnittstelle (data/_consumers.md) und war falsch.

BEFUND 2 — die Folge davon, sichtbar im Bild
--------------------------------------------
In 663 dieser Zeilen zeigt `image_url` auf eine ganz andere Karte:

    Staryu      M3 20  ->  PAF 118
    Binacle     M3 41  ->  LOR 106
    Yveltal ex  M3 52  ->  XYP 8

Mit der kaputten Nummer schlug die Suche ueber (Set, Nummer) fehl, und
der Rueckfall ueber den NAMEN griff einen gleichnamigen Druck aus einem
anderen Set — genau der Namens-Join, den CLAUDE.md verbietet. In den
uebrigen 2.788 Zeilen hat der Rueckfall zufaellig richtig gelegen.

Die Bildadresse wird NICHT repariert: eine richtige steht in keiner
ausgelieferten Datei. Sie zu erfinden waere schlimmer als das Loch.

BEFUND 3 — max_count widersprach total_count
--------------------------------------------
365 Zeilen in drei ausgelieferten Dateien verletzen
`max_count x deck_inclusion_count >= total_count`. Beispiel
`city_league_analysis_past.csv:241` — Applin TWM 126: ein Deck, vier
Kopien, und die Spalte sagt "hoechstens drei".

Ursache: `max_count` wurde ueber die einzelne DRUCKZEILE gebildet,
`total_count` aber ueber alle Drucke derselben Karte in einem Deck.
Spielt ein Deck 3x Applin TWM 126 und 1x Applin aus einem anderen
Druck, stehen 4 gegen 3.

Sichtbar wurde es beim Kopieren einer Deckliste aus einer einzigen
Auswahl: dort liest die Oberflaeche `max_count`, und 264 von 4.129
Auswahlen kamen auf 56 bis 59 statt 60.
"""

import collections
import csv
import glob
import os
import sys

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
DATEN = os.path.join(WURZEL, "data")
if WURZEL not in sys.path:
    sys.path.insert(0, WURZEL)

from scripts.repariere_ace_spec import dateien_mit_spalte, felder, lies  # noqa: E402
from scripts.repariere_set_nummern import nummer_aus_bild  # noqa: E402


@pytest.fixture(scope="module")
def zeilen_aller_dateien():
    aus = []
    for pfad in dateien_mit_spalte(DATEN):
        _, tr, namen, zeilen = lies(pfad)
        idx = {n: i for i, n in enumerate(namen)}
        for z in zeilen[1:]:
            fs = [w for w, _, _ in felder(z.rstrip("\r\n"), tr)]
            if len(fs) == len(namen):
                aus.append((os.path.basename(pfad), idx, fs))
    return aus


def feld(idx, fs, name):
    i = idx.get(name)
    return fs[i] if i is not None else None


def zahl(w):
    try:
        return float(str(w).strip().replace(",", "."))
    except (TypeError, ValueError):
        return None


# ── Die Umwandlung selbst ────────────────────────────────────────────

@pytest.mark.parametrize("url,set_code,erwartet", [
    ("https://x/tpc/M3/M3_61_R_JP_LG.png", "M3", "61"),
    ("https://x/tpci/PAF/PAF_118_R_EN_LG.png", "PAF", "118"),
    ("https://x/tpci/XYP/XYP_008_R_EN_LG.png", "XYP", "8"),   # fuehrende Null weg
    ("https://x/tpc/M3/M3_61_R_JP_LG.png", "PAF", None),      # anderes Set
    ("", "M3", None),
    ("https://x/kein_muster.png", "M3", None),
])
def test_nummer_aus_bild(url, set_code, erwartet):
    assert nummer_aus_bild(url, set_code) == erwartet


# ── Der ausgelieferte Bestand ────────────────────────────────────────

def test_bestand_wurde_gelesen(zeilen_aller_dateien):
    assert len(zeilen_aller_dateien) > 500000, (
        "nur %d Zeilen gelesen" % len(zeilen_aller_dateien))


def test_keine_setnummer_traegt_einen_url_rest(zeilen_aller_dateien):
    schlecht = collections.Counter()
    for datei, idx, fs in zeilen_aller_dateien:
        n = feld(idx, fs, "set_number")
        if n and ("?" in n or "#" in n):
            schlecht[(datei, n)] += 1
    assert not schlecht, (
        "%d Zeilen mit URL-Rest in set_number: %s"
        % (sum(schlecht.values()), schlecht.most_common(5)))


def test_kein_kartenkennzeichen_traegt_einen_url_rest(zeilen_aller_dateien):
    schlecht = collections.Counter()
    for datei, idx, fs in zeilen_aller_dateien:
        k = feld(idx, fs, "card_identifier")
        if k and ("?" in k or "#" in k):
            schlecht[(datei, k)] += 1
    assert not schlecht, (
        "%d Zeilen mit URL-Rest in card_identifier: %s"
        % (sum(schlecht.values()), schlecht.most_common(5)))


# Gemessen am 30.08.2026. Beide Zahlen sind Deckel, keine Ziele: die
# betroffenen Werte lassen sich aus den ausgelieferten Zeilen nicht
# herleiten, und sie zu erfinden waere schlimmer als das Loch. Sie
# verschwinden, wenn der Scraper die Dateien das naechste Mal neu
# schreibt — bis dahin darf die Zahl nicht wachsen.
DECKEL_MAXCOUNT = 365
DECKEL_FALSCHE_BILDER = 663


def test_max_count_widerspricht_total_count_nicht(zeilen_aller_dateien):
    """Mehr Kopien insgesamt, als das hoechste Deck haben durfte, kann
    nicht sein: max_count x deck_inclusion_count >= total_count.

    Die 365 Altzeilen bleiben stehen: `max_count` steht fuer "so viele
    lagen hoechstens in EINEM Deck", und diese Zahl steht nirgends sonst
    in der Zeile. Aus `total_count / deck_inclusion_count` liesse sich
    nur ein Mittelwert bilden, kein Maximum. Der Scraper bildet sie
    jetzt richtig; die Datei heilt beim naechsten Lauf."""
    schlecht = collections.Counter()
    geprueft = 0
    for datei, idx, fs in zeilen_aller_dateien:
        mc = zahl(feld(idx, fs, "max_count"))
        tc = zahl(feld(idx, fs, "total_count"))
        dc = zahl(feld(idx, fs, "deck_inclusion_count"))
        if mc is None or tc is None or dc is None or dc <= 0:
            continue
        geprueft += 1
        if mc * dc < tc - 1e-9:
            schlecht[(datei, feld(idx, fs, "card_name"))] += 1
    assert geprueft > 100000, "zu wenige Zeilen geprueft: %d" % geprueft
    anzahl = sum(schlecht.values())
    assert anzahl <= DECKEL_MAXCOUNT, (
        "%d in sich widerspruechliche Zeilen (Deckel %d): %s"
        % (anzahl, DECKEL_MAXCOUNT, schlecht.most_common(5)))


def test_bilder_zeigen_die_karte_der_zeile(zeilen_aller_dateien):
    """Zeigt die Bildadresse auf ein anderes Set als die Zeile, steht
    dort die falsche Karte.

    Die 663 Altzeilen bleiben stehen: eine richtige Bildadresse steht in
    keiner ausgelieferten Datei. Sie zu erfinden waere genau der
    Namens-Join, der den Fehler ueberhaupt erzeugt hat."""
    schlecht = collections.Counter()
    geprueft = 0
    for datei, idx, fs in zeilen_aller_dateien:
        url = (feld(idx, fs, "image_url") or "").strip()
        sc = (feld(idx, fs, "set_code") or "").strip().upper()
        sn = (feld(idx, fs, "set_number") or "").split("?")[0].strip()
        if not url or not sc or not sn:
            continue
        aus_bild = nummer_aus_bild(url, sc)
        if aus_bild is None:
            # Anderes Set im Dateinamen ODER kein erkennbares Muster —
            # ersteres ist der Befund, letzteres nicht pruefbar.
            name = url.rsplit("/", 1)[-1]
            import re as _re
            if _re.match(r"^([A-Za-z0-9-]+)_([0-9]+)_", name):
                schlecht[(datei, feld(idx, fs, "card_name"), sc + " " + sn, name)] += 1
            continue
        geprueft += 1
        if aus_bild != (sn.lstrip("0") or sn):
            schlecht[(datei, feld(idx, fs, "card_name"), sc + " " + sn, url.rsplit("/", 1)[-1])] += 1
    assert geprueft > 100000, "zu wenige Bilder geprueft: %d" % geprueft
    anzahl = sum(schlecht.values())
    assert anzahl <= DECKEL_FALSCHE_BILDER, (
        "%d Zeilen zeigen das Bild einer anderen Karte (Deckel %d): %s"
        % (anzahl, DECKEL_FALSCHE_BILDER, schlecht.most_common(5)))


# ── Der Scraper bildet max_count nicht mehr ueber die Druckzeile ─────

def test_max_count_wird_je_deck_zusammengezaehlt():
    quelle = open(os.path.join(WURZEL, "backend", "core", "card_scraper_shared.py"),
                  encoding="utf-8-sig").read()
    ohne_kommentare = "\n".join(
        z for z in quelle.split("\n") if not z.lstrip().startswith("#"))
    assert "pro_deck[name] += count" in ohne_kommentare, (
        "die Kopien werden nicht mehr je Deck zusammengezaehlt")
    assert "eintrag['max_count'] = max(eintrag['max_count'], im_deck)" in ohne_kommentare, (
        "max_count kommt nicht aus der Deck-Summe")
    assert "['max_count'] = max(grouped_cards[group_key][name]['max_count'], count)" \
        not in ohne_kommentare, (
        "die alte Bildung ueber die einzelne Druckzeile ist wieder da")
