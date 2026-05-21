"""
Verify our city_league_analysis.csv card counts against Limitless source.

Paginates https://limitlesstcg.com/cards/<SET>/<NUM>/decklists/jp?show=100&page=N
back to a configurable start_date, counts how many JP decklists Limitless
actually has for the card, then compares with our CSV's deck_inclusion_count
sum across all archetypes.

Run examples
    # Single card by set/number:
    python backend/tools/verify_card_decklist_counts.py --card MEG/73

    # Top-10 most-played cards in our CSV:
    python backend/tools/verify_card_decklist_counts.py --top 10

    # Override the date floor (defaults to start_date from
    # city_league_analysis_settings.json or 13.03.2026 as last-resort fallback):
    python backend/tools/verify_card_decklist_counts.py --card MEG/73 --start-date 01.04.2026

Cloudflare note
    Uses the same _get_scraper() helper as the production scrapers. Datacenter
    IPs without a trusted reputation get 403'd by Limitless's edge — run this
    from the same host as the city_league_analysis_scraper, or from a
    residential/CI runner that already works for the scrape pipeline.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
from collections import defaultdict
from datetime import datetime
from typing import Optional

REPO_ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'backend', 'core'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'backend', 'scrapers'))

from bs4 import BeautifulSoup  # noqa: E402

try:
    from card_scraper_shared import safe_fetch_html  # type: ignore
except ImportError as e:
    print(f'[ERROR] Could not import safe_fetch_html: {e}', file=sys.stderr)
    sys.exit(2)

DECKLIST_URL = 'https://limitlesstcg.com/cards/{set}/{num}/decklists/jp?show=100&page={page}'
ANALYSIS_CSV = os.path.join(REPO_ROOT, 'data', 'city_league_analysis.csv')
SETTINGS_PATH = os.path.join(REPO_ROOT, 'data', 'city_league_analysis_settings.json')


def load_default_start_date() -> datetime:
    try:
        with open(SETTINGS_PATH, encoding='utf-8') as f:
            s = json.load(f)
        sd = s.get('sources', {}).get('city_league', {}).get('start_date', '13.03.2026')
        return datetime.strptime(sd, '%d.%m.%Y')
    except Exception:
        return datetime(2026, 3, 13)


def parse_limitless_date(raw: str) -> Optional[datetime]:
    raw = (raw or '').strip()
    for fmt in ('%d %b %y', '%d %b %Y', '%d %B %Y', '%Y-%m-%d', '%d.%m.%Y'):
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            continue
    return None


def fetch_decklist_page(set_code: str, num: str, page: int, delay: float = 1.5) -> Optional[str]:
    url = DECKLIST_URL.format(set=set_code, num=num, page=page)
    html = safe_fetch_html(url, timeout=30, retries=2, retry_delay=2.0, quiet=False)
    time.sleep(delay)
    return html if html else None


def parse_decklist_rows(html: str) -> list[dict]:
    """Each row: {date, player, placement, tournament, archetype_slugs, deck_url}.

    Limitless's /cards/<SET>/<NUM>/decklists/jp page layout: a single table
    where each <tr> with <td>s is one decklist entry. Selector guesses are
    defensive — if column count differs, the row is skipped (not crashed)."""
    soup = BeautifulSoup(html, 'lxml')
    rows = []
    for tr in soup.select('table tr'):
        cells = tr.find_all('td')
        if len(cells) < 3:
            continue
        texts = [c.get_text(' ', strip=True) for c in cells]
        date_str = next((parse_limitless_date(t) for t in texts if parse_limitless_date(t)), None)
        slugs = [img.get('alt', '') for img in tr.select('img.pokemon') if img.get('alt')]
        deck_link = tr.select_one('a[href*="/decks/list/"]')
        deck_url = deck_link.get('href') if deck_link else None
        tournament_link = tr.select_one('a[href*="/tournaments/"]')
        rows.append({
            'date': date_str,
            'cells_text': texts,
            'pokemon_slugs': slugs,
            'deck_url': deck_url,
            'tournament_url': tournament_link.get('href') if tournament_link else None,
        })
    return rows


def count_limitless_decklists(
    set_code: str,
    num: str,
    start_date: datetime,
    max_pages: int = 20,
    delay: float = 1.5,
) -> dict:
    """Returns {'count': N, 'pages_fetched': K, 'oldest_date': D, 'stopped_reason': str}."""
    total = 0
    oldest = None
    pages_fetched = 0
    last_status = 'completed'
    for page in range(1, max_pages + 1):
        html = fetch_decklist_page(set_code, num, page, delay=delay)
        pages_fetched += 1
        if not html:
            last_status = f'fetch-failed-page-{page}'
            break
        rows = parse_decklist_rows(html)
        if not rows:
            last_status = f'no-rows-page-{page} (end of pagination)'
            break
        page_in_range = 0
        page_all_too_old = True
        for r in rows:
            d = r.get('date')
            if d is None:
                continue
            if d >= start_date:
                page_in_range += 1
                page_all_too_old = False
                if oldest is None or d < oldest:
                    oldest = d
        total += page_in_range
        if page_all_too_old:
            last_status = f'all-too-old-on-page-{page}'
            break
    return {
        'count': total,
        'pages_fetched': pages_fetched,
        'oldest_date': oldest,
        'stopped_reason': last_status,
    }


def load_our_card_counts() -> dict:
    """For each card_identifier (e.g. "MEG 73"), sum deck_inclusion_count
    across all archetypes in city_league_analysis.csv."""
    counts: dict = defaultdict(int)
    with open(ANALYSIS_CSV, encoding='utf-8') as f:
        reader = csv.DictReader(f, delimiter=';')
        for row in reader:
            ident = (row.get('card_identifier') or '').strip()
            if not ident:
                continue
            try:
                counts[ident] += int((row.get('deck_inclusion_count') or '0').replace(',', '.').split('.')[0])
            except (ValueError, AttributeError):
                continue
    return counts


def normalize_card_arg(card: str) -> tuple[str, str]:
    card = card.strip().replace(' ', '/').upper()
    if '/' not in card:
        raise ValueError(f'--card must be SET/NUM (e.g. MEG/73), got {card!r}')
    set_code, num = card.split('/', 1)
    return set_code, num


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--card', help='Single card to verify, format SET/NUM (e.g. MEG/73)')
    parser.add_argument('--top', type=int, help='Verify the N most-frequent cards in our CSV instead of one')
    parser.add_argument('--start-date', help='Date floor DD.MM.YYYY (defaults to scraper settings)')
    parser.add_argument('--max-pages', type=int, default=20, help='Safety cap on pagination (default 20)')
    parser.add_argument('--delay', type=float, default=1.5, help='Seconds between requests (default 1.5)')
    parser.add_argument('--json-out', help='Optional path to write the report as JSON')
    args = parser.parse_args()

    if not args.card and not args.top:
        parser.error('Provide --card SET/NUM or --top N')

    start_date = (
        datetime.strptime(args.start_date, '%d.%m.%Y') if args.start_date else load_default_start_date()
    )
    print(f'Date floor: {start_date.strftime("%d.%m.%Y")} (decklists older than this are NOT counted)\n')

    our_counts = load_our_card_counts()

    cards_to_check: list[tuple[str, str]] = []
    if args.card:
        cards_to_check.append(normalize_card_arg(args.card))
    else:
        top = sorted(our_counts.items(), key=lambda kv: kv[1], reverse=True)[: args.top]
        for ident, _ in top:
            parts = ident.split()
            if len(parts) == 2:
                cards_to_check.append((parts[0], parts[1]))

    report = []
    for set_code, num in cards_to_check:
        ident = f'{set_code} {num}'
        ours = our_counts.get(ident, 0)
        print(f'== {ident} ==')
        print(f'   Fetching Limitless decklists for {set_code}/{num}...')
        result = count_limitless_decklists(set_code, num, start_date, args.max_pages, args.delay)
        gap = result['count'] - ours
        marker = '✓' if gap == 0 else ('LIMITLESS HIGHER' if gap > 0 else 'LIMITLESS LOWER')
        print(f'   Limitless count : {result["count"]} (pages={result["pages_fetched"]}, stop={result["stopped_reason"]})')
        print(f'   Our CSV count   : {ours}')
        print(f'   Gap             : {gap:+d}  [{marker}]')
        print()
        report.append({
            'set': set_code, 'num': num, 'identifier': ident,
            'limitless_count': result['count'], 'our_count': ours, 'gap': gap,
            'pages_fetched': result['pages_fetched'],
            'oldest_date': result['oldest_date'].isoformat() if result['oldest_date'] else None,
            'stopped_reason': result['stopped_reason'],
        })

    if args.json_out:
        with open(args.json_out, 'w', encoding='utf-8') as f:
            json.dump({
                'start_date': start_date.isoformat(),
                'cards': report,
            }, f, indent=2, ensure_ascii=False)
        print(f'JSON report written to {args.json_out}')


if __name__ == '__main__':
    main()
