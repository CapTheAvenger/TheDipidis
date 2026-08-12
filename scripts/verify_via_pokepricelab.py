#!/usr/bin/env python3
"""Cross-check our Cardmarket mapping against pokepricelab (step 2).

Step 1 (build_pokepricelab_index.py) worked out which catalog URL belongs
to which of OUR (set, number). This step fetches those pages for the cards
whose mapping is still `unverified` and reads the Cardmarket idProduct off
the page — the number Cardmarket itself never shows.

Why the page and not the URL
----------------------------
~8% of catalog URLs carry `-eu-<id>` in the slug, and it is tempting to
read identity straight out of the index. That is wrong. The probe run
(job 93291140118) showed the two forms carry DIFFERENT ids for the same
card:

    /de/catalog/sv-black-star-promos-n-s-darmanitan-181            -> 816614
    /fr/catalog/sv-black-star-promos-n-s-darmanitan-181-eu-817772  -> 817772

The suffixed URLs are SIBLING products. Only the base page states the id
of the product the card page is actually about. Comparing our mapping
against slug ids "finds" ~120 contradictions that are pure artefact.

So: one request per card, the German base URL, id read from the page.

Trust discipline
----------------
This script NEVER edits data/cardmarket_id_mapping.csv. It writes a
report. An agreement between two independent sources is evidence worth
promoting, but promoting it is a separate, deliberate step — a scraper
that silently rewrites card identity is exactly the failure mode this
project has been digging itself out of. `--promote` exists for that step
and is off by default.

Output: data/pokepricelab_verification.csv
    set, number, our_product_id, ppl_product_id, verdict, extracted_via,
    url, checked_at

verdicts:
    agree          both sources name the same idProduct
    disagree       they name different ones  -> worklist, never auto-fixed
    ambiguous      the page names several ids, none clearly primary
    no-id          page fetched, no Cardmarket id found
    fetch-failed   HTTP error / timeout (retried next run)
"""

import argparse
import csv
import os
import re
import sys
import time
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
OUT = os.path.join(DATA, 'pokepricelab_verification.csv')
INDEX = os.path.join(DATA, 'pokepricelab_catalog_index.csv')
PRICES = os.path.join(DATA, 'price_data.csv')
MAPPING = os.path.join(DATA, 'cardmarket_id_mapping.csv')

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36')
PACE = 1.0          # robots.txt has no Disallow; still, one page per second
FLUSH_EVERY = 25

FIELDS = ['set', 'number', 'our_product_id', 'ppl_product_id', 'verdict',
          'extracted_via', 'url', 'checked_at']

# Ordered by how much the match proves. An explicit idProduct parameter is
# unambiguous; a bare trailing number in a Cardmarket URL is a fallback and
# is recorded as such so a surprising result can be traced to its pattern.
ID_PATTERNS = [
    ('idProduct-param', re.compile(r'cardmarket\.com/[^"\'<>\s]*?[?&]idProduct=(\d{4,})', re.I)),
    ('idProduct-json', re.compile(r'"idProduct"\s*:\s*"?(\d{4,})"?')),
    ('cardmarket-link', re.compile(r'cardmarket\.com/[^"\'<>\s]*?(\d{5,})', re.I)),
]


def load_targets(only_unverified=True, limit=0):
    """(set, number) -> German base catalog URL, for the cards to check.

    Base URL only (no `-eu-<id>` suffix): that is the page that states the
    card's own product. German, because that is the market our prices come
    from — and every covered card has a `de` variant, so nothing is lost."""
    wanted = set()
    with open(PRICES, encoding='utf-8-sig', newline='') as f:
        for r in csv.DictReader(f):
            status = (r.get('mapping_status') or '').strip()
            if (not only_unverified) or status == 'unverified':
                wanted.add((r['set'].strip().upper(), r['number'].strip()))

    by_card = defaultdict(dict)
    with open(INDEX, encoding='utf-8-sig', newline='') as f:
        for r in csv.DictReader(f):
            if r['product_id_in_url']:
                continue                      # sibling product, not the card
            key = (r['set'].strip().upper(), r['number'].strip())
            if key in wanted:
                by_card[key][r['lang']] = r['url']

    targets = []
    for key in sorted(by_card):
        langs = by_card[key]
        url = langs.get('de') or langs.get('') or next(iter(langs.values()))
        targets.append((key, url))
    if limit:
        targets = targets[:limit]
    return targets, len(wanted)


def load_our_mapping():
    out = {}
    with open(MAPPING, encoding='utf-8-sig', newline='') as f:
        for r in csv.DictReader(f):
            out[(r['set'].strip().upper(), r['number'].strip())] = \
                str(r['cardmarket_product_id']).strip()
    return out


