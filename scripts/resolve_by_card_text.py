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

It abstains far more often than it decides, on purpose. Over the 1294
unverified cards it decides 448 and abstains on 846:

  216  correction            evidence says our id is wrong
  232  already-correct       evidence confirms our id
  301  reprint-collision     the card text is not unique in its set, so
                             it cannot identify a print at all
  193  ambiguous             several candidates match the same text
  164  no-card-text
  108  no-candidate-matches
   70  held-chain-incomplete  a transposition only half decided
   10  no-candidates

Writes data/card_text_resolution.csv — every card with its reason, not
just the decided ones, because the abstentions are the worklist for the
live verifier.

It applies NOTHING. cardmarket_id_mapping.csv is rebuilt from scratch on
every scrape, so editing it would erase itself within a day; corrections
have to travel through a layer in cardmarket_id_mapper.py instead. See
--apply, which exists only to refuse and explain.
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
          'card_text', 'candidates', 'applied']


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
    """Every bracketed token of a product name, not just the first.

    507 products are named "Unown [Z] [Shuffle | Hidden Power]" or
    "Nidoran [M] [Horn Hazard]": the first bracket is a variant tag, not
    an attack. Reading only that one made 26 corrections hinge on the
    single token 'z' — the right answer by accident. Reading only the
    last one throws the tag away, and then every Unown in a set looks
    identical. Both brackets together are exactly the distinguishing
    information, so all of them go in."""
    brackets = re.findall(r'\[(.*?)\]', product_name or '')
    return words(' '.join(brackets).replace('|', ' ')) if brackets else []


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


MIN_TOKENS = 2


