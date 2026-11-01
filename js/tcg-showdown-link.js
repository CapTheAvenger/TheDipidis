/*
 * TCG Showdown deck-handoff helper.
 *
 * Seit 01.11.2026 laeuft TCG Showdown auf dieser Seite selbst
 * (thedipidis.app/showdown/, Selbstspiel im Browser, Quelle: privates
 * Repo CapTheAvenger/tcgshowdown, Build liegt in showdown/). Die Uebergabe
 * schreibt die Deckliste (PTCG-Live-Text) unter UEBERGABE_KEY in
 * localStorage — gleiche Herkunft, also liest Showdown sie direkt ein und
 * waehlt das Deck fuer Spieler 1 vor. Kein Einfuegen mehr noetig; die
 * Zwischenablage bekommt die Liste trotzdem, falls jemand sie woanders
 * braucht.
 *
 * Sources currently wired:
 *   - 'cityLeague'  / 'currentMeta' / 'pastMeta'  — Deck-Builder state
 *     consumed via the same window.cityLeagueDeck / currentMetaDeck /
 *     pastMetaDeck globals the Playtester used (preserves the existing
 *     deck format pipeline).
 *   - 'savedDeck' + deckIndex — saved deck from My Decks via
 *     window.userDecks (mirrors copyDeckAndOpenLimitless).
 *
 * Why a separate file: keeps the "playtester replacement" feature
 * cleanly isolated. If we ever re-enable the local playtester or
 * switch the external target, this is the single file to edit.
 */
