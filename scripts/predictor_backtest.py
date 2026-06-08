#!/usr/bin/env python3
"""Meta Call predictor — Walk-Forward Backtest Harness.

Replays the predictor against past in-person majors using only the data
that was visible BEFORE the event. For each test event:

  1. Load `labs_tournament_decks.csv`, filter to rows from tournaments
     dated strictly before the event.
  2. Load the closest `online_share_history/YYYY-MM-DD.csv` snapshot
     dated ≤ event date.
  3. Run the selected formula → predicted shares per archetype.
  4. Compare against actual shares (the event's own labs rows).
  5. Report per-deck Δ, MAE across the top-N attending decks,
     and the worst misses for inspection.

The harness compares multiple formula variants on the same snapshot so
hypothesis A/B testing is just `python predictor_backtest.py --formula …`.

Test set: the seven TEF-POR Regionals + Special Events (Apr-25 to
May-30, 2026). Add more events by editing TEST_EVENTS.

Usage:
  python scripts/predictor_backtest.py
  python scripts/predictor_backtest.py --formula baseline
  python scripts/predictor_backtest.py --formula baseline,damper,floor
  python scripts/predictor_backtest.py --event 0068
  python scripts/predictor_backtest.py --json   # machine-readable output
  python scripts/predictor_backtest.py --trace dragapult --event 0068
  python scripts/predictor_backtest.py --force-set-addition
  python scripts/predictor_backtest.py --ground-truth data/turin_phase1.json --event 0069
"""

import argparse
import csv
import json
import os
import sys
from collections import defaultdict
from datetime import datetime

# ── Repo paths ───────────────────────────────────────────────────
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, 'data')

# ── Test events ──────────────────────────────────────────────────
# (tournament_id, ISO date, short name, meta_key, previous_format_key,
#  set_addition_only). Add Turin (tid=0069, TEF-CRI, prev=TEF-POR,
#  set_addition=True) once it lands in the labs CSV.
TEST_EVENTS = [
    ('0062', '2026-04-25', 'Prague',       'TEF-POR', 'SVI-ASC', False),
    ('0063', '2026-05-09', 'LA',           'TEF-POR', 'SVI-ASC', False),
    ('0064', '2026-05-16', 'Utrecht',      'TEF-POR', 'SVI-ASC', False),
    ('0065', '2026-05-16', 'Campinas',     'TEF-POR', 'SVI-ASC', False),
    ('0066', '2026-05-23', 'Melbourne',    'TEF-POR', 'SVI-ASC', False),
    # 0067 Lima omitted — Special Event, 485 players, noisy
    ('0068', '2026-05-30', 'Indianapolis', 'TEF-POR', 'SVI-ASC', False),
    # Turin — first TEF-CRI major. Not in labs CSV yet (scraper hasn't
    # run), so backtests require --ground-truth docs/turin_final.json
    # to load actuals. TEF-POR → TEF-CRI is a set-addition rotation
    # → floor + damper fire.
    ('0069', '2026-06-07', 'Turin',        'TEF-CRI', 'TEF-POR', True),
]

# ── Utility ──────────────────────────────────────────────────────

def parse_eu(value):
    """Parse a European-formatted number (uses ',' as decimal separator)."""
    if value is None:
        return 0.0
    s = str(value).replace(',', '.').strip()
    try:
        return float(s)
    except ValueError:
        return 0.0


def normalize_deck(name):
    """Mirror the JS normalize() — lowercase + collapse whitespace.
    Used as the cross-source join key."""
    return ' '.join(str(name).lower().split())


def load_labs():
    path = os.path.join(DATA, 'labs_tournament_decks.csv')
    with open(path, encoding='utf-8-sig') as f:
        return list(csv.DictReader(f))


