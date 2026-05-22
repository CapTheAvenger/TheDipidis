// deck-analysis-shared.js
// Shared helpers for Deck Analysis tabs (City League, Current Meta, Past Meta)

(function () {
    function setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    function updateDeckStatsByIds(statsById, sectionId) {
        if (!statsById || typeof statsById !== 'object') return;
        Object.entries(statsById).forEach(([id, value]) => setText(id, String(value)));
        if (sectionId) {
            const section = document.getElementById(sectionId);
            if (section) section.classList.remove('d-none', 'city-league-stats-section-hidden');
        }
    }

    /** Show cards-section + deck-builder for a given tab prefix when data loads */
    function showDeckSections(prefix) {
        var cardsSec = document.getElementById(prefix + 'CardsSection');
        var builderSec = document.getElementById(prefix + 'DeckBuilderSection');
        if (cardsSec) cardsSec.classList.remove('d-none');
        if (builderSec) builderSec.classList.remove('d-none');
    }

    /** Hide cards-section + deck-builder for a given tab prefix (no deck selected) */
    function hideDeckSections(prefix) {
        var cardsSec = document.getElementById(prefix + 'CardsSection');
        var builderSec = document.getElementById(prefix + 'DeckBuilderSection');
        if (cardsSec) cardsSec.classList.add('d-none');
        if (builderSec) builderSec.classList.add('d-none');
    }

    function resetDeckOverviewCounts(countId, summaryId, cardsText, totalText) {
        setText(countId, cardsText || '0 Cards');
        setText(summaryId, totalText || '/ 0 Total');
    }

    function renderNoDeckSelectedState(containerId, message) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const text = message || 'Please select a deck from the dropdown to load cards.';
        container.innerHTML = '<div class="deck-builder-empty-state" role="status" aria-live="polite"><h4 class="deck-builder-empty-title">'
            + text + '</h4></div>';
    }

    window.updateDeckStatsByIds = updateDeckStatsByIds;
    window.resetDeckOverviewCounts = resetDeckOverviewCounts;
    window.renderNoDeckSelectedState = renderNoDeckSelectedState;
    window.showDeckSections = showDeckSections;
    window.hideDeckSections = hideDeckSections;
})();
