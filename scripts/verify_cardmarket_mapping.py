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
    args = ap.parse_args()

    if args.recon:
        return recon(args.limit)

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
