#!/usr/bin/env python3
"""Verify Cardmarket product mappings against the LIVE product pages.

Why this exists
---------------
cardmarket_id_mapper.py resolves same-named cards (four "Charizard ex" in
OBF, four "Mega Darkrai ex" in PBL, ...) POSITIONALLY: our cards sorted by
card number are paired to candidate products sorted by trend price. That is
an unverified monotonicity assumption ("higher number = more expensive"),
and it is provably wrong for Special Art Rare vs Secret Rare chase cards:
commit #256 (2026-06-04) swapped OBF 223 <-> OBF 228, and today all 40
groups containing an SAR below a Secret Rare assign the SAR the cheaper
product (verified 2026-08-01, some off by >10x).

The ONLY external identity statement we have is Limitless' per-print
Cardmarket link in all_cards_database.csv::cardmarket_url — Limitless binds
our (set, number) to a concrete product page. This script fetches that page
and extracts the idProduct from the HTML, giving a VERIFIED
(set, number) -> idProduct row that the mapper then prefers over its
heuristic. No price maths, no ordering assumptions, no guessing: a page
either yields exactly one idProduct or the row is recorded as unparseable.

Operational rules (see CLAUDE.md):
  * Cardmarket blocks non-browser clients — send a browser User-Agent and
    a cardmarket.com Referer.
  * 403 means THROTTLED, never "missing". Back off, and a run of
    consecutive 403s trips a circuit breaker that ends the run — the
    remaining rows simply stay unverified until the next run.
  * Never re-fetch what is already verified: the output CSV is the resume
    state, keyed by (set, number).
  * Report, don't repair: this script only writes its own output file. The
    mapper decides what to do with it.

Output: data/cardmarket_mapping_verified.csv
  set, number, verified_product_id, status, evidence, heuristic_product_id,
  agrees_with_heuristic, checked_at, url

  status: verified | unparseable | ambiguous_html | http_<code> | error
"""

import argparse
import csv
import json
import os
import re
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                '..', 'backend', 'core'))

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
MAPPING = os.path.join(DATA, 'cardmarket_id_mapping.csv')
CARDS = os.path.join(DATA, 'all_cards_database.csv')
OUT = os.path.join(DATA, 'cardmarket_mapping_verified.csv')

HEADERS = {
    'User-Agent': ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                   'AppleWebKit/537.36 (KHTML, like Gecko) '
                   'Chrome/126.0.0.0 Safari/537.36'),
    'Referer': 'https://www.cardmarket.com/',
    'Accept-Language': 'en-GB,en;q=0.9,de;q=0.8',
}

# Patterns that carry the product id on a Cardmarket product page. A page
# may mention OTHER products (related items), so the form-input pattern is
# authoritative when present; JSON patterns are accepted only when every
# match agrees on a single value.
FORM_PATTERN = re.compile(r'name="idProduct"\s+value="(\d+)"')
JSON_PATTERNS = [
    re.compile(r'"idProduct"\s*:\s*(\d+)'),
    re.compile(r'data-product-id="(\d+)"'),
    re.compile(r'entityId=(\d+)'),
]

CIRCUIT_BREAKER_403 = 6      # consecutive 403s -> stop the whole run
PACE_SECONDS = 2.0           # base delay between page fetches
FIELDNAMES = ['set', 'number', 'verified_product_id', 'status', 'evidence',
              'heuristic_product_id', 'agrees_with_heuristic', 'checked_at',
              'url']


def extract_id_product(html: str):
    """Return (idProduct, evidence) or (None, reason).

    Never guesses: the hidden form input is authoritative; without it, all
    JSON-ish matches must agree on ONE value or the page is 'ambiguous_html'.
    """
    m = FORM_PATTERN.search(html)
    if m:
        return int(m.group(1)), 'form-input'
    values = set()
    hits = []
    for pat in JSON_PATTERNS:
        found = pat.findall(html)
        if found:
            hits.append(f"{pat.pattern.split(chr(92))[0][:16]}x{len(found)}")
            values.update(int(v) for v in found)
    if len(values) == 1:
        return values.pop(), 'json-unanimous(' + ','.join(hits) + ')'
    if len(values) > 1:
        return None, 'ambiguous_html'
    return None, 'unparseable'


def load_rows():
    with open(MAPPING, encoding='utf-8-sig', newline='') as f:
        mapping = list(csv.DictReader(f))
    with open(CARDS, encoding='utf-8-sig', newline='') as f:
        cards = {}
        for r in csv.DictReader(f):
            key = (r.get('set', '').strip(), r.get('number', '').strip())
            cards[key] = r
    return mapping, cards


