// Service Worker for Pokemon TCG Analysis PWA
// v202604092310
// Strategies:
//   HTML / navigation â†’ Network-first  (users always see latest version)
//   JS / CSS / images â†’ Cache-first    (pre-cached fresh on install; new CACHE_NAME = full refresh)
//   Data files        â†’ Stale-while-revalidate (fast load + background update)

const CACHE_NAME = 'tcg-analysis-v202604112100';

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
  './images/pokeball-icon.png'
];

// Install: pre-cache shell assets with cache-busting (bypass HTTP cache)
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return Promise.all(
        SHELL_ASSETS.map(function(assetUrl) {
          return fetch(assetUrl, { cache: 'no-store' })
            .then(function(response) {
              if (!response.ok) throw new Error('Failed to fetch ' + assetUrl);
              return cache.put(assetUrl, response);
            });
        })
      );
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches, then take control of all clients
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key) { return caches.delete(key); })
      );
    }).then(function() {
      return self.clients.claim();
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

  // â”€â”€ HTML / navigation: NETWORK-FIRST â”€â”€
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

  // â”€â”€ Static assets (JS / CSS / images): CACHE-FIRST â”€â”€
  // Pre-cached during install. A new CACHE_NAME triggers a full re-fetch
  // of every shell asset, so cached copies are always current for this SW version.
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
