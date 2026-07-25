/**
 * Unit tests for js/wishlist-bot-import.js.
 *
 * Two layers:
 *   1. The parser, which is pure and always runs.
 *   2. The full paste → preview → write flow, which needs a DOM and is
 *      skipped when jsdom is absent (it is not a repo dependency; the CI
 *      job installs it only for the Playwright suite). The important
 *      invariant lives here: an import must never LOWER a quantity the
 *      user set by hand, because the list comes from someone else's bot.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'js', 'wishlist-bot-import.js');
const CODE = fs.readFileSync(SRC, 'utf8');

// ── 1. Parser ───────────────────────────────────────────────────────────────

// The module is an IIFE that registers its exports on `window` and reads a
// handful of app globals as bare identifiers. Injecting all of them as
// function parameters runs the real file unmodified, without depending on
// jsdom's script execution.
function load(win, doc, deps) {
    const d = Object.assign({
        getLang: () => 'de',
        showNotification: () => {},
        auth: { currentUser: { uid: 'u1' } },
        updateCollectionUI: () => {},
        filterWishlist: () => {},
        db: null,
        firebase: null,
    }, deps || {});
    new Function('window', 'document', 'getLang', 'showNotification', 'auth',
                 'updateCollectionUI', 'filterWishlist', 'db', 'firebase', CODE)(
        win, doc, d.getLang, d.showNotification, d.auth,
        d.updateCollectionUI, d.filterWishlist, d.db, d.firebase);
    return win;
}

function loadParser() {
    // The parser touches no DOM; a stub that swallows the module's two
    // document-level listeners is enough.
    const win = { escapeHtml: String, escapeHtmlAttr: String };
    win.window = win;
    return load(win, { addEventListener() {} }).__wishlistBotParse;
}

describe('parseBotMessage', () => {
    const parse = loadParser();

    it('reads the bot\'s real output', () => {
        const { entries } = parse([
            '🏆 Set PBL — gespielt in Top-10-Decks (alle 18), nach Nummer:',
            '1. PBL 5 · Poltchageist · Common — normal 0,03 € · RH 0,02 €',
            '     in 1 Deck',
            '2. PBL 12 · Rellor · Common — normal 0,04 € · RH 0,03 €',
            '     in 3 Decks',
        ].join('\n'));
        assert.equal(entries.length, 2);
        assert.deepEqual(
            entries.map(e => [e.set, e.number, e.name, e.rarity, e.decks]),
            [['PBL', '5', 'Poltchageist', 'Common', 1],
             ['PBL', '12', 'Rellor', 'Common', 3]]);
    });

    it('treats "in N Decks" as coverage, never as a quantity', () => {
        const { entries } = parse('1. PBL 12 · Rellor · Common\n     in 3 Decks');
        assert.equal(entries.length, 1, 'the deck line must not become its own card');
        assert.equal(entries[0].decks, 3);
    });

    it('survives the separators different Telegram clients paste', () => {
        for (const line of [
            '1. PBL 5 · Poltchageist · Common — normal 0,03 €',
            '1. PBL 5 • Poltchageist • Common - normal 0,03 €',
            '1) PBL 5 · Poltchageist · Common – normal 0,03 €',
        ]) {
            const e = parse(line).entries[0];
            assert.ok(e, `no match for: ${line}`);
            assert.equal(e.set, 'PBL');
            assert.equal(e.number, '5');
            assert.equal(e.name, 'Poltchageist');
        }
    });

    it('keeps prices out of the rarity, with or without the labels', () => {
        for (const line of [
            '1. PBL 5 · Poltchageist · Common — normal 0,03 € · RH 0,02 €',
            '1. PBL 5 · Poltchageist · Common — 0,03 €',
            '1. PBL 5 · Poltchageist · Common — RH 0,02 €',
            '1. PBL 5 · Poltchageist · Common',
        ]) {
            assert.equal(parse(line).entries[0].rarity, 'Common', line);
        }
    });

    it('does not mistake a hyphen in a card name for the price separator', () => {
        const e = parse('1. PBL 5 · Ho-Oh ex · Ultra Rare — normal 12,00 €').entries[0];
        assert.equal(e.name, 'Ho-Oh ex');
        assert.equal(e.rarity, 'Ultra Rare');
    });

    it('normalises promo numbers and de-duplicates repeats', () => {
        const { entries } = parse([
            '4. SVP 052 · Pikachu · Promo — normal 1,50 €',
            '17. SVP 52 · Pikachu · Promo — normal 1,50 €',
        ].join('\n'));
        assert.equal(entries.length, 1);
        assert.equal(entries[0].number, '52');
    });

    it('reports numbered lines it cannot read instead of dropping them', () => {
        const { entries, skipped } = parse('99. total nonsense line without a set');
        assert.equal(entries.length, 0);
        assert.deepEqual(skipped, ['99. total nonsense line without a set']);
    });
});

// ── 2. Full flow (DOM) ──────────────────────────────────────────────────────

let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch { /* optional */ }

