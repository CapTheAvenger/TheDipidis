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
import json
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


# ---------------------------------------------------------------------------
# Die Kacheln zeigen den hochwertigsten Druck derselben Karte
# ---------------------------------------------------------------------------

SETS_META = os.path.join(WURZEL, "data", "sets_metadata.json")

# Rangfolge 1:1 aus js/app-utils.js getRarityPriority — dieselbe
# Reihenfolge, nach der die uebrige Seite ihre Drucke waehlt. Eine zweite
# Rangfolge im Projekt waere ein zweiter Massstab.
def _rang(rarity, setcode=""):
    if not rarity:
        promo = ("MEP", "SVP", "SP", "SMP", "XYP", "BWP", "HSP", "DPP", "NP", "WP")
        return 8 if setcode in promo else 0
    r = rarity.lower()
    if "uncommon" in r: return 2
    if "common" in r: return 1
    if "secret rare" in r: return 16
    if "rainbow rare" in r: return 15
    if "special art rare" in r or "special illustration rare" in r: return 14
    if "ultra rare" in r: return 13
    if "shiny rare" in r: return 12
    if "character super rare" in r: return 11
    if "character holo rare" in r or "art rare" in r or "illustration rare" in r: return 10
    if "amazing rare" in r: return 9
    if "radiant rare" in r: return 8
    if "triple rare" in r: return 7
    if "double rare" in r: return 6
    if "holo rare" in r: return 5
    if "rare" in r: return 3
    return 0


def _zeilen_nach_druck():
    csv.field_size_limit(10 ** 7)
    idx = {}
    with open(DATENBANK, encoding="utf-8-sig") as f:
        for z in csv.DictReader(f):
            idx.setdefault((z["set"], z["number"]), z)
    return idx


@pytest.mark.skipif(not os.path.exists(STUECK), reason="Stueck nicht im Baum")
def test_listendruck_ist_der_neueste_guenstige_sammlerdruck_der_hochwertigste():
    """Zwei Drucke je Karte, zwei Regeln.

    BESTELLUNG 1 (22.09.2026, frueh): "Koennen wir fuer die angezeigte
    Karte im Regal die high rarity Karte Anzeige."
    BESTELLUNG 2 (22.09.2026, abends): "In den Listen selbst, aber bitte
    den aktuellsten Low-Rarity-Print benutzen. Das macht es beim Teilen
    einfacher."

    Daraus: in der LISTE (`data-druck`) der neueste guenstige Druck — die
    Liste wird verschickt und nachgebaut. Im DETAIL (`data-druck-hoch`)
    der hochwertigste Druck derselben Karte.

    Geprueft wird die REGEL, nicht eine Kartenliste. Damit ein spaeteres
    Set den Test nicht rot faerbt, ohne dass jemand etwas kaputtgemacht
    hat, traegt das Stueck sein eigenes Fenster und seinen Stand
    (data-mcl-drucke-fenster / -stand); geprueft wird gegen die Sets, die
    es zu diesem Stand schon gab.
    """
    with open(STUECK, encoding="utf-8") as f:
        roh = f.read()

    fenster = re.search(r'data-mcl-drucke-fenster="([A-Z0-9]+)-([A-Z0-9]+)"', roh)
    stand = re.search(r'data-mcl-drucke-stand="(\d{4}-\d{2}-\d{2})"', roh)
    assert fenster and stand, "das Stueck sagt nicht, fuer welches Fenster und welchen Stand seine Drucke gelten"

    with open(SETS_META, encoding="utf-8") as f:
        meta = json.load(f)
    aeltestes, neuestes = fenster.group(1), fenster.group(2)
    assert aeltestes in meta and neuestes in meta, "unbekannte Sets im Fenster: %s" % fenster.group(0)
    von, bis = meta[aeltestes]["order"], meta[neuestes]["order"]

    def im_fenster(setcode):
        m = meta.get(setcode)
        return bool(m) and von <= m["order"] <= bis and (m.get("release_date") or "") <= stand.group(1)

    idx = _zeilen_nach_druck()

    def pool(druck):
        """Alle Drucke derselben Karte im Fenster, mit Bild."""
        z = idx.get(tuple(druck.split("-")))
        if not z:
            return []
        namen = [p.strip() for p in (z.get("international_prints") or "").split(",") if p.strip()]
        if druck not in namen:
            namen.append(druck)
        aus = []
        for p in namen:
            if "-" not in p:
                continue
            s, n = p.rsplit("-", 1)
            k = idx.get((s, n))
            if not k or not (k.get("image_url") or "").strip() or not im_fenster(s):
                continue
            aus.append((p, k, _rang(k["rarity"], s), meta[s]["order"], int(re.sub(r"\D", "", n) or 0)))
        return aus

    kacheln = {
        (html.unescape(de), druck, hoch)
        for de, druck, hoch in re.findall(
            r'data-de="([^"]+)" data-en="[^"]*" data-druck="([^"]+)" data-druck-hoch="([^"]*)"', roh)
    }
    assert len(kacheln) >= 25, "nur %d verschiedene Kacheln — der Test wuerde ins Leere pruefen" % len(kacheln)

    zu_teuer, zu_billig, falscher_name, unbekannt = [], [], [], []
    verschieden = 0
    for de, druck, hoch in sorted(kacheln):
        z = idx.get(tuple(druck.split("-")))
        if not z or not (z.get("image_url") or "").strip() or not im_fenster(z["set"]):
            unbekannt.append("%s (%s)" % (de, druck))
            continue
        if (z.get("name_de") or "").strip() != de:
            falscher_name.append("%s zeigt %s, das ist %s" % (de, druck, z.get("name_de")))
            continue
        kandidaten = pool(druck)
        if not kandidaten:
            continue

        # 1) In der Liste: der guenstigste Druck, und davon der aus dem
        #    neuesten Set.
        billigster = min(k[2] for k in kandidaten)
        eng = sorted([k for k in kandidaten if k[2] == billigster], key=lambda k: (-k[3], k[4]))
        if druck != eng[0][0]:
            zu_teuer.append("%s zeigt in der Liste %s (%s), erwartet %s"
                            % (de, druck, z["rarity"], eng[0][0]))

        # 2) Im Detail: der hochwertigste.
        teuerster = max(kandidaten, key=lambda k: (k[2], k[3], k[4]))
        if hoch != teuerster[0]:
            zu_billig.append("%s zeigt im Detail %s, erwartet %s" % (de, hoch or "nichts", teuerster[0]))
        if hoch and hoch != druck:
            verschieden += 1

    assert unbekannt == [], "diese Kacheln zeigen einen Druck, den die Datenbank im Fenster nicht kennt:\n  " + "\n  ".join(unbekannt)
    assert falscher_name == [], "diese Kacheln zeigen den Druck einer ANDEREN Karte:\n  " + "\n  ".join(falscher_name)
    assert zu_teuer == [], "in der Liste steht nicht der neueste guenstige Druck:\n  " + "\n  ".join(zu_teuer)
    assert zu_billig == [], "im Detail steht nicht der hochwertigste Druck:\n  " + "\n  ".join(zu_billig)
    # Gegenprobe: waeren beide Felder gleich befuellt, waere die Regel
    # oben leer erfuellbar.
    assert verschieden >= 20, ("nur %d Kacheln unterscheiden Listen- und Sammlerdruck — "
                               "die Trennung ist nicht angekommen" % verschieden)
