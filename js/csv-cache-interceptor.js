/**
 * CSV Cache Interceptor + Smart Data Proxy
 *
 * 1. Serviert alle Daten aus IndexedDB-Cache (kein Re-Download)
 * 2. Baut einen Archetype-Index über alle Analyse-Zeilen auf (einmalig, ~30ms)
 * 3. Ersetzt window.cityLeagueAnalysisData mit einem JS Proxy der array-Operationen
 *    automatisch auf die vorgefilterten Zeilen des aktuellen Archetypes umleitet
 *    → applyCityLeagueFilter: 7.000ms → ~300ms
 *    → Funktioniert auch wenn die App applyCityLeagueFilter neu definiert!
 *
 * MUSS vor app-core.js / app-city-league.js geladen werden.
 */

(function () {
  'use strict';

  // ─── URL → Cache-Key Mapping ────────────────────────────────────────────────
  const URL_TO_CACHE_KEY = {
    'city_league_analysis.csv':              'city_league_analysis',
    'city_league_archetypes.csv':            'city_league_archetypes',
    'city_league_archetypes_M3.csv':         'city_league_archetypes_M3',
    'city_league_archetypes_comparison.csv': 'city_league_archetypes_comparison',
    'city_league_images.json':               'city_league_images',
    'pokemon_dex_numbers.json':              'pokemon_dex_numbers',
    'sets.json':                             'sets',
    'pokemon_sets_mapping.csv':              'pokemon_sets_mapping',
    'ace_specs.json':                        'ace_specs',
  };

  function getBasename(url) {
    return (url || '').split('?')[0].split('/').pop();
  }

  // ─── PATCH: fetch() für CSV + JSON ──────────────────────────────────────────
  const _origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url      = typeof input === 'string' ? input : (input && input.url ? input.url : '');
    const basename = getBasename(url);
    const cacheKey = URL_TO_CACHE_KEY[basename];

    if (cacheKey && window.dipidisDataCache && window.dipidisDataCache[cacheKey]) {
      const cachedText = window.dipidisDataCache[cacheKey];
      const isJson = basename.endsWith('.json');
      console.log('[csv-cache] Serving from cache:', basename);
      return Promise.resolve(new Response(cachedText, {
        status: 200,
        headers: { 'Content-Type': isJson ? 'application/json' : 'text/csv' }
      }));
    }

    return _origFetch.apply(this, arguments);
  };

  // ─── INDEX BUILDER ──────────────────────────────────────────────────────────
  function buildAnalysisIndexes(data) {
    if (!data || data.length < 1000) return;

    const t0 = performance.now();

    const idx = Object.create(null);
    for (const row of data) {
      const arch = row.archetype;
      if (!idx[arch]) idx[arch] = [];
      idx[arch].push(row);
    }

    window._analysisIndex = idx;
    window._analysisIndexBuilt = true;

    console.log(
      '[perf-patch] Indexes built in ' + Math.round(performance.now() - t0) + 'ms | ' +
      Object.keys(idx).length + ' archetypes'
    );
  }

  // ─── SMART DATA PROXY ──────────────────────────────────────────────────────
  // Kern der Optimierung: Ein Proxy auf cityLeagueAnalysisData der
  // Array-Iterationen transparent zur vorgefilterten Teilmenge umleitet.
  // Überlebt jedes Neudefinieren von applyCityLeagueFilter weil wir
  // die DATEN patchen, nicht die Funktion.

  const ARRAY_METHODS = [
    'forEach', 'filter', 'find', 'findIndex', 'map',
    'some', 'every', 'reduce', 'reduceRight', 'flatMap'
  ];

  function buildSmartProxy(data) {
    return new Proxy(data, {
      get(target, prop) {
        // Für array-Iterationsmethoden: nutze den Archetype-Index
        if (ARRAY_METHODS.includes(prop)) {
          const arch = window.currentCityLeagueArchetype;
          const idx  = window._analysisIndex;

          if (arch && idx && idx[arch] && target.length > 10000) {
            const slice = idx[arch];
            return slice[prop].bind(slice);
          }
        }

        // Für alles andere: normaler Datenzugriff
        const val = target[prop];
        return typeof val === 'function' ? val.bind(target) : val;
      },

      set(target, prop, value) {
        target[prop] = value;
        return true;
      }
    });
  }

  function installDataProxy(data) {
    buildAnalysisIndexes(data);

    let _proxy = buildSmartProxy(data);

    try {
      Object.defineProperty(window, 'cityLeagueAnalysisData', {
        configurable: true,
        get() { return _proxy; },
        set(newData) {
          if (newData && Array.isArray(newData) && newData.length > 1000) {
            console.log('[perf-patch] New analysis data: ' + newData.length + ' rows – rebuilding index');
            buildAnalysisIndexes(newData);
            _proxy = buildSmartProxy(newData);
          } else if (newData) {
            // Kleine Datensets (z.B. nach Filterung) direkt zuweisen
            _proxy = newData;
          }
        }
      });
      console.log('[perf-patch] Smart data proxy installed on cityLeagueAnalysisData');
    } catch (e) {
      window.cityLeagueAnalysisData = _proxy;
      console.log('[perf-patch] Smart data proxy installed (direct assignment)');
    }
  }

  // ─── WARTEN AUF DATEN ───────────────────────────────────────────────────────
  let _proxyInstalled = false;

  function waitAndInstallProxy() {
    const data = window.cityLeagueAnalysisData;

    if (data && Array.isArray(data) && data.length > 1000 && !_proxyInstalled) {
      _proxyInstalled = true;
      installDataProxy(data);
      return;
    }

    setTimeout(waitAndInstallProxy, 200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(waitAndInstallProxy, 300));
  } else {
    setTimeout(waitAndInstallProxy, 300);
  }

  window.addEventListener('cityLeagueLoaded', () => {
    if (!_proxyInstalled && window.cityLeagueAnalysisData &&
        Array.isArray(window.cityLeagueAnalysisData) &&
        window.cityLeagueAnalysisData.length > 1000) {
      _proxyInstalled = true;
      installDataProxy(window.cityLeagueAnalysisData);
    }
  });

  console.log('[csv-cache] fetch interceptor + smart proxy installed');

})();