def load_done():
    done = {}
    if os.path.exists(OUT):
        with open(OUT, encoding='utf-8-sig', newline='') as f:
            for r in csv.DictReader(f):
                done[(r['set'], r['number'])] = r
    return done


# ── Limitless price-fingerprint verification ─────────────────────────────
# Cardmarket 403s every CI runner (proven twice), but Limitless is
# reachable and its card page lists EVERY print with (a) the print's own
# /cards/SET/NUM link — Limitless' identity statement — and (b) the
# Cardmarket EUR price it shows for exactly that print. Matching that
# price against the guide prices of the candidate products identifies the
# product WITHOUT any ordering assumption, under strict uniqueness:
#
#   verified  <=>  exactly ONE candidate within ±15% of the shown price
#                  AND every other candidate at least 1.4x away.
#
# Anything else is recorded as fingerprint_ambiguous — never guessed.
# This is the same standard the OBF 223 proof used (guide sample: the
# shown price sits within ~4% of the product's trend; the next-nearest
# candidate was 4x away). Two same-priced sibling products fail the gap
# rule on purpose: they stay unverified.

FP_TOLERANCE = 1.15   # shown price vs candidate metric, ratio band
FP_MIN_GAP = 1.4      # every non-matching candidate must be this far away

US_PRICE = re.compile(r'^(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*€$')


def parse_limitless_eur(text):
    """Parse Limitless' US-formatted EUR text ('348.81€', '1,234.56€').

    Strict: anything not matching the known format returns None — a
    mis-parsed separator here is the documented 1000x price bug."""
    m = US_PRICE.match(str(text or '').strip())
    if not m:
        return None
    try:
        return float(m.group(1).replace(',', ''))
    except ValueError:
        return None


def parse_prints_prices(html, own_key):
    """{(SET, NUMBER): eur_float} for every print row on a Limitless card
    page. Row identity comes from the row's own /cards/SET/NUM link; the
    'current' row carries no link, so it gets own_key (the page we asked
    for). JP prints (/cards/jp/...) are skipped."""
    from bs4 import BeautifulSoup  # noqa: PLC0415
    soup = BeautifulSoup(html, 'lxml')
    out = {}
    for tr in soup.select('tr'):
        eur = tr.select_one('a.card-price.eur')
        if not eur:
            continue
        price = parse_limitless_eur(eur.get_text(strip=True))
        if price is None:
            continue
        link = tr.select_one("td:first-child a[href*='/cards/']")
        if link and link.has_attr('href'):
            parts = link['href'].split('/cards/', 1)[-1].strip('/').split('/')
            if parts and parts[0].lower() == 'jp':
                continue
            if len(parts) >= 2:
                out[(parts[0].upper(), parts[1])] = price
        elif 'current' in (tr.get('class') or []):
            out[own_key] = price
    return out


def fingerprint_match(shown_price, pool_metrics):
    """pool_metrics: {idProduct: guide_metric}. Returns (idProduct, evidence)
    on a unique, well-separated match, else (None, reason)."""
    if not shown_price or shown_price <= 0:
        return None, 'no_price_shown'
    matches, others = [], []
    for pid, metric in pool_metrics.items():
        if not metric or metric <= 0:
            continue
        ratio = max(metric / shown_price, shown_price / metric)
        (matches if ratio <= FP_TOLERANCE else others).append((pid, metric, ratio))
    if len(matches) != 1:
        return None, f'fingerprint_ambiguous({len(matches)} in band)'
    if any(r < FP_MIN_GAP for _, _, r in others):
        return None, 'fingerprint_ambiguous(gap)'
    pid, metric, ratio = matches[0]
    return pid, (f'limitless-fingerprint {shown_price}EUR~{metric}EUR '
                 f'(ratio {ratio:.2f}, pool {len(matches) + len(others)})')


