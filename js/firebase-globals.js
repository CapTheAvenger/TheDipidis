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

// Small helper: pull a key through the i18n layer if available; otherwise
// fall back to the literal string baked in at the call site. Used by the
// cloud-sync banner so the labels follow the active language instead of
// staying in German under EN.
function _csT(key, fallback) {
  if (typeof t === 'function') {
    var v = t(key);
    if (v && v !== key) return v;
  }
  return fallback;
}

// Friendly error labels for known persistence-failure codes.
// Without this map the banner just shows the raw code (e.g.
// 'failed-precondition', 'TypeError', 'api-removed') which doesn't
// tell a non-developer anything actionable.
function _getPersistErrLabel(code) {
  var map = {
    'failed-precondition': _csT('cloudSync.errPrecondition', 'another tab is using the cache'),
    'unimplemented':       _csT('cloudSync.errUnimplemented', 'browser does not support offline cache'),
    'api-removed':         _csT('cloudSync.errApiRemoved', 'SDK version without offline cache'),
    'init-threw':          _csT('cloudSync.errInitThrew', 'cache init failed'),
    'unknown':             _csT('cloudSync.errUnknown', 'unknown reason'),
  };
  return map[code] || code;
}

function updateCloudSyncStatus() {
  var online = (typeof navigator !== 'undefined') ? !!navigator.onLine : true;
  var mode = window.__firestorePersistenceMode || null;
  var enabled = window.__firestorePersistenceEnabled === true;
  var error = window.__firestorePersistenceError || null;
  var errLabel = error ? _getPersistErrLabel(error) : null;

  var detail;
  if (!online && !enabled) {
    detail = _csT('cloudSync.offlineCacheInactive', 'Offline · cache inactive') + ' (' + (errLabel || _csT('cloudSync.errUnknown', 'unknown reason')) + ')';
  } else if (!online && enabled) {
    detail = _csT('cloudSync.offlineCacheActive', 'Offline · cache active') + ' (' + mode + ')';
  } else if (online && enabled) {
    detail = _csT('cloudSync.onlineCacheActive', 'Online · cache active') + ' (' + mode + ')';
  } else if (online && !enabled) {
    detail = _csT('cloudSync.onlineCacheInactive', 'Online · cache inactive') + (errLabel ? ' (' + errLabel + ')' : '');
  } else {
    detail = _csT('cloudSync.initializing', 'Initializing…');
  }
  _renderCloudSyncStatus(detail);
}

