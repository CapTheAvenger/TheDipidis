/**
 * Unit tests for data processing functions from app-core.js:
 * healCurrentMetaCardRows, sanitizeTournamentArchetypeName,
 * mapSetCodeToMetaFormat, normalizeTournamentFormatLabel,
 * normalizeCurrentMetaFallbackRows, parseArchetypeSelection,
 * filterCardsArray, sortCardsPTCG, normalizeProxySetCode,
 * normalizeProxyCardNumber, buildProxyItemId, getCardDisplayName,
 * getCardSetCode, getCardNumber
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/**
 * Load the pure functions from app-core.js in a sandboxed VM context.
 * We extract only the function definitions we need via regex.
 */
function loadCoreFns(overrides = {}) {
    const src = fs.readFileSync(
        path.resolve(__dirname, '../../js/app-core.js'),
        'utf-8'
    );

    // Extract function bodies by matching from `function name(` to the
    // closing `}` at the same indentation level.  For the functions we
    // need, a simpler approach: extract the entire region between known
    // function boundaries.

    const fnsToExtract = [
        'normalizeProxySetCode', 'normalizeProxyCardNumber', 'buildProxyItemId',
        'getCardDisplayName', 'getCardSetCode', 'getCardNumber',
        'healCurrentMetaCardRows', 'mapSetCodeToMetaFormat',
        'normalizeTournamentFormatLabel', 'sanitizeTournamentArchetypeName',
        'normalizeCurrentMetaFallbackRows', 'parseArchetypeSelection',
        'filterCardsArray', 'sortCardsPTCG', 'fixCardNameEncoding',
    ];

    // Extract each function by finding "function NAME(" and capturing until
    // we find the next function at the same indent or end of source chunk
    const extracted = [];
    for (const fn of fnsToExtract) {
        // Try boundary-terminated extraction first
        const re = new RegExp(
            `(function ${fn}\\b[\\s\\S]*?)\\n(?=        function |        const |        let |        window\\.|        \\/\\/)`,
            'm'
        );
        const m = src.match(re);
        if (m) {
            extracted.push(m[1].trim());
        } else {
            // Fallback: extract from function declaration to closing brace via brace counting
            const startRe = new RegExp(`(        function ${fn}\\b)`, 'm');
            const startM = src.match(startRe);
            if (startM) {
                const startIdx = startM.index;
                let depth = 0;
                let endIdx = startIdx;
                let foundOpen = false;
                for (let i = startIdx; i < src.length; i++) {
                    if (src[i] === '{') { depth++; foundOpen = true; }
                    if (src[i] === '}') { depth--; }
                    if (foundOpen && depth === 0) { endIdx = i + 1; break; }
                }
                extracted.push(src.substring(startIdx, endIdx).trim());
            }
        }
    }

    // Also extract the constants needed by mapSetCodeToMetaFormat and normalizeTournamentFormatLabel
    const constantsRe = /const KNOWN_META_FORMAT_CODES[\s\S]*?(?=\n        function mapSetCodeToMetaFormat)/m;
    const cm = src.match(constantsRe);
    if (cm) extracted.unshift(cm[0].trim());

    const combinedSrc = extracted.join('\n\n');

    const sandbox = {
        console,
        String,
        Number,
        Object,
        Array,
        Map,
        Set,
        parseInt,
        parseFloat,
        isNaN,
        Math,
        JSON,
        RegExp,
        // Mock setOrderMap for mapSetCodeToMetaFormat
        setOrderMap: overrides.setOrderMap || {
            SVI: 1, SVE: 2, PAL: 3, OBF: 4, MEW: 5,
            PAR: 6, PAF: 7, TEF: 8, TWM: 9, SFA: 10,
            SCR: 11, SSP: 12, PRE: 13, JTG: 14, DRI: 15,
            BLK: 16, WHT: 17, PFL: 18, MEG: 19, ASC: 20,
            POR: 21,
        },
        fixMojibake: overrides.fixMojibake || ((v) => String(v || '')),
        normalizeCardName: overrides.normalizeCardName || ((v) => String(v || '').toLowerCase().trim()),
    };

    const ctx = vm.createContext(sandbox);
    vm.runInContext(combinedSrc, ctx, { filename: 'app-core-extract.js' });

    // Collect all functions from sandbox
    const fnsMap = {};
    for (const key of Object.getOwnPropertyNames(sandbox)) {
        if (typeof sandbox[key] === 'function' && fnsToExtract.includes(key)) {
            fnsMap[key] = sandbox[key];
        }
    }
    fnsMap._sandbox = sandbox;
    return fnsMap;
}

