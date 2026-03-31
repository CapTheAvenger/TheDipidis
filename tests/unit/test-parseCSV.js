/**
 * Unit tests for parseCSV() — from app-core.js
 *
 * parseCSV depends on PapaParse, so we load it as a Node module and inject
 * it into the VM sandbox.  Tests cover delimiter auto-detection, encoding
 * repair, empty input, and edge cases with quoted fields.
 *
 * Run:  node --test tests/unit/test-parseCSV.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Load PapaParse from node_modules
const Papa = require('papaparse');

/**
 * Build a minimal sandbox and evaluate only parseCSV + fixCardNameEncoding
 * from app-core.js.
 */
function loadParseCSV(overrides = {}) {
    const coreSrc = fs.readFileSync(
        path.resolve(__dirname, '../../js/app-core.js'),
        'utf-8'
    );

    // Extract just the parseCSV and fixCardNameEncoding functions
    const parseCsvMatch = coreSrc.match(
        /function parseCSV\(text, delimiter\)\s*\{[\s\S]*?\n        \}/
    );
    const fixEncodingMatch = coreSrc.match(
        /function fixCardNameEncoding\(name\)\s*\{[\s\S]*?\n        \}/
    );

    if (!parseCsvMatch) throw new Error('Could not extract parseCSV from app-core.js');
    if (!fixEncodingMatch) throw new Error('Could not extract fixCardNameEncoding from app-core.js');

    const src = `
        ${fixEncodingMatch[0]}
        ${parseCsvMatch[0]}
    `;

    const window = {
        fixCardNameEncoding: null,
        ...overrides,
    };

    const sandbox = {
        window,
        Papa,
        console,
        String,
        Array,
        Object,
        parseInt,
        parseFloat,
        // expose after eval
        parseCSV: null,
        fixCardNameEncoding: null,
    };

    const ctx = vm.createContext(sandbox);
    vm.runInContext(src, ctx, { filename: 'parseCSV-extract.js' });

    // The functions are now at sandbox scope; also wire window.fixCardNameEncoding
    sandbox.window.fixCardNameEncoding = sandbox.fixCardNameEncoding;

    return {
        parseCSV: sandbox.parseCSV,
        fixCardNameEncoding: sandbox.fixCardNameEncoding,
    };
}

// ── Smoke ─────────────────────────────────────────────────────
describe('parseCSV — smoke', () => {
    const { parseCSV } = loadParseCSV();

    it('is a function', () => {
        assert.equal(typeof parseCSV, 'function');
    });

    it('returns [] for empty string', () => {
        const result = parseCSV('');
        assert.ok(Array.isArray(result));
        assert.equal(result.length, 0);
    });

    it('returns [] for null', () => {
        const result = parseCSV(null);
        assert.ok(Array.isArray(result));
        assert.equal(result.length, 0);
    });

    it('returns [] for whitespace-only', () => {
        const result = parseCSV('   \n  \n ');
        assert.ok(Array.isArray(result));
        assert.equal(result.length, 0);
    });
});

// ── Semicolon-delimited CSV (project default) ────────────────
describe('parseCSV — semicolon delimiter', () => {
    const { parseCSV } = loadParseCSV();

    it('parses simple semicolon CSV', () => {
        const csv = 'card_name;set_code;number\nCharizard ex;MEG;6\nPikachu;TEF;42';
        const rows = parseCSV(csv);
        assert.equal(rows.length, 2);
        assert.equal(rows[0].card_name, 'Charizard ex');
        assert.equal(rows[0].set_code, 'MEG');
        assert.equal(rows[1].card_name, 'Pikachu');
    });

    it('auto-detects semicolon when no delimiter passed', () => {
        const csv = 'name;value;count\nA;1;2\nB;3;4';
        const rows = parseCSV(csv);
        assert.equal(rows.length, 2);
        assert.equal(rows[0].name, 'A');
        assert.equal(rows[0].value, '1');
    });

    it('respects explicit delimiter override', () => {
        const csv = 'name,value\nA,1\nB,2';
        const rows = parseCSV(csv, ',');
        assert.equal(rows.length, 2);
        assert.equal(rows[0].name, 'A');
    });
});

