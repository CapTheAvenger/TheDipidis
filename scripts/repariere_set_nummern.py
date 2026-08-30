#!/usr/bin/env python3
"""Schneidet den URL-Rest aus der Spalte `set_number`.

BEFUND (gemessen 30.08.2026)
---------------------------
In data/city_league_analysis_M3.csv tragen 3.451 von 133.437 Zeilen
(2,59 %) eine Setnummer, an der noch die Abfrage der Herkunfts-URL
klebt:

    set_number       61?translate=en      statt  61
    card_identifier  M3 61?translate=en   statt  M3 61

Betroffen sind 30 Karten, Sets M3 (3.442 Zeilen) und MP (9). Die
haeufigsten: Meowth ex (2.363), Staryu (275), Mega Starmie ex (275),
Binacle (134), Barbaracle (134). KEINE dieser Karten kommt in derselben
Datei auch mit sauberer Nummer vor — es gibt also keine zweite Zeile,
gegen die sich die kaputte pruefen liesse.

URSACHE: Limitless verlinkt Karten aus japanischen Sets mit einer
Abfrage (/cards/M3/61?translate=en). Der Scraper schneidet sie
inzwischen ab (backend/core/card_scraper_shared.py, METHODE 1) — diese
Datei ist der eingefrorene Vergangenheits-Schnappschuss und stammt von
davor. Sie wird nicht neu erzeugt, bleibt also kaputt, bis jemand sie
anfasst.

WAS DAS SKRIPT TUT — UND WARUM DAS KEIN RATEN IST
-------------------------------------------------
`?translate=en` ist die Abfrage einer URL, nicht ein Teil der Nummer.
Sie abzuschneiden ist keine Schaetzung, sondern dieselbe Operation, die
der Scraper heute selbst vornimmt (card_scraper_shared.py, METHODE 1):
aus `/cards/M3/61?translate=en` ist die Nummer `61`.

Die Bildadresse in derselben Zeile ist ein zweiter Zeuge:

    https://…/tpc/M3/M3_61_R_JP_LG.png
                     ^^^^^ Set und Nummer

Bestaetigt sie die Nummer, wird das vermerkt. Widerspricht sie ihr,
wird die Nummer TROTZDEM bereinigt — aber die Bildadresse NICHT
angefasst, und der Widerspruch wird gemeldet.

DENN DAS IST DER ZWEITE BEFUND: in 663 der 3.451 Zeilen zeigt die
Bildadresse auf eine ganz andere Karte —

    Staryu      M3 20  ->  Bild PAF 118
    Binacle     M3 41  ->  Bild LOR 106
    Barbaracle  M3 42  ->  Bild LOR 107
    Yveltal ex  M3 52  ->  Bild XYP 8

Das ist die Folge desselben Fehlers: mit `20?translate=en` schlug die
Suche ueber (Set, Nummer) fehl, und der Rueckfall ueber den NAMEN hat
den erstbesten gleichnamigen Druck aus einem anderen Set gegriffen —
genau der Namens-Join, den CLAUDE.md verbietet. In den uebrigen 2.788
Zeilen hat der Rueckfall zufaellig richtig gelegen.

Eine richtige Bildadresse laesst sich hier nicht herleiten; sie steht
in keiner der ausgelieferten Dateien. Sie zu erfinden waere genau der
Fehler, den dieses Projekt nicht macht. Also: Nummer bereinigen, Bild
melden.

`card_identifier` wird mitgezogen, aber nur, wenn es genau
"<set_code> <alte Nummer>" lautet — sonst steht dort etwas anderes,
und dann fasst das Skript es nicht an.

SCHREIBWEISE
------------
Geaendert werden ausschliesslich diese beiden Felder, per
Textausschnitt. Alle uebrigen Bytes der Zeile bleiben unangetastet;
nach dem Schreiben prueft das Skript das Zeile fuer Zeile nach.

Aufruf:  python3 scripts/repariere_set_nummern.py [--schreiben]
Ohne --schreiben wird nur berichtet.
"""

import argparse
import collections
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

# Zeilenzerlegung und Feldpositionen teilen sich beide Reparaturen.
from scripts.repariere_ace_spec import (  # noqa: E402
    dateien_mit_spalte, felder, lies,
)

DATA = os.path.join(ROOT, "data")