def resolve(card_text, candidates):
    """(product, reason) — product is None whenever the evidence is not
    decisive. `candidates` are products of the right species/expansion.

    Set EQUALITY, not containment. Containment lets a product whose
    attacks are a strict subset of ours win: a card with attacks A+B and
    a sibling product listing only B would resolve "uniquely" to the
    sibling. Equality is also the more decisive rule in practice —
    measured over the 1294 unverified cards it yields 286 corrections
    against containment's 260, because a loose predicate mostly produces
    extra ties, and a tie is an abstention.

    A single token is never enough (MIN_TOKENS): one shared word is a
    coincidence, not a fingerprint."""
    ct = set(words(card_text))
    if not ct:
        return None, 'no-card-text'
    hits = [p for p in candidates
            if len(attacks_of(p.get('name'))) >= MIN_TOKENS
            and set(attacks_of(p.get('name'))) == ct]
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

    # A card text that appears on more than one number of the same set
    # cannot identify a print. 1751 sets have such collisions — UNM 96
    # and 129 are both Murkrow "Peck", SP 139/155/159/163/215 all read
    # "Union Gain". resolve() cannot see them: each number finds its own
    # single hit and both look decisive.
    text_uses = defaultdict(Counter)
    for k, v in card_text.items():
        set_code, _, _num = k.partition('|')
        text_uses[set_code][' '.join(words(v))] += 1

    prices = load_rows(os.path.join(DATA, 'price_data.csv'))
    rows, stats = [], Counter()

    def note(key, pr, reason, cur_id=''):
        """Undecided cards belong on disk too — that list is the worklist
        for the live verifier, and 'report, don't repair' means reporting
        the cards we could NOT decide as much as the ones we could."""
        rows.append({
            'set': key[0], 'number': key[1], 'name': pr.get('name', ''),
            'eur_price': pr.get('eur_price', ''), 'status': reason,
            'current_product_id': cur_id,
            'current_product_name': (prods.get(int(cur_id or 0)) or {}).get('name', ''),
            'resolved_product_id': '', 'resolved_product_name': '',
            'card_text': card_text.get(key[0] + '|' + key[1], ''), 'candidates': '',
            'applied': 'no',
        })

    for pr in prices:
        key = (pr['set'].strip().upper(), pr['number'].strip())
        status = (pr.get('mapping_status') or '').strip()
        if not args.all and status != 'unverified':
            continue
        cur = by_key.get(key)
        if not cur:
            stats['no-mapping-row'] += 1
            continue
        cur_id = str(cur['cardmarket_product_id']).strip()
        ct = card_text.get(key[0] + '|' + key[1], '')
        if ct and text_uses[key[0]][' '.join(words(ct))] > 1:
            stats['reprint-collision'] += 1
            note(key, pr, 'reprint-collision', cur_id)
            continue
        species = flat(pr.get('name'))
        cands = []
        for exp in our_exp.get(key[0], ()):
            cands.extend(by_exp_species.get((exp, species), []))
        if not cands:
            stats['no-candidates'] += 1
            note(key, pr, 'no-candidates', cur_id)
            continue

        hit, reason = resolve(ct, cands)
        if hit is None:
            stats[reason] += 1
            note(key, pr, reason.split('(')[0], cur_id)
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
            'card_text': ct, 'candidates': len(cands), 'applied': 'no',
        })

    corr = [r for r in rows if r['status'] == 'correction']
    print('outcome per card:')
    for k in sorted(stats):
        print(f'   {k:22s} {stats[k]:5d}')

    # A transposition is a permutation: A takes B's id and B takes A's.
    # Applying one half of it is not "half fixed" — it is a different
    # wrong mapping, plus two cards claiming one product. So the unit of
    # application is the connected component of the id-permutation graph,
    # not the row: a component ships only if every card in it that has to
    # move actually has a decision.
    current_all = {(r['set'].strip().upper(), r['number'].strip()):
                   str(r['cardmarket_product_id']).strip() for r in mapping}
    holder = defaultdict(list)
    for k, pid in current_all.items():
        holder[pid].append(k)
    moving = {(r['set'], r['number']): r['resolved_product_id'] for r in corr}

    adj = defaultdict(set)
    for k, target in moving.items():
        for other in holder.get(target, ()):
            if other != k:
                adj[k].add(other)
                adj[other].add(k)

    seen, components = set(), []
    for start in list(moving):
        if start in seen:
            continue
        comp, stack = set(), [start]
        while stack:
            node = stack.pop()
            if node in comp:
                continue
            comp.add(node)
            stack.extend(adj.get(node, ()))
        seen |= comp
        components.append(comp)

    ok_keys, held_keys = set(), set()
    for comp in components:
        # Every card in the component whose id someone else wants must
        # itself be moving; otherwise the chain is only half decided.
        wanted = {moving[k] for k in comp if k in moving}
        blocked = any(current_all.get(k) in wanted and k not in moving for k in comp)
        (held_keys if blocked else ok_keys).update(k for k in comp if k in moving)

    for r in corr:
        if (r['set'], r['number']) in held_keys:
            r['status'] = 'held-chain-incomplete'
    ready = [r for r in corr if (r['set'], r['number']) in ok_keys]
    ready.sort(key=lambda r: -money(r['eur_price']))
    held = [r for r in corr if (r['set'], r['number']) in held_keys]

    over = lambda lim: sum(1 for r in ready if money(r['eur_price']) > lim)  # noqa: E731
    print(f'\ncorrections found: {len(corr)} — ready to apply: {len(ready)}, '
          f'held (chain incomplete): {len(held)}')
    print(f'of the ready ones — above 1 EUR: {over(1)}, above 5 EUR: {over(5)}, '
          f'above 20 EUR: {over(20)}')
    for r in ready[:12]:
        print(f'   {r["set"]:5s} {r["number"]:>5s} {money(r["eur_price"]):8.2f} EUR  '
              f'{r["name"][:18]:18s} {r["current_product_id"]} -> {r["resolved_product_id"]}')
    if held:
        print('\nheld back — one half of a shifted run could not be decided:')
        for r in held[:6]:
            others = [k for k in holder.get(r['resolved_product_id'], ())
                      if k != (r['set'], r['number'])]
            print(f'   {r["set"]} {r["number"]} -> {r["resolved_product_id"]} '
                  f'(held by {", ".join(f"{a} {b}" for a, b in others[:2]) or "nobody"})')

    # Written AFTER the hold-back, so the file records what would actually
    # happen rather than what was proposed before the chain check.
    rows.sort(key=lambda r: (r['status'], -money(r['eur_price']), r['set'], r['number']))
    with open(OUT, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)
    print(f'\nwrote {os.path.relpath(OUT, ROOT)} ({len(rows)} rows)')

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
