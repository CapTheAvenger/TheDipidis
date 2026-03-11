/**
 * Firebase Configuration
 * =====================
 * 
 * SETUP INSTRUCTIONS:
 * 1. Go to https://console.firebase.google.com/
 * 2. Create new project: "Pokemon TCG Analysis"
 * 3. Add Web App (</> icon)
 * 4. Copy the config object and replace the values below
 * 5. Enable Authentication: Email/Password + Google
 * 6. Enable Firestore Database
 * 
 * DEPLOYMENT NOTE:
 * This file contains placeholder values. The real config is injected
 * at deployment time via the FIREBASE_CONFIG GitHub Secret.
 * For local development, replace the PLACEHOLDER_* values with your
 * actual Firebase credentials from the Firebase Console.
 */

// Firebase project config
const firebaseConfig = {
  apiKey: "PLACEHOLDER_API_KEY",
  authDomain: "PLACEHOLDER_AUTHDOMAIN",
  projectId: "PLACEHOLDER_PROJECT_ID",
  storageBucket: "PLACEHOLDER_BUCKET",
  messagingSenderId: "PLACEHOLDER_SENDER_ID",
  appId: "PLACEHOLDER_APP_ID",
  measurementId: "PLACEHOLDER_MEASUREMENT_ID"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize services
const auth = firebase.auth();
const db = firebase.firestore();

// Auth state observer
auth.onAuthStateChanged((user) => {
  if (user) {
    console.log('✓ User signed in:', user.email);
    onUserSignedIn(user);
  } else {
    console.log('✗ User signed out');
    onUserSignedOut();
  }
});

// User sign-in handler
function onUserSignedIn(user) {
  // Update UI - show profile content, hide auth prompt
  const authPrompt = document.getElementById('profile-auth-prompt');
  const profileContent = document.getElementById('profile-content');
  if (authPrompt) authPrompt.style.display = 'none';
  if (profileContent) profileContent.style.display = 'block';
  
  // Update user button
  const userBtn = document.querySelector('.user-btn');
  if (userBtn) {
    userBtn.textContent = '👤 Profile';
    userBtn.onclick = () => openTab('profile');
  }
  
  // Initialize collections
  window.userCollection = new Set();
  window.userWishlist = new Set();
  
  // Load user data
  loadUserProfile(user.uid);
  loadUserCollection(user.uid);
  loadUserDecks(user.uid);
  loadUserWishlist(user.uid);
}

// User sign-out handler
function onUserSignedOut() {
  // Update UI - show auth prompt, hide profile content
  const authPrompt = document.getElementById('profile-auth-prompt');
  const profileContent = document.getElementById('profile-content');
  if (authPrompt) authPrompt.style.display = 'block';
  if (profileContent) profileContent.style.display = 'none';
  
  // Update user button
  const userBtn = document.querySelector('.user-btn');
  if (userBtn) {
    userBtn.innerHTML = '<img src="images/pokeball-icon.png" alt="" style="width: 20px; height: 20px; margin-right: 5px; vertical-align: middle;">Sign In';
    userBtn.onclick = () => showAuthModal('signin');
  }
  
  // Clear user data
  clearUserData();
}

// Load user profile from Firestore
async function loadUserProfile(userId) {
  try {
    const doc = await db.collection('users').doc(userId).get();
    if (doc.exists) {
      const profile = doc.data();
      window.userProfile = profile;
      updateProfileUI(profile);
    } else {
      // Create new profile
      await createUserProfile(userId);
    }
  } catch (error) {
    console.error('Error loading profile:', error);
  }
}

// Create new user profile
async function createUserProfile(userId) {
  const user = auth.currentUser;
  const newProfile = {
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    displayName: user?.displayName || 'Anonymous',
    collection: [],
    decks: [],
    wishlist: [],
    settings: {
      currency: 'EUR',
      language: 'en'
    }
  };
  
  try {
    await db.collection('users').doc(userId).set(newProfile);
    window.userProfile = newProfile;
    updateProfileUI(newProfile);
  } catch (error) {
    console.error('Error creating profile:', error);
  }
}

// Load user's card collection
async function loadUserCollection(userId) {
  try {
    const doc = await db.collection('users').doc(userId).get();
    if (doc.exists) {
      const collection = doc.data().collection || [];
      window.userCollection = new Set(collection);
      updateCollectionUI();
    }
  } catch (error) {
    console.error('Error loading collection:', error);
  }
}

// Load user's wishlist
async function loadUserWishlist(userId) {
  try {
    const doc = await db.collection('users').doc(userId).get();
    if (doc.exists) {
      const wishlist = doc.data().wishlist || [];
      window.userWishlist = new Set(wishlist);
      
      // Update wishlist UI if function exists
      if (typeof updateWishlistUI === 'function') {
        updateWishlistUI();
      }
    }
  } catch (error) {
    console.error('Error loading wishlist:', error);
  }
}

// Load user's decks
async function loadUserDecks(userId) {
  try {
    const snapshot = await db.collection('users').doc(userId)
      .collection('decks').get();
    
    window.userDecks = [];
    snapshot.forEach(doc => {
      window.userDecks.push({ id: doc.id, ...doc.data() });
    });
    
    updateDecksUI();
  } catch (error) {
    console.error('Error loading decks:', error);
  }
}

// Clear all user data from memory
function clearUserData() {
  window.userProfile = null;
  window.userCollection = new Set();
  window.userDecks = [];
}
