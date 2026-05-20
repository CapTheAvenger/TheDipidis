// @ts-check
/**
 * lazy-loader.js — Wave-1 L2.5 dynamic-script lazy loader.
 *
 * Provides `window.loadScript(src)` which injects a <script> tag with
 * `src` and resolves a promise when it loads (or rejects on error).
 * Idempotent: subsequent calls return the cached promise so the file is
 * only requested + parsed once per page session.
 *
 * Used by the legacy-global stubs further down (`window.openDrawSimulator`
 * et al.) to defer loading of tab-leaf features until the user actually
 * triggers them. Goal: shrink the initial-page bundle by ~5-15% by
 * deferring features that aren't on the critical render path.
 *
 * Why a manual <script> injection rather than dynamic import():
 * the deferred features are still classic global-style scripts (top-level
 * `function foo()` registers `window.foo` as a side effect). `import()`
 * would require those files to be real ES modules first — a separate,
 * larger migration (the modules-bundle path under js/modules/).
 *
 * The lazy-stub pattern:
 *   1. The legacy concat bundle declares a STUB function on `window`
 *      that:
 *        a. calls `loadScript(<feature_src>)` (idempotent),
 *        b. when it resolves, looks up the now-replaced real function
 *           on `window` and calls it with the original arguments.
 *   2. The deferred file declares `function realFn(...)` at top level,
 *      which overwrites the stub on `window`. The promise chain then
 *      picks up the real function and proxies the call.
 *
 * Error handling: if the script fails to load, the cached rejection is
 * discarded so the next user attempt re-tries. A toast is shown to the
 * user.
 */

