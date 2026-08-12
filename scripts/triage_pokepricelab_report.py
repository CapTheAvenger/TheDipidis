#!/usr/bin/env python3
"""Turn the pokepricelab cross-check into an actionable worklist.

The raw report says 384 of 760 checked cards "disagree". Acting on that
number would be wrong twice over: a large part of it is not a mapping
error at all, and part of it is a bug in OUR index rather than evidence
about anything.

This splits the contradictions into four classes, each with its own
consequence, and decides the important one with a THIRD source we
already own: our card text. Cardmarket encodes a card's attacks in the
product name — "Hisuian Overqwil [Dirty Press | Pierce]" — and
data/pokemon_card_text.json holds the attacks of our (set, number).
Where those two agree, identity is settled without trusting either
mapping.

    wrong-product   our mapping sits on a sibling; the card text matches
                    pokepricelab's product and not ours. Actionable.
    duplicate       both ids name the same card in the same expansion —
                    Cardmarket simply has two products. Not an identity
                    error; decide by which one carries the prices.
    bad-index       our catalog URL points at a different card entirely
                    (BS 52 -> base-set-2-marowak-52, FLI -> a JP set).
                    Step 1 picked the wrong set slug. The verdict says
                    nothing about the mapping; fix the index instead.
    undecided       attacks differ but the card text settles neither.
                    Human.

Writes data/pokepricelab_worklist.csv. Changes no mapping, as ever.
"""

import argparse
import csv
import json
import os
import re
import sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
REPORT = os.path.join(DATA, 'pokepricelab_verification.csv')
OUT = os.path.join(DATA, 'pokepricelab_worklist.csv')

FIELDS = ['klasse', 'set', 'number', 'name', 'eur_price', 'our_product_id',
          'our_product_name', 'ppl_product_id', 'ppl_product_name',
          'card_text', 'url']


def money(s):
    """'1.234,56€' -> 1234.56. The € suffix is why a plain float() call
    silently reads every price as 0 — the same trap as parseFloat on the
    comma CSVs."""
    s = re.sub(r'[^\d,.\-]', '', str(s or ''))
    if not s:
        return 0.0
    try:
        if ',' in s:
            return float(s.replace('.', '').replace(',', '.'))
        return float(s)
    except ValueError:
        return 0.0


def norm(s):
    return re.sub(r'[^a-z0-9]+', ' ', str(s or '').lower()).strip()


def attacks_of(product_name):
    """The bracketed attack list of a Cardmarket product name, normalised."""
    m = re.search(r'\[(.*?)\]', product_name or '')
    return norm(m.group(1).replace('|', ' ')) if m else ''


def species_of(product_name):
    """Leading species/trainer name, before any bracket or parenthesis."""
    return norm(re.split(r'[\[\(]', product_name or '')[0])


def load(path, **kw):
    with open(path, encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f, **kw))


