/*
 * Kartenkachel in "Meine Decks" am Telefon messen (UI-148, 24.10.2026) — MIT Touch, MIT Kartenbild.
 * Warum: auf Hausis iPhone deckten die sieben Knoepfe der Kachel (−, ★, +, Preis, Kiste, Herz, ✕) die ganze
 * Karte zu. Gleiche Familie wie UI-142: css/tippziele.css `button:not(…) { min-height: 44px !important }`
 * unter `pointer: coarse` schlaegt die Klassenregel `.my-deck-card-btn`.
 * Die Kachel braucht ein angemeldetes Konto; hier wird ihr Markup (wie in js/firebase-collection.js) in
 * #decks-grid gesetzt — Vorfahren und Regeln sind die echten.
 * Aufruf (Server: python3 -m http.server 8765):  node scripts/messe_meinedecks_kachel.js [hell|dunkel] [touch|maus] [bild.png]
 */
'use strict';
const { chromium } = require('playwright');
const [schema = 'dunkel', zeiger = 'touch', out = ''] = process.argv.slice(2);
const BASIS = process.env.BASIS || 'http://127.0.0.1:8765';
const KACHEL = (i) => `
<div class="my-deck-card-tile">
  <img src="/images/_platzhalter.png" alt="K${i}" class="my-deck-card-img">
  <div class="my-deck-card-count">${(i % 4) + 1}</div>
  <div class="my-deck-card-actions">
    <div class="my-deck-card-row">
      <button class="my-deck-card-btn my-deck-card-btn--remove">−</button>
      <button class="my-deck-card-btn my-deck-card-btn--rarity">★</button>
      <button class="my-deck-card-btn my-deck-card-btn--add">+</button>
    </div>
    <div class="my-deck-card-row my-deck-card-row--four">
      <button class="my-deck-card-btn my-deck-card-btn--market" style="background:#f57c00;">${['0,05','16,16','331,99','19,10'][i % 4]}€</button>
      <button class="my-deck-card-btn my-deck-card-btn--coll my-deck-card-btn--coll-tiny">\u{1F4E6}+</button>
      <button class="my-deck-card-btn my-deck-card-btn--wish">❤</button>
      <button class="my-deck-card-btn my-deck-card-btn--delete">✕</button>
    </div>
  </div>
</div>`;
(async () => {
    const b = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
    const mal = await b.newPage();
    const dataUrl = await mal.evaluate(() => {
        const c = document.createElement('canvas'); c.width = 245; c.height = 342;
        const g = c.getContext('2d'); g.fillStyle = '#d6c478'; g.fillRect(0, 0, 245, 342);
        g.fillStyle = '#78aadc'; g.fillRect(20, 40, 205, 150); return c.toDataURL('image/png');
    });
    await mal.close();
    const png = Buffer.from(dataUrl.split(',')[1], 'base64');
    const touch = zeiger === 'touch';
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
        colorScheme: schema === 'hell' ? 'light' : 'dark', isMobile: touch, hasTouch: touch, locale: 'de-DE', serviceWorkers: 'block' });
    const p = await ctx.newPage();
    await p.route('**/images/_platzhalter.png', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: png }));
    await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.request().resourceType() === 'image'
        ? r.fulfill({ status: 200, contentType: 'image/png', body: png }) : r.abort());
    if (touch) {
        const cdp = await ctx.newCDPSession(p);
        await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'pointer', value: 'coarse' }, { name: 'hover', value: 'none' }] });
    }
    await p.goto(`${BASIS}/index.html`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2500);
    const r = await p.evaluate(async (html) => {
        const l = document.getElementById('dipidis-loader'); if (l) l.remove();
        const grid0 = document.getElementById('decks-grid');
        for (let e = grid0; e && e !== document.body; e = e.parentElement) {
            e.style.setProperty('display', 'block', 'important'); e.classList.add('active'); e.hidden = false;
        }
        document.querySelectorAll('.tab-content').forEach((t) => { if (!t.contains(grid0)) t.classList.remove('active'); });
        const wrap = document.createElement('div');
        wrap.innerHTML = '<div class="my-deck-cards-grid">' + html + '</div>';
        grid0.prepend(wrap);
        const g = wrap.firstElementChild; g.scrollIntoView();
        const img = g.querySelector('img');
        for (let i = 0; i < 40 && !(img.complete && img.naturalWidth > 0); i++) await new Promise((x) => setTimeout(x, 100));
        const k = g.querySelector('.my-deck-card-tile'), act = k.querySelector('.my-deck-card-actions');
        const bx = (el) => { const q = el.getBoundingClientRect(); return { w: +q.width.toFixed(1), h: +q.height.toFixed(1) }; };
        return {
            coarse: matchMedia('(pointer: coarse)').matches, spalten: getComputedStyle(g).gridTemplateColumns.split(' ').length,
            kachel: bx(k), bild: bx(img), knopfleiste: bx(act),
            knoepfe: [...k.querySelectorAll('button')].map((x) => `${x.textContent.trim()} ${bx(x).w}x${bx(x).h}`),
            ueberlauf: [...k.querySelectorAll('button')].concat([...g.querySelectorAll('.my-deck-card-btn--market')]).filter((x) => x.scrollWidth > x.clientWidth + 1).map((x) => x.textContent.trim() + ' ' + x.scrollWidth + '>' + x.clientWidth),
            verdeckt: Math.round(act.getBoundingClientRect().height / img.getBoundingClientRect().height * 100) + ' % des Bildes',
        };
    }, [1, 2, 3, 4, 5, 6, 7, 8].map(KACHEL).join(''));
    console.log(JSON.stringify(r));
    if (out) { const g = await p.$('.my-deck-cards-grid'); await g.screenshot({ path: out }); }
    await b.close();
})();
