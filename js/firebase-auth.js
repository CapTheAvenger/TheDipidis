if (!window.__firebaseRuntimeInitialized) {
  throw new Error('Firebase not initialized! Ensure firebase-config.js is loaded first.');
}
/**
 * Firebase Authentication Functions
 * ==================================
 */

// Sign up with email and password
async function signUp(email, password) {
  try {
    const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
    if (typeof devLog === 'function') devLog('✓ User created:', userCredential.user.email);
    showNotification(getLang()==='de' ? 'Account erfolgreich erstellt!' : 'Account created successfully!', 'success');
    return userCredential.user;
  } catch (error) {
    console.error('Sign up error:', error);
    showNotification(getErrorMessage(error.code), 'error');
    throw error;
  }
}

// Sign in with email and password
async function signIn(email, password) {
  try {
    const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password);
    if (typeof devLog === 'function') devLog('✓ User signed in:', userCredential.user.email);
    showNotification(getLang()==='de' ? 'Erfolgreich angemeldet!' : 'Signed in successfully!', 'success');
    return userCredential.user;
  } catch (error) {
    console.error('Sign in error:', error);
    showNotification(getErrorMessage(error.code), 'error');
    throw error;
  }
}

// Sign in with Google
// Uses Google Identity Services (GIS) OAuth2 token flow.
// This avoids Firebase's signInWithRedirect which redirects to thedipidis.firebaseapp.com —
// a cross-origin domain that iOS ITP blocks from reading the redirect state, causing
// "The requested action is invalid" on every iOS device.
// GIS opens a direct Google-hosted popup (no firebaseapp.com involved at all).
function hasValidFirebaseCredentials() {
  const creds = window.FIREBASE_CREDS || {};
  const requiredKeys = ['apiKey', 'authDomain', 'projectId', 'appId'];
  return requiredKeys.every((key) => {
    const value = String(creds[key] || '').trim();
    return value && !value.startsWith('PLACEHOLDER_');
  });
}

function signInWithGoogle() {
  if (!hasValidFirebaseCredentials()) {
    console.warn('[Auth] Google Sign-In blocked: FIREBASE_CREDS in js/firebase-credentials.js still use PLACEHOLDER values');
    showNotification(getLang()==='de' ? 'Firebase Auth ist lokal nicht konfiguriert. Trage echte FIREBASE_CREDS in js/firebase-credentials.js ein.' : 'Firebase Auth is not configured locally. Enter real FIREBASE_CREDS in js/firebase-credentials.js.', 'error');
    return;
  }

  // Primary path: Google Identity Services (GIS) — works on most browsers
  if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
    const clientId = window.GOOGLE_CLIENT_ID || '';
    if (!clientId || clientId.startsWith('PLACEHOLDER_')) {
      console.warn('[Auth] Google Sign-In blocked: GOOGLE_CLIENT_ID missing — falling back to Firebase popup');
      signInWithGoogleFirebaseFallback();
      return;
    }

    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'email profile',
      callback: function(response) {
        if (response.error) {
          console.error('Google OAuth error:', response.error);
          showNotification((getLang()==='de' ? 'Google Sign-In fehlgeschlagen: ' : 'Google Sign-In failed: ') + response.error, 'error');
          return;
        }
        const credential = firebase.auth.GoogleAuthProvider.credential(null, response.access_token);
        firebase.auth().signInWithCredential(credential)
          .then(function(result) {
            if (typeof devLog === 'function') devLog('✓ Google sign-in (GIS):', result.user.email);
            showNotification(getLang()==='de' ? 'Mit Google angemeldet!' : 'Signed in with Google!', 'success');
          })
          .catch(function(err) {
            console.error('Firebase credential error:', err);
            showNotification(getErrorMessage(err.code), 'error');
          });
      }
    });

    tokenClient.requestAccessToken({ prompt: 'select_account' });
    return;
  }

  // Fallback: GIS library not loaded (ad-blocker, DNS filter, etc.)
  console.info('[Auth] GIS library not available — using Firebase signInWithPopup fallback');
  signInWithGoogleFirebaseFallback();
}

// Fallback: Firebase's built-in signInWithPopup (works even when GIS is blocked)
function signInWithGoogleFirebaseFallback() {
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.addScope('email');
  provider.addScope('profile');
  firebase.auth().signInWithPopup(provider)
    .then(function(result) {
      if (typeof devLog === 'function') devLog('✓ Google sign-in (Firebase popup):', result.user.email);
      showNotification(getLang()==='de' ? 'Mit Google angemeldet!' : 'Signed in with Google!', 'success');
    })
    .catch(function(err) {
      console.error('Firebase popup sign-in error:', err);
      showNotification(getErrorMessage(err.code), 'error');
    });
}