def classify(row, prods, card_text, our_cards):
    a = prods.get(int(row['our_product_id'] or 0))
    b = prods.get(int(row['ppl_product_id'] or 0))
    if not a or not b:
        return 'undecided', a, b

    ours = our_cards.get((row['set'], row['number']), {})
    our_name = norm(ours.get('name'))

    if a.get('idExpansion') != b.get('idExpansion'):
        # Different expansion is only meaningful if both still name OUR
        # card. When pokepricelab's page is about a different Pokémon,
        # the URL we picked in step 1 is simply wrong.
        sa, sb = species_of(a.get('name')), species_of(b.get('name'))
        b_is_ours = bool(sb) and bool(our_name) and sb.split()[0] in our_name
        if not b_is_ours:
            return 'bad-index', a, b
        return 'undecided', a, b

    if a.get('name') == b.get('name'):
        return 'duplicate', a, b

    ct = norm(card_text.get(row['set'] + '|' + row['number']))
    if not ct:
        return 'undecided', a, b
    aa, ab = attacks_of(a.get('name')), attacks_of(b.get('name'))
    a_fits = bool(aa) and all(w in ct for w in aa.split())
    b_fits = bool(ab) and all(w in ct for w in ab.split())
    if b_fits and not a_fits:
        return 'wrong-product', a, b
    if a_fits and not b_fits:
        return 'ppl-wrong', a, b
    return 'undecided', a, b


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--min-price', type=float, default=0.0,
                    help='only list wrong-product rows above this price')
    args = ap.parse_args()

    if not os.path.exists(REPORT):
        print(f'{os.path.relpath(REPORT, ROOT)} not found — run the verify job first.')
        return 1

    with open(os.path.join(DATA, 'products_singles_6.json'), encoding='utf-8') as f:
        prods = {p['idProduct']: p for p in json.load(f)['products']}
    with open(os.path.join(DATA, 'pokemon_card_text.json'), encoding='utf-8') as f:
        card_text = json.load(f)
    our_cards = {(r['set'].strip().upper(), r['number'].strip()): r
                 for r in load(os.path.join(DATA, 'price_data.csv'))}

    report = load(REPORT)
    counts = Counter(r['verdict'] for r in report)
    rows, klassen = [], Counter()
    for r in report:
        if r['verdict'] != 'disagree':
            continue
        klasse, a, b = classify(r, prods, card_text, our_cards)
        klassen[klasse] += 1
        ours = our_cards.get((r['set'], r['number']), {})
        rows.append({
            'klasse': klasse, 'set': r['set'], 'number': r['number'],
            'name': ours.get('name', ''), 'eur_price': ours.get('eur_price', ''),
            'our_product_id': r['our_product_id'],
            'our_product_name': (a or {}).get('name', ''),
            'ppl_product_id': r['ppl_product_id'],
            'ppl_product_name': (b or {}).get('name', ''),
            'card_text': card_text.get(r['set'] + '|' + r['number'], ''),
            'url': r['url'],
        })

    print(f'report: {len(report)} cards checked — ' +
          ' '.join(f'{k}={v}' for k, v in sorted(counts.items())))
    print('\ncontradictions by class:')
    for k in sorted(klassen):
        print(f'   {k:14s} {klassen[k]:5d}')

    wrong = [r for r in rows if r['klasse'] == 'wrong-product']
    wrong.sort(key=lambda r: -money(r['eur_price']))
    over = lambda lim: sum(1 for r in wrong if money(r['eur_price']) > lim)  # noqa: E731
    print(f'\nwrong-product: {len(wrong)} cards — above 1 EUR: {over(1)}, '
          f'above 5 EUR: {over(5)}, above 20 EUR: {over(20)}')
    for r in wrong[:12]:
        print(f'   {r["set"]:5s} {r["number"]:>5s} {money(r["eur_price"]):8.2f} EUR  '
              f'{r["name"][:22]:22s} ours={r["our_product_id"]} ppl={r["ppl_product_id"]}')

    bad = [r for r in rows if r['klasse'] == 'bad-index']
    if bad:
        print(f'\nbad-index: {len(bad)} rows — these say nothing about the mapping.')
        print('Step 1 matched a URL of a DIFFERENT set. Examples:')
        for r in bad[:4]:
            print(f'   {r["set"]} {r["number"]} ({r["name"]}) -> {r["url"]}')
        print('Fix build_pokepricelab_index.py, then re-run; do not act on these.')

    if args.min_price:
        rows = [r for r in rows
                if r['klasse'] != 'wrong-product'
                or money(r['eur_price']) > args.min_price]
    rows.sort(key=lambda r: (r['klasse'], -money(r['eur_price']), r['set'], r['number']))
    with open(OUT, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)
    print(f'\nwrote {os.path.relpath(OUT, ROOT)} ({len(rows)} rows) — nothing was repaired')
    return 0


if __name__ == '__main__':
    sys.exit(main())
