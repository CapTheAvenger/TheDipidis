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
}

function init() {
    applyBodyClass();
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
