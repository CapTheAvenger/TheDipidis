/**
 * Additional edge-case unit tests for core data-processing/filter flows.
 *
 * Focus:
 * - app-core.js: filterCardsArray, normalizeCurrentMetaFallbackRows
 * - app-utils.js: sanitizeDeckDependencies
 * - app-deck-builder.js: autosave bootstrap JSON parsing IIFE
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadAppUtils } = require('./test-helpers');

function extractFunction(src, fnName) {
    const fnPattern = new RegExp(`function\\s+${fnName}\\s*\\(`);
    const m = fnPattern.exec(src);
    if (!m) throw new Error(`Function not found: ${fnName}`);

    const start = m.index;
    const openIdx = src.indexOf('{', start);
    if (openIdx < 0) throw new Error(`Missing opening brace for: ${fnName}`);

    let depth = 0;
    let end = -1;
    for (let i = openIdx; i < src.length; i++) {
        if (src[i] === '{') depth += 1;
        else if (src[i] === '}') depth -= 1;
        if (depth === 0) {
            end = i + 1;
            break;
        }
    }
    if (end < 0) throw new Error(`Missing closing brace for: ${fnName}`);
    return src.slice(start, end);
}

function loadCoreEdgeFns() {
    const coreSrc = fs.readFileSync(
        path.resolve(__dirname, '../../js/app-core.js'),
        'utf-8'
    );

    const knownFormats = coreSrc.match(/const KNOWN_META_FORMAT_CODES = \[[\s\S]*?\];/m);
    const formatMap = coreSrc.match(/const TOURNAMENT_FORMAT_NAME_TO_CODE = \{[\s\S]*?\};/m);
    if (!knownFormats || !formatMap) throw new Error('Could not extract format constants from app-core.js');

    const snippet = [
        knownFormats[0],
        formatMap[0],
        extractFunction(coreSrc, 'mapSetCodeToMetaFormat'),
        extractFunction(coreSrc, 'normalizeTournamentFormatLabel'),
        extractFunction(coreSrc, 'sanitizeTournamentArchetypeName'),
        extractFunction(coreSrc, 'normalizeCurrentMetaFallbackRows'),
        extractFunction(coreSrc, 'filterCardsArray'),
    ].join('\n\n');

    const sandbox = {
        console,
        String,
        Number,
        Object,
        Array,
        Map,
        Set,
        Math,
        JSON,
        parseInt,
        parseFloat,
        isNaN,
        setOrderMap: { SVI: 1, TEF: 2, POR: 3 },
    };

    const ctx = vm.createContext(sandbox);
    vm.runInContext(snippet, ctx, { filename: 'app-core-edge-extract.js' });

    return {
        normalizeCurrentMetaFallbackRows: sandbox.normalizeCurrentMetaFallbackRows,
        filterCardsArray: sandbox.filterCardsArray,
    };
}

function runAutosaveBootstrap(savedValue) {
    const src = fs.readFileSync(
        path.resolve(__dirname, '../../js/app-deck-builder.js'),
        'utf-8'
    );

    const iifeMatch = src.match(/\(function\(\)\s*\{[\s\S]*?\}\)\(\);/m);
    if (!iifeMatch) throw new Error('Autosave bootstrap IIFE not found in app-deck-builder.js');

    const window = {};
    const sandbox = {
        window,
        localStorage: {
            getItem: (key) => (key === 'autosave_deck' ? savedValue : null),
        },
        JSON,
        Object,
        console,
    };

    const ctx = vm.createContext(sandbox);
    vm.runInContext(iifeMatch[0], ctx, { filename: 'app-deck-builder-autosave-extract.js' });
    return window;
}

describe('filterCardsArray — malformed input handling', () => {
    const fns = loadCoreEdgeFns();

    it('returns empty array for non-array input', () => {
        const result = fns.filterCardsArray(null, 'pikachu');
        assert.ok(Array.isArray(result));
        assert.equal(result.length, 0);
    });

    it('ignores null/broken rows instead of throwing', () => {
        const cards = [
            null,
            undefined,
            42,
            { name_en: 'Pikachu', set: 'SVI', number: '025', pokedex_number: '25' },
        ];
        const result = fns.filterCardsArray(cards, 'pika');
        assert.equal(result.length, 1);
        assert.equal(result[0].name_en, 'Pikachu');
    });
});

describe('normalizeCurrentMetaFallbackRows — malformed row handling', () => {
    const fns = loadCoreEdgeFns();

    it('skips null/non-object rows and keeps valid rows', () => {
        const rows = [
            null,
            'not-an-object',
            { archetype: 'Charizard ex', card_name: 'Charizard ex', format: 'POR', tournament_id: 'T1' },
        ];

        const normalized = fns.normalizeCurrentMetaFallbackRows(rows);
        assert.equal(normalized.length, 1);
        assert.equal(normalized[0].archetype, 'Charizard ex');
        assert.equal(normalized[0].meta, 'Meta Play!');
    });
});

describe('sanitizeDeckDependencies — null entries in dependency list', () => {
    const fns = loadAppUtils();

    it('removes null entries and strips Rare Candy when no Stage 2 exists', () => {
        const input = [
            null,
            { card_name: 'Rare Candy', type: 'Item', addCount: 4 },
            { card_name: 'Buddy-Buddy Poffin', type: 'Item', addCount: 2 },
        ];

        const out = fns.sanitizeDeckDependencies(input);
        assert.equal(out.some((c) => c.card_name === 'Rare Candy'), false);
        assert.equal(out.length, 1);
        assert.equal(out[0].card_name, 'Buddy-Buddy Poffin');
    });

    it('caps Rare Candy to max 3 when Stage 2 exists, despite null entries', () => {
        const input = [
            undefined,
            { card_name: 'Rare Candy', type: 'Item', addCount: 6 },
            { card_name: 'Charizard ex', type: 'Stage 2', addCount: 3 },
        ];

        const out = fns.sanitizeDeckDependencies(input);
        const rareCandy = out.find((c) => c.card_name === 'Rare Candy');
        assert.equal(rareCandy.addCount, 3);
    });
});

describe('app-deck-builder autosave bootstrap — JSON edge cases', () => {
    it('does not throw on malformed JSON', () => {
        const windowObj = runAutosaveBootstrap('{ bad json');
        assert.equal(windowObj._pendingAutosave, undefined);
    });

    it('stores pending autosave for valid non-empty deck data', () => {
        const payload = JSON.stringify({
            cityLeague: { deck: { 'Pikachu (SVI 025)': 2 } },
            currentMeta: { deck: {} },
            pastMeta: { deck: {} },
        });

        const windowObj = runAutosaveBootstrap(payload);
        assert.ok(windowObj._pendingAutosave);
        assert.equal(windowObj._pendingAutosave.cityLeague.deck['Pikachu (SVI 025)'], 2);
    });

    it('ignores structurally valid but empty/null deck structures', () => {
        const payload = JSON.stringify({
            cityLeague: { deck: null },
            currentMeta: {},
            pastMeta: { deck: {} },
        });

        const windowObj = runAutosaveBootstrap(payload);
        assert.equal(windowObj._pendingAutosave, undefined);
    });
});
