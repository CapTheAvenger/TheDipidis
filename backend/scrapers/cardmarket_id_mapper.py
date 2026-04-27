#!/usr/bin/env python3
"""
Cardmarket ID Mapper
====================
Builds a (set, number) -> idProduct mapping using Cardmarket's official JSON
exports (no Cardmarket page scraping required):

  data/products_singles.json     - all single-card products
  data/products_nonsingles.json  - boosters/displays (used to derive set name -> idExpansion)
  data/price_guide.json          - daily price snapshot (only used here for sanity-check coverage)

Output: data/cardmarket_id_mapping.csv with columns:
  set, number, cardmarket_product_id, match_method, base_name

Pipeline:
  1) Build set_code -> idExpansion via two strategies (booster name match → card-name overlap fallback)
  2) Within an expansion, match each (set, number) card to one idProduct by base name.
     Ambiguous cases (same Pokemon name, multiple variants) are paired by ordering:
       - our cards sorted by numeric card number
       - candidate idProducts sorted ascending
     This assumes Cardmarket assigns idProduct in card-number order, which holds for
     most modern sets. Misaligned mappings show up as price outliers in the merger.
  3) Cards with no expansion match or no name match are left out → daily merger keeps
     the existing Limitless-scraped value.
"""

import os
import sys
import csv
import json
import re
from collections import defaultdict, Counter

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'core'))
from card_scraper_shared import (
    setup_console_encoding, get_data_dir, setup_logging, atomic_write_file
)

setup_console_encoding()
logger = setup_logging("cardmarket_mapper")


def get_project_data_dir() -> str:
    """Top-level <project>/data/ where the user drops the Cardmarket JSONs and
    where the canonical all_cards_database.csv lives. Distinct from the
    scraper-internal backend/core/data/ used by get_data_dir()."""
    here = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(os.path.dirname(here))
    return os.path.join(project_root, 'data')

# Heuristic thresholds for the fallback set→expansion match
MIN_OVERLAP_PCT = 0.80  # ≥80% of our cards must appear in the candidate expansion
MIN_OVERLAP_ABS = 5     # AND at least 5 cards overlap (so 5/5 = 100% on tiny sets is OK)


def base_name(name: str) -> str:
    """Reduce a Cardmarket product name to a comparable base form.

    Strips:
    - attack-signature suffix: 'Sceptile [Leaf Blade]' -> 'Sceptile'
    - character-disambiguator suffix: \"Professor's Research - Professor Magnolia\" -> \"Professor's Research\"
    - whitespace around ♀/♂ symbols: 'Nidoran ♀' -> 'Nidoran♀'
    """
    n = re.split(r'\s*[\[(]', name, maxsplit=1)[0]
    n = re.split(r'\s+-\s+', n, maxsplit=1)[0]
    n = re.sub(r'\s+([♀♂])', r'\1', n)
    return n.strip()


def normalize_for_slug(s: str) -> str:
    """Normalize free text to a slug used for set-name lookup."""
    s = s.replace('&', '').replace("'", '').replace('.', '').replace(':', '')
    s = re.sub(r'\s+', '-', s.strip())
    s = re.sub(r'-+', '-', s)
    return s.lower()


def card_number_sort_key(number: str):
    """Numeric-aware sort: '5' < '10' < '100', and 'TG24' sorts after numeric block."""
    m = re.match(r'(\d+)([a-zA-Z]*)', str(number))
    if m:
        return (0, int(m.group(1)), m.group(2))
    return (1, 0, str(number))


def load_jsons(data_dir: str):
    paths = {
        'singles': os.path.join(data_dir, 'products_singles.json'),
        'nonsingles': os.path.join(data_dir, 'products_nonsingles.json'),
        'price_guide': os.path.join(data_dir, 'price_guide.json'),
    }
    for name, p in paths.items():
        if not os.path.isfile(p):
            logger.error("Missing JSON: %s", p)
            sys.exit(1)
    with open(paths['singles'], encoding='utf-8') as f:
        singles = json.load(f).get('products', [])
    with open(paths['nonsingles'], encoding='utf-8') as f:
        nonsingles = json.load(f).get('products', [])
    with open(paths['price_guide'], encoding='utf-8') as f:
        price_guide = json.load(f).get('priceGuides', [])
    return singles, nonsingles, price_guide


def load_cards_db(data_dir: str):
    path = os.path.join(data_dir, 'all_cards_database.csv')
    with open(path, encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))


