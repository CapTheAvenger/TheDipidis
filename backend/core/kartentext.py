#!/usr/bin/env python3
"""Kartentext aus einem Limitless-Kartenblock — EINE Stelle, zwei Sprachen.

WARUM ES DIESE DATEI GIBT
=========================
Am 21.09.2026 wurde gemessen, was `card_text` in
data/all_cards_database.csv wirklich enthaelt:

| Befund | gemessen |
| --- | --- |
| Karten mit Faehigkeitsnamen | **0 von 20.580** |
| Nicht-Pokemon (Trainer/Item/Stadion/Energie) ohne jeden Text | **3.208 von 3.210** |

Beides sind Parserfehler, keine Luecken der Quelle:

1. `backend/scrapers/all_cards_scraper.py` suchte den Faehigkeitsnamen in
   `.card-text-ability-name`. Dieses Element gibt es auf der Seite nicht.
   Limitless schreibt ihn in `.card-text-ability-info` hinter das Wort
   „Ability:". Der EFFEKT stand also in der Datenbank, der NAME nie —
   man liest „Einmal waehrend deines Zuges, wenn dieses Pokemon in der
   Aktiven Position ist …" und erfaehrt nicht, dass die Faehigkeit
   „Kollateraler Kopfstoss" heisst.
2. Der Effekttext einer Trainer-, Item-, Stadion- oder Energiekarte steht
   in einem **klassenlosen** `.card-text-section`. Der Parser hat nur
   Abschnitte mit Klassennamen gelesen und diesen deshalb uebersprungen.

Weil die Extraktion jetzt an ZWEI Stellen gebraucht wird — im
Kartenscraper und im neuen Kartentext-Scraper — steht sie hier und
nirgends sonst. Zwei Kopien waeren zwei Gelegenheiten, denselben Fehler
noch einmal zu machen.

DIE SEITE IST IN JEDER SPRACHE GLEICH GEBAUT
--------------------------------------------
Gemessen am 21.09.2026 an `/cards/de/PBL/65` gegen `/cards/PBL/65`:
dieselben Klassennamen, dieselbe Verschachtelung. Fuer den deutschen
Text aendert sich also nur die Adresse, nicht der Parser.

WAS AUF DER DEUTSCHEN SEITE ENGLISCH BLEIBT
-------------------------------------------
Kartenname, Faehigkeits- und Attackenname und alle Effekttexte sind
uebersetzt. **Nicht** uebersetzt sind der Energietyp in der Titelzeile
(„Metal"), die Stufe („Stage 1") und die Zeile
`Weakness: Fire Resistance: Grass Retreat: 4`.

Entscheidung des Betreibers (21.09.2026): die WRR-Zeile gehoert **nicht**
in den deutschen Text. Sie besteht aus strukturierten Werten, die die
Oberflaeche aus dem englischen Feld zieht und mit den Typnamen
beschriftet, die die App ohnehin uebersetzt fuehrt. Damit steht kein
englischer Satz mitten im deutschen Kartentext — und erfunden wird auch
nichts.

WIE EINE FEHLENDE UEBERSETZUNG AUSSIEHT
---------------------------------------
Sie faellt **nicht** still auf Englisch zurueck. Gemessen an
`/cards/de/30C/120` (Fluffeluff, zu diesem Zeitpunkt fuenf Tage altes
Set): HTTP 200, aber

* der Linktext des Kartennamens ist **leer**,
* sein `href` zeigt auf `/cards/en/30C/120` statt `/cards/de/…`,
* die Attacke heisst `Attack 1`.

Auf der Setseite `/cards/de/30C?display=full` fehlt die Karte ganz.
`ist_uebersetzt()` prueft alle drei Merkmale — ein einzelnes waere eine
Wette darauf, dass Limitless seine Platzhalter nie umbenennt.
"""

from __future__ import annotations

import re
from typing import Any, List, Optional

# "Ability: <Name>", dazu die alten Formate, die Limitless fuer
# Legacy-Sets weiterfuehrt.
_FAEHIGKEIT_PRAEFIX = re.compile(
    r'^(?:Ability|Pok[ée]-?Power|Pok[ée]-?Body)\s*:\s*(.+)$',
    re.IGNORECASE | re.DOTALL)

# Platzhalter einer nicht uebersetzten Karte: "Attack 1", "Attack 2", …
#
# GEPRUEFT WIRD DER TEXT OHNE ENERGIESYMBOLE, ABER MIT SCHADEN.
#
# BEFUND 21.09.2026: hier stand `^(?:Attack|Ability)\s+\d+$`, geprueft
# auf dem Ergebnis von `attacke_ohne_beiwerk()` — also NACH dem
# Abschneiden des Schadens. Bei "0 Attack 1 30×" fiel dabei nur die 30×
# weg und "Attack 1" traf. Bei "C Attack 1" (Platzhalter OHNE Schaden)
# frass dieselbe Regel die 1 als Schaden, uebrig blieb "Attack", und das
# Muster verlangte eine Ziffer — die Karte galt als uebersetzt.
#
# Gemessen: 29 Karten trugen danach "Attack 1" als deutschen
# Attackennamen, darunter CRE-154, SMP-3 und fuenfzehn SP-Promos.
#
# Die Zahl gehoert zum Platzhalter, nicht zum Schaden. Das Muster deckt
# deshalb beide Formen ab und laeuft auf dem Text, bevor der Schaden
# abgeschnitten wird.
_PLATZHALTER = re.compile(
    r'^(?:Attack|Ability)\s+\d+(?:\s+\d+\s*[+\u00d7x*]?)?$', re.IGNORECASE)

