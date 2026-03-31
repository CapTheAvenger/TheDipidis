/**
 * Unit tests for Deck Builder functions (Phase 2)
 *
 * Tests: addCardToDeckBatch, normalizeGeneratedDeckTo60, getDeckTotalCards
 *
 * These functions manage the deck state object. They're the core of deck
 * building — bugs here silently create invalid decks (< 60 cards, wrong
 * counts, bypassed limits).
 *
 * Run:  node --test tests/unit/test-deckBuilder.js
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ── Load deck-builder functions into a controllable sandbox ──
function createDeckEnv(overrides = {}) {
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
        currentCityLeagueDeckCards: overrides.cityLeagueCards || [],
        currentCurrentMetaDeckCards: overrides.currentMetaCards || [],
        setOrderMap: {},
        cardsBySetNumberMap: overrides.cardsBySetNumberMap || {},
        englishSetCodes: new Set(),
        ...overrides.windowOverrides,
    };

    const aceSpecsList = [
        'prime catcher', "hero's cape", 'maximum belt', 'master ball',
        'grand tree', 'neo upper energy', 'secret box', 'unfair stamp',
    ];

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
        // Stubs for functions from app-utils.js / app-core.js
        devLog: () => {},
        debugVersionSelectionLog: () => {},
        showToast: () => {},
        showNotification: () => {},
        t: (key) => key,
        escapeHtml: (s) => String(s),
        escapeHtmlAttr: (s) => String(s),
        fixMojibake: overrides.fixMojibake || ((s) => String(s || '')),
        hasMojibake: () => false,
        normalizeCardName: overrides.normalizeCardName || ((s) => String(s || '').toLowerCase().trim()),
        normalizeSetCode: overrides.normalizeSetCode || ((s) => s ? String(s).toUpperCase().trim() : ''),
        normalizeCardNumber: overrides.normalizeCardNumber || ((n) => n ? String(n).trim() : ''),
        getCanonicalCardRecord: overrides.getCanonicalCardRecord || (() => null),
        getDisplayCardName: overrides.getDisplayCardName || ((name) => String(name || '')),
        getCanonicalDeckKey: overrides.getCanonicalDeckKey || ((name, set, num) => {
            const n = String(name || '').trim();
            const s = String(set || '').toUpperCase().trim();
            const num2 = String(num || '').trim();
            return s && num2 ? `${n} (${s} ${num2})` : n;
        }),
        getPreferredVersionForCard: overrides.getPreferredVersionForCard || ((name, set, num) => {
            return set && num ? { set: String(set).toUpperCase(), number: String(num) } : null;
        }),
        getIndexedCardBySetNumber: overrides.getIndexedCardBySetNumber || (() => null),
        isAceSpec: overrides.isAceSpec || ((name) => {
            const n = String(name?.card_name || name?.name || name || '').toLowerCase().trim();
            return aceSpecsList.includes(n);
        }),
        isBasicEnergyCardEntry: overrides.isBasicEnergyCardEntry || ((card) => {
            if (!card) return false;
            const basicNames = [
                'grass energy', 'fire energy', 'water energy', 'lightning energy',
                'psychic energy', 'fighting energy', 'darkness energy', 'metal energy',
            ];
            const name = String(card.card_name || card.name || '').toLowerCase().trim();
            return basicNames.includes(name);
        }),
        isBasicEnergy: overrides.isBasicEnergy || ((name) => {
            const basicNames = [
                'grass energy', 'fire energy', 'water energy', 'lightning energy',
                'psychic energy', 'fighting energy', 'darkness energy', 'metal energy',
            ];
            return basicNames.includes(String(name || '').toLowerCase().trim());
        }),
        isBasicEnergyName: overrides.isBasicEnergyName || ((name) => {
            const basicNames = [
                'grass energy', 'fire energy', 'water energy', 'lightning energy',
                'psychic energy', 'fighting energy', 'darkness energy', 'metal energy',
            ];
            return basicNames.includes(String(name || '').toLowerCase().trim());
        }),
        isRadiantPokemon: overrides.isRadiantPokemon || ((name) => {
            return String(name || '').toLowerCase().startsWith('radiant ');
        }),
        getTotalAceSpecCopiesInDeck: overrides.getTotalAceSpecCopiesInDeck || ((deck) => {
            let total = 0;
            for (const key of Object.keys(deck || {})) {
                const name = key.replace(/\s*\(.*\)$/, '').toLowerCase().trim();
                if (aceSpecsList.includes(name)) total += deck[key];
            }
            return total;
        }),
        getTotalRadiantCopiesInDeck: overrides.getTotalRadiantCopiesInDeck || ((deck) => {
            let total = 0;
            for (const key of Object.keys(deck || {})) {
                const name = key.replace(/\s*\(.*\)$/, '').toLowerCase().trim();
                if (name.startsWith('radiant ')) total += deck[key];
            }
            return total;
        }),
        setRarityPreference: overrides.setRarityPreference || (() => {}),
        getRarityPreference: overrides.getRarityPreference || (() => null),
        getGlobalRarityPreference: overrides.getGlobalRarityPreference || (() => 'min'),
        globalRarityPreference: 'min',
        pastMetaFilteredCards: overrides.pastMetaCards || [],
        updateDeckDisplay: () => {},
        saveCityLeagueDeck: () => {},
        saveCurrentMetaDeck: () => {},
        savePastMetaDeck: () => {},
        scheduleDeckDisplayUpdate: () => {},
        scheduleDeckDependentRefresh: () => {},
        showDeckShareToast: () => {},
        importDeckFromUrl: () => {},
        internationalPrintsCache: new Map(),
        preferredVersionCache: new Map(),
        getStrictBaseCardName: overrides.getStrictBaseCardName || ((n) => String(n || '').replace(/\s+ex$/i, ' ex').trim()),
        getLegalMaxCopies: overrides.getLegalMaxCopies || (() => 4),
        calculateCombinedVariantStats: overrides.calculateCombinedVariantStats || (() => ({
            combinedShare: 0, combinedAvgWhenUsed: 0, recommendedCount: 2, baseName: '', legalMax: 4,
        })),
        getOpeningHandProbability: () => 0,
        sanitizeDeckDependencies: () => {},
        renderOverviewCards: () => {},
        renderMyDeckGrid: () => {},
        filterDeckGrid: () => {},
        generateDeckGrid: () => {},
    };

    // Mirror to window
    for (const key of Object.keys(sandbox)) {
        if (!(key in window)) window[key] = sandbox[key];
    }

    // Load only the functions we need — strip the autosave IIFE and DOM event listeners
    let src = fs.readFileSync(
        path.resolve(__dirname, '../../js/app-deck-builder.js'),
        'utf-8'
    );

    const ctx = vm.createContext(sandbox);

    try {
        vm.runInContext(src, ctx, { filename: 'app-deck-builder.js' });
    } catch (e) {
        // Deck builder has top-level code that may fail in test env — that's OK
        // as long as the functions are defined
    }

    // Collect exported functions
    const exported = {};
    const fnNames = [
        'addCardToDeckBatch', 'normalizeGeneratedDeckTo60', 'addCardToDeck',
        'getDeckRefBySource', 'getDeckTotalCards', 'isBasicEnergyName',
        'removeCardFromDeck', 'clearDeck', 'copyDeck', 'autoComplete',
    ];
    for (const fn of fnNames) {
        if (typeof sandbox[fn] === 'function') exported[fn] = sandbox[fn];
        else if (typeof sandbox.window[fn] === 'function') exported[fn] = sandbox.window[fn];
    }
    exported._sandbox = sandbox;
    exported._window = window;
    return exported;
}

// ═══════════════════════════════════════════════════════════
// addCardToDeckBatch
// ═══════════════════════════════════════════════════════════
describe('addCardToDeckBatch — basic add', () => {
    it('adds a card to an empty cityLeague deck', () => {
        const env = createDeckEnv();
        const result = env.addCardToDeckBatch('cityLeague', 'Pikachu', 'SVI', '25');
        assert.equal(result, true);
        assert.equal(env._window.cityLeagueDeck['Pikachu (SVI 25)'], 1);
    });

    it('increments count on repeated adds', () => {
        const env = createDeckEnv();
        env.addCardToDeckBatch('cityLeague', 'Pikachu', 'SVI', '25');
        env.addCardToDeckBatch('cityLeague', 'Pikachu', 'SVI', '25');
        env.addCardToDeckBatch('cityLeague', 'Pikachu', 'SVI', '25');
        assert.equal(env._window.cityLeagueDeck['Pikachu (SVI 25)'], 3);
    });

    it('returns false for invalid source', () => {
        const env = createDeckEnv();
        const result = env.addCardToDeckBatch('invalid', 'Pikachu', 'SVI', '25');
        assert.equal(result, false);
    });

    it('tracks insertion order in deckOrder array', () => {
        const env = createDeckEnv();
        env.addCardToDeckBatch('cityLeague', 'Pikachu', 'SVI', '25');
        env.addCardToDeckBatch('cityLeague', 'Charizard', 'OBF', '10');
        const order = Array.from(env._window.cityLeagueDeckOrder);
        assert.deepStrictEqual(order, [
            'Pikachu (SVI 25)',
            'Charizard (OBF 10)',
        ]);
    });

    it('works with currentMeta source', () => {
        const env = createDeckEnv();
        const result = env.addCardToDeckBatch('currentMeta', 'Mew', 'MEW', '1');
        assert.equal(result, true);
        assert.equal(env._window.currentMetaDeck['Mew (MEW 1)'], 1);
    });

    it('works with pastMeta source', () => {
        const env = createDeckEnv();
        const result = env.addCardToDeckBatch('pastMeta', 'Mew', 'MEW', '1');
        assert.equal(result, true);
        assert.equal(env._window.pastMetaDeck['Mew (MEW 1)'], 1);
    });
});

describe('addCardToDeckBatch — 4-copy limit', () => {
    it('blocks 5th copy of a regular card', () => {
        const env = createDeckEnv();
        for (let i = 0; i < 4; i++) {
            assert.equal(env.addCardToDeckBatch('cityLeague', 'Pikachu', 'SVI', '25'), true);
        }
        const fifth = env.addCardToDeckBatch('cityLeague', 'Pikachu', 'SVI', '25');
        assert.equal(fifth, false);
        assert.equal(env._window.cityLeagueDeck['Pikachu (SVI 25)'], 4);
    });

    it('allows unlimited Basic Energy', () => {
        const env = createDeckEnv();
        for (let i = 0; i < 10; i++) {
            assert.equal(env.addCardToDeckBatch('cityLeague', 'Fire Energy', 'SVE', '18'), true);
        }
        assert.equal(env._window.cityLeagueDeck['Fire Energy (SVE 18)'], 10);
    });
});

describe('addCardToDeckBatch — Ace Spec limit', () => {
    it('allows exactly 1 Ace Spec card', () => {
        const env = createDeckEnv();
        const first = env.addCardToDeckBatch('cityLeague', 'Prime Catcher', 'TEF', '157');
        assert.equal(first, true);
        const second = env.addCardToDeckBatch('cityLeague', 'Prime Catcher', 'TEF', '157');
        assert.equal(second, false);
    });

    it('blocks second different Ace Spec in same deck', () => {
        const env = createDeckEnv();
        env.addCardToDeckBatch('cityLeague', 'Prime Catcher', 'TEF', '157');
        const second = env.addCardToDeckBatch('cityLeague', 'Master Ball', 'PAL', '100');
        assert.equal(second, false);
    });
});

describe('addCardToDeckBatch — Radiant limit', () => {
    it('allows exactly 1 Radiant Pokémon', () => {
        const env = createDeckEnv();
        const first = env.addCardToDeckBatch('cityLeague', 'Radiant Charizard', 'PGO', '11');
        assert.equal(first, true);
        const second = env.addCardToDeckBatch('cityLeague', 'Radiant Charizard', 'PGO', '11');
        assert.equal(second, false);
    });

    it('blocks second different Radiant in same deck', () => {
        const env = createDeckEnv();
        env.addCardToDeckBatch('cityLeague', 'Radiant Charizard', 'PGO', '11');
        const second = env.addCardToDeckBatch('cityLeague', 'Radiant Greninja', 'ASR', '46');
        assert.equal(second, false);
    });
});

describe('addCardToDeckBatch — 70-card hard cap', () => {
    it('returns false when deck has 70 cards', () => {
        const env = createDeckEnv();
        // Fill deck to 70 with basic energy
        for (let i = 0; i < 70; i++) {
            env.addCardToDeckBatch('cityLeague', 'Fire Energy', 'SVE', '18');
        }
        const result = env.addCardToDeckBatch('cityLeague', 'Pikachu', 'SVI', '25');
        assert.equal(result, false);
    });
});

describe('addCardToDeckBatch — key migration', () => {
    it('migrates old name-only key to name + set/number key', () => {
        const env = createDeckEnv();
        // Pre-populate with an old-style key (no set info)
        env._window.cityLeagueDeck['Pikachu'] = 2;
        env._window.cityLeagueDeckOrder.push('Pikachu');

        // Now add with set info — should migrate
        const result = env.addCardToDeckBatch('cityLeague', 'Pikachu', 'SVI', '25');
        assert.equal(result, true);
        // Old key should be gone
        assert.equal(env._window.cityLeagueDeck['Pikachu'], undefined);
        // New key should have count = old + 1
        assert.equal(env._window.cityLeagueDeck['Pikachu (SVI 25)'], 3);
        // Order should be updated
        assert.ok(env._window.cityLeagueDeckOrder.includes('Pikachu (SVI 25)'));
        assert.ok(!env._window.cityLeagueDeckOrder.includes('Pikachu'));
    });
});

// ═══════════════════════════════════════════════════════════
// normalizeGeneratedDeckTo60
// ═══════════════════════════════════════════════════════════
describe('normalizeGeneratedDeckTo60 — basic behavior', () => {
    it('fills deck to 60 using planned cards', () => {
        const env = createDeckEnv();
        const planned = [];
        // Create 15 distinct cards with high share — each allows 4 copies = 60  cards
        for (let i = 0; i < 15; i++) {
            planned.push({
                card_name: `Card ${i}`,
                set_code: 'SVI',
                set_number: String(i),
                sharePercent: '80',
            });
        }
        const total = env.normalizeGeneratedDeckTo60('cityLeague', planned, []);
        assert.equal(total, 60);
    });

    it('returns 0 for invalid source', () => {
        const env = createDeckEnv();
        const total = env.normalizeGeneratedDeckTo60('invalid', [], []);
        assert.equal(total, 0);
    });

    it('returns current total when deck already >= 60', () => {
        const env = createDeckEnv();
        // Pre-fill deck to 60
        env._window.cityLeagueDeck['Fire Energy (SVE 18)'] = 60;
        const total = env.normalizeGeneratedDeckTo60('cityLeague', [], []);
        assert.equal(total, 60);
    });

    it('stops at guard limit (180 iterations) to prevent infinite loops', () => {
        // Provide only limited cards that max out before 60
        const env = createDeckEnv();
        const planned = [
            { card_name: 'OnlyCard', set_code: 'SVI', set_number: '1', sharePercent: '100' },
        ];
        const total = env.normalizeGeneratedDeckTo60('cityLeague', planned, []);
        // OnlyCard: max 4 copies. Then no more candidates → loop breaks.
        assert.equal(total, 4);
        assert.ok(total < 60, 'Should not reach 60 with only 1 non-energy card');
    });
});

describe('normalizeGeneratedDeckTo60 — energy fallback', () => {
    it('uses basic energy as fallback when regular cards are blocked', () => {
        const env = createDeckEnv();
        // Pre-fill with 56 regular energy
        env._window.cityLeagueDeck['Fire Energy (SVE 18)'] = 56;
        env._window.cityLeagueDeckOrder.push('Fire Energy (SVE 18)');

        const planned = [
            // One regular card (will get 4 copies to reach 60)
            { card_name: 'Pikachu', set_code: 'SVI', set_number: '25', sharePercent: '80' },
            { card_name: 'Fire Energy', set_code: 'SVE', set_number: '18', sharePercent: '50' },
        ];
        const total = env.normalizeGeneratedDeckTo60('cityLeague', planned, []);
        assert.equal(total, 60);
    });
});

describe('normalizeGeneratedDeckTo60 — uses fallback cards', () => {
    it('uses fallbackCards when plannedCards are exhausted', () => {
        const env = createDeckEnv();
        // Only 1 planned card (4 copies max)
        const planned = [
            { card_name: 'Card1', set_code: 'SVI', set_number: '1', sharePercent: '100' },
        ];
        // Fallback with energy to fill remaining
        const fallback = [
            { card_name: 'Water Energy', set_code: 'SVE', set_number: '19', sharePercent: '50' },
        ];
        const total = env.normalizeGeneratedDeckTo60('cityLeague', planned, fallback);
        assert.equal(total, 60);
        // Card1 should have 4, Water Energy fills rest
        assert.equal(env._window.cityLeagueDeck['Card1 (SVI 1)'], 4);
        assert.equal(env._window.cityLeagueDeck['Water Energy (SVE 19)'], 56);
    });
});

// ═══════════════════════════════════════════════════════════
// getDeckTotalCards
// ═══════════════════════════════════════════════════════════
describe('getDeckTotalCards', () => {
    it('sums all card counts', () => {
        const env = createDeckEnv();
        const total = env.getDeckTotalCards({ 'Pikachu': 4, 'Charizard': 3, 'Energy': 10 });
        assert.equal(total, 17);
    });

    it('handles empty deck', () => {
        const env = createDeckEnv();
        assert.equal(env.getDeckTotalCards({}), 0);
    });

    it('handles null/undefined deck', () => {
        const env = createDeckEnv();
        assert.equal(env.getDeckTotalCards(null), 0);
        assert.equal(env.getDeckTotalCards(undefined), 0);
    });
});

// ═══════════════════════════════════════════════════════════
// isBasicEnergyName
// ═══════════════════════════════════════════════════════════
describe('isBasicEnergyName', () => {
    it('recognizes all 8 basic energy types', () => {
        const env = createDeckEnv();
        const energies = [
            'Grass Energy', 'Fire Energy', 'Water Energy', 'Lightning Energy',
            'Psychic Energy', 'Fighting Energy', 'Darkness Energy', 'Metal Energy',
        ];
        for (const e of energies) {
            assert.equal(env.isBasicEnergyName(e), true, `${e} should be basic energy`);
        }
    });

    it('rejects special energy', () => {
        const env = createDeckEnv();
        assert.equal(env.isBasicEnergyName('Double Turbo Energy'), false);
        assert.equal(env.isBasicEnergyName('Jet Energy'), false);
        assert.equal(env.isBasicEnergyName('Neo Upper Energy'), false);
    });

    it('is case-insensitive', () => {
        const env = createDeckEnv();
        assert.equal(env.isBasicEnergyName('FIRE ENERGY'), true);
        assert.equal(env.isBasicEnergyName('fire energy'), true);
    });

    it('handles null/undefined', () => {
        const env = createDeckEnv();
        assert.equal(env.isBasicEnergyName(null), false);
        assert.equal(env.isBasicEnergyName(undefined), false);
        assert.equal(env.isBasicEnergyName(''), false);
    });
});
