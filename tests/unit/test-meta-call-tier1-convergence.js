/**
 * Unit tests for Predictor 6.0 — Tier-1 Convergence Detector.
 *
 * Background: post-NAIC Phase One (2026-06-12) review showed Hausi v2
 * missed Dragapult by +7.0 pp (predicted 28.7 %, actual 35.7 %). The
 * median-anchored Phase β blend correctly resists single-tournament
 * noise but smooths over genuine field consolidation onto a new
 * Tier-1 leader. A pure last-major × conversion-multiplier model
 * caught the consolidation at +3.1 pp.
 *
 * The detector triggers when:
 *   (a) the deck IS Tier 1 (online ≥ 10 %),
 *   (b) the last major shows consolidation (share ≥ median × 1.3),
 *   (c) we have enough pilots to trust the conversion signal
 *       (day-1 ≥ 300),
 *   (d) regional-spike guard: online ≥ lastMajorShare × 0.5 (skip
 *       when online disagrees — that's the Honchkrow case).
 *
 * Each test below mirrors the production logic in the helper at the
 * top of the file. Keep the constants here in lockstep with the
 * constants in js/app-meta-call.js — the "constants stay in sync"
 * test at the bottom fails loudly when a maintainer changes one side
 * without the other.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Production-mirrored constants. Keep in sync with js/app-meta-call.js
// (search "TIER1_").
const TIER1_CONVERGENCE_THRESHOLD = 10.0;
const TIER1_CONSOLIDATION_RATIO   = 1.3;
const TIER1_MIN_DAY1_PILOTS       = 300;
const TIER1_CONV_DAMPING          = 0.4;
const TIER1_BLEND_WEIGHT          = 0.5;
const TIER1_REGIONAL_SPIKE_GUARD  = 0.5;

// Phase β constants (only the blend factor matters for setting up the
// pre-boost ladderPct in the fixtures below).
const PHASE_B_BLEND_MAJOR = 0.20;

/**
 * Mirrors the production block at js/app-meta-call.js:2905-2942.
 * Returns the FINAL ladderPct after both the Phase β median anchor
 * and any Predictor 6.0 Tier-1 boost have been applied.
 *
 * Inputs are the per-deck values the engine has at that point in the
 * pipeline:
 *   - rawLadderPct: deck's % of total online ladder share
 *   - majorMedian:  median of last 3 majors at ≥ 2 % share, or null
 *   - lmShare:      last-major share (overall %)
 *   - lmConv:       last-major Day-1 → Day-2 conversion ratio
 *                   (fraction, e.g. 0.255 for Dragapult Turin)
 *   - lmD1:         last-major Day-1 pilot count
 *   - meanDay2Conv: field-mean Day-2 conversion (fraction)
 */
function computeLadderPct({
    rawLadderPct,
    majorMedian,
    lmShare,
    lmConv,
    lmD1,
    meanDay2Conv,
}) {
    let ladderPct = (majorMedian != null && majorMedian > 0)
        ? (majorMedian * PHASE_B_BLEND_MAJOR + rawLadderPct * (1 - PHASE_B_BLEND_MAJOR))
        : rawLadderPct;

    let boostInfo = null;
    if (rawLadderPct >= TIER1_CONVERGENCE_THRESHOLD
            && majorMedian != null && majorMedian > 0
            && lmShare >= majorMedian * TIER1_CONSOLIDATION_RATIO
            && lmD1 >= TIER1_MIN_DAY1_PILOTS
            && lmConv > 0
            && meanDay2Conv > 0
            && rawLadderPct >= lmShare * TIER1_REGIONAL_SPIKE_GUARD) {
        const convMult       = 1 + TIER1_CONV_DAMPING * (lmConv / meanDay2Conv - 1);
        const convProjection = lmShare * convMult;
        const boosted        = ladderPct * (1 - TIER1_BLEND_WEIGHT)
                             + convProjection * TIER1_BLEND_WEIGHT;
        boostInfo = { convMult, convProjection, fromLadderPct: ladderPct, toLadderPct: boosted };
        ladderPct = boosted;
    }
    return { ladderPct, boostInfo };
}

// ── Scenario: Dragapult ex at NAIC (the deck the detector exists for) ─

