/**
 * Offline data prefetcher.
 * ========================
 * On every online page load, walks `data/offline-manifest.json` and
 * writes every listed file into the Service Worker cache so the next
 * offline boot has the full dataset locally without the user having
 * to "warm up" by visiting each tab first.
 *
 * Reliability story (rewritten 2026-05-28 after caching looked like
 * it succeeded but iOS Safari silently evicted entries under quota
 * pressure):
 *
 *   • Uses `cache.add(url)` — atomic fetch+put. Throws if either side
 *     fails, so the success counter actually reflects what landed in
 *     the cache (the previous fetch()-based approach counted any
 *     successful HTTP fetch as "done" even when the background SW
 *     cache.put silently failed for quota reasons).
 *
 *   • Verify pass — after the main loop, re-reads every manifest entry
 *     from the cache and reports any that went missing. Resurrecting
 *     missing entries gets one retry; if a second pass still loses
 *     them we surface the count so the user knows offline coverage
 *     is partial.
 *
 *   • Storage diagnostics — `navigator.storage.estimate()` logged at
 *     start + end, plus a delta. If iOS evicts during the run we
 *     can see it in the console.
 *
 *   • Home-screen hint — when running in a regular Safari tab
 *     (display-mode browser, not standalone), shows a tappable banner
 *     telling the user to Add to Home Screen for reliable offline
 *     storage. Standalone PWAs get persistent storage granted much
 *     more readily on iOS.
 */
