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
        mapping = {}
        mapping_method = {}
        for m in csv.DictReader(f):
            key = (m['set'], m['number'])
            mapping[key] = int(m['cardmarket_product_id'])
            mapping_method[key] = m.get('match_method', '')
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
    stats = {'cardmarket': 0, 'preserved': 0, 'no_data': 0, 'no_trend': 0,
             'trend_below_low': 0, 'unverified_mapping': 0}

    for c in cards:
        if not c.get('number'):
            continue
        key = (c['set'], c['number'])
        name = (c.get('name_en') or c.get('name', '')).strip()
        cm_url = c.get('cardmarket_url', '')

        idp = mapping.get(key)
        guide_entry = guide.get(idp) if idp else None

        # Mapping trust is computed BEFORE the branch and lives in its own
        # column. It answers "is this price the right product's price?",
        # which is orthogonal to price_status ("which number should I
        # read?"). Two facts do not fit in one enum: inside the branch the
        # flag would evaporate on any bad guide day, because the stale /
        # no_data paths rewrite price_status and every unverified marker on
        # the site would silently disappear. It also would have been lost on
        # the 13 trend_below_low + 3 no_trend rows that are positional today.
        method = mapping_method.get(key, '')
        mapping_status = 'unverified' if method.startswith('priced-by') else 'ok'
        if mapping_status == 'unverified':
            stats['unverified_mapping'] += 1

        if guide_entry:
            # Cardmarket uses trend == 0 (and null) to mean "no trend can be
            # computed", NOT "this card is worthless". idProduct 653295
            # (RCL 200 Boss's Orders) is literally {'trend': 0, 'low': 85}:
            # a card whose cheapest offer is 85 EUR, published as 0. Copying
            # that faithfully into eur_price is correct, but a consumer that
            # reads eur_price as *the* price then shows an 85 EUR card at
            # 0,00 EUR. price_status says which of the two it is so nobody has
            # to guess from the number itself.
            trend = guide_entry.get('trend')
            low = guide_entry.get('low')
            has_trend = trend not in (None, '', 0, 0.0)
            if not has_trend:
                stats['no_trend'] += 1
            # A trend BELOW the cheapest current offer is not a price anyone
            # can pay. It happens on vintage and promo prints whose trend is
            # computed from old sales while the market has moved: TR 5 Dark
            # Dragonite trends at 0,02 EUR with a cheapest offer of 18,90 EUR,
            # a 945x gap. 110 rows are like this. Flagged rather than
            # rewritten -- the CSV keeps Cardmarket's real numbers, and
            # consumers decide; prepare_card_data uses eur_low for display.
            trend_below_low = False
            try:
                if has_trend and low not in (None, '') and float(low) > float(trend):
                    trend_below_low = True
                    stats['trend_below_low'] += 1
            except (TypeError, ValueError):
                pass
            # Mapping-trust dimension: rows whose (set,number)->idProduct
            # came from the POSITIONAL heuristic (match_method 'priced-by-*')
            # are not verified product identities — the price may belong to a
            # same-named sibling print (proven: OBF 223 <-> 228 swap, and all
            # 40 SAR-vs-Secret-Rare groups inverted). Until the live
            # verification job (scripts/verify_cardmarket_mapping.py) has
            # confirmed the row, price_status says 'unverified_mapping'.
            # Display is intentionally unchanged (prepare_card_data treats
            # unknown statuses like 'ok' — maintainer decision 2026-08-01:
            # verify first, then correct); consumers get the honest flag.
            # Precedence: the trend-quality flags win, because they change
            # WHICH number to read — no_trend/trend_below_low rows are
            # unusable regardless of mapping trust. price_status keeps the
            # legacy 'unverified_mapping' value for consumers that already
            # read it; mapping_status carries the same fact unconditionally.
            unverified = mapping_status == 'unverified'
            out_rows.append({
                'name': name,
                'set': c['set'],
                'number': c['number'],
                'eur_price': fmt_price(trend),
                'eur_low': fmt_price(low),
                'cardmarket_url': cm_url,
                'last_updated': now,
                'price_status': ('no_trend' if not has_trend
                                 else 'trend_below_low' if trend_below_low
                                 else 'unverified_mapping' if unverified
                                 else 'ok'),
                'mapping_status': mapping_status,
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
                # Carried over from an earlier run: today's guide has no entry
                # for this product. The price is real but not current, which
                # last_updated already shows and price_status now makes
                # filterable.
                'price_status': 'stale' if (row.get('eur_price') or row.get('eur_low')) else 'no_data',
                'mapping_status': mapping_status,
            })
            stats['preserved'] += 1
        else:
            # Emit the row instead of skipping it. Silently omitting a card
            # left THREE states behind one column -- a value, an empty cell,
            # and an absent row -- and only a consumer that also reads
            # all_cards_merged.csv could tell "no price" from "no such card".
            # (PBL 74 / 83 / 84 are exactly this: real cards, no Cardmarket
            # product.) Measured cost: 9 extra rows on 20,382.
            out_rows.append({
                'name': name,
                'set': c['set'],
                'number': c['number'],
                'eur_price': '',
                'eur_low': '',
                'cardmarket_url': cm_url,
                'last_updated': '',
                'price_status': 'no_data',
                'mapping_status': mapping_status,
            })
            stats['no_data'] += 1

    logger.info("Result: %s from Cardmarket (%s without a usable trend, "
                "%s with a trend below the cheapest offer, "
                "%s on an unverified positional mapping) | "
                "%s preserved (Limitless/historic) | %s no data",
                stats['cardmarket'], stats['no_trend'], stats['trend_below_low'],
                stats['unverified_mapping'],
                stats['preserved'], stats['no_data'])

    # extrasaction='ignore' below means a key missing from THIS list is dropped
    # without a word. Any new column must be added here in the same commit or
    # the next daily run silently deletes it again. price_status goes LAST so
    # positional readers (if any exist) keep working -- data/_consumers.md
    # documents adding a column as safe, removing or reordering one as not.
    fieldnames = ['name', 'set', 'number', 'eur_price', 'eur_low',
                  'cardmarket_url', 'last_updated', 'price_status',
                  'mapping_status']

    def _write(f):
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
        w.writeheader()
        for r in sorted(out_rows, key=lambda r: (r['set'], r['number'])):
            w.writerow(r)

    atomic_write_file(out_path, _write, encoding='utf-8-sig', newline='')
    logger.info("Wrote price data → %s (%s rows)", out_path, len(out_rows))


if __name__ == '__main__':
    main()