def load_pools():
    """idProduct -> (idExpansion, base) and (idExpansion, base) -> {pid: metric}.

    The candidate pool for a mapped row is every catalogue product sharing
    expansion + base name with its currently mapped product — the same
    universe the mapper chose from, so the fingerprint can also land on
    the product the heuristic did NOT pick."""
    with open(os.path.join(DATA, 'products_singles_6.json'), encoding='utf-8') as f:
        singles = json.load(f)['products']
    with open(os.path.join(DATA, 'price_guide_6.json'), encoding='utf-8') as f:
        guide = {g.get('idProduct'): g for g in json.load(f)['priceGuides']}

    def base(name):
        return re.sub(r'\s*[\[(].*$', '', str(name or '')).strip().lower()

    product_group = {}
    pools = defaultdict(dict)
    for p in singles:
        key = (p.get('idExpansion'), base(p.get('name')))
        product_group[p['idProduct']] = key
        g = guide.get(p['idProduct']) or {}
        metric = g.get('trend') or g.get('avg')
        pools[key][p['idProduct']] = metric if metric and metric > 0 else None
    return product_group, pools


def limitless_verify(args):
    import requests  # noqa: PLC0415

    mapping, cards = load_rows()
    done = load_done()
    product_group, pools = load_pools()

    # Group ambiguous rows by (set, base_name); conflict groups first.
    groups = defaultdict(list)
    for r in mapping:
        if r.get('match_method', '').startswith('priced-by'):
            groups[(r['set'], r.get('base_name', ''))].append(r)
    ordered = sorted(groups.items(),
                     key=lambda kv: (0 if is_conflict_group_member(kv[1], cards) else 1,
                                     kv[0]))
    if args.only_conflicts:
        ordered = [kv for kv in ordered if is_conflict_group_member(kv[1], cards)]

    session = requests.Session()
    session.headers.update({'User-Agent': HEADERS['User-Agent']})

    fetched = 0
    consecutive_fail = 0
    new_rows = []
    for (sc, bname), members in ordered:
        pending = [m for m in members
                   if (m['set'], m['number']) not in done
                   or done[(m['set'], m['number'])]['status'] != 'verified']
        if not pending:
            continue
        if fetched >= args.limit:
            print(f"limit {args.limit} reached — resume with the next run")
            break
        if consecutive_fail >= CIRCUIT_BREAKER_403:
            print(f"::warning::circuit breaker: {consecutive_fail} consecutive "
                  f"failed page fetches — stopping this run.")
            break

        own_key = (pending[0]['set'], pending[0]['number'])
        url = f'https://limitlesstcg.com/cards/{own_key[0]}/{own_key[1]}'
        try:
            resp = session.get(url, timeout=25)
            fetched += 1
            if resp.status_code != 200:
                consecutive_fail += 1
                time.sleep(PACE_SECONDS * 2)
                continue
            consecutive_fail = 0
            prices = parse_prints_prices(resp.text, own_key)
        except Exception as e:  # noqa: BLE001
            consecutive_fail += 1
            print(f"::warning::fetch failed for {url}: {e}")
            continue

        for m in pending:
            key = (m['set'], m['number'])
            shown = prices.get(key)
            pool_key = product_group.get(int(m['cardmarket_product_id']))
            pool = pools.get(pool_key, {}) if pool_key else {}
            row_out = {
                'set': m['set'], 'number': m['number'],
                'verified_product_id': '', 'status': '', 'evidence': '',
                'heuristic_product_id': m['cardmarket_product_id'],
                'agrees_with_heuristic': '',
                'checked_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
                'url': url,
            }
            if shown is None:
                row_out['status'] = 'no_price_on_page'
            elif not pool:
                row_out['status'] = 'no_candidate_pool'
            else:
                pid, evidence = fingerprint_match(shown, pool)
                if pid is None:
                    row_out['status'] = evidence.split('(')[0]
                    row_out['evidence'] = evidence
                else:
                    row_out['status'] = 'verified'
                    row_out['verified_product_id'] = str(pid)
                    row_out['evidence'] = evidence
                    row_out['agrees_with_heuristic'] = (
                        'yes' if str(pid) == str(m['cardmarket_product_id']) else 'no')
            new_rows.append(row_out)
            done[key] = row_out
        time.sleep(PACE_SECONDS * 0.75)

    with open(OUT, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=FIELDNAMES)
        w.writeheader()
        for key in sorted(done):
            w.writerow({k: done[key].get(k, '') for k in FIELDNAMES})

    verified = [r for r in new_rows if r['status'] == 'verified']
    mismatches = [r for r in verified if r['agrees_with_heuristic'] == 'no']
    print(f"\nthis run: {fetched} pages | {len(new_rows)} rows judged | "
          f"{len(verified)} verified | {len(mismatches)} disagree with heuristic")
    for r in mismatches:
        print(f"::warning::MISMATCH {r['set']} {r['number']}: fingerprint says "
              f"{r['verified_product_id']}, mapping says {r['heuristic_product_id']} "
              f"| {r['evidence']}")
    total_verified = sum(1 for v in done.values() if v['status'] == 'verified')
    print(f"total recorded: {len(done)} | total verified: {total_verified}")
    return 0


