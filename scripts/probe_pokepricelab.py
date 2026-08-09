#!/usr/bin/env python3
"""Probe pokepricelab.com as a source for Cardmarket product identity.

Why
---
Our weak spot is identity: which Cardmarket idProduct belongs to which
(set, number). Cardmarket itself 403s every CI runner and prints the id
nowhere a human can read it. pokepricelab.com appears to carry the id in
its catalog URLs:

    /fr/catalog/sv-black-star-promos-n-s-darmanitan-181-eu-817772
    /de/catalog/sv-black-star-promos-n-s-darmanitan-181

If that holds at scale it is exactly the missing link — and the page also
shows sold-basis and listing statistics we do not have.

This script ONLY looks. It answers, in order:

  1. What does robots.txt allow? If /catalog/ is disallowed, everything
     below is moot and we do not build a scraper. Terms of use are a
     human decision, so the probe prints what it finds and stops there.
  2. Is there a sitemap? A sitemap would let us map ids without crawling.
  3. Does a catalog page expose the idProduct, and in what form (URL
     suffix, embedded JSON, data attribute)?
  4. What does the id-less language URL do — redirect, canonical link, or
     a page of its own? The maintainer suspects the two ids are language
     variants of one card; that has to be checked, not assumed, because
     it would change what "the right product" even means.
  5. Which numbers does the page carry (sold basis / listings / population)
     and could they be parsed reliably?

Nothing is written to data/. Report, don't repair.
"""

import json
import re
import sys
import time
from urllib.parse import urljoin

BASE = 'https://pokepricelab.com'
UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36')

PROBE_URLS = [
    # The two the maintainer found — same card, one with an id suffix.
    '/fr/catalog/sv-black-star-promos-n-s-darmanitan-181-eu-817772',
    '/de/catalog/sv-black-star-promos-n-s-darmanitan-181',
    # A second card with a known ambiguous sibling pair (OBF Charizard ex
    # SAR vs Secret Rare) to see whether ids differ per print.
    '/de/catalog/obsidian-flames-charizard-ex-223',
    '/de/catalog/obsidian-flames-charizard-ex-228',
]

ID_PATTERNS = [
    ('url-suffix', re.compile(r'-eu-(\d{4,})\s*$')),
    ('idProduct-json', re.compile(r'"idProduct"\s*:\s*(\d+)')),
    ('cardmarket-id', re.compile(r'"cardmarket[_-]?(?:product_)?id"\s*:\s*"?(\d+)"?', re.I)),
    ('cardmarket-link', re.compile(r'cardmarket\.com/[^"\']*?(\d{5,})')),
]


def get(session, url, **kw):
    try:
        r = session.get(url, timeout=25, **kw)
        return r
    except Exception as e:  # noqa: BLE001
        print(f'  ERROR {url}: {e}')
        return None