def load_done(targets=None):
    """Rows already checked, so a timed-out run resumes instead of restarting.

    Two kinds of row are deliberately NOT treated as done:
      · fetch-failed — exactly the ones worth retrying.
      · rows whose recorded URL is no longer the card's target URL. The
        index veto (build_pokepricelab_index.py) removed 61 URLs that
        pointed at a different card entirely; their verdicts were drawn
        from the wrong page and must not survive a re-run just because
        the card was "already checked"."""
    if not os.path.exists(OUT):
        return {}
    current = dict(targets or [])
    done = {}
    with open(OUT, encoding='utf-8-sig', newline='') as f:
        for r in csv.DictReader(f):
            key = (r['set'], r['number'])
            if r.get('verdict') == 'fetch-failed':
                continue
            if targets is not None and key in current and current[key] != r.get('url'):
                continue                      # URL changed → verdict is stale
            done[key] = r
    return done


def extract_id(html):
    """(id, pattern_name) or (None, reason).

    Several distinct ids on one page means the page links siblings too;
    there is no evidence-based way to pick one, so we refuse."""
    for name, pat in ID_PATTERNS:
        found = sorted({m for m in pat.findall(html)})
        if len(found) == 1:
            return found[0], name
        if len(found) > 1:
            return None, f'ambiguous:{name}:{"/".join(found[:4])}'
    return None, 'no-id'


def write_rows(rows):
    with open(OUT, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(sorted(rows, key=lambda r: (r['set'], r['number'])))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=0,
                    help='check only the first N cards (smoke run)')
    ap.add_argument('--all', action='store_true',
                    help='check every card that has a URL, not just unverified')
    ap.add_argument('--promote', action='store_true',
                    help='NOT IMPLEMENTED HERE ON PURPOSE — see module docstring')
    args = ap.parse_args()

    if args.promote:
        print('--promote is deliberately not implemented in this script.')
        print('Agreements are evidence; writing them into the mapping is a')
        print('separate, reviewed step. Read the report first.')
        return 2

    import requests  # noqa: PLC0415
    s = requests.Session()
    s.headers.update({'User-Agent': UA, 'Accept-Language': 'de,en;q=0.8'})

    targets, n_wanted = load_targets(only_unverified=not args.all,
                                     limit=args.limit)
    ours = load_our_mapping()
    done = load_done(targets)
    todo = [(k, u) for k, u in targets if k not in done]

    print(f'cards in scope: {n_wanted} | with a base URL: {len(targets)} | '
          f'already checked: {len(done)} | to fetch now: {len(todo)}')
    if not todo:
        print('nothing to do')
        return 0

    rows = list(done.values())
    stamp = time.strftime('%Y-%m-%d')
    counts = defaultdict(int)

    for i, (key, url) in enumerate(todo, 1):
        verdict = 'fetch-failed'
        pid, via = '', ''
        try:
            r = s.get(url, timeout=25)
            if r.status_code == 200:
                pid, via = extract_id(r.text)
                if pid is None:
                    verdict = 'ambiguous' if via.startswith('ambiguous') else 'no-id'
                    pid = ''
                else:
                    our = ours.get(key, '')
                    if not our:
                        verdict = 'no-mapping'
                    else:
                        verdict = 'agree' if our == pid else 'disagree'
            else:
                via = f'HTTP {r.status_code}'
                # 403/429 means we are being paced — slow down rather than
                # hammering on and calling the rest "missing".
                if r.status_code in (403, 429):
                    time.sleep(10)
        except Exception as e:                              # noqa: BLE001
            via = f'error:{type(e).__name__}'

        counts[verdict] += 1
        rows.append({
            'set': key[0], 'number': key[1],
            'our_product_id': ours.get(key, ''),
            'ppl_product_id': pid or '',
            'verdict': verdict, 'extracted_via': via,
            'url': url, 'checked_at': stamp,
        })

        if i % FLUSH_EVERY == 0 or i == len(todo):
            write_rows(rows)
            print(f'  {i}/{len(todo)} — ' +
                  ' '.join(f'{k}={v}' for k, v in sorted(counts.items())))
        time.sleep(PACE)

    write_rows(rows)

    print('\n' + '=' * 62)
    total = sum(counts.values())
    for k in sorted(counts):
        print(f'  {k:14s} {counts[k]:5d}  ({100.0 * counts[k] / max(1, total):.1f} %)')
    dis = [r for r in rows if r['verdict'] == 'disagree']
    if dis:
        print(f'\n{len(dis)} CONTRADICTIONS — reported, not repaired. First 15:')
        for r in dis[:15]:
            print(f'   {r["set"]:5s} {r["number"]:>5s}  ours={r["our_product_id"]:>8s} '
                  f'  pokepricelab={r["ppl_product_id"]:>8s}')
        print('\nA contradiction does NOT mean we are wrong — it means two')
        print('sources disagree and a human has to look. Check the card on')
        print('Cardmarket and pin it with scripts/pin_from_observation.py.')
    print(f'\nwrote {os.path.relpath(OUT, ROOT)} ({len(rows)} rows)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
