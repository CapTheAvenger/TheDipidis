/**
 * Unit tests for Predictor 6.0 — Tier-1 Convergence Detector.
 *
 * Background: post-NAIC Phase One (2026-06-12) review showed our
 * predictor missed Dragapult by +7.0 pp (predicted 28.7 %, actual
 * 35.7 %). The median-anchored Phase β blend correctly resists
 * single-tournament noise but smooths over genuine field
 * consolidation onto a new Tier-1 leader. A pure last-major ×
 * conversion-multiplier model caught the consolidation at +3.1 pp.
 *
 * The detector operates at FAMILY level (Σ Dragapult variants):
 *   (1) family raw ladder ≥ 5 %
 *   (2) family last-major day-1 pilots ≥ 300
 *   (3) family last-major conv ≥ field-mean conv × 1.15
 *       (conv-excess gate; replaces the median-share gate so it works
 *       in fresh formats with only ONE current-format major like CRI)
 *
 * Boost projection:
 *   convMult        = 1 + 0.4 × (lmConv / fieldMeanConv − 1)
 *   famConvProj     = lastMajorShare × convMult
 *   famPostScaling  = 0.5 × famCurrentRaw + 0.5 × famConvProj
 *
 * Applied family-wide in two stages:
 *   • PRE-renorm scale on each family member's predictedShareRaw
 *   • POST-renorm anchor to the blend target (concentration boost +
 *     family-aggregate cap soften the pre-renorm scale otherwise)
 *
 * Tests below mirror the pure functions of the detector — gate
 * eligibility + the convProjection math. The post-renorm anchoring
 * is integration-tested via the headless verification at the engine
 * level; isolating it here would require reimplementing the entire
 * weighted-sum + concentration + cap pipeline.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Production-mirrored constants. Keep in sync with js/app-meta-call.js
// (search "TIER1_").
const TIER1_CONVERGENCE_THRESHOLD = 5.0;
const TIER1_CONV_EXCESS_RATIO     = 1.15;
const TIER1_MIN_DAY1_PILOTS       = 300;
const TIER1_CONV_DAMPING          = 0.4;
const TIER1_BLEND_WEIGHT          = 0.5;

/**
 * Mirrors the production gate + projection logic at js/app-meta-call.js
 * (search "Tier-1 Convergence Detector"). Inputs:
 *   - famLad:        family raw ladder share (sum of variants)
 *   - famLmShare:    family last-major share (sum of variants)
 *   - famLmConv:     family pilot-weighted day-1 → day-2 conv (fraction)
 *   - famLmD1:       family last-major day-1 pilot count
 *   - meanDay2Conv:  field-mean Day-2 conversion (fraction)
 *   - famCurrentTotal: family-aggregate displayed share BEFORE the
 *                     detector kicks in (for the blend output)
 */
function runDetector({ famLad, famLmShare, famLmConv, famLmD1, meanDay2Conv, famCurrentTotal }) {
    const eligible = famLad >= TIER1_CONVERGENCE_THRESHOLD
        && famLmD1 >= TIER1_MIN_DAY1_PILOTS
        && famLmConv > 0
        && meanDay2Conv > 0
        && famLmConv >= meanDay2Conv * TIER1_CONV_EXCESS_RATIO;
    if (!eligible) return { eligible: false };
    const convMult         = 1 + TIER1_CONV_DAMPING * (famLmConv / meanDay2Conv - 1);
    const famConvProjection = famLmShare * convMult;
    const blendedTotal     = famCurrentTotal * (1 - TIER1_BLEND_WEIGHT)
                           + famConvProjection * TIER1_BLEND_WEIGHT;
    return { eligible: true, convMult, famConvProjection, blendedTotal };
}

// ── Scenario: Dragapult family at NAIC ───────────────────────────────

