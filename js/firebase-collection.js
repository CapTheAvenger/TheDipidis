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
    const deckData = {
      name: deckName.trim(),
      archetype: archetype || 'Custom',
      cards: deck,
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

// Load deck from profile to deck builder
async function loadDeckFromProfile(deckId) {
  if (!window.userDecks) {
    showNotification('No decks loaded', 'error');
    return;
  }
  
  const deck = window.userDecks.find(d => d.id === deckId);
  if (!deck) {
    showNotification('Deck not found', 'error');
    return;
  }
  
  // Ask user which tab to load into
  const targetTab = prompt('Load into which tab?\n\n1 = City League Meta\n2 = Current Meta\n3 = Past Meta\n\nEnter 1, 2, or 3:', '1');
  
  if (!targetTab) return; // User cancelled
  
  let source;
  if (targetTab === '1') {
    source = 'cityLeague';
  } else if (targetTab === '2') {
    source = 'currentMeta';
  } else if (targetTab === '3') {
    source = 'pastMeta';
  } else {
    showNotification('Invalid tab selection', 'error');
    return;
  }
  
  // Load deck into selected tab
  if (source === 'cityLeague') {
    window.cityLeagueDeck = { ...deck.cards };
    window.cityLeagueDeckOrder = Object.keys(deck.cards);
    window.currentCityLeagueArchetype = deck.archetype;
    if (typeof updateDeckDisplay === 'function') {
      updateDeckDisplay('cityLeague');
    }
    // Switch to City League tab
    if (typeof openTab === 'function') {
      openTab('cityLeague');
    }
  } else if (source === 'currentMeta') {
    window.currentMetaDeck = { ...deck.cards };
    window.currentMetaDeckOrder = Object.keys(deck.cards);
    window.currentCurrentMetaArchetype = deck.archetype;
    if (typeof updateDeckDisplay === 'function') {
      updateDeckDisplay('currentMeta');
    }
    // Switch to Current Meta tab
    if (typeof openTab === 'function') {
      openTab('currentMeta');
    }
  } else if (source === 'pastMeta') {
    window.pastMetaDeck = { ...deck.cards };
    window.pastMetaDeckOrder = Object.keys(deck.cards);
    window.pastMetaCurrentArchetype = deck.archetype;
    if (typeof updateDeckDisplay === 'function') {
      updateDeckDisplay('pastMeta');
    }
    // Switch to Past Meta tab
    if (typeof openTab === 'function') {
      openTab('pastMeta');
    }
  }
  
  showNotification(`Deck "${deck.name}" loaded into ${source === 'cityLeague' ? 'City League' : source === 'currentMeta' ? 'Current Meta' : 'Past Meta'}!`, 'success');
}

// Get collection statistics
function getCollectionStats() {
  const collection = window.userCollection || new Set();
  
  // Calculate total value (requires price data)
  let totalValue = 0;
  let cardCount = collection.size;
  
  // TODO: Calculate based on actual card prices from price_data.csv
  
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
  
  // Update collection stats
  const cardsCount = document.getElementById('profile-cards-count');
  if (cardsCount) {
    cardsCount.textContent = (profile.collection || []).length;
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
        <p><strong>Cards:</strong> ${(profile.collection || []).length}</p>
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
  
  decksGrid.innerHTML = window.userDecks.map(deck => {
    const totalCards = deck.totalCards || Object.values(deck.cards || {}).reduce((sum, count) => sum + count, 0);
    const uniqueCards = Object.keys(deck.cards || {}).length;
    
    return `
      <div style="background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); transition: transform 0.2s;">
        <h3 style="margin: 0 0 10px 0; color: #2c3e50; font-size: 1.2em;">${deck.name}</h3>
        <p style="color: #7f8c8d; margin: 5px 0; font-size: 0.9em;">
          <strong>Archetype:</strong> ${deck.archetype || 'Custom'}
        </p>
        <p style="color: #34495e; margin: 10px 0; font-weight: 600;">
          🎴 ${totalCards} Cards (${uniqueCards} Unique)
        </p>
        <p style="color: #95a5a6; margin: 5px 0; font-size: 0.85em;">
          Saved: ${formatDate(deck.createdAt)}
        </p>
        <div style="display: flex; gap: 10px; margin-top: 15px;">
          <button onclick="loadDeckFromProfile('${deck.id}')" style="flex: 1; padding: 10px; background: #3498db; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; transition: all 0.2s;" onmouseover="this.style.background='#2980b9'" onmouseout="this.style.background='#3498db'">
            📥 Load
          </button>
          <button onclick="deleteDeck('${deck.id}')" style="flex: 1; padding: 10px; background: #e74c3c; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; transition: all 0.2s;" onmouseover="this.style.background='#c0392b'" onmouseout="this.style.background='#e74c3c'">
            🗑️ Delete
          </button>
        </div>
      </div>
    `;
  }).join('');
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
  event.target.classList.add('active');
}