def labs_by_tournament(rows):
    """tid -> { date, name, meta, players, rows[] }."""
    out = {}
    for r in rows:
        tid = (r.get('tournament_id') or '').strip()
        if not tid:
            continue
        if tid not in out:
            date = (r.get('tournament_date') or '').strip()
            if not date:
                scr = (r.get('scraped_at') or '').strip()
                date = scr[:10] if scr else ''
            out[tid] = {
                'date': date,
                'name': (r.get('tournament_name') or '').strip(),
                'meta': (r.get('meta') or '').strip().upper(),
                'players': int(r.get('total_players') or 0),
                'rows': [],
            }
        out[tid]['rows'].append(r)
    return out


def actual_shares(tinfo):
    """For one tournament's rows, return { norm_name: share_pct }."""
    out = {}
    for r in tinfo['rows']:
        name = (r.get('deck_name') or '').strip()
        if not name:
            continue
        share = parse_eu(r.get('share_pct') or '0')
        if share <= 0:
            continue
        out[normalize_deck(name)] = share
    return out


def load_online_snapshot(date_str):
    """Closest online_share_history snapshot dated ≤ date_str.
    Returns { norm_name: ladder_share_pct }."""
    hist_dir = os.path.join(DATA, 'online_share_history')
    if not os.path.isdir(hist_dir):
        return {}
    candidates = sorted(
        f for f in os.listdir(hist_dir)
        if f.endswith('.csv') and f[:10] <= date_str
    )
    if not candidates:
        return {}
    path = os.path.join(hist_dir, candidates[-1])
    out = {}
    with open(path, encoding='utf-8-sig') as f:
        reader = csv.reader(f, delimiter=';')
        header = next(reader, [])
        # Header: deck_name;rank;count;share;winrate
        share_idx = header.index('share') if 'share' in header else 3
        name_idx = header.index('deck_name') if 'deck_name' in header else 0
        for row in reader:
            if len(row) <= max(share_idx, name_idx):
                continue
            name = row[name_idx].strip()
            share = parse_eu(row[share_idx])
            if name and 0 < share < 100:
                out[normalize_deck(name)] = share
    return out


def load_online_top8(cutoff_date):
    """Per-archetype online-tournament aggregates (top8_conv, brought).
    No date filtering on the file (it's already an aggregate); the
    cutoff_date is a placeholder for later when we add per-date data."""
    path = os.path.join(DATA, 'online_tournament_top8_decks.csv')
    out = {}
    if not os.path.exists(path):
        return out
    with open(path, encoding='utf-8-sig') as f:
        reader = csv.DictReader(f, delimiter=';')
        for r in reader:
            name = (r.get('deck_name') or '').strip()
            if not name:
                continue
            out[normalize_deck(name)] = {
                'tournaments_seen': int(r.get('tournaments_seen') or 0),
                'brought':          parse_eu(r.get('total_brought_weighted') or '0'),
                'top8':             parse_eu(r.get('top8_count_weighted') or '0'),
                'top8_conv':        parse_eu(r.get('top8_conv_rate') or '0'),
                'wr_in_top8':       parse_eu(r.get('avg_winrate_in_top8') or '0'),
            }
    return out


def pre_event_labs(by_tid, cutoff_date):
    """All labs rows from tournaments dated strictly before cutoff_date."""
    out = []
    for tid, info in by_tid.items():
        if info['date'] and info['date'] < cutoff_date:
            for r in info['rows']:
                out.append((tid, info, r))
    return out


