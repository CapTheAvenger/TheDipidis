#!/usr/bin/env python3
"""
Pokémon Card Effects Scraper
============================
Extracts the full ability + attack effect text from Limitless TCG card
pages so the consistency builder can reason about card mechanics
(retreat lock, hand disruption, bench damage, ability lock, …) without
a hand-curated catalogue.

Companion to pokemon_card_text_scraper.py — that one only captures
attack *names* (for Cardmarket disambiguation). This one captures the
structured effect payload + costs + damage so a downstream classifier
can match patterns like "can't retreat" against actual card text.

Output: data/pokemon_card_effects.json
Schema (one entry per "{set}|{number}"):
    {
      "MEG|88": {
        "name": "Yveltal",
        "card_type": "Pokemon",          # Pokemon | Supporter | Item | Tool | Stadium | Basic Energy | Special Energy
        "energy_type": "Darkness",       # Pokémon only; '' for non-Pokémon
        "hp": "110",                     # Pokémon only
        "abilities": [
          { "name": "Dark Pulse",       "text": "Once during your turn, …" }
        ],
        "attacks": [
          { "name": "Clutch",
            "cost": ["D"],
            "damage": "20",
            "text": "During your opponent's next turn, the Defending Pokémon can't retreat." },
          { "name": "Dark Feather",
            "cost": ["D","D","C"],
            "damage": "110",
            "text": "" }
        ],
        "rules": [
          "When your TAG TEAM is Knocked Out, your opponent takes 3 Prize cards."
        ]
      }
    }

Behaviour:
- Reads existing JSON and skips cards already resolved → re-runs are
  incremental.
- Includes all card types (Pokémon + Trainer + Item + Tool + Stadium +
  Energy). The classifier needs trainer text to detect counter cards
  like Switch / Iono.
- Parallel via ThreadPoolExecutor with conservative defaults.
- Persists every 50 results so Ctrl-C never loses everything.

Usage:
    python pokemon_card_effects_scraper.py                    # all cards
    python pokemon_card_effects_scraper.py --sets MEG,POR     # only these sets
    python pokemon_card_effects_scraper.py --rebuild          # ignore existing JSON
    python pokemon_card_effects_scraper.py --workers 8        # raise (cautiously)
    python pokemon_card_effects_scraper.py --limit 100        # stop after 100 successes
"""

import argparse
import csv
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List, Optional, Set, Tuple

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'core'))
from card_scraper_shared import (
    setup_console_encoding, setup_logging, fetch_page_bs4, fix_mojibake,
)

setup_console_encoding()
logger = setup_logging('pokemon_card_effects_scraper')

# Project paths — top-level data/ (frontend-served), not backend/core/data/.
HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(os.path.dirname(HERE))
DATA_DIR = os.path.join(PROJECT_ROOT, 'data')
CARDS_CSV = os.path.join(DATA_DIR, 'all_cards_database.csv')
OUTPUT_JSON = os.path.join(DATA_DIR, 'pokemon_card_effects.json')

CARD_URL_TMPL = 'https://limitlesstcg.com/cards/{set}/{number}'

# Energy-symbol → single-letter key (matches PTCGL deck export). The
# Limitless DOM tags each cost symbol as <span class="ptcg-symbol ptcg-X">.
_ENERGY_LETTERS = {
    'ptcg-G': 'G', 'ptcg-R': 'R', 'ptcg-W': 'W', 'ptcg-L': 'L',
    'ptcg-P': 'P', 'ptcg-F': 'F', 'ptcg-D': 'D', 'ptcg-M': 'M',
    'ptcg-Y': 'Y', 'ptcg-N': 'N', 'ptcg-C': 'C',  # Y = Fairy (legacy), N = Dragon
}

# Card subtypes that are NOT Pokémon. Limitless writes these in the
# `type` column of all_cards_database.csv. The scraper still fetches
# them so we have effect text for trainer / item / energy cards.
NON_POKEMON_TYPES = {
    'Supporter', 'Item', 'Tool', 'Stadium',
    'Basic Energy', 'Special Energy', 'Energy',
}


def _norm_ws(text: str) -> str:
    return re.sub(r'\s+', ' ', text or '').strip()


def _split_attack_info(text: str) -> Tuple[str, str]:
    """Given an attack-info line like "Dragon Headbutt 70+", return
    (attack_name, damage). Damage may be empty ("Lock On" has no damage)."""
    m = re.match(r'^(.+?)\s+(\d+\s*[+×x*]?)\s*$', text or '', re.UNICODE)
    if m:
        return _norm_ws(m.group(1)), _norm_ws(m.group(2))
    return _norm_ws(text), ''


def _extract_cost(info_el) -> List[str]:
    """Read the energy-cost symbols from a .card-text-attack-info element
    in the order they appear."""
    cost: List[str] = []
    for sym in info_el.select('.ptcg-symbol'):
        cls = sym.get('class') or []
        for c in cls:
            if c in _ENERGY_LETTERS:
                cost.append(_ENERGY_LETTERS[c])
                break
    return cost