(function () {
    'use strict';

    const SHOWDOWN_URL = '/showdown/';
    // Muss zu client/src/local/uebergabe.ts (UEBERGABE_KEY) im Showdown-Repo passen.
    const UEBERGABE_KEY = 'thedipidis-showdown-uebergabe';

    function _toast(msg, kind) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, kind || 'success');
        } else {
            console.info('[TCG-Showdown]', msg);
        }
    }

    function _de() {
        return (typeof window.getLang === 'function' && window.getLang() === 'de');
    }

    // Prefer the project-wide i18n helper when present so the messages
    // stay in sync with the rest of the app. Falls back to the inline
    // string when the i18n module hasn't loaded yet (defensive — the
    // module is `defer`-loaded same as this one, so order should be
    // deterministic, but a fresh user with no localStorage hits this
    // file before i18n.js initializes its dictionary in some edge cases).
    function _i18n(key, fallbackEn, fallbackDe) {
        if (typeof window.t === 'function') {
            const got = window.t(key);
            if (got && got !== key) return got;
        }
        return _de() ? fallbackDe : fallbackEn;
    }

    // Reuse the Deck-Builder export-string format. Returns the same
    // PTCG-Live-compatible string the Playtester setup used to pass
    // to its parser — Pokémon TCG Live exports are the de-facto
    // interchange format that Limitless / Showdown / Pokémon-Zone
    // all accept.
    function _buildDeckListFromBuilder(source) {
        const deckObj = source === 'cityLeague'  ? (window.cityLeagueDeck  || {})
                      : source === 'currentMeta' ? (window.currentMetaDeck || {})
                      : source === 'pastMeta'    ? (window.pastMetaDeck    || {})
                      : null;
        if (!deckObj) return '';
        const lines = [];
        for (const [deckKey, count] of Object.entries(deckObj)) {
            if (!count || count <= 0) continue;
            const m = deckKey.match(/^(.+?)\s+\(([A-Z0-9-]+)\s+([A-Z0-9-]+)\)$/);
            lines.push(m ? `${count} ${m[1]} ${m[2]} ${m[3]}` : `${count} ${deckKey}`);
        }
        return lines.join('\n');
    }

    // Build a category-grouped PTCG Live decklist from a saved deck
    // (window.userDecks[deckIndex].cards). Mirrors copyDeckAndOpenLimitless
    // so saved decks land in the same shape regardless of which
    // external builder they're shipped to.
    function _buildDeckListFromSaved(deckIndex) {
        const deck = window.userDecks && window.userDecks[deckIndex];
        if (!deck || !deck.cards) return '';

        const pokemon = [];
        const trainer = [];
        const energy = [];

        for (const [deckKey, count] of Object.entries(deck.cards)) {
            if (!count || count <= 0) continue;
            const setMatch = deckKey.match(/^(.+?)\s+\(([A-Z0-9]+)\s+([A-Z0-9]+)\)$/);
            let cardName = deckKey, setCode = '', setNumber = '';
            if (setMatch) {
                cardName = setMatch[1]; setCode = setMatch[2]; setNumber = setMatch[3];
            } else {
                const cardData = window.allCardsDatabase
                    && window.allCardsDatabase.find(c => c.name === cardName);
                if (cardData) { setCode = cardData.set || ''; setNumber = cardData.number || ''; }
            }
            const line = setCode && setNumber
                ? `${count} ${cardName} ${setCode} ${setNumber}`
                : `${count} ${cardName}`;

            let category = 'trainer';
            const cardData = window.allCardsDatabase && (
                (setCode && setNumber)
                    ? window.allCardsDatabase.find(c => c.name === cardName && c.set === setCode && c.number === setNumber)
                    : window.allCardsDatabase.find(c => c.name === cardName)
            );
            if (cardData && typeof window.getCardTypeCategory === 'function') {
                const cat = window.getCardTypeCategory(cardData.type || '');
                if (cat === 'Pokemon') category = 'pokemon';
                else if (cat === 'Energy' || cat === 'Special Energy') category = 'energy';
            } else if (/Energy$/.test(cardName)) {
                category = 'energy';
            }
            if      (category === 'pokemon') pokemon.push(line);
            else if (category === 'energy')  energy.push(line);
            else                             trainer.push(line);
        }

        let output = '';
        if (pokemon.length > 0) output += `Pokémon: ${pokemon.length}\n${pokemon.join('\n')}\n\n`;
        if (trainer.length > 0) output += `Trainer: ${trainer.length}\n${trainer.join('\n')}\n\n`;
        if (energy.length  > 0) output += `Energy: ${energy.length}\n${energy.join('\n')}`;
        return output.trim();
    }

    function _openShowdownAfterCopy(deckString, opts) {
        opts = opts || {};
        const successMsg = _i18n('showdown.toastHandoff',
            'Deck handed over — TCG Showdown is opening.',
            'Deck übergeben — TCG Showdown öffnet sich.');
        const emptyMsg = _i18n('showdown.toastEmpty',
            'Your deck is empty — nothing to copy.',
            'Dein Deck ist leer — nichts zu kopieren.');

        if (!deckString) {
            _toast(emptyMsg, 'warning');
            return;
        }
        try {
            localStorage.setItem(UEBERGABE_KEY, JSON.stringify({
                name: opts.name || '', text: deckString, ts: Date.now(),
            }));
        } catch (_e) { /* privates Fenster: Showdown startet dann ohne Vorauswahl */ }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(deckString).catch(() => {});
        }
        _toast(successMsg, 'success');
        window.open(SHOWDOWN_URL, '_blank', 'noopener');
    }

    // Called from Deck-Builder views (City League, Current Meta, Past
    // Meta) — replaces the old "Playtest" button.
    function openInShowdownFromBuilder(source) {
        const deckString = _buildDeckListFromBuilder(source);
        _openShowdownAfterCopy(deckString, { source });
    }

    // Called from My Decks — replaces / complements
    // copyDeckAndOpenLimitless for the Showdown handoff.
    function copyDeckAndOpenShowdown(deckIndex) {
        const deckString = _buildDeckListFromSaved(deckIndex);
        const deck = window.userDecks && window.userDecks[deckIndex];
        _openShowdownAfterCopy(deckString, { source: 'savedDeck', deckIndex, name: deck && deck.name });
    }

    // Plain "open the site" — used by the main-menu link. Doesn't
    // hand over a deck since the user hasn't selected one yet.
    function openShowdownExternal() {
        window.open(SHOWDOWN_URL, '_blank', 'noopener');
    }

    // Expose globals so HTML inline onclick handlers can call them.
    window.openInShowdownFromBuilder = openInShowdownFromBuilder;
    window.copyDeckAndOpenShowdown   = copyDeckAndOpenShowdown;
    window.openShowdownExternal      = openShowdownExternal;
})();
