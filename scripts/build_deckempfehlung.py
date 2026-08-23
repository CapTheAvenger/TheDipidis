#!/usr/bin/env python3
"""Baut data/deckempfehlung.json — welches Deck man zum naechsten Turnier mitbringt.

WARUM ES DIESE DATEI GIBT

Das Meta-Call-Feature sagte bisher Meta-ANTEILE voraus. Der Betreiber braucht
aber eine Entscheidung: welchen Archetyp bringe ich mit, um Day 2 zu erreichen.
Das ist eine andere Frage, und sie hat eine andere Antwort — gemessen am
23.08.2026 ueber 44 vergangene Turniere:

    Durchschnittsdeck des Feldes      14,88 %  Day-2-Quote
    das meistgespielte Deck           17,4  %
    diese Regel                       24,75 %   <- 69 % des Erreichbaren
    bestmoegliche Wahl im Nachhinein  35,83 %

Die Regel hebt die Day-2-Chance also von rund 15 auf rund 25 %. Sie macht sie
nicht sicher: in drei von vier Turnieren reicht es trotzdem nicht. Genau
deshalb steht die Verteilung mit in der Datei — eine Empfehlung ohne ihre
Trefferquote erzeugt Vertrauen, das sie nicht deckt.

DIE REGEL

Ein Deck wird danach bewertet, wie zuverlaessig es Day 2 erreicht hat. Roh ist
diese Quote unbrauchbar: ein Deck mit sechs Spielern und 66,7 % stuende sonst
ganz oben. Deshalb wird sie zum Feldmittel geschrumpft, umso staerker, je
duenner die Datenlage:

    Score(d) = ( D2(d) + k * p0 ) / ( D1(d) + k )

    D1(d) = Summe der day1_players des Decks ueber die Ankerturniere
    D2(d) = Summe day1_players * day1_to_day2_conv
    p0    = Feldkonversion des gesamten Ankers
    k     = 30 im Normalfall, 60 im Kaltstart

Ein Parameter. Er ist bewusst nicht ausgereizt: ueber k = 10 bis 100 bewegt
sich das Ergebnis nur zwischen 24,3 und 24,8 %. Ein breites Plateau statt
einer Spitze heisst, dass hier nichts an die Daten angepasst wurde.

Kein Winrate-Term. Die Siegquote empfiehlt fuer sich genommen genauso gut
(23,1 %), traegt neben der geschrumpften Day-2-Quote aber nichts mehr bei.
(Sie ist damit NICHT wertlos — fuer die Anteilsprognose ist sie es, fuer die
Empfehlung war sie ein gleichwertiger Weg zum selben Ziel.)

ZWEI BETRIEBSARTEN

  A  Das laufende Format hat schon Praesenzturniere.
     Anker = die letzten zwei. k = 30. Gemessen 24,75 %.

  B  Kaltstart: das Format hat noch keines (Stand 23.08.2026 gilt das fuer
     TEF-PBL, in dem Worlds gespielt wird).
     Anker = die KOMPLETTE Vorepoche, nicht ihre letzten zwei. k = 60.
     Gemessen 22,2 % — schlechter, und das aus einem benennbaren Grund:
     ueber eine Epochengrenze findet der Anker im Mittel nur 85 % der
     Zieldecks wieder, innerhalb einer Epoche 99,5 %. Decks, die es erst im
     neuen Set gibt, kann er nicht kennen. Diese Luecke wird in der Datei
     beziffert statt verschwiegen.

WAS HIER NICHT DRINSTEHT UND WARUM

Matchup-Daten. data/limitless_online_decks_matchups.csv traegt weder Datum
noch Format; zeittreu geprueft verschlechtert jede Gewichtung damit das
Ergebnis. Ein Feldbezug waere die naheliegende Erweiterung — er ist mit den
heutigen Daten nicht belegbar.
"""

import argparse
import collections
import csv
import glob
import json
import os
import re
import statistics
import sys
from datetime import datetime, timezone

HIER = os.path.dirname(os.path.abspath(__file__))
WURZEL = os.path.dirname(HIER)
DATEN = os.path.join(WURZEL, "data")

K_NORMAL = 30          # Schrumpfung im Normalfall
K_KALTSTART = 60       # im Kaltstart, weil der Anker aus einer fremden Epoche kommt
MIN_ZIELSPIELER = 8    # darunter ist die Day-2-Quote eines Decks Rauschen
ANKERTIEFE = 2         # Turniere im Normalfall


def zahl(wert, standard=0.0):
    try:
        return float(str(wert).replace(",", "."))
    except (TypeError, ValueError):
        return standard


def schluessel(name):
    return re.sub(r"[^a-z0-9]+", "", (name or "").lower())