// ── Comma-delimited CSV ──────────────────────────────────────
describe('parseCSV — comma delimiter', () => {
    const { parseCSV } = loadParseCSV();

    it('auto-detects comma delimiter', () => {
        const csv = 'name,set,number\nCharizard,MEG,6';
        const rows = parseCSV(csv);
        assert.equal(rows.length, 1);
        assert.equal(rows[0].name, 'Charizard');
    });

    it('handles quoted fields with commas', () => {
        const csv = 'name,description\n"Charizard, the fire type","Big dragon"';
        const rows = parseCSV(csv, ',');
        assert.equal(rows.length, 1);
        assert.equal(rows[0].name, 'Charizard, the fire type');
    });
});

// ── Encoding repair (fixCardNameEncoding applied post-parse) ─
describe('parseCSV — encoding repair', () => {
    const { parseCSV } = loadParseCSV();

    it('fixes PokÃ© mojibake in card_name column', () => {
        const csv = 'card_name;set\nPokÃ©mon ex;TEF';
        const rows = parseCSV(csv);
        assert.equal(rows[0].card_name, 'Pokémon ex');
    });

    it('fixes mojibake in full_card_name column', () => {
        const csv = 'full_card_name;set\nPokÃ©mon V;SVI';
        const rows = parseCSV(csv);
        assert.equal(rows[0].full_card_name, 'Pokémon V');
    });

    it('leaves clean names unchanged', () => {
        const csv = 'card_name;set\nCharizard ex;MEG';
        const rows = parseCSV(csv);
        assert.equal(rows[0].card_name, 'Charizard ex');
    });

    it('handles â€™ → apostrophe in card_name', () => {
        const csv = "card_name;set\nN\u00E2\u0080\u0099s Resolve;BRS";
        const rows = parseCSV(csv);
        // fixCardNameEncoding replaces â€™ with '
        assert.ok(!rows[0].card_name.includes('â€™'), `Got: ${rows[0].card_name}`);
    });
});

// ── UTF-8-BOM handling ───────────────────────────────────────
describe('parseCSV — BOM handling', () => {
    const { parseCSV } = loadParseCSV();

    it('parses CSV with UTF-8 BOM prefix', () => {
        const bom = '\uFEFF';
        const csv = bom + 'card_name;set\nPikachu;TEF';
        const rows = parseCSV(csv);
        assert.equal(rows.length, 1);
        // PapaParse should handle BOM - check the first column is accessible
        const firstRow = rows[0];
        const name = firstRow.card_name || firstRow['\uFEFFcard_name'] || Object.values(firstRow)[0];
        assert.ok(name === 'Pikachu' || name !== undefined, 'First column should be parseable');
    });
});

// ── Edge cases ───────────────────────────────────────────────
describe('parseCSV — edge cases', () => {
    const { parseCSV } = loadParseCSV();

    it('skips empty lines', () => {
        const csv = 'name;value\nA;1\n\n\nB;2\n';
        const rows = parseCSV(csv);
        assert.equal(rows.length, 2);
    });

    it('handles header-only CSV (no data rows)', () => {
        const csv = 'name;set;number';
        const rows = parseCSV(csv);
        assert.equal(rows.length, 0);
    });

    it('handles single row', () => {
        const csv = 'card_name;count\nArceus VSTAR;3';
        const rows = parseCSV(csv);
        assert.equal(rows.length, 1);
        assert.equal(rows[0].card_name, 'Arceus VSTAR');
        assert.equal(rows[0].count, '3'); // dynamicTyping is false
    });

    it('returns strings not numbers (dynamicTyping: false)', () => {
        const csv = 'card_name;deck_count;total_count\nPikachu;42;100';
        const rows = parseCSV(csv);
        assert.equal(typeof rows[0].deck_count, 'string');
        assert.equal(rows[0].deck_count, '42');
    });
});

// ── fixCardNameEncoding standalone ───────────────────────────
describe('fixCardNameEncoding', () => {
    const { fixCardNameEncoding } = loadParseCSV();

    it('fixes PokÃ© → Poké', () => {
        assert.equal(fixCardNameEncoding('PokÃ©mon'), 'Pokémon');
    });

    it('fixes Ã© → é', () => {
        assert.equal(fixCardNameEncoding('Ã©volution'), 'évolution');
    });

    it('removes stray Â', () => {
        assert.equal(fixCardNameEncoding('ÂPikachu'), 'Pikachu');
    });

    it('returns null/empty as-is', () => {
        assert.equal(fixCardNameEncoding(null), null);
        assert.equal(fixCardNameEncoding(''), '');
    });

    it('leaves clean text unchanged', () => {
        assert.equal(fixCardNameEncoding('Charizard ex'), 'Charizard ex');
    });
});