def aggregate_labs(pre_rows, meta_key, late_tids=None):
    """Per-deck player-weighted aggregates from pre-event labs.

    Returns: norm_name -> {
        brought_full, brought_early, brought_late,
        day1, day2, win_pct, players_full
    }
    """
    agg = defaultdict(lambda: {
        'bSum': 0, 'bP': 0, 'eSum': 0, 'eP': 0, 'lSum': 0, 'lP': 0,
        'd1Sum': 0, 'd2Sum': 0, 'wpSum': 0, 'wpP': 0,
    })
    late_tids = late_tids or set()
    for tid, info, r in pre_rows:
        if info['meta'] != meta_key:
            continue
        name = (r.get('deck_name') or '').strip()
        if not name:
            continue
        k = normalize_deck(name)
        share = parse_eu(r.get('share_pct') or '0')
        players = int(r.get('player_count') or 0)
        if players <= 0 or share <= 0:
            continue
        d1 = parse_eu(r.get('day1_share_pct') or '0')
        d2 = parse_eu(r.get('day2_share_pct') or '0')
        wp = parse_eu(r.get('win_pct') or '0')
        a = agg[k]
        a['bSum']  += share * players
        a['bP']    += players
        a['d1Sum'] += d1 * players
        a['d2Sum'] += d2 * players
        a['wpSum'] += wp * players
        a['wpP']   += players
        if tid in late_tids:
            a['lSum'] += share * players
            a['lP']   += players
        else:
            a['eSum'] += share * players
            a['eP']   += players

    out = {}
    for k, a in agg.items():
        if a['bP'] <= 0:
            continue
        out[k] = {
            'brought_full':  a['bSum'] / a['bP'],
            'brought_early': (a['eSum'] / a['eP']) if a['eP'] > 0 else 0,
            'brought_late':  (a['lSum'] / a['lP']) if a['lP'] > 0 else 0,
            'day1':          a['d1Sum'] / a['bP'],
            'day2':          a['d2Sum'] / a['bP'],
            'win_pct':       a['wpSum'] / a['wpP'] if a['wpP'] > 0 else 0,
            'players_full':  a['bP'],
        }
    return out


def last_meta_labs(by_tid, prev_meta_key, set_addition_only):
    """Player-weighted full-period share for every deck in previous format,
    plus early/late split. Returns {} if previous meta unset or not a
    set-addition rotation."""
    if not prev_meta_key or not set_addition_only:
        return {}
    prev_tids = sorted(
        (tid for tid, info in by_tid.items() if info['meta'] == prev_meta_key),
        key=lambda t: by_tid[t]['date'],
    )
    if not prev_tids:
        return {}
    late_set = set(prev_tids[-2:])
    agg = defaultdict(lambda: {'eSum': 0, 'eP': 0, 'lSum': 0, 'lP': 0})
    for tid in prev_tids:
        for r in by_tid[tid]['rows']:
            share = parse_eu(r.get('share_pct') or '0')
            players = int(r.get('player_count') or 0)
            name = (r.get('deck_name') or '').strip()
            if not name or share <= 0 or players <= 0:
                continue
            k = normalize_deck(name)
            if tid in late_set:
                agg[k]['lSum'] += share * players
                agg[k]['lP']   += players
            else:
                agg[k]['eSum'] += share * players
                agg[k]['eP']   += players
    out = {}
    for k, a in agg.items():
        fullP = a['eP'] + a['lP']
        if fullP <= 0:
            continue
        out[k] = {
            'full':   (a['eSum'] + a['lSum']) / fullP,
            'early':  (a['eSum'] / a['eP']) if a['eP'] > 0 else 0,
            'late':   (a['lSum'] / a['lP']) if a['lP'] > 0 else 0,
        }
    return out


# ── Formulas ─────────────────────────────────────────────────────
# Each formula takes the same context dict (snapshots + aggregates)
# and returns { norm_name: raw_predicted_share }. Renormalisation +
# family-cap are applied in `run_formula` so they're the same across
# all variants.

