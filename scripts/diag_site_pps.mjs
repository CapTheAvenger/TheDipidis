// TEMP diagnostic (no browser): confirm the DEPLOYED site has the Prize Pack
// "alternative print" tile code + i18n + data, and re-check the lookup.
import https from 'node:https';
const SITE = 'https://thedipidis.app';
const log = (...a) => console.log(...a);
function get(url, headers = {}) {
  return new Promise((resolve) => {
    const req = https.request(url, { method: 'GET', headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, buf: Buffer.concat(chunks) }));
    });
    req.on('error', (e) => resolve({ status: null, err: String(e).slice(0, 80) }));
    req.setTimeout(25000, () => { req.destroy(); resolve({ status: null, err: 'timeout' }); });
    req.end();
  });
}
const v = await get(`${SITE}/version.json`);
log('version.json ->', v.status, v.buf ? v.buf.toString().slice(0, 60) : '');
for (const [file, needle] of [
  ['js/app-cards-db.js', 'rarity-option-prizepack'],
  ['js/app-cards-db.js', 'prizePackImagesIndex'],
  ['js/i18n.js', 'rarity.prizePackPrint'],
  ['css/styles.css', 'rarity-option-prizepack'],
]) {
  const r = await get(`${SITE}/${file}`);
  const has = r.buf ? r.buf.toString().includes(needle) : false;
  log(`  ${file} has "${needle}": ${has} (HTTP ${r.status})`);
}
const pj = await get(`${SITE}/data/prizepack_official_images.json`);
let idx = null; try { idx = JSON.parse(pj.buf.toString()); } catch {}
log('prizepack JSON entries:', idx ? Object.keys(idx).length : 'FAIL');
if (idx) {
  for (const [s, n] of [['DRI', '081'], ['POR', '021']]) {
    const k = `${s}-${String(n).replace(/^0+/, '') || '0'}`;
    log(`  ${s} ${n} -> ${idx[k] ? 'TILE (' + idx[k].name_en + ', ' + idx[k].en.split('/').pop() + ')' : 'none'}`);
  }
}
log('DONE');
