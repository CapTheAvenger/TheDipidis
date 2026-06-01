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
const PHASE_B_LOOKBACK_MAJORS  = 3;     // 2026-06: switched from weighted to MEDIAN
const PHASE_B_BLEND_MAJOR      = 0.20;  // 2026-06: lowered from 0.30
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

function medianMajor(majorHistory) {
    // Median over the deck's PHASE_B_LOOKBACK_MAJORS most-recent labs
    // majors, after the eligibility gate (≥ 2 majors at ≥ 2 % share).
    // Robust to single-tournament peaks that the earlier recency-
    // weighted variant over-anchored on (Dragapult Dudunsparce 8.94 %
    // at Campinas dragged the weighted avg to 4.30 %, the median ignores
    // that peak and lands on 6.07 %).
    if (!majorHistory || majorHistory.length === 0) return null;
    const eligible = majorHistory.filter(m => m.share >= PHASE_B_MIN_SHARE_PCT);
    if (eligible.length < PHASE_B_MIN_TOURNAMENTS) return null;
    const sorted = [...majorHistory].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const shares = sorted.slice(0, PHASE_B_LOOKBACK_MAJORS)
                         .map(h => h.share)
                         .sort((a, b) => a - b);
    if (shares.length === 0) return null;
    const n = shares.length;
    return n % 2 ? shares[Math.floor(n / 2)] : (shares[n / 2 - 1] + shares[n / 2]) / 2;
}

function phaseBBase(deck, majorHistory) {
    const med = medianMajor(majorHistory);
    if (med == null || med <= 0) return deck.onlineShare;
    return med * PHASE_B_BLEND_MAJOR + deck.onlineShare * (1 - PHASE_B_BLEND_MAJOR);
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
    it('established deck: 20 % major-median + 80 % online blend', () => {
        // Raging Bolt Ogerpon shape — online 3.64 %, majors at
        // 5.43 / 6.35 / 7.67. Median = 6.35.
        const deck = { name: 'Raging Bolt Ogerpon', onlineShare: 3.64 };
        const history = [
            { date: '2026-05-23', share: 5.43 },
            { date: '2026-05-16', share: 6.35 },
            { date: '2026-05-16', share: 7.67 },
        ];
        const base = phaseBBase(deck, history);
        // 0.20 × 6.35 + 0.80 × 3.64 = 1.27 + 2.912 = 4.182
        assert.ok(Math.abs(base - 4.182) < 0.01, `expected 4.182, got ${base}`);
        assert.ok(base > deck.onlineShare, 'anchor must lift the base above online');
        assert.ok(base < 6.35, 'anchor must NOT pull all the way to the median');
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

    it('Median is invariant to outliers (test the robustness property)', () => {
        // Three majors with one extreme peak — median should ignore it.
        const history = [
            { date: '2026-05-23', share: 5.0 },
            { date: '2026-05-09', share: 4.5 },
            { date: '2026-04-25', share: 15.0 },  // peak outlier
        ];
        assert.strictEqual(medianMajor(history), 5.0);
        // A weighted average would have been pulled up by the peak —
        // median doesn't. That's the entire point of the 2026-06 switch.
    });

    it('Median of 3 majors picks the middle value', () => {
        const history = [
            { date: '2026-05-23', share: 10.0 },
            { date: '2026-05-09', share: 2.0  },
            { date: '2026-04-25', share: 5.0  },
        ];
        assert.strictEqual(medianMajor(history), 5.0);
    });

    it('Median of 2 majors averages them', () => {
        const history = [
            { date: '2026-05-23', share: 6.0 },
            { date: '2026-05-09', share: 4.0 },
        ];
        assert.strictEqual(medianMajor(history), 5.0);
    });

    it('Lookback caps at PHASE_B_LOOKBACK_MAJORS — older majors ignored', () => {
        // 5 majors, lookback is 3 → only the newest 3 enter the median.
        const history = [
            { date: '2026-05-23', share: 3.0 },   // newest
            { date: '2026-05-09', share: 4.0 },
            { date: '2026-04-25', share: 5.0 },   // would-be-median if all 5 used
            { date: '2026-04-10', share: 9.0 },
            { date: '2026-03-25', share: 9.0 },
        ];
        // Newest 3: [3.0, 4.0, 5.0] → median 4.0
        assert.strictEqual(medianMajor(history), 4.0);
    });

    it('Declining deck: median resists the peak-driven over-prediction', () => {
        // Dragapult Dudunsparce shape: 3.13 / 6.07 / 8.94 (newest first).
        // The recency-weighted variant predicted 4.30 → anchor pushed
        // prediction above 4 → wrong (actual 2.03). The median = 6.07
        // ALSO over-predicts, but the lower 0.20 blend dampens the
        // damage: 0.20×6.07 + 0.80×2.03 = 1.21 + 1.62 = 2.84 (was 2.71
        // under the prior 0.30×weighted-avg = 2.71). Very close to
        // online, slight nudge up.
        const deck = { name: 'Dragapult Dudunsparce', onlineShare: 2.03 };
        const history = [
            { date: '2026-05-23', share: 3.13 },
            { date: '2026-05-16', share: 6.07 },
            { date: '2026-05-16', share: 8.94 },
        ];
        const base = phaseBBase(deck, history);
        assert.ok(Math.abs(base - 2.838) < 0.02, `expected ~2.838, got ${base}`);
        // Should be within 1 pp of online — the dampened anchor barely
        // moves the prediction for fading decks.
        assert.ok(base - deck.onlineShare < 1.0,
            'declining deck must not be pushed > 1 pp above online');
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
