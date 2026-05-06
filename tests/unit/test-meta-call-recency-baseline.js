/**
 * Unit tests for the Predictor 5.0 helpers in app-meta-call.js:
 *
 *   - _metaRecencyWeight: piecewise-linear age decay, same curve as the
 *     consistency builder uses for tournament-level data
 *   - _computeWeightedBaseline: per-deck weighted baseline share% across
 *     all available daily snapshots, with format-rotation cutoff
 *
 * The user-flagged motivation: the Predictor 4.x code uses two discrete
 * baseline points (at-major + week-ago) for trend signal. With 7+ daily
 * snapshots in online_share_history/, replacing those two points with a
 * smooth recency-weighted aggregate gives a less spike-tagged-noisy
 * trend. The format-rotation cutoff (× 0.10 weight for snapshots before
 * 2026-04-10) ensures pre-rotation share data — describing a meta with
 * Iono/Counter Catcher/Professor's Research that no longer exists —
 * doesn't drag the predictor toward archetypes that can't actually
 * compete in the post-rotation format.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function extractTopLevel(src, fnName) {
    const re = new RegExp(`function\\s+${fnName}\\s*\\(`);
    const m = re.exec(src);
    if (!m) throw new Error(`Function not found: ${fnName}`);
    const start = m.index;
    const openIdx = src.indexOf('{', start);
    let depth = 0, end = -1;
    for (let i = openIdx; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') depth--;
        if (depth === 0) { end = i + 1; break; }
    }
    return src.slice(start, end);
}

function load() {
    const src = fs.readFileSync(
        path.resolve(__dirname, '../../js/app-meta-call.js'),
        'utf-8'
    );
    // Pull the module-scope const that the helpers reference.
    const constMatch = /const\s+_FORMAT_ROTATION_DATE\s*=\s*['"][^'"]+['"]\s*;/.exec(src);
    if (!constMatch) throw new Error('Could not find _FORMAT_ROTATION_DATE');

    const snippet = [
        constMatch[0],
        extractTopLevel(src, '_metaRecencyWeight'),
        extractTopLevel(src, '_computeWeightedBaseline'),
    ].join('\n\n');

    const sandbox = { console, Math, Number, Object, Date };
    vm.createContext(sandbox);
    vm.runInContext(snippet, sandbox);
    return {
        recencyWeight: sandbox._metaRecencyWeight,
        weightedBaseline: sandbox._computeWeightedBaseline,
    };
}

const FNS = load();

describe('_metaRecencyWeight', () => {
    it('returns 1.0 within the 7-day full-weight window', () => {
        assert.equal(FNS.recencyWeight(0), 1.0);
        assert.equal(FNS.recencyWeight(3), 1.0);
        assert.equal(FNS.recencyWeight(7), 1.0);
    });

    it('decays linearly 1.0 → 0.4 between 7 and 21 days', () => {
        assert.ok(Math.abs(FNS.recencyWeight(14) - 0.7) < 1e-9);
        assert.ok(Math.abs(FNS.recencyWeight(21) - 0.4) < 1e-9);
    });

    it('decays linearly 0.4 → 0.1 between 21 and 42 days', () => {
        assert.ok(Math.abs(FNS.recencyWeight(31.5) - 0.25) < 1e-9);
        assert.ok(Math.abs(FNS.recencyWeight(42) - 0.1) < 1e-9);
    });

    it('floors at 0.05 beyond 42 days', () => {
        assert.equal(FNS.recencyWeight(43), 0.05);
        assert.equal(FNS.recencyWeight(100), 0.05);
        assert.equal(FNS.recencyWeight(365), 0.05);
    });

    it('handles invalid input as full weight', () => {
        assert.equal(FNS.recencyWeight(-5), 1.0);
        assert.equal(FNS.recencyWeight(NaN), 1.0);
        assert.equal(FNS.recencyWeight(undefined), 1.0);
    });
});

describe('_computeWeightedBaseline', () => {
    function snap(name, share) {
        return { [name.toLowerCase()]: { name, share } };
    }
    function multiSnap(entries) {
        // entries: [{ deckName, share }, ...] → snap object
        const out = {};
        for (const { deckName, share } of entries) {
            out[deckName.toLowerCase()] = { name: deckName, share };
        }
        return out;
    }

    it('returns null when allSnapshots is empty', () => {
        const result = FNS.weightedBaseline(new Map(), '2026-05-06', 'dragapult');
        assert.equal(result, null);
    });

    it('returns null when the deck appears in no snapshot', () => {
        const allSnaps = new Map();
        allSnaps.set('2026-05-01', snap('Other Deck', 100));
        const result = FNS.weightedBaseline(allSnaps, '2026-05-06', 'dragapult');
        assert.equal(result, null);
    });

    it('weights recent snapshots much higher than older ones', () => {
        // Each snapshot's shares sum to 100 (production format).
        // Recent (5 days ago, weight 1.0): Dragapult at 30%
        // Older (14 days ago, weight 0.7): Dragapult at 10%
        // Weighted avg = (30 × 1.0 + 10 × 0.7) / (1.0 + 0.7) = 37 / 1.7 = 21.76
        const allSnaps = new Map();
        allSnaps.set('2026-05-01', multiSnap([
            { deckName: 'Dragapult', share: 30 },
            { deckName: 'Other', share: 70 },
        ]));
        allSnaps.set('2026-04-22', multiSnap([
            { deckName: 'Dragapult', share: 10 },
            { deckName: 'Other', share: 90 },
        ]));
        const result = FNS.weightedBaseline(allSnaps, '2026-05-06', 'dragapult');
        assert.ok(result > 20 && result < 23, `expected ~21.76, got ${result}`);
    });

    it('applies × 0.10 cutoff to pre-rotation snapshots', () => {
        // Pre-rotation (March 28, age ≈ 39d, weight 0.13 × 0.10 = 0.013):
        //   Pre-rotation Dragapult share: 50%
        // Post-rotation (May 1, age 5d, weight 1.0):
        //   Dragapult share: 30%
        // Without cutoff: pre-rotation contributes (50 × 0.13) = 6.5,
        //                  post-rotation contributes (30 × 1.0) = 30,
        //                  weighted avg = 36.5 / 1.13 ≈ 32.3
        // With × 0.10 cutoff:  pre contributes (50 × 0.013) = 0.65,
        //                       post (30 × 1.0) = 30,
        //                       weighted avg = 30.65 / 1.013 ≈ 30.26
        const allSnaps = new Map();
        allSnaps.set('2026-03-28', multiSnap([
            { deckName: 'Dragapult', share: 50 },
            { deckName: 'Other', share: 50 },
        ]));
        allSnaps.set('2026-05-01', multiSnap([
            { deckName: 'Dragapult', share: 30 },
            { deckName: 'Other', share: 70 },
        ]));
        const result = FNS.weightedBaseline(allSnaps, '2026-05-06', 'dragapult');
        // The cutoff should pull the result much closer to 30 (post-rotation only)
        // than to ~32.3 (no cutoff).
        assert.ok(result < 31, `pre-rotation cutoff should suppress old data, got ${result}`);
        assert.ok(result > 29, `post-rotation should still dominate, got ${result}`);
    });

    it('honours the 7-day full-weight window for stable shares', () => {
        // Three snapshots within the 7-day window all show Dragapult at
        // 35%. Result should be 35 (uniform within full-weight window).
        const allSnaps = new Map();
        for (const d of ['2026-05-04', '2026-05-05', '2026-05-06']) {
            allSnaps.set(d, multiSnap([
                { deckName: 'Dragapult', share: 35 },
                { deckName: 'Other', share: 65 },
            ]));
        }
        const result = FNS.weightedBaseline(allSnaps, '2026-05-06', 'dragapult');
        assert.ok(Math.abs(result - 35) < 1e-9);
    });

    it('renormalises within each snapshot to 100%', () => {
        // Snapshot has Dragapult with share = 50 (raw count) and another deck
        // with share = 50. Total = 100. Dragapult share-of-snapshot = 50%.
        const allSnaps = new Map();
        allSnaps.set('2026-05-06', multiSnap([
            { deckName: 'Dragapult', share: 50 },
            { deckName: 'Other', share: 50 },
        ]));
        const result = FNS.weightedBaseline(allSnaps, '2026-05-06', 'dragapult');
        assert.ok(Math.abs(result - 50) < 1e-9);
    });

    it('skips snapshots without dates that parse', () => {
        const allSnaps = new Map();
        allSnaps.set('not-a-date', multiSnap([
            { deckName: 'Dragapult', share: 30 },
            { deckName: 'Other', share: 70 },
        ]));
        allSnaps.set('2026-05-01', multiSnap([
            { deckName: 'Dragapult', share: 35 },
            { deckName: 'Other', share: 65 },
        ]));
        const result = FNS.weightedBaseline(allSnaps, '2026-05-06', 'dragapult');
        assert.ok(Math.abs(result - 35) < 1e-9);
    });

    it('returns null when todayISO is malformed', () => {
        const allSnaps = new Map();
        allSnaps.set('2026-05-01', multiSnap([{ deckName: 'Dragapult', share: 30 }]));
        const result = FNS.weightedBaseline(allSnaps, 'invalid', 'dragapult');
        assert.equal(result, null);
    });
});

describe('regression — the user-flagged Predictor 5.0 motivation', () => {
    it('a Mar-28 snapshot at 50% does NOT push a deck above its post-rotation truth', () => {
        // Hypothetical: an archetype that was 50% of pre-rotation meta
        // (relying on Iono / Counter Catcher / Professor's Research)
        // and is now 5% post-rotation. The Predictor should reflect
        // the post-rotation truth, not the legacy share.
        const allSnaps = new Map();
        // Heavy pre-rotation presence (March 28 → April 1)
        for (const d of ['2026-03-28', '2026-03-29', '2026-03-30', '2026-04-05']) {
            allSnaps.set(d, {
                'legacy deck': { name: 'Legacy Deck', share: 50 },
                'modern deck': { name: 'Modern Deck', share: 50 },
            });
        }
        // Light post-rotation presence (May 1 → May 6)
        for (const d of ['2026-05-01', '2026-05-03', '2026-05-05', '2026-05-06']) {
            allSnaps.set(d, {
                'legacy deck': { name: 'Legacy Deck', share: 5 },
                'modern deck': { name: 'Modern Deck', share: 95 },
            });
        }
        const result = FNS.weightedBaseline(allSnaps, '2026-05-06', 'legacy deck');
        // The deck's recency-weighted baseline should land near 5 %
        // (post-rotation truth), not the ~30 % an unweighted average
        // would produce mixing pre- and post-rotation data.
        assert.ok(result < 12, `legacy deck baseline should track post-rotation (5%), got ${result.toFixed(1)}`);
    });
});
