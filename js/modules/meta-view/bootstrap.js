// @ts-check
/**
 * meta-view/bootstrap.js — initialise meta-section navigation.
 *
 * Simplified from the Wave-2 IA-Refactor: the five legacy meta tabs
 * (#current-meta, #city-league, #past-meta, #current-analysis,
 * #city-league-analysis) are kept as independent tab-content elements.
 * No reparenting, no switchTab() intercept.
 *
 * The segmented control in #meta-view still works as a navigation aid:
 * clicking a segment calls switchTabAndUpdateMenu() for the corresponding
 * legacy tab, which triggers its lazy-loader in app-core.js normally.
 *
 * Page load lands on #current-meta (the most common entry point).
 */

import { metaViewStore } from './store.js';
import { initUrlRouter } from './url-router.js';

const FORMAT_TO_LEGACY_TAB = /** @type {Record<string,string>} */ ({
    'current': 'current-meta',
    'city-league': 'city-league',
    'past': 'past-meta',
});

// Override the controller's window.metaViewSwitchFormat so the HTML
// segmented-control onclick handlers route to the legacy tabs (which
// have their own lazy-loaders in app-core.js) instead of the store.
/** @type {any} */ (window).metaViewSwitchFormat = function (format) {
    const tabId = FORMAT_TO_LEGACY_TAB[format];
    if (!tabId) return;
    if (typeof /** @type {any} */ (window).switchTabAndUpdateMenu === 'function') {
        /** @type {any} */ (window).switchTabAndUpdateMenu(tabId);
    } else if (typeof /** @type {any} */ (window).switchTab === 'function') {
        /** @type {any} */ (window).switchTab(tabId);
    }
};

// Back-to-list is a no-op in the 5-tab layout.
/** @type {any} */ (window).metaViewBackToList = function () { /* no-op */ };

function init() {
    // URL router still provides #meta? deep-link support.
    initUrlRouter();

    // Default landing: Current Meta. Skip if the URL hash targets a
    // different tab or carries explicit meta-format routing.
    const hash = window.location.hash;
    const hasOtherTab = hash && !hash.startsWith('#meta');
    if (hasOtherTab) return;

    if (typeof /** @type {any} */ (window).switchTab === 'function') {
        let landingTab = 'current-meta';
        if (hash.startsWith('#meta')) {
            try {
                const q = new URLSearchParams(hash.replace(/^#meta\??/, ''));
                const fmt = q.get('format');
                if (fmt && FORMAT_TO_LEGACY_TAB[fmt]) landingTab = FORMAT_TO_LEGACY_TAB[fmt];
            } catch (_) { /* ignore malformed hash */ }
        }
        try { /** @type {any} */ (window).switchTab(landingTab); } catch (_) { /* swallow */ }
    }
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
}
