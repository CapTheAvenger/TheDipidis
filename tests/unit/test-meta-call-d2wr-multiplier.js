/**
 * Unit tests for the d2WR (Day-2 Win Rate) multiplier in the Meta
 * Call recommendations engine.
 *
 * User-flagged 2026-06 after the Indianapolis reco post-mortem:
 *   Festival Lead → labs conv 29 % BUT labs d2WR 47.5 %
 *      → made cut at Indy (13.79 %) but lost (d2WR 30.83 %).
 *   Basic Box → labs conv 28.7 % AND labs d2WR 55.5 %
 *      → made cut (29.69 %) AND won (48.77 %). Best Day-2 deck of
 *        the event.
 *
 * The user's rule: "high conversion is only a reliable Day-2
 * indicator when backed by win-rate ≥ 50 %". Implementation: blend
 * sim-day2Prob + labs-conv as before, THEN multiply by a clamped
 * factor derived from the deck's recency-weighted Day-2 win rate.
 *
 * Multiplier curve (centred on 50 %):
 *   d2WR  35 %  →  0.40   heavy damp ("deck consistently loses cut")
 *   d2WR  45 %  →  0.50
 *   d2WR  50 %  →  1.00   neutral
 *   d2WR  55 %  →  1.50
 *   d2WR  65 %+ →  1.60   capped
 *
 * Constants mirror js/app-meta-call.js — keep in lockstep.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

function d2WrMultiplier(d2WrPct) {
    if (d2WrPct == null) return 1.0;
    const raw = 1.0 + (d2WrPct - 50) / 10;
    return Math.max(0.4, Math.min(1.6, raw));
}

// ── Anchors against the Indy reco actuals ─────────────────────

describe('d2WR multiplier — Indy reco post-mortem anchors', () => {
    it('Festival Lead shape (47.5 % d2WR) damps to ~0.75', () => {
        // Festival Lead avg d2WR across 5 TEF-POR majors = 47.49 %.
        // Multiplier: 1.0 + (47.49 - 50) / 10 = 0.749 → matches.
        const m = d2WrMultiplier(47.49);
        assert.ok(Math.abs(m - 0.749) < 0.01, `expected ~0.75, got ${m.toFixed(3)}`);
        assert.ok(m < 1.0, 'must damp');
    });

    it('Basic Box shape (55.5 % d2WR) boosts to ~1.55', () => {
        const m = d2WrMultiplier(55.47);
        assert.ok(Math.abs(m - 1.547) < 0.01);
        assert.ok(m > 1.0, 'must boost');
    });

    it('Dragapult Dudunsparce shape (51.5 % d2WR) lightly boosts', () => {
        const m = d2WrMultiplier(51.52);
        assert.ok(m > 1.0 && m < 1.20, `expected mid-boost, got ${m.toFixed(3)}`);
    });

    it('A deck with no d2WR data passes through (multiplier = 1.0)', () => {
        // New archetype, no labs samples yet — must not be penalised.
        assert.strictEqual(d2WrMultiplier(null), 1.0);
    });
});

// ── Curve shape ────────────────────────────────────────────────

describe('d2WR multiplier — curve invariants', () => {
    it('Exactly 50 % d2WR is neutral (× 1.0)', () => {
        assert.strictEqual(d2WrMultiplier(50), 1.0);
    });

    it('Monotonically increasing in d2WR', () => {
        const points = [30, 40, 45, 48, 50, 52, 55, 60, 70];
        let prev = -Infinity;
        for (const p of points) {
            const m = d2WrMultiplier(p);
            assert.ok(m >= prev, `multiplier broke order at d2WR=${p}: ${m} < ${prev}`);
            prev = m;
        }
    });

    it('Lower cap at 0.4 — even a 0 % d2WR can\'t zero the prediction', () => {
        assert.strictEqual(d2WrMultiplier(0), 0.4);
        assert.strictEqual(d2WrMultiplier(20), 0.4);
        assert.strictEqual(d2WrMultiplier(35), 0.4);  // edge of cap
    });

    it('Upper cap at 1.6 — fluky 80 % d2WR can\'t over-extrapolate', () => {
        assert.strictEqual(d2WrMultiplier(70), 1.6);
        assert.strictEqual(d2WrMultiplier(85), 1.6);
        assert.strictEqual(d2WrMultiplier(100), 1.6);
    });

    it('Symmetric around 50 % within the linear range', () => {
        const a = d2WrMultiplier(45);   // 0.5
        const b = d2WrMultiplier(55);   // 1.5
        // (1.0 - a) should equal (b - 1.0) — symmetric drop / lift.
        assert.ok(Math.abs((1.0 - a) - (b - 1.0)) < 1e-9);
    });
});

// ── Joint behaviour with day2Prob ────────────────────────────

describe('d2WR multiplier — joint impact on reco ranking', () => {
    // Two candidates with same blended day2Prob but different d2WR
    // history. The Basic Box-shape pick should outrank the Festival
    // Lead-shape pick AFTER applying the multiplier.
    it('Equal-day2Prob candidates: Basic Box-shape outranks Festival Lead-shape', () => {
        const basicBoxScore  = 0.40 * d2WrMultiplier(55.47);  // wins-in-cut deck
        const festivalScore  = 0.40 * d2WrMultiplier(47.49);  // makes-cut-loses-early
        assert.ok(basicBoxScore > festivalScore,
            `expected Basic Box ${basicBoxScore.toFixed(3)} > Festival Lead ${festivalScore.toFixed(3)}`);
    });

    it('Even 100 %-of-cap d2WR boost can\'t flip a clear day2Prob lead', () => {
        // Deck A: day2Prob 0.50 but only neutral d2WR
        // Deck B: day2Prob 0.30 but max d2WR boost
        // → A's adjusted (0.50) still beats B's (0.30 * 1.6 = 0.48).
        const a = 0.50 * d2WrMultiplier(50);
        const b = 0.30 * d2WrMultiplier(70);
        assert.ok(a > b);
    });

    it('Heavy damp at d2WR 40 % can push a marginal Day-2 deck below threshold', () => {
        // The eng's Day-2-fähig threshold is 0.20. A deck with sim
        // day2Prob 0.30 and d2WR 40 % drops to 0.30 × 0.40 = 0.12
        // → falls off the Day-2 list, surfaces as Geheimtipp instead.
        const adjusted = 0.30 * d2WrMultiplier(40);
        assert.ok(adjusted < 0.20,
            `expected falls below Day-2 threshold; got ${adjusted}`);
    });
});
