/*
 * Jeder Tab am Telefon (390 px, Touch): ragt etwas ueber den Rand, Querscroll der Seite, Beschriftung ueber Knopf-/Zellrand,
 * zu kleine Tippflaechen, zu kleine Schrift. Gibt je Tab eine Zeile + Bild (halbe Skalierung) aus.
 *   node scripts/messe_seiten_mobil.js [hell|dunkel] [breite] [ausgabeordner] [tab ...]
 */
'use strict';
const { chromium } = require('playwright');
const [schema = 'dunkel', breite = '390', dir = '/tmp/seiten', ...nur] = process.argv.slice(2);
const TABS = ['current-meta','current-analysis','city-league','city-league-analysis','past-meta','meta-call','cards','proxy','side-quest','pocket','calculator','tutorial','quellen','profile'];
(async () => {
  require('fs').mkdirSync(dir, { recursive: true });
  const b = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const ctx = await b.newContext({ viewport: { width: +breite, height: 844 }, deviceScaleFactor: 1, colorScheme: schema === 'hell' ? 'light' : 'dark', isMobile: true, hasTouch: true, locale: 'de-DE', serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'pointer', value: 'coarse' }, { name: 'hover', value: 'none' }] });
  await p.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3000);
  for (const t of (nur.length ? nur : TABS)) {
    const r = await p.evaluate(async (tab) => {
      const l = document.getElementById('dipidis-loader'); if (l) l.remove();
      window.switchTab(tab);
      await new Promise((x) => setTimeout(x, 3500));
      const root = document.getElementById(tab); if (!root) return { fehlt: true };
      const W = window.innerWidth, sicht = (e) => { const s = getComputedStyle(e), q = e.getBoundingClientRect(); return s.visibility !== 'hidden' && s.display !== 'none' && q.width > 0 && q.height > 0; };
      const kurz = (e) => (e.className && e.className.baseVal === undefined ? String(e.className).split(' ')[0] : e.tagName) + ' "' + (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24) + '"';
      const aus = [], klemmt = [], klein = [], schrift = [];
      const inScroller = (e) => { for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) { const o = getComputedStyle(a).overflowX; if ((o === 'auto' || o === 'scroll') && a.scrollWidth > a.clientWidth) return true; } return false; };
      root.querySelectorAll('*').forEach((e) => {
        if (!sicht(e) || e.closest('svg')) return;
        const q = e.getBoundingClientRect();
        if ((q.right > W + 1 || q.left < -1) && !inScroller(e) && !e.closest('[aria-hidden="true"]')) aus.push(kurz(e) + ' ' + Math.round(q.left) + '..' + Math.round(q.right));
        const s = getComputedStyle(e);
        if (/^(BUTTON|A|LABEL|TH|TD|SPAN|SELECT|SUMMARY)$/.test(e.tagName) && e.scrollWidth > e.clientWidth + 1 && s.overflowX !== 'auto' && s.overflowX !== 'scroll' && s.textOverflow !== 'ellipsis' && e.children.length === 0 && (e.textContent || '').trim())
          klemmt.push(kurz(e) + ' ' + e.scrollWidth + '>' + e.clientWidth);
        if ((e.tagName === 'BUTTON' || e.tagName === 'A' || e.getAttribute('role') === 'button') && (q.height < 30 || q.width < 30) && !e.closest('.ds-tabbar') && (e.textContent || '').trim().length) klein.push(kurz(e) + ' ' + Math.round(q.width) + 'x' + Math.round(q.height));
        if (parseFloat(s.fontSize) < 10 && (e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))) schrift.push(kurz(e) + ' ' + s.fontSize);
      });
      const u = (a) => [...new Set(a)];
      return { quer: document.documentElement.scrollWidth - W, hoehe: document.documentElement.scrollHeight, aus: u(aus).slice(0, 8), klemmt: u(klemmt).slice(0, 8), klein: u(klein).length + ' ' + u(klein).slice(0, 5).join(' | '), schrift: u(schrift).slice(0, 4) };
    }, t);
    await p.screenshot({ path: `${dir}/${schema}-${breite}-${t}.png`, fullPage: false });
    console.log(t, JSON.stringify(r));
  }
  await b.close();
})();
