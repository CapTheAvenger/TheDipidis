#!/usr/bin/env python3
"""
Pokémon Card Text Scraper
=========================
Extracts ability + attack names from Limitless TCG card pages and writes
them to data/pokemon_card_text.json. The frontend's wishlist → Cardmarket
helper uses this to build the paste-text Cardmarket's parser actually
accepts (Pokémon need names + abilities + attacks; trainers / items /
energy match by name alone).

Output schema:
    {
      "ASC|248": "Recon Directive Dragon Headbutt",
      "ASC|221": "Sweet Scent",
      ...
    }

The key is "{set}|{number}" matching the cardId format the wishlist
already uses. The value is the space-separated list of ability +
attack NAMES (no damage, no energy symbols) — exactly what Cardmarket's
"Add Decklist to Wants" form needs after the card name (see
help.cardmarket.com/en/how-to-add-a-pkmn-decklist-to-wants).

Behaviour:
- Reads existing pokemon_card_text.json and skips cards already
  resolved → re-runs are incremental.
- Filters to Pokémon-type cards (skips Trainer/Item/Energy — they
  don't need this disambiguation).
- Optional --sets flag limits to a comma-separated set list, e.g.
  "ASC,MEG,JTG" — useful for fast updates after a rotation.
- Parallel via ThreadPoolExecutor with conservative defaults to avoid
  triggering Limitless rate-limits.

Usage:
    python pokemon_card_text_scraper.py                    # all Pokémon in DB
    python pokemon_card_text_scraper.py --sets ASC,MEG     # only these sets
    python pokemon_card_text_scraper.py --rebuild          # ignore existing JSON
"""

import argparse
import csv
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Optional, Set, Tuple

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'core'))
from card_scraper_shared import (
    setup_console_encoding, get_app_path, setup_logging, fetch_page_bs4,
    fix_mojibake,
)

setup_console_encoding()
logger = setup_logging('pokemon_card_text_scraper')

# Project paths — top-level data/ (frontend-served), not backend/core/data/
HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(os.path.dirname(HERE))
DATA_DIR = os.path.join(PROJECT_ROOT, 'data')
CARDS_CSV = os.path.join(DATA_DIR, 'all_cards_database.csv')
OUTPUT_JSON = os.path.join(DATA_DIR, 'pokemon_card_text.json')

# Card "type" values that are NOT Pokémon — skip these entirely.
# Limitless writes the actual Pokémon energy type ("Dragon", "Fire",
# "Psychic", …) in the type column for Pokémon cards, and the trainer
# subtype ("Supporter", "Item", "Tool", "Stadium") or energy subtype
# ("Basic Energy", "Special Energy") for non-Pokémon.
NON_POKEMON_TYPES = {
    'Supporter', 'Item', 'Tool', 'Stadium',
    'Basic Energy', 'Special Energy', 'Energy',
}

CARD_URL_TMPL = 'https://limitlesstcg.com/cards/{set}/{number}'


def _strip_attack_damage(text: str) -> str:
    """Remove trailing damage numbers from attack text.
    Examples:
      'Dragon Headbutt 70'   → 'Dragon Headbutt'
      'Cosmic Beam 70+'      → 'Cosmic Beam'
      'Crushing Hammer 30×'  → 'Crushing Hammer'
      'Pelletgun 10+'        → 'Pelletgun'
    """
    # Match a trailing space + digits + optional +/×/x/* qualifier.
    return re.sub(r'\s+\d+\s*[+×x*]?\s*$', '', text).strip()


def extract_disambiguation(soup) -> str:
    """Extract Cardmarket-disambiguation string from a Limitless card-page
    BeautifulSoup. Returns space-separated ability + attack names, or
    empty string for Trainer/Item/Energy cards (which have no
    .card-text-ability / .card-text-attack sections).

    The order matters: Cardmarket's parser greedily matches each token,
    so abilities first then attacks (top-to-bottom on the card) reads
    most naturally and matches what an automated decklist export
    typically produces.
    """
    if soup is None:
        return ''
    parts: List[str] = []

    # Abilities — "Ability: <Name>" on the .card-text-ability-info <p>.
    for el in soup.select('.card-text-ability-info'):
        text = fix_mojibake(el.get_text(' ', strip=True))
        # Strip the "Ability:" / "Poké-Power:" / "Poké-Body:" prefixes
        # Limitless uses for legacy formats too.
        m = re.match(r'^(?:Ability|Pok[ée]-?Power|Pok[ée]-?Body)\s*:\s*(.+)$',
                     text, re.IGNORECASE | re.DOTALL)
        if m:
            parts.append(re.sub(r'\s+', ' ', m.group(1)).strip())

    # Attacks — energy symbols are wrapped in <span class="ptcg-symbol">,
    # remove them so .get_text() yields just "Dragon Headbutt 70".
    for el in soup.select('.card-text-attack-info'):
        # Decompose a copy so we don't mutate the cached soup. (This
        # function is called once per page in a single thread anyway,
        # but doing it cleanly future-proofs the caller.)
        clone = el.__copy__()
        for sym in clone.select('.ptcg-symbol'):
            sym.decompose()
        text = fix_mojibake(clone.get_text(' ', strip=True))
        text = _strip_attack_damage(text)
        text = re.sub(r'\s+', ' ', text).strip()
        if text:
            parts.append(text)

    return ' '.join(parts)


