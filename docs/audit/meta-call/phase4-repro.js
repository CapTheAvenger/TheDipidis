// Reproduce: doubled format options exactly as user sees them.
// User flow: open Meta Call tab → switch to Past Meta tab → click dropdown
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const BROWSER_PATH = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const APP_URL = 'http://127.0.0.1:8765/';
const ART = '/home/user/TheDipidis/docs/audit/meta-call/artifacts';
function log(...a){const l=`[${new Date().toISOString()}] ${a.join(' ')}`;console.log(l);fs.appendFileSync(path.join(ART,'phase4-repro.log'),l+'\n');}
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
  try { fs.unlinkSync(path.join(ART, 'phase4-repro.log')); } catch (_) {}
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
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof MetaCall === 'object' && MetaCall && MetaCall.init, { timeout: 30000 });
  await page.waitForTimeout(5000);
  await page.evaluate(() => { if (typeof switchTabAndUpdateMenu === 'function') switchTabAndUpdateMenu('profile'); });
  await page.waitForTimeout(800);
  await page.evaluate(() => { if (typeof switchProfileTab === 'function') switchProfileTab('metacall'); });
  await page.waitForTimeout(2500);

  // Sequence: Past pill → check → flip back to Current → flip to Past again → check
  for (let iter = 0; iter < 5; iter++) {
    await page.evaluate(() => MetaCall._setMetaSource('past'));
    await page.waitForTimeout(800);
    const after = await page.evaluate(() => {
      const sels = Array.from(document.querySelectorAll('select.mc-source-format-select'));
      return { selects: sels.length, optsByIdx: sels.map(s => s.options.length) };
    });
    log(`iter ${iter} after past: selects=${after.selects} options=${JSON.stringify(after.optsByIdx)}`);
    if (iter < 4) {
      await page.evaluate(() => MetaCall._setMetaSource('current'));
      await page.waitForTimeout(800);
    }
  }

  // Final state — pick SVI-ASC + screenshot
  await page.evaluate(() => MetaCall._setMetaSource('past', 'SVI-ASC'));
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(ART, 'phase4-repro-svi-asc.png'), fullPage: true });
  log('Screenshot saved → phase4-repro-svi-asc.png');

  const finalState = await page.evaluate(() => {
    const sels = Array.from(document.querySelectorAll('select.mc-source-format-select'));
    return { selects: sels.length, optsByIdx: sels.map(s => s.options.length) };
  });
  log(`final: selects=${finalState.selects} options=${JSON.stringify(finalState.optsByIdx)}`);

  // Also dump rendered HTML for the source panel
  const html = await page.evaluate(() => {
    const panels = Array.from(document.querySelectorAll('.metacall-panel'));
    const srcPanel = panels.find(p => /Source/.test(p.querySelector('.metacall-panel-title')?.textContent || ''));
    return srcPanel ? srcPanel.outerHTML : 'no source panel found';
  });
  fs.writeFileSync(path.join(ART, 'phase4-source-panel.html'), html);
  log(`source-panel html length: ${html.length} bytes — written to phase4-source-panel.html`);

  await browser.close();
  log('Done');
})().catch(e => { log('FATAL', e.stack || e.message); process.exit(1); });
