// @ts-check
/**
 * Firebase Globals
 * ================
 * Runs after firebase-config.js. Exposes auth/db as globals and defines all
 * Firebase-related logic functions. This file is NEVER overwritten by CI.
 *
 * Script load order:
 *   firebase-credentials.js  → sets window.FIREBASE_CREDS
 *   firebase-collection.js   → collection/wishlist CRUD
 *   firebase-config.js       → initializeApp + onAuthStateChanged
 *   firebase-globals.js      → this file (window.auth, window.db, all handlers)
 *   firebase-auth.js         → signIn/signUp/signOut helpers
 */

window.auth = firebase.auth();
window.db   = firebase.firestore();

if (!window.userDecks)            window.userDecks            = [];
if (!window.userCollection)       window.userCollection       = new Set();
if (!window.userCollectionCounts) window.userCollectionCounts = new Map();
if (!window.userWishlist)         window.userWishlist         = new Set();
if (!window.userWishlistCounts)  window.userWishlistCounts  = new Map();
if (!window.userWishlistMaxPrices) window.userWishlistMaxPrices = new Map();
if (!window.userTradelist)       window.userTradelist       = new Set();
if (!window.userTradelistCounts) window.userTradelistCounts = new Map();
if (!window.userTradelistMinPrices) window.userTradelistMinPrices = new Map();
if (!window.deckFolders)          window.deckFolders          = [];

// ---------------------------------------------------------------------------
// Auth state handlers
// ---------------------------------------------------------------------------

function onUserSignedIn(user) {
  const authPrompt     = document.getElementById('profile-auth-prompt');
  const profileContent = document.getElementById('profile-content');
  // Use classList so the change wins against `display: none !important` from the .display-none utility class
  if (authPrompt)     { authPrompt.classList.add('display-none');    authPrompt.classList.remove('display-block'); }
  if (profileContent) { profileContent.classList.remove('display-none'); profileContent.classList.add('display-block'); }

  // Show name/email immediately from Auth (no Firestore round-trip needed)
  const nameEl = document.getElementById('profile-user-name');
  if (nameEl) nameEl.textContent = user.displayName || user.email || 'User';

  // Toggle header auth UI: hide sign-in button, show user-info bar
  const signinBtn = document.getElementById('signin-btn');
  const userInfoBar = document.getElementById('user-info');
  if (signinBtn) signinBtn.classList.add('signin-btn-hidden');
  if (userInfoBar) { userInfoBar.classList.remove('user-info-hidden'); userInfoBar.style.display = 'flex'; }

  const emailDisplay = document.getElementById('user-email-display');
  if (emailDisplay) emailDisplay.textContent = user.displayName || user.email || '';

  window.userCollection       = new Set();
  window.userCollectionCounts = new Map();
  window.userWishlist         = new Set();
  window.userWishlistCounts  = new Map();
  window.userWishlistMaxPrices = new Map();
  window.userTradelist       = new Set();
  window.userTradelistCounts = new Map();
  window.userTradelistMinPrices = new Map();
  window.userDecks            = [];

  // Wave-1 stores: fan out the auth snapshot to userStore so new
  // ES-module subscribers see the signed-in state. Legacy window.*
  // mutations above continue unchanged.
  if (/** @type {any} */ (window).userStore) {
    /** @type {any} */ (window).userStore.setAuth({
      uid: user.uid,
      email: user.email || null,
      displayName: user.displayName || null,
    });
    /** @type {any} */ (window).userStore.setDecks([]);
    /** @type {any} */ (window).userStore.setCollectionCounts({});
    /** @type {any} */ (window).userStore.setWishlist([], {});
    /** @type {any} */ (window).userStore.setLoaded(false);
  }

  loadUserData(user.uid);
  loadUserDecks(user.uid);

  if (typeof flushBattleJournalOutbox === 'function') {
    flushBattleJournalOutbox(false);
  } else if (typeof renderBattleJournalSummary === 'function') {
    renderBattleJournalSummary();
  }

  // B-48 hotfix: if the user clicked "Save Deck" before signing in,
  // saveCurrentDeckToProfile stored the source. Retry it now that they're
  // authenticated, so the user doesn't have to find the Save button again
  // after the auth modal closes.
  if (window._pendingDeckSaveSource && typeof saveCurrentDeckToProfile === 'function') {
    const pendingSource = window._pendingDeckSaveSource;
    window._pendingDeckSaveSource = null;
    // Small defer so loadUserDecks has had a tick to mutate window.userDecks,
    // avoiding a duplicate-name overwrite warning on the same deck.
    setTimeout(() => { saveCurrentDeckToProfile(pendingSource); }, 50);
  }
}

