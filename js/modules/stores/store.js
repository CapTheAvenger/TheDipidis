// @ts-check
/**
 * store.js — minimal reactive-store primitive.
 *
 * The legacy codebase keeps shared state in ad-hoc `window.*` properties
 * (userDecks, userCollectionCounts, cityLeagueDeck, currentMetaDeck, …)
 * that any module can read or mutate. There's no "this state changed"
 * signal — consumers either re-read on every render or manually
 * dispatch CustomEvents.
 *
 * This module introduces a tiny store factory so future state slices
 * can move out of `window` and into a proper subscribe-able container.
 * No dependencies, no framework, ~20 lines of behaviour.
 *
 * Usage
 * -----
 *   import { createStore } from './stores/store.js';
 *   const counter = createStore({ value: 0 });
 *
 *   const unsubscribe = counter.subscribe((next, prev) => {
 *       console.log('changed', prev.value, '→', next.value);
 *   });
 *
 *   counter.set({ value: 1 });        // dispatches; notifies 1 listener
 *   counter.update(s => ({ value: s.value + 1 })); // dispatches; { value: 2 }
 *   counter.get();                    // { value: 2 } (frozen copy)
 *   unsubscribe();
 *
 * Design notes
 * ------------
 * - The state object is FROZEN on the way out of get() so consumers can't
 *   mutate it accidentally. Updates always go through set / update.
 * - subscribe() callbacks fire SYNCHRONOUSLY after each commit. If a
 *   subscriber throws, the error is logged and the others still fire.
 * - Updates that don't change the state (shallow-equal) DO NOT notify.
 *   Use `replace()` if you need to force a notification (e.g. mutated
 *   nested arrays).
 *
 * @template T
 * @typedef {(state: T, prevState: T) => void} StoreListener<T>
 */

/**
 * Shallow-equal check: same shape, primitive-equal values. Used to
 * suppress no-op notifications from set/update.
 *
 * @param {any} a
 * @param {any} b
 * @returns {boolean}
 */
function shallowEqual(a, b) {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    for (const k of ak) {
        if (a[k] !== b[k]) return false;
    }
    return true;
}

/**
 * @template T
 * @param {T} initial
 * @returns {{
 *   get: () => T,
 *   set: (next: T) => void,
 *   update: (updater: (state: T) => T) => void,
 *   replace: (next: T) => void,
 *   subscribe: (listener: StoreListener<T>) => () => void,
 * }}
 */
export function createStore(initial) {
    let state = Object.freeze(/** @type {any} */ ({ ...initial }));
    /** @type {Set<StoreListener<T>>} */
    const listeners = new Set();

    function notify(prev) {
        for (const fn of listeners) {
            try { fn(state, prev); }
            catch (err) { console.error('[store] listener threw:', err); }
        }
    }

    return {
        get() { return state; },

        /** No-op when shallow-equal to current state. */
        set(next) {
            const frozen = Object.freeze(/** @type {any} */ ({ ...next }));
            if (shallowEqual(frozen, state)) return;
            const prev = state;
            state = frozen;
            notify(prev);
        },

        /** Functional update: receives current state, returns next. */
        update(updater) {
            const next = updater(state);
            this.set(next);
        },

        /** Force a notification even when shallow-equal — used for
         *  in-place collection mutations callers know about. */
        replace(next) {
            const frozen = Object.freeze(/** @type {any} */ ({ ...next }));
            const prev = state;
            state = frozen;
            notify(prev);
        },

        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
}
