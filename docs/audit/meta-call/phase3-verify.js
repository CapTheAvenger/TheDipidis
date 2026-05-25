// Phase 3 verification — apply fixes and re-probe both anomalies.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const BROWSER_PATH = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const APP_URL = 'http://127.0.0.1:8765/';
const ART = '/home/user/TheDipidis/docs/audit/meta-call/artifacts';
function log(...a){const l=`[${new Date().toISOString()}] ${a.join(' ')}`;console.log(l);fs.appendFileSync(path.join(ART,'phase3-verify.log'),l+'\n');}

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
  try { fs.unlinkSync(path.join(ART, 'phase3-verify.log')); } catch (_) {}
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
  page.on('console', m => {
    const t = m.text();
    if (/error|warn|crustle|10\.29|18,9|frozen|past.?meta|svi-asc|tef-por|dragapult|predictor run|source = past|labs/i.test(t)) log('[P]', m.type(), t.slice(0, 500));
  });
  page.on('pageerror', e => log('[ERR]', e.message));

  log('Loading');
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof MetaCall === 'object' && MetaCall && MetaCall.init, { timeout: 30000 });
  await page.waitForTimeout(5000);
  await page.evaluate(() => { if (typeof switchTabAndUpdateMenu === 'function') switchTabAndUpdateMenu('profile'); });
  await page.waitForTimeout(800);
  await page.evaluate(() => { if (typeof switchProfileTab === 'function') switchProfileTab('metacall'); });
  await page.waitForTimeout(3000);

  // === SVI-ASC ===
  log('--- SVI-ASC switch ---');
  await page.evaluate(async () => {
    if (window.MetaCall && MetaCall._setMetaSource) await MetaCall._setMetaSource('past', 'SVI-ASC');
  });
  await page.waitForTimeout(8000);

  const svi = await page.evaluate(() => {
    const out = {};
    out.headers = Array.from(document.querySelectorAll('.mc-rec-table thead th')).map(h => h.textContent.replace(/\s+/g, ' ').trim());
    out.fheaders = Array.from(document.querySelectorAll('.mc-rec-table-frozen thead th')).map(h => h.textContent.replace(/\s+/g, ' ').trim());
    out.has_field_panel = !!document.querySelector('.metacall-field-panel, .mc-field, [class*=field-panel]');
    out.rec_rows = Array.from(document.querySelectorAll('.mc-rec-row')).slice(0, 12).map(r => Array.from(r.children).map(td => td.textContent.replace(/\s+/g, ' ').trim()));
    // Find Crustle in Frozen panel
    out.crustle_frozen = Array.from(document.querySelectorAll('.mc-rec-table-frozen .mc-rec-row, .mc-rec-row')).map(r => Array.from(r.children).map(td => td.textContent.replace(/\s+/g, ' ').trim())).filter(c => c.some(cc => /^Crustle$/i.test(cc)));
    // Verify CSS class rename
    out.has_mc_rec_score = document.querySelectorAll('.mc-rec-score').length;
    out.has_mc_rec_day2conv = document.querySelectorAll('.mc-rec-day2conv').length;
    out.has_mc_rec_players = document.querySelectorAll('.mc-rec-players').length;
    out.has_old_mc_rec_day2_in_frozen = Array.from(document.querySelectorAll('.mc-rec-table-frozen .mc-rec-day2')).length;
    out.has_old_mc_rec_wins_in_frozen = Array.from(document.querySelectorAll('.mc-rec-table-frozen .mc-rec-wins')).length;
    // Find any element showing 10.29 anywhere
    out.has_1029 = document.body.textContent.includes('10.29') || document.body.textContent.includes('10,29');
    // Inspect __getShareList via window
    out.shareList = (window.MetaCall && typeof MetaCall.getPredictedField === 'function') ? (MetaCall.getPredictedField() || []).slice(0, 5).map(d => ({ name: d.name, onlineShare: d.onlineShare })) : null;
    return out;
  });
  fs.writeFileSync(path.join(ART, 'phase3-svi.json'), JSON.stringify(svi, null, 2));
  log('SVI-ASC headers:', JSON.stringify(svi.headers));
  log('SVI-ASC fheaders:', JSON.stringify(svi.fheaders));
  log('SVI-ASC has_field_panel:', svi.has_field_panel);
  log('SVI-ASC class counts: score=', svi.has_mc_rec_score, 'day2conv=', svi.has_mc_rec_day2conv, 'players=', svi.has_mc_rec_players, ' | old in frozen: day2=', svi.has_old_mc_rec_day2_in_frozen, 'wins=', svi.has_old_mc_rec_wins_in_frozen);
  log('SVI-ASC has_1029:', svi.has_1029);
  log('SVI-ASC Crustle frozen:', JSON.stringify(svi.crustle_frozen));
  log('SVI-ASC first 5 shareList:', JSON.stringify(svi.shareList));

  // === TEF-POR ===
  log('--- TEF-POR switch ---');
  await page.evaluate(async () => {
    if (window.MetaCall && MetaCall._setMetaSource) await MetaCall._setMetaSource('past', 'TEF-POR');
  });
  await page.waitForTimeout(8000);

  const tef = await page.evaluate(() => {
    const out = {};
    out.headers = Array.from(document.querySelectorAll('.mc-rec-table thead th')).map(h => h.textContent.replace(/\s+/g, ' ').trim());
    out.has_field_panel = !!document.querySelector('.metacall-field-panel, .mc-field');
    out.rec_rows = Array.from(document.querySelectorAll('.mc-rec-row')).slice(0, 10).map(r => Array.from(r.children).map(td => td.textContent.replace(/\s+/g, ' ').trim()));
    out.dragapult = Array.from(document.querySelectorAll('.mc-rec-row, tr')).map(r => Array.from(r.children).map(td => td.textContent.replace(/\s+/g, ' ').trim())).filter(c => c.some(cc => /^Dragapult/i.test(cc)));
    out.shareList = (window.MetaCall && typeof MetaCall.getPredictedField === 'function') ? (MetaCall.getPredictedField() || []).filter(d => /dragapult/i.test(d.name)).map(d => ({ name: d.name, onlineShare: d.onlineShare })) : null;
    out.has_4598 = document.body.textContent.includes('45.98') || document.body.textContent.includes('45,98');
    out.has_3716 = document.body.textContent.includes('37.16') || document.body.textContent.includes('37,16');
    out.has_2985 = document.body.textContent.includes('29.85') || document.body.textContent.includes('29,85');
    return out;
  });
  fs.writeFileSync(path.join(ART, 'phase3-tef.json'), JSON.stringify(tef, null, 2));
  log('TEF-POR headers:', JSON.stringify(tef.headers));
  log('TEF-POR has_field_panel:', tef.has_field_panel);
  log('TEF-POR Dragapult shareList:', JSON.stringify(tef.shareList));
  log('TEF-POR has_4598:', tef.has_4598, '  has_3716:', tef.has_3716, '  has_2985:', tef.has_2985);
  log('TEF-POR Dragapult rows (cells):');
  tef.dragapult.slice(0, 6).forEach((r, i) => log(' ', i, JSON.stringify(r)));

  await browser.close();
  log('Done');
})().catch(e => { log('FATAL', e.stack || e.message); process.exit(1); });