def formula_baseline(ctx, trace=None):
    """Mode A baseline: 0.30 ladder + 0.10 brought + 0.50 top8boost + 0.10 weekly.
    `weekly` falls back to ladder when no week-ago history available
    in the harness (Predictor 3.0 mirrors this in production).

    If `trace` is a deck-name substring (lowercased), append a dict to
    `ctx['trace_log']` for each matching deck so callers can inspect
    the exact contribution of each signal."""
    out = {}
    universe = set(ctx['ladder']) | set(ctx['labs_pre'])
    for k in universe:
        ladder = ctx['ladder'].get(k, 0)
        labs   = ctx['labs_pre'].get(k, {})
        brought = labs.get('brought_full', 0)
        d1 = labs.get('day1', 0)
        d2 = labs.get('day2', 0)
        # Top-8 boost: brought × clip(d2/d1, 0.5, 2.0)
        boost = max(0.5, min(2.0, d2 / d1 if d1 > 0 else 1.0))
        top8 = brought * boost
        pred = 0.30 * ladder + 0.10 * brought + 0.50 * top8 + 0.10 * ladder
        if pred > 0:
            out[k] = pred
        if trace and trace in k:
            ctx.setdefault('trace_log', []).append({
                'stage': 'baseline', 'deck': k,
                'ladder': round(ladder, 2), 'brought': round(brought, 2),
                'd1': round(d1, 2), 'd2': round(d2, 2),
                'boost_factor': round(boost, 2),
                'top8_term': round(top8, 2),
                'pred': round(pred, 2),
                'breakdown': {
                    'ladder_×_0.30': round(0.30 * ladder, 2),
                    'brought_×_0.10': round(0.10 * brought, 2),
                    'top8_×_0.50': round(0.50 * top8, 2),
                    'weekly_×_0.10': round(0.10 * ladder, 2),
                },
            })
    return out


def formula_baseline_plus_floor(ctx, trace=None):
    """Baseline + Predictor 5.5 floor (last-meta full avg × 0.7)."""
    out = formula_baseline(ctx, trace=trace)
    floor_factor = 0.7
    for k, lm in ctx['last_meta'].items():
        floor = lm['full'] * floor_factor
        if floor > 0 and out.get(k, 0) < floor:
            if trace and trace in k:
                ctx.setdefault('trace_log', []).append({
                    'stage': 'floor', 'deck': k,
                    'lm_full': round(lm['full'], 2),
                    'floor_value': round(floor, 2),
                    'pred_before': round(out.get(k, 0), 2),
                    'pred_after': round(floor, 2),
                })
            out[k] = floor
    return out


def formula_baseline_plus_damper(ctx, trace=None):
    """Baseline + decline-damper on baseline when lateShare/earlyShare < 0.85."""
    out = formula_baseline(ctx, trace=trace)
    damper_factor = 0.85
    damper_threshold = 0.85
    for k, lm in ctx['last_meta'].items():
        e, l = lm['early'], lm['late']
        if e > 0 and l > 0 and (l / e) < damper_threshold:
            if k in out:
                if trace and trace in k:
                    ctx.setdefault('trace_log', []).append({
                        'stage': 'damper', 'deck': k,
                        'lm_early': round(e, 2), 'lm_late': round(l, 2),
                        'ratio': round(l/e, 2),
                        'pred_before': round(out[k], 2),
                        'pred_after': round(out[k] * damper_factor, 2),
                    })
                out[k] *= damper_factor
    return out


def formula_full(ctx, trace=None):
    """Baseline + decline-damper + floor + family cap."""
    out = formula_baseline_plus_damper(ctx, trace=trace)
    floor_factor = 0.7
    for k, lm in ctx['last_meta'].items():
        floor = lm['full'] * floor_factor
        if floor > 0 and out.get(k, 0) < floor:
            if trace and trace in k:
                ctx.setdefault('trace_log', []).append({
                    'stage': 'floor', 'deck': k,
                    'lm_full': round(lm['full'], 2),
                    'floor_value': round(floor, 2),
                    'pred_before': round(out.get(k, 0), 2),
                    'pred_after': round(floor, 2),
                })
            out[k] = floor
    return out


