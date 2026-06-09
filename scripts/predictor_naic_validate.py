#!/usr/bin/env python3
"""Predictor NAIC validator.

Cross-checks the predictor's forward forecast for NAIC against the
empirical TEF-POR Regional-to-Regional movement patterns the actual
data has recorded over the past six weeks.

The user's premise: "Wir haben jahrelange datenbasis vorliegen" — so the
NAIC call should not be a guess. It should be data-grounded by
movements the prior format actually displayed.

Two reference points are computed per archetype:

  Empirical typical Δ (TEF-POR):  for each archetype that appeared in
    ≥2 of the six TEF-POR Regionals (Prague → Indianapolis), compute
    Δshare = share[event_{n+1}] - share[event_n] for adjacent regionals.
    Aggregate to (μ, σ, n).

  Predictor forecast Δ (Turin → NAIC):  pred_NAIC - Turin_Day1, where
    Turin_Day1 comes from the labs CSV and pred_NAIC is what the
    backtest harness emits for a synthetic event dated 2026-06-21 with
    meta=TEF-CRI, prev=TEF-POR, set_addition=True. (The same gating the
    live JS predictor uses post-Turin.)

A predicted Δ is FLAGGED when |forecast_Δ - μ_empirical| > 1.5σ AND
|forecast_Δ| > 0.5 pp. Those rows deserve a closer look — the predictor
is moving the deck more (or in a different direction) than the format
has historically moved similar archetypes.

Usage:
  python scripts/predictor_naic_validate.py
  python scripts/predictor_naic_validate.py --formula predictor_5_6_v2
"""
import argparse
import csv
import json
import os
import sys
from collections import defaultdict
from statistics import mean, pstdev

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import predictor_backtest as bt

NAIC_DATE = '2026-06-21'   # placeholder: any date after Turin
TURIN_TID = '0069'

POR_EVENTS = [  # tid, name, ISO date — chronological, same-weekend events kept
    ('0062', 'Prague',       '2026-04-25'),
    ('0063', 'Los Angeles',  '2026-05-09'),
    ('0064', 'Utrecht',      '2026-05-16'),
    ('0065', 'Campinas',     '2026-05-16'),
    ('0066', 'Melbourne',    '2026-05-23'),
    ('0068', 'Indianapolis', '2026-05-30'),
]
# Adjacent pairs (collapse same-weekend events to the mean of their shares)
POR_PAIRS = [
    (['0062'],         ['0063'],         'Prague→LA'),
    (['0063'],         ['0064','0065'],  'LA→Utrecht/Campinas'),
    (['0064','0065'],  ['0066'],         'Utrecht/Campinas→Melbourne'),
    (['0066'],         ['0068'],         'Melbourne→Indianapolis'),
]


def por_event_shares(rows):
    """Build {tid: {norm_name: day1_share_pct}} for TEF-POR events only."""
    out = defaultdict(dict)
    for r in rows:
        if r['meta'] != 'TEF-POR':
            continue
        if r['tournament_id'] not in {tid for tid, _, _ in POR_EVENTS}:
            continue
        share = float(r['day1_share_pct'] or 0)
        if share <= 0:
            continue
        out[r['tournament_id']][bt.normalize_deck(r['deck_name'])] = share
    return out


def empirical_deltas(event_shares):
    """Per-deck list of adjacent-event Δshare values."""
    decks = set()
    for tid in event_shares:
        decks.update(event_shares[tid].keys())

    def avg(tids, deck):
        return mean(event_shares[t].get(deck, 0) for t in tids)

    deltas = defaultdict(list)
    for a, b, _ in POR_PAIRS:
        for d in decks:
            sa, sb = avg(a, d), avg(b, d)
            if sa == 0 and sb == 0:
                continue
            deltas[d].append(sb - sa)
    return deltas


def empirical_stats(deltas):
    """{deck: (μ, σ, n)}. Only decks with n ≥ 2 are statistically usable."""
    out = {}
    for d, ds in deltas.items():
        if len(ds) < 2:
            out[d] = (mean(ds) if ds else 0.0, 0.0, len(ds))
        else:
            out[d] = (mean(ds), pstdev(ds), len(ds))
    return out


def turin_shares(rows):
    """{norm_name: day1_share_pct} from the Turin (TEF-CRI) labs row."""
    out = {}
    for r in rows:
        if r['tournament_id'] != TURIN_TID:
            continue
        share = float(r['day1_share_pct'] or 0)
        if share > 0:
            out[bt.normalize_deck(r['deck_name'])] = share
    return out


