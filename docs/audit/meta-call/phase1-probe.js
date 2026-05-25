// Phase 1 reproduction probe — find where Crustle 10.29% is rendered
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BROWSER_PATH = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const APP_URL = 'http://127.0.0.1:8765/';
const ART = '/home/user/TheDipidis/docs/audit/meta-call/artifacts';
fs.mkdirSync(ART, { recursive: true });

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}`;
  console.log(line);
  fs.appendFileSync(path.join(ART, 'phase1-probe.log'), line + '\n');
}

// Build a CDN→local file lookup so blocked CDN scripts still work
const CDN_MAP = [
  {
    re: /papaparse.*\.min\.js/i,
    file: '/home/user/TheDipidis/node_modules/papaparse/papaparse.min.js',
    mime: 'application/javascript'
  }
];
// Stub: empty responses for blocked external assets so font/load waits resolve instead of hanging
const STUB_MAP = [
  { re: /fonts\.googleapis\.com\/css/, mime: 'text/css', body: '' },
  { re: /fonts\.gstatic\.com\//, mime: 'font/woff2', body: '' },
  { re: /firebasejs\//, mime: 'application/javascript', body: 'window.firebase={initializeApp(){},auth(){return{onAuthStateChanged(){}}},firestore(){return{}}};' },
  { re: /chart\.umd\.min\.js/, mime: 'application/javascript', body: 'window.Chart=function(){return{destroy(){}}};' },
  { re: /localforage/, mime: 'application/javascript', body: 'window.localforage={getItem:async()=>null,setItem:async()=>null,removeItem:async()=>null};' },
  { re: /mobile-drag-drop/, mime: 'application/javascript', body: '' },
];

(async () => {
  // Truncate log
  try { fs.unlinkSync(path.join(ART, 'phase1-probe.log')); } catch (_) {}

  const browser = await chromium.launch({ executablePath: BROWSER_PATH, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  // Route handler: serve known CDN files from local node_modules
  await ctx.route('**/*', async (route, req) => {
    const url = req.url();
    const m = CDN_MAP.find(x => x.re.test(url));
    if (m) {
      try {
        const body = fs.readFileSync(m.file);
        log('[ROUTE] Serving local for', url);
        return route.fulfill({ status: 200, contentType: m.mime, body });
      } catch (e) { log('[ROUTE] read failed', e.message); }
    }
    // Block any other off-origin requests to avoid hangs from blocked external resources
    const s = STUB_MAP.find(x => x.re.test(url));
    if (s) {
      return route.fulfill({ status: 200, contentType: s.mime, body: s.body });
    }
    const isLocal = url.startsWith('http://127.0.0.1:8765/') || url.startsWith('http://localhost:8765/') || url.startsWith('data:') || url.startsWith('blob:');
    if (!isLocal) {
      log('[ROUTE] Aborting external', url);
      return route.abort();
    }
    return route.continue();
  });

  const page = await ctx.newPage();

  page.on('console', m => {
    const txt = m.text();
    if (/error|warn|past.?meta|crustle|10\.29|meta.?call|svi-asc|tef-por/i.test(txt)) {
      log('[PAGE]', m.type(), txt.slice(0, 400));
    }
  });
  page.on('pageerror', e => log('[PAGEERROR]', e.message));

  log('Opening', APP_URL);
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => log('networkidle timeout — proceeding'));
  // Avoid font wait by using snapshot:false equivalent — just no wait
  await page.screenshot({ path: path.join(ART, '01-app-loaded.png'), fullPage: false, timeout: 10000 }).catch(e => log('screenshot1 failed:', e.message));
  log('App loaded.');

  // Switch to Past Meta via global function (bypass sidebar visibility)
  log('Switching to Past Meta tab via switchTabAndUpdateMenu');
  await page.evaluate(() => {
    if (typeof switchTabAndUpdateMenu === 'function') switchTabAndUpdateMenu('past-meta');
    else if (typeof switchTab === 'function') switchTab('past-meta');
  });
  await page.waitForTimeout(6000); // wait for async data load
  await page.screenshot({ path: path.join(ART, '02-past-meta-tab.png'), fullPage: true, timeout: 30000, animations: 'disabled' }).catch(e => log('screenshot2 failed:', e.message));

  // Inspect format filter options
  const formatOptions = await page.$$eval('#pastMetaFormatFilter option', opts =>
    opts.map(o => ({ value: o.value, label: o.textContent.trim() }))
  ).catch(e => { log('format-filter missing', e.message); return []; });
  log('Format options (' + formatOptions.length + '):', JSON.stringify(formatOptions));

  // Select SVI-ASC
  if (formatOptions.length) {
    const sviOpt = formatOptions.find(o => /SVI[-_ ]ASC|Ascended/i.test(o.label) || /SVI[-_ ]ASC|Ascended/i.test(o.value)) || formatOptions.find(o => o.value === 'SVI-ASC');
    if (sviOpt) {
      log('Selecting SVI-ASC value=' + sviOpt.value);
      await page.selectOption('#pastMetaFormatFilter', sviOpt.value);
      await page.waitForTimeout(6000);
      await page.screenshot({ path: path.join(ART, '03-past-meta-svi-asc.png'), fullPage: true, timeout: 30000, animations: 'disabled' }).catch(e => log('screenshot3 failed:', e.message));
    } else {
      log('SVI-ASC option not present in filter — proceeding anyway');
    }
  }

  // Find 10.29 anywhere
  const found1029 = await page.evaluate(() => {
    const re = /10\.29/;
    const hits = [];
    function walk(el, depth) {
      if (depth > 25) return;
      if (el.nodeType === 3) {
        const txt = (el.textContent || '').trim();
        if (re.test(txt) && txt.length < 200) {
          const p = el.parentElement;
          if (p) hits.push({
            text: txt.slice(0, 150),
            parentTag: p.tagName,
            parentCls: p.className,
            parentId: p.id,
            xpath: getXPath(p)
          });
        }
        return;
      }
      for (const c of el.childNodes) walk(c, depth + 1);
    }
    function getXPath(el) {
      const parts = [];
      while (el && el.nodeType === 1 && parts.length < 30) {
        let n = el.tagName.toLowerCase();
        if (el.id) { parts.unshift(`${n}[@id="${el.id}"]`); break; }
        const siblings = Array.from(el.parentElement ? el.parentElement.children : []);
        const i = siblings.indexOf(el) + 1;
        parts.unshift(`${n}[${i}]`);
        el = el.parentElement;
      }
      return '/' + parts.join('/');
    }
    walk(document.body, 0);
    return hits.slice(0, 20);
  });
  fs.writeFileSync(path.join(ART, 'hits-10.29.json'), JSON.stringify(found1029, null, 2));
  log('Hits for "10.29":', found1029.length);

  // Find Crustle rows on the page
  const crustleRows = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('*').forEach(el => {
      const txt = (el.textContent || '').trim();
      if (/^Crustle\b/i.test(txt) && txt.length < 80) {
        const row = el.closest('tr, .row, .deck-row, .archetype-row, li, .card, .past-meta-row');
        if (row && !out.find(h => h.outer === row.outerHTML)) {
          out.push({ outer: row.outerHTML, text: row.textContent.replace(/\s+/g, ' ').trim() });
        }
      }
    });
    return out.slice(0, 10);
  });
  log('Crustle rows found:', crustleRows.length);
  crustleRows.forEach((r, i) => {
    fs.writeFileSync(path.join(ART, `crustle-row-${i}.html`), r.outer);
    log(`Row ${i} text:`, r.text.slice(0, 300));
  });

  // Inspect global state
  const state = await page.evaluate(() => {
    const out = {};
    if (window.pastMetaDecks) {
      out.pastMetaDecks_length = window.pastMetaDecks.length;
      out.pastMetaDecks_crustle = window.pastMetaDecks
        .filter(d => /crustle/i.test(d.deck_name || d.archetype || ''))
        .slice(0, 10)
        .map(d => ({
          format: d.format,
          tournament_id: d.tournament_id,
          tournament_name: d.tournament_name,
          deck_name: d.deck_name,
          archetype: d.archetype,
          decklist_count: d.decklist_count,
          cards_len: d.cards ? d.cards.length : 0,
        }));
    } else out.pastMetaDecks = 'absent';

    if (window._pastMetaLabsCache) {
      const cache = window._pastMetaLabsCache;
      out._pastMetaLabsCache_keys = Array.from(cache.keys());
      const sviAsc = cache.get('SVI-ASC');
      if (sviAsc) {
        out._pastMetaLabsCache_SVIASC_tournamentCount = sviAsc.tournamentCount;
        out._pastMetaLabsCache_SVIASC_archetypes_crustle = sviAsc.archetypes
          ? sviAsc.archetypes.filter(a => /crustle/i.test(a.deck_name || a.archetype || ''))
          : null;
        out._pastMetaLabsCache_SVIASC_total = sviAsc.archetypes ? sviAsc.archetypes.length : null;
      }
    } else out._pastMetaLabsCache = 'absent';

    if (window._pastMetaCachedShares) {
      const c = window._pastMetaCachedShares;
      out._pastMetaCachedShares_keys = Array.from(c.keys());
      const sviAsc = c.get('SVI-ASC');
      if (sviAsc) {
        out._pastMetaCachedShares_SVIASC_crustle = (Array.isArray(sviAsc) ? sviAsc : [])
          .filter(s => /crustle/i.test(s.name || s.deck_name || ''))
          .slice(0, 10);
        out._pastMetaCachedShares_SVIASC_total = Array.isArray(sviAsc) ? sviAsc.length : null;
      }
    } else out._pastMetaCachedShares = 'absent';
    return out;
  });
  fs.writeFileSync(path.join(ART, 'past-meta-state.json'), JSON.stringify(state, null, 2));
  log('State dump:', JSON.stringify(state).slice(0, 1500));

  await browser.close();
  log('Done.');
})().catch(e => { log('FATAL', e.stack || e.message); process.exit(1); });
