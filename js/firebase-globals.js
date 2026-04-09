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
  window.userDecks            = [];

  loadUserData(user.uid);
  loadUserDecks(user.uid);

  if (typeof flushBattleJournalOutbox === 'function') {
    flushBattleJournalOutbox(false);
  } else if (typeof renderBattleJournalSummary === 'function') {
    renderBattleJournalSummary();
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

      window.userCollection = new Set(mergedCollection);
      window.userCollectionCounts = new Map(Object.entries(counts));
      window.userCollection.forEach(cardId => {
        if (!window.userCollectionCounts.has(cardId)) {
          window.userCollectionCounts.set(cardId, 1);
        }
      });
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
      if (typeof updateWishlistUI === 'function') updateWishlistUI();
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
    // Sort newest first: prefer createdAt (Firestore Timestamp), fallback to createdAtMs
    window.userDecks.sort((a, b) => {
      const tsA = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : (a.createdAtMs || 0);
      const tsB = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : (b.createdAtMs || 0);
      return tsB - tsA;
    });
    if (typeof updateDecksUI === 'function') updateDecksUI();
  } catch (error) {
    console.error('Error loading decks:', error);
  }
}

function clearUserData() {
  window.userProfile          = null;
  window.userCollection       = new Set();
  window.userCollectionCounts = new Map();
  window.userWishlist         = new Set();
  window.userWishlistCounts  = new Map();
  window.userDecks            = [];
  window.deckFolders          = [];
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