def _attack_info_text_clean(info_el) -> str:
    """Get the attack name + damage as plain text, with the energy
    symbols stripped (they aren't visible characters in the cleaned
    output)."""
    clone = info_el.__copy__()
    for sym in clone.select('.ptcg-symbol'):
        sym.decompose()
    return _norm_ws(fix_mojibake(clone.get_text(' ', strip=True)))


def extract_card_effects(soup, fallback_type: str = '') -> Dict[str, Any]:
    """Parse a Limitless card-detail BeautifulSoup into the structured
    effect payload. Returns an empty dict only if `soup` is None."""
    if soup is None:
        return {}

    out: Dict[str, Any] = {
        'name': '',
        'card_type': '',
        'energy_type': '',
        'hp': '',
        'abilities': [],
        'attacks': [],
        'rules': [],
    }

    # ── Title row: "Name - Type - HP" or "Name - Trainer" ──
    title_el = soup.select_one('p.card-text-title')
    if title_el:
        raw = _norm_ws(fix_mojibake(title_el.get_text(' ', strip=True)))
        parts = [p.strip() for p in raw.split(' - ')]
        if parts:
            out['name'] = parts[0]
        if len(parts) >= 3:
            out['card_type'] = 'Pokemon'
            out['energy_type'] = parts[1]
            hp_match = re.search(r'(\d+)', parts[2])
            if hp_match:
                out['hp'] = hp_match.group(1)
        elif len(parts) == 2:
            # "Name - Trainer" / "Name - Energy" — fall through to type
            # block below for the precise subtype (Supporter/Item/…).
            out['card_type'] = parts[1]

    # ── Type row (subtype): some cards have a separate "Trainer -
    # Supporter" block under .card-text-type. We prefer that over the
    # title's "Trainer" generic when present, because the classifier
    # uses subtype to gate text patterns ("Supporter once-per-turn"). ──
    type_el = soup.select_one('p.card-text-type')
    if type_el:
        raw = _norm_ws(fix_mojibake(type_el.get_text(' ', strip=True)))
        # Format examples: "Trainer - Supporter", "Trainer - Item",
        # "Special Energy", "Basic Pokémon", "Stage 1 Pokémon".
        parts = [p.strip() for p in raw.split(' - ')]
        # Take the most specific token (last) when it's not the generic
        # "Trainer" / "Pokémon" prefix.
        if len(parts) >= 2 and parts[-1] not in ('Trainer', 'Pokémon', 'Pokemon'):
            out['card_type'] = parts[-1]
        elif len(parts) == 1 and parts[0] and not out['card_type']:
            out['card_type'] = parts[0]

    # Fallback: the CSV "type" column (passed through fallback_type) is
    # already canonical for Trainer subtypes and Energy subtypes.
    if not out['card_type'] and fallback_type:
        out['card_type'] = fallback_type

    # ── Abilities (Pokémon only in practice) ──
    for ab_el in soup.select('.card-text-ability'):
        name_el = ab_el.select_one('.card-text-ability-name, .card-text-ability-info')
        effect_el = ab_el.select_one('.card-text-ability-effect')
        ab_name = ''
        if name_el is not None:
            raw = fix_mojibake(name_el.get_text(' ', strip=True))
            # Strip the "Ability:" / "Poké-Power:" / "Poké-Body:" prefix.
            m = re.match(r'^(?:Ability|Pok[ée]-?Power|Pok[ée]-?Body)\s*:\s*(.+)$',
                         raw, re.IGNORECASE | re.DOTALL)
            ab_name = _norm_ws(m.group(1) if m else raw)
        ab_text = ''
        if effect_el is not None:
            ab_text = _norm_ws(fix_mojibake(effect_el.get_text(' ', strip=True)))
        if ab_name or ab_text:
            out['abilities'].append({'name': ab_name, 'text': ab_text})

    # ── Attacks (Pokémon only in practice) ──
    for at_el in soup.select('.card-text-attack'):
        info_el = at_el.select_one('.card-text-attack-info')
        effect_el = at_el.select_one('.card-text-attack-effect')
        if info_el is None:
            continue
        cost = _extract_cost(info_el)
        info_text = _attack_info_text_clean(info_el)
        attack_name, damage = _split_attack_info(info_text)
        attack_text = ''
        if effect_el is not None:
            attack_text = _norm_ws(fix_mojibake(effect_el.get_text(' ', strip=True)))
        if attack_name or attack_text:
            out['attacks'].append({
                'name': attack_name,
                'cost': cost,
                'damage': damage,
                'text': attack_text,
            })

    # ── Generic effect blocks (Trainer / Item / Energy / rule boxes) ──
    # Limitless uses .card-text-section for these. Also captures
    # ACE SPEC / Radiant / TAG TEAM rule boxes on Pokémon.
    for sec in soup.select('.card-text-section'):
        # Skip blocks that already produced ability/attack rows.
        if sec.select_one('.card-text-ability, .card-text-attack, .card-text-wrr, .card-text-flavor, .card-text-title, .card-text-type'):
            continue
        text = _norm_ws(fix_mojibake(sec.get_text(' ', strip=True)))
        if not text:
            continue
        # Skip flavor-style metadata (rare but seen on some legacy cards).
        if text.startswith('Illus.') or text.startswith('NO.'):
            continue
        out['rules'].append(text)

    return out