const fns = loadCoreFns();

// ── normalizeProxySetCode ───────────────────────────────────────────────────
describe('normalizeProxySetCode — normalization', () => {
    it('uppercases set code', () => {
        assert.equal(fns.normalizeProxySetCode('svi'), 'SVI');
    });
    it('trims whitespace', () => {
        assert.equal(fns.normalizeProxySetCode('  MEG  '), 'MEG');
    });
    it('returns empty for "???"', () => {
        assert.equal(fns.normalizeProxySetCode('???'), '');
    });
    it('returns empty for null', () => {
        assert.equal(fns.normalizeProxySetCode(null), '');
    });
    it('returns empty for empty string', () => {
        assert.equal(fns.normalizeProxySetCode(''), '');
    });
});

// ── normalizeProxyCardNumber ────────────────────────────────────────────────
describe('normalizeProxyCardNumber — normalization', () => {
    it('trims whitespace', () => {
        assert.equal(fns.normalizeProxyCardNumber('  123  '), '123');
    });
    it('returns empty for "?"', () => {
        assert.equal(fns.normalizeProxyCardNumber('?'), '');
    });
    it('returns empty for null', () => {
        assert.equal(fns.normalizeProxyCardNumber(null), '');
    });
    it('preserves alphanumeric numbers like "123a"', () => {
        assert.equal(fns.normalizeProxyCardNumber('123a'), '123a');
    });
});

// ── buildProxyItemId ────────────────────────────────────────────────────────
describe('buildProxyItemId — ID generation', () => {
    it('creates lowercase pipe-separated ID', () => {
        assert.equal(fns.buildProxyItemId('Pikachu', 'SVI', '025'), 'pikachu|SVI|025');
    });
    it('handles null card name', () => {
        assert.equal(fns.buildProxyItemId(null, 'SVI', '1'), '|SVI|1');
    });
    it('handles all nulls', () => {
        assert.equal(fns.buildProxyItemId(null, null, null), '||');
    });
    it('normalizes set code to uppercase', () => {
        assert.equal(fns.buildProxyItemId('Test', 'meg', '5'), 'test|MEG|5');
    });
});

// ── getCardDisplayName ──────────────────────────────────────────────────────
describe('getCardDisplayName — card name extraction', () => {
    it('returns name_en when available', () => {
        assert.equal(fns.getCardDisplayName({ name_en: 'Pikachu', name: 'ピカチュウ' }), 'Pikachu');
    });
    it('falls back to name when name_en missing', () => {
        assert.equal(fns.getCardDisplayName({ name: 'Charizard' }), 'Charizard');
    });
    it('returns empty for null', () => {
        assert.equal(fns.getCardDisplayName(null), '');
    });
    it('returns empty for empty object', () => {
        assert.equal(fns.getCardDisplayName({}), '');
    });
    it('trims whitespace', () => {
        assert.equal(fns.getCardDisplayName({ name_en: '  Mew  ' }), 'Mew');
    });
});

// ── getCardSetCode ──────────────────────────────────────────────────────────
describe('getCardSetCode — set code extraction', () => {
    it('returns normalized set code', () => {
        assert.equal(fns.getCardSetCode({ set: 'svi' }), 'SVI');
    });
    it('falls back to set_code', () => {
        assert.equal(fns.getCardSetCode({ set_code: 'meg' }), 'MEG');
    });
    it('returns empty for null', () => {
        assert.equal(fns.getCardSetCode(null), '');
    });
});

// ── getCardNumber ───────────────────────────────────────────────────────────
describe('getCardNumber — number extraction', () => {
    it('returns number from card', () => {
        assert.equal(fns.getCardNumber({ number: '025' }), '025');
    });
    it('falls back to set_number', () => {
        assert.equal(fns.getCardNumber({ set_number: '123' }), '123');
    });
    it('returns empty for null', () => {
        assert.equal(fns.getCardNumber(null), '');
    });
});

