/**
 * Unit tests for calculateCombinedVariantStats()
 *
 * This function aggregates multiple set-prints of the same logical card into
 * one entry with correct share%, average copies, and recommended count.
 * Incorrect output → wrong meta analysis numbers and broken auto-deck-builder.
 *
 * Run:  node --test tests/unit/test-calculateCombinedVariantStats.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadAppUtils } = require('./test-helpers');

const fns = loadAppUtils();
const calc = fns.calculateCombinedVariantStats;

// ── Empty / null input ──────────────────────────────────────
describe('calculateCombinedVariantStats — empty input', () => {
    it('returns zeroed result for empty array', () => {
        const result = calc([], 100);
        assert.equal(result.combinedShare, 0);
        assert.equal(result.combinedAvgWhenUsed, 0);
        assert.equal(result.recommendedCount, 0);
        assert.equal(result.baseName, '');
        assert.equal(result.legalMax, 4);
    });

    it('returns zeroed result for null', () => {
        const result = calc(null, 100);
        assert.equal(result.combinedShare, 0);
    });

    it('returns zeroed result for undefined', () => {
        const result = calc(undefined, 100);
        assert.equal(result.combinedShare, 0);
    });

    it('returns zeroed result for non-array', () => {
        const result = calc('not an array', 100);
        assert.equal(result.combinedShare, 0);
    });
});

// ── Single variant ──────────────────────────────────────────
describe('calculateCombinedVariantStats — single variant', () => {
    it('correctly processes a single variant with deck_count and total_count', () => {
        const variants = [{
            card_name: 'Pikachu ex',
            deck_count: 50,
            total_count: 150,
        }];
        const result = calc(variants, 100);

        assert.equal(result.combinedShare, 50.0); // 50/100 * 100
        assert.equal(result.combinedAvgWhenUsed, 3.00); // 150/50
        assert.equal(result.recommendedCount, 3);
        assert.equal(result.legalMax, 4);
    });

    it('caps share at 100%', () => {
        const variants = [{
            card_name: 'Nest Ball',
            deck_count: 120,
            total_count: 360,
        }];
        // totalDecksInArchetype = 100 but deck_count is 120
        // safeTotalDecks = max(1, 100, 120) = 120
        // estimatedUniqueDecks = min(120, 120) = 120
        // share = 120/120 * 100 = 100
        const result = calc(variants, 100);
        assert.ok(result.combinedShare <= 100, `Share should be <= 100, got ${result.combinedShare}`);
    });

    it('recommendedCount is at least 1 for non-empty input', () => {
        const variants = [{
            card_name: 'Rare Candy',
            deck_count: 5,
            total_count: 3,
        }];
        const result = calc(variants, 200);
        assert.ok(result.recommendedCount >= 1, 'recommendedCount should be >= 1');
    });
});

// ── Multiple variants (combined prints) ─────────────────────
describe('calculateCombinedVariantStats — multiple variants', () => {
    it('combines two prints of same card', () => {
        const variants = [
            { card_name: 'Boss\'s Orders (SVI 100)', deck_count: 30, total_count: 60 },
            { card_name: 'Boss\'s Orders (PAL 200)', deck_count: 25, total_count: 50 },
        ];
        const result = calc(variants, 100);

        // maxDeckCount = 30, safeTotalDecks = max(1, 100, 55) = 100
        // estimatedUniqueDecks = min(100, 30) = 30
        // share = 30/100 * 100 = 30.0
        assert.equal(result.combinedShare, 30.0);
        // avg = (60+50) / 30 = 3.67
        assert.equal(result.combinedAvgWhenUsed, 3.67);
        assert.equal(result.recommendedCount, 4);
    });

    it('uses max(deck_count) as union estimate', () => {
        const variants = [
            { card_name: 'Iono (SVI 80)', deck_count: 80, total_count: 240 },
            { card_name: 'Iono (PAL 90)', deck_count: 10, total_count: 30 },
        ];
        const result = calc(variants, 100);

        // maxDeckCount = 80
        // safeTotalDecks = max(1, 100, 90) = 100
        // estimatedUniqueDecks = min(100, 80) = 80
        // share = 80/100 *100 = 80
        assert.equal(result.combinedShare, 80.0);
    });
});

// ── Safe denominator ────────────────────────────────────────
describe('calculateCombinedVariantStats — safe denominator', () => {
    it('handles totalDecksInArchetype = 0 without division by zero', () => {
        const variants = [{
            card_name: 'Test Card',
            deck_count: 10,
            total_count: 30,
        }];
        const result = calc(variants, 0);
        assert.ok(Number.isFinite(result.combinedShare), 'Share should be finite');
        assert.ok(Number.isFinite(result.combinedAvgWhenUsed), 'Avg should be finite');
    });

    it('handles totalDecksInArchetype = null', () => {
        const variants = [{
            card_name: 'Test Card',
            deck_count: 5,
            total_count: 10,
        }];
        const result = calc(variants, null);
        assert.ok(Number.isFinite(result.combinedShare));
    });

    it('handles totalDecksInArchetype = undefined', () => {
        const variants = [{
            card_name: 'Test Card',
            deck_count: 5,
            total_count: 10,
        }];
        const result = calc(variants, undefined);
        assert.ok(Number.isFinite(result.combinedShare));
    });

    it('safeTotalDecks uses sumOfDecksPlayed when larger than passed denominator', () => {
        // deck_count sum = 60+50 = 110, which is > 80
        const variants = [
            { card_name: 'Card A', deck_count: 60, total_count: 120 },
            { card_name: 'Card B', deck_count: 50, total_count: 100 },
        ];
        const result = calc(variants, 80);
        // safeTotalDecks = max(1, 80, 110) = 110
        // estimatedUniqueDecks = min(110, 60) = 60
        // share = 60/110 * 100 = 54.5
        assert.equal(result.combinedShare, 54.5);
    });
});

// ── CSV column name robustness ──────────────────────────────
describe('calculateCombinedVariantStats — CSV column name variants', () => {
    it('accepts deckCount (camelCase) alias', () => {
        const variants = [{
            card_name: 'Luxury Ball',
            deckCount: 40,
            totalCount: 120,
        }];
        const result = calc(variants, 100);
        assert.equal(result.combinedShare, 40.0);
    });

    it('accepts deck_inclusion_count alias', () => {
        const variants = [{
            card_name: 'Luxury Ball',
            deck_inclusion_count: 40,
            total_copies: 120,
        }];
        const result = calc(variants, 100);
        assert.equal(result.combinedShare, 40.0);
    });

    it('reconstructs totalCount from avgCountWhenUsed when totalCount is missing', () => {
        const variants = [{
            card_name: 'Ultra Ball',
            deck_count: 50,
            total_count: 0,  // missing
            avgCountWhenUsed: 3.5,
        }];
        const result = calc(variants, 100);
        // reconstructed totalCount = 3.5 * 50 = 175
        // estimatedUniqueDecks = min(100, 50) = 50
        // avg = 175/50 = 3.5
        assert.equal(result.combinedAvgWhenUsed, 3.5);
    });

    it('handles European comma decimals in string values', () => {
        const variants = [{
            card_name: 'Nest Ball',
            deck_count: '40',
            total_count: '120,5',  // European decimal
        }];
        const result = calc(variants, 100);
        assert.ok(Number.isFinite(result.combinedAvgWhenUsed));
    });
});

// ── Legal max enforcement ───────────────────────────────────
describe('calculateCombinedVariantStats — legal max', () => {
    it('caps combinedAvgWhenUsed at legalMax=4 for normal cards', () => {
        const variants = [{
            card_name: 'Pikachu',
            deck_count: 10,
            total_count: 60,  // 60/10 = 6 avg per deck
        }];
        const result = calc(variants, 100);
        assert.ok(result.combinedAvgWhenUsed <= 4, `Avg ${result.combinedAvgWhenUsed} should be <= 4`);
        assert.equal(result.legalMax, 4);
    });

    it('recommendedCount is capped at legalMax', () => {
        const variants = [{
            card_name: 'Pikachu',
            deck_count: 10,
            total_count: 50,  // 50/10 = 5 avg, capped at 4
        }];
        const result = calc(variants, 100);
        assert.ok(result.recommendedCount <= result.legalMax);
    });
});

// ── baseName extraction ─────────────────────────────────────
describe('calculateCombinedVariantStats — baseName', () => {
    it('extracts baseName from card_name with set marker', () => {
        const variants = [{
            card_name: 'Lucario ex (PAL 123)',
            deck_count: 30,
            total_count: 90,
        }];
        const result = calc(variants, 100);
        assert.equal(result.baseName, 'Lucario ex');
    });

    it('preserves ex suffix in baseName', () => {
        const variants = [{
            card_name: 'Charizard ex',
            deck_count: 20,
            total_count: 60,
        }];
        const result = calc(variants, 100);
        assert.ok(result.baseName.includes('ex'), `baseName "${result.baseName}" should contain "ex"`);
    });

    it('falls back to name field if card_name is missing', () => {
        const variants = [{
            name: 'Mewtwo V',
            deck_count: 15,
            total_count: 30,
        }];
        const result = calc(variants, 100);
        assert.ok(result.baseName.includes('Mewtwo'), `baseName "${result.baseName}" should contain "Mewtwo"`);
    });
});

// ── NaN / garbage data protection ───────────────────────────
describe('calculateCombinedVariantStats — garbage data protection', () => {
    it('handles NaN deck_count gracefully', () => {
        const variants = [{
            card_name: 'Test',
            deck_count: 'abc',
            total_count: 100,
        }];
        const result = calc(variants, 100);
        assert.ok(Number.isFinite(result.combinedShare), 'Share should be finite');
    });

    it('handles completely empty variant objects', () => {
        const variants = [{}];
        const result = calc(variants, 100);
        assert.ok(Number.isFinite(result.combinedShare));
        assert.equal(result.combinedShare, 0);
    });

    it('handles negative deck_count gracefully', () => {
        const variants = [{
            card_name: 'Oddity',
            deck_count: -5,
            total_count: 10,
        }];
        const result = calc(variants, 100);
        // negative deck_count → maxDeckCount might be 0 (parseFloat of -5 is -5, but max with 0 stays 0 ... actually max(-5, 0) with initial 0 → 0)
        // No, maxDeckCount starts at 0, Math.max(0, -5) = 0
        // estimatedUniqueDecks = min(safeTotalDecks, 0) = 0
        // share = 0/safeTotalDecks * 100 = 0
        assert.equal(result.combinedShare, 0);
    });
});
