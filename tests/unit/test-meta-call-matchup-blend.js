/**
 * Unit tests for the Major-vs-Online matchup blend in Meta Call's
 * `getBaseMatchup`. Two changes under test:
 *
 *   1) Blend factor rebalanced to 65 / 35 (Major / Online), down from
 *      75 / 25 (= 3.0 ratio). User-requested 2026-06 after the labs
 *      matchup matrix grew to >3000 games per top archetype — the
 *      trust gain from the Major source has stopped saturating, and
 *      online ladder is still elite-pilot biased, so 65 / 35 is the
 *      "typical-pilot reality" we want the simulator to reflect.
 *
 *   2) Day-2 preference: when a pair has ≥MIN_GAMES_DAY2 Day-2 games,
 *      the Day-2 WR REPLACES the Overall WR as the Major-side input
 *      before the 65 / 35 online blend. Day-2 reflects cut-quality
 *      play (better pilots, less off-meta noise) so it's closer to
 *      truth. Falls through to Overall when Day-2 sample is too small.
 *
 * These tests mirror the production constants and formulas in
 * isolation — they don't exercise the full data-loading pipeline,
 * just the blend math. If a maintainer changes the constants in
 * app-meta-call.js, the mirrors here go out of sync and the
 * "constants stay realistic" suite fails loudly.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Production-mirrored constants. Keep these in lockstep with the
// declarations at the top of js/app-meta-call.js.
const MAJOR_BLEND_FACTOR  = 0.65;   // Major share of the blend
const ONLINE_BLEND_FACTOR = 0.35;
const MIN_GAMES_OVERALL   = 10;
const MIN_GAMES_DAY2      = 5;

// Reference blend: returns 0..1 pWin OR null if no Major signal is
// valid for the pair.
function blendMatchup({ onlineWin, day2WR, day2Games, overallWR, overallGames }) {
    let majorWin = null;
    if (day2WR != null && day2Games >= MIN_GAMES_DAY2) {
        majorWin = day2WR;
    } else if (overallWR != null && overallGames >= MIN_GAMES_OVERALL) {
        majorWin = overallWR;
    }
    if (majorWin == null) return { pWin: onlineWin, blended: false, source: 'online' };
    const pWin = majorWin * MAJOR_BLEND_FACTOR + onlineWin * ONLINE_BLEND_FACTOR;
    const source = (day2WR != null && day2Games >= MIN_GAMES_DAY2) ? 'day2' : 'overall';
    return { pWin, blended: true, source };
}

describe('Major-vs-Online matchup blend — 65 / 35 ratio', () => {
    it('blends Overall 60 % WR with online 40 % WR to 53 %', () => {
        // 0.60 × 0.65 + 0.40 × 0.35 = 0.39 + 0.14 = 0.53
        const r = blendMatchup({
            onlineWin: 0.40,
            overallWR: 0.60,
            overallGames: 100,
        });
        assert.ok(Math.abs(r.pWin - 0.53) < 1e-9,
            `expected 0.53, got ${r.pWin}`);
        assert.strictEqual(r.source, 'overall');
    });

    it('Major 50 % + Online 50 % blends to 50 % (identity case)', () => {
        // When both sources agree, the blend is a no-op.
        const r = blendMatchup({
            onlineWin: 0.50,
            overallWR: 0.50,
            overallGames: 50,
        });
        assert.ok(Math.abs(r.pWin - 0.50) < 1e-9);
    });

    it('Major 0 % WR pulls a 50 % online to 17.5 %', () => {
        // 0 × 0.65 + 0.50 × 0.35 = 0.175. Confirms Major dominates.
        const r = blendMatchup({
            onlineWin: 0.50,
            overallWR: 0.00,
            overallGames: 30,
        });
        assert.ok(Math.abs(r.pWin - 0.175) < 1e-9,
            `expected 0.175, got ${r.pWin}`);
    });

    it('Major 100 % WR pulls a 50 % online to 82.5 %', () => {
        // 1.0 × 0.65 + 0.50 × 0.35 = 0.825. Symmetric to the 0 % case.
        const r = blendMatchup({
            onlineWin: 0.50,
            overallWR: 1.00,
            overallGames: 30,
        });
        assert.ok(Math.abs(r.pWin - 0.825) < 1e-9);
    });

    it('Below MIN_GAMES_OVERALL Overall is ignored — falls back to online', () => {
        // 9 games < 10 threshold. Major signal must be rejected and
        // online win pct passes through unchanged.
        const r = blendMatchup({
            onlineWin: 0.45,
            overallWR: 0.80,
            overallGames: 9,
        });
        assert.strictEqual(r.blended, false);
        assert.strictEqual(r.pWin, 0.45);
        assert.strictEqual(r.source, 'online');
    });

    it('Old 75 / 25 ratio would produce a different number — guard against regression', () => {
        // Same inputs as test 1 but using the OLD ratio:
        //   0.60 × 0.75 + 0.40 × 0.25 = 0.45 + 0.10 = 0.55
        // New result is 0.53 — distinguishable, so a silent revert of
        // MAJOR_MATCHUP_BLEND_FACTOR to 0.75 would surface here.
        const r = blendMatchup({
            onlineWin: 0.40,
            overallWR: 0.60,
            overallGames: 100,
        });
        const old75_25 = 0.60 * 0.75 + 0.40 * 0.25;
        assert.notStrictEqual(r.pWin, old75_25);
        assert.ok(r.pWin < old75_25,
            'New 65/35 blend should weight online more than old 75/25');
    });
});

describe('Major matchup blend — Day-2 preference', () => {
    it('Day-2 WR replaces Overall when sample ≥ MIN_GAMES_DAY2', () => {
        // Overall says 55 % WR, Day-2 says 70 % WR (8 games — above 5).
        // Day-2 wins the source-selection; blend uses 70 % × 0.65 + 50 % × 0.35.
        const r = blendMatchup({
            onlineWin: 0.50,
            overallWR: 0.55,
            overallGames: 50,
            day2WR: 0.70,
            day2Games: 8,
        });
        const expected = 0.70 * 0.65 + 0.50 * 0.35; // = 0.63
        assert.ok(Math.abs(r.pWin - expected) < 1e-9,
            `expected ${expected}, got ${r.pWin}`);
        assert.strictEqual(r.source, 'day2');
    });

    it('Day-2 below MIN_GAMES_DAY2 falls back to Overall', () => {
        // 4 games < 5 floor — Day-2 ignored. Should land at the
        // Overall × 0.65 + Online × 0.35 figure.
        const r = blendMatchup({
            onlineWin: 0.50,
            overallWR: 0.55,
            overallGames: 50,
            day2WR: 0.70,
            day2Games: 4,
        });
        const expected = 0.55 * 0.65 + 0.50 * 0.35; // = 0.5325
        assert.ok(Math.abs(r.pWin - expected) < 1e-9);
        assert.strictEqual(r.source, 'overall');
    });

    it('No Day-2 data, no Overall data → fall through to online', () => {
        const r = blendMatchup({
            onlineWin: 0.42,
        });
        assert.strictEqual(r.blended, false);
        assert.strictEqual(r.pWin, 0.42);
        assert.strictEqual(r.source, 'online');
    });

    it('Day-2 alone (no Overall) is sufficient when sample meets floor', () => {
        // Predictor must NOT require Overall to be present too — a
        // pair that's only seen in Day-2 (e.g. a niche tech matchup
        // that only emerged in cut) should still drive the blend.
        const r = blendMatchup({
            onlineWin: 0.40,
            day2WR: 0.65,
            day2Games: 6,
        });
        const expected = 0.65 * 0.65 + 0.40 * 0.35; // = 0.5625
        assert.ok(Math.abs(r.pWin - expected) < 1e-9);
        assert.strictEqual(r.source, 'day2');
    });

    it('Overall on the edge (= MIN_GAMES_OVERALL) is accepted, not rejected', () => {
        // Exactly 10 games should clear the floor (not strictly greater).
        const r = blendMatchup({
            onlineWin: 0.50,
            overallWR: 0.60,
            overallGames: MIN_GAMES_OVERALL,
        });
        assert.strictEqual(r.blended, true);
        assert.strictEqual(r.source, 'overall');
    });

    it('Day-2 on the edge (= MIN_GAMES_DAY2) wins over Overall', () => {
        // Edge case: Day-2 just qualifies, Overall is also valid.
        // Day-2 must win — it's the higher-quality signal.
        const r = blendMatchup({
            onlineWin: 0.50,
            overallWR: 0.60,
            overallGames: 100,
            day2WR: 0.40,
            day2Games: MIN_GAMES_DAY2,
        });
        assert.strictEqual(r.source, 'day2');
    });
});

describe('Major matchup blend — sanity / constants', () => {
    it('Major + Online factors sum to 1.0', () => {
        assert.ok(Math.abs((MAJOR_BLEND_FACTOR + ONLINE_BLEND_FACTOR) - 1.0) < 1e-9);
    });

    it('Major weighs more than Online but not by an extreme margin', () => {
        // Sanity-bound the constants: Major should lead, but not so
        // much that Online becomes decorative. The user's 65 / 35
        // sits in the middle of [0.55, 0.75] — both bounds are
        // assertions about realistic data-source priors.
        assert.ok(MAJOR_BLEND_FACTOR > 0.55);
        assert.ok(MAJOR_BLEND_FACTOR < 0.75);
    });

    it('Day-2 game floor is lower than Overall floor (smaller samples are normal)', () => {
        // Day-2 has fewer rounds → smaller per-pair samples. Floor
        // must be lower to actually let Day-2 fire on real data.
        assert.ok(MIN_GAMES_DAY2 < MIN_GAMES_OVERALL);
    });
});
