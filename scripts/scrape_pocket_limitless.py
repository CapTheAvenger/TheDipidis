#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""POKÉMON TCG POCKET — TIER-LISTE AUS DEN TURNIERERGEBNISSEN VON LIMITLESS

ANLASS (29.09.2026)
-------------------
Bis heute kam die Pocket-Tier-Liste von Game8. Game8 antwortet dem
GitHub-Läufer auf jedem Weg mit HTTP 202 (Cloudflare; gemessen 04.09. und
26.09.2026), also lief die Ernte als wöchentliche Handaufgabe aus einer
Arbeitssitzung. Entscheidung Hausi, 29.09.2026: „wichtig ist nur, dass wir
auf Dauer nichts mehr manuell machen müssen" — Quelle wechseln.

Die neue Quelle ist die offizielle API von play.limitlesstcg.com, dieselbe,
die backend/scrapers/limitless_api_scraper.py für das TCG seit Wochen
täglich aus CI abfragt (limitless-api-scrape.yml, grün).

WAS SICH DAMIT ÄNDERT
---------------------
Game8s Stufe war eine redaktionelle Einschätzung. Hier ist nichts
eingeschätzt:

  * ANTEIL     = Listen des Archetyps / alle Listen im Fenster
  * SIEGQUOTE  = S / (S + N + U), Konvention „mitUnentschieden"
                 (js/win-rate-konvention.js), aus den `record`-Feldern
  * STUFE      = UNSERE Regel über diese beiden gezählten Zahlen
                 (STUFENREGEL unten). Sie steht in `_meta.stufenregel`,
                 und die Oberfläche schreibt sie an.

Die Kartenliste je Deck ist eine echte, gespielte Liste — die mit der
besten Bilanz im Fenster (Siege minus Niederlagen, dann Siege, dann die
jüngere). Der Scan-Code wird aus genau dieser Liste gebaut, mit ihrer
Energie; Limitless führt die Energie im Feld `decklist.energy`
(gemessen 29.09.2026: 73 von 74 Listen des Turniers vom 26.09.).

