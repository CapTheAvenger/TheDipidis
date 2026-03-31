/**
 * Unit tests for isAceSpec + removeCardFromDeck (P2 #16, P3 #18)
 *
 * isAceSpec() is a classifier that determines whether a card is an
 * Ace Spec. A false-negative means the 1-copy limit is not enforced
 * → illegal deck. A false-positive blocks adding a valid 4-of card.
 *
 * removeCardFromDeck() manages card removal including key normalization
 * (finding "Charizard ex (MEW 006)" when passed "Charizard ex").
 *
 * Run:  node --test tests/unit/test-isAceSpec-removeCard.js
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ── Re-use deck-builder loader pattern ──
function createEnv(overrides = {}) {
    const window = {
        cityLeagueDeck: {},
        cityLeagueDeckOrder: [],
        currentCityLeagueArchetype: null,
        currentMetaDeck: {},
        currentMetaDeckOrder: [],
        currentCurrentMetaArchetype: null,
        pastMetaDeck: {},
        pastMetaDeckOrder: [],
        pastMetaCurrentArchetype: null,
        currentCityLeagueDeckCards: [],
        currentCurrentMetaDeckCards: [],
        setOrderMap: {},
        cardsBySetNumberMap: {},
        englishSetCodes: new Set(),
    };

    const aceSpecsList = overrides.aceSpecsList || [
        'prime catcher', "hero's cape", 'maximum belt', 'master ball',
        'grand tree', 'neo upper energy', 'secret box', 'unfair stamp',
        'legacy energy', 'deluxe bomb', 'reboot pod', 'enriching energy',
        'gorgeous cape', 'awakening drum', 'brilliant blender', 'survival brace',
    ];

    const saveCalls = [];

    const sandbox = {
        window,
        document: {
            getElementById: () => null,
            querySelector: () => null,
            querySelectorAll: () => [],
            createElement: () => ({ innerHTML: '', className: '', id: '', style: {}, appendChild() {}, addEventListener() {} }),
            addEventListener: () => {},
        },
        localStorage: {
            _store: {},
            getItem(k) { return this._store[k] ?? null; },
            setItem(k, v) { this._store[k] = String(v); },
            removeItem(k) { delete this._store[k]; },
        },
        console,
        setTimeout: (fn) => fn(),
        clearTimeout: () => {},
        confirm: () => false,
        Map, Set, Array, Object, String, Number, JSON, Math,
        parseInt, parseFloat, isNaN, decodeURIComponent, eval,
        devLog: () => {},
        debugVersionSelectionLog: () => {},
        showToast: () => {},
        showNotification: () => {},
        t: (key) => key,
        escapeHtml: (s) => String(s),
        escapeHtmlAttr: (s) => String(s),
        fixMojibake: (s) => String(s || ''),
        hasMojibake: () => false,
        normalizeCardName: (s) => String(s || '').toLowerCase().trim(),
        normalizeSetCode: (s) => s ? String(s).toUpperCase().trim() : '',
        normalizeCardNumber: (n) => n ? String(n).trim() : '',
        getCanonicalDeckKey: (name, set, num) => {
            const n = String(name || '').trim();
            const s = String(set || '').toUpperCase().trim();
            const num2 = String(num || '').trim();
            return s && num2 ? `${n} (${s} ${num2})` : n;
        },
        getCanonicalCardRecord: () => null,
        getDisplayCardName: (n) => String(n || ''),
        getPreferredVersionForCard: () => null,
        getIndexedCardBySetNumber: () => null,
        isAceSpec: (name) => {
            const n = String(name?.card_name || name?.name || name || '').toLowerCase().trim();
            return aceSpecsList.includes(n);
        },
        isBasicEnergyCardEntry: () => false,
        isBasicEnergy: () => false,
        isBasicEnergyName: () => false,
        isRadiantPokemon: () => false,
        getTotalAceSpecCopiesInDeck: (deck) => {
            let total = 0;
            for (const key of Object.keys(deck || {})) {
                const name = key.replace(/\s*\(.*\)$/, '').toLowerCase().trim();
                if (aceSpecsList.includes(name)) total += deck[key];
            }
            return total;
        },
        getTotalRadiantCopiesInDeck: () => 0,
        setRarityPreference: () => {},
        getRarityPreference: () => null,
        getGlobalRarityPreference: () => 'min',
        globalRarityPreference: 'min',
        pastMetaFilteredCards: [],
        updateDeckDisplay: () => {},
        saveCityLeagueDeck: () => { saveCalls.push('cityLeague'); },
        saveCurrentMetaDeck: () => { saveCalls.push('currentMeta'); },
        savePastMetaDeck: () => { saveCalls.push('pastMeta'); },
        scheduleDeckDisplayUpdate: () => {},
        scheduleDeckDependentRefresh: () => {},
        showDeckShareToast: () => {},
        internationalPrintsCache: new Map(),
        preferredVersionCache: new Map(),
        getStrictBaseCardName: (n) => String(n || '').trim(),
        getLegalMaxCopies: () => 4,
        calculateCombinedVariantStats: () => ({
            combinedShare: 0, combinedAvgWhenUsed: 0, recommendedCount: 2, baseName: '', legalMax: 4,
        }),
        getOpeningHandProbability: () => 0,
        sanitizeDeckDependencies: (c) => c,
        normalizeDeckEntries: (d) => d || [],
        sortDeckByCategory: () => [],
        getCardCategoryForSort: () => 'other',
        formatAverageValueForUi: () => '',
        buildInlineCardPlaceholder: () => '',
        getCardImageSource: () => '',
        renderOverviewCards: () => {},
        renderMyDeckGrid: () => {},
        filterDeckGrid: () => {},
        generateDeckGrid: () => {},
        requestAnimationFrame: (fn) => fn(),
        cancelAnimationFrame: () => {},
    };

    for (const key of Object.keys(sandbox)) {
        if (!(key in window)) window[key] = sandbox[key];
    }

    const src = fs.readFileSync(
        path.resolve(__dirname, '../../js/app-deck-builder.js'),
        'utf-8'
    );

    const ctx = vm.createContext(sandbox);
    try { vm.runInContext(src, ctx, { filename: 'app-deck-builder.js' }); } catch (_) {}

    // Override updateDeckDisplay AFTER loading (to replace the real implementation
    // which has deep DOM dependencies we don't want to stub)
    sandbox.updateDeckDisplay = () => {};
    sandbox.window.updateDeckDisplay = () => {};

    const exported = {};
    const fnNames = [
        'addCardToDeckBatch', 'addCardToDeck', 'removeCardFromDeck',
        'getDeckRefBySource', 'getDeckTotalCards',
    ];
    for (const fn of fnNames) {
        if (typeof sandbox[fn] === 'function') exported[fn] = sandbox[fn];
        else if (typeof sandbox.window[fn] === 'function') exported[fn] = sandbox.window[fn];
    }
    exported._sandbox = sandbox;
    exported._window = window;
    exported._saveCalls = saveCalls;
    exported._aceSpecsList = aceSpecsList;
    return exported;
}

// ═══════════════════════════════════════════════════════════
// isAceSpec (tested via deck builder integration)
// ═══════════════════════════════════════════════════════════

describe('isAceSpec — classifier correctness', () => {
    it('recognizes known Ace Spec cards (lowercase)', () => {
        const env = createEnv();
        const knownAceSpecs = [
            'Prime Catcher', "Hero's Cape", 'Maximum Belt', 'Master Ball',
            'Grand Tree', 'Neo Upper Energy', 'Secret Box', 'Unfair Stamp',
            'Legacy Energy', 'Deluxe Bomb', 'Reboot Pod', 'Enriching Energy',
        ];

        for (const name of knownAceSpecs) {
            // addCardToDeckBatch enforces 1-copy limit on Ace Specs
            const env2 = createEnv();
            const w = env2._window;
            w.currentCityLeagueDeckCards = [{ card_name: name }];

            // First copy should succeed
            const r1 = env2.addCardToDeckBatch('cityLeague', name, '', '');
            assert.equal(r1, true, `First copy of Ace Spec "${name}" should succeed`);

            // Second copy should fail (1-copy limit)
            const r2 = env2.addCardToDeckBatch('cityLeague', name, '', '');
            assert.equal(r2, false, `Second copy of Ace Spec "${name}" should be blocked`);

            assert.equal(w.cityLeagueDeck[name], 1, `Deck should have exactly 1 copy of "${name}"`);
        }
    });

    it('does NOT classify normal Pokemon as Ace Spec', () => {
        const env = createEnv();
        const w = env._window;
        w.currentCityLeagueDeckCards = [{ card_name: 'Charizard ex' }];

        // Should allow 4 copies (not 1)
        for (let i = 0; i < 4; i++) {
            env.addCardToDeckBatch('cityLeague', 'Charizard ex', '', '');
        }
        assert.equal(w.cityLeagueDeck['Charizard ex'], 4);
    });

    it('does NOT classify Trainer cards as Ace Spec', () => {
        const env = createEnv();
        const w = env._window;
        w.currentCityLeagueDeckCards = [{ card_name: 'Boss\'s Orders' }];

        for (let i = 0; i < 4; i++) {
            env.addCardToDeckBatch('cityLeague', 'Boss\'s Orders', '', '');
        }
        assert.equal(w.cityLeagueDeck['Boss\'s Orders'], 4);
    });

    it('handles string input', () => {
        const env = createEnv();
        assert.equal(env._sandbox.isAceSpec('Prime Catcher'), true);
        assert.equal(env._sandbox.isAceSpec('prime catcher'), true);
        assert.equal(env._sandbox.isAceSpec('PRIME CATCHER'), true);
    });

    it('handles card object input', () => {
        const env = createEnv();
        assert.equal(env._sandbox.isAceSpec({ card_name: 'Master Ball' }), true);
        assert.equal(env._sandbox.isAceSpec({ name: 'Maximum Belt' }), true);
    });

    it('handles empty/null input', () => {
        const env = createEnv();
        assert.equal(env._sandbox.isAceSpec(''), false);
        assert.equal(env._sandbox.isAceSpec(null), false);
        assert.equal(env._sandbox.isAceSpec(undefined), false);
    });

    it('blocks deck-wide Ace Spec limit (only 1 Ace Spec total)', () => {
        const env = createEnv();
        const w = env._window;
        w.currentCityLeagueDeckCards = [
            { card_name: 'Prime Catcher' },
            { card_name: 'Master Ball' },
        ];

        // Add first Ace Spec
        const r1 = env.addCardToDeckBatch('cityLeague', 'Prime Catcher', '', '');
        assert.equal(r1, true);

        // Adding a DIFFERENT Ace Spec should fail (deck-wide 1 Ace Spec limit)
        const r2 = env.addCardToDeckBatch('cityLeague', 'Master Ball', '', '');
        assert.equal(r2, false, 'Second different Ace Spec should be blocked');
    });
});

// ═══════════════════════════════════════════════════════════
// removeCardFromDeck
// ═══════════════════════════════════════════════════════════

describe('removeCardFromDeck — basic removal', () => {
    it('decrements card count by 1', () => {
        const env = createEnv();
        const w = env._window;
        w.cityLeagueDeck = { 'Charizard ex (MEW 006)': 3 };
        w.cityLeagueDeckOrder = ['Charizard ex (MEW 006)'];

        env.removeCardFromDeck('cityLeague', 'Charizard ex (MEW 006)');
        assert.equal(w.cityLeagueDeck['Charizard ex (MEW 006)'], 2);
    });

    it('deletes key and removes from order when count reaches 0', () => {
        const env = createEnv();
        const w = env._window;
        w.cityLeagueDeck = { 'Nest Ball': 1 };
        w.cityLeagueDeckOrder = ['Nest Ball'];

        env.removeCardFromDeck('cityLeague', 'Nest Ball');
        assert.equal(w.cityLeagueDeck['Nest Ball'], undefined);
        assert.equal(JSON.parse(JSON.stringify(w.cityLeagueDeckOrder)).length, 0);
    });

    it('triggers save for cityLeague source', () => {
        const env = createEnv();
        const w = env._window;
        w.cityLeagueDeck = { 'Arven': 2 };
        w.cityLeagueDeckOrder = ['Arven'];
        env._saveCalls.length = 0;

        env.removeCardFromDeck('cityLeague', 'Arven');
        assert.ok(env._saveCalls.includes('cityLeague'));
    });

    it('triggers save for currentMeta source', () => {
        const env = createEnv();
        const w = env._window;
        w.currentMetaDeck = { 'Iono': 3 };
        w.currentMetaDeckOrder = ['Iono'];
        env._saveCalls.length = 0;

        env.removeCardFromDeck('currentMeta', 'Iono');
        assert.ok(env._saveCalls.includes('currentMeta'));
    });

    it('does nothing for invalid source', () => {
        const env = createEnv();
        env.removeCardFromDeck('invalid', 'Charizard');
        // No crash
    });
});

describe('removeCardFromDeck — key normalization fallback', () => {
    it('finds "CardName (SET NUM)" when only "CardName" is passed', () => {
        const env = createEnv();
        const w = env._window;
        w.cityLeagueDeck = { 'Charizard ex (MEW 006)': 2 };
        w.cityLeagueDeckOrder = ['Charizard ex (MEW 006)'];

        env.removeCardFromDeck('cityLeague', 'Charizard ex');
        assert.equal(w.cityLeagueDeck['Charizard ex (MEW 006)'], 1);
    });

    it('does nothing when neither exact nor prefix key matches', () => {
        const env = createEnv();
        const w = env._window;
        w.cityLeagueDeck = { 'Arven (PAL 186)': 2 };
        w.cityLeagueDeckOrder = ['Arven (PAL 186)'];

        env.removeCardFromDeck('cityLeague', 'Iono');
        // Deck should be unchanged
        assert.equal(w.cityLeagueDeck['Arven (PAL 186)'], 2);
    });
});
