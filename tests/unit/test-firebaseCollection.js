/**
 * Unit tests for Firebase Collection functions (Phase 2)
 *
 * Tests: addToCollection, removeFromCollection
 *
 * These functions manage user card collections via Firebase. The main risk
 * is a race condition in addToCollection — non-atomic read-modify-write means
 * concurrent clicks can cause lost updates.
 *
 * Run:  node --test tests/unit/test-firebaseCollection.js
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createFirebaseEnv(overrides = {}) {
    const firestoreOps = [];  // Track all Firestore write operations

    const mockFirestore = {
        firestore: {
            FieldValue: {
                arrayUnion: (val) => ({ _type: 'arrayUnion', value: val }),
                arrayRemove: (val) => ({ _type: 'arrayRemove', value: val }),
                delete: () => ({ _type: 'delete' }),
            },
        },
    };

    const mockDb = {
        collection: (name) => ({
            doc: (uid) => ({
                set: async (data, options) => {
                    firestoreOps.push({ collection: name, uid, data, options });
                    if (overrides.dbSetThrows) throw new Error('Firestore write failed');
                },
                get: async () => ({ exists: true, data: () => ({}) }),
            }),
        }),
    };

    const notifications = [];
    const uiUpdates = [];

    const window = {
        userCollection: new Set(overrides.existingCards || []),
        userCollectionCounts: new Map(overrides.existingCounts || []),
        filteredCardsData: null,
        __firebaseRuntimeInitialized: true,
        ...overrides.windowOverrides,
    };

    const sandbox = {
        window,
        document: {
            getElementById: () => null,
            querySelector: () => null,
            querySelectorAll: () => [],
            createElement: () => ({ innerHTML: '', className: '', style: {}, appendChild() {}, addEventListener() {} }),
        },
        console,
        Map, Set, Array, Object, String, Number, JSON, Math,
        parseInt, parseFloat, Error, Promise,
        setTimeout: (fn) => fn(),
        // Firebase mocks
        firebase: mockFirestore,
        auth: { currentUser: overrides.user !== undefined ? overrides.user : { uid: 'test-user-123' } },
        db: mockDb,
        // UI stubs
        showNotification: (msg, type) => { notifications.push({ msg, type }); },
        updateCardUI: (cardId) => { uiUpdates.push({ fn: 'updateCardUI', cardId }); },
        updateCollectionUI: () => { uiUpdates.push({ fn: 'updateCollectionUI' }); },
        renderCardDatabase: () => {},
        escapeHtml: (s) => String(s || ''),
        escapeHtmlAttr: (s) => String(s || ''),
        t: (key) => key,
        typeof: undefined,
    };

    // Mirror to window
    for (const key of Object.keys(sandbox)) {
        if (!(key in window)) window[key] = sandbox[key];
    }

    let src = fs.readFileSync(
        path.resolve(__dirname, '../../js/firebase-collection.js'),
        'utf-8'
    );

    // Strip the firebase init check that throws
    src = src.replace(
        /if \(!window\.__firebaseRuntimeInitialized\)[\s\S]*?\}/,
        '// [test] firebase init check stripped'
    );

    const ctx = vm.createContext(sandbox);
    try {
        vm.runInContext(src, ctx, { filename: 'firebase-collection.js' });
    } catch (e) {
        // Some DOM-dependent code may fail — that's OK if our target functions loaded
    }

    const exported = {};
    const fnNames = [
        'addToCollection', 'removeFromCollection', 'toggleCollection',
        'addToWishlist', 'removeFromWishlist',
    ];
    for (const fn of fnNames) {
        if (typeof sandbox[fn] === 'function') exported[fn] = sandbox[fn];
        else if (typeof sandbox.window[fn] === 'function') exported[fn] = sandbox.window[fn];
    }
    exported._sandbox = sandbox;
    exported._window = window;
    exported._firestoreOps = firestoreOps;
    exported._notifications = notifications;
    exported._uiUpdates = uiUpdates;
    return exported;
}

// ═══════════════════════════════════════════════════════════
// addToCollection
// ═══════════════════════════════════════════════════════════
describe('addToCollection — basic behavior', () => {
    it('adds a card and updates local state', async () => {
        const env = createFirebaseEnv();
        await env.addToCollection('SVI-25');
        assert.equal(env._window.userCollectionCounts.get('SVI-25'), 1);
        assert.ok(env._window.userCollection.has('SVI-25'));
    });

    it('increments count on repeated adds', async () => {
        const env = createFirebaseEnv();
        await env.addToCollection('SVI-25');
        await env.addToCollection('SVI-25');
        await env.addToCollection('SVI-25');
        assert.equal(env._window.userCollectionCounts.get('SVI-25'), 3);
    });

    it('writes to Firestore with correct parameters', async () => {
        const env = createFirebaseEnv();
        await env.addToCollection('SVI-25');
        assert.equal(env._firestoreOps.length, 1);
        assert.equal(env._firestoreOps[0].collection, 'users');
        assert.equal(env._firestoreOps[0].uid, 'test-user-123');
        assert.equal(env._firestoreOps[0].options.merge, true);
    });

    it('shows success notification', async () => {
        const env = createFirebaseEnv();
        await env.addToCollection('SVI-25');
        assert.ok(env._notifications.some(n => n.type === 'success'));
    });

    it('updates local state correctly after add', async () => {
        const env = createFirebaseEnv();
        await env.addToCollection('SVI-25');
        // Verify the local Map and Set were updated
        assert.ok(env._window.userCollection.has('SVI-25'));
        assert.equal(env._window.userCollectionCounts.get('SVI-25'), 1);
        // Verify a success notification was shown
        assert.ok(env._notifications.length > 0);
        assert.equal(env._notifications[env._notifications.length - 1].type, 'success');
    });
});

describe('addToCollection — 4-copy limit', () => {
    it('blocks addition when already at 4 copies', async () => {
        const env = createFirebaseEnv({
            existingCounts: [['SVI-25', 4]],
            existingCards: ['SVI-25'],
        });
        await env.addToCollection('SVI-25');
        // Should NOT have written to Firestore
        assert.equal(env._firestoreOps.length, 0);
        // Count should stay at 4
        assert.equal(env._window.userCollectionCounts.get('SVI-25'), 4);
        // Should show info notification
        assert.ok(env._notifications.some(n => n.type === 'info'));
    });
});

describe('addToCollection — not signed in', () => {
    it('shows error when no user is signed in', async () => {
        const env = createFirebaseEnv({ user: null });
        await env.addToCollection('SVI-25');
        assert.equal(env._firestoreOps.length, 0);
        assert.ok(env._notifications.some(n => n.type === 'error'));
    });
});

describe('addToCollection — Firestore error handling', () => {
    it('shows error notification when Firestore write fails', async () => {
        const env = createFirebaseEnv({ dbSetThrows: true });
        await env.addToCollection('SVI-25');
        assert.ok(env._notifications.some(n => n.type === 'error' && n.msg.includes('Error')));
    });
});

describe('addToCollection — race condition documentation', () => {
    it('KNOWN ISSUE: concurrent adds read same initial count', async () => {
        // This test documents the existing race condition.
        // Two concurrent calls both read currentCount=0 and both write count=1.
        const env = createFirebaseEnv();
        // Simulate two concurrent adds (both read count 0 before either writes)
        const p1 = env.addToCollection('SVI-25');
        const p2 = env.addToCollection('SVI-25');
        await Promise.all([p1, p2]);
        // KNOWN BUG: Both calls read currentCount=0, so both write count=1.
        // However, the second call reads the updated local state (Map is sync),
        // so it actually gets count=1 and writes count=2.
        // This is only safe because JS is single-threaded — the await points
        // interleave at the Firestore write, but the Map reads are synchronous.
        // With real network latency, the Map would be updated at the first await,
        // but the second call's currentCount was already read before that.
        // In practice: the local state shows 2, but Firestore may show 1.
        assert.equal(env._firestoreOps.length, 2);
        // Both Firestore writes happen — but they may overwrite each other
    });
});

// ═══════════════════════════════════════════════════════════
// removeFromCollection
// ═══════════════════════════════════════════════════════════
describe('removeFromCollection — basic behavior', () => {
    it('decrements count from 3 to 2', async () => {
        const env = createFirebaseEnv({
            existingCounts: [['SVI-25', 3]],
            existingCards: ['SVI-25'],
        });
        await env.removeFromCollection('SVI-25');
        assert.equal(env._window.userCollectionCounts.get('SVI-25'), 2);
    });

    it('removes card completely when count reaches 0', async () => {
        const env = createFirebaseEnv({
            existingCounts: [['SVI-25', 1]],
            existingCards: ['SVI-25'],
        });
        await env.removeFromCollection('SVI-25');
        assert.ok(!env._window.userCollection.has('SVI-25'));
        assert.ok(!env._window.userCollectionCounts.has('SVI-25'));
    });

    it('removes card when count is already 0', async () => {
        const env = createFirebaseEnv({
            existingCounts: [['SVI-25', 0]],
            existingCards: ['SVI-25'],
        });
        await env.removeFromCollection('SVI-25');
        // newCount = 0 - 1 = -1 → treated as <= 0 → full remove
        assert.ok(!env._window.userCollection.has('SVI-25'));
    });

    it('does nothing when not signed in', async () => {
        const env = createFirebaseEnv({ user: null });
        await env.removeFromCollection('SVI-25');
        assert.equal(env._firestoreOps.length, 0);
    });
});
