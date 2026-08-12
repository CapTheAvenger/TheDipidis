#!/usr/bin/env python3
"""Build a (set, number) -> pokepricelab catalog URL index from their sitemap.

Step 1 of using pokepricelab as an independent Cardmarket-identity source.
Their catalog pages expose the Cardmarket idProduct (in a link, and for
sibling products also in the URL suffix `-eu-<id>`) — the number Cardmarket
itself never shows and that our whole price-identity problem hinges on.

This step does NOT fetch any card page. It only reads the sitemap
(271 sub-sitemaps, ~1000 urls each) and works out which URL belongs to
which of OUR cards, so the next step fetches only the pages we actually
need instead of crawling 50k+.

Matching is structural, never fuzzy: a catalog slug looks like

    /de/catalog/<set-slug>-<card-name-slug>-<number>[-eu-<idProduct>]

so a URL belongs to our (set, number) iff the slug STARTS WITH our set's
slug and ENDS WITH our number (optionally followed by the id suffix). The
set slug comes from cm_expansions.csv's official expansion name — no name
matching against card names, which CLAUDE.md forbids for identity.

A card can legitimately have several URLs: the base one plus one per
sibling product (`-eu-<id>`). All of them are recorded; deciding which is
ours is the next step's job, with evidence.

Output: data/pokepricelab_catalog_index.csv
    set, number, url, product_id_in_url, lang
"""

import csv
import os
import re
import sys
import time
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
OUT = os.path.join(DATA, 'pokepricelab_catalog_index.csv')
BASE = 'https://pokepricelab.com'
UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36')

# Their robots.txt has no Disallow and declares this sitemap; still pace
# the requests — 271 files is a lot of hits for someone else's server.
PACE = 0.6
FIELDS = ['set', 'number', 'url', 'product_id_in_url', 'lang']

CATALOG_RE = re.compile(
    r'^https://pokepricelab\.com/(?:([a-z]{2})/)?catalog/(.+?)$')
ID_SUFFIX_RE = re.compile(r'-eu-(\d{4,})$')


def slugify(name):
    return re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-',
                                     str(name or '').lower())).strip('-')


def load_expansion_of_product():
    """idProduct -> idExpansion, from the Cardmarket singles catalogue."""
    import json  # noqa: PLC0415
    path = os.path.join(DATA, 'products_singles_6.json')
    with open(path, encoding='utf-8') as f:
        return {p['idProduct']: p.get('idExpansion')
                for p in json.load(f)['products']}


def load_our_expansions():
    """our set code -> {idExpansion} via the products we already map.

    Uses only rows the mapper is confident about (unique / live-verified /
    manual-pin); a positional guess may sit on the wrong product, but even
    then it is almost always the right EXPANSION — still, no reason to let
    it vote when better rows exist."""
    prod_exp = load_expansion_of_product()
    by_code = defaultdict(Counter)
    with open(os.path.join(DATA, 'cardmarket_id_mapping.csv'),
              encoding='utf-8-sig', newline='') as f:
        for r in csv.DictReader(f):
            exp = prod_exp.get(int(r['cardmarket_product_id'] or 0))
            if exp is None:
                continue
            weight = 3 if r.get('match_method', '') in (
                'unique', 'live-verified', 'manual-pin') else 1
            by_code[r['set'].strip().upper()][exp] += weight
    return {code: {exp for exp, _ in c.most_common(3)} for code, c in by_code.items()}


