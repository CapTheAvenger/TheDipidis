#!/usr/bin/env python3
"""Messung FE-19: Familien nach Hauptkarte statt nach Namensanfang.

Liest alle Rotationen-Stuecke (data/tournament_cards_data_cards_*.csv) und
bestimmt je Archetyp die Hauptkarte nach derselben Regel wie
js/app-past-meta.js (hauptkarteVon):

  * Kandidaten sind Pokemon-Karten (type Basic / Stage 1 / Stage 2) aus den
    Listen des Archetyps, deren Name ohne Zusatz (ex, V, VSTAR, VMAX, GX) —
    ganz oder als hinterer Teil aus ganzen Woertern ("Palkia" aus "Origin
    Forme Palkia") — am Anfang des Archetypnamens steht.
  * Der laengste Treffer gewinnt, dann der ganze Name vor dem Teil, dann
    die Karte, die in den meisten Listen liegt.
  * Identitaet der Karte ist (Set, Nummer) plus alle internationalen Drucke
    aus data/all_cards_database.csv — nie der Name.

Ausgabe: Zeilen, die zeigen, welche Familien die alte Praefixregel und die
neue Regel bilden, und wo sie sich unterscheiden. Nur lesen, schreibt nichts.

    python3 scripts/messe_familien_hauptkarte.py [--zeige Banette,Gardevoir]
"""
import csv, glob, json, os, re, sys
from collections import defaultdict

HIER = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HIER, '..', 'data')
POKEMON = {'Basic', 'Stage 1', 'Stage 2'}
ZUSATZ = re.compile(r'\s+(ex|EX|V|VSTAR|VMAX|GX|V-UNION)$')


def grundname(name):
    n = str(name or '').strip()
    while True:
        m = ZUSATZ.search(n)
        if not m:
            return n
        n = n[:m.start()]


def druck_gruppen():
    """(SET-NUM) -> kanonischer Schluessel (kleinster Druck der Gruppe)."""
    gruppe = {}
    with open(os.path.join(DATA, 'all_cards_database.csv'), encoding='utf-8-sig') as f:
        for r in csv.DictReader(f):
            eigen = f"{r['set'].upper()}-{r['number'].upper()}"
            ids = {eigen}
            for p in (r.get('international_prints') or '').split(','):
                p = p.strip().upper()
                if p:
                    ids.add(p)
            kan = min(ids)
            for i in ids:
                # Vereinigung: bereits zugeordnete Gruppen zusammenziehen
                alt = gruppe.get(i)
                if alt and alt < kan:
                    kan = alt
            for i in ids:
                gruppe[i] = kan
    return gruppe


def passt(g, archetyp):
    """Steht der Kartenname (oder sein hinterer Teil aus ganzen Woertern,
    z. B. "Palkia" aus "Origin Forme Palkia") vorne im Archetypnamen?
    -> (Treffer, ganzer Name?) oder None."""
    woerter = str(g or '').split(' ')
    for i in range(len(woerter)):
        teil = ' '.join(woerter[i:])
        if teil and (archetyp == teil or archetyp.startswith(teil + ' ')):
            return teil, 1 if i == 0 else 0
    return None


def bereinigt(name):
    # wie sanitizePastMetaArchetypeName in js/app-past-meta.js
    n = re.sub(r'\s*\d+[.,]\d+\$\d+[.,]\d+€\s*$', '', str(name or '').strip())
    n = re.sub(r'\s*\d+[.,]\d+€\s*$', '', n)
    return n.strip()


def kennung(ident):
    teile = str(ident or '').strip().split(' ')
    if len(teile) < 2:
        return None
    return f"{teile[0].upper()}-{teile[-1].upper()}"


def praefix_kopf(name, alle):
    best = None
    for m in alle:
        if m != name and name.startswith(m + ' ') and (best is None or len(m) > len(best)):
            best = m
    return best or name


def main():
    zeige = []
    if '--zeige' in sys.argv:
        zeige = sys.argv[sys.argv.index('--zeige') + 1].split(',')
    gruppe = druck_gruppen()
    # archetyp -> kennung -> {name, listen}
    karten = defaultdict(lambda: defaultdict(lambda: {'name': '', 'listen': 0}))
    for datei in sorted(glob.glob(os.path.join(DATA, 'tournament_cards_data_cards_*.csv'))):
        with open(datei, encoding='utf-8-sig') as f:
            for r in csv.DictReader(f, delimiter=';'):
                if str(r.get('meta', '')).lower() == 'expanded':
                    continue
                if r.get('type') not in POKEMON:
                    continue
                a = bereinigt(r.get('archetype'))
                k = kennung(r.get('card_identifier'))
                if not a or not k:
                    continue
                kan = gruppe.get(k, k)
                e = karten[a][kan]
                e['name'] = r.get('card_name') or e['name']
                try:
                    e['listen'] += int(r.get('deck_inclusion_count') or 0)
                except ValueError:
                    pass
    namen = sorted(karten)
    haupt = {}
    for a in namen:
        best = None
        for kan, e in karten[a].items():
            t = passt(grundname(e['name']), a)
            if not t:
                continue
            g, voll = t
            wert = (len(g), voll, e['listen'])
            if best is None or wert > best[0]:
                best = (wert, kan, g)
        haupt[a] = (best[1], best[2]) if best else None
    mit = sum(1 for a in namen if haupt[a])
    print(f"Archetypen: {len(namen)} · mit Hauptkarte: {mit} · ohne: {len(namen) - mit}")

    alt = defaultdict(list)
    for a in namen:
        alt[praefix_kopf(a, namen)].append(a)
    neu = defaultdict(list)
    for a in namen:
        if haupt[a]:
            neu[haupt[a]].append(a)
    alt_f = {k: v for k, v in alt.items() if len(v) > 1}
    neu_f = {k: v for k, v in neu.items() if len(v) > 1}
    print(f"Familien alt (Praefix): {len(alt_f)} · neu (Hauptkarte): {len(neu_f)}")
    alt_sets = {frozenset(v) for v in alt_f.values()}
    neu_sets = {frozenset(v) for v in neu_f.values()}
    nur_neu = [s for s in neu_sets if s not in alt_sets]
    nur_alt = [s for s in alt_sets if s not in neu_sets]
    print(f"gleich: {len(alt_sets & neu_sets)} · nur neu: {len(nur_neu)} · nur alt: {len(nur_alt)}")
    for (kan, g), v in sorted(neu_f.items(), key=lambda x: x[0][1]):
        if frozenset(v) not in alt_sets:
            print(f"  NEU  {g} [{kan}]: {', '.join(sorted(v))}")
    for k, v in sorted(alt_f.items()):
        if frozenset(v) not in neu_sets:
            print(f"  ALT  {k}: {', '.join(sorted(v))}")
    namen_je = defaultdict(set)
    for (kan, g) in neu_f:
        namen_je[g].add(kan)
    for g, s in sorted(namen_je.items()):
        if len(s) > 1:
            print(f"  ZWEI Familien mit gleichem Namen {g}: {sorted(s)}")
    for z in zeige:
        for a in namen:
            if a.startswith(z):
                print(f"  {a}: {haupt[a]}")
    ohne = [a for a in namen if not haupt[a]]
    print("ohne Hauptkarte (erste 25):", ', '.join(ohne[:25]))


if __name__ == '__main__':
    main()