function onUserSignedOut() {
  const authPrompt     = document.getElementById('profile-auth-prompt');
  const profileContent = document.getElementById('profile-content');
  // Use classList to match the initial HTML state and respect !important CSS rules
  if (authPrompt)     { authPrompt.classList.remove('display-none');  authPrompt.classList.add('display-block'); }
  if (profileContent) { profileContent.classList.add('display-none');    profileContent.classList.remove('display-block'); }

  // Toggle header auth UI: show sign-in button, hide user-info bar
  const signinBtn = document.getElementById('signin-btn');
  const userInfoBar = document.getElementById('user-info');
  if (signinBtn) signinBtn.classList.remove('signin-btn-hidden');
  if (userInfoBar) { userInfoBar.classList.add('user-info-hidden'); userInfoBar.style.display = ''; }

  // Reset profile button label back to i18n default
  const emailDisplay = document.getElementById('user-email-display');
  if (emailDisplay) {
    const lang = (document.documentElement.lang || 'en').toLowerCase();
    emailDisplay.textContent = lang.startsWith('de') ? 'Mein Profil' : 'My Profile';
  }

  clearUserData();

  // Cleanup any active multiplayer listeners to avoid Firestore cost leaks
  if (typeof leaveMultiplayerGame === 'function') {
    try { leaveMultiplayerGame(); } catch (_) { /* ignore if no active game */ }
  }

  if (typeof renderBattleJournalSummary === 'function') {
    renderBattleJournalSummary();
  }
}

// ---------------------------------------------------------------------------
// Firestore data loaders
// ---------------------------------------------------------------------------

