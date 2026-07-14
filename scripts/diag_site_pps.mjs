// TEMP diagnostic (no browser): confirm the DEPLOYED site has the Card Database
// grid Prize Pack tile code + the switcher tile + data.
import https from 'node:https';
const SITE = 'https://thedipidis.app';
const log = (...a) => console.log(...a);
function get(url) {
  // Cache-bust so we read the TRUE deployed asset, not a stale CDN edge copy.
  const busted = url + (url.includes('?') ? '&' : '?') + 'cb=' + Date.now() + Math.random().toString(36).slice(2);
  return new Promise((resolve) => {
    const req = https.request(busted, { method: 'GET', headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' } }, (res) => {
      const c = []; res.on('data', x => c.push(x));
      res.on('end', () => resolve({ status: res.statusCode, buf: Buffer.concat(c) }));
    });
    req.on('error', e => resolve({ status: null, err: String(e).slice(0, 80) }));
    req.setTimeout(25000, () => { req.destroy(); resolve({ status: null, err: 'timeout' }); });
    req.end();
  });
}
const v = await get(`${SITE}/version.json`);
log('version.json ->', v.status, v.buf ? v.buf.toString().slice(0, 60) : '');
for (const [file, needle] of [
  ['js/app-cards-db.js', 'card-database-prizepack'],
  ['js/app-cards-db.js', 'createPrizePackDatabaseItem'],
  ['js/app-cards-db.js', '__prizePack'],
  ['css/styles.css', 'card-database-prizepack'],
]) {
  const r = await get(`${SITE}/${file}`);
  log(`  ${file} has "${needle}": ${r.buf ? r.buf.toString().includes(needle) : false} (HTTP ${r.status})`);
}
log('DONE');