describe('Predictor 6.0 — Tier-1 Convergence Detector', () => {

    it('fires on the Dragapult NAIC scenario and moves toward actual', () => {
        // Inputs reconstructed from the post-NAIC analysis:
        //   Turin (last major): share 28.99 %, day1→day2 conv 25.47 %,
        //                       589 Day-1 pilots
        //   Older majors median: ~10 % (Indy was at ~10.4 % climbing)
        //   Online ladder (online_decks.csv pilot share): ~32 %
        //   Field mean Day-2 conv: 18.8 %
        const result = computeLadderPct({
            rawLadderPct: 32.0,
            majorMedian:  10.0,
            lmShare:      28.99,
            lmConv:       0.2547,
            lmD1:         589,
            meanDay2Conv: 0.188,
        });

        // The detector must FIRE in this scenario.
        assert.notEqual(result.boostInfo, null,
            'Tier-1 boost should fire for the Dragapult NAIC scenario');

        // Conversion multiplier ≈ 1 + 0.4 × (0.2547/0.188 − 1) ≈ 1.142.
        assert.ok(Math.abs(result.boostInfo.convMult - 1.142) < 0.02,
            `convMult should be ~1.142, got ${result.boostInfo.convMult}`);

        // Convergence projection ≈ 28.99 × 1.142 ≈ 33.1 %.
        assert.ok(result.boostInfo.convProjection > 32.5 && result.boostInfo.convProjection < 33.5,
            `convProjection should be ~33 %, got ${result.boostInfo.convProjection}`);

        // The post-boost ladderPct must move CLOSER to the 35.7 %
        // actual than the pre-boost ladderPct did — this is the
        // whole point of the detector.
        const NAIC_ACTUAL = 35.7;
        const distBefore  = Math.abs(NAIC_ACTUAL - result.boostInfo.fromLadderPct);
        const distAfter   = Math.abs(NAIC_ACTUAL - result.boostInfo.toLadderPct);
        assert.ok(distAfter < distBefore,
            `expected boost to reduce |actual − pred|: ${distBefore.toFixed(2)} → ${distAfter.toFixed(2)}`);
    });

    it('skips mid-field decks below the Tier-1 threshold', () => {
        // Mega Starmie-ish: 2.4 % live share at Turin (above median),
        // good conv (35 %), but raw online only ~5 %. Mid-field is
        // the segment where the online signal is grinder-biased, so
        // we should NOT apply a Tier-1 boost here.
        const result = computeLadderPct({
            rawLadderPct: 5.0,       // BELOW TIER1_CONVERGENCE_THRESHOLD
            majorMedian:  1.5,
            lmShare:      2.4,
            lmConv:       0.35,
            lmD1:         400,
            meanDay2Conv: 0.188,
        });
        assert.equal(result.boostInfo, null,
            'Tier-1 boost must not fire below the 10 % threshold');
    });

    it('skips Tier-1 decks without consolidation (lastMajor ≈ median)', () => {
        // A stable Tier-1 deck that's NOT consolidating: no boost.
        // Otherwise we'd inflate every Tier-1 prediction by the conv
        // multiplier permanently, defeating the median's robustness.
        const result = computeLadderPct({
            rawLadderPct: 22.0,
            majorMedian:  21.0,
            lmShare:      21.5,      // 21.5 / 21.0 = 1.02 < 1.3
            lmConv:       0.23,
            lmD1:         500,
            meanDay2Conv: 0.188,
        });
        assert.equal(result.boostInfo, null,
            'no consolidation → no Tier-1 boost');
    });

    it('skips when the last-major pilot pool is too small (small-sample noise guard)', () => {
        // High share + high conv but only 200 Day-1 pilots: the conv
        // signal is too noisy to trust as a projection multiplier.
        const result = computeLadderPct({
            rawLadderPct: 15.0,
            majorMedian:  8.0,
            lmShare:      14.0,      // consolidation ratio OK
            lmConv:       0.32,      // strong conv
            lmD1:         200,       // BELOW TIER1_MIN_DAY1_PILOTS
            meanDay2Conv: 0.188,
        });
        assert.equal(result.boostInfo, null,
            'sub-300 pilot pool must block the conv-weighted boost');
    });

    it('skips on regional spike (online disagrees with last major)', () => {
        // The Honchkrow case from the analysis: Turin 4.18 % but
        // online only 2.37 %. If we were Tier-1 sized (online 12 %,
        // last major 28 %), the 0.5× guard catches the divergence
        // and refuses to project the regional spike onto the global
        // meta — exactly what the other Claude's Turin-only model
        // got wrong on Honchkrow / Basic Box.
        const result = computeLadderPct({
            rawLadderPct: 12.0,
            majorMedian:  6.0,
            lmShare:      28.0,      // 12 / 28 = 0.43 < 0.5 guard
            lmConv:       0.26,
            lmD1:         500,
            meanDay2Conv: 0.188,
        });
        assert.equal(result.boostInfo, null,
            'online ≪ lastMajor × 0.5 must skip the boost as a regional spike');
    });

    it('skips when major-median data is missing (early format)', () => {
        // Early in a new format the median anchor is null; the boost
        // requires the median to compute the consolidation ratio.
        const result = computeLadderPct({
            rawLadderPct: 15.0,
            majorMedian:  null,
            lmShare:      14.0,
            lmConv:       0.30,
            lmD1:         500,
            meanDay2Conv: 0.188,
        });
        assert.equal(result.boostInfo, null,
            'null median must skip the boost');
    });

    it('skips when no field Day-2 baseline available', () => {
        // Without the field-mean Day-2 conversion the multiplier is
        // undefined.
        const result = computeLadderPct({
            rawLadderPct: 18.0,
            majorMedian:  8.0,
            lmShare:      14.0,
            lmConv:       0.30,
            lmD1:         500,
            meanDay2Conv: 0,
        });
        assert.equal(result.boostInfo, null,
            'missing meanDay2Conv must skip the boost');
    });

    it('boost is symmetric: conv equal to baseline → no share inflation', () => {
        // If the deck's conv equals the field baseline, convMult = 1
        // and convProjection equals lastMajorShare. The boost then
        // pulls ladderPct toward lastMajorShare without inflating it
        // beyond that — the "consolidation already happened" case.
        const result = computeLadderPct({
            rawLadderPct: 20.0,
            majorMedian:  10.0,
            lmShare:      18.0,
            lmConv:       0.188,     // = baseline
            lmD1:         500,
            meanDay2Conv: 0.188,
        });
        assert.notEqual(result.boostInfo, null);
        assert.ok(Math.abs(result.boostInfo.convMult - 1.0) < 1e-9,
            'conv == baseline → convMult should be exactly 1');
        assert.ok(Math.abs(result.boostInfo.convProjection - 18.0) < 1e-9,
            'conv == baseline → projection should equal lastMajorShare');
    });
});

