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
    // Teal Mask ist Ogerpons GRUNDFORM — Limitless fuehrt sie unter
    // dem blanken 'ogerpon'. Der leere Suffix heisst hier "Formwort
    // erkannt, aber kein Zusatz am Slug". Am 31.08.2026 geprueft:
    // ogerpon, ogerpon-wellspring, ogerpon-hearthflame und
    // ogerpon-cornerstone laden, ogerpon-teal-mask nicht.
    'tealmask':  '',
  };

  // Kuerzestes Pokemon der Reihe hat drei Buchstaben (Mew, Muk). Ein
  // ein- oder zweibuchstabiges Wort ist nie eine Art — "N's Zoroark"
  // ergab sonst den Slug 'n', und den gibt es nicht.
  const _MIN_SLUG_LAENGE = 3;

  /* Art + Formzusatz -> Slug, mit der Variante GANZ hinten.
   *
   * BEFUND (31.08.2026): "Mega Charizard-X" ergab charizard-x-mega.
   * Limitless schreibt charizard-mega-x — geprueft, ebenso
   * mewtwo-mega-x/-y. Der Dreher steckte in zehn kuratierten
   * Eintraegen UND hier im Rateweg; nach der Datenkorrektur kam er
   * ueber diesen Weg sofort zurueck, weil nicht jeder Archetypname in
   * der kuratierten Datei steht. */
  function _formSlug(art, suffix) {
    const m = String(art).match(/^(.+)-([xy])$/);
    if (m) return suffix ? `${m[1]}-${suffix}-${m[2]}` : `${m[1]}-${m[2]}`;
    return suffix ? `${art}-${suffix}` : String(art);
  }

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

      // Formzusatz, ein ODER zwei Woerter. "Teal Mask Ogerpon" kam
      // vorher als ["teal","mask"] heraus — zwei Slugs, die es beide
      // nicht gibt, und Ogerpon selbst tauchte gar nicht auf.
      let formSuffix = _FORM_PREFIX_SUFFIX[w];
      let extraWort = 0;
      if (formSuffix === undefined && raw[i + 1]) {
        const zusammen = w + raw[i + 1].toLowerCase();
        if (_FORM_PREFIX_SUFFIX[zusammen] !== undefined) {
          formSuffix = _FORM_PREFIX_SUFFIX[zusammen];
          extraWort = 1;
        }
      }

      // `undefined` heisst "kein Formwort"; '' heisst "Formwort, aber
      // der Slug traegt keinen Zusatz" (Ogerpons Teal Mask). Die
      // Unterscheidung braucht !== undefined, ein Wahrheitstest wuerde
      // den leeren Zusatz verschlucken.
      const artWort = raw[i + 1 + extraWort];
      if (formSuffix !== undefined && artWort) {
        const nxt = artWort.toLowerCase();
        if (!_NOISE_TOKENS.has(nxt)) {
          const combined = _formSlug(nxt, formSuffix);
          if (combined && !seen.has(combined)) {
            slugs.push(combined);
            seen.add(combined);
          }
          i += 1 + extraWort; // Formwort(e) + Art verbraucht
          continue;
        }
      }

      if (w.length >= _MIN_SLUG_LAENGE && !seen.has(w)) {
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

  // Ein Slug enthaelt nur Kleinbuchstaben, Ziffern und Bindestriche.
  // Alles andere ist ein NAME und muss ueber die Namensaufloesung.
  const _IST_SLUG = /^[a-z0-9-]+$/;

  /* Direkter Slug-Renderer — fuer Aufrufer, die den Artnamen schon als
   * Slug haben und die Archetyp-Aufloesung nicht brauchen.
   *
   * BEFUND (31.08.2026, live in der City-League-Tabelle): der Aufrufer
   * reicht hier `d.main` durch, und das ist KEIN Slug, sondern ein
   * Archetyp-Name. Aus "Mega Venusaur" wurde
   * .../gen9/mega%20venusaur.png, aus "N's" wurde .../gen9/n's.png —
   * Adressen mit Leerzeichen und Apostroph, die nie laden koennen.
   *
   * Statt den Aufrufer umzubauen (und den naechsten wieder zu
   * vergessen) prueft die Funktion jetzt selbst, was sie bekommen hat:
   * sieht es nicht wie ein Slug aus, laeuft es ueber dieselbe
   * Namensaufloesung wie getIconHtml. "Mega Venusaur" ergibt so
   * venusaur-mega, "N's" gar nichts — beides besser als eine Adresse,
   * die garantiert scheitert. */
  function slugIconHtml(slug, opts) {
    if (!slug) return '';
    const roh = String(slug).trim();
    if (!roh) return '';
    if (!_IST_SLUG.test(roh.toLowerCase())) {
      return getIconHtml(roh, {
        size: (opts && opts.size) || 'sm',
        layout: 'inline',
        alt: (opts && opts.alt) || '',
      });
    }
    const meta = (_data && _data._meta) || {};
    const prefix = meta.urlPrefix || 'https://r2.limitlesstcg.net/pokemon/gen9/';
    const suffix = meta.urlSuffix || '.png';
    const size = (opts && opts.size) || 'sm';
    const alt = (opts && opts.alt) || '';
    return `<img class="tcg-pokemon-icon tcg-pokemon-icon--${size}" ` +
           `src="${_escAttr(prefix + roh.toLowerCase() + suffix)}" ` +
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
