/**
 * Unit tests for js/app-profile-deck-builder.js — the pure helpers
 * that decide what shows in the search results, how the deck-list
 * paste parser interprets a Showdown/Limitless block, and the
 * mulligan probability math the bottom panel surfaces.
 *
 * The module is an IIFE that attaches its public surface to
 * window.ProfileDeckBuilder; the tests load it into a vm sandbox
 * with a minimal browser shim so we can call those helpers without
 * a real DOM.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Load the module into a sandbox with a tiny browser-API shim. We
// only need the bits the IIFE touches at load time — addEventListener
// on document, getLang on window, and stubs for localStorage / fetch
// so the module-side reads/writes don't blow up.
// Load the module into a sandbox that shares the test realm's
// globals (Set, Object, …) via runInThisContext rather than
// createContext. Reason: the helpers receive Sets / plain objects
// constructed in this test file; running them in a *separate* vm
// realm makes Set.prototype.has reject host-realm Sets (the
// 'incompatible receiver' branch in V8). Sharing the realm is the
// idiom the other test files in tests/unit/ use too.
function loadModule() {
    const src = fs.readFileSync(
        path.join(__dirname, '..', '..', 'js', 'app-profile-deck-builder.js'),
        'utf-8',
    );
    // Stub the browser globals the IIFE touches; restore on the way out.
    const prev = {
        window: global.window, document: global.document,
        localStorage: global.localStorage, fetch: global.fetch,
    };
    global.window = global.window || {};
    global.document = {
        addEventListener: () => {},
        getElementById: () => null,
        querySelectorAll: () => [],
    };
    global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    global.fetch = async () => ({ ok: false });
    try {
        vm.runInThisContext(src);
    } finally {
        // Don't restore window — the IIFE has already attached its
        // public surface to it and the rest of the tests need access.
        // Restore the others to avoid leaking the stubs.
        global.document = prev.document;
        global.localStorage = prev.localStorage;
        global.fetch = prev.fetch;
    }
    return global.window.ProfileDeckBuilder;
}

const PDB = loadModule();

// ── Fixture cards covering each kind we care about ─────────────────

const charizard = {
    name_en: 'Charizard ex', name_de: 'Glurak ex', set: 'OBF', number: '125',
    type: 'Stage 2', energy_type: 'Fire', card_text: 'Ability Burning Darkness …',
};
const weedle = {
    name_en: 'Weedle', name_de: 'Hornliu', set: 'CRI', number: '1',
    type: 'Basic', energy_type: 'Grass', card_text: 'G Surprise Attack 30',
};
const iono = {
    name_en: 'Iono', name_de: 'Ortega', set: 'PAL', number: '185',
    type: 'Supporter', energy_type: '', card_text: 'Each player shuffles their hand …',
};
const basicFire = {
    name_en: 'Basic Fire Energy', name_de: 'Basis Feuer-Energie', set: 'SVE', number: '2',
    type: 'Basic Energy', energy_type: 'Fire', card_text: '',
};
const specialEnergy = {
    name_en: 'Jet Energy', name_de: 'Jet-Energie', set: 'PAL', number: '190',
    type: 'Special Energy', energy_type: 'Colorless', card_text: 'Switch with another Pokémon …',
};
const jpCard = {
    name_en: 'Eevee', name_de: '', set: 'M4', number: '54',
    type: 'Basic', energy_type: 'Colorless', card_text: '', is_japanese: true,
};


describe('ProfileDeckBuilder — card classification', () => {
    it('classifies a Basic Pokémon', () => {
        assert.equal(PDB.isPokemon(weedle), true);
        assert.equal(PDB.isBasicPokemon(weedle), true);
        assert.equal(PDB.isTrainer(weedle), false);
        assert.equal(PDB.isEnergy(weedle), false);
    });

    it('classifies a Stage 2 Pokémon (not Basic)', () => {
        assert.equal(PDB.isPokemon(charizard), true);
        assert.equal(PDB.isBasicPokemon(charizard), false);
    });

    it('classifies a Supporter as Trainer', () => {
        assert.equal(PDB.isTrainer(iono), true);
        assert.equal(PDB.isPokemon(iono), false);
        assert.equal(PDB.isEnergy(iono), false);
    });

    it('classifies basic + special energy', () => {
        assert.equal(PDB.isEnergy(basicFire), true);
        assert.equal(PDB.isBasicEnergy(basicFire), true);
        assert.equal(PDB.isEnergy(specialEnergy), true);
        assert.equal(PDB.isBasicEnergy(specialEnergy), false);
    });
});


describe('ProfileDeckBuilder — search matching', () => {
    it('matches the English name as substring', () => {
        assert.equal(PDB.matchesSearch(charizard, 'chari'), true);
    });

    it('matches the German name', () => {
        assert.equal(PDB.matchesSearch(charizard, 'glurak'), true);
        assert.equal(PDB.matchesSearch(weedle, 'hornliu'), true);
    });

    it('matches set code', () => {
        assert.equal(PDB.matchesSearch(charizard, 'OBF'), true);
        assert.equal(PDB.matchesSearch(charizard, 'obf'), true);
    });

    it('matches "SET-NUMBER" and "SET NUMBER"', () => {
        assert.equal(PDB.matchesSearch(charizard, 'OBF-125'), true);
        assert.equal(PDB.matchesSearch(charizard, 'OBF 125'), true);
        assert.equal(PDB.matchesSearch(charizard, 'OBF125'), true);
    });

    it('matches card text (ability search)', () => {
        assert.equal(PDB.matchesSearch(charizard, 'Burning Darkness'), true);
        assert.equal(PDB.matchesSearch(charizard, 'burning darkness'), true);
    });

    it('returns true on empty term (no filter)', () => {
        assert.equal(PDB.matchesSearch(weedle, ''), true);
        assert.equal(PDB.matchesSearch(weedle, '   '), true);
    });

    it('rejects mismatches', () => {
        assert.equal(PDB.matchesSearch(weedle, 'charizard'), false);
        assert.equal(PDB.matchesSearch(iono, 'shuffle '), true);   // card text hit
        assert.equal(PDB.matchesSearch(iono, 'totally absent string'), false);
    });
});


describe('ProfileDeckBuilder — passesFilters', () => {
    const empty = { type: new Set(), set: new Set(), energy: new Set(), rarity: new Set(), jpOnly: false };

    it('passes everything when no filter is set', () => {
        assert.equal(PDB.passesFilters(charizard, empty), true);
        assert.equal(PDB.passesFilters(iono, empty), true);
        assert.equal(PDB.passesFilters(basicFire, empty), true);
    });

    it('respects the type filter', () => {
        const f = { ...empty, type: new Set(['pokemon']) };
        assert.equal(PDB.passesFilters(charizard, f), true);
        assert.equal(PDB.passesFilters(iono, f), false);
        assert.equal(PDB.passesFilters(basicFire, f), false);
    });

    it('respects the JP-only filter', () => {
        const f = { ...empty, jpOnly: true };
        assert.equal(PDB.passesFilters(jpCard, f), true);
        assert.equal(PDB.passesFilters(charizard, f), false);
    });

    it('respects the set filter', () => {
        const f = { ...empty, set: new Set(['OBF']) };
        assert.equal(PDB.passesFilters(charizard, f), true);
        assert.equal(PDB.passesFilters(weedle, f), false);
    });

    it('respects the energy-type filter', () => {
        const f = { ...empty, energy: new Set(['Fire']) };
        assert.equal(PDB.passesFilters(charizard, f), true);
        assert.equal(PDB.passesFilters(weedle, f), false);
    });
});


describe('ProfileDeckBuilder — deck-list paste parser', () => {
    it('parses a clean 4-card Showdown block', () => {
        const text = `Pokémon: 7
4 Charizard ex OBF 125
3 Charmander DRM 4

Trainer: 33
4 Iono PAL 185

Energy: 10
8 Basic Fire Energy SVE 2`;
        const out = PDB.parseDeckList(text);
        assert.equal(out.entries.length, 4);
        assert.deepEqual(out.entries[0], { count: 4, name: 'Charizard ex', set: 'OBF', number: '125' });
        assert.deepEqual(out.entries[3], { count: 8, name: 'Basic Fire Energy', set: 'SVE', number: '2' });
        assert.equal(out.unknownLines.length, 0);
    });

    it('ignores section headers and blank lines', () => {
        const out = PDB.parseDeckList(`Pokémon: 6\n\nTotal Cards: 60\n\n`);
        assert.equal(out.entries.length, 0);
        assert.equal(out.unknownLines.length, 0);
    });

    it('falls back to name-only when set/number missing', () => {
        const out = PDB.parseDeckList(`4 Charizard ex\n3 Iono`);
        assert.equal(out.entries.length, 2);
        assert.equal(out.entries[0].set, '');
        assert.equal(out.entries[0].name, 'Charizard ex');
        assert.equal(out.entries[0].count, 4);
    });

    it('records lines that don\'t parse at all', () => {
        const out = PDB.parseDeckList(`weird non-quantity line`);
        assert.equal(out.entries.length, 0);
        assert.equal(out.unknownLines.length, 1);
    });
});


describe('ProfileDeckBuilder — mulligan probability', () => {
    it('computes the user\'s reference scenario (13 basics / 60 deck)', () => {
        // Spec: "Basic in hand: 83.7%, Mulligan: 16.3% (13 Basics / 60 cards)"
        const p = PDB.mulliganProbability(13, 60, 7);
        assert.ok(Math.abs(p.basicInHand - 0.8369) < 0.005,
            `basicInHand should be ~0.837, got ${p.basicInHand}`);
        assert.ok(Math.abs(p.mulligan - 0.1631) < 0.005,
            `mulligan should be ~0.163, got ${p.mulligan}`);
        // The two MUST sum to exactly 1.
        assert.ok(Math.abs((p.basicInHand + p.mulligan) - 1) < 1e-9);
    });

    it('1 basic in a 60-card deck → ~11.7% basic-in-hand', () => {
        const p = PDB.mulliganProbability(1, 60, 7);
        assert.ok(Math.abs(p.basicInHand - 7 / 60) < 1e-9);
    });

    it('all basics → no mulligan possible', () => {
        const p = PDB.mulliganProbability(60, 60, 7);
        assert.equal(p.basicInHand, 1);
        assert.equal(p.mulligan, 0);
    });

    it('zero basics → always mulligan', () => {
        const p = PDB.mulliganProbability(0, 60, 7);
        assert.equal(p.basicInHand, 0);
        assert.equal(p.mulligan, 1);
    });

    it('handles a non-60 deck size monotonically', () => {
        // As basics rise, basic-in-hand should never drop.
        let prev = 0;
        for (let k = 1; k <= 10; k++) {
            const p = PDB.mulliganProbability(k, 40, 7);
            assert.ok(p.basicInHand >= prev,
                `not monotonic at k=${k}: ${p.basicInHand} < ${prev}`);
            prev = p.basicInHand;
        }
    });
});


describe('ProfileDeckBuilder — deck counters', () => {
    it('counts total cards and basic Pokémon', () => {
        const deck = { cards: [
            { ...weedle, count: 4 },
            { ...charizard, count: 2 },
            { ...basicFire, count: 8 },
        ] };
        assert.equal(PDB.countCards(deck), 14);
        assert.equal(PDB.countBasics(deck), 4);  // only Weedle is a Basic Pokémon
    });

    it('handles empty deck cleanly', () => {
        assert.equal(PDB.countCards({ cards: [] }), 0);
        assert.equal(PDB.countBasics({ cards: [] }), 0);
    });
});


describe('ProfileDeckBuilder — card key', () => {
    it('combines set + number for de-duplication', () => {
        assert.equal(PDB.cardKey(charizard), 'OBF-125');
    });

    it('uppercases mixed-case input', () => {
        assert.equal(PDB.cardKey({ set: 'obf', number: '125' }), 'OBF-125');
    });
});
