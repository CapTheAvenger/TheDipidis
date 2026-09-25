#!/usr/bin/env python3
"""Die eine Regel, welche Kartenart in welche der sieben Gruppen faellt.

ANLASS (Betreiber, 25.09.2026):

    „bitte auch noch unsere Standardsortierung anbieten --> Pokemon,
     supporter, Item, Tool, Stadion, Spezial Energie, Basis Energie"

Diese Reihenfolge ist im Haus keine neue Erfindung: `js/app-deck-builder.js`
fuehrt sie seit Langem als `typeOrder` (Pokemon 1 … Basic Energy 7), und
`scripts/generate-bot-deck-index.py` hatte dieselbe Zuordnung als
`_classify_card_type()` ein zweites Mal ausgeschrieben.

WARUM DAS EIN EIGENES MODUL IST
-------------------------------
Weil die zweite Kopie schon angefangen hatte, anders zu antworten.
`_classify_card_type()` prueft `t == 'Item'` auf Gleichheit — und der
Bestand fuehrt 25 Karten mit dem Typ „Item/Technical Machine"
(data/cards_chunk_*.json, gemessen 25.09.2026). Die landeten damit unter
„pokemon". Genau die Sorte Abdrift, die `js/app-city-league.js` mit
seiner handgefuehrten ACE-SPEC-Kopie schon einmal gekostet hat.

Also: eine Regel, zwei Aufrufer, eine Zusicherung darauf.

WAS DIE QUELLEN SCHREIBEN (gemessen 25.09.2026)
-----------------------------------------------
    data/tournament_cards_data_cards_*.csv, Spalte `type`
        Item · Basic · Supporter · Basic Energy · Tool · Stadium ·
        Special Energy · Stage 1 · Stage 2 · VSTAR
    data/cards_chunk_*.json, Feld `type`  (21.092 Karten)
        dazu VMAX · Mega Evolution · Level Up · BREAK Evolution ·
        V-UNION · Restored · LEGEND · Item/Technical Machine sowie
        elementvorangestellte Formen (MBasic, DStage 1, FMega Evolution)
    data/online_api_cards_*.csv, Spalte `group`
        nur grob: pokemon · trainer · energy

Die grobe Spalte kann „trainer" nicht aufloesen — ein Trainer ohne
feinen Typ bekommt deshalb `None` und keine geratene Gruppe.
"""

# Reihenfolge wie vom Betreiber genannt; die Zahl ist der Sortierrang.
ORDNUNG = (
    "pokemon",
    "supporter",
    "item",
    "tool",
    "stadium",
    "special-energy",
    "basic-energy",
)

RANG = {name: i + 1 for i, name in enumerate(ORDNUNG)}

LABEL_DE = {
    "pokemon": "Pokémon",
    "supporter": "Supporter",
    "item": "Item",
    "tool": "Tool",
    "stadium": "Stadion",
    "special-energy": "Spezial-Energie",
    "basic-energy": "Basis-Energie",
}

LABEL_EN = {
    "pokemon": "Pokémon",
    "supporter": "Supporter",
    "item": "Item",
    "tool": "Tool",
    "stadium": "Stadium",
    "special-energy": "Special Energy",
    "basic-energy": "Basic Energy",
}

# Die grobe Spalte `group` der Online-API. „trainer" fehlt absichtlich:
# er sagt nicht, welche der vier Trainergruppen gemeint ist.
GROB = {
    "pokemon": "pokemon",
    "energy": None,          # Basis- oder Spezialenergie? Steht da nicht.
    "trainer": None,
}

_ENERGIE_ANFANG = ("basic energy", "basis energie", "basis-energie")


def gruppe(typ, name=""):
    """Eine der sieben Gruppen — oder None, wenn die Angabe nicht reicht.

    `typ` ist der Wert aus der Quelle (Spalte `type` bzw. Feld `type`),
    `name` der Kartenname als Rueckfall fuer Basis-Energien, die manche
    Quelle nur als „Metal Energy" fuehrt.

    None ist ein erlaubtes Ergebnis und ausdruecklich besser als eine
    geratene Gruppe: der Aufrufer kann eine andere Quelle fragen.
    """
    t = str(typ or "").strip()
    tl = t.lower()

    if tl:
        # Die grobe Spalte ZUERST. Sonst faengt die Energiepruefung
        # unten den Wert „energy" ab und nennt ihn Basis-Energie,
        # obwohl die Quelle das gar nicht sagt — und „trainer" wuerde
        # zum Item. Beides geraten, beides falsch.
        if tl in GROB:
            return GROB[tl]

        # Energie zuerst — „Basic Energy" enthaelt „Basic", und „Basic"
        # allein ist ein Pokemon. Die Pruefreihenfolge entscheidet.
        if tl.startswith(_ENERGIE_ANFANG) or tl.endswith(" basic energy"):
            return "basic-energy"
        if "special energy" in tl or "spezial" in tl:
            return "special-energy"
        if "energy" in tl or "energie" in tl:
            # Eine Energie, die nicht als Spezial gefuehrt ist: der
            # Bestand kennt hier nur Basis-Energien.
            return "basic-energy"

        # Trainer. Getrennt wird auf dem ERSTEN Abschnitt vor „/", weil
        # der Bestand „Item/Technical Machine" fuehrt.
        kopf = tl.split("/")[0].strip()
        if kopf == "supporter":
            return "supporter"
        if kopf in ("tool", "pokémon tool", "pokemon tool"):
            return "tool"
        if kopf == "stadium" or kopf == "stadion":
            return "stadium"
        if kopf in ("item", "technical machine", "trainer"):
            return "item"
        if "technical machine" in tl:
            return "item"

        # Alles Uebrige ist eine Pokemon-Form: Basic, Stage 1/2, VSTAR,
        # VMAX, Mega Evolution, LEGEND, Level Up, Restored — auch mit
        # Elementbuchstabe davor (MBasic, DStage 1, FMega Evolution).
        return "pokemon"

    # Kein Typ: nur noch der Name kann eine Basis-Energie verraten.
    n = str(name or "").strip().lower()
    if n.endswith(" energy") and not n.startswith("double") and "special" not in n:
        for element in ("grass", "fire", "water", "lightning", "psychic",
                        "fighting", "darkness", "metal", "fairy", "dragon"):
            if n.startswith(element) or n.startswith("basic " + element):
                return "basic-energy"
    return None


def rang(gruppenname):
    """Sortierrang; Unbekanntes hinten."""
    return RANG.get(gruppenname or "", len(ORDNUNG) + 1)
