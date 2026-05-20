// @ts-check
/**
 * meta-view/bootstrap.js — initialise the Wave-2 IA-Refactor UI.
 *
 * Runs on DOMContentLoaded (or immediately if the DOM is already loaded
 * by the time the modules bundle's IIFE executes). Two responsibilities:
 *
 *   1. CSS-class swap based on the feature flag:
 *      - body.ia-v2 → CSS hides .ia-v1-only items + shows .ia-v2-only
 *      - body.ia-v1 (default) → reverse
 *
 *   2. Bind the segmented-control to the store: subscribers update the
 *      .meta-view-seg-active class + aria-selected as activeFormat
 *      changes, and toggle the list/detail panel visibility based on
 *      state.view. (HTML onclick handlers call metaViewSwitchFormat /
 *      metaViewBackToList directly, so we don't need to attach those
 *      listeners here.)
 */

import { metaViewStore } from './store.js';
import { isMetaViewV2Enabled } from './feature-flag.js';
import { initUrlRouter } from './url-router.js';

/**
 * Maps `metaViewStore.activeFormat` → legacy tab element id (LIST view).
 * The legacy tabs stay in the DOM (still own all of their existing
 * rendering + filters); step-3 reparents them into #meta-view-list so
 * they live INSIDE the consolidated tab and the segmented-control can
 * show/hide them by format.
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

function applyBodyClass() {
    const enabled = isMetaViewV2Enabled();
    document.body.classList.toggle('ia-v2', enabled);
    document.body.classList.toggle('ia-v1', !enabled);
}

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

    // Step 3: show ONLY the reparented legacy LIST tab matching activeFormat.
    const formatNodes = document.querySelectorAll('.meta-view-format-content');
    formatNodes.forEach((node) => {
        const el = /** @type {HTMLElement} */ (node);
        const isActive = el.dataset.format === s.activeFormat;
        el.classList.toggle('display-none', !isActive);
    });

    // Step 4: show ONLY the reparented analysis tab matching activeFormat
    // when the detail view is open. (Past-meta has no separate analysis
    // tab so this only applies to current + city-league.)
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
 * siblings — which is what we want in v2 (the segmented control
 * controls their visibility instead).
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
 * Step 4: reparent the two LEGACY analysis tabs (#current-analysis,
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
 * Wrap window.switchTab so that legacy `switchTab('current-analysis')` /
 * `switchTab('city-league-analysis')` calls (triggered when the user
 * clicks a deck row in the list) route through the consolidated UI
 * instead of jumping to a separate tab.
 *
 * - switchTab('current-analysis')      → metaViewStore.selectDeck +
 *                                         switchTab('meta-view')
 * - switchTab('city-league-analysis')  → same
 * - other tab ids                       → unchanged behaviour
 *
 * The wrap runs ONCE on bootstrap when v2 is active. Idempotent — a
 * second call is a no-op (we track the wrap via a sentinel symbol).
 */
const _WRAP_FLAG = '__metaViewSwitchTabWrapped';

function interceptSwitchTab() {
    /** @type {any} */ const w = window;
    if (w[_WRAP_FLAG]) return;
    const orig = w.switchTab;
    if (typeof orig !== 'function') {
        console.warn('[meta-view] window.switchTab not defined yet — skipping intercept');
        return;
    }
    w.switchTab = function (/** @type {string} */ tabId) {
        if (isMetaViewV2Enabled()) {
            const fmt = /** @type {any} */ (ANALYSIS_TAB_TO_FORMAT)[tabId];
            if (fmt) {
                // Set the active format (preserves selection if matched)
                // then mark the view as detail; bootstrap's store sub
                // shows the right analysis content.
                metaViewStore.setFormat(fmt);
                // Use the currently-tracked archetype from the legacy
                // selectors if the caller didn't pass one explicitly.
                // The legacy code stores the picked deck name in
                // window.currentMetaDeckName / cityLeagueDeckName-ish
                // globals; metric-test for whichever exists.
                const archetype =
                    /** @type {any} */ (w).currentMetaArchetype ||
                    /** @type {any} */ (w).currentCityLeagueArchetype ||
                    '';
                metaViewStore.selectDeck({ archetype, format: fmt });
                // Make sure the consolidated tab itself is visible.
                return orig.call(w, 'meta-view');
            }
        }
        return orig.apply(w, /** @type {any} */ (arguments));
    };
    w[_WRAP_FLAG] = true;
}

function init() {
    applyBodyClass();
    // Only reparent legacy tabs into the consolidated view when v2 is
    // active. v1 mode leaves them in place untouched.
    if (isMetaViewV2Enabled()) {
        reparentLegacyTabsIntoMetaView();
        reparentAnalysisTabsIntoMetaView();
        interceptSwitchTab();
        initUrlRouter();
    }
    applyStoreStateToDom();
    // Re-render whenever the store changes.
    metaViewStore.subscribe(() => applyStoreStateToDom());

    // If v2 is on and the URL/hash doesn't specify another tab, land
    // on meta-view by default. (Step 5 = URL routing will make this
    // smarter; for now we just respect the user opt-in.)
    if (isMetaViewV2Enabled() && typeof window.switchTab === 'function') {
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
