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
 */

// Firebase project config
const firebaseConfig = {
  apiKey: "AIzaSyB01FCHS3wUow7VoGzTQJpqmNNZTyAIOGw",
  authDomain: "thedipidis.firebaseapp.com",
  projectId: "thedipidis",
  storageBucket: "thedipidis.firebasestorage.app",
  messagingSenderId: "539389580350",
  appId: "1:539389580350:web:222066a94502f357b2d6f",
  measurementId: "G-VZXJS2P315"
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
  const newProfile = {
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    collection: [],
    decks: [],
    wishlist: [],
    settings: {
      currency: 'EUR',
      language: 'en'
    }
  };
  
  await db.collection('users').doc(userId).set(newProfile);
  window.userProfile = newProfile;
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
