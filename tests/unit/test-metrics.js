/**
 * Unit tests for the canonical share / win-rate utility
 * (js/modules/metrics.js). Verifies the parse helpers handle every
 * variant the scrapers emit, and that the weighted-average + formatter
 * behave correctly.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('parsePercent', () => {
    it('parses comma-decimal strings (German locale)', async () => {
        const { parsePercent } = await import('../../js/modules/metrics.js');
        assert.equal(parsePercent('62,50'), 62.5);
        assert.equal(parsePercent('0,00'), 0);
    });

    it('parses dot-decimal strings', async () => {
        const { parsePercent } = await import('../../js/modules/metrics.js');
        assert.equal(parsePercent('62.5'), 62.5);
    });

    it('strips trailing percent sign + whitespace', async () => {
        const { parsePercent } = await import('../../js/modules/metrics.js');
        assert.equal(parsePercent('62.5%'), 62.5);
        assert.equal(parsePercent(' 62,5 % '), 62.5);
    });

    it('returns 0 for null / undefined / "" / "-"', async () => {
        const { parsePercent } = await import('../../js/modules/metrics.js');
        assert.equal(parsePercent(null), 0);
        assert.equal(parsePercent(undefined), 0);
        assert.equal(parsePercent(''), 0);
        assert.equal(parsePercent('-'), 0);
    });

    it('passes through finite numbers unchanged', async () => {
        const { parsePercent } = await import('../../js/modules/metrics.js');
        assert.equal(parsePercent(42), 42);
        assert.equal(parsePercent(0), 0);
        assert.equal(parsePercent(-5), -5);
    });

    it('returns 0 for NaN / Infinity / unparseable', async () => {
        const { parsePercent } = await import('../../js/modules/metrics.js');
        assert.equal(parsePercent(NaN), 0);
        assert.equal(parsePercent(Infinity), 0);
        assert.equal(parsePercent('abc'), 0);
    });
});

describe('parsePercentOrNaN', () => {
    it('returns NaN for missing / unparseable input', async () => {
        const { parsePercentOrNaN } = await import('../../js/modules/metrics.js');
        assert.ok(Number.isNaN(parsePercentOrNaN(null)));
        assert.ok(Number.isNaN(parsePercentOrNaN(undefined)));
        assert.ok(Number.isNaN(parsePercentOrNaN('')));
        assert.ok(Number.isNaN(parsePercentOrNaN('-')));
        assert.ok(Number.isNaN(parsePercentOrNaN('abc')));
    });

    it('parses values like parsePercent does', async () => {
        const { parsePercentOrNaN } = await import('../../js/modules/metrics.js');
        assert.equal(parsePercentOrNaN('62,50'), 62.5);
        assert.equal(parsePercentOrNaN('100%'), 100);
        assert.equal(parsePercentOrNaN(7), 7);
    });

    it('distinguishes zero from missing', async () => {
        const { parsePercentOrNaN } = await import('../../js/modules/metrics.js');
        assert.equal(parsePercentOrNaN('0,00'), 0);
        assert.equal(parsePercentOrNaN(0), 0);
        assert.ok(Number.isNaN(parsePercentOrNaN(null)));
    });
});

describe('formatPercent', () => {
    it('default: 1 decimal + % sign', async () => {
        const { formatPercent } = await import('../../js/modules/metrics.js');
        assert.equal(formatPercent(62.5), '62.5%');
        assert.equal(formatPercent(0), '0.0%');
        assert.equal(formatPercent(100), '100.0%');
    });

    it('digits option', async () => {
        const { formatPercent } = await import('../../js/modules/metrics.js');
        assert.equal(formatPercent(62.5, { digits: 2 }), '62.50%');
        assert.equal(formatPercent(62.5, { digits: 0 }), '63%');
    });

    it('sign:false drops the % sign', async () => {
        const { formatPercent } = await import('../../js/modules/metrics.js');
        assert.equal(formatPercent(62.5, { sign: false }), '62.5');
    });

    it('fallback for non-finite input', async () => {
        const { formatPercent } = await import('../../js/modules/metrics.js');
        assert.equal(formatPercent(NaN), '-');
        assert.equal(formatPercent(Infinity), '-');
        assert.equal(formatPercent(NaN, { fallback: 'N/A' }), 'N/A');
    });
});

describe('weightedAverageWinRate', () => {
    it('weighted by games', async () => {
        const { weightedAverageWinRate } = await import('../../js/modules/metrics.js');
        // 60% over 10 games + 40% over 30 games → (6 + 12) / 40 = 0.45 → 45%
        const result = weightedAverageWinRate([
            { wr: 60, games: 10 },
            { wr: 40, games: 30 },
        ]);
        assert.equal(Number(result.toFixed(2)), 45);
    });

    it('returns 0 for empty / null input', async () => {
        const { weightedAverageWinRate } = await import('../../js/modules/metrics.js');
        assert.equal(weightedAverageWinRate([]), 0);
        assert.equal(weightedAverageWinRate(null), 0);
        assert.equal(weightedAverageWinRate(undefined), 0);
    });

    it('skips zero-games rows (no division-by-zero)', async () => {
        const { weightedAverageWinRate } = await import('../../js/modules/metrics.js');
        const result = weightedAverageWinRate([
            { wr: 100, games: 0 },
            { wr: 50, games: 10 },
        ]);
        assert.equal(result, 50);
    });

    it('returns 0 when all rows are zero-games', async () => {
        const { weightedAverageWinRate } = await import('../../js/modules/metrics.js');
        const result = weightedAverageWinRate([
            { wr: 100, games: 0 },
            { wr: 50, games: 0 },
        ]);
        assert.equal(result, 0);
    });

    it('ignores nulls / undefineds in the array', async () => {
        const { weightedAverageWinRate } = await import('../../js/modules/metrics.js');
        const result = weightedAverageWinRate([
            null,
            { wr: 60, games: 10 },
            undefined,
        ]);
        assert.equal(result, 60);
    });
});
