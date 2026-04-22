/*
 * ArchetypeIcons — resolves meta archetype names to Limitless R2 icon URLs.
 *
 * Usage:
 *   await ArchetypeIcons.preload();
 *   const urls = ArchetypeIcons.getIconUrls("N's Zoroark");
 *   // → ["https://r2.limitlesstcg.net/pokemon/gen9/zoroark.png"]
 *
 * Matching is apostrophe-robust (same normalize() logic as MetaCall) so that
 * curly/straight quote mismatches don't break lookups. Callers that render
 * <img> tags should attach an onerror handler to hide broken URLs gracefully —
 * the mapping is curated by hand and new archetypes will surface as misses.
 */
(function (global) {
  'use strict';

  const DATA_URL = 'data/archetype_icons.json';

  // Cache-buster so a fresh deploy's JSON is picked up even when the
  // browser cached an older version of this script. We intentionally
  // use a runtime-variable token so repeat calls within one session
  // still hit the browser cache, but a new session (= new script load
  // after deploy) fetches fresh data.
  const CACHE_TOKEN = (typeof document !== 'undefined' && document.currentScript)
    ? (document.currentScript.src.match(/[?&]v=([^&]+)/) || [,'dev'])[1]
    : 'dev';

  let _data = null;
  let _normalizedIndex = null;
  let _loadPromise = null;

  function normalize(name) {
    // Mirror of js/app-meta-call.js normalize(): strip whitespace, hyphens,
    // and all apostrophe variants (U+0027, U+2018, U+2019, U+201B, U+0060,
    // U+00B4, U+02BC) so matches survive typography drift.
    return (name || '').toLowerCase().replace(/[\s\-\u0027\u2018\u2019\u201B\u0060\u00B4\u02BC]/g, '');
  }

  function _buildIndex(archetypes) {
    const idx = new Map();
    for (const key of Object.keys(archetypes)) {
      idx.set(normalize(key), archetypes[key]);
    }
    return idx;
  }

  async function preload() {
    if (_data) return _data;
    if (_loadPromise) return _loadPromise;
    // Use the script's own ?v= token as a query-string cache-buster so
    // the JSON stays tied to the deploy that shipped this script. Remove
    // force-cache — it made stale JSON stick even after the script was
    // updated, which hid newly-added archetypes like Raging Bolt Noctowl.
    const urlWithVersion = DATA_URL + '?v=' + encodeURIComponent(CACHE_TOKEN);
    _loadPromise = fetch(urlWithVersion)
      .then(r => {
        if (!r.ok) throw new Error(`archetype_icons.json HTTP ${r.status}`);
        return r.json();
      })
      .then(json => {
        _data = json;
        _normalizedIndex = _buildIndex(json.archetypes || {});
        return _data;
      })
      .catch(err => {
        console.warn('[ArchetypeIcons] preload failed:', err);
        _data = { _meta: {}, archetypes: {} };
        _normalizedIndex = new Map();
        return _data;
      });
    return _loadPromise;
  }

  function getIconUrls(archetypeName) {
    if (!_data || !_normalizedIndex) return [];
    const arch = _data.archetypes || {};
    const meta = _data._meta || {};
    const prefix = meta.urlPrefix || '';
    const suffix = meta.urlSuffix || '.png';

    // Fast path: exact key match.
    let species = arch[archetypeName];
    if (!species) {
      // Fallback: normalize-equal scan via prebuilt index.
      species = _normalizedIndex.get(normalize(archetypeName));
    }
    if (!Array.isArray(species) || species.length === 0) return [];
    return species.map(s => prefix + s + suffix);
  }

  function hasIcons(archetypeName) {
    return getIconUrls(archetypeName).length > 0;
  }

  // HTML-attribute escape for the img src= (URLs are safe, but belt-and
  // braces — a CDN path change shouldn't ever blow up the callsite).
  function _escAttr(s) {
    return String(s == null ? '' : s).replace(/"/g, '&quot;');
  }

  // Centralised icon renderer so every feature uses the same markup.
  // Returns HTML string — either a single <img> (single-Pokémon deck)
  // or a <span.tcg-pokemon-icon-group> wrapping 1-2 <img>s. Empty string
  // when the archetype has no mapping OR ArchetypeIcons hasn't loaded
  // yet. Callers MUST keep a text label so unknown archetypes degrade.
  //
  // Options:
  //   size:   'sm' (18px) | 'md' (28px) | 'lg' (40px)   default: 'md'
  //   layout: 'stacked' (vertical) | 'inline' (horizontal) default: 'stacked'
  //   alt:    accessibility text for screen readers; default empty
  function getIconHtml(archetypeName, opts) {
    const urls = getIconUrls(archetypeName);
    if (!urls.length) return '';
    const size = (opts && opts.size) || 'md';
    const layout = (opts && opts.layout) || 'stacked';
    const alt = (opts && opts.alt) || '';
    const imgs = urls.map(u =>
      `<img class="tcg-pokemon-icon tcg-pokemon-icon--${size}" ` +
      `src="${_escAttr(u)}" alt="${_escAttr(alt)}" ` +
      `loading="lazy" onerror="this.style.display='none'">`
    ).join('');
    if (urls.length === 1) return imgs;
    const groupCls = layout === 'inline'
      ? 'tcg-pokemon-icon-group tcg-pokemon-icon-group--inline'
      : 'tcg-pokemon-icon-group';
    return `<span class="${groupCls}">${imgs}</span>`;
  }

  global.ArchetypeIcons = {
    preload,
    getIconUrls,
    getIconHtml,
    hasIcons,
    normalize
  };

  // Fire preload on script load so consumers usually find data ready.
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => { preload(); });
    } else {
      preload();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