def derive_slug_to_code(urls, our_expansions):
    """slug prefix -> our set code, derived from EVIDENCE, not names.

    cm_expansions.csv cannot carry this: its `name` for idExpansion 5241
    reads "World Championships 2023 Paradise Resort Full Set" while the
    catalog (and Cardmarket itself) calls it SV Black Star Promos, so a
    name join silently maps nothing. But ~5-8% of catalog URLs carry
    `-eu-<idProduct>`, and an idProduct resolves to an idExpansion — which
    we can tie back to our set codes through the products we already map.
    Every id-carrying URL is therefore one vote for "this slug prefix is
    that expansion".

    A prefix is only accepted when the votes agree: a prefix that points
    at two different expansions is dropped, never split by guesswork.
    """
    prod_exp = load_expansion_of_product()
    exp_to_codes = defaultdict(set)
    for code, exps in our_expansions.items():
        for e in exps:
            exp_to_codes[e].add(code)

    votes = defaultdict(Counter)
    for url in urls:
        m = CATALOG_RE.match(url)
        if not m:
            continue
        slug = m.group(2)
        pid_m = ID_SUFFIX_RE.search(slug)
        if not pid_m:
            continue
        exp = prod_exp.get(int(pid_m.group(1)))
        if exp is None:
            continue
        core = slug[:pid_m.start()]
        num_m = re.search(r'-(\d+[a-z]?)$', core)
        if not num_m:
            continue
        votes[core[:num_m.start()]][exp] += 1

    slug_to_code = {}
    dropped = 0
    for prefix, counter in votes.items():
        exps = [e for e, n in counter.items() if n >= 1]
        codes = set()
        for e in exps:
            codes |= exp_to_codes.get(e, set())
        if len(codes) == 1:
            slug_to_code[prefix] = codes.pop()
        elif codes:
            dropped += 1
    print(f'card-level slug prefixes resolved from id-carrying urls: '
          f'{len(slug_to_code)} (ambiguous, dropped: {dropped})')

    # Those prefixes are per CARD ("<set-slug>-<card-name-slug>"), so on
    # their own they only cover cards that happen to have a sibling
    # product. Fold them up to SET level: the shared leading segments of
    # several cards of the same code are that set's slug, which then also
    # matches the cards with a single product. A segment prefix is only
    # accepted when no OTHER code produces it too.
    set_votes = defaultdict(Counter)
    for prefix, code in slug_to_code.items():
        parts = prefix.split('-')
        for i in range(1, len(parts)):
            set_votes['-'.join(parts[:i])][code] += 1
    best_by_code = {}
    for prefix, counter in set_votes.items():
        if len(counter) != 1:
            continue          # two sets would claim it — drop
        code, n = counter.most_common(1)[0]
        if n < 2:
            continue          # a single card is not evidence for a set slug
        # Keep the LONGEST unambiguous prefix per code.
        if code not in best_by_code or len(prefix) > len(best_by_code[code]):
            best_by_code[code] = prefix
    set_slugs = {prefix: code for code, prefix in best_by_code.items()}
    print(f'set-level slugs folded up: {len(set_slugs)} '
          f'(e.g. {list(set_slugs.items())[:3]})')
    return slug_to_code, set_slugs


def load_our_cards():
    """(set, number) pairs we actually care about, with a flag for the
    ones whose mapping is still unverified (those drive step 2)."""
    cards = {}
    path = os.path.join(DATA, 'price_data.csv')
    with open(path, encoding='utf-8-sig', newline='') as f:
        for r in csv.DictReader(f):
            cards[(r['set'].strip().upper(), r['number'].strip())] = \
                (r.get('mapping_status') or '') == 'unverified'
    return cards


def load_our_names():
    """(set, number) -> card name, for the veto guard in index_urls."""
    names = {}
    with open(os.path.join(DATA, 'price_data.csv'),
              encoding='utf-8-sig', newline='') as f:
        for r in csv.DictReader(f):
            names[(r['set'].strip().upper(), r['number'].strip())] = r.get('name', '')
    return names


def _flat(s):
    return re.sub(r'[^a-z0-9]+', '', str(s or '').lower())


def name_vetoes(url_body, our_name):
    """True when the URL is about a DIFFERENT card and must be dropped.

    This is a veto, not a join. Identity is still established structurally
    (set slug + trailing number); the name only ever REJECTS a URL that
    the structure already accepted. It never selects one, never breaks a
    tie, and never reaches into card data — which is what the name-join
    ban is about.

    It exists because the set-slug fold-up matches related sets: a slug
    of `base-set` also prefixes `base-set-2-marowak-52`, so BS 52 (Machop)
    was indexed to Base Set 2's Marowak. Same for `forbidden-light` vs
    `forbidden-light-jp-*` and a row of `sword-shield-starter-decks-*`.
    61 such rows reached the step-2 cross-check and produced verdicts
    that said nothing about the mapping.

    Containment, not suffix: legitimate slugs carry extras
    (`arceus-charizard-lv-60`). Names under four characters never veto —
    the trainer card "N" would flatten to "n" and match everything.
    """
    ours = _flat(our_name)
    if len(ours) < 4:
        return False
    return ours not in _flat(url_body)


