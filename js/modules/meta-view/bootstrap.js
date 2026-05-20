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

/**
 * Maps `metaViewStore.activeFormat` → legacy tab element id.
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

    // Step 3: show ONLY the reparented legacy tab matching activeFormat.
    // Legacy tabs are present as children of #meta-view-list with class
    // .meta-view-format-content + data-format. Bootstrap reparented them
    // out of their original `<div class="tab-content">` positions so the
    // legacy switchTab() leaves them alone.
    const formatNodes = document.querySelectorAll('.meta-view-format-content');
    formatNodes.forEach((node) => {
        const el = /** @type {HTMLElement} */ (node);
        const isActive = el.dataset.format === s.activeFormat;
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

function init() {
    applyBodyClass();
    // Only reparent legacy tabs into the consolidated view when v2 is
    // active. v1 mode leaves them in place untouched.
    if (isMetaViewV2Enabled()) {
        reparentLegacyTabsIntoMetaView();
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
