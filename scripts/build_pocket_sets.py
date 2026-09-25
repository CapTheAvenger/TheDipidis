#!/usr/bin/env python3
"""Baut data/pocket_sets.json — die Klarnamen der Pokémon-TCG-Pocket-Sets.

ANLASS (Betreiber, 16.09.2026):

    „können wir bei den Details von den Karten auch den Set Namen
     schreiben weil mit B3 und A2 und so kann ich nichts anfangen. Aber
     wenn ich weiß wie das set heißt kann ich noch schnell fehlende
     Karten besorgen"

Zu Recht: die Kartenlisten in data/pocket_tierlist.json führen je Karte
nur die Kennung (`"set": "B3b", "nummer": "078"`). Die Kennung ist der
Sortierschlüssel des Spiels, kein Name, den man in einem Laden nennen
kann.

QUELLE
------
game8.co, Seite „Card List" (archives/482685) — dieselbe Quelle wie die
Tier-Liste selbst, damit die Namen nicht aus einer zweiten Welt kommen.
Die Seite führt jede Erweiterung als „Name (Kennung)".

Für die beiden Aktionskarten-Reihen gibt es keine Klammerform; sie
heißen dort schlicht „Promo-A" und „Promo-B". Beide stehen unten in
`ZUSATZ` — benannt und begründet, nicht stillschweigend ergänzt.

WAS DIESES SKRIPT NICHT TUT
---------------------------
Es rät nicht. Findet es für eine Kennung keinen Namen, schreibt es sie
in `_meta.ohne_namen` und die Oberfläche zeigt weiter die blanke
Kennung — das ist unschön, aber wahr. Ein erfundener Set-Name schickt
den Betreiber in den Laden nach etwas, das es nicht gibt.
"""

import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scrape_pocket_tierlist import hole          # noqa: E402

QUELLE = "https://game8.co/games/Pokemon-TCG-Pocket/archives/482685"
HIER = os.path.dirname(os.path.abspath(__file__))
ZIEL = os.path.join(os.path.dirname(HIER), "data", "pocket_sets.json")
DECKS = os.path.join(os.path.dirname(HIER), "data", "pocket_tierlist.json")

# Kennung -> Name fuer die Reihen, die auf der Seite ohne Klammerform
# stehen. Beide kommen woertlich aus derselben Seite (Zeile „Promo-A ・
# Shop Cards ・ …"), nur eben nicht im Muster „Name (Kennung)".
ZUSATZ = {
    "P-A": "Promo-A",
    "P-B": "Promo-B",
}

# „Name (Kennung)" — Kennung ist A/B plus Ziffer plus optionaler
# Kleinbuchstabe. Der Name davor darf Leerzeichen und Apostrophe haben
# („Team Rocket's Ambition"), aber keine Klammern und keine Satzzeichen,
# die einen halben Satz einfangen wuerden.
MUSTER = re.compile(r"^([A-Za-z0-9][A-Za-z0-9 '’&:.-]{2,44}?)\s*\(([AB]\d[a-z]?)\)$")

MINDESTENS = 18     # so viele Sets fuehrt die Seite seit dem 16.09.2026

# ── ETIKETTEN, DIE KEINE NAMEN SIND ───────────────────────────────────
#
# BEFUND 25.09.2026: die Quellseite fuehrt B4a an zwei Stellen —
#
#     "Team Rocket's Ambition (B4a)   Release: August 26, 2026"
#     "New Set (B4a)"                 (Banner in der Seitennavigation)
#
# Beide treffen das Muster "Name (Kennung)". Welche zuerst kommt,
# entscheidet die Reihenfolge im Baum, nicht die Wahrheit — und beim
# Durchlauf an diesem Tag gewann das Banner. Dann stuende in der
# Oberflaeche "New Set" als Set-Name, und der Betreiber ginge damit in
# den Laden.
#
# Ein Etikett wie "New Set" ist keine Angabe, die spaeter richtig wird:
# es wandert mit jeder Erweiterung weiter. Es wird deshalb nicht
# uebernommen — weder als Name noch als Platzhalter.
PLATZHALTER = {
    "new set", "newest set", "latest set", "new expansion",
    "coming soon", "tba", "tbd", "upcoming", "next set",
}


