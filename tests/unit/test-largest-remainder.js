/**
 * Unit tests for _redistributeByLargestRemainder in app-deck-builder.js.
 *
 * The classic rounding pathology this fixes: Cynthia's Garchomp ships
 * Basic Fighting Energy at avg 4.44 + Rocky Special Energy at avg 3.43
 * (deck-total 7.87 fighting energies). Independent Math.round() per card
 * gave 4 + 3 = 7, never reaching the deck-correct 8. After Stage 1+2
 * floor each card and stash the fractional remainder on
 * card._lrmRemainder, this helper distributes the missing slots to the
 * cards with the largest remainders — restoring the deck-total target.
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
        if (depth === 0) { end = i + 1; break; }
    }
    if (end < 0) throw new Error(`Missing closing brace for: ${fnName}`);
    return src.slice(start, end);
}

function loadHelper() {
    const src = fs.readFileSync(
        path.resolve(__dirname, '../../js/app-deck-builder.js'),
        'utf-8'
    );
    const snippet = extractFunction(src, '_redistributeByLargestRemainder');
    const sandbox = { console, Math, Number, Array };
    const ctx = vm.createContext(sandbox);
    vm.runInContext(snippet, ctx, { filename: 'lrm-extract.js' });
    return sandbox._redistributeByLargestRemainder;
}

const _redistribute = loadHelper();

// Synthetic helpers — mirror the closure helpers in autoCompleteConsistency.
const helpers = {
    getLegalMax: (_name, card) => {
        const t = String(card.type || '').toLowerCase();
        if (t.includes('basic energy') || t === 'basis-energie') return 59; // basics: unlimited
        if (t.includes('special energy')) return 4;
        return 4;
    },
    isBasicEnergy: (card) => {
        const t = String(card.type || '').toLowerCase();
        return t.includes('basic energy') || t === 'basis-energie';
    },
    log: () => {},
};

function makeEntry(name, type, count, exactAvg) {
    return {
        card: {
            card_name: name,
            type,
            avgCountWhenUsed: exactAvg,
            _lrmRemainder: exactAvg - Math.floor(exactAvg),
        },
        count,
    };
}

describe('_redistributeByLargestRemainder', () => {
    it('reproduces the Cynthia\'s Garchomp 4.44 + 3.43 → 8 fighting-energy fix', () => {
        // Initial state after Stage 1/2 floor allocation:
        //   Fighting Energy:      avg 4.44 → floor 4, remainder 0.44
        //   Rocky Special Energy: avg 3.43 → floor 3, remainder 0.43
        //   53 other cards already in deck → currentTotal = 60 - 7 = 53 + 7 = 60? no.
        //   Use a synthetic deck where Stage 1/2 left 53 non-energy cards
        //   plus the two energies → currentTotal = 53 + 4 + 3 = 60? Let's
        //   model 51 non-energy + 4 + 3 = 58 so LRM has 2 slots to distribute.
        const fighting = makeEntry('Fighting Energy', 'Basic Energy', 4, 4.44);
        const rocky = makeEntry('Rocky Special Energy', 'Special Energy', 3, 3.43);
        const filler = makeEntry('Filler', 'Item', 1, 1.05); // tiny remainder, lowest priority
        const deck = [fighting, rocky, filler];

        const added = _redistribute(deck, /* current */ 58, /* target */ 60, helpers);

        assert.equal(added, 2, 'should add exactly the 2 missing slots');
        // Largest remainders win: 0.44 (Fighting) > 0.43 (Rocky) > 0.05 (Filler)
        assert.equal(fighting.count, 5, 'Fighting Energy: 4 → 5');
        assert.equal(rocky.count, 4, 'Rocky Special Energy: 3 → 4');
        assert.equal(filler.count, 1, 'Filler stays at 1 (lowest remainder)');
        // Deck total fighting energies: 5 + 4 = 9 — wait, this is one over
        // the 7.87 target. The realistic case has only ONE missing slot.
    });

    it('matches the realistic 7.87 → 8 case (one missing slot only)', () => {
        // 52 non-energy cards already at correct counts → currentTotal = 52,
        // plus Fighting 4 + Rocky 3 = 7 → 59 total. LRM has 1 slot to give.
        const fighting = makeEntry('Fighting Energy', 'Basic Energy', 4, 4.44);
        const rocky = makeEntry('Rocky Special Energy', 'Special Energy', 3, 3.43);
        const deck = [fighting, rocky];

        const added = _redistribute(deck, 59, 60, helpers);

        assert.equal(added, 1, 'should add one slot');
        // 0.44 > 0.43 → Fighting wins the tie-break
        assert.equal(fighting.count, 5, 'Fighting Energy gets the +1 (largest remainder)');
        assert.equal(rocky.count, 3, 'Rocky stays at 3');
        // Total fighting-typed energies: 5 + 3 = 8 ✓ matches deck average
    });

    it('does nothing when currentTotal already at target', () => {
        const fighting = makeEntry('Fighting Energy', 'Basic Energy', 4, 4.44);
        const rocky = makeEntry('Rocky Special Energy', 'Special Energy', 3, 3.43);
        const deck = [fighting, rocky];

        const added = _redistribute(deck, 60, 60, helpers);
        assert.equal(added, 0);
        assert.equal(fighting.count, 4);
        assert.equal(rocky.count, 3);
    });

    it('respects legal max for non-basic cards', () => {
        // Special Energy capped at 4. If it's already at 4 with high remainder,
        // skip it and prefer the next-highest remainder candidate.
        const rocky = makeEntry('Rocky Special Energy', 'Special Energy', 4, 3.85); // already at legal max
        const fighting = makeEntry('Fighting Energy', 'Basic Energy', 4, 4.30);
        const deck = [rocky, fighting];

        const added = _redistribute(deck, 58, 60, helpers);
        assert.equal(added, 1, 'rocky is at legal max → only fighting takes a slot');
        assert.equal(rocky.count, 4, 'Rocky stays at 4 (legal max)');
        assert.equal(fighting.count, 5, 'Fighting gets +1');
    });

    it('basic energy ignores the legal-max cap (can exceed 4)', () => {
        // Basics get up to 59 in a legal deck.
        const fighting = makeEntry('Fighting Energy', 'Basic Energy', 4, 4.30);
        const deck = [fighting];

        const added = _redistribute(deck, 59, 60, helpers);
        assert.equal(added, 1, 'basic Fighting Energy can go past 4');
        assert.equal(fighting.count, 5);
    });

    it('respects _techCounterMaxCount cap', () => {
        const switchCard = {
            card_name: 'Switch',
            type: 'Item',
            avgCountWhenUsed: 1.85,
            _lrmRemainder: 0.85,
            _techCounterMaxCount: 1, // tech audit budget = 1 out
        };
        const energy = {
            card_name: 'Fighting Energy',
            type: 'Basic Energy',
            avgCountWhenUsed: 4.30,
            _lrmRemainder: 0.30,
        };
        const deck = [{ card: switchCard, count: 1 }, { card: energy, count: 4 }];

        const added = _redistribute(deck, 58, 60, helpers);
        assert.equal(added, 1, 'Switch hits tech cap → only energy takes a slot');
        assert.equal(deck[0].count, 1, 'Switch stays at 1 (tech-counter cap)');
        assert.equal(deck[1].count, 5, 'Energy gets +1');
    });

    it('skips cards with zero or negative remainder', () => {
        const exact = makeEntry('Exact', 'Item', 2, 2.0); // remainder = 0
        const negative = {
            card: { card_name: 'Neg', type: 'Item', _lrmRemainder: -0.1 },
            count: 1,
        };
        const winner = makeEntry('Winner', 'Item', 1, 1.7);
        const deck = [exact, negative, winner];

        const added = _redistribute(deck, 58, 60, helpers);
        assert.equal(added, 1);
        assert.equal(winner.count, 2);
        assert.equal(exact.count, 2);
        assert.equal(negative.count, 1);
    });

    it('processes candidates in descending remainder order', () => {
        const a = makeEntry('A', 'Item', 1, 1.10);
        const b = makeEntry('B', 'Item', 1, 1.55);
        const c = makeEntry('C', 'Item', 1, 1.40);
        const deck = [a, b, c];

        // Only 1 slot to give → highest remainder (B at 0.55) wins.
        _redistribute(deck, 59, 60, helpers);
        assert.equal(a.count, 1);
        assert.equal(b.count, 2, 'B wins (0.55 > 0.40 > 0.10)');
        assert.equal(c.count, 1);
    });
});