def formula_floor_then_damper(ctx, trace=None):
    """Floor first (lift under-called decks), THEN damper (knock down
    declining decks that got floor-lifted too high).

    Hypothesis: the production sequence (damper → floor) wastes the
    damper because the floor immediately undoes it. Reversing the order
    lets declining decks get a smaller post-floor share."""
    out = formula_baseline(ctx, trace=trace)
    floor_factor = 0.7
    for k, lm in ctx['last_meta'].items():
        floor = lm['full'] * floor_factor
        if floor > 0 and out.get(k, 0) < floor:
            out[k] = floor
    damper_factor = 0.85
    damper_threshold = 0.85
    for k, lm in ctx['last_meta'].items():
        e, l = lm['early'], lm['late']
        if e > 0 and l > 0 and (l / e) < damper_threshold:
            if k in out:
                out[k] *= damper_factor
    return out


def formula_consolidation(ctx, trace=None):
    """Floor-first + within-family consolidation boost for the largest
    variant. Tries to address the Turin within-family split bug where
    every Dragapult variant got the same TEF-POR proportional floor,
    leaving solo under and Dusknoir under (real Turin: solo 46 % of
    family vs predicted 40 %; Dusknoir 34 % vs predicted 19 %)."""
    out = formula_floor_then_damper(ctx, trace=trace)
    # Identify each family and find its largest variant
    family_groups = defaultdict(list)
    for k in out:
        fam = extract_family(k)
        if fam:
            family_groups[fam].append(k)
    boost = 0.15  # 15 % shift from smaller variants to top-2 variants
    for fam, members in family_groups.items():
        if len(members) < 2:
            continue
        sorted_members = sorted(members, key=lambda m: -out.get(m, 0))
        # Move `boost`% of the smallest variants' share to the top-2
        top2 = sorted_members[:2]
        rest = sorted_members[2:]
        if not rest:
            continue
        donation = sum(out[m] * boost for m in rest)
        for m in rest:
            out[m] *= (1 - boost)
        # Split donation 60/40 between top-1 and top-2
        if len(top2) == 2:
            out[top2[0]] += donation * 0.60
            out[top2[1]] += donation * 0.40
        else:
            out[top2[0]] += donation
    return out


def formula_consolidation_floor85(ctx, trace=None):
    """Consolidation + bumped floor factor 0.7 → 0.85. Hypothesis: the
    current 0.7 floor under-lifts Tier-2 in-person mainstays (Basic Box,
    Slowking, Honchkrow, Mega Lucario) whose pilots reliably bring them
    but whose online ladder share doesn't reflect this.

    At 0.85 a TEF-POR 2.47 % deck floors at 2.10 % instead of 1.73 %.
    """
    out = formula_baseline(ctx, trace=trace)
    floor_factor = 0.85
    for k, lm in ctx['last_meta'].items():
        floor = lm['full'] * floor_factor
        if floor > 0 and out.get(k, 0) < floor:
            out[k] = floor
    damper_factor = 0.85
    damper_threshold = 0.85
    for k, lm in ctx['last_meta'].items():
        e, l = lm['early'], lm['late']
        if e > 0 and l > 0 and (l / e) < damper_threshold:
            if k in out:
                out[k] *= damper_factor
    # Within-family consolidation
    family_groups = defaultdict(list)
    for k in out:
        fam = extract_family(k)
        if fam:
            family_groups[fam].append(k)
    boost = 0.15
    for fam, members in family_groups.items():
        if len(members) < 2:
            continue
        sorted_members = sorted(members, key=lambda m: -out.get(m, 0))
        top2 = sorted_members[:2]
        rest = sorted_members[2:]
        if not rest:
            continue
        donation = sum(out[m] * boost for m in rest)
        for m in rest:
            out[m] *= (1 - boost)
        if len(top2) == 2:
            out[top2[0]] += donation * 0.60
            out[top2[1]] += donation * 0.40
        else:
            out[top2[0]] += donation
    return out


FORMULAS = {
    'baseline':                 formula_baseline,
    'baseline+floor':           formula_baseline_plus_floor,
    'baseline+damper':          formula_baseline_plus_damper,
    'full':                     formula_full,
    'floor_then_damper':        formula_floor_then_damper,
    'consolidation':            formula_consolidation,
    'consolidation_floor85':    formula_consolidation_floor85,
}


