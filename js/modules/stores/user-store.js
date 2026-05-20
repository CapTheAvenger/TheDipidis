// @ts-check
/**
 * user-store.js — centralised user-state pilot.
 *
 * The legacy codebase scatters per-user state across many `window.*`
 * globals: `window.userDecks`, `window.userCollectionCounts`,
 * `window.userWishlist`, `window.userWishlistCounts`, and the auth
 * snapshot fields. There's no single subscribe-able source — when one
 * place mutates, every other place either polls on next render or
 * relies on hand-fired CustomEvents.
 *
 * This pilot store sits NEXT TO those globals (not replacing them yet)
 * so future call-sites can migrate incrementally:
 *   1) the legacy mutator continues to update window.userDecks etc.
 *   2) it ALSO calls userStore.setDecks(...) so subscribers fire.
 *   3) new consumers subscribe to the store instead of polling.
 *   4) over time the window.* fields become derived view of the store
 *      and can be deleted.
 *
 * Why pilot here first: this is the most-mutated state in the app
 * (every save-deck, every add-to-collection, every wishlist toggle).
 * A working store here proves the pattern; other slices (deck-selection,
 * meta-data, filters) can follow.
 */

import { createStore } from './store.js';

/**
 * @typedef {Object} UserDeck
 * @property {string} id
 * @property {string} name
 * @property {Object} cards
 *
 * @typedef {Object} UserState
 * @property {string | null}                uid           Firebase uid, or null when signed-out.
 * @property {string | null}                email
 * @property {string | null}                displayName
 * @property {boolean}                      isLoaded      true once initial fetch completed.
 * @property {UserDeck[]}                   decks
 * @property {{ [cardId: string]: number }} collectionCounts
 * @property {{ [cardId: string]: number }} wishlistCounts
 * @property {string[]}                     wishlist      printIds (SET-NUMBER strings)
 */

/** @type {UserState} */
const INITIAL = {
    uid: null,
    email: null,
    displayName: null,
    isLoaded: false,
    decks: [],
    collectionCounts: {},
    wishlistCounts: {},
    wishlist: [],
};

const _store = createStore(INITIAL);

/** Convenience API surface (idiomatic functions vs. raw {get, set, …}). */
export const userStore = {
    /** Read-only snapshot of the entire state. */
    get: () => _store.get(),

    /** Subscribe to changes. Returns an unsubscribe function. */
    subscribe: _store.subscribe,

    /** Auth snapshot setter — call when Firebase auth state changes. */
    setAuth({ uid = null, email = null, displayName = null }) {
        _store.update((s) => ({ ...s, uid, email, displayName }));
    },

    /** Replace the decks array (saved-deck list). */
    setDecks(decks) {
        _store.update((s) => ({ ...s, decks: Array.isArray(decks) ? decks : [] }));
    },

    /** Replace the collection counts map. */
    setCollectionCounts(counts) {
        _store.update((s) => ({ ...s, collectionCounts: counts || {} }));
    },

    /** Replace the wishlist array + counts map atomically. */
    setWishlist(wishlist, wishlistCounts) {
        _store.update((s) => ({
            ...s,
            wishlist: Array.isArray(wishlist) ? wishlist : [],
            wishlistCounts: wishlistCounts || {},
        }));
    },

    /** Mark initial data-load complete. */
    setLoaded(isLoaded) {
        _store.update((s) => ({ ...s, isLoaded: !!isLoaded }));
    },

    /** Reset to signed-out state. */
    reset() {
        _store.set(INITIAL);
    },
};

// Expose globally so legacy non-module callers can use it without import.
/** @type {any} */ (window).userStore = userStore;