def build_set_to_expansion(cards: list, singles: list, nonsingles: list):
    """Returns {set_code: idExpansion}, plus diagnostics dict."""
    # 1) extract one slug per set from our cardmarket_url field
    slug_counter = defaultdict(Counter)
    for c in cards:
        m = re.search(r'/Pokemon/Products/Singles/([^/]+)/', c.get('cardmarket_url', ''))
        if m:
            # Cardmarket URL slugs are dash-separated; normalize to our canonical form
            raw = m.group(1).replace('-', ' ')
            slug_counter[c['set']].update([normalize_for_slug(raw)])
    set_to_slug = {sc: ct.most_common(1)[0][0] for sc, ct in slug_counter.items()}

    # 2) booster-name → idExpansion from nonsingles
    slug_to_exp = {}
    for p in nonsingles:
        n = p.get('name', '')
        m = re.match(r'^(.+?) Booster(?:\s|$)', n)
        if m:
            slug_to_exp.setdefault(normalize_for_slug(m.group(1)), p['idExpansion'])

    # 3) primary mapping via slug match
    set_to_exp = {}
    method = {}
    unmapped_via_slug = []
    for sc, slug in set_to_slug.items():
        if slug in slug_to_exp:
            set_to_exp[sc] = slug_to_exp[slug]
            method[sc] = 'booster'
        else:
            unmapped_via_slug.append(sc)

    # 4) fallback: card-name overlap heuristic for promo/energy/special sets
    exp_names = defaultdict(set)
    for p in singles:
        exp_names[p['idExpansion']].add(base_name(p.get('name', '')))

    fallback_failed = []
    for sc in unmapped_via_slug:
        our_names = {(c.get('name_en') or c.get('name', '')).strip()
                     for c in cards if c['set'] == sc}
        our_names.discard('')
        if len(our_names) < 2:
            fallback_failed.append((sc, 'too few cards in DB'))
            continue
        scored = []
        for exp, names in exp_names.items():
            ovl = len(our_names & names)
            if ovl >= 2:
                scored.append((ovl, exp))
        if not scored:
            fallback_failed.append((sc, 'no candidates'))
            continue
        scored.sort(reverse=True)
        top_ovl, top_exp = scored[0]
        pct = top_ovl / len(our_names)
        if pct >= MIN_OVERLAP_PCT and top_ovl >= MIN_OVERLAP_ABS:
            # If a tie at the top exists with equal overlap, take the smaller expansion (more focused)
            tied = [(o, e) for o, e in scored if o == top_ovl]
            if len(tied) > 1:
                tied.sort(key=lambda t: (-t[0], len(exp_names[t[1]])))
                top_exp = tied[0][1]
            set_to_exp[sc] = top_exp
            method[sc] = f'overlap({pct:.0%})'
        else:
            fallback_failed.append((sc, f'overlap too low ({pct:.0%}, top={top_ovl})'))

    return set_to_exp, method, fallback_failed


def map_cards_to_products(cards: list, singles: list, set_to_exp: dict):
    """Returns list of mapping rows + stats."""
    # Index singles by (idExpansion, base_name)
    by_exp_name = defaultdict(list)  # (exp, base) -> [products...]
    for p in singles:
        by_exp_name[(p['idExpansion'], base_name(p.get('name', '')))].append(p)

    # Group our cards by (set, base_name) so we can disambiguate same-name groups
    our_groups = defaultdict(list)  # (set, base_name) -> [card_rows]
    for c in cards:
        name = (c.get('name_en') or c.get('name', '')).strip()
        if not name or not c.get('number'):
            continue
        our_groups[(c['set'], name)].append(c)

    mappings = []
    stats = Counter()
    for (sc, name), group in our_groups.items():
        if sc not in set_to_exp:
            stats['unmapped_set'] += len(group)
            continue
        exp = set_to_exp[sc]
        candidates = by_exp_name.get((exp, name), [])
        if not candidates:
            stats['no_name_match'] += len(group)
            continue

        if len(candidates) == 1 and len(group) == 1:
            c = group[0]
            mappings.append({
                'set': sc, 'number': c['number'],
                'cardmarket_product_id': candidates[0]['idProduct'],
                'match_method': 'unique', 'base_name': name,
            })
            stats['unique'] += 1
            continue

        # Ambiguous: pair sorted-by-number with sorted-by-idProduct
        group_sorted = sorted(group, key=lambda c: card_number_sort_key(c['number']))
        cand_sorted = sorted(candidates, key=lambda p: p['idProduct'])
        n = min(len(group_sorted), len(cand_sorted))
        for c, p in zip(group_sorted[:n], cand_sorted[:n]):
            mappings.append({
                'set': sc, 'number': c['number'],
                'cardmarket_product_id': p['idProduct'],
                'match_method': f'ordered({len(group)}↔{len(candidates)})',
                'base_name': name,
            })
            stats['ordered'] += 1
        # Leftovers (one side longer than the other)
        if len(group_sorted) > n:
            stats['ordered_skipped'] += len(group_sorted) - n

    return mappings, stats


def write_mapping(mappings: list, out_path: str):
    fieldnames = ['set', 'number', 'cardmarket_product_id', 'match_method', 'base_name']
    def _write(f):
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
        w.writeheader()
        for row in sorted(mappings, key=lambda r: (r['set'], card_number_sort_key(r['number']))):
            w.writerow(row)
    atomic_write_file(out_path, _write, encoding='utf-8-sig', newline='')


def main():
    data_dir = get_project_data_dir()
    logger.info("=" * 60)
    logger.info("Cardmarket ID Mapper")
    logger.info("=" * 60)

    cards = load_cards_db(data_dir)
    singles, nonsingles, _ = load_jsons(data_dir)
    logger.info("DB cards: %s, singles JSON: %s, nonsingles JSON: %s",
                len(cards), len(singles), len(nonsingles))

    set_to_exp, method, fallback_failed = build_set_to_expansion(cards, singles, nonsingles)
    by_method = Counter(method.values())
    logger.info("Set→idExpansion: %s mapped (%s) | %s failed",
                len(set_to_exp), dict(by_method), len(fallback_failed))
    if fallback_failed:
        for sc, reason in fallback_failed:
            logger.warning("  unmapped set: %s (%s)", sc, reason)

    mappings, stats = map_cards_to_products(cards, singles, set_to_exp)
    total_cards = sum(1 for c in cards if c.get('number'))
    coverage = len(mappings) / total_cards * 100 if total_cards else 0
    logger.info("Card mapping: %s of %s cards (%.1f%%) | %s",
                len(mappings), total_cards, coverage, dict(stats))

    out_path = os.path.join(data_dir, 'cardmarket_id_mapping.csv')
    write_mapping(mappings, out_path)
    logger.info("Wrote mapping → %s", out_path)


if __name__ == '__main__':
    main()