// ── healCurrentMetaCardRows ─────────────────────────────────────────────────
describe('healCurrentMetaCardRows — encoding repair', () => {
    const heal = loadCoreFns({
        fixMojibake: (v) => String(v || '').replace('PokÃ©', 'Poké'),
    });

    it('fixes encoding in card_name field', () => {
        const rows = [{ card_name: 'PokÃ©mon Catcher' }];
        heal.healCurrentMetaCardRows(rows);
        assert.equal(rows[0].card_name, 'Pokémon Catcher');
    });
    it('fixes encoding in full_card_name field', () => {
        const rows = [{ full_card_name: 'PokÃ©mon ex' }];
        heal.healCurrentMetaCardRows(rows);
        assert.equal(rows[0].full_card_name, 'Pokémon ex');
    });
    it('fixes encoding in name and name_en', () => {
        const rows = [{ name: 'PokÃ©mon', name_en: 'PokÃ©mon' }];
        heal.healCurrentMetaCardRows(rows);
        assert.equal(rows[0].name, 'Pokémon');
        assert.equal(rows[0].name_en, 'Pokémon');
    });
    it('returns non-array input unchanged', () => {
        assert.equal(heal.healCurrentMetaCardRows(null), null);
        assert.equal(heal.healCurrentMetaCardRows('string'), 'string');
    });
    it('skips null entries in array', () => {
        const rows = [null, { card_name: 'PokÃ©mon' }];
        heal.healCurrentMetaCardRows(rows);
        assert.equal(rows[0], null);
        assert.equal(rows[1].card_name, 'Pokémon');
    });
});

// ── sanitizeTournamentArchetypeName ─────────────────────────────────────────
describe('sanitizeTournamentArchetypeName — cleanup', () => {
    it('removes trailing price pattern', () => {
        const result = fns.sanitizeTournamentArchetypeName('Charizard ex12,50$10,00€');
        assert.equal(result, 'Charizard ex');
    });
    it('trims whitespace and NBSP', () => {
        const result = fns.sanitizeTournamentArchetypeName('Lugia VSTAR\u00a0');
        assert.equal(result, 'Lugia VSTAR');
    });
    it('returns empty for null', () => {
        assert.equal(fns.sanitizeTournamentArchetypeName(null), '');
    });
    it('returns empty for empty string', () => {
        assert.equal(fns.sanitizeTournamentArchetypeName(''), '');
    });
    it('preserves clean archetype name', () => {
        assert.equal(fns.sanitizeTournamentArchetypeName('Gardevoir ex'), 'Gardevoir ex');
    });
});

// ── mapSetCodeToMetaFormat ──────────────────────────────────────────────────
describe('mapSetCodeToMetaFormat — set code mapping', () => {
    it('maps POR → TEF-POR', () => {
        assert.equal(fns.mapSetCodeToMetaFormat('POR'), 'TEF-POR');
    });
    it('maps MEG → SVI-MEG', () => {
        assert.equal(fns.mapSetCodeToMetaFormat('MEG'), 'SVI-MEG');
    });
    it('maps BLK → SVI-BLK', () => {
        assert.equal(fns.mapSetCodeToMetaFormat('BLK'), 'SVI-BLK');
    });
    it('maps WHT → SVI-BLK (White Flare = Black Bolt era)', () => {
        assert.equal(fns.mapSetCodeToMetaFormat('WHT'), 'SVI-BLK');
    });
    it('maps TEF → BRS-TEF', () => {
        assert.equal(fns.mapSetCodeToMetaFormat('TEF'), 'BRS-TEF');
    });
    it('handles lowercase input', () => {
        assert.equal(fns.mapSetCodeToMetaFormat('por'), 'TEF-POR');
    });
    it('returns empty for null', () => {
        assert.equal(fns.mapSetCodeToMetaFormat(null), '');
    });
    it('returns empty for empty string', () => {
        assert.equal(fns.mapSetCodeToMetaFormat(''), '');
    });
    it('passes through compound codes like SVI-ASC', () => {
        const result = fns.mapSetCodeToMetaFormat('SVI-ASC');
        assert.equal(result, 'SVI-ASC');
    });
    it('maps legacy SVI-POR → TEF-POR', () => {
        assert.equal(fns.mapSetCodeToMetaFormat('SVI-POR'), 'TEF-POR');
    });
});

