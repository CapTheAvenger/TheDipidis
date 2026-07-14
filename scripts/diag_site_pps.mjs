// TEMP diagnostic: load the LIVE site, verify the Prize Pack integration, and
// confirm the official CloudFront images are retrievable (friend's-bot check).
import { chromium } from 'playwright';
import https from 'node:https';

const SITE = 'https://thedipidis.app';
const log = (...a) => console.log(...a);

function fetchHead(url, headers = {}) {
  return new Promise((resolve) => {
    const req = https.request(url, { method: 'GET', headers: { Range: 'bytes=0-7', ...headers } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const isPng = buf.slice(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
        resolve({ status: res.statusCode, ct: res.headers['content-type'], isPng });
      });
    });
    req.on('error', (e) => resolve({ status: null, err: String(e).slice(0, 80) }));
    req.setTimeout(20000, () => { req.destroy(); resolve({ status: null, err: 'timeout' }); });
    req.end();
  });
}

const browser = await chromium.launch();
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => consoleErrors.push('PAGEERROR ' + String(e).slice(0, 200)));

log('== loading', SITE, '==');
await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 });

// APP_VERSION tells us which build is actually deployed.
const appVersion = await page.evaluate(() => window.APP_VERSION || '(none)').catch(() => '(err)');
log('deployed APP_VERSION:', appVersion);

// Wait for the prize-pack index to load (up to 60s).
let idxSize = 0;
try {
  await page.waitForFunction(
    () => window.prizePackImagesIndex && Object.keys(window.prizePackImagesIndex).length > 0,
    { timeout: 60000 });
  idxSize = await page.evaluate(() => Object.keys(window.prizePackImagesIndex).length);
} catch { idxSize = 0; }
log('window.prizePackImagesIndex entries:', idxSize);

// Is the enlarged-view function global, and does the toggle button appear for a
// known PPS card (Mega Dragonite ex = ASC 152 -> gallery #19)?
const probe = await page.evaluate(() => {
  const out = { showSingleCard: typeof window.showSingleCard, keyPresent: false, hasBtn: false, ppsUrl: null, err: null };
  try {
    out.keyPresent = !!(window.prizePackImagesIndex && window.prizePackImagesIndex['ASC-152']);
    if (typeof window.showSingleCard === 'function') {
      window.showSingleCard('about:blank', 'Mega Dragonite ex (ASC 152)', {
        card_name: 'Mega Dragonite ex', image_url: 'about:blank',
        set_code: 'ASC', set_number: '152', cardmarket_url: '' });
      const btn = document.querySelector('.sc-action-prizepack');
      out.hasBtn = !!btn;
      out.ppsUrl = btn ? btn.getAttribute('data-pps') : null;
    }
  } catch (e) { out.err = String(e).slice(0, 200); }
  return out;
});
log('probe result:', JSON.stringify(probe, null, 2));
if (consoleErrors.length) log('page console errors:', JSON.stringify(consoleErrors.slice(0, 10), null, 2));

await browser.close();

// Friend's-bot check: can the official CloudFront image be fetched right now?
log('\n== friend-bot image retrieval (CloudFront, no referer) ==');
for (const url of [
  'https://d1wx537rtdixyy.cloudfront.net/expansions/series9/en-us/OP_Prize_SE9_EN_19-2x.png',
  'https://d1wx537rtdixyy.cloudfront.net/expansions/series9/de-de/OP_Prize_SE9_DE_19-2x.png',
]) {
  const r = await fetchHead(url);
  log(`  ${url}\n    -> ${JSON.stringify(r)}`);
}
log('\nDONE');