def forecast_naic(rows, by_tid, formula):
    """Run the predictor as if we were forecasting an event dated NAIC_DATE
    that doesn't exist yet. The pre-event labs window INCLUDES Turin
    because Turin (2026-06-07) is before NAIC_DATE (2026-06-21)."""
    pre = bt.pre_event_labs(by_tid, NAIC_DATE)
    ladder = bt.load_online_snapshot(NAIC_DATE)
    online_top8 = bt.load_online_top8(NAIC_DATE)
    labs_agg = bt.aggregate_labs(pre, 'TEF-CRI')
    lm = bt.last_meta_labs(by_tid, 'TEF-POR', True)
    ctx = {
        'ladder':    ladder,
        'labs_pre':  labs_agg,
        'online_t8': online_top8,
        'last_meta': lm,
        'trace_log': None,
    }
    return bt.run_formula(formula, ctx)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--formula', default='predictor_5_6_v2',
                   help='Backtest formula to forecast NAIC with (default: predictor_5_6_v2 — closest port of the live JS predictor).')
    p.add_argument('--top-n', type=int, default=25,
                   help='Show the top-N decks by Turin presence (default 25).')
    p.add_argument('--sigma-flag', type=float, default=1.5,
                   help='Flag forecasts whose deviation from empirical μ exceeds this many σ (default 1.5).')
    p.add_argument('--min-delta-flag', type=float, default=0.5,
                   help='Suppress flags on small deltas |Δ|<X pp (default 0.5).')
    p.add_argument('--json', action='store_true', help='Machine-readable output.')
    args = p.parse_args()

    rows = bt.load_labs()
    by_tid = bt.labs_by_tournament(rows)

    if TURIN_TID not in by_tid:
        sys.exit(f'ERROR: Turin (tid={TURIN_TID}) not in labs CSV. Run the labs scraper first.')

    turin = turin_shares(rows)
    por_shares = por_event_shares(rows)
    deltas = empirical_deltas(por_shares)
    stats = empirical_stats(deltas)
    pred = forecast_naic(rows, by_tid, args.formula)

    # Build the validation rows for decks present at Turin (the only ones
    # for which a Δ from Turin is meaningful).
    sample = sorted(turin.items(), key=lambda x: -x[1])[:args.top_n]
    flagged = []
    aligned = []
    no_history = []

    print(f'\n── Predictor NAIC Validation ({args.formula}, vs empirical TEF-POR deltas) ──')
    print(f'   {len(turin)} Turin decks · {len(stats)} POR decks with delta history · σ-flag {args.sigma_flag} · |Δ|-floor {args.min_delta_flag} pp\n')
    hdr = f'{"Deck":<32} {"Turin":>6} {"pred":>6} {"fΔ":>6}  {"emp μΔ":>7} {"σΔ":>5} {"n":>2}  status'
    print(hdr)
    print('-' * len(hdr))

    for deck, turin_share in sample:
        pred_share = pred.get(deck, 0.0)
        f_delta = pred_share - turin_share
        emp = stats.get(deck)
        if emp is None or emp[2] < 2:
            status = 'no-history'
            no_history.append(deck)
            row = (deck, turin_share, pred_share, f_delta, None, None, emp[2] if emp else 0, status)
        else:
            mu, sigma, n = emp
            dist = abs(f_delta - mu)
            inside = (sigma > 0 and dist <= args.sigma_flag * sigma) or sigma == 0
            if not inside and abs(f_delta) >= args.min_delta_flag:
                status = f'FLAG ({dist/sigma:+.1f}σ off)' if sigma > 0 else 'FLAG (σ=0)'
                flagged.append((deck, turin_share, pred_share, f_delta, mu, sigma, n))
            else:
                status = 'ok'
                aligned.append(deck)
            row = (deck, turin_share, pred_share, f_delta, mu, sigma, n, status)
        print(f'{row[0]:<32} {row[1]:>6.2f} {row[2]:>6.2f} {row[3]:>+6.2f}  '
              + (f'{row[4]:>+7.2f} {row[5]:>5.2f} {row[6]:>2d}  ' if row[4] is not None else f'{"  —":>7} {"  —":>5} {row[6]:>2d}  ')
              + row[7])

    print()
    print(f'── Summary ──')
    print(f'   aligned: {len(aligned)}   flagged: {len(flagged)}   no-history: {len(no_history)}')
    if flagged:
        print()
        print('   Decks where the predictor diverges from empirical TEF-POR movement:')
        for deck, ts, ps, fd, mu, sigma, n in sorted(flagged, key=lambda x: -abs(x[3] - x[4])):
            direction = 'over-correcting' if (fd - mu) * (1 if mu >= 0 else -1) > 0 or abs(fd) > abs(mu) + sigma else 'under-correcting'
            sign_match = '(same direction)' if fd * mu >= 0 else '(opposite direction)'
            print(f'     {deck:<32} forecast Δ={fd:+.2f}  empirical typical Δ={mu:+.2f}±{sigma:.2f} (n={n})  {sign_match}')

    if args.json:
        out = {
            'formula': args.formula,
            'aligned': aligned,
            'flagged': [
                {'deck': d, 'turin': ts, 'pred': ps, 'forecast_delta': fd,
                 'empirical_mu': mu, 'empirical_sigma': sigma, 'n': n}
                for d, ts, ps, fd, mu, sigma, n in flagged
            ],
            'no_history': no_history,
        }
        print('\n--- JSON ---')
        print(json.dumps(out, indent=2))


if __name__ == '__main__':
    main()
