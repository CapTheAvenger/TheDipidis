/**
 * Firebase Globals
 * ================
 * This file runs AFTER firebase-config.js (which is entirely replaced by a
 * GitHub secret on every deploy). All functions defined here OVERRIDE whatever
 * stale version the secret may have injected, ensuring the latest code always runs.
 *
 * auth.onAuthStateChanged is set up in the secret's firebase-config.js and calls
 * onUserSignedIn/onUserSignedOut by name at runtime → it picks up the definitions
 * below because they execute before any auth event fires.
 */

// Re-expose auth and db as globals (secret may not do window.auth = ...)
window.auth = firebase.auth();
window.db   = firebase.firestore();

// Safe defaults
if (!window.userDecks)     window.userDecks     = [];
if (!window.userCollection) window.userCollection = new Set();
if (!window.userWishlist)   window.userWishlist   = new Set();

// ---------------------------------------------------------------------------
// Auth state handlers  (override any version injected by secret)
// ---------------------------------------------------------------------------

onUserSignedIn = function(user) {
  const authPrompt    = document.getElementById('profile-auth-prompt');
  const profileContent = document.getElementById('profile-content');
  if (authPrompt)     authPrompt.style.display    = 'none';
  if (profileContent) profileContent.style.display = 'block';

  // Immediately populate from Auth data (no Firestore needed)
  const nameEl = document.getElementById('profile-user-name');
  if (nameEl) nameEl.textContent = user.displayName || user.email || 'User';

  const userBtn = document.querySelector('.user-btn');
  if (userBtn) {
    userBtn.textContent = '👤 Profile';
    userBtn.onclick = () => openTab('profile');
  }

  window.userCollection = new Set();
  window.userWishlist   = new Set();
  window.userDecks      = [];

  loadUserProfile(user.uid);
  loadUserCollection(user.uid);
  loadUserDecks(user.uid);
  loadUserWishlist(user.uid);
};

onUserSignedOut = function() {
  const authPrompt    = document.getElementById('profile-auth-prompt');
  const profileContent = document.getElementById('profile-content');
  if (authPrompt)     authPrompt.style.display    = 'block';
  if (profileContent) profileContent.style.display = 'none';

  const userBtn = document.querySelector('.user-btn');
  if (userBtn) {
    userBtn.innerHTML = '<img src="images/pokeball-icon.png" alt="" style="width:20px;height:20px;margin-right:5px;vertical-align:middle;">Sign In';
    userBtn.onclick = () => showAuthModal('signin');
  }
  clearUserData();
};

// ---------------------------------------------------------------------------
// Firestore data loaders  (override any version injected by secret)
// ---------------------------------------------------------------------------

loadUserProfile = async function(userId) {
  try {
    const doc = await window.db.collection('users').doc(userId).get();
    if (doc.exists) {
      const profile = doc.data();
      window.userProfile = profile;
      if (typeof updateProfileUI === 'function') updateProfileUI(profile);
    } else {
      await createUserProfile(userId);
    }
  } catch (error) {
    console.error('Error loading profile:', error);
    // Firestore unavailable — show what we have from Auth
    const user = window.auth.currentUser;
    if (user && typeof updateProfileUI === 'function') {
      updateProfileUI({ displayName: user.displayName || user.email || 'User', createdAt: null });
    }
  }
};

createUserProfile = async function(userId) {
  const user = window.auth.currentUser;
  const newProfile = {
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    displayName: user?.displayName || user?.email || 'Anonymous',
    collection: [],
    decks: [],
    wishlist: [],
    settings: { currency: 'EUR', language: 'en' }
  };
  try {
    await window.db.collection('users').doc(userId).set(newProfile);
    window.userProfile = newProfile;
    if (typeof updateProfileUI === 'function') updateProfileUI(newProfile);
  } catch (error) {
    console.error('Error creating profile:', error);
    window.userProfile = newProfile;
    if (typeof updateProfileUI === 'function') updateProfileUI(newProfile);
  }
};

loadUserCollection = async function(userId) {
  try {
    const doc = await window.db.collection('users').doc(userId).get();
    if (doc.exists) {
      window.userCollection = new Set(doc.data().collection || []);
      if (typeof updateCollectionUI === 'function') updateCollectionUI();
    }
  } catch (error) {
    console.error('Error loading collection:', error);
  }
};

loadUserWishlist = async function(userId) {
  try {
    const doc = await window.db.collection('users').doc(userId).get();
    if (doc.exists) {
      window.userWishlist = new Set(doc.data().wishlist || []);
      if (typeof updateWishlistUI === 'function') updateWishlistUI();
    }
  } catch (error) {
    console.error('Error loading wishlist:', error);
  }
};

loadUserDecks = async function(userId) {
  try {
    const snapshot = await window.db.collection('users').doc(userId).collection('decks').get();
    window.userDecks = [];
    snapshot.forEach(doc => window.userDecks.push({ id: doc.id, ...doc.data() }));
    if (typeof updateDecksUI === 'function') updateDecksUI();
  } catch (error) {
    console.error('Error loading decks:', error);
  }
};

clearUserData = function() {
  window.userProfile    = null;
  window.userCollection = new Set();
  window.userWishlist   = new Set();
  window.userDecks      = [];
};
