#!/usr/bin/env python3
"""Indianapolis 2026 calibration analysis for Meta Call.

What this does
==============
Loads three sources:
  1) data/calibration/indy_2026_actuals.json — the ground truth from
     labs.limitlesstcg.com (user-provided screenshots, since the labs
     scraper hadn't picked up Indy when this analysis was authored).
  2) data/limitless_online_decks_comparison.csv — the current online
     ladder snapshot. Mirrors what Meta Call's predictor sees as the
     `ladderShare` / `onlineShare` input.
  3) data/labs_tournament_decks.csv — the labs major data through
     Melbourne (tid 0066). Feeds Predictor 4.6 (Underdog-Champion-
     Boost), Predictor 5.4 (Day-2 share growth), and the day1/day2
     conversion ratios the engine reads.

It then reimplements the deterministic core of the predictor pipeline
inline (Stage 5.x — Predictor 4.6 + 5.4 + concentration-exp + sum-to-
field-coverage normalisation), produces a per-deck predicted share,
and compares it to the Indianapolis actuals. Output is a single
table sorted by absolute error so the biggest mispredictions surface
at the top.

Why a separate script and not a unit test
=========================================
This is a CALIBRATION harness, not a regression test. It deliberately
mirrors production formulas instead of importing them so that:
  - a maintainer who changes the engine sees the calibration diff
    explicitly (the constants/weights at the top of this file have
    to be touched in lockstep — there's no shared module to silently
    drift),
  - the script stays runnable against historical snapshots without
    booting the JS engine.

The mirror is documented at each constant; see js/app-meta-call.js
for the production source of truth.
"""
import csv
import json
import os
import sys
from datetime import date, datetime
from collections import defaultdict
from typing import Dict, List, Tuple

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


# ── Production-mirrored constants ──────────────────────────────────
# Keep in lockstep with js/app-meta-call.js (search "PREDICTOR_4_6_"
# and "MATCHUP_BLEND_WEIGHT_").

# Predictor 4.6 — Underdog-Champion-Boost
P46_MAX_SHARE_PCT      = 4.0
P46_MIN_PLAYERS        = 500
P46_FULL_DECAY_DAYS    = 14
P46_ZERO_DECAY_DAYS    = 28
P46_BOOST_PP_MAX       = 2.5

# Predictor 5.4 — Day-2 share-growth boost
P54_MIN_GROWTH_PP      = 0.5
P54_BOOST_PER_PP       = 0.6
P54_BOOST_PP_MAX       = 1.5

# Concentration exponent (Stage 5.2): softens to 1.10 at >=10% share,
# stays at 1.50 below 5%.
CONC_EXP_BASE          = 1.50
CONC_EXP_MIN           = 1.10
CONC_SOFT_LO           = 5.0
CONC_SOFT_HI           = 10.0

# Reference date — anchor for Predictor 4.6 freshness decay. Set to
# the Indianapolis date so the boost reflects what the engine would
# have applied on the morning of Indy.
TODAY = date(2026, 5, 29)

# Junk floor — Meta Call reserves ~5% for "everything else".
JUNK_FLOOR_PCT         = 5.0


def parse_eu(s: str) -> float:
    if not s:
        return 0.0
    try:
        return float(str(s).strip().replace(",", "."))
    except ValueError:
        return 0.0


def load_online_snapshot() -> Dict[str, float]:
    """Map deck_name → online share % (current ladder, pre-Indy)."""
    path = os.path.join(REPO, "data", "limitless_online_decks_comparison.csv")
    out = {}
    with open(path, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f, delimiter=";"):
            name = (row.get("deck_name") or "").strip()
            if not name:
                continue
            out[name] = parse_eu(row.get("new_share") or row.get("old_share") or "0")
    return out


