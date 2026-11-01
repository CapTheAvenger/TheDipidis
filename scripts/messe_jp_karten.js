/* UI-154: misst den Block "Meistgespielte Karten – nur in Japan" auf der Japan-Seite.
   node scripts/messe_jp_karten.js [breite] [bild.png] [hell|dunkel]   (Server auf :8765) */
const { chromium } = require('playwright');
(async () => {
  const breite = +process.argv[2] || 390, bild = process.argv[3], modus = process.argv[4] || 'hell';
  const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
  const ctx = await b.newContext({ viewport: { width: breite, height: 900 }, hasTouch: breite < 700, isMobile: breite < 700, colorScheme: modus === 'dunkel' ? 'dark' : 'light' });
  const p = await ctx.newPage();
  await p.route(/^https?:\/\/(?!localhost)/, r => r.abort());
  await p.goto('http://localhost:8765/#city-league');
  await p.waitForSelector('#cityLeagueJpKarten .jp-karte, #cityLeagueJpKarten .jp-karten-leer', { timeout: 60000 });
  const o = await p.evaluate(() => {
    const m = document.getElementById('cityLeagueJpKarten');
    const k = [...m.querySelectorAll('.jp-karte')];
    const r = k.map(x => x.getBoundingClientRect());
    const knopf = m.querySelector('.jp-karten-kopieren');
    const kr = knopf && knopf.getBoundingClientRect();
    const ueber = k.filter(x => x.scrollWidth > x.clientWidth + 1).length;
    return { karten: k.length, spalten: new Set(r.map(x => Math.round(x.left))).size, breiteKarte: r[0] && Math.round(r[0].width),
      knopf: kr && [Math.round(kr.width), Math.round(kr.height)], docBreit: document.documentElement.scrollWidth, fenster: innerWidth,
      ueberlauf: ueber, text: m.querySelector('.jp-karten-info')?.textContent, erste: m.querySelector('.jp-karte-text')?.innerText.replace(/\n/g, ' | ') };
  });
  console.log(JSON.stringify(o));
  if (bild) { await p.locator('#cityLeagueJpKarten').scrollIntoViewIfNeeded(); await p.locator('#cityLeagueJpKarten').screenshot({ path: bild }); }
  await b.close();
})();
