/**
 * Firebase Authentication Functions
 * ==================================
 */

// Sign up with email and password
async function signUp(email, password) {
  try {
    const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
    console.log('✓ User created:', userCredential.user.email);
    showNotification('Account created successfully!', 'success');
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
    console.log('✓ User signed in:', userCredential.user.email);
    showNotification('Signed in successfully!', 'success');
    return userCredential.user;
  } catch (error) {
    console.error('Sign in error:', error);
    showNotification(getErrorMessage(error.code), 'error');
    throw error;
  }
}

// Sign in with Google
// iOS Chrome + Safari (WebKit) do NOT support signInWithPopup reliably —
// they throw "The Request action is invalid" consistently.
// Solution: always use redirect on iOS, popup everywhere else.
function signInWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (isIOS) {
    // Clear any stale Firebase redirect state from localStorage
    // (corrupted state causes "The Request action is invalid" on every page load)
    try {
      Object.keys(localStorage).forEach(function(key) {
        if (key.startsWith('firebase:') || key.startsWith('firebaseui:')) {
          localStorage.removeItem(key);
        }
      });
    } catch(ignore) {}

    alert('[DEBUG v13] isIOS=true, starting redirect now...');
    firebase.auth().signInWithRedirect(provider)
      .catch(function(e) {
        alert('[DEBUG] code=' + JSON.stringify(e.code) + '\nmessage=' + e.message + '\nname=' + e.name);
      });
    return;
  }

  firebase.auth().signInWithPopup(provider)
    .then(function(result) {
      console.log('✓ Google popup sign-in:', result.user.email);
      showNotification('Signed in with Google!', 'success');
    })
    .catch(function(err) {
      if (
        err.code === 'auth/popup-blocked' ||
        err.code === 'auth/popup-closed-by-user' ||
        err.code === 'auth/cancelled-popup-request'
      ) {
        firebase.auth().signInWithRedirect(provider);
      } else {
        alert('[DEBUG] Popup error: ' + err.code + ' | ' + err.message);
      }
    });
}

// Sign out
async function signOut() {
  try {
    await firebase.auth().signOut();
    console.log('✓ User signed out');
    showNotification('Signed out successfully!', 'success');
  } catch (error) {
    console.error('Sign out error:', error);
    showNotification('Error signing out', 'error');
  }
}

// Reset password
async function resetPassword(email) {
  try {
    await firebase.auth().sendPasswordResetEmail(email);
    showNotification('Password reset email sent!', 'success');
  } catch (error) {
    console.error('Password reset error:', error);
    showNotification(getErrorMessage(error.code), 'error');
    throw error;
  }
}

// Get friendly error messages
function getErrorMessage(errorCode) {
  const messages = {
    'auth/email-already-in-use': 'This email is already registered',
    'auth/invalid-email': 'Invalid email address',
    'auth/weak-password': 'Password should be at least 6 characters',
    'auth/user-not-found': 'No account found with this email',
    'auth/wrong-password': 'Incorrect password',
    'auth/too-many-requests': 'Too many attempts. Try again later',
    'auth/network-request-failed': 'Network error. Check your connection'
  };
  return messages[errorCode] || 'Authentication error occurred';
}

// Show notification
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 15px 25px;
    border-radius: 8px;
    background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
    color: white;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    animation: slideInRight 0.3s ease;
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideOutRight 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
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
        showNotification('Passwords do not match', 'error');
        return;
      }
      
      await signUp(email, password);
    });
  }
  
  // Google Sign In
  const googleBtn = document.getElementById('google-signin-btn');
  if (googleBtn) {
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
      const email = prompt('Enter your email address:');
      if (email) {
        await resetPassword(email);
      }
    });
  }
}

// Handle redirect result after Google sign-in returns.
// Suppress ALL errors here — onAuthStateChanged handles the login state.
// "The Request action is invalid" and similar errors from getRedirectResult
// are informational-only on non-Firebase-Hosting domains and can be ignored.
firebase.auth().getRedirectResult().then(function(result) {
  if (result && result.user) {
    console.log('✓ Google redirect sign-in:', result.user.email);
    showNotification('Signed in with Google!', 'success');
  }
}).catch(function(error) {
  // Log only — do not show to user. Auth state is handled by onAuthStateChanged.
  console.log('getRedirectResult error (ignorable):', error.code, error.message);
});

// Initialize auth forms when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  setupAuthForms();
});