describe('wishlist bot import — write path', { skip: JSDOM ? false : 'jsdom not installed' }, () => {
    function boot({ wishlist = [], counts = [] } = {}) {
        const dom = new JSDOM('<!doctype html><html><body></body></html>');
        const w = dom.window;
        const written = {};
        Object.assign(w, {
            getLang: () => 'de',
            showNotification: () => {},
            updateCollectionUI: () => {},
            filterWishlist: () => {},
            escapeHtml: s => String(s == null ? '' : s).replace(/[&<>"']/g,
                c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
            auth: { currentUser: { uid: 'u1' } },
            userDataLoaded: true,
            cardIndexBySetNumber: new Map([
                ['PBL-5', { name: 'Poltchageist', set: 'PBL', number: '5' }],
                ['PBL-12', { name: 'Rellor', set: 'PBL', number: '12' }],
            ]),
            userWishlist: new Set(wishlist),
            userWishlistCounts: new Map(counts),
        });
        w.escapeHtmlAttr = w.escapeHtml;
        // Capture the exact Firestore update() arguments so the test can assert
        // the write is additive (arrayUnion + per-card field paths) rather than
        // a full rewrite of the wishlist.
        const fakeDb = {
            collection: () => ({ doc: () => ({
                update: async (...args) => { written.args = args; },
            }) }),
        };
        const fakeFirebase = {
            firestore: {
                FieldPath: class { constructor(...segs) { this.segments = segs; } },
                FieldValue: { arrayUnion: (...ids) => ({ __arrayUnion: ids }) },
            },
        };
        load(w, w.document, {
            getLang: w.getLang,
            showNotification: w.showNotification,
            auth: w.auth,
            updateCollectionUI: w.updateCollectionUI,
            filterWishlist: w.filterWishlist,
            db: fakeDb,
            firebase: fakeFirebase,
        });
        return { w, written };
    }

    const MSG = '1. PBL 5 · Poltchageist · Common — normal 0,03 €\n'
              + '2. PBL 12 · Rellor · Common — normal 0,04 €';

    it('defaults to 1 copy, which can never overwrite a hand-set quantity', async () => {
        const { w, written } = boot({ wishlist: ['Rellor|PBL|12'], counts: [['Rellor|PBL|12', 3]] });
        w.wishlistBotImportOpen();
        w.document.getElementById('wlBotImportText').value = MSG;
        w.wishlistBotImportPreview();

        assert.equal(w.document.getElementById('wlBotPreviewQty').value, '1');
        await w.wishlistBotImportExecute();

        // args: 'wishlist', arrayUnion(...), FieldPath, value, FieldPath, value
        const counts = {};
        for (let i = 2; i < written.args.length; i += 2) {
            counts[written.args[i].segments[1]] = written.args[i + 1];
        }
        assert.equal(counts['Rellor|PBL|12'], 3, 'a 1x import must leave an existing 3x alone');
        assert.equal(counts['Poltchageist|PBL|5'], 1);
    });

    it('writes additively — arrayUnion and per-card paths, never a full rewrite', async () => {
        // A full rewrite of `wishlist` / `wishlistCounts` would be only as
        // complete as the in-memory state, so anything the client had not
        // loaded would be deleted server-side.
        const { w, written } = boot({ wishlist: ['Rellor|PBL|12'], counts: [['Rellor|PBL|12', 1]] });
        w.wishlistBotImportOpen();
        w.document.getElementById('wlBotImportText').value = MSG;
        w.wishlistBotImportPreview();
        await w.wishlistBotImportExecute();

        assert.equal(written.args[0], 'wishlist');
        assert.deepEqual(written.args[1].__arrayUnion.sort(),
            ['Poltchageist|PBL|5', 'Rellor|PBL|12']);
        for (let i = 2; i < written.args.length; i += 2) {
            assert.deepEqual(written.args[i].segments[0], 'wishlistCounts',
                'counts must be written per card path, not as a whole map');
        }
        assert.ok(!written.args.some(a => Array.isArray(a)),
            'no raw array was written — that would replace the server list');
    });

    it('refuses to write before the user data has loaded', async () => {
        const { w, written } = boot({ wishlist: ['Rellor|PBL|12'], counts: [['Rellor|PBL|12', 4]] });
        w.userDataLoaded = false;   // Firestore has not answered yet
        w.wishlistBotImportOpen();
        w.document.getElementById('wlBotImportText').value = MSG;
        w.wishlistBotImportPreview();
        await w.wishlistBotImportExecute();
        assert.equal(written.args, undefined,
            'writing against an unloaded wishlist could lower a hand-set quantity');
    });

    it('warns before an import raises a quantity the user set', () => {
        const { w } = boot({ wishlist: ['Rellor|PBL|12'], counts: [['Rellor|PBL|12', 1]] });
        w.wishlistBotImportOpen();
        w.document.getElementById('wlBotImportText').value = MSG;
        w.wishlistBotImportPreview();

        assert.equal(w.document.getElementById('wlBotPreviewRaise').hidden, true,
            'nothing is raised at the 1x default');
        w.document.getElementById('wlBotPreviewQty').value = '4';
        w.wishlistBotImportRefresh();
        assert.equal(w.document.getElementById('wlBotPreviewRaise').hidden, false);
        assert.equal(
            w.document.getElementById('wlBotPreviewRaise').querySelector('strong').textContent, '1');
    });

    it('counts only the copies that will actually be written', () => {
        const { w } = boot({ wishlist: ['Rellor|PBL|12'], counts: [['Rellor|PBL|12', 4]] });
        w.wishlistBotImportOpen();
        w.document.getElementById('wlBotImportText').value = MSG;
        w.wishlistBotImportPreview();
        // Rellor is already at 4 and gains nothing; only Poltchageist is new.
        assert.equal(w.document.getElementById('wlBotPreviewCopies').textContent, '1');
    });

    it('explains an unreadable paste in place instead of dead-ending', () => {
        const { w } = boot();
        w.wishlistBotImportOpen();
        w.document.getElementById('wlBotImportText').value = 'nur Text, keine Karten';
        w.wishlistBotImportPreview();
        const box = w.document.getElementById('wlBotImportError');
        assert.equal(box.hidden, false);
        assert.match(box.textContent, /PBL 5/);
        assert.notEqual(w.document.getElementById('wlBotImportText').value, '',
            'the pasted text must survive so it need not be copied again');
    });
});