def is_conflict_group_member(group_rows, cards):
    """A (set, base_name) group where an SAR/SIR sits at a LOWER number than
    a Secret/Hyper Rare — the proven systematic failure mode of the
    price-rank pairing."""
    def rarity(row):
        card = cards.get((row['set'], row['number']), {})
        return (card.get('rarity') or '').lower()
    sar_numbers = [r['number'] for r in group_rows
                   if 'special' in rarity(r) or 'illustration' in rarity(r)]
    secret_numbers = [r['number'] for r in group_rows
                      if 'secret' in rarity(r) or 'hyper' in rarity(r)]
    if not sar_numbers or not secret_numbers:
        return False

    def num_key(n):
        m = re.match(r'(\d+)', str(n))
        return int(m.group(1)) if m else 10 ** 9

    return min(num_key(n) for n in sar_numbers) < max(num_key(n) for n in secret_numbers)


def candidate_rows(mapping, cards, only_conflicts):
    """Ambiguous mapping rows, conflict groups first, each with its URL."""
    groups = defaultdict(list)
    for r in mapping:
        if r.get('match_method', '').startswith('priced-by'):
            groups[(r['set'], r.get('base_name', ''))].append(r)

    ordered = []
    for key, rows in groups.items():
        conflict = is_conflict_group_member(rows, cards)
        if only_conflicts and not conflict:
            continue
        for r in rows:
            card = cards.get((r['set'], r['number']), {})
            url = (card.get('cardmarket_url') or '').strip()
            if not url:
                continue
            ordered.append((0 if conflict else 1, r, url))
    ordered.sort(key=lambda t: (t[0], t[1]['set'], t[1]['number']))
    return [(r, url) for _, r, url in ordered]


