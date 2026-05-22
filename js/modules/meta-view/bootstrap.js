// @ts-check
/**
 * meta-view/bootstrap.js — initialise the consolidated Meta Analysis tab.
 *
 * Runs on DOMContentLoaded (or immediately if the DOM is already loaded
 * by the time the modules bundle's IIFE executes). Two responsibilities:
 *
 *   1. Reparent the legacy meta tabs (#current-meta, #city-league,
 *      #past-meta, #current-analysis, #city-league-analysis) into the
 *      consolidated #meta-view list/detail containers and intercept
 *      switchTab() so any caller that still targets one of the legacy
 *      IDs routes through the segmented-control state.
 *
 *   2. Bind the segmented-control + back button to the store: subscribers
 *      update the .meta-view-seg-active class + aria-selected as
 *      activeFormat changes, and toggle the list/detail panel visibility
 *      based on state.view. (HTML onclick handlers call
 *      metaViewSwitchFormat / metaViewBackToList directly, so we don't
 *      need to attach those listeners here.)
 *
 * Phase C (2026-05-21): the feature flag is gone — v2 is the only IA.
 */

import { metaViewStore } from './store.js';
import { initUrlRouter } from './url-router.js';

/**
 * Maps `metaViewStore.activeFormat` → legacy tab element id (LIST view).
 * The legacy tabs stay in the DOM (still own all of their existing
 * rendering + filters); reparentLegacyTabsIntoMetaView() moves them
 * into #meta-view-list so they live INSIDE the consolidated tab and
 * the segmented-control can show/hide them by format.
 */
const FORMAT_TO_LEGACY_TAB = {
    'current': 'current-meta',
    'city-league': 'city-league',
    'past': 'past-meta',
};

/**
 * Maps `metaViewStore.activeFormat` → legacy analysis tab id (DETAIL view).
 * `past` is intentionally absent — past-meta keeps its drilldown inside
 * the past-meta list panel itself (no separate analysis tab in the
 * legacy app). For `current` / `city-league` we reparent the *-analysis
 * tab into #meta-view-detail-content and intercept switchTab() so the
 * legacy code's drilldown attempts route through the consolidated view.
 */
const FORMAT_TO_ANALYSIS_TAB = {
    'current': 'current-analysis',
    'city-league': 'city-league-analysis',
};
const ANALYSIS_TAB_TO_FORMAT = {
    'current-analysis': 'current',
    'city-league-analysis': 'city-league',
};

