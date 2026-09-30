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
Seit 29.09.2026: die Kartendatenbank github.com/flibustier/
pokemon-tcg-pocket-database, Datei `dist/sets.json` (MIT) — dieselbe
Datenbank, aus der data/pocket_karten_ids.json kommt. Vorher game8.co;
Game8 antwortet dem GitHub-Laeufer aber mit HTTP 202 (Cloudflare), und
seit die Tier-Liste aus Limitless kommt, laeuft dieses Skript taeglich
in CI (pocket-tierlist.yml). Die Datenbank fuehrt je Erweiterung
Kennung und englischen Namen; die Aktionsreihen heissen dort PROMO-A und
PROMO-B, bei uns P-A und P-B.

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

import urllib.request

QUELLE = ("https://raw.githubusercontent.com/flibustier/"
          "pokemon-tcg-pocket-database/main/dist/sets.json")
QUELLE_SEITE = "https://github.com/flibustier/pokemon-tcg-pocket-database"
HIER = os.path.dirname(os.path.abspath(__file__))
ZIEL = os.path.join(os.path.dirname(HIER), "data", "pocket_sets.json")
DECKS = os.path.join(os.path.dirname(HIER), "data", "pocket_tierlist.json")

# Die Datenbank schreibt die Aktionsreihen als PROMO-A/PROMO-B, unsere
# Kartenlisten als P-A/P-B (wie Limitless und wie Game8).
KENNUNG = {"PROMO-A": "P-A", "PROMO-B": "P-B"}

MINDESTENS = 18     # so viele Sets fuehrt die Seite seit dem 16.09.2026

# ── ETIKETTEN, DIE KEINE NAMEN SIND ───────────────────────────────────
#
# BEFUND 25.09.2026 (damals an Game8s Seite): ein Navigationsbanner
# "New Set (B4a)" traf dasselbe Muster wie der echte Name. Ein Etikett wie
# "New Set" ist keine Angabe, die spaeter richtig wird — es wandert mit
# jeder Erweiterung weiter. Die Sperre bleibt auch mit der neuen Quelle:
# eine Datenbank, die fuer ein angekuendigtes Set "TBA" eintraegt, ist
# denkbar, und dann steht in der Oberflaeche lieber die blanke Kennung.
PLATZHALTER = {
    "new set", "newest set", "latest set", "new expansion",
    "coming soon", "tba", "tbd", "upcoming", "next set",
}


def hole(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return r.read().decode("utf-8")


def lies(text):
    """sets.json der Datenbank -> {Kennung: englischer Name}."""
    daten = json.loads(text)
    gefunden = {}
    for reihe in (daten.values() if isinstance(daten, dict) else [daten]):
        for e in reihe or []:
            code = KENNUNG.get(str(e.get("code") or ""), str(e.get("code") or ""))
            name = str(((e.get("name") or {}).get("en")) or "").replace("\u2019", "'").strip()
            if not code or not name or name.lower() in PLATZHALTER:
                continue
            gefunden.setdefault(code, name)
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


def alte_nachtraege():
    """Die von Hand nachgetragenen Namen samt Beleg aus dem Bestand."""
    if not os.path.exists(ZIEL):
        return []
    try:
        meta = json.load(open(ZIEL, encoding="utf-8")).get("_meta") or {}
    except Exception:
        return []
    return [e for e in (meta.get("nachgetragen") or []) if isinstance(e, dict)]


def alte_bestaetigungen():
    """Die schon bestaetigten Nachtraege aus dem Bestand.

    BEFUND (28.09.2026, Rutsch 12): der zweite Erntelauf nach der
    Bestaetigung schrieb `nachtrag_bestaetigt: []` — die Liste wurde je Lauf
    nur aus den OFFENEN Nachtraegen neu berechnet. Der Beleg fuer B4b ging
    damit eine Ernte spaeter doch verloren. Bestaetigungen werden jetzt
    fortgeschrieben wie alles andere im Bestand.
    """
    if not os.path.exists(ZIEL):
        return []
    try:
        meta = json.load(open(ZIEL, encoding="utf-8")).get("_meta") or {}
    except Exception:
        return []
    return [e for e in (meta.get("nachtrag_bestaetigt") or []) if isinstance(e, dict)]


def nachtraege_fortschreiben(nachtraege, von_der_quelle):
    """Ein Nachtrag bleibt, bis die Quelle den Namen selbst fuehrt.

    BEFUND SC-4 (26.09.2026): der erste Lauf aus der Cowork-Umgebung
    schrieb `_meta` neu und warf `nachgetragen` weg — auch den Beleg,
    WARUM B4b von Hand kam. Der Name selbst blieb (bestand()), sein
    Nachweis nicht. Jetzt:
      * fuehrt die Quelle die Kennung selbst  -> der Nachtrag ist
        bestaetigt und wandert nach `nachtrag_bestaetigt` (Kennung,
        Name, Datum des Nachtrags) — benannt, nicht verschwiegen;
      * fuehrt sie sie nicht                 -> der Nachtrag bleibt
        stehen, mit Beleg.
    """
    bleibt, bestaetigt = [], []
    for e in nachtraege:
        k = e.get("kennung")
        if k and k in von_der_quelle:
            bestaetigt.append({"kennung": k, "name": von_der_quelle[k],
                               "nachgetragen_am": e.get("am")})
        else:
            bleibt.append(e)
    return bleibt, bestaetigt


def main():
    text = hole(QUELLE)
    namen = lies(text)
    nachtraege, bestaetigt = nachtraege_fortschreiben(alte_nachtraege(), namen)
    for e in bestaetigt:
        print(f"Nachtrag {e['kennung']} ({e['name']!r}) fuehrt die Quelle jetzt selbst")
    neu_bestaetigt = {e.get("kennung") for e in bestaetigt}
    bestaetigt = [e for e in alte_bestaetigungen()
                  if e.get("kennung") not in neu_bestaetigt] + bestaetigt
    print(f"{len(namen)} Sets benannt")
    if len(namen) < MINDESTENS:
        print(f"::error::nur {len(namen)} Sets gefunden (erwartet >= {MINDESTENS}). "
              f"Empfangen: {len(text)} Zeichen. Hat die Datenbank ihr Format geaendert? "
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
            "quelle": QUELLE_SEITE,
            "quelle_url": QUELLE,
            "hinweis": "Nichts hier ist geraten. Wofür die Seite keinen Namen "
                       "führt, steht in ohne_namen und bleibt in der "
                       "Oberfläche die blanke Kennung.",
            "anzahl": len(namen),
            "in_kartenlisten": sorted(gebraucht),
            "ohne_namen": ohne,
            "nicht_mehr_auf_der_quellseite": nur_aus_bestand,
            "geaendert_in_diesem_lauf": geaendert,
            "nachgetragen": nachtraege,
            "nachtrag_bestaetigt": bestaetigt,
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
