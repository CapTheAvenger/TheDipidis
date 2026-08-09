#!/usr/bin/env python3
"""Pin a Cardmarket product from what a HUMAN sees on the product page.

Why this exists
---------------
The manual override file wants an idProduct — but Cardmarket does not show
that number anywhere a user can read it: not in the URL
(`…/Ns-Darmanitan-V1-SVP181`), not on the page. Asking the maintainer for
it was a dead end.

What the page DOES show is the price block:

    Price Trend            16,11 €
    30-days average price  15,68 €
    7-days average price   18,42 €

Those numbers identify the product just as well, because our copy of the
same numbers sits in data/price_guide_6.json for every candidate. This
script takes the observed values, matches them against the candidates that
share expansion + name with our current mapping, and writes the winner to
data/cardmarket_mapping_manual.csv — the pin that overrides everything.

It refuses rather than guesses:
  * more than one candidate fits          -> nothing written, both shown
  * the best fit is not clearly better    -> nothing written
  * no candidate fits the observation     -> nothing written (that means
    our candidate pool is wrong, which is a different bug and must not be
    papered over with a pin)

Usage
-----
    python scripts/pin_from_observation.py --set SVP --number 181 \
        --trend 16,11 --avg30 15,68 [--avg7 18,42]

The guide snapshot in the repo can be a few days old (the daily refresh
downloads it without committing), so the tolerance is deliberately loose
on trend and tight on avg30 — the 30-day mean barely moves.
"""

import argparse
import csv
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
MANUAL = os.path.join(DATA, 'cardmarket_mapping_manual.csv')
MANUAL_FIELDS = ['set', 'number', 'cardmarket_product_id', 'source', 'note']

# A candidate must be within this factor on every metric the user gave.
TOL = {'trend': 1.35, 'avg30': 1.20, 'avg7': 1.35}
# ... and the runner-up must be at least this much worse than the winner.
MIN_SEPARATION = 1.8


def parse_eur(text):
    """'16,11 €', '16.11', '1.234,56 €' -> float."""
    s = re.sub(r'[^\d.,]', '', str(text or '')).strip()
    if not s:
        return None
    if ',' in s and '.' in s:
        s = s.replace('.', '').replace(',', '.') if s.rfind(',') > s.rfind('.') \
            else s.replace(',', '')
    elif ',' in s:
        s = s.replace(',', '.')
    try:
        v = float(s)
        return v if v > 0 else None
    except ValueError:
        return None


def base_name(name):
    return re.sub(r'\s*[\[(].*$', '', str(name or '')).strip().lower()


def load_candidates(set_code, number):
    """Products sharing expansion + base name with our current mapping."""
    with open(os.path.join(DATA, 'cardmarket_id_mapping.csv'),
              encoding='utf-8-sig', newline='') as f:
        row = next((r for r in csv.DictReader(f)
                    if r['set'].upper() == set_code and r['number'] == number), None)
    if not row:
        return None, [], None
    current = int(row['cardmarket_product_id'])
    with open(os.path.join(DATA, 'products_singles_6.json'), encoding='utf-8') as f:
        singles = json.load(f)['products']
    with open(os.path.join(DATA, 'price_guide_6.json'), encoding='utf-8') as f:
        guide_meta = json.load(f)
    guide = {g['idProduct']: g for g in guide_meta['priceGuides']}
    me = next((p for p in singles if p['idProduct'] == current), None)
    if not me:
        return current, [], guide_meta.get('createdAt')
    key = (me['idExpansion'], base_name(me['name']))
    cands = [p for p in singles
             if (p['idExpansion'], base_name(p['name'])) == key]
    return current, [(p['idProduct'], guide.get(p['idProduct']) or {}) for p in cands], \
        guide_meta.get('createdAt')


def score(observed, entry):
    """Worst per-metric ratio, or None when a metric is out of tolerance."""
    worst = 1.0
    for metric, obs in observed.items():
        val = entry.get(metric)
        if not val or val <= 0:
            return None
        ratio = max(val / obs, obs / val)
        if ratio > TOL[metric]:
            return None
        worst = max(worst, ratio)
    return worst


def write_pin(set_code, number, pid, note):
    rows = []
    if os.path.isfile(MANUAL):
        with open(MANUAL, encoding='utf-8-sig', newline='') as f:
            rows = [r for r in csv.DictReader(f)
                    if not (r.get('set', '').upper() == set_code
                            and r.get('number', '') == number)]
    rows.append({'set': set_code, 'number': number,
                 'cardmarket_product_id': str(pid),
                 'source': 'maintainer-observation', 'note': note})
    rows.sort(key=lambda r: (r['set'], r['number']))
    with open(MANUAL, 'w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=MANUAL_FIELDS)
        w.writeheader()
        w.writerows(rows)


def main():
    ap = argparse.ArgumentParser(
        description='Resolve a Cardmarket product from observed page prices and pin it.')
    ap.add_argument('--set', dest='set_code', required=True)
    ap.add_argument('--number', required=True)
    ap.add_argument('--trend', help='"Price Trend" from the product page')
    ap.add_argument('--avg30', help='"30-days average price"')
    ap.add_argument('--avg7', help='"7-days average price"')
    ap.add_argument('--dry-run', action='store_true', help='decide, write nothing')
    args = ap.parse_args()

    observed = {}
    for metric in ('trend', 'avg30', 'avg7'):
        v = parse_eur(getattr(args, metric))
        if v is not None:
            observed[metric] = v
    if not observed:
        print('Give at least one of --trend / --avg30 / --avg7 '
              '(they are printed on the Cardmarket product page).')
        return 2

    set_code = args.set_code.strip().upper()
    number = args.number.strip()
    current, cands, guide_date = load_candidates(set_code, number)
    if current is None:
        print(f'{set_code} {number} is not in cardmarket_id_mapping.csv.')
        return 2
    if not cands:
        print(f'{set_code} {number}: no candidate pool (product {current} unknown '
              f'in products_singles_6.json).')
        return 2

    print(f'Observed: ' + ', '.join(f'{k}={v}' for k, v in observed.items()))
    print(f'Guide snapshot: {guide_date} | candidates: {len(cands)} | '
          f'currently mapped: {current}')
    scored = []
    for pid, entry in cands:
        s = score(observed, entry)
        shown = ' '.join(f'{m}={entry.get(m)}' for m in ('trend', 'avg30', 'avg7'))
        print(f'  {pid}: {shown}  -> ' + (f'fits (worst ratio {s:.2f})' if s else 'no fit'))
        if s:
            scored.append((s, pid))

    if not scored:
        print('\nNo candidate matches what you saw. That means the candidate pool '
              'itself is wrong — do NOT pin; report it instead.')
        return 1
    scored.sort()
    if len(scored) > 1 and scored[1][0] / scored[0][0] < MIN_SEPARATION:
        print(f'\nAmbiguous: {scored[0][1]} and {scored[1][1]} both fit closely. '
              f'Add another metric (--avg7 / --avg30) and run again.')
        return 1

    winner = scored[0][1]
    note = 'observed ' + ', '.join(f'{k}={v}' for k, v in observed.items())
    print(f'\n=> {set_code} {number} is product {winner}'
          + ('' if winner == current else f'  (CORRECTS the current mapping {current})'))
    if args.dry_run:
        print('(dry run — nothing written)')
        return 0
    write_pin(set_code, number, winner, note)
    print(f'Pinned in {os.path.relpath(MANUAL, ROOT)}. '
          f'It takes effect on the next mapping build and overrides everything else.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
