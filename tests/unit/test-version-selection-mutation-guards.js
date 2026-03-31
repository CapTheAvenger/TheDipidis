/**
 * Mutation-guard tests for calculateCombinedVariantStats and getPreferredVersionForCard.
 *
 * These cases are chosen to catch small logic mutations such as:
 * - round -> floor/ceil
 * wrong tie-breaker direction
 * skipping promo merge branch
 * skipping non-English filter branch
 * returning all-English fallback too early/late
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadAppUtils } = require('./test-helpers');

function freshEnv(overrides = {}) {
    return loadAppUtils({
        getGlobalRarityPreference: () => overrides.globalPref !== undefined ? overrides.globalPref : 'min',
        getRarityPreference: () => overrides.cardPref || null,
        getEnglishCardVersions: overrides.getEnglishCardVersions || (() => []),
        getInternationalPrintsForCard: overrides.getInternationalPrintsForCard || (() => []),
        getIndexedCardBySetNumber: overrides.getIndexedCardBySetNumber || (() => null),
        cardsBySetNumberMap: overrides.cardsBySetNumberMap || {},
        cardsByNameMap: overrides.cardsByNameMap || {},
        setOrderMap: overrides.setOrderMap || {},
        ...overrides,
    });
}

describe('calculateCombinedVariantStats — mutation guards', () => {
    it('rounds recommendedCount 2.5 up to 3', () => {
        const fns = loadAppUtils();
        const result = fns.calculateCombinedVariantStats([
            { card_name: 'Rare Candy', deck_count: 10, total_count: 25 },
        ], 100);

        assert.equal(result.combinedAvgWhenUsed, 2.5);
        assert.equal(result.recommendedCount, 3);
    });

    it('keeps recommendedCount at minimum 1 for non-empty zero-total variants', () => {
        const fns = loadAppUtils();
        const result = fns.calculateCombinedVariantStats([
            { card_name: 'Iono', deck_count: 5, total_count: 0 },
        ], 100);

        assert.equal(result.combinedAvgWhenUsed, 0);
        assert.equal(result.recommendedCount, 1);
    });

    it('enforces legalMax=1 for radiant cards in aggregated stats', () => {
        const fns = loadAppUtils();
        const result = fns.calculateCombinedVariantStats([
            { card_name: 'Radiant Greninja', deck_count: 20, total_count: 40 },
        ], 100);

        assert.equal(result.legalMax, 1);
        assert.equal(result.combinedAvgWhenUsed, 1);
        assert.equal(result.recommendedCount, 1);
    });

    it('rounds combinedShare to one decimal place', () => {
        const fns = loadAppUtils();
        const result = fns.calculateCombinedVariantStats([
            { card_name: 'Nest Ball', deck_count: 1, total_count: 4 },
        ], 6);

        assert.equal(result.combinedShare, 16.7);
    });
});

describe('getPreferredVersionForCard — mutation guards', () => {
    it('uses lower card number as final tie-breaker inside same set and rarity', () => {
        const versions = [
            { set: 'SVI', number: '020', rarity: 'Common', type: 'Pokémon' },
            { set: 'SVI', number: '005', rarity: 'Common', type: 'Pokémon' },
        ];
        const fns = freshEnv({
            globalPref: 'min',
            getEnglishCardVersions: () => versions,
            setOrderMap: { SVI: 100 },
        });
        fns._sandbox.window.setOrderMap = { SVI: 100 };

        const result = fns.getPreferredVersionForCard('Pikachu');
        assert.equal(result.number, '005');
    });

    it('uses per-card min preference when no global preference is set', () => {
        const versions = [
            { set: 'SVI', number: '010', rarity: 'Rare', type: 'Pokémon' },
            { set: 'PAL', number: '020', rarity: 'Common', type: 'Pokémon' },
        ];
        const fns = freshEnv({
            globalPref: null,
            cardPref: { mode: 'min' },
            getEnglishCardVersions: () => versions,
            setOrderMap: { SVI: 10, PAL: 20 },
        });
        fns._sandbox.window.setOrderMap = { SVI: 10, PAL: 20 };

        const result = fns.getPreferredVersionForCard('Eevee');
        assert.equal(result.set, 'PAL');
        assert.equal(result.rarity, 'Common');
    });

    it('returns null for missing specific per-card target when no global preference is set', () => {
        const versions = [
            { set: 'SVI', number: '010', rarity: 'Common', type: 'Pokémon' },
        ];
        const fns = freshEnv({
            globalPref: null,
            cardPref: { mode: 'specific', set: 'PAL', number: '999' },
            getEnglishCardVersions: () => versions,
        });

        const result = fns.getPreferredVersionForCard('Eevee');
        assert.equal(result, null);
    });

    it('filters international pool to English prints when original set is non-English', () => {
        const intl = [
            { set: 'JP1', number: '001', rarity: 'Common', type: 'Trainer' },
            { set: 'SVI', number: '100', rarity: 'Uncommon', type: 'Trainer' },
            { set: 'PAL', number: '200', rarity: 'Common', type: 'Trainer' },
        ];
        const fns = freshEnv({
            globalPref: 'min',
            getInternationalPrintsForCard: () => intl,
            getEnglishCardVersions: () => intl.filter((v) => v.set !== 'JP1'),
        });
        fns._sandbox.window.englishSetCodes = new Set(['SVI', 'PAL']);

        const result = fns.getPreferredVersionForCard("Boss's Orders", 'JP1', '001');
        assert.notEqual(result.set, 'JP1');
        assert.equal(result.set, 'PAL');
    });

    it('falls back to all English versions when international prints have no rarity data', () => {
        const intl = [
            { set: 'SVI', number: '100', rarity: '', type: 'Trainer' },
        ];
        const english = [
            { set: 'SVI', number: '100', rarity: '', type: 'Trainer' },
            { set: 'PAL', number: '200', rarity: 'Common', type: 'Trainer' },
        ];
        const fns = freshEnv({
            globalPref: 'min',
            getInternationalPrintsForCard: () => intl,
            getEnglishCardVersions: () => english,
        });
        fns._sandbox.window.englishSetCodes = new Set(['SVI', 'PAL']);

        const result = fns.getPreferredVersionForCard("Boss's Orders", 'SVI', '100');
        assert.equal(result.set, 'PAL');
        assert.equal(result.rarity, 'Common');
    });

    it('merges promo Pokemon with standard-set reprints by name', () => {
        const promo = { set: 'SVP', number: '001', rarity: '', type: 'Pokémon' };
        const standard = { set: 'SVI', number: '120', rarity: 'Common', type: 'Pokémon' };
        const fns = freshEnv({
            globalPref: 'min',
            getIndexedCardBySetNumber: (s, n) => (s === 'SVP' && n === '001' ? promo : null),
            getInternationalPrintsForCard: () => [promo],
            getEnglishCardVersions: () => [promo, standard],
            cardsBySetNumberMap: { 'SVP-001': promo },
        });
        fns._sandbox.window.englishSetCodes = new Set(['SVP', 'SVI']);

        const result = fns.getPreferredVersionForCard('Pikachu', 'SVP', '001');
        assert.equal(result.set, 'SVI');
        assert.equal(result.rarity, 'Common');
    });

    it('falls back to null when no global preference and no card preference exist', () => {
        const fns = freshEnv({
            globalPref: null,
            cardPref: null,
            getEnglishCardVersions: () => [
                { set: 'SVI', number: '010', rarity: 'Common', type: 'Pokémon' },
            ],
        });

        const result = fns.getPreferredVersionForCard('Pikachu');
        assert.equal(result, null);
    });
});