# ── Family-cap + renormalize (post-processing, formula-agnostic) ──

def extract_family(deck_name):
    """Cheap family heuristic: first word, with a couple of compound
    overrides. Mirrors the JS extractMainPokemon shape well enough
    for backtest aggregation. Production uses deck_families.json
    overrides we don't replicate here yet."""
    parts = deck_name.lower().split()
    if not parts:
        return ''
    # Compound-prefix exceptions
    compounds = {
        ('mega',): 2,        # "mega lucario" → mega lucario
        ("rocket's",): 2,    # "rocket's mewtwo" → rocket's mewtwo
        ("n's",): 2,
        ("ethan's",): 2,
        ("misty's",): 2,
        ("cynthia's",): 2,
        ("steven's",): 2,
        ("hop's",): 2,
        ("lillie's",): 2,
        ("erika's",): 2,
        ("marnie's",): 2,
        ("iono's",): 2,
        ("ogerpon",): 2,
    }
    for prefix, take in compounds.items():
        if tuple(parts[:len(prefix)]) == prefix and len(parts) >= take:
            return ' '.join(parts[:take])
    return parts[0]


def apply_family_cap(predictions, cap_pct=28.0, min_variants=2):
    """Post-renorm. predictions is { name: pct } that sums to ~100."""
    fam_agg = defaultdict(lambda: {'total': 0, 'members': []})
    for k, v in predictions.items():
        fam = extract_family(k)
        if not fam:
            continue
        fam_agg[fam]['total'] += v
        fam_agg[fam]['members'].append(k)
    capped = dict(predictions)
    for fam, info in fam_agg.items():
        if len(info['members']) < min_variants:
            continue
        if info['total'] <= cap_pct:
            continue
        scale = cap_pct / info['total']
        others_total = 100 - info['total']
        if others_total <= 0:
            continue
        others_scale = (others_total + (info['total'] - cap_pct)) / others_total
        members = set(info['members'])
        for k in capped:
            if k in members:
                capped[k] *= scale
            else:
                capped[k] *= others_scale
    return capped


def renormalize(predictions):
    total = sum(predictions.values()) or 1
    return {k: v / total * 100 for k, v in predictions.items()}


def run_formula(name, ctx, family_cap=True, trace=None):
    fn = FORMULAS[name]
    raw = fn(ctx, trace=trace)
    norm = renormalize(raw)
    return apply_family_cap(norm) if family_cap else norm


# ── Metrics ──────────────────────────────────────────────────────

def mae(predicted, actual, top_n=None):
    """Mean absolute error across the union of decks. If top_n is set,
    restrict comparison to the top-N actual decks (more honest — small
    decks the predictor didn't list shouldn't pollute the metric)."""
    if top_n:
        keys = [k for k, _ in sorted(actual.items(), key=lambda x: -x[1])[:top_n]]
    else:
        keys = list(set(predicted) | set(actual))
    if not keys:
        return 0.0
    total = sum(abs(predicted.get(k, 0) - actual.get(k, 0)) for k in keys)
    return total / len(keys)


def per_deck_diff(predicted, actual, top_n=20):
    """Per-deck rows for the top-N actual decks, sorted by absolute diff."""
    keys = [k for k, _ in sorted(actual.items(), key=lambda x: -x[1])[:top_n]]
    out = [(k, predicted.get(k, 0), actual.get(k, 0),
            predicted.get(k, 0) - actual.get(k, 0)) for k in keys]
    return sorted(out, key=lambda r: -abs(r[3]))


# ── Per-event runner ─────────────────────────────────────────────