def load_existing_output() -> Dict[str, Dict[str, Any]]:
    if not os.path.isfile(OUTPUT_JSON):
        return {}
    try:
        with open(OUTPUT_JSON, 'r', encoding='utf-8-sig') as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception as e:
        logger.warning('Existing %s unreadable, starting fresh: %s', OUTPUT_JSON, e)
        return {}


def save_output(data: Dict[str, Dict[str, Any]]) -> None:
    os.makedirs(os.path.dirname(OUTPUT_JSON), exist_ok=True)
    sorted_data = {k: data[k] for k in sorted(data.keys())}
    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(sorted_data, f, ensure_ascii=False, indent=2)


def _scrape_one(card: Dict[str, str]) -> Tuple[str, Dict[str, Any]]:
    set_code = (card.get('set') or '').strip()
    number = (card.get('number') or '').strip()
    if not set_code or not number:
        return '', {}
    key = f'{set_code}|{number}'
    url = CARD_URL_TMPL.format(set=set_code, number=number)
    try:
        soup = fetch_page_bs4(url)
        if soup is None:
            logger.warning('  [%s] fetch failed', key)
            return key, {}
        payload = extract_card_effects(soup, fallback_type=(card.get('type') or '').strip())
        # Last-resort: prefer CSV name if scrape didn't pick one up.
        if not payload.get('name'):
            payload['name'] = (card.get('name_en') or card.get('name') or '').strip()
        return key, payload
    except Exception as e:
        logger.warning('  [%s] error: %s', key, e)
        return key, {}


def main() -> None:
    parser = argparse.ArgumentParser(description='Scrape Pokémon card effect text from Limitless.')
    parser.add_argument('--sets', help='Comma-separated set codes to limit to (e.g. MEG,POR,JTG)')
    parser.add_argument('--rebuild', action='store_true', help='Re-scrape every card, ignore existing JSON')
    parser.add_argument('--workers', type=int, default=5, help='Parallel fetchers (default 5)')
    parser.add_argument('--limit', type=int, default=0, help='Stop after N successful scrapes (0 = no limit)')
    parser.add_argument('--include-non-pokemon', action='store_true',
                        help='Also fetch Trainer/Item/Energy cards (default: ON — needed for counter detection).')
    parser.add_argument('--pokemon-only', action='store_true',
                        help='Skip Trainer/Item/Energy cards (smaller, faster — but counter detection won\'t work).')
    args = parser.parse_args()

    if not os.path.isfile(CARDS_CSV):
        logger.error('Card DB missing: %s', CARDS_CSV)
        sys.exit(1)

    existing = {} if args.rebuild else load_existing_output()
    set_filter: Optional[Set[str]] = None
    if args.sets:
        set_filter = {s.strip().upper() for s in args.sets.split(',') if s.strip()}
        logger.info('Set filter: %s', sorted(set_filter))

    include_non_pokemon = not args.pokemon_only  # default True

    todo: List[Dict[str, str]] = []
    with open(CARDS_CSV, 'r', encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        for row in reader:
            type_ = (row.get('type') or '').strip()
            if not include_non_pokemon and type_ in NON_POKEMON_TYPES:
                continue
            set_code = (row.get('set') or '').strip().upper()
            if set_filter and set_code not in set_filter:
                continue
            number = (row.get('number') or '').strip()
            if not set_code or not number:
                continue
            key = f'{set_code}|{number}'
            if key in existing and existing[key]:
                continue
            todo.append({
                'set': set_code,
                'number': number,
                'type': type_,
                'name_en': row.get('name_en') or row.get('name') or '',
            })

    if not todo:
        logger.info('No cards to scrape. (existing entries: %d)', len(existing))
        return

    logger.info('Scraping %d cards from Limitless (workers=%d)…', len(todo), args.workers)
    started = time.time()
    done = 0
    successful = 0
    output = dict(existing)

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(_scrape_one, c): c for c in todo}
        try:
            for fut in as_completed(futures):
                key, payload = fut.result()
                done += 1
                if key:
                    output[key] = payload
                    if payload:
                        successful += 1
                if done % 50 == 0:
                    save_output(output)
                    elapsed = time.time() - started
                    rate = done / elapsed if elapsed > 0 else 0
                    remaining = (len(todo) - done) / rate if rate > 0 else 0
                    logger.info('  %d/%d done (%d ok), %.1fs elapsed, ~%.0fs left',
                                done, len(todo), successful, elapsed, remaining)
                if args.limit and successful >= args.limit:
                    logger.info('Hit --limit %d, stopping.', args.limit)
                    break
        except KeyboardInterrupt:
            logger.warning('Interrupted — saving partial results.')

    save_output(output)
    logger.info('Done. %d total entries (%d new this run).', len(output), successful)


if __name__ == '__main__':
    main()
