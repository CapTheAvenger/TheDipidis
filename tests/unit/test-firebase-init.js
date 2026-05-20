/**
 * Unit tests for the Firebase modular lazy-loader
 * (js/modules/firebase/init.js).
 *
 * We can't (and don't want to) actually fetch firebase-app.js from
 * gstatic in node tests — that would require network access and would
 * couple unit tests to upstream availability. Instead these tests
 * verify the LOADER SHAPE: memoisation, return type, and the
 * window.getFirebaseModular side-effect. The first call's inner
 * promise rejection (no real CDN here) is swallowed in the test.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('Firebase modular lazy-loader', () => {
    it('exports getFirebase and exposes window.getFirebaseModular', async () => {
        global.window = global.window || /** @type {any} */ ({});
        const mod = await import('../../js/modules/firebase/init.js');
        assert.equal(typeof mod.getFirebase, 'function');
        assert.equal(typeof global.window.getFirebaseModular, 'function');
        assert.equal(mod.getFirebase, global.window.getFirebaseModular);
    });

    it('getFirebase() returns a Promise on first call', async () => {
        global.window = global.window || /** @type {any} */ ({});
        const { getFirebase } = await import('../../js/modules/firebase/init.js');
        const p = getFirebase();
        // Swallow the inner rejection from the network-less environment.
        p.catch(() => {});
        assert.ok(p && typeof p.then === 'function');
    });

    it('memoises: same Promise reference on repeated calls', async () => {
        global.window = global.window || /** @type {any} */ ({});
        const { getFirebase } = await import('../../js/modules/firebase/init.js');
        const p1 = getFirebase();
        const p2 = getFirebase();
        p1.catch(() => {}); p2.catch(() => {});
        assert.equal(p1, p2);
    });
});