(function () {
    'use strict';

    /** @type {{ [src: string]: Promise<void> }} */
    const loaded = Object.create(null);

    /**
     * Inject a <script src> tag and resolve when it loads.
     * @param {string} src
     * @returns {Promise<void>}
     */
    function loadScript(src) {
        if (loaded[src]) return loaded[src];

        loaded[src] = new Promise(function (resolve, reject) {
            const s = document.createElement('script');
            s.src = src;
            // async=false preserves execution order across multiple parallel
            // loadScript calls on the same page (matters if two lazy stubs
            // fire simultaneously and the order matters).
            s.async = false;
            s.onload = function () { resolve(); };
            s.onerror = function () {
                delete loaded[src]; // allow retry on next call
                reject(new Error('lazy-loader: failed to load ' + src));
            };
            document.head.appendChild(s);
        });

        return loaded[src];
    }

    /**
     * Build the asset URL with the current APP_VERSION cache-buster so
     * the lazy file follows the same versioning as the main bundle.
     * @param {string} relativePath
     * @returns {string}
     */
    function asVersioned(relativePath) {
        /** @type {any} */ const w = window;
        const v = w.APP_VERSION || '';
        return v ? (relativePath + '?v=' + v) : relativePath;
    }

    /**
     * Install a lazy stub on `window[globalFnName]` that loads `featureSrc`
     * on first call and then delegates the call (with the original args) to
     * whatever function the loaded script left on `window[globalFnName]`.
     *
     * @param {string} globalFnName  name of the real function once loaded
     * @param {string} featureSrc    relative path to the deferred file
     * @param {string} [featureLabel] human-readable name for the error toast
     */
    function installLazyStub(globalFnName, featureSrc, featureLabel) {
        const url = asVersioned(featureSrc);
        /** @type {any} */ const w = window;

        const stub = function (/** @type {any[]} */ ...args) {
            loadScript(url)
                .then(function () {
                    const real = w[globalFnName];
                    if (typeof real === 'function' && real !== stub) {
                        try {
                            real.apply(null, args);
                        } catch (err) {
                            console.error('[lazy] ' + globalFnName + ' threw:', err);
                        }
                    } else {
                        console.warn('[lazy] ' + featureSrc + ' loaded but did not register ' + globalFnName);
                    }
                })
                .catch(function (err) {
                    console.error('[lazy]', err);
                    if (typeof w.showToast === 'function') {
                        w.showToast(
                            'Failed to load ' + (featureLabel || globalFnName) +
                            ' — please check your connection and try again.',
                            'error'
                        );
                    }
                });
        };

        w[globalFnName] = stub;
    }

    /** @type {any} */ (window).loadScript = loadScript;
    /** @type {any} */ (window).installLazyStub = installLazyStub;

    // ----- Feature registry --------------------------------------------------
    //
    // Stubs for tab-leaf features that have been moved out of the main
    // bundle. Each call here registers a function name on `window` that,
    // when first invoked, fetches the corresponding js/<feature>.js file
    // and proxies the call to the real implementation.
    //
    // Adding a new lazy feature is a 3-step diff:
    //   1) remove the file from scripts/build-bundle.js BUNDLE_ORDER
    //   2) remove its <script> tag from index.html
    //   3) add installLazyStub('myFn', 'js/my-file.js', 'My Feature') here.

    // L2.5 pilot: draw-simulator (~10 KB). Triggered only by the "Test
    // Draw" buttons in deck-builder / city-league / current-meta / past-meta.
    // openDrawSimulator() is the single public entry point.
    installLazyStub('openDrawSimulator', 'js/draw-simulator.js', 'Test Draw');

    // L2.7: battle-journal (~120 KB). Triggered by the journal FAB,
    // "Log Match" / "Sync Now" buttons, and the profile-tab journal-history
    // filter dropdowns. firebase-globals.js calls flushBattleJournalOutbox
    // from the auth-state callback after user-login; that resolves to the
    // stub here at runtime since the stub IS a function (lazy-load fires
    // on first call).
    installLazyStub('openBattleJournalSheet', 'js/battle-journal.js', 'Battle Journal');
    installLazyStub('flushBattleJournalOutbox', 'js/battle-journal.js', 'Battle Journal');
    installLazyStub('renderJournalHistory', 'js/battle-journal.js', 'Battle Journal');
    installLazyStub('getBattleJournalWinRates', 'js/battle-journal.js', 'Battle Journal');

    // L2.7: meta-binder + custom-binder (~110 KB + ~30 KB). They share
    // `window._mbShared` (set by meta-binder, used by custom-binder), so they
    // MUST load together. Triggering either binder fetches both files; the
    // lazy-loader's idempotent cache ensures each is only fetched once.
    function lazyBinder(globalFnName) {
        // Both files in parallel; the cached loadScript() promises means a
        // re-call from the second stub doesn't double-fetch.
        const url = asVersioned('js/meta-binder.js');
        const url2 = asVersioned('js/custom-binder.js');
        /** @type {any} */ const w = window;
        const stub = function (/** @type {any[]} */ ...args) {
            Promise.all([loadScript(url), loadScript(url2)])
                .then(function () {
                    const real = w[globalFnName];
                    if (typeof real === 'function' && real !== stub) {
                        try { real.apply(null, args); }
                        catch (err) { console.error('[lazy] ' + globalFnName + ' threw:', err); }
                    } else {
                        console.warn('[lazy] binder loaded but did not register ' + globalFnName);
                    }
                })
                .catch(function (err) {
                    console.error('[lazy]', err);
                    if (typeof w.showToast === 'function') {
                        w.showToast('Failed to load Binder — please try again.', 'error');
                    }
                });
        };
        w[globalFnName] = stub;
    }
    // meta-binder exports
    lazyBinder('buildMetaBinder');
    lazyBinder('loadSavedMetaBinder');
    lazyBinder('refreshMetaBinderOwnership');
    lazyBinder('metaBinderAddMissingToWishlist');
    lazyBinder('metaBinderSendMissingToProxy');
    lazyBinder('metaBinderProxyNewCards');
    lazyBinder('setMetaBinderFilter');
    lazyBinder('setMetaBinderPrintView');
    lazyBinder('applyComplexMetaFilter');
    lazyBinder('openMetaBinderDroppedModal');
    lazyBinder('closeMetaBinderDroppedModal');
    lazyBinder('sortMetaBinder');
    // custom-binder exports
    lazyBinder('buildCustomBinder');
    lazyBinder('refreshCustomBinderOwnership');
    lazyBinder('cbAddArchetype');
    lazyBinder('cbToggleArchetype');
    lazyBinder('cbRemoveArchetype');
    lazyBinder('cbToggleArchetypeDropdown');
    lazyBinder('cbToggleMainPokemonGroup');
    lazyBinder('cbFilterArchetypeList');
    lazyBinder('cbSetFilter');
    lazyBinder('cbSetPrintView');
    lazyBinder('cbApplyFilter');
    lazyBinder('cbAddMissingToWishlist');
    lazyBinder('cbSendMissingToProxy');
    lazyBinder('cbSaveCurrentAsPreset');
    lazyBinder('cbLoadPreset');
    lazyBinder('cbDeletePreset');
})();
