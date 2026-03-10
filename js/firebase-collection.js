/**
 * User Collection Management
 * ==========================
 * Track owned cards, wishlist, and deck building
 */

// Add card to collection
async function addToCollection(cardId) {
  const user = auth.currentUser;
  if (!user) {
    showNotification('Please sign in to use this feature', 'error');
    return;
  }
  
  try {
    await db.collection('users').doc(user.uid).set({
      collection: firebase.firestore.FieldValue.arrayUnion(cardId)
    }, { merge: true });
    
    window.userCollection.add(cardId);
    updateCardUI(cardId);
    showNotification('Added to collection!', 'success');
    
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

// Remove card from collection
async function removeFromCollection(cardId) {
  const user = auth.currentUser;
  if (!user) return;
  
  try {
    await db.collection('users').doc(user.uid).set({
      collection: firebase.firestore.FieldValue.arrayRemove(cardId)
    }, { merge: true });
    
    window.userCollection.delete(cardId);
    updateCardUI(cardId);
    showNotification('Removed from collection', 'success');
    
    // Update collection display and stats
    updateCollectionUI();
    
    // Re-render cards to remove green checkmark
    if (typeof renderCardDatabase === 'function' && window.filteredCardsData) {
      renderCardDatabase(window.filteredCardsData);
    }
  } catch (error) {
    console.error('Error removing from collection:', error);
    showNotification('Error updating collection', 'error');
  }
}

// Toggle card in collection
async function toggleCollection(cardId) {
  if (window.userCollection.has(cardId)) {
    await removeFromCollection(cardId);
  } else {
    await addToCollection(cardId);
  }
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
  const deckName = prompt('Enter a name for your deck:', archetype || 'My Deck');
  if (!deckName || deckName.trim() === '') {
    return; // User cancelled
  }
  
  try {
    // Prepare deck data
    // Note: deck is saved with exact prints in format "CardName (SET NUMBER)", 
    // preserving the specific print versions selected by the user
    const deckData = {
      name: deckName.trim(),
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
    
    showNotification(`Deck "${deckName}" saved successfully! 🎉`, 'success');
    
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
function updateCollectionUI() {
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
        const price = card.eur_price ? parseFloat(card.eur_price.replace(',', '.')) : 0;
        const priceDisplay = (!isNaN(price) && price > 0) ? `${price.toFixed(2).replace('.', ',')} €` : 'N/A';
        
        collectionHtml.push(`
          <div style="position: relative; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); transition: transform 0.2s;" onmouseover="this.style.transform='translateY(-4px)'" onmouseout="this.style.transform=''">
            <img src="${card.image_url}" alt="${card.name}" style="width: 100%; display: block; cursor: pointer;" onclick="showImageView('${card.image_url}', '${card.name}')">
            <button onclick="removeFromCollection('${cardId}')" style="position: absolute; top: 5px; right: 5px; background: #e74c3c; color: white; border: none; width: 30px; height: 30px; border-radius: 50%; cursor: pointer; font-size: 14px; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.3);" title="Remove from collection">
              ×
            </button>
            <div style="padding: 8px; background: white;">
              <div style="font-size: 0.85em; font-weight: 600; margin-bottom: 4px;">${card.name}</div>
              <div style="font-size: 0.75em; color: #666;">${cardSet} ${cardNumber}</div>
              <div style="font-size: 0.8em; color: #27ae60; font-weight: 600; margin-top: 4px;">💰 ${priceDisplay}</div>
            </div>
          </div>
        `);
      }
    });
    
    if (collectionHtml.length > 0) {
      collectionGrid.innerHTML = collectionHtml.join('');
    } else {
      collectionGrid.innerHTML = '<p style="color: #999;">No cards in collection yet. Start adding cards by clicking the "+" button on card images!</p>';
    }
  } else if (collectionGrid) {
    collectionGrid.innerHTML = '<p style="color: #999;">No cards in collection yet. Start adding cards by clicking the "+" button on card images!</p>';
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
function updateWishlistUI() {
  const wishlistGrid = document.getElementById('wishlist-grid');
  if (!wishlistGrid) return;
  
  if (!window.userWishlist || window.userWishlist.size === 0) {
    wishlistGrid.innerHTML = '<p style="color: #999;">No cards in wishlist yet</p>';
    return;
  }
  
  const allCards = window.allCardsDatabase || [];
  const wishlistHtml = [];
  
  window.userWishlist.forEach(cardId => {
    const [cardName, cardSet, cardNumber] = cardId.split('|');
    
    const card = allCards.find(c => 
      c.name === cardName && 
      c.set === cardSet && 
      c.number === cardNumber
    );
    
    if (card && card.image_url) {
      const price = card.eur_price ? parseFloat(card.eur_price.replace(',', '.')) : 0;
      const priceDisplay = (!isNaN(price) && price > 0) ? `${price.toFixed(2).replace('.', ',')} €` : 'N/A';
      
      wishlistHtml.push(`
        <div style="position: relative; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); transition: transform 0.2s;" onmouseover="this.style.transform='translateY(-4px)'" onmouseout="this.style.transform=''">
          <img src="${card.image_url}" alt="${card.name}" style="width: 100%; display: block; cursor: pointer;" onclick="showImageView('${card.image_url}', '${card.name}')">
          <button onclick="removeFromWishlist('${cardId}')" style="position: absolute; top: 5px; right: 5px; background: #e74c3c; color: white; border: none; width: 30px; height: 30px; border-radius: 50%; cursor: pointer; font-size: 14px; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.3);" title="Remove from wishlist">
            ×
          </button>
          <div style="padding: 8px; background: white;">
            <div style="font-size: 0.85em; font-weight: 600; margin-bottom: 4px;">${card.name}</div>
            <div style="font-size: 0.75em; color: #666;">${cardSet} ${cardNumber}</div>
            <div style="font-size: 0.8em; color: #27ae60; font-weight: 600; margin-top: 4px;">💰 ${priceDisplay}</div>
          </div>
        </div>
      `);
    }
  });
  
  if (wishlistHtml.length > 0) {
    wishlistGrid.innerHTML = wishlistHtml.join('');
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
        <p><strong>Email:</strong> ${auth.currentUser.email}</p>
        <p><strong>Member since:</strong> ${formatDate(profile.createdAt)}</p>
        <p><strong>Cards:</strong> ${stats.cardCount}</p>
        <p><strong>Decks:</strong> ${window.userDecks.length}</p>
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
        return `
          <div style="background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); margin-bottom: 10px;">
            <h3 style="margin: 0 0 10px 0; color: #2c3e50; font-size: 1.2em;">${deck.name}</h3>
            <p style="color: #7f8c8d; margin: 5px 0; font-size: 0.9em;">
              <strong>Archetype:</strong> ${deck.archetype || 'Custom'}
            </p>
            <p style="color: #34495e; margin: 10px 0; font-weight: 600;">
              🎴 ${totalCards} Cards (${uniqueCards} Unique)
            </p>
            <button onclick="deleteDeck('${deck.id}')" style="padding: 10px 20px; background: #e74c3c; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
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
        const cardNameEscaped = cardName.replace(/'/g, "\\'");
        
        // Get image URL
        let imageUrl = card.image_url || '';
        if (!imageUrl && setCode && setNumber && typeof buildCardImageUrl === 'function') {
          imageUrl = buildCardImageUrl(setCode, setNumber, card.rarity || 'C');
        }
        if (!imageUrl) {
          imageUrl = `https://via.placeholder.com/245x342/667eea/ffffff?text=${encodeURIComponent(cardName)}`;
        }
        
        // Check if owned
        const cardId = `${cardName}|${setCode}|${setNumber}`;
        const isOwned = window.userCollection && window.userCollection.has(cardId);
        const ownedBadge = isOwned ? 
          '<div style="position: absolute; top: 5px; left: 5px; background: #4CAF50; color: white; width: 25px; height: 25px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.5); z-index: 4;">✓</div>' : '';
        
        // Get price
        const eurPrice = card.eur_price || '';
        const priceDisplay = eurPrice || '0,00 €';
        const priceBackground = eurPrice ? 'linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)' : 'linear-gradient(135deg, #777 0%, #999 100%)';
        const cardmarketUrl = card.cardmarket_url || '';
        const cardmarketUrlEscaped = cardmarketUrl.replace(/'/g, "\\'");
        
        cardsHtml += `
          <div style="position: relative; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            <img src="${imageUrl}" alt="${cardName}" style="width: 100%; display: block; cursor: zoom-in;" loading="lazy" 
                 onerror="this.src='https://via.placeholder.com/245x342/667eea/ffffff?text=${encodeURIComponent(cardName)}'"
                 onclick="showSingleCard('${imageUrl}', '${cardNameEscaped}')">
            
            ${ownedBadge}
            
            <div style="position: absolute; top: 5px; right: 5px; background: rgba(0,0,0,0.75); color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.5); z-index: 3;">${count}</div>
            
            <div style="position: absolute; bottom: 5px; left: 5px; right: 5px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 3px; z-index: 3;">
              <button onclick="event.stopPropagation(); openRaritySwitcher('${cardNameEscaped}', '${cardNameEscaped}')" 
                      style="background: #ffc107; color: #333; border: none; border-radius: 3px; height: 24px; cursor: pointer; font-size: 12px; font-weight: bold; display: flex; align-items: center; justify-content: center;" 
                      title="Switch rarity/print">★</button>
              <button onclick="event.stopPropagation(); openCardmarket('${cardmarketUrlEscaped}', '${cardNameEscaped}')" 
                      style="background: ${priceBackground}; color: white; height: 24px; border: none; border-radius: 3px; cursor: ${eurPrice ? 'pointer' : 'not-allowed'}; font-size: 9px; font-weight: bold; padding: 0 4px; display: flex; align-items: center; justify-content: center; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);" 
                      title="${eurPrice ? 'Buy on Cardmarket: ' + eurPrice : 'Price not available'}">${priceDisplay}</button>
              <button onclick="event.stopPropagation(); toggleCollection('${cardId}')" 
                      style="background: ${isOwned ? '#27ae60' : '#95a5a6'}; color: white; border: none; border-radius: 3px; height: 24px; cursor: pointer; font-weight: bold; font-size: 14px; display: flex; align-items: center; justify-content: center;" 
                      title="${isOwned ? 'Remove from collection' : 'Add to collection'}">${isOwned ? '✓' : '+'}</button>
            </div>
          </div>
        `;
      });
    }
    
    return `
      <div style="background: white; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); overflow: hidden; margin-bottom: 10px;">
        <div onclick="toggleDeckCollapse('${deckId}')" style="padding: 15px 20px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; transition: opacity 0.2s;" onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
          <div style="flex: 1;">
            <h3 style="margin: 0 0 5px 0; font-size: 1.1em; font-weight: 600;">${deck.name}</h3>
            <div style="font-size: 0.85em; opacity: 0.9;">
              ${deck.archetype || 'Custom'} • ${totalCards} Cards (${uniqueCards} Unique)
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <button onclick="event.stopPropagation(); deleteDeck('${deck.id}')" style="padding: 6px 12px; background: rgba(231, 76, 60, 0.9); color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: 600; font-size: 0.9em; transition: all 0.2s;" onmouseover="this.style.background='#c0392b'" onmouseout="this.style.background='rgba(231, 76, 60, 0.9)'" title="Delete deck">
              🗑️
            </button>
            <div id="${deckId}-arrow" style="font-size: 1.5em; transition: transform 0.3s; transform: rotate(0deg);">▼</div>
          </div>
        </div>
        <div id="${deckId}" style="display: none; padding: 15px; background: #f8f9fa;">
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px;">
            ${cardsHtml || '<p style="color: #999; padding: 20px; text-align: center;">No cards found</p>'}
          </div>
          <div style="margin-top: 10px; padding: 10px; background: white; border-radius: 5px; font-size: 0.85em; color: #7f8c8d;">
            Saved: ${formatDate(deck.createdAt)}
          </div>
        </div>
      </div>
    `;
  }).join('');
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