def nummer_aus_bild(url: str, set_code: str):
    """Die Nummer aus '…/M3/M3_61_R_JP_LG.png'. None, wenn sie nicht
    eindeutig dasteht."""
    if not url or not set_code:
        return None
    name = url.rsplit("/", 1)[-1]
    m = re.match(r"^([A-Za-z0-9-]+)_([0-9]+)_", name)
    if not m:
        return None
    if m.group(1).upper() != set_code.strip().upper():
        return None
    return m.group(2).lstrip("0") or m.group(2)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--schreiben", action="store_true",
                    help="Dateien tatsaechlich aendern (sonst nur berichten)")
    args = ap.parse_args()

    gesamt = collections.Counter()
    ungeklaert = collections.Counter()
    bild_streit = collections.Counter()

    for pfad in dateien_mit_spalte(DATA):
        kopf, tr, namen, zeilen = lies(pfad)
        if "set_number" not in namen:
            continue
        i_num = namen.index("set_number")
        i_set = namen.index("set_code") if "set_code" in namen else None
        i_bild = namen.index("image_url") if "image_url" in namen else None
        i_ident = namen.index("card_identifier") if "card_identifier" in namen else None
        i_name = namen.index("card_name") if "card_name" in namen else None

        neu = [zeilen[0]]
        geaendert = 0
        offen = 0
        for zeile in zeilen[1:]:
            endlaenge = len(zeile) - len(zeile.rstrip("\r\n"))
            rumpf = zeile[:len(zeile) - endlaenge] if endlaenge else zeile
            ende = zeile[len(rumpf):]
            fs = felder(rumpf, tr)
            if len(fs) != len(namen) or "?" not in fs[i_num][0]:
                neu.append(zeile)
                continue

            alt = fs[i_num][0]
            vorschlag = alt.split("?", 1)[0].split("#", 1)[0].strip()
            set_code = fs[i_set][0] if i_set is not None else ""
            aus_bild = nummer_aus_bild(fs[i_bild][0] if i_bild is not None else "", set_code)

            if not vorschlag:
                # Nichts vor dem Fragezeichen — dann steht dort etwas
                # anderes als eine Nummer, und das Skript faellt nicht
                # darueber her.
                offen += 1
                ungeklaert[(os.path.basename(pfad),
                            fs[i_name][0] if i_name is not None else "", alt, "leer")] += 1
                neu.append(zeile)
                continue
            if aus_bild is None or aus_bild != vorschlag.lstrip("0"):
                # Die Nummer wird trotzdem bereinigt — das Fragezeichen
                # gehoert nicht hinein. Aber die Bildadresse widerspricht
                # ihr, und DAS wird gemeldet statt geflickt.
                bild_streit[(os.path.basename(pfad),
                             fs[i_name][0] if i_name is not None else "",
                             "%s %s" % (set_code, vorschlag),
                             (fs[i_bild][0] if i_bild is not None else "").rsplit("/", 1)[-1])] += 1

            # Erst das hintere Feld ersetzen, damit die vorderen
            # Positionen gueltig bleiben.
            ersetzungen = [(i_num, vorschlag)]
            if i_ident is not None:
                erwartet = ("%s %s" % (set_code, alt)).strip()
                if fs[i_ident][0].strip() == erwartet:
                    ersetzungen.append((i_ident, ("%s %s" % (set_code, vorschlag)).strip()))
            for idx, wert in sorted(ersetzungen, key=lambda t: -fs[t[0]][1]):
                _, a, e = fs[idx]
                rumpf = rumpf[:a] + wert + rumpf[e:]
            geaendert += 1
            neu.append(rumpf + ende)

        if geaendert or offen:
            print("  %-46s bereinigt %5d   nicht angefasst %4d   (%d Zeilen)"
                  % (os.path.basename(pfad), geaendert, offen, len(zeilen) - 1))
        gesamt["geaendert"] += geaendert
        gesamt["offen"] += offen

        if args.schreiben and geaendert:
            with open(pfad, "w", encoding="utf-8", newline="") as f:
                f.write("".join(neu))
            # Nachpruefung: nur set_number und card_identifier duerfen abweichen.
            _, tr2, namen2, zeilen2 = lies(pfad)
            erlaubt = {i_num} | ({i_ident} if i_ident is not None else set())
            if namen2 != namen or len(zeilen2) != len(zeilen):
                print("::error::%s: Datei nach dem Schreiben anders geformt." % pfad)
                return 2
            for a_z, n_z in zip(zeilen[1:], zeilen2[1:]):
                fa = [w for w, _, _ in felder(a_z.rstrip("\r\n"), tr)]
                fn = [w for w, _, _ in felder(n_z.rstrip("\r\n"), tr2)]
                if len(fa) != len(fn):
                    print("::error::%s: Feldzahl veraendert." % pfad)
                    return 2
                for k, (x, y) in enumerate(zip(fa, fn)):
                    if k not in erlaubt and x != y:
                        print("::error::%s: Spalte %r veraendert (%r -> %r)."
                              % (pfad, namen[k], x, y))
                        return 2

    print("\nGesamt: %d Zeilen bereinigt, %d nicht angefasst."
          % (gesamt["geaendert"], gesamt["offen"]))
    if ungeklaert:
        print("\nNicht angefasst — vor dem Fragezeichen steht keine Nummer:")
        for (datei, name, wert, grund), anzahl in ungeklaert.most_common(15):
            print("   %6d  %-42s %-24s %s" % (anzahl, datei, name, wert))
    if bild_streit:
        summe = sum(bild_streit.values())
        print("\nZWEITER BEFUND — %d Zeilen tragen die Bildadresse einer ANDEREN "
              "Karte (%d Namen):" % (summe, len(bild_streit)))
        for (datei, name, ident, bild), anzahl in bild_streit.most_common(15):
            print("   %6d  %-22s %-10s zeigt %s" % (anzahl, name, ident, bild))
        print("   Ursache: mit der kaputten Nummer schlug die Suche ueber "
              "(Set, Nummer) fehl, und der Rueckfall ueber den NAMEN griff "
              "einen gleichnamigen Druck aus einem anderen Set.")
        print("   NICHT repariert: eine richtige Bildadresse steht in keiner "
              "ausgelieferten Datei. Sie zu erfinden waere schlimmer als das "
              "Loch. Behebt sich mit dem naechsten Lauf des Scrapers, der die "
              "Nummer jetzt sauber liest.")
        print("::warning::%d Zeilen in city_league_analysis_M3.csv zeigen das "
              "Bild einer anderen Karte — Folge der kaputten Setnummer." % summe)
    if not args.schreiben:
        print("\n(Nur berichtet. Mit --schreiben wird geaendert.)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
