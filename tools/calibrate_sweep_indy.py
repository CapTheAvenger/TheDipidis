#!/usr/bin/env python3
"""Variant sweep over Phase β knobs against Indy actuals.

Runs the calibration with different (PB_BLEND_MAJOR, PB_MAJOR_WEIGHTS,
PA_C_DAMP_FACTOR) combinations and reports MAE so we can pick the
combo that beats the 1.83 pp naive-online baseline by the most.
"""
import os
import sys
from pathlib import Path

# Hot-patch the constants in calibrate_meta_call_indy.py for each
# sweep iteration. We `exec` the calibration module's predict logic
# under different constant values rather than spawning subprocesses.
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))

# Import once to get the helpers, then mutate constants per run.
import calibrate_meta_call_indy as cal  # noqa: E402

VARIANTS = [
    # (label, PB_BLEND_MAJOR, PB_MAJOR_WEIGHTS, PA_C_DAMP_FACTOR, PB_MIN_TOURNAMENTS, PB_MIN_SHARE_PCT)
    ("baseline-current",         0.70, [0.50, 0.30, 0.20], 0.40, 2, 2.0),
    ("blend-50/50",              0.50, [0.50, 0.30, 0.20], 0.40, 2, 2.0),
    ("blend-40-recency-heavy",   0.40, [0.70, 0.20, 0.10], 0.40, 2, 2.0),
    ("blend-30-recency-heavy",   0.30, [0.70, 0.20, 0.10], 0.40, 2, 2.0),
    ("blend-50-recency-heavy",   0.50, [0.70, 0.20, 0.10], 0.40, 2, 2.0),
    ("anchor-only-last-major",   0.50, [1.00, 0.00, 0.00], 0.40, 2, 2.0),
    ("anchor-only-last-2x60-40", 0.50, [0.60, 0.40, 0.00], 0.40, 2, 2.0),
    ("strict-3-majors",          0.50, [0.50, 0.30, 0.20], 0.40, 3, 2.0),
    ("higher-share-cutoff",      0.50, [0.50, 0.30, 0.20], 0.40, 2, 3.0),
    ("no-phase-a",               0.50, [0.50, 0.30, 0.20], 1.00, 2, 2.0),  # damper off
    ("phase-a-only",             0.00, [0.50, 0.30, 0.20], 0.40, 2, 2.0),  # anchor off, damper on
    ("everything-off-baseline",  0.00, [0.50, 0.30, 0.20], 1.00, 2, 2.0),  # both off (= old engine + format-filter only)
]


def run_variant(label, blend_major, weights, damp, min_t, min_share):
    cal.PB_BLEND_MAJOR     = blend_major
    cal.PB_MAJOR_WEIGHTS   = weights
    cal.PA_C_DAMP_FACTOR   = damp
    cal.PB_MIN_TOURNAMENTS = min_t
    cal.PB_MIN_SHARE_PCT   = min_share

    online    = cal.load_online_snapshot()
    labs      = cal.load_labs_signals()
    predicted = cal.predict(online, labs)
    indy      = cal.load_indy_actuals()

    rows = []
    for name in set(online) | set(indy):
        on   = online.get(name, 0.0)
        pred = predicted.get(name, {}).get("predicted_share", 0.0)
        act  = indy.get(name, 0.0)
        rows.append({
            "name": name,
            "online": on,
            "predicted": pred,
            "actual": act,
            "err_pred":  pred - act,
            "err_naive": on - act,
        })

    impact = [r for r in rows if r["actual"] >= 1.0]
    if not impact:
        return None
    mae_pred  = sum(abs(r["err_pred"])  for r in impact) / len(impact)
    mae_naive = sum(abs(r["err_naive"]) for r in impact) / len(impact)
    bias_pred = sum(r["err_pred"]       for r in impact) / len(impact)
    # Worst over- and under-predictions by name
    over  = sorted(impact, key=lambda r: -r["err_pred"])[:3]
    under = sorted(impact, key=lambda r: r["err_pred"])[:3]
    return {
        "label": label,
        "mae_pred":  mae_pred,
        "mae_naive": mae_naive,
        "bias":      bias_pred,
        "over":      [(r["name"], r["err_pred"]) for r in over],
        "under":     [(r["name"], r["err_pred"]) for r in under],
    }


def main():
    results = []
    for v in VARIANTS:
        r = run_variant(*v)
        if r:
            results.append(r)
    # Sort by MAE asc — best first.
    results.sort(key=lambda x: x["mae_pred"])
    print(f"{'Variant':28} {'MAE':>6} {'Bias':>7}  Worst Over          Worst Under")
    print("-" * 110)
    for r in results:
        over_str  = ", ".join(f"{n[:14]}+{e:.1f}" for n, e in r["over"])
        under_str = ", ".join(f"{n[:14]}{e:+.1f}" for n, e in r["under"])
        flag = " ← BEST" if r["mae_pred"] == results[0]["mae_pred"] else ""
        baseline_better = "(beats baseline)" if r["mae_pred"] < r["mae_naive"] else "(WORSE than naive)"
        print(f"{r['label']:28} {r['mae_pred']:5.2f}pp {r['bias']:+6.2f}pp  {over_str:18} {under_str}{flag}  {baseline_better}")
    print()
    print(f"Naive online baseline MAE = {results[0]['mae_naive']:.2f} pp (same across all variants — input doesn't change)")


if __name__ == "__main__":
    main()