def lies(html):
    from bs4 import BeautifulSoup
    suppe = BeautifulSoup(html, "lxml")
    gefunden = {}
    for el in suppe.find_all(["h2", "h3", "a", "td", "li", "strong"]):
        treffer = MUSTER.match(el.get_text(" ", strip=True))
        if not treffer:
            continue
        kennung, name = treffer.group(2), treffer.group(1).strip()
        if name.lower() in PLATZHALTER:
            continue
        # Der erste Fund gewinnt: die Uebersichtstabelle steht oben,
        # weiter unten wiederholen Fliesstexte dieselben Namen
        # gelegentlich verkuerzt.
        gefunden.setdefault(kennung, name)
    for kennung, name in ZUSATZ.items():
        if name in suppe.get_text(" ", strip=True):
            gefunden.setdefault(kennung, name)
    return gefunden


def gebrauchte_kennungen():
    """Welche Kennungen die Kartenlisten wirklich führen."""
    if not os.path.exists(DECKS):
        return set()
    d = json.load(open(DECKS, encoding="utf-8"))
    raus = set()
    for deck in d.get("decks", []):
        for karte in list(deck.get("pokemon") or []) + list(deck.get("trainer") or []):
            if karte.get("set"):
                raus.add(karte["set"])
    return raus


def bestand():
    """Was schon benannt ist. Ein Name geht nie verloren, nur weil die
    Quellseite ihn heute nicht fuehrt (Umbau, Banner, Seitenwechsel)."""
    if not os.path.exists(ZIEL):
        return {}
    try:
        return dict(json.load(open(ZIEL, encoding="utf-8")).get("sets") or {})
    except Exception:
        return {}


def main():
    html = hole(QUELLE)
    namen = lies(html)
    print(f"{len(namen)} Sets benannt")
    if len(namen) < MINDESTENS:
        print(f"::error::nur {len(namen)} Sets gefunden (erwartet >= {MINDESTENS}). "
              f"Empfangen: {len(html)} Zeichen. Hat Game8 die Seite umgebaut? "
              f"Es wird NICHTS geschrieben — eine halbe Tabelle "
              f"sieht auf der Seite aus wie eine ganze.")
        return 1

    # Bestand einmischen. Neu gelesene Namen gewinnen; verschwundene
    # bleiben stehen und werden BENANNT (CLAUDE.md: ein Verlust wird nie
    # stillschweigend geloescht — wer eine Zeile wegwirft, vernichtet die
    # nachgeschlagene Quelle).
    alt = bestand()
    nur_aus_bestand = sorted(k for k in alt if k not in namen)
    geaendert = sorted(k for k in namen if k in alt and alt[k] != namen[k])
    zusammen = dict(alt)
    zusammen.update(namen)
    for k in nur_aus_bestand:
        print(f"::warning::Kennung {k} ({alt[k]!r}) steht nicht mehr auf der "
              f"Quellseite — der Name bleibt erhalten, geprueft wurde er "
              f"heute nicht.")
    for k in geaendert:
        print(f"::warning::Kennung {k}: {alt[k]!r} -> {namen[k]!r}")
    namen = zusammen

    gebraucht = gebrauchte_kennungen()
    ohne = sorted(k for k in gebraucht if k not in namen)
    for k in ohne:
        print(f"::warning::Kennung {k} steht in den Kartenlisten, hat aber "
              f"keinen Namen auf der Quellseite — die Oberfläche zeigt "
              f"weiter die blanke Kennung")

    raus = {
        "_meta": {
            "zweck": "Kennung -> Klarname der Pokémon-TCG-Pocket-Sets, damit "
                     "eine Kartenliste sagen kann, WO die Karte zu holen ist.",
            "quelle": "game8.co",
            "quelle_url": QUELLE,
            "hinweis": "Nichts hier ist geraten. Wofür die Seite keinen Namen "
                       "führt, steht in ohne_namen und bleibt in der "
                       "Oberfläche die blanke Kennung.",
            "anzahl": len(namen),
            "in_kartenlisten": sorted(gebraucht),
            "ohne_namen": ohne,
            "nicht_mehr_auf_der_quellseite": nur_aus_bestand,
            "geaendert_in_diesem_lauf": geaendert,
        },
        "sets": dict(sorted(namen.items())),
    }
    with open(ZIEL, "w", encoding="utf-8") as f:
        json.dump(raus, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"geschrieben: {ZIEL}")
    for k, v in sorted(namen.items()):
        print(f"  {k:6} {v}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