def run_event(by_tid, tid, date, name, meta_key, prev_meta, set_addition,
              formulas, trace=None, actual_override=None):
    """Backtest one event.

    `actual_override` lets the caller pass in a { norm_name: share_pct }
    dict from outside (e.g. manually digitised tournament screenshots
    for an event not yet in labs CSV — Turin Phase 1 before the
    scraper run)."""
    info = by_tid.get(tid)
    pre = pre_event_labs(by_tid, date)
    ladder = load_online_snapshot(date)
    online_top8 = load_online_top8(date)
    labs_agg = aggregate_labs(pre, meta_key)
    lm = last_meta_labs(by_tid, prev_meta, set_addition)
    actual = actual_override if actual_override is not None else (
        actual_shares(info) if info else {})

    ctx = {
        'ladder':    ladder,
        'labs_pre':  labs_agg,
        'online_t8': online_top8,
        'last_meta': lm,
        'trace_log': [] if trace else None,
    }

    results = {}
    for f in formulas:
        # Reset trace_log per formula so traces don't bleed across
        if trace:
            ctx['trace_log'] = []
        pred = run_formula(f, ctx, trace=trace)
        results[f] = {
            'mae_top20': mae(pred, actual, top_n=20),
            'mae_top10': mae(pred, actual, top_n=10),
            'rows':      per_deck_diff(pred, actual, top_n=15),
            'trace':     list(ctx['trace_log']) if trace else None,
        }
    return {
        'tid': tid, 'date': date, 'name': name, 'meta': meta_key,
        'pre_count': len({t for t, _, _ in pre}),
        'ladder_size': len(ladder),
        'lm_count': len(lm),
        'actual_size': len(actual),
        'results': results,
    }


def load_manual_ground_truth(path):
    """Load a manually-curated ground truth file (Turin screenshots
    digitised by hand). Supports JSON or CSV.

    JSON shape:
      { "Dragapult ex": 29.0, "Ogerpon Meganium": 7.0, ... }

    CSV shape (any delimiter):
      Dragapult ex,29.0
      Ogerpon Meganium,7.0
      ...
    """
    if not path:
        return None
    ext = os.path.splitext(path)[1].lower()
    if ext == '.json':
        with open(path, encoding='utf-8') as f:
            raw = json.load(f)
        out = {}
        for k, v in raw.items():
            if k.startswith('_'):  # skip metadata fields like _comment
                continue
            try:
                out[normalize_deck(k)] = float(v)
            except (TypeError, ValueError):
                continue
        return out
    # CSV fallback
    out = {}
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            for sep in (',', ';', '\t'):
                if sep in line:
                    parts = line.split(sep, 1)
                    break
            else:
                continue
            if len(parts) == 2:
                out[normalize_deck(parts[0])] = parse_eu(parts[1])
    return out


# ── CLI ──────────────────────────────────────────────────────────