async function forceCloudSync() {
  var btn = document.getElementById('cloud-sync-refresh-btn');
  if (btn) { btn.disabled = true; btn.textContent = _csT('cloudSync.syncing', 'Syncing…'); }
  try {
    if (!navigator.onLine) {
      _renderCloudSyncStatus(_csT('cloudSync.offlineNoServer', 'Offline · no server read possible'));
      return;
    }
    var user = window.auth && window.auth.currentUser;
    if (!user) {
      _renderCloudSyncStatus(_csT('cloudSync.notSignedIn', 'Not signed in'));
      return;
    }
    // Wait for persistence to be ready BEFORE the read so the fetched
    // documents actually land in IndexedDB. Without this guard the
    // user could tap the button before persistence enables and end up
    // with the same empty cache as before.
    if (window.__firestorePersistenceReady && typeof window.__firestorePersistenceReady.then === 'function') {
      try { await window.__firestorePersistenceReady; } catch (_) {}
    }
    _renderCloudSyncStatus(_csT('cloudSync.loadingProfile', 'Loading profile + decks from server…'));
    // forcePull bypasses the "mirror is authoritative" short-circuit
    // so this button actually re-fetches from the server, the entire
    // point of the manual sync action.
    if (typeof loadUserData === 'function') await loadUserData(user.uid);
    if (typeof loadUserDecks === 'function') await loadUserDecks(user.uid, { forcePull: true });
    var deckCount = (window.userDecks || []).length;
    var deckWord = deckCount === 1
      ? _csT('cloudSync.deckSingular', 'Deck')
      : _csT('cloudSync.deckPlural', 'Decks');

    // Second phase: refresh the tournament data bundle so the user
    // gets fresh scraper output on the same tap. The prefetcher's
    // bottom-right pill takes over the per-file progress; we just
    // surface "started" / "done" in the Cloud-Sync banner.
    if (window.__offlinePrefetch && typeof window.__offlinePrefetch.run === 'function') {
      _renderCloudSyncStatus(_csT('cloudSync.doneRefreshing', 'Sync complete') + ' · ' + deckCount + ' ' + deckWord + ' · ' + _csT('cloudSync.tournamentRefreshing', 'tournament data refreshing…'));
      // Fire-and-forget — the prefetcher manages its own pill UI and
      // the user can navigate away while it runs in the background.
      window.__offlinePrefetch.run({ refresh: true })
        .then(function () {
          _renderCloudSyncStatus(_csT('cloudSync.doneRefreshing', 'Sync complete') + ' · ' + deckCount + ' ' + deckWord + ' · ' + _csT('cloudSync.tournamentFresh', 'tournament data up to date'));
        })
        .catch(function () { /* prefetcher pill already shows errors */ });
    } else {
      _renderCloudSyncStatus(_csT('cloudSync.doneRefreshing', 'Sync complete') + ' · ' + deckCount + ' ' + deckWord + ' ' + _csT('cloudSync.inCache', 'in cache'));
    }
  } catch (err) {
    console.error('[forceCloudSync] failed:', err);
    _renderCloudSyncStatus(_csT('cloudSync.syncError', 'Sync error') + ': ' + (err && err.message ? err.message : err));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = _csT('cloudSync.syncNow', 'Sync now'); }
  }
}

