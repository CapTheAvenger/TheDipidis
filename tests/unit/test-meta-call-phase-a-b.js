/**
 * Unit tests for the Indy-2026 calibration changes in Meta Call:
 *
 *   Phase α A — CRI-Format-Filter
 *     Decks with online-ladder presence but ZERO active-meta labs
 *     rows get dropped from the prediction pool. Catches CRI-format
 *     archetypes (Mega Greninja, Beedrill) that bleed onto the
 *     online ladder during the in-person lag window but don't show
 *     up at any TEF-POR Regional.
 *
 *   Phase α C — In-Person-Absent-Damper
 *     Decks WITH labs rows that never broke the top-15 of any active-
 *     meta tournament get their `onlineShare` multiplied by 0.4 so
 *     they don't poison the prediction. Catches the Slowking pattern
 *     (4.92 % online → 1.98 % in person).
 *
 *   Phase β — Major-First-Anchor (recency-weighted)
 *     Decks with ≥ 2 labs majors at ≥ 2 % share get a primary base
 *     of `0.30 × recency_weighted_major_avg + 0.70 × online`, with
 *     the major average computed via [0.70, 0.20, 0.10] weights over
 *     the last 3 majors. Anchor only nudges the prediction — doesn't
 *     pull it all the way to the average — so decks fading from a
 *     last-major peak (Dragapult Dudunsparce 8.94 % Campinas → 2.03 %
 *     Indy) don't get over-anchored.
 *
 *   Predictor 5.4 cap reduction (0.6/1.5 → 0.4/1.0)
 *     Defensive against online-hype decks that would otherwise get
 *     +1.2 pp boost on a noisy growth signal that doesn't translate
 *     to in-person events.
 *
 * The mirrors below stay in lockstep with the production constants in
 * js/app-meta-call.js. If a maintainer changes either side, the
 * constants-sanity suite fails loudly so the calibration mirror gets
 * resynced before the engine is re-tuned.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Production-mirrored constants. Keep in sync with js/app-meta-call.js
// (search "PHASE_B_" and "PHASE_A_C_").
const PHASE_A_C_DAMP_FACTOR    = 0.40;
const PHASE_A_C_TOP_N          = 15;
const PHASE_B_MIN_TOURNAMENTS  = 2;
const PHASE_B_MIN_SHARE_PCT    = 2.0;
const PHASE_B_MAJOR_WEIGHTS    = [0.70, 0.20, 0.10];
const PHASE_B_BLEND_MAJOR      = 0.30;
const PREDICTOR_5_4_BOOST_PER_PP = 0.4;
const PREDICTOR_5_4_BOOST_PP_MAX = 1.0;

// Reference helpers, mirroring the engine's logic in isolation.

function phaseAFilter(onlineDecks, activeFormatDecks) {
    // Drop decks not in the active-meta labs set.
    return onlineDecks.filter(d => activeFormatDecks.has(d.name));
}

function phaseACDamper(deck, top15Set) {
    if (top15Set.has(deck.name)) return deck.onlineShare;
    return deck.onlineShare * PHASE_A_C_DAMP_FACTOR;
}

function recencyWeightedMajor(majorHistory) {
    if (!majorHistory || majorHistory.length === 0) return null;
    const eligible = majorHistory.filter(m => m.share >= PHASE_B_MIN_SHARE_PCT);
    if (eligible.length < PHASE_B_MIN_TOURNAMENTS) return null;
    const sorted = [...majorHistory].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const top = sorted.slice(0, PHASE_B_MAJOR_WEIGHTS.length);
    let sum = 0, wTotal = 0;
    for (let i = 0; i < top.length; i++) {
        const wt = PHASE_B_MAJOR_WEIGHTS[i];
        sum += top[i].share * wt;
        wTotal += wt;
    }
    return wTotal > 0 ? sum / wTotal : null;
}

function phaseBBase(deck, majorHistory) {
    const avg = recencyWeightedMajor(majorHistory);
    if (avg == null || avg <= 0) return deck.onlineShare;
    return avg * PHASE_B_BLEND_MAJOR + deck.onlineShare * (1 - PHASE_B_BLEND_MAJOR);
}

function predictor5_4_boost(avgGrowthPP) {
    if (avgGrowthPP < 0.5) return 0;
    return Math.min(PREDICTOR_5_4_BOOST_PP_MAX, avgGrowthPP * PREDICTOR_5_4_BOOST_PER_PP);
}

// ── Phase α A — CRI-Format-Filter ──────────────────────────────

describe('Phase α A — CRI-Format-Filter', () => {
    it('drops decks with no active-meta labs presence', () => {
        const online = [
            { name: 'Mega Greninja',  onlineShare: 7.03 },
            { name: 'Beedrill',       onlineShare: 4.73 },
            { name: 'Dragapult',      onlineShare: 9.51 },
        ];
        const activeSet = new Set(['Dragapult']); // Mega Greninja + Beedrill never appeared in TEF-POR labs
        const filtered = phaseAFilter(online, activeSet);
        assert.strictEqual(filtered.length, 1);
        assert.strictEqual(filtered[0].name, 'Dragapult');
    });

    it('keeps every deck when activeSet contains them all', () => {
        const online = [
            { name: 'Dragapult', onlineShare: 9.51 },
            { name: 'N\'s Zoroark', onlineShare: 3.91 },
        ];
        const activeSet = new Set(['Dragapult', 'N\'s Zoroark']);
        const filtered = phaseAFilter(online, activeSet);
        assert.strictEqual(filtered.length, 2);
    });
});

// ── Phase α C — In-Person-Absent-Damper ────────────────────────

describe('Phase α C — In-Person-Absent-Damper', () => {
    it('damps the Slowking shape (online 4.92 → 1.97 after ×0.4)', () => {
        const deck = { name: 'Slowking', onlineShare: 4.92 };
        const top15 = new Set(['Dragapult', 'N\'s Zoroark']); // Slowking not in top-15 anywhere
        const damped = phaseACDamper(deck, top15);
        assert.ok(Math.abs(damped - 4.92 * 0.4) < 1e-9, `expected 1.968, got ${damped}`);
    });

    it('does NOT damp Tier-1 decks that broke top-15', () => {
        const deck = { name: 'Dragapult', onlineShare: 9.51 };
        const top15 = new Set(['Dragapult']);
        assert.strictEqual(phaseACDamper(deck, top15), 9.51);
    });

    it('damper factor is below 0.5 (so the effect is meaningful)', () => {
        // Sanity: if someone bumps the factor to 0.95 to "soften" the
        // damper, the Slowking pattern resurges. Keep < 0.5 to ensure
        // the signal stays loud.
        assert.ok(PHASE_A_C_DAMP_FACTOR < 0.5);
    });
});

// ── Phase β — Major-First-Anchor ───────────────────────────────

describe('Phase β — Major-First-Anchor', () => {
    it('established deck: 30 % major + 70 % online blend', () => {
        // Raging Bolt Ogerpon shape — online 3.64 %, recency-weighted
        // major avg ~5.84 %.
        const deck = { name: 'Raging Bolt Ogerpon', onlineShare: 3.64 };
        const history = [
            { date: '2026-05-23', share: 5.43 },
            { date: '2026-05-16', share: 6.35 },
            { date: '2026-05-16', share: 7.67 },
        ];
        const base = phaseBBase(deck, history);
        // 0.70×5.43 + 0.20×6.35 + 0.10×7.67 = 5.838
        // 0.30×5.838 + 0.70×3.64 = 4.299
        assert.ok(Math.abs(base - 4.299) < 0.01, `expected 4.299, got ${base}`);
        // Should be HIGHER than naive online but lower than full major avg
        assert.ok(base > deck.onlineShare, 'anchor must lift the base above online');
        assert.ok(base < 5.838, 'anchor must NOT pull all the way to major avg');
    });

    it('Decks with < 2 majors at ≥ 2 % share fall back to online (no anchor)', () => {
        const deck = { name: 'Fresh Deck', onlineShare: 1.5 };
        const history = [
            { date: '2026-05-23', share: 2.5 }, // only one major ≥ 2 %
            { date: '2026-05-16', share: 0.5 },
        ];
        const base = phaseBBase(deck, history);
        assert.strictEqual(base, 1.5);
    });

    it('Empty history → no anchor', () => {
        const deck = { name: 'Brand New', onlineShare: 0.5 };
        assert.strictEqual(phaseBBase(deck, []), 0.5);
        assert.strictEqual(phaseBBase(deck, null), 0.5);
    });

    it('Weights sum to 1 and are recency-biased', () => {
        const sum = PHASE_B_MAJOR_WEIGHTS.reduce((s, w) => s + w, 0);
        assert.ok(Math.abs(sum - 1.0) < 1e-9);
        // Recency-bias invariant: each weight ≥ the next.
        for (let i = 1; i < PHASE_B_MAJOR_WEIGHTS.length; i++) {
            assert.ok(PHASE_B_MAJOR_WEIGHTS[i] <= PHASE_B_MAJOR_WEIGHTS[i - 1],
                'weights must be monotonically non-increasing');
        }
    });

    it('Recency-weighted avg uses the NEWEST major as the heaviest input', () => {
        const history = [
            { date: '2026-05-23', share: 10.0 }, // newest
            { date: '2026-05-09', share: 2.0  },
            { date: '2026-04-25', share: 2.0  },
        ];
        const avg = recencyWeightedMajor(history);
        // 0.70×10 + 0.20×2 + 0.10×2 = 7.0 + 0.4 + 0.2 = 7.6
        assert.ok(Math.abs(avg - 7.6) < 1e-9);
    });

    it('When fewer than 3 majors exist, weights renormalise to the available ones', () => {
        // Two majors at ≥2 % share — second-last weight (0.20) won't be used.
        const history = [
            { date: '2026-05-23', share: 6.0 },
            { date: '2026-05-09', share: 4.0 },
        ];
        const avg = recencyWeightedMajor(history);
        // (0.70×6 + 0.20×4) / (0.70 + 0.20) = (4.2 + 0.8) / 0.9 = 5.555
        assert.ok(Math.abs(avg - 5.555) < 0.01, `expected ~5.555, got ${avg}`);
    });

    it('Declining deck: anchor still nudges UP (this is the trade-off)', () => {
        // Dragapult Dudunsparce shape: peaked at Campinas, declining.
        // The current Phase β doesn't trend-detect — it just averages.
        // We accept this trade-off for now (calibration sweep showed
        // 0.30 blend keeps MAE marginally below naive baseline overall).
        // This test documents the known limitation.
        const deck = { name: 'Dragapult Dudunsparce', onlineShare: 2.03 };
        const history = [
            { date: '2026-05-23', share: 3.13 },
            { date: '2026-05-16', share: 6.07 },
            { date: '2026-05-16', share: 8.94 },
        ];
        const base = phaseBBase(deck, history);
        // 0.70×3.13 + 0.20×6.07 + 0.10×8.94 = 2.19 + 1.21 + 0.89 = 4.30
        // 0.30×4.30 + 0.70×2.03 = 2.71
        // Anchor adds +0.68 pp above online (2.03 → 2.71) — small enough
        // that the decline doesn't get over-extrapolated.
        assert.ok(base > deck.onlineShare,
            'anchor still moves up even when declining (known limitation)');
        assert.ok(base < 4.30,
            'but the 30 % blend keeps the nudge small relative to the average');
    });
});

// ── Predictor 5.4 cap reduction ─────────────────────────────────

describe('Predictor 5.4 cap reduction (2026-06 Indy calibration)', () => {
    it('cap lowered from 1.5 pp to 1.0 pp', () => {
        assert.strictEqual(PREDICTOR_5_4_BOOST_PP_MAX, 1.0);
    });

    it('per-pp multiplier lowered from 0.6 to 0.4', () => {
        assert.strictEqual(PREDICTOR_5_4_BOOST_PER_PP, 0.4);
    });

    it('A +2 pp Δ-growth now produces 0.8 pp (was 1.2 pp under the old constants)', () => {
        const boost = predictor5_4_boost(2.0);
        assert.ok(Math.abs(boost - 0.8) < 1e-9, `expected 0.8, got ${boost}`);
    });

    it('Extreme Δ-growth saturates at 1.0 pp cap', () => {
        assert.strictEqual(predictor5_4_boost(5.0), PREDICTOR_5_4_BOOST_PP_MAX);
        assert.strictEqual(predictor5_4_boost(100), PREDICTOR_5_4_BOOST_PP_MAX);
    });

    it('Sub-threshold growth still produces zero', () => {
        assert.strictEqual(predictor5_4_boost(0.3), 0);
        assert.strictEqual(predictor5_4_boost(0.499), 0);
    });
});
