// @ts-check
/**
 * meta-view/store.js — state container for the consolidated meta-analysis tab.
 *
 * Wave-2 IA-Refactor (5 Meta-Tabs → 1). The legacy app had FIVE separate
 * top-level tabs: city-league, city-league-analysis, current-meta,
 * current-analysis, past-meta. The Wave-2 design merges them into ONE
 * "Meta Analysis" tab with:
 *   - a segmented control at top: [Current | City League | Past]
 *   - list-view: deck table for the active format
 *   - detail-view: drilldown analysis for a selected deck (replaces the
 *     two separate *-analysis tabs)
 *
 * State machine
 * -------------
 *   activeFormat : 'current' | 'city-league' | 'past'
 *   view         : 'list' | 'detail'
 *   selectedDeck : { archetype, format, payload } | null
 *                   payload is whatever the legacy renderers consumed
 *                   (deck cards + metrics) — kept opaque to the store.
 *   filters      : { dateRange?, archetype?, ... }
 *                   format-agnostic filters; format-specific filters
 *                   live in the legacy render functions (for now).
 *   isLoading    : boolean — set while a format-switch is fetching data.
 *
 * Format-switch preserves selectedDeck IF the same archetype exists in
 * the target format; otherwise selectedDeck resets to null. Filters
 * carry over when their semantics overlap.
 */

import { createStore } from '../stores/store.js';

/** @typedef {'current' | 'city-league' | 'past'} MetaFormat */
/** @typedef {'list' | 'detail'} MetaView */

/**
 * @typedef {Object} SelectedDeck
 * @property {string}    archetype  Canonical archetype name (case-preserved).
 * @property {MetaFormat} format    Format the deck was selected FROM.
 * @property {any}       [payload]  Optional deck-data blob the renderer can read.
 *
 * @typedef {Object} MetaFilters
 * @property {string}  [search]      Free-text search across deck names.
 * @property {string}  [dateRange]   e.g. '7d' | '30d' | 'all'
 * @property {string}  [archetype]   Quick-filter by archetype substring.
 *
 * @typedef {Object} MetaViewState
 * @property {MetaFormat}            activeFormat
 * @property {MetaView}              view
 * @property {SelectedDeck | null}   selectedDeck
 * @property {MetaFilters}           filters
 * @property {boolean}               isLoading
 */

/** @type {MetaViewState} */
const INITIAL = {
    activeFormat: 'current',
    view: 'list',
    selectedDeck: null,
    filters: {},
    isLoading: false,
};

const _store = createStore(INITIAL);

/**
 * Public API. Read with get(), mutate with the named action functions
 * below — never reach into _store directly from outside this module.
 */
export const metaViewStore = {
    get: () => /** @type {MetaViewState} */ (_store.get()),
    subscribe: _store.subscribe,

    /** Switch the active format. Resets view to 'list' (back out of any
     *  open detail). Preserves selectedDeck across formats IF the
     *  archetype name matches a deck in the target format — that check
     *  happens lazily in the controller (which has access to deck
     *  data); the store just records the intent. */
    setFormat(/** @type {MetaFormat} */ format) {
        if (!isValidFormat(format)) return;
        _store.update((s) => ({
            ...s,
            activeFormat: format,
            view: 'list',
            // selectedDeck preserved deliberately; controller may clear it
            // if no matching archetype exists in the new format.
        }));
    },

    /** Open the detail view for a specific deck. */
    selectDeck(/** @type {SelectedDeck} */ deck) {
        if (!deck || !deck.archetype) return;
        _store.update((s) => ({
            ...s,
            selectedDeck: deck,
            view: 'detail',
        }));
    },

    /** Return to the list view, keeping the format + filters intact. */
    backToList() {
        _store.update((s) => ({
            ...s,
            view: 'list',
            // selectedDeck stays so the user can reopen the same deck
            // with one click (and the legacy renderers don't need to
            // re-resolve archetype → payload).
        }));
    },

    /** Update filter values (partial — only changed keys need to be passed). */
    setFilters(/** @type {Partial<MetaFilters>} */ patch) {
        _store.update((s) => ({
            ...s,
            filters: { ...s.filters, ...patch },
        }));
    },

    /** Set the loading flag during async format-switches / data fetches. */
    setLoading(/** @type {boolean} */ isLoading) {
        _store.update((s) => ({ ...s, isLoading: !!isLoading }));
    },

    /** Clear selectedDeck — used by the controller when format-switch
     *  finds the previously-selected archetype isn't available in the
     *  new format. */
    clearSelectedDeck() {
        _store.update((s) => ({ ...s, selectedDeck: null }));
    },

    /** Hard reset (e.g. on signout). */
    reset() {
        _store.set(INITIAL);
    },
};

/** Whitelist of accepted format values. Keeps the store from accepting
 *  garbage from URL parsers. */
export function isValidFormat(value) {
    return value === 'current' || value === 'city-league' || value === 'past';
}

// Expose globally for legacy-script interop during the cutover.
/** @type {any} */ (window).metaViewStore = metaViewStore;
