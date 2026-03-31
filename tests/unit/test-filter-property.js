/**
 * Property-based tests for core filter behavior.
 *
 * Goal:
 * - Stress filterCardsArray with randomized mixed-quality card rows.
 * - Verify stable invariants across many generated datasets.
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

function loadFilterCardsArray() {
    const src = fs.readFileSync(
        path.resolve(__dirname, '../../js/app-core.js'),
        'utf-8'
    );

    const snippet = extractFunction(src, 'filterCardsArray');
    const sandbox = { String, Array, Object };
    const ctx = vm.createContext(sandbox);
    vm.runInContext(snippet, ctx, { filename: 'app-core-filter-property-extract.js' });

    if (typeof sandbox.filterCardsArray !== 'function') {
        throw new Error('filterCardsArray not loaded');
    }
    return sandbox.filterCardsArray;
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

function makeRandomCard(rand) {
    const names = [
        'Pikachu', 'Charizard ex', 'Mewtwo', 'Iono', 'Nest Ball',
        'Arven', 'Radiant Greninja', 'Rare Candy', 'Boss\'s Orders', 'Miraidon ex',
    ];
    const namesDe = [
        'Pikachu', 'Glurak ex', 'Mewtu', 'Iono', 'Nestball',
        'Arvens Auftrag', 'Strahlendes Quajutsu', 'Sonderbonbon', 'Boss-Befehl', 'Miraidon ex',
    ];
    const sets = ['SVI', 'TEF', 'MEG', 'PAF', 'OBF', 'PAR', 'BRS'];

    const number = String(randInt(rand, 1, 250)).padStart(randInt(rand, 1, 3), '0');
    const dex = rand() < 0.2 ? '' : String(randInt(rand, 1, 1025));

    return {
        name_en: maybe(rand, () => pick(rand, names), 0.1),
        name_de: maybe(rand, () => pick(rand, namesDe), 0.2),
        set: maybe(rand, () => pick(rand, sets), 0.1),
        number: maybe(rand, () => number, 0.1),
        pokedex_number: maybe(rand, () => dex, 0.1),
    };
}

describe('property: filterCardsArray invariants', () => {
    const filterCardsArray = loadFilterCardsArray();

    it('never throws and only returns source object entries for random mixed data', () => {
        for (let seed = 1; seed <= 80; seed++) {
            const rand = createRng(seed);
            const rows = [];
            const rowCount = randInt(rand, 0, 140);

            for (let i = 0; i < rowCount; i++) {
                const kind = randInt(rand, 0, 6);
                if (kind === 0) rows.push(null);
                else if (kind === 1) rows.push(undefined);
                else if (kind === 2) rows.push(randInt(rand, -100, 100));
                else if (kind === 3) rows.push({});
                else rows.push(makeRandomCard(rand));
            }

            const terms = [
                '',
                'pika',
                'glurak',
                'svi',
                'svi 025',
                '25',
                'radiant',
                'does-not-exist',
                String(randInt(rand, 1, 999)),
            ];

            for (const term of terms) {
                let out;
                assert.doesNotThrow(() => {
                    out = filterCardsArray(rows, term);
                }, `Unexpected throw for seed=${seed} term=${term}`);

                assert.ok(Array.isArray(out), 'Result must be an array');

                for (const item of out) {
                    assert.ok(rows.includes(item), 'Output must only contain original row references');
                    if (term !== '') {
                        assert.equal(typeof item, 'object', 'Output entries must be objects for non-empty term');
                        assert.notEqual(item, null, 'Output entries must not be null for non-empty term');
                    }
                }
            }
        }
    });

    it('is monotonic by term narrowing (longer prefix cannot create new matches)', () => {
        for (let seed = 101; seed <= 140; seed++) {
            const rand = createRng(seed);
            const rows = Array.from({ length: randInt(rand, 20, 100) }, () => makeRandomCard(rand));

            const broad = 'pi';
            const narrow = 'pik';

            const broadOut = filterCardsArray(rows, broad);
            const narrowOut = filterCardsArray(rows, narrow);

            const broadSet = new Set(broadOut);
            for (const row of narrowOut) {
                assert.ok(broadSet.has(row), `Narrow result must be subset of broad result (seed=${seed})`);
            }
        }
    });

    it('is case-insensitive for randomized exact name term', () => {
        for (let seed = 201; seed <= 240; seed++) {
            const rand = createRng(seed);
            const rows = Array.from({ length: randInt(rand, 10, 60) }, () => makeRandomCard(rand));

            const withNames = rows.filter((r) => r && typeof r === 'object' && typeof r.name_en === 'string' && r.name_en.trim());
            if (withNames.length === 0) continue;

            const target = withNames[randInt(rand, 0, withNames.length - 1)].name_en;
            const lower = String(target).toLowerCase();
            const upper = String(target).toUpperCase();

            const outLower = filterCardsArray(rows, lower);
            const outUpper = filterCardsArray(rows, upper);

            assert.equal(outLower.length, outUpper.length, `Case-insensitive mismatch for seed=${seed}`);

            const s1 = new Set(outLower);
            for (const row of outUpper) {
                assert.ok(s1.has(row), `Case-insensitive result mismatch for seed=${seed}`);
            }
        }
    });
});