// ── normalizeTournamentFormatLabel ──────────────────────────────────────────
describe('normalizeTournamentFormatLabel — format normalization', () => {
    it('normalizes "Meta Live" → "Meta Live"', () => {
        assert.equal(fns.normalizeTournamentFormatLabel('Meta Live'), 'Meta Live');
    });
    it('normalizes "Meta Play!" → "Meta Play!"', () => {
        assert.equal(fns.normalizeTournamentFormatLabel('Meta Play!'), 'Meta Play!');
    });
    it('normalizes set code via mapSetCodeToMetaFormat', () => {
        assert.equal(fns.normalizeTournamentFormatLabel('POR'), 'TEF-POR');
    });
    it('normalizes known format name', () => {
        const result = fns.normalizeTournamentFormatLabel('Scarlet & Violet - Mega Evolution');
        assert.equal(result, 'SVI-MEG');
    });
    it('uses fallbackSetCode when raw is empty', () => {
        assert.equal(fns.normalizeTournamentFormatLabel('', 'MEG'), 'SVI-MEG');
    });
    it('returns raw when nothing matches', () => {
        assert.equal(fns.normalizeTournamentFormatLabel('Unknown Format XYZ', ''), 'Unknown Format XYZ');
    });
});

// ── normalizeCurrentMetaFallbackRows ────────────────────────────────────────
describe('normalizeCurrentMetaFallbackRows — data normalization', () => {
    it('returns empty array for non-array', () => {
        const result = fns.normalizeCurrentMetaFallbackRows(null);
        assert.equal(result.length, 0);
    });
    it('returns empty array for undefined', () => {
        const result = fns.normalizeCurrentMetaFallbackRows(undefined);
        assert.equal(result.length, 0);
    });
    it('sanitizes archetype name', () => {
        const rows = [{ archetype: 'Charizard ex\u00a0', card_name: 'Charmander', format: 'POR' }];
        const result = fns.normalizeCurrentMetaFallbackRows(rows);
        assert.equal(result[0].archetype, 'Charizard ex');
    });
    it('sets meta to "Meta Play!"', () => {
        const rows = [{ archetype: 'Lugia', card_name: 'Lugia V', format: 'POR' }];
        const result = fns.normalizeCurrentMetaFallbackRows(rows);
        assert.equal(result[0].meta, 'Meta Play!');
    });
    it('fills deck_count from deck_inclusion_count', () => {
        const rows = [{ archetype: 'Test', card_name: 'A', deck_inclusion_count: '5' }];
        const result = fns.normalizeCurrentMetaFallbackRows(rows);
        assert.equal(result[0].deck_count, '5');
    });
    it('filters out rows without card_name or archetype', () => {
        const rows = [
            { archetype: 'Test', card_name: 'Valid' },
            { archetype: '', card_name: 'No Archetype' },
            { archetype: 'Test', card_name: '' },
        ];
        const result = fns.normalizeCurrentMetaFallbackRows(rows);
        assert.equal(result.length, 1);
        assert.equal(result[0].card_name, 'Valid');
    });
    it('computes average_count_overall from total_count and total_decks_in_archetype', () => {
        const rows = [{
            archetype: 'Test', card_name: 'A',
            total_count: '20', total_decks_in_archetype: '10',
        }];
        const result = fns.normalizeCurrentMetaFallbackRows(rows);
        assert.equal(result[0].average_count_overall, '2.00');
    });
});