// ── Deferred migration: fix broken "intl:" card IDs once card DB is ready ──
function _runIntlIdMigration(userId) {
  if (!window.userCollection) return;
  var brokenIds = [];
  window.userCollection.forEach(function(id) { if (id.startsWith('intl:')) brokenIds.push(id); });
  if (brokenIds.length === 0) return;

  if (!Array.isArray(window.allCardsDatabase) || window.allCardsDatabase.length === 0) {
    console.warn('[Collection] intl: migration – allCardsDatabase not loaded, aborting');
    return;
  }

  console.log('[Collection] Migrating', brokenIds.length, 'broken intl: card IDs…');

  // Build a name-lookup map (lowercase name → card) for "intl:cardname" entries
  var nameMap = {};
  window.allCardsDatabase.forEach(function(c) {
    var n = String(c.name || c.name_en || '').trim().toLowerCase();
    if (n && !nameMap[n]) nameMap[n] = c; // first match wins (usually latest set)
  });

  var idx = window.cardIndexBySetNumber; // Map for "intl:SET-NUM" entries
  var migrateUpdates = {};
  var migrateRemoveCounts = {};
  var migratedCount = 0;

  brokenIds.forEach(function(brokenId) {
    var raw = brokenId.substring(5); // strip "intl:"
    var card = null;

    // Format A: "intl:SET-NUM" (e.g. intl:PRE-116)
    var setNumMatch = raw.match(/^([A-Z0-9]+)-(\d+)$/i);
    if (setNumMatch) {
      var setCode = setNumMatch[1].toUpperCase();
      var number = setNumMatch[2];
      if (idx instanceof Map && idx.size > 0) {
        card = idx.get(setCode + '-' + number)
          || idx.get(setCode + '-' + (number.replace(/^0+/, '') || '0'));
      }
      if (!card) {
        card = window.allCardsDatabase.find(function(c) {
          return String(c.set || '').toUpperCase() === setCode && String(c.number) === number;
        });
      }
    }

    // Format B: "intl:cardname" (e.g. intl:max rod)
    if (!card) {
      var nameLower = raw.toLowerCase().trim();
      card = nameMap[nameLower];
      // Also try with " ex" suffix variations
      if (!card && !nameLower.endsWith(' ex')) {
        card = nameMap[nameLower + ' ex'];
      }
    }

    if (!card) {
      console.warn('[Collection] Cannot resolve:', brokenId);
      return;
    }

    var correctId = (card.name || card.name_en || '') + '|' + (card.set || '') + '|' + (card.number || '');
    var qty = window.userCollectionCounts ? (window.userCollectionCounts.get(brokenId) || 1) : 1;
    qty = Math.min(qty, 4);

    console.log('[Collection] Migrating:', brokenId, '→', correctId);

    // In-memory fix
    window.userCollection.delete(brokenId);
    if (window.userCollectionCounts) window.userCollectionCounts.delete(brokenId);
    window.userCollection.add(correctId);
    if (window.userCollectionCounts) window.userCollectionCounts.set(correctId, qty);

    // Firestore batch
    migrateRemoveCounts['collectionCounts.' + brokenId] = firebase.firestore.FieldValue.delete();
    migrateUpdates['collectionCounts.' + correctId] = qty;
    migratedCount++;
  });

  if (migratedCount > 0) {
    migrateUpdates.collection = Array.from(window.userCollection);
    var docRef = window.db.collection('users').doc(userId);
    docRef.update(migrateUpdates).then(function() {
      return docRef.update(migrateRemoveCounts);
    }).then(function() {
      console.log('[Collection] Migrated', migratedCount, 'broken intl: IDs');
      if (typeof updateCollectionUI === 'function') updateCollectionUI();
    }).catch(function(err) {
      console.warn('[Collection] intl: migration write failed:', err);
    });

    // Immediately refresh UI with corrected in-memory data
    if (typeof updateCollectionUI === 'function') updateCollectionUI();
  }
}

function _scheduleIntlIdMigration(userId) {
  if (!window.userCollection) return;
  var hasBroken = false;
  window.userCollection.forEach(function(id) { if (id.startsWith('intl:')) hasBroken = true; });
  if (!hasBroken) return;

  // If card DB is already loaded, migrate now
  if (window.cardIndexBySetNumber instanceof Map && window.cardIndexBySetNumber.size > 0) {
    _runIntlIdMigration(userId);
    return;
  }
  // Otherwise wait for resources to settle
  window.addEventListener('app:resources-settled', function() {
    _runIntlIdMigration(userId);
  }, { once: true });
}

