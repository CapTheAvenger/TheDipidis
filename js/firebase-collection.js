/**
 * User Collection Management
 * ==========================
 * Track owned cards, wishlist, and deck building
 */

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeJsSingleQuoted(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}

// Add card to collection (increment count, max 4)
async function addToCollection(cardId) {
  const user = auth.currentUser;
  if (!user) {
    showNotification('Please sign in to use this feature', 'error');
    return;
  }
  
  const currentCount = window.userCollectionCounts ? (window.userCollectionCounts.get(cardId) || 0) : 0;
  if (currentCount >= 4) {
    showNotification('Maximum 4 copies per card (playset)', 'info');
    return;
  }
  
  const newCount = currentCount + 1;
  
  try {
    await db.collection('users').doc(user.uid).set({
      collection: firebase.firestore.FieldValue.arrayUnion(cardId),
      [`collectionCounts.${cardId}`]: newCount
    }, { merge: true });
    
    window.userCollection.add(cardId);
    if (!window.userCollectionCounts) window.userCollectionCounts = new Map();
    window.userCollectionCounts.set(cardId, newCount);
    updateCardUI(cardId);
    showNotification(`Added to collection (${newCount}/4)`, 'success');
    
    // Update collection display and stats
    updateCollectionUI();
    
    // Re-render cards to show green checkmark
    if (typeof renderCardDatabase === 'function' && window.filteredCardsData) {
      renderCardDatabase(window.filteredCardsData);
    }
  } catch (error) {
    console.error('Error adding to collection:', error);
    showNotification('Error updating collection', 'error');
  }
}

// Remove card from collection (decrement count)
async function removeFromCollection(cardId) {
  const user = auth.currentUser;
  if (!user) return;
  
  const currentCount = window.userCollectionCounts ? (window.userCollectionCounts.get(cardId) || 0) : 0;
  const newCount = currentCount - 1;
  
  try {
    if (newCount <= 0) {
      await db.collection('users').doc(user.uid).set({
        collection: firebase.firestore.FieldValue.arrayRemove(cardId),
        [`collectionCounts.${cardId}`]: firebase.firestore.FieldValue.delete()
      }, { merge: true });
      
      window.userCollection.delete(cardId);
      if (window.userCollectionCounts) window.userCollectionCounts.delete(cardId);
    } else {
      await db.collection('users').doc(user.uid).set({
        [`collectionCounts.${cardId}`]: newCount
      }, { merge: true });
      
      if (window.userCollectionCounts) window.userCollectionCounts.set(cardId, newCount);
    }
    
    updateCardUI(cardId);
    showNotification(newCount > 0 ? `Collection: ${newCount}/4 copies` : 'Removed from collection', 'success');
    
    // Update collection display and stats
    updateCollectionUI();
    
    // Re-render cards to update checkmark
    if (typeof renderCardDatabase === 'function' && window.filteredCardsData) {
      renderCardDatabase(window.filteredCardsData);
    }
  } catch (error) {
    console.error('Error removing from collection:', error);
    showNotification('Error updating collection', 'error');
  }
}

// Toggle card in collection (add-only from deck views, removes handled via collection UI)
async function toggleCollection(cardId) {
  // Always add (increment) — never remove from the + button
  await addToCollection(cardId);
}

// Add card to wishlist
async function addToWishlist(cardId) {
  const user = auth.currentUser;
  if (!user) {
    showNotification('Please sign in to use this feature', 'error');
    return;
  }
  
  try {
    await db.collection('users').doc(user.uid).set({
      wishlist: firebase.firestore.FieldValue.arrayUnion(cardId)
    }, { merge: true });
    
    if (!window.userWishlist) {
      window.userWishlist = new Set();
    }
    window.userWishlist.add(cardId);
    showNotification('Added to wishlist!', 'success');
    
    // Update wishlist display
    updateWishlistUI();
    
    // Re-render cards to update wishlist button
    if (typeof renderCardDatabase === 'function' && window.filteredCardsData) {
      renderCardDatabase(window.filteredCardsData);
    }
  } catch (error) {
    console.error('Error adding to wishlist:', error);
    showNotification('Error updating wishlist', 'error');
  }
}

// Remove from wishlist
async function removeFromWishlist(cardId) {
  const user = auth.currentUser;
  if (!user) return;
  
  try {
    await db.collection('users').doc(user.uid).set({
      wishlist: firebase.firestore.FieldValue.arrayRemove(cardId)
    }, { merge: true });
    
    window.userWishlist.delete(cardId);
    showNotification('Removed from wishlist', 'success');
    
    // Update wishlist display
    updateWishlistUI();
    
    // Re-render cards to update wishlist button
    if (typeof renderCardDatabase === 'function' && window.filteredCardsData) {
      renderCardDatabase(window.filteredCardsData);
    }
  } catch (error) {
    console.error('Error removing from wishlist:', error);
  }
}

// Toggle wishlist
async function toggleWishlist(cardId) {
  if (!window.userWishlist) {
    window.userWishlist = new Set();
  }
  
  if (window.userWishlist.has(cardId)) {
    await removeFromWishlist(cardId);
  } else {
    await addToWishlist(cardId);
  }
}

