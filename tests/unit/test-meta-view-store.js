/**
 * Unit tests for the consolidated meta-view store + controller
 * (js/modules/meta-view/store.js + controller.js).
 *
 * Wave-2 IA-Refactor foundation. Verifies the state machine handles
 * the segmented-control transitions correctly: format switching,
 * deck selection, back-to-list, filter updates, and the cross-format
 * archetype-preservation logic in the controller.
 */
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// jsdom-less node setup: stub window + localStorage + URL just enough
// that module top-level side-effects (window.X assignments) don't
// throw. Each test resets the store so order independence holds.
global.window = global.window || /** @type {any} */ ({
    location: { href: 'http://localhost/' },
    localStorage: {
        _store: {},
        getItem(k) { return this._store[k] ?? null; },
        setItem(k, v) { this._store[k] = String(v); },
        removeItem(k) { delete this._store[k]; },
    },
});

describe('metaViewStore: initial state', () => {
    it('starts in list view of current format with no selection', async () => {
        const { metaViewStore } = await import('../../js/modules/meta-view/store.js');
        metaViewStore.reset();
        const s = metaViewStore.get();
        assert.equal(s.activeFormat, 'current');
        assert.equal(s.view, 'list');
        assert.equal(s.selectedDeck, null);
        assert.deepEqual(s.filters, {});
        assert.equal(s.isLoading, false);
    });
});

describe('metaViewStore: setFormat', () => {
    it('switches to the named format', async () => {
        const { metaViewStore } = await import('../../js/modules/meta-view/store.js');
        metaViewStore.reset();
        metaViewStore.setFormat('city-league');
        assert.equal(metaViewStore.get().activeFormat, 'city-league');
        metaViewStore.setFormat('past');
        assert.equal(metaViewStore.get().activeFormat, 'past');
    });

    it('returns to list view when switching format from detail', async () => {
        const { metaViewStore } = await import('../../js/modules/meta-view/store.js');
        metaViewStore.reset();
        metaViewStore.selectDeck({ archetype: 'Charizard ex', format: 'current' });
        assert.equal(metaViewStore.get().view, 'detail');
        metaViewStore.setFormat('past');
        assert.equal(metaViewStore.get().view, 'list');
    });

    it('rejects unknown format values', async () => {
        const { metaViewStore } = await import('../../js/modules/meta-view/store.js');
        metaViewStore.reset();
        metaViewStore.setFormat(/** @type {any} */ ('bogus-format'));
        assert.equal(metaViewStore.get().activeFormat, 'current'); // unchanged
    });
});

describe('metaViewStore: selectDeck / backToList', () => {
    it('opens detail view on selectDeck', async () => {
        const { metaViewStore } = await import('../../js/modules/meta-view/store.js');
        metaViewStore.reset();
        metaViewStore.selectDeck({ archetype: 'Gardevoir ex', format: 'current' });
        const s = metaViewStore.get();
        assert.equal(s.view, 'detail');
        assert.equal(s.selectedDeck.archetype, 'Gardevoir ex');
    });

    it('backToList preserves selectedDeck (for one-click reopen)', async () => {
        const { metaViewStore } = await import('../../js/modules/meta-view/store.js');
        metaViewStore.reset();
        metaViewStore.selectDeck({ archetype: 'Pidgey', format: 'current' });
        metaViewStore.backToList();
        const s = metaViewStore.get();
        assert.equal(s.view, 'list');
        assert.equal(s.selectedDeck.archetype, 'Pidgey');
    });

    it('ignores selectDeck with no archetype', async () => {
        const { metaViewStore } = await import('../../js/modules/meta-view/store.js');
        metaViewStore.reset();
        metaViewStore.selectDeck(/** @type {any} */ ({ format: 'current' }));
        assert.equal(metaViewStore.get().view, 'list'); // unchanged
    });
});

describe('metaViewStore: filters', () => {
    it('setFilters does a partial merge', async () => {
        const { metaViewStore } = await import('../../js/modules/meta-view/store.js');
        metaViewStore.reset();
        metaViewStore.setFilters({ search: 'fire' });
        metaViewStore.setFilters({ dateRange: '30d' });
        const s = metaViewStore.get();
        assert.equal(s.filters.search, 'fire');
        assert.equal(s.filters.dateRange, '30d');
    });
});