(function () {
    'use strict';

    var STATE = {
        running: false,
        total: 0,
        done: 0,
        bytes: 0,
        failed: 0,
        missing: 0,
        pill: null,
        startTime: 0,
        quotaStart: null,
        quotaEnd: null
    };

    var CONCURRENCY = 4;
    var BASE_PATH = './data/';
    var MANIFEST_URL = BASE_PATH + 'offline-manifest.json';
    var CACHE_NAME_PATTERN = /^tcg-analysis-v/;

    function fmtMB(bytes) {
        return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    }

    function isStandalone() {
        try {
            if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
            if ('standalone' in window.navigator && window.navigator.standalone) return true;
        } catch (_) {}
        return false;
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
            'max-width:280px'
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
        pill.style.background = opts.warn ? 'rgba(220,38,38,0.95)' : 'rgba(30,41,59,0.92)';
        if (opts.dismissAfter) {
            setTimeout(function () { pill.style.opacity = '0'; }, opts.dismissAfter);
        }
    }

    function showHomescreenHint() {
        if (sessionStorage.getItem('__homescreen_hint_dismissed')) return;
        if (document.getElementById('offline-homescreen-hint')) return;
        var banner = document.createElement('div');
        banner.id = 'offline-homescreen-hint';
        banner.style.cssText = [
            'position:fixed',
            'top:12px',
            'left:12px',
            'right:12px',
            'z-index:99999',
            'padding:12px 16px',
            'background:#0f172a',
            'color:#fff',
            'font:600 13px/1.4 system-ui,-apple-system,sans-serif',
            'border-radius:12px',
            'box-shadow:0 8px 24px rgba(0,0,0,0.35)',
            'display:flex',
            'gap:12px',
            'align-items:flex-start'
        ].join(';');
        banner.innerHTML =
            '<div style="flex:1">' +
            '<div style="font-weight:700;margin-bottom:4px">Für Offline: Zum Home-Bildschirm</div>' +
            '<div style="font-weight:400;opacity:.88;font-size:12px">Im Safari-Tab limitiert iOS den Offline-Speicher auf wenige MB. Tipp Teilen-Icon → "Zum Home-Bildschirm" und öffne die App von dort.</div>' +
            '</div>' +
            '<button type="button" aria-label="Hinweis schließen" style="background:transparent;border:0;color:#fff;font-size:20px;line-height:1;padding:0;cursor:pointer;opacity:.7">×</button>';
        banner.querySelector('button').addEventListener('click', function () {
            sessionStorage.setItem('__homescreen_hint_dismissed', '1');
            banner.remove();
        });
        document.body.appendChild(banner);
    }

    async function requestPersistentStorage() {
        try {
            if (navigator.storage && navigator.storage.persist) {
                var already = await navigator.storage.persisted();
                if (already) {
                    console.info('[OfflinePrefetch] persistent storage: already granted');
                    return true;
                }
                var granted = await navigator.storage.persist();
                console.info('[OfflinePrefetch] persistent storage:', granted ? 'granted' : 'denied');
                return granted;
            }
        } catch (_) { /* unsupported */ }
        return false;
    }

    async function snapshotQuota() {
        try {
            if (navigator.storage && navigator.storage.estimate) {
                var est = await navigator.storage.estimate();
                return {
                    quota: est.quota || 0,
                    usage: est.usage || 0,
                    usageMB: ((est.usage || 0) / 1024 / 1024).toFixed(1),
                    quotaMB: ((est.quota || 0) / 1024 / 1024).toFixed(1)
                };
            }
        } catch (_) {}
        return null;
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

    async function fetchAndStore(file, cache) {
        var url = BASE_PATH + file.path;
        if (!cache) {
            STATE.failed += 1;
            return { url: url, status: 'no-cache' };
        }
        if (await fileAlreadyCached(cache, url)) {
            STATE.done += 1;
            STATE.bytes += file.size || 0;
            return { url: url, status: 'already-cached' };
        }
        try {
            // cache.add() is atomic: fetches the URL and stores the response.
            // Throws if EITHER the network fetch or the cache write fails
            // (quota, opaque response, etc.) — that's what makes it more
            // reliable than the previous fetch()-then-SW-puts approach.
            await cache.add(url);
            STATE.done += 1;
            STATE.bytes += file.size || 0;
            return { url: url, status: 'ok' };
        } catch (err) {
            STATE.failed += 1;
            // Quota errors on iOS Safari surface as QuotaExceededError or
            // a generic 'failed' message. Worth logging the file path so
            // we can correlate with manifest sizes if the user reports.
            console.warn('[OfflinePrefetch] cache.add failed for ' + file.path + ':', err && (err.name || err.message || err));
            return { url: url, status: 'fail', error: err && (err.name || err.message || String(err)) };
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
                await fetchAndStore(files[idx], cache);
                nextProgress();
            }
        }
        for (var w = 0; w < CONCURRENCY; w++) workers.push(worker());
        await Promise.all(workers);
    }

    async function verifyCache(files, cache) {
        if (!cache) return [];
        var missing = [];
        for (var i = 0; i < files.length; i++) {
            var url = BASE_PATH + files[i].path;
            var hit = await cache.match(url, { ignoreSearch: true });
            if (!hit) missing.push(files[i]);
        }
        return missing;
    }

    async function prefetchAll() {
        if (STATE.running) return;
        if (!navigator.onLine) return;
        STATE.running = true;
        STATE.startTime = Date.now();
        STATE.done = 0;
        STATE.failed = 0;
        STATE.bytes = 0;
        STATE.missing = 0;
        try {
            STATE.quotaStart = await snapshotQuota();
            if (STATE.quotaStart) {
                console.info('[OfflinePrefetch] storage at start:', STATE.quotaStart.usageMB + ' / ' + STATE.quotaStart.quotaMB + ' MB');
            }

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

            // Standalone-only Add-to-Home-Screen hint — desktop browsers
            // and Android Chrome handle quota differently; only iOS
            // Safari needs the user gesture for reliable persistence.
            if (!isStandalone() && /iPhone|iPad|iPod/.test(navigator.userAgent || '')) {
                showHomescreenHint();
            }

            await requestPersistentStorage();

            var cache = await findCache();
            if (!cache) {
                console.warn('[OfflinePrefetch] could not open SW cache — aborting');
                updatePill('Offline-Cache nicht verfügbar', { warn: true, dismissAfter: 6000 });
                return;
            }

            await runQueue(files, cache);

            // Verify pass — iOS Safari sometimes accepts cache.add() but
            // evicts entries seconds later under quota pressure. Re-check
            // every URL and retry missing ones once.
            var missing = await verifyCache(files, cache);
            if (missing.length > 0) {
                console.warn('[OfflinePrefetch] verify pass missing ' + missing.length + ' files — retrying');
                STATE.done = STATE.total - missing.length;
                updatePill('Offline-Cache: Nachladen ' + missing.length + ' fehlende Dateien…');
                for (var i = 0; i < missing.length; i++) {
                    await fetchAndStore(missing[i], cache);
                    updatePill('Offline-Cache: ' + STATE.done + '/' + STATE.total + ' (' + fmtMB(STATE.bytes) + ')');
                }
                // Final verify
                missing = await verifyCache(files, cache);
                STATE.missing = missing.length;
            }

            STATE.quotaEnd = await snapshotQuota();
            if (STATE.quotaEnd) {
                console.info('[OfflinePrefetch] storage at end:', STATE.quotaEnd.usageMB + ' / ' + STATE.quotaEnd.quotaMB + ' MB');
            }

            var secs = Math.round((Date.now() - STATE.startTime) / 1000);
            if (STATE.missing === 0) {
                updatePill('Offline-bereit: ' + STATE.total + ' Dateien (' + fmtMB(STATE.bytes) + ', ' + secs + 's)',
                           { dismissAfter: 6000 });
            } else {
                updatePill('Offline teilweise: ' + (STATE.total - STATE.missing) + '/' + STATE.total + ' Dateien gecacht — iOS hat den Rest evictet (Add to Home Screen)',
                           { warn: true });
                if (!isStandalone() && /iPhone|iPad|iPod/.test(navigator.userAgent || '')) {
                    sessionStorage.removeItem('__homescreen_hint_dismissed');
                    showHomescreenHint();
                }
            }
            console.info('[OfflinePrefetch] complete:', STATE);
        } catch (err) {
            console.warn('[OfflinePrefetch] aborted:', err);
        } finally {
            STATE.running = false;
        }
    }

    // Console-debug helpers — `window.__offlinePrefetch.verify()` returns
    // the list of files currently NOT in cache (useful when the user
    // reports "X tab still says no data offline").
    window.__offlinePrefetch = {
        run: prefetchAll,
        state: function () { return STATE; },
        verify: async function () {
            var cache = await findCache();
            if (!cache) return { error: 'no-cache' };
            var resp = await fetch(MANIFEST_URL, { cache: 'no-cache' });
            if (!resp.ok) return { error: 'no-manifest' };
            var manifest = await resp.json();
            var missing = await verifyCache(manifest.files || [], cache);
            var quota = await snapshotQuota();
            return {
                total: (manifest.files || []).length,
                missing: missing.length,
                missingList: missing.slice(0, 20).map(function (f) { return f.path; }),
                quota: quota,
                standalone: isStandalone()
            };
        }
    };

    function scheduleAutoRun() {
        setTimeout(function () { prefetchAll(); }, 4000);
    }

    if (document.readyState === 'complete') {
        scheduleAutoRun();
    } else {
        window.addEventListener('load', scheduleAutoRun, { once: true });
    }

    window.addEventListener('online', function () {
        if (!STATE.running) prefetchAll();
    });
})();
