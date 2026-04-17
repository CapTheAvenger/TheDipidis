/**
 * CSV Cache Interceptor
 * Patcht window.fetch um gecachte Daten aus dipidisDataCache zu servieren.
 * Dadurch liefert Papa.parse (download:true) und jeder fetch() für gecachte
 * Dateien sofort die IndexedDB-Daten statt erneut vom Server zu laden.
 *
 * MUSS vor app-core.js / app-city-league.js geladen werden.
 */

(function () {
  'use strict';

  // Map von URL-Basename zu Cache-Key
  const URL_TO_CACHE_KEY = {
    'city_league_analysis.csv':             'city_league_analysis',
    'city_league_archetypes.csv':           'city_league_archetypes',
    'city_league_archetypes_M3.csv':        'city_league_archetypes_M3',
    'city_league_archetypes_comparison.csv':'city_league_archetypes_comparison',
    'city_league_images.json':              'city_league_images',
    'pokemon_dex_numbers.json':             'pokemon_dex_numbers',
    'sets.json':                            'sets',
    'pokemon_sets_mapping.csv':             'pokemon_sets_mapping',
    'ace_specs.json':                       'ace_specs',
  };

  function getFileBasename(url) {
    return url.split('?')[0].split('/').pop();
  }

  // Patch window.fetch — Papa.parse mit download:true nutzt intern fetch/XHR
  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
    const basename = getFileBasename(url);
    const cacheKey = URL_TO_CACHE_KEY[basename];

    if (cacheKey && window.dipidisDataCache && window.dipidisDataCache[cacheKey]) {
      const cachedText = window.dipidisDataCache[cacheKey];
      const isJson = basename.endsWith('.json');
      console.log('[csv-cache] Serving from cache:', basename);
      return Promise.resolve(new Response(cachedText, {
        status: 200,
        headers: {
          'Content-Type': isJson ? 'application/json' : 'text/csv'
        }
      }));
    }

    return originalFetch.apply(this, arguments);
  };

  console.log('[csv-cache] fetch interceptor installed');

})();
