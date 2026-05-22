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

  // Noise tokens we strip when guessing slugs from a name. These never
  // correspond to a Pokémon; they're card-type or deck-archetype labels.
  const _NOISE_TOKENS = new Set([
    'ex','v','vmax','vstar','gx','tag','team',
    'box','lead','control','toolbox','tera','build',
    'the','of','and','with','dx','lv'
  ]);

  // Form-prefix words that should combine with the NEXT token to form a
  // Limitless slug like "lucario-mega". Handles "Mega Lucario" → lucario-mega,
  // "Alolan Exeggutor" → exeggutor-alola, "Paldean Tauros" → tauros-paldea,
  // "Bloodmoon Ursaluna" → ursaluna-bloodmoon.
  const _FORM_PREFIX_SUFFIX = {
    'mega':      'mega',
    'alolan':    'alola',
    'alola':     'alola',
    'galarian':  'galar',
    'galar':     'galar',
    'hisuian':   'hisui',
    'hisui':     'hisui',
    'paldean':   'paldea',
    'paldea':    'paldea',
    'bloodmoon': 'bloodmoon',
    'wellspring':'wellspring',
    'cornerstone':'cornerstone',
    'hearthflame':'hearthflame',
    'tealmask':  'teal-mask',
  };

  function _sanitizeWord(w) {
    // Drop apostrophe-s possessives ("N's" → "N", "Rocket's" → "Rocket"),
    // stray punctuation, and any other apostrophe variants.
    return String(w || '')
      .replace(/['\u2018\u2019\u201B\u0060\u00B4\u02BC]s?$/i, '')
      .replace(/[.,;:!?()[\]/]/g, '')
      .trim();
  }

  // Guess a small slug list from the archetype name itself. Used as a
  // fallback when archetype_icons.json doesn't have an entry — broken
  // guesses hide themselves via <img onerror>, so wrong guesses degrade
  // to "partial icons + text" rather than "no icons + text". Max 2 slugs
  // so we never spam a row with 4 imgs.
  function _speculativeSlugs(name) {
    if (!name) return [];
    const raw = String(name).split(/\s+/).map(_sanitizeWord).filter(Boolean);
    const slugs = [];
    const seen = new Set();
    for (let i = 0; i < raw.length && slugs.length < 2; i++) {
      const w = raw[i].toLowerCase();
      if (!w || _NOISE_TOKENS.has(w)) continue;

      // Form prefix + next word → "lucario-mega"-style slug.
      const formSuffix = _FORM_PREFIX_SUFFIX[w];
      if (formSuffix && raw[i + 1]) {
        const nxt = raw[i + 1].toLowerCase();
        if (!_NOISE_TOKENS.has(nxt)) {
          const combined = nxt + '-' + formSuffix;
          if (!seen.has(combined)) {
            slugs.push(combined);
            seen.add(combined);
          }
          i++; // consume the pokémon word
          continue;
        }
      }

      if (!seen.has(w)) {
        slugs.push(w);
        seen.add(w);
      }
    }
    return slugs;
  }

  function getIconUrls(archetypeName) {
    if (!_data || !_normalizedIndex) return [];
    const arch = _data.archetypes || {};
    const meta = _data._meta || {};
    const prefix = meta.urlPrefix || '';
    const suffix = meta.urlSuffix || '.png';

    // Fast path: exact key match.
    let species = arch[archetypeName];
    if (!Array.isArray(species)) {
      // Fallback 1: normalize-equal scan via prebuilt index.
      species = _normalizedIndex.get(normalize(archetypeName));
    }

    // Explicit empty-list entries (e.g. Psy Box, Tera Box) are a manual
    // "no icon wanted here" marker — respect them and don't run the
    // speculative fallback, which would guess random slugs.
    if (Array.isArray(species)) {
      if (species.length === 0) return [];
      return species.map(s => prefix + s + suffix);
    }

    // Fallback 2: no entry at all → guess slugs from the name words.
    // Covers newly-discovered archetypes that haven't been scraped yet,
    // and JP City League names that slipped past the backend matcher.
    const speculative = _speculativeSlugs(archetypeName);
    if (!speculative.length) return [];
    return speculative.map(s => prefix + s + suffix);
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

  // Direct Pokémon-slug renderer — useful when the caller already knows
  // the species slug (e.g. City League's `d.main` field is just the
  // main-Pokémon slug without an archetype wrapping) and doesn't need
  // the archetype-name → slugs lookup.
  function slugIconHtml(slug, opts) {
    if (!slug) return '';
    const meta = (_data && _data._meta) || {};
    const prefix = meta.urlPrefix || 'https://r2.limitlesstcg.net/pokemon/gen9/';
    const suffix = meta.urlSuffix || '.png';
    const size = (opts && opts.size) || 'sm';
    const alt = (opts && opts.alt) || '';
    return `<img class="tcg-pokemon-icon tcg-pokemon-icon--${size}" ` +
           `src="${_escAttr(prefix + String(slug).toLowerCase() + suffix)}" ` +
           `alt="${_escAttr(alt)}" loading="lazy" ` +
           `onerror="this.style.display='none'">`;
  }

  global.ArchetypeIcons = {
    preload,
    getIconUrls,
    getIconHtml,
    slugIconHtml,
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