def load_labs_signals() -> Dict[str, Dict]:
    """For each deck (by name), gather:
      - latest underdog-win candidate (for Predictor 4.6)
      - recency-naive avg day2_share - day1_share (for Predictor 5.4)
    Keeping the aggregation simple here — the engine uses recency-
    weighted averages; the difference for a 6-tournament window is in
    the second decimal. For calibration purposes this is fine.
    """
    path = os.path.join(REPO, "data", "labs_tournament_decks.csv")
    underdog: Dict[str, Dict] = {}
    growth: Dict[str, List[float]] = defaultdict(list)
    with open(path, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            name = (r.get("deck_name") or "").strip()
            if not name:
                continue
            # Limit to current rotation (TEF-POR) so we only see live
            # tournament weight, not last-year's CRA-pre data.
            if (r.get("meta") or "").strip() != "TEF-POR":
                continue
            share   = parse_eu(r.get("share_pct"))
            players = int(r.get("total_players") or 0)
            top1    = int(r.get("top1_count") or 0)
            d1      = parse_eu(r.get("day1_share_pct"))
            d2      = parse_eu(r.get("day2_share_pct"))

            # Predictor 4.6 — keep the most-recent underdog win that
            # passes all three gates.
            if (top1 >= 1 and share < P46_MAX_SHARE_PCT
                    and players >= P46_MIN_PLAYERS):
                try:
                    event_date = datetime.strptime(r["tournament_date"], "%Y-%m-%d").date()
                except (KeyError, ValueError):
                    event_date = None
                if event_date:
                    prev = underdog.get(name)
                    if not prev or event_date > prev["date"]:
                        underdog[name] = {
                            "date":  event_date,
                            "event": r.get("tournament_name", ""),
                            "share": share,
                            "players": players,
                        }
            # Predictor 5.4 — collect Δ-share samples
            if d1 > 0 and d2 > 0:
                growth[name].append(d2 - d1)
    return {"underdog": underdog, "growth": growth}


def predictor_4_6_boost(underdog: Dict, today: date) -> float:
    age = (today - underdog["date"]).days
    if age <= P46_FULL_DECAY_DAYS:
        freshness = 1.0
    elif age < P46_ZERO_DECAY_DAYS:
        freshness = 1.0 - (age - P46_FULL_DECAY_DAYS) / (P46_ZERO_DECAY_DAYS - P46_FULL_DECAY_DAYS)
    else:
        freshness = 0.0
    underdog_strength = max(0.0, (P46_MAX_SHARE_PCT - underdog["share"]) / P46_MAX_SHARE_PCT)
    return P46_BOOST_PP_MAX * freshness * underdog_strength


def predictor_5_4_boost(samples: List[float]) -> float:
    if not samples:
        return 0.0
    avg = sum(samples) / len(samples)
    if avg < P54_MIN_GROWTH_PP:
        return 0.0
    return min(P54_BOOST_PP_MAX, avg * P54_BOOST_PER_PP)


def concentration_exp(share: float) -> float:
    if share <= CONC_SOFT_LO:
        return CONC_EXP_BASE
    if share >= CONC_SOFT_HI:
        return CONC_EXP_MIN
    t = (share - CONC_SOFT_LO) / (CONC_SOFT_HI - CONC_SOFT_LO)
    return CONC_EXP_BASE - (CONC_EXP_BASE - CONC_EXP_MIN) * t


def predict(online: Dict[str, float], labs: Dict[str, Dict]) -> Dict[str, Dict]:
    """Run the deterministic predictor pipeline (Stage 5.x). Returns
    per-deck dict with the breakdown."""
    raw = {}
    for name, share in online.items():
        base = share
        u = labs["underdog"].get(name)
        p46 = predictor_4_6_boost(u, TODAY) if u else 0.0
        p54 = predictor_5_4_boost(labs["growth"].get(name, []))
        boosted = base + p46 + p54
        exp = concentration_exp(boosted)
        raw[name] = {
            "online":      base,
            "p46_boost":   p46,
            "p54_boost":   p54,
            "p46_event":   u["event"] if u else "",
            "p46_date":    u["date"].isoformat() if u else "",
            "boosted":     boosted,
            "conc_exp":    exp,
            "raw_amp":     boosted ** exp,
        }
    # Normalise: top decks share 100 - JUNK_FLOOR_PCT among them.
    total = sum(r["raw_amp"] for r in raw.values())
    target = 100.0 - JUNK_FLOOR_PCT
    factor = (target / total) if total > 0 else 1.0
    for r in raw.values():
        r["predicted_share"] = r["raw_amp"] * factor
    return raw


def load_indy_actuals() -> Dict[str, float]:
    path = os.path.join(REPO, "data", "calibration", "indy_2026_actuals.json")
    with open(path) as f:
        data = json.load(f)
    return {row["deck_name"]: row["share_pct"] for row in data["overall"]}


def main() -> None:
    online   = load_online_snapshot()
    labs     = load_labs_signals()
    predicted = predict(online, labs)
    indy     = load_indy_actuals()

    # Join the three views.
    rows = []
    all_names = set(online) | set(indy)
    for name in all_names:
        on   = online.get(name, 0.0)
        pred = predicted.get(name, {}).get("predicted_share", 0.0)
        act  = indy.get(name, 0.0)
        p46  = predicted.get(name, {}).get("p46_boost", 0.0)
        p54  = predicted.get(name, {}).get("p54_boost", 0.0)
        err_pred = pred - act       # >0 over-prediction
        err_naive = on - act        # naive: just take online ladder
        rows.append({
            "name": name,
            "online": on,
            "p46":   p46,
            "p54":   p54,
            "predicted": pred,
            "actual":  act,
            "err_pred":  err_pred,
            "err_naive": err_naive,
            "abs_err":   abs(err_pred),
        })

    # Sort by impact: actual >= 1% OR |err| >= 1 pp.
    rows.sort(key=lambda r: -max(r["actual"], r["abs_err"]))

    print("Indianapolis 2026 — Meta Call calibration")
    print("=" * 110)
    print(f"Reference date for Predictor 4.6 decay: {TODAY}")
    print(f"Online snapshot decks: {len(online)} | Indy decks (overall): {len(indy)}")
    print()
    hdr = (f"{'Deck':38} {'Online':>7} {'+P4.6':>6} {'+P5.4':>6} "
           f"{'Pred':>7} {'Actual':>7} {'ErrPred':>8} {'ErrNaive':>9}")
    print(hdr)
    print("-" * 110)
    for r in rows:
        if r["actual"] < 0.5 and r["abs_err"] < 0.5:
            continue  # too small to matter
        flag = ""
        if r["actual"] >= 3.0 and r["err_pred"] < -1.5:
            flag = " ⬅ UNDER"
        elif r["actual"] >= 3.0 and r["err_pred"] > 1.5:
            flag = " ⬅ OVER"
        elif r["actual"] == 0.0 and r["online"] >= 2.0:
            flag = " ⬅ FORMAT-ABSENT"
        print(f"{r['name'][:38]:38} {r['online']:6.2f}% {r['p46']:+5.2f} {r['p54']:+5.2f} "
              f"{r['predicted']:6.2f}% {r['actual']:6.2f}% {r['err_pred']:+7.2f} {r['err_naive']:+8.2f}{flag}")

    # Aggregate stats.
    print()
    print("=" * 110)
    print("Aggregate over decks with actual >= 1% at Indy:")
    impact = [r for r in rows if r["actual"] >= 1.0]
    if impact:
        mae_pred  = sum(abs(r["err_pred"])  for r in impact) / len(impact)
        mae_naive = sum(abs(r["err_naive"]) for r in impact) / len(impact)
        bias_pred = sum(r["err_pred"]  for r in impact) / len(impact)
        print(f"  Mean Absolute Error (Predicted vs Actual): {mae_pred:.2f} pp ({len(impact)} decks)")
        print(f"  Mean Absolute Error (Online ladder vs Actual): {mae_naive:.2f} pp")
        print(f"  Mean Signed Error (Predicted - Actual): {bias_pred:+.2f} pp  "
              f"({'over-predict' if bias_pred > 0 else 'under-predict'})")


if __name__ == "__main__":
    main()
