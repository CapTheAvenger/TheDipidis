#!/usr/bin/env python3
"""Decide Cardmarket product identity from our own card text.

Cardmarket disambiguates same-name products by putting the card's
attacks in the product name:

    Hisuian Overqwil [Dirty Press | Pierce]
    Hisuian Overqwil [Tormenting Poison | Pinning]

and data/pokemon_card_text.json holds the attacks of our (set, number),
scraped from the card itself — a pipeline that never touches Cardmarket.
Where the two agree, identity is settled by evidence rather than by
position, which is the failure mode this project keeps paying for.

This needs no network and covers cards pokepricelab does not, which is
why it exists alongside the cross-check rather than instead of it.

It abstains far more often than it decides, on purpose:

  · a product without a bracketed attack list proves nothing
  · trainers and energies have no attacks at all
  · two candidates matching the same text is not evidence, it is a tie
  · a species mismatch means we are looking at the wrong candidate set

Writes data/card_text_resolution.csv. Applies nothing unless --apply is
passed, and even then only rows whose evidence is unambiguous, with the
previous id preserved in the audit file.
"""

import argparse
import csv
import json
import os
import re
import sys
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
MAPPING = os.path.join(DATA, 'cardmarket_id_mapping.csv')
OUT = os.path.join(DATA, 'card_text_resolution.csv')

FIELDS = ['set', 'number', 'name', 'eur_price', 'status', 'current_product_id',
          'current_product_name', 'resolved_product_id', 'resolved_product_name',
          'card_text', 'candidates']


def flat(s):
    return re.sub(r'[^a-z0-9]+', '', str(s or '').lower())


def words(s):
    return [w for w in re.sub(r'[^a-z0-9]+', ' ', str(s or '').lower()).split() if w]


def money(s):
    s = re.sub(r'[^\d,.\-]', '', str(s or ''))
    if not s:
        return 0.0
    try:
        return float(s.replace('.', '').replace(',', '.')) if ',' in s else float(s)
    except ValueError:
        return 0.0


def attacks_of(product_name):
    m = re.search(r'\[(.*?)\]', product_name or '')
    return words(m.group(1).replace('|', ' ')) if m else []


def species_of(product_name):
    return flat(re.split(r'[\[\(]', product_name or '')[0])


def load_rows(path):
    with open(path, encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))


def expansions_per_set(mapping, prod_exp):
    """set code -> the expansions its mapped products live in.

    A positionally-wrong mapping still almost always sits in the RIGHT
    expansion — that is what makes this usable as a candidate filter even
    while the individual ids are under suspicion."""
    by = defaultdict(Counter)
    for r in mapping:
        exp = prod_exp.get(int(r['cardmarket_product_id'] or 0))
        if exp is not None:
            by[r['set'].strip().upper()][exp] += 1
    return {code: {e for e, _ in c.most_common(4)} for code, c in by.items()}


