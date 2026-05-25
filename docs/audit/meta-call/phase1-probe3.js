// Phase 1 — call MetaCall._setMetaSource directly with SVI-ASC, then extract Crustle row.
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
  fs.appendFileSync(path.join(ART, 'phase1-probe3.log'), line + '\n');
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

async function probe(page, label) {
  // Try multiple ways to capture screenshot without font wait
  await page.evaluate(() => {
    // Force a fake "fonts ready" if not yet
    if (document.fonts && typeof document.fonts.ready === 'object') {}
  });
  await page.screenshot({ path: path.join(ART, label + '.png'), fullPage: false, timeout: 15000, animations: 'disabled' }).catch(e => log('screenshot ' + label + ' failed:', e.message));
}

(async () => {
  try { fs.unlinkSync(path.join(ART, 'phase1-probe3.log')); } catch (_) {}
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
    if (/error|warn|crustle|18,9|18\.9|10\.29|frozen|past.?meta|svi-asc|tef-por|dragapult|labs aggregate/i.test(t)) log('[P]', m.type(), t.slice(0, 500));
  });
  page.on('pageerror', e => log('[ERR]', e.message));

  log('Loading app');
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof MetaCall === 'object' && MetaCall && MetaCall.init, { timeout: 30000 });
  await page.waitForTimeout(5000); // initial predictor run

  // Switch to Profile + MetaCall tab
  log('Switch to profile/metacall');
  await page.evaluate(() => { if (typeof switchTabAndUpdateMenu === 'function') switchTabAndUpdateMenu('profile'); });
  await page.waitForTimeout(1000);
  await page.evaluate(() => { if (typeof switchProfileTab === 'function') switchProfileTab('metacall'); });
  await page.waitForTimeout(3000);

  // Call MetaCall._setMetaSource('past', 'SVI-ASC') directly
  log('Calling MetaCall._setMetaSource("past", "SVI-ASC")');
  await page.evaluate(async () => {
    if (window.MetaCall && typeof MetaCall._setMetaSource === 'function') {
      await MetaCall._setMetaSource('past', 'SVI-ASC');
    } else { window.__noMetaCallApi = true; }
  });
  await page.waitForTimeout(8000); // labs aggregate load + render

  // Dump state and Crustle row
  const result = await page.evaluate(() => {
    const out = {};
    // Headers
    const headers = Array.from(document.querySelectorAll('.mc-rec-table thead th'));
    out.headers = headers.map(h => h.textContent.replace(/\s+/g, ' ').trim());
    // Frozen panel headers (if separate)
    const fheaders = Array.from(document.querySelectorAll('.mc-rec-table-frozen thead th'));
    out.frozen_headers = fheaders.map(h => h.textContent.replace(/\s+/g, ' ').trim());
    out.frozen_table_present = fheaders.length > 0;
    // All rec rows
    const rows = Array.from(document.querySelectorAll('.mc-rec-row'));
    out.rec_rows_count = rows.length;
    out.first_rows = rows.slice(0, 15).map(r => ({
      cells: Array.from(r.children).map(td => td.textContent.replace(/\s+/g, ' ').trim()),
      classes: r.className
    }));
    // Find Crustle
    out.crustle_rows = [];
    rows.forEach(r => {
      const cells = Array.from(r.children).map(td => td.textContent.replace(/\s+/g, ' ').trim());
      if (cells.some(c => /^Crustle/i.test(c))) {
        out.crustle_rows.push({ cells, html: r.outerHTML });
      }
    });
    // Frozen recs panel section
    const frozenPanel = document.querySelector('.metacall-panel.mc-rec-panel');
    out.panel_title = frozenPanel ? (frozenPanel.querySelector('.metacall-panel-title') ? frozenPanel.querySelector('.metacall-panel-title').textContent.replace(/\s+/g, ' ').trim() : null) : null;
    out.panel_tournHint = frozenPanel ? Array.from(frozenPanel.querySelectorAll('.mc-rec-hint')).map(p => p.textContent.replace(/\s+/g, ' ').trim()) : null;
    return out;
  });
  fs.writeFileSync(path.join(ART, 'probe3-result.json'), JSON.stringify(result, null, 2));
  log('headers:', JSON.stringify(result.headers));
  log('frozen_headers:', JSON.stringify(result.frozen_headers));
  log('frozen_table_present:', result.frozen_table_present);
  log('rec_rows_count:', result.rec_rows_count);
  log('panel_title:', result.panel_title);
  log('panel_tournHint:', JSON.stringify(result.panel_tournHint));
  if (result.crustle_rows.length) {
    result.crustle_rows.forEach((r, i) => {
      fs.writeFileSync(path.join(ART, `crustle-svi-asc-row-${i}.html`), r.html);
      log('Crustle row', i, 'cells:', JSON.stringify(r.cells));
    });
  } else {
    log('No Crustle row in MetaCall view after switching to SVI-ASC');
    log('First 3 rows:', JSON.stringify(result.first_rows.slice(0, 3)));
  }

  // Also screenshot to see visual
  await probe(page, '20-mc-svi-asc-direct');

  // Also probe the Field Composition panel for shares
  const fieldState = await page.evaluate(() => {
    const out = {};
    // The field is in a different panel — find it
    const fieldRows = Array.from(document.querySelectorAll('.mc-field-row, .mc-field tr, [class*=field-row]'));
    out.field_rows_count = fieldRows.length;
    out.field_rows_first = fieldRows.slice(0, 25).map(r => ({
      cells: Array.from(r.children).map(td => td.textContent.replace(/\s+/g, ' ').trim()),
      classes: r.className
    }));
    return out;
  });
  fs.writeFileSync(path.join(ART, 'probe3-field.json'), JSON.stringify(fieldState, null, 2));
  log('field_rows_count:', fieldState.field_rows_count);
  if (fieldState.field_rows_first.length) log('Field row 0:', JSON.stringify(fieldState.field_rows_first[0]));

  await browser.close();
  log('Done');
})().catch(e => { log('FATAL', e.stack || e.message); process.exit(1); });
