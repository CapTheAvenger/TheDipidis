/* Meta-Call-Szenarien im Konto (FE-44, Hausi 07.10.2026: „Ja, ins Konto“).
 *
 * Szenarien samt Schaetzungen liegen zusaetzlich unter users/{uid}/metaCall/szenarien,
 * damit sie auf jedem Geraet da sind. Abgleich statt Ueberschreiben: je Name gilt der
 * neuere Stand (savedAt); geloeschte Namen werden mit Zeitpunkt gemerkt (wie die
 * Loeschmarken der Decks, FE-18), sonst braechte ein anderes Geraet sie zurueck. Nichts
 * wird ohne Loeschmarke entfernt; der Browser-Speicher bleibt der Spiegel.
 *
 * Eigene Datei, weil js/app-meta-call.js ohne Anmeldung auskommen soll
 * (tests/unit/test-metacall-entkoppelt.js). Meta Call ruft nur `MetaCallKonto.planen()`.
 */
(function () {
  'use strict';
  const SCENARIOS_STORAGE_KEY = 'metacall_scenarios_v1';
  const SZEN_GELOESCHT_KEY = 'metacall_scenarios_geloescht_v1';
  function _loadScenarios() {
    try { return JSON.parse(localStorage.getItem(SCENARIOS_STORAGE_KEY) || '{}') || {}; } catch (_) { return {}; }
  }
  function _szenGeloescht() {
    try { return JSON.parse(localStorage.getItem(SZEN_GELOESCHT_KEY) || '{}') || {}; } catch (_) { return {}; }
  }
  function _szenMarkenVereinen(a, b) {
    const out = {};
    [a || {}, b || {}].forEach(function (src) {
      Object.keys(src).forEach(function (n) { if (!out[n] || String(src[n]) > String(out[n])) out[n] = String(src[n]); });
    });
    return out;
  }
  function _szenZusammenfuehren(a, b, geloescht) {
    const out = {};
    [a || {}, b || {}].forEach(function (src) {
      Object.keys(src).forEach(function (n) {
        const sz = src[n];
        if (!sz || typeof sz !== 'object') return;
        // Gleichstand: die spaetere Quelle (der Browser) gewinnt — „Aktualisieren“ aendert savedAt nicht.
        if (!out[n] || String(sz.savedAt || '') >= String(out[n].savedAt || '')) out[n] = sz;
      });
    });
    Object.keys(geloescht || {}).forEach(function (n) {
      if (out[n] && String(out[n].savedAt || '') <= String(geloescht[n])) delete out[n];
    });
    return out;
  }
  function _szenAusKonto(liste) {
    const out = {};
    (Array.isArray(liste) ? liste : []).forEach(function (e) {
      if (!e || typeof e.name !== 'string') return;
      try { out[e.name] = JSON.parse(e.daten); } catch (_) { /* kaputter Eintrag bleibt draussen */ }
    });
    return out;
  }
  function _szenInsKontoFormat(obj) {
    return Object.keys(obj || {}).map(function (n) { return { name: n, daten: JSON.stringify(obj[n]) }; });
  }
  function _szenKontoRef() {
    try {
      const u = window.auth && window.auth.currentUser;
      if (!u || !window.db) return null;
      return window.db.collection('users').doc(u.uid).collection('metaCall').doc('szenarien');
    } catch (_) { return null; }
  }
  let _szenAbgleichLaeuft = null;
  function _szenAbgleichen() {
    if (_szenAbgleichLaeuft) return _szenAbgleichLaeuft;
    const ref = _szenKontoRef();
    if (!ref) return Promise.resolve(false);
    _szenAbgleichLaeuft = (async function () {
      const doc = await ref.get();
      const server = (doc && doc.exists && doc.data()) || {};
      const geloescht = _szenMarkenVereinen(server.geloescht, _szenGeloescht());
      const vereint = _szenZusammenfuehren(_szenAusKonto(server.szenarien), _loadScenarios(), geloescht);
      try {
        localStorage.setItem(SCENARIOS_STORAGE_KEY, JSON.stringify(vereint));
        localStorage.setItem(SZEN_GELOESCHT_KEY, JSON.stringify(geloescht));
      } catch (_) { /* Spiegel nur Zugabe */ }
      await ref.set({ szenarien: _szenInsKontoFormat(vereint), geloescht: geloescht, geaendert: new Date().toISOString() });
      try { document.dispatchEvent(new CustomEvent('metacall:szenarien-abgeglichen')); } catch (_) { /* nur Hinweis */ }
      return true;
    })().catch(function (e) {
      console.warn('[FE-44] Szenarien nicht mit dem Konto abgeglichen:', e && e.message);
      return false;
    }).finally(function () { _szenAbgleichLaeuft = null; });
    return _szenAbgleichLaeuft;
  }
  let _szenAbgleichTimer = null;
  function planen() {
    clearTimeout(_szenAbgleichTimer);
    _szenAbgleichTimer = setTimeout(function () { _szenAbgleichen(); }, 800);
  }
  (function _szenAnmeldungBeobachten() {
    let versuche = 0;
    const warte = setInterval(function () {
      if (window.auth && typeof window.auth.onAuthStateChanged === 'function') {
        clearInterval(warte);
        window.auth.onAuthStateChanged(function (u) { if (u) _szenAbgleichen(); });
      } else if (++versuche > 60) {
        clearInterval(warte);
      }
    }, 1000);
  })();


  window.MetaCallKonto = { planen: planen, abgleichen: _szenAbgleichen,
    _intern: { zusammenfuehren: _szenZusammenfuehren, markenVereinen: _szenMarkenVereinen } };
})();
