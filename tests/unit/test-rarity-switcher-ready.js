/**
 * Unit tests for rarity-switcher readiness guard.
 *
 * Verifies that ensureCardDatabaseReadyForRaritySwitcher() handles
 * lazy/async card DB loading without failing the rarity switcher.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadRaritySwitcherReadyFns(overrides = {}) {
    const src = fs.readFileSync(
        path.resolve(__dirname, '../../js/app-cards-db.js'),
        'utf-8'
    );

    const windowObj = {
        addEventListener: () => {},
        allCardsDatabase: undefined,
        ...overrides.window,
    };

    const documentObj = {
        addEventListener: () => {},
        getElementById: () => ({
            classList: { add() {}, remove() {}, contains() { return false; } },
            innerHTML: '',
            textContent: ''
        }),
        querySelector: () => null,
        querySelectorAll: () => [],
        createElement: () => ({
            className: '',
            innerHTML: '',
            onclick: null,
            classList: { add() {}, remove() {}, contains() { return false; } },
            appendChild() {}
        })
    };

    const sandbox = {
        window: windowObj,
        document: documentObj,
        console,
        setTimeout,
        clearTimeout,
        Map,
        Set,
        Array,
        Object,
        String,
        Number,
        JSON,
        Math,
        parseInt,
        parseFloat,
        isNaN,
        devLog: () => {},
        devWarn: () => {},
        showToast: () => {},
        t: (k) => k,
        normalizeCardName: (s) => String(s || '').toLowerCase().trim(),
        getRarityRank: () => 0,
        getUnifiedCardImage: () => '',
        getRarityColor: () => '#000',
        setRarityPreference: () => {},
        updateDeckCountAndDisplay: () => {},
        closeFullscreenCard: () => {},
        closeDeckCompare: () => {},
        closeImageView: () => {},
        openCardmarket: () => {},
        openLimitlessCard: () => {},
        addCardToProxy: () => {},
        handleCardImageError: () => {},
        showSingleCard: () => {},
        loadAllCardsDatabase: overrides.loadAllCardsDatabase || (async () => {}),
    };

    for (const key of Object.keys(sandbox)) {
        if (!(key in sandbox.window)) sandbox.window[key] = sandbox[key];
    }

    const ctx = vm.createContext(sandbox);
    vm.runInContext(src, ctx, { filename: 'app-cards-db.js' });

    return {
        hasLoadedCardDatabaseForRaritySwitcher:
            sandbox.hasLoadedCardDatabaseForRaritySwitcher || sandbox.window.hasLoadedCardDatabaseForRaritySwitcher,
        ensureCardDatabaseReadyForRaritySwitcher:
            sandbox.ensureCardDatabaseReadyForRaritySwitcher || sandbox.window.ensureCardDatabaseReadyForRaritySwitcher,
        sandbox,
    };
}

describe('ensureCardDatabaseReadyForRaritySwitcher', () => {
    it('returns true immediately when allCardsDatabase already has rows', async () => {
        const { ensureCardDatabaseReadyForRaritySwitcher, sandbox } = loadRaritySwitcherReadyFns({
            window: { allCardsDatabase: [{ name: 'Pikachu' }] },
        });

        const ok = await ensureCardDatabaseReadyForRaritySwitcher({ maxWaitMs: 20, pollIntervalMs: 5 });
        assert.equal(ok, true);
        assert.equal(Array.isArray(sandbox.window.allCardsDatabase), true);
        assert.equal(sandbox.window.allCardsDatabase.length, 1);
    });

    it('waits for async loadAllCardsDatabase and succeeds', async () => {
        let loadCalls = 0;
        const { ensureCardDatabaseReadyForRaritySwitcher, sandbox } = loadRaritySwitcherReadyFns({
            loadAllCardsDatabase: async () => {
                loadCalls += 1;
                setTimeout(() => {
                    sandbox.window.allCardsDatabase = [{ name: 'Charizard' }];
                }, 25);
            },
        });

        const ok = await ensureCardDatabaseReadyForRaritySwitcher({ maxWaitMs: 250, pollIntervalMs: 10 });
        assert.equal(ok, true);
        assert.equal(loadCalls, 1);
        assert.equal(sandbox.window.allCardsDatabase.length, 1);
    });

    it('returns false when DB never becomes ready', async () => {
        const { ensureCardDatabaseReadyForRaritySwitcher } = loadRaritySwitcherReadyFns({
            loadAllCardsDatabase: async () => {},
        });

        const ok = await ensureCardDatabaseReadyForRaritySwitcher({ maxWaitMs: 60, pollIntervalMs: 10 });
        assert.equal(ok, false);
    });

    it('handles loadAllCardsDatabase rejection gracefully', async () => {
        const { ensureCardDatabaseReadyForRaritySwitcher } = loadRaritySwitcherReadyFns({
            loadAllCardsDatabase: async () => {
                throw new Error('network failed');
            },
        });

        const ok = await ensureCardDatabaseReadyForRaritySwitcher({ maxWaitMs: 60, pollIntervalMs: 10 });
        assert.equal(ok, false);
    });
});
