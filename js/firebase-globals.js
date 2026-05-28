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
// Cloud-sync status helpers
//
// Surfaces what's actually happening with Firestore offline persistence
// so the user can tell whether "0 Saved Decks" means "I have no decks"
// or "the cache is empty + I'm offline". Updates the small status
// block at the top of the Profile tab and powers the manual
// `forceCloudSync()` button.

function _renderCloudSyncStatus(detail) {
  var el = document.getElementById('cloud-sync-detail');
  if (el) el.textContent = detail;
}

function updateCloudSyncStatus() {
  var online = (typeof navigator !== 'undefined') ? !!navigator.onLine : true;
  var mode = window.__firestorePersistenceMode || null;
  var enabled = window.__firestorePersistenceEnabled === true;
  var error = window.__firestorePersistenceError || null;

  var detail;
  if (!online && !enabled) {
    detail = 'Offline · Cache nicht aktiv (' + (error || 'unbekannter Grund') + ')';
  } else if (!online && enabled) {
    detail = 'Offline · Cache aktiv (' + mode + ')';
  } else if (online && enabled) {
    detail = 'Online · Cache aktiv (' + mode + ')';
  } else if (online && !enabled) {
    detail = 'Online · Cache nicht aktiv' + (error ? ' (' + error + ')' : '');
  } else {
    detail = 'Initialisiere…';
  }
  _renderCloudSyncStatus(detail);
}

async function forceCloudSync() {
  var btn = document.getElementById('cloud-sync-refresh-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Synchronisiere…'; }
  try {
    if (!navigator.onLine) {
      _renderCloudSyncStatus('Offline · kein Server-Read möglich');
      return;
    }
    var user = window.auth && window.auth.currentUser;
    if (!user) {
      _renderCloudSyncStatus('Nicht angemeldet');
      return;
    }
    // Wait for persistence to be ready BEFORE the read so the fetched
    // documents actually land in IndexedDB. Without this guard the
    // user could tap the button before persistence enables and end up
    // with the same empty cache as before.
    if (window.__firestorePersistenceReady && typeof window.__firestorePersistenceReady.then === 'function') {
      try { await window.__firestorePersistenceReady; } catch (_) {}
    }
    _renderCloudSyncStatus('Lade Profil + Decks vom Server…');
    if (typeof loadUserData === 'function') await loadUserData(user.uid);
    if (typeof loadUserDecks === 'function') await loadUserDecks(user.uid);
    var deckCount = (window.userDecks || []).length;
    _renderCloudSyncStatus('Sync abgeschlossen · ' + deckCount + ' Deck' + (deckCount === 1 ? '' : 's') + ' im Cache');
  } catch (err) {
    console.error('[forceCloudSync] failed:', err);
    _renderCloudSyncStatus('Sync-Fehler: ' + (err && err.message ? err.message : err));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Jetzt synchronisieren'; }
  }
}

// Keep the status fresh on connectivity changes + when persistence
// finally resolves (callers in firebase-config.js mutate the globals
// asynchronously).
if (typeof window !== 'undefined') {
  window.addEventListener('online', updateCloudSyncStatus);
  window.addEventListener('offline', updateCloudSyncStatus);
  // Re-render after persistence resolves so the user sees the real mode.
  if (window.__firestorePersistenceReady && typeof window.__firestorePersistenceReady.then === 'function') {
    window.__firestorePersistenceReady.then(updateCloudSyncStatus, updateCloudSyncStatus);
  }
  // Initial paint on next tick (DOM may not be ready when this file loads).
  setTimeout(updateCloudSyncStatus, 0);
}

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
  // Wait for IndexedDB persistence to be enabled before issuing the
  // read. Without this, a sign-in that fires before the persistence
  // Promise resolves can hit the server and complete without ever
  // populating the local cache — so the next offline load sees an
  // empty Firestore snapshot even though the user has decks /
  // collection on the server. The Promise resolves to true / false
  // either way so we never block forever.
  if (window.__firestorePersistenceReady && typeof window.__firestorePersistenceReady.then === 'function') {
    try { await window.__firestorePersistenceReady; } catch (_) {}
  }
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

