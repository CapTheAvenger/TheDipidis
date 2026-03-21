// app-features.js — extracted from app.js
// Part of Hausi's Pokemon TCG Analysis


        // ==================== DECK COMPARISON FEATURE ====================

        let currentDeckSource = null;

        async function openDeckCompare(source) {
            currentDeckSource = source;
            
            // Ensure cards database is loaded before allowing comparison
            if (!window.allCardsDatabase || window.allCardsDatabase.length === 0) {
                devLog('[Deck Compare] Loading cards database...');
                document.getElementById('deckCompareModal').style.display = 'flex';
                document.getElementById('deckCompareResult').innerHTML = '<div class="loading">? Loading card database...</div>';
                document.getElementById('deckCompareResult').style.display = 'block';
                
                try {
                    await loadAllCardsDatabase();
                    devLog('[Deck Compare] ? Database loaded successfully');
                    document.getElementById('deckCompareResult').style.display = 'none';
                } catch (error) {
                    console.error('[Deck Compare] Failed to load database:', error);
                    document.getElementById('deckCompareResult').innerHTML = '<div class="error">? Error loading card database</div>';
                    return;
                }
            }
            
            // Load saved decks into dropdown
            const savedDeckSelect = document.getElementById('savedDeckSelect');
            if (savedDeckSelect) {
                savedDeckSelect.innerHTML = '<option value="">-- Select a saved deck --</option>';
                
                if (window.userDecks && window.userDecks.length > 0) {
                    window.userDecks.forEach(deck => {
                        const totalCards = deck.totalCards || Object.values(deck.cards || {}).reduce((sum, count) => sum + count, 0);
                        const option = document.createElement('option');
                        option.value = deck.id;
                        option.textContent = `${deck.name} (${totalCards} cards - ${deck.archetype || 'Custom'})`;
                        savedDeckSelect.appendChild(option);
                    });
                } else {
                    const option = document.createElement('option');
                    option.value = '';
                    option.textContent = '-- No saved decks available --';
                    option.disabled = true;
                    savedDeckSelect.appendChild(option);
                }
            }
            
            document.getElementById('deckCompareModal').style.display = 'flex';
            document.getElementById('oldDeckListInput').value = '';
            document.getElementById('deckCompareResult').style.display = 'none';
        }

        function closeDeckCompare() {
            document.getElementById('deckCompareModal').style.display = 'none';
            currentDeckSource = null;
        }
        
        // Compare with own saved deck
        async function compareWithSavedDeck() {
            const savedDeckSelect = document.getElementById('savedDeckSelect');
            const selectedDeckId = savedDeckSelect.value;
            
            if (!selectedDeckId) {
                showToast('Please select a saved deck!', 'warning');
                return;
            }
            
            if (!currentDeckSource) {
                showToast('No deck source selected!', 'error');
                return;
            }
            
            // Check if card database is loaded
            if (!cardsBySetNumberMap || Object.keys(cardsBySetNumberMap).length === 0) {
                console.error('[compareWithSavedDeck] ERROR: cardsBySetNumberMap not loaded!');
                showToast('Card database not loaded yet. Please wait a moment and try again.', 'warning');
                return;
            }
            
            // Get selected saved deck
            const savedDeck = window.userDecks.find(d => d.id === selectedDeckId);
            if (!savedDeck) {
                showToast('Saved deck not found!', 'error');
                return;
            }
            
            devLog('[compareWithSavedDeck] Comparing with saved deck:', savedDeck.name);
            
            // Convert saved deck to "old deck" format (same as parseDeckList output)
            // Deck format: "CardName (SET NUMBER)" with exact prints preserved
            const oldDeck = [];
            for (const [deckKey, count] of Object.entries(savedDeck.cards || {})) {
                // Key format: "CardName (SET NUMBER)" or just "CardName"
                const match = deckKey.match(/^(.+?)\s+\(([A-Z0-9]+)\s+(\d+)\)$/);
                if (match) {
                    const cardName = match[1];
                    const setCode = match[2];
                    const setNumber = match[3];
                    oldDeck.push({
                        count: count,
                        name: cardName,
                        set: setCode,
                        number: setNumber,
                        key: `${setCode}-${setNumber}`
                    });
                } else {
                    // No set info available (old format or plain name), just use card name
                    oldDeck.push({
                        count: count,
                        name: deckKey,
                        set: null,
                        number: null,
                        key: deckKey
                    });
                }
            }
            
            devLog('[compareWithSavedDeck] Old deck (saved) parsed:', oldDeck);
            
            // Get current deck and convert to same format
            const deckMap = currentDeckSource === 'cityLeague' ? window.cityLeagueDeck :
                           currentDeckSource === 'currentMeta' ? window.currentMetaDeck :
                           window.pastMetaDeck;
            
            if (!deckMap || Object.keys(deckMap).length === 0) {
                showToast('Current deck is empty!', 'warning');
                return;
            }
            
            const currentDeck = [];
            for (const [key, count] of Object.entries(deckMap)) {
                // Key format: "CardName (SET NUMBER)" or just "CardName"
                const match = key.match(/^(.+?)\s+\(([A-Z0-9]+)\s+(\d+)\)$/);
                if (match) {
                    const cardName = match[1];
                    const setCode = match[2];
                    const setNumber = match[3];
                    currentDeck.push({
                        count: count,
                        name: cardName,
                        set: setCode,
                        number: setNumber,
                        key: `${setCode}-${setNumber}`
                    });
                } else {
                    // No set info available, just use card name
                    currentDeck.push({
                        count: count,
                        name: key,
                        set: null,
                        number: null,
                        key: key
                    });
                }
            }
            devLog('[compareWithSavedDeck] Current deck parsed:', currentDeck);
            
            // Perform comparison using the same logic as compareDeckLists
            performDeckComparison(oldDeck, currentDeck, savedDeck.name);
        }
        
        // Common comparison logic (extracted from compareDeckLists)
        function performDeckComparison(oldDeck, currentDeck, oldDeckName = 'Old Deck') {
            // Track which cards in current deck have been matched
            const currentDeckMatched = new Array(currentDeck.length).fill(false);
            
            // Collect ALL cards to display (current deck + removed cards)
            const allDisplayCards = [];
            
            // Process old deck cards to find matches and changes
            for (const oldCard of oldDeck) {
                // Try to find matching card in current deck
                let bestMatch = null;
                let bestMatchIndex = -1;
                
                // First: Try exact match (same set + number)
                for (let i = 0; i < currentDeck.length; i++) {
                    if (currentDeckMatched[i]) continue;
                    const newCard = currentDeck[i];
                    if (oldCard.set === newCard.set && oldCard.number === newCard.number) {
                        bestMatch = newCard;
                        bestMatchIndex = i;
                        break;
                    }
                }
                
                // Second: Try international print match
                if (!bestMatch && oldCard.set && oldCard.number) {
                    for (let i = 0; i < currentDeck.length; i++) {
                        if (currentDeckMatched[i]) continue;
                        const newCard = currentDeck[i];
                        if (newCard.set && newCard.number && 
                            areSameInternationalPrint(oldCard.set, oldCard.number, newCard.set, newCard.number)) {
                            bestMatch = newCard;
                            bestMatchIndex = i;
                            break;
                        }
                    }
                }
                
                // Third: Try base card name match (e.g. Boss's Orders PAL vs BRS)
                if (!bestMatch) {
                    const oldBase = getStrictBaseCardName(oldCard.name);
                    for (let i = 0; i < currentDeck.length; i++) {
                        if (currentDeckMatched[i]) continue;
                        const newCard = currentDeck[i];
                        if (oldBase && getStrictBaseCardName(newCard.name).toLowerCase() === oldBase.toLowerCase()) {
                            bestMatch = newCard;
                            bestMatchIndex = i;
                            break;
                        }
                    }
                }
                
                if (bestMatch) {
                    // Card found in new deck - mark as matched
                    currentDeckMatched[bestMatchIndex] = true;
                } else {
                    // Card not found in new deck = removed (will be displayed)
                    allDisplayCards.push({
                        name: oldCard.name,
                        set: oldCard.set,
                        number: oldCard.number,
                        oldCount: oldCard.count,
                        newCount: 0,
                        changeType: 'removed'
                    });
                }
            }
            
            // Add ALL current deck cards (matched or new)
            for (let i = 0; i < currentDeck.length; i++) {
                const newCard = currentDeck[i];
                
                // Find if this card existed in old deck
                let oldCard = null;
                for (const old of oldDeck) {
                    if (old.set === newCard.set && old.number === newCard.number) {
                        oldCard = old;
                        break;
                    }
                    // Also check international prints
                    if (!oldCard && old.set && old.number && newCard.set && newCard.number &&
                        areSameInternationalPrint(old.set, old.number, newCard.set, newCard.number)) {
                        oldCard = old;
                        break;
                    }
                    // Also check base card name (e.g. Boss's Orders PAL vs BRS)
                    if (!oldCard) {
                        const oldBase = getStrictBaseCardName(old.name);
                        const newBase = getStrictBaseCardName(newCard.name);
                        if (oldBase && newBase && oldBase.toLowerCase() === newBase.toLowerCase()) {
                            oldCard = old;
                            break;
                        }
                    }
                }
                
                if (oldCard) {
                    // Card existed in old deck
                    if (oldCard.count !== newCard.count) {
                        // Count changed
                        allDisplayCards.push({
                            name: newCard.name,
                            set: newCard.set,
                            number: newCard.number,
                            oldCount: oldCard.count,
                            newCount: newCard.count,
                            changeType: 'changed'
                        });
                    } else {
                        // No change
                        allDisplayCards.push({
                            name: newCard.name,
                            set: newCard.set,
                            number: newCard.number,
                            oldCount: oldCard.count,
                            newCount: newCard.count,
                            changeType: 'unchanged'
                        });
                    }
                } else if (!currentDeckMatched[i]) {
                    // New card (not matched by old deck)
                    allDisplayCards.push({
                        name: newCard.name,
                        set: newCard.set,
                        number: newCard.number,
                        oldCount: 0,
                        newCount: newCard.count,
                        changeType: 'new'
                    });
                }
            }
            
            // Sort by change type, then by card name
            allDisplayCards.sort((a, b) => {
                const typeOrder = { 'removed': 1, 'new': 2, 'changed': 3, 'unchanged': 4 };
                if (typeOrder[a.changeType] !== typeOrder[b.changeType]) {
                    return typeOrder[a.changeType] - typeOrder[b.changeType];
                }
                return a.name.localeCompare(b.name);
            });
            
            // Display results
            displayComparisonResults(allDisplayCards, oldDeckName);
        }
        
        // Display comparison results
        function displayComparisonResults(allDisplayCards, oldDeckName) {
            window.lastDeckComparisonCards = Array.isArray(allDisplayCards) ? allDisplayCards : [];
            const resultDiv = document.getElementById('deckCompareResult');
            resultDiv.style.display = 'block';
            
            // Count statistics
            const removed = allDisplayCards.filter(c => c.changeType === 'removed');
            const added = allDisplayCards.filter(c => c.changeType === 'new');
            const changed = allDisplayCards.filter(c => c.changeType === 'changed');
            const unchanged = allDisplayCards.filter(c => c.changeType === 'unchanged');
            
            let html = `
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 10px; margin-bottom: 20px; color: white;">
                    <div style="display:flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap;">
                        <h3 style="margin: 0 0 15px 0; font-size: 1.3em;">?? Comparison Results: ${oldDeckName} vs Current Deck</h3>
                        <button onclick="addComparisonNewCardsToProxy()" style="margin-bottom: 15px; border: none; border-radius: 8px; padding: 8px 12px; background: #e74c3c; color: white; font-weight: 700; cursor: pointer;">Proxy: Add New Cards</button>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px;">
                        <div style="background: rgba(255,255,255,0.2); padding: 10px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 2em; font-weight: bold;">${removed.length}</div>
                            <div style="font-size: 0.9em; opacity: 0.9;">? Removed</div>
                        </div>
                        <div style="background: rgba(255,255,255,0.2); padding: 10px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 2em; font-weight: bold;">${added.length}</div>
                            <div style="font-size: 0.9em; opacity: 0.9;">? Added</div>
                        </div>
                        <div style="background: rgba(255,255,255,0.2); padding: 10px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 2em; font-weight: bold;">${changed.length}</div>
                            <div style="font-size: 0.9em; opacity: 0.9;">?? Changed</div>
                        </div>
                        <div style="background: rgba(255,255,255,0.2); padding: 10px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 2em; font-weight: bold;">${unchanged.length}</div>
                            <div style="font-size: 0.9em; opacity: 0.9;">? Unchanged</div>
                        </div>
                    </div>
                </div>
            `;
            
            // Display cards grouped by change type
            const groups = [
                { type: 'removed', title: '? Removed Cards', color: '#e74c3c', cards: removed },
                { type: 'new', title: '? Added Cards', color: '#27ae60', cards: added },
                { type: 'changed', title: '?? Changed Count', color: '#f39c12', cards: changed },
                { type: 'unchanged', title: '? Unchanged Cards', color: '#95a5a6', cards: unchanged }
            ];
            
            groups.forEach(group => {
                if (group.cards.length > 0) {
                    html += `
                        <div style="margin-bottom: 20px;">
                            <h4 style="background: ${group.color}; color: white; padding: 10px 15px; border-radius: 6px; margin: 0 0 10px 0;">${group.title} (${group.cards.length})</h4>
                            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px;">
                    `;
                    
                    group.cards.forEach(card => {
                        const countDisplay = group.type === 'removed' ? `${card.oldCount} ? 0` :
                                           group.type === 'new' ? `0 ? ${card.newCount}` :
                                           group.type === 'changed' ? `${card.oldCount} ? ${card.newCount}` :
                                           `${card.newCount}`;
                        const proxyCount = group.type === 'new' ? parseProxyCount(card.newCount, 1) : 1;
                        const cardNameEscaped = escapeJsStr(card.name || '');
                        const cardSetEscaped = escapeJsStr(card.set || '');
                        const cardNumberEscaped = escapeJsStr(card.number || '');
                        
                        const cardData = cardsBySetNumberMap[`${card.set}-${card.number}`];
                        const imageUrl = cardData ? cardData.image_url : '';
                        
                        html += `
                            <div style="background: white; border: 2px solid ${group.color}; border-radius: 8px; padding: 10px; text-align: center;">
                                ${imageUrl ? `<img src="${imageUrl}" alt="${card.name}" style="width: 100%; border-radius: 6px; margin-bottom: 8px;">` : ''}
                                <div style="font-weight: 600; font-size: 0.9em; margin-bottom: 4px;">${card.name}</div>
                                <div style="font-size: 0.8em; color: #666; margin-bottom: 4px;">${card.set} ${card.number}</div>
                                <div style="font-size: 1.1em; font-weight: bold; color: ${group.color};">${countDisplay}</div>
                                <button onclick="addCardToProxy('${cardNameEscaped}', '${cardSetEscaped}', '${cardNumberEscaped}', ${proxyCount})" style="margin-top: 8px; border: none; border-radius: 6px; padding: 6px 8px; background: #e74c3c; color: white; font-weight: 700; cursor: pointer; width: 100%;">Add to Proxy</button>
                            </div>
                        `;
                    });
                    
                    html += `
                            </div>
                        </div>
                    `;
                }
            });
            
            resultDiv.innerHTML = html;
        }
        
        // Add ESC key handler for Deck Compare
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                const modal = document.getElementById('deckCompareModal');
                if (modal && modal.style.display === 'flex') {
                    closeDeckCompare();
                }
            }
        });

        function parseDeckList(text) {
            const deck = [];
            const lines = text.split('\n');
            
            for (let line of lines) {
                line = line.trim();
                if (!line) continue;
                if (line.includes('Pokémon:') || line.includes('Trainer:') || line.includes('Energy:')) continue;
                
                // Format: "2 Lunatone ASC 105" or "2 Lunatone ASC 105 PH" or "1 Meowth ex M3 61"
                // Extract: count, card name, set code (including Japanese sets like M3, M2a), set number
                const match = line.match(/^(\d+)\s+(.+?)\s+([A-Z][A-Z0-9]*[a-z]*)\s+(\d+)/);
                if (match) {
                    const count = parseInt(match[1]);
                    const cardName = match[2].trim();
                    const setCode = match[3];
                    const setNumber = match[4];
                    
                    deck.push({
                        count: count,
                        name: cardName,
                        set: setCode,
                        number: setNumber,
                        key: `${setCode}-${setNumber}` // Unique identifier
                    });
                } else {
                    // Fallback: PTCGL basic energy lines like "10 Basic {R} Energy Energy"
                    const energyMatch = line.match(/^(\d+)\s+Basic\s+\{([RGWLPFDM])\}\s+Energy/i);
                    if (energyMatch) {
                        const energyMap = { G:'1', R:'2', W:'3', L:'4', P:'5', F:'6', D:'7', M:'8' };
                        const energyNames = { G:'Basic Grass Energy', R:'Basic Fire Energy', W:'Basic Water Energy', L:'Basic Lightning Energy', P:'Basic Psychic Energy', F:'Basic Fighting Energy', D:'Basic Darkness Energy', M:'Basic Metal Energy' };
                        const code = energyMatch[2].toUpperCase();
                        deck.push({
                            count: parseInt(energyMatch[1]),
                            name: energyNames[code] || 'Basic Energy',
                            set: 'SVE',
                            number: energyMap[code] || '1',
                            key: `SVE-${energyMap[code] || '1'}`
                        });
                    }
                }
            }
            
            return deck;
        }
        
        // Check if two cards are the same international print
        function areSameInternationalPrint(set1, number1, set2, number2) {
            if (set1 === set2 && number1 === number2) return true;
            
            // Check if cards database is loaded
            if (!cardsBySetNumberMap || Object.keys(cardsBySetNumberMap).length === 0) {
                console.warn('[areSameInternationalPrint] cardsBySetNumberMap not loaded yet!');
                return false;
            }
            
            // SPECIAL CASE: Basic Energies are always the same card regardless of set
            const card1 = cardsBySetNumberMap[`${set1}-${number1}`];
            const card2 = cardsBySetNumberMap[`${set2}-${number2}`];
            if (card1 && card2 && isBasicEnergy(card1.name) && isBasicEnergy(card2.name)) {
                if (card1.name === card2.name) {
                    devLog(`[areSameInternationalPrint] ? Basic Energy match: ${set1} ${number1} ? ${set2} ${number2} (${card1.name})`);
                    return true;
                }
            }
            
            // Get all international prints for card 1
            const prints1 = getInternationalPrintsForCard(set1, number1);
            
            // Check if card 2 is in the international prints of card 1
            if (prints1 && prints1.length > 0) {
                const match = prints1.some(p => p.set === set2 && p.number === number2);
                if (match) {
                    devLog(`[areSameInternationalPrint] ? Match found: ${set1} ${number1} ? ${set2} ${number2}`);
                    return true;
                }
            }
            
            // Also check in reverse direction (card 2 -> card 1)
            const prints2 = getInternationalPrintsForCard(set2, number2);
            if (prints2 && prints2.length > 0) {
                const match = prints2.some(p => p.set === set1 && p.number === number1);
                if (match) {
                    devLog(`[areSameInternationalPrint] ? Match found (reverse): ${set1} ${number1} ? ${set2} ${number2}`);
                    return true;
                }
            }
            
            devLog(`[areSameInternationalPrint] ? No match: ${set1} ${number1} vs ${set2} ${number2}`);
            return false;
        }

        function compareDeckLists() {
            const oldDeckText = document.getElementById('oldDeckListInput').value.trim();
            
            if (!oldDeckText) {
                showToast('Please paste an old deck list first!', 'warning');
                return;
            }
            
            if (!currentDeckSource) {
                showToast('No deck source selected!', 'error');
                return;
            }
            
            // Check if card database is loaded
            if (!cardsBySetNumberMap || Object.keys(cardsBySetNumberMap).length === 0) {
                console.error('[deckCompare] ERROR: cardsBySetNumberMap not loaded!');
                showToast('Card database not loaded yet. Please wait a moment and try again.', 'warning');
                return;
            }
            
            devLog(`[deckCompare] cardsBySetNumberMap loaded: ${Object.keys(cardsBySetNumberMap).length} cards`);
            
            // Parse old deck (from text input)
            const oldDeck = parseDeckList(oldDeckText);
            devLog('[deckCompare] Old deck parsed:', oldDeck);
            
            // Get current deck and convert to same format
            const deckMap = currentDeckSource === 'cityLeague' ? window.cityLeagueDeck :
                           currentDeckSource === 'currentMeta' ? window.currentMetaDeck :
                           window.pastMetaDeck;
            
            if (!deckMap || Object.keys(deckMap).length === 0) {
                showToast('Current deck is empty!', 'warning');
                return;
            }
            
            const currentDeck = [];
            for (const [key, count] of Object.entries(deckMap)) {
                // Key format: "CardName (SET NUMBER)" or just "CardName"
                const match = key.match(/^(.+?)\s+\(([A-Z0-9]+)\s+(\d+)\)$/);
                if (match) {
                    const cardName = match[1];
                    const setCode = match[2];
                    const setNumber = match[3];
                    currentDeck.push({
                        count: count,
                        name: cardName,
                        set: setCode,
                        number: setNumber,
                        key: `${setCode}-${setNumber}`
                    });
                } else {
                    // No set info available, just use card name
                    currentDeck.push({
                        count: count,
                        name: key,
                        set: null,
                        number: null,
                        key: key
                    });
                }
            }
            devLog('[deckCompare] Current deck parsed:', currentDeck);
            
            // Use common comparison logic
            performDeckComparison(oldDeck, currentDeck, 'Manual Decklist');
        }

        // ================================================================
        // PHASE 3: DECK SHARING VIA URL
        // ================================================================

        /**
         * Share deck via URL
         * Uses Firebase Firestore for short links if available, otherwise Base64
         */
        async function shareDeck(source) {
            let deck, order, archetype;
            if (source === 'cityLeague') {
                deck = window.cityLeagueDeck; order = window.cityLeagueDeckOrder; archetype = window.currentCityLeagueArchetype;
            } else if (source === 'currentMeta') {
                deck = window.currentMetaDeck; order = window.currentMetaDeckOrder; archetype = window.currentCurrentMetaArchetype;
            } else if (source === 'pastMeta') {
                deck = window.pastMetaDeck; order = window.pastMetaDeckOrder; archetype = window.pastMetaCurrentArchetype;
            } else return;
            if (!deck || typeof deck !== 'object') { showDeckShareToast('⚠️ No deck data available!'); return; }
            const total = Object.values(deck || {}).reduce((s, c) => s + c, 0);
            if (total === 0) { showDeckShareToast('⚠️ No cards in deck to share!'); return; }
            
            const payload = { deck, order, archetype, source, timestamp: Date.now() };

            // Try Firebase Firestore for short links (if available)
            if (window.db && typeof window.db.collection === 'function') {
                try {
                    const shareId = generateShortId();
                    await window.db.collection('shared_decks').doc(shareId).set(payload);
                    
                    const url = new URL(window.location.href);
                    url.searchParams.set('sharedDeck', shareId);
                    
                    navigator.clipboard.writeText(url.toString()).then(() => {
                        showDeckShareToast(`🔗 Short link copied! (${total} cards)`);
                    }).catch(() => { showInputModal({ title: '🔗 Share Link', message: 'Copy this share link:', defaultValue: url.toString(), readonly: true }); });
                    return;
                } catch (err) {
                    console.warn('[shareDeck] Firebase Firestore failed, falling back to Base64:', err);
                }
            }

            // Fallback: Base64 encoding (always works, no DB needed)
            const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
            const url = new URL(window.location.href);
            url.searchParams.set('deck', encoded);
            navigator.clipboard.writeText(url.toString()).then(() => {
                showDeckShareToast(`🔗 Share link copied! (${total} cards)`);
            }).catch(() => { showInputModal({ title: '🔗 Share Link', message: 'Copy this share link:', defaultValue: url.toString(), readonly: true }); });
        }

        function generateShortId() {
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
            let id = '';
            for (let i = 0; i < 6; i++) {
                id += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return id;
        }

        function showDeckShareToast(msg) {
            let toast = document.getElementById('deckShareToast');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = 'deckShareToast';
                toast.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:#27ae60;color:white;padding:14px 28px;border-radius:30px;font-weight:bold;font-size:1em;z-index:99999;box-shadow:0 4px 20px rgba(0,0,0,0.25);opacity:0;transition:opacity 0.3s;pointer-events:none;white-space:nowrap;';
                document.body.appendChild(toast);
            }
            toast.textContent = msg;
            toast.style.opacity = '1';
            clearTimeout(toast._timeout);
            toast._timeout = setTimeout(() => { toast.style.opacity = '0'; }, 3000);
        }

        async function importDeckFromUrl() {
            try {
                const params = new URLSearchParams(window.location.search);
                
                // Priority 1: Firebase Firestore short link (?sharedDeck=ID)
                const sharedId = params.get('sharedDeck');
                if (sharedId && window.db && typeof window.db.collection === 'function') {
                    try {
                        const docRef = await window.db.collection('shared_decks').doc(sharedId).get();
                        if (docRef.exists) {
                            const payload = docRef.data();
                            await loadDeckFromPayload(payload);
                            // Remove sharedDeck param from URL
                            const cleanUrl = new URL(window.location.href);
                            cleanUrl.searchParams.delete('sharedDeck');
                            window.history.replaceState({}, '', cleanUrl.toString());
                            return;
                        } else {
                            console.warn('[importDeckFromUrl] Shared deck not found:', sharedId);
                            showDeckShareToast('❌ Shared deck not found!');
                            return;
                        }
                    } catch (err) {
                        console.warn('[importDeckFromUrl] Firestore fetch failed:', err);
                    }
                }

                // Priority 2: Base64 encoded deck (?deck=...)
                const encoded = params.get('deck');
                if (!encoded) return;
                const payload = JSON.parse(decodeURIComponent(escape(atob(encoded))));
                await loadDeckFromPayload(payload);
                // Remove deck param from URL
                const cleanUrl = new URL(window.location.href);
                cleanUrl.searchParams.delete('deck');
                window.history.replaceState({}, '', cleanUrl.toString());
            } catch (e) {
                console.warn('[importDeckFromUrl] Failed:', e);
            }
        }

        async function loadDeckFromPayload(payload) {
            const { deck, order, archetype, source } = payload;
            if (!deck || !source) return;
            
            if (source === 'cityLeague') {
                window.cityLeagueDeck = deck;
                window.cityLeagueDeckOrder = order || Object.keys(deck);
                window.currentCityLeagueArchetype = archetype || null;
            } else if (source === 'currentMeta') {
                window.currentMetaDeck = deck;
                window.currentMetaDeckOrder = order || Object.keys(deck);
                window.currentCurrentMetaArchetype = archetype || null;
            } else if (source === 'pastMeta') {
                window.pastMetaDeck = deck;
                window.pastMetaDeckOrder = order || Object.keys(deck);
                window.pastMetaCurrentArchetype = archetype || null;
            } else return;
            
            // Navigate to the deck builder tab for this source
            const tabMap = { cityLeague: 'city-league-analysis', currentMeta: 'current-analysis', pastMeta: 'past-meta' };
            const targetTab = tabMap[source];
            if (targetTab && typeof switchTab === 'function') switchTab(targetTab);
            
            // Defer display until card database is populated
            window._pendingUrlImport = source;
            const poll = setInterval(() => {
                if (window.allCardsDatabase && window.allCardsDatabase.length > 0) {
                    clearInterval(poll);
                    updateDeckDisplay(window._pendingUrlImport);
                    window._pendingUrlImport = null;
                }
            }, 200);
            setTimeout(() => clearInterval(poll), 30000);
            
            const total = Object.values(deck).reduce((s, c) => s + c, 0);
            showDeckShareToast(`🎴 Deck imported: ${total} cards`);
        }

        // ================================================================
        // PTCGL IMPORT/EXPORT (Pokémon Trading Card Game Live Format)
        // ================================================================

        /**
         * Export deck to PTCGL format (official Pokémon TCG Live text format)
         * Format: "Count CardName SetCode SetNumber" per line
         * Grouped by: Pokémon, Trainer, Energy (separated by blank lines)
         */
        function exportToPTCGL(source) {
            let deck, archetype;
            if (source === 'cityLeague') {
                deck = window.cityLeagueDeck;
                archetype = window.currentCityLeagueArchetype || 'My Deck';
            } else if (source === 'currentMeta') {
                deck = window.currentMetaDeck;
                archetype = window.currentCurrentMetaArchetype || 'My Deck';
            } else if (source === 'pastMeta') {
                deck = window.pastMetaDeck;
                archetype = window.pastMetaCurrentArchetype || 'My Deck';
            } else return;

            const total = Object.values(deck || {}).reduce((s, c) => s + c, 0);
            if (total === 0) {
                showDeckShareToast('⚠️ No cards in deck to export!');
                return;
            }

            // Build card database map
            const allCardsDb = window.allCardsDatabase || [];
            const cardsByName = {};
            allCardsDb.forEach(card => {
                if (!cardsByName[card.name]) cardsByName[card.name] = [];
                cardsByName[card.name].push(card);
            });

            // Group cards by supertype (Pokemon, Trainer, Energy)
            const pokemon = [];
            const trainers = [];
            const energy = [];

            for (const [deckKey, count] of Object.entries(deck)) {
                if (count <= 0) continue;

                // Extract card name and set info
                let cardName = deckKey.replace(/\s*\([^)]+\)$/, '').trim();
                let setCode = '';
                let setNumber = '';

                const setMatch = deckKey.match(/\(([A-Z0-9-]+)\s+([A-Z0-9]+)\)$/);
                if (setMatch) {
                    setCode = setMatch[1];
                    setNumber = setMatch[2];
                }

                // Fallback: look up from database if no set info in deckKey
                if (!setCode && cardsByName[cardName] && cardsByName[cardName].length > 0) {
                    const card = cardsByName[cardName][0];
                    setCode = card.set;
                    setNumber = card.number;
                }

                // Determine supertype
                let supertype = 'Pokemon'; // default
                if (cardsByName[cardName] && cardsByName[cardName].length > 0) {
                    const card = cardsByName[cardName][0];
                    const type = (card.type || '').toLowerCase();
                    if (type.includes('energy')) {
                        supertype = 'Energy';
                    } else if (type.includes('trainer') || type.includes('item') || 
                               type.includes('supporter') || type.includes('stadium') || 
                               type.includes('tool')) {
                        supertype = 'Trainer';
                    }
                }

                const line = `${count} ${cardName} ${setCode} ${setNumber}`.trim();

                if (supertype === 'Pokemon') pokemon.push(line);
                else if (supertype === 'Trainer') trainers.push(line);
                else if (supertype === 'Energy') energy.push(line);
            }

            // Build PTCGL format
            let ptcglText = `Pokémon: ${pokemon.length}\n`;
            ptcglText += pokemon.join('\n');
            ptcglText += '\n\nTrainer: ' + trainers.length + '\n';
            ptcglText += trainers.join('\n');
            ptcglText += '\n\nEnergy: ' + energy.length + '\n';
            ptcglText += energy.join('\n');
            ptcglText += '\n\nTotal Cards: ' + total;

            // Copy to clipboard
            navigator.clipboard.writeText(ptcglText).then(() => {
                showDeckShareToast(`✅ PTCGL export copied! (${total} cards)`);
            }).catch(() => {
                // Fallback: show in modal
                showInputModal({ title: 'PTCGL Export', message: 'Copy this PTCGL deck list:', defaultValue: ptcglText, readonly: true, textarea: true });
            });
        }

        /**
         * Import deck from PTCGL format
         * Expects text format: "Count CardName SetCode SetNumber"
         * Parses and populates the deck builder
         */
        async function importFromPTCGL(source) {
            const ptcglText = await showInputModal({ title: 'Import PTCGL Deck', message: 'Paste your PTCGL deck list:\n\n(Format: "4 Charizard ex PAL 234")', textarea: true, placeholder: '4 Charizard ex PAL 234\n3 Rare Candy SVI 191\n...' });
            if (!ptcglText) return;

            const allCardsDb = window.allCardsDatabase || [];
            const cardsBySetNumber = {};
            allCardsDb.forEach(card => {
                const key = `${card.set}_${card.number}`;
                cardsBySetNumber[key] = card;
            });

            const newDeck = {};
            const lines = ptcglText.split('\n');
            let importCount = 0;
            let errorCount = 0;

            for (const line of lines) {
                const trimmed = line.trim();
                
                // Skip empty lines and section headers
                if (!trimmed || /^(Pokémon|Trainer|Energy|Total Cards):/i.test(trimmed)) continue;

                // Parse format: "Count CardName SetCode SetNumber"
                const match = trimmed.match(/^(\d+)\s+(.+?)\s+([A-Z0-9-]{2,5})\s+([A-Z0-9]+)$/);
                if (!match) {
                    console.warn('[PTCGL Import] Could not parse line:', trimmed);
                    errorCount++;
                    continue;
                }

                const [, countStr, cardName, setCode, setNumber] = match;
                const count = parseInt(countStr);

                // Look up card in database
                const lookupKey = `${setCode}_${setNumber}`;
                const card = cardsBySetNumber[lookupKey];

                if (card) {
                    const deckKey = `${cardName} (${setCode} ${setNumber})`;
                    newDeck[deckKey] = count;
                    importCount++;
                } else {
                    // Fallback: add without validation
                    const deckKey = `${cardName} (${setCode} ${setNumber})`;
                    newDeck[deckKey] = count;
                    importCount++;
                    console.warn('[PTCGL Import] Card not found in database:', lookupKey, '- adding anyway');
                }
            }

            if (importCount === 0) {
                showDeckShareToast('❌ No valid cards found in PTCGL text!');
                return;
            }

            // Set the deck
            if (source === 'cityLeague') {
                window.cityLeagueDeck = newDeck;
                window.cityLeagueDeckOrder = Object.keys(newDeck);
            } else if (source === 'currentMeta') {
                window.currentMetaDeck = newDeck;
                window.currentMetaDeckOrder = Object.keys(newDeck);
            } else if (source === 'pastMeta') {
                window.pastMetaDeck = newDeck;
                window.pastMetaDeckOrder = Object.keys(newDeck);
            }

            updateDeckDisplay(source);
            const totalCards = Object.values(newDeck).reduce((s, c) => s + c, 0);
            showDeckShareToast(`✅ PTCGL import: ${importCount} cards (${totalCards} total)${errorCount > 0 ? ` | ${errorCount} errors` : ''}`);
        }

        // ================================================================
        // PHASE 2: OPENING HAND PROBABILITY (HYPERGEOMETRIC DISTRIBUTION)
        // ================================================================

        function hypergeomComb(n, k) {
            if (k < 0 || k > n) return 0;
            if (k === 0 || k === n) return 1;
            k = Math.min(k, n - k);
            let c = 1;
            for (let i = 0; i < k; i++) c = c * (n - i) / (i + 1);
            return c;
        }

        // P(drawing at least 1 of K target cards in hand of n from deck of N)
        function hypergeomProbAtLeastOne(N, K, n) {
            if (K <= 0 || N <= 0 || n <= 0) return 0;
            if (K >= N) return 1;
            const prob0 = hypergeomComb(N - K, n) / hypergeomComb(N, n);
            return Math.max(0, Math.min(1, 1 - prob0));
        }

        // Alternative implementation: Returns probability in percentage (0-100)
        // Calculates P(drawing at least 1 of targetCount cards in handSize draws from deckSize)
        function probAtLeastOne(deckSize, handSize, targetCount) {
            if (targetCount <= 0 || deckSize <= 0 || handSize <= 0) return 0;
            if (targetCount > deckSize - handSize) return 100; // 100% Chance
            let probZero = 1;
            for (let i = 0; i < handSize; i++) {
                probZero *= (deckSize - targetCount - i) / (deckSize - i);
            }
            return (1 - probZero) * 100;
        }

        function updateOpeningHandStats(source) {
            const elId = source === 'cityLeague' ? 'cityLeagueHandStats'
                : source === 'currentMeta' ? 'currentMetaHandStats' : 'pastMetaHandStats';
            const el = document.getElementById(elId);
            if (!el) return;
            const deck = source === 'cityLeague' ? window.cityLeagueDeck
                : source === 'currentMeta' ? window.currentMetaDeck : window.pastMetaDeck;
            const N = Object.values(deck || {}).reduce((s, c) => s + c, 0);
            if (N === 0) { el.style.display = 'none'; return; }
            // Count Basic Pokémon using the card database
            let basicCount = 0;
            const db = window.allCardsDatabase || [];
            Object.entries(deck).forEach(([key, count]) => {
                if (count <= 0) return;
                let cardType = null;
                const setMatch = key.match(/\(([A-Z0-9-]+)\s+([^\)]+)\)$/);
                if (setMatch && db.length) {
                    const found = db.find(c => c.set === setMatch[1] && c.number === setMatch[2]);
                    if (found) cardType = found.type;
                }
                if (!cardType && db.length) {
                    const name = key.replace(/\s*\(.*\)$/, '').trim();
                    const found = db.find(c => c.name === name);
                    if (found) cardType = found.type;
                }
                if (cardType === 'Basic') basicCount += count;
            });
            const probBasic = hypergeomProbAtLeastOne(N, basicCount, 7);
            const probBrick = 1 - probBasic;
            const basicColor = probBasic >= 0.90 ? '#27ae60' : probBasic >= 0.75 ? '#e67e22' : '#e74c3c';
            const brickColor = probBrick <= 0.10 ? '#27ae60' : probBrick <= 0.25 ? '#e67e22' : '#e74c3c';
            el.innerHTML = `<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;font-size:0.85em;">
                <span style="font-weight:600;color:#555;">&#127922; Opening Hand (7 cards):</span>
                <span title="P(at least 1 Basic Pokémon in opening 7)" style="background:${basicColor};color:white;padding:3px 12px;border-radius:12px;font-weight:700;cursor:default;">✅ Basic in hand: ${(probBasic*100).toFixed(1)}%</span>
                <span title="P(no Basic Pokémon = forced mulligan)" style="background:${brickColor};color:white;padding:3px 12px;border-radius:12px;font-weight:700;cursor:default;">☠️ Mulligan: ${(probBrick*100).toFixed(1)}%</span>
                <span style="color:#999;">(${basicCount} Basics / ${N} cards)</span>
            </div>`;
            el.style.display = 'block';
        }

        // ================================================================
        // PHASE 1: META SHARE CHART (CHART.JS)
        // ================================================================

        window._metaChartInstances = {};

        function renderMetaChart(sourceKey, sorted) {
            if (typeof Chart === 'undefined') return;
            const containerId = sourceKey + 'MetaChartSection';
            let container = document.getElementById(containerId);
            if (!container) {
                const anchor = document.getElementById(
                    sourceKey === 'cityLeague' ? 'cityLeagueContent' : 'currentMetaContent'
                );
                if (!anchor) return;
                const section = document.createElement('div');
                section.id = containerId;
                section.style.cssText = 'padding:0 30px 20px;background:#fff;';
                section.innerHTML = `
                    <details open style="border:1px solid #e0e0e0;border-radius:10px;overflow:hidden;margin-top:10px;">
                        <summary style="background:linear-gradient(135deg,#667eea,#764ba2);color:white;padding:12px 20px;cursor:pointer;font-weight:700;font-size:1em;list-style:none;display:flex;justify-content:space-between;align-items:center;">
                            📊 Meta Share Chart &ndash; Top Archetypes <span style="font-size:0.8em;opacity:0.8;">▼ toggle</span>
                        </summary>
                        <div style="padding:20px;display:flex;gap:20px;flex-wrap:wrap;justify-content:center;align-items:center;">
                            <div style="position:relative;width:260px;height:260px;flex-shrink:0;"><canvas id="${sourceKey}DonutChart"></canvas></div>
                            <div style="flex:1;min-width:300px;height:260px;"><canvas id="${sourceKey}BarChart"></canvas></div>
                        </div>
                    </details>`;
                anchor.insertAdjacentElement('afterend', section);
                container = section;
            }
            // Destroy old chart instances before re-creating
            if (window._metaChartInstances[sourceKey + 'Donut']) {
                window._metaChartInstances[sourceKey + 'Donut'].destroy();
                window._metaChartInstances[sourceKey + 'Donut'] = null;
            }
            if (window._metaChartInstances[sourceKey + 'Bar']) {
                window._metaChartInstances[sourceKey + 'Bar'].destroy();
                window._metaChartInstances[sourceKey + 'Bar'] = null;
            }
            const top = (sorted || []).slice(0, 12);
            const labels = top.map(d => d.archetype || d.main || 'Unknown');
            const counts = top.map(d => parseInt(d.new_count || d.count || 0));
            const PALETTE = ['#6c5ce7','#0984e3','#00b894','#fdcb6e','#e17055','#d63031','#a29bfe','#55efc4','#ffeaa7','#fab1a0','#81ecec','#fd79a8'];
            const donutCtx = document.getElementById(sourceKey + 'DonutChart');
            if (donutCtx) {
                window._metaChartInstances[sourceKey + 'Donut'] = new Chart(donutCtx, {
                    type: 'doughnut',
                    data: { labels, datasets: [{ data: counts, backgroundColor: PALETTE, borderWidth: 2, borderColor: '#fff' }] },
                    options: {
                        responsive: true,
                        maintainAspectRatio: true,
                        plugins: {
                            legend: { display: false },
                            tooltip: { callbacks: { label: (ctx) => {
                                const total = counts.reduce((a,b) => a+b, 0);
                                const pct = total > 0 ? ((ctx.parsed / total)*100).toFixed(1) : 0;
                                return ` ${ctx.label}: ${ctx.parsed} (${pct}%)`;
                            }}}
                        }
                    }
                });
            }
            const barCtx = document.getElementById(sourceKey + 'BarChart');
            if (barCtx) {
                window._metaChartInstances[sourceKey + 'Bar'] = new Chart(barCtx, {
                    type: 'bar',
                    data: { labels, datasets: [{ label: 'Deck Count', data: counts, backgroundColor: PALETTE, borderRadius: 4, borderSkipped: false }] },
                    options: {
                        indexAxis: 'y',
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                            x: { beginAtZero: true, grid: { color: '#f0f0f0' } },
                            y: { ticks: { font: { size: 11 } } }
                        }
                    }
                });
            }
        }