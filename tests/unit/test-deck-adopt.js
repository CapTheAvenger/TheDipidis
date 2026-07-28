/**
 * Unit tests for _mergeAdoptOnly (js/firebase-globals.js).
 *
 * loadUserDecks used to stop as soon as it found a local deck mirror: "the
 * mirror is authoritative, never read the server". That protected unsynced
 * offline edits, and it also meant a device that had ever saved a deck could
 * never see a deck saved anywhere else — two decks saved on a PC stayed
 * invisible on the phone.
 *
 * The fix keeps the mirror authoritative for everything it already holds and
 * only ADDS decks the server has that we don't. The whole point is that it
 * cannot change or remove an existing deck, so that is what these tests pin —
 * a richer last-write-wins merge was reviewed and rejected because the deck
 * mutation paths don't stamp updatedAtMs and the mirror and server use two
 * different clocks.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', 'js', 'firebase-globals.js'), 'utf8');

function load() {
    const m = SRC.match(/function _mergeAdoptOnly\(mirrorDecks, serverDecks\)[\s\S]*?\n\}\n/);
    if (!m) throw new Error('could not extract _mergeAdoptOnly');
    const ns = {};
    new Function('exports', m[0] + 'exports._mergeAdoptOnly=_mergeAdoptOnly;')(ns);
    return ns._mergeAdoptOnly;
}
const merge = load();

const deck = (id, extra) => Object.assign({ id, name: id }, extra || {});

describe('adopt-only deck merge', () => {
    it('adopts decks saved on another device — the reported bug', () => {
        const mirror = [deck('phone-1')];
        const server = [deck('phone-1'), deck('pc-a'), deck('pc-b')];
        const r = merge(mirror, server);
        assert.deepEqual(r.decks.map(d => d.id).sort(), ['pc-a', 'pc-b', 'phone-1']);
        assert.deepEqual(r.adopted.map(d => d.id).sort(), ['pc-a', 'pc-b']);
    });

    it('never overwrites a deck this device already has', () => {
        // The local copy may hold an offline edit that was never pushed.
        const mirror = [deck('d', { name: 'local edit' })];
        const server = [deck('d', { name: 'older server copy' })];
        const r = merge(mirror, server);
        assert.equal(r.decks.length, 1);
        assert.equal(r.decks[0].name, 'local edit');
        assert.equal(r.adopted.length, 0);
    });

    it('never drops a deck the server does not have', () => {
        // Created offline and not yet pushed — dropping it would lose work.
        const mirror = [deck('offline-only')];
        const r = merge(mirror, []);
        assert.deepEqual(r.decks.map(d => d.id), ['offline-only']);
    });

    it('is purely additive: every local deck survives, whatever the server says', () => {
        const mirror = [deck('a'), deck('b'), deck('c')];
        const server = [deck('b', { name: 'changed' }), deck('z')];
        const r = merge(mirror, server);
        ['a', 'b', 'c'].forEach(id =>
            assert.ok(r.decks.some(d => d.id === id), `${id} must survive`));
        assert.equal(r.decks.find(d => d.id === 'b').name, 'b', 'local copy kept');
        assert.ok(r.decks.some(d => d.id === 'z'), 'server-only deck adopted');
        assert.equal(r.decks.length, 4);
    });

    it('handles an empty mirror (first run on a device)', () => {
        const r = merge([], [deck('x'), deck('y')]);
        assert.equal(r.decks.length, 2);
        assert.equal(r.adopted.length, 2);
    });

    it('survives null and malformed input', () => {
        assert.equal(merge(null, null).decks.length, 0);
        assert.equal(merge([null, { noId: 1 }], [null]).decks.length, 0);
    });

    it('does not duplicate a deck present on both sides', () => {
        const r = merge([deck('same')], [deck('same')]);
        assert.equal(r.decks.length, 1);
        assert.equal(r.adopted.length, 0);
    });
});
