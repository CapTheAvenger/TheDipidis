// @ts-check
/**
 * meta-view/controller.js — actions + side-effects for the meta-view store.
 *
 * The store (./store.js) holds pure state. The controller is the layer
 * that:
 *   - validates user-driven transitions (e.g. is the selected deck
 *     actually available in the target format?)
 *   - bridges to the legacy renderers in app-city-league.js,
 *     app-current-meta.js, app-past-meta.js (which still own the
 *     deck-table + drilldown rendering during the cutover)
 *   - hooks into the URL router so URL changes drive state and vice-versa
 *
 * Step 1 (this commit) ships the action surface only — render bridging
 * lands in step 3 once the HTML scaffold (step 2) exists to render into.
 */

import { metaViewStore, isValidFormat } from './store.js';

/**
 * Switch the active format. If a deck is currently selected, attempt
 * to find the same archetype in the new format; if not present, clear
 * the selection so the user lands on the list view.
 *
 * @param {'current' | 'city-league' | 'past'} format
 */
export function switchFormat(format) {
    if (!isValidFormat(format)) {
        console.warn('[meta-view] ignoring invalid format:', format);
        return;
    }
    const prev = metaViewStore.get();
    metaViewStore.setFormat(format);
    // If the user had a deck open, try to preserve the selection across
    // formats. The legacy renderers expose lookup helpers via window;
    // we use them defensively (the global may not exist if its file
    // hasn't loaded yet). When the lookup misses, clear the selection
    // so we land cleanly on the list view in the new format.
    if (prev.selectedDeck && prev.selectedDeck.archetype) {
        if (!_archetypeAvailableInFormat(prev.selectedDeck.archetype, format)) {
            metaViewStore.clearSelectedDeck();
        }
    }
}

/**
 * Open the detail view for a specific deck.
 *
 * @param {string} archetype
 * @param {'current' | 'city-league' | 'past'} [format]  defaults to active
 */
export function selectDeck(archetype, format) {
    if (!archetype) return;
    const active = format || metaViewStore.get().activeFormat;
    if (!isValidFormat(active)) return;
    metaViewStore.selectDeck({
        archetype,
        format: active,
    });
}

/** Return to the deck-list view of the current format. */
export function backToList() {
    metaViewStore.backToList();
}

/**
 * Free-text search filter. Triggers a re-render via the store's
 * subscribers (the segmented-control + list components).
 *
 * @param {string} searchText
 */
export function setSearchFilter(searchText) {
    metaViewStore.setFilters({ search: String(searchText || '').trim() });
}

/**
 * Probe the legacy data globals for whether an archetype is known in
 * the given format. Defensively typed since the data globals may not
 * yet be populated (e.g. during initial page load before the format's
 * scraper data has been fetched).
 *
 * @param {string} archetype
 * @param {'current' | 'city-league' | 'past'} format
 * @returns {boolean}
 */
function _archetypeAvailableInFormat(archetype, format) {
    /** @type {any} */ const w = window;
    if (!archetype || !w) return false;
    /** @type {any[]} */
    let rows = [];
    switch (format) {
        case 'current':
            rows = Array.isArray(w.currentMetaAnalysisData) ? w.currentMetaAnalysisData : [];
            break;
        case 'city-league':
            rows = Array.isArray(w.cityLeagueAnalysisData) ? w.cityLeagueAnalysisData : [];
            break;
        case 'past':
            // Past meta uses different shape — search the deck-keys map.
            rows = w.pastMetaArchetypes && Array.isArray(w.pastMetaArchetypes)
                ? w.pastMetaArchetypes : [];
            break;
        default:
            return false;
    }
    if (!rows.length) {
        // No data loaded yet — be lenient. The format-switch will then
        // open list view; the user can click into a deck once data
        // lands. Returning true here would cause the controller to
        // jump straight into detail with no data, which is worse.
        return false;
    }
    const target = archetype.trim().toLowerCase();
    return rows.some((r) => {
        const name = r && (r.archetype || r.deck_name || r.name);
        return typeof name === 'string' && name.trim().toLowerCase() === target;
    });
}

// Expose for HTML inline handlers + legacy callers during the cutover.
/** @type {any} */ (window).metaViewSwitchFormat = switchFormat;
/** @type {any} */ (window).metaViewSelectDeck = selectDeck;
/** @type {any} */ (window).metaViewBackToList = backToList;
