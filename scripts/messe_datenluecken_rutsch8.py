#!/usr/bin/env python3
"""Zwei Messungen aus Rutsch 8 (27.09.2026) — ein Befehl statt Handarbeit.

1. DA-11  Matchups je Turnier: wie viele (Format, Turnier, Deck)-Ziele gibt es,
          wie viele sind geholt, wie viele offen — und bei JE_TURNIER_LIMIT
          Abrufen je Wochenlauf: wie viele Wochen noch?
2. DA-9   Cardmarket: wo weicht die geprueft-bestaetigte Nummer
          (cardmarket_mapping_verified.csv, status=verified) von der
          ausgelieferten Zuordnung (cardmarket_id_mapping.csv) ab — und ist
          die Abweichung eine Handentscheidung (cardmarket_mapping_manual.csv)?

AUFRUF
    python3 scripts/messe_datenluecken_rutsch8.py

Das Werkzeug misst, es urteilt nicht; Rueckgabe immer 0.
"""
import csv
import glob
import math
import os
import re

WURZEL = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
DATA = os.path.join(WURZEL, 'data')


def lies(name):
    with open(os.path.join(DATA, name), encoding='utf-8-sig') as f:
        return list(csv.DictReader(f))


def je_turnier():
    ziele = set()
    for z in lies('labs_tournament_decks.csv'):
        meta = (z.get('meta') or '').strip()
        slug = (z.get('deck_slug') or '').strip()
        tid = (z.get('tournament_id') or '').strip()
        if not meta or meta == '_unsorted' or not slug or not tid:
            continue
        try:
            ziele.add((meta, str(int(tid)), slug))
        except ValueError:
            continue
    fertig, turniere = set(), set()
    for pfad in glob.glob(os.path.join(DATA, 'labs_matchups_je_turnier_*.csv')):
        with open(pfad, encoding='utf-8-sig') as f:
            for r in csv.DictReader(f):
                k = ((r.get('meta') or '').strip(), str(r.get('tournaments_used') or '').strip(),
                     (r.get('my_deck_slug') or '').strip())
                fertig.add(k)
                turniere.add(k[:2])
    quelle = open(os.path.join(WURZEL, 'backend', 'scrapers', 'labs_tournament_scraper.py'),
                  encoding='utf-8').read()
    m = re.search(r'^JE_TURNIER_LIMIT\s*=\s*(\d+)', quelle, re.M)
    grenze = int(m.group(1)) if m else 0
    offen = len(ziele - fertig)
    print(f"DA-11  Ziele {len(ziele)} · geholt {len(fertig & ziele)} · offen {offen} · "
          f"Turniere mit Daten {len(turniere)} von {len({z[:2] for z in ziele})} · "
          f"Grenze je Lauf {grenze} → noch {math.ceil(offen / grenze) if grenze else '∞'} Wochenlaeufe")


def cardmarket():
    karte = {(r['set'], r['number']): r for r in lies('cardmarket_id_mapping.csv')}
    hand = {(r['set'], r['number']): r for r in lies('cardmarket_mapping_manual.csv')}
    abw = []
    for r in lies('cardmarket_mapping_verified.csv'):
        k = (r['set'], r['number'])
        if r.get('status') != 'verified' or k not in karte:
            continue
        if karte[k]['cardmarket_product_id'] != r['verified_product_id']:
            abw.append((k, karte[k]['cardmarket_product_id'], r['verified_product_id'], k in hand))
    print(f"DA-9   geprueft ≠ ausgeliefert: {len(abw)} · davon Handentscheidung: "
          f"{sum(1 for a in abw if a[3])} · ohne: {sum(1 for a in abw if not a[3])}")
    for (s, n), ist, soll, h in abw:
        print(f"       {s} {n}: ausgeliefert {ist}, Fingerabdruck {soll}{'  (von Hand gepinnt)' if h else ''}")


if __name__ == '__main__':
    je_turnier()
    cardmarket()
