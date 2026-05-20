// @ts-check
/**
 * meta-view/url-router.js — bi-directional URL ↔ store sync.
 *
 * URL grammar
 * -----------
 *   #meta                                       → list, current
 *   #meta?format=city-league                    → list, city-league
 *   #meta?format=current&deck=Charizard%20ex    → detail, current, Charizard ex
 *   #meta?deck=Pikachu                          → detail, default format, Pikachu
 *
 * Round-trip
 * ----------
 *   store change → url update  (replaceState to avoid history spam)
 *   url change  → store update (popstate / hashchange)
 *
 * Feedback-loop avoidance
 * -----------------------
 * Both directions set a `_inflight` flag while applying the change so
 * the OTHER side's subscriber skips the bounce. A no-op change is
 * suppressed by metaViewStore's shallow-equal anyway, but the flag is
 * the belt-and-braces guard.
 */

import { metaViewStore, isValidFormat } from './store.js';
import { isMetaViewV2Enabled } from './feature-flag.js';

const HASH_PREFIX = '#meta';
let _inflight = false;

/** Parse a URL hash into a route descriptor. */
export function parseHash(/** @type {string} */ hash) {
    if (!hash || !hash.startsWith(HASH_PREFIX)) return null;
    const query = hash.slice(HASH_PREFIX.length);
    if (query === '' || query === '?') {
        return { format: null, deck: null };
    }
    if (!query.startsWith('?')) return null;
    /** @type {{ format: string | null, deck: string | null }} */
    const out = { format: null, deck: null };
    try {
        const params = new URLSearchParams(query.slice(1));
        const f = params.get('format');
        if (f && isValidFormat(f)) out.format = f;
        const d = params.get('deck');
        if (d) out.deck = d;
    } catch (_) { /* malformed — return defaults */ }
    return out;
}

/** Build a URL hash from store state. */
export function buildHash(/** @type {any} */ state) {
    if (!state) return HASH_PREFIX;
    const params = new URLSearchParams();
    if (state.activeFormat && state.activeFormat !== 'current') {
        params.set('format', state.activeFormat);
    }
    if (state.view === 'detail' && state.selectedDeck && state.selectedDeck.archetype) {
        params.set('deck', state.selectedDeck.archetype);
    }
    const q = params.toString();
    return q ? HASH_PREFIX + '?' + q : HASH_PREFIX;
}

/** Apply a parsed URL state to the store. */
function applyUrlToStore(/** @type {ReturnType<typeof parseHash>} */ parsed) {
    if (!parsed) return;
    _inflight = true;
    try {
        if (parsed.format) {
            metaViewStore.setFormat(/** @type {any} */ (parsed.format));
        }
        if (parsed.deck) {
            metaViewStore.selectDeck({
                archetype: parsed.deck,
                format: metaViewStore.get().activeFormat,
            });
        } else if (metaViewStore.get().view === 'detail') {
            // URL says no deck — go back to list (e.g. user hit Back).
            metaViewStore.backToList();
        }
    } finally {
        _inflight = false;
    }
}

/** Mirror current store state into the URL (replaceState — silent). */
function applyStoreToUrl() {
    if (_inflight) return;
    if (!isMetaViewV2Enabled()) return;
    const state = metaViewStore.get();
    const desired = buildHash(state);
    if (window.location.hash === desired) return;
    try {
        // replaceState avoids polluting the back-stack on every click.
        // pushState is only fired by the segmented-control + selectDeck
        // wrappers if we want explicit back-nav (not used yet — keeping
        // the URL silent during step 5).
        history.replaceState(history.state, '', desired);
    } catch (_) { /* file:// + some embedded webviews lock replaceState */ }
}

/** Initialise URL ↔ store sync. Called once from bootstrap. */
export function initUrlRouter() {
    if (!isMetaViewV2Enabled()) return;

    // 1) Initial sync: URL → store (if the URL carries meta state).
    const initial = parseHash(window.location.hash);
    if (initial) applyUrlToStore(initial);

    // 2) Subscribe: store → URL.
    metaViewStore.subscribe(() => applyStoreToUrl());

    // 3) Listen for back/forward navigation: URL → store.
    window.addEventListener('hashchange', () => {
        const parsed = parseHash(window.location.hash);
        if (parsed) applyUrlToStore(parsed);
    });
    window.addEventListener('popstate', () => {
        const parsed = parseHash(window.location.hash);
        if (parsed) applyUrlToStore(parsed);
    });
}
