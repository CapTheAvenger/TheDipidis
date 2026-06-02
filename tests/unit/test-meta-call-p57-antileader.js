/**
 * Predictor 5.7 — Anti-Leader Tech-Boost
 *
 * Backstory: at Indianapolis 2026-05-29, the anti-Dragapult tech wave
 * (Hydrapple, Mega Lucario, Basic Box) was systematically under-
 * predicted by 1.5–3.5 pp because the online-ladder share didn't
 * reflect the community's anticipation of Dragapult consolidation.
 *
 * Fix: when ANY family's predictedShareRaw exceeds the leader-
 * dominance threshold (25 %), look up the labs WR of every low-share
 * non-family deck against the leader's lead variant. Decks with
 * WR ≥ 55 % AND field share ≤ 5 % get an additive boost scaled by
 * wrEdge × BOOST_SCALE, capped at BOOST_PP_MAX.
 *
 * Constants mirror js/app-meta-call.js — keep in lockstep.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const P57 = {
    LEADER_DOMINANCE_THRESHOLD: 25.0,
    COUNTER_WR_THRESHOLD:       0.55,
    COUNTER_MAX_FIELD_SHARE:    5.0,
    BOOST_SCALE:                8.0,
    BOOST_PP_MAX:               1.5,
};

function p57BoostFor({ wr, fieldShare }) {
    if (fieldShare > P57.COUNTER_MAX_FIELD_SHARE) return 0;
    if (wr < P57.COUNTER_WR_THRESHOLD) return 0;
    const wrEdge = wr - 0.50;
    const boost = Math.min(P57.BOOST_PP_MAX, wrEdge * P57.BOOST_SCALE);
    if (boost <= 0.05) return 0;
    return boost;
}

describe('P5.7 — Anti-Leader Tech-Boost magnitudes', () => {
    it('Mega Lucario shape (55 % vs Dragapult, 0.9 % field) gets ~0.4 pp', () => {
        const b = p57BoostFor({ wr: 0.55, fieldShare: 0.9 });
        assert.ok(Math.abs(b - 0.40) < 0.001, `expected ~0.40 pp, got ${b.toFixed(3)}`);
    });

    it('Hydrapple shape (58 % vs Dragapult-family-leader, 3 % field) gets ~0.64 pp', () => {
        const b = p57BoostFor({ wr: 0.58, fieldShare: 3.0 });
        assert.ok(Math.abs(b - 0.64) < 0.001, `expected ~0.64 pp, got ${b.toFixed(3)}`);
    });

    it('Hits the 1.5 pp cap at extreme WR edge (wrEdge ≥ 0.1875)', () => {
        const b = p57BoostFor({ wr: 0.70, fieldShare: 1.0 });
        assert.strictEqual(b, 1.5);
    });

    it('Below 55 % WR — no boost (Counter-Pick gates on wins-vs-leader)', () => {
        // Hydrapple in TEF-POR labs is 44.9 % vs straight Dragapult —
        // doesn't get the anti-leader boost when leader is pure Dragapult.
        assert.strictEqual(p57BoostFor({ wr: 0.449, fieldShare: 3.0 }), 0);
        assert.strictEqual(p57BoostFor({ wr: 0.54,  fieldShare: 2.0 }), 0);
    });

    it('High field share decks are gated out (already-popular pole position decks)', () => {
        // Raging Bolt Ogerpon (6 % field, 55 % vs Dragapult): would
        // otherwise qualify, but is already big in the field — boost
        // is reserved for genuine surprise picks.
        assert.strictEqual(p57BoostFor({ wr: 0.60, fieldShare: 6.0 }), 0);
    });

    it('Marginal WR (55.5 %) at low field passes the floor', () => {
        const b = p57BoostFor({ wr: 0.555, fieldShare: 1.0 });
        assert.ok(b > 0.05 && b < 0.5);
    });
});

describe('P5.7 — Dominant family detection', () => {
    function findLeaderFamily(families) {
        let leader = null;
        let max = 0;
        let total = 0;
        Object.values(families).forEach(arr => arr.forEach(d => total += d.share));
        if (total <= 0) return null;
        Object.entries(families).forEach(([fam, arr]) => {
            const sum = arr.reduce((s, v) => s + v.share, 0);
            const pct = (sum / total) * 100;
            if (pct >= P57.LEADER_DOMINANCE_THRESHOLD && pct > max) {
                max = pct;
                leader = fam;
            }
        });
        return leader;
    }

    it('TEF-POR Dragapult family at 29 % triggers as leader', () => {
        const families = {
            Dragapult: [
                { share: 10.4 }, { share: 7.5 }, { share: 6.2 }, { share: 5.4 },
            ],
            // Realistic spread of competing families, none dominant:
            'Raging Bolt':       [{ share: 6.1 }],
            "Rocket's Mewtwo":   [{ share: 5.7 }],
            "N's Zoroark":       [{ share: 5.6 }],
            'Alakazam':          [{ share: 4.7 }],
            "Cynthia's Garchomp":[{ share: 4.6 }],
            'Lopunny':           [{ share: 4.1 }],
            'Lucario':           [{ share: 3.9 }],
            'Festival Lead':     [{ share: 4.3 }],
            'Ogerpon Meganium':  [{ share: 3.1 }, { share: 2.6 }],
            'Other':             [{ share: 25.8 }],
        };
        assert.strictEqual(findLeaderFamily(families), 'Dragapult');
    });

    it('No family at 25 % means no leader → boost stage is no-op', () => {
        const families = {
            FamA: [{ share: 10.0 }, { share: 10.0 }],
            FamB: [{ share: 8.0 }, { share: 12.0 }],
            FamC: [{ share: 5.0 }, { share: 5.0 }, { share: 10.0 }],
            FamD: [{ share: 8.0 }, { share: 7.0 }, { share: 5.0 }],
            FamE: [{ share: 20.0 }],
        };
        // Total = 100; max family = 20 % (FamE). Threshold is 25 %.
        assert.strictEqual(findLeaderFamily(families), null);
    });
});
