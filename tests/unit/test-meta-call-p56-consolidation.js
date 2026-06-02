/**
 * Predictor 5.6 — Format-Leader Within-Family Consolidation
 *
 * Backstory: at Indianapolis 2026-05-29 the Dragapult family went from
 *   29.34 % share (TEF-POR labs avg) → 32.12 % share (Indy actual),
 * and within the family, pure Dragapult went from 35.4 % within-family
 * → 61.5 % within-family. Sub-variants (Dudunsparce, Blaziken) lost
 * share to the lead variant. The Meta Call past-predictor under-
 * predicted pure Dragapult at Indy by 9.45 pp because no stage
 * captured the within-family consolidation pattern.
 *
 * Fix: when a family has ≥ 3 variants AND family aggregate share
 * exceeds FAMILY_DOMINANCE_THRESHOLD, take CONSOLIDATION_RATE of
 * the sub-variant pool and redirect it to the lead variant.
 *
 * Constants mirror js/app-meta-call.js — keep in lockstep.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const P56 = {
    FAMILY_DOMINANCE_THRESHOLD: 20.0,
    MIN_VARIANTS:               3,
    CONSOLIDATION_RATE:         0.40,
};

// Mirror of js/app-meta-call.js _computeFormatLeaderConsolidation,
// pure-fn form for testing.
function p56Apply(shares) {
    // shares: { family: [{deck, share}], ... }
    const out = {};
    let total = 0;
    for (const fam of Object.values(shares)) {
        for (const v of fam) {
            out[v.deck] = v.share;
            total += v.share;
        }
    }
    if (total <= 0) return out;
    for (const [family, variants] of Object.entries(shares)) {
        if (variants.length < P56.MIN_VARIANTS) continue;
        const famTotal = variants.reduce((s, v) => s + v.share, 0);
        const famPct = (famTotal / total) * 100;
        if (famPct < P56.FAMILY_DOMINANCE_THRESHOLD) continue;
        const sorted = variants.slice().sort((a, b) => b.share - a.share);
        const leader = sorted[0];
        const subs = sorted.slice(1);
        const subTotal = subs.reduce((s, v) => s + v.share, 0);
        if (subTotal <= 0) continue;
        const redistribute = subTotal * P56.CONSOLIDATION_RATE;
        out[leader.deck] += redistribute;
        for (const sv of subs) {
            out[sv.deck] -= (sv.share / subTotal) * redistribute;
        }
    }
    return out;
}

describe('P5.6 — Indianapolis anchor: Dragapult family consolidation', () => {
    it('Dragapult family redistributes ~40 % of sub-variant share to pure Dragapult', () => {
        const shares = {
            Dragapult: [
                { deck: 'Dragapult',             share: 10.4 },
                { deck: 'Dragapult Dusknoir',    share: 7.5 },
                { deck: 'Dragapult Blaziken',    share: 6.2 },
                { deck: 'Dragapult Dudunsparce', share: 5.4 },
                { deck: 'Dragapult Froslass',    share: 0.1 },
            ],
            // Padding so the field totals ~100; isn't part of the family.
            Padding: [{ deck: 'PaddingDeck', share: 70.4 }],
        };
        const out = p56Apply(shares);
        // Sub-variant pool = 19.2; redistribute 40 % = 7.68 pp to pure Dragapult.
        assert.ok(out.Dragapult > 17.9 && out.Dragapult < 18.5,
            `Dragapult should land ~18 % after consolidation; got ${out.Dragapult.toFixed(2)}`);
        // Sub-variants shrink proportionally.
        assert.ok(out['Dragapult Dudunsparce'] < 5.4 && out['Dragapult Dudunsparce'] > 3.0,
            `Dudunsparce should shrink ~40 %; got ${out['Dragapult Dudunsparce'].toFixed(2)}`);
        // Family total stays unchanged (redistribution is within family).
        const famTotal = ['Dragapult', 'Dragapult Dusknoir', 'Dragapult Blaziken', 'Dragapult Dudunsparce', 'Dragapult Froslass']
            .reduce((s, k) => s + out[k], 0);
        assert.ok(Math.abs(famTotal - 29.6) < 0.001,
            `Family total preserved: ${famTotal.toFixed(2)}`);
    });

    it('Single-variant family (Raging Bolt Ogerpon) is untouched', () => {
        const shares = {
            'Raging Bolt': [{ deck: 'Raging Bolt Ogerpon', share: 6.1 }],
            Padding: [{ deck: 'PaddingDeck', share: 93.9 }],
        };
        const out = p56Apply(shares);
        assert.strictEqual(out['Raging Bolt Ogerpon'], 6.1);
    });

    it('Below-threshold family (Starmie 4.4 % field) is untouched', () => {
        const shares = {
            Starmie: [
                { deck: 'Starmie Froslass',  share: 2.7 },
                { deck: 'Starmie Dusknoir',  share: 1.7 },
            ],
            Padding: [{ deck: 'PaddingDeck', share: 95.6 }],
        };
        const out = p56Apply(shares);
        assert.strictEqual(out['Starmie Froslass'], 2.7);
        assert.strictEqual(out['Starmie Dusknoir'], 1.7);
    });

    it('Family with only 2 variants does not consolidate (below MIN_VARIANTS)', () => {
        const shares = {
            'Ogerpon Meganium': [
                { deck: 'Ogerpon Meganium Hydrapple', share: 12.0 },
                { deck: 'Ogerpon Meganium Arboliva',  share: 11.0 },
            ],
            Padding: [{ deck: 'PaddingDeck', share: 77.0 }],
        };
        const out = p56Apply(shares);
        assert.strictEqual(out['Ogerpon Meganium Hydrapple'], 12.0);
        assert.strictEqual(out['Ogerpon Meganium Arboliva'], 11.0);
    });
});
