// @ts-check
/**
 * metrics.js — canonical share + win-rate parsing.
 *
 * The scrapers persist these numbers as strings ("62,50", "62.5%",
 * "0,00", null, undefined depending on which scraper version produced
 * the row). The rendering code in app-current-meta-analysis,
 * app-anti-tech, app-tier-meta, app-meta-cards, etc. has repeatedly
 * re-implemented the same parse-with-fallback logic — there's at least
 * one full duplicate inside app-current-meta-analysis.js alone
 * (three identical parseWr arrow functions).
 *
 * This module is the Wave-2 "Canonical Share / WinRate" foundation:
 * one set of helpers everyone calls. Existing call-sites keep working
 * (they have their own inline copies); future ones use these. Migration
 * is incremental, file-by-file, like the parseCardKey rollout.
 */

/**
 * Parse a share / win-rate value coming from the scrapers or a saved
 * deck. Tolerates:
 *   - numbers ("already parsed", returned as-is when finite)
 *   - "62,5" / "62.5" / "62,50%" / " 62.5 %"
 *   - null / undefined / "" / "-" / NaN → 0
 *
 * @param {unknown} value
 * @returns {number}  finite percentage, 0 fallback
 */
export function parsePercent(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (value == null) return 0;
    const s = String(value).replace(',', '.').replace('%', '').trim();
    if (s === '' || s === '-') return 0;
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
}

/**
 * Same as parsePercent but returns NaN (not 0) for unparseable input.
 * Use when you need to distinguish "missing data" from "zero" — e.g.
 * the share-trend chart skips NaN points entirely instead of plotting
 * them on the zero line.
 *
 * @param {unknown} value
 * @returns {number}
 */
export function parsePercentOrNaN(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    if (value == null) return NaN;
    const s = String(value).replace(',', '.').replace('%', '').trim();
    if (s === '' || s === '-') return NaN;
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : NaN;
}

/**
 * Format a number 0..100 as a display string, optionally with the
 * percent sign + a fixed decimal-place count. Used in the meta tables
 * and tooltips.
 *
 * @param {number} value
 * @param {{ digits?: number, sign?: boolean, fallback?: string }} [opts]
 * @returns {string}
 */
export function formatPercent(value, opts) {
    const digits = opts?.digits ?? 1;
    const sign = opts?.sign ?? true;
    const fallback = opts?.fallback ?? '-';
    if (!Number.isFinite(value)) return fallback;
    const body = value.toFixed(digits);
    return sign ? body + '%' : body;
}

/**
 * Weighted average of an array of { wr, games } rows. Returns 0 for an
 * empty / zero-games input. Used by the deck-overview to compute the
 * "weighted average winrate across N matchups" cell.
 *
 * @param {Array<{ wr: number, games: number }>} rows
 * @returns {number}
 */
export function weightedAverageWinRate(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return 0;
    let totalWins = 0;
    let totalGames = 0;
    for (const r of rows) {
        if (!r) continue;
        const games = Number(r.games) || 0;
        const wr = Number(r.wr) || 0;
        if (games <= 0) continue;
        totalWins += (games * wr) / 100;
        totalGames += games;
    }
    if (totalGames === 0) return 0;
    return (totalWins / totalGames) * 100;
}
