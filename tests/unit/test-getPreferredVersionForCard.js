/**
 * Unit tests for getPreferredVersionForCard()
 *
 * This function selects which print (set + number) to display for a card
 * based on the user's rarity preference (min/max) or a per-card override.
 * It's the single most impactful function for what users SEE.
 *
 * Run:  node --test tests/unit/test-getPreferredVersionForCard.js
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadAppUtils } = require('./test-helpers');

// ── Helper: create a fresh sandbox for each test ─────────────
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

// ── min mode: picks lowest rarity ───────────────────────────
describe('getPreferredVersionForCard — min mode', () => {
    it('selects Common over Uncommon and Rare', () => {
        const versions = [
            { set: 'SVI', number: '100', rarity: 'Rare', type: 'Pokémon' },
            { set: 'PAL', number: '50', rarity: 'Common', type: 'Pokémon' },
            { set: 'OBF', number: '75', rarity: 'Uncommon', type: 'Pokémon' },
        ];
        const fns = freshEnv({
            globalPref: 'min',
            getEnglishCardVersions: () => versions,
        });

        const result = fns.getPreferredVersionForCard('Pikachu');
        assert.equal(result.set, 'PAL');
        assert.equal(result.rarity, 'Common');
    });

    it('selects Uncommon over Holo Rare', () => {
        const versions = [
            { set: 'SVI', number: '10', rarity: 'Holo Rare', type: 'Pokémon' },
            { set: 'PAL', number: '20', rarity: 'Uncommon', type: 'Pokémon' },
        ];
        const fns = freshEnv({
            globalPref: 'min',
            getEnglishCardVersions: () => versions,
        });

        const result = fns.getPreferredVersionForCard('Charmander');
        assert.equal(result.set, 'PAL');
        assert.equal(result.rarity, 'Uncommon');
    });

    it('filters out NO-RARITY cards (priority 999) when valid alternatives exist', () => {
        const versions = [
            { set: 'BLK', number: '1', rarity: '', type: 'Pokémon' },    // priority 999
            { set: 'SVI', number: '2', rarity: 'Common', type: 'Pokémon' }, // priority 1
        ];
        const fns = freshEnv({
            globalPref: 'min',
            getEnglishCardVersions: () => versions,
        });

        const result = fns.getPreferredVersionForCard('Bulbasaur');
        assert.equal(result.set, 'SVI');
        assert.equal(result.rarity, 'Common');
    });

    it('falls back to NO-RARITY card when ALL versions lack rarity', () => {
        const versions = [
            { set: 'OLD', number: '1', rarity: '', type: 'Pokémon' },
            { set: 'OLD', number: '2', rarity: null, type: 'Pokémon' },
        ];
        const fns = freshEnv({
            globalPref: 'min',
            getEnglishCardVersions: () => versions,
        });

        const result = fns.getPreferredVersionForCard('Geodude');
        assert.ok(result, 'Should still return something even if all are NO RARITY');
    });
});

// ── max mode: picks highest rarity ──────────────────────────
describe('getPreferredVersionForCard — max mode', () => {
    it('selects Secret Rare over Common', () => {
        const versions = [
            { set: 'SVI', number: '100', rarity: 'Common', type: 'Pokémon' },
            { set: 'PAL', number: '200', rarity: 'Secret Rare', type: 'Pokémon' },
            { set: 'OBF', number: '150', rarity: 'Holo Rare', type: 'Pokémon' },
        ];
        const fns = freshEnv({
            globalPref: 'max',
            getEnglishCardVersions: () => versions,
        });

        const result = fns.getPreferredVersionForCard('Mewtwo');
        assert.equal(result.set, 'PAL');
        assert.equal(result.rarity, 'Secret Rare');
    });

    it('selects Special Art Rare over Ultra Rare', () => {
        const versions = [
            { set: 'MEW', number: '10', rarity: 'Ultra Rare', type: 'Pokémon' },
            { set: 'PAR', number: '20', rarity: 'Special Art Rare', type: 'Pokémon' },
        ];
        const fns = freshEnv({
            globalPref: 'max',
            getEnglishCardVersions: () => versions,
        });

        const result = fns.getPreferredVersionForCard('Charizard');
        assert.equal(result.set, 'PAR');
        assert.equal(result.rarity, 'Special Art Rare');
    });
});

// ── Set ordering tiebreaker (same rarity) ───────────────────
describe('getPreferredVersionForCard — set ordering tiebreaker', () => {
    it('prefers newer set when rarity is identical', () => {
        const versions = [
            { set: 'PAL', number: '10', rarity: 'Common', type: 'Pokémon' },
            { set: 'SSP', number: '20', rarity: 'Common', type: 'Pokémon' },
        ];
        const fns = freshEnv({
            globalPref: 'min',
            getEnglishCardVersions: () => versions,
            // SSP (set order 100) is newer than PAL (set order 50)
            setOrderMap: { PAL: 50, SSP: 100 },
        });
        // We need to set window.setOrderMap in the sandbox
        fns._sandbox.window.setOrderMap = { PAL: 50, SSP: 100 };

        const result = fns.getPreferredVersionForCard('Rattata');
        assert.equal(result.set, 'SSP', 'Should pick newer set SSP');
    });
});

// ── Basic Energy special handling ────────────────────────────
describe('getPreferredVersionForCard — basic energy', () => {
    it('selects SVE version for Fire Energy in min mode', () => {
        const versions = [
            { set: 'SVI', number: '10', rarity: 'Common', type: 'Energy' },
            { set: 'SVE', number: '18', rarity: 'Common', type: 'Energy' },
            { set: 'PAL', number: '5', rarity: 'Common', type: 'Energy' },
        ];
        const fns = freshEnv({
            globalPref: 'min',
            getEnglishCardVersions: () => versions,
        });

        const result = fns.getPreferredVersionForCard('Fire Energy');
        assert.equal(result.set, 'SVE');
        assert.equal(result.number, '18');
    });

    it('maps each energy type to correct SVE number', () => {
        const energyMap = {
            'Grass Energy': '17',
            'Fire Energy': '18',
            'Water Energy': '19',
            'Lightning Energy': '20',
            'Psychic Energy': '21',
            'Fighting Energy': '22',
            'Darkness Energy': '23',
            'Metal Energy': '24',
        };

        for (const [name, sveNum] of Object.entries(energyMap)) {
            const versions = [
                { set: 'SVI', number: '99', rarity: 'Common', type: 'Energy' },
                { set: 'SVE', number: sveNum, rarity: 'Common', type: 'Energy' },
            ];
            const fns = freshEnv({
                globalPref: 'min',
                getEnglishCardVersions: () => versions,
            });

            const result = fns.getPreferredVersionForCard(name);
            assert.equal(result.set, 'SVE', `${name} should use SVE`);
            assert.equal(result.number, sveNum, `${name} should use SVE ${sveNum}`);
        }
    });
});

// ── No versions found ───────────────────────────────────────
describe('getPreferredVersionForCard — no versions', () => {
    it('returns null when no versions exist', () => {
        const fns = freshEnv({
            globalPref: 'min',
            getEnglishCardVersions: () => [],
        });

        const result = fns.getPreferredVersionForCard('NonExistentCard');
        assert.equal(result, null);
    });
});

// ── Per-card specific preference ────────────────────────────
describe('getPreferredVersionForCard — per-card preference', () => {
    it('specific mode returns exact set/number match when globalPref is null', () => {
        const versions = [
            { set: 'SVI', number: '10', rarity: 'Common', type: 'Pokémon' },
            { set: 'PAL', number: '20', rarity: 'Holo Rare', type: 'Pokémon' },
            { set: 'OBF', number: '30', rarity: 'Ultra Rare', type: 'Pokémon' },
        ];
        const fns = freshEnv({
            globalPref: null,
            cardPref: { mode: 'specific', set: 'OBF', number: '30' },
            getEnglishCardVersions: () => versions,
        });

        const result = fns.getPreferredVersionForCard('Eevee');
        assert.equal(result.set, 'OBF');
        assert.equal(result.number, '30');
    });

    it('globalPref takes precedence over per-card preference', () => {
        // When globalPref is 'min', per-card pref is ignored — this is the actual behavior
        const versions = [
            { set: 'SVI', number: '10', rarity: 'Common', type: 'Pokémon' },
            { set: 'PAL', number: '20', rarity: 'Secret Rare', type: 'Pokémon' },
        ];
        const fns = freshEnv({
            globalPref: 'min',
            cardPref: { mode: 'max' },
            getEnglishCardVersions: () => versions,
        });

        const result = fns.getPreferredVersionForCard('Lucario');
        // globalPref 'min' wins → Common is selected, NOT Secret Rare
        assert.equal(result.rarity, 'Common');
    });
});

// ── Cache behavior ──────────────────────────────────────────
describe('getPreferredVersionForCard — cache', () => {
    it('returns cached result on second call with same parameters', () => {
        const versions = [
            { set: 'SVI', number: '10', rarity: 'Common', type: 'Pokémon' },
        ];
        const fns = freshEnv({
            globalPref: 'min',
            getEnglishCardVersions: () => versions,
        });

        const result1 = fns.getPreferredVersionForCard('Pikachu');
        const result2 = fns.getPreferredVersionForCard('Pikachu');
        assert.deepStrictEqual(result1, result2);
    });

    it('different card names produce different cache entries', () => {
        let callCount = 0;
        const fns = freshEnv({
            globalPref: 'min',
            getEnglishCardVersions: (name) => {
                callCount++;
                return [{ set: 'SVI', number: String(callCount), rarity: 'Common', type: 'Pokémon' }];
            },
        });

        const r1 = fns.getPreferredVersionForCard('Pikachu');
        const r2 = fns.getPreferredVersionForCard('Charmander');
        assert.notDeepStrictEqual(r1, r2);
    });
});

// ── Promo set handling ──────────────────────────────────────
describe('getPreferredVersionForCard — promo sets', () => {
    it('null-rarity promo card (MEP) gets priority 8 instead of 999', () => {
        const fns = freshEnv({ globalPref: 'min' });
        const priority = fns.getRarityPriority(null, 'MEP');
        assert.equal(priority, 8, 'MEP promo without rarity should be 8');
    });
});

// ── Trainer card name-merge behavior ────────────────────────
describe('getPreferredVersionForCard — trainer name merge', () => {
    it('merges English reprints for Trainer cards (non-Pokémon)', () => {
        const intlPrints = [
            { set: 'SVI', number: '100', rarity: 'Uncommon', type: 'Trainer' },
        ];
        const allEnglish = [
            { set: 'SVI', number: '100', rarity: 'Uncommon', type: 'Trainer' },
            { set: 'PAL', number: '200', rarity: 'Common', type: 'Trainer' },
        ];
        const fns = freshEnv({
            globalPref: 'min',
            getInternationalPrintsForCard: () => intlPrints,
            getEnglishCardVersions: () => allEnglish,
            cardsBySetNumberMap: { 'SVI-100': intlPrints[0] },
        });
        // Set englishSetCodes for the filter
        fns._sandbox.window.englishSetCodes = new Set(['SVI', 'PAL']);

        const result = fns.getPreferredVersionForCard("Boss's Orders", 'SVI', '100');
        // Should pick PAL-200 (Common, priority 1) over SVI-100 (Uncommon, priority 2)
        assert.equal(result.set, 'PAL');
        assert.equal(result.rarity, 'Common');
    });

    it('does NOT merge for Pokémon cards by name (strict set binding)', () => {
        const tefCard = { set: 'TEF', number: '85', rarity: 'Uncommon', type: 'Pokémon' };
        const fns = freshEnv({
            globalPref: 'min',
            // getIndexedCardBySetNumber must return the card so getInternationalPrintsForCard resolves
            getIndexedCardBySetNumber: (s, n) => (s === 'TEF' && n === '85') ? tefCard : null,
            getEnglishCardVersions: () => [
                { set: 'TEF', number: '85', rarity: 'Uncommon', type: 'Pokémon' },
                { set: 'BLK', number: '45', rarity: 'Common', type: 'Pokémon' },
            ],
            cardsBySetNumberMap: { 'TEF-85': tefCard },
        });
        fns._sandbox.window.englishSetCodes = new Set(['TEF', 'BLK']);

        const result = fns.getPreferredVersionForCard('Drilbur', 'TEF', '85');
        // Should NOT pick BLK-45 even though it's cheaper — different set Pokémon may have different attacks
        assert.equal(result.set, 'TEF');
    });
});
