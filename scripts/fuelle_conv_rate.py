#!/usr/bin/env python3
"""Fuellt top8/16/32_conv_rate aus den Platzierungen — oder laesst sie leer.

BEFUND (09.09.2026): die drei Spalten standen in ALLEN 4.713 Zeilen von
data/labs_tournament_decks.csv auf 0.0. Das war kein Rechenfehler,
sondern ein Vorgabewert: backend/scrapers/labs_tournament_scraper.py
setzt sie beim Bau auf 0.0 und ueberschreibt sie nie, weil die
Quellansicht (labs.limitlesstcg.com/<id>/decks?conversion) die
Top-Cut-Spalte nicht mehr fuehrt.

Eine 0,0 ist aber keine ehrliche Kodierung. Sie liest sich wie eine
Messung ("dieses Deck hat es nie in die Top 8 geschafft"), obwohl gar
nicht gemessen wurde. Leer ist die richtige Kodierung fuer "unbekannt".

DIE RECHNUNG, und woher sie kommt
---------------------------------
Nenner: `player_count` je (tournament_id, deck_slug) aus
labs_tournament_decks.csv. Der Schluessel ist dort eindeutig (4.713
Zeilen, 4.713 Schluessel).

Zaehler: die Zahl der Spieler mit `place` <= 8 / 16 / 32 je
(tournament_id, deck_slug) aus data/player_continuity.csv.

Belegt, nicht angenommen (nachgemessen ueber alle 12 Turniere, die in
player_continuity.csv stehen): Deckmenge und Antrittszahl stimmen
zwischen beiden Dateien exakt ueberein — `player_count` IST die Zahl
der Continuity-Zeilen mit diesem Slug, 0 Abweichungen. Und fuer die 10
Turniere, in denen labs `top8_count` selbst fuehrt, ist dieser Wert
deckungsgleich mit COUNT(place <= 8). Die beiden Wege bestaetigen
einander.

NICHT `topcut` verwenden: die Spalte ergibt je Turnier 8 bis 14
Treffer, meint also nicht "Top 8". `place` ist je Turnier dicht und
duplikatfrei.

REICHWEITE
----------
Platzierungen liegen nur fuer die Turniere in player_continuity.csv
vor — gemessen 12 Turniere, 812 der 4.713 Zeilen. Fuer die uebrigen
3.901 Zeilen gibt es in keiner Datei des Repos Platzierungsdaten. Die
bleiben leer. Eine Rate zu erfinden, waere schlimmer als keine.

Lauf: python3 scripts/fuelle_conv_rate.py [--pruefen]
  --pruefen  rechnet und berichtet, schreibt aber nichts.
"""

import csv
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
DATA = os.path.join(REPO, "data")

DECKS = os.path.join(DATA, "labs_tournament_decks.csv")
CONT = os.path.join(DATA, "player_continuity.csv")
SPALTEN = (("top8_conv_rate", 8), ("top16_conv_rate", 16), ("top32_conv_rate", 32))


def schreibe(pfad, zeilen, felder):
    with open(pfad, "w", encoding="utf-8", newline="") as f:
        schreiber = csv.DictWriter(f, fieldnames=felder, lineterminator="\n")
        schreiber.writeheader()
        schreiber.writerows(zeilen)


def lies(pfad):
    with open(pfad, encoding="utf-8", newline="") as f:
        leser = csv.DictReader(f)
        return list(leser), leser.fieldnames


def platzierungen():
    """(tournament_id, deck_slug) -> {8: n, 16: n, 32: n}."""
    zeilen, _ = lies(CONT)
    aus = {}
    for z in zeilen:
        slug = (z.get("deck_slug") or "").strip()
        platz = (z.get("place") or "").strip()
        if not slug or not platz:
            continue
        try:
            p = int(platz)
        except ValueError:
            continue
        schluessel = ((z.get("tournament_id") or "").strip(), slug)
        eintrag = aus.setdefault(schluessel, {8: 0, 16: 0, 32: 0})
        for _, grenze in SPALTEN:
            if p <= grenze:
                eintrag[grenze] += 1
    return aus


