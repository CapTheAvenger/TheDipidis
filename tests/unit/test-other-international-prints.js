/**
 * Unit tests for getOtherInternationalPrintOwnedCount()
 *
 * Bugfix target: sparkle badge must count only cards that are in the current
 * card's international_prints family, not all cards with the same name.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadAppUtils } = require('./test-helpers');

function makeUtils() {
    const cardsBySetNumberMap = {
        'AAA-1': {
            set: 'AAA',
            number: '1',
            name: 'Ralts',
            international_prints: 'AAA-1,BBB-2,CCC-3'
        },
        'BBB-2': {
            set: 'BBB',
            number: '2',
            name: 'Ralts',
            international_prints: 'AAA-1,BBB-2,CCC-3'
        },
        'CCC-3': {
            set: 'CCC',
            number: '3',
            name: 'Ralts',
            international_prints: 'AAA-1,BBB-2,CCC-3'
        },
        // Same card name, but NOT part of the international prints family above
        'ZZZ-99': {
            set: 'ZZZ',
            number: '99',
            name: 'Ralts',
            international_prints: 'ZZZ-99'
        }
    };

    return loadAppUtils({
        cardsBySetNumberMap,
        getIndexedCardBySetNumber: (set, number) => cardsBySetNumberMap[`${set}-${number}`] || null,
        normalizeSetCode: (s) => String(s || '').toUpperCase().trim(),
        normalizeCardNumber: (n) => String(n || '').trim(),
    });
}

describe('getOtherInternationalPrintOwnedCount', () => {
    it('counts only other prints from international_prints family', () => {
        const fns = makeUtils();
        const collection = new Map([
            ['Ralts|AAA|1', 4],   // current print -> must be excluded
            ['Ralts|BBB|2', 2],   // included
            ['Ralts|CCC|3', 1],   // included
            ['Ralts|ZZZ|99', 12], // same name but different print family -> excluded
            ['Kirlia|BBB|2', 5],  // same set/num key shape; counted by print identity
        ]);

        const result = fns.getOtherInternationalPrintOwnedCount('AAA', '1', collection);
        assert.equal(result, 8); // BBB-2 (2+5) + CCC-3 (1)
    });

    it('returns 0 when card has no international_prints mapping', () => {
        const fns = makeUtils();
        const collection = new Map([
            ['Ralts|BBB|2', 3],
            ['Ralts|CCC|3', 2],
        ]);

        const result = fns.getOtherInternationalPrintOwnedCount('MISSING', '404', collection);
        assert.equal(result, 0);
    });

    it('returns 0 when no other prints are owned', () => {
        const fns = makeUtils();
        const collection = new Map([
            ['Ralts|AAA|1', 4], // current only
        ]);

        const result = fns.getOtherInternationalPrintOwnedCount('AAA', '1', collection);
        assert.equal(result, 0);
    });
});
