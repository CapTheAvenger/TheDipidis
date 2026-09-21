"""Jeder deutsche Kartenname in der Masterclass-Aufbereitung muss darin
auch seinen englischen Namen haben.

BEFUND (21.09.2026): Der Betreiber las im Stueck von der Karte "Matt"
und konnte nicht erkennen, welche Karte gemeint ist — es ist der
deutsche Name von *Crispin*. Die Zusage fuer die Aufbereitung lautete
aber ausdruecklich: alle Kartennamen deutsch UND englisch, weil er die
Karten auf Deutsch in der Hand hat und die englischen Listen liest.

Gemessen an dem Tag: 22 von 133 Kartennamen standen nur auf Deutsch da.
Keine einzige Zusicherung hatte das gesehen, weil keine die Namen gegen
die Kartendatenbank gehalten hat. Dieser Test tut es — und er prueft die
REGEL, nicht die 22 Nachzuegler.

Gegenprobe im Test selbst: Die Namensliste muss gross genug sein,
sonst prueft der Test ins Leere (etwa wenn die Datenbank umzieht).
"""

import csv
import html
import os
import re

import pytest

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.normpath(os.path.join(HIER, "..", ".."))
STUECK = os.path.join(WURZEL, "masterclass", "mega-stalobor.de.html")
DATENBANK = os.path.join(WURZEL, "data", "all_cards_database.csv")

# Deutsche Kartennamen, die zugleich gewoehnliche Woerter sind. Sie im
# Stueck zu verlangen, wuerde nur Rauschen erzeugen.
ALLTAG = {
    "Karte", "Richter", "Aufbereitung", "Tausch", "Wechsel", "Energie",
    "Potenzial", "Schwung", "Klecks", "Kescher", "Notfall", "Stadion",
    "Stempel", "Ausrüstung", "Nest", "Freund", "Held", "Schild",
    "Gefährte", "Gegner", "Wunder", "Wandel", "Kraft", "Mut", "Sturm",
    "Schatten", "Fokus", "Anker", "Sprung", "Kette", "Zwilling",
}


def _namenpaare():
    csv.field_size_limit(10 ** 7)
    with open(DATENBANK, encoding="utf-8-sig") as f:
        paare = {}
        for zeile in csv.DictReader(f):
            de = (zeile.get("name_de") or "").strip()
            en = (zeile.get("name_en") or "").strip()
            if de and en and de not in ALLTAG and len(de) >= 6:
                paare.setdefault(de, set()).add(en)
    return paare


@pytest.mark.skipif(not os.path.exists(STUECK), reason="Stueck nicht im Baum")
def test_jeder_deutsche_kartenname_nennt_auch_den_englischen():
    paare = _namenpaare()
    assert len(paare) > 2000, (
        "nur %d Namenspaare aus der Datenbank gelesen — der Test wuerde "
        "ins Leere pruefen" % len(paare)
    )

    with open(STUECK, encoding="utf-8") as f:
        roh = f.read()
    # Die Bildadressen tragen englische Set-Kuerzel, kein Fliesstext.
    text = html.unescape(re.sub(r"<img[^>]*>", " ", roh))
    # html.unescape, weil der Erzeuger Apostrophe als &#x27; maskiert —
    # sonst findet der Test "Lillie's Clefairy ex" nie.
    # Typografisches und gerades Apostroph sind dasselbe Zeichen fuer
    # einen Leser — "Lillie's" darf nicht daran scheitern.
    glatt = lambda s: s.replace("\u2019", "'").replace("\u02bc", "'")
    text = glatt(text)

    rest, gefunden = text, []
    for name in sorted(paare, key=len, reverse=True):
        muster = r"(?<![\wäöüÄÖÜß-])" + re.escape(name) + r"(?![\wäöüÄÖÜß-])"
        if re.search(muster, rest):
            gefunden.append(name)
            rest = re.sub(muster, " " * len(name), rest)

    assert len(gefunden) > 60, (
        "nur %d Kartennamen im Stueck erkannt — vermutlich stimmt das "
        "Format nicht mehr" % len(gefunden)
    )

    ohne = [n for n in gefunden if not any(glatt(en) in text for en in paare[n])]
    assert ohne == [], (
        "Diese Karten stehen nur auf Deutsch im Stueck — der Leser kann "
        "sie in keiner englischen Liste wiederfinden:\n  "
        + "\n  ".join(
            "%s (englisch: %s)" % (n, ", ".join(sorted(paare[n]))) for n in sorted(ohne)
        )
    )


def _attackennamen():
    """Alle Attacken- und Faehigkeitsnamen aus der Datenbank, deutsch
    und englisch, als eine Menge."""
    csv.field_size_limit(10 ** 7)
    muster = re.compile(
        r"(?:^|\|\|)\s*(?:\[Ability\]|[CDFGLMNPRWY0]{1,5})\s+"
        r"([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß'’\- ]{2,34}?)"
        r"(?=\s+\d|\s*\|\||\s*$)"
    )
    namen = set()
    with open(DATENBANK, encoding="utf-8-sig") as f:
        for zeile in csv.DictReader(f):
            for feld in ("card_text", "card_text_de"):
                for m in muster.finditer(zeile.get(feld) or ""):
                    namen.add(m.group(1).strip().replace("’", "'"))
    return namen


@pytest.mark.skipif(not os.path.exists(STUECK), reason="Stueck nicht im Baum")
def test_jeder_kursive_attackenname_steht_auch_auf_einer_karte():
    """Kursiv gesetzte Attackennamen muessen echte Attacken sein.

    BEFUND (21.09.2026): Im Stueck standen drei Attackennamen, die es
    nicht gibt — *Emperor's Scepter* (die Faehigkeit heisst Kaiserliche
    Abwehr / Emperor's Stance), *Tarantula Pump* (Sintflutpumpe /
    Torrential Pump) und *Corkscrew Drive* (Spiralsturzflug / Corkscrew
    Dive). Alle drei stammen aus den automatischen Untertiteln und haben
    jede Suche des Lesers ins Leere laufen lassen. Keine Zusicherung hat
    sie gesehen, weil keine die Namen gegen die Datenbank gehalten hat.
    """
    echte = _attackennamen()
    assert len(echte) > 3000, (
        "nur %d Attackennamen aus der Datenbank gelesen — der Test "
        "wuerde ins Leere pruefen" % len(echte)
    )

    with open(STUECK, encoding="utf-8") as f:
        text = html.unescape(f.read())

    # Im Stueck stehen Attacken in <i>…</i>; der Name endet vor einer
    # Klammer, in der die andere Sprache nachgereicht wird.
    kursiv = {
        k.split("(")[0].strip()
        for k in re.findall(r"<i>([^<]{3,40})</i>", text)
    }
    # Nur Mehrwortnamen pruefen: einzelne Woerter sind im Stueck meist
    # Hervorhebungen, keine Attacken.
    kandidaten = {k for k in kursiv if " " in k and not k.endswith(".")}
    unbekannt = sorted(k for k in kandidaten if k not in echte)

    assert len(kandidaten) > 10, (
        "nur %d kursive Mehrwortbegriffe gefunden — Format geaendert?"
        % len(kandidaten)
    )
    assert unbekannt == [], (
        "Diese kursiven Namen stehen auf keiner Karte der Datenbank:\n  "
        + "\n  ".join(unbekannt)
    )
