/**
 * Offline data prefetcher.
 * ============================
 * On every online page load, walks `data/offline-manifest.json` and
 * fetches every listed file. The Service Worker's network-first
 * handler caches each successful response, so the next offline boot
 * has the full data set available locally without the user having to
 * "warm up" by visiting each tab first.
 *
 * Strategy:
 *   - Skip entirely when offline (nothing to prefetch).
 *   - Skip files that the SW cache already has (HEAD checks via the
 *     cache API are cheaper than re-fetching the body).
 *   - Concurrency-cap so we don't saturate cellular: 4 parallel fetches.
 *   - Low-priority so other UI requests aren't starved.
 *   - Surfaces a tiny status pill at the bottom-right while running,
 *     so the user knows "still downloading — wait before flying".
 *   - Requests persistent storage so iOS doesn't evict the cache
 *     under storage pressure (otherwise the 280 MB we just downloaded
 *     can vanish silently).
 *
 * Triggered from app-init.js after the main UI bootstraps so it
 * doesn't compete with the critical-path tab render.
 */
(function () {
    'use strict';

    var STATE = {
        running: false,
        total: 0,
        done: 0,
        bytes: 0,
        failed: 0,
        pill: null,
        startTime: 0
    };

    var CONCURRENCY = 4;
    var BASE_PATH = './data/';
    var MANIFEST_URL = BASE_PATH + 'offline-manifest.json';
    var CACHE_NAME_PATTERN = /^tcg-analysis-v/;

    function fmtMB(bytes) {
        return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    }

    function ensurePill() {
        if (STATE.pill) return STATE.pill;
        var pill = document.createElement('div');
        pill.id = 'offline-prefetch-pill';
        pill.setAttribute('aria-live', 'polite');
        pill.style.cssText = [
            'position:fixed',
            'bottom:12px',
            'right:12px',
            'z-index:99998',
            'padding:8px 14px',
            'background:rgba(30,41,59,0.92)',
            'color:#fff',
            'font:600 12px/1.3 system-ui,-apple-system,sans-serif',
            'border-radius:20px',
            'box-shadow:0 4px 12px rgba(0,0,0,0.25)',
            'pointer-events:none',
            'opacity:0',
            'transition:opacity .25s ease',
            'max-width:260px'
        ].join(';');
        document.body.appendChild(pill);
        STATE.pill = pill;
        return pill;
    }

    function updatePill(text, opts) {
        opts = opts || {};
        var pill = ensurePill();
        pill.textContent = text;
        pill.style.opacity = '1';
        if (opts.dismissAfter) {
            setTimeout(function () { pill.style.opacity = '0'; }, opts.dismissAfter);
        }
    }

    async function requestPersistentStorage() {
        try {
            if (navigator.storage && navigator.storage.persist) {
                var already = await navigator.storage.persisted();
                if (already) return true;
                var granted = await navigator.storage.persist();
                console.info('[OfflinePrefetch] persistent storage:', granted ? 'granted' : 'denied');
                return granted;
            }
        } catch (_) { /* unsupported */ }
        return false;
    }

    async function findCache() {
        if (!('caches' in self)) return null;
        var keys = await caches.keys();
        var swKey = keys.filter(function (k) { return CACHE_NAME_PATTERN.test(k); }).sort().pop();
        if (!swKey) return null;
        try { return await caches.open(swKey); } catch (_) { return null; }
    }

    async function fileAlreadyCached(cache, url) {
        if (!cache) return false;
        try {
            var hit = await cache.match(url, { ignoreSearch: true });
            return !!hit;
        } catch (_) { return false; }
    }

    async function fetchOne(file, cache) {
        var url = BASE_PATH + file.path;
        if (await fileAlreadyCached(cache, url)) {
            STATE.done += 1;
            STATE.bytes += file.size || 0;
            return { url: url, status: 'cached' };
        }
        try {
            // priority:'low' tells the browser to schedule below the user's
            // active navigation; supported on Chromium-based browsers and
            // ignored elsewhere. SW intercepts and caches automatically.
            var resp = await fetch(url, { priority: 'low', credentials: 'same-origin' });
            if (!resp.ok) {
                STATE.failed += 1;
                console.warn('[OfflinePrefetch] HTTP ' + resp.status + ' for ' + file.path);
                return { url: url, status: 'fail', code: resp.status };
            }
            STATE.done += 1;
            STATE.bytes += file.size || 0;
            return { url: url, status: 'ok' };
        } catch (err) {
            STATE.failed += 1;
            console.warn('[OfflinePrefetch] error for ' + file.path + ':', err && err.message);
            return { url: url, status: 'error' };
        }
    }

    async function runQueue(files, cache) {
        var i = 0;
        var workers = [];
        function nextProgress() {
            updatePill('Offline-Cache: ' + STATE.done + '/' + STATE.total + ' (' + fmtMB(STATE.bytes) + ')');
        }
        async function worker() {
            while (i < files.length) {
                var idx = i++;
                await fetchOne(files[idx], cache);
                nextProgress();
            }
        }
        for (var w = 0; w < CONCURRENCY; w++) workers.push(worker());
        await Promise.all(workers);
    }

    async function prefetchAll() {
        if (STATE.running) return;
        if (!navigator.onLine) return;
        STATE.running = true;
        STATE.startTime = Date.now();
        try {
            var resp = await fetch(MANIFEST_URL, { cache: 'no-cache' });
            if (!resp.ok) {
                console.warn('[OfflinePrefetch] manifest fetch failed:', resp.status);
                return;
            }
            var manifest = await resp.json();
            var files = (manifest && manifest.files) || [];
            if (files.length === 0) return;
            STATE.total = files.length;
            updatePill('Offline-Cache wird vorbereitet…');
            await requestPersistentStorage();
            var cache = await findCache();
            await runQueue(files, cache);
            var secs = Math.round((Date.now() - STATE.startTime) / 1000);
            updatePill('Offline-bereit: ' + STATE.done + ' Dateien (' + fmtMB(STATE.bytes) + ', ' + secs + 's)',
                       { dismissAfter: 5000 });
            console.info('[OfflinePrefetch] complete:', STATE);
        } catch (err) {
            console.warn('[OfflinePrefetch] aborted:', err);
        } finally {
            STATE.running = false;
        }
    }

    // Expose for manual triggering from console.
    window.__offlinePrefetch = {
        run: prefetchAll,
        state: function () { return STATE; }
    };

    // Auto-run after the main UI bootstraps. window.load fires after every
    // resource on the critical path; we add a 4s grace so the user's
    // initial tab render isn't slowed by the background download burst.
    function scheduleAutoRun() {
        setTimeout(function () {
            prefetchAll();
        }, 4000);
    }

    if (document.readyState === 'complete') {
        scheduleAutoRun();
    } else {
        window.addEventListener('load', scheduleAutoRun, { once: true });
    }

    // Re-trigger when the device comes back online — covers the case
    // where the user opened the app offline (manifest fetch failed)
    // and then reconnected.
    window.addEventListener('online', function () {
        if (!STATE.running && STATE.done < STATE.total) prefetchAll();
        else if (!STATE.running) prefetchAll();
    });
})();