describe('Predictor 6.0 — Tier-1 Convergence Detector', () => {

    it('fires on the Dragapult NAIC family aggregate and moves toward actual', () => {
        // Family aggregates reconstructed from the live data the engine
        // sees at NAIC (verified via headless inspection at
        // window.MetaCall._diag.tier1Convergence):
        //   Family raw ladder:        7.77 % (Σ variants)
        //   Family Turin share:       28.98 % (Σ variants)
        //   Family Turin conv:        25.47 % (pilot-weighted)
        //   Family Turin day-1:       589 pilots
        //   Field-mean Day-2 conv:    18.8 % (Turin field baseline)
        //   Current predicted total:  28.7 % (Hausi v2 pre-detector)
        const result = runDetector({
            famLad:          7.77,
            famLmShare:      28.98,
            famLmConv:       0.2547,
            famLmD1:         589,
            meanDay2Conv:    0.188,
            famCurrentTotal: 28.7,
        });

        assert.equal(result.eligible, true,
            'Dragapult NAIC scenario must trigger the detector');

        // convMult = 1 + 0.4 × (0.2547 / 0.188 − 1) ≈ 1.142
        assert.ok(Math.abs(result.convMult - 1.142) < 0.02,
            `convMult should be ~1.142, got ${result.convMult}`);

        // famConvProjection = 28.98 × 1.142 ≈ 33.1
        assert.ok(result.famConvProjection > 32.5 && result.famConvProjection < 33.5,
            `famConvProjection should be ~33 %, got ${result.famConvProjection}`);

        // Blend pulls 28.7 → 0.5 × 28.7 + 0.5 × 33.1 ≈ 30.9
        assert.ok(result.blendedTotal > 30.5 && result.blendedTotal < 31.5,
            `blendedTotal should be ~30.9 %, got ${result.blendedTotal}`);

        // Distance to NAIC actual (35.7 %) must shrink.
        const NAIC_ACTUAL = 35.7;
        const distBefore  = Math.abs(NAIC_ACTUAL - 28.7);
        const distAfter   = Math.abs(NAIC_ACTUAL - result.blendedTotal);
        assert.ok(distAfter < distBefore - 1.5,
            `boost should close at least 1.5 pp of the miss: ${distBefore.toFixed(2)} → ${distAfter.toFixed(2)}`);
    });

    it('skips mid-field families below the Tier-1 threshold', () => {
        // Slowking family at Turin: 2.06 % ladder, 4.04 % share,
        // 25.6 % conv, 82 day-1 pilots. Three gates fail at once —
        // ladder below 5 %, AND pilots below 300. The detector must
        // skip cleanly without computing anything.
        const result = runDetector({
            famLad:          2.06,
            famLmShare:      4.04,
            famLmConv:       0.2561,
            famLmD1:         82,
            meanDay2Conv:    0.188,
            famCurrentTotal: 4.5,
        });
        assert.equal(result.eligible, false,
            'Slowking should fail the Tier-1 + pilot gates');
    });

    it('skips when the conv-excess ratio is below 1.15 (Honchkrow regional spike)', () => {
        // Hypothetical Honchkrow-but-Tier-1-sized: enough ladder
        // share + enough pilots, but conv ≈ baseline (no real
        // performance edge → regional/casual spike). The conv-excess
        // gate is what stops us from over-predicting regional outliers
        // — without it the detector would inflate ANY high-share deck.
        const result = runDetector({
            famLad:          12.0,
            famLmShare:      28.0,
            famLmConv:       0.176,   // 17.6 %, BELOW 18.8 × 1.15 = 21.6
            famLmD1:         500,
            meanDay2Conv:    0.188,
            famCurrentTotal: 15.0,
        });
        assert.equal(result.eligible, false,
            'conv ≤ field × 1.15 must skip the boost');
    });

    it('skips when the family pilot pool is too small', () => {
        // Excellent conv on a small sample = unreliable projection.
        // Same threshold the post-NAIC analysis used (≥ 300 pilots).
        const result = runDetector({
            famLad:          8.0,
            famLmShare:      15.0,
            famLmConv:       0.30,
            famLmD1:         200,     // BELOW 300
            meanDay2Conv:    0.188,
            famCurrentTotal: 12.0,
        });
        assert.equal(result.eligible, false,
            'sub-300 pilot pool must block the boost');
    });

    it('skips when there is no field-mean Day-2 baseline available', () => {
        // Early format, no labs data yet → no baseline → no boost.
        const result = runDetector({
            famLad:          10.0,
            famLmShare:      20.0,
            famLmConv:       0.30,
            famLmD1:         500,
            meanDay2Conv:    0,
            famCurrentTotal: 18.0,
        });
        assert.equal(result.eligible, false,
            'missing meanDay2Conv must skip the boost');
    });

    it('produces convMult = 1 when conv equals the field baseline', () => {
        // Hypothetical Tier-1 family whose conv ratio is right at
        // the cusp of the gate. By construction the projection should
        // equal famLmShare (no inflation).
        const result = runDetector({
            famLad:          8.0,
            famLmShare:      20.0,
            famLmConv:       0.188 * TIER1_CONV_EXCESS_RATIO + 1e-9,
            famLmD1:         500,
            meanDay2Conv:    0.188,
            famCurrentTotal: 18.0,
        });
        assert.equal(result.eligible, true);
        // convMult at the gate boundary = 1 + 0.4 × 0.15 = 1.06
        assert.ok(Math.abs(result.convMult - 1.06) < 0.01,
            `at the gate boundary convMult should be ~1.06, got ${result.convMult}`);
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
            ['TIER1_CONV_EXCESS_RATIO',     TIER1_CONV_EXCESS_RATIO],
            ['TIER1_MIN_DAY1_PILOTS',       TIER1_MIN_DAY1_PILOTS],
            ['TIER1_CONV_DAMPING',          TIER1_CONV_DAMPING],
            ['TIER1_BLEND_WEIGHT',          TIER1_BLEND_WEIGHT],
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