async function loadUserData(userId) {
  try {
    const doc = await window.db.collection('users').doc(userId).get();
    if (doc.exists) {
      const data = doc.data();

      function flattenCountsObject(input, prefix = '', out = {}) {
        if (!input || typeof input !== 'object') return out;
        Object.entries(input).forEach(([key, value]) => {
          const nextKey = prefix ? `${prefix}.${key}` : key;
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            flattenCountsObject(value, nextKey, out);
            return;
          }
          const parsed = parseInt(value, 10);
          if (!isNaN(parsed) && parsed > 0) out[nextKey] = parsed;
        });
        return out;
      }

      // Collection
      const rawCollection = Array.isArray(data.collection) ? data.collection.filter(v => typeof v === 'string' && v.includes('|')) : [];
      const counts = flattenCountsObject(data.collectionCounts || {});

      // Recover counts stored as top-level dotted fields (legacy bug:
      // set({merge:true}) with "collectionCounts.X" stored a literal
      // top-level field instead of a nested path under collectionCounts).
      const CC_PREFIX = 'collectionCounts.';
      let hasDottedLegacy = false;
      for (const key of Object.keys(data)) {
        if (key.startsWith(CC_PREFIX)) {
          const cardId = key.substring(CC_PREFIX.length);
          const val = parseInt(data[key], 10);
          if (!isNaN(val) && val > 0 && !(cardId in counts)) {
            counts[cardId] = val;
            hasDottedLegacy = true;
          }
        }
      }

      // Migrate legacy dotted fields → nested collectionCounts (one-time)
      if (hasDottedLegacy) {
        try {
          const migrateUp = {};
          const migrateDel = {};
          for (const key of Object.keys(data)) {
            if (key.startsWith(CC_PREFIX)) {
              const cardId = key.substring(CC_PREFIX.length);
              const val = parseInt(data[key], 10);
              if (!isNaN(val) && val > 0) {
                migrateUp[`collectionCounts.${cardId}`] = val;
              }
              migrateDel[key] = firebase.firestore.FieldValue.delete();
            }
          }
          // update() interprets dots as nested paths → writes correct structure
          const docRef = window.db.collection('users').doc(userId);
          await docRef.update(migrateUp);
          // Delete the legacy top-level dotted fields via set({merge:true})
          // (set treats the dot as a literal key name → targets the right field)
          await docRef.set(migrateDel, { merge: true });
          console.log('[Collection] Migrated', Object.keys(migrateUp).length, 'legacy dotted count fields');
        } catch (migErr) {
          console.warn('[Collection] Migration of dotted fields failed:', migErr);
        }
      }

      const countKeys = Object.keys(counts);
      const mergedCollection = rawCollection.length > 0 ? rawCollection : countKeys;

      // Clamp any count > 4 back to 4 (data corruption from legacy set({merge:true}) bug)
      const clampFixes = {};
      for (const [cardId, val] of Object.entries(counts)) {
        if (val > 4) {
          counts[cardId] = 4;
          clampFixes[`collectionCounts.${cardId}`] = 4;
        }
      }
      if (Object.keys(clampFixes).length > 0) {
        try {
          await window.db.collection('users').doc(userId).update(clampFixes);
          console.log('[Collection] Clamped', Object.keys(clampFixes).length, 'counts that exceeded 4');
        } catch (clampErr) {
          console.warn('[Collection] Clamp write failed:', clampErr);
        }
      }

      window.userCollection = new Set(mergedCollection);
      window.userCollectionCounts = new Map(Object.entries(counts));
      window.userCollection.forEach(cardId => {
        if (!window.userCollectionCounts.has(cardId)) {
          window.userCollectionCounts.set(cardId, 1);
        }
      });
      // Wave-1 stores: fan out to userStore so subscribers see the load.
      if (/** @type {any} */ (window).userStore) {
        /** @type {any} */ (window).userStore.setCollectionCounts(
          Object.fromEntries(window.userCollectionCounts)
        );
      }

      // ── Migrate broken "intl:SET-NUM|SET-NUM" card IDs to "Name|SET|NUMBER" ──
      // (Meta Binder + button used internal familyKey instead of proper cardId)
      // Must run AFTER card DB is loaded so we can resolve names.
      _scheduleIntlIdMigration(userId);

      if (typeof updateCollectionUI === 'function') updateCollectionUI();

      // Profile (render after collection is loaded so cards/value are correct)
      window.userProfile = data;
      window.deckFolders = Array.isArray(data.deckFolders) ? data.deckFolders.filter(Boolean) : [];
      if (typeof updateProfileUI === 'function') updateProfileUI(data);

      // Wishlist
      window.userWishlist = new Set(data.wishlist || []);
      const wCounts = data.wishlistCounts || {};
      window.userWishlistCounts = new Map();
      if (typeof wCounts === 'object') {
        Object.entries(wCounts).forEach(([k, v]) => {
          const n = parseInt(v, 10);
          if (!isNaN(n) && n > 0) window.userWishlistCounts.set(k, n);
        });
      }
      // Ensure every wishlist entry has at least count 1
      window.userWishlist.forEach(cardId => {
        if (!window.userWishlistCounts.has(cardId)) {
          window.userWishlistCounts.set(cardId, 1);
        }
      });
      // Wave-1 stores: fan out the wishlist+counts to subscribers.
      if (/** @type {any} */ (window).userStore) {
        /** @type {any} */ (window).userStore.setWishlist(
          Array.from(window.userWishlist),
          Object.fromEntries(window.userWishlistCounts)
        );
      }
      // Wishlist max prices (budget per card)
      const wMaxPrices = data.wishlistMaxPrices || {};
      window.userWishlistMaxPrices = new Map();
      if (typeof wMaxPrices === 'object') {
        Object.entries(wMaxPrices).forEach(([k, v]) => {
          const n = parseFloat(v);
          if (!isNaN(n) && n > 0) window.userWishlistMaxPrices.set(k, n);
        });
      }
      if (typeof updateWishlistUI === 'function') updateWishlistUI();

      // Tradelist
      window.userTradelist = new Set(data.tradelist || []);
      const tCounts = data.tradelistCounts || {};
      window.userTradelistCounts = new Map();
      if (typeof tCounts === 'object') {
        Object.entries(tCounts).forEach(([k, v]) => {
          const n = parseInt(v, 10);
          if (!isNaN(n) && n > 0) window.userTradelistCounts.set(k, n);
        });
      }
      window.userTradelist.forEach(cardId => {
        if (!window.userTradelistCounts.has(cardId)) {
          window.userTradelistCounts.set(cardId, 1);
        }
      });
      const tMinPrices = data.tradelistMinPrices || {};
      window.userTradelistMinPrices = new Map();
      if (typeof tMinPrices === 'object') {
        Object.entries(tMinPrices).forEach(([k, v]) => {
          const n = parseFloat(v);
          if (!isNaN(n) && n > 0) window.userTradelistMinPrices.set(k, n);
        });
      }
      if (typeof updateTradelistUI === 'function') updateTradelistUI();
    } else {
      await createUserProfile(userId);
    }
  } catch (error) {
    console.error('Error loading user data:', error);
    const user = window.auth.currentUser;
    if (user && typeof updateProfileUI === 'function') {
      updateProfileUI({ displayName: user.displayName || user.email || 'User', createdAt: null });
    }
  }
}

