// Verify the new frozen share panel
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const BROWSER_PATH = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const APP_URL = 'http://127.0.0.1:8765/';
const ART = '/home/user/TheDipidis/docs/audit/meta-call/artifacts';
function log(...a){const l=`[${new Date().toISOString()}] ${a.join(' ')}`;console.log(l);fs.appendFileSync(path.join(ART,'phase4-verify.log'),l+'\n');}
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
  try { fs.unlinkSync(path.join(ART, 'phase4-verify.log')); } catch (_) {}
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
  page.on('pageerror', e => log('[ERR]', e.message));
  page.on('console', m => {
    const txt = m.text();
    if (/error|warn|frozen|past|labs|share/i.test(txt) && !/loadFontPalette/.test(txt)) {
      log('[P]', m.type(), txt.slice(0, 300));
    }
  });

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof MetaCall === 'object' && MetaCall && MetaCall.init, { timeout: 30000 });
  await page.waitForTimeout(5000);
  await page.evaluate(() => { if (typeof switchTabAndUpdateMenu === 'function') switchTabAndUpdateMenu('profile'); });
  await page.waitForTimeout(800);
  await page.evaluate(() => { if (typeof switchProfileTab === 'function') switchProfileTab('metacall'); });
  await page.waitForTimeout(2500);

  await page.evaluate(async () => { await MetaCall._setMetaSource('past', 'SVI-ASC'); });
  await page.waitForTimeout(5000);

  const state = await page.evaluate(() => {
    const out = {};
    out.has_frozen_share_panel = !!document.querySelector('.mc-frozen-share-panel');
    out.has_frozen_recs_panel  = !!document.querySelector('.mc-rec-panel');
    out.has_field_panel = !!document.querySelector('.metacall-field-panel') || !!document.querySelector('.mc-personal-input');
    const rows = Array.from(document.querySelectorAll('.mc-frozen-share-row'));
    out.row_count = rows.length;
    out.top5 = rows.slice(0, 5).map(r => Array.from(r.children).map(td => td.textContent.replace(/\s+/g, ' ').trim()));
    // Crustle present + share value?
    out.crustle = rows.map(r => Array.from(r.children).map(td => td.textContent.replace(/\s+/g, ' ').trim())).filter(c => c.some(cc => /^Crustle$/.test(cc)));
    return out;
  });
  log('frozen_share_panel:', state.has_frozen_share_panel);
  log('frozen_recs_panel:', state.has_frozen_recs_panel);
  log('field_panel (should be false in frozen):', state.has_field_panel);
  log('share rows:', state.row_count);
  log('top 5:'); state.top5.forEach((r, i) => log(`  [${i+1}]`, JSON.stringify(r)));
  log('Crustle row:', JSON.stringify(state.crustle));

  await page.screenshot({ path: path.join(ART, 'phase4-svi-asc-frozen.png'), fullPage: true });
  log('Screenshot → phase4-svi-asc-frozen.png');

  await browser.close();
  log('Done');
})().catch(e => { log('FATAL', e.stack || e.message); process.exit(1); });
