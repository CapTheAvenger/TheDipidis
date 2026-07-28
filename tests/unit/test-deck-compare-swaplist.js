/**
 * The "changes only" view of Compare Built Decks (js/firebase-collection.js).
 *
 * The full list answers "what is in each deck". It does not answer the
 * question actually being asked at the table: which cards do I physically
 * pull out of the deck I built, and which do I put in. That needs deltas —
 * "Buddy-Buddy Poffin 3 -> 1" is two cards out, and the user should not have
 * to do that subtraction while holding a deck box.
 *
 * These tests pin the delta maths against the real numbers from the reported
 * screenshot (Mega Excadrill V1 vs V2).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// The swap computation, mirrored from showDeckComparison. Deck A is the built
// deck and therefore the baseline; positive delta means "put in".
function swapList(aggA, aggB) {
    const keys = new Set([...Object.keys(aggA), ...Object.keys(aggB)]);
    const out = [], into = [];
    keys.forEach(k => {
        const a = aggA[k] || 0, b = aggB[k] || 0;
        if (a === b) return;
        const delta = b - a;
        (delta < 0 ? out : into).push({ name: k, qty: Math.abs(delta), from: a, to: b });
    });
    out.sort((x, y) => y.qty - x.qty);
    into.sort((x, y) => y.qty - x.qty);
    return { out, into };
}

// Exactly the deck pair from the screenshot.
const V1 = {
    'Gravity Mountain': 1, 'Meowth ex': 1,
    'Buddy-Buddy Poffin': 3, 'Metal Energy': 14, 'Ultra Ball': 2,
    'Drilbur': 4, "Team Rocket's Petrel": 3, "Boss's Orders": 3,
    'Fezandipiti ex': 1, 'Mega Excadrill ex': 2,
};
const V2 = {
    'Pokégear 3.0': 3,
    'Buddy-Buddy Poffin': 1, 'Metal Energy': 15, 'Ultra Ball': 1,
    'Drilbur': 3, "Team Rocket's Petrel": 4, "Boss's Orders": 4,
    'Fezandipiti ex': 1, 'Mega Excadrill ex': 2,
};

describe('deck swap list', () => {
    const { out, into } = swapList(V1, V2);
    const byName = list => Object.fromEntries(list.map(c => [c.name, c.qty]));

    it('lists what to take out, including partial count drops', () => {
        assert.deepEqual(byName(out), {
            'Gravity Mountain': 1,      // only in V1
            'Meowth ex': 1,             // only in V1
            'Buddy-Buddy Poffin': 2,    // 3 -> 1
            'Ultra Ball': 1,            // 2 -> 1
            'Drilbur': 1,               // 4 -> 3
        });
    });

    it('lists what to put in, including partial count rises', () => {
        assert.deepEqual(byName(into), {
            'Pokégear 3.0': 3,          // only in V2
            'Metal Energy': 1,          // 14 -> 15
            "Team Rocket's Petrel": 1,  // 3 -> 4
            "Boss's Orders": 1,         // 3 -> 4
        });
    });

    it('hides everything that does not change', () => {
        const names = [...out, ...into].map(c => c.name);
        assert.ok(!names.includes('Fezandipiti ex'));
        assert.ok(!names.includes('Mega Excadrill ex'));
    });

    it('the two sides balance, so the deck stays 60 cards', () => {
        const sum = l => l.reduce((s, c) => s + c.qty, 0);
        const before = Object.values(V1).reduce((s, n) => s + n, 0);
        const after = Object.values(V2).reduce((s, n) => s + n, 0);
        assert.equal(after - before, sum(into) - sum(out));
    });

    it('shows the biggest change first', () => {
        assert.equal(into[0].name, 'Pokégear 3.0');
        assert.equal(into[0].qty, 3);
        assert.ok(out[0].qty >= out[out.length - 1].qty);
    });

    it('keeps the before/after numbers for a card that only changed count', () => {
        const poffin = out.find(c => c.name === 'Buddy-Buddy Poffin');
        assert.equal(poffin.from, 3);
        assert.equal(poffin.to, 1);
        const gravity = out.find(c => c.name === 'Gravity Mountain');
        assert.equal(gravity.to, 0, 'a card cut entirely goes to zero');
    });

    it('treats basic energy by the 4-copy rule, not by its name', () => {
        // Decks store the reported case as "Metal Energy", without the word
        // Basic — so a name test alone misses it. A deck may hold at most 4 of
        // any card EXCEPT basic energy, so >4 copies of an "… Energy" card is
        // basic energy whatever the label says. Special energies stay in the
        // image grid, where they belong.
        const isBasicEnergy = (name, a, b) =>
            /energy/i.test(name) && (/^basic\s/i.test(name) || Math.max(a, b) > 4);

        assert.equal(isBasicEnergy('Metal Energy', 14, 15), true, 'the reported case');
        assert.equal(isBasicEnergy('Basic Fire Energy', 8, 8), true);
        assert.equal(isBasicEnergy('Legacy Energy', 1, 2), false, 'ACE SPEC energy is a real swap');
        assert.equal(isBasicEnergy('Luminous Energy', 3, 4), false);
        assert.equal(isBasicEnergy('Jet Energy', 4, 3), false, '4 copies is still within the limit');
        assert.equal(isBasicEnergy('Energy Recycler', 1, 2), false, 'not an energy card at all');
    });

    it('says nothing to do when the decks match', () => {
        const r = swapList(V1, V1);
        assert.equal(r.out.length, 0);
        assert.equal(r.into.length, 0);
    });
});
