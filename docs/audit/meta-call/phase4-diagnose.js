// Diagnose: User reports doubled format options + missing share view
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const BROWSER_PATH = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const APP_URL = 'http://127.0.0.1:8765/';
const ART = '/home/user/TheDipidis/docs/audit/meta-call/artifacts';
function log(...a){const l=`[${new Date().toISOString()}] ${a.join(' ')}`;console.log(l);fs.appendFileSync(path.join(ART,'phase4-diagnose.log'),l+'\n');}
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
  try { fs.unlinkSync(path.join(ART, 'phase4-diagnose.log')); } catch (_) {}
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

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof MetaCall === 'object' && MetaCall && MetaCall.init, { timeout: 30000 });
  await page.waitForTimeout(5000);
  await page.evaluate(() => { if (typeof switchTabAndUpdateMenu === 'function') switchTabAndUpdateMenu('profile'); });
  await page.waitForTimeout(800);
  await page.evaluate(() => { if (typeof switchProfileTab === 'function') switchProfileTab('metacall'); });
  await page.waitForTimeout(2500);

  // Switch to Past Meta to render the format selector
  await page.evaluate(() => { if (window.MetaCall && MetaCall._setMetaSource) MetaCall._setMetaSource('past'); });
  await page.waitForTimeout(2000);

  // === 1) DUPLICATES DIAGNOSIS ===
  log('=== Format selector contents ===');
  const sel = await page.evaluate(() => {
    const selects = Array.from(document.querySelectorAll('select.mc-source-format-select'));
    return {
      selectCount: selects.length,
      optionsPerSelect: selects.map(s => ({
        optionCount: s.options.length,
        options: Array.from(s.options).map(o => `${o.value || '(blank)'} | ${o.textContent.trim()}`),
      })),
    };
  });
  log('select elements on page:', sel.selectCount);
  for (let i = 0; i < sel.optionsPerSelect.length; i++) {
    const s = sel.optionsPerSelect[i];
    log(`  select #${i}: ${s.optionCount} options`);
    s.options.forEach((o, j) => log(`    [${j}] ${o}`));
  }

  // Also check internal state
  const internal = await page.evaluate(() => {
    if (!window.MetaCall) return null;
    return {
      pastFormats: MetaCall._pastMetaAvailableFormats ? MetaCall._pastMetaAvailableFormats() : 'no getter',
    };
  });
  log('internal _pastMetaAvailableFormats:', JSON.stringify(internal));

  // === 2) SHARE VIEW DIAGNOSIS ===
  log('=== Past-meta share view (SVI-ASC) ===');
  await page.evaluate(async () => { await MetaCall._setMetaSource('past', 'SVI-ASC'); });
  await page.waitForTimeout(5000);

  const panels = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('.metacall-panel'));
    return all.map((p, i) => {
      const title = p.querySelector('.metacall-panel-title');
      return {
        idx: i,
        title: title ? title.textContent.replace(/\s+/g, ' ').trim().slice(0, 80) : '(no title)',
        firstClasses: p.className,
        snippet: p.textContent.replace(/\s+/g, ' ').trim().slice(0, 140),
      };
    });
  });
  log(`panels visible: ${panels.length}`);
  panels.forEach(p => log(`  [${p.idx}] "${p.title}" — ${p.snippet}`));

  // Is there ANY share% display anywhere?
  const shareCells = await page.evaluate(() => {
    const txt = document.body.textContent;
    // Match patterns like "16,09%" or "1.96%" near a deck name
    const has_share_label = /share/i.test(txt);
    const has_player_share = /player\s*share|brought.*share|raw.*share/i.test(txt);
    return { has_share_label, has_player_share };
  });
  log('share labels found:', JSON.stringify(shareCells));

  await browser.close();
  log('Done');
})().catch(e => { log('FATAL', e.stack || e.message); process.exit(1); });
