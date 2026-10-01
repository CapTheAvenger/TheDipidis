'use strict';
/*
 * UI-53 (01.10.2026): Gruppierung der "Meistgespielten Archetypen" in
 * js/app-tier-meta.js. Die Funktion wird geschnitten und AUSGEFUEHRT.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const TM = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app-tier-meta.js'), 'utf8');
const PM = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app-past-meta.js'), 'utf8');

function schneide(quelle, name) {
    const m = new RegExp('\\n {8}function ' + name + '\\(').exec(quelle);
    assert.ok(m, name + ' fehlt');
    return quelle.slice(m.index, quelle.indexOf('\n        }\n', m.index + 1) + 10);
}
function laden(quelle) {
    const hand = PM.match(/ {8}const THEMEN_FAMILIEN = \{[\s\S]*?\n {8}\};\n/)[0];
    // eslint-disable-next-line no-new-func
    return new Function(hand + schneide(quelle, 'getCombinedMainArchetypeLabel') + '\nreturn getCombinedMainArchetypeLabel;')();
}

describe('UI-53 Kachelgruppen', () => {
    const f = laden(TM);
    it('Possessiv-Namen behalten das Pokemon', () => {
        assert.strictEqual(f("N's Zoroark"), "n's zoroark");
        assert.strictEqual(f("N's Reshiram"), "n's reshiram");
        assert.strictEqual(f("N's Zoroark Reshiram"), "n's zoroark");
    });
    it('"Basic" ist kein Pokemon', () => {
        assert.strictEqual(f('Basic Box'), 'basic box');
    });
    it('Themen-Familien teilen sich eine Kachel', () => {
        assert.strictEqual(f('Future Box'), 'future');
        assert.strictEqual(f('Future Thorns'), 'future');
        assert.strictEqual(f("Hop's Zacian"), "hop's");
        assert.strictEqual(f('Fusion Mew'), 'mew');
        assert.strictEqual(f('Lost Zone Box'), 'lost box');
        assert.strictEqual(f('Lucario Hariyama'), 'lucario');
        assert.strictEqual(f("Rocket's Mewtwo"), "rocket's");
        assert.strictEqual(f('Seaking Festival Lead'), 'festival lead');
    });
    it('bisherige Faelle unveraendert', () => {
        assert.strictEqual(f('Dragapult Dusknoir'), 'dragapult');
        assert.strictEqual(f('Mega Gardevoir Mewtwo'), 'mega gardevoir');
        assert.strictEqual(f('Alolan Ninetales'), 'alolan ninetales');
    });
    it('VERFAELSCHUNG: ohne die Possessiv-Regel wieder "n\'s"', () => {
        const kaputt = TM.replace("if (raw.includes(' ') && /['\\u2019]s$/.test(erstes)) {", 'if (false) {');
        assert.notStrictEqual(kaputt, TM);
        assert.strictEqual(laden(kaputt)("N's Zoroark"), "n's");
    });
});
