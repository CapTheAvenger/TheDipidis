// @ts-check
/**
 * UI Helper Functions for Authentication & Profile
 *
 * Wave-1 L2.14 — converted from legacy IIFE to a proper ES module. The
 * two exported functions are mirrored onto window for HTML-inline
 * onclick callers via the modules-bundle footer.
 *
 * Note: onUserSignedIn and onUserSignedOut live in firebase-config.js;
 * switchProfileTab lives in firebase-collection.js. This file only
 * holds the modal open/close helpers.
 */

export function showAuthModal(/** @type {string} */ mode = 'signin') {
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
    /** @type {HTMLElement} */ (modal).style.display = 'flex';
}

export function closeAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (!modal) return;
    console.info('[Auth] Closing auth modal');
    modal.classList.add('display-none');
    /** @type {HTMLElement} */ (modal).style.display = 'none';
}