// ── parseArchetypeSelection ─────────────────────────────────────────────────
describe('parseArchetypeSelection — parser', () => {
    it('parses simple archetype name', () => {
        const result = fns.parseArchetypeSelection('Charizard ex');
        assert.equal(result.isGroup, false);
        assert.equal(result.displayArchetypeName, 'Charizard ex');
        assert.equal(result.targetArchetypes.length, 1);
        assert.equal(result.targetArchetypes[0], 'Charizard ex');
    });
    it('parses GROUP: prefix', () => {
        const result = fns.parseArchetypeSelection('GROUP:Charizard ex|Charizard VMAX');
        assert.equal(result.isGroup, true);
        assert.equal(result.targetArchetypes.length, 2);
        assert.equal(result.targetArchetypes[0], 'Charizard ex');
        assert.equal(result.targetArchetypes[1], 'Charizard VMAX');
    });
    it('uses first word as base name for groups', () => {
        const result = fns.parseArchetypeSelection('GROUP:Charizard ex|Charizard V');
        assert.equal(result.displayArchetypeName, 'Charizard (All Variants)');
    });
    it('handles null → empty target', () => {
        const result = fns.parseArchetypeSelection(null);
        assert.equal(result.isGroup, false);
        assert.equal(result.targetArchetypes[0], '');
    });
    it('handles empty string', () => {
        const result = fns.parseArchetypeSelection('');
        assert.equal(result.raw, '');
    });
    it('filters out empty pipe segments', () => {
        const result = fns.parseArchetypeSelection('GROUP:A||B|');
        assert.equal(result.targetArchetypes.length, 2);
    });
});

// ── filterCardsArray ────────────────────────────────────────────────────────
describe('filterCardsArray — search filtering', () => {
    const cards = [
        { name_en: 'Pikachu', name_de: 'Pikachu', set: 'SVI', number: '025', pokedex_number: '25' },
        { name_en: 'Charizard ex', name_de: 'Glurak ex', set: 'MEG', number: '006', pokedex_number: '6' },
        { name_en: 'Nest Ball', name_de: 'Nestball', set: 'SVI', number: '181', pokedex_number: '' },
    ];

    it('returns all cards for empty search', () => {
        assert.equal(fns.filterCardsArray(cards, '').length, 3);
    });
    it('returns all cards for null search', () => {
        assert.equal(fns.filterCardsArray(cards, null).length, 3);
    });
    it('filters by English name', () => {
        const result = fns.filterCardsArray(cards, 'pikachu');
        assert.equal(result.length, 1);
        assert.equal(result[0].name_en, 'Pikachu');
    });
    it('filters by German name', () => {
        const result = fns.filterCardsArray(cards, 'glurak');
        assert.equal(result.length, 1);
        assert.equal(result[0].name_en, 'Charizard ex');
    });
    it('filters by set code + number', () => {
        const result = fns.filterCardsArray(cards, 'svi 025');
        assert.equal(result.length, 1);
        assert.equal(result[0].name_en, 'Pikachu');
    });
    it('filters by exact pokedex number', () => {
        const result = fns.filterCardsArray(cards, '25');
        assert.equal(result.length, 1);
        assert.equal(result[0].name_en, 'Pikachu');
    });
    it('is case-insensitive', () => {
        const result = fns.filterCardsArray(cards, 'CHARIZARD');
        assert.equal(result.length, 1);
    });
    it('returns empty for no match', () => {
        const result = fns.filterCardsArray(cards, 'Mewtwo');
        assert.equal(result.length, 0);
    });
    it('handles partial name search', () => {
        const result = fns.filterCardsArray(cards, 'nest');
        assert.equal(result.length, 1);
        assert.equal(result[0].name_en, 'Nest Ball');
    });
});

