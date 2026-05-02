// Service Worker for Pokemon TCG Analysis PWA
// v202605022146
// Strategies:
//   HTML / navigation → Network-first  (users always see latest version)
//   JS / CSS          → Network-first  (always serve fresh; fall back to cache offline)
//   Images            → Cache-first    (rarely change)
//   Data files        → Stale-while-revalidate (fast load + background update)

const CACHE_NAME = 'tcg-analysis-v202605022146';

// Static shell â€” cached on install
const SHELL_ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './css/ui-components.css',
  './css/auth-styles.css',
  './css/pokeball-menu.css',
  './css/cards-header.css',
  './css/cards-filter-section.css',
  './css/cards-tabs.css',
  './css/city-league.css',
  './css/meta-card-analysis.css',
  './css/current-meta-matchups.css',
  './css/city-league-display-toggles.css',
  './css/de-overview-tabs.css',
  './css/profile-howto-info.css',
  './css/dashboard-theme.css',
  './css/mobile-responsive.css',
  './css/close-buttons.css',
  './css/ux-step1.css',
  './css/ux-step2.css',
  './css/ux-step3.css',
  './css/ux-step4.css',
  './js/inline-init.js',
  './js/app-utils.js',
  './js/i18n.js',
  './js/app-core.js',
  './js/app-price.js',
  './js/app-tier-meta.js',
  './js/app-city-league.js',
  './js/app-deck-builder.js',
  './js/app-meta-cards.js',
  './js/app-current-meta.js',
  './js/app-past-meta.js',
  './js/app-cards-db.js',
  './js/app-init.js',
  './js/app-current-meta-analysis.js',
  './js/app-features.js',
  './js/battle-journal.js',
  './js/meta-binder.js',
  './js/custom-binder.js',
  './js/draw-simulator.js',
  './js/combo-worker.js',
  './js/app-calculator.js',
  './js/deck-analysis-shared.js',
  './js/card-data-cache.js',
  './js/error-tracking.js',
  './images/pokeball-icon.png',
  './images/escape-rope.png'
];

// Install: pre-cache shell assets with cache-busting (bypass HTTP cache)
// Tolerates individual asset failures so the SW update is never blocked.
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return Promise.all(
        SHELL_ASSETS.map(function(assetUrl) {
          return fetch(assetUrl, { cache: 'no-store' })
            .then(function(response) {
              if (!response.ok) {
                console.warn('[SW] Failed to pre-cache ' + assetUrl + ' (' + response.status + ')');
                return; // skip this asset, don't block install
              }
              return cache.put(assetUrl, response);
            })
            .catch(function(err) {
              console.warn('[SW] Pre-cache error for ' + assetUrl + ':', err.message);
              // Don't throw — allow install to succeed anyway
            });
        })
      );
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches, take control, then force-reload all open tabs
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key) { return caches.delete(key); })
      );
    }).then(function() {
      return self.clients.claim();
    }).then(function() {
      // Notify all open tabs to reload so they pick up the new assets
      return self.clients.matchAll({ type: 'window' }).then(function(clients) {
        clients.forEach(function(client) {
          client.postMessage({ type: 'SW_UPDATED', version: CACHE_NAME });
        });
      });
    })
  );
});

// Helper: strip query params for consistent cache keys
function cleanCacheUrl(url) {
  return new URL(url.pathname, location.origin).href;
}

// Fetch handler â€” strategy varies by resource type
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Skip non-GET and cross-origin requests
  if (event.request.method !== 'GET') return;
  if (url.origin !== location.origin) return;

  var cleanUrl = cleanCacheUrl(url);

  // — version.json: ALWAYS network-only (cache-busting check) —
  if (url.pathname.endsWith('/version.json') || url.pathname === '/version.json') {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  // — HTML / navigation: NETWORK-FIRST —
  // Always try the network so users see the latest index.html.
  // Falls back to cache only when offline.
  if (event.request.mode === 'navigate' ||
      url.pathname.endsWith('.html') ||
      url.pathname === '/' ||
      url.pathname.endsWith('/')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-cache' })
        .then(function(response) {
          if (response && response.ok) {
            var clone = response.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(cleanUrl, clone);
            });
          }
          return response;
        })
        .catch(function() {
          return caches.match(cleanUrl);
        })
    );
    return;
  }

  // â”€â”€ Data files (CSV / JSON under /data/): STALE-WHILE-REVALIDATE â”€â”€
  // Serve instantly from cache, refresh in background for next visit.
  if (url.pathname.indexOf('/data/') !== -1) {
    event.respondWith(
      caches.match(cleanUrl).then(function(cached) {
        var fetchPromise = fetch(event.request).then(function(response) {
          if (response && response.ok) {
            var clone = response.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(cleanUrl, clone);
            });
          }
          return response;
        }).catch(function() { return cached; });
        return cached || fetchPromise;
      })
    );
    return;
  }

  // — JS / CSS: NETWORK-FIRST (always serve latest, fallback to cache offline) —
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-cache' })
        .then(function(response) {
          if (response && response.ok) {
            var clone = response.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(cleanUrl, clone);
            });
          }
          return response;
        })
        .catch(function() {
          return caches.match(cleanUrl);
        })
    );
    return;
  }

  // — Static assets (images, fonts, etc.): CACHE-FIRST —
  // Images rarely change, so cache-first is fine for performance.
  event.respondWith(
    caches.match(cleanUrl).then(function(cached) {
      if (cached) return cached;
      // Not pre-cached (e.g. lazy-loaded asset) â†’ fetch and cache
      return fetch(event.request).then(function(response) {
        if (response && response.ok) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(cleanUrl, clone);
          });
        }
        return response;
      });
    })
  );
});
