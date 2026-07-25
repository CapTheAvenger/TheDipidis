/**
 * Unit test for the Probability Calculator's topdeck figure
 * (js/app-calculator.js, "3. Topdeck-Wahrscheinlichkeit").
 *
 * The topdeck chance is the probability that the next card off the deck is one
 * of the copies you have not already drawn. After the opening hand there are
 * deckSize - drawn UNSEEN cards; six of them become prizes, but which six is
 * unknown, so every unseen card is equally likely to be the one on top.
 *
 * The original formula divided by deckSize - drawn - 6 — the deck without the
 * prizes — while still counting every not-in-hand copy in the numerator. That
 * overstates the chance on every input and can exceed 100 %: deck 10, drawn 1,
 * copies 4 produced 4/3 = 133.33 %.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', 'js', 'app-calculator.js'), 'utf8');

// Mirror of the shipped expression, extracted so the test fails if the file
// stops containing it.
function topdeck(deckSize, copies, drawn, inHand) {
    const copiesLeft = copies - inHand;
    const remaining = Math.max(deckSize - drawn - 6, 0);
    const unseen = Math.max(deckSize - drawn, 0);
    if (!(remaining > 0 && copiesLeft > 0 && unseen > 0)) return 0;
    return Math.min(100, (copiesLeft / unseen) * 100);
}

describe('calculator topdeck probability', () => {
    it('uses the unseen pool (deck + prizes) as the denominator', () => {
        assert.ok(SRC.includes('const unseen = Math.max(deckSize - drawn, 0)'),
            'app-calculator.js no longer computes the unseen pool');
        assert.ok(SRC.includes('(copiesLeft / unseen) * 100'),
            'app-calculator.js no longer divides by the unseen pool');
        assert.ok(!SRC.includes('(copiesLeft / remaining) * 100'),
            'the old deck-only denominator is back');
    });

    it('is 4/53 for a standard 60-card deck with a 4-of and a 7-card hand', () => {
        assert.equal(topdeck(60, 4, 7, 0).toFixed(2), (400 / 53).toFixed(2));
    });

    it('never exceeds 100 %', () => {
        // The case that produced 133.33 % before.
        assert.equal(topdeck(10, 4, 1, 0), 100 * 4 / 9);
        for (let deck = 1; deck <= 99; deck++) {
            for (let drawn = 1; drawn <= deck; drawn++) {
                for (let copies = 1; copies <= Math.min(deck, 8); copies++) {
                    const p = topdeck(deck, copies, drawn, 0);
                    assert.ok(p >= 0 && p <= 100,
                        `out of range: deck=${deck} drawn=${drawn} copies=${copies} -> ${p}`);
                }
            }
        }
    });

    it('is 0 when every copy is already in hand', () => {
        assert.equal(topdeck(60, 4, 7, 4), 0);
    });

    it('drops as copies move into the hand', () => {
        const none = topdeck(60, 4, 7, 0);
        const two = topdeck(60, 4, 7, 2);
        assert.ok(two < none, `${two} should be below ${none}`);
    });

    it('is 0 when the deck is exhausted by hand + prizes', () => {
        // 7 drawn + 6 prizes = 13; a 13-card deck leaves nothing to top-deck.
        assert.equal(topdeck(13, 4, 7, 0), 0);
    });
});
