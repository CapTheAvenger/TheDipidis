// Service Worker for Pokemon TCG Analysis PWA
// Strategy: Cache static shell, network-first for data

const CACHE_NAME = 'tcg-analysis-v202604032136';

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

// Fetch: network-first for data/, cache-first for static shell
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Skip non-GET, cross-origin, and Chrome extension requests
  if (event.request.method !== 'GET') return;
  if (url.origin !== location.origin) return;

  // Data files (CSV/JSON): network-first with cache fallback
  // Strip cache-buster query params so SW cache matches
  if (url.pathname.indexOf('/data/') !== -1) {
    var cleanUrl = new URL(url.pathname, location.origin).href;
    event.respondWith(
      fetch(event.request).then(function(response) {
        if (response && response.ok) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(cleanUrl, clone);
          });
        }
        return response;
      }).catch(function() {
        return caches.match(cleanUrl);
      })
    );
    return;
  }

  // Static assets: network-first so users always get the latest version
  event.respondWith(
    fetch(event.request).then(function(response) {
      if (response && response.ok) {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, clone);
        });
      }
      return response;
    }).catch(function() {
      return caches.match(event.request);
    })
  );
});
