/**
 * Property-based tests for normalizeCurrentMetaFallbackRows.
 *
 * Focus:
 * - No throws on malformed mixed input
 * - Output invariants for normalized rows
 * - Idempotence of normalization
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

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

function loadNormalizeCurrentMetaFallbackRows() {
    const src = fs.readFileSync(
        path.resolve(__dirname, '../../js/app-core.js'),
        'utf-8'
    );

    const knownFormats = src.match(/const KNOWN_META_FORMAT_CODES = \[[\s\S]*?\];/m);
    const formatMap = src.match(/const TOURNAMENT_FORMAT_NAME_TO_CODE = \{[\s\S]*?\};/m);
    if (!knownFormats || !formatMap) {
        throw new Error('Failed to extract format constants');
    }

    const snippet = [
        knownFormats[0],
        formatMap[0],
        extractFunction(src, 'mapSetCodeToMetaFormat'),
        extractFunction(src, 'normalizeTournamentFormatLabel'),
        extractFunction(src, 'sanitizeTournamentArchetypeName'),
        extractFunction(src, 'normalizeCurrentMetaFallbackRows'),
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
        setOrderMap: {
            SVI: 1,
            SVE: 2,
            PAL: 3,
            OBF: 4,
            PAR: 5,
            PAF: 6,
            TEF: 7,
            TWM: 8,
            SFA: 9,
            SCR: 10,
            SSP: 11,
            PRE: 12,
            JTG: 13,
            DRI: 14,
            BLK: 15,
            WHT: 16,
            POR: 17,
            MEG: 18,
            ASC: 19,
        },
    };

    const ctx = vm.createContext(sandbox);
    vm.runInContext(snippet, ctx, { filename: 'current-meta-normalize-property-extract.js' });

    if (typeof sandbox.normalizeCurrentMetaFallbackRows !== 'function') {
        throw new Error('normalizeCurrentMetaFallbackRows not loaded');
    }
    return sandbox.normalizeCurrentMetaFallbackRows;
}

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

function maybe(rand, valueFactory, nullChance = 0.25) {
    return rand() < nullChance ? null : valueFactory();
}

function makeRandomRow(rand) {
    const archetypes = [
        'Charizard ex',
        'Gardevoir ex',
        'Lugia VSTAR',
        'Miraidon ex',
        'Alakazam Dudunsparce',
        'Charizard ex12,50$10,00€',
        'Lugia VSTAR\u00a0',
    ];
    const cards = [
        'Rare Candy',
        'Arven',
        'Pikachu',
        'Buddy-Buddy Poffin',
        'Iono',
        'Prime Catcher',
    ];
    const formats = [
        'POR',
        'MEG',
        'ASC',
        'TEF',
        'Meta Play!',
        'Meta Live',
        'Scarlet & Violet - Mega Evolution',
        'Unknown Format XYZ',
        '',
    ];
    const setCodes = ['POR', 'MEG', 'ASC', 'TEF', 'PAR', 'PAF', ''];

    const base = {
        archetype: maybe(rand, () => pick(rand, archetypes), 0.15),
        card_name: maybe(rand, () => pick(rand, cards), 0.15),
        format: maybe(rand, () => pick(rand, formats), 0.2),
        meta: maybe(rand, () => pick(rand, ['Legacy', 'Meta Live', 'Meta Play!', '']), 0.5),
        set_code: maybe(rand, () => pick(rand, setCodes), 0.2),
        tournament_id: maybe(rand, () => `T${randInt(rand, 1, 6)}`, 0.15),
        deck_inclusion_count: maybe(rand, () => String(randInt(rand, 0, 20)), 0.55),
        deck_count: maybe(rand, () => String(randInt(rand, 0, 20)), 0.55),
        total_count: maybe(rand, () => String(randInt(rand, 0, 80)), 0.45),
        total_decks_in_archetype: maybe(rand, () => String(randInt(rand, 0, 30)), 0.45),
        average_count_overall: maybe(rand, () => (rand() * 4).toFixed(2), 0.7),
    };

    if (rand() < 0.2) delete base.average_count_overall;
    if (rand() < 0.15) delete base.deck_count;
    if (rand() < 0.15) delete base.deck_inclusion_count;
    return base;
}

describe('property: normalizeCurrentMetaFallbackRows invariants', () => {
    const normalizeRows = loadNormalizeCurrentMetaFallbackRows();

    it('never throws on randomized mixed malformed input', () => {
        for (let seed = 1; seed <= 80; seed++) {
            const rand = createRng(seed);
            const rows = [];
            const count = randInt(rand, 0, 120);

            for (let i = 0; i < count; i++) {
                const kind = randInt(rand, 0, 6);
                if (kind === 0) rows.push(null);
                else if (kind === 1) rows.push(undefined);
                else if (kind === 2) rows.push(randInt(rand, -50, 50));
                else if (kind === 3) rows.push('broken-row');
                else rows.push(makeRandomRow(rand));
            }

            assert.doesNotThrow(() => normalizeRows(rows), `Unexpected throw for seed=${seed}`);
            const out = normalizeRows(rows);
            assert.ok(Array.isArray(out), 'Output must be an array');
        }
    });

    it('produces only valid normalized rows and forces canonical meta label', () => {
        for (let seed = 101; seed <= 160; seed++) {
            const rand = createRng(seed);
            const rows = Array.from({ length: randInt(rand, 10, 80) }, () => makeRandomRow(rand));
            const out = normalizeRows(rows);

            for (const row of out) {
                assert.equal(typeof row, 'object');
                assert.notEqual(row, null);
                assert.ok(String(row.card_name || '').trim().length > 0, 'card_name must be present');
                assert.ok(String(row.archetype || '').trim().length > 0, 'archetype must be present');
                assert.equal(row.meta, 'Meta Play!', 'meta must be normalized to Meta Play!');
                assert.equal(String(row.archetype).trim(), row.archetype, 'archetype must be trimmed');
            }
        }
    });

    it('is idempotent for randomized valid-ish fallback rows', () => {
        for (let seed = 201; seed <= 250; seed++) {
            const rand = createRng(seed);
            const rows = Array.from({ length: randInt(rand, 5, 40) }, () => makeRandomRow(rand));

            const once = normalizeRows(rows);
            const twice = normalizeRows(once);

            assert.deepEqual(
                JSON.parse(JSON.stringify(twice)),
                JSON.parse(JSON.stringify(once)),
                `Normalization must be idempotent for seed=${seed}`
            );
        }
    });

    it('fills average_count_overall deterministically when enough data exists', () => {
        for (let seed = 301; seed <= 340; seed++) {
            const rand = createRng(seed);
            const row = makeRandomRow(rand);
            row.archetype = 'Charizard ex';
            row.card_name = 'Rare Candy';
            row.total_count = String(randInt(rand, 1, 50));
            row.total_decks_in_archetype = String(randInt(rand, 1, 25));
            delete row.average_count_overall;

            const out = normalizeRows([row]);
            assert.equal(out.length, 1);
            assert.match(out[0].average_count_overall, /^\d+(\.\d{2})?$/, 'average_count_overall must be fixed-point string');
        }
    });
});
