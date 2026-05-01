#!/usr/bin/env python3
"""
Cardmarket Price Merger
=======================
Daily merge of Cardmarket's price guide JSON into data/price_data.csv.
For each card in all_cards_database.csv:
  - if a Cardmarket mapping exists and the price guide has an entry: use trend (eur_price) + low (eur_low)
  - otherwise: preserve the existing row from price_data.csv (Limitless-scraped value)

Inputs:
  data/all_cards_database.csv
  data/cardmarket_id_mapping.csv  (built by cardmarket_id_mapper.py)
  data/price_guide_6.json         (Cardmarket daily download — game id 6 = Pokémon)
  data/price_data.csv             (existing; preserved for non-mapped cards)

Output:
  data/price_data.csv  (atomic overwrite)
"""

import os
import sys
import csv
import json
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'core'))
from card_scraper_shared import (
    setup_console_encoding, setup_logging, atomic_write_file
)

setup_console_encoding()
logger = setup_logging("cardmarket_merger")


def get_project_data_dir() -> str:
    here = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(os.path.dirname(here))
    return os.path.join(project_root, 'data')


def fmt_price(value) -> str:
    """Cardmarket gives floats; format like the existing CSV: '12,34€'."""
    if value is None or value == '':
        return ''
    try:
        return f"{float(value):.2f}".replace('.', ',') + '€'
    except (TypeError, ValueError):
        return ''


def main():
    data_dir = get_project_data_dir()
    cards_path = os.path.join(data_dir, 'all_cards_database.csv')
    mapping_path = os.path.join(data_dir, 'cardmarket_id_mapping.csv')
    guide_path = os.path.join(data_dir, 'price_guide_6.json')
    out_path = os.path.join(data_dir, 'price_data.csv')

    for p in (cards_path, mapping_path, guide_path):
        if not os.path.isfile(p):
            logger.error("Missing input: %s", p)
            sys.exit(1)

    logger.info("=" * 60)
    logger.info("Cardmarket Price Merger")
    logger.info("=" * 60)

    with open(cards_path, encoding='utf-8-sig', newline='') as f:
        cards = list(csv.DictReader(f))
    with open(mapping_path, encoding='utf-8-sig', newline='') as f:
        mapping = {(m['set'], m['number']): int(m['cardmarket_product_id'])
                   for m in csv.DictReader(f)}
    with open(guide_path, encoding='utf-8') as f:
        guide = {int(p['idProduct']): p for p in json.load(f).get('priceGuides', [])}

    existing = {}
    if os.path.isfile(out_path):
        with open(out_path, encoding='utf-8-sig', newline='') as f:
            for row in csv.DictReader(f):
                existing[(row['set'], row['number'])] = row

    logger.info("DB cards: %s | mapping: %s | guide entries: %s | existing rows: %s",
                len(cards), len(mapping), len(guide), len(existing))

    now = datetime.now().isoformat()
    out_rows = []
    stats = {'cardmarket': 0, 'preserved': 0, 'no_data': 0}

    for c in cards:
        if not c.get('number'):
            continue
        key = (c['set'], c['number'])
        name = (c.get('name_en') or c.get('name', '')).strip()
        cm_url = c.get('cardmarket_url', '')

        idp = mapping.get(key)
        guide_entry = guide.get(idp) if idp else None

        if guide_entry:
            out_rows.append({
                'name': name,
                'set': c['set'],
                'number': c['number'],
                'eur_price': fmt_price(guide_entry.get('trend')),
                'eur_low': fmt_price(guide_entry.get('low')),
                'cardmarket_url': cm_url,
                'last_updated': now,
            })
            stats['cardmarket'] += 1
        elif key in existing:
            row = existing[key]
            out_rows.append({
                'name': row.get('name', name),
                'set': c['set'],
                'number': c['number'],
                'eur_price': row.get('eur_price', ''),
                'eur_low': row.get('eur_low', ''),
                'cardmarket_url': cm_url or row.get('cardmarket_url', ''),
                'last_updated': row.get('last_updated', ''),
            })
            stats['preserved'] += 1
        else:
            stats['no_data'] += 1

    logger.info("Result: %s from Cardmarket | %s preserved (Limitless/historic) | %s no data",
                stats['cardmarket'], stats['preserved'], stats['no_data'])

    fieldnames = ['name', 'set', 'number', 'eur_price', 'eur_low',
                  'cardmarket_url', 'last_updated']

    def _write(f):
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
        w.writeheader()
        for r in sorted(out_rows, key=lambda r: (r['set'], r['number'])):
            w.writerow(r)

    atomic_write_file(out_path, _write, encoding='utf-8-sig', newline='')
    logger.info("Wrote price data → %s (%s rows)", out_path, len(out_rows))


if __name__ == '__main__':
    main()