// Keep the status fresh on connectivity changes + when persistence
// finally resolves (callers in firebase-config.js mutate the globals
// asynchronously). The `online` listener also pushes the mirror to
// the server so any edits / new decks created while offline back up
// the moment the network returns.
if (typeof window !== 'undefined') {
  window.addEventListener('online', function () {
    updateCloudSyncStatus();
    var user = window.auth && window.auth.currentUser;
    if (user && typeof _pushMirrorToServer === 'function') {
      _pushMirrorToServer(user.uid).catch(function () {});
    }
  });
  window.addEventListener('offline', updateCloudSyncStatus);
  // Re-render after persistence resolves so the user sees the real mode.
  if (window.__firestorePersistenceReady && typeof window.__firestorePersistenceReady.then === 'function') {
    window.__firestorePersistenceReady.then(updateCloudSyncStatus, updateCloudSyncStatus);
  }
  // Re-paint the banner when the user toggles language so the localized
  // labels swap immediately instead of waiting for the next persistence
  // event (which on a stable connection effectively never fires).
  document.addEventListener('languageChanged', updateCloudSyncStatus);
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

// Runs the legacy Prize Pack id migration once the PPS index is available.
// Mirrors _scheduleIntlIdMigration: migrate now if the data is already there,
// otherwise wait for resources to settle. Cheap no-op when nothing to migrate.
function _scheduleLegacyPrizePackMigration() {
  const hasLegacy = (set) => {
    if (!(set instanceof Set)) return false;
    for (const id of set) {
      if (typeof id === 'string' && /\|PPS\d+\|/.test(id)) return true;
    }
    return false;
  };
  if (!hasLegacy(window.userCollection) &&
      !hasLegacy(window.userWishlist) &&
      !hasLegacy(window.userTradelist)) return;

  const run = () => {
    if (typeof window.migrateLegacyPrizePackKeys !== 'function') return;
    Promise.resolve(window.migrateLegacyPrizePackKeys()).then(moved => {
      if (moved && typeof updateCollectionUI === 'function') updateCollectionUI();
    }).catch(err => console.error('[prizepack] migration failed:', err));
  };

  if (window.prizePackImagesIndex && Object.keys(window.prizePackImagesIndex).length) {
    run();
  } else {
    window.addEventListener('app:resources-settled', run, { once: true });
  }
}

async function loadUserData(userId) {
  // Paint last-known state from the mirror immediately so the user
  // sees their collection / wishlist instead of zeros while Firestore
  // is reached. Done unconditionally because navigator.onLine is
  // unreliable on iOS Safari standalone PWA — flight mode often
  // still reports `true` for a few seconds. The Firestore read
  // below overwrites the mirror with fresh data when it succeeds
  // (online), or silently no-ops on failure (offline, mirror keeps).
  _restoreUserDataBackup(userId);
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

      // Flatten the NESTED form back to flat card ids on the server, once.
      //
      // 185 card names contain a '.' ("Arceus LV.X", "Galarian Mr. Mime",
      // "Exp. Share"). update() parses a dotted string key as a field PATH, so
      // those were stored as real nesting:
      //     collectionCounts: { "Arceus LV": { "X|AR|94": 2 } }
      // flattenCountsObject reconstructs the correct flat id from that, so
      // reads have always worked. But the FieldPath writes introduced with
      // countFieldRef store the flat key literally, so both shapes can now
      // exist for the same card and which one wins depends on the order
      // Firestore returns the fields in. That is not something to leave
      // load-bearing. Write the flattened value under the flat key and drop
      // the nested parent — in that order, so a failed delete only leaves the
      // duplicate that is already there.
      async function collapseNestedCounts(fieldName, rawMap) {
        if (!rawMap || typeof rawMap !== 'object') return;
        const nestedParents = Object.keys(rawMap).filter(
          k => rawMap[k] && typeof rawMap[k] === 'object' && !Array.isArray(rawMap[k]));
        if (!nestedParents.length) return;
        const flat = flattenCountsObject(rawMap);
        try {
          const ref = window.db.collection('users').doc(userId);
          const FP = firebase.firestore.FieldPath;
          const args = [];
          Object.entries(flat).forEach(([cardId, val]) => {
            args.push(new FP(fieldName, cardId), val);
          });
          if (args.length) await ref.update(...args);
          const del = [];
          nestedParents.forEach(parent => {
            del.push(new FP(fieldName, parent), firebase.firestore.FieldValue.delete());
          });
          await ref.update(...del);
          console.info(`[${fieldName}] collapsed ${nestedParents.length} nested key(s) to flat card ids`);
        } catch (e) {
          console.warn(`[${fieldName}] could not collapse nested counts:`, e);
        }
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

      // One-time collapse of nested count keys (card names containing a '.').
      // Runs after all three lists are read, so a failure cannot interrupt the
      // load; it only ever touches documents that actually carry nesting.
      collapseNestedCounts('collectionCounts', data.collectionCounts);
      collapseNestedCounts('wishlistCounts', data.wishlistCounts);
      collapseNestedCounts('tradelistCounts', data.tradelistCounts);

      // Collection, wishlist and trade list are all populated now — remap any
      // legacy "Name|PPS{series}|{number}" ids to the set-qualified shape.
      // Needs data/prizepack_official_images.json, so wait for it if necessary.
      _scheduleLegacyPrizePackMigration();
      const tMinPrices = data.tradelistMinPrices || {};
      window.userTradelistMinPrices = new Map();
      if (typeof tMinPrices === 'object') {
        Object.entries(tMinPrices).forEach(([k, v]) => {
          const n = parseFloat(v);
          if (!isNaN(n) && n > 0) window.userTradelistMinPrices.set(k, n);
        });
      }
      if (typeof updateTradelistUI === 'function') updateTradelistUI();

      // Snapshot the populated in-memory state to the localStorage
      // mirror so the next offline boot has collection / wishlist /
      // tradelist / profile data even when Firestore IndexedDB
      // persistence is unavailable on this device.
      _writeUserDataBackup(userId);
      // Collection / wishlist / trade list now reflect the server. Anything
      // that REPLACES one of those maps wholesale must wait for this: writing
      // a "full" map built from an empty in-memory state would delete
      // everything the user owns.
      window.userDataLoaded = true;
    } else {
      await createUserProfile(userId);
      // A brand-new profile is legitimately empty — that is loaded, not unknown.
      window.userDataLoaded = true;
    }
  } catch (error) {
    console.error('Error loading user data:', error);
    // Offline-fallback: surface the last good snapshot so the user
    // doesn't see "0 Cards Owned · 0.00€" when their actual
    // collection is sitting on the server.
    if (!navigator.onLine) {
      var restored = _restoreUserDataBackup(userId);
      if (restored) return; // Restored — no need for the empty-profile UI below.
    }
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
function _userDataBackupKey(userId) {
  return 'tcg_userdata_backup_' + userId;
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

// Collection / wishlist / tradelist mirror — same rationale as the
// deck mirror, separate key. Snapshots the in-memory shape (Sets +
// Maps flattened to Array + Object) right after loadUserData so a
// later offline boot can put it back in place without a Firestore
// read.
function _writeUserDataBackup(userId) {
  if (!userId) return;
  try {
    var snapshot = {
      ts: Date.now(),
      userCollection: Array.from(window.userCollection || []),
      userCollectionCounts: window.userCollectionCounts ? Object.fromEntries(window.userCollectionCounts) : {},
      userWishlist: Array.from(window.userWishlist || []),
      userWishlistCounts: window.userWishlistCounts ? Object.fromEntries(window.userWishlistCounts) : {},
      userWishlistMaxPrices: window.userWishlistMaxPrices ? Object.fromEntries(window.userWishlistMaxPrices) : {},
      userTradelist: Array.from(window.userTradelist || []),
      userTradelistCounts: window.userTradelistCounts ? Object.fromEntries(window.userTradelistCounts) : {},
      userTradelistMinPrices: window.userTradelistMinPrices ? Object.fromEntries(window.userTradelistMinPrices) : {},
      userProfile: window.userProfile || null,
      deckFolders: window.deckFolders || []
    };
    localStorage.setItem(_userDataBackupKey(userId), JSON.stringify(snapshot));
  } catch (err) {
    console.warn('[userdataBackup] write failed:', err && err.message);
  }
}
function _restoreUserDataBackup(userId) {
  if (!userId) return false;
  try {
    var raw = localStorage.getItem(_userDataBackupKey(userId));
    if (!raw) return false;
    var s = JSON.parse(raw);
    if (!s) return false;
    window.userCollection         = new Set(s.userCollection || []);
    window.userCollectionCounts   = new Map(Object.entries(s.userCollectionCounts || {}));
    window.userWishlist           = new Set(s.userWishlist || []);
    window.userWishlistCounts     = new Map(Object.entries(s.userWishlistCounts || {}));
    window.userWishlistMaxPrices  = new Map(Object.entries(s.userWishlistMaxPrices || {}));
    window.userTradelist          = new Set(s.userTradelist || []);
    window.userTradelistCounts    = new Map(Object.entries(s.userTradelistCounts || {}));
    window.userTradelistMinPrices = new Map(Object.entries(s.userTradelistMinPrices || {}));
    window.userProfile            = s.userProfile || null;
    window.deckFolders            = Array.isArray(s.deckFolders) ? s.deckFolders : [];
    if (typeof updateCollectionUI === 'function') updateCollectionUI();
    if (typeof updateProfileUI === 'function' && window.userProfile) updateProfileUI(window.userProfile);
    console.info('[userdataBackup] restored', window.userCollection.size, 'collection +',
                 window.userWishlist.size, 'wishlist entries from localStorage (last sync',
                 new Date(s.ts).toISOString() + ')');
    return true;
  } catch (err) {
    console.warn('[userdataBackup] restore failed:', err && err.message);
    return false;
  }
}

// Push the entire deck mirror to Firestore in one batched write so any
// offline edits / additions made on this device land on the server.
// Uses set() WITHOUT merge so nested map fields (the deck's `cards`
// dictionary in particular) fully replace the server's copy — with
// {merge:true} Firestore would deep-merge `cards`, leaving deleted
// print keys stuck on the server after the user swapped them out
// locally (reported 2026-05-29 16:53). Single-device assumption:
// localStorage is the source of truth, the server is a backup target.
async function _pushMirrorToServer(userId) {
  if (!userId || !window.db || !firebase || !firebase.firestore) return;
  const mirror = _readDeckBackup(userId);
  if (!mirror || !Array.isArray(mirror.decks) || mirror.decks.length === 0) return;
  try {
    const deckCol = window.db.collection('users').doc(userId).collection('decks');
    const batch = window.db.batch();
    for (const d of mirror.decks) {
      if (!d.id) continue;
      const payload = Object.assign({}, d);
      delete payload.id;
      // Replace *Ms with real Firestore Timestamps so the server stores
      // sortable data, not a meaningless millisecond integer.
      if (payload.createdAtMs && !payload.createdAt) {
        payload.createdAt = firebase.firestore.Timestamp.fromMillis(payload.createdAtMs);
      }
      if (payload.updatedAtMs && !payload.updatedAt) {
        payload.updatedAt = firebase.firestore.Timestamp.fromMillis(payload.updatedAtMs);
      }
      batch.set(deckCol.doc(d.id), payload);
    }
    await batch.commit();
    console.info('[pushMirrorToServer] flushed', mirror.decks.length, 'decks to server');
  } catch (err) {
    console.warn('[pushMirrorToServer] batch.commit failed:', err && err.message);
  }
}

async function loadUserDecks(userId, opts) {
  opts = opts || {};
  const forcePull = opts.forcePull === true;

  // Paint mirror immediately (sync localStorage read). Mirror is the
  // source of truth on a single device — we never let a stale server
  // read clobber local edits that haven't synced yet.
  const mirror = _readDeckBackup(userId);
  const haveMirror = mirror && Array.isArray(mirror.decks) && mirror.decks.length > 0;
  if (haveMirror) {
    window.userDecks = mirror.decks.slice();
    if (typeof updateDecksUI === 'function') updateDecksUI();
  }

  // If we have a populated mirror and the caller didn't request a
  // forced server pull (Force Sync button), stop here. The auto-load
  // flow used to re-fetch on every app start, which lost any
  // unsynced offline edits the moment Firestore returned its older
  // server-side state on top of them.
  if (haveMirror && !forcePull) {
    // Best-effort: push the mirror to the server in the background so
    // edits made in earlier offline sessions back up whenever the
    // device is online. Fire-and-forget — failure doesn't affect UI.
    _pushMirrorToServer(userId).catch(function () {});
    return;
  }

  // First-time sign-in on this device (mirror empty) OR user tapped
  // Force Sync — pull from server.
  if (window.__firestorePersistenceReady && typeof window.__firestorePersistenceReady.then === 'function') {
    try { await window.__firestorePersistenceReady; } catch (_) {}
  }
  try {
    const snapshot = await window.db.collection('users').doc(userId).collection('decks').get();
    const fresh = [];
    snapshot.forEach(doc => fresh.push({ id: doc.id, ...doc.data({ serverTimestamps: 'estimate' }) }));
    fresh.sort((a, b) => {
      const tsA = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : (a.createdAtMs || 0);
      const tsB = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : (b.createdAtMs || 0);
      return tsB - tsA;
    });
    const fromCache = !!(snapshot.metadata && snapshot.metadata.fromCache);
    if (fresh.length > 0) {
      window.userDecks = fresh;
      _writeDeckBackup(userId, window.userDecks);
      if (typeof updateDecksUI === 'function') updateDecksUI();
    } else if (!fromCache) {
      // Server confirmed empty — only acceptable in the "no mirror"
      // branch, where we know the user genuinely has no decks here.
      window.userDecks = [];
      _writeDeckBackup(userId, []);
      if (typeof updateDecksUI === 'function') updateDecksUI();
    }
    // else: empty cache snapshot, leave whatever we painted.
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
