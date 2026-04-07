// Service Worker for Pokemon TCG Analysis PWA
// Strategy: Stale-while-revalidate for all assets (instant load + background refresh)

const CACHE_NAME = 'tcg-analysis-v202604080215';

// Static shell — cached on install
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
  './js/draw-simulator.js',
  './js/combo-worker.js',
  './js/app-calculator.js',
  './js/deck-analysis-shared.js',
  './js/card-data-cache.js',
  './js/error-tracking.js',
  './images/pokeball-icon.png'
];

// Install: pre-cache static shell
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(SHELL_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key) { return caches.delete(key); })
      );
    })
  );
  self.clients.claim();
});

// Fetch: cache-first for static shell, stale-while-revalidate for data
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Skip non-GET, cross-origin, and Chrome extension requests
  if (event.request.method !== 'GET') return;
  if (url.origin !== location.origin) return;

  // Strip query params (?v=..., ?t=...) for consistent cache keys
  var cleanUrl = new URL(url.pathname, location.origin).href;

  // Data files (CSV/JSON): stale-while-revalidate
  // Serve cached version instantly, fetch fresh copy in background
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

  // Static assets (JS/CSS/HTML): stale-while-revalidate
  // Serve cached version instantly, fetch fresh copy in background for next visit
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
});
