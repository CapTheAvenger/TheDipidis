// @ts-check
/**
 * meta-view/feature-flag.js — toggle for the Wave-2 IA-Refactor.
 *
 * Phase B (2026-05-21): v2 is the default. ?ia=v1 is the kill-switch.
 *
 *   - no URL param   → v2 (default)
 *   - ?ia=v1         → legacy UI (escape hatch for bug reports)
 *   - ?ia=v2         → v2 (explicit; same as default — kept so old
 *                       bookmarks/share-links don't break)
 *
 * Phase history
 * -------------
 *   - Phase A (pre-2026-05-21): default-OFF, opt-in via ?ia=v2
 *   - Phase B (now)            : default-ON, ?ia=v1 escape hatch
 *   - Phase C (planned)        : legacy UI deleted, this flag removed
 *
 * Why URL-only (no localStorage)?
 *   The IA reparenting is invasive — legacy tabs get moved into the
 *   consolidated container and lose their `tab-content` class.
 *   Persisting the flag on disk would trap users who flipped it via
 *   devtools. URL-only means closing+reopening returns to the safe
 *   default (which is now v2).
 */

const QUERY_KEY = 'ia';

/** @returns {boolean} */
export function isMetaViewV2Enabled() {
    try {
        const url = new URL(window.location.href);
        const q = url.searchParams.get(QUERY_KEY);
        // Default-ON. Only the explicit kill-switch ?ia=v1 forces legacy.
        return q !== 'v1';
    } catch (_) {
        // URL parse failed (file:// + jsdom oddities) — default to v2.
        return true;
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
// testing — guarantees no user gets stuck via accidental state.
try {
    window.localStorage.removeItem('IA_V2');
} catch (_) { /* localStorage disabled — silent */ }
