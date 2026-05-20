// @ts-check
/**
 * Firebase modular SDK lazy-loader.
 *
 * Wave-1 "Firebase modular" path. The legacy code uses the compat SDK
 * (`firebase.auth()`, `firebase.firestore()`, `firebase.firestore.
 * FieldValue.X`, …) which ships ~600 KB on every page load and provides
 * no tree-shaking. The modular SDK lets call-sites import only what
 * they need (~50-80 KB per typical path) and supports proper code-
 * splitting once compat is removed.
 *
 * Migration strategy
 * ------------------
 * 1) (this commit) introduce a lazy loader. No caller exists yet, so
 *    NO extra Firebase JS is downloaded — the pattern is in place but
 *    inactive.
 * 2) (future commits) port high-traffic paths file-by-file: each ports
 *    `firebase.X()` → `await getFirebase().then(fb => fb.X(...))`. Each
 *    port is verified end-to-end against the live site before merge.
 * 3) Once enough call-sites migrate, the three compat-CDN <script> tags
 *    in index.html come out and total page-load shrinks by ~500 KB.
 *
 * Lazy by design
 * --------------
 * `getFirebase()` returns a memoised Promise. The first call triggers
 * three dynamic imports from gstatic (parallelized via Promise.all),
 * subsequent calls return the cached promise. Until a caller exists,
 * none of the modular JS is downloaded.
 *
 * Reuses the existing compat-initialised Firebase app via `getApps()` /
 * `getApp()`, so the two SDKs share a single app instance rather than
 * double-initialising.
 *
 * @returns {Promise<any>}  resolved object exposes app / auth / db plus
 *                          the imported app+auth+firestore namespaces.
 */

/** @type {Promise<any> | null} */
let _firebasePromise = null;

export function getFirebase() {
    if (_firebasePromise) return _firebasePromise;

    _firebasePromise = (async () => {
        // Build URL strings at runtime so esbuild treats the dynamic
        // import() as runtime-only (won't try to resolve+bundle them).
        // Pinned to the same major version as the compat CDN scripts
        // in index.html so both halves see the same Firestore wire
        // format + Auth token shape.
        const base = 'https://www.gstatic.com/firebasejs/11.10.0/';
        const [appMod, authMod, fsMod] = await Promise.all([
            import(base + 'firebase-app.js'),
            import(base + 'firebase-auth.js'),
            import(base + 'firebase-firestore.js'),
        ]);

        /** @type {any} */ const w = window;
        const creds = w.FIREBASE_CREDS;
        if (!creds) {
            console.warn('[firebase modular] FIREBASE_CREDS missing — initialising with empty config');
        }

        // Reuse the compat-initialised app so we don't run two Firebase
        // apps in the same page. getApps() returns the array of named
        // apps; firebase-app-compat.js calls initializeApp() under the
        // default name during its module load.
        const app = appMod.getApps().length
            ? appMod.getApp()
            : appMod.initializeApp(creds || {});

        return {
            app,
            auth: authMod.getAuth(app),
            db: fsMod.getFirestore(app),
            // Pass-through namespaces for direct API access:
            //   const fb = await getFirebase();
            //   await fb.setDoc(fb.doc(fb.db, 'users', uid), { … });
            ...appMod,
            ...authMod,
            ...fsMod,
        };
    })();

    return _firebasePromise;
}

// Expose globally so legacy non-module callers can also access it during
// the transition. They use it like:
//   window.getFirebaseModular().then(fb => fb.setDoc(...));
/** @type {any} */ (window).getFirebaseModular = getFirebase;
