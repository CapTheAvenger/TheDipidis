"""Die Turnieruebersicht muss jedes Turnier einem Format zuordnen.

BEFUND (gemessen 21.08.2026): 2 von 111 Zeilen in
data/tournament_cards_data_overview.csv hatten ein leeres Feld
'format' — Special Event Turin (540) und NAIC New Orleans (518).
Dieselben Turniere tragen in
data/tournament_cards_data_cards_TEF-CRI.csv die Angabe meta='TEF-CRI'
auf 2.737 Zeilen. Die Uebersicht wusste es also nicht, obwohl es
danebenlag.

URSACHE, nachgestellt mit bs4: get_tournament_info() suchte das Format
mit einem Regex in str(soup). BeautifulSoup escapt beim
Re-Serialisieren jedes & zu &amp;, und das Muster [?&]format= findet
dann nichts mehr:

    href="/tournaments/540/decks?time=all&format=TEF-CRI"
      -> str(soup): "...&amp;format=TEF-CRI"  -> kein Treffer
      -> href-Attribut:                          TEF-CRI

Getroffen hat der alte Weg nur, wenn 'format' der einzige oder erste
Parameter war. Genau dieser Fehler war in _fetch_current_format
derselben Datei bereits beschrieben und behoben; die Korrektur war hier
nie angekommen.

Zeitkritisch war das, weil die Weltmeisterschaft bevorsteht: ohne
Format in der Uebersicht faellt ein Turnier aus dem Frontend-Filter
js/app-meta-cards.js heraus.

Dazu: tournament_id 539 (Regional Prague) stand doppelt drin, mit
total_cards 5783 und 1019. Tatsaechlich liegen 1019 Kartenzeilen vor —
die Zeile mit 5783 versprach 4.764 Zeilen, die es nicht gibt.
"""

import collections
import csv
import glob
import os
import re

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
UEBERSICHT = os.path.join(ROOT, "data", "tournament_cards_data_overview.csv")


@pytest.fixture(scope="module")
def zeilen():
    with open(UEBERSICHT, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f, delimiter=";"))


@pytest.fixture(scope="module")
def meta_je_turnier():
    """tournament_id -> Menge der meta-Werte aus den Chunk-Dateien."""
    raus = collections.defaultdict(set)
    for pfad in glob.glob(os.path.join(ROOT, "data",
                                       "tournament_cards_data_cards_*.csv")):
        with open(pfad, encoding="utf-8-sig", newline="") as f:
            for r in csv.DictReader(f, delimiter=";"):
                tid = (r.get("tournament_id") or "").strip()
                m = (r.get("meta") or "").strip()
                if tid and m:
                    raus[tid].add(m)
    return raus


class TestUebersicht:
    def test_keine_zeile_ohne_format(self, zeilen):
        ohne = [(z["tournament_id"], z["tournament_name"][:40])
                for z in zeilen if not (z.get("format") or "").strip()]
        assert not ohne, (
            f"{len(ohne)} Turniere ohne Format: {ohne}. Sie fallen aus dem "
            "Format-Filter des Frontends heraus."
        )

    def test_keine_doppelte_turnier_id(self, zeilen):
        c = collections.Counter(z["tournament_id"] for z in zeilen)
        doppelt = {k: v for k, v in c.items() if v > 1}
        assert not doppelt, f"doppelte tournament_id: {doppelt}"

    def test_das_format_widerspricht_den_kartendaten_nicht(self, zeilen, meta_je_turnier):
        """Wo beide Seiten etwas sagen, muessen sie dasselbe sagen."""
        streit = []
        for z in zeilen:
            tid = (z["tournament_id"] or "").strip()
            fmt = (z.get("format") or "").strip()
            belege = meta_je_turnier.get(tid)
            if not fmt or not belege or len(belege) != 1:
                continue
            beleg = next(iter(belege))
            if fmt != beleg:
                streit.append(f"{tid} {z['tournament_name'][:28]}: "
                              f"Uebersicht {fmt} vs Kartendatei {beleg}")
        assert not streit, "Uebersicht und Kartendateien widersprechen sich:\n  " + \
                           "\n  ".join(streit)


class TestFormatErkennung:
    """Der Weg, auf dem das Format ueberhaupt in die Zeile kommt."""

    def test_das_format_wird_aus_dem_href_attribut_gelesen(self):
        pfad = os.path.join(ROOT, "backend", "scrapers", "tournament_scraper_JH.py")
        with open(pfad, encoding="utf-8-sig") as f:
            quelle = f.read()
        i = quelle.index("def get_tournament_info(")
        j = quelle.index("def ", i + 10)
        block = quelle[i:j]
        assert "soup.select('a[href]')" in block, (
            "das Format muss ueber das href-Attribut gelesen werden — "
            "ein Regex gegen str(soup) scheitert am escapten &amp;"
        )
        assert not re.search(r"re\.search\(r'<a\[\^>\]\*href=", block), (
            "der alte Regex gegen str(soup) steht noch da"
        )

    def test_es_gibt_einen_zweiten_weg_ueber_das_datum(self):
        pfad = os.path.join(ROOT, "backend", "scrapers", "tournament_scraper_JH.py")
        with open(pfad, encoding="utf-8-sig") as f:
            quelle = f.read()
        i = quelle.index('"format": t.get("format")')
        block = quelle[i:i + 200]
        assert "_derive_meta_from_date_JH" in block, (
            "ohne Rueckfall bleibt die Spalte leer, wenn die Seite keinen "
            "Decks-Link mit ?format= hat"
        )

    def test_bs4_escapt_wirklich_und_das_attribut_hilft(self):
        """Der Beleg selbst, damit die Begruendung nachpruefbar bleibt."""
        bs4 = pytest.importorskip("bs4")
        import urllib.parse
        html = ('<a href="/tournaments/540/decks?time=all'
                '&format=TEF-CRI">Decks</a>')
        soup = bs4.BeautifulSoup(html, "html.parser")
        assert "&amp;format=" in str(soup), "bs4 escapt nicht mehr — Test neu bewerten"
        alt = re.search(r'<a[^>]*href=["\'][^"\']*[?&]format=([^"\'&]+)["\'][^>]*>',
                        str(soup), re.IGNORECASE)
        assert alt is None, "der alte Weg trifft doch — Befund neu bewerten"
        gefunden = None
        for a in soup.select("a[href]"):
            m = re.search(r"[?&]format=([^&]+)", a.get("href") or "", re.IGNORECASE)
            if m:
                gefunden = urllib.parse.unquote(m.group(1).strip())
        assert gefunden == "TEF-CRI"
