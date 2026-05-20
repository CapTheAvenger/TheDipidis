/**
 * Unit tests for the canonical card-key utility (js/modules/card-key.js).
 *
 * Verifies the parse + format helpers handle every variant the legacy
 * regexes scattered across the codebase had to deal with: classic
 * "Name (SET NUM)" strings, dashes in set codes (e.g. "PR-SV"),
 * alphanumeric numbers (e.g. "TG14"), and bare names with no print info.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('parseCardKey', () => {
    it('parses classic 3-letter set + numeric number', async () => {
        const { parseCardKey } = await import('../../js/modules/card-key.js');
        assert.deepEqual(
            parseCardKey("Boss's Orders (RCL 189)"),
            { name: "Boss's Orders", setCode: 'RCL', number: '189' }
        );
    });

    it('parses alphanumeric number (TG / promo-style)', async () => {
        const { parseCardKey } = await import('../../js/modules/card-key.js');
        assert.deepEqual(
            parseCardKey('Lugia VSTAR (SIT TG14)'),
            { name: 'Lugia VSTAR', setCode: 'SIT', number: 'TG14' }
        );
    });

    it('parses dashes in set code (e.g. PR-SV promos)', async () => {
        const { parseCardKey } = await import('../../js/modules/card-key.js');
        assert.deepEqual(
            parseCardKey('Charizard ex (PR-SV 42)'),
            { name: 'Charizard ex', setCode: 'PR-SV', number: '42' }
        );
    });

    it('preserves whitespace inside the card name', async () => {
        const { parseCardKey } = await import('../../js/modules/card-key.js');
        const parsed = parseCardKey('Iron Hands ex (PAR 70)');
        assert.equal(parsed.name, 'Iron Hands ex');
    });

    it('returns null for bare card name (no parens)', async () => {
        const { parseCardKey } = await import('../../js/modules/card-key.js');
        assert.equal(parseCardKey('Rare Candy'), null);
    });

    it('returns null for empty / null / non-string input', async () => {
        const { parseCardKey } = await import('../../js/modules/card-key.js');
        assert.equal(parseCardKey(''), null);
        assert.equal(parseCardKey(null), null);
        assert.equal(parseCardKey(undefined), null);
        assert.equal(parseCardKey(42), null);
    });

    it('returns null when parens content is malformed', async () => {
        const { parseCardKey } = await import('../../js/modules/card-key.js');
        assert.equal(parseCardKey('Foo (RCL)'), null);   // missing number
        assert.equal(parseCardKey('Foo ( )'), null);     // empty parens
        assert.equal(parseCardKey('Foo (RCL bar baz)'), null); // 3 tokens
    });
});

describe('formatCardKey', () => {
    it('builds the canonical string', async () => {
        const { formatCardKey } = await import('../../js/modules/card-key.js');
        assert.equal(formatCardKey('Boss\'s Orders', 'RCL', '189'), "Boss's Orders (RCL 189)");
    });

    it('returns bare name when set or number missing', async () => {
        const { formatCardKey } = await import('../../js/modules/card-key.js');
        assert.equal(formatCardKey('Rare Candy'), 'Rare Candy');
        assert.equal(formatCardKey('Rare Candy', 'RCL'), 'Rare Candy');
        assert.equal(formatCardKey('Rare Candy', '', '189'), 'Rare Candy');
    });

    it('trims whitespace from the name', async () => {
        const { formatCardKey } = await import('../../js/modules/card-key.js');
        assert.equal(formatCardKey('  Boss  ', 'RCL', '189'), 'Boss (RCL 189)');
    });

    it('round-trips with parseCardKey', async () => {
        const { parseCardKey, formatCardKey } = await import('../../js/modules/card-key.js');
        const input = 'Iron Hands ex (PAR 70)';
        const parsed = parseCardKey(input);
        const rebuilt = formatCardKey(parsed.name, parsed.setCode, parsed.number);
        assert.equal(rebuilt, input);
    });
});

describe('getCardName', () => {
    it('returns the name portion of a print-key', async () => {
        const { getCardName } = await import('../../js/modules/card-key.js');
        assert.equal(getCardName('Boss\'s Orders (RCL 189)'), "Boss's Orders");
    });

    it('returns the bare input unchanged when no print info', async () => {
        const { getCardName } = await import('../../js/modules/card-key.js');
        assert.equal(getCardName('Rare Candy'), 'Rare Candy');
    });

    it('handles empty / null safely', async () => {
        const { getCardName } = await import('../../js/modules/card-key.js');
        assert.equal(getCardName(''), '');
        assert.equal(getCardName(null), '');
    });
});

describe('hasPrintInfo', () => {
    it('true for "Name (SET NUM)"', async () => {
        const { hasPrintInfo } = await import('../../js/modules/card-key.js');
        assert.equal(hasPrintInfo('Boss\'s Orders (RCL 189)'), true);
    });

    it('false for bare name or invalid input', async () => {
        const { hasPrintInfo } = await import('../../js/modules/card-key.js');
        assert.equal(hasPrintInfo('Rare Candy'), false);
        assert.equal(hasPrintInfo(''), false);
        assert.equal(hasPrintInfo(null), false);
    });
});

describe('printId', () => {
    it('builds SET-NUMBER from a key string', async () => {
        const { printId } = await import('../../js/modules/card-key.js');
        assert.equal(printId('Boss\'s Orders (RCL 189)'), 'RCL-189');
    });

    it('builds SET-NUMBER from a parsed object', async () => {
        const { printId } = await import('../../js/modules/card-key.js');
        assert.equal(printId({ setCode: 'PAR', number: '70' }), 'PAR-70');
    });

    it('null for bare name / invalid', async () => {
        const { printId } = await import('../../js/modules/card-key.js');
        assert.equal(printId('Rare Candy'), null);
        assert.equal(printId(''), null);
        assert.equal(printId(null), null);
    });
});