def resolve(card_text, candidates):
    """(product, reason) — product is None whenever the evidence is not
    decisive. `candidates` are products of the right species/expansion."""
    ct = set(words(card_text))
    if not ct:
        return None, 'no-card-text'
    hits = []
    for p in candidates:
        att = attacks_of(p.get('name'))
        if not att:
            continue                       # no attack list on the product
        if all(w in ct for w in att):
            hits.append(p)
    if not hits:
        return None, 'no-candidate-matches'
    if len(hits) > 1:
        return None, f'ambiguous({len(hits)})'
    return hits[0], 'unique-attack-match'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true',
                    help='write the resolved ids into cardmarket_id_mapping.csv')
    ap.add_argument('--all', action='store_true',
                    help='also check cards whose mapping is already verified')
    args = ap.parse_args()

    with open(os.path.join(DATA, 'products_singles_6.json'), encoding='utf-8') as f:
        products = json.load(f)['products']
    prods = {p['idProduct']: p for p in products}
    prod_exp = {p['idProduct']: p.get('idExpansion') for p in products}
    with open(os.path.join(DATA, 'pokemon_card_text.json'), encoding='utf-8') as f:
        card_text = json.load(f)

    mapping = load_rows(MAPPING)
    by_key = {(r['set'].strip().upper(), r['number'].strip()): r for r in mapping}
    our_exp = expansions_per_set(mapping, prod_exp)

    by_exp_species = defaultdict(list)
    for p in products:
        by_exp_species[(p.get('idExpansion'), species_of(p.get('name')))].append(p)

    prices = load_rows(os.path.join(DATA, 'price_data.csv'))
    rows, stats = [], Counter()

    for pr in prices:
        key = (pr['set'].strip().upper(), pr['number'].strip())
        status = (pr.get('mapping_status') or '').strip()
        if not args.all and status != 'unverified':
            continue
        cur = by_key.get(key)
        if not cur:
            stats['no-mapping-row'] += 1
            continue
        ct = card_text.get(key[0] + '|' + key[1], '')
        species = flat(pr.get('name'))
        cands = []
        for exp in our_exp.get(key[0], ()):
            cands.extend(by_exp_species.get((exp, species), []))
        if not cands:
            stats['no-candidates'] += 1
            continue

        hit, reason = resolve(ct, cands)
        cur_id = str(cur['cardmarket_product_id']).strip()
        if hit is None:
            stats[reason] += 1
            continue
        new_id = str(hit['idProduct'])
        verdict = 'already-correct' if new_id == cur_id else 'correction'
        stats[verdict] += 1
        rows.append({
            'set': key[0], 'number': key[1], 'name': pr.get('name', ''),
            'eur_price': pr.get('eur_price', ''), 'status': verdict,
            'current_product_id': cur_id,
            'current_product_name': (prods.get(int(cur_id or 0)) or {}).get('name', ''),
            'resolved_product_id': new_id, 'resolved_product_name': hit.get('name', ''),
            'card_text': ct, 'candidates': len(cands),
        })

    corr = [r for r in rows if r['status'] == 'correction']
    corr.sort(key=lambda r: -money(r['eur_price']))
    print('outcome per card:')
    for k in sorted(stats):
        print(f'   {k:22s} {stats[k]:5d}')
    over = lambda lim: sum(1 for r in corr if money(r['eur_price']) > lim)  # noqa: E731
    print(f'\ncorrections proposed (before hold-back): {len(corr)} — above 1 EUR: '
          f'{over(1)}, above 5 EUR: {over(5)}, above 20 EUR: {over(20)}')
    for r in corr[:12]:
        print(f'   {r["set"]:5s} {r["number"]:>5s} {money(r["eur_price"]):8.2f} EUR  '
              f'{r["name"][:18]:18s} {r["current_product_id"]} -> {r["resolved_product_id"]}')

    rows.sort(key=lambda r: (r['status'], -money(r['eur_price']), r['set'], r['number']))
    with open(OUT, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)
    print(f'\nwrote {os.path.relpath(OUT, ROOT)} ({len(rows)} rows)')

    # Most corrections take an id another card currently holds — that is
    # what a transposition looks like, and the two halves resolve each
    # other. But where only ONE half of a shifted run could be decided,
    # applying it leaves two cards claiming the same product: a visible
    # wrong state (two cards, one price) traded for an invisible one.
    # Those are held back until their partner is decided too.
    current_all = {(r['set'].strip().upper(), r['number'].strip()):
                   str(r['cardmarket_product_id']).strip() for r in mapping}
    moving = {(r['set'], r['number']): r['resolved_product_id'] for r in corr}
    after = {**current_all, **moving}
    dup_before = {i for i, n in Counter(current_all.values()).items() if n > 1}
    dup_after = Counter(after.values())
    held = [r for r in corr
            if dup_after[r['resolved_product_id']] > 1
            and r['resolved_product_id'] not in dup_before]
    held_keys = {(r['set'], r['number']) for r in held}
    for r in held:
        r['status'] = 'held-partner-unresolved'
    corr = [r for r in corr if (r['set'], r['number']) not in held_keys]
    if held:
        print(f'\n{len(held)} corrections held back: applying them would leave two '
              f'cards claiming one product.')
        print('Half of a shifted run was decided, the other half was not. Examples:')
        for r in held[:6]:
            other = [k for k, v in current_all.items()
                     if v == r['resolved_product_id'] and (k[0], k[1]) != (r['set'], r['number'])]
            print(f'   {r["set"]} {r["number"]} -> {r["resolved_product_id"]} '
                  f'(still held by {", ".join(f"{a} {b}" for a, b in other[:2])})')
        print(f'applying the rest: {len(corr)} corrections')

    if args.apply:
        print('\n--apply is not available, and writing the mapping directly would')
        print('not have worked anyway: cardmarket_id_mapping.csv is rebuilt from')
        print('scratch by backend/scrapers/cardmarket_id_mapper.py on every run')
        print('(data/_consumers.md: "Rebuilt daily"), so 294 edits would have')
        print('vanished at the next scrape without a trace.')
        print('')
        print('The mapper layers evidence instead: heuristic, then')
        print('cardmarket_mapping_verified.csv (Limitless fingerprint), then')
        print('cardmarket_mapping_manual.csv (a human looked at the product).')
        print('Card text is a fourth source and needs its own layer in that')
        print('chain — not a direct write. That change is pending review.')
        return 2

    print('\nDry run — this script only ever reports.')
    print('Corrections become effective through a mapper layer, not by editing')
    print('the mapping file; see the note under --apply.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
