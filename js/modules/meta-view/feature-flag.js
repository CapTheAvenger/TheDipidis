// @ts-check
/**
 * meta-view/feature-flag.js — opt-in toggle for the Wave-2 IA-Refactor.
 *
 * During the development cutover, the new consolidated "Meta Analysis"
 * tab (the 5-→-1 merge) ships ALONGSIDE the existing 5 separate tabs
 * behind this flag. The legacy UI stays default while the new one is
 * being verified.
 *
 * How to enable v2
 * ----------------
 *   URL query param only:  https://thedipidis.app/?ia=v2
 *
 * Pre-2026-05-20: localStorage was also accepted as a persistence
 * mechanism. Removed because the IA reparenting is invasive (legacy
 * tabs get moved into the consolidated container, their `tab-content`
 * class stripped). Once a user enables v2, they couldn't easily go
 * back to v1 in the same browser without clearing localStorage. Making
 * the flag URL-only means closing+reopening the tab returns the user
 * to the safe default — no permanent state on disk.
 *
 * Setting ?ia=v1 explicitly forces legacy UI (idempotent no-op since
 * legacy IS the default; kept as a kill-switch for bug reports).
 *
 * Lifecycle (planned)
 * -------------------
 *   - Phase A (now)        : flag default-OFF; URL-param-only opt-in
 *   - Phase B (when stable): flag default-ON; ?ia=v1 escape hatch
 *   - Phase C (cleanup)    : legacy UI deleted from the source tree
 */

const QUERY_KEY = 'ia';

/** @returns {boolean} */
export function isMetaViewV2Enabled() {
    try {
        const url = new URL(window.location.href);
        const q = url.searchParams.get(QUERY_KEY);
        return q === 'v2';
    } catch (_) {
        // URL parse failed (file:// + jsdom oddities) — default to v1.
        return false;
    }
}

/**
 * Legacy: previously persisted to localStorage. NOW a no-op — kept
 * exported so devtools snippets that called it from earlier sessions
 * don't throw. URL is the only enable path.
 */
export function setMetaViewV2(/** @type {boolean} */ _enabled) {
    // intentional no-op
}

// Expose for devtools access (legacy console snippets keep working).
/** @type {any} */ (window).isMetaViewV2Enabled = isMetaViewV2Enabled;
/** @type {any} */ (window).setMetaViewV2 = setMetaViewV2;

// Also actively CLEAR any stale localStorage left over from earlier
// testing — guarantees no user gets stuck in v2 mode by accident.
try {
    window.localStorage.removeItem('IA_V2');
} catch (_) { /* localStorage disabled — silent */ }