def fmt_table(rows, headers):
    widths = [max(len(h), *(len(str(r[i])) for r in rows)) for i, h in enumerate(headers)]
    line = lambda parts: '  '.join(str(p).ljust(w) for p, w in zip(parts, widths))
    out = [line(headers), line('-' * w for w in widths)]
    for r in rows:
        out.append(line(r))
    return '\n'.join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--formula', default='baseline,baseline+damper,baseline+floor,full',
                    help='Comma-separated list of formulas to run.')
    ap.add_argument('--event', default='', help='Run only this tid.')
    ap.add_argument('--json', action='store_true', help='Output JSON.')
    ap.add_argument('--trace', default='',
                    help='Trace one deck through every formula stage.')
    ap.add_argument('--force-set-addition', action='store_true',
                    help='Pretend every test event\'s previous format was a set-addition rotation, so the floor/damper actually fire. Useful for hypothesis testing.')
    ap.add_argument('--ground-truth', default='',
                    help='Path to manual ground-truth JSON/CSV (digitised tournament screenshots). Required if backtesting an event not yet in labs CSV.')
    args = ap.parse_args()

    formulas = [f.strip() for f in args.formula.split(',') if f.strip() in FORMULAS]
    if not formulas:
        sys.exit(f'No valid formulas. Available: {", ".join(FORMULAS)}')

    rows = load_labs()
    by_tid = labs_by_tournament(rows)
    events = [e for e in TEST_EVENTS if not args.event or e[0] == args.event]

    actual_override = load_manual_ground_truth(args.ground_truth) if args.ground_truth else None
    if args.ground_truth and not actual_override:
        sys.exit(f'Could not load ground truth from {args.ground_truth}')

    all_results = []
    for tid, date, name, meta_key, prev_meta, set_addition in events:
        if args.force_set_addition:
            set_addition = True
        r = run_event(by_tid, tid, date, name, meta_key, prev_meta,
                      set_addition, formulas,
                      trace=args.trace.lower() or None,
                      actual_override=actual_override)
        if r:
            all_results.append(r)

    if args.json:
        print(json.dumps(all_results, indent=2, default=str))
        return

    # ── Human-readable output ──
    for er in all_results:
        print(f"\n══ {er['name']} ({er['date']}, tid={er['tid']}) ══")
        print(f"   pre-event majors: {er['pre_count']}   "
              f"ladder decks: {er['ladder_size']}   "
              f"last-meta decks: {er['lm_count']}   "
              f"actual decks: {er['actual_size']}")
        # Per-formula MAE summary
        mae_rows = [[f,
                     f"{er['results'][f]['mae_top10']:.2f}",
                     f"{er['results'][f]['mae_top20']:.2f}"] for f in formulas]
        print('\n' + fmt_table(mae_rows, ['formula', 'MAE-top10', 'MAE-top20']))
        # Per-deck diff for the FIRST formula (canonical)
        primary = formulas[0]
        print(f"\n   Worst misses ({primary}):")
        for k, p, a, d in er['results'][primary]['rows'][:8]:
            print(f"     {k[:28]:28s}  pred={p:5.2f}  actual={a:5.2f}  Δ={d:+5.2f}")
        # Trace log (if --trace given)
        for f in formulas:
            trace = er['results'][f].get('trace')
            if not trace:
                continue
            print(f"\n   ── Trace ({f}) ──")
            for entry in trace:
                stage = entry['stage']
                deck = entry['deck']
                if stage == 'baseline':
                    bd = entry['breakdown']
                    print(f"     [{stage:8s}] {deck}: pred={entry['pred']:5.2f}")
                    print(f"        ladder={entry['ladder']:5.2f}×0.30={bd['ladder_×_0.30']:5.2f}  "
                          f"brought={entry['brought']:5.2f}×0.10={bd['brought_×_0.10']:5.2f}")
                    print(f"        d1={entry['d1']:5.2f} d2={entry['d2']:5.2f} boost×{entry['boost_factor']:.2f} "
                          f"→ top8={entry['top8_term']:5.2f}×0.50={bd['top8_×_0.50']:5.2f}  "
                          f"weekly×0.10={bd['weekly_×_0.10']:5.2f}")
                elif stage == 'floor':
                    print(f"     [{stage:8s}] {deck}: lm_full={entry['lm_full']:5.2f}×0.7={entry['floor_value']:5.2f}  "
                          f"pred {entry['pred_before']:5.2f} → {entry['pred_after']:5.2f}")
                elif stage == 'damper':
                    print(f"     [{stage:8s}] {deck}: e={entry['lm_early']:5.2f} l={entry['lm_late']:5.2f} "
                          f"ratio={entry['ratio']:.2f}  pred {entry['pred_before']:5.2f} → {entry['pred_after']:5.2f}")

    # ── Cross-event aggregate ──
    print('\n══ AGGREGATE (mean MAE across events) ══')
    agg_rows = []
    for f in formulas:
        m10 = sum(er['results'][f]['mae_top10'] for er in all_results) / max(len(all_results), 1)
        m20 = sum(er['results'][f]['mae_top20'] for er in all_results) / max(len(all_results), 1)
        agg_rows.append([f, f"{m10:.2f}", f"{m20:.2f}"])
    print(fmt_table(agg_rows, ['formula', 'mean MAE-top10', 'mean MAE-top20']))


if __name__ == '__main__':
    main()
