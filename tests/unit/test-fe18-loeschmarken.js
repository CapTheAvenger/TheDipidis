/**
 * FE-18 — gelöschte Decks bleiben gelöscht.
 *
 * Die Zusicherungen FÜHREN die echten Funktionen aus (aus js/firebase-globals.js
 * und js/firebase-collection.js herausgeschnitten, gegen ein Firestore-Double),
 * sie durchsuchen nicht den Quelltext. Kommentare werden vor dem Ausschneiden
 * entfernt, damit die Erklärung im Code keine Probe blind macht.
 *
 * Verfälschungsproben: jede Zusicherung läuft zusätzlich gegen eine gezielt
 * kaputt gemachte Fassung der Quelle und MUSS dort rot werden. Eine Mutation,
 * die nichts ändert, bricht die Probe selbst ab.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', 'js');
function ohneKommentare(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}
const GLOBALS = ohneKommentare(fs.readFileSync(path.join(ROOT, 'firebase-globals.js'), 'utf8'));
const COLLECTION = ohneKommentare(fs.readFileSync(path.join(ROOT, 'firebase-collection.js'), 'utf8'));

function funktion(src, name) {
    const re = new RegExp('(?:async )?function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}\\n');
    const m = src.match(re);
    if (!m) throw new Error('nicht gefunden: ' + name);
    return m[0];
}

// ── Firestore-Double ────────────────────────────────────────────────
function neuesFirestore(start) {
    const docs = new Map(Object.entries(start.docs || {})); // "pfad" -> daten
    const log = { batchSets: [], batchDeletes: [], commits: 0 };
    function col(pfad) {
        return {
            doc: (id) => doc(pfad + '/' + id),
            get: async () => {
                const prefix = pfad + '/';
                const treffer = [...docs.entries()].filter(([k]) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'));
                return {
                    metadata: { fromCache: col.cache === true || start.fromCache === true },
                    forEach: (fn) => treffer.forEach(([k, v]) => fn({ id: k.slice(prefix.length), data: () => v })),
                };
            },
        };
    }
    function doc(pfad) {
        return { path: pfad, collection: (n) => col(pfad + '/' + n), id: pfad.split('/').pop() };
    }
    const db = {
        collection: (n) => col(n),
        batch: () => {
            const ops = [];
            return {
                set: (ref, data) => { ops.push(['set', ref.path, data]); log.batchSets.push([ref.path, data]); },
                delete: (ref) => { ops.push(['delete', ref.path]); log.batchDeletes.push(ref.path); },
                commit: async () => {
                    log.commits++;
                    ops.forEach(([art, p, d]) => { if (art === 'set') docs.set(p, d); else docs.delete(p); });
                },
            };
        },
    };
    return { db, docs, log };
}

function umgebung(globalsSrc, collectionSrc, opts) {
    opts = opts || {};
    const speicher = new Map(Object.entries(opts.local || {}));
    const fs_ = neuesFirestore(opts);
    const window = { db: fs_.db, userDecks: (opts.userDecks || []).slice() };
    const localStorage = {
        getItem: (k) => (speicher.has(k) ? speicher.get(k) : null),
        setItem: (k, v) => speicher.set(k, String(v)),
    };
    const firebase = { firestore: { Timestamp: { fromMillis: (x) => x } } };
    const auth = { currentUser: { uid: 'u1' } };
    const meldungen = [];
    const code = [
        '_deckBackupKey', '_writeDeckBackup', '_readDeckBackup', '_tombstoneKey',
        '_readLocalTombstones', '_addLocalTombstone', '_ohneLoeschmarken', '_ladeLoeschmarken',
        '_mergeAdoptOnly', '_pushMirrorToServer', '_adoptServerOnlyDecks',
    ].map((n) => funktion(globalsSrc, n)).join('\n') + '\n' + funktion(collectionSrc, 'deleteDeck');
    const fn = new Function('window', 'localStorage', 'firebase', 'auth', 'db', 'console', 'navigator',
        'confirm', 't', 'showNotification', 'fcText', 'updateDecksUI', 'meldungen',
        code + '\nreturn { _pushMirrorToServer, _adoptServerOnlyDecks, deleteDeck, _readLocalTombstones, _readDeckBackup, _writeDeckBackup };');
    const api = fn(window, localStorage, firebase, auth, fs_.db, { info() {}, warn() {}, error() {} },
        { onLine: true }, () => true, (k) => k, (m) => meldungen.push(m), (k, d) => d, () => {}, meldungen);
    return Object.assign({ window, speicher, meldungen }, fs_, api);
}

const deck = (id) => ({ id, name: id, cards: { a: 1 }, createdAtMs: 1, updatedAtMs: 1 });
const spiegel = (ids) => JSON.stringify({ ts: 1, decks: ids.map(deck) });

// ── Mutationen ──────────────────────────────────────────────────────
function mutiere(src, suche, ersatz) {
    if (!src.includes(suche)) throw new Error('Mutation trifft nichts: ' + suche);
    const neu = src.replace(suche, ersatz);
    assert.notEqual(neu, src);
    return neu;
}
const MUT = {
    filterWeg: (g) => mutiere(g, 'return !(d && d.id && dead.has(d.id));', 'return true;'),
    frischWeg: (g) => mutiere(g, 'if (!marken.frisch) return;\n  const lebendig', 'const lebendig'),
    lokaleMarkeWeg: (g) => mutiere(g, 'var ids = local.slice();', 'var ids = [];'),
    adoptFilterWeg: (g) => mutiere(g, 'server = _ohneLoeschmarken(server, marken.ids);', ''),
};

function pushErgebnis(g, opts) {
    const e = umgebung(g, COLLECTION, opts);
    return e._pushMirrorToServer('u1').then(() => e);
}
const geschriebeneDecks = (e) => e.log.batchSets.map(([p]) => p).filter((p) => p.includes('/decks/')).map((p) => p.split('/').pop());

const PUSH_OPTS = () => ({
    docs: { 'users/u1/deckTombstones/alt': { deletedAtMs: 5 } },
    local: { tcg_decks_backup_u1: spiegel(['alt', 'neu']) },
    userDecks: [deck('alt'), deck('neu')],
});

describe('FE-18 Push des Spiegels', () => {
    it('schreibt ein anderswo gelöschtes Deck nicht zurück und räumt den Spiegel auf', async () => {
        const e = await pushErgebnis(GLOBALS, PUSH_OPTS());
        assert.deepEqual(geschriebeneDecks(e), ['neu']);
        assert.deepEqual(e.window.userDecks.map((d) => d.id), ['neu']);
        assert.deepEqual(e._readDeckBackup('u1').decks.map((d) => d.id), ['neu']);
    });
    it('PROBE: ohne den Filter kommt das gelöschte Deck zurück', async () => {
        const e = await pushErgebnis(MUT.filterWeg(GLOBALS), PUSH_OPTS());
        assert.ok(geschriebeneDecks(e).includes('alt'), 'die Mutation hätte das Deck zurückbringen müssen');
    });

    it('schreibt nichts, solange die Löschmarken nicht frisch vom Server kommen', async () => {
        const o = PUSH_OPTS(); o.fromCache = true;
        const e = await pushErgebnis(GLOBALS, o);
        assert.equal(e.log.commits, 0);
    });
    it('PROBE: ohne die Frische-Prüfung wird auf Verdacht geschrieben', async () => {
        const o = PUSH_OPTS(); o.fromCache = true;
        const e = await pushErgebnis(MUT.frischWeg(GLOBALS), o);
        assert.ok(e.log.commits > 0);
    });

    it('eine nur lokal vermerkte Löschung sperrt das Deck ebenfalls und wird nachgereicht', async () => {
        const o = { local: { tcg_decks_backup_u1: spiegel(['x', 'y']), tcg_deck_tombstones_u1: JSON.stringify(['x']) }, userDecks: [deck('x'), deck('y')] };
        const e = await pushErgebnis(GLOBALS, o);
        assert.deepEqual(geschriebeneDecks(e), ['y']);
        assert.ok(e.docs.has('users/u1/deckTombstones/x'), 'lokale Marke muss am Server ankommen');
    });
    it('PROBE: ohne die lokalen Marken kommt das Deck zurück', async () => {
        const o = { local: { tcg_decks_backup_u1: spiegel(['x', 'y']), tcg_deck_tombstones_u1: JSON.stringify(['x']) }, userDecks: [deck('x'), deck('y')] };
        const e = await pushErgebnis(MUT.lokaleMarkeWeg(GLOBALS), o);
        assert.ok(geschriebeneDecks(e).includes('x'));
    });

    it('ohne Marken bleibt alles wie vorher: jedes Deck wird geschrieben', async () => {
        const o = { local: { tcg_decks_backup_u1: spiegel(['a', 'b']) }, userDecks: [deck('a'), deck('b')] };
        const e = await pushErgebnis(GLOBALS, o);
        assert.deepEqual(geschriebeneDecks(e).sort(), ['a', 'b']);
    });
});

describe('FE-18 Deck vom Server übernehmen', () => {
    const OPTS = () => ({
        docs: {
            'users/u1/deckTombstones/alt': { deletedAtMs: 5 },
            'users/u1/decks/alt': { name: 'alt' },
            'users/u1/decks/fremd': { name: 'fremd' },
        },
    });
    it('übernimmt fremde Decks, aber kein gelöschtes', async () => {
        const e = umgebung(GLOBALS, COLLECTION, OPTS());
        await e._adoptServerOnlyDecks('u1', []);
        assert.deepEqual(e.window.userDecks.map((d) => d.id), ['fremd']);
    });
    it('PROBE: ohne Filter wird das gelöschte Deck übernommen', async () => {
        const e = umgebung(MUT.adoptFilterWeg(GLOBALS), COLLECTION, OPTS());
        await e._adoptServerOnlyDecks('u1', []);
        assert.ok(e.window.userDecks.some((d) => d.id === 'alt'));
    });
});

describe('FE-18 Löschen schreibt die Marke', () => {
    function loesche(collectionSrc) {
        const e = umgebung(GLOBALS, collectionSrc, { userDecks: [deck('k'), deck('z')], docs: { 'users/u1/decks/k': {} } });
        e.deleteDeck('k');
        return e;
    }
    it('Marke und Löschen gehen in einem Batch, lokal bleibt eine Marke', async () => {
        const e = loesche(COLLECTION);
        await new Promise((r) => setImmediate(r));
        assert.deepEqual(e.log.batchSets.map(([p]) => p), ['users/u1/deckTombstones/k']);
        assert.deepEqual(e.log.batchDeletes, ['users/u1/decks/k']);
        assert.equal(e.log.commits, 1);
        assert.deepEqual(e._readLocalTombstones('u1'), ['k']);
        assert.deepEqual(e.window.userDecks.map((d) => d.id), ['z']);
    });
    it('PROBE: ohne den Marken-Schreibzugriff fehlt die Marke am Server', async () => {
        const kaputt = mutiere(COLLECTION, "delBatch.set(userDoc.collection('deckTombstones').doc(deckId), { deletedAtMs: Date.now() });", '');
        const e = loesche(kaputt);
        await new Promise((r) => setImmediate(r));
        assert.equal(e.log.batchSets.length, 0);
    });
});
