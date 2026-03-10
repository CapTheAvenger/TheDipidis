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
function onUserSignedIn(user) {
  // Show/hide elements
  document.getElementById('signin-btn').style.display = 'none';
  document.getElementById('user-info').style.display = 'flex';
  document.getElementById('user-email-display').textContent = user.email.split('@')[0];
  
  // Profile tab
  document.getElementById('profile-auth-prompt').style.display = 'none';
  document.getElementById('profile-content').style.display = 'block';
  
  // Update profile info
  document.getElementById('profile-user-email').textContent = user.email;
  
  // Close modal if open
  closeAuthModal();
}

function onUserSignedOut() {
  // Show/hide elements
  document.getElementById('signin-btn').style.display = 'block';
  document.getElementById('user-info').style.display = 'none';
  
  // Profile tab
  document.getElementById('profile-auth-prompt').style.display = 'block';
  document.getElementById('profile-content').style.display = 'none';
}

// Switch between profile tabs
function switchProfileTab(tabName) {
  // Hide all tabs
  const tabs = document.querySelectorAll('.profile-tab-content');
  tabs.forEach(tab => tab.style.display = 'none');
  
  // Remove active class from all buttons
  const buttons = document.querySelectorAll('.profile-tab-btn');
  buttons.forEach(btn => btn.classList.remove('active'));
  
  // Show selected tab
  const selectedTab = document.getElementById(`profile-${tabName}`);
  if (selectedTab) {
    selectedTab.style.display = 'block';
  }
  
  // Activate button
  const activeBtn = event?.target;
  if (activeBtn) {
    activeBtn.classList.add('active');
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  // Show sign-in button initially
  document.getElementById('signin-btn').style.display = 'block';
  document.getElementById('profile-auth-prompt').style.display = 'block';
});
