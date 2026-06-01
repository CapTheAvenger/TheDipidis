/**
 * Unit tests for the Predictor 4.6 inheritance INTO the recommendations
 * engine (added 2026-06 after the Indy reco post-mortem on Hydrapple).
 *
 * Backstory: the share-side predictor (in _runPredictor) was already
 * lifting Hydrapple's predicted META share by ~0.87 pp because the
 * deck won Campinas 2026-05-16 at 2.61 % usage. But the RECOMMENDATIONS
 * panel never saw that signal — it ranked Hydrapple #5 behind decks
 * with better aggregate metrics, even though "won a regional last
 * week at low usage" IS exactly the empirical pattern that distin-
 * guishes a deck about to climb Day-2 charts.
 *
 * Fix: apply the same freshness × underdog-strength curve as the
 * share-side, but as a multiplier on the recommendations engine's
 * adjustedDay2 (after the d2WR multiplier). Multiplier range
 * [1.00, 1.50] — a max-strength fresh win lifts day2Prob by 50 %,
 * decays linearly with age, dilutes when the deck was close to the
 * 4 % "still an underdog" ceiling at win time.
 *
 * Same constants as the share-side P4.6 — kept in sync deliberately
 * so a single tweak of the underdog formula propagates to both
 * surfaces. The reco mult ceiling is INTENTIONALLY lower than the
 * share-side bonus (50 % × day2Prob ≪ +2.5 pp share gain on a 5 %
 * deck) so a fresh Campinas-winner doesn't leapfrog above
 * Basic-Box-shape decks with sustained aggregate excellence.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Mirror of js/app-meta-call.js Predictor 4.6 constants.
const P46 = {
    MAX_SHARE_PCT:    4.0,
    MIN_PLAYERS:      500,
    FULL_DECAY_DAYS:  14,
    ZERO_DECAY_DAYS:  28,
    RECO_MULT_RANGE:  0.50,  // 1.0 + 0.50 × fresh × strength → ceil 1.50
};

function p46RecoMultiplier({ share, ageDays }) {
    if (share == null || ageDays == null) return 1.0;
    let fresh = 0;
    if (ageDays <= P46.FULL_DECAY_DAYS) {
        fresh = 1.0;
    } else if (ageDays < P46.ZERO_DECAY_DAYS) {
        fresh = 1.0 - (ageDays - P46.FULL_DECAY_DAYS) /
                 (P46.ZERO_DECAY_DAYS - P46.FULL_DECAY_DAYS);
    }
    const strength = Math.max(0, (P46.MAX_SHARE_PCT - share) / P46.MAX_SHARE_PCT);
    return 1.0 + P46.RECO_MULT_RANGE * fresh * strength;
}

// ── Direct anchors against the Hydrapple-Campinas case ────────

describe('P4.6 reco multiplier — Indy reco post-mortem anchors', () => {
    it('Hydrapple shape (2.61 % win, ~14 days old) gets a meaningful boost', () => {
        // Within the FULL_DECAY_DAYS window → fresh = 1.0
        // underdog_strength = (4.0 - 2.61) / 4.0 = 0.3475
        // mult = 1.0 + 0.50 × 1.0 × 0.3475 = 1.1738
        const mult = p46RecoMultiplier({ share: 2.61, ageDays: 14 });
        assert.ok(Math.abs(mult - 1.1738) < 0.01, `expected ~1.17, got ${mult.toFixed(3)}`);
    });

    it('A max-strength fresh win (0 % share, 0 days) hits the ceiling at 1.50', () => {
        const mult = p46RecoMultiplier({ share: 0, ageDays: 0 });
        assert.strictEqual(mult, 1.50);
    });

    it('A win at the 4 % underdog ceiling produces no boost (underdog_strength = 0)', () => {
        const mult = p46RecoMultiplier({ share: 4.0, ageDays: 0 });
        assert.strictEqual(mult, 1.0);
    });

    it('A 28-day-old win decays to 1.0 (zero boost) — past the freshness window', () => {
        assert.strictEqual(p46RecoMultiplier({ share: 1.0, ageDays: 28 }), 1.0);
        assert.strictEqual(p46RecoMultiplier({ share: 1.0, ageDays: 90 }), 1.0);
    });

    it('Decks WITHOUT a recent underdog win get multiplier 1.0 (no penalty)', () => {
        assert.strictEqual(p46RecoMultiplier({ share: null, ageDays: null }), 1.0);
    });
});

// ── Ranking impact ────────────────────────────────────────────

describe('P4.6 reco multiplier — joint ranking impact', () => {
    it('A fresh Campinas-shape winner with 28 % blended day2 lifts to ~33 %', () => {
        // Hydrapple-shape: day2Prob 28 %, fresh Campinas win mult 1.17
        // → adjusted 32.86 %.
        const mult = p46RecoMultiplier({ share: 2.61, ageDays: 14 });
        const adjusted = 0.28 * mult;
        assert.ok(adjusted > 0.32 && adjusted < 0.34,
            `expected ~32-34 %, got ${(adjusted * 100).toFixed(1)} %`);
    });

    it('Cannot push a fresh winner ABOVE a Basic-Box-shape aggregate champ', () => {
        // Basic Box: blended day2 ~26 %, d2WR mult ~1.55 → 40 % adjusted,
        // no P4.6 boost (didn't win recent regional).
        // Fresh Campinas winner: 28 % × 1.17 P4.6 = 32.8 %.
        // → Basic Box still leads.
        const basicBox  = 0.26 * 1.55;                                // d2WR-boosted
        const fresh     = 0.28 * p46RecoMultiplier({ share: 2.61, ageDays: 14 });
        assert.ok(basicBox > fresh, `expected Basic Box > fresh winner, got ${basicBox.toFixed(3)} vs ${fresh.toFixed(3)}`);
    });

    it('Mid-decay (21 days) yields half the boost of a same-strength fresh win', () => {
        const fresh = p46RecoMultiplier({ share: 2.0, ageDays: 7 });
        const mid   = p46RecoMultiplier({ share: 2.0, ageDays: 21 });
        // Both have strength 0.5. Fresh has fresh-factor 1.0, mid has 0.5.
        // → fresh = 1.25, mid = 1.125. Lift difference = 0.125 (= 1.25 - 1.125).
        // (fresh - 1) / 2 = 0.125 → matches (mid - 1) = 0.125.
        assert.ok(Math.abs((fresh - 1) / 2 - (mid - 1)) < 1e-9);
    });
});

// ── Curve invariants ─────────────────────────────────────────

describe('P4.6 reco multiplier — curve invariants', () => {
    it('Monotonically decreases with age', () => {
        const ages = [0, 7, 14, 17, 21, 25, 27, 28];
        let prev = Infinity;
        for (const a of ages) {
            const m = p46RecoMultiplier({ share: 1.5, ageDays: a });
            assert.ok(m <= prev + 1e-9, `non-monotonic at age=${a}: ${m} > ${prev}`);
            prev = m;
        }
    });

    it('Monotonically decreases with share (closer to 4 % ceiling = less boost)', () => {
        const shares = [0.5, 1.5, 2.5, 3.5, 4.0];
        let prev = Infinity;
        for (const s of shares) {
            const m = p46RecoMultiplier({ share: s, ageDays: 5 });
            assert.ok(m <= prev + 1e-9);
            prev = m;
        }
    });

    it('Bounded at [1.0, 1.0 + RECO_MULT_RANGE]', () => {
        const samples = [
            { share: 0, ageDays: 0 },     // ceiling
            { share: 4, ageDays: 0 },     // floor (strength 0)
            { share: 0, ageDays: 28 },    // floor (fresh 0)
            { share: 2, ageDays: 14 },    // mid
            { share: 3.9, ageDays: 13 },  // mid-low
        ];
        for (const s of samples) {
            const m = p46RecoMultiplier(s);
            assert.ok(m >= 1.0 - 1e-9 && m <= 1.0 + P46.RECO_MULT_RANGE + 1e-9,
                `out of bounds for ${JSON.stringify(s)}: ${m}`);
        }
    });
});
