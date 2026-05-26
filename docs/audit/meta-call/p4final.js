const { chromium } = require('@playwright/test');
const fs = require('fs');
const BROWSER_PATH = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
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
  page.on('pageerror', e => console.log('[ERR]', e.message));
  await page.goto('http://127.0.0.1:8765/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof MetaCall === 'object' && MetaCall && MetaCall.init, { timeout: 30000 });
  await page.waitForTimeout(5000);
  await page.evaluate(() => switchTabAndUpdateMenu('profile'));
  await page.waitForTimeout(800);
  await page.evaluate(() => switchProfileTab('metacall'));
  await page.waitForTimeout(2500);

  // Past pill — check select options
  await page.evaluate(() => MetaCall._setMetaSource('past'));
  await page.waitForTimeout(1500);
  let s = await page.evaluate(() => {
    const sels = Array.from(document.querySelectorAll('select.mc-source-format-select'));
    return { count: sels.length, opts: sels.map(x => x.options.length) };
  });
  console.log('After past:', s);

  // SVI-ASC frozen + verify share panel
  await page.evaluate(async () => { await MetaCall._setMetaSource('past', 'SVI-ASC'); });
  await page.waitForTimeout(5000);
  const svi = await page.evaluate(() => ({
    fpanel: !!document.querySelector('.mc-frozen-share-panel'),
    rrows: document.querySelectorAll('.mc-frozen-share-row').length,
    crustleRow: Array.from(document.querySelectorAll('.mc-frozen-share-row')).map(r => Array.from(r.children).map(c => c.textContent.replace(/\s+/g, ' ').trim())).find(c => c[1] === 'Crustle'),
    fppanel: !!document.querySelector('.mc-rec-panel'),
  }));
  console.log('SVI-ASC frozen:', svi);

  // TEF-POR (active) — frozen share panel must NOT be there
  await page.evaluate(async () => { await MetaCall._setMetaSource('past', 'TEF-POR'); });
  await page.waitForTimeout(5000);
  const tef = await page.evaluate(() => ({
    fpanel: !!document.querySelector('.mc-frozen-share-panel'),
    fields_visible: !!document.querySelector('.mc-personal-input'),
  }));
  console.log('TEF-POR active:', tef);

  // Back to current
  await page.evaluate(async () => { await MetaCall._setMetaSource('current'); });
  await page.waitForTimeout(5000);
  const cur = await page.evaluate(() => ({
    fpanel: !!document.querySelector('.mc-frozen-share-panel'),
    fields_visible: !!document.querySelector('.mc-personal-input'),
  }));
  console.log('Current:', cur);

  await browser.close();
})().catch(e => { console.log('FATAL', e.message); process.exit(1); });