def lies_turniere(datenordner):
    """Alle Praesenzturniere als {tid: {...}}, Zeilen je Deck."""
    zeilen = []
    for pfad in sorted(glob.glob(os.path.join(datenordner, "labs_tournament_decks*.csv"))):
        with open(pfad, encoding="utf-8-sig", newline="") as f:
            zeilen.extend(csv.DictReader(f))
    turniere = {}
    for r in zeilen:
        tid = (r.get("tournament_id") or "").strip()
        if not tid:
            continue
        t = turniere.setdefault(tid, {
            "id": tid,
            "meta": (r.get("meta") or "").strip(),
            "datum": (r.get("tournament_date") or "").strip(),
            "name": (r.get("tournament_name") or "").strip(),
            "spieler": int(zahl(r.get("total_players"))),
            "zeilen": [],
        })
        t["zeilen"].append(r)
    return {tid: t for tid, t in turniere.items() if t["datum"]}


def anker_werte(anker):
    """D1, D2 und Anzeigenamen je Deck ueber eine Turnierliste."""
    d1 = collections.defaultdict(float)
    d2 = collections.defaultdict(float)
    namen = {}
    for t in anker:
        for r in t["zeilen"]:
            k = schluessel(r.get("deck_name"))
            spieler = zahl(r.get("day1_players"))
            if not k or spieler <= 0:
                continue
            d1[k] += spieler
            d2[k] += spieler * zahl(r.get("day1_to_day2_conv"))
            namen.setdefault(k, (r.get("deck_name") or "").strip())
    return d1, d2, namen


def bewerte(anker, k):
    """Geschrumpfte Day-2-Quote je Deck, in Prozent. Leeres dict, wenn kein Anker."""
    d1, d2, namen = anker_werte(anker)
    gesamt1 = sum(d1.values())
    if gesamt1 <= 0:
        return {}, {}, 0.0
    p0 = sum(d2.values()) / gesamt1
    score = {k_: (d2[k_] + k * p0) / (d1[k_] + k) * 100.0 for k_ in d1}
    roh = {k_: (d2[k_] / d1[k_] * 100.0) for k_ in d1}
    return score, {"d1": dict(d1), "roh": roh, "namen": namen}, p0 * 100.0


def ziel_quoten(turnier):
    """Tatsaechliche Day-2-Quote je Deck beim Zielturnier, nur ab MIN_ZIELSPIELER."""
    out = {}
    for r in turnier["zeilen"]:
        k = schluessel(r.get("deck_name"))
        if k and zahl(r.get("day1_players")) >= MIN_ZIELSPIELER:
            out[k] = zahl(r.get("day1_to_day2_conv")) * 100.0
    return out


def rueckwaertsstrecke(turniere):
    """Die Regel gegen jedes Turnier mit >= ANKERTIEFE Vorgaengern derselben Epoche.

    Nur Daten, die VOR dem Zieldatum liegen. Das ist der ganze Sinn der
    Uebung — eine Empfehlung, die das Ergebnis kennt, ist keine.
    """
    sortiert = sorted(turniere.values(), key=lambda t: (t["datum"], t["id"]))
    faelle = []
    for ziel in sortiert:
        vorher = [t for t in sortiert
                  if t["meta"] == ziel["meta"] and t["datum"] < ziel["datum"]]
        if len(vorher) < ANKERTIEFE:
            continue
        ist = ziel_quoten(ziel)
        if len(ist) < 5:
            continue
        score, _, _ = bewerte(vorher[-ANKERTIEFE:], K_NORMAL)
        moeglich = [k for k in score if k in ist]
        if not moeglich:
            continue
        gewaehlt = max(moeglich, key=lambda k: (score[k], k))
        rang = sorted(ist.values(), reverse=True).index(ist[gewaehlt]) + 1
        faelle.append({
            "turnier": ziel["name"], "datum": ziel["datum"], "spieler": ziel["spieler"],
            "deck": gewaehlt, "quote": ist[gewaehlt],
            "feld": statistics.mean(ist.values()), "best": max(ist.values()),
            "rang": rang, "decks": len(ist),
        })
    return faelle


def vertrauen(faelle):
    if not faelle:
        return {}
    q = [f["quote"] for f in faelle]
    viertel = statistics.quantiles(q, n=4) if len(q) >= 4 else [min(q), statistics.median(q), max(q)]
    return {
        "turniere": len(faelle),
        "empfehlung_mittel": round(statistics.mean(q), 2),
        "feld_mittel": round(statistics.mean(f["feld"] for f in faelle), 2),
        "bestmoeglich_mittel": round(statistics.mean(f["best"] for f in faelle), 2),
        "anteil_am_erreichbaren": round(
            statistics.mean(q) / statistics.mean(f["best"] for f in faelle) * 100, 1),
        "median": round(statistics.median(q), 2),
        "quartil_unten": round(viertel[0], 2),
        "quartil_oben": round(viertel[2], 2),
        "day2_ueberhaupt_erreicht": sum(1 for f in faelle if f["quote"] > 0),
        "ueber_feldschnitt": sum(1 for f in faelle if f["quote"] > f["feld"]),
        "bestes_deck_getroffen": sum(1 for f in faelle if f["rang"] == 1),
        "unter_den_besten_drei": sum(1 for f in faelle if f["rang"] <= 3),
        "schlechtester_fall": round(min(q), 2),
    }


