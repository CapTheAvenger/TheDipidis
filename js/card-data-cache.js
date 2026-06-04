// card-data-cache.js — IndexedDB cache for large card data files
// Uses localForage (async IndexedDB wrapper) to avoid re-downloading
// 12+ MB card data on every page load.

(function () {
    'use strict';

    // Dedicated localForage instance for card data
    var cardStore = (typeof localforage !== 'undefined')
        ? localforage.createInstance({ name: 'tcg-card-cache', storeName: 'cards' })
        : null;

    var MANIFEST_KEY = 'cards_manifest';
    var CARDS_PREFIX = 'chunk_';
    // Max age before we check the server for updates (ms)
    var MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes
    //
    // Why 5 minutes (down from the original 4 hours):
    //   The freshness window skips the network manifest check entirely
    //   when the cached manifest is "young". 4 hours was way too long
    //   for a PWA installed on the home screen: the user could open
    //   the app, see N/A prices, the daily price refresh would commit
    //   new chunks to main two hours later, and on the next PWA open
    //   (within the 4-hour window) the freshness check would short-
    //   circuit, the cached old chunks would be served, and prices
    //   stayed N/A even though fresh chunks were sitting on the
    //   origin. 5 minutes keeps the manifest-fetch cost negligible
    //   (~1 KB per check) and brings the PWA in line with what
    //   Chrome sees on every reload via the SW network-first path.

    // ---- Public API exposed on window.cardDataCache ----

    /**
     * Load the cards manifest from IndexedDB.
     * Returns { version, chunks: [{ file, era, count }], timestamp } or null.
     */
    async function getCachedManifest() {
        if (!cardStore) return null;
        try {
            return await cardStore.getItem(MANIFEST_KEY);
        } catch (_) {
            return null;
        }
    }

    /**
     * Save manifest to IndexedDB.
     */
    async function setCachedManifest(manifest) {
        if (!cardStore) return;
        try {
            await cardStore.setItem(MANIFEST_KEY, manifest);
        } catch (_) { /* noop */ }
    }

    /**
     * Retrieve a cached chunk (array of card objects) by chunk filename.
     */
    async function getCachedChunk(chunkFile) {
        if (!cardStore) return null;
        try {
            return await cardStore.getItem(CARDS_PREFIX + chunkFile);
        } catch (_) {
            return null;
        }
    }

    /**
     * Store a chunk (array of card objects) in IndexedDB.
     */
    async function setCachedChunk(chunkFile, cards) {
        if (!cardStore) return;
        try {
            await cardStore.setItem(CARDS_PREFIX + chunkFile, cards);
        } catch (_) { /* noop */ }
    }

    /**
     * Check whether the cached data is still fresh.
     * Compares local manifest version against the server manifest.
     * Returns { fresh: true/false, serverManifest: ... }
     */
    async function checkFreshness(manifestUrl, options) {
        var force = !!(options && options.force);
        var cached = await getCachedManifest();
        if (!cached || !cached.timestamp) {
            return { fresh: false, serverManifest: null, cachedManifest: null };
        }

        var age = Date.now() - cached.timestamp;
        if (!force && age < MAX_AGE_MS) {
            // Within freshness window — skip network check.
            // force=true (used by the visibilitychange refresh path in
            // app-core.js) bypasses this so a returning PWA gets a
            // version check even if the in-memory cache thinks it's
            // young.
            return { fresh: true, serverManifest: null, cachedManifest: cached };
        }

        // Check server for a newer manifest
        try {
            var resp = await fetch(manifestUrl + '?t=' + Date.now());
            if (!resp.ok) {
                // Network error — use stale cache
                return { fresh: true, serverManifest: null, cachedManifest: cached };
            }
            var serverManifest = await resp.json();
            var isSame = serverManifest.version === cached.version;
            return { fresh: isSame, serverManifest: isSame ? null : serverManifest, cachedManifest: cached };
        } catch (_) {
            // Offline — use stale cache
            return { fresh: true, serverManifest: null, cachedManifest: cached };
        }
    }

    /**
     * Load a single JSON chunk from network and cache it.
     * Returns parsed cards array.
     */
    async function fetchAndCacheChunk(baseUrl, chunkFile) {
        var resp = await fetch(baseUrl + chunkFile + '?t=' + Date.now());
        if (!resp.ok) throw new Error('Failed to fetch ' + chunkFile + ': ' + resp.status);
        var json = await resp.json();
        var cards = json.cards || json;
        // Store in IndexedDB (non-blocking)
        setCachedChunk(chunkFile, cards);
        return cards;
    }

    /**
     * Clear the entire card cache (for debugging / forced refresh).
     */
    async function clearCache() {
        if (!cardStore) return;
        try {
            await cardStore.clear();
        } catch (_) { /* noop */ }
    }

    // Expose public API
    window.cardDataCache = {
        getCachedManifest: getCachedManifest,
        setCachedManifest: setCachedManifest,
        getCachedChunk: getCachedChunk,
        setCachedChunk: setCachedChunk,
        checkFreshness: checkFreshness,
        fetchAndCacheChunk: fetchAndCacheChunk,
        clearCache: clearCache,
        MAX_AGE_MS: MAX_AGE_MS
    };
})();
