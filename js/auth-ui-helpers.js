/**
 * UI Helper Functions for Authentication & Profile
 * =================================================
 */

// Show/Hide Auth Modal
function showAuthModal(mode = 'signin') {
  const modal = document.getElementById('auth-modal');
  const signinForm = document.getElementById('signin-form-container');
  const signupForm = document.getElementById('signup-form-container');
  if (!modal || !signinForm || !signupForm) return;
  console.info(`[Auth] Opening auth modal in ${mode} mode`);
  
  if (mode === 'signin') {
    signinForm.classList.remove('display-none', 'd-none');
    signupForm.classList.add('display-none');
  } else {
    signinForm.classList.add('display-none');
    signupForm.classList.remove('display-none', 'd-none');
  }
  
  modal.classList.remove('display-none', 'd-none');
  modal.style.display = 'flex';
}

function closeAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (!modal) return;
  console.info('[Auth] Closing auth modal');
  modal.classList.add('display-none');
  modal.style.display = 'none';
}

window.showAuthModal = showAuthModal;
window.closeAuthModal = closeAuthModal;

// Update UI based on auth state
// Note: onUserSignedIn and onUserSignedOut are defined in firebase-config.js
// This file only contains showAuthModal and closeAuthModal helpers
// switchProfileTab is defined in firebase-collection.js