def main():
    import requests  # noqa: PLC0415
    s = requests.Session()
    s.headers.update({'User-Agent': UA, 'Accept-Language': 'de,en;q=0.8'})

    print('=' * 70)
    print('1) robots.txt — the gate. If /catalog/ is disallowed we stop here.')
    print('=' * 70)
    r = get(s, urljoin(BASE, '/robots.txt'))
    robots = ''
    if r is not None:
        print(f'HTTP {r.status_code}, {len(r.text)} bytes')
        robots = r.text
        print(robots[:1500])
    sitemaps = re.findall(r'(?im)^\s*sitemap:\s*(\S+)', robots)
    disallows = re.findall(r'(?im)^\s*disallow:\s*(\S*)', robots)
    print(f'\n  sitemaps declared: {sitemaps or "none"}')
    print(f'  disallow rules: {disallows or "none"}')
    catalog_blocked = any(d and '/catalog' in d for d in disallows) or '/' in [d.strip() for d in disallows]
    print(f'  => /catalog/ appears {"BLOCKED" if catalog_blocked else "allowed"} by robots.txt')

    print('\n' + '=' * 70)
    print('2) sitemap — could give us ids without crawling')
    print('=' * 70)
    for sm in (sitemaps or [urljoin(BASE, '/sitemap.xml')])[:2]:
        r = get(s, sm)
        if r is None:
            continue
        print(f'{sm} -> HTTP {r.status_code}, {len(r.text)} bytes')
        if r.status_code == 200:
            locs = re.findall(r'<loc>([^<]+)</loc>', r.text)[:5]
            print(f'  entries (first 5 of {len(re.findall(r"<loc>", r.text))}): ')
            for loc in locs:
                print(f'    {loc}')
            with_id = [l for l in re.findall(r'<loc>([^<]+)</loc>', r.text)
                       if re.search(r'-eu-\d{4,}$', l)]
            print(f'  entries carrying an -eu-<id> suffix: {len(with_id)}')
        time.sleep(1.0)

    print('\n' + '=' * 70)
    print('2b) sub-sitemaps — do they enumerate catalog URLs we can map?')
    print('=' * 70)
    sub = [f'{BASE}/sitemap/{i}' for i in (0, 1)]
    total_urls = 0
    for sm in sub:
        r = get(s, sm)
        if r is None:
            continue
        locs = re.findall(r'<loc>([^<]+)</loc>', r.text)
        total_urls += len(locs)
        print(f'{sm} -> HTTP {r.status_code}, {len(locs)} urls')
        for loc in locs[:6]:
            print(f'    {loc}')
        catalog = [l for l in locs if '/catalog/' in l]
        with_id = [l for l in locs if re.search(r'-eu-\d{4,}$', l)]
        langs = sorted({m.group(1) for l in locs
                        if (m := re.search(r'pokepricelab\.com/([a-z]{2})/', l))})
        print(f'    catalog urls: {len(catalog)} | with -eu-<id>: {len(with_id)} '
              f'| languages: {langs}')
        time.sleep(1.0)
    print(f'  total urls sampled: {total_urls}')

    print('\n' + '=' * 70)
    print('3+4+5) catalog pages: id exposure, language behaviour, data fields')
    print('=' * 70)
    for path in PROBE_URLS:
        url = urljoin(BASE, path)
        print(f'\n--- {path}')
        r = get(s, url, allow_redirects=True)
        if r is None:
            continue
        print(f'  HTTP {r.status_code}, {len(r.text)} bytes')
        if r.history:
            print(f'  redirect chain: {" -> ".join(str(h.status_code) for h in r.history)} '
                  f'final {r.url}')
        if r.status_code != 200:
            continue
        html = r.text
        for label, pat in ID_PATTERNS:
            found = pat.findall(r.url if label == 'url-suffix' else html)
            if found:
                uniq = sorted(set(found))[:6]
                print(f'  id via {label}: {uniq}')
        canon = re.search(r'<link[^>]+rel="canonical"[^>]+href="([^"]+)"', html)
        if canon:
            print(f'  canonical: {canon.group(1)}')
        alts = re.findall(r'<link[^>]+hreflang="([^"]+)"[^>]+href="([^"]+)"', html)
        if alts:
            print(f'  hreflang alternates ({len(alts)}): {alts[:4]}')
        # Next.js/Nuxt payloads carry the structured record when present.
        for marker in ('__NEXT_DATA__', '__NUXT__', 'application/ld+json'):
            if marker in html:
                print(f'  payload marker present: {marker}')
        # The stat block the maintainer screenshotted.
        for label in ('LETZTER WERT', 'Ø 1T', 'Ø 7T', 'Ø 30T', 'TIEF', 'HOCH',
                      'POPULATION', 'Last value', 'Population'):
            if label.lower() in html.lower():
                print(f'  stat label found: {label}')
        time.sleep(1.5)

    print('\n' + '=' * 70)
    print('Verdict inputs collected. A scraper is only justified if robots.txt')
    print('allows /catalog/, the id is exposed deterministically, and a sitemap')
    print('or index exists so we do not have to guess URLs.')
    print('=' * 70)
    return 0


if __name__ == '__main__':
    sys.exit(main())
