// Phase 1 — probe Meta Call tab with past-meta source set to SVI-ASC.
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
  fs.appendFileSync(path.join(ART, 'phase1-probe2.log'), line + '\n');
}

const CDN_MAP = [
  { re: /papaparse.*\.min\.js/i, file: '/home/user/TheDipidis/node_modules/papaparse/papaparse.min.js', mime: 'application/javascript' }
];
const STUB_MAP = [
  { re: /fonts\.googleapis\.com\/css/, mime: 'text/css', body: '' },
  { re: /fonts\.gstatic\.com\//, mime: 'font/woff2', body: '' },
  { re: /firebasejs\//, mime: 'application/javascript', body: 'window.firebase={initializeApp(){},auth(){return{onAuthStateChanged(){},getRedirectResult(){return Promise.resolve(null)}}},firestore(){return{}}};' },
  { re: /chart\.umd\.min\.js/, mime: 'application/javascript', body: 'window.Chart=function(){return{destroy(){}}};window.Chart.register=()=>{};' },
  { re: /localforage/, mime: 'application/javascript', body: 'window.localforage={getItem:async()=>null,setItem:async()=>null,removeItem:async()=>null,createInstance(){return this}};' },
  { re: /mobile-drag-drop/, mime: 'application/javascript', body: '' },
];

(async () => {
  try { fs.unlinkSync(path.join(ART, 'phase1-probe2.log')); } catch (_) {}
  const browser = await chromium.launch({ executablePath: BROWSER_PATH, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route('**/*', async (route, req) => {
    const url = req.url();
    const m = CDN_MAP.find(x => x.re.test(url));
    if (m) {
      try { return route.fulfill({ status: 200, contentType: m.mime, body: fs.readFileSync(m.file) }); } catch (e) {}
    }
    const s = STUB_MAP.find(x => x.re.test(url));
    if (s) return route.fulfill({ status: 200, contentType: s.mime, body: s.body });
    const isLocal = url.startsWith('http://127.0.0.1:8765/') || url.startsWith('http://localhost:8765/') || url.startsWith('data:') || url.startsWith('blob:');
    if (!isLocal) return route.abort();
    return route.continue();
  });
  const page = await ctx.newPage();
  page.on('console', m => {
    const t = m.text();
    if (/error|warn|crustle|10\.29|18\.9|18,9|frozen|past.?meta|svi-asc|tef-por|dragapult/i.test(t)) log('[P]', m.type(), t.slice(0, 400));
  });
  page.on('pageerror', e => log('[ERR]', e.message));

  log('Loading app');
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => log('networkidle timeout'));
  await page.waitForTimeout(2000);

  // Direct call: switch to Meta Call panel + set past-meta source to SVI-ASC
  log('Inspecting MetaCall module');
  const meta = await page.evaluate(() => {
    const out = {};
    if (typeof MetaCall === 'object' && MetaCall) {
      out.MetaCall_keys = Object.keys(MetaCall).slice(0, 60);
    }
    // Find where MetaCall renders — look for a container with metacall-wrap
    const wraps = document.querySelectorAll('.metacall-wrap');
    out.wraps_count = wraps.length;
    out.wraps_parents = Array.from(wraps).map(w => w.parentElement ? w.parentElement.id || w.parentElement.className : '(none)');
    return out;
  });
  log('MetaCall introspection:', JSON.stringify(meta).slice(0, 600));

  // Navigate to Profile tab + click metacall sub-tab
  log('Switching to Profile tab');
  await page.evaluate(() => { if (typeof switchTabAndUpdateMenu === 'function') switchTabAndUpdateMenu('profile'); });
  await page.waitForTimeout(2000);
  // Click metacall sub-tab
  await page.evaluate(() => { if (typeof switchProfileTab === 'function') switchProfileTab('metacall'); });
  await page.waitForTimeout(6000);

  // Inspect MetaCall internals via the module's public API
  const mcState1 = await page.evaluate(() => {
    if (typeof MetaCall !== 'object' || !MetaCall) return { error: 'no MetaCall' };
    const out = {};
    try {
      out.api = Object.keys(MetaCall);
    } catch (e) { out.error_api = e.message; }
    // probe via attributes if any
    out.metaSourceSelect = document.querySelector('#metaSourceSelect') ? Array.from(document.querySelectorAll('#metaSourceSelect option')).map(o => ({ v: o.value, t: o.textContent.trim() })) : null;
    out.formatSelect = document.querySelector('#metaCallFormatSelect, #pastMetaSelectorInMetaCall, .metacall-source-select') ? null : 'unknown selector';
    // find any select inside metacall-wrap
    const wrap = document.querySelector('.metacall-wrap');
    if (wrap) {
      out.metacallSelects = Array.from(wrap.querySelectorAll('select')).map(s => ({ id: s.id, name: s.name, options: Array.from(s.options).map(o => o.value).slice(0, 20) }));
      out.metacallText = wrap.textContent.replace(/\s+/g, ' ').slice(0, 800);
    }
    return out;
  });
  fs.writeFileSync(path.join(ART, 'mc-state1.json'), JSON.stringify(mcState1, null, 2));
  log('MC state1 metacallSelects:', JSON.stringify(mcState1.metacallSelects || []).slice(0, 600));

  await page.screenshot({ path: path.join(ART, '10-metacall-default.png'), fullPage: false, timeout: 30000, animations: 'disabled' }).catch(e => log('shot10:', e.message));

  // Set source to SVI-ASC past meta
  log('Setting MetaCall source to past meta SVI-ASC');
  const setResult = await page.evaluate(() => {
    // Look for source select
    const wrap = document.querySelector('.metacall-wrap');
    if (!wrap) return { error: 'no wrap' };
    const selects = Array.from(wrap.querySelectorAll('select'));
    const out = { triedSelects: selects.map(s => ({ id: s.id, options: Array.from(s.options).map(o => o.value).slice(0, 50) })) };
    // Find a select that has SVI-ASC option
    const sourceSelect = selects.find(s => Array.from(s.options).some(o => /SVI-ASC|svi-asc|Ascended/i.test(o.value + ' ' + o.textContent)));
    if (sourceSelect) {
      const target = Array.from(sourceSelect.options).find(o => /SVI-ASC|svi-asc|Ascended/i.test(o.value + ' ' + o.textContent));
      sourceSelect.value = target.value;
      sourceSelect.dispatchEvent(new Event('change', { bubbles: true }));
      out.set = { id: sourceSelect.id, value: target.value, label: target.textContent.trim() };
    } else {
      out.notFound = true;
    }
    return out;
  });
  log('Set result:', JSON.stringify(setResult).slice(0, 600));
  await page.waitForTimeout(8000); // wait for labs CSV load + re-render

  await page.screenshot({ path: path.join(ART, '11-metacall-svi-asc.png'), fullPage: true, timeout: 60000, animations: 'disabled' }).catch(e => log('shot11:', e.message));

  // Inspect final state
  const finalState = await page.evaluate(() => {
    const out = {};
    // Find all rec rows
    const rows = Array.from(document.querySelectorAll('.mc-rec-row'));
    out.rec_rows_count = rows.length;
    out.rec_rows = rows.slice(0, 20).map(r => ({
      cells: Array.from(r.children).map(td => td.textContent.replace(/\s+/g, ' ').trim()),
      classes: r.className,
      reasonId: r.dataset.reasonId || null
    }));
    // Find frozen panel headers
    const headers = Array.from(document.querySelectorAll('.mc-rec-table-frozen thead th'));
    out.frozen_table_present = headers.length > 0;
    out.frozen_headers = headers.map(h => h.textContent.replace(/\s+/g, ' ').trim());
    // Find the table headers in any mc-rec-table
    const allHeaders = Array.from(document.querySelectorAll('.mc-rec-table thead th'));
    out.any_rec_headers = allHeaders.map(h => h.textContent.replace(/\s+/g, ' ').trim());
    // Find banner text
    const banner = document.querySelector('.mc-frozen-banner, .metacall-frozen-banner, [class*=frozen]');
    out.banner = banner ? banner.textContent.replace(/\s+/g, ' ').trim().slice(0, 300) : null;
    // What is _metaSource (try to call internal)
    try {
      if (typeof MetaCall === 'object' && MetaCall.__getState) {
        out.metaCallState = MetaCall.__getState();
      }
    } catch (e) {}
    return out;
  });
  fs.writeFileSync(path.join(ART, 'mc-final-state.json'), JSON.stringify(finalState, null, 2));
  log('FINAL: rec_rows_count =', finalState.rec_rows_count, '| any_rec_headers =', JSON.stringify(finalState.any_rec_headers));
  log('FINAL: frozen_table_present =', finalState.frozen_table_present, '| frozen_headers =', JSON.stringify(finalState.frozen_headers));
  log('FINAL: banner =', finalState.banner);

  // Find Crustle in the new state
  const crustleRows = await page.evaluate(() => {
    const out = [];
    Array.from(document.querySelectorAll('.mc-rec-row')).forEach(row => {
      const cells = Array.from(row.children).map(td => td.textContent.replace(/\s+/g, ' ').trim());
      if (cells.some(c => /^Crustle/i.test(c))) {
        out.push({ cells, html: row.outerHTML.slice(0, 2000) });
      }
    });
    return out;
  });
  if (crustleRows.length) {
    crustleRows.forEach((r, i) => {
      fs.writeFileSync(path.join(ART, `crustle-mc-row-${i}.html`), r.html);
      log('Crustle MC row', i, 'cells:', JSON.stringify(r.cells));
    });
  } else {
    log('No Crustle row found in MetaCall view');
  }

  await browser.close();
  log('Done');
})().catch(e => { log('FATAL', e.stack || e.message); process.exit(1); });
