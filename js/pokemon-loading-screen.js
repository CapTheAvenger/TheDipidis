/**
 * Pokémon TCG Hub - Loading Screen mit IndexedDB CSV-Caching
 * Zeigt eine Pokémon-Ladeanimation und cached alle CSV-Daten in IndexedDB
 */

(function () {
  'use strict';

  // ─── KONSTANTEN ───────────────────────────────────────────────────────────
  const CACHE_DB_NAME   = 'dipidis-csv-cache';
  const CACHE_DB_VER    = 1;
  const CACHE_STORE     = 'csvData';
  const VERSION_URL     = 'version.json';

  // Alle CSV/JSON-Dateien die gecacht werden sollen
  const DATA_FILES = [
    { key: 'city_league_analysis',              url: 'data/city_league_analysis.csv',              type: 'csv' },
    { key: 'city_league_archetypes',            url: 'data/city_league_archetypes.csv',            type: 'csv' },
    { key: 'city_league_archetypes_M3',         url: 'data/city_league_archetypes_M3.csv',         type: 'csv' },
    { key: 'city_league_archetypes_comparison', url: 'data/city_league_archetypes_comparison.csv', type: 'csv' },
    { key: 'city_league_images',                url: 'data/city_league_images.json',               type: 'json' },
    { key: 'pokemon_dex_numbers',               url: 'data/pokemon_dex_numbers.json',              type: 'json' },
    { key: 'sets',                              url: 'data/sets.json',                             type: 'json' },
    { key: 'pokemon_sets_mapping',              url: 'pokemon_sets_mapping.csv',                   type: 'csv' },
    { key: 'ace_specs',                         url: 'data/ace_specs.json',                        type: 'json' },
  ];

  // Pokémon Lade-Sprüche
  const LOADING_MESSAGES = [
    "Pokédex wird aktualisiert...",
    "Meta-Daten werden analysiert...",
    "Archetypes werden geladen...",
    "Deck-Statistiken werden berechnet...",
    "Turnier-Ergebnisse werden sortiert...",
    "City League Daten werden gecacht...",
    "Karten-Datenbank wird vorbereitet...",
    "Fast fertig! Trainer macht sich bereit...",
  ];

  // Pokéball SVG (inline, kein externes Bild nötig)
  const POKEBALL_SVG = `
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="48" fill="white" stroke="#333" stroke-width="4"/>
      <path d="M2 50 Q2 2 50 2 Q98 2 98 50" fill="#EE1515"/>
      <rect x="2" y="46" width="96" height="8" fill="#333"/>
      <circle cx="50" cy="50" r="14" fill="white" stroke="#333" stroke-width="4"/>
      <circle cx="50" cy="50" r="7" fill="white" stroke="#ccc" stroke-width="2"/>
    </svg>`;

  // ─── LOADING SCREEN HTML & CSS ─────────────────────────────────────────────
  function createLoadingScreen() {
    const css = `
      #dipidis-loader {
        position: fixed; inset: 0; z-index: 99999;
        background: linear-gradient(135deg, #0f0c29 0%, #1a1a4e 40%, #24243e 100%);
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        font-family: 'Segoe UI', Arial, sans-serif;
        color: white; overflow: hidden;
        transition: opacity 0.6s ease, transform 0.6s ease;
      }
      #dipidis-loader.fade-out {
        opacity: 0; transform: scale(1.05);
        pointer-events: none;
      }

      /* Animated background particles */
      #dipidis-loader::before {
        content: '';
        position: absolute; inset: 0;
        background-image:
          radial-gradient(circle at 20% 20%, rgba(255,200,0,0.08) 0%, transparent 40%),
          radial-gradient(circle at 80% 80%, rgba(238,21,21,0.08) 0%, transparent 40%);
        animation: bgPulse 4s ease-in-out infinite alternate;
      }
      @keyframes bgPulse {
        from { opacity: 0.5; } to { opacity: 1; }
      }

      /* Pokéball spinner */
      .loader-ball {
        width: 110px; height: 110px;
        animation: spin 1.2s linear infinite;
        filter: drop-shadow(0 0 18px rgba(238,21,21,0.7))
                drop-shadow(0 0 35px rgba(238,21,21,0.4));
        margin-bottom: 32px; position: relative; z-index: 1;
      }
      @keyframes spin {
        from { transform: rotate(0deg); }
        to   { transform: rotate(360deg); }
      }

      /* Title */
      .loader-title {
        font-size: 2rem; font-weight: 700; letter-spacing: 2px;
        text-transform: uppercase; margin-bottom: 6px;
        background: linear-gradient(90deg, #FFD700, #FFA500, #FFD700);
        background-size: 200% auto;
        -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        background-clip: text;
        animation: shimmer 2s linear infinite;
        position: relative; z-index: 1;
      }
      @keyframes shimmer {
        from { background-position: 0% center; }
        to   { background-position: 200% center; }
      }

      .loader-subtitle {
        font-size: 0.85rem; color: rgba(255,255,255,0.5);
        letter-spacing: 3px; text-transform: uppercase;
        margin-bottom: 40px; position: relative; z-index: 1;
      }

      /* Progress bar */
      .loader-progress-wrap {
        width: min(380px, 80vw); position: relative; z-index: 1;
      }
      .loader-progress-bar {
        width: 100%; height: 8px; border-radius: 4px;
        background: rgba(255,255,255,0.1);
        overflow: hidden; margin-bottom: 14px;
        border: 1px solid rgba(255,255,255,0.15);
      }
      .loader-progress-fill {
        height: 100%; width: 0%;
        background: linear-gradient(90deg, #EE1515, #FFD700);
        border-radius: 4px;
        transition: width 0.35s ease;
        box-shadow: 0 0 8px rgba(238,21,21,0.6);
      }
      .loader-progress-text {
        display: flex; justify-content: space-between;
        font-size: 0.75rem; color: rgba(255,255,255,0.55);
      }
      .loader-status-msg {
        text-align: center; font-size: 0.82rem;
        color: rgba(255,255,255,0.65); margin-top: 10px;
        min-height: 1.2em; letter-spacing: 0.5px;
        animation: fadeMsg 0.4s ease;
      }
      @keyframes fadeMsg {
        from { opacity: 0; transform: translateY(4px); }
        to   { opacity: 1; transform: translateY(0); }
      }

      /* Cache indicator */
      .loader-cache-badge {
        margin-top: 22px; padding: 5px 14px; border-radius: 20px;
        font-size: 0.72rem; letter-spacing: 1px;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.15);
        color: rgba(255,255,255,0.4);
        position: relative; z-index: 1;
      }
      .loader-cache-badge.from-cache {
        background: rgba(34,197,94,0.15);
        border-color: rgba(34,197,94,0.4);
        color: rgba(34,197,94,0.9);
      }
    `;

    const html = `
      <div class="loader-ball">${POKEBALL_SVG}</div>
      <div class="loader-title">Pokémon TCG Hub</div>
      <div class="loader-subtitle">Meta Analysis &amp; Deck Building</div>
      <div class="loader-progress-wrap">
        <div class="loader-progress-bar">
          <div class="loader-progress-fill" id="dipidis-progress-fill"></div>
        </div>
        <div class="loader-progress-text">
          <span id="dipidis-progress-label">Initialisierung...</span>
          <span id="dipidis-progress-pct">0%</span>
        </div>
        <div class="loader-status-msg" id="dipidis-status-msg">Daten werden vorbereitet...</div>
      </div>
      <div class="loader-cache-badge" id="dipidis-cache-badge">⚡ Daten werden geladen</div>
    `;

    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    const el = document.createElement('div');
    el.id = 'dipidis-loader';
    el.innerHTML = html;
    document.body.insertBefore(el, document.body.firstChild);
    return el;
  }

  // ─── FORTSCHRITT UPDATEN ───────────────────────────────────────────────────
  let currentMsg = 0;
  function updateProgress(pct, label) {
    const fill  = document.getElementById('dipidis-progress-fill');
    const lbl   = document.getElementById('dipidis-progress-label');
    const pctEl = document.getElementById('dipidis-progress-pct');
    const msg   = document.getElementById('dipidis-status-msg');
    if (fill)  fill.style.width = Math.min(100, pct) + '%';
    if (lbl && label) lbl.textContent = label;
    if (pctEl) pctEl.textContent = Math.round(pct) + '%';
    if (msg) {
      const next = LOADING_MESSAGES[currentMsg % LOADING_MESSAGES.length];
      if (msg.textContent !== next) {
        msg.style.animation = 'none';
        msg.offsetHeight;   // reflow
        msg.style.animation = '';
        msg.textContent = next;
      }
      currentMsg++;
    }
  }

  function setBadge(fromCache) {
    const badge = document.getElementById('dipidis-cache-badge');
    if (!badge) return;
    if (fromCache) {
      badge.textContent = '✅ Daten aus Cache geladen (instant!)';
      badge.classList.add('from-cache');
    } else {
      badge.textContent = '⬇️ Daten werden heruntergeladen & gecacht';
    }
  }

  function hideLoader() {
    const el = document.getElementById('dipidis-loader');
    if (!el) return;
    updateProgress(100, 'Bereit!');
    setTimeout(() => {
      el.classList.add('fade-out');
      setTimeout(() => el.remove(), 700);
    }, 400);
  }

  // ─── INDEXEDDB CACHE ───────────────────────────────────────────────────────
  function openCacheDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(CACHE_DB_NAME, CACHE_DB_VER);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(CACHE_STORE)) {
          db.createObjectStore(CACHE_STORE, { keyPath: 'key' });
        }
      };
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = e => reject(e.target.error);
    });
  }

  function dbGet(db, key) {
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(CACHE_STORE, 'readonly');
      const req = tx.objectStore(CACHE_STORE).get(key);
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = e => reject(e.target.error);
    });
  }

  function dbPut(db, entry) {
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(CACHE_STORE, 'readwrite');
      const req = tx.objectStore(CACHE_STORE).put(entry);
      req.onsuccess = () => resolve();
      req.onerror   = e => reject(e.target.error);
    });
  }

  // ─── VERSION CHECK ─────────────────────────────────────────────────────────
  async function fetchCurrentVersion() {
    try {
      const r = await fetch(VERSION_URL + '?_=' + Date.now());
      const j = await r.json();
      return j.version || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  // ─── DATEI LADEN (mit Cache) ───────────────────────────────────────────────
  async function fetchWithCache(db, fileInfo, version) {
    const cacheKey = fileInfo.key + '_v2';
    try {
      const cached = await dbGet(db, cacheKey);
      if (cached && cached.version === version && cached.data) {
        return { data: cached.data, fromCache: true };
      }
    } catch (e) { /* Cache-Fehler ignorieren */ }

    const r = await fetch(fileInfo.url);
    if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + fileInfo.url);
    const text = await r.text();

    dbPut(db, { key: cacheKey, version, data: text, ts: Date.now() }).catch(() => {});

    return { data: text, fromCache: false };
  }

  // ─── GLOBALES CACHE-OBJEKT ─────────────────────────────────────────────────
  window.dipidisDataCache = {};

  // ─── HAUPT-INITIALISIERUNG ─────────────────────────────────────────────────
  async function init() {
    const loaderEl = createLoadingScreen();
    updateProgress(2, 'Version wird geprüft...');

    let db, version, anyFromNetwork = false;

    try {
      [db, version] = await Promise.all([openCacheDB(), fetchCurrentVersion()]);
    } catch (e) {
      console.warn('[dipidis-loader] Cache/Version-Fehler:', e);
      hideLoader();
      return;
    }

    updateProgress(8, 'Cache wird geprüft...');

    const total = DATA_FILES.length;
    let done = 0;

    await Promise.allSettled(
      DATA_FILES.map(async (file) => {
        try {
          const { data, fromCache } = await fetchWithCache(db, file, version);
          if (!fromCache) anyFromNetwork = true;
          window.dipidisDataCache[file.key] = data;
        } catch (e) {
          console.warn('[dipidis-loader] Fehler bei', file.key, e);
        }
        done++;
        const pct = 8 + (done / total) * 82;
        updateProgress(pct, file.key.replace(/_/g, ' ') + '...');
      })
    );

    setBadge(!anyFromNetwork);
    updateProgress(95, 'App wird initialisiert...');

    await new Promise(r => setTimeout(r, 300));

    hideLoader();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
