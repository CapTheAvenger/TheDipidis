/**
 * Unit tests for fixMojibake(), getStrictBaseCardName(), normalizeDeckEntries()
 *
 * These are data-integrity functions from app-utils.js that are critical
 * for correct card name handling across the entire application.
 *
 * Run:  node --test tests/unit/test-dataIntegrity.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadAppUtils } = require('./test-helpers');

// ═══════════════════════════════════════════════════════════════
// fixMojibake
// ═══════════════════════════════════════════════════════════════

describe('fixMojibake — null / empty handling', () => {
    const { fixMojibake } = loadAppUtils();

    it('returns empty string for null', () => {
        assert.equal(fixMojibake(null), '');
    });

    it('returns empty string for undefined', () => {
        assert.equal(fixMojibake(undefined), '');
    });

    it('returns empty string for empty string', () => {
        assert.equal(fixMojibake(''), '');
    });

    it('returns empty string for whitespace-only', () => {
        assert.equal(fixMojibake('   '), '');
    });
});

describe('fixMojibake — fast path (no suspicious chars)', () => {
    const { fixMojibake } = loadAppUtils();

    it('returns clean ASCII text unchanged', () => {
        assert.equal(fixMojibake('Charizard ex'), 'Charizard ex');
    });

    it('returns clean Unicode text unchanged (no Ã/Â/â)', () => {
        assert.equal(fixMojibake('Pokémon'), 'Pokémon');
    });

    it('returns numbers unchanged', () => {
        assert.equal(fixMojibake('12345'), '12345');
    });
});

describe('fixMojibake — decodeURIComponent(escape()) repair path', () => {
    const { fixMojibake } = loadAppUtils();

    it('repairs double-encoded é (PokÃ©mon → Pokémon)', () => {
        // "PokÃ©mon" is a classic UTF-8 mojibake for "Pokémon"
        const result = fixMojibake('PokÃ©mon');
        assert.equal(result, 'Pokémon');
    });

    it('repairs double-encoded ü (Ã¼ → ü)', () => {
        const result = fixMojibake('Ã¼ber');
        assert.equal(result, 'über');
    });
});

describe('fixMojibake — fallback replacements', () => {
    const { fixMojibake } = loadAppUtils();

    it('replaces â€™ with right single quote', () => {
        // This pattern appears when UTF-8 right quote is mis-decoded
        const input = 'N\u00e2\u0080\u0099s Resolve';
        const result = fixMojibake(input);
        // Should either repair via decodeURIComponent or via fallback replace
        assert.ok(!result.includes('â€™'), `Still contains mojibake: ${result}`);
    });

    it('removes stray Â characters', () => {
        // Â is a common artifact of double-encoding
        const result = fixMojibake('Â special card');
        assert.ok(!result.includes('Â'), `Still contains Â: ${result}`);
    });
});

describe('fixMojibake — coercion', () => {
    const { fixMojibake } = loadAppUtils();

    it('coerces number to string', () => {
        assert.equal(fixMojibake(42), '42');
    });

    it('coerces boolean to string', () => {
        assert.equal(fixMojibake(true), 'true');
    });
});

// ═══════════════════════════════════════════════════════════════
// getStrictBaseCardName
// ═══════════════════════════════════════════════════════════════

describe('getStrictBaseCardName — empty / null', () => {
    const { getStrictBaseCardName } = loadAppUtils();

    it('returns empty string for null', () => {
        assert.equal(getStrictBaseCardName(null), '');
    });

    it('returns empty string for undefined', () => {
        assert.equal(getStrictBaseCardName(undefined), '');
    });

    it('returns empty string for empty string', () => {
        assert.equal(getStrictBaseCardName(''), '');
    });
});

describe('getStrictBaseCardName — set/number stripping', () => {
    const { getStrictBaseCardName } = loadAppUtils();

    it('strips parenthesized set+number: "Lucario ex (PAL 123)" → "Lucario ex"', () => {
        assert.equal(getStrictBaseCardName('Lucario ex (PAL 123)'), 'Lucario ex');
    });

    it('strips space-separated set+number: "Pikachu TEF 42" → "Pikachu"', () => {
        assert.equal(getStrictBaseCardName('Pikachu TEF 42'), 'Pikachu');
    });

    it('strips set+number with hyphen: "Boss (MEG 78-A)" → "Boss"', () => {
        assert.equal(getStrictBaseCardName('Boss (MEG 78-A)'), 'Boss');
    });

    it('preserves gameplay suffixes: "Charizard ex" stays', () => {
        assert.equal(getStrictBaseCardName('Charizard ex'), 'Charizard ex');
    });

    it('preserves VMAX suffix: "Eternatus VMAX"', () => {
        assert.equal(getStrictBaseCardName('Eternatus VMAX'), 'Eternatus VMAX');
    });

    it('preserves GX suffix: "Mewtwo GX"', () => {
        assert.equal(getStrictBaseCardName('Mewtwo GX'), 'Mewtwo GX');
    });
});

describe('getStrictBaseCardName — apostrophe normalization', () => {
    const { getStrictBaseCardName } = loadAppUtils();

    it('normalizes right single quote to straight apostrophe', () => {
        const result = getStrictBaseCardName('N\u2019s Resolve');
        assert.equal(result, "N's Resolve");
    });

    it('normalizes left single quote to straight apostrophe', () => {
        const result = getStrictBaseCardName('N\u2018s Grit');
        assert.equal(result, "N's Grit");
    });

    it('normalizes backtick to straight apostrophe', () => {
        const result = getStrictBaseCardName('N`s Resolve');
        assert.equal(result, "N's Resolve");
    });
});

describe('getStrictBaseCardName — whitespace normalization', () => {
    const { getStrictBaseCardName } = loadAppUtils();

    it('collapses multiple spaces', () => {
        assert.equal(getStrictBaseCardName('Charizard   ex'), 'Charizard ex');
    });

    it('trims leading/trailing whitespace', () => {
        assert.equal(getStrictBaseCardName('  Pikachu  '), 'Pikachu');
    });
});

describe('getStrictBaseCardName — mojibake repair', () => {
    const { getStrictBaseCardName } = loadAppUtils();

    it('repairs PokÃ©mon before stripping', () => {
        const result = getStrictBaseCardName('PokÃ©mon ex (TEF 42)');
        assert.equal(result, 'Pokémon ex');
    });
});

// ═══════════════════════════════════════════════════════════════
// normalizeDeckEntries
// ═══════════════════════════════════════════════════════════════

describe('normalizeDeckEntries — invalid source', () => {
    const { normalizeDeckEntries } = loadAppUtils();

    it('returns false for unknown source', () => {
        assert.equal(normalizeDeckEntries('unknownSource'), false);
    });

    it('returns false for null source', () => {
        assert.equal(normalizeDeckEntries(null), false);
    });

    it('returns false for empty string source', () => {
        assert.equal(normalizeDeckEntries(''), false);
    });
});

describe('normalizeDeckEntries — no changes needed', () => {
    // When deck keys are already canonical, should return false
    it('returns false when deck is already normalized (cityLeague)', () => {
        const fns = loadAppUtils({
            // getCanonicalCardRecord returns null → getDisplayCardName falls back to fixMojibake(name)
            getCanonicalCardRecord: () => null,
        });
        const sandbox = fns._sandbox;
        // Set up a simple deck with already-canonical keys
        sandbox.window.cityLeagueDeck = { 'Pikachu (TEF 42)': 3 };
        sandbox.window.cityLeagueDeckOrder = ['Pikachu (TEF 42)'];

        const result = fns.normalizeDeckEntries('cityLeague');
        assert.equal(result, false);
    });
});

describe('normalizeDeckEntries — merges duplicate keys', () => {
    it('merges two keys that map to the same canonical key', () => {
        const fns = loadAppUtils({
            getCanonicalCardRecord: () => null,
        });
        const sandbox = fns._sandbox;

        // Two keys that differ only in whitespace → same canonical key
        sandbox.window.currentMetaDeck = {
            'Pikachu  (TEF 42)': 2,    // extra space → will normalize
            'Pikachu (TEF 42)': 1,
        };
        sandbox.window.currentMetaDeckOrder = ['Pikachu  (TEF 42)', 'Pikachu (TEF 42)'];

        const result = fns.normalizeDeckEntries('currentMeta');
        assert.equal(result, true);
        assert.equal(sandbox.window.currentMetaDeck['Pikachu (TEF 42)'], 3);
    });
});

describe('normalizeDeckEntries — removes zero-count entries', () => {
    it('drops entries with count 0', () => {
        const fns = loadAppUtils({
            getCanonicalCardRecord: () => null,
        });
        const sandbox = fns._sandbox;
        sandbox.window.pastMetaDeck = {
            'Charizard ex (MEG 6)': 0,
            'Pikachu (TEF 42)': 2,
        };
        sandbox.window.pastMetaDeckOrder = ['Charizard ex (MEG 6)', 'Pikachu (TEF 42)'];

        const result = fns.normalizeDeckEntries('pastMeta');
        assert.equal(result, true);
        assert.equal(sandbox.window.pastMetaDeck['Charizard ex (MEG 6)'], undefined);
        assert.equal(sandbox.window.pastMetaDeck['Pikachu (TEF 42)'], 2);
    });
});

describe('normalizeDeckEntries — preserves order', () => {
    it('preserves insertion order after normalization', () => {
        const fns = loadAppUtils({
            getCanonicalCardRecord: () => null,
        });
        const sandbox = fns._sandbox;

        sandbox.window.cityLeagueDeck = {
            'Pikachu  (TEF 42)': 2,
            'Boss (MEG 78)': 1,
        };
        sandbox.window.cityLeagueDeckOrder = ['Pikachu  (TEF 42)', 'Boss (MEG 78)'];

        fns.normalizeDeckEntries('cityLeague');
        const order = Array.from(sandbox.window.cityLeagueDeckOrder);
        // Both should be in order, with Pikachu first
        assert.ok(order.indexOf('Pikachu (TEF 42)') < order.indexOf('Boss (MEG 78)'));
    });
});

describe('normalizeDeckEntries — mojibake in key', () => {
    it('repairs mojibake in deck key names', () => {
        const fns = loadAppUtils({
            getCanonicalCardRecord: () => null,
        });
        const sandbox = fns._sandbox;

        // Mojibake key
        sandbox.window.currentMetaDeck = {
            'PokÃ©mon ex (TEF 42)': 3,
        };
        sandbox.window.currentMetaDeckOrder = ['PokÃ©mon ex (TEF 42)'];

        const result = fns.normalizeDeckEntries('currentMeta');
        assert.equal(result, true);
        // The key should now be repaired
        const keys = Object.keys(sandbox.window.currentMetaDeck);
        assert.equal(keys.length, 1);
        assert.ok(keys[0].includes('Pokémon'), `Key should be repaired: ${keys[0]}`);
    });
});

// ═══════════════════════════════════════════════════════════════
// isBasicEnergy
// ═══════════════════════════════════════════════════════════════

describe('isBasicEnergy', () => {
    const { isBasicEnergy } = loadAppUtils();

    it('recognizes Fire Energy', () => {
        assert.equal(isBasicEnergy('Fire Energy'), true);
    });

    it('recognizes Water Energy', () => {
        assert.equal(isBasicEnergy('Water Energy'), true);
    });

    it('recognizes all 11 basic energy types', () => {
        const types = [
            'Fire Energy', 'Water Energy', 'Grass Energy', 'Lightning Energy',
            'Psychic Energy', 'Fighting Energy', 'Darkness Energy', 'Metal Energy',
            'Fairy Energy', 'Dragon Energy', 'Colorless Energy',
        ];
        for (const e of types) {
            assert.equal(isBasicEnergy(e), true, `${e} should be basic energy`);
        }
    });

    it('is case-insensitive', () => {
        assert.equal(isBasicEnergy('FIRE ENERGY'), true);
        assert.equal(isBasicEnergy('fire energy'), true);
    });

    it('rejects special energy', () => {
        assert.equal(isBasicEnergy('Double Turbo Energy'), false);
    });

    it('rejects non-energy cards', () => {
        assert.equal(isBasicEnergy('Charizard ex'), false);
    });

    it('returns false for empty/null', () => {
        assert.equal(isBasicEnergy(''), false);
        assert.equal(isBasicEnergy(null), false);
    });
});

// ═══════════════════════════════════════════════════════════════
// normalizeCardName
// ═══════════════════════════════════════════════════════════════

describe('normalizeCardName', () => {
    const { normalizeCardName } = loadAppUtils();

    it('returns empty for null/empty', () => {
        assert.equal(normalizeCardName(''), '');
        assert.equal(normalizeCardName(null), '');
    });

    it('lowercases', () => {
        assert.equal(normalizeCardName('Charizard EX'), 'charizard ex');
    });

    it('removes parenthetical suffixes', () => {
        assert.equal(normalizeCardName('Pikachu (PAL 42)'), 'pikachu');
    });

    it('removes bracketed suffixes', () => {
        assert.equal(normalizeCardName('Boss [trainer]'), 'boss');
    });

    it('normalizes curly apostrophes', () => {
        const result = normalizeCardName('N\u2019s Resolve');
        assert.equal(result, "n's resolve");
    });

    it('collapses whitespace', () => {
        assert.equal(normalizeCardName('Charizard   ex'), 'charizard ex');
    });

    it('repairs mojibake before normalizing', () => {
        const result = normalizeCardName('PokÃ©mon');
        assert.equal(result, 'pokémon');
    });
});