def recon(limit):
    """Print the raw price-relevant HTML from a few Limitless card pages.

    Cardmarket 403s datacenter IPs (proven: first verify run, 6x403,
    circuit breaker, 0 verified). Limitless IS reachable from CI — the
    whole scraper stack runs against it — and its card page shows the
    Cardmarket price per print. Before building an extractor on
    assumptions, this mode dumps what the page ACTUALLY contains for a
    probe set to the job log; the extractor gets designed on that
    evidence. Probes include the proven-swapped OBF Charizard group.
    """
    import requests  # noqa: PLC0415

    probes = [('OBF', '223'), ('OBF', '228'), ('OBF', '125'),
              ('OBF', '215'), ('MEW', '199'), ('DRI', '230'), ('DRI', '239')]
    session = requests.Session()
    session.headers.update({'User-Agent': HEADERS['User-Agent']})
    for sc, num in probes[:limit]:
        url = f'https://limitlesstcg.com/cards/{sc}/{num}'
        print(f'\n===== {sc} {num} — {url} =====')
        try:
            resp = session.get(url, timeout=25)
            print(f'HTTP {resp.status_code}, {len(resp.text)} bytes')
            if resp.status_code != 200:
                continue
            html = resp.text
            # Everything around the cardmarket/price links, generously.
            for pat in (r'.{200}card-price[^>]*>.{300}',
                        r'.{100}cardmarket\.com.{300}'):
                for m in list(re.finditer(pat, html, re.S))[:6]:
                    print('--- match ---')
                    print(m.group(0).replace('\n', ' ')[:700])
        except Exception as e:  # noqa: BLE001
            print(f'ERROR: {e}')
        time.sleep(1.0)
    # Also document whether cardmarket still 403s this runner (2 probes).
    print('\n===== cardmarket reachability probe =====')
    cm = requests.Session()
    cm.headers.update(HEADERS)
    for url in ('https://www.cardmarket.com/en/Pokemon/Products/Singles/Obsidian-Flames/Charizard-ex-V3-OBF223',):
        try:
            r = cm.get(url, timeout=25)
            print(f'{url} -> HTTP {r.status_code}, {len(r.text)} bytes')
        except Exception as e:  # noqa: BLE001
            print(f'{url} -> ERROR {e}')
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=150,
                    help='max pages to fetch this run (paced ~2s apart)')
    ap.add_argument('--only-conflicts', action='store_true',
                    help='only the proven SAR-vs-Secret-Rare conflict groups')
    ap.add_argument('--dry-run', action='store_true',
                    help='list what would be fetched, fetch nothing')
    ap.add_argument('--recon', action='store_true',
                    help='dump price-relevant HTML from Limitless probe pages '
                         'to design the extractor on evidence, fetch nothing else')
    ap.add_argument('--source', choices=['limitless', 'cardmarket'],
                    default='limitless',
                    help='limitless (default): price-fingerprint via the '
                         'reachable Limitless card pages; cardmarket: direct '
                         'idProduct extraction (403-blocked from CI as of '
                         '2026-08-01, kept for when that changes)')
    args = ap.parse_args()

    if args.recon:
        return recon(args.limit)
    if args.source == 'limitless' and not args.dry_run:
        return limitless_verify(args)

    import requests  # noqa: PLC0415 — keep import local for --dry-run offline use

    mapping, cards = load_rows()
    done = load_done()
    todo = [(r, url) for r, url in candidate_rows(mapping, cards, args.only_conflicts)
            if (r['set'], r['number']) not in done
            or done[(r['set'], r['number'])]['status'].startswith(('http_', 'error'))]

    print(f"ambiguous rows pending: {len(todo)} (already recorded: {len(done)})")
    if args.dry_run:
        for r, url in todo[:args.limit]:
            print(f"  would fetch {r['set']} {r['number']} -> {url}")
        return 0

    session = requests.Session()
    session.headers.update(HEADERS)

    consecutive_403 = 0
    fetched = 0
    new_rows = []
    for r, url in todo:
        if fetched >= args.limit:
            print(f"limit {args.limit} reached — resume with the next run")
            break
        if consecutive_403 >= CIRCUIT_BREAKER_403:
            print(f"::warning::circuit breaker: {CIRCUIT_BREAKER_403} consecutive "
                  f"403s — Cardmarket is throttling this IP; stopping the run. "
                  f"403 means THROTTLED, not missing (CLAUDE.md).")
            break

        key = (r['set'], r['number'])
        row_out = {
            'set': r['set'], 'number': r['number'],
            'verified_product_id': '', 'status': '', 'evidence': '',
            'heuristic_product_id': r['cardmarket_product_id'],
            'agrees_with_heuristic': '',
            'checked_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
            'url': url,
        }
        try:
            resp = session.get(url, timeout=25, allow_redirects=True)
            fetched += 1
            if resp.status_code == 403:
                consecutive_403 += 1
                row_out['status'] = 'http_403'
                # exponential-ish backoff before the next attempt
                time.sleep(PACE_SECONDS * (2 ** min(consecutive_403, 4)))
            elif resp.status_code != 200:
                consecutive_403 = 0
                row_out['status'] = f'http_{resp.status_code}'
            else:
                consecutive_403 = 0
                pid, evidence = extract_id_product(resp.text)
                if pid is None:
                    row_out['status'] = evidence  # unparseable | ambiguous_html
                else:
                    row_out['status'] = 'verified'
                    row_out['verified_product_id'] = str(pid)
                    row_out['evidence'] = evidence
                    row_out['agrees_with_heuristic'] = (
                        'yes' if str(pid) == str(r['cardmarket_product_id']) else 'no')
        except Exception as e:  # noqa: BLE001 — record and continue
            row_out['status'] = 'error'
            row_out['evidence'] = str(e)[:120]

        new_rows.append(row_out)
        done[key] = row_out
        time.sleep(PACE_SECONDS)

    # Rewrite the whole file from `done` (stable resume state).
    with open(OUT, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=FIELDNAMES)
        w.writeheader()
        for key in sorted(done):
            w.writerow({k: done[key].get(k, '') for k in FIELDNAMES})

    verified = [r for r in new_rows if r['status'] == 'verified']
    mismatches = [r for r in verified if r['agrees_with_heuristic'] == 'no']
    print(f"\nthis run: {fetched} fetched | {len(verified)} verified | "
          f"{len(mismatches)} disagree with the heuristic mapping")
    for r in mismatches:
        print(f"::warning::MISMATCH {r['set']} {r['number']}: page says "
              f"{r['verified_product_id']}, mapping says {r['heuristic_product_id']}")
    total_verified = sum(1 for v in done.values() if v['status'] == 'verified')
    print(f"total recorded: {len(done)} | total verified: {total_verified}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