WAS AUSGELASSEN UND BENANNT WIRD (Report, don't silently repair)
----------------------------------------------------------------
  * laufende Turniere: ohne Platz 1 in den Standings ist ein Turnier nicht
    fertig (gemessen 29.09.2026: ein laufendes Turnier liefert `placing`
    überall null). Es kommt beim nächsten Lauf.
  * Archetypen unter MIN_LISTEN: gezählt in `_meta.unter_min_listen`.
  * Decks ohne Code: `code` null, Grund in `code_fehlt` und in
    `_meta.ohne_code` (z. B. eine Karte, die unsere Kennungstabelle noch
    nicht führt — die Tabelle wird im selben Lauf erneuert).

NETZ
----
play.limitlesstcg.com ist aus dem Bausandkasten nicht erreichbar (403 am
Proxy); aus CI schon. Getestet wird die Rechenschicht ohne Netz
(tests/nebenbereiche/python/test_pocket_limitless.py).

AUFRUF
------
    python3 scripts/scrape_pocket_limitless.py            # normal
    python3 scripts/scrape_pocket_limitless.py --trocken  # nichts schreiben
"""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import json
import os
import sys
import unicodedata
from collections import defaultdict

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.dirname(HIER)
sys.path.insert(0, os.path.join(WURZEL, "backend", "scrapers"))

ZIEL = os.path.join(WURZEL, "data", "pocket_tierlist.json")
ZWISCHENSTAND = os.path.join(WURZEL, "data", "pocket_limitless_turniere.json")
KARTEN = os.path.join(WURZEL, "data", "pocket_karten_ids.json")

SPIEL = "POCKET"
QUELLE_URL = "https://play.limitlesstcg.com/tournaments?game=POCKET&format=STANDARD"

# Das Fenster: zwei Wochen. Pocket bringt etwa monatlich ein Set; zwei
# Wochen tragen gemessen rund siebzig Standardturniere (29.09.2026: 20
# Turniere der Liste lagen zwischen dem 24. und 29.09., davon 12 Standard).
FENSTER_TAGE = 14
# Kleinstturniere (gemessen: 5, 6, 11 Spieler) sind meist Probe- oder
# Freundesrunden. Ab 16 Spielern trägt eine Bilanz über vier Runden.
MIN_SPIELER = 16
# Unter zehn Listen ist eine Siegquote eine Anekdote.
MIN_LISTEN = 10

# DIE STUFENREGEL — von uns festgelegt, nicht von Limitless.
# Gelesen von oben nach unten; die erste Zeile, die passt, gilt.
STUFENREGEL = [
    {"stufe": "S", "anteil_ab": 0.05, "quote_ab": 0.50},
    {"stufe": "A", "anteil_ab": 0.02, "quote_ab": 0.48},
    {"stufe": "B", "anteil_ab": 0.01, "quote_ab": None},
    {"stufe": "C", "anteil_ab": None, "quote_ab": None},
]

DECKGROESSE = 20
HOECHSTENS_JE_NAME = 2
TRAINER_VERSATZ = 10_000_000
ENERGIE = {"grass": 1, "fire": 2, "water": 3, "lightning": 4,
           "psychic": 5, "fighting": 6, "darkness": 7, "metal": 8}
SET_SCHREIBWEISEN = {"PROMO-A": "P-A", "PROMOA": "P-A", "PA": "P-A",
                     "PROMO-B": "P-B", "PROMOB": "P-B", "PB": "P-B"}


# ---------------------------------------------------------------------------
# Rechenschicht — kein Netz
# ---------------------------------------------------------------------------

def parse_datum(roh):
    if not roh:
        return None
    try:
        d = dt.datetime.fromisoformat(str(roh).replace("Z", "+00:00"))
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=dt.timezone.utc)


def ist_standard(turnier):
    """Limitless setzt für das Standardformat von Pocket KEIN Format
    (gemessen 29.09.2026: `format: null`); Sonderformate tragen CUSTOM."""
    return turnier.get("format") in (None, "", "STANDARD")


def ist_fertig(standings):
    """Ein fertiges Turnier hat einen Platz 1. Ein laufendes liefert
    `placing` überall null (gemessen 29.09.2026)."""
    return any(e.get("placing") == 1 for e in standings or [])


def _set(roh):
    s = str(roh or "").strip()
    return SET_SCHREIBWEISEN.get(s.upper(), s)


def _nummer(roh):
    try:
        return f"{int(str(roh).strip()):03d}"
    except ValueError:
        return str(roh or "").strip()


def liste_aus_eintrag(eintrag):
    """Die Kartenliste eines Standings-Eintrags in unserer Schreibweise."""
    dl = eintrag.get("decklist") or {}

    def karten(teil):
        raus = []
        for k in dl.get(teil) or []:
            raus.append({"name": str(k.get("name") or ""),
                         "anzahl": int(k.get("count") or 0),
                         "set": _set(k.get("set")),
                         "nummer": _nummer(k.get("number"))})
        return raus

    return {"pokemon": karten("pokemon"), "trainer": karten("trainer"),
            "energie": [str(e) for e in (dl.get("energy") or [])]}


def _rang(bilanz, datum):
    s, n, _u = bilanz
    return (s - n, s, datum or "")


def turnier_auswerten(turnier, standings):
    """Ein fertiges Turnier -> Zählung je Archetyp plus dessen beste Liste.

    Gespeichert wird je Archetyp nur EINE Liste, und nur eine mit
    positiver Bilanz: sie ist die einzige, die als „beste Liste im
    Fenster" je in Frage kommt. Spielernamen werden nicht gespeichert —
    sie werden für nichts gebraucht."""
    datum = (turnier.get("date") or "")[:10]
    decks = {}
    ohne_deck = 0
    for e in standings or []:
        deck = e.get("deck") or {}
        did = deck.get("id")
        if not did or not e.get("decklist"):
            ohne_deck += 1
            continue
        r = e.get("record") or {}
        bilanz = [int(r.get("wins") or 0), int(r.get("losses") or 0), int(r.get("ties") or 0)]
        z = decks.setdefault(did, {"name": deck.get("name") or did, "listen": 0,
                                   "s": 0, "n": 0, "u": 0, "beste": None})
        z["listen"] += 1
        z["s"] += bilanz[0]
        z["n"] += bilanz[1]
        z["u"] += bilanz[2]
        if bilanz[0] <= bilanz[1]:
            continue
        kandidat = {"bilanz": bilanz, "platz": e.get("placing"), **liste_aus_eintrag(e)}
        if z["beste"] is None or _rang(bilanz, datum) > _rang(z["beste"]["bilanz"], datum):
            z["beste"] = kandidat
    return {"name": turnier.get("name") or "", "datum": datum,
            "spieler": int(turnier.get("players") or 0),
            "listen": sum(z["listen"] for z in decks.values()),
            "ohne_deck": ohne_deck, "decks": decks}


def normname(s):
    s = unicodedata.normalize("NFD", str(s or ""))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return " ".join(s.lower().replace("’", "'").replace("`", "'").split())


def lies_tabelle(pfad=KARTEN):
    with open(pfad, encoding="utf-8") as f:
        return json.load(f)


def baue_code(liste, tabelle):
    """Dieselbe Kodierung wie js/pocket-deckcode.js `baue()`:

        [n Trainer] n × 3 Byte (Kennung + 10.000.000)
        [m Pokémon] m × 3 Byte
        [k Energien] k × 1 Byte

    Getrennt wird über die KENNUNG aus der Tabelle, nicht über die
    Gruppe, in der Limitless eine Karte führt. Gibt (code, None) oder
    (None, Grund) zurück."""
    namen = tabelle.get("namen") or []
    sets = tabelle.get("sets") or {}
    werte_t, werte_p, je_name, summe, fehlt = [], [], defaultdict(int), 0, []
    for k in list(liste.get("pokemon") or []) + list(liste.get("trainer") or []):
        try:
            nr = int(k["nummer"])
        except (KeyError, ValueError):
            fehlt.append(f"{k.get('set')}-{k.get('nummer')}")
            continue
        reihe = sets.get(k.get("set")) or []
        eintrag = reihe[nr - 1] if 0 < nr <= len(reihe) else None
        if not eintrag:
            fehlt.append(f"{k.get('set')}-{k.get('nummer')}")
            continue
        wert, ni = eintrag
        anzahl = int(k.get("anzahl") or 0)
        je_name[normname(namen[ni] if ni < len(namen) else k.get("name"))] += anzahl
        summe += anzahl
        (werte_t if wert >= TRAINER_VERSATZ else werte_p).extend([wert] * anzahl)
    if fehlt:
        return None, ("unsere Kennungstabelle (data/pocket_karten_ids.json) führt "
                      "diese Karten noch nicht: " + ", ".join(sorted(set(fehlt))))
    if summe != DECKGROESSE:
        return None, f"die Liste hat {summe} Karten statt {DECKGROESSE}"
    zu_viele = sorted(n for n, a in je_name.items() if a > HOECHSTENS_JE_NAME)
    if zu_viele:
        return None, "mehr als zwei Karten gleichen Namens: " + ", ".join(zu_viele)
    if not werte_p:
        return None, "die Liste enthält kein Pokémon"
    energie = []
    for e in liste.get("energie") or []:
        b = ENERGIE.get(str(e).strip().lower())
        if b is None:
            return None, f"unbekannte Energie {e!r}"
        if b not in energie:
            energie.append(b)
    if not energie:
        return None, "die Liste nennt keine Energie"
    if len(energie) > 3:
        return None, f"{len(energie)} Energien, höchstens drei"
    roh = [len(werte_t)]
    for v in werte_t:
        roh += [(v >> 16) & 255, (v >> 8) & 255, v & 255]
    roh.append(len(werte_p))
    for v in werte_p:
        roh += [(v >> 16) & 255, (v >> 8) & 255, v & 255]
    roh.append(len(energie))
    roh += energie
    return base64.b64encode(bytes(roh)).decode("ascii"), None


def stufe(anteil, quote):
    for r in STUFENREGEL:
        if r["anteil_ab"] is not None and anteil < r["anteil_ab"]:
            continue
        if r["quote_ab"] is not None and quote < r["quote_ab"]:
            continue
        return r["stufe"]
    return None


def zusammenfassen(turniere, tabelle, jetzt=None, min_listen=MIN_LISTEN):
    """Alle Turniere des Fensters -> die Ausgabe (ohne _meta-Kopf)."""
    je_deck = {}
    gesamt = 0
    for tid, t in sorted(turniere.items()):
        gesamt += t["listen"]
        for did, z in t["decks"].items():
            a = je_deck.setdefault(did, {"name": z["name"], "listen": 0, "s": 0, "n": 0,
                                         "u": 0, "turniere": 0, "kandidaten": []})
            # Der jüngste Name gewinnt — Limitless benennt einen Archetyp
            # gelegentlich um, die Kennung bleibt.
            a["name"] = z["name"]
            a["listen"] += z["listen"]
            a["s"] += z["s"]
            a["n"] += z["n"]
            a["u"] += z["u"]
            a["turniere"] += 1
            if z.get("beste"):
                a["kandidaten"].append((t, z["beste"]))

    decks, ohne_code, unter = [], [], {"archetypen": 0, "listen": 0}
    for did, a in je_deck.items():
        if a["listen"] < min_listen:
            unter["archetypen"] += 1
            unter["listen"] += a["listen"]
            continue
        partien = a["s"] + a["n"] + a["u"]
        anteil = a["listen"] / gesamt if gesamt else 0.0
        quote = a["s"] / partien if partien else 0.0
        eintrag = {"id": did, "name": a["name"], "tier": stufe(anteil, quote),
                   "anteil": round(anteil, 4), "listen": a["listen"],
                   "siege": a["s"], "niederlagen": a["n"], "unentschieden": a["u"],
                   "quote": round(quote, 4), "turniere": a["turniere"]}
        a["kandidaten"].sort(key=lambda tk: _rang(tk[1]["bilanz"], tk[0]["datum"]), reverse=True)
        code, grund, gewaehlt, rang = None, None, None, 0
        for i, (t, l) in enumerate(a["kandidaten"]):
            code, grund_i = baue_code(l, tabelle)
            if i == 0:
                grund = grund_i
            if code:
                gewaehlt, rang = (t, l), i + 1
                break
        if not a["kandidaten"]:
            grund = "keine Liste mit positiver Bilanz im Fenster"
        if gewaehlt is None and a["kandidaten"]:
            gewaehlt, rang = a["kandidaten"][0], 1
        if gewaehlt:
            t, l = gewaehlt
            eintrag["liste_von"] = {"turnier": t["name"], "datum": t["datum"],
                                    "platz": l.get("platz"), "bilanz": l["bilanz"],
                                    "rang": rang}
            eintrag["pokemon"] = l["pokemon"]
            eintrag["trainer"] = l["trainer"]
            eintrag["energie"] = l["energie"]
        else:
            eintrag["pokemon"], eintrag["trainer"], eintrag["energie"] = [], [], []
        eintrag["code"] = code
        if not code:
            eintrag["code_fehlt"] = grund
            ohne_code.append({"name": a["name"], "grund": grund})
        elif rang > 1:
            # Benannt, nicht verschwiegen: die beste Liste ergab keinen Code.
            eintrag["liste_von"]["warum_nicht_die_beste"] = grund
        decks.append(eintrag)

    ordnung = [r["stufe"] for r in STUFENREGEL]
    decks.sort(key=lambda d: (ordnung.index(d["tier"]) if d["tier"] in ordnung else 99,
                              -d["anteil"], d["name"]))
    return decks, ohne_code, unter, gesamt


def ausgabe(turniere, tabelle, ab, bis, offen, jetzt):
    decks, ohne_code, unter, gesamt = zusammenfassen(turniere, tabelle)
    meta = {
        "zweck": "Tier-Liste für Pokémon TCG Pocket aus den Ergebnissen der "
                 "Online-Turniere auf Limitless, je Deck mit einer gespielten "
                 "Liste und ihrem Scan-Code.",
        "quelle": "play.limitlesstcg.com",
        "quelle_url": QUELLE_URL,
        "quelle_hinweis": "Anteil und Siegquote sind gezählt, aus den Standings "
                          "der Standardturniere auf Limitless. Die Stufe ist "
                          "UNSERE Regel über diese beiden Zahlen (stufenregel), "
                          "keine Einschätzung von Limitless. Die Oberfläche muss "
                          "das anschreiben.",
        "abgerufen": jetzt.replace(microsecond=0).isoformat(),
        "fenster": {"von": ab.date().isoformat(), "bis": bis.date().isoformat(),
                    "tage": FENSTER_TAGE},
        "min_spieler": MIN_SPIELER,
        "min_listen": MIN_LISTEN,
        "turniere": len(turniere),
        "spieler": sum(t["spieler"] for t in turniere.values()),
        "listen": gesamt,
        "listen_hinweis": "Nenner des Anteils: alle Listen mit Archetyp in den "
                          "Turnieren des Fensters. Limitless führt nicht zu jedem "
                          "Spieler eine Liste, deshalb ist die Zahl kleiner als "
                          "die Spielerzahl.",
        "stufenregel": STUFENREGEL,
        "quoten_konvention": "mitUnentschieden",
        "quoten_formel": "S / (S + N + U)",
        "liste_hinweis": "Je Deck die gespielte Liste mit der besten Bilanz im "
                         "Fenster (Siege minus Niederlagen, dann Siege, dann die "
                         "jüngere). Ergibt sie keinen gültigen Code, die nächste — "
                         "dann steht der Grund in liste_von.warum_nicht_die_beste.",
        "code_hinweis": "Der Scan-Code ist aus genau dieser Liste gebaut, mit "
                        "ihrer Energie, in der Kodierung von js/pocket-deckcode.js "
                        "und mit den Kennungen aus data/pocket_karten_ids.json.",
        "unter_min_listen": unter,
        "ohne_code": ohne_code,
        "offene_turniere": offen,
    }
    return {"_meta": meta, "decks": decks}


# ---------------------------------------------------------------------------
# Zwischenstand — jedes fertige Turnier wird genau einmal geholt
# ---------------------------------------------------------------------------

def lies_zwischenstand(pfad=ZWISCHENSTAND):
    if not os.path.exists(pfad):
        return {}
    with open(pfad, encoding="utf-8") as f:
        return (json.load(f) or {}).get("turniere") or {}


def schreibe_zwischenstand(turniere, pfad=ZWISCHENSTAND):
    """Ein Turnier je Zeile: ein neuer Tag ändert ein paar Zeilen, nicht
    die ganze Datei."""
    kopf = {"zweck": "Zwischenstand von scripts/scrape_pocket_limitless.py: "
                     "je fertiges Turnier im Fenster die Zählung je Archetyp und "
                     "dessen beste Liste. Ein Turnier, das hier steht, wird nicht "
                     "noch einmal abgerufen.",
            "fenster_tage": FENSTER_TAGE}
    zeilen = [json.dumps(tid, ensure_ascii=False) + ":" +
              json.dumps(t, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
              for tid, t in sorted(turniere.items(), key=lambda kv: (kv[1]["datum"], kv[0]))]
    text = ('{"_meta":' + json.dumps(kopf, ensure_ascii=False) + ',\n"turniere":{\n' +
            ",\n".join(zeilen) + "\n}}\n")
    tmp = pfad + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(text)
    os.replace(tmp, pfad)


def turnierliste(api, ab, seiten=20):
    liste = []
    for seite in range(1, seiten + 1):
        teil = api.turniere(spiel=SPIEL, limit=100, seite=seite)
        if not teil:
            break
        liste.extend(teil)
        letztes = parse_datum(teil[-1].get("date"))
        if letztes and letztes < ab:
            break
    return liste


def lauf(api, zwischenstand, jetzt):
    ab = jetzt - dt.timedelta(days=FENSTER_TAGE)
    turniere = {tid: t for tid, t in zwischenstand.items()
                if (parse_datum(t.get("datum")) or jetzt) >= ab.replace(hour=0, minute=0, second=0, microsecond=0)}
    offen, neu = [], 0
    for t in turnierliste(api, ab):
        tid = t.get("id")
        wann = parse_datum(t.get("date"))
        if not tid or tid in turniere or wann is None or wann < ab or wann > jetzt:
            continue
        if not ist_standard(t) or int(t.get("players") or 0) < MIN_SPIELER:
            continue
        kurz = {"id": tid, "name": t.get("name") or "", "datum": (t.get("date") or "")[:10]}
        try:
            standings = api.standings(tid)
        except Exception as e:                                  # noqa: BLE001
            # Ein Turnier, das heute nicht zu holen ist, hält die übrigen
            # nicht auf. Es steht benannt in offene_turniere und wird beim
            # nächsten Lauf wieder versucht — es ist ja nicht im Zwischenstand.
            offen.append(dict(kurz, grund=f"Abruf gescheitert: {e}"))
            continue
        if not ist_fertig(standings):
            offen.append(dict(kurz, grund="läuft noch (kein Platz 1 in den Standings)"))
            continue
        turniere[tid] = turnier_auswerten(t, standings)
        neu += 1
    return turniere, offen, neu, ab


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--trocken", action="store_true", help="nichts schreiben")
    a = ap.parse_args(argv)

    from limitless_api_scraper import LimitlessApi  # noqa: E402

    jetzt = dt.datetime.now(dt.timezone.utc)
    tabelle = lies_tabelle()
    try:
        turniere, offen, neu, ab = lauf(LimitlessApi(), lies_zwischenstand(), jetzt)
    except Exception as e:                                      # noqa: BLE001
        print(f"::error::Limitless-API nicht erreichbar oder unlesbar: {e}")
        return 1
    daten = ausgabe(turniere, tabelle, ab, jetzt, offen, jetzt)
    m = daten["_meta"]
    print(f"Fenster {m['fenster']['von']}..{m['fenster']['bis']}: {m['turniere']} Turniere "
          f"({neu} neu, {len(offen)} laufen noch), {m['listen']} Listen, "
          f"{len(daten['decks'])} Decks ab {MIN_LISTEN} Listen, "
          f"{len(m['ohne_code'])} ohne Code")
    for d in daten["decks"]:
        print(f"  {d['tier'] or '?':2} {d['anteil']*100:5.1f} % {d['quote']*100:5.1f} % "
              f"{d['listen']:4}  {d['name']}" + ("" if d["code"] else f"  [kein Code: {d['code_fehlt']}]"))
    for o in offen:
        print(f"  läuft noch: {o['datum']} {o['name']}")

    # Ohne ein einziges gewertetes Deck wird NICHTS geschrieben: eine leere
    # Liste sähe auf der Seite aus wie „Pocket hat keine Meta".
    if not daten["decks"]:
        print(f"::error::kein Archetyp erreicht {MIN_LISTEN} Listen im Fenster "
              f"({m['turniere']} Turniere) — die alte Datei bleibt stehen")
        return 1
    if a.trocken:
        return 0
    schreibe_zwischenstand(turniere)
    tmp = ZIEL + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(daten, f, ensure_ascii=False, indent=1)
        f.write("\n")
    os.replace(tmp, ZIEL)
    print(f"geschrieben: {ZIEL}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