// Legacy wrappers kept for external callers
async function loadUserProfile(userId) { return loadUserData(userId); }
async function loadUserCollection(userId) { return loadUserData(userId); }
async function loadUserWishlist(userId) { return loadUserData(userId); }

async function createUserProfile(userId) {
  const user = window.auth.currentUser;
  const newProfile = {
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    displayName: user?.displayName || user?.email || 'Anonymous',
    collection: [],
    decks: [],
    wishlist: [],
    wishlistCounts: {},
    deckFolders: [],
    settings: { currency: 'EUR', language: 'en' }
  };
  try {
    await window.db.collection('users').doc(userId).set(newProfile);
  } catch (error) {
    console.error('Error creating profile:', error);
  }
  window.userProfile = newProfile;
  if (typeof updateProfileUI === 'function') updateProfileUI(newProfile);
}

async function loadUserDecks(userId) {
  try {
    const snapshot = await window.db.collection('users').doc(userId).collection('decks').get();
    window.userDecks = [];
    snapshot.forEach(doc => window.userDecks.push({ id: doc.id, ...doc.data({ serverTimestamps: 'estimate' }) }));
    _sortUserDecksInPlace();
    if (typeof updateDecksUI === 'function') updateDecksUI();
    // Wave-1 stores: fan out decks + flag the load as complete.
    if (/** @type {any} */ (window).userStore) {
      /** @type {any} */ (window).userStore.setDecks(window.userDecks);
      /** @type {any} */ (window).userStore.setLoaded(true);
    }
  } catch (error) {
    console.error('Error loading decks:', error);
  }
}