// localStorage backup for saved decks — belt-and-braces fallback
// when Firestore's IndexedDB persistence is misbehaving (iOS Safari
// PWA users see 'init-threw' on enableMultiTabIndexedDbPersistence
// and even enableIndexedDbPersistence throws synchronously, leaving
// the SDK with no offline cache at all). With the mirror enabled,
// every successful online read writes decks to localStorage too;
// when the user opens offline and Firestore returns empty, we
// restore from the mirror so saved decks are still visible.
// localStorage's per-origin quota is ~5 MB which fits hundreds of
// decks comfortably (each deck ~2-5 KB JSON).
function _deckBackupKey(userId) {
  return 'tcg_decks_backup_' + userId;
}
function _writeDeckBackup(userId, decks) {
  if (!userId || !Array.isArray(decks)) return;
  try {
    // Firestore Timestamps don't survive JSON.stringify cleanly — replace
    // with millisecond fields the existing sort path already understands.
    var serializable = decks.map(function (d) {
      var copy = Object.assign({}, d);
      if (d.createdAt && typeof d.createdAt.toMillis === 'function') {
        copy.createdAtMs = d.createdAt.toMillis();
        delete copy.createdAt;
      }
      if (d.updatedAt && typeof d.updatedAt.toMillis === 'function') {
        copy.updatedAtMs = d.updatedAt.toMillis();
        delete copy.updatedAt;
      }
      return copy;
    });
    localStorage.setItem(_deckBackupKey(userId), JSON.stringify({
      ts: Date.now(),
      decks: serializable
    }));
  } catch (err) {
    // QuotaExceededError is the realistic failure mode at this scale.
    // We swallow it — the in-memory + Firestore state are still correct.
    console.warn('[deckBackup] write failed:', err && err.message);
  }
}
function _readDeckBackup(userId) {
  if (!userId) return null;
  try {
    var raw = localStorage.getItem(_deckBackupKey(userId));
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.decks)) return null;
    return parsed;
  } catch (_) { return null; }
}

async function loadUserDecks(userId) {
  // Same persistence-ready guard as loadUserData — without it, an
  // early read can bypass IndexedDB and leave the offline cache
  // empty (saved decks invisible after the next cold start).
  if (window.__firestorePersistenceReady && typeof window.__firestorePersistenceReady.then === 'function') {
    try { await window.__firestorePersistenceReady; } catch (_) {}
  }
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

    // If we got decks from Firestore (online OR via the IndexedDB
    // cache when persistence happens to work), keep the localStorage
    // mirror up to date. If we got zero AND we're offline, restore
    // from the mirror so the user isn't staring at "No saved Decks".
    if (window.userDecks.length > 0) {
      _writeDeckBackup(userId, window.userDecks);
    } else if (!navigator.onLine) {
      const backup = _readDeckBackup(userId);
      if (backup && backup.decks.length > 0) {
        window.userDecks = backup.decks.slice();
        console.info('[loadUserDecks] Firestore returned empty offline; restored',
                     window.userDecks.length, 'decks from localStorage mirror (last sync',
                     new Date(backup.ts).toISOString() + ')');
      }
    }

    if (typeof updateDecksUI === 'function') updateDecksUI();
  } catch (error) {
    console.error('Error loading decks:', error);
    // Final fallback — Firestore .get() itself rejected (e.g. offline
    // and no cache at all). Surface the mirror if we have one.
    if (!navigator.onLine) {
      const backup = _readDeckBackup(userId);
      if (backup && backup.decks.length > 0) {
        window.userDecks = backup.decks.slice();
        console.info('[loadUserDecks] Firestore threw; using localStorage mirror with',
                     window.userDecks.length, 'decks');
        if (typeof updateDecksUI === 'function') updateDecksUI();
      }
    }
  }
}

function clearUserData() {
  window.userProfile          = null;
  window.userCollection       = new Set();
  window.userCollectionCounts = new Map();
  window.userWishlist         = new Set();
  window.userWishlistCounts  = new Map();
  window.userWishlistMaxPrices = new Map();
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