def main():
    nur_pruefen = "--pruefen" in sys.argv
    plaetze = platzierungen()
    turniere_mit_plaetzen = {t for t, _ in plaetze}
    zeilen, felder = lies(DECKS)

    gefuellt, geleert, ohne_nenner = 0, 0, 0
    for z in zeilen:
        schluessel = ((z.get("tournament_id") or "").strip(),
                      (z.get("deck_slug") or "").strip())
        if schluessel[0] not in turniere_mit_plaetzen:
            # Keine Platzierungen fuer dieses Turnier: leer, nicht 0.
            for spalte, _ in SPALTEN:
                if z.get(spalte) not in ("", None):
                    geleert += 1
                z[spalte] = ""
            continue
        try:
            nenner = int(float(z.get("player_count") or 0))
        except ValueError:
            nenner = 0
        if nenner <= 0:
            ohne_nenner += 1
            for spalte, _ in SPALTEN:
                z[spalte] = ""
            continue
        treffer = plaetze.get(schluessel, {8: 0, 16: 0, 32: 0})
        for spalte, grenze in SPALTEN:
            z[spalte] = f"{treffer[grenze] / nenner:.6f}"
        gefuellt += 1

    print(f"Turniere mit Platzierungen: {len(turniere_mit_plaetzen)}")
    print(f"Zeilen gefuellt:            {gefuellt}")
    print(f"Zeilen ohne Platzierungen:  {len(zeilen) - gefuellt - ohne_nenner}"
          f" (bleiben leer)")
    if ohne_nenner:
        print(f"Zeilen ohne player_count:   {ohne_nenner} (bleiben leer)")

    # Gegenprobe: wo labs top8_count selbst fuehrt, muss die Rate dazu
    # passen. Faellt das um, stimmt die Zuordnung nicht.
    abweichend = []
    abweichend_schluessel = set()
    for z in zeilen:
        roh = (z.get("top8_count") or "").strip()
        rate = (z.get("top8_conv_rate") or "").strip()
        if not roh or not rate:
            continue
        try:
            erwartet = int(float(roh)) / int(float(z["player_count"]))
        except (ValueError, ZeroDivisionError, KeyError):
            continue
        if abs(erwartet - float(rate)) > 1e-6:
            abweichend_schluessel.add((z.get("tournament_id"), z.get("deck_slug")))
            abweichend.append(f"{z['tournament_id']}/{z['deck_slug']}: "
                              f"top8_count={roh} -> {erwartet:.6f}, "
                              f"gerechnet {rate}")
    if abweichend:
        # SC-43 (03.11.2026): bis hierhin hiess es "NICHTS geschrieben" mit
        # rc 1, und der Wochenlauf warf daraufhin per `git checkout` die
        # GANZEN frischen Deckdateien weg — fuenf Wochenlaeufe lang
        # Puebla und Danzig, weil labs in Nizza EINEN Spieler umbenannt
        # hatte (0077 Platz 7: other -> mega-absol-mega-audino) und
        # player_continuity.csv das nicht nachzog. Eine Abweichung ist ein
        # Befund fuer die Zeile, nicht fuer den Bestand: die Zelle bleibt
        # leer (= unbekannt), die Paare werden gemeldet, geschrieben wird.
        print(f"  ! {len(abweichend)} Gegenproben abweichend — diese Zellen "
              f"bleiben leer, der Rest wird geschrieben:")
        for a in abweichend[:10]:
            print("    " + a)
        print("::warning::fuelle_conv_rate: %d Gegenprobe(n) abweichend "
              "(player_continuity.csv und labs top8_count widersprechen "
              "sich), Zellen leer gelassen: %s"
              % (len(abweichend), "; ".join(a.split(":")[0] for a in abweichend[:10])),
              flush=True)
        for z in zeilen:
            if (z.get("tournament_id"), z.get("deck_slug")) in abweichend_schluessel:
                for spalte, _ in SPALTEN:
                    z[spalte] = ""
    else:
        print("Gegenprobe gegen top8_count: keine Abweichung")

    if nur_pruefen:
        print("(--pruefen: nichts geschrieben)")
        return 0

    schreibe(DECKS, zeilen, felder)
    print(f"Wrote {DECKS}")

    # Die Formatauszuege sind Kopien derselben Zeilen. Wer nur die
    # Hauptdatei anfasst, laesst 14 Dateien mit der alten Luege stehen —
    # und genau die liest das Frontend (js/app-core.js waehlt den
    # Auszug ueber das Formatfenster).
    import glob
    schluessel = {(z["tournament_id"], z["deck_slug"]): z for z in zeilen}
    for pfad in sorted(glob.glob(os.path.join(DATA, "labs_tournament_decks_*.csv"))):
        teil, teil_felder = lies(pfad)
        if not teil:
            continue
        geaendert = 0
        for z in teil:
            quelle = schluessel.get(((z.get("tournament_id") or "").strip(),
                                     (z.get("deck_slug") or "").strip()))
            if not quelle:
                continue
            for spalte, _ in SPALTEN:
                if z.get(spalte) != quelle[spalte]:
                    z[spalte] = quelle[spalte]
                    geaendert += 1
        if geaendert:
            schreibe(pfad, teil, teil_felder)
            print(f"  {os.path.basename(pfad)}: {geaendert} Felder angeglichen")
    return 0


if __name__ == "__main__":
    sys.exit(main())
