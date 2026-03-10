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
    await db.collection('users').doc(user.uid).update({
      collection: firebase.firestore.FieldValue.arrayUnion(cardId)
    });
    
    window.userCollection.add(cardId);
    updateCardUI(cardId);
    showNotification('Added to collection!', 'success');
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
    await db.collection('users').doc(user.uid).update({
      collection: firebase.firestore.FieldValue.arrayRemove(cardId)
    });
    
    window.userCollection.delete(cardId);
    updateCardUI(cardId);
    showNotification('Removed from collection', 'success');
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
    await db.collection('users').doc(user.uid).update({
      wishlist: firebase.firestore.FieldValue.arrayUnion(cardId)
    });
    
    showNotification('Added to wishlist!', 'success');
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
    await db.collection('users').doc(user.uid).update({
      wishlist: firebase.firestore.FieldValue.arrayRemove(cardId)
    });
    
    showNotification('Removed from wishlist', 'success');
  } catch (error) {
    console.error('Error removing from wishlist:', error);
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
  const decksEl = document.getElementById('user-decks-list');
  if (!decksEl) return;
  
  if (!window.userDecks || window.userDecks.length === 0) {
    decksEl.innerHTML = '<p style="color: #999;">No saved decks yet</p>';
    return;
  }
  
  decksEl.innerHTML = window.userDecks.map(deck => `
    <div class="deck-card" data-deck-id="${deck.id}">
      <h3>${deck.name}</h3>
      <p>${deck.cards?.length || 0} cards</p>
      <button onclick="loadDeck('${deck.id}')">Load</button>
      <button onclick="deleteDeck('${deck.id}')">Delete</button>
    </div>
  `).join('');
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
