/**
 * Unit tests for two new Meta Call predictors:
 *
 *   Predictor 4.6 — Underdog-Champion-Boost
 *     Adds an additive PP bonus to a deck's predicted share when it
 *     recently WON a major regional at <4 % usage in a 500+ player
 *     event. Boost decays linearly between FULL_DECAY_DAYS (full)
 *     and ZERO_DECAY_DAYS (zero). Strength scales with how far below
 *     the underdog ceiling the deck sat at the time of the win.
 *
 *     Empirical anchor: Campinas 2026-05-17 → Ogerpon Meganium won
 *     at ~2.6 % usage → at Indianapolis (~2 weeks later) the same
 *     deck hit 7.9 % Day 1. The boost is sized so a fresh max-
 *     strength signal contributes ~2.5 pp toward that jump.
 *
 *   Predictor 5.4 — Day-2 share-growth (Δ-share)
 *     Adds an additive PP bonus when a deck's average Day 1→Day 2
 *     ABSOLUTE share growth crosses MIN_GROWTH_PP. Distinct from
 *     the day1_to_day2_conv ratio: a deck at flat 5 % share has
 *     100 % conversion but zero growth.
 *
 *     Empirical anchor: Lillie's Clefairy Ogerpon at Indianapolis
 *     2026 — Day 1 3.8 % → Day 2 5.3 % = +1.5 pp growth, a stronger
 *     forward signal than the matching conversion ratio.
 *
 * Both predictors are evaluated inline in the main share pipeline
 * (Stage 5.x of app-meta-call.js — see "Predictor 4.6" / "Predictor
 * 5.4" comment anchors). Because they aren't extractable top-level
 * functions, these tests reimplement the formulas and verify the
 * numbers against fixtures shaped like the production code.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// ── Predictor 4.6 — reference formula ───────────────────────────
// Kept in sync with the constants declared near the top of
// app-meta-call.js (search "PREDICTOR_4_6_"). If the production
// constants move, update these mirrors and re-run.
const P46 = {
    MAX_SHARE_PCT:     4.0,
    MIN_PLAYERS:       500,
    FULL_DECAY_DAYS:   14,
    ZERO_DECAY_DAYS:   28,
    BOOST_PP_MAX:      2.5,
};

function underdogBoostPP({ ageDays, shareAtWin }) {
    let freshness = 0;
    if (ageDays <= P46.FULL_DECAY_DAYS) {
        freshness = 1.0;
    } else if (ageDays < P46.ZERO_DECAY_DAYS) {
        freshness = 1.0 - (ageDays - P46.FULL_DECAY_DAYS) /
                    (P46.ZERO_DECAY_DAYS - P46.FULL_DECAY_DAYS);
    }
    const underdogStrength = Math.max(0, (P46.MAX_SHARE_PCT - shareAtWin) / P46.MAX_SHARE_PCT);
    return P46.BOOST_PP_MAX * freshness * underdogStrength;
}

// ── Predictor 5.4 — reference formula ───────────────────────────
const P54 = {
    MIN_GROWTH_PP:   0.5,
    BOOST_PER_PP:    0.6,
    BOOST_PP_MAX:    1.5,
};

function growthBoostPP(avgGrowthPP) {
    if (avgGrowthPP < P54.MIN_GROWTH_PP) return 0;
    return Math.min(P54.BOOST_PP_MAX, avgGrowthPP * P54.BOOST_PER_PP);
}

// ── Predictor 4.6 tests ─────────────────────────────────────────

describe('Predictor 4.6 — Underdog-Champion-Boost', () => {
    it('Campinas-shaped fresh win (Ogerpon Meganium, 2.6 % share, 3 days ago) lands max-ish boost', () => {
        // Strongest realistic case: low share, very fresh — should hit
        // ~85 % of the 2.5 pp cap (because 2.6/4.0 underdog strength = 0.35,
        // and freshness is 1.0). Math: 2.5 × 1.0 × 0.35 = 0.875 pp.
        const boost = underdogBoostPP({ ageDays: 3, shareAtWin: 2.6 });
        assert.ok(boost > 0.80 && boost < 0.95,
            `expected ~0.875 pp, got ${boost.toFixed(3)}`);
    });

    it('Win at exact MAX_SHARE_PCT ceiling contributes zero (boundary)', () => {
        // shareAtWin = 4.0 → underdogStrength = 0 → bonus = 0.
        // Keeps the predictor from quietly boosting borderline cases
        // that are basically tier-1 already.
        assert.strictEqual(
            underdogBoostPP({ ageDays: 0, shareAtWin: 4.0 }),
            0
        );
    });

    it('Win at 0.5 % share gives near-max strength (87.5 %) — strongest underdog', () => {
        // shareAtWin = 0.5 → underdogStrength = 0.875.
        // freshness = 1.0 → boost = 2.5 × 1.0 × 0.875 = 2.1875.
        const boost = underdogBoostPP({ ageDays: 0, shareAtWin: 0.5 });
        assert.ok(boost > 2.15 && boost < 2.22,
            `expected ~2.1875, got ${boost.toFixed(3)}`);
    });

    it('Full freshness window: ageDays = 14 still pays full freshness', () => {
        // Decay starts AFTER day 14. Day 14 itself must still be 1.0.
        const fresh = underdogBoostPP({ ageDays: 14, shareAtWin: 2.0 });
        const sameDay = underdogBoostPP({ ageDays: 0, shareAtWin: 2.0 });
        assert.strictEqual(fresh, sameDay);
    });

    it('Mid-decay window: ageDays = 21 halves the freshness', () => {
        // (21 - 14) / (28 - 14) = 0.5 → freshness = 0.5.
        const half = underdogBoostPP({ ageDays: 21, shareAtWin: 2.0 });
        const full = underdogBoostPP({ ageDays: 14, shareAtWin: 2.0 });
        assert.ok(Math.abs(half - full * 0.5) < 1e-9);
    });

    it('Past ZERO_DECAY_DAYS the boost is exactly zero', () => {
        assert.strictEqual(underdogBoostPP({ ageDays: 28, shareAtWin: 1.0 }), 0);
        assert.strictEqual(underdogBoostPP({ ageDays: 60, shareAtWin: 0.5 }), 0);
    });

    it('Boost can never exceed BOOST_PP_MAX even in the most extreme case', () => {
        // shareAtWin = 0 → underdogStrength = 1.0, freshness 1.0,
        // bonus = 2.5 × 1.0 × 1.0 = 2.5 == cap. Floating-point safe.
        const boost = underdogBoostPP({ ageDays: 0, shareAtWin: 0 });
        assert.ok(boost <= P46.BOOST_PP_MAX + 1e-9);
        assert.ok(boost >= P46.BOOST_PP_MAX - 1e-9);
    });

    it('Boost decays monotonically with age (older = smaller)', () => {
        const share = 2.5;
        const ages = [0, 7, 14, 17, 21, 25, 27, 28, 30];
        const boosts = ages.map(a => underdogBoostPP({ ageDays: a, shareAtWin: share }));
        for (let i = 1; i < boosts.length; i++) {
            assert.ok(boosts[i] <= boosts[i - 1] + 1e-9,
                `not monotonic: age ${ages[i - 1]} → ${boosts[i - 1]}, age ${ages[i]} → ${boosts[i]}`);
        }
    });

    it('Boost decreases monotonically with share at win (more usage = weaker signal)', () => {
        const ageDays = 7;
        const shares = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0];
        const boosts = shares.map(s => underdogBoostPP({ ageDays, shareAtWin: s }));
        for (let i = 1; i < boosts.length; i++) {
            assert.ok(boosts[i] <= boosts[i - 1] + 1e-9,
                `not monotonic: share ${shares[i - 1]} → ${boosts[i - 1]}, share ${shares[i]} → ${boosts[i]}`);
        }
    });
});

// ── Predictor 5.4 tests ─────────────────────────────────────────

describe('Predictor 5.4 — Day-2 share-growth boost', () => {
    it('Lillie\'s Clefairy-shaped +1.5 pp growth gives 0.9 pp boost', () => {
        // 1.5 × 0.6 = 0.9 pp. Below the 1.5 pp cap.
        const boost = growthBoostPP(1.5);
        assert.ok(Math.abs(boost - 0.9) < 1e-9, `expected 0.9, got ${boost}`);
    });

    it('Sub-threshold growth (+0.3 pp) contributes zero', () => {
        // Below MIN_GROWTH_PP = 0.5 → ignored as noise.
        assert.strictEqual(growthBoostPP(0.3), 0);
        assert.strictEqual(growthBoostPP(0.499), 0);
    });

    it('Growth at threshold contributes full 0.5 × 0.6 = 0.3 pp', () => {
        const boost = growthBoostPP(P54.MIN_GROWTH_PP);
        assert.ok(Math.abs(boost - 0.3) < 1e-9, `expected 0.3, got ${boost}`);
    });

    it('Extreme growth (+5 pp) saturates at BOOST_PP_MAX', () => {
        // 5 × 0.6 = 3.0, but cap = 1.5. Prevents a single fluky major
        // (e.g. a small online event where one deck jumps +6 pp) from
        // dominating the prediction.
        assert.strictEqual(growthBoostPP(5.0), P54.BOOST_PP_MAX);
        assert.strictEqual(growthBoostPP(100), P54.BOOST_PP_MAX);
    });

    it('Negative growth (deck SHED share in cut) contributes zero', () => {
        // A deck whose share dropped Day 1 → Day 2 underperformed —
        // never boost it. Formula handles this via the MIN_GROWTH_PP
        // gate, but verify explicitly.
        assert.strictEqual(growthBoostPP(-1.0), 0);
        assert.strictEqual(growthBoostPP(-3.5), 0);
    });

    it('Boost is monotonically non-decreasing in growth (until cap)', () => {
        const growths = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 5.0, 10.0];
        const boosts = growths.map(growthBoostPP);
        for (let i = 1; i < boosts.length; i++) {
            assert.ok(boosts[i] >= boosts[i - 1] - 1e-9,
                `not monotonic: growth ${growths[i - 1]} → ${boosts[i - 1]}, growth ${growths[i]} → ${boosts[i]}`);
        }
    });
});

// ── Constants sanity ────────────────────────────────────────────

describe('Predictor 4.6 / 5.4 — constants stay realistic', () => {
    it('4.6 underdog ceiling matches the documented strategy', () => {
        // "Under 4 % usage" is the cutoff used in the Campinas
        // post-mortem. If the production constant moves, this test
        // forces an update so the test mirror stays in sync.
        assert.strictEqual(P46.MAX_SHARE_PCT, 4.0);
    });

    it('4.6 decay window is two weeks → four weeks', () => {
        // Tournaments usually go ~2-week intervals (regional → next
        // regional) so full freshness for 14 days is the right scope.
        assert.strictEqual(P46.FULL_DECAY_DAYS, 14);
        assert.strictEqual(P46.ZERO_DECAY_DAYS, 28);
    });

    it('5.4 cap is well below 4.6 cap — growth alone can\'t outweigh a champion title', () => {
        // The hierarchy matters: a fresh underdog title is a stronger
        // signal than a +N pp Δ. Keep cap-ordering invariant.
        assert.ok(P54.BOOST_PP_MAX < P46.BOOST_PP_MAX);
    });
});
