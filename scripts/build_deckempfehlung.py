#!/usr/bin/env python3
"""Baut data/deckempfehlung.json — welches Deck man zum naechsten Turnier mitbringt.

WARUM ES DIESE DATEI GIBT

Das Meta-Call-Feature sagte bisher Meta-ANTEILE voraus. Der Betreiber braucht
aber eine Entscheidung: welchen Archetyp bringe ich mit, um Day 2 zu erreichen.
Das ist eine andere Frage, und sie hat eine andere Antwort.

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

Kein Winrate-Term. Die Siegquote empfiehlt fuer sich genommen aehnlich gut,
traegt neben der geschrumpften Day-2-Quote aber nichts mehr bei.

ZWEI BETRIEBSARTEN — UND WARUM SIE GETRENNT GEMESSEN WERDEN

  A  Das laufende Format hat schon Praesenzturniere.
     Anker = die letzten zwei desselben Formats. k = 30.

  B  Kaltstart: das Format hat noch keines. Stand 23.08.2026 gilt das fuer
     TEF-PBL, in dem Worlds gespielt wird.
     Anker = die letzten EPOCHENTIEFE_KALTSTART Epochen davor. k = 60.

Das ist der wichtigste Punkt dieser Datei, und er wurde beim ersten Bauen
falsch gemacht: die Rueckwaertsstrecke pruefte ausschliesslich Betriebsart A
und ihre Zahl (+9,9 pp) wurde als Beleg neben eine Empfehlung gestellt, die
in Betriebsart B entstanden war. Zwei verschiedene Verfahren, eine Zahl.
Seitdem wird jede Betriebsart gegen ihre EIGENEN Faelle gemessen, und die
Datei traegt beide Ergebnisse. Was die Oberflaeche zeigt, ist die Zahl der
Betriebsart, die tatsaechlich gelaufen ist.

Gemessen am 23.08.2026, paarweise je Turnier gegen den Feldschnitt:

    A   44 Turniere   Vorsprung  +9,9 pp   SE 1,40   in 42/44 besser
    B   22 Turniere   Vorsprung  +7,1 pp   SE 2,40   in 15/22 besser

B ist schwaecher, und das aus einem benennbaren Grund: ueber eine
Epochengrenze findet der Anker im Mittel 86 % der Zieldecks wieder, innerhalb
einer Epoche 99,4 %. Decks, die es erst im neuen Set gibt, kann er nicht
kennen. Diese Luecke wird in der Datei beziffert statt verschwiegen — gegen
den heutigen Online-Stand, nicht geschaetzt.

WARUM DER KALTSTART-ANKER ZWEI EPOCHEN UMFASST

Eine Epoche gibt +5,3 pp, zwei geben +7,1 pp. Paarweise ueber dieselben 22
Turniere: +1,87 pp, SE 0,83, besser in 6 Faellen, schlechter in 1. Drei
Epochen bringen nichts mehr (+6,6 pp). Die Aussage, die diese Zahlen tragen,
ist "mehr als eine Epoche", nicht "genau zwei" — 2 und 3 sind nicht
unterscheidbar.

WARUM k NICHT NACHGEZOGEN WURDE

Ein Durchlauf ueber k = 30/60/100/200/400 gibt in Betriebsart B Werte
zwischen +5,3 und +7,8 pp. Das sieht nach k = 100 als Sieger aus. Paarweise
gegen k = 60 gerechnet unterscheiden sich die beiden aber in genau 2 von 22
Turnieren (t = 1,42). Bei 22 Faellen und SE 2,4 ist die ganze Spannweite
Rauschen. Ein k, das aus so einem Durchlauf gezogen wird, ist an zwei
Turniere angepasst und nicht an die Welt. Deshalb bleibt k, wo es war.

WAS HIER NICHT DRINSTEHT UND WARUM

Matchup-Daten. data/limitless_online_decks_matchups.csv traegt weder Datum
noch Format; zeittreu geprueft verschlechtert jede Gewichtung damit das
Ergebnis.

Die Online-Leiter als Korrektur im Kaltstart. Sie waere die naheliegende
Antwort auf die 14-Prozent-Luecke, denn sie hat das laufende Format gesehen
und der Anker nicht. Sie ist hier trotzdem nicht verbaut:
data/online_share_history reicht bis 2026-04-29 zurueck und deckt damit 2 der
22 Kaltstart-Faelle ab. An zwei Faellen laesst sich nichts pruefen, und eine
ungepruefte Gewichtung ist genau das, was diese Datei ersetzen sollte.
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
EPOCHENTIEFE_KALTSTART = 2   # Epochen im Kaltstart; siehe Kopf, "mehr als eine"
MIN_ANZEIGE = 30       # Ankerspieler, ab denen ein Deck in der Rangliste auftaucht


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


def rueckwaertsstrecke(turniere, betriebsart, vorformat=None):
    """Die Regel gegen jedes Turnier nachspielen, das zu dieser Betriebsart passt.

    Betriebsart A bekommt die Turniere, die genug Vorgaenger im eigenen Format
    haben. Betriebsart B bekommt genau die anderen — die, bei denen das Format
    noch (fast) leer war, also echte Kaltstarts. Kein Turnier zaehlt fuer beide,
    und keine Betriebsart wird mit den Faellen der anderen bewertet. Genau das
    war der Fehler der ersten Fassung.

    Nur Daten, die VOR dem Zieldatum liegen. Das ist der ganze Sinn der Uebung —
    eine Empfehlung, die das Ergebnis kennt, ist keine.
    """
    sortiert = sorted(turniere.values(), key=lambda t: (t["datum"], t["id"]))
    faelle = []
    for ziel in sortiert:
        eigene = [t for t in sortiert
                  if t["meta"] == ziel["meta"] and t["datum"] < ziel["datum"]]
        kaltstart = len(eigene) < ANKERTIEFE
        if kaltstart != (betriebsart == "B"):
            continue
        if betriebsart == "A":
            anker, k = eigene[-ANKERTIEFE:], K_NORMAL
        else:
            anker = kaltstart_anker(sortiert, ziel["meta"], vorformat, ziel["datum"])
            k = K_KALTSTART
        if not anker:
            continue
        ist = ziel_quoten(ziel)
        if len(ist) < 5:
            continue
        score, _, _ = bewerte(anker, k)
        moeglich = [kk for kk in score if kk in ist]
        if not moeglich:
            continue
        gewaehlt = max(moeglich, key=lambda kk: (score[kk], kk))
        rang = sorted(ist.values(), reverse=True).index(ist[gewaehlt]) + 1
        faelle.append({
            "turnier": ziel["name"], "datum": ziel["datum"], "spieler": ziel["spieler"],
            "deck": gewaehlt, "quote": ist[gewaehlt],
            "feld": statistics.mean(ist.values()), "best": max(ist.values()),
            "rang": rang, "decks": len(ist),
            "abdeckung": len(moeglich) / len(ist),
        })
    return faelle


def vertrauen(faelle):
    """Was die Regel in dieser Betriebsart tatsaechlich gebracht hat.

    Die Kennzahl, auf die es ankommt, ist der PAARWEISE Vorsprung: je Turnier
    die Quote des empfohlenen Decks minus dem Feldschnitt desselben Turniers.
    Paarweise, weil Turniere sich stark unterscheiden — ein gutes Turnier hebt
    Empfehlung und Feld gleichermassen, und ein Mittelwertvergleich ueber
    verschiedene Turniere verwechselt das mit Koennen.

    Dazu der Standardfehler. Ohne ihn liest sich jede Differenz wie ein
    Ergebnis; mit ihm sieht man, ab wann sie eine ist.

    "anteil_am_erreichbaren" ist der Anteil am erreichbaren ZUGEWINN,
    (Empfehlung - Feld) / (bestmoeglich - Feld). Die erste Fassung rechnete
    hier Empfehlung / bestmoeglich und kam damit auf 69 % statt 47 % — eine
    Zahl, die auch dann gross aussieht, wenn die Regel gar nichts beitraegt.
    """
    if not faelle:
        return {}
    q = [f["quote"] for f in faelle]
    feld = [f["feld"] for f in faelle]
    best = [f["best"] for f in faelle]
    vorsprung = [a - b for a, b in zip(q, feld)]
    n = len(faelle)
    se = (statistics.stdev(vorsprung) / (n ** 0.5)) if n > 1 else None
    m_q, m_feld, m_best = statistics.mean(q), statistics.mean(feld), statistics.mean(best)
    spanne = m_best - m_feld
    viertel = statistics.quantiles(q, n=4) if n >= 4 else [min(q), statistics.median(q), max(q)]
    return {
        "turniere": n,
        "empfehlung_mittel": round(m_q, 2),
        "feld_mittel": round(m_feld, 2),
        "bestmoeglich_mittel": round(m_best, 2),
        "vorsprung": round(statistics.mean(vorsprung), 2),
        "vorsprung_standardfehler": round(se, 2) if se is not None else None,
        "anteil_am_erreichbaren": round((m_q - m_feld) / spanne * 100, 1) if spanne > 0 else None,
        "median": round(statistics.median(q), 2),
        "quartil_unten": round(viertel[0], 2),
        "quartil_oben": round(viertel[2], 2),
        "day2_ueberhaupt_erreicht": sum(1 for f in faelle if f["quote"] > 0),
        "ueber_feldschnitt": sum(1 for f in faelle if f["quote"] > f["feld"]),
        "bestes_deck_getroffen": sum(1 for f in faelle if f["rang"] == 1),
        "unter_den_besten_drei": sum(1 for f in faelle if f["rang"] <= 3),
        "schlechtester_fall": round(min(q), 2),
        "deckabdeckung": round(statistics.mean(f["abdeckung"] for f in faelle) * 100, 1),
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


def epochenfolge(sortiert):
    """Die Formatepochen in der Reihenfolge, in der sie gespielt wurden."""
    folge = []
    for t in sortiert:
        if t["meta"] and t["meta"] not in folge:
            folge.append(t["meta"])
    return folge


def kaltstart_anker(sortiert, format_key, vorformat, bis_datum=None):
    """Die letzten EPOCHENTIEFE_KALTSTART Epochen vor format_key.

    bis_datum grenzt auf Turniere davor ein — das braucht die Rueckwaertsstrecke,
    damit kein Turnier sein eigenes Ergebnis mitbekommt.
    """
    folge = epochenfolge(sortiert)
    if format_key in folge:
        i = folge.index(format_key)
    elif vorformat in folge:
        i = folge.index(vorformat) + 1
    else:
        i = len(folge)
    vor = folge[max(0, i - EPOCHENTIEFE_KALTSTART):i]
    if not vor:
        return []
    return [t for t in sortiert
            if t["meta"] in vor and (bis_datum is None or t["datum"] < bis_datum)]


def ranglisten(score, detail):
    """(vollstaendige Liste, Anzeigeliste).

    Decks unter MIN_ANZEIGE Ankerspielern fliegen aus der ANZEIGE, nicht nur in
    eine Fussnote. Die Schrumpfung faengt sie rechnerisch bereits ab, aber ein
    Platz in einer nummerierten Liste ist das lauteste Signal auf dem Schirm —
    lauter als jeder Warnhinweis daneben. Sylveon stand mit 6 Ankerspielern und
    einem Gluecksturnier auf Rang 5; wer das liest, spielt Sylveon. Die
    vollstaendige Liste bleibt nachpruefbar in der Datei.
    """
    def eintrag(kk, v):
        return {
            "deck": detail["namen"].get(kk, kk),
            "schluessel": kk,
            "ankerspieler": int(detail["d1"][kk]),
            "day2_roh": round(detail["roh"][kk], 2),
            "day2_geschrumpft": round(v, 2),
        }

    rang = sorted(score.items(), key=lambda x: (-x[1], x[0]))
    voll = [eintrag(kk, v) for kk, v in rang[:25]]
    return voll, [e for e in voll if e["ankerspieler"] >= MIN_ANZEIGE][:10]


def waehle_anker(turniere, format_key, vorformat):
    """(Ankerliste, k, Betriebsart). Betriebsart B, wenn das Format noch leer ist."""
    sortiert = sorted(turniere.values(), key=lambda t: (t["datum"], t["id"]))
    eigene = [t for t in sortiert if t["meta"] == format_key]
    if len(eigene) >= 1:
        tiefe = min(ANKERTIEFE, len(eigene))
        return eigene[-tiefe:], K_NORMAL, "A"
    anker = kaltstart_anker(sortiert, format_key, vorformat)
    if anker:
        return anker, K_KALTSTART, "B"
    return [], K_KALTSTART, "B"


def online_abdeckung(datenordner, d1):
    """Wieviel Prozent des heutigen Online-Feldes kennt der Anker nicht?

    Der Anker sind Praesenzturniere. Im Kaltstart stammt er sogar aus der
    Vorepoche. Zwischen Anker und heute erscheinen neue Decks — nach einem
    Set-Release sind das nicht wenige. Fuer die kennt die Regel keine
    Day-2-Quote, sie kann sie also gar nicht empfehlen, egal wie gut sie sind.

    Diese Zahl beziffert genau diese blinde Stelle: den Anteil der heutigen
    Online-Spielerschaft, dessen Deck im Anker nicht vorkommt. Sie ist die
    ehrliche Obergrenze fuer das Vertrauen in die Empfehlung, und sie gehoert
    darum neben die Empfehlung und nicht in eine Fussnote.

    Gibt None zurueck, wenn kein Online-Schnappschuss vorliegt. Kein Schaetzwert
    — eine fehlende Zahl ist ehrlicher als eine erfundene.
    """
    ordner = os.path.join(datenordner, "online_share_history")
    dateien = sorted(glob.glob(os.path.join(ordner, "20??-??-??.csv")))
    if not dateien:
        return None
    pfad = dateien[-1]
    bekannt = set(d1)
    gesamt = 0.0
    fremd = 0.0
    fremde_decks = []
    with open(pfad, encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f, delimiter=";"):
            anteil = zahl(r.get("share"))
            name = (r.get("deck_name") or "").strip()
            if anteil <= 0 or not name:
                continue
            gesamt += anteil
            if schluessel(name) not in bekannt:
                fremd += anteil
                fremde_decks.append((name, round(anteil, 2)))
    if gesamt <= 0:
        return None
    fremde_decks.sort(key=lambda x: -x[1])
    return {
        "schnappschuss": os.path.basename(pfad)[:-4],
        "anteil_unbekannt": round(fremd / gesamt * 100.0, 2),
        "groesste_unbekannte": [{"deck": n, "anteil": a} for n, a in fremde_decks[:5]],
    }


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

    voll, liste = ranglisten(score, detail)

    # Beide Betriebsarten gegen ihre eigenen Faelle. Die Oberflaeche zeigt die
    # Zahl der Betriebsart, die tatsaechlich gelaufen ist — nicht die schoenere.
    vertrauen_je = {
        "A": vertrauen(rueckwaertsstrecke(turniere, "A")),
        "B": vertrauen(rueckwaertsstrecke(turniere, "B", vorformat)),
    }
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
        "online_abdeckung": online_abdeckung(args.daten, detail["d1"]),
        "min_ankerspieler_anzeige": MIN_ANZEIGE,
        "empfehlung": liste[0] if liste else None,
        "rangliste": liste,
        "rangliste_vollstaendig": voll,
        "vertrauen": vertrauen_je.get(art, {}),
        "vertrauen_je_betriebsart": vertrauen_je,
    }

    print(f"Format {format_key} · Betriebsart {art} · k={k} · "
          f"Anker {len(anker)} Turnier(e), {ergebnis['ankerspieler_gesamt']} Spieler")
    for i, e in enumerate(liste[:6], 1):
        print(f"  {i}. {e['deck'][:28]:28} {e['ankerspieler']:5} Sp.  "
              f"roh {e['day2_roh']:5.1f} %  -> {e['day2_geschrumpft']:5.2f} %")
    oa = ergebnis["online_abdeckung"]
    if oa:
        print(f"  Anker kennt {100 - oa['anteil_unbekannt']:.1f} % des Online-Feldes "
              f"(Stand {oa['schnappschuss']}); unbekannt: "
              + ", ".join(f"{d['deck']} {d['anteil']} %" for d in oa["groesste_unbekannte"][:3]))

    print()
    for a in ("A", "B"):
        v = vertrauen_je.get(a) or {}
        if not v:
            continue
        marke = "  <- gilt hier" if a == art else ""
        print(f"Betriebsart {a}: {v['turniere']:3} Turniere · Empfehlung {v['empfehlung_mittel']:5.2f} % · "
              f"Feld {v['feld_mittel']:5.2f} % · Vorsprung {v['vorsprung']:+5.2f} pp "
              f"(SE {v['vorsprung_standardfehler']}) · besser in {v['ueber_feldschnitt']}/{v['turniere']} · "
              f"{v['anteil_am_erreichbaren']} % des erreichbaren Zugewinns · "
              f"Deckabdeckung {v['deckabdeckung']} %{marke}")

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
