/**
 * Firebase Globals
 * ================
 * Exposes Firebase auth and Firestore as global variables.
 * This file runs AFTER firebase-config.js (which is injected from a GitHub
 * secret and overwrites the full file on every deploy). By keeping this
 * in a separate file it survives deploys and makes `auth` and `db`
 * accessible to firebase-collection.js and firebase-auth.js as bare globals.
 */

window.auth = firebase.auth();
window.db = firebase.firestore();

// Ensure userDecks is always an array before async load completes
if (!window.userDecks) {
  window.userDecks = [];
}
