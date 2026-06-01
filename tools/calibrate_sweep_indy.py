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
    ("blend-20-recency-heavy",   0.20, [0.70, 0.20, 0.10], 0.40, 2, 2.0),
    ("blend-15-recency-heavy",   0.15, [0.70, 0.20, 0.10], 0.40, 2, 2.0),
    ("blend-25-pure-latest",     0.25, [1.00, 0.00, 0.00], 0.40, 2, 2.0),
    ("blend-30-pure-latest",     0.30, [1.00, 0.00, 0.00], 0.40, 2, 2.0),
    ("median-anchor",            0.30, "median",           0.40, 2, 2.0),  # special: median, not weighted
    ("trend-aware-blend",        0.30, "trend-aware",      0.40, 2, 2.0),  # special: declining decks skip anchor
    ("median-blend-20",          0.20, "median",           0.40, 2, 2.0),
    ("median-blend-15",          0.15, "median",           0.40, 2, 2.0),
    ("median-blend-25",          0.25, "median",           0.40, 2, 2.0),
    ("median-trend-aware",       0.30, "median-trend-aware", 0.40, 2, 2.0),
]


_ORIG_RECENCY = cal.recency_weighted_major


def _median_anchor(name, major_history):
    """Median of the deck's TEF-POR major shares (eligibility gate stays
    the same as the weighted average). Robust to a single-tournament
    peak (Dragapult Dudunsparce 8.94 % at Campinas) skewing the average."""
    hist = major_history.get(name) or []
    eligible = [h for h in hist if h["share"] >= cal.PB_MIN_SHARE_PCT]
    if len(eligible) < cal.PB_MIN_TOURNAMENTS:
        return None
    shares = sorted(h["share"] for h in hist[: len(cal.PB_MAJOR_WEIGHTS)])
    if not shares:
        return None
    n = len(shares)
    return (shares[n // 2] if n % 2 else (shares[n // 2 - 1] + shares[n // 2]) / 2)


def _trend_aware_anchor(name, major_history):
    """Anchor only when the deck's MOST-RECENT major isn't a clear
    decline from earlier ones. Catches the Dragapult-Dudunsparce shape:
    8.94 % Campinas → 6.07 % Utrecht → 3.13 % Melbourne. The deck is
    fading; major data is not predictive."""
    hist = major_history.get(name) or []
    eligible = [h for h in hist if h["share"] >= cal.PB_MIN_SHARE_PCT]
    if len(eligible) < cal.PB_MIN_TOURNAMENTS:
        return None
    sorted_hist = sorted(hist, key=lambda h: h["date"], reverse=True)
    top = sorted_hist[: len(cal.PB_MAJOR_WEIGHTS)]
    if len(top) < 2:
        return _ORIG_RECENCY(name, major_history)
    # If most recent < 0.7 × max(older), declining → skip anchor.
    older_max = max(h["share"] for h in top[1:])
    if top[0]["share"] < 0.7 * older_max:
        return None
    return _ORIG_RECENCY(name, major_history)


def run_variant(label, blend_major, weights, damp, min_t, min_share):
    cal.PB_BLEND_MAJOR     = blend_major
    cal.PA_C_DAMP_FACTOR   = damp
    cal.PB_MIN_TOURNAMENTS = min_t
    cal.PB_MIN_SHARE_PCT   = min_share
    def _median_trend_aware(name, history):
        # Median, but skip entirely when the most-recent major is a
        # clear decline (most_recent < 0.7 × max(others)).
        hist = history.get(name) or []
        eligible = [h for h in hist if h["share"] >= cal.PB_MIN_SHARE_PCT]
        if len(eligible) < cal.PB_MIN_TOURNAMENTS:
            return None
        sorted_hist = sorted(hist, key=lambda h: h["date"], reverse=True)
        top = sorted_hist[: len(cal.PB_MAJOR_WEIGHTS)]
        if len(top) >= 2:
            older_max = max(h["share"] for h in top[1:])
            if top[0]["share"] < 0.7 * older_max:
                return None
        return _median_anchor(name, history)

    if weights == "median":
        cal.recency_weighted_major = _median_anchor
        cal.PB_MAJOR_WEIGHTS = [1.0, 1.0, 1.0]
    elif weights == "trend-aware":
        cal.recency_weighted_major = _trend_aware_anchor
        cal.PB_MAJOR_WEIGHTS = [0.70, 0.20, 0.10]
    elif weights == "median-trend-aware":
        cal.recency_weighted_major = _median_trend_aware
        cal.PB_MAJOR_WEIGHTS = [1.0, 1.0, 1.0]
    else:
        cal.recency_weighted_major = _ORIG_RECENCY
        cal.PB_MAJOR_WEIGHTS = weights

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
