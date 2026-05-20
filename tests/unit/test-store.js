/**
 * Unit tests for the minimal reactive-store primitive
 * (js/modules/stores/store.js). Verifies subscribe-notify mechanics,
 * shallow-equal suppression, frozen snapshots, and error-isolation
 * between subscribers.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('createStore: get / set basics', () => {
    it('returns the initial state from get()', async () => {
        const { createStore } = await import('../../js/modules/stores/store.js');
        const s = createStore({ a: 1, b: 'x' });
        const snap = s.get();
        assert.equal(snap.a, 1);
        assert.equal(snap.b, 'x');
    });

    it('freezes the state so consumers cannot mutate', async () => {
        const { createStore } = await import('../../js/modules/stores/store.js');
        const s = createStore({ value: 0 });
        const snap = s.get();
        assert.equal(Object.isFrozen(snap), true);
        // In strict mode the assignment throws; in sloppy mode it's a
        // silent no-op. Both protect the store — verify either.
        try { snap.value = 99; } catch (_) { /* expected in strict */ }
        assert.equal(s.get().value, 0); // store value unchanged either way
    });

    it('set() replaces the state', async () => {
        const { createStore } = await import('../../js/modules/stores/store.js');
        const s = createStore({ value: 0 });
        s.set({ value: 42 });
        assert.equal(s.get().value, 42);
    });

    it('update() applies a functional update', async () => {
        const { createStore } = await import('../../js/modules/stores/store.js');
        const s = createStore({ count: 5 });
        s.update((prev) => ({ count: prev.count + 1 }));
        s.update((prev) => ({ count: prev.count + 1 }));
        assert.equal(s.get().count, 7);
    });
});

describe('createStore: subscribers', () => {
    it('notifies subscribers on set()', async () => {
        const { createStore } = await import('../../js/modules/stores/store.js');
        const s = createStore({ value: 0 });
        const calls = [];
        s.subscribe((next, prev) => calls.push({ next, prev }));
        s.set({ value: 1 });
        s.set({ value: 2 });
        assert.equal(calls.length, 2);
        assert.equal(calls[0].next.value, 1);
        assert.equal(calls[0].prev.value, 0);
        assert.equal(calls[1].next.value, 2);
        assert.equal(calls[1].prev.value, 1);
    });

    it('unsubscribe stops further notifications', async () => {
        const { createStore } = await import('../../js/modules/stores/store.js');
        const s = createStore({ value: 0 });
        const calls = [];
        const off = s.subscribe(() => calls.push(s.get().value));
        s.set({ value: 1 });
        off();
        s.set({ value: 2 });
        assert.deepEqual(calls, [1]);
    });

    it('skips notification when state is shallow-equal', async () => {
        const { createStore } = await import('../../js/modules/stores/store.js');
        const s = createStore({ a: 1, b: 2 });
        const calls = [];
        s.subscribe(() => calls.push(1));
        s.set({ a: 1, b: 2 });            // identical → no notify
        s.set({ a: 1, b: 3 });            // changed → notify
        s.set({ a: 1, b: 3 });            // identical → no notify
        assert.equal(calls.length, 1);
    });

    it('replace() forces a notification even when equal', async () => {
        const { createStore } = await import('../../js/modules/stores/store.js');
        const s = createStore({ a: 1 });
        const calls = [];
        s.subscribe(() => calls.push(1));
        s.replace({ a: 1 }); // same shape but force
        assert.equal(calls.length, 1);
    });

    it('continues notifying other subscribers when one throws', async () => {
        const { createStore } = await import('../../js/modules/stores/store.js');
        const s = createStore({ value: 0 });
        const bystander = [];
        const origConsoleError = console.error;
        console.error = () => {}; // swallow expected error log
        try {
            s.subscribe(() => { throw new Error('boom'); });
            s.subscribe(() => bystander.push(s.get().value));
            s.set({ value: 1 });
        } finally {
            console.error = origConsoleError;
        }
        assert.deepEqual(bystander, [1]);
    });
});

describe('userStore (pilot)', () => {
    it('exposes the expected API surface', async () => {
        // Wrap import in a fresh jsdom-less window stub so the side-effect
        // `window.userStore = …` assignment doesn't throw under node.
        global.window = global.window || /** @type {any} */ ({});
        const { userStore } = await import('../../js/modules/stores/user-store.js');
        assert.equal(typeof userStore.get, 'function');
        assert.equal(typeof userStore.subscribe, 'function');
        assert.equal(typeof userStore.setAuth, 'function');
        assert.equal(typeof userStore.setDecks, 'function');
        assert.equal(typeof userStore.setCollectionCounts, 'function');
        assert.equal(typeof userStore.setWishlist, 'function');
        assert.equal(typeof userStore.reset, 'function');
    });

    it('starts in signed-out state', async () => {
        global.window = global.window || /** @type {any} */ ({});
        const { userStore } = await import('../../js/modules/stores/user-store.js');
        userStore.reset();
        const snap = userStore.get();
        assert.equal(snap.uid, null);
        assert.equal(snap.email, null);
        assert.equal(snap.isLoaded, false);
        assert.deepEqual(snap.decks, []);
        assert.deepEqual(snap.collectionCounts, {});
    });

    it('setAuth + setDecks + subscribe', async () => {
        global.window = global.window || /** @type {any} */ ({});
        const { userStore } = await import('../../js/modules/stores/user-store.js');
        userStore.reset();
        const calls = [];
        const off = userStore.subscribe((next) => calls.push({ uid: next.uid, deckCount: next.decks.length }));
        userStore.setAuth({ uid: 'abc', email: 'x@y.z' });
        userStore.setDecks([{ id: '1', name: 'aggro', cards: {} }]);
        off();
        assert.equal(calls.length, 2);
        assert.equal(calls[0].uid, 'abc');
        assert.equal(calls[1].deckCount, 1);
    });
});
