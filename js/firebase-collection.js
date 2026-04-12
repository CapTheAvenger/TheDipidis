if (!window.__firebaseRuntimeInitialized) {
  throw new Error('Firebase not initialized! Ensure firebase-config.js is loaded first.');
}
/**
 * User Collection Management
 * ==========================
 * Track owned cards, wishlist, and deck building
 */

// escapeHtml is now provided globally by app-utils.js (window.escapeHtml).
// Local fallback kept for safety if load order changes.
if (typeof escapeHtml !== 'function') {
  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
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
    await db.collection('users').doc(user.uid).update({
      collection: firebase.firestore.FieldValue.arrayUnion(cardId),
      [`collectionCounts.${cardId}`]: newCount
    });
    
    window.userCollection.add(cardId);
    if (!window.userCollectionCounts) window.userCollectionCounts = new Map();
    window.userCollectionCounts.set(cardId, newCount);
    updateCardUI(cardId);
    showNotification(`Added to collection (${newCount}/4)`, 'success');
    
    // Update collection display and stats
    updateCollectionUI();
    
    // Re-render cards to show green checkmark
    if (typeof renderCardDatabase === 'function' && window.filteredCardsData) {
      renderCardDatabase(window.filteredCardsData, { scrollToTop: false });
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
      await db.collection('users').doc(user.uid).update({
        collection: firebase.firestore.FieldValue.arrayRemove(cardId),
        [`collectionCounts.${cardId}`]: firebase.firestore.FieldValue.delete()
      });
      
      window.userCollection.delete(cardId);
      if (window.userCollectionCounts) window.userCollectionCounts.delete(cardId);
    } else {
      await db.collection('users').doc(user.uid).update({
        [`collectionCounts.${cardId}`]: newCount
      });
      
      if (window.userCollectionCounts) window.userCollectionCounts.set(cardId, newCount);
    }
    
    updateCardUI(cardId);
    showNotification(newCount > 0 ? `Collection: ${newCount}/4 copies` : 'Removed from collection', 'success');
    
    // Update collection display and stats
    updateCollectionUI();
    
    // Re-render cards to update checkmark
    if (typeof renderCardDatabase === 'function' && window.filteredCardsData) {
      renderCardDatabase(window.filteredCardsData, { scrollToTop: false });
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

// Add card to wishlist (or increment count)
async function addToWishlist(cardId) {
  const user = auth.currentUser;
  if (!user) {
    showNotification('Please sign in to use this feature', 'error');
    return;
  }
  
  const currentCount = window.userWishlistCounts ? (window.userWishlistCounts.get(cardId) || 0) : 0;
  if (currentCount >= 4) {
    showNotification('Maximum 4 copies per card', 'info');
    return;
  }

  const newCount = currentCount + 1;

  try {
    await db.collection('users').doc(user.uid).update({
      wishlist: firebase.firestore.FieldValue.arrayUnion(cardId),
      [`wishlistCounts.${cardId}`]: newCount
    });
    
    if (!window.userWishlist) window.userWishlist = new Set();
    window.userWishlist.add(cardId);
    if (!window.userWishlistCounts) window.userWishlistCounts = new Map();
    window.userWishlistCounts.set(cardId, newCount);
    showNotification(`Added to wishlist (${newCount}x)`, 'success');
    
    // Update wishlist display
    updateWishlistUI();
    
    // Re-render cards to update wishlist button
    if (typeof renderCardDatabase === 'function' && window.filteredCardsData) {
      renderCardDatabase(window.filteredCardsData, { scrollToTop: false });
    }
  } catch (error) {
    console.error('Error adding to wishlist:', error);
    showNotification('Error updating wishlist', 'error');
  }
}

// Remove from wishlist (decrement count, remove if 0)
async function removeFromWishlist(cardId) {
  const user = auth.currentUser;
  if (!user) return;
  
  const currentCount = window.userWishlistCounts ? (window.userWishlistCounts.get(cardId) || 1) : 1;
  const newCount = currentCount - 1;

  try {
    if (newCount <= 0) {
      await db.collection('users').doc(user.uid).update({
        wishlist: firebase.firestore.FieldValue.arrayRemove(cardId),
        [`wishlistCounts.${cardId}`]: firebase.firestore.FieldValue.delete()
      });
      window.userWishlist.delete(cardId);
      if (window.userWishlistCounts) window.userWishlistCounts.delete(cardId);
    } else {
      await db.collection('users').doc(user.uid).update({
        [`wishlistCounts.${cardId}`]: newCount
      });
      if (window.userWishlistCounts) window.userWishlistCounts.set(cardId, newCount);
    }
    showNotification(newCount > 0 ? `Wishlist: ${newCount}x` : 'Removed from wishlist', 'success');
    
    // Update wishlist display
    updateWishlistUI();
    
    // Re-render cards to update wishlist button
    if (typeof renderCardDatabase === 'function' && window.filteredCardsData) {
      renderCardDatabase(window.filteredCardsData, { scrollToTop: false });
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

  const selectedFolder = await chooseDeckFolderWithCreate({
    title: 'Save Deck Folder',
    currentFolder: '',
    includeNoFolder: true
  });

  if (selectedFolder === null) {
    return; // User cancelled folder selection
  }
  
  // Check for duplicate deck name
  const trimmedName = deckName.trim();
  if (window.userDecks && window.userDecks.some(d => d.name === trimmedName)) {
    const overwrite = confirm(t('deck.duplicateConfirm').replace('${name}', trimmedName));
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
      folder: selectedFolder,
      source: source,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdAtMs: Date.now(), // client-side fallback if serverTimestamp is pending
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
  
  if (!confirm(t('deck.deleteConfirm'))) return;
  
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
  const counts = window.userCollectionCounts || new Map();
  
  let totalValue = 0;
  let cardCount = 0;
  
  // Calculate total value based on actual card prices
  collection.forEach(cardId => {
    if (typeof cardId !== 'string' || !cardId.includes('|')) return;
    const [cardName, cardSet, cardNumber] = cardId.split('|');
    const ownedCount = Math.max(1, parseInt(counts.get(cardId), 10) || 1);
    cardCount += ownedCount;

    const card = allCards.find(c => 
      c.name === cardName && 
      c.set === cardSet && 
      c.number === cardNumber
    );
    
    if (card && card.eur_price) {
      const price = parseFloat(card.eur_price.replace(',', '.'));
      if (!isNaN(price)) {
        totalValue += price * ownedCount;
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

function getCollectionSortMode() {
  return window.collectionSortMode || 'set-newest';
}

function getCollectionFilterMode() {
  return window.collectionFilterMode || 'all';
}

function updateCollectionTypeLoadingIndicator() {
  const el = document.getElementById('collection-type-loading');
  if (!el) return;
  const pending = window._pendingPokemonTypeFetches ? window._pendingPokemonTypeFetches.size : 0;
  if (pending > 0) {
    el.style.display = 'block';
    el.textContent = `Elementtypen werden geladen... (${pending})`;
  } else {
    el.style.display = 'none';
  }
}

function normalizePokemonNameForDexLookup(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\b(ex|vmax|vstar|v-union|v|gx|radiant|mega)\b/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getPokemonDexNumber(card) {
  if (!card) return null;
  const direct = parseInt(card.pokedex_number || card.pokedex || card.dex_number, 10);
  if (!isNaN(direct) && direct > 0) return direct;

  const dexMap = window.pokedexNumbers || {};
  const normalized = normalizePokemonNameForDexLookup(card.name);
  const mapped = parseInt(dexMap[normalized], 10);
  if (!isNaN(mapped) && mapped > 0) return mapped;
  return null;
}

function isPokemonLikeType(typeLower) {
  return typeLower.includes('basic')
    || typeLower.includes('stage')
    || typeLower.includes('vmax')
    || typeLower.includes('vstar')
    || typeLower.includes('mega')
    || typeLower.includes('break')
    || typeLower.includes('legend')
    || typeLower.includes('restored');
}

function getCollectionCardCategory(card) {
  const typeLower = String((card && card.type) || '').toLowerCase();
  if (typeLower.includes('supporter')) return 'supporter';
  if (typeLower.includes('item')) return 'item';
  if (typeLower.includes('tool')) return 'tool';
  if (typeLower.includes('special energy')) return 'special-energy';
  if (typeLower.includes('basic energy')) return 'basic-energy';
  if (typeLower.includes('stadium')) return 'stadium';
  if (typeLower.includes('energy')) return 'energy';
  return 'pokemon';
}

function getPokemonElementFromCard(card) {
  if (!card) return 'unknown';

  // Primary: use energy_type from card data (scraped from Limitless ptcg-symbol)
  if (card.energy_type) return card.energy_type.toLowerCase();

  const typeLower = String((card.type || '')).toLowerCase();

  const explicitMap = {
    grass: 'grass', fire: 'fire', water: 'water', lightning: 'lightning',
    psychic: 'psychic', fighting: 'fighting', darkness: 'darkness',
    metal: 'metal', dragon: 'dragon', colorless: 'colorless'
  };
  for (const [needle, mapped] of Object.entries(explicitMap)) {
    if (typeLower.includes(needle)) return mapped;
  }

  const dex = getPokemonDexNumber(card);
  if (!dex) return 'unknown';

  const cache = window.pokemonTypeCache || (window.pokemonTypeCache = {});
  const cached = cache[String(dex)];
  if (cached) {
    const typeToElement = {
      grass: 'grass', fire: 'fire', water: 'water', electric: 'lightning',
      psychic: 'psychic', fighting: 'fighting', dark: 'darkness', steel: 'metal',
      dragon: 'dragon', normal: 'colorless'
    };
    return typeToElement[cached] || 'unknown';
  }

  if (window._pokemonTypeFetchDisabled) {
    return 'unknown';
  }

  if (!window._pendingPokemonTypeFetches) window._pendingPokemonTypeFetches = new Set();
  if (!window._pendingPokemonTypeFetches.has(String(dex))) {
    window._pendingPokemonTypeFetches.add(String(dex));
    updateCollectionTypeLoadingIndicator();
    fetch(`https://pokeapi.co/api/v2/pokemon/${dex}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data || !Array.isArray(data.types) || data.types.length === 0) return;
        const primary = data.types.slice().sort((a, b) => (a.slot || 99) - (b.slot || 99))[0];
        const typeName = primary && primary.type ? String(primary.type.name || '').toLowerCase() : '';
        if (!typeName) return;
        window.pokemonTypeCache[String(dex)] = typeName;
        try { localStorage.setItem('pokemonTypeCacheV1', JSON.stringify(window.pokemonTypeCache)); } catch (_) {}
      })
      .catch(error => {
        const message = String((error && error.message) || error || '').toLowerCase();
        if (message.includes('content security policy') || message.includes('violates the following content security policy directive') || message.includes('refused to connect')) {
          window._pokemonTypeFetchDisabled = true;
          console.warn('[Collection] PokéAPI type lookup disabled because CSP blocks external requests.');
        }
      })
      .finally(() => {
        window._pendingPokemonTypeFetches.delete(String(dex));
        updateCollectionTypeLoadingIndicator();
        // Re-render after async type resolution to apply element sort/filter.
        if (typeof filterCollection === 'function') filterCollection();
      });
  }

  return 'unknown';
}

function getCollectionPrice(card) {
  if (!card || !card.eur_price) return 0;
  const parsed = parseFloat(String(card.eur_price).replace(',', '.'));
  return isNaN(parsed) ? 0 : parsed;
}

function getCardSetOrder(card) {
  if (!card || !card.set) return 0;
  const map = window.setOrderMap || {};
  return parseInt(map[card.set], 10) || 0;
}

function compareCardsByNewestSet(aCard, bCard, collator) {
  const aSet = getCardSetOrder(aCard);
  const bSet = getCardSetOrder(bCard);
  if (aSet !== bSet) return bSet - aSet;

  const aSetCode = String((aCard && aCard.set) || '').toUpperCase();
  const bSetCode = String((bCard && bCard.set) || '').toUpperCase();
  if (aSetCode !== bSetCode) return collator.compare(bSetCode, aSetCode);

  const aNum = parseInt((aCard && aCard.number) || '', 10);
  const bNum = parseInt((bCard && bCard.number) || '', 10);
  if (!isNaN(aNum) && !isNaN(bNum) && aNum !== bNum) return aNum - bNum;

  const aName = String((aCard && aCard.name) || '');
  const bName = String((bCard && bCard.name) || '');
  return collator.compare(aName, bName);
}

function getCardElementBucket(card) {
  const category = getCollectionCardCategory(card);
  if (category === 'pokemon') {
    const element = getPokemonElementFromCard(card);
    const rankMap = {
      grass: 1, fire: 2, water: 3, lightning: 4, psychic: 5,
      fighting: 6, darkness: 7, metal: 8, dragon: 9, colorless: 10,
      unknown: 11
    };
    return { key: `pokemon-${element}`, rank: rankMap[element] || 11 };
  }
  if (category === 'supporter') return { key: 'supporter', rank: 20 };
  if (category === 'item') return { key: 'item', rank: 21 };
  if (category === 'tool') return { key: 'tool', rank: 22 };
  if (category === 'stadium') return { key: 'stadium', rank: 23 };
  if (category === 'special-energy') return { key: 'special-energy', rank: 24 };
  if (category === 'basic-energy') return { key: 'basic-energy', rank: 25 };
  if (category === 'energy') return { key: 'energy', rank: 26 };
  return { key: 'other', rank: 99 };
}

function getCardPokedexNumber(card) {
  if (!card) return Number.MAX_SAFE_INTEGER;
  const direct = parseInt(card.pokedex_number || card.pokedex || card.dex_number, 10);
  if (!isNaN(direct) && direct > 0) return direct;

  const dexMap = window.pokedexNumbers || {};
  const rawName = String(card.name || '').trim();
  if (!rawName) return Number.MAX_SAFE_INTEGER;

  const rawLower = rawName.toLowerCase();
  const directMap = parseInt(dexMap[rawLower], 10);
  if (!isNaN(directMap) && directMap > 0) return directMap;

  // Strip common TCG suffixes for better lookup in National Dex map.
  const baseName = rawLower
    .replace(/\b(ex|vmax|vstar|v-union|v|gx|radiant|mega)\b/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const baseMap = parseInt(dexMap[baseName], 10);
  if (!isNaN(baseMap) && baseMap > 0) return baseMap;

  return Number.MAX_SAFE_INTEGER;
}

function sortCollectionEntries(entries) {
  const mode = getCollectionSortMode();
  const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });

  entries.sort((a, b) => {
    if (mode === 'price-desc') {
      const aPrice = getCollectionPrice(a.card);
      const bPrice = getCollectionPrice(b.card);
      if (aPrice !== bPrice) return bPrice - aPrice;
      return compareCardsByNewestSet(a.card, b.card, collator);
    }

    if (mode === 'element-set-newest') {
      const aEl = getCardElementBucket(a.card);
      const bEl = getCardElementBucket(b.card);
      if (aEl.rank !== bEl.rank) return aEl.rank - bEl.rank;
      if (aEl.key !== bEl.key) return collator.compare(aEl.key, bEl.key);

      return compareCardsByNewestSet(a.card, b.card, collator);
    }

    if (mode === 'pokedex') {
      const aDex = getCardPokedexNumber(a.card);
      const bDex = getCardPokedexNumber(b.card);
      if (aDex !== bDex) return aDex - bDex;

      return compareCardsByNewestSet(a.card, b.card, collator);
    }

    // Default: newest set first
    return compareCardsByNewestSet(a.card, b.card, collator);
  });
}

// Update collection UI
function updateCollectionUI(searchFilter = '', filterMode = '') {
  if (!window.pokemonTypeCache) {
    try { window.pokemonTypeCache = JSON.parse(localStorage.getItem('pokemonTypeCacheV1') || '{}'); }
    catch (_) { window.pokemonTypeCache = {}; }
  }
  const activeFilterMode = filterMode || getCollectionFilterMode();
  updateCollectionTypeLoadingIndicator();

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
    const entries = [];
    
    window.userCollection.forEach(cardId => {
      // cardId format: "Card Name|SET|NUMBER"
      const [cardName, cardSet, cardNumber] = cardId.split('|');
      if (!cardName || !cardSet || !cardNumber) return;
      
      // Find card in database
      let card = allCards.find(c => 
        c.name === cardName && 
        c.set === cardSet && 
        c.number === cardNumber
      );

      // Fallback lookup via prebuilt set+number index (handles number normalization/padding differences)
      if (!card && typeof window.getIndexedCardBySetNumber === 'function') {
        card = window.getIndexedCardBySetNumber(cardSet, cardNumber)
          || window.getIndexedCardBySetNumber(cardSet, String(parseInt(cardNumber, 10) || cardNumber))
          || window.getIndexedCardBySetNumber(cardSet, String(cardNumber).padStart(3, '0'));
      }
      
      if (card && card.image_url) {
        totalCards++;
        
        // Apply search filter - Omni-Search: name (EN/DE), set+number, Pokédex number
        if (searchFilter) {
          const searchLower = searchFilter.toLowerCase();
          const nameEn = (card.name_en || card.name || '').toLowerCase();
          const nameDe = (card.name_de || card.card_name_de || '').toLowerCase();
          const setCode = String(cardSet || '').toLowerCase();
          const number = String(cardNumber || '').toLowerCase();
          const dexNum = String(card.pokedex_number || '').toLowerCase();
          const setNumSpace = `${setCode} ${number}`;
          const setNumCombined = `${setCode}${number}`;

          const matchesSearch =
            nameEn.includes(searchLower) ||
            nameDe.includes(searchLower) ||
            setNumSpace.includes(searchLower) ||
            setNumCombined.includes(searchLower) ||
            (dexNum !== '' && dexNum === searchLower) ||
            (searchLower.length >= 3 && dexNum !== '' && dexNum.includes(searchLower));

          if (!matchesSearch) {
            return; // Skip this card
          }
        }

        // Apply type/element filter
        if (activeFilterMode && activeFilterMode !== 'all') {
          const category = getCollectionCardCategory(card);
          if (activeFilterMode.startsWith('pokemon-')) {
            if (category !== 'pokemon') return;
            const wantedEl = activeFilterMode.replace('pokemon-', '');
            const cardEl = getPokemonElementFromCard(card);
            if (cardEl !== wantedEl) return;
          } else if (activeFilterMode === 'pokemon') {
            if (category !== 'pokemon') return;
          } else if (category !== activeFilterMode) {
            return;
          }
        }
        
        matchingCards++;
        const ownedCount = window.userCollectionCounts ? (window.userCollectionCounts.get(cardId) || 1) : 1;
        entries.push({ cardId, card, cardSet, cardNumber, ownedCount });
      }
    });

    sortCollectionEntries(entries);

    entries.forEach(({ cardId, card, cardSet, cardNumber, ownedCount }) => {
      const safeNameHtml = escapeHtml(card.name);
      const safeSetHtml = escapeHtml(cardSet);
      const safeNumberHtml = escapeHtml(cardNumber);
      const safeImageAttr = escapeHtml(card.image_url);
      const safeImageJs = escapeJsSingleQuoted(card.image_url);
      const safeNameJs = escapeJsSingleQuoted(card.name);
      const safeCardIdJs = escapeJsSingleQuoted(cardId);

      const price = card.eur_price ? parseFloat(card.eur_price.replace(',', '.')) : 0;
      const priceDisplay = (!isNaN(price) && price > 0) ? `${price.toFixed(2).replace('.', ',')} €` : 'N/A';

      collectionHtml.push(`
          <div style="position: relative; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); transition: transform 0.2s;" onmouseover="this.style.transform='translateY(-4px)'" onmouseout="this.style.transform=''">
            <img src="${safeImageAttr}" alt="${safeNameHtml}" style="width: 100%; display: block; cursor: pointer;" loading="lazy" decoding="async" onerror="if(!this.dataset.retried){this.dataset.retried='1';var s=this.src;this.src='';setTimeout(()=>{this.src=s;},3000);}" onclick="showImageView('${safeImageJs}', '${safeNameJs}')">
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
      collectionGrid.innerHTML = getEmptyStateBoxHtml({ title: 'No cards found', description: 'No cards match your current search filter.', icon: 'cards' });
    } else {
      collectionGrid.innerHTML = getEmptyStateBoxHtml({ title: 'Your Collection is empty!', description: 'Start adding cards by clicking the \"＋\" button on any card image in the Cards tab.', icon: 'professor', buttonText: '➕ Browse Cards', buttonOnclick: "switchTab('cards')" });
    }
  } else if (collectionGrid) {
    collectionGrid.innerHTML = getEmptyStateBoxHtml({ title: 'Your Collection is empty!', description: 'Start adding cards by clicking the \"＋\" button on any card image in the Cards tab.', icon: 'professor', buttonText: '➕ Browse Cards', buttonOnclick: "switchTab('cards')" });
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

  // Keep profile summary counters in sync with collection changes/reloads.
  const profileCardsCountEl = document.getElementById('profile-cards-count');
  if (profileCardsCountEl) {
    profileCardsCountEl.textContent = stats.cardCount;
  }
  const profileCollectionValueEl = document.getElementById('profile-collection-value');
  if (profileCollectionValueEl) {
    profileCollectionValueEl.textContent = `${stats.totalValue.toFixed(2)}€`;
  }
}

function setCollectionSort(mode) {
  window.collectionSortMode = mode || 'set-newest';
  filterCollection();
}

function setCollectionFilter(mode) {
  window.collectionFilterMode = mode || 'all';
  filterCollection();
}

async function clearCollection() {
  const user = auth.currentUser;
  if (!user) {
    showNotification('Please sign in to use this feature', 'error');
    return;
  }

  if (!window.userCollection || window.userCollection.size === 0) {
    showNotification('Collection is already empty', 'info');
    return;
  }

  const ok = confirm(getLang()==='de' ? 'Wirklich die gesamte Collection zuruecksetzen? Alle Karten werden auf "nicht im Besitz" gesetzt.' : 'Really reset the entire collection? All cards will be set to "not owned".');
  if (!ok) return;

  try {
    await db.collection('users').doc(user.uid).set({
      collection: [],
      collectionCounts: {}
    }, { merge: true });

    window.userCollection = new Set();
    window.userCollectionCounts = new Map();
    updateCollectionUI();

    if (typeof renderCardDatabase === 'function' && window.filteredCardsData) {
      renderCardDatabase(window.filteredCardsData);
    }

    showNotification('Collection wurde geleert', 'success');
  } catch (error) {
    console.error('Error clearing collection:', error);
    showNotification(getLang()==='de' ? 'Fehler beim Leeren der Collection' : 'Error clearing the collection', 'error');
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
  let totalValue = 0;

  window.userWishlist.forEach(cardId => {
    const [cardName, cardSet, cardNumber] = cardId.split('|');

    const card = allCards.find(c =>
      c.name === cardName &&
      c.set === cardSet &&
      c.number === cardNumber
    );

    if (card && card.image_url) {
      totalCards++;
      const wantedCount = window.userWishlistCounts ? (window.userWishlistCounts.get(cardId) || 1) : 1;

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
      if (!isNaN(price) && price > 0) totalValue += price * wantedCount;

      // Cardmarket link
      const rawCmUrl = card.cardmarket_url || '';
      const cmUrl = rawCmUrl ? rawCmUrl.split('?')[0] + '?sellerCountry=7&language=1,3' : '';
      const safeCmUrl = escapeHtml(cmUrl);

      // Owned count from collection
      const ownedCount = window.userCollectionCounts ? (window.userCollectionCounts.get(cardId) || 0) : 0;

      // Max copies allowed in a deck
      const maxCopies = (typeof getLegalMaxCopies === 'function') ? getLegalMaxCopies(card) : 4;
      const maxLabel = maxCopies >= 59 ? '∞' : maxCopies;

      // User's max price (budget)
      const maxPrice = window.userWishlistMaxPrices ? (window.userWishlistMaxPrices.get(cardId) || '') : '';
      const maxPriceVal = maxPrice ? parseFloat(maxPrice).toFixed(2).replace('.', ',') : '';

      wishlistHtml.push(`
        <div style="position: relative; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); transition: transform 0.2s;" onmouseover="this.style.transform='translateY(-4px)'" onmouseout="this.style.transform=''">
          <img src="${safeImageAttr}" alt="${safeNameHtml}" style="width: 100%; display: block; cursor: pointer;" loading="lazy" decoding="async" onerror="if(!this.dataset.retried){this.dataset.retried='1';var s=this.src;this.src='';setTimeout(()=>{this.src=s;},3000);}" onclick="showImageView('${safeImageJs}', '${safeNameJs}')">
          <div style="position: absolute; top: 5px; left: 5px; background: #e67e22; color: white; min-width: 25px; height: 25px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.3); padding: 0 4px;" title="${wantedCount}x wanted">${wantedCount}x</div>
          <div style="position: absolute; top: 5px; right: 5px; display: flex; gap: 4px;">
            <button onclick="addToWishlist('${safeCardIdJs}')" style="background: #e67e22; color: white; border: none; width: 26px; height: 26px; border-radius: 50%; cursor: pointer; font-size: 16px; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;" title="Need more (${wantedCount}/4)">+</button>
            <button onclick="removeFromWishlist('${safeCardIdJs}')" style="background: #e74c3c; color: white; border: none; width: 26px; height: 26px; border-radius: 50%; cursor: pointer; font-size: 16px; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;" title="Remove copy">−</button>
          </div>
          <div style="padding: 8px; background: white;">
            <div style="font-size: 0.85em; font-weight: 600; margin-bottom: 4px;">${safeNameHtml}</div>
            <div style="font-size: 0.75em; color: #666;">${safeSetHtml} ${safeNumberHtml}</div>
            <div style="display: flex; align-items: center; gap: 4px; margin-top: 4px;">
              <span style="font-size: 0.75em; color: ${ownedCount > 0 ? '#4CAF50' : '#999'}; font-weight: 600;">✓ ${ownedCount}/${maxLabel}</span>
              <button onclick="addOwnedFromWishlist('${safeCardIdJs}')" style="background: #4CAF50; color: white; border: none; width: 20px; height: 20px; border-radius: 50%; cursor: pointer; font-size: 13px; font-weight: bold; box-shadow: 0 1px 4px rgba(0,0,0,0.2); display: flex; align-items: center; justify-content: center; line-height: 1;" title="Add to collection (owned: ${ownedCount})">+</button>
            </div>
            ${cmUrl
              ? `<a href="${safeCmUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; margin-top: 4px; padding: 3px 8px; background: linear-gradient(135deg, #27ae60, #219a52); color: white; border-radius: 6px; font-size: 0.78em; font-weight: 600; text-decoration: none; box-shadow: 0 1px 4px rgba(0,0,0,0.15);" title="View on Cardmarket">💰 ${priceDisplay}</a>`
              : `<div style="font-size: 0.8em; color: #999; margin-top: 4px;">💰 ${priceDisplay}</div>`}
            <div style="display: flex; align-items: center; gap: 4px; margin-top: 4px;">
              <span style="font-size: 0.72em; color: #8e44ad; font-weight: 600;">Max:</span>
              <input type="text" inputmode="decimal" value="${maxPriceVal}" placeholder="—"
                aria-label="Maximum price for ${safeNameHtml}"
                style="width: 52px; padding: 2px 4px; border: 1.5px solid #ddd; border-radius: 4px; font-size: 0.75em; font-weight: 600; color: #8e44ad; text-align: right; outline: none;"
                onfocus="this.style.borderColor='#8e44ad'" onblur="this.style.borderColor='#ddd'; saveWishlistMaxPrice('${safeCardIdJs}', this.value)"
                onkeydown="if(event.key==='Enter'){this.blur();}">
              <span style="font-size: 0.72em; color: #8e44ad; font-weight: 600;">€</span>
            </div>
          </div>
        </div>
      `);
    }
  });

  // Update search results info
  const searchResults = document.getElementById('wishlist-search-results');
  if (searchResults) {
    const isFiltered = searchFilter || setFilter;
    const valueStr = totalValue > 0 ? ` · ~${totalValue.toFixed(2).replace('.', ',')} €` : '';
    searchResults.textContent = isFiltered
      ? `Showing ${matchingCards} of ${totalCards} cards${valueStr}`
      : (totalCards > 0 ? `${totalCards} cards${valueStr}` : '');
  }

  if (wishlistHtml.length > 0) {
    wishlistGrid.innerHTML = wishlistHtml.join('');
  } else if (searchFilter || setFilter) {
    wishlistGrid.innerHTML = getEmptyStateBoxHtml({ title: 'No cards found', description: 'No cards match your current filters.', icon: 'cards' });
  } else {
    wishlistGrid.innerHTML = getEmptyStateBoxHtml({ title: 'Your Wishlist is empty!', description: 'Add cards to your wishlist by clicking the ♡ button on any card.', icon: 'pokeball' });
  }
}

// Open wishlist as compact grid modal (for screenshot / sharing)
function openWishlistGridModal() {
  if (!window.userWishlist || window.userWishlist.size === 0) {
    showNotification('Wishlist is empty', 'info');
    return;
  }

  const modal = document.getElementById('wishlistGridModal');
  const grid = document.getElementById('wishlistCompactGrid');
  if (!modal || !grid) return;

  const allCards = window.allCardsDatabase || [];
  let html = '';

  window.userWishlist.forEach(cardId => {
    const [cardName, cardSet, cardNumber] = cardId.split('|');
    const card = allCards.find(c => c.name === cardName && c.set === cardSet && c.number === cardNumber);
    if (!card || !card.image_url) return;

    const wantedCount = window.userWishlistCounts ? (window.userWishlistCounts.get(cardId) || 1) : 1;
    const maxPrice = window.userWishlistMaxPrices ? (window.userWishlistMaxPrices.get(cardId) || 0) : 0;
    const safeImage = escapeHtml(card.image_url);
    const safeName = escapeHtml(card.name);

    // Max price shown as semi-transparent overlay strip at bottom of card image
    const maxPriceStrip = maxPrice > 0
      ? `<div style="position:absolute;bottom:0;left:0;right:0;background:rgba(142,68,173,0.85);color:#fff;text-align:center;font-size:8px;font-weight:700;padding:2px 0;border-radius:0 0 5px 5px;white-space:nowrap;overflow:hidden;">max ${maxPrice.toFixed(2).replace('.',',')}€</div>`
      : '';

    html += `<div class="compact-card" data-export-card${maxPrice > 0 ? ` data-max-price="${maxPrice.toFixed(2)}"` : ''}>
      <img src="${safeImage}" alt="${safeName}" style="width:100%;display:block;border-radius:5px;" loading="lazy" decoding="async" onerror="if(!this.dataset.retried){this.dataset.retried='1';var s=this.src;this.src='';setTimeout(()=>{this.src=s;},3000);}">
      ${wantedCount > 1 ? `<span class="compact-badge" style="position:absolute;top:2px;right:2px;background:#e67e22;color:#fff;border-radius:50%;min-width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;box-shadow:0 1px 4px rgba(0,0,0,.4);padding:0 3px;">${wantedCount}x</span>` : ''}
      ${maxPriceStrip}
    </div>`;
  });

  grid.innerHTML = html || '<p style="color:#999;">No cards to display</p>';
  modal.classList.add('show');
}

function closeWishlistGridModal() {
  const modal = document.getElementById('wishlistGridModal');
  if (modal) modal.classList.remove('show');
}

function exportWishlistAsImage() {
  const grid = document.getElementById('wishlistCompactGrid');
  if (!grid) return;
  if (typeof exportDeckAsImage === 'function') {
    exportDeckAsImage(grid, 'Wishlist');
  } else {
    showNotification('Image export not available', 'error');
  }
}

// Add a copy to collection AND auto-decrement wishlist count
async function addOwnedFromWishlist(cardId) {
  const user = auth.currentUser;
  if (!user) {
    showNotification('Please sign in to use this feature', 'error');
    return;
  }
  // Add to collection (respects 4-max internally)
  await addToCollection(cardId);

  // Auto-decrement wishlist if still on it
  if (window.userWishlist && window.userWishlist.has(cardId)) {
    const wantedCount = window.userWishlistCounts ? (window.userWishlistCounts.get(cardId) || 1) : 1;
    if (wantedCount > 0) {
      await removeFromWishlist(cardId);
    }
  }
}

// Save max price user is willing to pay for a wishlist card
async function saveWishlistMaxPrice(cardId, rawValue) {
  const user = auth.currentUser;
  if (!user) return;

  // Parse: accept comma or dot as decimal separator
  const cleaned = rawValue.replace(',', '.').trim();
  const val = parseFloat(cleaned);

  try {
    if (!cleaned || isNaN(val) || val <= 0) {
      // Clear the max price
      await db.collection('users').doc(user.uid).update({
        [`wishlistMaxPrices.${cardId}`]: firebase.firestore.FieldValue.delete()
      });
      if (window.userWishlistMaxPrices) window.userWishlistMaxPrices.delete(cardId);
    } else {
      const rounded = Math.round(val * 100) / 100;
      await db.collection('users').doc(user.uid).update({
        [`wishlistMaxPrices.${cardId}`]: rounded
      });
      if (!window.userWishlistMaxPrices) window.userWishlistMaxPrices = new Map();
      window.userWishlistMaxPrices.set(cardId, rounded);
    }
  } catch (error) {
    console.error('Error saving wishlist max price:', error);
  }
}

// Copy wishlist data to clipboard as text
function copyWishlistToClipboard() {
  if (!window.userWishlist || window.userWishlist.size === 0) {
    showNotification('Wishlist is empty', 'info');
    return;
  }
  const allCards = window.allCardsDatabase || [];
  const lines = [];
  let totalVal = 0;

  window.userWishlist.forEach(cardId => {
    const [cardName, cardSet, cardNumber] = cardId.split('|');
    const card = allCards.find(c => c.name === cardName && c.set === cardSet && c.number === cardNumber);
    const count = window.userWishlistCounts ? (window.userWishlistCounts.get(cardId) || 1) : 1;
    const price = card && card.eur_price ? parseFloat(card.eur_price.replace(',', '.')) : 0;
    const priceStr = (!isNaN(price) && price > 0) ? `${price.toFixed(2).replace('.', ',')} €` : '';
    const maxP = window.userWishlistMaxPrices ? (window.userWishlistMaxPrices.get(cardId) || 0) : 0;
    const maxPStr = maxP > 0 ? ` (max ${maxP.toFixed(2).replace('.', ',')} €)` : '';
    if (!isNaN(price) && price > 0) totalVal += price * count;
    lines.push(`${count}x ${cardName} (${cardSet} ${cardNumber})${priceStr ? ' - ' + priceStr : ''}${maxPStr}`);
  });

  const totalStr = totalVal > 0 ? `\n\nTotal: ~${totalVal.toFixed(2).replace('.', ',')} €` : '';
  const text = `Wishlist (${window.userWishlist.size} cards):\n${lines.join('\n')}${totalStr}`;

  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    navigator.clipboard.writeText(text).then(() => {
      showNotification('Wishlist copied to clipboard!', 'success');
    }).catch(() => _fallbackCopyWishlist(text));
  } else {
    _fallbackCopyWishlist(text);
  }
}

function _fallbackCopyWishlist(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-9999px';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); showNotification('Wishlist copied!', 'success'); } catch (_) { showNotification('Copy failed', 'error'); }
  document.body.removeChild(ta);
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
        <p><strong>Member since:</strong> ${formatProfileDate(profile.createdAt)}</p>
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
    decksGrid.innerHTML = getEmptyStateBoxHtml({ title: 'No saved Decks yet!', description: 'Build a deck in the City League or Current Meta tab and save it to see it here.', icon: 'pokeball', buttonText: '🏗️ Build a Deck', buttonOnclick: "switchTab('cityLeague')" });
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

  function normalizeMyDeckSetCode(value) {
    return String(value || '')
      .trim()
      .toUpperCase()
      .replace(/[?#].*$/, '')
      .replace(/[^A-Z0-9]/g, '');
  }

  function normalizeMyDeckCardNumber(value) {
    return String(value || '')
      .trim()
      .toUpperCase()
      .replace(/[?#].*$/, '')
      .replace(/[^A-Z0-9]/g, '');
  }

  function normalizeMyDeckCardName(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function parseMyDeckCardKey(rawKey) {
    const deckKey = String(rawKey || '').trim();
    const exact = deckKey.match(/^(.+?)\s+\(([^\s()]+)\s+([^)]+)\)$/i);
    if (exact) {
      return {
        name: String(exact[1] || '').trim(),
        setCode: normalizeMyDeckSetCode(exact[2]),
        setNumber: normalizeMyDeckCardNumber(exact[3]),
        hasPrint: true
      };
    }

    // Tolerate malformed keys where URL params leaked into the key.
    const loose = deckKey.match(/^(.+?)\s+\(([^)]*)\)$/i);
    if (loose) {
      const inside = String(loose[2] || '').trim();
      const parts = inside.split(/\s+/).filter(Boolean);
      const setGuess = parts.length > 0 ? parts[0] : '';
      const numberGuess = parts.length > 1 ? parts.slice(1).join(' ') : '';
      return {
        name: String(loose[1] || '').trim(),
        setCode: normalizeMyDeckSetCode(setGuess),
        setNumber: normalizeMyDeckCardNumber(numberGuess),
        hasPrint: true
      };
    }

    return {
      name: deckKey,
      setCode: '',
      setNumber: '',
      hasPrint: false
    };
  }

  function findFallbackDeckCardByName(rawName) {
    if (!window.allCardsDatabase || window.allCardsDatabase.length === 0) return null;

    const cardName = String(rawName || '').trim();
    if (!cardName) return null;

    // 1) Exact match first
    let found = window.allCardsDatabase.find(c => c.name === cardName);
    if (found) return found;

    // 2) Normalized exact match (handles punctuation/case differences)
    const normalizedTarget = normalizeMyDeckCardName(cardName);
    found = window.allCardsDatabase.find(c => normalizeMyDeckCardName(c.name) === normalizedTarget);
    if (found) return found;

    // 3) Legacy aliases for renamed cards
    const legacyNameAliases = {
      'rock fighting energy': 'Rocky Fighting Energy'
    };
    const alias = legacyNameAliases[normalizedTarget];
    if (alias) {
      found = window.allCardsDatabase.find(c => c.name === alias);
      if (found) return found;
    }

    // 4) Soft fallback: all significant target words must appear in candidate name
    const wantedTokens = normalizedTarget.split(' ').filter(token => token.length >= 3);
    if (wantedTokens.length > 0) {
      found = window.allCardsDatabase.find(c => {
        const candidate = normalizeMyDeckCardName(c.name);
        return wantedTokens.every(token => candidate.includes(token));
      });
      if (found) return found;
    }

    return null;
  }
  
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
        const parsedKey = parseMyDeckCardKey(deckKey);
        if (parsedKey.hasPrint) {
          cardName = parsedKey.name;
          setCode = parsedKey.setCode;
          setNumber = parsedKey.setNumber;
          
          // METHOD 1: Fast lookup using cardsBySetNumberMap (preferred)
          if (!cardData && typeof window.getIndexedCardBySetNumber === 'function') {
            cardData = window.getIndexedCardBySetNumber(setCode, setNumber);
          }

          if (!cardData && window.cardsBySetNumberMap && setCode && setNumber) {
            const key = `${setCode}-${setNumber}`;
            cardData = window.cardsBySetNumberMap[key];
          }
          
          // METHOD 2: Fallback - search allCardsDatabase by set+number (still exact print!)
          if (!cardData && window.allCardsDatabase && setCode && setNumber) {
            cardData = window.allCardsDatabase.find(c => 
              c.set === setCode && c.number === setNumber
            );
          }
          
          // METHOD 3: Last resort - search by name only (loses exact print info)
          if (!cardData && window.allCardsDatabase) {
            console.warn(`[My Decks] Could not find exact print ${deckKey}, using any print of ${cardName}`);
            cardData = findFallbackDeckCardByName(cardName);
          }
        } else {
          // Legacy format without set info - try name lookup
          console.warn(`[My Decks] Old deck format detected: ${deckKey}`);
          if (window.allCardsDatabase) {
            cardData = findFallbackDeckCardByName(cardName);
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
        
        // Owned count badge — exact print only (1:1 match: name|set|number)
        // Green: have enough for deck; Orange: have some but fewer than needed; no badge: 0 owned
        let badgeBg = '';
        let badgeText = '';
        let badgeTitle = '';
        if (ownedCount >= count) {
          badgeBg = '#4CAF50'; // green — enough
          badgeText = `${ownedCount}`;
          badgeTitle = `Im Besitz: ${ownedCount}x (brauchst ${count}x — ausreichend!)`;
        } else if (ownedCount > 0) {
          badgeBg = '#FF9800'; // orange — some but not enough
          badgeText = `${ownedCount}`;
          badgeTitle = `Im Besitz: ${ownedCount}x (brauchst ${count}x — noch ${count - ownedCount} fehlend)`;
        }
        const ownedBadge = badgeBg ?
          `<div style="position: absolute; top: 5px; left: 5px; background: ${badgeBg}; color: white; min-width: 25px; height: 25px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.5); z-index: 4; padding: 0 4px;" title="${badgeTitle}">${badgeText}</div>` : '';
        
        // Get price
        const eurPrice = card.eur_price || '';
        const priceDisplay = eurPrice || '0,00 €';
        const safePriceDisplayHtml = escapeHtml(priceDisplay);
        const priceBackground = eurPrice ? 'linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%)' : 'linear-gradient(135deg, #777 0%, #999 100%)';
        const cardmarketUrl = card.cardmarket_url || '';
        const safeCardmarketUrlJs = escapeJsSingleQuoted(cardmarketUrl);
        const safeCardIdJs = escapeJsSingleQuoted(cardId);
        const safeDeckKeyJs = escapeJsSingleQuoted(card.deck_key || `${cardName} (${setCode} ${setNumber})`);
        const safeProfileHintJs = escapeJsSingleQuoted(`profile|${deck.id || ''}`);
        const safeCardmarketTitleHtml = escapeHtml(eurPrice ? 'Buy on Cardmarket: ' + eurPrice : 'Price not available');
        const otherPrintOwnedCount = getOtherInternationalPrintOwnedCount(setCode, setNumber, window.userCollectionCounts);
        const otherPrintSparkle = otherPrintOwnedCount > 0
          ? `<div style="position:absolute;top:${badgeBg ? '34px' : '8px'};left:7px;display:inline-flex;align-items:center;gap:5px;line-height:1;z-index:6;cursor:help;background:linear-gradient(135deg,#ffeb3b 0%,#ffd54f 100%);border:2px solid #ff9800;border-radius:14px;padding:2px 6px;box-shadow:0 3px 10px rgba(0,0,0,0.45),0 0 8px rgba(255,193,7,0.9);" title="Owned other INT prints: ${otherPrintOwnedCount}x"><span style="font-size:16px;font-weight:900;filter:drop-shadow(0 0 3px rgba(255,87,34,0.9));">✨</span><span style="display:inline-flex;align-items:center;justify-content:center;min-width:17px;height:17px;padding:0 4px;border-radius:10px;background:#4a148c;color:#fff;font-size:11px;font-weight:800;box-shadow:inset 0 0 0 1px rgba(255,255,255,0.3);">${otherPrintOwnedCount}</span></div>`
          : '';
        
        cardsHtml += `
          <div style="position: relative; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            <img src="${safeImageAttr}" alt="${safeCardNameHtml}" style="width: 100%; display: block; cursor: zoom-in;" loading="lazy" 
                 onerror="if(!this.dataset.retried){this.dataset.retried='1';var s=this.src;this.src='';setTimeout(()=>{this.src=s;},3000);}else{this.src='${safeFallbackImageAttr}'}"
                 onclick="showSingleCard('${safeImageJs}', '${safeCardNameJs}')">
            
            ${ownedBadge}
            ${otherPrintSparkle}
            
            <div style="position: absolute; top: 5px; right: 5px; background: rgba(0,0,0,0.75); color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: bold; box-shadow: 0 2px 8px rgba(0,0,0,0.5); z-index: 3;">${count}</div>
            
            <div style="position: absolute; bottom: 5px; left: 5px; right: 5px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 2px; z-index: 3;">
                      <button onclick="event.stopPropagation(); openRaritySwitcher('${safeCardNameJs}', '${safeDeckKeyJs}', '${safeProfileHintJs}')" 
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
    const createdStr = formatProfileDate(deck.createdAt || deck.createdAtMs);
    const safeCreatedHtml = escapeHtml(createdStr);
    const isActive = !!deck.active;
    const activeGradient = isActive
      ? 'linear-gradient(135deg, #1B5E20 0%, #388E3C 50%, #43A047 100%)'
      : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    const activeBorder = isActive ? 'border: 2px solid #66BB6A;' : '';
    const activeLabel = isActive ? `<span style="display:inline-block;background:#4CAF50;color:white;font-size:0.7em;padding:1px 8px;border-radius:10px;margin-left:8px;vertical-align:middle;font-weight:700;">${getLang()==='de' ? 'IRL GEBAUT' : 'IRL BUILT'}</span>` : '';
    
    return `
      <div class="saved-deck-item" data-deck-name="${safeDeckNameHtml}" data-deck-archetype="${safeDeckArchetypeHtml}" data-deck-folder="${safeFolderHtml}" data-deck-active="${isActive}" style="background: white; border-radius: 10px; box-shadow: ${isActive ? '0 0 12px rgba(76,175,80,0.5), 0 2px 8px rgba(0,0,0,0.1)' : '0 2px 8px rgba(0,0,0,0.1)'}; overflow: hidden; margin-bottom: 10px; ${activeBorder}">
        <div class="deck-header-row" onclick="toggleDeckCollapse('${deckId}')" style="padding: 15px 20px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; background: ${activeGradient}; color: white; transition: opacity 0.2s;" onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
          <div class="deck-name-col" style="flex: 1; min-width: 0;">
            <h3 style="margin: 0 0 3px 0; font-size: 1.1em; font-weight: 600;">${safeDeckNameHtml}${activeLabel}</h3>
            <div style="font-size: 0.85em; opacity: 0.9;">
              ${safeDeckArchetypeHtml} • ${totalCards} Cards (${uniqueCards} Unique)
            </div>
            <div style="font-size: 0.75em; opacity: 0.7; margin-top: 2px;">
              ${deck.folder ? '📁 ' + safeFolderHtml + ' • ' : ''}🕐 ${safeCreatedHtml}
            </div>
          </div>
          <div class="deck-action-buttons" style="display: flex; align-items: center; gap: 8px;">
            <button onclick="event.stopPropagation(); toggleDeckActive('${safeDeckDeleteIdJs}')" style="padding: 6px 12px; background: ${isActive ? 'rgba(76,175,80,0.95)' : 'rgba(255,255,255,0.25)'}; color: white; border: ${isActive ? '2px solid #fff' : '2px solid rgba(255,255,255,0.5)'}; border-radius: 5px; cursor: pointer; font-weight: 600; font-size: 0.9em; transition: all 0.2s;" title="${isActive ? (getLang()==='de' ? 'Als nicht gebaut markieren' : 'Mark as not built') : (getLang()==='de' ? 'Als IRL gebaut markieren' : 'Mark as IRL built')}">
              ${isActive ? '✅' : '⬜'}
            </button>
            <button onclick="event.stopPropagation(); openCompareSavedDeck(${deckIndex})" style="padding: 6px 12px; background: rgba(155, 89, 182, 0.9); color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: 600; font-size: 0.9em; transition: all 0.2s;" onmouseover="this.style.background='#8e44ad'" onmouseout="this.style.background='rgba(155, 89, 182, 0.9)'" title="Compare with another deck">
              ⚖️
            </button>
            <button onclick="event.stopPropagation(); moveDeckToFolder(${deckIndex})" style="padding: 6px 12px; background: rgba(241, 196, 15, 0.9); color: #333; border: none; border-radius: 5px; cursor: pointer; font-weight: 600; font-size: 0.9em; transition: all 0.2s;" onmouseover="this.style.background='#f39c12'" onmouseout="this.style.background='rgba(241, 196, 15, 0.9)'" title="Move to folder">
              📁
            </button>
            <button onclick="event.stopPropagation(); copyMyDeck(${deckIndex})" style="padding: 6px 12px; background: rgba(52, 152, 219, 0.9); color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: 600; font-size: 0.9em; transition: all 0.2s;" onmouseover="this.style.background='#2980b9'" onmouseout="this.style.background='rgba(52, 152, 219, 0.9)'" title="Copy deck list">
              📋
            </button>
            <button onclick="event.stopPropagation(); copyDeckAndOpenLimitless(${deckIndex})" style="padding: 6px 12px; background: rgba(230, 126, 34, 0.9); color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: 600; font-size: 0.9em; transition: all 0.2s;" onmouseover="this.style.background='#d35400'" onmouseout="this.style.background='rgba(230, 126, 34, 0.9)'" title="Copy & open Limitless Builder">
              🏆
            </button>
            <button onclick="event.stopPropagation(); exportSavedDeckAsImage(${deckIndex})" style="padding: 6px 12px; background: rgba(26, 188, 156, 0.9); color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: 600; font-size: 0.9em; transition: all 0.2s;" onmouseover="this.style.background='#16a085'" onmouseout="this.style.background='rgba(26, 188, 156, 0.9)'" title="Save as image">
              📸
            </button>
            <button onclick="event.stopPropagation(); renameDeck(${deckIndex})" style="padding: 6px 12px; background: rgba(142, 68, 173, 0.7); color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: 600; font-size: 0.9em; transition: all 0.2s;" onmouseover="this.style.background='#7d3c98'" onmouseout="this.style.background='rgba(142, 68, 173, 0.7)'" title="Rename deck">
              ✏️
            </button>
            <button onclick="event.stopPropagation(); deleteDeck('${safeDeckDeleteIdJs}')" style="padding: 6px 12px; background: rgba(231, 76, 60, 0.9); color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: 600; font-size: 0.9em; transition: all 0.2s;" onmouseover="this.style.background='#c0392b'" onmouseout="this.style.background='rgba(231, 76, 60, 0.9)'" title="Delete deck">
              🗑️
            </button>
            <div id="${deckId}-arrow" style="font-size: 1.5em; transition: transform 0.3s; transform: rotate(0deg);">▼</div>
          </div>
        </div>
        <div id="${deckId}" style="display: none; padding: 15px; background: #f8f9fa;">
          <div style="display: flex; justify-content: flex-end; margin-bottom: 10px;">
            <button onclick="openCompareSavedDeck(${deckIndex})" style="padding: 6px 12px; background: #8e44ad; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: 700; font-size: 0.85em;" title="Compare this deck">⚖️ Compare</button>
          </div>
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

// ============================================================
// My Decks: Active/Built Toggle
// ============================================================
async function toggleDeckActive(deckId) {
  const user = auth.currentUser;
  if (!user) return;
  const deck = (window.userDecks || []).find(d => d.id === deckId);
  if (!deck) return;
  const newActive = !deck.active;
  try {
    await db.collection('users').doc(user.uid)
      .collection('decks').doc(deckId)
      .update({ active: newActive, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    deck.active = newActive;
    showNotification(newActive
      ? (getLang()==='de' ? 'Deck als IRL gebaut markiert' : 'Deck marked as IRL built')
      : (getLang()==='de' ? 'Deck-Markierung entfernt' : 'Deck mark removed'), 'success');
    updateDecksUI();
  } catch (error) {
    console.error('Error toggling deck active:', error);
    showNotification('Error updating deck', 'error');
  }
}

// ============================================================
// My Decks: Rename Deck
// ============================================================
async function renameDeck(deckIndex) {
  const deck = window.userDecks[deckIndex];
  if (!deck) return;
  const newName = prompt(getLang() === 'de' ? 'Deck umbenennen:' : 'Rename deck:', deck.name);
  if (!newName || newName.trim() === '' || newName.trim() === deck.name) return;
  const trimmed = newName.trim();

  try {
    const user = auth.currentUser;
    if (user) {
      await db.collection('users').doc(user.uid)
        .collection('decks').doc(deck.id)
        .update({ name: trimmed, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    }
  } catch (e) {
    console.error('renameDeck Firestore error', e);
    showNotification(getLang() === 'de' ? 'Umbenennen fehlgeschlagen.' : 'Could not save rename.', 'error');
    return;
  }

  window.userDecks[deckIndex].name = trimmed;
  showNotification(getLang() === 'de' ? 'Deck umbenannt!' : 'Deck renamed!', 'success');
  updateDecksUI();
}

// Compare all active (IRL built) decks
function compareActiveDecks() {
  const activeDecks = (window.userDecks || []).filter(d => d.active);
  if (activeDecks.length < 2) {
    showNotification(getLang()==='de'
      ? 'Markiere mindestens 2 Decks als IRL gebaut um sie zu vergleichen.'
      : 'Mark at least 2 decks as IRL built to compare them.', 'warning');
    return;
  }

  let existingModal = document.getElementById('compare-active-modal');
  if (existingModal) existingModal.remove();

  const modal = document.createElement('div');
  modal.id = 'compare-active-modal';
  modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:10001;display:flex;align-items:center;justify-content:center;padding:20px;';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

  const isDE = getLang() === 'de';
  const options = activeDecks.map((d, i) => {
    const realIdx = (window.userDecks || []).indexOf(d);
    return `<option value="${realIdx}">${escapeHtml(d.name || 'Deck ' + (i + 1))}</option>`;
  }).join('');

  modal.innerHTML = `
    <div style="background:#1a1a2e;border-radius:14px;max-width:500px;width:100%;padding:24px;box-shadow:0 12px 40px rgba(0,0,0,0.35);color:#eee;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <h2 style="margin:0;font-size:1.2em;color:#4CAF50;">⚖️ ${isDE ? 'Gebaute Decks vergleichen' : 'Compare Built Decks'}</h2>
        <button onclick="this.closest('#compare-active-modal').remove()" style="background:none;border:none;color:#aaa;font-size:24px;cursor:pointer;">✕</button>
      </div>
      <p style="color:#bbb;font-size:0.9em;margin:0 0 16px;">${isDE ? 'Wähle 2 deiner gebauten Decks zum Vergleichen:' : 'Choose 2 of your built decks to compare:'}</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
        <div>
          <label style="display:block;font-size:0.85em;color:#aaa;margin-bottom:4px;">Deck A</label>
          <select id="compare-active-a" style="width:100%;padding:10px;border-radius:8px;border:1px solid #444;background:#2a2a3e;color:#eee;font-size:0.95em;">
            ${options}
          </select>
        </div>
        <div>
          <label style="display:block;font-size:0.85em;color:#aaa;margin-bottom:4px;">Deck B</label>
          <select id="compare-active-b" style="width:100%;padding:10px;border-radius:8px;border:1px solid #444;background:#2a2a3e;color:#eee;font-size:0.95em;">
            ${options}
          </select>
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;">
        <button onclick="this.closest('#compare-active-modal').remove()" style="padding:10px 20px;border:1px solid #555;border-radius:8px;background:transparent;color:#aaa;cursor:pointer;font-weight:600;">${isDE ? 'Abbrechen' : 'Cancel'}</button>
        <button id="compare-active-run" style="padding:10px 20px;border:none;border-radius:8px;background:#4CAF50;color:white;cursor:pointer;font-weight:700;">⚖️ ${isDE ? 'Vergleichen' : 'Compare'}</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Default deck B to second option
  const selB = modal.querySelector('#compare-active-b');
  if (selB && selB.options.length > 1) selB.selectedIndex = 1;

  modal.querySelector('#compare-active-run').onclick = () => {
    const idxA = parseInt(modal.querySelector('#compare-active-a').value);
    const idxB = parseInt(modal.querySelector('#compare-active-b').value);
    if (idxA === idxB) {
      showNotification(isDE ? 'Wähle zwei verschiedene Decks.' : 'Choose two different decks.', 'warning');
      return;
    }
    const deckA = window.userDecks[idxA];
    const deckB = window.userDecks[idxB];
    modal.remove();
    showDeckComparison(deckA, deckB);
  };
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

function copyDeckAndOpenLimitless(deckIndex) {
  const deck = window.userDecks && window.userDecks[deckIndex];
  if (!deck || !deck.cards) {
    showToast('Deck not found!', 'error');
    return;
  }

  // Reuse copyMyDeck logic to build the decklist string
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
      const cardData = window.allCardsDatabase && window.allCardsDatabase.find(c => c.name === cardName);
      if (cardData) { setCode = cardData.set || ''; setNumber = cardData.number || ''; }
    }
    const line = setCode && setNumber ? `${count} ${cardName} ${setCode} ${setNumber}` : `${count} ${cardName}`;
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
    } else if (/Energy$/.test(cardName)) category = 'energy';
    if (category === 'pokemon') pokemon.push(line);
    else if (category === 'energy') energy.push(line);
    else trainer.push(line);
  }

  let output = '';
  if (pokemon.length > 0) output += `Pok\u00e9mon: ${pokemon.length}\n${pokemon.join('\n')}\n\n`;
  if (trainer.length > 0) output += `Trainer: ${trainer.length}\n${trainer.join('\n')}\n\n`;
  if (energy.length > 0) output += `Energy: ${energy.length}\n${energy.join('\n')}`;
  output = output.trim();

  navigator.clipboard.writeText(output).then(() => {
    const de = getLang() === 'de';
    showToast(de ? 'Deck kopiert! Limitless Builder \u00f6ffnet sich...' : 'Deck copied! Opening Limitless Builder...', 'success');
    window.open('https://my.limitlesstcg.com/builder', '_blank', 'noopener');
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
function formatProfileDate(timestamp) {
  if (!timestamp) return '—';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('de-DE', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
}

// Switch profile tabs
function switchProfileTab(tabName) {
  // Hide all tabs
  document.querySelectorAll('.profile-tab-content').forEach(tab => {
    tab.classList.add('display-none');
    tab.classList.remove('active');
    tab.style.display = '';
  });
  
  // Remove active class from all buttons
  document.querySelectorAll('.profile-tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // Show selected tab
  const selectedTab = document.getElementById('profile-' + tabName);
  if (selectedTab) {
    selectedTab.classList.remove('display-none');
    selectedTab.classList.add('active');
    selectedTab.style.display = '';
  }
  
  // Add active class to selected button
  const activeBtn = document.querySelector(`.profile-tab-btn[onclick*="${tabName}"]`);
  if (activeBtn) {
    activeBtn.classList.add('active');
  }

  // Auto-load journal history when switching to journal tab
  if (tabName === 'journal' && typeof openJournalHistoryTab === 'function') {
    openJournalHistoryTab();
  }
}
// Filter collection by search term
function filterCollection() {
  const searchInput = document.getElementById('collection-search');
  if (!searchInput) return;
  const filterInput = document.getElementById('collection-filter');
  
  const searchTerm = searchInput.value.trim();
  const filterMode = filterInput ? filterInput.value : getCollectionFilterMode();
  updateCollectionUI(searchTerm, filterMode);
  updateCollectionTypeLoadingIndicator();
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
window._filterBuiltOnly = false;

function toggleBuiltFilter() {
  window._filterBuiltOnly = !window._filterBuiltOnly;
  const btn = document.getElementById('decks-filter-built');
  if (btn) {
    if (window._filterBuiltOnly) {
      btn.style.background = '#4CAF50';
      btn.style.color = 'white';
      btn.style.borderColor = '#4CAF50';
    } else {
      btn.style.background = 'white';
      btn.style.color = '#4CAF50';
      btn.style.borderColor = '#4CAF50';
    }
  }
  filterMyDecks();
}

function filterMyDecks() {
  const searchInput = document.getElementById('decks-search');
  if (!searchInput) return;
  const query = searchInput.value.trim().toLowerCase();
  const builtOnly = window._filterBuiltOnly;
  
  document.querySelectorAll('.saved-deck-item').forEach(item => {
    const name = (item.dataset.deckName || '').toLowerCase();
    const archetype = (item.dataset.deckArchetype || '').toLowerCase();
    const folder = (item.dataset.deckFolder || '').toLowerCase();
    const isActive = item.dataset.deckActive === 'true';
    const matchesSearch = !query || name.includes(query) || archetype.includes(query) || folder.includes(query);
    const matchesBuilt = !builtOnly || isActive;
    item.style.display = (matchesSearch && matchesBuilt) ? '' : 'none';
  });
}

// ============================================================
// My Decks: Folders
// ============================================================
// Folder data stored as a field on each deck doc in Firestore
window.deckFolders = window.deckFolders || []; // derived from userDecks

async function showDeckFolderSelectModal(options = {}) {
  const {
    title = 'Choose Folder',
    folders = [],
    currentFolder = '',
    includeNoFolder = true,
    includeCreateNew = true
  } = options;

  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:999999;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px);';

    const modal = document.createElement('div');
    modal.style.cssText = 'background:#1a1a2e;border-radius:14px;max-width:460px;width:92%;padding:24px;box-shadow:0 16px 48px rgba(0,0,0,0.5);color:#eee;font-family:inherit';

    const titleEl = document.createElement('h3');
    titleEl.style.cssText = 'margin:0 0 12px;font-size:1.1em;color:#fff';
    titleEl.textContent = title;
    modal.appendChild(titleEl);

    const msg = document.createElement('p');
    msg.style.cssText = 'margin:0 0 14px;font-size:0.9em;color:#bbb;line-height:1.5';
    msg.textContent = 'Select a folder for this deck.';
    modal.appendChild(msg);

    const select = document.createElement('select');
    select.style.cssText = 'width:100%;padding:10px;border:1px solid #444;border-radius:8px;background:#16213e;color:#fff;font-size:0.95em;box-sizing:border-box';

    if (includeNoFolder) {
      const noFolderOption = document.createElement('option');
      noFolderOption.value = '__NO_FOLDER__';
      noFolderOption.textContent = '(No Folder)';
      select.appendChild(noFolderOption);
    }

    folders.forEach(folder => {
      const option = document.createElement('option');
      option.value = folder;
      option.textContent = `📁 ${folder}`;
      select.appendChild(option);
    });

    if (includeCreateNew) {
      const createOption = document.createElement('option');
      createOption.value = '__NEW_FOLDER__';
      createOption.textContent = '+ Create New Folder';
      select.appendChild(createOption);
    }

    if (currentFolder && folders.includes(currentFolder)) {
      select.value = currentFolder;
    } else if (includeNoFolder) {
      select.value = '__NO_FOLDER__';
    }

    modal.appendChild(select);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;margin-top:16px';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'padding:8px 20px;border:1px solid #555;border-radius:8px;background:transparent;color:#aaa;cursor:pointer;font-size:0.9em';

    const okBtn = document.createElement('button');
    okBtn.textContent = 'OK';
    okBtn.style.cssText = 'padding:8px 20px;border:none;border-radius:8px;background:#667eea;color:#fff;cursor:pointer;font-size:0.9em;font-weight:600';

    function close(value) {
      overlay.remove();
      resolve(value);
    }

    cancelBtn.onclick = () => close(null);
    okBtn.onclick = () => close(select.value);
    overlay.onclick = e => { if (e.target === overlay) close(null); };
    select.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        close(select.value);
      }
      if (e.key === 'Escape') {
        close(null);
      }
    });

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(okBtn);
    modal.appendChild(btnRow);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    setTimeout(() => select.focus(), 50);
  });
}

async function chooseDeckFolderWithCreate(options = {}) {
  const folders = getDeckFolders();
  const selected = await showDeckFolderSelectModal({
    title: options.title || 'Choose Folder',
    folders,
    currentFolder: options.currentFolder || '',
    includeNoFolder: options.includeNoFolder !== false,
    includeCreateNew: true
  });

  if (selected === null) {
    return null;
  }

  if (selected === '__NO_FOLDER__') {
    return '';
  }

  if (selected === '__NEW_FOLDER__') {
    const newFolderName = await showInputModal({ title: 'New Folder', message: 'Enter folder name:', placeholder: 'Folder name' });
    if (!newFolderName || !newFolderName.trim()) {
      return null;
    }
    const trimmed = newFolderName.trim();
    await persistDeckFolderName(trimmed);
    return trimmed;
  }

  return selected;
}

async function persistDeckFolderName(folderName) {
  const user = auth.currentUser;
  if (!user || !folderName) return;

  const trimmed = String(folderName).trim();
  if (!trimmed) return;

  try {
    await db.collection('users').doc(user.uid).set({
      deckFolders: firebase.firestore.FieldValue.arrayUnion(trimmed),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    if (!window.deckFolders) window.deckFolders = [];
    if (!window.deckFolders.includes(trimmed)) {
      window.deckFolders.push(trimmed);
      window.deckFolders.sort((a, b) => a.localeCompare(b));
    }
  } catch (error) {
    console.error('Error persisting deck folder:', error);
  }
}

function getDeckFolders() {
  if (!window.userDecks && !window.deckFolders) return [];
  const folders = new Set();
  (window.userDecks || []).forEach(d => { if (d.folder) folders.add(d.folder); });
  (window.deckFolders || []).forEach(f => { if (f) folders.add(f); });
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
  await persistDeckFolderName(trimmed);
  showNotification(`Folder "${trimmed}" created. Use the 📁 button on a deck to move it.`, 'success');
  renderFolderNav();
}

async function moveDeckToFolder(deckIndex) {
  const deck = window.userDecks && window.userDecks[deckIndex];
  if (!deck) return;
  const user = auth.currentUser;
  if (!user) return;
  
  const folder = await chooseDeckFolderWithCreate({
    title: 'Move to Folder',
    currentFolder: deck.folder || '',
    includeNoFolder: true
  });

  if (folder === null) return;
  
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
    nav.classList.add('display-none');
    return;
  }
  nav.classList.remove('display-none');
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

  // Show/hide folder summary
  renderFolderSummary(folder);
}

// ============================================================
// Folder Summary: Core vs Tech/Flex Card Analysis
// ============================================================

function renderFolderSummary(folder) {
  const container = document.getElementById('decks-folder-summary');
  if (!container) return;

  // Hide summary when "All" is selected or no folder
  if (!folder) {
    container.classList.add('display-none');
    container.innerHTML = '';
    return;
  }

  // Get decks in this folder
  const folderDecks = (window.userDecks || []).filter(d => d.folder === folder);
  if (folderDecks.length < 2) {
    container.classList.add('display-none');
    container.innerHTML = '';
    return;
  }

  const totalDecks = folderDecks.length;

  // Analyze all cards across all decks in the folder
  // cardKey → { counts: [count_in_deck1, count_in_deck2, ...], name, setCode, setNumber }
  const cardAnalysis = new Map();

  folderDecks.forEach((deck, deckIdx) => {
    if (!deck.cards) return;
    for (const [rawKey, count] of Object.entries(deck.cards)) {
      if (count <= 0) continue;
      // Parse "CardName (SET NUMBER)" format
      const keyStr = String(rawKey || '').trim();
      let cardName = keyStr, setCode = '', setNumber = '';
      const m = keyStr.match(/^(.+?)\s+\(([^\s()]+)\s+([^)]+)\)$/i);
      if (m) { cardName = m[1].trim(); setCode = m[2].toUpperCase(); setNumber = m[3].toUpperCase(); }
      // Normalize: use card name only so different prints of same card merge
      const normName = cardName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

      if (!cardAnalysis.has(normName)) {
        cardAnalysis.set(normName, {
          name: cardName,
          setCode: setCode,
          setNumber: setNumber,
          rawKey: rawKey,
          counts: new Array(totalDecks).fill(0)
        });
      }
      const entry = cardAnalysis.get(normName);
      entry.counts[deckIdx] = count;
      // Keep the most common print info (first occurrence)
    }
  });

  // Classify cards
  const coreCards = []; // in ALL decks with exact same count
  const flexCards = []; // in ALL decks but different counts
  const techCards = []; // in SOME decks but not all

  for (const [normName, data] of cardAnalysis) {
    const inAllDecks = data.counts.every(c => c > 0);
    const minCount = Math.min(...data.counts);
    const maxCount = Math.max(...data.counts);

    if (inAllDecks && minCount === maxCount) {
      coreCards.push({ ...data, count: minCount, category: 'core' });
    } else if (inAllDecks && minCount !== maxCount) {
      // Core portion = minCount, flex portion = variable part
      if (minCount > 0) {
        coreCards.push({ ...data, count: minCount, category: 'core' });
      }
      flexCards.push({ ...data, minCount, maxCount, deckCount: totalDecks, category: 'flex' });
    } else {
      const decksWithCard = data.counts.filter(c => c > 0).length;
      techCards.push({ ...data, minCount: Math.min(...data.counts.filter(c => c > 0)), maxCount, deckCount: decksWithCard, category: 'tech' });
    }
  }

  // Sort each group by card type (Pokemon → Trainer → Energy), then by count descending
  const sortByTypeAndCount = (a, b) => {
    const typeOrder = { 'Pokemon': 0, 'Supporter': 1, 'Item': 2, 'Tool': 3, 'Stadium': 4, 'Special Energy': 5, 'Energy': 6 };
    const aCard = lookupCardData(a);
    const bCard = lookupCardData(b);
    const aType = aCard ? getCardTypeCategory(aCard.type || '') : 'Pokemon';
    const bType = bCard ? getCardTypeCategory(bCard.type || '') : 'Pokemon';
    const aOrder = typeOrder[aType] ?? 0;
    const bOrder = typeOrder[bType] ?? 0;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return (b.maxCount || b.count || 0) - (a.maxCount || a.count || 0);
  };

  coreCards.sort(sortByTypeAndCount);
  flexCards.sort(sortByTypeAndCount);
  techCards.sort(sortByTypeAndCount);

  const coreTotal = coreCards.reduce((sum, c) => sum + c.count, 0);
  const flexSlots = flexCards.reduce((sum, c) => sum + (c.maxCount - (c.minCount || 0)), 0);
  const isDE = typeof getLang === 'function' && getLang() === 'de';

  // Build HTML
  let html = `
    <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 12px; padding: 20px; color: white; box-shadow: 0 4px 15px rgba(0,0,0,0.3);">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 15px; flex-wrap: wrap; gap: 10px;">
        <h3 style="margin: 0; font-size: 1.2em;">📊 ${isDE ? 'Ordner-Analyse' : 'Folder Analysis'}: ${escapeHtml(folder)}</h3>
        <div style="font-size: 0.85em; opacity: 0.8;">
          ${totalDecks} ${isDE ? 'Deck-Versionen' : 'Deck Versions'} • ${coreTotal} ${isDE ? 'Core-Karten' : 'Core Cards'} • ${flexCards.length + techCards.length} ${isDE ? 'variable Slots' : 'Flex Slots'}
        </div>
      </div>
  `;

  // Core Section
  if (coreCards.length > 0) {
    html += buildSummarySection(
      isDE ? '🔒 Core (100% identisch)' : '🔒 Core (100% identical)',
      `${coreCards.length} ${isDE ? 'Karten' : 'cards'}, ${coreTotal} ${isDE ? 'Kopien' : 'copies'}`,
      coreCards,
      '#4CAF50',
      'core'
    );
  }

  // Flex Section (in all decks, varying count)
  if (flexCards.length > 0) {
    html += buildSummarySection(
      isDE ? '🔄 Flex (in allen Decks, variabler Count)' : '🔄 Flex (in all decks, varying count)',
      `${flexCards.length} ${isDE ? 'Karten' : 'cards'}`,
      flexCards,
      '#FF9800',
      'flex'
    );
  }

  // Tech Section (not in all decks)
  if (techCards.length > 0) {
    html += buildSummarySection(
      isDE ? '🧪 Tech (nicht in allen Versionen)' : '🧪 Tech (not in all versions)',
      `${techCards.length} ${isDE ? 'Karten' : 'cards'}`,
      techCards,
      '#E91E63',
      'tech'
    );
  }

  html += `</div>`;
  container.innerHTML = html;
  container.classList.remove('display-none');
}

function lookupCardData(entry) {
  if (!window.allCardsDatabase || !entry) return null;
  if (entry.setCode && entry.setNumber) {
    if (typeof window.getIndexedCardBySetNumber === 'function') {
      const found = window.getIndexedCardBySetNumber(entry.setCode, entry.setNumber);
      if (found) return found;
    }
    if (window.cardsBySetNumberMap) {
      const found = window.cardsBySetNumberMap[`${entry.setCode}-${entry.setNumber}`];
      if (found) return found;
    }
    const found = window.allCardsDatabase.find(c => c.set === entry.setCode && c.number === entry.setNumber);
    if (found) return found;
  }
  return window.allCardsDatabase.find(c => c.name === entry.name) || null;
}

function buildSummarySection(title, subtitle, cards, accentColor, category) {
  const cardItems = cards.map(card => {
    const cardData = lookupCardData(card);
    let imageUrl = '';
    if (cardData) {
      imageUrl = cardData.image_url || '';
      if (!imageUrl && typeof buildCardImageUrl === 'function') {
        imageUrl = buildCardImageUrl(cardData.set || card.setCode, cardData.number || card.setNumber, cardData.rarity || 'C');
      }
    }
    if (!imageUrl) {
      imageUrl = `https://via.placeholder.com/245x342/667eea/ffffff?text=${encodeURIComponent(card.name)}`;
    }
    const safeImage = escapeHtml(imageUrl);
    const safeName = escapeHtml(card.name);

    // Badge text
    let badgeText = '';
    if (category === 'core') {
      badgeText = `${card.count}x`;
    } else if (category === 'flex') {
      badgeText = `${card.minCount}–${card.maxCount}x`;
    } else {
      badgeText = `${card.minCount || 1}–${card.maxCount}x`;
    }

    // Deck presence for tech cards
    let presenceBadge = '';
    if (category === 'tech' && card.counts) {
      presenceBadge = `<div style="position:absolute;bottom:4px;left:4px;background:rgba(0,0,0,0.75);color:#fff;font-size:10px;padding:1px 6px;border-radius:8px;">${card.deckCount}/${card.counts.length}</div>`;
    }

    return `
      <div style="position:relative;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.2);width:90px;flex-shrink:0;">
        <img src="${safeImage}" alt="${safeName}" style="width:100%;display:block;" loading="lazy" 
             onerror="this.src='https://via.placeholder.com/245x342/667eea/ffffff?text=${encodeURIComponent(card.name)}'"
             onclick="if(typeof showSingleCard==='function')showSingleCard('${escapeJsSingleQuoted(imageUrl)}','${escapeJsSingleQuoted(card.name)}')">
        <div style="position:absolute;top:3px;right:3px;background:${accentColor};color:white;padding:1px 6px;border-radius:10px;font-size:11px;font-weight:bold;box-shadow:0 1px 4px rgba(0,0,0,0.4);">${badgeText}</div>
        ${presenceBadge}
      </div>
    `;
  }).join('');

  return `
    <div style="margin-bottom: 15px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
        <span style="font-size:1em;font-weight:700;">${title}</span>
        <span style="font-size:0.8em;opacity:0.7;">${subtitle}</span>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${cardItems}
      </div>
    </div>
  `;
}

// ============================================================
// My Decks: Compare
// ============================================================
function parseExternalDeckListToMap(rawText) {
  const lines = String(rawText || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const cards = {};

  lines.forEach(line => {
    // Skip headers/metadata in common PTCGL/Limitless exports.
    if (/^(pok[ée]mon|trainer|energy|total cards|deck list|format)\b/i.test(line)) return;

    // Format: "4 Charizard ex MEW 006" / "1 Boss's Orders PAL 172"
    let m = line.match(/^(\d+)\s+(.+?)\s+([A-Z0-9-]{2,})\s+([A-Z0-9-]+)$/i);
    if (m) {
      const count = parseInt(m[1], 10) || 0;
      const cardName = String(m[2] || '').trim();
      const setCode = String(m[3] || '').toUpperCase().trim();
      const cardNum = String(m[4] || '').toUpperCase().trim();
      if (count > 0 && cardName && setCode && cardNum) {
        const key = `${cardName} (${setCode} ${cardNum})`;
        cards[key] = (cards[key] || 0) + count;
      }
      return;
    }

    // Format fallback: "Card Name (SET NUM) x4"
    m = line.match(/^(.+?)\s*\(([A-Z0-9-]{2,})\s+([A-Z0-9-]+)\)\s*x?(\d+)$/i);
    if (m) {
      const cardName = String(m[1] || '').trim();
      const setCode = String(m[2] || '').toUpperCase().trim();
      const cardNum = String(m[3] || '').toUpperCase().trim();
      const count = parseInt(m[4], 10) || 0;
      if (count > 0 && cardName && setCode && cardNum) {
        const key = `${cardName} (${setCode} ${cardNum})`;
        cards[key] = (cards[key] || 0) + count;
      }
    }
  });

  return cards;
}

function parseExternalDeckListStats(rawText) {
  const lines = String(rawText || '').split(/\r?\n/);
  let nonEmptyLines = 0;
  let recognizedLines = 0;
  let ignoredHeaderLines = 0;

  lines.forEach(rawLine => {
    const line = String(rawLine || '').trim();
    if (!line) return;
    nonEmptyLines += 1;

    if (/^(pok[ée]mon|trainer|energy|total cards|deck list|format)\b/i.test(line)) {
      ignoredHeaderLines += 1;
      return;
    }

    const formatA = /^(\d+)\s+(.+?)\s+([A-Z0-9-]{2,})\s+([A-Z0-9-]+)$/i.test(line);
    const formatB = /^(.+?)\s*\(([A-Z0-9-]{2,})\s+([A-Z0-9-]+)\)\s*x?(\d+)$/i.test(line);
    if (formatA || formatB) recognizedLines += 1;
  });

  const cards = parseExternalDeckListToMap(rawText);
  const totalCards = Object.values(cards).reduce((s, n) => s + (parseInt(n, 10) || 0), 0);
  const uniqueCards = Object.keys(cards).length;

  return {
    cards,
    nonEmptyLines,
    recognizedLines,
    ignoredHeaderLines,
    totalCards,
    uniqueCards,
    unrecognizedLines: Math.max(0, nonEmptyLines - recognizedLines - ignoredHeaderLines)
  };
}

async function openCompareSavedDeck(deckIndex) {
  const baseDeck = window.userDecks && window.userDecks[deckIndex];
  if (!baseDeck) return;

  const decks = window.userDecks || [];
  const compareCandidates = decks.filter((_, i) => i !== deckIndex);

  let existingModal = document.getElementById('deck-compare-source-modal');
  if (existingModal) existingModal.remove();

  const modal = document.createElement('div');
  modal.id = 'deck-compare-source-modal';
  modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:10001;display:flex;align-items:center;justify-content:center;padding:20px;';
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

  const safeBaseDeckName = escapeHtml(baseDeck.name || 'Base Deck');
  modal.innerHTML = `
    <div style="background:#fff;border-radius:12px;max-width:760px;width:100%;max-height:85vh;overflow:auto;padding:22px;box-shadow:0 12px 40px rgba(0,0,0,0.35);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <h2 style="margin:0;font-size:1.25em;">⚖️ Compare Deck: ${safeBaseDeckName}</h2>
        <button id="deck-compare-source-close" style="background:none;border:none;font-size:24px;cursor:pointer;line-height:1;">✕</button>
      </div>
      <p style="margin:0 0 14px 0;color:#555;">${getLang()==='de' ? 'Wähle, womit du vergleichen möchtest:' : 'Choose what to compare with:'}</p>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
        <button id="compare-source-paste" style="padding:10px 12px;border:1px solid #d0d7de;border-radius:8px;background:#f8f9fa;cursor:pointer;font-weight:700;">${getLang()==='de' ? '📋 Limitless / PTCGL Liste einfügen' : '📋 Paste Limitless / PTCGL list'}</button>
        <button id="compare-source-saved" style="padding:10px 12px;border:1px solid #d0d7de;border-radius:8px;background:#f8f9fa;cursor:pointer;font-weight:700;">${getLang()==='de' ? '💾 Gespeichertes Deck auswählen' : '💾 Choose saved deck'}</button>
      </div>

      <div id="compare-source-pane"></div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeBtn = modal.querySelector('#deck-compare-source-close');
  if (closeBtn) closeBtn.onclick = () => modal.remove();

  const pane = modal.querySelector('#compare-source-pane');
  const btnPaste = modal.querySelector('#compare-source-paste');
  const btnSaved = modal.querySelector('#compare-source-saved');

  function setMode(mode) {
    if (!pane) return;
    if (btnPaste && btnSaved) {
      btnPaste.style.background = mode === 'paste' ? '#667eea' : '#f8f9fa';
      btnPaste.style.color = mode === 'paste' ? 'white' : '#222';
      btnSaved.style.background = mode === 'saved' ? '#667eea' : '#f8f9fa';
      btnSaved.style.color = mode === 'saved' ? 'white' : '#222';
    }

    if (mode === 'paste') {
      pane.innerHTML = `
        <label style="display:block;font-weight:600;margin:6px 0;">${getLang()==='de' ? 'Deckliste einfügen (Limitless/PTCGL)' : 'Paste deck list (Limitless/PTCGL)'}</label>
        <textarea id="compare-paste-text" style="width:100%;min-height:180px;padding:10px;border:1px solid #ccc;border-radius:8px;resize:vertical;font-family:Consolas,monospace;font-size:12px;" placeholder="${getLang()==='de' ? 'Beispiel:' : 'Example:'}\n4 Charizard ex MEW 006\n3 Pidgeot ex OBF 164\n..."></textarea>
        <div id="compare-paste-preview" style="margin-top:10px;padding:10px;border-radius:8px;background:#fff7e6;border:1px solid #ffe0a6;color:#7a5a00;font-size:12px;">${getLang()==='de' ? 'Noch keine Liste erkannt. Füge eine Deckliste ein.' : 'No list detected yet. Paste a deck list.'}</div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px;">
          <button id="compare-paste-run" style="padding:8px 12px;border:none;border-radius:8px;background:#27ae60;color:white;cursor:pointer;font-weight:700;">${getLang()==='de' ? '⚖️ Vergleichen' : '⚖️ Compare'}</button>
        </div>
      `;

      const runBtn = pane.querySelector('#compare-paste-run');
      const txt = pane.querySelector('#compare-paste-text');
      const preview = pane.querySelector('#compare-paste-preview');

      function renderPastePreview() {
        if (!preview) return;
        const raw = txt ? txt.value : '';
        const stats = parseExternalDeckListStats(raw);

        if (!stats.nonEmptyLines) {
          preview.style.background = '#fff7e6';
          preview.style.border = '1px solid #ffe0a6';
          preview.style.color = '#7a5a00';
          preview.innerHTML = (getLang()==='de' ? 'Noch keine Liste erkannt. Füge eine Deckliste ein.' : 'No list detected yet. Paste a deck list.');
          return;
        }

        const ok = stats.totalCards > 0;
        preview.style.background = ok ? '#eaf8ea' : '#fff1f1';
        preview.style.border = ok ? '1px solid #b9e6bd' : '1px solid #f0b9b9';
        preview.style.color = ok ? '#1f6b2a' : '#8a1f1f';
        preview.innerHTML = `
          <strong>${ok ? (getLang()==='de' ? '✅ Parser erkannt' : '✅ Parser recognized') : (getLang()==='de' ? '⚠️ Keine gültigen Karten erkannt' : '⚠️ No valid cards recognized')}</strong><br>
          ${getLang()==='de' ? `Zeilen: ${stats.nonEmptyLines} • Erkannt: ${stats.recognizedLines} • Ignoriert (Header): ${stats.ignoredHeaderLines} • Nicht erkannt: ${stats.unrecognizedLines}` : `Lines: ${stats.nonEmptyLines} • Recognized: ${stats.recognizedLines} • Ignored (Header): ${stats.ignoredHeaderLines} • Unrecognized: ${stats.unrecognizedLines}`}<br>
          ${getLang()==='de' ? 'Karten gesamt' : 'Total cards'}: <strong>${stats.totalCards}</strong> • Unique: <strong>${stats.uniqueCards}</strong>
        `;
      }

      if (txt) {
        txt.addEventListener('input', renderPastePreview);
        renderPastePreview();
      }

      if (runBtn) {
        runBtn.onclick = () => {
          const raw = txt ? txt.value : '';
          const stats = parseExternalDeckListStats(raw);
          const parsedCards = stats.cards;
          const totalCards = stats.totalCards;
          if (!totalCards) {
            showNotification(getLang()==='de' ? 'Keine gültigen Karten in der eingefügten Liste gefunden.' : 'No valid cards found in the pasted list.', 'error');
            return;
          }
          const externalDeck = {
            name: 'Pasted Deck (Limitless/PTCGL)',
            cards: parsedCards,
            totalCards
          };
          modal.remove();
          showDeckComparison(baseDeck, externalDeck);
        };
      }
      return;
    }

    // mode === 'saved'
    if (compareCandidates.length === 0) {
      pane.innerHTML = '<p style="color:#b94a48;background:#fbeaea;border:1px solid #f1c0c0;padding:10px;border-radius:8px;">' + (getLang()==='de' ? 'Es gibt kein weiteres gespeichertes Deck zum Vergleichen.' : 'No other saved deck available for comparison.') + '</p>';
      return;
    }

    pane.innerHTML = `
      <label style="display:block;font-weight:600;margin:6px 0;">${getLang()==='de' ? 'Gespeichertes Deck suchen' : 'Search saved deck'}</label>
      <input id="compare-saved-search" type="text" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:8px;" placeholder="${getLang()==='de'? 'Deckname oder Archetype suchen...' : 'Search deck name or archetype...'}" />
      <div id="compare-saved-list" style="margin-top:10px;max-height:260px;overflow:auto;border:1px solid #eee;border-radius:8px;"></div>
    `;

    const searchInput = pane.querySelector('#compare-saved-search');
    const list = pane.querySelector('#compare-saved-list');

    function renderSavedList(term) {
      if (!list) return;
      const q = String(term || '').trim().toLowerCase();
      const filtered = compareCandidates.filter(d => {
        const name = String(d.name || '').toLowerCase();
        const arche = String(d.archetype || '').toLowerCase();
        return !q || name.includes(q) || arche.includes(q);
      });

      if (filtered.length === 0) {
        list.innerHTML = '<div style="padding:10px;color:#777;">' + (getLang()==='de' ? 'Keine passenden Decks gefunden.' : 'No matching decks found.') + '</div>';
        return;
      }

      list.innerHTML = filtered.map(d => {
        const safeName = escapeHtml(d.name || 'Unnamed Deck');
        const safeArche = escapeHtml(d.archetype || 'Custom');
        const cards = d.totalCards || Object.values(d.cards || {}).reduce((s, n) => s + (parseInt(n, 10) || 0), 0);
        const uid = escapeJsSingleQuoted(String(d.id || ''));
        return `
          <button data-deck-id="${uid}" style="width:100%;text-align:left;padding:10px 12px;border:none;border-bottom:1px solid #f0f0f0;background:white;cursor:pointer;">
            <div style="font-weight:700;color:#2c3e50;">${safeName}</div>
            <div style="font-size:12px;color:#666;">${safeArche} • ${cards} ${getLang()==='de' ? 'Karten' : 'Cards'}</div>
          </button>
        `;
      }).join('');

      list.querySelectorAll('button[data-deck-id]').forEach(btn => {
        btn.onclick = () => {
          const id = btn.getAttribute('data-deck-id') || '';
          const picked = compareCandidates.find(d => String(d.id || '') === id);
          if (!picked) return;
          modal.remove();
          showDeckComparison(baseDeck, picked);
        };
      });
    }

    renderSavedList('');
    if (searchInput) {
      searchInput.addEventListener('input', () => renderSavedList(searchInput.value));
      setTimeout(() => searchInput.focus(), 0);
    }
  }

  if (btnPaste) btnPaste.onclick = () => setMode('paste');
  if (btnSaved) btnSaved.onclick = () => setMode('saved');
  setMode('saved');
}

function showDeckComparison(deckA, deckB, compareMode = 'functional') {
  window._deckCompareA = deckA;
  window._deckCompareB = deckB;
  const mode = compareMode === 'exact' ? 'exact' : 'functional';

  const cardsA = deckA.cards || {};
  const cardsB = deckB.cards || {};

  function parseDeckCardKey(rawKey) {
    const key = String(rawKey || '').trim();
    const m = key.match(/^(.+?)\s*\(([A-Z0-9-]+)\s+([A-Z0-9-]+)\)$/i);
    if (!m) {
      return { rawKey: key, name: key, set: '', number: '' };
    }
    return {
      rawKey: key,
      name: String(m[1] || '').trim(),
      set: String(m[2] || '').toUpperCase().trim(),
      number: String(m[3] || '').toUpperCase().trim()
    };
  }

  function normalizeCompareName(name) {
    if (typeof normalizeCardName === 'function') return normalizeCardName(name);
    return String(name || '').toLowerCase().trim();
  }

  function getCardRecordBySetNumber(setCode, setNumber) {
    if (!setCode || !setNumber) return null;
    if (typeof window.getIndexedCardBySetNumber === 'function') {
      const c = window.getIndexedCardBySetNumber(setCode, setNumber);
      if (c) return c;
    }
    if (window.cardsBySetNumberMap) {
      const key = `${setCode}-${setNumber}`;
      if (window.cardsBySetNumberMap[key]) return window.cardsBySetNumberMap[key];
    }
    if (Array.isArray(window.allCardsDatabase)) {
      const c = window.allCardsDatabase.find(x => String(x.set || '').toUpperCase() === setCode && String(x.number || '').toUpperCase() === setNumber);
      if (c) return c;
    }
    return null;
  }

  function getCanonicalComparisonInfo(rawKey) {
    const parsed = parseDeckCardKey(rawKey);
    const normalizedName = normalizeCompareName(parsed.name || parsed.rawKey);
    const cardRecord = getCardRecordBySetNumber(parsed.set, parsed.number);

    // Best-case: use Limitless international_prints table as canonical identity.
    if (cardRecord && cardRecord.international_prints) {
      const refs = String(cardRecord.international_prints)
        .split(',')
        .map(s => String(s || '').trim().toUpperCase())
        .filter(Boolean)
        .filter(s => s.includes('-'));
      if (refs.length > 0) {
        refs.sort();
        return {
          canonical: `intl:${refs.join('|')}`,
          label: parsed.name || parsed.rawKey,
          collapsedPrints: true
        };
      }
    }

    // Fallback: collapse by normalized name.
    return {
      canonical: `name:${normalizedName}`,
      label: parsed.name || parsed.rawKey,
      collapsedPrints: Boolean(parsed.set && parsed.number)
    };
  }

  function aggregateDeckForComparison(cardsMap) {
    const aggregated = new Map();
    Object.entries(cardsMap || {}).forEach(([rawKey, rawCount]) => {
      const count = parseInt(rawCount, 10) || 0;
      if (count <= 0) return;
      const info = mode === 'exact'
        ? { canonical: `raw:${rawKey}`, label: rawKey, collapsedPrints: false }
        : getCanonicalComparisonInfo(rawKey);
      const existing = aggregated.get(info.canonical);
      if (!existing) {
        aggregated.set(info.canonical, {
          count,
          label: info.label,
          collapsedPrints: info.collapsedPrints
        });
      } else {
        existing.count += count;
        if (info.collapsedPrints) existing.collapsedPrints = true;
      }
    });
    return aggregated;
  }

  const aggA = aggregateDeckForComparison(cardsA);
  const aggB = aggregateDeckForComparison(cardsB);
  const allCanonicalKeys = new Set([...aggA.keys(), ...aggB.keys()]);

  let onlyA = [], onlyB = [], different = [], same = [];

  allCanonicalKeys.forEach(key => {
    const a = aggA.get(key) || { count: 0, label: '' };
    const b = aggB.get(key) || { count: 0, label: '' };
    const labelBase = a.label || b.label || key;
    const label = `${escapeHtml(labelBase)}${(mode === 'functional' && (a.collapsedPrints || b.collapsedPrints)) ? ' <span title="Int-Prints zusammengefasst" style="color:#b8860b;">(prints merged)</span>' : ''}`;

    if (a.count > 0 && b.count === 0) {
      onlyA.push(`${label} x${a.count}`);
    } else if (b.count > 0 && a.count === 0) {
      onlyB.push(`${label} x${b.count}`);
    } else if (a.count !== b.count) {
      different.push(`${label}: ${a.count} → ${b.count}`);
    } else {
      same.push(`${label} x${a.count}`);
    }
  });

  // Collect cards the user needs to add (only in B + increased counts in B)
  const proxyCards = [];
  allCanonicalKeys.forEach(key => {
    const a = aggA.get(key) || { count: 0 };
    const b = aggB.get(key) || { count: 0 };
    let needed = 0;
    if (a.count === 0 && b.count > 0) {
      needed = b.count;
    } else if (b.count > a.count) {
      needed = b.count - a.count;
    }
    if (needed > 0) {
      const rawCardsForKey = [];
      Object.entries(cardsB).forEach(([rawKey, rawCount]) => {
        const info = mode === 'exact'
          ? { canonical: `raw:${rawKey}` }
          : getCanonicalComparisonInfo(rawKey);
        if (info.canonical === key) {
          const parsed = parseDeckCardKey(rawKey);
          rawCardsForKey.push({ name: parsed.name || parsed.rawKey, set: parsed.set, number: parsed.number, count: parseInt(rawCount, 10) || 0 });
        }
      });
      let remaining = needed;
      rawCardsForKey.forEach(rc => {
        if (remaining <= 0) return;
        const toAdd = Math.min(remaining, rc.count);
        proxyCards.push({ name: rc.name, set: rc.set, number: rc.number, count: toAdd });
        remaining -= toAdd;
      });
    }
  });
  window._deckCompareProxyCards = proxyCards;
  const totalProxyCopies = proxyCards.reduce((s, c) => s + c.count, 0);

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
      <div style="display:flex;gap:8px;align-items:center;justify-content:flex-end;margin-bottom:12px;">
        <span style="font-size:12px;color:#666;font-weight:700;margin-right:4px;">Compare mode:</span>
        <button onclick="showDeckComparison(window._deckCompareA, window._deckCompareB, 'functional')" style="padding:6px 10px;border-radius:999px;border:${mode === 'functional' ? 'none' : '1px solid #ccc'};background:${mode === 'functional' ? '#2e7d32' : '#f5f5f5'};color:${mode === 'functional' ? 'white' : '#333'};font-size:12px;font-weight:700;cursor:pointer;">Functional (prints merged)</button>
        <button onclick="showDeckComparison(window._deckCompareA, window._deckCompareB, 'exact')" style="padding:6px 10px;border-radius:999px;border:${mode === 'exact' ? 'none' : '1px solid #ccc'};background:${mode === 'exact' ? '#1565c0' : '#f5f5f5'};color:${mode === 'exact' ? 'white' : '#333'};font-size:12px;font-weight:700;cursor:pointer;">Exact print</button>
      </div>
      <div style="margin:-4px 0 12px 0;font-size:12px;color:#666;">${mode === 'functional' ? (getLang()==='de' ? 'Artwork- und Set-Varianten derselben Karte werden zusammengefasst.' : 'Artwork and set variants of the same card are merged.') : (getLang()==='de' ? 'Jeder Print (set+nummer) wird einzeln verglichen.' : 'Each print (set+number) is compared individually.')}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:15px;margin-bottom:15px;">
        <div style="background:#667eea;color:white;padding:10px;border-radius:8px;text-align:center;font-weight:700;">${safeNameA}</div>
        <div style="background:#764ba2;color:white;padding:10px;border-radius:8px;text-align:center;font-weight:700;">${safeNameB}</div>
      </div>
      ${onlyA.length ? `<div style="margin-bottom:12px;"><h4 style="color:#667eea;margin:0 0 5px 0;">Only in ${safeNameA} (${onlyA.length})</h4><div style="font-size:0.9em;color:#555;">${onlyA.join('<br>')}</div></div>` : ''}
      ${onlyB.length ? `<div style="margin-bottom:12px;"><h4 style="color:#764ba2;margin:0 0 5px 0;">Only in ${safeNameB} (${onlyB.length})</h4><div style="font-size:0.9em;color:#555;">${onlyB.join('<br>')}</div></div>` : ''}
      ${different.length ? `<div style="margin-bottom:12px;"><h4 style="color:#e67e22;margin:0 0 5px 0;">Different counts (${different.length})</h4><div style="font-size:0.9em;color:#555;">${different.join('<br>')}</div></div>` : ''}
      <div style="margin-bottom:12px;"><h4 style="color:#27ae60;margin:0 0 5px 0;">Same cards (${same.length})</h4><div style="font-size:0.9em;color:#555;">${same.length > 0 ? same.join('<br>') : 'No cards in common'}</div></div>
      ${totalProxyCopies > 0 ? `<div style="margin-top:16px;padding-top:14px;border-top:1px solid #eee;text-align:center;"><button onclick="addCompareNewCardsToProxy()" style="padding:10px 20px;border:none;border-radius:8px;background:#e74c3c;color:white;font-size:13px;font-weight:700;cursor:pointer;transition:all 0.2s;" onmouseover="this.style.background='#c0392b';this.style.transform='translateY(-1px)';this.style.boxShadow='0 4px 12px rgba(231,76,60,0.35)'" onmouseout="this.style.background='#e74c3c';this.style.transform='';this.style.boxShadow=''">🖨️ ${getLang()==='de' ? 'Alle neuen Karten zum Proxy Printer hinzufügen' : 'Add all new cards to Proxy Printer'} (${totalProxyCopies})</button></div>` : ''}
    </div>
  `;
  
  document.body.appendChild(modal);
}

function addCompareNewCardsToProxy() {
  const cards = window._deckCompareProxyCards;
  if (!Array.isArray(cards) || cards.length === 0) return;
  let total = 0;
  cards.forEach(c => {
    addCardToProxy(c.name, c.set, c.number, c.count, true);
    total += c.count;
  });
  if (typeof showToast === 'function') {
    showToast(getLang()==='de' ? `${total} Karte(n) zum Proxy Printer hinzugefügt` : `${total} card(s) added to Proxy Printer`, 'success');
  }
  if (typeof switchTabAndUpdateMenu === 'function') {
    switchTabAndUpdateMenu('proxy');
  } else if (typeof switchTab === 'function') {
    switchTab('proxy');
  }
  const modal = document.getElementById('deck-compare-modal');
  if (modal) modal.remove();
}

// Ensure inline onclick handlers can resolve functions consistently
window.toggleDeckCollapse = toggleDeckCollapse;
window.createDeckFolder = createDeckFolder;
window.moveDeckToFolder = moveDeckToFolder;
window.renderFolderNav = renderFolderNav;
window.filterDecksByFolder = filterDecksByFolder;
window.renderFolderSummary = renderFolderSummary;
window.openCompareSavedDeck = openCompareSavedDeck;
window.showDeckComparison = showDeckComparison;
window.addCompareNewCardsToProxy = addCompareNewCardsToProxy;
window.filterMyDecks = filterMyDecks;
window.saveCurrentDeckToProfile = saveCurrentDeckToProfile;

// ============================================================
// DEX TCG CSV COLLECTION IMPORT
// ============================================================

function dexImportOpenFilePicker() {
    const user = typeof auth !== 'undefined' ? auth.currentUser : null;
    if (!user) { showNotification(getLang()==='de' ? 'Bitte zuerst einloggen' : 'Please log in first', 'error'); return; }
    document.getElementById('dexImportFileInput').click();
}

function dexImportHandleFile(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => dexImportParseCSV(e.target.result);
    reader.readAsText(file, 'UTF-8');
    input.value = ''; // reset so same file can be re-selected
}

function dexImportParseCSV(csvText) {
    let rows;
    // Remove UTF-8 BOM if present
    if (csvText.charCodeAt(0) === 0xFEFF) csvText = csvText.slice(1);

    if (window.Papa) {
        // transformHeader normalizes all header names to lowercase+trimmed
        // so we can reliably detect columns regardless of Dex's casing
        const result = Papa.parse(csvText, {
            header: true,
            skipEmptyLines: true,
        delimitersToGuess: [',', ';', '\t', '|'],
            transformHeader: h => h.toLowerCase().trim()
        });
        rows = result.data;
    } else {
        const lines = csvText.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) { showNotification(getLang()==='de' ? 'CSV ist leer oder ungültig' : 'CSV is empty or invalid', 'error'); return; }
        const delimiter = (lines[0].split(';').length > lines[0].split(',').length) ? ';' : ',';
        function splitCSVLine(line) {
            const result = [];
            let field = '', inQuote = false;
            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (ch === '"') { inQuote = !inQuote; }
            else if (ch === delimiter && !inQuote) { result.push(field.trim()); field = ''; }
                else { field += ch; }
            }
            result.push(field.trim());
            return result;
        }
        // headers already lowercase via this path
        const headers = splitCSVLine(lines[0]).map(h => h.toLowerCase().trim());
        rows = lines.slice(1).map(line => {
            const cells = splitCSVLine(line);
            const obj = {};
            headers.forEach((h, i) => obj[h] = (cells[i] || '').trim());
            return obj;
        });
    }

    if (!rows || rows.length === 0) { showNotification(getLang()==='de' ? 'CSV enthält keine Daten' : 'CSV contains no data', 'error'); return; }

    // At this point all row keys are lowercase (PapaParse: transformHeader; manual: map toLowerCase)
    const sampleRow = rows[0];
    const keys = Object.keys(sampleRow); // already lowercase

    const dbMap = window.cardsBySetNumberMap || {};
    const dbIndex = window.cardIndexBySetNumber instanceof Map ? window.cardIndexBySetNumber : null;
    const hasDbIndex = (dbIndex && dbIndex.size > 0) || Object.keys(dbMap).length > 0;
    if (!hasDbIndex && (!Array.isArray(window.allCardsDatabase) || window.allCardsDatabase.length === 0)) {
      showNotification(getLang()==='de' ? 'Kartendatenbank lädt noch. Bitte kurz warten und den Dex-Import erneut öffnen.' : 'Card database is still loading. Please wait and reopen the Dex import.', 'warning');
      return;
    }

    // Auto-detect relevant column names — covers Dex TCG and other common export formats
    const nameKey = keys.find(k => k === 'name' || k === 'card name' || k === 'card_name' || k === 'cardname') || 'name';
    const setKey  = keys.find(k => k === 'set code' || k === 'set_code' || k === 'setcode' || k === 'set' || k === 'expansion') || 'set';
    const numKey  = keys.find(k => k === 'number' || k === 'card number' || k === 'card_number' || k === 'collector_number' || k === 'collector number' || k === '#') || 'number';
    const qtyKey  = keys.find(k =>
      k === 'qty' || k === 'quantity' || k === 'count' || k === 'owned' ||
      k === 'anzahl' || k === 'menge' || k === 'stueck' || k === 'stück' ||
      k.includes('owned')
    ) || 'qty';
    // Dex TCG CSV has an 'id' column like "sv3-27" that encodes set+number
    const idKey = keys.find(k => k === 'id' || k === 'card id' || k === 'card_id' || k === 'cardid') || null;

    // ── Dex set-name → internal (Limitless) set code ──────────────────────────
    // Full set names from Cardmarket/Dex CSV mapped to the codes used in the DB.
    // Source: pokemon_sets_mapping.csv in the project root.
    function normDexSetName(s) {
      return String(s || '').toLowerCase()
        .replace(/[éèê]/g, 'e').replace(/[^a-z0-9]/g, '');
    }
    const DEX_SET_NAME_MAP = {
      // Scarlet & Violet era
      'scarletviolet': 'SVI', 'scarletvioletenergy': 'SVE', 'scarletvioletpromos': 'SVP',
      'obsidianflames': 'OBF',
      'paldeaevolved': 'PAL', 'palaeevolved': 'PAL', 'paldaevolved': 'PAL', // all spelling variants
      'pokemon151': 'MEW', '151': 'MEW',
      'paradoxrift': 'PAR', 'paldeanfates': 'PAF',
      'temporalforces': 'TEF', 'twilightmasquerade': 'TWM', 'shroudedfable': 'SFA',
      'stellarcrown': 'SCR', 'surgingsparks': 'SSP', 'prismaticevolutions': 'PRE',
      'crownzenith': 'CRZ', 'crownzenithgalariangallery': 'CRZ',
      'journeytogether': 'JTG', 'destinedrivals': 'DRI',
      'blackbolt': 'BLK', 'whiteflare': 'WHT',
      'ascendedheroes': 'ASC',
      // Mega Evolution sets
      'phantasmalflames': 'PFL', 'megaevolution': 'MEG',
      'megaevolutionenergy': 'MEE', 'megapromos': 'MEP',
      // Sword & Shield era
      'swordshield': 'SSH', 'swordshieldpromos': 'SP',
      'brilliantstars': 'BRS',
      'astralradiance': 'ASR', 'astralradiancetrainergallery': 'ASR',
      'pokemongo': 'PGO',
      'lostorigin': 'LOR', 'lostorigintrainergallery': 'LOR',
      'silvertempest': 'SIR', 'silvertempesttrainergallery': 'SIR',
      'celebrations': 'CEL', 'celebrationsclassiccollection': 'CEL',
      'fusionstrike': 'FST', 'celebrations': 'CEL',
      'evolvingskies': 'EVS', 'chillingreign': 'CRE',
      'battlestyles': 'BST', 'shiningfates': 'SHF',
      'vividvoltage': 'VIV', 'championspath': 'CPA',
      'darknessablaze': 'DAA', 'rebelclash': 'RCL',
      'cosmiceclipse': 'CEC', 'hiddenfates': 'HIF',
      'unifiedminds': 'UNM', 'unbrokenbonds': 'UNB',
      'detectivepikachu': 'DET', 'teamup': 'TEU',
      'lostthunder': 'LOT', 'dragonmajesty': 'DRM',
      // Sun & Moon era
      'sunmoon': 'SUM', 'sunmoonpromos': 'SMP',
      'celestialstorm': 'CES', 'forbiddenlight': 'FLI',
      'ultraprism': 'UPR', 'crimsoninvasion': 'CIN',
      'shininglegends': 'SLG', 'burningshadows': 'BUS',
      'guardiansrising': 'GRI',
      // XY era
      'evolutions': 'EVO', 'steamsiege': 'STS', 'fatescollide': 'FCO',
      'generations': 'GEN', 'breakpoint': 'BKP', 'breakthrough': 'BKT',
      'ancientorigins': 'AOR', 'roaringskies': 'ROS', 'doublecrisis': 'DCR',
      'primalclash': 'PRC', 'phantomforces': 'PHF', 'furiousfists': 'FFI',
      'flashfire': 'FLF', 'xy': 'XY', 'kalosstarterset': 'KSS',
      'xypromos': 'XYP', 'legendarytreasures': 'LTR',
      // BW era
      'plasmablast': 'PLB', 'plasmafreeze': 'PLF', 'plasmastorm': 'PLS',
      'boundariescrossed': 'BCR', 'dragonvault': 'DRV', 'dragonsexalted': 'DRX',
      'darkexplorers': 'DEX', 'nextdestinies': 'NXD', 'noblevictories': 'NVI',
      'emergingpowers': 'EPO', 'blackwhite': 'BLW', 'blackwhitepromos': 'BWP',
      // HGSS era
      'calloflegends': 'CL', 'undaunted': 'UD', 'unleashed': 'UL',
      'heartgoldsoulsilver': 'HS', 'heartgoldsoulsilverpromospromos': 'HSP',
      'heartgoldsoulsilverpromos': 'HSP',
      // Platinum era
      'pokemonrumble': 'RM', 'arceus': 'AR', 'supremevictors': 'SV',
      'risingrivals': 'RR', 'popseries9': 'P9', 'platinum': 'PL',
    };

    function parseSetNumberToken(value) {
      const raw = String(value || '').trim();
      if (!raw) return null;
      const cleaned = raw.split('?')[0].split('#')[0].trim();
      const match = cleaned.match(/(?:^|[^A-Z0-9])([a-z0-9]{2,})\s*[-_/ ]\s*([a-z0-9]+)(?:$|[^A-Z0-9])/i);
      if (!match) return null;
      return { set: normalizeSetCode(match[1]), number: normalizeCardNumber(match[2]) };
    }

    function parseQtyValue(value) {
      const s = String(value || '').trim();
      const m = s.match(/\d+/);
      if (!m) return 0;
      const n = parseInt(m[0], 10);
      return isNaN(n) ? 0 : Math.max(0, n);
    }

    function normalizeSetCode(v) {
      return String(v || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    }

    function normalizeCardNumber(v) {
      const raw = String(v || '').trim();
      if (!raw) return '';
      const noFragment = raw.split('?')[0].split('#')[0].trim();
      if (!noFragment) return '';
      const cleaned = noFragment.replace(/[^0-9A-Za-z\-\/]/g, '');
      if (!cleaned) return '';
      if (/^\d+$/.test(cleaned)) {
        return cleaned.replace(/^0+/, '') || '0';
      }
      return cleaned.toUpperCase();
    }

    const matched = [], unmatched = [];

    function matchCardBySetNumber(rawSet, rawNum) {
      const setCode = normalizeSetCode(rawSet);
      const cardNumber = normalizeCardNumber(rawNum);
      if (!setCode || !cardNumber) return null;

      if (dbIndex && dbIndex.size > 0) {
        const exact = dbIndex.get(`${setCode}-${cardNumber}`);
        if (exact) return exact;

        const normalizedNumber = /^\d+$/.test(cardNumber) ? (cardNumber.replace(/^0+/, '') || '0') : cardNumber;
        const normalized = dbIndex.get(`${setCode}-${normalizedNumber}`);
        if (normalized) return normalized;

        const padded = dbIndex.get(`${setCode}-${normalizedNumber.padStart(3, '0')}`);
        if (padded) return padded;
      }

      return dbMap[`${setCode}-${cardNumber}`]
        || dbMap[`${setCode}-${String(cardNumber).padStart(3, '0')}`]
        || dbMap[`${setCode}-${String(parseInt(cardNumber, 10) || cardNumber)}`]
        || null;
    }

    function findRowCardMatch(row, rawSet, rawNum) {
      const candidates = [];
      const seen = new Set();

      function addCandidate(setCode, cardNumber) {
        const normalizedSet = normalizeSetCode(setCode);
        const normalizedNumber = normalizeCardNumber(cardNumber);
        if (!normalizedSet || !normalizedNumber) return;
        const key = `${normalizedSet}-${normalizedNumber}`;
        if (seen.has(key)) return;
        seen.add(key);
        candidates.push({ set: normalizedSet, number: normalizedNumber });
      }

      addCandidate(rawSet, rawNum);

      Object.values(row || {}).forEach(value => {
        const parsed = parseSetNumberToken(value);
        if (parsed) addCandidate(parsed.set, parsed.number);
      });

      for (const candidate of candidates) {
        const card = matchCardBySetNumber(candidate.set, candidate.number);
        if (card) return { card, set: candidate.set, number: candidate.number };
      }

      return {
        card: null,
        set: normalizeSetCode(rawSet),
        number: normalizeCardNumber(rawNum)
      };
    }

    rows.forEach(row => {
        const rawName = (row[nameKey] || '').trim();
        let rawSet  = normalizeSetCode(row[setKey]);
        let rawNum  = normalizeCardNumber(row[numKey]);
        const qty   = parseQtyValue(row[qtyKey]);

        // Skip cards the user owns 0 of (Dex exports all variants, owned or not)
        if (qty === 0) return;

        // ── Dex TCG format: 'set' = full name (e.g. "Obsidian Flames"), 'id' = "sv3-27" ──
        // Resolve the full set name to the internal set code, and pull the card
        // number from the 'id' field, so "Obsidian Flames" + "sv3-27" → OBF-27.
        const rawIdCell = idKey ? (row[idKey] || '').trim() : '';
        const dexSetKey = normDexSetName(row[setKey] || '');
        const resolvedCode = dexSetKey ? (DEX_SET_NAME_MAP[dexSetKey] || null) : null;
        if (resolvedCode) {
            // Extract trailing number/alphanumeric from id field: "sv3-27" → "27"
            const idNumMatch = rawIdCell.match(/-([A-Za-z0-9]+)$/);
            const numberFromId = idNumMatch ? normalizeCardNumber(idNumMatch[1]) : rawNum;
            if (numberFromId) {
                rawSet = resolvedCode;
                rawNum = numberFromId;
            }
        }

        const rowMatch = findRowCardMatch(row, rawSet, rawNum);
        rawSet = rowMatch.set;
        rawNum = rowMatch.number;
        let card = rowMatch.card;

        // Fallback by name ONLY when we have NO set AND NO number info at all.
        // Never fall back to name-only if we have any identifying set/number info
        // (even if it didn't resolve), to prevent wrong cards from accumulating qty.
        if (!card && !rawSet && !rawNum && rawName) {
            if (window.cardIndexMap) {
                card = window.cardIndexMap.get(rawName) || window.cardIndexMap.get(rawName.toLowerCase());
            }
            if (!card && window.allCardsDatabase) {
                const lower = rawName.toLowerCase();
                card = window.allCardsDatabase.find(c => c.name && c.name.toLowerCase() === lower);
            }
        }

        if (card) {
            const cardId = `${card.name}|${card.set}|${card.number}`;
            matched.push({ cardId, qty, card, rawName, rawSet, rawNum });
        } else {
            unmatched.push({ rawName, rawSet, rawNum, qty });
        }
    });

      // Fallback for Dex exports that come without stable headers:
      // parse as plain rows and extract set-number token + integer quantity directly.
      if (matched.length === 0) {
        let plainRows = [];
        if (window.Papa) {
          const plainResult = Papa.parse(csvText, {
            header: false,
            skipEmptyLines: true,
            delimitersToGuess: [',', ';', '\t', '|']
          });
          plainRows = plainResult.data || [];
        } else {
          const lines = csvText.split(/\r?\n/).filter(l => l.trim());
          const delimiter = (lines[0] && lines[0].split(';').length > (lines[0].split(',').length)) ? ';' : ',';
          plainRows = lines.map(line => {
            const cells = [];
            let field = '', inQuote = false;
            for (let i = 0; i < line.length; i++) {
              const ch = line[i];
              if (ch === '"') inQuote = !inQuote;
              else if (ch === delimiter && !inQuote) { cells.push(field.trim()); field = ''; }
              else field += ch;
            }
            cells.push(field.trim());
            return cells;
          });
        }

        plainRows.forEach(rowArr => {
          if (!Array.isArray(rowArr) || rowArr.length === 0) return;
          const cells = rowArr.map(v => String(v || '').trim());

          let rawSet = '';
          let rawNum = '';
          let tokenIndex = -1;
          for (let i = 0; i < cells.length; i++) {
            const parsed = parseSetNumberToken(cells[i]);
            if (parsed) {
              rawSet = parsed.set;
              rawNum = parsed.number;
              tokenIndex = i;
              break;
            }
          }
          if (!rawSet || !rawNum) return;

          // Quantity: prefer pure integer cell close to the right side.
          let qty = 1;
          for (let i = cells.length - 1; i >= 0; i--) {
            if (/^\d+$/.test(cells[i])) {
              qty = Math.max(1, parseInt(cells[i], 10));
              break;
            }
          }

          const rawName = (tokenIndex >= 0 && cells[tokenIndex + 1]) ? cells[tokenIndex + 1] : '';
          const card = matchCardBySetNumber(rawSet, rawNum);

          if (card) {
            const cardId = `${card.name}|${card.set}|${card.number}`;
            matched.push({ cardId, qty, card, rawName, rawSet, rawNum });
          } else {
            unmatched.push({ rawName, rawSet, rawNum, qty });
          }
        });
      }

    const matchedMap = new Map();
    matched.forEach(entry => {
      const existing = matchedMap.get(entry.cardId);
      if (existing) {
        existing.qty += entry.qty;
      } else {
        matchedMap.set(entry.cardId, { ...entry });
      }
    });

    const unmatchedMap = new Map();
    unmatched.forEach(entry => {
      const key = `${entry.rawName || ''}|${entry.rawSet || ''}|${entry.rawNum || ''}`;
      const existing = unmatchedMap.get(key);
      if (existing) {
        existing.qty += entry.qty;
      } else {
        unmatchedMap.set(key, { ...entry });
      }
    });

    dexImportShowPreview([...matchedMap.values()], [...unmatchedMap.values()]);
}

function dexImportShowPreview(matched, unmatched) {
    const existing = document.getElementById('dexImportModal');
    if (existing) existing.remove();

    if (matched.length === 0 && unmatched.length === 0) {
        showNotification(getLang()==='de' ? 'CSV enthält keine lesbaren Einträge' : 'CSV contains no readable entries', 'error');
        return;
    }

    const modal = document.createElement('div');
    modal.id = 'dexImportModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.72);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;';

    const totalQty = matched.reduce((s, m) => s + m.qty, 0);
    const unmatchedBlock = unmatched.length > 0 ? `
        <details style="margin-bottom:12px;">
            <summary style="cursor:pointer;color:#856404;font-weight:600;padding:4px 0;">⚠️ ${unmatched.length} ${getLang()==='de' ? 'nicht gefundene Karten (anzeigen)' : 'unmatched cards (show)'}</summary>
            <ul style="font-size:11px;color:#666;max-height:130px;overflow-y:auto;margin-top:8px;padding-left:18px;">
                ${unmatched.map(u => `<li>${escapeHtml(u.rawName || '?')} (${escapeHtml(u.rawSet)} ${escapeHtml(u.rawNum)}) — ${u.qty}x</li>`).join('')}
            </ul>
        </details>` : '';

    const tableBlock = matched.length > 0 ? `
        <div style="max-height:220px;overflow-y:auto;border:1px solid #ddd;border-radius:8px;margin-bottom:14px;font-size:12px;">
            <table style="width:100%;border-collapse:collapse;">
                <thead><tr style="background:#667eea;color:#fff;position:sticky;top:0;">
                    <th style="padding:7px 10px;text-align:left;">${getLang()==='de' ? 'Karte' : 'Card'}</th>
                    <th style="padding:7px 6px;text-align:center;">Set</th>
                    <th style="padding:7px 6px;text-align:center;">${getLang()==='de' ? 'Nr.' : 'No.'}</th>
                    <th style="padding:7px 6px;text-align:center;">${getLang()==='de' ? 'Anzahl' : 'Qty'}</th>
                </tr></thead>
                <tbody>
                    ${matched.map((m, i) => `<tr style="background:${i % 2 ? '#f7f7f7' : '#fff'};">
                        <td style="padding:5px 10px;">${escapeHtml(m.card.name)}</td>
                        <td style="padding:5px 6px;text-align:center;">${escapeHtml(m.card.set)}</td>
                        <td style="padding:5px 6px;text-align:center;">${escapeHtml(m.card.number)}</td>
                        <td style="padding:5px 6px;text-align:center;font-weight:700;color:#27ae60;">${m.qty}×</td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>
        <div style="display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
            <button onclick="dexImportExecute('merge')"
                    style="flex:1;min-width:160px;background:linear-gradient(135deg,#27ae60,#1e8449);color:#fff;border:none;border-radius:8px;padding:12px 8px;font-size:13px;font-weight:700;cursor:pointer;line-height:1.4;">
              ${getLang()==='de' ? '🔀 Abgleichen (Merge)' : '🔀 Merge'}<br><small style="font-weight:400;opacity:.85;">${getLang()==='de' ? 'Importierte Mengen ersetzen, andere Karten bleiben' : 'Imported quantities replace existing, other cards remain'}</small>
            </button>
            <button onclick="dexImportExecute('replace')"
                    style="flex:1;min-width:160px;background:linear-gradient(135deg,#e74c3c,#c0392b);color:#fff;border:none;border-radius:8px;padding:12px 8px;font-size:13px;font-weight:700;cursor:pointer;line-height:1.4;">
                ${getLang()==='de' ? '🔄 Ersetzen (Replace)' : '🔄 Replace'}<br><small style="font-weight:400;opacity:.85;">${getLang()==='de' ? 'Kollektion komplett ersetzen' : 'Completely replace collection'}</small>
            </button>
        </div>` : `<p style="color:#888;text-align:center;">${getLang()==='de' ? 'Keine Karten in der Datenbank gefunden.' : 'No cards found in the database.'}</p>`;

    modal.innerHTML = `
        <div style="background:#fff;border-radius:14px;max-width:660px;width:100%;max-height:90vh;overflow-y:auto;padding:28px;box-shadow:0 20px 60px rgba(0,0,0,0.4);">
            <h2 style="margin-top:0;color:#667eea;margin-bottom:18px;">${getLang()==='de' ? '📥 Dex Import Vorschau' : '📥 Dex Import Preview'}</h2>
            <div style="display:flex;gap:12px;margin-bottom:18px;flex-wrap:wrap;">
                <div style="background:#d4edda;border-radius:8px;padding:10px 16px;flex:1;text-align:center;min-width:100px;">
                    <div style="font-size:1.6em;font-weight:900;color:#155724;">${matched.length}</div>
                    <div style="font-size:12px;color:#155724;">${getLang()==='de' ? 'Karten erkannt' : 'Cards recognized'}</div>
                </div>
                <div style="background:#d4edda;border-radius:8px;padding:10px 16px;flex:1;text-align:center;min-width:100px;">
                    <div style="font-size:1.6em;font-weight:900;color:#155724;">${totalQty}</div>
                    <div style="font-size:12px;color:#155724;">${getLang()==='de' ? 'Exemplare gesamt' : 'Total copies'}</div>
                </div>
                ${unmatched.length > 0 ? `<div style="background:#fff3cd;border-radius:8px;padding:10px 16px;flex:1;text-align:center;min-width:100px;">
                    <div style="font-size:1.6em;font-weight:900;color:#856404;">${unmatched.length}</div>
                    <div style="font-size:12px;color:#856404;">${getLang()==='de' ? 'Nicht gefunden' : 'Not found'}</div>
                </div>` : ''}
            </div>
            ${tableBlock}
            ${unmatchedBlock}
            <button onclick="document.getElementById('dexImportModal').remove()"
                    style="width:100%;background:#f0f0f0;border:none;border-radius:8px;padding:10px;cursor:pointer;font-size:13px;color:#555;margin-top:4px;">
                ${getLang()==='de' ? '✕ Abbrechen' : '✕ Cancel'}
            </button>
        </div>`;

    modal._matchedData = matched;
    document.body.appendChild(modal);
}

async function dexImportExecute(mode) {
    const modal = document.getElementById('dexImportModal');
    if (!modal || !modal._matchedData) return;
    const matched = modal._matchedData;
    const user = typeof auth !== 'undefined' ? auth.currentUser : null;
    if (!user) { showNotification(getLang()==='de' ? 'Bitte zuerst einloggen' : 'Please log in first', 'error'); return; }

    modal.remove();
    showNotification(getLang()==='de' ? 'Importiere Kollektion…' : 'Importing collection…', 'info');

    try {
        // Build the new in-memory state
        const newCollection = mode === 'replace' ? new Set() : new Set(window.userCollection || []);
        const newCounts     = mode === 'replace' ? new Map() : new Map(window.userCollectionCounts || []);

        matched.forEach(({ cardId, qty }) => {
          newCollection.add(cardId);
          // Merge behaves as a sync for imported entries: keep other cards,
          // but set imported card quantities to the imported value.
          newCounts.set(cardId, qty);
        });

        // Persist the full collectionCounts map so reload keeps exact imported quantities.
        const countsObj = {};
        newCounts.forEach((value, key) => {
          if (Number.isFinite(value) && value > 0) countsObj[key] = value;
        });

        const updateData = {
          collection: [...newCollection],
          collectionCounts: countsObj
        };

        await db.collection('users').doc(user.uid).set(updateData, { merge: true });

        window.userCollection      = newCollection;
        window.userCollectionCounts = newCounts;

        updateCollectionUI();
        const totalQty = matched.reduce((s, m) => s + m.qty, 0);
        showNotification(getLang()==='de' ? `✅ ${matched.length} Karten (${totalQty} Exemplare) importiert!` : `✅ ${matched.length} cards (${totalQty} copies) imported!`, 'success');
    } catch (err) {
        console.error('Dex import error:', err);
        showNotification((getLang()==='de' ? 'Fehler beim Import: ' : 'Import error: ') + err.message, 'error');
    }
}

window.dexImportOpenFilePicker = dexImportOpenFilePicker;
window.dexImportHandleFile     = dexImportHandleFile;
window.dexImportExecute        = dexImportExecute;
window.setCollectionSort       = setCollectionSort;
window.setCollectionFilter     = setCollectionFilter;
window.clearCollection         = clearCollection;
