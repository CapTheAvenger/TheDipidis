// Phase 3 smoke — verify current-meta still works (predictor unchanged)
// and SVI-ASC / TEF-POR past-meta swaps land on expected values.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const BROWSER_PATH = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const APP_URL = 'http://127.0.0.1:8765/';
const ART = '/home/user/TheDipidis/docs/audit/meta-call/artifacts';
function log(...a){const l=`[${new Date().toISOString()}] ${a.join(' ')}`;console.log(l);fs.appendFileSync(path.join(ART,'phase3-smoke.log'),l+'\n');}
const CDN_MAP=[{re:/papaparse.*\.min\.js/i,file:'/home/user/TheDipidis/node_modules/papaparse/papaparse.min.js',mime:'application/javascript'}];
const STUB_MAP=[
  {re:/fonts\.googleapis\.com\/css/,mime:'text/css',body:''},
  {re:/fonts\.gstatic\.com\//,mime:'font/woff2',body:''},
  {re:/firebasejs\//,mime:'application/javascript',body:'window.firebase={initializeApp(){},auth(){return{onAuthStateChanged(){},getRedirectResult(){return Promise.resolve(null)}}},firestore(){return{}}};'},
  {re:/chart\.umd\.min\.js/,mime:'application/javascript',body:'window.Chart=function(){return{destroy(){}}};window.Chart.register=()=>{};'},
  {re:/localforage/,mime:'application/javascript',body:'window.localforage={getItem:async()=>null,setItem:async()=>null,removeItem:async()=>null,createInstance(){return this}};'},
  {re:/mobile-drag-drop/,mime:'application/javascript',body:''},
];
(async () => {
  try { fs.unlinkSync(path.join(ART, 'phase3-smoke.log')); } catch (_) {}
  const browser = await chromium.launch({ executablePath: BROWSER_PATH, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route('**/*', async (route, req) => {
    const url = req.url();
    const m = CDN_MAP.find(x => x.re.test(url));
    if (m) { try { return route.fulfill({ status: 200, contentType: m.mime, body: fs.readFileSync(m.file) }); } catch (_) {} }
    const s = STUB_MAP.find(x => x.re.test(url));
    if (s) return route.fulfill({ status: 200, contentType: s.mime, body: s.body });
    const isLocal = url.startsWith('http://127.0.0.1:8765/') || url.startsWith('data:') || url.startsWith('blob:');
    if (!isLocal) return route.abort();
    return route.continue();
  });
  const page = await ctx.newPage();
  let predictorRuns = [];
  page.on('console', m => {
    const t = m.text();
    if (/predictor run A top5/.test(t)) predictorRuns.push(t);
    if (/error|FATAL|TypeError/i.test(t)) log('[!]', m.type(), t.slice(0, 400));
  });
  page.on('pageerror', e => log('[ERR]', e.message));

  log('Loading');
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof MetaCall === 'object' && MetaCall && MetaCall.init, { timeout: 30000 });
  await page.waitForTimeout(6000);

  // 1) Current meta: predictor must still run, no errors
  log('=== Current meta initial run ===');
  log('predictor runs after init:', predictorRuns.length);
  predictorRuns.forEach(l => log('  >', l.slice(0, 200)));

  await page.evaluate(() => { if (typeof switchTabAndUpdateMenu === 'function') switchTabAndUpdateMenu('profile'); });
  await page.waitForTimeout(800);
  await page.evaluate(() => { if (typeof switchProfileTab === 'function') switchProfileTab('metacall'); });
  await page.waitForTimeout(2000);

  // 2) Past SVI-ASC: frozen, no predictor run, no field panel
  predictorRuns = [];
  log('=== Switch to past SVI-ASC ===');
  await page.evaluate(async () => { await MetaCall._setMetaSource('past', 'SVI-ASC'); });
  await page.waitForTimeout(5000);
  log('predictor runs after SVI-ASC:', predictorRuns.length, '(expected 0)');
  const sviState = await page.evaluate(() => {
    const out = {};
    out.field_panel = !!document.querySelector('.metacall-field-panel');
    const rows = Array.from(document.querySelectorAll('.mc-rec-row'));
    out.first_three = rows.slice(0, 3).map(r => Array.from(r.children).map(td => td.textContent.replace(/\s+/g, ' ').trim()));
    out.crustle_cells = rows.map(r => Array.from(r.children).map(td => td.textContent.replace(/\s+/g, ' ').trim())).filter(c => c.some(cc => /^Crustle$/i.test(cc)));
    out.has_1029 = document.body.textContent.includes('10,29') || document.body.textContent.includes('10.29');
    return out;
  });
  log('SVI-ASC field_panel:', sviState.field_panel, 'has_1029:', sviState.has_1029);
  log('SVI-ASC top 3:', JSON.stringify(sviState.first_three));
  log('SVI-ASC Crustle:', JSON.stringify(sviState.crustle_cells));

  // 3) Past TEF-POR: active past meta, predictor runs, dragapult family check
  predictorRuns = [];
  log('=== Switch to past TEF-POR ===');
  await page.evaluate(async () => { await MetaCall._setMetaSource('past', 'TEF-POR'); });
  await page.waitForTimeout(5000);
  log('predictor runs after TEF-POR:', predictorRuns.length, '(expected ≥1; non-frozen)');
  const tefState = await page.evaluate(() => {
    const out = {};
    out.field_panel = !!document.querySelector('.metacall-field-panel');
    const sl = (window.MetaCall && MetaCall.getPredictedField) ? MetaCall.getPredictedField() : [];
    out.dragapult = sl.filter(d => /^Dragapult\b/i.test(d.name)).map(d => ({ name: d.name, share: d.onlineShare }));
    out.dragapultSum = out.dragapult.reduce((s, d) => s + d.share, 0);
    return out;
  });
  log('TEF-POR field_panel:', tefState.field_panel);
  log('TEF-POR Dragapult family:', JSON.stringify(tefState.dragapult));
  log('TEF-POR Dragapult family sum:', tefState.dragapultSum.toFixed(2), '% (was 45.98%, soll labs 29.85%)');

  // 4) Switch back to current — must rehydrate cleanly
  predictorRuns = [];
  log('=== Switch back to current ===');
  await page.evaluate(async () => { await MetaCall._setMetaSource('current'); });
  await page.waitForTimeout(5000);
  log('predictor runs after current:', predictorRuns.length, '(expected ≥1)');
  const curState = await page.evaluate(() => ({
    field_panel: !!document.querySelector('.metacall-field-panel'),
    rec_rows_count: document.querySelectorAll('.mc-rec-row').length,
    first_rec: (() => { const r = document.querySelector('.mc-rec-row'); return r ? Array.from(r.children).map(td => td.textContent.replace(/\s+/g, ' ').trim()) : null; })(),
  }));
  log('Current field_panel:', curState.field_panel, 'rec_rows:', curState.rec_rows_count, 'first_rec:', JSON.stringify(curState.first_rec));

  await browser.close();
  log('Done');
})().catch(e => { log('FATAL', e.stack || e.message); process.exit(1); });