// Save current deck to My Decks
async function saveCurrentDeckToProfile(source) {
  const user = auth.currentUser;
  if (!user) {
    showNotification('Please sign in to save decks', 'error');
    showAuthModal('signin');
    return;
  }
  
  // Get deck data based on source
  let deck, archetype;
  if (source === 'cityLeague') {
    deck = window.cityLeagueDeck || {};
    archetype = window.currentCityLeagueArchetype;
  } else if (source === 'currentMeta') {
    deck = window.currentMetaDeck || {};
    archetype = window.currentCurrentMetaArchetype;
  } else if (source === 'pastMeta') {
    deck = window.pastMetaDeck || {};
    archetype = window.pastMetaCurrentArchetype;
  } else {
    showNotification('Invalid deck source', 'error');
    return;
  }
  
  // Check if deck is empty
  const totalCards = Object.values(deck).reduce((sum, count) => sum + count, 0);
  if (totalCards === 0) {
    showNotification('Cannot save empty deck', 'error');
    return;
  }
  
  // Ask for deck name
  const deckName = await showInputModal({ title: 'Save Deck', message: 'Enter a name for your deck:', defaultValue: archetype || 'My Deck' });
  if (!deckName || deckName.trim() === '') {
    return; // User cancelled
  }
  
  // Check for duplicate deck name
  const trimmedName = deckName.trim();
  if (window.userDecks && window.userDecks.some(d => d.name === trimmedName)) {
    const overwrite = confirm(`A deck named "${trimmedName}" already exists. Save anyway?`);
    if (!overwrite) return;
  }
  
  try {
    // Prepare deck data
    // Note: deck is saved with exact prints in format "CardName (SET NUMBER)", 
    // preserving the specific print versions selected by the user
    const deckData = {
      name: trimmedName,
      archetype: archetype || 'Custom',
      cards: deck, // Exact prints: "CardName (SET NUMBER)" format
      totalCards: totalCards,
      source: source,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    // Save to Firestore
    await db.collection('users').doc(user.uid)
      .collection('decks').add(deckData);
    
    showNotification(`Deck "${trimmedName}" saved successfully! 🎉`, 'success');
    
    // Reload user decks
    await loadUserDecks(user.uid);
  } catch (error) {
    console.error('Error saving deck:', error);
    showNotification('Error saving deck', 'error');
  }
}

// Save display name
async function saveDisplayName() {
  const user = auth.currentUser;
  if (!user) {
    showNotification('Please sign in to update your profile', 'error');
    return;
  }
  
  const nameInput = document.getElementById('settings-display-name');
  const displayName = nameInput.value.trim();
  
  if (!displayName) {
    showNotification('Please enter a name', 'error');
    return;
  }
  
  try {
    // Use set with merge to create document if it doesn't exist
    await db.collection('users').doc(user.uid).set({
      displayName: displayName,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    
    // Update local profile
    if (window.userProfile) {
      window.userProfile.displayName = displayName;
    }
    
    // Update UI
    const nameEl = document.getElementById('profile-user-name');
    if (nameEl) {
      nameEl.textContent = displayName;
    }
    
    showNotification('Name updated!', 'success');
  } catch (error) {
    console.error('Error updating name:', error);
    showNotification('Error updating name', 'error');
  }
}

// Save deck to cloud
async function saveDeck(deckData) {
  const user = auth.currentUser;
  if (!user) {
    showNotification('Please sign in to save decks', 'error');
    return;
  }
  
  try {
    const deckRef = db.collection('users').doc(user.uid).collection('decks');
    
    if (deckData.id) {
      // Update existing deck
      await deckRef.doc(deckData.id).update({
        ...deckData,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      showNotification('Deck updated!', 'success');
    } else {
      // Create new deck
      const newDeck = {
        ...deckData,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      const docRef = await deckRef.add(newDeck);
      deckData.id = docRef.id;
      showNotification('Deck saved!', 'success');
    }
    
    // Reload decks
    await loadUserDecks(user.uid);
  } catch (error) {
    console.error('Error saving deck:', error);
    showNotification('Error saving deck', 'error');
  }
}

// Delete deck
async function deleteDeck(deckId) {
  const user = auth.currentUser;
  if (!user) return;
  
  if (!confirm('Delete this deck?')) return;
  
  try {
    await db.collection('users').doc(user.uid)
      .collection('decks').doc(deckId).delete();
    
    showNotification('Deck deleted', 'success');
    await loadUserDecks(user.uid);
  } catch (error) {
    console.error('Error deleting deck:', error);
    showNotification('Error deleting deck', 'error');
  }
}

// Load deck from profile for comparison (removed old loadDeckFromProfile function)
async function loadSavedDeckForComparison(deckId) {
  if (!window.userDecks) {
    showNotification('No decks loaded', 'error');
    return null;
  }
  
  const deck = window.userDecks.find(d => d.id === deckId);
  if (!deck) {
    showNotification('Deck not found', 'error');
    return null;
  }
  
  // Return deck cards for comparison
  return deck.cards || {};
}

// Get collection statistics
function getCollectionStats() {
  const collection = window.userCollection || new Set();
  const allCards = window.allCardsDatabase || [];
  
  let totalValue = 0;
  let cardCount = collection.size;
  
  // Calculate total value based on actual card prices
  collection.forEach(cardId => {
    const [cardName, cardSet, cardNumber] = cardId.split('|');
    const card = allCards.find(c => 
      c.name === cardName && 
      c.set === cardSet && 
      c.number === cardNumber
    );
    
    if (card && card.eur_price) {
      const price = parseFloat(card.eur_price.replace(',', '.'));
      if (!isNaN(price)) {
        totalValue += price;
      }
    }
  });
  
  return {
    cardCount,
    totalValue,
    uniqueCards: cardCount
  };
}

// Update card UI to show ownership status
function updateCardUI(cardId) {
  const elements = document.querySelectorAll(`[data-card-id="${cardId}"]`);
  const isOwned = window.userCollection.has(cardId);
  
  elements.forEach(el => {
    if (isOwned) {
      el.classList.add('card-owned');
      el.classList.remove('card-not-owned');
    } else {
      el.classList.add('card-not-owned');
      el.classList.remove('card-owned');
    }
  });
}

// Update collection UI
function updateCollectionUI(searchFilter = '') {
  // Update all card elements
  if (window.userCollection) {
    window.userCollection.forEach(cardId => {
      updateCardUI(cardId);
    });
  }
  
  // Update collection grid in profile
  const collectionGrid = document.getElementById('collection-grid');
  if (collectionGrid && window.userCollection && window.userCollection.size > 0) {
    // Get all cards database
    const allCards = window.allCardsDatabase || [];
    
    // Build collection display
    const collectionHtml = [];
    let totalCards = 0;
    let matchingCards = 0;
    
    window.userCollection.forEach(cardId => {
      // cardId format: "Card Name|SET|NUMBER"
      const [cardName, cardSet, cardNumber] = cardId.split('|');
      
      // Find card in database
      const card = allCards.find(c => 
        c.name === cardName && 
        c.set === cardSet && 
        c.number === cardNumber
      );
      
      if (card && card.image_url) {
        totalCards++;
        
        // Apply search filter
        if (searchFilter) {
          const searchLower = searchFilter.toLowerCase();
          const matchesName = card.name.toLowerCase().includes(searchLower);
          const matchesSet = cardSet.toLowerCase().includes(searchLower);
          const matchesNumber = cardNumber.toLowerCase().includes(searchLower);
          
          if (!matchesName && !matchesSet && !matchesNumber) {
            return; // Skip this card
          }
        }
        
        matchingCards++;

        const safeNameHtml = escapeHtml(card.name);
        const safeSetHtml = escapeHtml(cardSet);
        const safeNumberHtml = escapeHtml(cardNumber);
        const safeImageAttr = escapeHtml(card.image_url);
        const safeImageJs = escapeJsSingleQuoted(card.image_url);
        const safeNameJs = escapeJsSingleQuoted(card.name);
        const safeCardIdJs = escapeJsSingleQuoted(cardId);
        
        const price = card.eur_price ? parseFloat(card.eur_price.replace(',', '.')) : 0;
        const priceDisplay = (!isNaN(price) && price > 0) ? `${price.toFixed(2).replace('.', ',')} €` : 'N/A';
        
        const ownedCount = window.userCollectionCounts ? (window.userCollectionCounts.get(cardId) || 1) : 1;
        
        collectionHtml.push(`
          <div style="position: relative; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); transition: transform 0.2s;" onmouseover="this.style.transform='translateY(-4px)'" onmouseout="this.style.transform=''">
            <img src="${safeImageAttr}" alt="${safeNameHtml}" style="width: 100%; display: block; cursor: pointer;" onclick="showImageView('${safeImageJs}', '${safeNameJs}')">
            <div style="position: absolute; top: 5px; left: 5px; background: #4CAF50; color: white; min-width: 25px; height: 25px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.3); padding: 0 4px;" title="${ownedCount}x owned">${ownedCount}x</div>
            <div style="position: absolute; top: 5px; right: 5px; display: flex; gap: 4px;">
              <button onclick="addToCollection('${safeCardIdJs}')" style="background: #27ae60; color: white; border: none; width: 26px; height: 26px; border-radius: 50%; cursor: pointer; font-size: 16px; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;" title="Add copy (${ownedCount}/4)">+</button>
              <button onclick="removeFromCollection('${safeCardIdJs}')" style="background: #e74c3c; color: white; border: none; width: 26px; height: 26px; border-radius: 50%; cursor: pointer; font-size: 16px; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;" title="Remove copy">−</button>
            </div>
            <div style="padding: 8px; background: white;">
              <div style="font-size: 0.85em; font-weight: 600; margin-bottom: 4px;">${safeNameHtml}</div>
              <div style="font-size: 0.75em; color: #666;">${safeSetHtml} ${safeNumberHtml}</div>
              <div style="font-size: 0.8em; color: #27ae60; font-weight: 600; margin-top: 4px;">💰 ${priceDisplay}</div>
            </div>
          </div>
        `);
      }
    });
    
    // Update search results display
    const searchResults = document.getElementById('collection-search-results');
    if (searchResults && searchFilter) {
      searchResults.textContent = `Showing ${matchingCards} of ${totalCards} cards`;
    } else if (searchResults) {
      searchResults.textContent = '';
    }
    
    if (collectionHtml.length > 0) {
      collectionGrid.innerHTML = collectionHtml.join('');
    } else if (searchFilter) {
      collectionGrid.innerHTML = '<p style="color: #999;">No cards found matching your search.</p>';
    } else {
      collectionGrid.innerHTML = '<p style="color: #999;">No cards in collection yet. Start adding cards by clicking the "+" button on card images!</p>';
    }
  } else if (collectionGrid) {
    collectionGrid.innerHTML = '<p style="color: #999;">No cards in collection yet. Start adding cards by clicking the "+" button on card images!</p>';
  }

  // Update tab counter
  const tabCount = document.getElementById('tab-count-collection');
  if (tabCount) {
    const n = window.userCollection ? window.userCollection.size : 0;
    tabCount.textContent = n > 0 ? `(${n})` : '';
  }
  
  // Update stats
  const stats = getCollectionStats();
  const statsEl = document.getElementById('collection-stats');
  if (statsEl) {
    statsEl.innerHTML = `
      <div class="stat-item">
        <span class="stat-value">${stats.cardCount}</span>
        <span class="stat-label">Cards Owned</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">${stats.totalValue.toFixed(2)}€</span>
        <span class="stat-label">Collection Value</span>
      </div>
    `;
  }
}

// Update wishlist UI
function updateWishlistUI(searchFilter = '', setFilter = '') {
  const wishlistGrid = document.getElementById('wishlist-grid');
  if (!wishlistGrid) return;

  // Update tab counter (always reflects total size)
  const tabCount = document.getElementById('tab-count-wishlist');
  if (tabCount) {
    const n = window.userWishlist ? window.userWishlist.size : 0;
    tabCount.textContent = n > 0 ? `(${n})` : '';
  }

  if (!window.userWishlist || window.userWishlist.size === 0) {
    wishlistGrid.innerHTML = '<p style="color: #999;">No cards in wishlist yet</p>';
    const searchResults = document.getElementById('wishlist-search-results');
    if (searchResults) searchResults.textContent = '';
    return;
  }

  const allCards = window.allCardsDatabase || [];

  // Populate set dropdown from current wishlist cards (once per call)
  const setDropdown = document.getElementById('wishlist-set-filter');
  if (setDropdown) {
    const setsInWishlist = new Set();
    window.userWishlist.forEach(cardId => {
      const [, cardSet] = cardId.split('|');
      if (cardSet) setsInWishlist.add(cardSet);
    });
    const currentVal = setDropdown.value;
    setDropdown.innerHTML = '<option value="">📦 All Sets</option>';
    [...setsInWishlist].sort().forEach(s => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      if (s === currentVal) opt.selected = true;
      setDropdown.appendChild(opt);
    });
  }

  const wishlistHtml = [];
  let totalCards = 0;
  let matchingCards = 0;

  window.userWishlist.forEach(cardId => {
    const [cardName, cardSet, cardNumber] = cardId.split('|');

    const card = allCards.find(c =>
      c.name === cardName &&
      c.set === cardSet &&
      c.number === cardNumber
    );

    if (card && card.image_url) {
      totalCards++;

      // Apply set filter
      if (setFilter && cardSet !== setFilter) return;

      // Apply search filter
      if (searchFilter) {
        const searchLower = searchFilter.toLowerCase();
        if (!card.name.toLowerCase().includes(searchLower) &&
            !cardSet.toLowerCase().includes(searchLower) &&
            !cardNumber.toLowerCase().includes(searchLower)) return;
      }

      matchingCards++;

      const safeNameHtml = escapeHtml(card.name);
      const safeSetHtml = escapeHtml(cardSet);
      const safeNumberHtml = escapeHtml(cardNumber);
      const safeImageAttr = escapeHtml(card.image_url);
      const safeImageJs = escapeJsSingleQuoted(card.image_url);
      const safeNameJs = escapeJsSingleQuoted(card.name);
      const safeCardIdJs = escapeJsSingleQuoted(cardId);

      const price = card.eur_price ? parseFloat(card.eur_price.replace(',', '.')) : 0;
      const priceDisplay = (!isNaN(price) && price > 0) ? `${price.toFixed(2).replace('.', ',')} €` : 'N/A';

      wishlistHtml.push(`
        <div style="position: relative; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); transition: transform 0.2s;" onmouseover="this.style.transform='translateY(-4px)'" onmouseout="this.style.transform=''">
          <img src="${safeImageAttr}" alt="${safeNameHtml}" style="width: 100%; display: block; cursor: pointer;" onclick="showImageView('${safeImageJs}', '${safeNameJs}')">
          <button onclick="removeFromWishlist('${safeCardIdJs}')" style="position: absolute; top: 5px; right: 5px; background: #e74c3c; color: white; border: none; width: 30px; height: 30px; border-radius: 50%; cursor: pointer; font-size: 14px; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.3);" title="Remove from wishlist">
            ×
          </button>
          <div style="padding: 8px; background: white;">
            <div style="font-size: 0.85em; font-weight: 600; margin-bottom: 4px;">${safeNameHtml}</div>
            <div style="font-size: 0.75em; color: #666;">${safeSetHtml} ${safeNumberHtml}</div>
            <div style="font-size: 0.8em; color: #27ae60; font-weight: 600; margin-top: 4px;">💰 ${priceDisplay}</div>
          </div>
        </div>
      `);
    }
  });

  // Update search results info
  const searchResults = document.getElementById('wishlist-search-results');
  if (searchResults) {
    const isFiltered = searchFilter || setFilter;
    searchResults.textContent = isFiltered ? `Showing ${matchingCards} of ${totalCards} cards` : '';
  }

  if (wishlistHtml.length > 0) {
    wishlistGrid.innerHTML = wishlistHtml.join('');
  } else if (searchFilter || setFilter) {
    wishlistGrid.innerHTML = '<p style="color: #999;">No cards found matching your filters.</p>';
  } else {
    wishlistGrid.innerHTML = '<p style="color: #999;">No cards in wishlist yet</p>';
  }
}

// Update profile UI
function updateProfileUI(profile) {
  // Update profile name
  const nameEl = document.getElementById('profile-user-name');
  if (nameEl) {
    nameEl.textContent = profile.displayName || 'Anonymous';
  }
  
  // Update settings input
  const nameInput = document.getElementById('settings-display-name');
  if (nameInput) {
    nameInput.value = profile.displayName || '';
  }
  
  // Calculate collection stats
  const stats = getCollectionStats();
  
  // Update collection stats
  const cardsCount = document.getElementById('profile-cards-count');
  if (cardsCount) {
    cardsCount.textContent = stats.cardCount;
  }
  
  const collectionValue = document.getElementById('profile-collection-value');
  if (collectionValue) {
    collectionValue.textContent = `${stats.totalValue.toFixed(2)}€`;
  }
  
  const decksCount = document.getElementById('profile-decks-count');
  if (decksCount) {
    decksCount.textContent = window.userDecks?.length || 0;
  }
  
  const profileEl = document.getElementById('user-profile-data');
  if (profileEl) {
    profileEl.innerHTML = `
      <div class="profile-info">
        <p><strong>Email:</strong> ${auth.currentUser?.email || ''}</p>
        <p><strong>Member since:</strong> ${formatDate(profile.createdAt)}</p>
        <p><strong>Cards:</strong> ${stats.cardCount}</p>
        <p><strong>Decks:</strong> ${window.userDecks?.length || 0}</p>
      </div>
    `;
  }
}

// Update decks UI
function updateDecksUI() {
  const decksGrid = document.getElementById('decks-grid');
  if (!decksGrid) return;
  
  // Update deck count
  const decksCount = document.getElementById('profile-decks-count');
  if (decksCount) {
    decksCount.textContent = window.userDecks?.length || 0;
  }
  
  // Update tab counter
  const tabCountDecks = document.getElementById('tab-count-decks');
  if (tabCountDecks) {
    const n = window.userDecks ? window.userDecks.length : 0;
    tabCountDecks.textContent = n > 0 ? `(${n})` : '';
  }

  if (!window.userDecks || window.userDecks.length === 0) {
    decksGrid.innerHTML = '<p style="color: #999;">No saved decks yet. Build a deck and save it to see it here!</p>';
    return;
  }
  
  // Check if card database is loaded
  if (!window.allCardsDatabase || window.allCardsDatabase.length === 0) {
    console.warn('[updateDecksUI] Card database not loaded yet. Showing decks without card images.');
    decksGrid.innerHTML = `
      <div style="background: #fff8dc; border: 2px solid #ffc107; border-radius: 8px; padding: 15px; margin-bottom: 15px;">
        <p style="margin: 0; color: #856404;">⏳ Loading card database... Deck cards will appear once loaded.</p>
      </div>
      ${window.userDecks.map(deck => {
        const totalCards = deck.totalCards || Object.values(deck.cards || {}).reduce((sum, count) => sum + count, 0);
        const uniqueCards = Object.keys(deck.cards || {}).length;
        const safeDeckNameHtml = escapeHtml(deck.name || '');
        const safeArchetypeHtml = escapeHtml(deck.archetype || 'Custom');
        const safeDeckIdJs = escapeJsSingleQuoted(deck.id || '');
        return `
          <div style="background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); margin-bottom: 10px;">
            <h3 style="margin: 0 0 10px 0; color: #2c3e50; font-size: 1.2em;">${safeDeckNameHtml}</h3>
            <p style="color: #7f8c8d; margin: 5px 0; font-size: 0.9em;">
              <strong>Archetype:</strong> ${safeArchetypeHtml}
            </p>
            <p style="color: #34495e; margin: 10px 0; font-weight: 600;">
              🎴 ${totalCards} Cards (${uniqueCards} Unique)
            </p>
            <button onclick="deleteDeck('${safeDeckIdJs}')" style="padding: 10px 20px; background: #e74c3c; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
              🗑️ Delete
            </button>
          </div>
        `;
      }).join('')}
    `;
    return;
  }
  
  console.log('[updateDecksUI] Building deck list with', window.userDecks.length, 'decks');
  
  decksGrid.innerHTML = window.userDecks.map((deck, deckIndex) => {
    const totalCards = deck.totalCards || Object.values(deck.cards || {}).reduce((sum, count) => sum + count, 0);
    const uniqueCards = Object.keys(deck.cards || {}).length;
    const deckId = `saved-deck-${deckIndex}`;
    const safeDeckNameHtml = escapeHtml(deck.name || '');
    const safeDeckArchetypeHtml = escapeHtml(deck.archetype || 'Custom');
    const safeDeckDeleteIdJs = escapeJsSingleQuoted(deck.id || '');
    
    // Build card grid HTML - same logic as renderMyDeckGrid
    let cardsHtml = '';
    if (deck.cards && Object.keys(deck.cards).length > 0) {
      const deckCards = [];
      
      // Process each card in the deck
      for (const [deckKey, count] of Object.entries(deck.cards)) {
        if (count <= 0) continue;
        
        let cardData = null;
        let setCode = '';
        let setNumber = '';
        let cardName = deckKey;
        
        // Parse "CardName (SET NUMBER)" format - EXACT print saved in deck
        const setMatch = deckKey.match(/^(.+?)\s+\(([A-Z0-9]+)\s+([A-Z0-9]+)\)$/);
        if (setMatch) {
          cardName = setMatch[1];
          setCode = setMatch[2];
          setNumber = setMatch[3];
          
          // METHOD 1: Fast lookup using cardsBySetNumberMap (preferred)
          if (window.cardsBySetNumberMap) {
            const key = `${setCode}-${setNumber}`;
            cardData = window.cardsBySetNumberMap[key];
          }
          
          // METHOD 2: Fallback - search allCardsDatabase by set+number (still exact print!)
          if (!cardData && window.allCardsDatabase) {
            cardData = window.allCardsDatabase.find(c => 
              c.set === setCode && c.number === setNumber
            );
          }
          
          // METHOD 3: Last resort - search by name only (loses exact print info)
          if (!cardData && window.allCardsDatabase) {
            console.warn(`[My Decks] Could not find exact print ${deckKey}, using any print of ${cardName}`);
            cardData = window.allCardsDatabase.find(c => c.name === cardName);
          }
        } else {
          // Legacy format without set info - try name lookup
          console.warn(`[My Decks] Old deck format detected: ${deckKey}`);
          if (window.allCardsDatabase) {
            cardData = window.allCardsDatabase.find(c => c.name === cardName);
            if (cardData) {
              setCode = cardData.set;
              setNumber = cardData.number;
            }
          }
        }
        
        if (cardData) {
          deckCards.push({
            ...cardData,
            deck_count: count,
            deck_key: deckKey,
            card_name: cardData.name,
            // IMPORTANT: Use set/number from deck_key (exact print saved), not from cardData fallback
            set_code: setCode || cardData.set,
            set_number: setNumber || cardData.number,
            set: setCode || cardData.set,
            number: setNumber || cardData.number
          });
        } else {
          console.error(`[My Decks] Failed to load card: ${deckKey} - not found in database`);
        }
      }
      
      // Debug: Log card types to find Energy sorting issue
      console.log('[My Decks] Card types in deck:');
      deckCards.forEach(card => {
        const cardType = card.type || card.card_type || '';
        const category = getCardTypeCategory(cardType);
        if (category === 'Energy' || cardType.toLowerCase().includes('energy')) {
          console.log(`  ${card.name}: type="${cardType}" → category="${category}"`);
        }
      });
      
      // Sort cards by type (same as Deck Builder)
      const sortedCards = sortCardsByTypeSimple(deckCards);
      
      // Build HTML for each card
      sortedCards.forEach(card => {
        const setCode = card.set_code || card.set;
        const setNumber = card.set_number || card.number;
        const count = card.deck_count || 1;
        const cardName = card.card_name || card.name;
        const safeCardNameHtml = escapeHtml(cardName);
        const safeCardNameJs = escapeJsSingleQuoted(cardName);
        
        // Get image URL
        let imageUrl = card.image_url || '';
        if (!imageUrl && setCode && setNumber && typeof buildCardImageUrl === 'function') {
          imageUrl = buildCardImageUrl(setCode, setNumber, card.rarity || 'C');
        }
        if (!imageUrl) {
          imageUrl = `https://via.placeholder.com/245x342/667eea/ffffff?text=${encodeURIComponent(cardName)}`;
        }
        const safeImageAttr = escapeHtml(imageUrl);
        const safeImageJs = escapeJsSingleQuoted(imageUrl);
        const fallbackImageUrl = `https://via.placeholder.com/245x342/667eea/ffffff?text=${encodeURIComponent(cardName)}`;
        const safeFallbackImageAttr = escapeHtml(fallbackImageUrl);
        
        // Check if owned — with count + color badge
        const cardId = `${cardName}|${setCode}|${setNumber}`;
        const ownedCount = window.userCollectionCounts ? (window.userCollectionCounts.get(cardId) || 0) : 0;
        const isOwned = ownedCount > 0;
        const isWishlisted = window.userWishlist && window.userWishlist.has(cardId);
        
        // Color-coded ownership badge for My Decks
        // Green: have enough (owned >= needed in deck)
        // Orange: have some but less than needed
        // Yellow: don't own this exact print but own other intl prints of same card
        let badgeBg = '';
        let badgeText = '';
        let badgeTitle = '';
        if (ownedCount >= count) {
          badgeBg = '#4CAF50'; // green — enough
          badgeText = `${ownedCount}`;
          badgeTitle = `Owned: ${ownedCount}/${count} (enough!)`;
        } else if (ownedCount > 0) {
          badgeBg = '#FF9800'; // orange — some but not enough
          badgeText = `${ownedCount}`;
          badgeTitle = `Owned: ${ownedCount}/${count} (need ${count - ownedCount} more)`;
        } else {
          // Check if user owns other international prints of this card
          let altPrintCount = 0;
          if (window.userCollectionCounts && window.allCardsDatabase) {
            const altVersions = window.allCardsDatabase.filter(c => c.name === cardName && (c.set !== setCode || c.number !== setNumber));
            altVersions.forEach(v => {
              const altId = `${cardName}|${v.set}|${v.number}`;
              altPrintCount += window.userCollectionCounts.get(altId) || 0;
            });
          }
          if (altPrintCount > 0) {
            badgeBg = '#FFD600'; // yellow — have other prints
            badgeText = `${altPrintCount}`;
            badgeTitle = `Other prints owned: ${altPrintCount} (not this exact print)`;
          }
        }
        const ownedBadge = badgeBg ?
          `<div style="position: absolute; top: 5px; left: 5px; background: ${badgeBg}; color: ${badgeBg === '#FFD600' ? '#333' : 'white'}; min-width: 25px; height: 25px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.5); z-index: 4; padding: 0 4px;" title="${badgeTitle}">${badgeText}</div>` : '';
        
        // Get price
        const eurPrice = card.eur_price || '';
        const priceDisplay = eurPrice || '0,00 €';
        const safePriceDisplayHtml = escapeHtml(priceDisplay);
        const priceBackground = eurPrice ? 'linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)' : 'linear-gradient(135deg, #777 0%, #999 100%)';
        const cardmarketUrl = card.cardmarket_url || '';
        const safeCardmarketUrlJs = escapeJsSingleQuoted(cardmarketUrl);
        const safeCardIdJs = escapeJsSingleQuoted(cardId);
        const safeCardmarketTitleHtml = escapeHtml(eurPrice ? 'Buy on Cardmarket: ' + eurPrice : 'Price not available');
        
        cardsHtml += `
          <div style="position: relative; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            <img src="${safeImageAttr}" alt="${safeCardNameHtml}" style="width: 100%; display: block; cursor: zoom-in;" loading="lazy" 
                 onerror="this.src='${safeFallbackImageAttr}'"
                 onclick="showSingleCard('${safeImageJs}', '${safeCardNameJs}')">
            
            ${ownedBadge}
            
            <div style="position: absolute; top: 5px; right: 5px; background: rgba(0,0,0,0.75); color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.5); z-index: 3;">${count}</div>
            
            <div style="position: absolute; bottom: 5px; left: 5px; right: 5px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 2px; z-index: 3;">
                  <button onclick="event.stopPropagation(); openRaritySwitcher('${safeCardNameJs}', '${safeCardNameJs}')" 
                      style="background: #ffc107; color: #333; border: none; border-radius: 3px; height: 22px; cursor: pointer; font-size: 11px; font-weight: bold; display: flex; align-items: center; justify-content: center; padding: 0;" 
                      title="Switch rarity/print">★</button>
                  <button onclick="event.stopPropagation(); openCardmarket('${safeCardmarketUrlJs}', '${safeCardNameJs}')" 
                      style="background: ${priceBackground}; color: white; height: 22px; border: none; border-radius: 3px; cursor: ${eurPrice ? 'pointer' : 'not-allowed'}; font-size: 8px; font-weight: bold; padding: 0 2px; display: flex; align-items: center; justify-content: center; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);" 
                    title="${safeCardmarketTitleHtml}">${safePriceDisplayHtml}</button>
                  <button onclick="event.stopPropagation(); toggleCollection('${safeCardIdJs}')" 
                      style="background: ${isOwned ? '#27ae60' : '#95a5a6'}; color: white; border: none; border-radius: 3px; height: 22px; cursor: pointer; font-weight: bold; font-size: ${ownedCount > 0 ? '10' : '13'}px; display: flex; align-items: center; justify-content: center; padding: 0;" 
                      title="Add to collection (${ownedCount}/4)">${ownedCount > 0 ? ownedCount + '/4' : '+'}</button>
                  <button onclick="event.stopPropagation(); toggleWishlist('${safeCardIdJs}')" 
                      style="background: ${isWishlisted ? '#E91E63' : '#bdc3c7'}; color: white; border: none; border-radius: 3px; height: 22px; cursor: pointer; font-weight: bold; font-size: 12px; display: flex; align-items: center; justify-content: center; padding: 0;" 
                      title="${isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}">❤</button>
            </div>
          </div>
        `;
      });
    }
    const safeFolderHtml = escapeHtml(deck.folder || '');
    const createdStr = formatDate(deck.createdAt);
    const safeCreatedHtml = escapeHtml(createdStr);
    
    return `
      <div class="saved-deck-item" data-deck-name="${safeDeckNameHtml}" data-deck-archetype="${safeDeckArchetypeHtml}" data-deck-folder="${safeFolderHtml}" style="background: white; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); overflow: hidden; margin-bottom: 10px;">
        <div onclick="toggleDeckCollapse('${deckId}')" style="padding: 15px 20px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; transition: opacity 0.2s;" onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
          <div style="flex: 1;">
            <h3 style="margin: 0 0 3px 0; font-size: 1.1em; font-weight: 600;">${safeDeckNameHtml}</h3>
            <div style="font-size: 0.85em; opacity: 0.9;">
              ${safeDeckArchetypeHtml} • ${totalCards} Cards (${uniqueCards} Unique)
            </div>
            <div style="font-size: 0.75em; opacity: 0.7; margin-top: 2px;">
              ${deck.folder ? '📁 ' + safeFolderHtml + ' • ' : ''}🕐 ${safeCreatedHtml}
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button onclick="event.stopPropagation(); openCompareSavedDeck(${deckIndex})" style="padding: 6px 12px; background: rgba(155, 89, 182, 0.9); color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: 600; font-size: 0.9em; transition: all 0.2s;" onmouseover="this.style.background='#8e44ad'" onmouseout="this.style.background='rgba(155, 89, 182, 0.9)'" title="Compare with another deck">
              ⚖️
            </button>
            <button onclick="event.stopPropagation(); moveDeckToFolder(${deckIndex})" style="padding: 6px 12px; background: rgba(241, 196, 15, 0.9); color: #333; border: none; border-radius: 5px; cursor: pointer; font-weight: 600; font-size: 0.9em; transition: all 0.2s;" onmouseover="this.style.background='#f39c12'" onmouseout="this.style.background='rgba(241, 196, 15, 0.9)'" title="Move to folder">
              📁
            </button>
            <button onclick="event.stopPropagation(); copyMyDeck(${deckIndex})" style="padding: 6px 12px; background: rgba(52, 152, 219, 0.9); color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: 600; font-size: 0.9em; transition: all 0.2s;" onmouseover="this.style.background='#2980b9'" onmouseout="this.style.background='rgba(52, 152, 219, 0.9)'" title="Copy deck list">
              📋
            </button>
            <button onclick="event.stopPropagation(); deleteDeck('${safeDeckDeleteIdJs}')" style="padding: 6px 12px; background: rgba(231, 76, 60, 0.9); color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: 600; font-size: 0.9em; transition: all 0.2s;" onmouseover="this.style.background='#c0392b'" onmouseout="this.style.background='rgba(231, 76, 60, 0.9)'" title="Delete deck">
              🗑️
            </button>
            <div id="${deckId}-arrow" style="font-size: 1.5em; transition: transform 0.3s; transform: rotate(0deg);">▼</div>
          </div>
        </div>
        <div id="${deckId}" style="display: none; padding: 15px; background: #f8f9fa;">
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px;">
            ${cardsHtml || '<p style="color: #999; padding: 20px; text-align: center;">No cards found</p>'}
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  // Render folder navigation if any folders exist
  renderFolderNav();
}

// Open modal to pick 2 decks for playtest
function openMyDecksPlaytest() {
  const modal = document.getElementById('myDecksPlaytestModal');
  if (!modal) return;
  const decks = window.userDecks || [];
  if (decks.length === 0) {
    if (typeof showNotification === 'function') {
      showNotification('No saved decks yet.', 'error');
    } else {
      showToast('No saved decks yet!', 'warning');
    }
    return;
  }
  ['myDeckSelectP1', 'myDeckSelectP2'].forEach((selId, idx) => {
    const sel = document.getElementById(selId);
    if (!sel) return;
    sel.innerHTML = decks.map((d, i) => `<option value="${i}">${escapeHtml(d.name || 'Deck ' + (i + 1))}</option>`).join('');
    if (idx === 1 && decks.length > 1) sel.value = '1';
  });
  modal.style.display = 'flex';
}

function closeMyDecksPlaytest() {
  const modal = document.getElementById('myDecksPlaytestModal');
  if (modal) modal.style.display = 'none';
}

async function startMyDecksPlaytest() {
  const p1Idx = parseInt(document.getElementById('myDeckSelectP1').value);
  const p2Idx = parseInt(document.getElementById('myDeckSelectP2').value);
  const deck1 = window.userDecks && window.userDecks[p1Idx];
  const deck2 = window.userDecks && window.userDecks[p2Idx];
  if (!deck1 || !deck1.cards) {
    if (typeof showNotification === 'function') {
      showNotification('Could not load Player 1 deck.', 'error');
    } else {
      showToast('Could not load Player 1 deck!', 'error');
    }
    return;
  }
  if (!deck2 || !deck2.cards) {
    if (typeof showNotification === 'function') {
      showNotification('Could not load Player 2 deck.', 'error');
    } else {
      showToast('Could not load Player 2 deck!', 'error');
    }
    return;
  }

  if (typeof standaloneDecks === 'undefined' && typeof window.ensurePlaytesterScriptsLoaded === 'function') {
    try {
      await window.ensurePlaytesterScriptsLoaded({ notify: true });
    } catch (error) {
      console.error('[My Decks Playtest] Failed to load playtester scripts:', error);
    }
  }

  if (typeof standaloneDecks === 'undefined') {
    if (typeof showNotification === 'function') {
      showNotification('Playtester could not be loaded.', 'error');
    } else {
      showToast('Playtester not loaded yet!', 'error');
    }
    return;
  }

  // Regex handles all number formats: 183, TG01, GG01, 001/198, PA-01, etc.
  const keyRx = /^(.+?)\s+\(([A-Z0-9-]+)\s+([A-Z0-9/a-z-]+)\)$/;
  const backUrl = typeof CARD_BACK_URL !== 'undefined' ? CARD_BACK_URL : '';

  function buildDeck(deckObj) {
    const result = [];
    for (const [deckKey, count] of Object.entries(deckObj)) {
      if (!count || count <= 0) continue;
      let cardName = deckKey, imageUrl = backUrl, cardType = '', setCode = '', number = '';
      const m = deckKey.match(keyRx);
      if (m) {
        cardName = m[1]; setCode = m[2]; number = m[3];
        // Direct exact-print lookup — same as _simFindCard in draw-simulator.js
        let cd = null;
        if (window.cardsBySetNumberMap) cd = window.cardsBySetNumberMap[`${setCode}-${number}`] || null;
        if (!cd && window.allCardsDatabase) cd = window.allCardsDatabase.find(c => c.set === setCode && c.number === number) || null;
        if (!cd && window.allCardsDatabase) cd = window.allCardsDatabase.find(c => c.name === cardName) || null;
        if (cd) { imageUrl = cd.image_url || backUrl; cardType = cd.card_type || cd.type || ''; }
      } else {
        const cd = window.allCardsDatabase && window.allCardsDatabase.find(c => c.name === cardName);
        if (cd) { imageUrl = cd.image_url || backUrl; cardType = cd.card_type || cd.type || ''; setCode = cd.set || ''; number = cd.number || ''; }
      }
      result.push({ name: cardName, imageUrl, cardType, setCode, number, count });
    }
    return result;
  }

  standaloneDecks.p1 = buildDeck(deck1.cards);
  standaloneDecks.p2 = buildDeck(deck2.cards);

  closeMyDecksPlaytest();
  if (typeof startStandalonePlaytester === 'function') startStandalonePlaytester();
}

// Copy a saved deck to clipboard in Pokémon TCG Live format
function copyMyDeck(deckIndex) {
  const deck = window.userDecks && window.userDecks[deckIndex];
  if (!deck || !deck.cards) {
    showToast('Deck not found!', 'error');
    return;
  }

  const pokemon = [];
  const trainer = [];
  const energy = [];

  for (const [deckKey, count] of Object.entries(deck.cards)) {
    if (!count || count <= 0) continue;

    // Parse "CardName (SET NUMBER)" or just "CardName"
    const setMatch = deckKey.match(/^(.+?)\s+\(([A-Z0-9]+)\s+([A-Z0-9]+)\)$/);
    let cardName = deckKey;
    let setCode = '';
    let setNumber = '';

    if (setMatch) {
      cardName = setMatch[1];
      setCode = setMatch[2];
      setNumber = setMatch[3];
    } else {
      // Fallback: look up set info from database
      const cardData = window.allCardsDatabase && window.allCardsDatabase.find(c => c.name === cardName);
      if (cardData) {
        setCode = cardData.set || '';
        setNumber = cardData.number || '';
      }
    }

    const line = setCode && setNumber
      ? `${count} ${cardName} ${setCode} ${setNumber}`
      : `${count} ${cardName}`;

    // Determine category by looking up type in allCardsDatabase
    let category = 'trainer';
    const cardData = window.allCardsDatabase && (
      (setCode && setNumber)
        ? window.allCardsDatabase.find(c => c.name === cardName && c.set === setCode && c.number === setNumber)
        : window.allCardsDatabase.find(c => c.name === cardName)
    );

    if (cardData) {
      const cat = getCardTypeCategory(cardData.type || '');
      if (cat === 'Pokemon') category = 'pokemon';
      else if (cat === 'Energy' || cat === 'Special Energy') category = 'energy';
    } else {
      // Heuristic: basic energies by name
      if (/Energy$/.test(cardName)) category = 'energy';
    }

    if (category === 'pokemon') pokemon.push(line);
    else if (category === 'energy') energy.push(line);
    else trainer.push(line);
  }

  let output = '';
  if (pokemon.length > 0) output += `Pokémon: ${pokemon.length}\n${pokemon.join('\n')}\n\n`;
  if (trainer.length > 0) output += `Trainer: ${trainer.length}\n${trainer.join('\n')}\n\n`;
  if (energy.length > 0) output += `Energy: ${energy.length}\n${energy.join('\n')}`;
  output = output.trim();

  navigator.clipboard.writeText(output).then(() => {
    showToast('Deck copied to clipboard!', 'success');
  }).catch(() => {
    showToast('Error copying to clipboard!', 'error');
  });
}

// Helper: Card type sorting (same as Deck Builder)
function getCardTypeCategory(cardType) {
  /**
   * Determines the category of a card based on the type field
   * type format: "GBasic", "WBasic", "PStage1", "PStage2", "Supporter", "Item", "Tool", "Stadium", "Special Energy", "Energy"
   */
  if (!cardType) return 'Pokemon';
  
  // IMPORTANT FIX: Check for Energy BEFORE element letter check
  // This fixes "Basic Fighting Energy" being sorted as Pokemon instead of Energy
  const typeLower = cardType.toLowerCase();
  if (typeLower.includes('energy')) return 'Energy';
  if (cardType === 'Special Energy') return 'Special Energy';
  if (cardType === 'Energy') return 'Energy';
  
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

function sortCardsByTypeSimple(cards) {
  const elementOrder = {
    'G': 1, 'R': 2, 'W': 3, 'L': 4, 'P': 5, 'F': 6, 'D': 7, 'M': 8, 'N': 9, 'C': 10
  };
  
  const evolutionOrder = {
    'Basic': 1, 'Stage1': 2, 'Stage2': 3
  };
  
  const typeOrder = {
    'Pokemon': 1,
    'Supporter': 2,
    'Item': 3,
    'Tool': 4,
    'Stadium': 5,
    'Special Energy': 6,
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
    
    // For Pokemon: sort by element first, then by percentage
    if (categoryA === 'Pokemon' && categoryB === 'Pokemon') {
      const elementA = cardTypeA.charAt(0);
      const elementB = cardTypeB.charAt(0);
      
      const elemOrderA = elementOrder[elementA] || 99;
      const elemOrderB = elementOrder[elementB] || 99;
      
      // Different element: sort by element order
      if (elemOrderA !== elemOrderB) {
        return elemOrderA - elemOrderB;
      }
      
      // Same element: sort by percentage (highest first), then by set code/number
      const percA = parseFloat((a.percentage_in_archetype || '0').toString().replace(',', '.')) || 0;
      const percB = parseFloat((b.percentage_in_archetype || '0').toString().replace(',', '.')) || 0;
      
      if (percA !== percB) {
        return percB - percA;
      }
      
      const setCodeA = a.set || a.set_code || '';
      const setCodeB = b.set || b.set_code || '';
      
      if (setCodeA !== setCodeB) {
        return setCodeA.localeCompare(setCodeB);
      }
      
      const setNumA = parseInt(((a.number || a.set_number) || '0').toString().replace(/[^\d]/g, '')) || 0;
      const setNumB = parseInt(((b.number || b.set_number) || '0').toString().replace(/[^\d]/g, '')) || 0;
      if (setNumA !== setNumB) {
        return setNumA - setNumB;
      }
      
      const nameA = a.card_name || a.name || '';
      const nameB = b.card_name || b.name || '';
      return nameA.localeCompare(nameB);
    }
    
    // For non-Pokemon cards: Sort by PERCENTAGE (highest first), then set number, then name
    const percA = parseFloat((a.percentage_in_archetype || '0').toString().replace(',', '.')) || 0;
    const percB = parseFloat((b.percentage_in_archetype || '0').toString().replace(',', '.')) || 0;
    
    if (percA !== percB) {
      return percB - percA;
    }
    
    const setNumA = parseInt(((a.number || a.set_number) || '0').toString().replace(/[^\d]/g, '')) || 0;
    const setNumB = parseInt(((b.number || b.set_number) || '0').toString().replace(/[^\d]/g, '')) || 0;
    if (setNumA !== setNumB) {
      return setNumA - setNumB;
    }
    
    const nameA = a.card_name || a.name || '';
    const nameB = b.card_name || b.name || '';
    return nameA.localeCompare(nameB);
  });
}

// Toggle deck collapse
function toggleDeckCollapse(deckId) {
  const deckContent = document.getElementById(deckId);
  const arrow = document.getElementById(`${deckId}-arrow`);
  
  if (deckContent && arrow) {
    if (deckContent.style.display === 'none') {
      deckContent.style.display = 'block';
      arrow.style.transform = 'rotate(180deg)';
    } else {
      deckContent.style.display = 'none';
      arrow.style.transform = 'rotate(0deg)';
    }
  }
}

// Format date helper
function formatDate(timestamp) {
  if (!timestamp) return 'Unknown';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
}

// Switch profile tabs
function switchProfileTab(tabName) {
  // Hide all tabs
  document.querySelectorAll('.profile-tab-content').forEach(tab => {
    tab.style.display = 'none';
  });
  
  // Remove active class from all buttons
  document.querySelectorAll('.profile-tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // Show selected tab
  const selectedTab = document.getElementById('profile-' + tabName);
  if (selectedTab) {
    selectedTab.style.display = 'block';
  }
  
  // Add active class to selected button
  const activeBtn = document.querySelector(`.profile-tab-btn[onclick*="${tabName}"]`);
  if (activeBtn) {
    activeBtn.classList.add('active');
  }}
// Filter collection by search term
function filterCollection() {
  const searchInput = document.getElementById('collection-search');
  if (!searchInput) return;
  
  const searchTerm = searchInput.value.trim();
  updateCollectionUI(searchTerm);
}

// Filter wishlist by search term and/or set
function filterWishlist() {
  const searchInput = document.getElementById('wishlist-search');
  const setInput = document.getElementById('wishlist-set-filter');
  const searchTerm = searchInput ? searchInput.value.trim() : '';
  const setTerm = setInput ? setInput.value : '';
  updateWishlistUI(searchTerm, setTerm);
}

// ============================================================
// My Decks: Search / Filter
// ============================================================
function filterMyDecks() {
  const searchInput = document.getElementById('decks-search');
  if (!searchInput) return;
  const query = searchInput.value.trim().toLowerCase();
  
  document.querySelectorAll('.saved-deck-item').forEach(item => {
    const name = (item.dataset.deckName || '').toLowerCase();
    const archetype = (item.dataset.deckArchetype || '').toLowerCase();
    const folder = (item.dataset.deckFolder || '').toLowerCase();
    const matches = !query || name.includes(query) || archetype.includes(query) || folder.includes(query);
    item.style.display = matches ? '' : 'none';
  });
}

// ============================================================
// My Decks: Folders
// ============================================================
// Folder data stored as a field on each deck doc in Firestore
window.deckFolders = window.deckFolders || []; // derived from userDecks

function getDeckFolders() {
  if (!window.userDecks) return [];
  const folders = new Set();
  window.userDecks.forEach(d => { if (d.folder) folders.add(d.folder); });
  return Array.from(folders).sort();
}

async function createDeckFolder() {
  const name = await showInputModal({ title: 'Create Folder', message: 'Enter folder name:', placeholder: 'Folder name' });
  if (!name || !name.trim()) return;
  const trimmed = name.trim();
  const existing = getDeckFolders();
  if (existing.includes(trimmed)) {
    showNotification('Folder already exists', 'error');
    return;
  }
  showNotification(`Folder "${trimmed}" created. Use the 📁 button on a deck to move it.`, 'success');
  renderFolderNav();
}

async function moveDeckToFolder(deckIndex) {
  const deck = window.userDecks && window.userDecks[deckIndex];
  if (!deck) return;
  const user = auth.currentUser;
  if (!user) return;
  
  const folders = getDeckFolders();
  const options = ['(No Folder)', ...folders, '+ New Folder'];
  const choice = await showInputModal({
    title: 'Move to Folder',
    message: options.map((f, i) => `${i}: ${f}`).join('\n') + '\n\nEnter number:',
    defaultValue: deck.folder ? String(folders.indexOf(deck.folder) + 1) : '0'
  });
  if (choice === null) return;
  
  let folder = '';
  const idx = parseInt(choice);
  if (isNaN(idx) || idx < 0 || idx >= options.length) return;
  
  if (idx === 0) {
    folder = '';
  } else if (idx === options.length - 1) {
    const newFolder = await showInputModal({ title: 'New Folder', message: 'Enter folder name:', placeholder: 'Folder name' });
    if (!newFolder || !newFolder.trim()) return;
    folder = newFolder.trim();
  } else {
    folder = folders[idx - 1];
  }
  
  try {
    await db.collection('users').doc(user.uid)
      .collection('decks').doc(deck.id)
      .update({ folder: folder, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    
    deck.folder = folder;
    showNotification(folder ? `Moved to "${folder}"` : 'Removed from folder', 'success');
    updateDecksUI();
    renderFolderNav();
  } catch (error) {
    console.error('Error moving deck to folder:', error);
    showNotification('Error moving deck', 'error');
  }
}

function renderFolderNav() {
  const nav = document.getElementById('decks-folder-nav');
  if (!nav) return;
  const folders = getDeckFolders();
  if (folders.length === 0) {
    nav.style.display = 'none';
    return;
  }
  nav.style.display = 'flex';
  nav.innerHTML = `<button onclick="filterDecksByFolder('')" style="padding: 6px 14px; background: #667eea; color: white; border: none; border-radius: 20px; cursor: pointer; font-weight: 600; font-size: 0.85em;">All</button>` +
    folders.map(f => {
      const safe = escapeHtml(f);
      const safeJs = escapeJsSingleQuoted(f);
      return `<button onclick="filterDecksByFolder('${safeJs}')" style="padding: 6px 14px; background: #f0f0f0; color: #333; border: 1px solid #ddd; border-radius: 20px; cursor: pointer; font-weight: 600; font-size: 0.85em;">📁 ${safe}</button>`;
    }).join('');
}

function filterDecksByFolder(folder) {
  // Highlight active folder button
  const nav = document.getElementById('decks-folder-nav');
  if (nav) {
    nav.querySelectorAll('button').forEach((btn, i) => {
      if (i === 0 && !folder) {
        btn.style.background = '#667eea'; btn.style.color = 'white'; btn.style.border = 'none';
      } else if (btn.textContent.includes(folder) && folder) {
        btn.style.background = '#667eea'; btn.style.color = 'white'; btn.style.border = 'none';
      } else {
        btn.style.background = '#f0f0f0'; btn.style.color = '#333'; btn.style.border = '1px solid #ddd';
      }
    });
  }
  
  document.querySelectorAll('.saved-deck-item').forEach(item => {
    if (!folder) {
      item.style.display = '';
    } else {
      item.style.display = (item.dataset.deckFolder === folder) ? '' : 'none';
    }
  });
}

// ============================================================
// My Decks: Compare
// ============================================================
async function openCompareSavedDeck(deckIndex) {
  const baseDeck = window.userDecks && window.userDecks[deckIndex];
  if (!baseDeck) return;
  
  const decks = window.userDecks || [];
  if (decks.length < 2) {
    showNotification('Need at least 2 saved decks to compare', 'error');
    return;
  }
  
  const options = decks
    .map((d, i) => i !== deckIndex ? `${i}: ${d.name}` : null)
    .filter(Boolean);
  
  const choice = await showInputModal({
    title: 'Compare Decks',
    message: `Compare "${baseDeck.name}" with:\n${options.join('\n')}\n\nEnter deck number:`
  });
  if (choice === null) return;
  
  const compareIdx = parseInt(choice);
  if (isNaN(compareIdx) || compareIdx === deckIndex || !decks[compareIdx]) {
    showNotification('Invalid deck selection', 'error');
    return;
  }
  
  showDeckComparison(baseDeck, decks[compareIdx]);
}

function showDeckComparison(deckA, deckB) {
  const cardsA = deckA.cards || {};
  const cardsB = deckB.cards || {};
  const allCardKeys = new Set([...Object.keys(cardsA), ...Object.keys(cardsB)]);
  
  let onlyA = [], onlyB = [], different = [], same = [];
  
  allCardKeys.forEach(key => {
    const countA = cardsA[key] || 0;
    const countB = cardsB[key] || 0;
    const safeKey = escapeHtml(key);
    if (countA > 0 && countB === 0) {
      onlyA.push(`${safeKey} x${countA}`);
    } else if (countB > 0 && countA === 0) {
      onlyB.push(`${safeKey} x${countB}`);
    } else if (countA !== countB) {
      different.push(`${safeKey}: ${countA} → ${countB}`);
    } else {
      same.push(`${safeKey} x${countA}`);
    }
  });
  
  const safeNameA = escapeHtml(deckA.name);
  const safeNameB = escapeHtml(deckB.name);
  
  // Create comparison modal
  let existingModal = document.getElementById('deck-compare-modal');
  if (existingModal) existingModal.remove();
  
  const modal = document.createElement('div');
  modal.id = 'deck-compare-modal';
  modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  
  modal.innerHTML = `
    <div style="background:white;border-radius:12px;max-width:700px;width:100%;max-height:80vh;overflow-y:auto;padding:25px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;">
        <h2 style="margin:0;font-size:1.3em;">⚖️ Deck Comparison</h2>
        <button onclick="this.closest('#deck-compare-modal').remove()" style="background:none;border:none;font-size:24px;cursor:pointer;">✕</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:15px;margin-bottom:15px;">
        <div style="background:#667eea;color:white;padding:10px;border-radius:8px;text-align:center;font-weight:700;">${safeNameA}</div>
        <div style="background:#764ba2;color:white;padding:10px;border-radius:8px;text-align:center;font-weight:700;">${safeNameB}</div>
      </div>
      ${onlyA.length ? `<div style="margin-bottom:12px;"><h4 style="color:#667eea;margin:0 0 5px 0;">Only in ${safeNameA} (${onlyA.length})</h4><div style="font-size:0.9em;color:#555;">${onlyA.join('<br>')}</div></div>` : ''}
      ${onlyB.length ? `<div style="margin-bottom:12px;"><h4 style="color:#764ba2;margin:0 0 5px 0;">Only in ${safeNameB} (${onlyB.length})</h4><div style="font-size:0.9em;color:#555;">${onlyB.join('<br>')}</div></div>` : ''}
      ${different.length ? `<div style="margin-bottom:12px;"><h4 style="color:#e67e22;margin:0 0 5px 0;">Different counts (${different.length})</h4><div style="font-size:0.9em;color:#555;">${different.join('<br>')}</div></div>` : ''}
      <div style="margin-bottom:12px;"><h4 style="color:#27ae60;margin:0 0 5px 0;">Same cards (${same.length})</h4><div style="font-size:0.9em;color:#555;">${same.length > 0 ? same.join('<br>') : 'No cards in common'}</div></div>
    </div>
  `;
  
  document.body.appendChild(modal);
}