def load_existing_output() -> Dict[str, str]:
    if not os.path.isfile(OUTPUT_JSON):
        return {}
    try:
        with open(OUTPUT_JSON, 'r', encoding='utf-8-sig') as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception as e:
        logger.warning('Existing %s unreadable, starting fresh: %s', OUTPUT_JSON, e)
        return {}


def save_output(data: Dict[str, str]) -> None:
    os.makedirs(os.path.dirname(OUTPUT_JSON), exist_ok=True)
    # Sort keys for deterministic diffs in git.
    sorted_data = {k: data[k] for k in sorted(data.keys())}
    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(sorted_data, f, ensure_ascii=False, indent=2)


def _scrape_one(card: Dict[str, str]) -> Tuple[str, str]:
    set_code = (card.get('set') or '').strip()
    number = (card.get('number') or '').strip()
    if not set_code or not number:
        return '', ''
    key = f'{set_code}|{number}'
    url = CARD_URL_TMPL.format(set=set_code, number=number)
    try:
        soup = fetch_page_bs4(url)
        if soup is None:
            logger.warning('  [%s] fetch failed', key)
            return key, ''
        return key, extract_disambiguation(soup)
    except Exception as e:
        logger.warning('  [%s] error: %s', key, e)
        return key, ''


def main() -> None:
    parser = argparse.ArgumentParser(description='Scrape Pokémon card ability + attack names from Limitless.')
    parser.add_argument('--sets', help='Comma-separated set codes to limit to (e.g. ASC,MEG,JTG)')
    parser.add_argument('--rebuild', action='store_true', help='Re-scrape every card, ignore existing JSON')
    parser.add_argument('--workers', type=int, default=5, help='Parallel fetchers (default 5; raise cautiously)')
    parser.add_argument('--limit', type=int, default=0, help='Stop after N successful scrapes (0 = no limit)')
    args = parser.parse_args()

    if not os.path.isfile(CARDS_CSV):
        logger.error('Card DB missing: %s', CARDS_CSV)
        sys.exit(1)

    existing = {} if args.rebuild else load_existing_output()
    set_filter: Optional[Set[str]] = None
    if args.sets:
        set_filter = {s.strip().upper() for s in args.sets.split(',') if s.strip()}
        logger.info('Set filter: %s', sorted(set_filter))

    # Build the work list — Pokémon cards in scope, not yet resolved.
    todo: List[Dict[str, str]] = []
    with open(CARDS_CSV, 'r', encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        for row in reader:
            type_ = (row.get('type') or '').strip()
            if type_ in NON_POKEMON_TYPES:
                continue
            set_code = (row.get('set') or '').strip().upper()
            if set_filter and set_code not in set_filter:
                continue
            number = (row.get('number') or '').strip()
            key = f'{set_code}|{number}'
            if key in existing and existing[key]:
                continue  # Already resolved
            todo.append({'set': set_code, 'number': number, 'name': row.get('name_en') or row.get('name', '')})

    if not todo:
        logger.info('No cards to scrape. (existing entries: %d)', len(existing))
        return

    logger.info('Scraping %d Pokémon cards from Limitless (workers=%d)…', len(todo), args.workers)
    started = time.time()
    done = 0
    successful = 0
    output = dict(existing)

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(_scrape_one, c): c for c in todo}
        try:
            for fut in as_completed(futures):
                key, val = fut.result()
                done += 1
                if key:
                    output[key] = val
                    if val:
                        successful += 1
                # Persist every 50 results so a Ctrl-C doesn't lose
                # everything. Cheap because the JSON is small.
                if done % 50 == 0:
                    save_output(output)
                    elapsed = time.time() - started
                    rate = done / elapsed if elapsed > 0 else 0
                    remaining = (len(todo) - done) / rate if rate > 0 else 0
                    logger.info('  %d/%d done (%d with text), %.1fs elapsed, ~%.0fs left',
                                done, len(todo), successful, elapsed, remaining)
                if args.limit and successful >= args.limit:
                    logger.info('Hit --limit %d, stopping.', args.limit)
                    break
        except KeyboardInterrupt:
            logger.warning('Interrupted — saving partial results.')

    save_output(output)
    logger.info('Done. %d total entries (%d new this run).',
                len(output), successful)


if __name__ == '__main__':
    main()
