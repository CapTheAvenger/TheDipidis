/**
 * CSV Cache Interceptor + Performance Patch
 * 1. Serviert gecachte Rohdaten aus dipidisDataCache (vom Loading Screen geladen)
 * 2. Baut Lookup-Indizes für alle Analyse-Zeilen auf
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
  // Papa.parse mit download:true nutzt intern fetch — wir servieren aus dem Cache
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
  // Baut Lookup-Indizes sobald cityLeagueAnalysisData verfügbar ist
  function buildAnalysisIndexes() {
    const data = window.cityLeagueAnalysisData;
    if (!data || data.length < 1000) {
      setTimeout(buildAnalysisIndexes, 500);
      return;
    }
    if (window._analysisIndexBuilt) return;
    window._analysisIndexBuilt = true;

    const t0 = performance.now();

    // Archetype-Index: { archetypeName: [row, row, ...] }
    window._analysisIndex = Object.create(null);

    // Perioden-Index: { period: [row, row, ...] }
    window._periodIndex = Object.create(null);

    for (const row of data) {
      const arch   = row.archetype;
      const period = row.period;

      if (!window._analysisIndex[arch])
        window._analysisIndex[arch] = [];
      window._analysisIndex[arch].push(row);

      if (!window._periodIndex[period])
        window._periodIndex[period] = [];
      window._periodIndex[period].push(row);
    }

    console.log(
      '[perf-patch] Indexes built in ' + Math.round(performance.now() - t0) + 'ms | ' +
      Object.keys(window._analysisIndex).length + ' archetypes | ' +
      Object.keys(window._periodIndex).length + ' periods'
    );
  }

  // Index aufbauen sobald Daten geladen sind
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(buildAnalysisIndexes, 500));
  } else {
    setTimeout(buildAnalysisIndexes, 500);
  }
  window.addEventListener('cityLeagueLoaded', buildAnalysisIndexes);

  console.log('[csv-cache] fetch interceptor + index builder installed');

})();