// Same sort order as loadUserDecks — extracted so patchUserDecksLocal reuses it.
function _sortUserDecksInPlace() {
  if (!Array.isArray(window.userDecks)) return;
  window.userDecks.sort((a, b) => {
    const tsA = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : (a.createdAtMs || 0);
    const tsB = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : (b.createdAtMs || 0);
    return tsB - tsA;
  });
}

// Local-only patch of window.userDecks (B-3 hotfix).
//
// Replaces the previous "await loadUserDecks(user.uid)" pattern which did a
// full collection.get() round-trip after every save/delete/duplicate — that
// was N reads per click, where N is the user's deck count. Power users with
// 60+ decks burned ~30% of the daily Firestore Free Tier quota in a single
// save-rename-save session.
//
// Operations:
//   add    — payload is the deck object including {id, name, cards, ...}
//   update — payload is the deck object (id used to find & replace)
//   delete — payload is the deck id (string)
//
// The local representation diverges from server temporarily on the
// updatedAt / createdAt Timestamp fields (we don't have the server-resolved
// value until next read), but every other field is identical. Calling code
// MUST pass a sane local createdAtMs for new decks so the sort stays stable.
function patchUserDecksLocal(operation, payload) {
  if (!Array.isArray(window.userDecks)) window.userDecks = [];
  switch (operation) {
    case 'add': {
      if (!payload || !payload.id) return;
      const localCreatedAtMs = payload.createdAtMs || Date.now();
      window.userDecks.push({ ...payload, createdAtMs: localCreatedAtMs });
      break;
    }
    case 'update': {
      if (!payload || !payload.id) return;
      const idx = window.userDecks.findIndex(d => d.id === payload.id);
      if (idx >= 0) {
        window.userDecks[idx] = { ...window.userDecks[idx], ...payload };
      }
      break;
    }
    case 'delete': {
      const id = typeof payload === 'string' ? payload : (payload && payload.id);
      if (!id) return;
      window.userDecks = window.userDecks.filter(d => d.id !== id);
      break;
    }
    default:
      return;
  }
  _sortUserDecksInPlace();
  if (typeof updateDecksUI === 'function') updateDecksUI();
  // Wave-1 stores: fan out the mutated decks list.
  if (/** @type {any} */ (window).userStore) {
    /** @type {any} */ (window).userStore.setDecks(window.userDecks);
  }
}
window.patchUserDecksLocal = patchUserDecksLocal;

function clearUserData() {
  window.userProfile          = null;
  window.userCollection       = new Set();
  window.userCollectionCounts = new Map();
  window.userWishlist         = new Set();
  window.userWishlistCounts  = new Map();
  window.userWishlistMaxPrices = new Map();
  window.userDecks            = [];
  window.deckFolders          = [];
  // Drop any pending B-48 retry — user signed out, don't auto-save next login.
  window._pendingDeckSaveSource = null;
  // Wave-1 stores: notify userStore subscribers of the sign-out.
  if (/** @type {any} */ (window).userStore) {
    /** @type {any} */ (window).userStore.reset();
  }
}

function syncAuthUiFromPendingOrCurrentState() {
  // Prefer queued auth state from firebase-config.js callback if handlers were not ready yet.
  if (window.__pendingAuthUser !== undefined) {
    const pendingUser = window.__pendingAuthUser;
    if (pendingUser) {
      onUserSignedIn(pendingUser);
    } else {
      onUserSignedOut();
    }
    console.info('[Auth] Applied queued auth state in firebase-globals');
    delete window.__pendingAuthUser;
    return;
  }

  // Fallback: synchronize once from current Firebase auth state.
  const currentUser = window.auth?.currentUser || null;
  if (currentUser) {
    onUserSignedIn(currentUser);
    console.info('[Auth] Synced header UI from current signed-in user');
  } else {
    onUserSignedOut();
    console.info('[Auth] Synced header UI for signed-out state');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', syncAuthUiFromPendingOrCurrentState, { once: true });
} else {
  syncAuthUiFromPendingOrCurrentState();
}
