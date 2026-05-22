// @ts-check
/*
 * deck-analysis-shared.js — small helpers used by City League, Current
 * Meta, and Past Meta deck-analysis tabs.
 *
 * Wave-1 L2.14 — converted from legacy IIFE to a proper ES module. The
 * five exported functions are mirrored onto window for HTML-inline /
 * legacy-bare callers via the modules-bundle footer.
 */

function setText(/** @type {string} */ id, /** @type {string} */ value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

export function updateDeckStatsByIds(statsById, sectionId) {
    if (!statsById || typeof statsById !== 'object') return;
    Object.entries(statsById).forEach(([id, value]) => setText(id, String(value)));
    if (sectionId) {
        const section = document.getElementById(sectionId);
        if (section) section.classList.remove('d-none', 'city-league-stats-section-hidden');
    }
}

/** Show cards-section + deck-builder for a given tab prefix when data loads */
export function showDeckSections(prefix) {
    const cardsSec = document.getElementById(prefix + 'CardsSection');
    const builderSec = document.getElementById(prefix + 'DeckBuilderSection');
    if (cardsSec) cardsSec.classList.remove('d-none');
    if (builderSec) builderSec.classList.remove('d-none');
}

/** Hide cards-section + deck-builder for a given tab prefix (no deck selected) */
export function hideDeckSections(prefix) {
    const cardsSec = document.getElementById(prefix + 'CardsSection');
    const builderSec = document.getElementById(prefix + 'DeckBuilderSection');
    if (cardsSec) cardsSec.classList.add('d-none');
    if (builderSec) builderSec.classList.add('d-none');
}

export function resetDeckOverviewCounts(countId, summaryId, cardsText, totalText) {
    setText(countId, cardsText || '0 Cards');
    setText(summaryId, totalText || '/ 0 Total');
}

export function renderNoDeckSelectedState(containerId, message) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const text = message || 'Please select a deck from the dropdown to load cards.';
    container.innerHTML =
        '<div class="deck-builder-empty-state" role="status" aria-live="polite"><h4 class="deck-builder-empty-title">' +
        text +
        '</h4></div>';
}