# Energiesymbole am Anfang einer Attackenzeile ("FF", "0", "MMM").
_SYMBOLE_VORN = re.compile(r'^[A-Z0-9]+\s+')
# Schaden am Ende ("150", "200+", "30×").
_SCHADEN_HINTEN = re.compile(r'\s+\d+\s*[+×x*]?$')

TRENNER = ' || '


def _text(el: Any) -> str:
    """Sichtbarer Text eines Knotens, Leerraum auf ein Leerzeichen."""
    if el is None:
        return ''
    return re.sub(r'\s+', ' ', el.get_text(' ', strip=True)).strip()


def attacke_ohne_beiwerk(zeile: str) -> str:
    """'FF Krawallhammer 150' -> 'Krawallhammer'."""
    ohne = _SYMBOLE_VORN.sub('', zeile.strip())
    return _SCHADEN_HINTEN.sub('', ohne).strip()


def faehigkeitsname(info_text: str) -> str:
    """'Ability: Kollateraler Kopfstoss' -> 'Kollateraler Kopfstoss'.

    Ohne Praefix bleibt der Text unveraendert — lieber der volle Text als
    ein stillschweigend verworfener Name.
    """
    treffer = _FAEHIGKEIT_PRAEFIX.match(info_text.strip())
    return (treffer.group(1) if treffer else info_text).strip()


def ist_uebersetzt(block: Any) -> bool:
    """Traegt dieser Kartenblock eine echte Uebersetzung?

    Drei Merkmale, alle am 21.09.2026 an /cards/de/30C/120 gemessen.
    Eines allein reicht nicht: Limitless kann seine Platzhalter
    umbenennen, und ein leerer Linktext kaeme auch durch einen
    Ladefehler zustande.
    """
    if block is None:
        return False
    link = block.select_one('.card-text-name a')
    if link is None:
        return False
    if not link.get_text(strip=True):
        return False
    if '/cards/en/' in (link.get('href') or ''):
        return False
    for el in block.select('.card-text-attack-info'):
        # Nur die Energiesymbole weg — der Schaden bleibt stehen, sonst
        # verschwindet die Nummer des Platzhalters mit ihm (siehe der
        # Kommentar an _PLATZHALTER).
        ohne_symbole = _SYMBOLE_VORN.sub('', _text(el)).strip()
        if _PLATZHALTER.match(ohne_symbole):
            return False
    return True


def kartenschluessel(block: Any) -> Optional[str]:
    """'PBL|100' aus dem Link des Kartennamens, oder None.

    Der Link traegt Set und Nummer in beiden Sprachfassungen an
    derselben Stelle — er ist der einzige Ort auf der Setseite, an dem
    die Nummer maschinenlesbar steht.
    """
    if block is None:
        return None
    link = block.select_one('.card-text-name a')
    if link is None:
        return None
    treffer = re.search(r'/cards/(?:[a-z]{2}/)?([^/]+)/([^/?#]+)',
                        link.get('href') or '')
    if not treffer:
        return None
    return f'{treffer.group(1).upper()}|{treffer.group(2)}'


def kartentext(block: Any, mit_wrr: bool = True) -> str:
    """Kartentext eines `.card-text`-Blocks.

    `mit_wrr=False` laesst die Zeile Weakness/Resistance/Retreat weg —
    sie ist auf der deutschen Seite englisch (siehe Modulkopf).

    Die Reihenfolge folgt der Karte von oben nach unten: Faehigkeiten,
    Attacken, zum Schluss WRR. Zusammengefuegt mit `' || '`, wie es die
    Spalte `card_text` seit jeher haelt.
    """
    if block is None:
        return ''
    teile: List[str] = []

    for f in block.select('.card-text-ability'):
        info = _text(f.select_one('.card-text-ability-info'))
        if info:
            teile.append(f'[Ability] {faehigkeitsname(info)}')
        wirkung = _text(f.select_one('.card-text-ability-effect'))
        if wirkung:
            teile.append(wirkung)

    for a in block.select('.card-text-attack'):
        kopf = _text(a.select_one('.card-text-attack-info'))
        if kopf:
            teile.append(kopf)
        wirkung = _text(a.select_one('.card-text-attack-effect'))
        if wirkung:
            teile.append(wirkung)

    # Trainer, Items, Stadien, Werkzeuge und Spezialenergien haben weder
    # Attacke noch Faehigkeit — ihr Text steht in einem Abschnitt OHNE
    # eigenen Klassennamen. Genau der wurde bis zum 21.09.2026 nie
    # gelesen (3.208 Karten ohne jeden Text).
    #
    # Die Bedingung haengt bewusst daran, dass es NICHTS anderes gibt,
    # und nicht am Kartentyp: den Typ traegt die Setseite in einer
    # eigenen Zeile, aber ein Pokemon ohne Attacke und ohne Faehigkeit
    # hat auch keinen freien Abschnitt — es kann also nichts
    # einsammeln, was ihm nicht gehoert.
    if not block.select('.card-text-attack, .card-text-ability'):
        for abschnitt in block.select('.card-text-section'):
            klassen = abschnitt.get('class') or []
            if list(klassen) != ['card-text-section']:
                continue          # Titel-, Kuenstler- oder WRR-Abschnitt
            if abschnitt.select_one('.card-text-title'):
                continue
            frei = _text(abschnitt)
            if frei:
                teile.append(frei)

    if mit_wrr:
        wrr = _text(block.select_one('.card-text-wrr'))
        if wrr:
            teile.append(wrr)

    return TRENNER.join(teile)
