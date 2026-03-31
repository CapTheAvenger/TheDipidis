/**
 * Property-based tests for deck normalization and deck builder limits.
 *
 * Focus:
 * - normalizeDeckEntries invariants and idempotence
 * - addCardToDeckBatch respecting copy limits / hard caps under repeated random adds
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadAppUtils } = require('./test-helpers');

function createRng(seed) {
    let x = seed >>> 0;
    return function rand() {
        x = (1664525 * x + 1013904223) >>> 0;
        return x / 0x100000000;
    };
}

function randInt(rand, min, max) {
    return Math.floor(rand() * (max - min + 1)) + min;
}

function pick(rand, arr) {
    return arr[randInt(rand, 0, arr.length - 1)];
}

function canonicalKey(name, set, number) {
    const n = String(name || '').trim();
    const s = String(set || '').trim().toUpperCase();
    const num = String(number || '').trim();
    return s && num ? `${n} (${s} ${num})` : n;
}

function makeRandomDeckEntry(rand) {
    const names = [
        'Pikachu',
        'Charizard ex',
        'Rare Candy',
        'Prime Catcher',
        'Radiant Greninja',
        'Fire Energy',
        'Iono',
    ];
    const sets = ['SVI', 'MEG', 'TEF', 'PAR', 'PAF', ''];
    const name = pick(rand, names);
    const set = pick(rand, sets);
    const number = String(randInt(rand, 1, 220)).padStart(randInt(rand, 1, 3), '0');
    const shape = randInt(rand, 0, 4);

    let key;
    if (shape === 0) key = canonicalKey(name, set, number);
    else if (shape === 1) key = `${name}  (${set || 'SVI'} ${number})`;
    else if (shape === 2) key = name;
    else if (shape === 3) key = `${name} (${set || 'SVI'} ${number})`;
    else key = `${name} (${(set || 'SVI').toLowerCase()} ${number})`;

    const countOptions = [-2, -1, 0, 1, 2, 3, 4, 5, 7, 10];
    return [key, pick(rand, countOptions)];
}

function createDeckEnv(overrides = {}) {
    const window = {
        cityLeagueDeck: {},
        cityLeagueDeckOrder: [],
        currentMetaDeck: {},
        currentMetaDeckOrder: [],
        pastMetaDeck: {},
        pastMetaDeckOrder: [],
        currentCityLeagueDeckCards: overrides.cityLeagueCards || [],
        currentCurrentMetaDeckCards: overrides.currentMetaCards || [],
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
        requestAnimationFrame: (fn) => fn(),
        cancelAnimationFrame: () => {},
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
        fixCardNameEncoding: (s) => String(s || ''),
        hasMojibake: () => false,
        normalizeCardName: (s) => String(s || '').toLowerCase().trim(),
        normalizeSetCode: (s) => s ? String(s).toUpperCase().trim() : '',
        normalizeCardNumber: (n) => n ? String(n).trim() : '',
        getCanonicalCardRecord: () => null,
        getDisplayCardName: (name) => String(name || ''),
        getCanonicalDeckKey: (name, set, num) => canonicalKey(name, set, num),
        getPreferredVersionForCard: (name, set, num) => set && num ? { set: String(set).toUpperCase(), number: String(num) } : null,
        getIndexedCardBySetNumber: overrides.getIndexedCardBySetNumber || (() => null),
        isAceSpec: (name) => {
            const n = String(name?.card_name || name?.name || name || '').toLowerCase().trim();
            return aceSpecsList.includes(n);
        },
        isBasicEnergyCardEntry: (card) => {
            if (!card) return false;
            const basicNames = [
                'grass energy', 'fire energy', 'water energy', 'lightning energy',
                'psychic energy', 'fighting energy', 'darkness energy', 'metal energy',
            ];
            const name = String(card.card_name || card.name || '').toLowerCase().trim();
            return basicNames.includes(name);
        },
        isBasicEnergy: (name) => {
            const basicNames = [
                'grass energy', 'fire energy', 'water energy', 'lightning energy',
                'psychic energy', 'fighting energy', 'darkness energy', 'metal energy',
            ];
            return basicNames.includes(String(name || '').toLowerCase().trim());
        },
        isRadiantPokemon: (name) => String(name || '').toLowerCase().startsWith('radiant '),
        getTotalAceSpecCopiesInDeck: (deck) => {
            let total = 0;
            for (const key of Object.keys(deck || {})) {
                const name = key.replace(/\s*\(.*\)$/, '').toLowerCase().trim();
                if (aceSpecsList.includes(name)) total += deck[key];
            }
            return total;
        },
        getTotalRadiantCopiesInDeck: (deck) => {
            let total = 0;
            for (const key of Object.keys(deck || {})) {
                const name = key.replace(/\s*\(.*\)$/, '').toLowerCase().trim();
                if (name.startsWith('radiant ')) total += deck[key];
            }
            return total;
        },
        setRarityPreference: () => {},
        getRarityPreference: () => null,
        getGlobalRarityPreference: () => 'min',
        saveRarityPreferences: () => {},
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
        getStrictBaseCardName: (n) => String(n || '').trim(),
        getLegalMaxCopies: () => 4,
        calculateCombinedVariantStats: () => ({ combinedShare: 0, combinedAvgWhenUsed: 0, recommendedCount: 2, baseName: '', legalMax: 4 }),
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
    };

    for (const key of Object.keys(sandbox)) {
        if (!(key in window)) window[key] = sandbox[key];
    }

    const src = fs.readFileSync(
        path.resolve(__dirname, '../../js/app-deck-builder.js'),
        'utf-8'
    );

    const ctx = vm.createContext(sandbox);
    try {
        vm.runInContext(src, ctx, { filename: 'app-deck-builder.js' });
    } catch {
        // top-level DOM/browser code may fail in test env; core fns remain usable
    }

    return {
        addCardToDeckBatch: sandbox.addCardToDeckBatch || sandbox.window.addCardToDeckBatch,
        getDeckTotalCards: sandbox.getDeckTotalCards || sandbox.window.getDeckTotalCards,
        _window: window,
    };
}

describe('property: normalizeDeckEntries invariants', () => {
    it('is idempotent and removes non-positive counts across random decks', () => {
        for (let seed = 1; seed <= 90; seed++) {
            const rand = createRng(seed);
            const fns = loadAppUtils({ getCanonicalCardRecord: () => null });
            const sandbox = fns._sandbox;
            const source = pick(rand, ['cityLeague', 'currentMeta', 'pastMeta']);
            const deckKey = source === 'cityLeague' ? 'cityLeagueDeck' : source === 'currentMeta' ? 'currentMetaDeck' : 'pastMetaDeck';
            const orderKey = source === 'cityLeague' ? 'cityLeagueDeckOrder' : source === 'currentMeta' ? 'currentMetaDeckOrder' : 'pastMetaDeckOrder';

            const entryCount = randInt(rand, 0, 40);
            const deck = {};
            const order = [];
            for (let i = 0; i < entryCount; i++) {
                const [key, count] = makeRandomDeckEntry(rand);
                deck[key] = count;
                if (rand() < 0.8) order.push(key);
            }

            sandbox.window[deckKey] = deck;
            sandbox.window[orderKey] = order;

            assert.doesNotThrow(() => fns.normalizeDeckEntries(source), `normalizeDeckEntries threw for seed=${seed}`);
            const onceDeck = JSON.parse(JSON.stringify(sandbox.window[deckKey]));
            const onceOrder = JSON.parse(JSON.stringify(sandbox.window[orderKey]));

            fns.normalizeDeckEntries(source);
            const twiceDeck = JSON.parse(JSON.stringify(sandbox.window[deckKey]));
            const twiceOrder = JSON.parse(JSON.stringify(sandbox.window[orderKey]));

            assert.deepEqual(twiceDeck, onceDeck, `Deck normalization must be idempotent for seed=${seed}`);
            assert.deepEqual(twiceOrder, onceOrder, `Deck order normalization must be idempotent for seed=${seed}`);

            for (const [key, count] of Object.entries(onceDeck)) {
                assert.ok(parseInt(count, 10) > 0, `Normalized deck must not retain non-positive counts for seed=${seed}`);
                assert.equal(typeof key, 'string');
                assert.ok(key.trim().length > 0);
            }

            const orderSet = new Set(onceOrder);
            for (const key of Object.keys(onceDeck)) {
                assert.ok(orderSet.has(key), `Every normalized deck key must appear in order for seed=${seed}`);
            }
        }
    });
});

describe('property: addCardToDeckBatch limits', () => {
    it('never violates regular, ace spec, radiant, or hard-cap rules under random repeated adds', () => {
        const operations = [
            { name: 'Pikachu', set: 'SVI', num: '025', type: 'regular' },
            { name: 'Charizard ex', set: 'MEG', num: '006', type: 'regular' },
            { name: 'Prime Catcher', set: 'TEF', num: '157', type: 'ace' },
            { name: 'Master Ball', set: 'PAL', num: '100', type: 'ace' },
            { name: 'Radiant Greninja', set: 'ASR', num: '046', type: 'radiant' },
            { name: 'Radiant Charizard', set: 'PGO', num: '011', type: 'radiant' },
            { name: 'Fire Energy', set: 'SVE', num: '018', type: 'basic' },
        ];

        for (let seed = 101; seed <= 180; seed++) {
            const rand = createRng(seed);
            const env = createDeckEnv();
            const adds = randInt(rand, 20, 140);

            for (let i = 0; i < adds; i++) {
                const op = pick(rand, operations);
                assert.doesNotThrow(() => {
                    env.addCardToDeckBatch('cityLeague', op.name, op.set, op.num);
                }, `addCardToDeckBatch threw for seed=${seed}`);
            }

            const deck = env._window.cityLeagueDeck;
            const total = env.getDeckTotalCards(deck);
            assert.ok(total <= 70, `Deck total must never exceed 70 for seed=${seed}, got ${total}`);

            let aceTotal = 0;
            let radiantTotal = 0;
            for (const [key, countRaw] of Object.entries(deck)) {
                const count = parseInt(countRaw, 10) || 0;
                const name = key.replace(/\s*\([A-Z0-9-]+\s+[A-Z0-9-]+\)$/, '').trim();
                const lower = name.toLowerCase();

                if (lower === 'fire energy') {
                    assert.ok(count >= 0, `Basic energy count must stay non-negative for seed=${seed}`);
                    continue;
                }

                if (lower === 'prime catcher' || lower === 'master ball') {
                    aceTotal += count;
                    assert.ok(count <= 1, `Single Ace Spec entry must not exceed 1 for seed=${seed}`);
                    continue;
                }

                if (lower.startsWith('radiant ')) {
                    radiantTotal += count;
                    assert.ok(count <= 1, `Single Radiant entry must not exceed 1 for seed=${seed}`);
                    continue;
                }

                assert.ok(count <= 4, `Regular card copies must not exceed 4 for seed=${seed}`);
            }

            assert.ok(aceTotal <= 1, `Deck-wide Ace Spec limit must hold for seed=${seed}`);
            assert.ok(radiantTotal <= 1, `Deck-wide Radiant limit must hold for seed=${seed}`);
        }
    });
});
