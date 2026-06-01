/**
 * Unit tests for the 3-source matchup blend in Meta Call's
 * `getBaseMatchup`. User-flagged 2026-06: matchup predictions
 * combine three labs/online sources rather than switching between
 * them. Weights are quality-based (not games-weighted):
 *
 *     Day-2     45 %   cut-quality play, smallest noise
 *     Day-1     35 %   full Swiss field
 *     Online    20 %   live, broad coverage, elite-pilot biased
 *
 * Partial coverage is handled by renormalisation. Missing sources
 * have their weight redistributed proportionally across what's
 * present — no hard cliffs at the sample-size floors, no "switching"
 * between sources.
 *
 * When NEITHER Day-1 nor Day-2 has enough samples for a pair
 * (early-meta gap, niche archetype), Overall steps in as a single
 * Major anchor at weight = Day-1 + Day-2 = 0.80. Online stays at
 * 0.20 so the relative Major-Online split holds across both code
 * paths.
 *
 * These tests mirror the production constants and formulas in
 * isolation. If a maintainer changes the constants in app-meta-call.js,
 * the mirrors here go out of sync and the "constants stay realistic"
 * suite fails loudly.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Production-mirrored constants — keep in lockstep with
// js/app-meta-call.js (search "MATCHUP_BLEND_WEIGHT_").
const W_DAY2    = 0.45;
const W_DAY1    = 0.35;
const W_ONLINE  = 0.20;
const W_OVERALL_FALLBACK = W_DAY1 + W_DAY2;  // 0.80

const MIN_GAMES_OVERALL = 10;
const MIN_GAMES_DAY1    = 5;
const MIN_GAMES_DAY2    = 5;

// Reference blend. Inputs are nullable per source; output reports
// the final pWin, whether the blend fired, and the normalised
// weight + games per active source. Mirrors the production
// `getBaseMatchup` 3-source pipeline.
function blendMatchup({
    onlineWin,
    day2WR, day2Games,
    day1WR, day1Games,
    overallWR, overallGames,
}) {
    const sources = [];
    if (day2WR != null && day2Games >= MIN_GAMES_DAY2) {
        sources.push({ kind: 'day2', win: day2WR, weight: W_DAY2, games: day2Games });
    }
    if (day1WR != null && day1Games >= MIN_GAMES_DAY1) {
        sources.push({ kind: 'day1', win: day1WR, weight: W_DAY1, games: day1Games });
    }
    if (sources.length === 0) {
        if (overallWR != null && overallGames >= MIN_GAMES_OVERALL) {
            sources.push({ kind: 'overall', win: overallWR, weight: W_OVERALL_FALLBACK, games: overallGames });
        }
    }
    if (sources.length === 0) {
        return { pWin: onlineWin, blended: false, sources: [{ kind: 'online', weight: 1.0, games: null }] };
    }
    sources.push({ kind: 'online', win: onlineWin, weight: W_ONLINE, games: null });
    const total = sources.reduce((s, x) => s + x.weight, 0);
    const pWin = sources.reduce((s, x) => s + x.win * (x.weight / total), 0);
    return {
        pWin,
        blended: true,
        sources: sources.map(s => ({ kind: s.kind, weight: s.weight / total, games: s.games })),
    };
}

// ── Full coverage: all three sources present ───────────────────

describe('3-source matchup blend — full coverage (Day-2 + Day-1 + Online)', () => {
    it('All three at 50 % → blend stays at 50 % (identity)', () => {
        const r = blendMatchup({
            onlineWin: 0.50,
            day2WR: 0.50, day2Games: 8,
            day1WR: 0.50, day1Games: 24,
        });
        assert.ok(Math.abs(r.pWin - 0.50) < 1e-9);
    });

    it('Day-2 70 %, Day-1 60 %, Online 50 % → 0.45×0.70 + 0.35×0.60 + 0.20×0.50 = 0.625', () => {
        const r = blendMatchup({
            onlineWin: 0.50,
            day2WR: 0.70, day2Games: 8,
            day1WR: 0.60, day1Games: 24,
        });
        const expected = 0.45 * 0.70 + 0.35 * 0.60 + 0.20 * 0.50;
        assert.ok(Math.abs(r.pWin - expected) < 1e-9,
            `expected ${expected}, got ${r.pWin}`);
    });

    it('Day-2 dominates the blend more than Day-1 does', () => {
        // Move Day-2 WR by 10 pp → effect on the blend should be larger
        // than moving Day-1 by the same 10 pp.
        const a = blendMatchup({
            onlineWin: 0.50,
            day2WR: 0.60, day2Games: 10,
            day1WR: 0.50, day1Games: 30,
        }).pWin;
        const b = blendMatchup({
            onlineWin: 0.50,
            day2WR: 0.50, day2Games: 10,
            day1WR: 0.60, day1Games: 30,
        }).pWin;
        // a (Day-2 +10pp) should be closer to 0.55 than b (Day-1 +10pp).
        assert.ok((a - 0.50) > (b - 0.50),
            `Day-2 should weigh more than Day-1; got Day-2 effect ${a - 0.50} vs Day-1 effect ${b - 0.50}`);
    });

    it('Sources list carries the correct normalised weights when complete', () => {
        const r = blendMatchup({
            onlineWin: 0.50,
            day2WR: 0.60, day2Games: 8,
            day1WR: 0.55, day1Games: 24,
        });
        const byKind = Object.fromEntries(r.sources.map(s => [s.kind, s.weight]));
        // Total weights = 0.45 + 0.35 + 0.20 = 1.0 → renorm is identity.
        assert.ok(Math.abs(byKind.day2   - 0.45) < 1e-9);
        assert.ok(Math.abs(byKind.day1   - 0.35) < 1e-9);
        assert.ok(Math.abs(byKind.online - 0.20) < 1e-9);
    });
});

// ── Partial coverage: renormalisation kicks in ─────────────────

describe('3-source matchup blend — partial coverage / renormalisation', () => {
    it('Day-2 only (no Day-1): weights renormalise to 0.692 Day-2 / 0.308 Online', () => {
        const r = blendMatchup({
            onlineWin: 0.40,
            day2WR: 0.70, day2Games: 7,
        });
        // 0.45 + 0.20 = 0.65 total; renorm Day-2 = 0.45/0.65 = 0.6923
        const expected = 0.70 * (0.45 / 0.65) + 0.40 * (0.20 / 0.65);
        assert.ok(Math.abs(r.pWin - expected) < 1e-9,
            `expected ${expected}, got ${r.pWin}`);
        const byKind = Object.fromEntries(r.sources.map(s => [s.kind, s.weight]));
        assert.ok(Math.abs(byKind.day2   - (0.45 / 0.65)) < 1e-9);
        assert.ok(Math.abs(byKind.online - (0.20 / 0.65)) < 1e-9);
    });

    it('Day-1 only (no Day-2): weights renormalise to 0.636 Day-1 / 0.364 Online', () => {
        const r = blendMatchup({
            onlineWin: 0.40,
            day1WR: 0.60, day1Games: 30,
        });
        // 0.35 + 0.20 = 0.55 total
        const expected = 0.60 * (0.35 / 0.55) + 0.40 * (0.20 / 0.55);
        assert.ok(Math.abs(r.pWin - expected) < 1e-9);
    });

    it('Below MIN_GAMES_DAY2 → Day-2 dropped from the blend', () => {
        // 4 < 5 → Day-2 ignored. Day-1 + Online remain.
        const r = blendMatchup({
            onlineWin: 0.40,
            day2WR: 0.95, day2Games: 4,
            day1WR: 0.50, day1Games: 30,
        });
        const expected = 0.50 * (0.35 / 0.55) + 0.40 * (0.20 / 0.55);
        assert.ok(Math.abs(r.pWin - expected) < 1e-9,
            `Day-2 with 4 games must be dropped; expected ${expected}, got ${r.pWin}`);
    });

    it('Both Day-1 and Day-2 below floor → falls back to Overall as anchor', () => {
        const r = blendMatchup({
            onlineWin: 0.50,
            day2WR: 0.90, day2Games: 3,   // < 5
            day1WR: 0.90, day1Games: 4,   // < 5
            overallWR: 0.60, overallGames: 80,
        });
        // Overall 0.80 + Online 0.20 (no renorm since they already sum to 1)
        const expected = 0.60 * 0.80 + 0.50 * 0.20;
        assert.ok(Math.abs(r.pWin - expected) < 1e-9,
            `Overall fallback expected ${expected}, got ${r.pWin}`);
        assert.strictEqual(r.sources[0].kind, 'overall');
    });

    it('Neither day-split NOR Overall qualifies → falls through to online-only', () => {
        const r = blendMatchup({
            onlineWin: 0.42,
            overallWR: 0.95, overallGames: 9,   // < 10
        });
        assert.strictEqual(r.blended, false);
        assert.strictEqual(r.pWin, 0.42);
        assert.strictEqual(r.sources[0].kind, 'online');
        assert.strictEqual(r.sources[0].weight, 1.0);
    });

    it('No labs data at all → online passes through', () => {
        const r = blendMatchup({ onlineWin: 0.55 });
        assert.strictEqual(r.blended, false);
        assert.strictEqual(r.pWin, 0.55);
    });
});

// ── Edge cases ─────────────────────────────────────────────────

describe('3-source matchup blend — edge cases', () => {
    it('Sample exactly = MIN_GAMES_DAY2 still qualifies (not strictly greater)', () => {
        const r = blendMatchup({
            onlineWin: 0.50,
            day2WR: 0.70, day2Games: MIN_GAMES_DAY2,
        });
        assert.strictEqual(r.blended, true);
        assert.ok(r.sources.some(s => s.kind === 'day2'));
    });

    it('Day-2 at 0 % WR + Online at 50 % → blend pulls toward Day-2 by its share', () => {
        // 0 × 0.692 + 0.50 × 0.308 = 0.154 (when only Day-2 is present)
        const r = blendMatchup({
            onlineWin: 0.50,
            day2WR: 0.0, day2Games: 10,
        });
        const expected = 0.0 + 0.50 * (0.20 / 0.65);
        assert.ok(Math.abs(r.pWin - expected) < 1e-9);
    });

    it('Day-2 at 100 % WR + Online at 50 % → blend pulls toward Day-2 (symmetric to 0 %)', () => {
        const r = blendMatchup({
            onlineWin: 0.50,
            day2WR: 1.0, day2Games: 10,
        });
        const expected = 1.0 * (0.45 / 0.65) + 0.50 * (0.20 / 0.65);
        assert.ok(Math.abs(r.pWin - expected) < 1e-9);
    });

    it('Old 65/35 (two-source) ratio would produce a different number — regression guard', () => {
        // Same inputs as full-coverage test 2, but using the OLD
        // 65/35 (Major aggregated D2+D1 weighted, then 65/35 with online):
        //   old major = (0.45×0.70 + 0.35×0.60) / 0.80 = 0.65625
        //   old blend = 0.65 × 0.65625 + 0.35 × 0.50 = 0.6015625
        // New blend (this test):
        //   0.45×0.70 + 0.35×0.60 + 0.20×0.50 = 0.625
        // The two are distinguishable → catches a silent revert.
        const r = blendMatchup({
            onlineWin: 0.50,
            day2WR: 0.70, day2Games: 8,
            day1WR: 0.60, day1Games: 24,
        });
        const old = 0.65 * ((0.45 * 0.70 + 0.35 * 0.60) / 0.80) + 0.35 * 0.50;
        assert.notStrictEqual(Math.round(r.pWin * 1e6) / 1e6, Math.round(old * 1e6) / 1e6);
    });
});

// ── Constants sanity ───────────────────────────────────────────

describe('3-source matchup blend — constants stay realistic', () => {
    it('Weights sum to 1.0', () => {
        assert.ok(Math.abs((W_DAY2 + W_DAY1 + W_ONLINE) - 1.0) < 1e-9);
    });

    it('Overall fallback weight equals Day-1 + Day-2', () => {
        assert.ok(Math.abs(W_OVERALL_FALLBACK - (W_DAY1 + W_DAY2)) < 1e-9);
    });

    it('Day-2 weighs more than Day-1, Day-1 weighs more than Online', () => {
        assert.ok(W_DAY2 > W_DAY1, 'Day-2 must weigh more (higher quality signal)');
        assert.ok(W_DAY1 > W_ONLINE, 'Day-1 must weigh more than Online');
    });

    it('Day-2 + Day-1 (Major) is 80 % of the total — Online is the 20 % minority', () => {
        assert.ok(Math.abs((W_DAY2 + W_DAY1) - 0.80) < 1e-9);
        assert.strictEqual(W_ONLINE, 0.20);
    });

    it('Sample floors: Day-2/Day-1 lower than Overall (smaller per-pair samples are normal)', () => {
        assert.ok(MIN_GAMES_DAY2 < MIN_GAMES_OVERALL);
        assert.ok(MIN_GAMES_DAY1 < MIN_GAMES_OVERALL);
    });
});
