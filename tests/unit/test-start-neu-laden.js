/**
 * START-NEULADEN — beim Oeffnen der Seite wird die neueste Version erzwungen.
 *
 * ANLASS (Hausi, 03.10.2026): Auf dem Handy fehlte die neue Archetyp-Box,
 * obwohl live laengst ausgeliefert. Die Zusage lautet: beim Start (Pokeball)
 * wird der Cache geleert und neu geladen, sobald version.json eine andere
 * Version nennt — und NUR dann nicht, wenn die Seite gerade erst neu
 * geladen wurde (Schleifenschutz).
 *
 * Diese Datei fuehrt den echten Kopf-Skriptblock aus index.html aus
 * (Kommentare vorher entfernt), nicht seinen Text.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTML = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');

function kopfSkript() {
  const a = HTML.indexOf('window.APP_VERSION');
  const von = HTML.lastIndexOf('<script>', a) + '<script>'.length;
  const bis = HTML.indexOf('</script>', a);
  return HTML.slice(von, bis)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

function lauf({ lokal = 'A', server = 'B', sessionKey, location, offline } = {}) {
  const log = { cachesGeloescht: [], swAbgemeldet: 0, ersetzt: null, local: {}, session: {} };
  if (sessionKey !== undefined) log.session['__tcg_version_refresh'] = sessionKey;
  const store = (o) => ({
    getItem: (k) => (k in o ? o[k] : null),
    setItem: (k, v) => { o[k] = String(v); },
    removeItem: (k) => { delete o[k]; },
  });
  const loc = Object.assign({ pathname: '/', search: '', hash: '' }, location || {});
  loc.replace = (u) => { log.ersetzt = u; };
  const win = {
    location: loc,
    caches: { keys: async () => ['c1', 'c2'], delete: async (k) => { log.cachesGeloescht.push(k); return true; } },
  };
  const ctx = {
    window: win, console: { info() {}, warn() {} }, URLSearchParams, Date, Promise, String, parseInt,
    sessionStorage: store(log.session), localStorage: store(log.local),
    navigator: { serviceWorker: { getRegistrations: async () => [{ unregister: async () => { log.swAbgemeldet++; } }] } },
    fetch: async () => { if (offline) throw new Error('offline'); return { ok: true, json: async () => ({ version: server }) }; },
  };
  ctx.self = win;
  win.window = win;
  Object.defineProperty(ctx, 'caches', { get: () => win.caches });
  vm.createContext(ctx);
  const code = kopfSkript().replace(/window\.APP_VERSION\s*=\s*'[^']*'/, "window.APP_VERSION = '" + lokal + "'");
  vm.runInContext(code, ctx);
  return new Promise((ok) => setTimeout(() => ok(log), 20));
}

describe('Start-Neuladen', () => {
  it('Abweichung: Cache leeren, Service Worker abmelden, neu laden', async () => {
    const l = await lauf({ lokal: 'A', server: 'B' });
    assert.deepEqual(l.cachesGeloescht.sort(), ['c1', 'c2']);
    assert.equal(l.swAbgemeldet, 1);
    assert.match(l.ersetzt, /_v=B/);
  });
  it('Adresszusatz und Parameter bleiben erhalten', async () => {
    const l = await lauf({ location: { search: '?sharedDeck=x1', hash: '#archetyp-box' } });
    assert.match(l.ersetzt, /sharedDeck=x1/);
    assert.match(l.ersetzt, /_v=B/);
    assert.ok(l.ersetzt.endsWith('#archetyp-box'));
  });
  it('gleiche Version: nichts passiert, Protokoll "aktuell"', async () => {
    const l = await lauf({ lokal: 'B', server: 'B' });
    assert.equal(l.ersetzt, null);
    assert.equal(JSON.parse(l.local['__tcg_version_check']).status, 'aktuell');
  });
  it('Neustart von eben: kein zweiter Neustart, Protokoll "abweichend"', async () => {
    const l = await lauf({ sessionKey: String(Date.now() - 5000) });
    assert.equal(l.ersetzt, null);
    assert.equal(JSON.parse(l.local['__tcg_version_check']).status, 'abweichend');
  });
  it('alter Rest (Altwert "1" oder > 2 Minuten) sperrt die Pruefung NICHT', async () => {
    const a = await lauf({ sessionKey: '1' });
    assert.match(a.ersetzt, /_v=B/);
    const b = await lauf({ sessionKey: String(Date.now() - 10 * 60 * 1000) });
    assert.match(b.ersetzt, /_v=B/);
  });
  it('offline: kein Neustart, Protokoll "offline"', async () => {
    const l = await lauf({ offline: true });
    assert.equal(l.ersetzt, null);
    assert.equal(JSON.parse(l.local['__tcg_version_check']).status, 'offline');
  });
  it('Fussbereich zeigt den Stand', () => {
    assert.match(HTML, /id="app-stand"/);
    assert.match(HTML, /data-i18n="footer\.stand"/);
  });
});