def fetch_sitemap_urls(session):
    import xml.etree.ElementTree as ET  # noqa: PLC0415

    def locs(text):
        try:
            root = ET.fromstring(text)
        except ET.ParseError:
            return re.findall(r'<loc>([^<]+)</loc>', text)
        return [e.text.strip() for e in root.iter()
                if e.tag.endswith('loc') and e.text]

    r = session.get(f'{BASE}/sitemap.xml', timeout=30)
    r.raise_for_status()
    subs = [u for u in locs(r.text) if '/sitemap' in u]
    print(f'sitemap index: {len(subs)} sub-sitemaps')
    urls = []
    for i, sm in enumerate(subs, 1):
        try:
            rr = session.get(sm, timeout=30)
            if rr.status_code != 200:
                print(f'  {sm} -> HTTP {rr.status_code} (skipped)')
                continue
            got = locs(rr.text)
            urls.extend(got)
            if i % 25 == 0 or i == len(subs):
                print(f'  {i}/{len(subs)} sub-sitemaps, {len(urls)} urls so far')
        except Exception as e:  # noqa: BLE001
            print(f'  {sm} -> ERROR {e} (skipped)')
        time.sleep(PACE)
    return urls


def index_urls(urls, slug_to_code, set_slugs, our_cards, our_names=None):
    """Assign catalog URLs to our (set, number).

    A URL belongs to a card iff its slug prefix resolves to that card's
    set (see derive_slug_to_code) AND the trailing number is one of ours.
    The card name never SELECTS a URL — it only vetoes one that names a
    different card (see name_vetoes), which is what stopped BS 52 from
    being indexed to Base Set 2's Marowak."""
    rows = []
    unmatched = 0
    vetoed = 0
    our_names = our_names or {}
    for url in urls:
        m = CATALOG_RE.match(url)
        if not m:
            continue
        lang, slug = m.group(1) or '', m.group(2)
        pid_m = ID_SUFFIX_RE.search(slug)
        pid = pid_m.group(1) if pid_m else ''
        core = slug[:pid_m.start()] if pid_m else slug
        num_m = re.search(r'-(\d+[a-z]?)$', core)
        if not num_m:
            unmatched += 1
            continue
        raw_num = num_m.group(1)
        prefix = core[:num_m.start()]
        code = slug_to_code.get(prefix)
        if not code:
            # Fall back to the set-level slug (longest match wins so a
            # longer set slug beats a shorter one that is its prefix).
            best = ''
            for s, c in set_slugs.items():
                if (prefix == s or prefix.startswith(s + '-')) and len(s) > len(best):
                    best, code = s, c
            if not best:
                unmatched += 1
                continue
        # Catalog numbers may be zero-padded ("002") where ours are not.
        hit = None
        for cand in (raw_num, raw_num.lstrip('0') or '0', raw_num.zfill(3)):
            if (code, cand) in our_cards:
                hit = (code, cand)
                break
        if not hit:
            unmatched += 1
            continue
        if name_vetoes(prefix, our_names.get(hit, '')):
            vetoed += 1
            continue
        rows.append({'set': hit[0], 'number': hit[1], 'url': url,
                     'product_id_in_url': pid, 'lang': lang})
    return rows, unmatched, vetoed


def main():
    import requests  # noqa: PLC0415
    s = requests.Session()
    s.headers.update({'User-Agent': UA, 'Accept-Language': 'de,en;q=0.8'})

    our_cards = load_our_cards()
    our_expansions = load_our_expansions()
    print(f'our cards: {len(our_cards)} | unverified: {sum(our_cards.values())} '
          f'| set codes with a known expansion: {len(our_expansions)}')

    urls = fetch_sitemap_urls(s)
    print(f'\ntotal sitemap urls: {len(urls)}')

    slug_to_code, set_slugs = derive_slug_to_code(urls, our_expansions)
    rows, unmatched, vetoed = index_urls(urls, slug_to_code, set_slugs,
                                         our_cards, load_our_names())
    print(f'urls dropped because the slug names a different card: {vetoed}')
    matched_cards = {(r['set'], r['number']) for r in rows}
    unver = {k for k, v in our_cards.items() if v}
    covered_unver = matched_cards & unver

    print(f'catalog urls assigned: {len(rows)} across {len(matched_cards)} of '
          f'our {len(our_cards)} cards')
    print(f'urls that matched no card of ours: {unmatched} (other games/sets — expected)')
    print(f'UNVERIFIED cards with at least one URL: {len(covered_unver)}/{len(unver)} '
          f'({100.0 * len(covered_unver) / max(1, len(unver)):.1f}%)')
    with_id = [r for r in rows if r['product_id_in_url']]
    print(f'urls carrying an id in the slug (sibling products): {len(with_id)}')

    rows.sort(key=lambda r: (r['set'], r['number'], r['lang'], r['url']))
    with open(OUT, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)
    print(f'\nwrote {os.path.relpath(OUT, ROOT)} ({len(rows)} rows)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
