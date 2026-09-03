#!/usr/bin/env python3
"""
Cardmarket ID Mapper
====================
Builds a (set, number) -> idProduct mapping using Cardmarket's official JSON
exports (no Cardmarket page scraping required):

  data/products_singles_6.json     - all single-card products (game id 6 = Pokémon)
  data/products_nonsingles_6.json  - boosters/displays (used to derive set name -> idExpansion)
  data/price_guide_6.json          - daily price snapshot (only used here for sanity-check coverage)

The "_6" suffix is what Cardmarket's S3 download links produce
(/productCatalog/productList/products_singles_6.json etc.); reading
the raw filenames straight off disk means the user doesn't have to
rename them after each daily download.

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
        'singles': os.path.join(data_dir, 'products_singles_6.json'),
        'nonsingles': os.path.join(data_dir, 'products_nonsingles_6.json'),
        'price_guide': os.path.join(data_dir, 'price_guide_6.json'),
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
    #
    # Iterate over EVERY set in our DB, not just the ones that already have a
    # cardmarket_url. A brand-new set (e.g. PBL on release) has no Cardmarket
    # URLs yet, so it produces no slug — before, such a set was silently dropped
    # here and never even reached the overlap fallback below, which would have
    # matched it correctly. Now a missing/unknown slug simply falls through.
    set_to_exp = {}
    method = {}
    unmapped_via_slug = []
    all_set_codes = {c['set'] for c in cards if c.get('set')}
    for sc in sorted(all_set_codes):
        slug = set_to_slug.get(sc)
        if slug and slug in slug_to_exp:
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


def map_cards_to_products(cards: list, singles: list, set_to_exp: dict,
                           price_guide: list):
    """Returns list of mapping rows + stats.

    Ambiguity-resolution strategy (multiple Cardmarket products share the
    same base name within an expansion — e.g. four "Bulbasaur" products
    in the 151 set: regular common, Art Rare, Master Ball reverse,
    later reprint):

      Our cards sorted by card NUMBER ascending → low number = regular
      print (common / uncommon), high number = special print (Art Rare,
      SAR, Hyper Rare).

      Candidates sorted by daily TREND PRICE ascending → low price =
      regular print, high price = special print. Candidates with no
      price data fall through to an idProduct-based tiebreaker so a
      missing price doesn't drop a valid candidate.

      Pair positionally with a "spread to the edges" rule when there
      are more candidates than our cards: the lowest-numbered card maps
      to the cheapest candidate, the highest-numbered to the most
      expensive, intermediates land at proportional positions.

    Why this replaces the older idProduct-only ordering:
      The old heuristic assumed lower idProduct = older product = released
      first = special print. That holds for some 2023+ sets (e.g. 151
      Bulbasaur: Art Rare at idProduct 720365 added 2023-06-29, Common
      at 733596 added 2023-09-22 — old logic gave correct pairing).
      But it breaks for sets where the Common product was created first
      and the special print added later, OR where idProduct order is
      jumbled by reprints (151 Ivysaur: Common at 733597, Art Rare at
      733762 — old logic happened to be right). When idProduct order
      and rarity order disagree the old logic produced inverted mappings
      — the user reported a Bulbasaur MEW 166 (Art Rare, market value
      ~144 €) showing a price of 0.11 € because it had been mapped to
      the common reprint product. Sorting candidates by price ties the
      pairing to the underlying market signal instead of catalogue
      timing, which is reliable across set generations.
    """
    # Build product -> trend/avg price lookup
    price_by_id = {g.get('idProduct'): g for g in price_guide}

    def candidate_price(product):
        g = price_by_id.get(product.get('idProduct'))
        if not g:
            return None
        # Prefer trend (daily smoothed). Fall back to avg if trend is
        # null/0 (newly added products without enough sales for a trend
        # number still have an avg sometimes).
        v = g.get('trend')
        if not v or v <= 0:
            v = g.get('avg')
        return v if v and v > 0 else None

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

        # Ambiguous: prefer the price-ranked subset of candidates.
        # Group our cards by card number ascending.
        group_sorted = sorted(group, key=lambda c: card_number_sort_key(c['number']))

        # Three-step variant resolution:
        #
        # Step 1 — group candidates by dateAdded.
        # Cardmarket creates products in waves: announcement-day pre-
        # release variants (Master Ball Pattern, Build & Battle promo),
        # main set distribution wave, later reprints + cross-listed
        # collections. The MAIN DISTRIBUTION WAVE is what Limitless
        # catalogues. The 151 set example: Bulbasaur has 4 products,
        # 3 dates — 2023-06-29 (Master Ball, 1 product, very expensive),
        # 2023-09-22 (official set release, 2 products: Common + IR),
        # 2024-10-25 (later reprint, 1 product). Our DB has 2 cards
        # (Common + IR) and the right ones to map are exactly the
        # 2-product group from 2023-09-22.
        #
        # Step 2 — pick the date group with the most candidates as the
        # pool. Tiebreak by older date first (real set releases over
        # newer reprints). Fall back to ALL candidates when no group
        # has enough for our card count.
        #
        # Step 3 — within the pool, sort by trend price ascending. Pair
        # to our cards (sorted by number ascending) positionally. Card
        # number correlates with rarity (low = common, high = special),
        # price correlates with rarity directly, so number-order ↔
        # price-order gives the right rarity-to-product mapping.
        n_grp = len(group_sorted)

        def cand_sort_key(p):
            # Priced candidates ranked by their trend price ascending.
            # Candidates with no usable price fall to the back, ordered
            # by idProduct so the result stays deterministic across
            # runs.
            v = candidate_price(p)
            return (1, p['idProduct']) if v is None else (0, v)

        # Bucket by dateAdded prefix (yyyy-mm-dd)
        date_buckets = defaultdict(list)
        for p in candidates:
            date_key = (p.get('dateAdded') or '')[:10]
            date_buckets[date_key].append(p)

        # Largest bucket; tiebreak by oldest date
        sorted_buckets = sorted(
            date_buckets.values(),
            key=lambda b: (-len(b), (b[0].get('dateAdded') or '')),
        )
        best_bucket = sorted_buckets[0] if sorted_buckets else []
        if len(best_bucket) >= n_grp:
            pool = best_bucket
            tag = 'date'
        else:
            # No date group has enough candidates — fall back to all
            # candidates (rare; happens when each variant was added in
            # a separate wave).
            pool = candidates
            tag = 'all'

        pool_sorted = sorted(pool, key=cand_sort_key)

        # If the pool still has more candidates than our cards, spread
        # picks across the price range so the lowest-numbered card
        # matches the cheapest and the highest-numbered the most
        # expensive. With one card we take the cheapest because our
        # DB more often catalogues a Common than the rare variant it
        # shares a name with.
        if len(pool_sorted) > n_grp:
            picked = []
            for i in range(n_grp):
                if n_grp <= 1:
                    pos = 0
                else:
                    pos = round(i / (n_grp - 1) * (len(pool_sorted) - 1))
                picked.append(pool_sorted[min(pos, len(pool_sorted) - 1)])
        else:
            picked = pool_sorted

        match_method = f'priced-by-{tag}({n_grp}↔{len(candidates)})'

        for i, c in enumerate(group_sorted):
            if i >= len(picked):
                stats['ordered_skipped'] += 1
                continue
            chosen = picked[i]
            mappings.append({
                'set': sc, 'number': c['number'],
                'cardmarket_product_id': chosen['idProduct'],
                'match_method': match_method,
                'base_name': name,
            })
            stats['priced'] += 1

    return mappings, stats


def apply_live_verification(mappings: list, data_dir: str):
    """Prefer LIVE-verified product ids over the positional heuristic.

    data/cardmarket_mapping_verified.csv is written by
    scripts/verify_cardmarket_mapping.py (CI job): it fetches the Cardmarket
    product page behind Limitless' per-print URL and extracts the real
    idProduct. That is an identity statement; the heuristic pairing below
    (card-number rank <-> trend-price rank) is a monotonicity assumption
    that provably inverts SAR-vs-Secret-Rare groups (OBF 223 <-> 228,
    commit #256). Wherever a verified row exists, it wins — including when
    it CONFIRMS the heuristic (match_method then records the confirmation,
    so consumers can tell verified rows from guessed ones).

    Returns (corrected, confirmed) counts for the log.
    """
    path = os.path.join(data_dir, 'cardmarket_mapping_verified.csv')
    if not os.path.isfile(path):
        return 0, 0
    verified = {}
    try:
        with open(path, encoding='utf-8-sig', newline='') as f:
            for r in csv.DictReader(f):
                if r.get('status') == 'verified' and r.get('verified_product_id'):
                    verified[(r['set'], r['number'])] = int(r['verified_product_id'])
    except Exception as e:  # noqa: BLE001
        logger.warning("could not read %s (%s) — heuristic mapping unchanged", path, e)
        return 0, 0

    corrected = confirmed = 0
    for row in mappings:
        pid = verified.get((row['set'], row['number']))
        if pid is None:
            continue
        if int(row['cardmarket_product_id']) == pid:
            confirmed += 1
            row['match_method'] = 'live-verified'
        else:
            logger.warning("live verification corrects %s %s: %s -> %s (was %s)",
                           row['set'], row['number'],
                           row['cardmarket_product_id'], pid, row['match_method'])
            row['cardmarket_product_id'] = pid
            row['match_method'] = 'live-verified'
            corrected += 1
    if corrected or confirmed:
        logger.info("Live verification: %s confirmed, %s corrected", confirmed, corrected)
    return corrected, confirmed


def apply_manual_overrides(mappings: list, data_dir: str, cards: list = None):
    """Highest-precedence pins from data/cardmarket_mapping_manual.csv.

    The escape hatch for everything automation cannot decide: a human
    opened the Cardmarket product page, read the idProduct out of the URL
    or the page, and wrote it down. Nothing overrides this — not the
    heuristic, not the live fingerprint — because it is the only source
    where a person actually looked at the product.

    Format: set,number,cardmarket_product_id,source,note
    A row with an empty or non-numeric product id is skipped and reported,
    never guessed at (report, don't repair).

    Runs AFTER apply_live_verification so a pin also beats a verified row
    — if the two ever disagree, the log says so loudly, because then
    either the pin or the fingerprint is wrong and somebody must look.
    """
    path = os.path.join(data_dir, 'cardmarket_mapping_manual.csv')
    if not os.path.isfile(path):
        return 0
    pins = {}
    try:
        with open(path, encoding='utf-8-sig', newline='') as f:
            for r in csv.DictReader(f):
                sc = (r.get('set') or '').strip().upper()
                num = (r.get('number') or '').strip()
                raw = (r.get('cardmarket_product_id') or '').strip()
                if not sc or not num:
                    continue
                if not raw.isdigit():
                    logger.warning("manual pin %s %s has no numeric product id (%r) — skipped",
                                   sc, num, raw)
                    continue
                pins[(sc, num)] = (int(raw), (r.get('source') or '').strip())
    except Exception as e:  # noqa: BLE001
        logger.warning("could not read %s (%s) — no manual pins applied", path, e)
        return 0
    if not pins:
        return 0

    applied = 0
    getroffen = set()
    for row in mappings:
        schluessel = (row['set'].upper(), row['number'])
        pin = pins.get(schluessel)
        if pin is None:
            continue
        pid, source = pin
        getroffen.add(schluessel)
        if int(row['cardmarket_product_id']) != pid:
            level = logger.warning if row['match_method'] == 'live-verified' else logger.info
            level("manual pin overrides %s %s: %s -> %s (was %s%s)",
                  row['set'], row['number'], row['cardmarket_product_id'], pid,
                  row['match_method'], f", pinned by {source}" if source else "")
        row['cardmarket_product_id'] = pid
        row['match_method'] = 'manual-pin'
        applied += 1

    # EIN PIN, DER NICHTS TRIFFT, TUT NICHTS — UND SAGTE ES NICHT
    # (03.09.2026).
    #
    # Bis hierher aenderte diese Funktion nur VORHANDENE Zeilen. Fuer eine
    # Karte, zu der der Mapper gar keinen Kandidaten gefunden hat, fiel der
    # Pin still unter den Tisch: er stand in der Datei, sah richtig aus und
    # wirkte nie. Aufgefallen an SFA 98 und SFA 99 (Darkness- und
    # Metal-Energy, Secret Rare, 36,14 und 34,66 EUR) — beide standen auf
    # "unmapped", beide bekamen einen belegten Pin, und nach dem Lauf
    # standen sie unveraendert auf "unmapped".
    #
    # Ein Pin ist die einzige Quelle, bei der ein Mensch das Produkt
    # WIRKLICH angesehen hat. Wenn die Automatik nichts gefunden hat, ist
    # er nicht weniger wert, sondern mehr. Also darf er eine Zeile
    # anlegen — aber nur fuer eine Karte, die es in der Kartendatenbank
    # ueberhaupt gibt. Ein Pin auf eine erfundene Nummer bleibt ein Fehler
    # und wird gemeldet, nicht erfuellt.
    erzeugt = 0
    offen = sorted(k for k in pins if k not in getroffen)
    if offen:
        bekannt = {}
        for c in (cards or []):
            sc = (c.get('set') or '').strip().upper()
            num = (c.get('number') or '').strip()
            if sc and num:
                bekannt.setdefault((sc, num), c)
        ohne_karte = []
        for schluessel in offen:
            karte = bekannt.get(schluessel)
            pid, source = pins[schluessel]
            if karte is None:
                ohne_karte.append(schluessel)
                continue
            mappings.append({
                'set': schluessel[0], 'number': schluessel[1],
                'cardmarket_product_id': pid,
                'match_method': 'manual-pin',
                'base_name': (karte.get('name_en') or karte.get('name')
                              or karte.get('name_de') or ''),
            })
            erzeugt += 1
            logger.info("manual pin creates %s %s -> %s (Mapper hatte keinen "
                        "Kandidaten%s)", schluessel[0], schluessel[1], pid,
                        f", pinned by {source}" if source else "")
        if ohne_karte:
            logger.warning(
                "%s manual pin(s) match no card in the DB and were NOT applied: %s "
                "— eine Zeile in cardmarket_mapping_manual.csv, die auf keine "
                "existierende Karte zeigt, wirkt nie und ist vermutlich ein "
                "Tippfehler in set/number",
                len(ohne_karte), ", ".join(f"{a} {b}" for a, b in ohne_karte[:12]))

    logger.info("Manual pins: %s applied, %s created, %s in file",
                applied, erzeugt, len(pins))
    return applied + erzeugt


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
    singles, nonsingles, price_guide = load_jsons(data_dir)
    logger.info(
        "DB cards: %s, singles JSON: %s, nonsingles JSON: %s, price guide: %s",
        len(cards), len(singles), len(nonsingles), len(price_guide),
    )

    set_to_exp, method, fallback_failed = build_set_to_expansion(cards, singles, nonsingles)
    by_method = Counter(method.values())
    logger.info("Set→idExpansion: %s mapped (%s) | %s failed",
                len(set_to_exp), dict(by_method), len(fallback_failed))
    if fallback_failed:
        for sc, reason in fallback_failed:
            logger.warning("  unmapped set: %s (%s)", sc, reason)

    mappings, stats = map_cards_to_products(cards, singles, set_to_exp, price_guide)
    apply_live_verification(mappings, data_dir)
    apply_manual_overrides(mappings, data_dir, cards)
    total_cards = sum(1 for c in cards if c.get('number'))
    coverage = len(mappings) / total_cards * 100 if total_cards else 0
    logger.info("Card mapping: %s of %s cards (%.1f%%) | %s",
                len(mappings), total_cards, coverage, dict(stats))

    out_path = os.path.join(data_dir, 'cardmarket_id_mapping.csv')
    write_mapping(mappings, out_path)
    logger.info("Wrote mapping → %s", out_path)


if __name__ == '__main__':
    main()