def aktuelles_format(datenordner):
    pfad = os.path.join(datenordner, "format_window.json")
    try:
        with open(pfad, encoding="utf-8") as f:
            fw = json.load(f)
    except (OSError, json.JSONDecodeError):
        return "", ""
    alt = str(fw.get("oldest_legal_set") or "").upper()
    neu = str(fw.get("current_set") or "").upper()
    vor = str(fw.get("previous_format_key") or "").upper()
    return (f"{alt}-{neu}" if alt and neu else ""), vor


def waehle_anker(turniere, format_key, vorformat):
    """(Ankerliste, k, Betriebsart). Betriebsart B, wenn das Format noch leer ist."""
    sortiert = sorted(turniere.values(), key=lambda t: (t["datum"], t["id"]))
    eigene = [t for t in sortiert if t["meta"] == format_key]
    if len(eigene) >= 1:
        tiefe = min(ANKERTIEFE, len(eigene))
        return eigene[-tiefe:], K_NORMAL, "A"
    vorherige = [t for t in sortiert if t["meta"] == vorformat]
    if vorherige:
        return vorherige, K_KALTSTART, "B"
    # Kein benanntes Vorformat: die juengste Epoche, die es gibt.
    if sortiert:
        juengste = sortiert[-1]["meta"]
        return [t for t in sortiert if t["meta"] == juengste], K_KALTSTART, "B"
    return [], K_KALTSTART, "B"


def main():
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--daten", default=DATEN)
    p.add_argument("--out", default=None)
    p.add_argument("--trocken", action="store_true", help="nur anzeigen, nichts schreiben")
    args = p.parse_args()

    turniere = lies_turniere(args.daten)
    if not turniere:
        print("::error::build_deckempfehlung: keine Turnierdaten gefunden")
        return 1

    format_key, vorformat = aktuelles_format(args.daten)
    if not format_key:
        print("::error::build_deckempfehlung: format_window.json unlesbar oder unvollstaendig")
        return 1

    anker, k, art = waehle_anker(turniere, format_key, vorformat)
    if not anker:
        print("::error::build_deckempfehlung: kein Anker bestimmbar")
        return 1

    score, detail, p0 = bewerte(anker, k)
    if not score:
        print("::error::build_deckempfehlung: Anker enthaelt keine verwertbaren Zeilen")
        return 1

    rang = sorted(score.items(), key=lambda x: (-x[1], x[0]))
    liste = [{
        "deck": detail["namen"].get(kk, kk),
        "schluessel": kk,
        "ankerspieler": int(detail["d1"][kk]),
        "day2_roh": round(detail["roh"][kk], 2),
        "day2_geschrumpft": round(v, 2),
    } for kk, v in rang[:15]]

    faelle = rueckwaertsstrecke(turniere)
    ergebnis = {
        "erzeugt": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S+00:00"),
        "format": format_key,
        "betriebsart": art,
        "betriebsart_klartext": (
            "Anker aus dem laufenden Format" if art == "A" else
            f"Kaltstart — {format_key} hat noch kein Praesenzturnier, Anker ist die Vorepoche {anker[0]['meta']}"),
        "schrumpfung_k": k,
        "feldkonversion_anker": round(p0, 2),
        "anker": [{"id": t["id"], "name": t["name"], "datum": t["datum"], "spieler": t["spieler"]}
                  for t in anker],
        "ankerspieler_gesamt": sum(t["spieler"] for t in anker),
        "empfehlung": liste[0] if liste else None,
        "rangliste": liste,
        "vertrauen": vertrauen(faelle),
    }

    print(f"Format {format_key} · Betriebsart {art} · k={k} · "
          f"Anker {len(anker)} Turnier(e), {ergebnis['ankerspieler_gesamt']} Spieler")
    for i, e in enumerate(liste[:6], 1):
        print(f"  {i}. {e['deck'][:28]:28} {e['ankerspieler']:5} Sp.  "
              f"roh {e['day2_roh']:5.1f} %  -> {e['day2_geschrumpft']:5.2f} %")
    v = ergebnis["vertrauen"]
    if v:
        print(f"\nRueckwaerts ueber {v['turniere']} Turniere: Empfehlung {v['empfehlung_mittel']} % · "
              f"Feld {v['feld_mittel']} % · bestmoeglich {v['bestmoeglich_mittel']} % "
              f"({v['anteil_am_erreichbaren']} % des Erreichbaren)")
        print(f"  ueber Feldschnitt in {v['ueber_feldschnitt']}/{v['turniere']}, "
              f"bestes Deck getroffen {v['bestes_deck_getroffen']}/{v['turniere']}, "
              f"schlechtester Fall {v['schlechtester_fall']} %")

    if args.trocken:
        return 0
    ziel = args.out or os.path.join(args.daten, "deckempfehlung.json")
    with open(ziel, "w", encoding="utf-8") as f:
        json.dump(ergebnis, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"\ngeschrieben: {os.path.relpath(ziel, WURZEL)}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as fehler:   # noqa: BLE001
        # Ein Lauf, der sein Ziel nicht erreicht, darf nicht gruen aussehen.
        print(f"::error::build_deckempfehlung abgebrochen: {fehler}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