// ── Constants-sanity: catch drift between the engine and this mirror ──

describe('Predictor 6.0 — constants stay in sync with the engine', () => {

    it('TIER1_* constants match js/app-meta-call.js', () => {
        const src = fs.readFileSync(
            path.join(__dirname, '..', '..', 'js', 'app-meta-call.js'),
            'utf-8',
        );
        const pairs = [
            ['TIER1_CONVERGENCE_THRESHOLD', TIER1_CONVERGENCE_THRESHOLD],
            ['TIER1_CONSOLIDATION_RATIO',   TIER1_CONSOLIDATION_RATIO],
            ['TIER1_MIN_DAY1_PILOTS',       TIER1_MIN_DAY1_PILOTS],
            ['TIER1_CONV_DAMPING',          TIER1_CONV_DAMPING],
            ['TIER1_BLEND_WEIGHT',          TIER1_BLEND_WEIGHT],
            ['TIER1_REGIONAL_SPIKE_GUARD',  TIER1_REGIONAL_SPIKE_GUARD],
        ];
        for (const [name, expected] of pairs) {
            const re = new RegExp(`${name}\\s*=\\s*([\\d.]+)`);
            const m = src.match(re);
            assert.ok(m, `${name} declaration not found in app-meta-call.js`);
            assert.equal(parseFloat(m[1]), expected,
                `${name} drifted: engine says ${m[1]}, test expects ${expected}`);
        }
    });
});