function applyStoreStateToDom() {
    const s = metaViewStore.get();

    // Highlight the active segmented-control button.
    const segButtons = document.querySelectorAll('.meta-view-seg-btn');
    segButtons.forEach((b) => {
        const btn = /** @type {HTMLButtonElement} */ (b);
        const isActive = btn.dataset.format === s.activeFormat;
        btn.classList.toggle('meta-view-seg-active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    // Toggle list / detail panel visibility based on view.
    const root = document.getElementById('meta-view');
    if (root) {
        root.classList.toggle('meta-view-show-detail', s.view === 'detail');
    }
    const listEl = document.getElementById('meta-view-list');
    const detailEl = document.getElementById('meta-view-detail');
    if (listEl) listEl.classList.toggle('display-none', s.view !== 'list');
    if (detailEl) detailEl.classList.toggle('display-none', s.view !== 'detail');

    // Show ONLY the reparented legacy LIST tab matching activeFormat.
    const formatNodes = document.querySelectorAll('.meta-view-format-content');
    formatNodes.forEach((node) => {
        const el = /** @type {HTMLElement} */ (node);
        const isActive = el.dataset.format === s.activeFormat;
        el.classList.toggle('display-none', !isActive);
    });

    // Show ONLY the reparented analysis tab matching activeFormat when
    // the detail view is open. (Past-meta has no separate analysis tab
    // so this only applies to current + city-league.)
    const detailNodes = document.querySelectorAll('.meta-view-detail-content');
    detailNodes.forEach((node) => {
        const el = /** @type {HTMLElement} */ (node);
        const isActive = el.dataset.detailFor === s.activeFormat;
        el.classList.toggle('display-none', !isActive);
    });
}

/**
 * One-time reparent of the three legacy main meta tabs into the new
 * consolidated #meta-view-list panel. After this runs the legacy
 * <div id="current-meta"> etc. are children of #meta-view-list with
 * class `meta-view-format-content` + `data-format="current"`. The
 * legacy switchTab() will no longer find them as `.tab-content`
 * siblings — which is what we want (the segmented control controls
 * their visibility instead).
 *
 * Idempotent: re-running is a no-op (the data-format attribute
 * signals "already moved").
 */
function reparentLegacyTabsIntoMetaView() {
    const listEl = document.getElementById('meta-view-list');
    if (!listEl) return;

    Object.entries(FORMAT_TO_LEGACY_TAB).forEach(([format, legacyId]) => {
        const node = document.getElementById(legacyId);
        if (!node) {
            console.warn('[meta-view] legacy tab #' + legacyId + ' missing — skipped');
            return;
        }
        if (node.dataset.format === format) return; // already moved
        // Strip tab-content classes so legacy switchTab() ignores it.
        node.classList.remove('tab-content', 'active');
        node.classList.add('meta-view-format-content');
        node.dataset.format = format;
        // Replace the placeholder on first move.
        const placeholder = listEl.querySelector('.meta-view-placeholder');
        if (placeholder) placeholder.remove();
        listEl.appendChild(node);
    });
}

/**
 * Reparent the two LEGACY analysis tabs (#current-analysis,
 * #city-league-analysis) into #meta-view-detail-content. Past-meta
 * keeps its drilldown in-place (no separate analysis tab in legacy).
 *
 * After this runs the analysis tabs live in the detail panel and are
 * shown/hidden by the store's activeFormat. Legacy switchTab calls
 * targeting these IDs get intercepted by interceptSwitchTab() and
 * routed through metaViewStore.selectDeck() so the consolidated UI
 * stays in sync with deck-row clicks.
 */
function reparentAnalysisTabsIntoMetaView() {
    const detailContent = document.getElementById('meta-view-detail-content');
    if (!detailContent) return;

    Object.entries(FORMAT_TO_ANALYSIS_TAB).forEach(([format, legacyId]) => {
        const node = document.getElementById(legacyId);
        if (!node) {
            console.warn('[meta-view] analysis tab #' + legacyId + ' missing — skipped');
            return;
        }
        if (node.dataset.detailFor === format) return; // already moved
        node.classList.remove('tab-content', 'active');
        node.classList.add('meta-view-detail-content');
        node.dataset.detailFor = format;
        detailContent.appendChild(node);
    });
}

/**
 * Wrap window.switchTab so legacy meta-tab IDs route through the
 * consolidated UI instead of jumping to a separate (now-reparented) tab.
 *
 * The legacy DOM nodes have been moved out of their tab-content sibling
 * position into #meta-view-list / #meta-view-detail-content, so
 * orig.switchTab(legacyId) can no longer activate them. We map each
 * legacy id to the right consolidated transition:
 *
 *   list tabs   ('current-meta' | 'city-league' | 'past-meta')
 *     → setFormat(<format>) + switchTab('meta-view')      (list view)
 *
 *   analysis    ('current-analysis' | 'city-league-analysis')
 *     → setFormat + selectDeck + switchTab('meta-view')   (detail view)
 *
 *   other ids   → unchanged behaviour
 *
 * The wrap runs ONCE on bootstrap. Idempotent — a second call is a
 * no-op (we track the wrap via a sentinel flag on window).
 */
const _WRAP_FLAG = '__metaViewSwitchTabWrapped';

const LEGACY_LIST_TAB_TO_FORMAT = {
    'current-meta': 'current',
    'city-league': 'city-league',
    'past-meta': 'past',
};

function interceptSwitchTab() {
    /** @type {any} */ const w = window;
    if (w[_WRAP_FLAG]) return;
    const orig = w.switchTab;
    if (typeof orig !== 'function') {
        console.warn('[meta-view] window.switchTab not defined yet — skipping intercept');
        return;
    }
    w.switchTab = function (/** @type {string} */ tabId) {
        // Analysis tab → setFormat + open detail (legacy code paths
        // pass a previously-set archetype on window.*).
        const detailFmt = /** @type {any} */ (ANALYSIS_TAB_TO_FORMAT)[tabId];
        if (detailFmt) {
            metaViewStore.setFormat(detailFmt);
            const archetype =
                /** @type {any} */ (w).currentMetaArchetype ||
                /** @type {any} */ (w).currentCityLeagueArchetype ||
                '';
            metaViewStore.selectDeck({ archetype, format: detailFmt });
            return orig.call(w, 'meta-view');
        }
        // Legacy LIST tab → switch format, stay in list view.
        const listFmt = /** @type {any} */ (LEGACY_LIST_TAB_TO_FORMAT)[tabId];
        if (listFmt) {
            metaViewStore.setFormat(listFmt);
            metaViewStore.backToList();
            return orig.call(w, 'meta-view');
        }
        return orig.apply(w, /** @type {any} */ (arguments));
    };
    w[_WRAP_FLAG] = true;
}

function init() {
    reparentLegacyTabsIntoMetaView();
    reparentAnalysisTabsIntoMetaView();
    interceptSwitchTab();
    initUrlRouter();
    applyStoreStateToDom();
    // Re-render whenever the store changes.
    metaViewStore.subscribe(() => applyStoreStateToDom());

    // If the URL/hash doesn't specify another tab, land on meta-view by
    // default. The URL router handles #meta?format=… deep links.
    if (typeof window.switchTab === 'function') {
        // Don't clobber an explicit hash like #cards.
        if (!window.location.hash || window.location.hash === '#meta-view') {
            try { window.switchTab('meta-view'); } catch (_) { /* swallow */ }
        }
    }
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
}
