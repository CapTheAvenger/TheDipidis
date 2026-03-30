// app-deck-builder.js — extracted from app.js
// Part of Hausi's Pokemon TCG Analysis

// Autosave beim Laden der Seite prüfen
(function() {
    try {
        const saved = localStorage.getItem('autosave_deck');
        if (saved) {
            const data = JSON.parse(saved);
            const totalCards = Object.values(data.cityLeague?.deck || {}).reduce((s,c)=>s+c,0)
                           + Object.values(data.currentMeta?.deck || {}).reduce((s,c)=>s+c,0)
                           + Object.values(data.pastMeta?.deck || {}).reduce((s,c)=>s+c,0);
            if (totalCards > 0) {
                window._pendingAutosave = data;
            }
        }
    } catch(e) { /* ignore */ }
})();
        localStorage.removeItem('cityLeagueDeck');
        localStorage.removeItem('currentMetaDeck');
        localStorage.removeItem('pastMetaDeck');
        window.cityLeagueDeck = {};
        window.cityLeagueDeckOrder = [];
        window.currentCityLeagueArchetype = null;
        window.currentMetaDeck = {};
        window.currentMetaDeckOrder = [];
        window.currentCurrentMetaArchetype = null;
        window.pastMetaDeck = {};
        window.pastMetaDeckOrder = [];
        window.pastMetaCurrentArchetype = null;
        devLog('[Init] Starting with empty deck (localStorage cleared on page load)');
        // Check for a shared deck in the URL – runs after clearing so it wins
        setTimeout(function() { if (typeof importDeckFromUrl === 'function') importDeckFromUrl(); }, 100);

        // Auto-save deck restore prompt (runs after DOM + shared deck import)
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(function() {
                if (!window._pendingAutosave) return;
                const data = window._pendingAutosave;
                delete window._pendingAutosave;
                // Don't prompt if a shared deck was already imported
                const anyDeck = Object.values(window.cityLeagueDeck || {}).reduce((s,c)=>s+c,0)
                             + Object.values(window.currentMetaDeck || {}).reduce((s,c)=>s+c,0)
                             + Object.values(window.pastMetaDeck || {}).reduce((s,c)=>s+c,0);
                if (anyDeck > 0) return;

                const ts = data.timestamp ? new Date(data.timestamp).toLocaleString() : '';
                if (confirm(t('deck.restorePrompt') + (ts ? ' (' + ts + ')' : '') + '\n' + t('deck.autoCompleteContinue'))) {
                    ['cityLeague', 'currentMeta', 'pastMeta'].forEach(src => {
                        const saved = data[src];
                        if (!saved || !saved.deck || Object.keys(saved.deck).length === 0) return;
                        if (src === 'cityLeague') {
                            window.cityLeagueDeck = saved.deck;
                            window.cityLeagueDeckOrder = saved.order || [];
                            window.currentCityLeagueArchetype = saved.archetype || null;
                        } else if (src === 'currentMeta') {
                            window.currentMetaDeck = saved.deck;
                            window.currentMetaDeckOrder = saved.order || [];
                            window.currentCurrentMetaArchetype = saved.archetype || null;
                        } else if (src === 'pastMeta') {
                            window.pastMetaDeck = saved.deck;
                            window.pastMetaDeckOrder = saved.order || [];
                            window.pastMetaCurrentArchetype = saved.archetype || null;
                        }
                        if (typeof updateDeckDisplay === 'function') updateDeckDisplay(src);
                    });
                    if (typeof showToast === 'function') showToast(t('deck.restored'), 'success');
                } else {
                    localStorage.removeItem('autosave_deck');
                }
            }, 500);
        });
        
        // ---------------------------------------------------------------
        // BATCH ADD FUNCTION - For Auto-Generate Performance
        // ---------------------------------------------------------------
        // This version adds cards WITHOUT triggering display updates
        // Use this for bulk operations, then call updateDeckDisplay() once at the end
        
        function addCardToDeckBatch(source, cardName, setCode, setNumber) {
            if (source !== 'cityLeague' && source !== 'currentMeta' && source !== 'pastMeta') return false;
            
            let deck, deckOrderKey;
            if (source === 'cityLeague') {
                deck = window.cityLeagueDeck;
                deckOrderKey = 'cityLeagueDeckOrder';
            } else if (source === 'currentMeta') {
                deck = window.currentMetaDeck;
                deckOrderKey = 'currentMetaDeckOrder';
            } else if (source === 'pastMeta') {
                deck = window.pastMetaDeck;
                deckOrderKey = 'pastMetaDeckOrder';
            }
            
            // Initialize deck order array if not exists
            if (!window[deckOrderKey]) {
                window[deckOrderKey] = [];
            }

            // When auto-generating, save version preference
            if (setCode && setNumber) {
                setRarityPreference(cardName, {
                    mode: 'specific',
                    set: setCode,
                    number: setNumber
                });
            }
            
            let deckKey = getCanonicalDeckKey(cardName, setCode, setNumber);
            
            // Check if there's already an entry for this card
            let existingKey = null;
            if (deck[deckKey]) {
                existingKey = deckKey;
            } else if (deck[cardName]) {
                existingKey = cardName;
            } else {
                for (const key in deck) {
                    if (key === cardName || key.startsWith(cardName + ' (')) {
                        existingKey = key;
                        break;
                    }
                }
            }
            
            // Migrate key if needed
            if (existingKey && existingKey !== deckKey && setCode && setNumber) {
                deck[deckKey] = deck[existingKey];
                delete deck[existingKey];
                if (window[deckOrderKey]) {
                    const oldKeyIndex = window[deckOrderKey].indexOf(existingKey);
                    if (oldKeyIndex !== -1) {
                        window[deckOrderKey][oldKeyIndex] = deckKey;
                    }
                }
            } else if (existingKey) {
                deckKey = existingKey;
            }
            
            if (!deck[deckKey]) {
                deck[deckKey] = 0;
            }
            
            const currentTotal = Object.values(deck).reduce((sum, count) => sum + count, 0);
            if (currentTotal >= 70) {
                return false; // Silent fail for batch operations
            }
            
            // Check card limits
            let cardsKey, cards;
            if (source === 'cityLeague') {
                cardsKey = 'currentCityLeagueDeckCards';
                cards = window[cardsKey] || [];
            } else if (source === 'currentMeta') {
                cardsKey = 'currentCurrentMetaDeckCards';
                cards = window[cardsKey] || [];
            } else if (source === 'pastMeta') {
                cards = pastMetaFilteredCards || [];
            }
            let cardData = cards.find(c => (c.card_name || c.full_card_name) === cardName);
            if (!cardData && setCode && setNumber) {
                cardData = getIndexedCardBySetNumber(setCode, setNumber) || (window.cardsBySetNumberMap || {})[`${setCode}-${setNumber}`] || null;
            }
            const isBaseEnergy = isBasicEnergyCardEntry(cardData || { card_name: cardName, name: cardName });
            const isAceSpecCard = isAceSpec(cardName);
            
            // Check limits (silent fail for batch)
            if (!isBaseEnergy && !isAceSpecCard && deck[deckKey] >= 4) {
                return false;
            }
            if (isAceSpecCard && deck[deckKey] >= 1) {
                return false;
            }
            // Deck-wide Ace Spec limit
            if (isAceSpecCard && getTotalAceSpecCopiesInDeck(deck) >= 1) {
                return false;
            }
            // Radiant Pokémon limits
            if (isRadiantPokemon(cardName)) {
                if (deck[deckKey] >= 1) return false;
                if (getTotalRadiantCopiesInDeck(deck) >= 1) return false;
            }
            
            deck[deckKey]++;
            
            // Track insertion order
            if (!window[deckOrderKey].includes(deckKey)) {
                window[deckOrderKey].push(deckKey);
            }
            
            return true; // Success
        }

        function getDeckRefBySource(source) {
            if (source === 'cityLeague') return window.cityLeagueDeck;
            if (source === 'currentMeta') return window.currentMetaDeck;
            if (source === 'pastMeta') return window.pastMetaDeck;
            return null;
        }

        function getDeckTotalCards(deck) {
            return Object.values(deck || {}).reduce((sum, count) => sum + (parseInt(count, 10) || 0), 0);
        }

        function isBasicEnergyName(cardName) {
            const name = String(cardName || '').toLowerCase().trim();
            return name === 'grass energy'
                || name === 'fire energy'
                || name === 'water energy'
                || name === 'lightning energy'
                || name === 'psychic energy'
                || name === 'fighting energy'
                || name === 'darkness energy'
                || name === 'metal energy';
        }

        function normalizeGeneratedDeckTo60(source, plannedCards, fallbackCards) {
            const deck = getDeckRefBySource(source);
            if (!deck) return 0;

            let total = getDeckTotalCards(deck);
            if (total >= 60) return total;

            const byName = new Map();
            const ingest = (card) => {
                if (!card || !card.card_name) return;
                const key = String(card.card_name).trim().toLowerCase();
                if (!key) return;
                if (!byName.has(key)) byName.set(key, card);
            };

            (plannedCards || []).forEach(ingest);
            (fallbackCards || []).forEach(ingest);

            const candidates = Array.from(byName.values()).sort((a, b) => {
                const shareA = parseFloat(String(a.sharePercent || a.percentage_in_archetype || 0).replace(',', '.')) || 0;
                const shareB = parseFloat(String(b.sharePercent || b.percentage_in_archetype || 0).replace(',', '.')) || 0;
                return shareB - shareA;
            });

            let guard = 0;
            while (total < 60 && guard < 180) {
                guard++;
                let added = false;

                for (const card of candidates) {
                    const cardName = String(card.card_name || '').trim();
                    if (!cardName) continue;

                    const originalSetCode = card.set_code || '';
                    const originalSetNumber = card.set_number || '';
                    const preferredVersion = getPreferredVersionForCard(cardName, originalSetCode, originalSetNumber);
                    const setCode = preferredVersion ? preferredVersion.set : originalSetCode;
                    const setNumber = preferredVersion ? preferredVersion.number : originalSetNumber;

                    const success = addCardToDeckBatch(source, cardName, setCode, setNumber);
                    if (success) {
                        total++;
                        added = true;
                        if (total >= 60) break;
                    }
                }

                // Absolute fallback: try adding basic energy if normal candidates are blocked by limits.
                if (!added) {
                    const basicEnergy = candidates.find(card => isBasicEnergyName(card.card_name));
                    if (basicEnergy) {
                        const success = addCardToDeckBatch(source, basicEnergy.card_name, basicEnergy.set_code || '', basicEnergy.set_number || '');
                        if (success) {
                            total++;
                            added = true;
                        }
                    }
                }

                if (!added) break;
            }

            if (total < 60) {
                console.warn(`[DeckBuilder] Could not normalize deck to 60 for ${source}. Current total: ${total}`);
            }

            return total;
        }
        
        // ---------------------------------------------------------------
        // SINGLE ADD FUNCTION - For Manual Card Addition
        // ---------------------------------------------------------------
        
        function addCardToDeck(source, cardName, setCode, setNumber) {
            if (source !== 'cityLeague' && source !== 'currentMeta' && source !== 'pastMeta') return;
            
            let deck, deckOrderKey;
            if (source === 'cityLeague') {
                deck = window.cityLeagueDeck;
                deckOrderKey = 'cityLeagueDeckOrder';
            } else if (source === 'currentMeta') {
                deck = window.currentMetaDeck;
                deckOrderKey = 'currentMetaDeckOrder';
            } else if (source === 'pastMeta') {
                deck = window.pastMetaDeck;
                deckOrderKey = 'pastMetaDeckOrder';
            }
            
            // Initialize deck order array if not exists
            if (!window[deckOrderKey]) {
                window[deckOrderKey] = [];
            }

            // CRITICAL FIX: When user manually adds a card with specific version, save it as preference
            // This ensures the exact version shows up in the deck (not auto-swapped to low rarity)
            if (setCode && setNumber) {
                setRarityPreference(cardName, {
                    mode: 'specific',
                    set: setCode,
                    number: setNumber
                });
                devLog(`[addCardToDeck] Saved specific version preference for ${cardName}: ${setCode} ${setNumber}`);
            }
            
            // CRITICAL FIX: Check if card already exists with a different key format
            // If card exists as "CardName" but we're adding "CardName (SET NUM)", update the existing key
            let deckKey = getCanonicalDeckKey(cardName, setCode, setNumber);
            
            // Check if there's already an entry for this card (with or without version info)
            let existingKey = null;
            if (deck[deckKey]) {
                existingKey = deckKey; // Exact match
            } else if (deck[cardName]) {
                existingKey = cardName; // Card exists without version
            } else {
                // Check if any key starts with this card name
                for (const key in deck) {
                    if (key === cardName || key.startsWith(cardName + ' (')) {
                        existingKey = key;
                        break;
                    }
                }
            }
            
            // If we found an existing key and it's different from our new key, migrate it
            if (existingKey && existingKey !== deckKey && setCode && setNumber) {
                devLog(`Migrating deck entry from "${existingKey}" to "${deckKey}"`);
                deck[deckKey] = deck[existingKey];
                delete deck[existingKey];
                
                // Update order array when migrating key
                if (window[deckOrderKey]) {
                    const oldKeyIndex = window[deckOrderKey].indexOf(existingKey);
                    if (oldKeyIndex !== -1) {
                        window[deckOrderKey][oldKeyIndex] = deckKey;
                        devLog(`Updated deck order during migration: ${existingKey} -> ${deckKey} at position ${oldKeyIndex}`);
                    }
                }
            } else if (existingKey) {
                deckKey = existingKey; // Use the existing key
            }
            
            if (!deck[deckKey]) {
                deck[deckKey] = 0;
            }
            
            const currentTotal = Object.values(deck).reduce((sum, count) => sum + count, 0);
            if (currentTotal >= 70) {
                showToast(t('deck.maxReached'), 'warning');
                return;
            }
            
            // Check if card is a base energy or Ace Spec (no 4-copy limit for these)
            let cardsKey, cards;
            if (source === 'cityLeague') {
                cardsKey = 'currentCityLeagueDeckCards';
                cards = window[cardsKey] || [];
            } else if (source === 'currentMeta') {
                cardsKey = 'currentCurrentMetaDeckCards';
                cards = window[cardsKey] || [];
            } else if (source === 'pastMeta') {
                cards = pastMetaFilteredCards || [];
            }
            let cardData = cards.find(c => (c.card_name || c.full_card_name) === cardName);
            if (!cardData && setCode && setNumber) {
                cardData = getIndexedCardBySetNumber(setCode, setNumber) || (window.cardsBySetNumberMap || {})[`${setCode}-${setNumber}`] || null;
            }
            const isBaseEnergy = isBasicEnergyCardEntry(cardData || { card_name: cardName, name: cardName });
            const isAceSpecCard = isAceSpec(cardName);
            
            // Check if card already has 4 copies (only applies to non-energy, non-ace-spec cards)
            if (!isBaseEnergy && !isAceSpecCard && deck[deckKey] >= 4) {
                showToast(t('deck.maxCopies'), 'warning');
                return;
            }
            
            // Ace Spec cards can only have 1 copy in deck
            if (isAceSpecCard && deck[deckKey] >= 1) {
                showToast(t('deck.aceSpecOnce'), 'warning');
                return;
            }
            
            // DECK-WIDE Ace Spec limit: only 1 Ace Spec card total in entire deck
            if (isAceSpecCard && getTotalAceSpecCopiesInDeck(deck) >= 1) {
                showToast(t('deck.aceSpecLimit'), 'warning');
                return;
            }
            
            // Radiant Pokémon: max 1 copy, and only 1 Radiant total in deck
            if (isRadiantPokemon(cardName)) {
                if (deck[deckKey] >= 1) {
                    showToast(t('deck.radiantOnce'), 'warning');
                    return;
                }
                if (getTotalRadiantCopiesInDeck(deck) >= 1) {
                    showToast(t('deck.radiantLimit'), 'warning');
                    return;
                }
            }
            
            deck[deckKey]++;
            
            // Track insertion order
            if (!window[deckOrderKey].includes(deckKey)) {
                window[deckOrderKey].push(deckKey);
            }
            
            devLog(`Added card to deck: ${deckKey} -> ${deck[deckKey]}`);
            
            // Save to localStorage
            if (source === 'cityLeague') {
                saveCityLeagueDeck();
            } else if (source === 'currentMeta') {
                saveCurrentMetaDeck();
            } else if (source === 'pastMeta') {
                savePastMetaDeck();
            }
            
            updateDeckDisplay(source);
        }
        
        function removeCardFromDeck(source, deckKey) {
            if (source !== 'cityLeague' && source !== 'currentMeta' && source !== 'pastMeta') return;
            
            let deck, deckOrderKey;
            if (source === 'cityLeague') {
                deck = window.cityLeagueDeck;
                deckOrderKey = 'cityLeagueDeckOrder';
            } else if (source === 'currentMeta') {
                deck = window.currentMetaDeck;
                deckOrderKey = 'currentMetaDeckOrder';
            } else if (source === 'pastMeta') {
                deck = window.pastMetaDeck;
                deckOrderKey = 'pastMetaDeckOrder';
            }
            
            // CRITICAL FIX: Find the actual key in deck
            // If deckKey is just "CardName" but deck has "CardName (SET NUM)", find it
            let actualKey = deckKey;
            if (!deck[deckKey] || deck[deckKey] <= 0) {
                // Search for alternative keys (with set info)
                for (const key in deck) {
                    if (key === deckKey || key.startsWith(deckKey + ' (')) {
                        if (deck[key] > 0) {
                            actualKey = key;
                            break;
                        }
                    }
                }
            }
            
            if (deck[actualKey] && deck[actualKey] > 0) {
                deck[actualKey]--;
                if (deck[actualKey] === 0) {
                    delete deck[actualKey];
                    // Remove from order tracking
                    if (window[deckOrderKey]) {
                        const idx = window[deckOrderKey].indexOf(actualKey);
                        if (idx !== -1) {
                            window[deckOrderKey].splice(idx, 1);
                        }
                    }
                }
                
                // Save to localStorage
                if (source === 'cityLeague') {
                    saveCityLeagueDeck();
                } else if (source === 'currentMeta') {
                    saveCurrentMetaDeck();
                } else if (source === 'pastMeta') {
                    savePastMetaDeck();
                }
                
                updateDeckDisplay(source);
            }
        }

        const pendingDeckRefreshBySource = {};
        const pendingDeckRefreshTimeoutBySource = {};
        const pendingDeckDisplayUpdateBySource = {};

        function scheduleDeckDisplayUpdate(source) {
            if (source !== 'cityLeague' && source !== 'currentMeta' && source !== 'pastMeta') return;

            if (pendingDeckDisplayUpdateBySource[source]) {
                return;
            }

            pendingDeckDisplayUpdateBySource[source] = requestAnimationFrame(() => {
                pendingDeckDisplayUpdateBySource[source] = null;
                updateDeckDisplay(source);
            });
        }

        function scheduleDeckDependentRefresh(source) {
            if (pendingDeckRefreshBySource[source]) {
                cancelAnimationFrame(pendingDeckRefreshBySource[source]);
            }

            if (pendingDeckRefreshTimeoutBySource[source]) {
                clearTimeout(pendingDeckRefreshTimeoutBySource[source]);
            }

            // Debounce expensive overview rerenders while user is rapidly tapping +/-.
            pendingDeckRefreshTimeoutBySource[source] = setTimeout(() => {
                pendingDeckRefreshTimeoutBySource[source] = null;

                pendingDeckRefreshBySource[source] = requestAnimationFrame(() => {
                    pendingDeckRefreshBySource[source] = null;

                    if (source === 'cityLeague') {
                        applyCityLeagueFilter();
                    } else if (source === 'currentMeta') {
                        applyCurrentMetaFilter();
                    } else if (source === 'pastMeta') {
                        renderPastMetaCards();
                    }

                    updateOpeningHandStats(source);
                });
            }, 140);
        }
        
        function clearDeck(source) {
            if (source !== 'cityLeague' && source !== 'currentMeta' && source !== 'pastMeta') return;
            
            if (confirm(t('deck.clearConfirm'))) {
                if (source === 'cityLeague') {
                    window.cityLeagueDeck = {};
                    window.cityLeagueDeckOrder = [];
                    window.currentCityLeagueArchetype = null;
                    // CRITICAL: Remove from localStorage completely
                    localStorage.removeItem('cityLeagueDeck');
                    devLog('[clearDeck] City League deck cleared and removed from localStorage');
                } else if (source === 'currentMeta') {
                    window.currentMetaDeck = {};
                    window.currentMetaDeckOrder = [];
                    window.currentCurrentMetaArchetype = null;
                    // CRITICAL: Remove from localStorage completely
                    localStorage.removeItem('currentMetaDeck');
                    devLog('[clearDeck] Current Meta deck cleared and removed from localStorage');
                } else if (source === 'pastMeta') {
                    window.pastMetaDeck = {};
                    window.pastMetaDeckOrder = [];
                    window.pastMetaCurrentArchetype = null;
                    // CRITICAL: Remove from localStorage completely
                    localStorage.removeItem('pastMetaDeck');
                    devLog('[clearDeck] Past Meta deck cleared and removed from localStorage');
                }
                
                // CRITICAL: Clear all rarity preferences when clearing deck
                rarityPreferences = {};
                saveRarityPreferences();
                
                updateDeckDisplay(source);
                
                // Force re-render to remove all badges
                const tabId = source === 'cityLeague' ? 'city-league-tab' : 'current-meta-tab';
                if (document.getElementById(tabId) && document.getElementById(tabId).classList.contains('active')) {
                    // Re-render the current view to update badges
                    if (source === 'cityLeague') {
                        renderCityLeagueDeckGrid(cityLeagueCardsFiltered, cityLeagueOverviewRarityMode);
                    } else {
                        renderCurrentMetaDeckGrid(currentMetaCardsFiltered, currentMetaOverviewRarityMode);
                    }
                }
            }
        }
        
        function updateDeckDisplay(source) {
            if (source !== 'cityLeague' && source !== 'currentMeta' && source !== 'pastMeta') return;

            const normalized = normalizeDeckEntries(source);
            if (normalized) {
                if (source === 'cityLeague') saveCityLeagueDeck();
                else if (source === 'currentMeta') saveCurrentMetaDeck();
                else if (source === 'pastMeta') savePastMetaDeck();
            }
            
            let deck;
            if (source === 'cityLeague') {
                deck = window.cityLeagueDeck;
            } else if (source === 'currentMeta') {
                deck = window.currentMetaDeck;
            } else if (source === 'pastMeta') {
                deck = window.pastMetaDeck;
            }
            const total = Object.values(deck).reduce((sum, count) => sum + count, 0);
            const unique = Object.keys(deck).filter(k => deck[k] > 0).length;
            
            let countElId, uniqueElId;
            if (source === 'cityLeague') {
                countElId = 'cityLeagueDeckCount';
                uniqueElId = 'cityLeagueDeckCountUnique';
            } else if (source === 'currentMeta') {
                countElId = 'currentMetaDeckCount';
                uniqueElId = 'currentMetaDeckCountUnique';
            } else if (source === 'pastMeta') {
                countElId = 'pastMetaDeckCount';
                uniqueElId = 'pastMetaDeckCountUnique';
            }
            
            const countEl = document.getElementById(countElId);
            const uniqueEl = document.getElementById(uniqueElId);
            
            if (countEl) {
                countEl.textContent = total;
                // Highlight in red if over 60 cards
                if (total > 60) {
                    countEl.classList.add('color-red');
                    countEl.parentElement.classList.add('color-red');
                } else {
                    countEl.classList.remove('color-red');
                    countEl.parentElement.classList.remove('color-red');
                }
            }
            if (uniqueEl) uniqueEl.textContent = `(${unique} ${t('deck.uniqueLabel')})`;

            // --- Price calculation ---
            let priceElId;
            if (source === 'cityLeague')  priceElId = 'cityLeagueDeckPrice';
            else if (source === 'currentMeta') priceElId = 'currentMetaDeckPrice';
            else if (source === 'pastMeta')    priceElId = 'pastMetaDeckPrice';
            const priceEl = document.getElementById(priceElId);
            if (priceEl) {
                let totalPrice = 0;
                let hasAnyPrice = false;
                for (const [deckKey, count] of Object.entries(deck)) {
                    if (!count || count <= 0) continue;
                    let cardData = null;
                    const setMatch = deckKey.match(/^(.+?)\s+\(([A-Z0-9-]+)\s+([A-Z0-9-]+)\)$/);
                    if (setMatch) {
                        const key = `${setMatch[2]}-${setMatch[3]}`;
                        cardData = getIndexedCardBySetNumber(setMatch[2], setMatch[3]);
                        if (!cardData && cardsBySetNumberMap) cardData = cardsBySetNumberMap[key] || null;
                    } else {
                        cardData = (cardIndexMap && cardIndexMap.get(deckKey)) || null;
                    }
                    if (cardData && cardData.eur_price && cardData.eur_price !== '' && cardData.eur_price !== 'N/A') {
                        const p = parseFloat(String(cardData.eur_price).replace(',', '.'));
                        if (!isNaN(p)) { totalPrice += p * (parseInt(count) || 0); hasAnyPrice = true; }
                    }
                }
                priceEl.textContent = hasAnyPrice ? (isNaN(totalPrice) ? '0.00' : totalPrice.toFixed(2)) + ' \u20ac' : t('deck.priceNA');
            }

            // Add visual warning to deck container if over 60 cards
            let deckVisualId;
            if (source === 'cityLeague') {
                deckVisualId = 'cityLeagueMyDeckVisual';
            } else if (source === 'currentMeta') {
                deckVisualId = 'currentMetaMyDeckVisual';
            } else if (source === 'pastMeta') {
                deckVisualId = 'pastMetaMyDeckVisual';
            }
            const deckVisualEl = document.getElementById(deckVisualId);
            if (deckVisualEl) {
                if (total > 60) {
                    deckVisualEl.classList.add('border-3-red', 'bg-red-light');
                } else {
                    deckVisualEl.classList.remove('border-3-red', 'bg-red-light');
                    deckVisualEl.classList.add('bg-grey-light');
                }
            }
            
            // Update the My Deck grid immediately for responsive button feedback.
            renderMyDeckGrid(source);

            // Auto-save deck to localStorage for crash recovery
            try {
                const allDecks = {
                    cityLeague:  { deck: window.cityLeagueDeck  || {}, order: window.cityLeagueDeckOrder  || [], archetype: window.currentCityLeagueArchetype  || null },
                    currentMeta: { deck: window.currentMetaDeck || {}, order: window.currentMetaDeckOrder || [], archetype: window.currentCurrentMetaArchetype || null },
                    pastMeta:    { deck: window.pastMetaDeck    || {}, order: window.pastMetaDeckOrder    || [], archetype: window.pastMetaCurrentArchetype    || null },
                    timestamp: new Date().toISOString()
                };
                const totalCards = Object.values(allDecks.cityLeague.deck).reduce((s,c)=>s+c,0)
                               + Object.values(allDecks.currentMeta.deck).reduce((s,c)=>s+c,0)
                               + Object.values(allDecks.pastMeta.deck).reduce((s,c)=>s+c,0);
                if (totalCards > 0) {
                    localStorage.setItem('autosave_deck', JSON.stringify(allDecks));
                } else {
                    localStorage.removeItem('autosave_deck');
                }
            } catch(e) { /* ignore autosave errors */ }

            // Refresh overview badges and opening hand stats on the next frame.
            scheduleDeckDependentRefresh(source);
        }
        
        function renderMyDeckGrid(source) {
            if (source !== 'cityLeague' && source !== 'currentMeta' && source !== 'pastMeta') return;
            
            let deck, deckOrderKey, currentCardsKey, gridContainerId;
            if (source === 'cityLeague') {
                deck = window.cityLeagueDeck;
                deckOrderKey = 'cityLeagueDeckOrder';
                currentCardsKey = 'currentCityLeagueDeckCards';
                gridContainerId = 'cityLeagueMyDeckGrid';
            } else if (source === 'currentMeta') {
                deck = window.currentMetaDeck;
                deckOrderKey = 'currentMetaDeckOrder';
                currentCardsKey = 'currentCurrentMetaDeckCards';
                gridContainerId = 'currentMetaMyDeckGrid';
            } else if (source === 'pastMeta') {
                deck = window.pastMetaDeck;
                deckOrderKey = 'pastMetaDeckOrder';
                currentCardsKey = null; // Past Meta uses different data source
                gridContainerId = 'pastMetaMyDeckGrid';
            }
            
            const allCards = currentCardsKey ? (window[currentCardsKey] || []) : (pastMetaFilteredCards || []);
            const dbCache = getMyDeckRenderDbCache();

            const getDeckBuilderEmptyStateHtml = (scope) => {
                const generateAction = `autoCompleteConsistency('${scope}', 'min')`;
                const testDrawAction = `openDrawSimulator('${scope}')`;
                const emptyText = t('deck.emptyPlaceholder');
                return `
                    <div class="deck-builder-empty-state" role="status" aria-live="polite">
                        <div class="deck-builder-empty-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M8 8h8"></path><path d="M8 12h8"></path><path d="M8 16h5"></path></svg>
                        </div>
                        <h4 class="deck-builder-empty-title">Your deck is empty</h4>
                        <p class="deck-builder-empty-text">${emptyText}</p>
                        <div class="deck-builder-empty-actions">
                            <button class="btn-modern primary" onclick="${generateAction}">Generate Deck</button>
                            <button class="btn-modern" onclick="${testDrawAction}">Open Test Draw</button>
                        </div>
                    </div>
                `;
            };
            
            // Build card data maps: by name and by name+set+number
            const cardDataByName = Object.create((dbCache && dbCache.cardDataByName) || null);
            const cardDataByKey = Object.create((dbCache && dbCache.cardDataByKey) || null);
            const cardStatsByNormalizedName = {};
            const cardStatsBySetNumber = {};
            
            // Initialize deck order array if not exists
            if (!window[deckOrderKey]) {
                window[deckOrderKey] = Object.keys(deck).filter(k => deck[k] > 0);
            }
            
            // First, add cards from current deck cards
            allCards.forEach(card => {
                // Handle both 'card_name' (cityLeague/currentMeta) and 'full_card_name' (pastMeta)
                const cardName = card.card_name || card.full_card_name;
                if (cardName) {
                    cardDataByName[cardName] = card;

                    const normalizedName = normalizeCardName(cardName);
                    if (normalizedName) {
                        const prev = cardStatsByNormalizedName[normalizedName];
                        const prevShare = parseFloat(String(prev?.percentage_in_archetype || prev?.share || 0).replace(',', '.')) || 0;
                        const currentShare = parseFloat(String(card.percentage_in_archetype || card.share || 0).replace(',', '.')) || 0;
                        if (!prev || currentShare >= prevShare) {
                            cardStatsByNormalizedName[normalizedName] = card;
                        }
                    }

                    const setCode = String(card.set_code || card.set || '').toUpperCase().trim();
                    const setNumberRaw = String(card.set_number || card.number || '').trim();
                    if (setCode && setNumberRaw) {
                        const normalizedNumber = setNumberRaw.replace(/^0+/, '') || '0';
                        cardStatsBySetNumber[`${setCode}-${setNumberRaw}`] = card;
                        cardStatsBySetNumber[`${setCode}-${normalizedNumber}`] = card;
                        cardStatsBySetNumber[`${setCode}-${normalizedNumber.padStart(3, '0')}`] = card;
                    }
                }
            });
            
            // Convert deck to array with card data
            const deckCards = [];
            for (const [deckKey, count] of Object.entries(deck)) {
                if (count <= 0) continue;
                
                // Try exact match first (with SET NUM), then fallback to name only
                let cardData = cardDataByKey[deckKey] || cardDataByName[deckKey];
                
                // If still not found, extract card name from "CardName (SET NUM)" format
                if (!cardData) {
                    const baseNameMatch = deckKey.match(/^(.+?)\s*\(/);
                    if (baseNameMatch) {
                        const baseName = baseNameMatch[1];
                        const setMatch = deckKey.match(/\(([A-Z0-9]+)\s+([A-Z0-9]+)\)$/);
                        
                        if (setMatch) {
                            const setCode = setMatch[1];
                            const setNumber = setMatch[2];
                            
                            // Fast lookup using index instead of find()
                            const key = `${setCode}-${setNumber}`;
                            const exactCard = cardsBySetNumberMap ? cardsBySetNumberMap[key] : null;
                            
                            if (exactCard) {
                                const imageUrl = getUnifiedCardImage(exactCard.set, exactCard.number) || exactCard.image_url || '';
                                cardData = {
                                    card_name: exactCard.name,
                                    image_url: imageUrl,
                                    percentage_in_archetype: 0,
                                    type: exactCard.type || 'Unknown',
                                    card_type: exactCard.type || 'Unknown',
                                    set_code: exactCard.set,
                                    set_number: exactCard.number,
                                    rarity: exactCard.rarity
                                };
                            } else {
                                const baseCardData = cardDataByName[baseName];
                                if (baseCardData) {
                                    cardData = {
                                        ...baseCardData,
                                        set_code: setCode,
                                        set_number: setNumber
                                    };
                                }
                            }
                        } else {
                            cardData = cardDataByName[baseName];
                        }
                    }
                }
                
                if (!cardData) continue;

                const baseNameMatch = deckKey.match(/^(.+?)\s*\(/);
                const baseName = baseNameMatch ? baseNameMatch[1] : (cardData.card_name || deckKey);
                const normalizedBaseName = normalizeCardName(baseName);

                const setMatch = deckKey.match(/\(([A-Z0-9]+)\s+([A-Z0-9]+)\)$/);
                const originalSet = setMatch ? setMatch[1] : cardData.set_code;
                const originalNumber = setMatch ? setMatch[2] : cardData.set_number;

                const cardSetForStats = String(cardData.set_code || cardData.set || originalSet || '').toUpperCase().trim();
                const cardNumberForStatsRaw = String(cardData.set_number || cardData.number || originalNumber || '').trim();
                const cardNumberForStatsNormalized = cardNumberForStatsRaw.replace(/^0+/, '') || '0';
                const setNumberKeyExact = cardSetForStats && cardNumberForStatsRaw ? `${cardSetForStats}-${cardNumberForStatsRaw}` : '';
                const setNumberKeyNormalized = cardSetForStats && cardNumberForStatsNormalized ? `${cardSetForStats}-${cardNumberForStatsNormalized}` : '';

                const archetypeData =
                    (setNumberKeyExact && cardStatsBySetNumber[setNumberKeyExact]) ||
                    (setNumberKeyNormalized && cardStatsBySetNumber[setNumberKeyNormalized]) ||
                    cardDataByName[baseName] ||
                    cardStatsByNormalizedName[normalizedBaseName];
                if (archetypeData) {
                    cardData = {
                        ...cardData,
                        percentage_in_archetype: archetypeData.percentage_in_archetype || cardData.percentage_in_archetype,
                        total_count: archetypeData.total_count || archetypeData.card_count || cardData.total_count,
                        card_count: archetypeData.card_count || cardData.card_count,
                        deck_count: archetypeData.deck_count || archetypeData.deck_inclusion_count || cardData.deck_count,
                        deck_inclusion_count: archetypeData.deck_inclusion_count || archetypeData.deck_count || cardData.deck_inclusion_count,
                        total_decks_in_archetype: archetypeData.total_decks_in_archetype || archetypeData.decklist_count || archetypeData.total_decks || cardData.total_decks_in_archetype,
                        average_count: archetypeData.average_count || archetypeData.avg_count || cardData.average_count,
                        avg_count: archetypeData.avg_count || archetypeData.average_count || cardData.avg_count,
                        average_count_overall: archetypeData.average_count_overall || archetypeData.avg_count_overall || archetypeData.card_count || cardData.average_count_overall,
                        card_type: archetypeData.card_type || archetypeData.type || cardData.card_type,
                        type: archetypeData.type || archetypeData.card_type || cardData.type
                    };
                }

                const globalPref = getGlobalRarityPreference();
                const pref = getRarityPreference(baseName);
                
                // Handle image URL based on rarity preference (simplified)
                if (pref && pref.mode === 'specific' && pref.set && pref.number) {
                    const key = `${pref.set}-${pref.number}`;
                    const specificCard = cardsBySetNumberMap ? cardsBySetNumberMap[key] : null;
                    if (specificCard && specificCard.image_url && specificCard.name === baseName) {
                        cardData.image_url = specificCard.image_url;
                        cardData.set_code = specificCard.set;
                        cardData.set_number = specificCard.number;
                        cardData.rarity = specificCard.rarity;
                    }
                }
                else if (globalPref === 'max' || globalPref === 'min') {
                    if (originalSet && originalNumber) {
                        const preferredVersion = getPreferredVersionForCard(baseName, originalSet, originalNumber);
                        if (preferredVersion) {
                            const key = `${preferredVersion.set}-${preferredVersion.number}`;
                            const preferredCard = cardsBySetNumberMap ? cardsBySetNumberMap[key] : null;
                            if (preferredCard && preferredCard.image_url && preferredCard.name === baseName) {
                                cardData.image_url = preferredCard.image_url;
                                cardData.set_code = preferredCard.set;
                                cardData.set_number = preferredCard.number;
                                cardData.rarity = preferredCard.rarity;
                            }
                        }
                    }
                }
                
                // Ensure image_url is never empty before adding to deck
                if (!cardData.image_url || cardData.image_url.trim() === '') {
                    const setCode = originalSet || cardData.set_code;
                    const setNumber = originalNumber || cardData.set_number;
                    if (setCode && setNumber) {
                        cardData.image_url = getUnifiedCardImage(setCode, setNumber);
                    }
                }
                
                deckCards.push({
                    ...cardData, 
                    deck_count_in_selected: count, 
                    deck_key: deckKey,
                    original_set_code: originalSet,
                    original_set_number: originalNumber
                });
            }
            
            const sortedDeckCards = sortCardsByType(deckCards);
            
            // Build grid from deck
            let html = '';
            sortedDeckCards.forEach(card => {
                const deckKeyNameMatch = typeof card.deck_key === 'string' ? card.deck_key.match(/^(.+?)\s*\(/) : null;
                const fallbackDeckName = deckKeyNameMatch ? deckKeyNameMatch[1] : '';
                const safeCardName = (typeof card.card_name === 'string' && card.card_name.trim())
                    ? card.card_name
                    : (fallbackDeckName || 'Unknown Card');
                const setCode = card.set_code || '';
                const setNumber = card.set_number || '';
                
                // Safe image fallback chain for inconsistent M3/M4 card objects
                const cardImg = card.image || card.imageUrl || (card.images && card.images.small) || card.image_url || '';
                const safeImg = typeof cardImg === 'string' ? cardImg.replace('original', 'small') : '';

                let imageUrl = '';
                if (setCode && setNumber && cardsBySetNumberMap) {
                    imageUrl = getUnifiedCardImage(setCode, setNumber);
                    if (!imageUrl && safeImg) {
                        imageUrl = safeImg;
                    }
                } else if (safeImg) {
                    imageUrl = safeImg;
                } else {
                    imageUrl = getUnifiedCardImage(setCode, setNumber);
                }

                if (typeof imageUrl !== 'string' || imageUrl.trim() === '') {
                    imageUrl = buildCardImageUrl(setCode, setNumber, card.rarity || 'C');
                }

                imageUrl = getBestCardImage({
                    ...card,
                    card_name: safeCardName,
                    image_url: imageUrl,
                    set_code: setCode,
                    set_number: setNumber
                });
                
                const percentage = parseFloat(card.percentage_in_archetype || 0).toFixed(1);
                const count = card.deck_count_in_selected || 1;
                const cardNameEscaped = escapeJsStr(safeCardName);
                const deckKeyEscaped = escapeJsStr(card.deck_key || safeCardName);
                
                // Fast price lookup using index
                let eurPrice = '';
                let cardmarketUrl = '';
                if (setCode && setNumber && cardsBySetNumberMap) {
                    const key = `${setCode}-${setNumber}`;
                    const priceCard = cardsBySetNumberMap[key];
                    if (priceCard) {
                        eurPrice = priceCard.eur_price || '';
                        cardmarketUrl = priceCard.cardmarket_url || '';
                    }
                }
                const priceDisplay = eurPrice || '0,00€';
                const priceClass = eurPrice ? 'btn-cardmarket' : 'btn-cardmarket no-price';
                const priceBackground = eurPrice ? 'linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)' : 'linear-gradient(135deg, #777 0%, #999 100%)';
                const cardmarketUrlEscaped = escapeJsStr(cardmarketUrl || '');
                
                const baseName = safeCardName;
                const baseCardData =
                    (setCode && setNumber && (cardStatsBySetNumber[`${String(setCode).toUpperCase()}-${String(setNumber).trim()}`] || cardStatsBySetNumber[`${String(setCode).toUpperCase()}-${(String(setNumber).trim().replace(/^0+/, '') || '0')}`])) ||
                    cardDataByName[baseName] ||
                    cardStatsByNormalizedName[normalizeCardName(baseName)] ||
                    card;
                const totalCount = parseFloat(String(baseCardData.total_count || 0).replace(',', '.')) || 0;
                const cardCountOverallRaw = parseFloat(String(baseCardData.card_count || 0).replace(',', '.')) || 0;
                const decksWithCard = parseFloat(String(baseCardData.deck_count || baseCardData.deck_inclusion_count || baseCardData.decks_with_card || 0).replace(',', '.')) || 0;
                const totalDecksInArchetype = parseFloat(String(baseCardData.total_decks_in_archetype || baseCardData.decklist_count || baseCardData.total_decks || 0).replace(',', '.')) || 0;
                const shareFromDataRaw = parseFloat(String(
                    baseCardData.percentage_in_archetype ||
                    baseCardData.share ||
                    baseCardData.share_percent ||
                    baseCardData.meta_share ||
                    baseCardData.metaShare ||
                    percentage ||
                    0
                ).replace(',', '.'));
                const computedShareRaw = totalDecksInArchetype > 0 && decksWithCard > 0 ? (decksWithCard / totalDecksInArchetype) * 100 : 0;
                const fallbackShareValue = Number.isFinite(shareFromDataRaw) && shareFromDataRaw > 0 ? shareFromDataRaw : computedShareRaw;

                const avgWhenUsedRaw = parseFloat(String(baseCardData.average_count || baseCardData.avg_count || baseCardData.avgCountWhenUsed || 0).replace(',', '.'));
                const avgOverallRaw = parseFloat(String(baseCardData.average_count_overall || baseCardData.avg_count_overall || baseCardData.avgCount || baseCardData.card_count || 0).replace(',', '.'));

                // Only derive averages from totals when totals are truly available.
                // Some datasets provide card_count as an average already (not as total_count).
                const computedAvgWhenUsedRaw = (decksWithCard > 0 && totalCount > 0)
                    ? (totalCount / decksWithCard)
                    : (avgOverallRaw > 0 && totalDecksInArchetype > 0 && decksWithCard > 0
                        ? (avgOverallRaw * totalDecksInArchetype) / decksWithCard
                        : 0);
                const computedAvgOverallRaw = (totalDecksInArchetype > 0 && totalCount > 0)
                    ? (totalCount / totalDecksInArchetype)
                    : cardCountOverallRaw;
                const fallbackAvgValue = Number.isFinite(avgWhenUsedRaw) && avgWhenUsedRaw > 0
                    ? avgWhenUsedRaw
                    : (Number.isFinite(computedAvgWhenUsedRaw) && computedAvgWhenUsedRaw > 0
                        ? computedAvgWhenUsedRaw
                        : (Number.isFinite(avgOverallRaw) && avgOverallRaw > 0 ? avgOverallRaw : computedAvgOverallRaw));

                const fallbackShare = Math.max(0, fallbackShareValue).toFixed(1).replace('.', ',');
                const fallbackAvg = Math.max(0, fallbackAvgValue).toFixed(2).replace('.', ',');

                const isM3Special = ((setCode || '').toUpperCase() === 'M3')
                    || ((card.original_set_code || '').toUpperCase() === 'M3')
                    || (typeof imageUrl === 'string' && /\/M3\//i.test(imageUrl));

                let overlayText = '';
                if (fallbackShareValue > 0 || fallbackAvgValue > 0) {
                    overlayText = `${fallbackShare}% | Ø ${fallbackAvg}x`;
                } else if (isM3Special) {
                    overlayText = t('deck.m3Exclusive');
                } else {
                    overlayText = `${fallbackShare}% | Ø ${fallbackAvg}x`;
                }
                
                // Check if user owns this card (specific print)
                const cardId = `${safeCardName}|${setCode}|${setNumber}`;
                const isOwned = window.userCollection && window.userCollection.has(cardId);
                const ownedBadge = isOwned ? '<div style="position: absolute; top: 5px; left: 5px; background: #4CAF50; color: white; width: 25px; height: 25px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.5); z-index: 4;">✓</div>' : '';
                const prob = getOpeningHandProbability(count, 60);
                const probBadge = `<div class="start-hand-prob" title="${t('deck.openHandProb')}">✋ ${prob}%</div>`;
                
                html += `
                    <div class="deck-card pos-rel" title="${safeCardName} (${count}x) - ${percentage}%">
                        <img src="${imageUrl}" alt="${safeCardName}" loading="lazy" class="card-img-std cursor-zoom" onerror="handleCardImageError(this, '${setCode}', '${setNumber}')" onclick="showSingleCard(this.src, '${cardNameEscaped}')">
                        ${probBadge}
                        ${ownedBadge}
                        <div class="card-max-count">${count}</div>
                        <div class="deck-card-overlay">${overlayText}</div>
                        <div class="deck-card-actions">
                            <div class="deck-card-action-row">
                                <button onclick="removeCardFromDeck('${source}', '${deckKeyEscaped}')" style="background: #dc3545; color: white; border: none; border-radius: 3px; height: 20px; cursor: pointer; font-weight: bold; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 12px;">-</button>
                                <button onclick="openRaritySwitcher('${cardNameEscaped}', '${deckKeyEscaped}')" style="background: #ffc107; color: #333; border: none; border-radius: 3px; height: 20px; cursor: pointer; font-size: 11px; font-weight: bold; text-align: center; padding: 0; display: flex; align-items: center; justify-content: center;">★</button>
                                <button onclick="addCardToDeck('${source}', '${cardNameEscaped}', '${setCode}', '${setNumber}')" style="background: #28a745; color: white; border: none; border-radius: 3px; height: 20px; cursor: pointer; font-weight: bold; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 12px;">+</button>
                            </div>
                            <div style="display: grid; grid-template-columns: 1fr 1fr 2fr; gap: 2px;">
                                ${setCode && setNumber ? `<button onclick="openLimitlessCard('${setCode}', '${setNumber}')" style="background: #6c3dc5; color: white; border: none; border-radius: 3px; height: 20px; cursor: pointer; font-size: 9px; font-weight: bold; padding: 0; display: flex; align-items: center; justify-content: center;" title="${t('deck.openLimitless')}">L</button>` : '<span></span>'}
                                <button onclick="addCardToProxy('${cardNameEscaped}', '${setCode}', '${setNumber}', 1)" style="background: #e74c3c; color: white; border: none; border-radius: 3px; height: 20px; cursor: pointer; font-size: 9px; font-weight: bold; padding: 0; display: flex; align-items: center; justify-content: center;" title="${t('deck.addToProxy')}">P</button>
                                <button class="${priceClass}" onclick="openCardmarket('${cardmarketUrlEscaped}', '${cardNameEscaped}')" style="background: ${priceBackground}; color: white; height: 20px; border: none; border-radius: 3px; cursor: ${eurPrice ? 'pointer' : 'not-allowed'}; font-size: 8px; font-weight: bold; padding: 0 2px; display: flex; align-items: center; justify-content: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-shadow: 0 1px 2px rgba(0,0,0,0.4);" title="${eurPrice ? t('deck.buyCardmarket') + ' ' + eurPrice : t('deck.priceUnavailable')}">${priceDisplay}</button>
                            </div>
                        </div>
                    </div>
                `;
            });
            
            const gridContainer = document.getElementById(gridContainerId);
            if (gridContainer) {
                gridContainer.innerHTML = html || getDeckBuilderEmptyStateHtml(source);
            }
        }
        
        // Filter deck grid based on search input
        function filterDeckGrid(source) {
            if (source !== 'cityLeague' && source !== 'currentMeta' && source !== 'pastMeta') return;
            
            let searchInputId, gridContainerId;
            if (source === 'cityLeague') {
                searchInputId = 'cityLeagueDeckGridSearch';
                gridContainerId = 'cityLeagueMyDeckGrid';
            } else if (source === 'currentMeta') {
                searchInputId = 'currentMetaDeckGridSearch';
                gridContainerId = 'currentMetaMyDeckGrid';
            } else if (source === 'pastMeta') {
                searchInputId = 'pastMetaDeckGridSearch';
                gridContainerId = 'pastMetaMyDeckGrid';
            }
            
            const searchInput = document.getElementById(searchInputId);
            if (!searchInput) return;
            
            const searchTerm = searchInput.value.toLowerCase().trim();
            const gridContainer = document.getElementById(gridContainerId);
            if (!gridContainer) return;
            
            const cards = gridContainer.querySelectorAll('.deck-card');
            cards.forEach(card => {
                const cardTitle = (card.getAttribute('title') || '').toLowerCase();
                if (searchTerm === '' || cardTitle.includes(searchTerm)) {
                    card.style.display = '';
                } else {
                    card.style.display = 'none';
                }
            });
        }
        
        // ========== CARD SORTING & ORGANIZATION FUNCTIONS ==========
        
        function getCardTypeCategory(cardType) {
            /**
             * Determines the category of a card based on the type field
             * type format: "GBasic", "WBasic", "PStage1", "PStage2", "Supporter", "Item", "Tool", "Stadium", "Special Energy", "Energy"
             */
            if (!cardType) return 'Pokemon';
            
            // IMPORTANT: Check Special Energy BEFORE generic energy check,
            // so that Special Energy gets its own sort category (before Basic Energy).
            const typeLower = cardType.toLowerCase();
            if (typeLower.includes('special energy')) return 'Special Energy';
            if (typeLower.includes('energy')) return 'Basic Energy';
            
            // Check if it's a Pokemon (type starts with element letter)
            if (cardType.charAt(0).match(/[GRWLPFDMNC]/)) {
                return 'Pokemon';
            }
            
            // Check exact matches for trainer types
            if (cardType === 'Supporter') return 'Supporter';
            if (cardType === 'Item') return 'Item';
            if (cardType === 'Tool') return 'Tool';
            if (cardType === 'Stadium') return 'Stadium';
            if (cardType === 'Trainer') return 'Item';
            
            // Fallback to Pokemon
            return 'Pokemon';
        }
        
        function sortCardsByType(cards) {
            /**
             * Sort cards:
             * 1. By Category (Pokemon, Supporter, Item, etc.)
             * 2. By Element (for Pokemon: G, R, W, L, P, F, D, M, N, C)
             * 3. By PERCENTAGE (highest first!)
             * 4. By Evolution Chain (keep together: Basic, Stage1, Stage2)
             * 5. By Set Number
             */
            
            // Pokemon Evolution Chains (from pokemondb.net/evolution)
            const evolutionChains = {
                'Bulbasaur': ['Bulbasaur', 'Ivysaur', 'Venusaur'],
                'Ivysaur': ['Bulbasaur', 'Ivysaur', 'Venusaur'],
                'Venusaur': ['Bulbasaur', 'Ivysaur', 'Venusaur'],
                'Charmander': ['Charmander', 'Charmeleon', 'Charizard'],
                'Charmeleon': ['Charmander', 'Charmeleon', 'Charizard'],
                'Charizard': ['Charmander', 'Charmeleon', 'Charizard'],
                'Squirtle': ['Squirtle', 'Wartortle', 'Blastoise'],
                'Wartortle': ['Squirtle', 'Wartortle', 'Blastoise'],
                'Blastoise': ['Squirtle', 'Wartortle', 'Blastoise'],
                'Pichu': ['Pichu', 'Pikachu', 'Raichu'],
                'Pikachu': ['Pichu', 'Pikachu', 'Raichu'],
                'Raichu': ['Pichu', 'Pikachu', 'Raichu'],
                'Riolu': ['Riolu', 'Lucario', 'Mega Lucario ex'],
                'Lucario': ['Riolu', 'Lucario', 'Mega Lucario ex'],
                'Mega Lucario ex': ['Riolu', 'Lucario', 'Mega Lucario ex'],
                'Eevee': ['Eevee', 'Vaporeon', 'Jolteon', 'Flareon', 'Espeon', 'Umbreon', 'Leafeon', 'Glaceon', 'Sylveon'],
                'Vaporeon': ['Eevee', 'Vaporeon', 'Jolteon', 'Flareon', 'Espeon', 'Umbreon', 'Leafeon', 'Glaceon', 'Sylveon'],
                'Jolteon': ['Eevee', 'Vaporeon', 'Jolteon', 'Flareon', 'Espeon', 'Umbreon', 'Leafeon', 'Glaceon', 'Sylveon'],
                'Flareon': ['Eevee', 'Vaporeon', 'Jolteon', 'Flareon', 'Espeon', 'Umbreon', 'Leafeon', 'Glaceon', 'Sylveon'],
                'Espeon': ['Eevee', 'Vaporeon', 'Jolteon', 'Flareon', 'Espeon', 'Umbreon', 'Leafeon', 'Glaceon', 'Sylveon'],
                'Umbreon': ['Eevee', 'Vaporeon', 'Jolteon', 'Flareon', 'Espeon', 'Umbreon', 'Leafeon', 'Glaceon', 'Sylveon'],
                'Leafeon': ['Eevee', 'Vaporeon', 'Jolteon', 'Flareon', 'Espeon', 'Umbreon', 'Leafeon', 'Glaceon', 'Sylveon'],
                'Glaceon': ['Eevee', 'Vaporeon', 'Jolteon', 'Flareon', 'Espeon', 'Umbreon', 'Leafeon', 'Glaceon', 'Sylveon'],
                'Sylveon': ['Eevee', 'Vaporeon', 'Jolteon', 'Flareon', 'Espeon', 'Umbreon', 'Leafeon', 'Glaceon', 'Sylveon'],
                'Shaymin': ['Shaymin'],
                'Dialga': ['Dialga'],
                'Palkia': ['Palkia'],
                'Kyogre': ['Kyogre'],
                'Groudon': ['Groudon'],
                'Rayquaza': ['Rayquaza'],
                'Jirachi': ['Jirachi'],
                'Deoxys': ['Deoxys'],
                'Budew': ['Budew', 'Roserade'],
                'Roserade': ['Budew', 'Roserade'],
                'Chimecho': ['Chimecho', 'Chimchar', 'Monferno', 'Infernape'],
                'Chimchar': ['Chimecho', 'Chimchar', 'Monferno', 'Infernape'],
                'Monferno': ['Chimecho', 'Chimchar', 'Monferno', 'Infernape'],
                'Infernape': ['Chimecho', 'Chimchar', 'Monferno', 'Infernape'],
                'Piplup': ['Piplup', 'Prinplup', 'Empoleon'],
                'Prinplup': ['Piplup', 'Prinplup', 'Empoleon'],
                'Empoleon': ['Piplup', 'Prinplup', 'Empoleon'],
                'Turtwig': ['Turtwig', 'Grotle', 'Torterra'],
                'Grotle': ['Turtwig', 'Grotle', 'Torterra'],
                'Torterra': ['Turtwig', 'Grotle', 'Torterra'],
                'Makuhita': ['Makuhita', 'Hariyama'],
                'Hariyama': ['Makuhita', 'Hariyama'],
                'Lunatone': ['Lunatone'],
                'Solrock': ['Solrock'],
                'Cornerstone Mask Oger': ['Cornerstone Mask Oger'],
                'Ting-Lu': ['Ting-Lu'],
                'Oricorio': ['Oricorio'],
                'Drilbur': ['Drilbur', 'Excadrill'],
                'Excadrill': ['Drilbur', 'Excadrill'],
                'Hawlucha': ['Rowlet', 'Dartrix', 'Decidueye', 'Hawlucha'],
                'Rowlet': ['Rowlet', 'Dartrix', 'Decidueye', 'Hawlucha'],
                'Dartrix': ['Rowlet', 'Dartrix', 'Decidueye', 'Hawlucha'],
                'Decidueye': ['Rowlet', 'Dartrix', 'Decidueye', 'Hawlucha'],
                'Ethan\'s Sudowoodo': ['Ethan\'s Sudowoodo'],
                'Fezandipiti ex': ['Fezandipiti ex'],
                'Mega Zygarde ex': ['Mega Zygarde ex'],
                'Escadrill': ['Escadrill'],
                'Psyduck': ['Psyduck', 'Golduck'],
                'Golduck': ['Psyduck', 'Golduck'],
                'Flutter Mane': ['Flutter Mane'],
                'Lillie\'s Certainty ex': ['Lillie\'s Certainty ex'],
                'Munkidori': ['Munkidori'],
                'Togepi': ['Togepi', 'Togetic', 'Togekiss'],
                'Togetic': ['Togepi', 'Togetic', 'Togekiss'],
                'Togekiss': ['Togepi', 'Togetic', 'Togekiss']
            };
            
            const elementOrder = {
                'G': 1,  // Grass
                'R': 2,  // Fire
                'W': 3,  // Water
                'L': 4,  // Lightning
                'P': 5,  // Psychic
                'F': 6,  // Fighting
                'D': 7,  // Darkness
                'M': 8,  // Metal
                'N': 9,  // Dragon
                'C': 10  // Colorless
            };
            
            const evolutionOrder = {
                'Basic': 1,
                'Stage1': 2,
                'Stage2': 3
            };
            
            const typeOrder = {
                'Pokemon': 1,
                'Supporter': 2,
                'Item': 3,
                'Tool': 4,
                'Stadium': 5,
                'Special Energy': 6,
                'Basic Energy': 7,
                'Energy': 7
            };
            
            return cards.sort((a, b) => {
                const cardTypeA = a.type || a.card_type || '';
                const cardTypeB = b.type || b.card_type || '';
                
                const categoryA = getCardTypeCategory(cardTypeA);
                const categoryB = getCardTypeCategory(cardTypeB);
                
                const orderA = typeOrder[categoryA] || 99;
                const orderB = typeOrder[categoryB] || 99;
                
                // FIRST: Sort by main category (Pokemon, Supporter, etc.)
                if (orderA !== orderB) {
                    return orderA - orderB;
                }
                
                // Parse percentage once for both cards
                const percA = parseFloat((a.percentage_in_archetype || '0').toString().replace(',', '.')) || 0;
                const percB = parseFloat((b.percentage_in_archetype || '0').toString().replace(',', '.')) || 0;
                
                // For Pokemon: sort by element first, then by percentage
                if (categoryA === 'Pokemon' && categoryB === 'Pokemon') {
                    const elementA = cardTypeA.charAt(0);
                    const elementB = cardTypeB.charAt(0);
                    const evolutionA = cardTypeA.substring(1).replace(/\s+/g, '');
                    const evolutionB = cardTypeB.substring(1).replace(/\s+/g, '');
                    
                    const elemOrderA = elementOrder[elementA] || 99;
                    const elemOrderB = elementOrder[elementB] || 99;
                    
                    // Different element: sort by element order
                    if (elemOrderA !== elemOrderB) {
                        return elemOrderA - elemOrderB;
                    }
                    
                    // SAME ELEMENT: Sort by PERCENTAGE (highest first)
                    if (percA !== percB) {
                        return percB - percA;
                    }
                    
                    // Same percentage: sort by ORIGINAL SET CODE + SET NUMBER (keeps same-set cards together)
                    // Use original_set_code/original_set_number for consistent sorting even when Max Rarity is selected
                    const setCodeA = a.original_set_code || a.set_code || '';
                    const setCodeB = b.original_set_code || b.set_code || '';
                    
                    if (setCodeA !== setCodeB) {
                        return setCodeA.localeCompare(setCodeB);
                    }
                    
                    // Same set code: sort by ORIGINAL SET NUMBER (numerically)
                    const setNumA = parseInt(((a.original_set_number || a.set_number) || '0').toString().replace(/[^\d]/g, '')) || 0;
                    const setNumB = parseInt(((b.original_set_number || b.set_number) || '0').toString().replace(/[^\d]/g, '')) || 0;
                    if (setNumA !== setNumB) {
                        return setNumA - setNumB;
                    }
                    
                    // Same set+number: sort by card name (keeps related Pokemon together)
                    const nameA = a.card_name || a.name || '';
                    const nameB = b.card_name || b.name || '';
                    const nameCompare = nameA.localeCompare(nameB);
                    if (nameCompare !== 0) {
                        return nameCompare;
                    }
                    
                    // Same name: sort by evolution stage (Basic ? Stage1 ? Stage2)
                    const evolOrderA = evolutionOrder[evolutionA] || 99;
                    const evolOrderB = evolutionOrder[evolutionB] || 99;
                    
                    return evolOrderA - evolOrderB;
                }
                
                // For non-Pokemon cards: Sort by PERCENTAGE (highest first)
                if (percA !== percB) {
                    return percB - percA;
                }
                
                // Same percentage: sort by set number
                const setNumA = parseInt((a.set_number || '0').toString().replace(/[^\d]/g, '')) || 0;
                const setNumB = parseInt((b.set_number || '0').toString().replace(/[^\d]/g, '')) || 0;
                if (setNumA !== setNumB) {
                    return setNumA - setNumB;
                }
                
                // Finally by name
                const nameA = a.card_name || a.name || '';
                const nameB = b.card_name || b.name || '';
                return nameA.localeCompare(nameB);
            });
        }
        
        function deduplicateCards(cards) {
            /**
             * Fuer jede Karte (gleicher Name) nur die neueste low-rarity Version behalten
             */
            const setOrder = {
                // 2026 Sets (newest first, based on pokemon_sets_mapping.csv)
                'M3': 116, 'ASC': 115, 'PFL': 114, 'MEG': 113, 'MEE': 112, 'MEP': 111,
                'BLK': 110, 'WHT': 109, 'DRI': 108, 'JTG': 107, 'PRE': 106, 'SSP': 105,
                // 2024-2025 Sets
                'SCR': 104, 'SFA': 103, 'TWM': 102, 'TEF': 101, 'PAF': 100, 'PAR': 99,
                'MEW': 98, 'OBF': 97, 'PAL': 96, 'SVI': 95, 'SVE': 94, 'SVP': 93,
                // 2023 Sets
                'CRZ': 92, 'SIR': 91, 'LOR': 90, 'PGO': 89,
                // 2022 Sets
                'ASR': 88, 'BRS': 87, 'FST': 86, 'CEL': 85, 'EVS': 84, 'CRE': 83,
                // 2021 Sets
                'BST': 82, 'TM': 81, 'SHF': 80, 'VIV': 79, 'CPA': 78,
                // 2020 Sets
                'DAA': 77, 'RCL': 76, 'SSH': 75, 'SP': 74, 'CEC': 73
            };
            
            const rarityOrder = {
                'Common': 1,
                'Uncommon': 2,
                'Rare': 3,
                'Holo Rare': 4,
                'Ultra Rare': 5,
                'Secret Rare': 6,
                'Hyper Rare': 7,
                'Special Rare': 8,
                'Illustration Rare': 9,
                'Promo': 10
            };
            
            const cardMap = new Map();
            
            cards.forEach(card => {
                const cardName = normalizeCardAggregationKey(card.card_name);
                if (!cardName) return;
                if (!cardMap.has(cardName)) {
                    cardMap.set(cardName, { ...card });
                } else {
                    const existing = cardMap.get(cardName);
                    const existingSetPriority = setOrder[existing.set_code] || 0;
                    const newSetPriority = setOrder[card.set_code] || 0;
                    const existingRarityPriority = rarityOrder[existing.rarity] || 99;
                    const newRarityPriority = rarityOrder[card.rarity] || 99;
                    // Bevorzuge: 1. Low Rarity (Common/Uncommon), 2. Neuestes Set
                    if (newRarityPriority < existingRarityPriority) {
                        if (card.image_url) existing.image_url = card.image_url;
                        if (card.set_code) existing.set_code = card.set_code;
                        if (card.rarity) existing.rarity = card.rarity;
                        if (card.set_number) existing.set_number = card.set_number;
                    } else if (newRarityPriority === existingRarityPriority && newSetPriority > existingSetPriority) {
                        if (card.image_url) existing.image_url = card.image_url;
                        if (card.set_code) existing.set_code = card.set_code;
                        if (card.rarity) existing.rarity = card.rarity;
                        if (card.set_number) existing.set_number = card.set_number;
                    }
                    // Aggregiere max_count (höchsten Wert behalten)
                    existing.max_count = Math.max(parseInt(existing.max_count || 0), parseInt(card.max_count || 0));
                    if (!existing.set_code && existing.image_url) {
                        if (existing.image_url.includes('/M3/')) {
                            existing.set_code = 'M3';
                            devLog(`Set code M3 extracted from URL for: ${existing.card_name}`);
                        }
                    }
                }
            });
            
            // Debug: Count cards with set_code after deduplication
            const result = Array.from(cardMap.values());
            const m3Cards = result.filter(c => c.set_code === 'M3' || (c.image_url && c.image_url.includes('/M3/')));
            if (m3Cards.length > 0) {
                devLog(`After deduplicateCards: ${m3Cards.length} M3 cards. First 3:`, 
                    m3Cards.slice(0, 3).map(c => ({ name: c.card_name, set_code: c.set_code, url: c.image_url }))
                );
            }
            
            return result;
        }
        
        // ========== DECK OVERVIEW RENDERING FUNCTIONS ==========
        
        function renderOverviewCards(cards) {
            /**
             * Renders deck overview for City League Analysis
             * Shows cards in a responsive grid with:
             * - Card image
             * - Red circle (top-right): max_count
             * - Green circle (top-left): deck_count (how many in selected deck - starts at 0)
             * - Card name
             * - Percentage and average count
             */
            // Karten sind bereits in loadCityLeagueDeckData() dedupliziert
            const sortedCards = sortCardsByType([...cards]);
            
            // Get current deck state
            const deck = window.cityLeagueDeck || {};
            
            // Log for debugging
            devLog('RENDERED OVERVIEW CARDS - Sorted by type:');
            sortedCards.slice(0, 10).forEach((card, idx) => {
                devLog(`${idx + 1}. ${card.card_name} (${card.type || card.card_type || 'UNKNOWN'}) - ${getCardTypeCategory(card.type || card.card_type || '')}`);
            });
            
            const overviewContainer = document.getElementById('cityLeagueDeckOverview');
            if (!overviewContainer) return;
            
            const gridHtml = sortedCards.map(card => {
                const imageUrl = getBestCardImage(card);
                // Konvertiere Komma zu Punkt fuer parseFloat (CSV verwendet Komma als Dezimaltrennzeichen)
                const percentageStr = (card.percentage_in_archetype || '0').toString().replace(',', '.');
                let percentage = parseFloat(percentageStr);
                // FIX: Zuerst Durchschnitt berechnen, dann Max-Wert absichern
                // totalCount already declared above, do not redeclare here.
                const decksWithCard = parseFloat(String(card.deck_count || card.deck_inclusion_count || 0).replace(',', '.')) || 0;
                const avgCountFromRow = parseFloat(String(card.average_count || card.avg_count || '').replace(',', '.'));
                const avgCountValue = Number.isFinite(avgCountFromRow) && avgCountFromRow > 0
                    ? avgCountFromRow
                    : (decksWithCard > 0 ? (totalCount / decksWithCard) : 0);
                const avgCount = Math.max(0, avgCountValue).toFixed(2).replace('.', ',');
                // Max Count sichern (darf nicht kleiner sein als gerundeter Durchschnitt)
                const rawMaxCount = parseInt(card.max_count) || 0;
                const roundedAvg = Math.round(avgCountValue);
                const maxCount = Math.max(rawMaxCount, roundedAvg) || '-';
                
                // Get actual deck count from window.cityLeagueDeck
                // Try both: card name only AND "CardName (SET NUM)" format
                let deckCount = deck[card.card_name] || 0;
                if (deckCount === 0 && card.set_code && card.set_number) {
                    const versionKey = `${card.card_name} (${card.set_code} ${card.set_number})`;
                    deckCount = deck[versionKey] || 0;
                }
                // Also check all deck keys that start with the card name
                if (deckCount === 0) {
                    for (const key in deck) {
                        if (key.startsWith(card.card_name + ' (')) {
                            deckCount += deck[key];
                        }
                    }
                }
                
                // Prefer "average in decks that use this card" for UI consistency.
                // totalCount already declared above, do not redeclare here.
                // decksWithCard already declared above, do not redeclare here.
                // avgCountFromRow already declared above, do not redeclare here.
                // ...existing code...
                
                // Card image or placeholder
                let imgHtml = '';
                if (imageUrl && imageUrl.trim() !== '') {
                    imgHtml = `<img src="${imageUrl}" alt="${card.card_name}" loading="lazy" referrerpolicy="no-referrer" style="width: 100%; aspect-ratio: 2.5/3.5; object-fit: cover; cursor: zoom-in;" onerror="handleCardImageError(this, '${card.set_code || ''}', '${card.set_number || ''}')" onclick="if (typeof event !== 'undefined' && event) event.stopPropagation(); showSingleCard(this.src, '${escapeJsStr(card.card_name)}');">`;
                } else {
                    imgHtml = `<div style="width: 100%; aspect-ratio: 2.5/3.5; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: white; font-size: 2em;">??</div>`;
                }
                
                return `
                    <div class="card-item card-item-shadow">
                        <div class="pos-rel w-100">
                            ${imgHtml}
                            <!-- Red badge: Max Count (top-right) -->
                            <div class="card-badge card-badge-red pos-abs top-right">${maxCount}</div>
                            <!-- Green badge: Deck Count (top-left) - only show if > 0 -->
                            ${deckCount > 0 ? `<div class="card-badge card-badge-green pos-abs top-left">${deckCount}</div>` : ''}
                        </div>
                        
                        <!-- Card info section -->
                        <div style="padding: 8px; background: white; font-size: 0.75em; text-align: center; min-height: 60px; display: flex; flex-direction: column; justify-content: space-between;">
                            <div>
                                <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600; margin-bottom: 3px; color: #333; font-size: 0.9em;">
                                    ${card.card_name}
                                </div>
                                <div style="color: #333; font-size: 0.75em; margin-bottom: 3px; font-weight: 600;">
                                    ${card.set_code || ''} ${card.set_number || ''}
                                </div>
                                <div style="color: #333; font-size: 0.85em; font-weight: 600;">
                                    ${percentage.toFixed(2).replace('.', ',')}% | Ø ${avgCount}x
                                </div>
                            </div>
                            
                            <!-- Add button -->
                            <button class="btn btn-success" style="padding: 4px 8px; font-size: 0.75em; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; transition: all 0.2s; margin-top: 8px; width: 100%;" onclick="addCardToDeck('cityLeague', '${escapeJsStr(card.card_name)}', '${card.set_code || ''}', '${card.set_number || ''}')" title="${t('deck.addToDeck')}">${t('deck.addToDeck')}</button>
                        </div>
                    </div>
                `;
            }).join('');
            
            overviewContainer.innerHTML = gridHtml;
        }
        
        function generateDeckGrid(source) {
            if (source !== 'cityLeague' && source !== 'currentMeta' && source !== 'pastMeta') return;
            
            let deck, currentCardsKey;
            if (source === 'cityLeague') {
                deck = window.cityLeagueDeck;
                currentCardsKey = 'currentCityLeagueDeckCards';
            } else if (source === 'currentMeta') {
                deck = window.currentMetaDeck;
                currentCardsKey = 'currentCurrentMetaDeckCards';
            } else if (source === 'pastMeta') {
                deck = window.pastMetaDeck;
                currentCardsKey = null; // Past Meta uses different data source
            }
            
            if (!deck || Object.keys(deck).length === 0) {
                showToast(t('deck.empty'), 'warning');
                return;
            }
            
            const modal = document.getElementById('imageViewModal');
            const grid = document.getElementById('compactCardGrid');
            const allCards = currentCardsKey ? (window[currentCardsKey] || []) : (pastMetaFilteredCards || []);
            const allCardsDb = window.allCardsDatabase || [];
            
            // PERFORMANCE: Build map for O(1) lookups
            const cardDataMap = new Map();
            allCards.forEach(card => {
                const cardName = card.card_name || card.full_card_name;
                if (cardName) {
                    cardDataMap.set(cardName, card);
                }
            });
            
            // PERFORMANCE: Pre-build allCardsDb Map by name for O(1) lookup
            const allCardsDbMap = new Map();
            allCardsDb.forEach(card => {
                if (card.name) {
                    allCardsDbMap.set(card.name, card);
                }
            });
            
            // Convert deck to array with card data
            const deckCards = [];
            for (const [deckKey, count] of Object.entries(deck)) {
                if (count <= 0) continue;
                
                // Extract card name from deckKey (handle "CardName (SET NUM)" format)
                const baseNameMatch = deckKey.match(/^(.+?)\s*\(/);
                const cardName = baseNameMatch ? baseNameMatch[1] : deckKey;
                
                let cardData = cardDataMap.get(cardName) || cardDataMap.get(deckKey);
                
                // If not found, try allCardsDatabase with O(1) lookup
                if (!cardData) {
                    const setMatch = deckKey.match(/\(([A-Z0-9]+)\s+([A-Z0-9]+)\)$/);
                    if (setMatch) {
                        const exactCard = allCardsDbMap.get(cardName);
                    }
                }
                
                if (!cardData) continue;
                
                deckCards.push({...cardData, deck_count_in_selected: count, card_name: cardName});
            }
            
            // Sort cards using the standard sorting function
            const sortedCards = sortCardsByType(deckCards);
            
            // Check if mobile device
            const isMobile = window.innerWidth <= 768;
            
            // Build grid HTML
            grid.innerHTML = sortedCards.map(card => {
                const imageUrl = getBestCardImage(card);
                const count = card.deck_count_in_selected || 1;
                const cardName = card.card_name || '';
                const cardNameEscaped = escapeJsStr(cardName || '');
                
                if (imageUrl && imageUrl.trim() !== '') {
                    return `
                        <div class="compact-card" title="${cardName} (${count}x)" style="cursor: zoom-in;" onclick="showSingleCard(this.querySelector('img').src, '${cardNameEscaped}')">
                            <img src="${imageUrl}" 
                                 alt="${cardName}" 
                                 loading="lazy"
                                 referrerpolicy="no-referrer"
                                 onerror="handleCardImageError(this, '${card.set_code || ''}', '${card.set_number || ''}')">
                            <div class="compact-badge">${count}</div>
                        </div>
                    `;
                } else {
                    return `
                        <div class="compact-card" style="display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                            <div style="text-align: center;">
                                <div style="font-size: 0.8em; margin-bottom: 5px;">${cardName.substring(0, 15)}</div>
                                <div class="compact-badge" style="position: static;">${count}</div>
                            </div>
                        </div>
                    `;
                }
            }).join('');
            
            // Add mobile-specific class for compact layout
            if (isMobile) {
                grid.classList.add('mobile-compact-grid');
            } else {
                grid.classList.remove('mobile-compact-grid');
            }
            
            modal.classList.add('show');
            
            // Close on ESC key
            const escapeHandler = (e) => {
                if (e.key === 'Escape') {
                    closeImageView();
                    document.removeEventListener('keydown', escapeHandler);
                }
            };
            document.addEventListener('keydown', escapeHandler);
        }
        
        function closeImageView() {
            const modal = document.getElementById('imageViewModal');
            modal.classList.remove('show');
        }
        
        function copyDeck(source) {
            devLog('[copyDeck] Called with source:', source);
            
            if (source === 'cityLeague') {
                copyDeckOverview();
            } else if (source === 'currentMeta') {
                copyCurrentMetaDeckOverview();
            } else if (source === 'pastMeta') {
                copyPastMetaDeckOverview();
            } else {
                devLog('[copyDeck] Unsupported source:', source);
                showToast(t('deck.notAvailable'), 'warning');
            }
        }
        
        function showSingleCard(imageUrl, cardName, cardData = null) {
            const overlay = document.getElementById('fullCardOverlay') || document.getElementById('singleCardModal');
            const img = overlay?.querySelector('img') || document.getElementById('singleCardImage');
            const title = document.getElementById('singleCardTitle');

            if (!overlay || !img) return;

            const parseIdentityFromInput = () => {
                let inferredSet = '';
                let inferredNumber = '';

                const nameMatch = String(cardName || '').match(/\(([A-Z0-9]+)\s+([A-Z0-9]+)\)$/);
                if (nameMatch) {
                    inferredSet = nameMatch[1];
                    inferredNumber = nameMatch[2];
                }

                if (!inferredSet || !inferredNumber) {
                    const proxyMatch = String(imageUrl || '').match(/pokemonproxies\.com\/images\/([a-z0-9]+)\/([^/.]+)\.png/i);
                    if (proxyMatch) {
                        inferredSet = inferredSet || proxyMatch[1].toUpperCase();
                        inferredNumber = inferredNumber || proxyMatch[2];
                    }
                }

                if (!inferredSet || !inferredNumber) {
                    const limitlessMatch = String(imageUrl || '').match(/\/(M[34])\/\1_0*([A-Z0-9]+)_/i);
                    if (limitlessMatch) {
                        inferredSet = inferredSet || limitlessMatch[1].toUpperCase();
                        inferredNumber = inferredNumber || limitlessMatch[2];
                    }
                }

                return { inferredSet, inferredNumber };
            };

            const { inferredSet, inferredNumber } = parseIdentityFromInput();
            const normalizedCardData = (cardData && typeof cardData === 'object')
                ? cardData
                : {
                    card_name: String(cardName || '').replace(/\s*\([A-Z0-9]+\s+[A-Z0-9]+\)$/, ''),
                    image_url: imageUrl,
                    set_code: inferredSet,
                    set_number: inferredNumber
                };

            const resolvedImage = getBestCardImage(normalizedCardData) || imageUrl;

            img.src = resolvedImage;
            img.alt = cardName;
            img.onerror = function() {
                handleCardImageError(img, inferredSet || normalizedCardData.set_code || '', inferredNumber || normalizedCardData.set_number || '');
            };
            if (title) {
                title.textContent = cardName;
            }

            // Limitless link in zoom modal
            const modalContent = overlay.querySelector('.single-card-modal-content');
            const existingLimitlessBtn = overlay.querySelector('#singleCardLimitlessBtn');
            if (existingLimitlessBtn) existingLimitlessBtn.remove();
            const resolvedSet = inferredSet || normalizedCardData.set_code || '';
            const resolvedNum = inferredNumber || normalizedCardData.set_number || '';
            if (modalContent && resolvedSet && resolvedNum) {
                const lBtn = document.createElement('a');
                lBtn.id = 'singleCardLimitlessBtn';
                lBtn.href = `https://limitlesstcg.com/cards/${encodeURIComponent(resolvedSet)}/${encodeURIComponent(resolvedNum)}`;
                lBtn.target = '_blank';
                lBtn.rel = 'noopener noreferrer';
                lBtn.textContent = `Limitless — ${resolvedSet} ${resolvedNum}`;
                lBtn.style.cssText = 'display:block; margin-top:8px; padding:6px 14px; background:#6c3dc5; color:white; border-radius:6px; text-decoration:none; font-size:12px; font-weight:bold; text-align:center; letter-spacing:0.5px;';
                modalContent.appendChild(lBtn);
            }

            document.body.style.overflow = 'hidden';
            overlay.classList.add('card-modal-overlay');
            overlay.classList.remove('show');
            overlay.classList.remove('active');
            img.classList.remove('active');
            overlay.classList.remove('d-none');
            overlay.classList.add('d-flex');
            overlay.style.opacity = '';  // let CSS handle opacity via .active class
            setTimeout(() => {
                overlay.classList.add('active');
                overlay.classList.add('show');
                img.classList.add('active');
            }, 10);

            if (window._singleCardOverlayClickHandler) {
                overlay.removeEventListener('click', window._singleCardOverlayClickHandler);
            }
            window._singleCardOverlayClickHandler = function(e) {
                if (e.target === overlay) hideSingleCard();
            };
            overlay.addEventListener('click', window._singleCardOverlayClickHandler);
            img.onclick = function(e) { e.stopPropagation(); };

            // Escape-Taste schließt das Modal
            if (window._singleCardEscHandler) {
                document.removeEventListener('keydown', window._singleCardEscHandler);
            }
            window._singleCardEscHandler = (e) => {
                if (e.key === 'Escape') {
                    hideSingleCard();
                    document.removeEventListener('keydown', window._singleCardEscHandler);
                    window._singleCardEscHandler = null;
                }
            };
            document.addEventListener('keydown', window._singleCardEscHandler);
        }

        function hideSingleCard() {
            const overlay = document.getElementById('fullCardOverlay') || document.getElementById('singleCardModal');
            if (!overlay) return;
            const img = overlay.querySelector('img') || document.getElementById('singleCardImage');
            overlay.classList.remove('active');
            overlay.classList.remove('show');
            if (img) {
                img.classList.remove('active');
            }

            if (window._singleCardOverlayClickHandler) {
                overlay.removeEventListener('click', window._singleCardOverlayClickHandler);
                window._singleCardOverlayClickHandler = null;
            }

            document.body.style.overflow = '';

            if (window._singleCardEscHandler) {
                document.removeEventListener('keydown', window._singleCardEscHandler);
                window._singleCardEscHandler = null;
            }

            setTimeout(() => {
                if (!overlay.classList.contains('active') && !overlay.classList.contains('show')) {
                    overlay.style.display = 'none';
                }
            }, 300);
        }

        // Backward compatibility for existing inline handlers.
        function closeSingleCard() {
            hideSingleCard();
        }

        if (!window.__singleCardEscapeBound) {
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    hideSingleCard();
                }
            });
            window.__singleCardEscapeBound = true;
        }
        
        function autoComplete(source, rarityMode) {
            if (source !== 'cityLeague' && source !== 'currentMeta' && source !== 'pastMeta') return;
            
            // CRITICAL: Clear all specific rarity preferences before generating deck
            // This ensures the selected rarity mode (min/max) is applied correctly
            rarityPreferences = {};
            saveRarityPreferences();
            
            // Set global rarity preference based on button clicked
            if (rarityMode) {
                globalRarityPreference = rarityMode;
            }
            
            let cardsKey, cards;
            if (source === 'cityLeague') {
                cardsKey = 'currentCityLeagueDeckCards';
                cards = window[cardsKey];
            } else if (source === 'currentMeta') {
                cardsKey = 'currentCurrentMetaDeckCards';
                cards = window[cardsKey];
            } else if (source === 'pastMeta') {
                cards = pastMetaCurrentCards; // Use the currently selected deck cards
            }
            
            if (!cards || cards.length === 0) {
                showToast(t('deck.noCardsToAdd'), 'warning');
                return;
            }
            
            devLog('[autoComplete] Starting autoComplete for', source);
            devLog('[autoComplete] Total available cards:', cards.length);
            
            // ===================================================================
            // CRITICAL FIX: Always clear deck when generating
            // This ensures we build a fresh deck from scratch, not add to existing
            // ===================================================================
            devLog('[autoComplete] Clearing existing deck to build fresh...');
            if (source === 'cityLeague') {
                window.cityLeagueDeck = {};
                window.cityLeagueDeckOrder = [];
                saveCityLeagueDeck();
            } else if (source === 'currentMeta') {
                window.currentMetaDeck = {};
                window.currentMetaDeckOrder = [];
                saveCurrentMetaDeck();
            } else if (source === 'pastMeta') {
                window.pastMetaDeck = {};
                window.pastMetaDeckOrder = [];
                savePastMetaDeck();
            }
            
            // Get current archetype (for saving later)
            let currentArchetype;
            if (source === 'cityLeague') {
                currentArchetype = window.currentCityLeagueArchetype;
            } else if (source === 'currentMeta') {
                currentArchetype = window.currentCurrentMetaArchetype;
            } else if (source === 'pastMeta') {
                currentArchetype = window.pastMetaCurrentArchetype;
            }
            devLog('[autoComplete] Building deck for archetype:', currentArchetype);
            
            // Get deck reference and initialize card counter
            let deck;
            if (source === 'cityLeague') {
                deck = window.cityLeagueDeck;
            } else if (source === 'currentMeta') {
                deck = window.currentMetaDeck;
            } else if (source === 'pastMeta') {
                deck = window.pastMetaDeck;
            }
            let currentTotal = 0; // Start from 0 since we just cleared the deck
            
            // Step 1: Aggregate cards by card_name (sum deck_count across all tournaments)
            const uniqueCards = {};
            for (const card of cards) {
                const cardName = card.card_name;
                
                if (!uniqueCards[cardName]) {
                    uniqueCards[cardName] = {
                        ...card,
                        deck_count: parseInt(card.deck_count || 0),
                        total_count: parseFloat(card.total_count || 0),
                        max_count: parseInt(card.max_count || 0)
                    };
                } else {
                    uniqueCards[cardName].deck_count += parseInt(card.deck_count || 0);
                    uniqueCards[cardName].total_count += parseFloat(card.total_count || 0);
                    uniqueCards[cardName].max_count = Math.max(
                        parseInt(uniqueCards[cardName].max_count || 0),
                        parseInt(card.max_count || 0)
                    );
                }
            }
            
            const resolvedTotalDecks = resolveBuilderTotalDecks(source, currentArchetype, cards, uniqueCards);

            // Recalculate percentage_in_archetype for each card based on aggregated deck_count
            // Cap total_count at legal maximum (Ace Spec/Radiant = 1, Basic Energy = 59, else = 4)
            for (const cardName in uniqueCards) {
                const card = uniqueCards[cardName];
                const legalMaxCopies = getLegalMaxCopies(cardName, card);
                card.total_count = Math.min(card.total_count, card.deck_count * legalMaxCopies);
                const deckCount = card.deck_count;
                const percentage = Math.min(100, Math.max(0, (deckCount / resolvedTotalDecks) * 100));
                card.total_decks_in_archetype = resolvedTotalDecks;
                card.percentage_in_archetype = percentage.toFixed(2).replace('.', ',');
            }
            
            // ===================================================================
            // COMBINED VARIANTS: Group by strict base name, merge set prints,
            // and use mathematically correct recommendedCount.
            // ===================================================================
            const variantGroups = {};
            for (const cardName in uniqueCards) {
                const baseName = getStrictBaseCardName(cardName);
                if (!variantGroups[baseName]) variantGroups[baseName] = [];
                variantGroups[baseName].push(uniqueCards[cardName]);
            }

            const mergedUniqueCards = {};
            for (const baseName in variantGroups) {
                const group = variantGroups[baseName];
                if (group.length === 1) {
                    // Single print — keep as-is
                    mergedUniqueCards[baseName] = group[0];
                } else {
                    // Multiple prints — merge via Combined Variant Stats
                    const stats = calculateCombinedVariantStats(group, resolvedTotalDecks);
                    // Pick the variant with the highest deck_count as representative
                    const bestVariant = group.reduce((best, v) =>
                        (parseFloat(v.deck_count || 0) > parseFloat(best.deck_count || 0)) ? v : best, group[0]);
                    mergedUniqueCards[baseName] = {
                        ...bestVariant,
                        card_name: stats.baseName || bestVariant.card_name,
                        percentage_in_archetype: stats.combinedShare.toFixed(2).replace('.', ','),
                        sharePercent: stats.combinedShare,
                        avgCountWhenUsed: stats.combinedAvgWhenUsed,
                        _recommendedCount: stats.recommendedCount,
                        _legalMax: stats.legalMax,
                        _isMerged: group.length > 1
                    };
                    devLog(`[autoComplete][CombinedVariants] Merged ${group.length} prints of "${baseName}" → share=${stats.combinedShare}%, avg=${stats.combinedAvgWhenUsed}, rec=${stats.recommendedCount}`);
                }
            }
            
            let deckCards = Object.values(mergedUniqueCards);
            devLog('[autoComplete] After aggregation:', deckCards.length, 'unique cards');
            
            // Debug: Log all card types to understand structure
            const typeSet = new Set();
            deckCards.forEach(card => {
                const type = card.type || card.card_type || '';
                typeSet.add(type);
            });
            devLog('[autoComplete] Card types found:', Array.from(typeSet));
            
            // Step 2: Sort by percentage (descending)
            deckCards.sort((a, b) => {
                const percentageA = parseFloat((a.percentage_in_archetype || '0').toString().replace(',', '.'));
                const percentageB = parseFloat((b.percentage_in_archetype || '0').toString().replace(',', '.'));
                return percentageB - percentageA;
            });
            
            let cardsToAdd = [];
            const addedNames = new Set(Object.keys(deck).filter(name => deck[name] > 0));
            
            // ===================================================================
            // CRITICAL: Step 3 - Add Ace Spec FIRST (highest percentage, max 1x)
            // ===================================================================
            // Find all Ace Spec cards and sort by percentage
            const aceSpecCards = deckCards.filter(card => isAceSpec(card));
            aceSpecCards.sort((a, b) => {
                const percentageA = parseFloat((a.percentage_in_archetype || '0').toString().replace(',', '.'));
                const percentageB = parseFloat((b.percentage_in_archetype || '0').toString().replace(',', '.'));
                return percentageB - percentageA; // Sort descending by percentage
            });
            
            // Add the MOST USED Ace Spec (highest percentage) - exactly 1 copy
            let bestAceSpec = null;
            if (aceSpecCards.length > 0) {
                bestAceSpec = aceSpecCards[0]; // First one = highest percentage
                const acePercentage = parseFloat((bestAceSpec.percentage_in_archetype || '0').toString().replace(',', '.'));
                devLog('[autoComplete] ACE SPEC SELECTED:', bestAceSpec.card_name, `(${acePercentage}%)`);
                
                if (!addedNames.has(bestAceSpec.card_name)) {
                    cardsToAdd.push({ ...bestAceSpec, addCount: 1 });
                    addedNames.add(bestAceSpec.card_name);
                    currentTotal += 1;
                    devLog('[autoComplete] Added Ace Spec (1x):', bestAceSpec.card_name);
                } else {
                    devLog('[autoComplete] Ace Spec already in deck:', bestAceSpec.card_name);
                }
            } else {
                devLog('[autoComplete] WARNING: No Ace Spec found in deck list!');
            }
            
            
            // ===================================================================
            // Step 4: Add remaining cards from 100% downwards until deck is full
            // ===================================================================
            devLog('[autoComplete] Building deck from highest percentage downwards...');
            
            let radiantAdded = false; // Deck-wide: max 1 Radiant Pokémon total
            
            // Cards are already sorted by percentage (descending) from Step 2
            for (const card of deckCards) {
                if (currentTotal >= 60) {
                    devLog('[autoComplete] Deck complete (60 cards) - stopping');
                    break;
                }
                const cardName = card.card_name;
                if (addedNames.has(cardName)) continue;
                if (isAceSpec(card)) { devLog('[autoComplete] Skipping Ace Spec (already added):', cardName); continue; }
                if (isRadiantPokemon(cardName)) { if (radiantAdded) { devLog('[autoComplete] Skipping Radiant (deck already has one):', cardName); continue; } radiantAdded = true; }
                const percentage = parseFloat((card.percentage_in_archetype || '0').toString().replace(',', '.'));
                // --- LARGEST REMAINDER METHOD ---
                let addCount;
                let exactAvg = 0;
                if (card._recommendedCount != null) {
                    addCount = card._recommendedCount;
                    exactAvg = card.avgCountWhenUsed || card._recommendedCount;
                } else {
                    const totalCount = parseFloat(card.total_count) || 0;
                    const decksWithCard = parseFloat(card.deck_count || card.deck_inclusion_count) || 0;
                    const avgCountFromRow = parseFloat(String(card.average_count || card.avg_count || '').replace(',', '.'));
                    const avgWhenUsed = Number.isFinite(avgCountFromRow) && avgCountFromRow > 0 ? avgCountFromRow : (decksWithCard > 0 ? (totalCount / decksWithCard) : 1);
                    exactAvg = avgWhenUsed;
                    addCount = Math.round(avgWhenUsed);
                }
                const legalMax = card._legalMax || getLegalMaxCopies(cardName, card);
                if (!isBasicEnergy(cardName)) {
                    addCount = Math.max(1, Math.min(addCount, legalMax));
                } else {
                    addCount = Math.max(1, addCount);
                }
                addCount = Math.min(addCount, 60 - currentTotal);
                if (addCount > 0) {
                    cardsToAdd.push({ ...card, addCount: addCount, exactAvg: exactAvg });
                    addedNames.add(cardName);
                    currentTotal += addCount;
                }
            }
            // --- FEHLENDE KARTEN INTELLIGENT AUFFÜLLEN ---
            // ===================================================================
            // 🚨 FIX: FALLBACK - Deck auf exakt 60 Karten auffüllen
            // ===================================================================
            if (currentTotal < 60) {
                devLog(`[autoComplete] Deck has only ${currentTotal} cards. Filling up to 60...`);
                // 1. Priorität: Largest Remainder (Nachkommastelle) für Trainer/Pokémon
                cardsToAdd.sort((a, b) => {
                    const remA = (a.exactAvg || 0) % 1;
                    const remB = (b.exactAvg || 0) % 1;
                    return remB - remA;
                });
                for (let i = 0; i < cardsToAdd.length && currentTotal < 60; i++) {
                    const cardToAdd = cardsToAdd[i];
                    const legalMax = cardToAdd._legalMax || getLegalMaxCopies(cardToAdd.card_name, cardToAdd);
                    if (cardToAdd.addCount < legalMax || isBasicEnergy(cardToAdd.card_name)) {
                        cardToAdd.addCount++;
                        currentTotal++;
                    }
                }
                // 2. absolute Notfall-Priorität: Basis-Energie reindrücken
                if (currentTotal < 60) {
                    const topBasicEnergy = deckCards.find(c => {
                        const typeStr = String(c.type || c.card_type || '').toLowerCase();
                        const nameStr = String(c.card_name || '').toLowerCase();
                        return typeStr.includes('basis-energie') || typeStr === 'basic energy' || nameStr.includes('energy');
                    });
                    if (topBasicEnergy) {
                        const spaceLeft = 60 - currentTotal;
                        const existing = cardsToAdd.find(c => c.card_name === topBasicEnergy.card_name);
                        if (existing) {
                            existing.addCount += spaceLeft;
                        } else {
                            cardsToAdd.push({ ...topBasicEnergy, addCount: spaceLeft });
                            addedNames.add(topBasicEnergy.card_name);
                        }
                        currentTotal += spaceLeft;
                        devLog(`[autoComplete] Fallback: Added ${spaceLeft}x ${topBasicEnergy.card_name} to reach 60`);
                    }
                }
            }
            // --- ENDE FIX ---
            
            
            devLog('[autoComplete] Total cards to add:', currentTotal, 'in', cardsToAdd.length, 'unique entries');
            
            // Show summary grouped by type
            let summary = `${t('deck.autoCompleteHeader')} ${currentTotal} ${t('deck.cards')}:\n\n`;
            let pokemon = [], trainer = [], energy = [];
            
            cardsToAdd.forEach(card => {
                const cardType = card.type || card.card_type || '';
                const category = getCardTypeCategory(cardType);
                const line = `${card.addCount}x ${card.card_name}`;
                
                if (category === 'Pokemon') pokemon.push(line);
                else if (category === 'Basic Energy' || category === 'Special Energy') energy.push(line);
                else trainer.push(line);
            });
            
            if (pokemon.length > 0) summary += `${t('deck.pokemon')}\n${pokemon.join('\n')}\n\n`;
            if (trainer.length > 0) summary += `${t('deck.trainer')}\n${trainer.join('\n')}\n\n`;
            if (energy.length > 0) summary += `${t('deck.energy')}\n${energy.join('\n')}`;
            
            if (confirm(summary + '\n\n' + t('deck.autoCompleteContinue'))) {
                // Add all cards to deck using PREFERRED versions (newest low-rarity)
                cardsToAdd.forEach(card => {
                    // CRITICAL: Get preferred version for this card to match Grid View display
                    const originalSetCode = card.set_code || '';
                    const originalSetNumber = card.set_number || '';
                    const preferredVersion = getPreferredVersionForCard(card.card_name, originalSetCode, originalSetNumber);
                    
                    let setCode, setNumber;
                    if (preferredVersion) {
                        setCode = preferredVersion.set;
                        setNumber = preferredVersion.number;
                        devLog(`[autoComplete] Using PREFERRED version for ${card.card_name}: ${setCode} ${setNumber} (${preferredVersion.rarity})`);
                    } else {
                        // Fallback to original if no preferred version found
                        setCode = originalSetCode;
                        setNumber = originalSetNumber;
                        devLog(`[autoComplete] No preferred version for ${card.card_name}, using original: ${setCode} ${setNumber}`);
                    }
                    
                    // ?? PERFORMANCE: Use batch add (no display updates per card)
                    for (let i = 0; i < card.addCount; i++) {
                        addCardToDeckBatch(source, card.card_name, setCode, setNumber);
                    }
                });

                const normalizedTotal = normalizeGeneratedDeckTo60(source, cardsToAdd, deckCards);
                devLog(`[autoComplete] Final normalized deck size: ${normalizedTotal}`);
                devLog('[autoComplete] Deck completed with rarity mode:', globalRarityPreference);
                
                // Save deck to localStorage
                if (source === 'cityLeague') {
                    saveCityLeagueDeck();
                } else if (source === 'currentMeta') {
                    saveCurrentMetaDeck();
                } else if (source === 'pastMeta') {
                    savePastMetaDeck();
                }
                
                // ?? PERFORMANCE: Update display ONCE at the end (not 60 times!)
                scheduleDeckDisplayUpdate(source);
            }
        }
        
        /**
         * Auto-Complete with Max Consistency Algorithm
         * Based on Justin Basil's Professional Deck Building Guide:
         * - Deck Skeleton: 20 Pokemon, 30 Trainer, 10 Energy (+-3 deviation normal)
         * - Opening Hand Probabilities: 4x = 40%, 3x = 32%, 2x = 22%, 1x = 12%
         * - Consistency Score = (Share %) * (Avg Count) * (Reliability Factor) * (Meta Relevance Factor)
         * - Meta Relevance: Cards with high meta-share are prioritized (tech cards against meta)
         * - Smart Copy Counts based on usage patterns and probability math
         */
        
        // Helper: Get meta share for a card (if meta analysis is loaded)
        function getMetaShareForCard(cardName, source) {
            const metaData = source === 'cityLeague' ? metaCardData.cityLeague : 
                           source === 'currentMeta' ? metaCardData.currentMeta : null;
            
            if (!metaData || metaData.length === 0) return 0;
            
            const metaCard = metaData.find(c => c.card_name === cardName);
            return metaCard ? metaCard.metaShare : 0;
        }

        function resolveBuilderTotalDecks(source, currentArchetype, rawCards, uniqueCards) {
            const explicitTotals = (rawCards || [])
                .map(card => parseInt(card.total_decks_in_archetype || card.total_decks || 0, 10))
                .filter(value => Number.isFinite(value) && value > 0);

            const inferredDeckCount = Object.values(uniqueCards || {}).reduce((maxValue, card) => {
                const deckCount = parseInt(card.deck_count || card.deck_inclusion_count || 0, 10) || 0;
                return Math.max(maxValue, deckCount);
            }, 0);

            const cityLeagueFallback = source === 'cityLeague'
                ? getCityLeagueDeckCountFallback(currentArchetype)
                : 0;

            return Math.max(1, cityLeagueFallback, inferredDeckCount, ...explicitTotals);
        }
        
        function autoCompleteConsistency(source, rarityMode) {
            if (source !== 'cityLeague' && source !== 'currentMeta' && source !== 'pastMeta') return;
            
            // Clear specific rarity preferences before generating
            rarityPreferences = {};
            saveRarityPreferences();
            
            // Set global rarity preference
            if (rarityMode) {
                globalRarityPreference = rarityMode;
            }
            
            let cardsKey, cards;
            if (source === 'cityLeague') {
                cardsKey = 'currentCityLeagueDeckCards';
                cards = window[cardsKey];
            } else if (source === 'currentMeta') {
                cardsKey = 'currentCurrentMetaDeckCards';
                cards = window[cardsKey];
            } else if (source === 'pastMeta') {
                cards = pastMetaCurrentCards;
            }
            
            if (!cards || cards.length === 0) {
                showToast(t('deck.noCardsToAdd'), 'warning');
                return;
            }
            
            devLog('[autoCompleteConsistency] 🔄 Starting CONSISTENCY-based deck generation');
            devLog('[autoCompleteConsistency] Total available cards:', cards.length);
            
            // Clear existing deck
            devLog('[autoCompleteConsistency] ??? Clearing existing deck...');
            if (source === 'cityLeague') {
                window.cityLeagueDeck = {};
                window.cityLeagueDeckOrder = [];
                saveCityLeagueDeck();
            } else if (source === 'currentMeta') {
                window.currentMetaDeck = {};
                window.currentMetaDeckOrder = [];
                saveCurrentMetaDeck();
            } else if (source === 'pastMeta') {
                window.pastMetaDeck = {};
                window.pastMetaDeckOrder = [];
                savePastMetaDeck();
            }
            
            // Get current archetype
            let currentArchetype;
            if (source === 'cityLeague') {
                currentArchetype = window.currentCityLeagueArchetype;
            } else if (source === 'currentMeta') {
                currentArchetype = window.currentCurrentMetaArchetype;
            } else if (source === 'pastMeta') {
                currentArchetype = window.pastMetaCurrentArchetype;
            }
            devLog('[autoCompleteConsistency] Building consistency deck for:', currentArchetype);
            
            // ==========================================
            // 1. AGGREGATE CARDS BY CARD_NAME
            // ==========================================
            const uniqueCards = {};
            for (const card of cards) {
                const cardName = fixCardNameEncoding((card.card_name || card.full_card_name || card.name || '').toString().trim());
                if (!cardName) continue;

                const deckCountValue = parseInt(card.deck_count || card.deck_inclusion_count || 0) || 0;
                const totalCountValue = parseFloat(card.total_count || 0) || 0;
                const avgCountValue = parseFloat(String(card.average_count || card.avg_count || 0).replace(',', '.')) || 0;

                if (!uniqueCards[cardName]) {
                    uniqueCards[cardName] = { 
                        ...card, card_name: cardName, deck_count: deckCountValue, total_count: totalCountValue,
                        sum_avg_count: avgCountValue, count_entries: 1,
                        max_count: parseInt(card.max_count || 0)
                    };
                } else {
                    uniqueCards[cardName].deck_count += deckCountValue;
                    uniqueCards[cardName].total_count += totalCountValue;
                    uniqueCards[cardName].sum_avg_count += avgCountValue;
                    uniqueCards[cardName].count_entries += 1;
                    uniqueCards[cardName].max_count = Math.max(
                        parseInt(uniqueCards[cardName].max_count || 0),
                        parseInt(card.max_count || 0)
                    );
                }
            }
            
            const resolvedTotalDecks = resolveBuilderTotalDecks(source, currentArchetype, cards, uniqueCards);

            // Cap total_count at legal maximum (Ace Spec/Radiant = 1, Basic Energy = 59, else = 4)
            for (const cardName in uniqueCards) {
                const card = uniqueCards[cardName];
                const legalMaxCopies = getLegalMaxCopies(cardName, card);
                card.total_count = Math.min(card.total_count, card.deck_count * legalMaxCopies);
                const percentage = Math.min(100, Math.max(0, (card.deck_count / resolvedTotalDecks) * 100));
                card.total_decks_in_archetype = resolvedTotalDecks;
                card.percentage_in_archetype = percentage.toFixed(2).replace('.', ',');
            }
            
            let deckCards = Object.values(uniqueCards);
            devLog('[autoCompleteConsistency] After aggregation:', deckCards.length, 'unique cards');
            
            // ==========================================
            // COMBINED VARIANTS: Group by strict base name, merge set prints
            // ==========================================
            const variantGroups = {};
            for (const card of deckCards) {
                const baseName = getStrictBaseCardName(card.card_name);
                if (!variantGroups[baseName]) variantGroups[baseName] = [];
                variantGroups[baseName].push(card);
            }

            const mergedDeckCards = [];
            for (const baseName in variantGroups) {
                const group = variantGroups[baseName];
                if (group.length === 1) {
                    mergedDeckCards.push(group[0]);
                } else {
                    const stats = calculateCombinedVariantStats(group, resolvedTotalDecks);
                    const bestVariant = group.reduce((best, v) =>
                        (parseFloat(v.deck_count || 0) > parseFloat(best.deck_count || 0)) ? v : best, group[0]);
                    mergedDeckCards.push({
                        ...bestVariant,
                        card_name: stats.baseName || bestVariant.card_name,
                        percentage_in_archetype: stats.combinedShare.toFixed(2).replace('.', ','),
                        _recommendedCount: stats.recommendedCount,
                        _legalMax: stats.legalMax,
                        _isMerged: true
                    });
                    devLog(`[autoCompleteConsistency][CombinedVariants] Merged ${group.length} prints of "${baseName}" → share=${stats.combinedShare}%, rec=${stats.recommendedCount}`);
                }
            }
            deckCards = mergedDeckCards;
            devLog('[autoCompleteConsistency] After Combined Variants merge:', deckCards.length, 'unique cards');
            
            // ==========================================
            // 2. COMPUTE PER-CARD STATISTICS
            // ==========================================
            deckCards.forEach(card => {
                const sharePercent = Math.min(100, Math.max(0, parseFloat((card.percentage_in_archetype || '0').toString().replace(',', '.')) || 0));

                let avgCountWhenUsed = 0;
                if (card.total_count > 0 && card.deck_count > 0) {
                    avgCountWhenUsed = card.total_count / card.deck_count;
                } else if (card.sum_avg_count > 0 && card.count_entries > 0) {
                    avgCountWhenUsed = card.sum_avg_count / card.count_entries;
                } else {
                    const parsedAvg = parseFloat(String(card.average_count || card.avg_count || '').replace(',', '.'));
                    if (Number.isFinite(parsedAvg) && parsedAvg > 0) avgCountWhenUsed = parsedAvg;
                }

                card.sharePercent = sharePercent;
                card.avgCountWhenUsed = avgCountWhenUsed;
            });

            // ==========================================
            // 3. BUILD CONSISTENCY DECK
            // ==========================================
            let consistencyDeck = [];
            let currentTotal = 0;

            // ==========================================
            // 🚨 KUGELSICHERER ACE SPEC CHECKER 🚨
            // Hardcoded Namensliste + Rarity/Rules-Check
            // KEIN CSV is_ace_spec, KEIN aceSpecsList.json
            // ==========================================
            const aceSpecNames = [
                "Prime Catcher", "Unfair Stamp", "Master Ball", "Maximum Belt",
                "Hero's Cape", "Awakening Drum", "Reboot Pod", "Survival Brace",
                "Grand Tree", "Neutral Center", "Sparkling Crystal", "Dangerous Laser",
                "Scoop Up Cyclone", "Computer Search", "Dowsing Machine", "Rock Guard",
                "Life Dew", "Victory Star", "G Booster", "G Scope",
                "Rich Energy", "Legacy Energy", "Secret Box", "Hyper Aroma",
                "Neo Upper Energy", "Scramble Switch", "Deluxe Bomb", "Megaton Blower",
                "Amulet of Hope", "Poké Vital A"
            ];
            const aceSpecNamesLower = aceSpecNames.map(n => n.toLowerCase());

            const isAceSpecCard = (c) => {
                if (!c) return false;
                const name = String(c.card_name || c.name || '').trim().toLowerCase();
                if (aceSpecNamesLower.includes(name)) return true;
                const rarity = String(c.rarity || '').trim().toUpperCase();
                if (rarity.includes('ACE SPEC')) return true;
                if (Array.isArray(c.rules)) {
                    for (const rule of c.rules) {
                        if (String(rule).toUpperCase().includes('ACE SPEC')) return true;
                    }
                }
                return false;
            };

            const deckHasAceSpec = () => consistencyDeck.some(entry => isAceSpecCard(entry.card));

            const isBasicEnergyCardEntry = (c) => {
                if (!c) return false;
                const bNames = ['grass energy', 'fire energy', 'water energy', 'lightning energy', 'psychic energy', 'fighting energy', 'darkness energy', 'metal energy'];
                const n = String(c.card_name || c.name || '').trim().toLowerCase();
                return bNames.includes(n) || String(c.type || '').toLowerCase() === 'basis-energie';
            };

            const pushCard = (cardData, count, logPrefix = '') => {
                if (count <= 0 || currentTotal >= 60) return;
                
                const spaceLeft = 60 - currentTotal;
                const actualCount = Math.min(count, spaceLeft);
                
                consistencyDeck.push({ card: cardData, count: actualCount });
                currentTotal += actualCount;
                devLog(`${logPrefix} + ${actualCount}x ${cardData.card_name} (Share: ${cardData.sharePercent.toFixed(1)}%, Avg: ${cardData.avgCountWhenUsed.toFixed(2)}x) -- Total: ${currentTotal}/60`);
            };

            // Sortiere Karten nach Share (absteigend)
            deckCards.sort((a, b) => b.sharePercent - a.sharePercent);

            let radiantAdded = false; // Deck-wide: max 1 Radiant Pokémon total

            // ==========================================
            // 🚨 1. ACE SPEC PRIORITY (Lokal) 🚨
            // ==========================================
            // Finde die ECHTE Ace Spec unter den verfügbaren Karten (höchster Share)
            const aceSpecSlotCard = deckCards
                .filter(c => isAceSpecCard(c))
                .sort((a, b) => b.sharePercent - a.sharePercent)[0] || null;

            if (aceSpecSlotCard) {
                pushCard(aceSpecSlotCard, 1, '[Consistency][ACE-SPEC-Priority]');
                devLog(`[Consistency][ACE-SPEC-Priority] Erkannt: ${aceSpecSlotCard.card_name} (Rarity: ${aceSpecSlotCard.rarity || '?'})`);
            } else {
                devLog('[Consistency][ACE-SPEC-Priority] Keine echte ACE SPEC gefunden.');
            }

            // ==========================================
            // 🚨 2. STUFE 1 (Core: >= 80% Share) 🚨
            // ==========================================
            deckCards.forEach(card => {
                if (currentTotal >= 60) return;
                if (isAceSpecCard(card)) return; // Ace Spec haben wir schon
                
                // Deck-wide Radiant limit
                if (isRadiantPokemon(card.card_name)) {
                    if (radiantAdded) return;
                    radiantAdded = true;
                }
                
                if (card.sharePercent >= 80) {
                    let addCount = card._recommendedCount != null ? card._recommendedCount : Math.round(card.avgCountWhenUsed);
                    addCount = Math.max(1, addCount); // Core Karten MÜSSEN mindestens 1x rein
                    const legalMax = card._legalMax || getLegalMaxCopies(card.card_name, card);
                    if (!isBasicEnergyCardEntry(card)) addCount = Math.min(addCount, legalMax);
                    pushCard(card, addCount, '[Consistency][Stage1]');
                }
            });

            // ==========================================
            // 🚨 3. STUFE 2 (Extended Core: >= 30% Share) 🚨
            // ==========================================
            deckCards.forEach(card => {
                if (currentTotal >= 60) return;
                if (isAceSpecCard(card)) return;
                if (consistencyDeck.some(entry => entry.card.card_name === card.card_name)) return; // Schon im Deck?
                
                // Deck-wide Radiant limit
                if (isRadiantPokemon(card.card_name)) {
                    if (radiantAdded) return;
                    radiantAdded = true;
                }
                
                if (card.sharePercent >= 30) {
                    let addCount = card._recommendedCount != null ? card._recommendedCount : Math.round(card.avgCountWhenUsed);
                    if (addCount >= 1) {
                        const legalMax = card._legalMax || getLegalMaxCopies(card.card_name, card);
                        if (!isBasicEnergyCardEntry(card)) addCount = Math.min(addCount, legalMax);
                        pushCard(card, addCount, '[Consistency][Stage2]');
                    }
                }
            });

            // ==========================================
            // 🚨 4. FALLBACK: Basis-Energien auffüllen 🚨
            // ==========================================
            if (currentTotal < 60) {
                const topBasicEnergy = deckCards.filter(c => isBasicEnergyCardEntry(c)).sort((a, b) => b.sharePercent - a.sharePercent)[0];
                if (topBasicEnergy) {
                    const spaceLeft = 60 - currentTotal;
                    const existingEntry = consistencyDeck.find(e => e.card.card_name === topBasicEnergy.card_name);
                    if (existingEntry) {
                        existingEntry.count += spaceLeft;
                        currentTotal += spaceLeft;
                        devLog(`[Consistency][Fallback-Energy] + ${spaceLeft}x ${topBasicEnergy.card_name} (merged) -- Total: ${currentTotal}/60`);
                    } else {
                        pushCard(topBasicEnergy, spaceLeft, '[Consistency][Fallback-Energy]');
                    }
                }
            }

            devLog(`[autoCompleteConsistency] Deck complete: ${currentTotal}/60`);

            // Altes Deck löschen und neues speichern
            let cardsToAdd = consistencyDeck.map(entry => {
                return { ...entry.card, addCount: entry.count };
            });

            // Keep output deterministic
            cardsToAdd.sort((a, b) => {
                if (b.sharePercent !== a.sharePercent) return b.sharePercent - a.sharePercent;
                return a.card_name.localeCompare(b.card_name);
            });

            // Build confirm summary
            let summary = `MAX CONSISTENCY Deck (${currentTotal} ${t('deck.cards')}):\n`;
            summary += `Algorithm: ACE SPEC Priority -> Stage 1 (>=80%) -> Stage 2 (>=30%) -> Energy Fill\n\n`;
            cardsToAdd.forEach(c => {
                summary += `${c.addCount}x ${c.card_name} (${c.sharePercent.toFixed(0)}% archetype)\n`;
            });
            summary += `\n${t('deck.autoCompleteContinue')}`;

            if (confirm(summary)) {
                cardsToAdd.forEach(card => {
                    const cardName = fixCardNameEncoding((card.card_name || '').toString().trim());
                    if (!cardName) return;
                    const originalSetCode = card.set_code || '';
                    const originalSetNumber = card.set_number || '';
                    const preferredVersion = getPreferredVersionForCard(cardName, originalSetCode, originalSetNumber);
                    let setCode, setNumber;
                    if (preferredVersion) {
                        setCode = preferredVersion.set;
                        setNumber = preferredVersion.number;
                    } else {
                        setCode = originalSetCode;
                        setNumber = originalSetNumber;
                    }
                    for (let i = 0; i < card.addCount; i++) {
                        addCardToDeckBatch(source, cardName, setCode, setNumber);
                    }
                });

                const normalizedTotal = normalizeGeneratedDeckTo60(source, cardsToAdd, deckCards);
                devLog(`[autoCompleteConsistency] Final normalized deck size: ${normalizedTotal}`);

                devLog('[autoCompleteConsistency] Consistency deck completed with rarity mode:', globalRarityPreference);

                if (source === 'cityLeague') {
                    saveCityLeagueDeck();
                } else if (source === 'currentMeta') {
                    saveCurrentMetaDeck();
                } else if (source === 'pastMeta') {
                    savePastMetaDeck();
                }

                scheduleDeckDisplayUpdate(source);

                if (normalizedTotal >= 60) {
                    if (typeof showDeckShareToast === 'function') {
                        showDeckShareToast(t('deck.consistencySuccess'));
                    } else {
                        showToast(t('deck.consistencySuccess'), 'success');
                    }
                }
            }
        }
        
        // ---------------------------------------------------------------
        // META CARD ANALYSIS (Cross-Archetype Analysis)
        // ---------------------------------------------------------------
        