// ── sortCardsPTCG ───────────────────────────────────────────────────────────
describe('sortCardsPTCG — card sorting', () => {
    it('sorts Pokémon before Supporter before Item', () => {
        const cards = [
            { name_en: 'Nest Ball', type: 'Item' },
            { name_en: 'Pikachu', type: 'Pokémon', pokedex_number: '25' },
            { name_en: "Professor's Research", type: 'Supporter' },
        ];
        const sorted = fns.sortCardsPTCG(cards);
        assert.equal(sorted[0].name_en, 'Pikachu');
        assert.equal(sorted[1].name_en, "Professor's Research");
        assert.equal(sorted[2].name_en, 'Nest Ball');
    });
    it('sorts Basic Energy after Special Energy', () => {
        const cards = [
            { name_en: 'Fire Energy', type: 'Basic Energy' },
            { name_en: 'Double Turbo Energy', type: 'Special Energy' },
        ];
        const sorted = fns.sortCardsPTCG(cards);
        assert.equal(sorted[0].name_en, 'Double Turbo Energy');
        assert.equal(sorted[1].name_en, 'Fire Energy');
    });
    it('sorts Pokémon by Pokédex number', () => {
        const cards = [
            { name_en: 'Charizard', type: 'Pokémon', pokedex_number: '6' },
            { name_en: 'Pikachu', type: 'Pokémon', pokedex_number: '25' },
            { name_en: 'Bulbasaur', type: 'Pokémon', pokedex_number: '1' },
        ];
        const sorted = fns.sortCardsPTCG(cards);
        assert.equal(sorted[0].name_en, 'Bulbasaur');
        assert.equal(sorted[1].name_en, 'Charizard');
        assert.equal(sorted[2].name_en, 'Pikachu');
    });
    it('sorts Trainers alphabetically by name', () => {
        const cards = [
            { name_en: 'Ultra Ball', type: 'Item' },
            { name_en: 'Nest Ball', type: 'Item' },
            { name_en: 'Arven', type: 'Supporter' },
        ];
        const sorted = fns.sortCardsPTCG(cards);
        // Supporter (2) before Item (3)
        assert.equal(sorted[0].name_en, 'Arven');
        assert.equal(sorted[1].name_en, 'Nest Ball');
        assert.equal(sorted[2].name_en, 'Ultra Ball');
    });
    it('handles "pokemon" (no accent) in type', () => {
        const cards = [
            { name_en: 'Boss', type: 'Supporter' },
            { name_en: 'Mew', type: 'Pokemon', pokedex_number: '151' },
        ];
        const sorted = fns.sortCardsPTCG(cards);
        assert.equal(sorted[0].name_en, 'Mew');
    });
    it('handles cards without type (category 8)', () => {
        const cards = [
            { name_en: 'Unknown' },
            { name_en: 'Pikachu', type: 'Pokémon', pokedex_number: '25' },
        ];
        const sorted = fns.sortCardsPTCG(cards);
        assert.equal(sorted[0].name_en, 'Pikachu');
        assert.equal(sorted[1].name_en, 'Unknown');
    });
    it('falls back to set/number when same category and name', () => {
        const cards = [
            { name_en: 'Pikachu', type: 'Pokémon', pokedex_number: '25', set: 'MEW', number: '025' },
            { name_en: 'Pikachu', type: 'Pokémon', pokedex_number: '25', set: 'SVI', number: '025' },
        ];
        const sorted = fns.sortCardsPTCG(cards);
        // MEW < SVI alphabetically
        assert.equal(sorted[0].set, 'MEW');
        assert.equal(sorted[1].set, 'SVI');
    });
    it('sorts Tool after Item (using "Tool" type)', () => {
        const cards = [
            { name_en: 'Choice Belt', type: 'Tool' },
            { name_en: 'Rare Candy', type: 'Item' },
        ];
        const sorted = fns.sortCardsPTCG(cards);
        assert.equal(sorted[0].name_en, 'Rare Candy');
        assert.equal(sorted[1].name_en, 'Choice Belt');
    });
    it('classifies "Pokémon Tool" as Tool (cat 4), NOT Pokémon (cat 1)', () => {
        const cards = [
            { name_en: 'Choice Belt', type: 'Pokémon Tool' },
            { name_en: 'Pikachu', type: 'Pokémon', pokedex_number: '25' },
            { name_en: 'Nest Ball', type: 'Item' },
        ];
        const sorted = fns.sortCardsPTCG(cards);
        // Pokémon (1) → Item (3) → Pokémon Tool (4)
        assert.equal(sorted[0].name_en, 'Pikachu');
        assert.equal(sorted[1].name_en, 'Nest Ball');
        assert.equal(sorted[2].name_en, 'Choice Belt');
    });
    it('handles Stadium type', () => {
        const cards = [
            { name_en: 'Temple', type: 'Stadium' },
            { name_en: 'Arven', type: 'Supporter' },
        ];
        const sorted = fns.sortCardsPTCG(cards);
        assert.equal(sorted[0].name_en, 'Arven');
        assert.equal(sorted[1].name_en, 'Temple');
    });
});