// Sign out
async function signOut() {
  try {
    await firebase.auth().signOut();
    if (typeof devLog === 'function') devLog('✓ User signed out');
    showNotification(getLang()==='de' ? 'Erfolgreich abgemeldet!' : 'Signed out successfully!', 'success');
  } catch (error) {
    console.error('Sign out error:', error);
    showNotification(getLang()==='de' ? 'Fehler beim Abmelden' : 'Error signing out', 'error');
  }
}

// Reset password
async function resetPassword(email) {
  try {
    await firebase.auth().sendPasswordResetEmail(email);
    showNotification(getLang()==='de' ? 'E-Mail zum Zurücksetzen des Passworts gesendet!' : 'Password reset email sent!', 'success');
  } catch (error) {
    console.error('Password reset error:', error);
    showNotification(getErrorMessage(error.code), 'error');
    throw error;
  }
}

// Get friendly error messages
function getErrorMessage(errorCode) {
  const code = String(errorCode || '');

  // Firebase may return referer-specific auth codes like:
  // auth/requests-from-referer-http://localhost:8000-are-blocked.
  if (code.startsWith('auth/requests-from-referer-')) {
    if (getLang() === 'de') {
      return 'Google Sign-In ist für diese Domain blockiert. Bitte in Firebase Auth > Einstellungen > Autorisierte Domains mindestens localhost hinzufügen.';
    }
    return 'Google sign-in is blocked for this domain. In Firebase Auth > Settings > Authorized domains, add at least localhost.';
  }

  const messages = {
    'auth/email-already-in-use': 'This email is already registered',
    'auth/invalid-email': 'Invalid email address',
    'auth/invalid-api-key': 'Firebase API key is invalid or missing',
    'auth/app-not-authorized': 'This domain is not authorized for the configured Firebase app',
    'auth/operation-not-allowed': 'Google sign-in is not enabled in Firebase Authentication',
    'auth/unauthorized-domain': 'This domain is not authorized for Google sign-in',
    'auth/weak-password': 'Password should be at least 6 characters',
    'auth/user-not-found': 'No account found with this email',
    'auth/wrong-password': 'Incorrect password',
    'auth/too-many-requests': 'Too many attempts. Try again later',
    'auth/network-request-failed': 'Network error. Check your connection',
    'auth/popup-blocked': 'Popup was blocked by the browser',
    'auth/popup-closed-by-user': 'Google popup was closed before sign-in finished'
  };
  return messages[code] || 'Authentication error occurred';
}

// Show notification
function showNotification(message, type = 'info') {
  const duration = arguments[2] || 3200;
  let container = document.getElementById('notificationStack');

  if (!container) {
    container = document.createElement('div');
    container.id = 'notificationStack';
    container.className = 'toast-stack';
    document.body.appendChild(container);
  }

  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;

  container.appendChild(notification);

  window.setTimeout(() => {
    notification.classList.add('notification-leave');
    window.setTimeout(() => notification.remove(), 280);
  }, duration);
}

// Handle auth form submission
function setupAuthForms() {
  // Sign In Form
  const signInForm = document.getElementById('sign-in-form');
  if (signInForm) {
    signInForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('signin-email').value;
      const password = document.getElementById('signin-password').value;
      await signIn(email, password);
    });
  }
  
  // Sign Up Form
  const signUpForm = document.getElementById('sign-up-form');
  if (signUpForm) {
    signUpForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('signup-email').value;
      const password = document.getElementById('signup-password').value;
      const confirmPassword = document.getElementById('signup-password-confirm').value;
      
      if (password !== confirmPassword) {
        showNotification(getLang()==='de' ? 'Passwörter stimmen nicht überein' : 'Passwords do not match', 'error');
        return;
      }
      
      await signUp(email, password);
    });
  }
  
  // Google Sign In
  const googleBtn = document.getElementById('google-signin-btn');
  if (googleBtn) {
    // Always keep button clickable so users receive an explicit toast/log instead of silent no-op.
    googleBtn.disabled = false;
    googleBtn.style.opacity = '';
    googleBtn.style.cursor = '';
    googleBtn.title = hasValidFirebaseCredentials()
      ? ''
      : 'Firebase Credentials fehlen lokal - Klick zeigt Details';

    googleBtn.addEventListener('click', () => signInWithGoogle());
  }
  
  // Sign Out
  const signOutBtn = document.getElementById('signout-btn');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', () => signOut());
  }
  
  // Password Reset
  const resetBtn = document.getElementById('password-reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      const email = await showInputModal({ title: 'Password Reset', message: 'Enter your email address:', placeholder: 'email@example.com', inputType: 'email' });
      if (email) {
        await resetPassword(email);
      }
    });
  }
}

// Initialize auth forms when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  setupAuthForms();
});
