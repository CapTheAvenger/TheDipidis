// Service Worker for Pokemon TCG Analysis PWA
// v202609061916
// Strategies:
//   HTML / navigation → Network-first  (users always see latest version)
//   JS / CSS          → Network-first  (always serve fresh; fall back to cache offline)
//   Images            → Cache-first    (rarely change)
//   Data files        → Network-first  (fresh scraper output; fall back to cache offline)

const CACHE_NAME = 'tcg-analysis-v202609061916';

// Static shell — cached on install.
//
// MAINTAINER NOTE: when adding a new <script src="js/…"> or
// <link href="css/…"> to index.html, also add it here so the SW
// caches it for offline use. Missing entries silently fail with a
// network-error on offline boot.
//
// The note above used to end with "the list changes <1×/quarter so the
// build infra isn't worth it yet". Measured on 2026-08-18: 37 of the
// page's 95 assets were missing — Meta Call, all six Side Quest files,
// firebase-auth.js, firebase-globals.js, the archetype card, the hub,
// the loading screen. The manual sync did not hold.
//
// Why that matters more than "first offline boot": CACHE_NAME carries
// the deploy stamp, so every deploy — several a day — installs a new
// cache and the activate handler deletes the old one. Only SHELL_ASSETS
// is re-precached on install; everything else returns to the cache the
// next time the user fetches it while online. A user whose SW updates
// and who then loses signal is missing exactly the files that are not
// on this list. The note at './js/firebase-globals.js' below records
// what that looked like the last time it happened (2026-05-28).
//
// tests/unit/test-service-worker-shell.js now compares this list with
// index.html on every run. A build step would still be nicer; a test
// that fails loudly is what stops the drift.
// Nicht in dieser Liste, mit Absicht: tutorial/tutorial.de.html und
// tutorial/tutorial.en.html. Zusammen 546 KB, und der Tab wird selten
// geoeffnet — sie beim Install mitzuziehen wuerde jeden Deploy fuer
// jeden Nutzer teuer machen, um einen Tab offline zu haben, den kaum
// jemand offline sucht. Der Abruf laeuft ueber den Netzwerk-zuerst-Zweig
// im fetch-Handler und landet nach dem ersten Oeffnen im Cache.
const SHELL_ASSETS = [
  './',
  './index.html',
  './css/tokens.css',
  './css/components.css',
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
  './css/side-quest.css',
  './css/quellen.css',
  './css/admin.css',
  './css/statuszustaende.css',
  './css/tippziele.css',
  './css/dashboard-theme.css',
  './css/mobile-responsive.css',
  './css/close-buttons.css',
  './css/wishlist-bot-import.css',
  './css/ux-step1.css',
  './css/ux-step2.css',
  './css/ux-step3.css',
  './css/ux-step4.css',
  './css/ds-nav.css',
  './css/ds-share.css',
  './css/anti-tech.css',
  './css/tech-lab.css',
  './css/tech-slots.css',
  './css/profile-deck-builder.css',
  './css/meta-call.css',
  './css/testing-groups.css',
  './css/archetype-icons.css',
  './js/inline-init.js',
  './js/app-utils.js',
  './js/i18n.js',
  './js/app-core.js',
  './js/app-price.js',
  './js/win-rate-konvention.js',
  './js/matchup-glaettung.js',
  './js/rangliste-sortieren.js',
  './js/ds-bildvorschau.js',
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
  './js/champions-namen.js',
  './js/app-side-quest.js',
  './js/deck-builder-consistency.js',
  './js/deck-analysis-shared.js',
  './js/card-data-cache.js',
  './js/wishlist-bot-import.js',
  './js/error-tracking.js',
  './js/offline-prefetch.js',
  // Self-hosted vendor libs — must pre-cache so the app boots offline.
  // Loading these from third-party CDNs (gstatic/jsdelivr/cdnjs) used
  // to break offline use: when the device had no network the scripts
  // never loaded → `firebase` was undefined → no auth, no Firestore
  // cache, user appeared signed out and saw empty tabs (2026-05-28).
  './js/vendor/firebase-app-compat.js',
  './js/vendor/firebase-auth-compat.js',
  './js/vendor/firebase-firestore-compat.js',
  './js/vendor/chart.umd.min.js',
  './js/vendor/papaparse.min.js',
  './js/vendor/localforage.min.js',
  './js/vendor/mobile-drag-drop.min.js',
  './js/pokemon-loading-screen.js',
  './js/csv-cache-interceptor.js',
  './js/firebase-credentials.js',
  './js/firebase-config.js',
  './js/firebase-globals.js',
  './js/firebase-auth.js',
  './js/auth-ui-helpers.js',
  './js/firebase-collection.js',
  './js/tcg-showdown-link.js',
  './js/card-capability-engine.js',
  './js/tech-ideen.js',
  './js/app-tech-lab.js',
  './js/app-anti-tech.js',
  './js/archetype-icons.js',
  './js/app-archetype-card.js',
  './js/app-meta-call.js',
  './js/app-deckempfehlung.js',
  './js/meta-analysis-hub.js',
  './js/app-testing-groups.js',
  './js/app-side-quest-play.js',
  './js/app-side-quest-pokedex.js',
  './js/ds-datenumfang.js',
  './js/app-quellen.js',
  './js/app-admin.js',
  './js/app-side-quest-status.js',
  './js/champions-set.js',
  './js/champions-names.js',
  './js/app-side-quest-builder.js',
  './js/app-side-quest-resources.js',
  './js/champions-damage.js',
  './js/app-side-quest-usage.js',
  './js/app-side-quest-matchups.js',
  './js/app-profile-deck-builder.js',
  './js/current-meta-quickref.js',
  './js/ds-datenstand.js',
  './js/ds-ev-rechner.js',
  './js/ds-nav.js',
  './js/ds-sections.js',
  './js/ds-filter.js',
  './js/ds-share.js',
  './js/ds-tutorial.js',
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

// Hosts whose images we lazily cache as the user browses (cache-first).
// Card art lives on third-party CDNs — caching it lets decks /
// search results / playtest views still show artwork offline.
// Opaque responses (no CORS) are acceptable for <img> tags.
var IMAGE_CACHE_HOSTS = [
  'limitlesstcg.nyc3.cdn.digitaloceanspaces.com', // EN + JP card scans
  'r2.limitlesstcg.net',                          // archetype icons
  'images.pokemontcg.io'                          // generic card backs / official
];

function isLazyImageHost(url) {
  if (url.origin === location.origin) return false;
  if (IMAGE_CACHE_HOSTS.indexOf(url.hostname) === -1) return false;
  // Be conservative: only intercept actual image extensions so we don't
  // accidentally cache things like API JSON from these hosts.
  return /\.(png|jpg|jpeg|webp|gif|svg)(\?|$)/i.test(url.pathname);
}

// Fetch handler â€” strategy varies by resource type
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Skip non-GET
  if (event.request.method !== 'GET') return;

  // Cross-origin image hosts (card art): cache-first with opaque
  // response storage. Image tags don't need CORS to render so the
  // browser will display them just fine. We explicitly build a new
  // no-cors Request because passing { mode } in the init of
  // fetch(Request, init) does NOT override the original mode — it's
  // tied to the Request object.
  if (url.origin !== location.origin) {
    if (isLazyImageHost(url)) {
      event.respondWith(
        caches.match(event.request).then(function(cached) {
          if (cached) return cached;
          var noCorsReq = new Request(event.request.url, { mode: 'no-cors', credentials: 'omit' });
          return fetch(noCorsReq)
            .then(function(response) {
              // Opaque responses have status 0 but are valid for <img>.
              if (response) {
                var clone = response.clone();
                caches.open(CACHE_NAME).then(function(cache) {
                  // Key by the original request URL so subsequent fetches
                  // (made via <img> or via the prefetcher) all hit the
                  // same cache entry.
                  cache.put(event.request.url, clone);
                });
              }
              return response;
            })
            .catch(function() {
              return new Response('', { status: 504, statusText: 'offline' });
            });
        })
      );
      return;
    }
    // Other cross-origin requests (Firebase Auth, Firestore, etc.)
    // pass through untouched.
    return;
  }

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

  // Data files (CSV / JSON under /data/): NETWORK-FIRST, STRICT WHEN ONLINE.
  // User-flagged 2026-06: cache fallback was silently serving STALE data
  // even when the browser was online but the fetch hit a transient
  // error (CDN hiccup, captive portal, weak wifi). Result: months-old
  // shares lying about the meta. Fix is to fall back to cache ONLY
  // when the browser self-reports offline (navigator.onLine === false).
  // When online, propagate the network error so the calling code can
  // show "data unavailable" rather than a confidently-wrong stale
  // value. Also upgraded the request cache mode from 'no-cache' to
  // 'no-store' to bypass HTTP cache layers as well.
  if (url.pathname.indexOf('/data/') !== -1) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then(function(response) {
          if (response && response.ok) {
            var clone = response.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(cleanUrl, clone);
            });
          }
          return response;
        })
        .catch(function(err) {
          // STRICT ONLINE: only cache-fall-back when the browser
          // reports offline. Some user agents have flaky onLine, but
          // it's strictly better than the alternative (lying with
          // months-old shares to a connected user).
          if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            return caches.match(cleanUrl);
          }
          // Online failure: propagate the error. Callers in
          // app-meta-call.js wrap the fetch in try/catch and degrade
          // gracefully (e.g. show "no data yet" instead of stale).
          throw err;
        })
    );
    return;
  }

  // — JS / CSS: NETWORK-FIRST, STRICT WHEN ONLINE (same rationale) —
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then(function(response) {
          if (response && response.ok) {
            var clone = response.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(cleanUrl, clone);
            });
          }
          return response;
        })
        .catch(function(err) {
          if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            return caches.match(cleanUrl);
          }
          throw err;
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
