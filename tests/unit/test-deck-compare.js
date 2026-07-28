/**
 * Unit tests for the decklist comparison (js/app-features.js).
 *
 * The comparison keyed on `${set}-${number}`, so the same card from a
 * different print counted as two different cards — one removed, one added.
 * Comparing two builds of the same deck a few weeks apart therefore produced
 * "everything removed, everything added", which is both lists written out and
 * answers nothing. Measured on a realistic pair before the fix: of 5 identical
 * cards, exactly 1 was reported as unchanged.
 *
 * A second bug in the same path: a line without a set and number ("4 Iono")
 * matched no pattern and was dropped without a word, so the card silently
 * vanished from the comparison.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', 'js', 'app-features.js'), 'utf8');

function load() {
    const norm = SRC.match(/function normalizeDeckCardName\(name\)[\s\S]*?\n        \}\n/);
    const parse = SRC.match(/function parseDeckList\(text\)[\s\S]*?\n        \}\n/);
    if (!norm || !parse) throw new Error('could not extract the parser');
    const ns = {};
    new Function('exports', norm[0] + parse[0] +
        'exports.normalizeDeckCardName=normalizeDeckCardName;exports.parseDeckList=parseDeckList;')(ns);
    return ns;
}
const { parseDeckList, normalizeDeckCardName } = load();

// Mirrors the fold step in profileCompareDecklists: group by card, sum counts
// across prints, remember which prints were seen.
function fold(entries) {
    const out = new Map();
    entries.forEach(c => {
        const k = c.nameKey || normalizeDeckCardName(c.name);
        const prev = out.get(k);
        if (prev) {
            prev.count += c.count;
            if (c.set && !prev.prints.some(p => p.set === c.set && p.number === c.number)) {
                prev.prints.push({ set: c.set, number: c.number });
            }
        } else {
            out.set(k, { name: c.name, count: c.count,
                         prints: c.set ? [{ set: c.set, number: c.number }] : [] });
        }
    });
    return out;
}

function diff(textA, textB) {
    const a = parseDeckList(textA), b = parseDeckList(textB);
    const om = fold(a), nm = fold(b);
    const r = { removed: [], added: [], changed: [], same: [], reprinted: [],
                unparsed: [].concat(a.unparsed || [], b.unparsed || []) };
    new Set([...om.keys(), ...nm.keys()]).forEach(k => {
        const o = om.get(k), n = nm.get(k);
        if (o && !n) r.removed.push(o.name);
        else if (!o && n) r.added.push(n.name);
        else if (o.count !== n.count) r.changed.push(`${o.count}->${n.count} ${n.name}`);
        else {
            r.same.push(n.name);
            const pa = o.prints.map(p => `${p.set} ${p.number}`).sort().join(',');
            const pb = n.prints.map(p => `${p.set} ${p.number}`).sort().join(',');
            if (pa && pb && pa !== pb) r.reprinted.push(n.name);
        }
    });
    return r;
}

describe('decklist comparison', () => {
    it('recognises the same deck across reprints — the reported bug', () => {
        const A = ["4 Iono PAL 185", "3 Boss's Orders PAL 172", "4 Ultra Ball SVI 196",
                   "2 Professor's Research SVI 189", "1 Charizard ex OBF 125"].join('\n');
        const B = ["4 Iono PAF 237", "3 Boss's Orders RCL 154", "4 Ultra Ball BRS 186",
                   "2 Professor's Research SVI 189", "1 Charizard ex OBF 125"].join('\n');
        const r = diff(A, B);
        assert.equal(r.same.length, 5, 'all five cards are the same card');
        assert.equal(r.removed.length, 0);
        assert.equal(r.added.length, 0);
        assert.equal(r.reprinted.length, 3, 'the three reprints are flagged, not faked as add/remove');
    });

    it('still reports real deckbuilding changes', () => {
        const A = ["4 Iono PAL 185", "2 Boss's Orders PAL 172", "1 Squawkabilly ex PAL 169"].join('\n');
        const B = ["4 Iono PAF 237", "3 Boss's Orders RCL 154", "1 Earthen Vessel PAR 163"].join('\n');
        const r = diff(A, B);
        assert.deepEqual(r.removed, ['Squawkabilly ex']);
        assert.deepEqual(r.added, ['Earthen Vessel']);
        assert.deepEqual(r.changed, ["2->3 Boss's Orders"]);
        assert.deepEqual(r.same, ['Iono']);
    });

    it('sums a card split over two prints', () => {
        const m = fold(parseDeckList("2 Iono PAL 185\n2 Iono PAF 237"));
        assert.equal(m.get(normalizeDeckCardName('Iono')).count, 4);
    });

    it('reads a line with no set or number instead of dropping it', () => {
        const r = diff("2 Professor's Research SVI 189", "2 Professor's Research");
        assert.deepEqual(r.same, ["Professor's Research"]);
        assert.equal(r.removed.length + r.added.length, 0);
    });

    it('treats a typographic apostrophe as the same card', () => {
        // Phone keyboards produce U+2019; a PC list has the plain quote. The
        // assertion is on the MATCH, not on which glyph survives into the
        // display name — that is whichever list was folded second.
        const r = diff("3 Boss's Orders PAL 172", "3 Boss’s Orders PAL 172");
        assert.equal(r.same.length, 1);
        assert.equal(r.removed.length + r.added.length, 0,
            'the same card typed with two different apostrophes must not split in two');
    });

    it('reports lines it cannot read', () => {
        const r = diff("4 Iono PAL 185", "4 Iono PAL 185\n???");
        assert.deepEqual(r.unparsed, ['???']);
    });

    it('ignores PTCGL section headers', () => {
        const r = diff("Pokémon: 1\n1 Charizard ex OBF 125",
                       "Trainer: 1\n1 Charizard ex OBF 125");
        assert.deepEqual(r.same, ['Charizard ex']);
        assert.equal(r.unparsed.length, 0);
    });

    it('matches PTCGL basic energy against a normal energy line', () => {
        const r = diff("10 Basic {R} Energy Energy", "10 Basic Fire Energy SVE 2");
        assert.equal(r.same.length, 1, 'the same energy written two ways is one card');
    });
});