describe('metaViewStore: subscribers', () => {
    it('notifies on every state change', async () => {
        const { metaViewStore } = await import('../../js/modules/meta-view/store.js');
        metaViewStore.reset();
        const events = [];
        const off = metaViewStore.subscribe((next) => events.push({
            format: next.activeFormat, view: next.view,
        }));
        metaViewStore.setFormat('past');
        metaViewStore.selectDeck({ archetype: 'X', format: 'past' });
        metaViewStore.backToList();
        off();
        assert.equal(events.length, 3);
        assert.equal(events[0].format, 'past');
        assert.equal(events[1].view, 'detail');
        assert.equal(events[2].view, 'list');
    });
});

describe('controller: switchFormat preserves selection when archetype available', () => {
    beforeEach(() => {
        global.window.currentMetaAnalysisData = [{ archetype: 'Charizard ex' }];
        global.window.cityLeagueAnalysisData = [{ archetype: 'Charizard ex' }];
    });

    it('keeps selectedDeck when archetype exists in target format', async () => {
        const { metaViewStore } = await import('../../js/modules/meta-view/store.js');
        const { switchFormat, selectDeck } = await import('../../js/modules/meta-view/controller.js');
        metaViewStore.reset();
        selectDeck('Charizard ex', 'current');
        switchFormat('city-league');
        const s = metaViewStore.get();
        assert.equal(s.activeFormat, 'city-league');
        assert.equal(s.selectedDeck.archetype, 'Charizard ex');
    });

    it('clears selectedDeck when archetype missing in target format', async () => {
        const { metaViewStore } = await import('../../js/modules/meta-view/store.js');
        const { switchFormat, selectDeck } = await import('../../js/modules/meta-view/controller.js');
        global.window.cityLeagueAnalysisData = [{ archetype: 'Pikachu' }]; // no Charizard
        metaViewStore.reset();
        selectDeck('Charizard ex', 'current');
        switchFormat('city-league');
        const s = metaViewStore.get();
        assert.equal(s.activeFormat, 'city-league');
        assert.equal(s.selectedDeck, null);
    });

    it('clears selectedDeck when target format has NO data loaded yet', async () => {
        const { metaViewStore } = await import('../../js/modules/meta-view/store.js');
        const { switchFormat, selectDeck } = await import('../../js/modules/meta-view/controller.js');
        global.window.pastMetaArchetypes = []; // empty / unloaded
        metaViewStore.reset();
        selectDeck('Charizard ex', 'current');
        switchFormat('past');
        const s = metaViewStore.get();
        assert.equal(s.activeFormat, 'past');
        assert.equal(s.selectedDeck, null);
    });

    it('ignores invalid format values', async () => {
        const { metaViewStore } = await import('../../js/modules/meta-view/store.js');
        const { switchFormat } = await import('../../js/modules/meta-view/controller.js');
        metaViewStore.reset();
        switchFormat(/** @type {any} */ ('not-a-format'));
        assert.equal(metaViewStore.get().activeFormat, 'current'); // unchanged
    });
});

describe('controller: backToList + setSearchFilter', () => {
    it('backToList returns to list view and keeps selectedDeck', async () => {
        const { metaViewStore } = await import('../../js/modules/meta-view/store.js');
        const { backToList, selectDeck } = await import('../../js/modules/meta-view/controller.js');
        metaViewStore.reset();
        selectDeck('Pikachu', 'current');
        assert.equal(metaViewStore.get().view, 'detail');
        backToList();
        assert.equal(metaViewStore.get().view, 'list');
        assert.equal(metaViewStore.get().selectedDeck.archetype, 'Pikachu');
    });

    it('setSearchFilter updates the search field and trims whitespace', async () => {
        const { metaViewStore } = await import('../../js/modules/meta-view/store.js');
        const { setSearchFilter } = await import('../../js/modules/meta-view/controller.js');
        metaViewStore.reset();
        setSearchFilter('charizard');
        assert.equal(metaViewStore.get().filters.search, 'charizard');
        setSearchFilter('  trimmed  ');
        assert.equal(metaViewStore.get().filters.search, 'trimmed');
        setSearchFilter('');
        assert.equal(metaViewStore.get().filters.search, '');
    });
});

