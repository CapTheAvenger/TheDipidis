/**
 * Unit tests for _legalizeOnlineBuild in current-meta-quickref.js.
 *
 * The "Latest Online · Typical Build" is synthesized by rounding per-card
 * averages across `total_decks_in_archetype` decks. When >1 deck is averaged
 * the raw result breaks deck legality (>4 copies, >1 Ace Spec, >60 cards —
 * the reported "2 Decks · 69 cards" with 5 Charcadet + 2 Ace Specs). This
 * function legalizes it: ≤4 copies except Basic Energy, ≤1 Ace Spec, ≤60 total.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function extractTopLevel(src, fnName) {
    const re = new RegExp(`function\\s+${fnName}\\s*\\(`);
    const m = re.exec(src);
    if (!m) throw new Error(`Function not found: ${fnName}`);
    const start = m.index;
    const openIdx = src.indexOf('{', start);
    let depth = 0, end = -1;
    for (let i = openIdx; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') depth--;
        if (depth === 0) { end = i + 1; break; }
    }
    return src.slice(start, end);
}

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'current-meta-quickref.js'), 'utf8');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(extractTopLevel(src, '_legalizeOnlineBuild') + '\nthis.legalize = _legalizeOnlineBuild;', ctx);
const legalize = ctx.legalize;

function card(name, count, type, extra = {}) {
    return Object.assign({ name, count, type, is_ace_spec: false, _inclusion: 2, _avg: count }, extra);
}
function total(cards) { return cards.reduce((s, c) => s + c.count, 0); }
function find(cards, name) { return cards.find(c => c.name === name); }

describe('_legalizeOnlineBuild', () => {
    it('caps a non-energy card at 4 copies (the Charcadet 5 case)', () => {
        const out = legalize([card('Charcadet', 5, 'Basic'), card('Ceruledge ex', 3, 'Stage 1')]);
        assert.equal(find(out, 'Charcadet').count, 4);
    });

    it('does NOT cap Basic Energy', () => {
        const out = legalize([card('Fighting Energy', 13, 'Basic Energy'), card('Fire Energy', 7, 'Basic Energy')]);
        assert.equal(find(out, 'Fighting Energy').count, 13);
        assert.equal(find(out, 'Fire Energy').count, 7);
    });

    it('keeps only one Ace Spec (the highest-count one)', () => {
        const out = legalize([
            card('Legacy Energy', 1, 'Special Energy', { is_ace_spec: true, _inclusion: 1 }),
            card('Prism Tower', 2, 'Stadium', { is_ace_spec: true, _inclusion: 2 }),
            card('Charcadet', 4, 'Basic'),
        ]);
        const aces = out.filter(c => c.is_ace_spec);
        assert.equal(aces.length, 1);
        assert.equal(aces[0].name, 'Prism Tower');   // higher count wins
    });

    it('trims a >60 build down to exactly 60, dropping lowest-inclusion first', () => {
        const cards = [
            card('Core A', 4, 'Basic', { _inclusion: 2 }),
            card('Core B', 4, 'Basic', { _inclusion: 2 }),
            card('Fighting Energy', 48, 'Basic Energy', { _inclusion: 2 }), // uncapped bulk
            card('Artifact X', 3, 'Item', { _inclusion: 1 }), // only in 1 of 2 decks
            card('Artifact Y', 3, 'Item', { _inclusion: 1 }), // total = 62 → trim 2
        ];
        const out = legalize(cards);
        assert.equal(total(out), 60);
        // the low-inclusion artifacts are trimmed first; the inclusion-2 core
        // and the basic energy are untouched.
        assert.equal(find(out, 'Fighting Energy').count, 48);
        assert.equal(find(out, 'Core A').count, 4);
        const x = find(out, 'Artifact X');
        const y = find(out, 'Artifact Y');
        assert.equal((x ? x.count : 0) + (y ? y.count : 0), 4); // 6 → trimmed by 2
    });

    it('leaves a legal 60-card single-deck build unchanged', () => {
        const legal = [
            card('Charcadet', 4, 'Basic'),
            card('Ceruledge ex', 3, 'Stage 1'),
            card('Ultra Ball', 4, 'Item'),
            card('Fighting Energy', 28, 'Basic Energy'),
            card('Fire Energy', 21, 'Basic Energy'),
        ];
        const out = legalize(legal);
        assert.equal(total(out), 60);
        assert.equal(find(out, 'Charcadet').count, 4);
        assert.equal(find(out, 'Fighting Energy').count, 28);
    });
});
