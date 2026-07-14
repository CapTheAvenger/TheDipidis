// TEMP diagnostic (no browser): verify the DEPLOYED site has the Prize Pack
// integration + data, run the button-visibility lookup against the LIVE JSON,
// and confirm CloudFront image retrieval (friend's-bot check).
import https from 'node:https';

const SITE = 'https://thedipidis.app';
const log = (...a) => console.log(...a);

function get(url, headers = {}) {
  return new Promise((resolve) => {
    const req = https.request(url, { method: 'GET', headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, ct: res.headers['content-type'], buf: Buffer.concat(chunks) }));
    });
    req.on('error', (e) => resolve({ status: null, err: String(e).slice(0, 80) }));
    req.setTimeout(25000, () => { req.destroy(); resolve({ status: null, err: 'timeout' }); });
    req.end();
  });
}

log('== deployed build ==');
const idx = await get(`${SITE}/index.html`);
const appVer = idx.buf ? (idx.buf.toString().match(/window\.APP_VERSION\s*=\s*'([^']+)'/) || [])[1] : null;
log(`index.html -> ${idx.status}, APP_VERSION=${appVer}`);
const vjson = await get(`${SITE}/version.json`);
log(`version.json -> ${vjson.status} ${vjson.buf ? vjson.buf.toString().slice(0, 80) : ''}`);

log('\n== deployed JS contains the integration? ==');
const checks = [
  ['js/app-core.js', 'loadPrizePackImagesIndex'],
  ['js/app-init.js', 'prizepack_images'],
  ['js/app-deck-builder.js', 'prizePackImagesIndex'],
  ['js/app-deck-builder.js', 'sc-action-prizepack'],
  ['js/i18n.js', 'action.prizePack'],
];
for (const [file, needle] of checks) {
  const r = await get(`${SITE}/${file}`);
  const has = r.buf ? r.buf.toString().includes(needle) : false;
  log(`  ${file} contains "${needle}": ${has} (HTTP ${r.status})`);
}

log('\n== deployed prize-pack JSON ==');
const pj = await get(`${SITE}/data/prizepack_official_images.json`);
let index = null;
try { index = JSON.parse(pj.buf.toString()); } catch { /* */ }
log(`  data/prizepack_official_images.json -> ${pj.status}, entries=${index ? Object.keys(index).length : 'PARSE-FAIL'}`);

// Reproduce the exact button-visibility lookup for a few known PPS cards.
if (index) {
  log('\n== button-visibility lookup (as the site does it) ==');
  const cards = [['ASC', '152'], ['POR', '021'], ['SCR', '107'], ['SSP', '130'], ['MEG', '059']];
  for (const [set, num] of cards) {
    const stripped = String(num).replace(/^0+/, '') || '0';
    const hit = index[`${set.toUpperCase()}-${stripped}`];
    log(`  ${set} ${num} -> key ${set}-${stripped} -> ${hit ? 'BUTTON SHOWS (' + (hit.name_en) + ', EN img ' + hit.en.split('/').pop() + ')' : 'no button'}`);
  }
}

log('\n== friend-bot image retrieval (CloudFront, no referer) ==');
for (const url of [
  'https://d1wx537rtdixyy.cloudfront.net/expansions/series9/en-us/OP_Prize_SE9_EN_19-2x.png',
  'https://d1wx537rtdixyy.cloudfront.net/expansions/series9/de-de/OP_Prize_SE9_DE_19-2x.png',
]) {
  const r = await get(url, { Range: 'bytes=0-7' });
  const isPng = r.buf && r.buf.slice(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  log(`  ${url.split('/').pop()} -> HTTP ${r.status}, png=${isPng}, ct=${r.ct}`);
}
log('\nDONE');
