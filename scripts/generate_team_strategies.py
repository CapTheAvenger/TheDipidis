#!/usr/bin/env python3
"""Auto-generate beginner-friendly strategy explanations for the
Side Quest Champions teams via the Claude API.

Pipeline position: runs in champions-replica-scrape.yml right after
the scraper refreshes data/champions_replica_teams.json. For every
team that is NEW or whose Pokémon data CHANGED since the last run,
one Claude API call produces a bilingual (de + en) strategy guide
aimed at complete beginners. Results are cached in
data/champions_team_strategies.json keyed by replica code, so an
unchanged team costs zero API calls on subsequent runs.

The frontend (js/app-side-quest.js) shows the cached strategies via
an info button on each team card — no manual step anywhere.

Fail-soft policy (matches the rest of the scrape pipeline):
  * ANTHROPIC_API_KEY missing      → warning, exit 0, cache untouched
  * anthropic SDK not installed    → warning, exit 0
  * individual team generation
    fails (API error / bad JSON)   → warning, team skipped, next run
                                     retries it; successes still saved
  * 3 consecutive failures         → abort the loop (likely systemic:
                                     quota, outage), keep successes

Usage:
    python3 scripts/generate_team_strategies.py [TEAMS_JSON] [STRATEGIES_JSON]

Defaults: data/champions_replica_teams.json and
data/champions_team_strategies.json relative to the repo root (cwd).
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

MODEL = 'claude-opus-4-8'
MAX_TOKENS = 6000           # both languages in one response
MAX_GENERATIONS_PER_RUN = 25  # cost guard: full first run is ~20 teams
MAX_CONSECUTIVE_FAILURES = 3

# Bump this whenever SYSTEM_PROMPT changes in a way that should
# refresh EXISTING guides — cached entries with an older version
# regenerate on the next run even if the team itself is unchanged.
# v2: moves/abilities/items always bilingual "Deutsch (English)" /
#     "English (Deutsch)" (user request 2026-06-12).
PROMPT_VERSION = 2

DEFAULT_TEAMS_PATH = os.path.join('data', 'champions_replica_teams.json')
DEFAULT_STRATEGIES_PATH = os.path.join('data', 'champions_team_strategies.json')

# Entries for teams that dropped off the top-N list are kept (teams
# rotate back in), but the cache is bounded: when it exceeds this,
# the oldest absent entries get evicted.
MAX_CACHE_ENTRIES = 80


# ─────────────────────────── pure helpers ───────────────────────────
# (everything below up to the API section is unit-tested without
#  network access — see tests/python/test_generate_team_strategies.py)

def team_hash(team: Dict[str, Any]) -> str:
    """Stable content hash over the gameplay-relevant team data.

    Only fields that change the *strategy* feed the hash: the six
    Pokémon with item/ability/moves/EVs/nature. Cosmetic fields
    (rank, date_shared, team_name) don't trigger a regeneration.
    """
    mons = []
    for p in team.get('pokemon') or []:
        mons.append({
            'name':    (p.get('name') or '').strip(),
            'item':    (p.get('item') or '').strip(),
            'ability': (p.get('ability') or '').strip(),
            'tera':    (p.get('tera_type') or '').strip(),
            'evs':     (p.get('evs') or '').strip(),
            'nature':  (p.get('nature') or '').strip(),
            'moves':   [str(m).strip() for m in (p.get('moves') or [])],
        })
    blob = json.dumps(mons, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(blob.encode('utf-8')).hexdigest()[:16]


def teams_needing_generation(
    teams: List[Dict[str, Any]],
    cache: Dict[str, Any],
    prompt_version: int = PROMPT_VERSION,
) -> List[Dict[str, Any]]:
    """Teams with no cached strategy, a stale team_hash, or a guide
    generated under an older SYSTEM_PROMPT version."""
    strategies = cache.get('strategies') or {}
    todo = []
    for team in teams:
        code = team.get('replica_code') or ''
        if not code or not team.get('pokemon'):
            continue
        entry = strategies.get(code)
        if (not entry
                or entry.get('team_hash') != team_hash(team)
                or entry.get('prompt_version') != prompt_version):
            todo.append(team)
    return todo


def prune_cache(
    cache: Dict[str, Any],
    current_codes: List[str],
    max_entries: int = MAX_CACHE_ENTRIES,
) -> int:
    """Evict the oldest entries that are no longer on the team list
    once the cache exceeds `max_entries`. Returns eviction count."""
    strategies = cache.get('strategies') or {}
    if len(strategies) <= max_entries:
        return 0
    current = set(current_codes)
    absent = [
        (entry.get('generated_at') or '', code)
        for code, entry in strategies.items()
        if code not in current
    ]
    absent.sort()  # ISO timestamps sort chronologically
    evicted = 0
    for _, code in absent:
        if len(strategies) <= max_entries:
            break
        del strategies[code]
        evicted += 1
    return evicted


def extract_json(text: str) -> Optional[Dict[str, Any]]:
    """Parse the first JSON object out of a model response.

    Tolerates surrounding prose and ```json fences. Returns None if
    nothing parseable is found.
    """
    if not text:
        return None
    # Strip code fences if present
    fence = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', text, re.DOTALL)
    candidates = [fence.group(1)] if fence else []
    # Fall back to the outermost brace span
    start = text.find('{')
    end = text.rfind('}')
    if start != -1 and end > start:
        candidates.append(text[start:end + 1])
    for cand in candidates:
        try:
            obj = json.loads(cand)
            if isinstance(obj, dict):
                return obj
        except (json.JSONDecodeError, ValueError):
            continue
    return None


def validate_strategy(obj: Any) -> Tuple[bool, str]:
    """Check the generated object has both languages with the
    required sections. Returns (ok, reason_if_not)."""
    if not isinstance(obj, dict):
        return False, 'not a dict'
    for lang in ('de', 'en'):
        block = obj.get(lang)
        if not isinstance(block, dict):
            return False, f'missing "{lang}" block'
        if not (block.get('overview') or '').strip():
            return False, f'{lang}.overview empty'
        roles = block.get('roles')
        if not isinstance(roles, list) or not roles:
            return False, f'{lang}.roles empty'
        for r in roles:
            if not isinstance(r, dict) or not r.get('name') or not r.get('role'):
                return False, f'{lang}.roles entry malformed'
        plan = block.get('game_plan')
        if not isinstance(plan, list) or len(plan) < 2:
            return False, f'{lang}.game_plan too short'
        tips = block.get('tips')
        if tips is not None and not isinstance(tips, list):
            return False, f'{lang}.tips not a list'
    return True, ''


def format_team_for_prompt(team: Dict[str, Any]) -> str:
    """Render the team as compact plain text for the user message."""
    lines = [
        f"Team: {team.get('team_name') or '?'}",
        f"Turnier: {team.get('tournament') or '?'}"
        + (f" · Trainer: {team['trainer']}" if team.get('trainer') else ''),
    ]
    for p in team.get('pokemon') or []:
        moves = ', '.join(p.get('moves') or [])
        bits = [p.get('name') or '?']
        if p.get('item'):
            bits.append(f"@ {p['item']}")
        if p.get('ability'):
            bits.append(f"[{p['ability']}]")
        if p.get('nature'):
            bits.append(f"({p['nature']})")
        if p.get('tera_type'):
            bits.append(f"Tera: {p['tera_type']}")
        lines.append(f"- {' '.join(bits)}")
        if p.get('evs'):
            lines.append(f"  EVs: {p['evs']}")
        if moves:
            lines.append(f"  Attacken: {moves}")
    return '\n'.join(lines)


SYSTEM_PROMPT = """\
Du bist ein erfahrener Pokémon-VGC-Coach (Doppelkämpfe, Pokémon Champions). \
Deine Aufgabe: einem blutigen Anfänger erklären, wie ein Turnier-Team \
gespielt wird — ohne Fachjargon, und wo ein Fachbegriff unvermeidbar ist \
(z. B. "Rückenwind/Tailwind", "Intimidate"), erkläre ihn in einem Halbsatz.

Stil:
- Deutsch: Du-Form, einfach, freundlich, konkret. Englisch: ebenso einfach.
- Kurze Sätze. Keine Floskeln, kein Marketing-Ton.
- Konkrete Handlungsempfehlungen ("Schicke X und Y zuerst ins Feld, weil …"),
  nicht abstrakte Theorie.
- Wenn das Team eine Mega-Entwicklung oder mehrere Mega-Kandidaten hat:
  erkläre kurz, wann man welche wählt.
- Attacken, Fähigkeiten und Items nennst du IMMER zweisprachig, mit dem
  offiziellen Namen der jeweils anderen Sprache in Klammern:
  im deutschen Guide "Deutscher Name (English Name)", z. B.
  "Rückenwind (Tailwind)", "Bedroher (Intimidate)", "Prunusbeere (Sitrus Berry)";
  im englischen Guide "English Name (Deutscher Name)", z. B.
  "Tailwind (Rückenwind)", "Intimidate (Bedroher)", "Sitrus Berry (Prunusbeere)".
  Pokémon-Namen bleiben unverändert wie in den Teamdaten.
  Bist du dir bei einer offiziellen deutschen Übersetzung nicht sicher,
  schreibe nur den englischen Namen — niemals raten oder selbst übersetzen.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt, exakt in diesem Schema \
(kein Markdown, kein Text davor oder danach):

{
  "de": {
    "overview": "2-3 Sätze: Was will dieses Team grundsätzlich erreichen?",
    "roles": [
      {"name": "<Pokémon-Name exakt wie in den Teamdaten>", "role": "1-2 Sätze: Job dieses Pokémon im Team"}
    ],
    "game_plan": ["Schritt 1: …", "Schritt 2: …", "Schritt 3: …"],
    "tips": ["2-4 kurze Anfänger-Tipps (typische Fehler, Lead-Wahl, wann zurückziehen)"]
  },
  "en": { gleiche Struktur, gleiche Inhalte auf Englisch }
}

Die "roles"-Liste enthält genau ein Objekt pro Pokémon des Teams, in der \
Reihenfolge der Teamdaten."""


# ─────────────────────────── API section ───────────────────────────

def generate_for_team(client: Any, team: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """One Claude API call → validated bilingual strategy dict, or None."""
    user_msg = (
        "Erkläre die Strategie dieses Pokémon-Champions-Teams für einen "
        "absoluten Anfänger:\n\n" + format_team_for_prompt(team)
    )
    with client.messages.stream(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        thinking={'type': 'adaptive'},
        system=SYSTEM_PROMPT,
        messages=[{'role': 'user', 'content': user_msg}],
    ) as stream:
        message = stream.get_final_message()
    text = ''.join(
        block.text for block in message.content
        if getattr(block, 'type', '') == 'text'
    )
    obj = extract_json(text)
    ok, reason = validate_strategy(obj)
    if not ok:
        print(f"    ::warning::invalid strategy payload ({reason})")
        return None
    return obj


def main(argv: List[str]) -> int:
    teams_path = argv[1] if len(argv) > 1 else DEFAULT_TEAMS_PATH
    strategies_path = argv[2] if len(argv) > 2 else DEFAULT_STRATEGIES_PATH

    api_key = os.environ.get('ANTHROPIC_API_KEY', '').strip()
    if not api_key:
        print('::warning::ANTHROPIC_API_KEY not set — skipping strategy '
              'generation (add it as a repo Actions secret to enable).')
        return 0

    try:
        import anthropic
    except ImportError:
        print('::warning::anthropic SDK not installed — skipping strategy '
              'generation (it is listed in requirements.txt).')
        return 0

    try:
        with open(teams_path, 'r', encoding='utf-8') as f:
            teams_data = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        print(f'::warning::cannot read {teams_path}: {e}')
        return 0

    teams = teams_data.get('teams') or []
    if not teams:
        print('No teams in input — nothing to do.')
        return 0

    cache: Dict[str, Any] = {'_meta': {}, 'strategies': {}}
    if os.path.isfile(strategies_path):
        try:
            with open(strategies_path, 'r', encoding='utf-8') as f:
                loaded = json.load(f)
            if isinstance(loaded, dict):
                cache = loaded
                cache.setdefault('strategies', {})
        except (OSError, json.JSONDecodeError) as e:
            print(f'::warning::strategy cache unreadable, rebuilding: {e}')

    todo = teams_needing_generation(teams, cache)
    print(f'{len(teams)} teams on the list · {len(todo)} need generation '
          f'· {len(teams) - len(todo)} cached')

    if len(todo) > MAX_GENERATIONS_PER_RUN:
        print(f'::warning::capping generations at {MAX_GENERATIONS_PER_RUN} '
              f'this run ({len(todo)} pending); the rest follow tomorrow.')
        todo = todo[:MAX_GENERATIONS_PER_RUN]

    if todo:
        # Line-buffer stdout so per-team progress streams to the
        # Actions log even when callers forget `python -u`. Without
        # this, a 20-team run looks like 20 minutes of nothing
        # followed by a wall of output at the end.
        try:
            sys.stdout.reconfigure(line_buffering=True)
        except (AttributeError, OSError):
            pass
        client = anthropic.Anthropic(api_key=api_key)
        consecutive_failures = 0
        generated = 0
        for team in todo:
            code = team['replica_code']
            name = team.get('team_name') or code
            print(f'  generating: {name} ({code}) …', flush=True)
            try:
                strategy = generate_for_team(client, team)
            except anthropic.APIStatusError as e:
                print(f'    ::warning::API error {e.status_code} for {code}')
                strategy = None
            except anthropic.APIError as e:
                print(f'    ::warning::API error for {code}: {e}')
                strategy = None
            if strategy is None:
                consecutive_failures += 1
                if consecutive_failures >= MAX_CONSECUTIVE_FAILURES:
                    print(f'::warning::{consecutive_failures} consecutive '
                          'failures — aborting this run, keeping successes.')
                    break
                continue
            consecutive_failures = 0
            generated += 1
            cache['strategies'][code] = {
                'team_hash': team_hash(team),
                'prompt_version': PROMPT_VERSION,
                'team_name': team.get('team_name') or '',
                'generated_at': datetime.now(timezone.utc)
                                        .strftime('%Y-%m-%dT%H:%M:%SZ'),
                'model': MODEL,
                'de': strategy['de'],
                'en': strategy['en'],
            }
        print(f'Generated {generated}/{len(todo)} strategies.')
        if generated == 0:
            # No new content, no cache change worth writing — unless
            # pruning is due, handled below either way.
            pass

    current_codes = [t.get('replica_code') or '' for t in teams]
    evicted = prune_cache(cache, current_codes)
    if evicted:
        print(f'Pruned {evicted} stale cache entries.')

    cache['_meta'] = {
        'generated_by': 'scripts/generate_team_strategies.py',
        'model': MODEL,
        'last_run': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'strategy_count': len(cache['strategies']),
    }
    tmp = strategies_path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)
        f.write('\n')
    os.replace(tmp, strategies_path)
    print(f'Wrote {strategies_path} ({len(cache["strategies"])} strategies).')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
