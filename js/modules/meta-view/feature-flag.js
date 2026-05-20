// @ts-check
/**
 * meta-view/feature-flag.js — opt-in toggle for the Wave-2 IA-Refactor.
 *
 * During the development cutover, the new consolidated "Meta Analysis"
 * tab (the 5-→-1 merge) ships ALONGSIDE the existing 5 separate tabs
 * behind this flag. The legacy UI stays default while the new one is
 * being verified. Once stable, default flips to v2; legacy is removed
 * one or two cycles later.
 *
 * How to enable v2
 * ----------------
 *   1) URL query param:  https://thedipidis.app/?ia=v2
 *   2) localStorage:     localStorage.setItem('IA_V2', '1')
 *
 * URL param wins over localStorage. Setting `?ia=v1` forces the legacy
 * UI even if localStorage says v2 — handy for bug reports.
 *
 * Lifecycle (planned)
 * -------------------
 *   - Phase A (now)        : flag default-OFF; both UIs coexist
 *   - Phase B (when stable): flag default-ON; legacy still selectable
 *   - Phase C (cleanup)    : legacy UI deleted from the source tree
 */

const STORAGE_KEY = 'IA_V2';
const QUERY_KEY = 'ia';

/** @returns {boolean} */
export function isMetaViewV2Enabled() {
    // URL param wins (so a one-link bug report can pin the UI version).
    try {
        const url = new URL(window.location.href);
        const q = url.searchParams.get(QUERY_KEY);
        if (q === 'v2') return true;
        if (q === 'v1') return false;
    } catch (_) {
        // URL parse failed (file:// + jsdom oddities) — fall through.
    }

    // Otherwise consult localStorage.
    try {
        return window.localStorage.getItem(STORAGE_KEY) === '1';
    } catch (_) {
        return false;
    }
}

/** Persist the user's choice. Use from a settings UI or devtools. */
export function setMetaViewV2(/** @type {boolean} */ enabled) {
    try {
        if (enabled) window.localStorage.setItem(STORAGE_KEY, '1');
        else window.localStorage.removeItem(STORAGE_KEY);
    } catch (_) { /* localStorage disabled — silent no-op */ }
}

// Expose for devtools access: `window.setMetaViewV2(true)` from the console.
/** @type {any} */ (window).isMetaViewV2Enabled = isMetaViewV2Enabled;
/** @type {any} */ (window).setMetaViewV2 = setMetaViewV2;
