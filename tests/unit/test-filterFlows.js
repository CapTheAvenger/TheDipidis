/**
 * P1 unit tests for filter flows in:
 * - js/app-city-league.js
 * - js/app-current-meta-analysis.js
 *
 * Run: node --test tests/unit/test-filterFlows.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function extractFunction(src, fnName) {
    const fnPattern = new RegExp(`(?:async\\s+)?function\\s+${fnName}\\s*\\(`);
    const m = fnPattern.exec(src);
    if (!m) throw new Error(`Function not found: ${fnName}`);

    const start = m.index;
    const openIdx = src.indexOf('{', start);
    if (openIdx < 0) throw new Error(`Missing opening brace: ${fnName}`);

    let depth = 0;
    let end = -1;
    for (let i = openIdx; i < src.length; i++) {
        const ch = src[i];
        if (ch === '{') depth += 1;
        else if (ch === '}') depth -= 1;
        if (depth === 0) {
            end = i + 1;
            break;
        }
    }
    if (end < 0) throw new Error(`Missing closing brace: ${fnName}`);
    return src.slice(start, end);
}

function createClassList(initial = []) {
    const set = new Set(initial);
    return {
        contains(cls) { return set.has(cls); },
        add(cls) { set.add(cls); },
        remove(cls) { set.delete(cls); },
        _values: set,
    };
}

function loadFilterFns(overrides = {}) {
    const citySrc = fs.readFileSync(
        path.resolve(__dirname, '../../js/app-city-league.js'),
        'utf-8'
    );
    const currentMetaSrc = fs.readFileSync(
        path.resolve(__dirname, '../../js/app-current-meta-analysis.js'),
        'utf-8'
    );

    const snippets = [
        'let _cityLeagueSortCache = null;',
        'let _cityLeagueSortDataRef = null;',
        extractFunction(citySrc, 'getCardShareValue'),
        extractFunction(citySrc, 'getAceSpecBonusCountForFilter'),
        extractFunction(citySrc, 'applyShareFilterWithAceSpecBoost'),
        extractFunction(citySrc, 'getCityLeagueSortedSections'),
        extractFunction(citySrc, 'filterCityLeagueTable'),
        extractFunction(currentMetaSrc, 'applyCurrentMetaFilter'),
        extractFunction(currentMetaSrc, 'updateCurrentMetaCardCounts'),
    ].join('\n\n');

    const elements = new Map();

    const sandbox = {
        console,
        window: {
            cityLeagueSortedData: [],
            currentCurrentMetaDeckCards: [],
            ...overrides.window,
        },
        document: {
            getElementById(id) {
                return elements.get(id) || null;
            },
            ...overrides.document,
        },
        Number,
        String,
        Object,
        Array,
        Map,
        Set,
        Math,
        JSON,
        parseInt,
        parseFloat,
        isNaN,
        t: overrides.t || ((k) => k),
        devLog: () => {},
        isAceSpec: overrides.isAceSpec || ((name) => {
            const n = String(name || '').toLowerCase();
            return n.includes('prime catcher') || n.includes("hero's cape") || n.includes('secret box');
        }),
        renderFullComparisonTable: overrides.renderFullComparisonTable || (() => {}),
        renderCurrentMetaDeckTable: overrides.renderCurrentMetaDeckTable || (() => {}),
        renderCurrentMetaDeckGrid: overrides.renderCurrentMetaDeckGrid || (() => {}),
    };

    // Mirror globals to window for code that expects window-scoped symbols.
    for (const key of Object.keys(sandbox)) {
        if (!(key in sandbox.window)) sandbox.window[key] = sandbox[key];
    }

    const ctx = vm.createContext(sandbox);
    vm.runInContext(snippets, ctx, { filename: 'filter-flows-extract.js' });

    return {
        applyShareFilterWithAceSpecBoost: sandbox.applyShareFilterWithAceSpecBoost,
        getCityLeagueSortedSections: sandbox.getCityLeagueSortedSections,
        filterCityLeagueTable: sandbox.filterCityLeagueTable,
        applyCurrentMetaFilter: sandbox.applyCurrentMetaFilter,
        updateCurrentMetaCardCounts: sandbox.updateCurrentMetaCardCounts,
        _sandbox: sandbox,
        _elements: elements,
    };
}

describe('applyShareFilterWithAceSpecBoost', () => {
    it('keeps cards above threshold and adds ace-spec bonus for high filters', () => {
        const fns = loadFilterFns();
        const cards = [
            { card_name: 'Arven', percentage_in_archetype: '95', max_count: '4' },
            { card_name: 'Prime Catcher', percentage_in_archetype: '65', max_count: '1' },
            { card_name: 'Iono', percentage_in_archetype: '50', max_count: '2' },
        ];

        const filtered = fns.applyShareFilterWithAceSpecBoost(cards, '90');
        const names = filtered.map(c => c.card_name);
        assert.deepEqual(names, ['Arven', 'Prime Catcher']);
    });

    it('returns all cards for invalid threshold or missing share data', () => {
        const fns = loadFilterFns();
        const cardsNoShare = [{ card_name: 'Arven' }, { card_name: 'Iono' }];

        const invalid = fns.applyShareFilterWithAceSpecBoost(cardsNoShare, 'x');
        const missingShare = fns.applyShareFilterWithAceSpecBoost(cardsNoShare, '70');

        assert.equal(invalid.length, 2);
        assert.equal(missingShare.length, 2);
    });
});

describe('getCityLeagueSortedSections', () => {
    it('builds improvers/decliners with threshold and decimal comma parsing', () => {
        const fns = loadFilterFns();
        const data = [
            { archetype: 'A', status: 'ALT', new_count: '100', old_count: '80', count_change: '20', avg_placement_change: '-1,50', new_avg_placement: '4,00' },
            { archetype: 'B', status: 'ALT', new_count: '80', old_count: '90', count_change: '-10', avg_placement_change: '1,20', new_avg_placement: '6,50' },
            { archetype: 'C', status: 'NEU', new_count: '7', old_count: '0', count_change: '7', avg_placement_change: '-2,00', new_avg_placement: '3,00' },
        ];

        const sections = fns.getCityLeagueSortedSections(data);

        assert.equal(sections.newArchetypes.length, 1);
        assert.equal(sections.improvers.length, 1); // C below threshold 10% of max=10
        assert.equal(sections.improvers[0].archetype, 'A');
        assert.equal(sections.decliners.length, 1);
        assert.equal(sections.decliners[0].archetype, 'B');
        assert.equal(sections.sorted[0].archetype, 'A');
    });

    it('returns cached object for same data reference', () => {
        const fns = loadFilterFns();
        const data = [{ archetype: 'A', status: 'ALT', new_count: '10', old_count: '9', count_change: '1', avg_placement_change: '0,00', new_avg_placement: '5,00' }];

        const first = fns.getCityLeagueSortedSections(data);
        const second = fns.getCityLeagueSortedSections(data);
        assert.equal(first, second);
    });
});

describe('filterCityLeagueTable', () => {
    it('shows top 30 when search is empty', () => {
        let rendered = null;
        const fns = loadFilterFns({
            renderFullComparisonTable: (rows) => { rendered = rows; },
        });

        const rows = Array.from({ length: 40 }, (_, i) => ({ archetype: `Deck ${i + 1}` }));
        fns._sandbox.window.cityLeagueSortedData = rows;

        const searchInput = { value: '' };
        const results = { textContent: 'x', classList: createClassList(['results-error']) };
        fns._elements.set('cityLeagueSearchFilter', searchInput);
        fns._elements.set('cityLeagueSearchResults', results);

        fns.filterCityLeagueTable();

        assert.equal(rendered.length, 30);
        assert.equal(results.textContent, '');
    });

    it('supports comma-separated case-insensitive terms and updates result class', () => {
        let rendered = null;
        const fns = loadFilterFns({
            renderFullComparisonTable: (rows) => { rendered = rows; },
            t: (k) => (k === 'cl.resultsFound' ? 'results' : k),
        });

        fns._sandbox.window.cityLeagueSortedData = [
            { archetype: 'Gardevoir ex' },
            { archetype: 'Miraidon ex' },
            { archetype: 'Charizard ex' },
        ];

        const searchInput = { value: 'GAR, zard' };
        const results = { textContent: '', classList: createClassList(['results-error']) };
        fns._elements.set('cityLeagueSearchFilter', searchInput);
        fns._elements.set('cityLeagueSearchResults', results);

        fns.filterCityLeagueTable();

        assert.equal(rendered.length, 2);
        assert.equal(results.textContent, '2 results');
        assert.equal(results.classList.contains('results-success'), true);
        assert.equal(results.classList.contains('results-error'), false);
    });
});

describe('applyCurrentMetaFilter', () => {
    it('renders table view when table container is active and updates counts', () => {
        let tableRendered = null;
        let gridRendered = null;

        const fns = loadFilterFns({
            renderCurrentMetaDeckTable: (rows) => { tableRendered = rows; },
            renderCurrentMetaDeckGrid: (rows) => { gridRendered = rows; },
        });

        fns._sandbox.window.currentCurrentMetaDeckCards = [
            { card_name: 'Arven', percentage_in_archetype: '95', max_count: '4' },
            { card_name: 'Prime Catcher', percentage_in_archetype: '65', max_count: '1' },
            { card_name: 'Iono', percentage_in_archetype: '50', max_count: '2' },
        ];

        const filterSelect = { value: '90' };
        const deckSelect = { value: 'Gardevoir ex' };
        const tableView = { classList: createClassList() };
        const gridView = { classList: createClassList(['d-none']) };
        const countEl = { textContent: '' };
        const summaryEl = { textContent: '' };

        fns._elements.set('currentMetaFilterSelect', filterSelect);
        fns._elements.set('currentMetaDeckSelect', deckSelect);
        fns._elements.set('currentMetaDeckTableView', tableView);
        fns._elements.set('currentMetaDeckVisual', gridView);
        fns._elements.set('currentMetaCardCount', countEl);
        fns._elements.set('currentMetaCardCountSummary', summaryEl);

        fns.applyCurrentMetaFilter();

        assert.equal(Array.isArray(tableRendered), true);
        assert.equal(tableRendered.length, 2);
        assert.equal(gridRendered, null);
        assert.equal(countEl.textContent, '2 deck.cards');
        assert.equal(summaryEl.textContent, '/ 5 Total');
    });

    it('renders grid view when table is hidden', () => {
        let gridRendered = null;

        const fns = loadFilterFns({
            renderCurrentMetaDeckGrid: (rows) => { gridRendered = rows; },
        });

        fns._sandbox.window.currentCurrentMetaDeckCards = [
            { card_name: 'Arven', percentage_in_archetype: '95', max_count: '4' },
            { card_name: 'Iono', percentage_in_archetype: '50', max_count: '2' },
        ];

        fns._elements.set('currentMetaFilterSelect', { value: '90' });
        fns._elements.set('currentMetaDeckSelect', { value: 'Gardevoir ex' });
        fns._elements.set('currentMetaDeckTableView', { classList: createClassList(['d-none']) });
        fns._elements.set('currentMetaDeckVisual', { classList: createClassList(['d-none']) });
        fns._elements.set('currentMetaCardCount', { textContent: '' });
        fns._elements.set('currentMetaCardCountSummary', { textContent: '' });

        fns.applyCurrentMetaFilter();
        assert.equal(Array.isArray(gridRendered), true);
        assert.equal(gridRendered.length, 1);
    });
});
