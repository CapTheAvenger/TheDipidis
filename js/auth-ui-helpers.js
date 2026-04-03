// --- Bulk expose all utility functions to window (for non-module environments) ---
(function() {
  ['showAuthModal', 'closeAuthModal'].forEach(fn => { if (typeof window[fn] !== 'function' && typeof eval(fn) === 'function') window[fn] = eval(fn); });
})();
/**
 * UI Helper Functions for Authentication & Profile
 * =================================================
 */

// Show/Hide Auth Modal
function showAuthModal(mode = 'signin') {
  const modal = document.getElementById('auth-modal');
  const signinForm = document.getElementById('signin-form-container');
  const signupForm = document.getElementById('signup-form-container');
  
  if (mode === 'signin') {
    signinForm.style.display = 'block';
    signupForm.style.display = 'none';
  } else {
    signinForm.style.display = 'none';
    signupForm.style.display = 'block';
  }
  
  modal.style.display = 'flex';
}

function closeAuthModal() {
  const modal = document.getElementById('auth-modal');
  modal.style.display = 'none';
}

// Update UI based on auth state
// Note: onUserSignedIn and onUserSignedOut are defined in firebase-config.js
// This file only contains showAuthModal and closeAuthModal helpers
// switchProfileTab is defined in firebase-collection.js
