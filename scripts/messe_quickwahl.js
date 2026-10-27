/*
 * Deck-Analyse, Schnellwahl und Labs-Links (UI-153, 27.10.2026). Echte Daten aus data/, lokaler Server.
 *   node scripts/messe_quickwahl.js [hell|dunkel] [breite] [bild-leer.png] [bild-gewaehlt.png] [touch|maus]
 * Gibt EINE JSON-Zeile aus: Knoepfe je Tier, Hoehe des Blocks, Querscroll, Treffer-Klick, Labs-Links.
 */
'use strict';
const { chromium } = require('playwright');
const [schema = 'dunkel', breite = '390', bild1 = '', bild2 = '', zeiger = 'touch'] = process.argv.slice(2);
const BASIS = process.env.BASIS || 'http://127.0.0.1:8765';
(async () => {
    const b = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
    const touch = zeiger === 'touch';
    const ctx = await b.newContext({ viewport: { width: +breite, height: 900 }, deviceScaleFactor: 2,
        colorScheme: schema === 'hell' ? 'light' : 'dark', isMobile: touch, hasTouch: touch, locale: 'de-DE', serviceWorkers: 'block' });
    const p = await ctx.newPage();
    await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    if (touch) { const cdp = await ctx.newCDPSession(p); await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'pointer', value: 'coarse' }, { name: 'hover', value: 'none' }] }); }
    await p.goto(`${BASIS}/index.html#current-analysis`, { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => document.querySelectorAll('#cmQuickWahl .cm-qw-btn').length > 0, null, { timeout: 25000 }).catch(() => {});
    await p.waitForTimeout(1500);
    await p.evaluate(() => { const l = document.getElementById('dipidis-loader'); if (l) l.remove(); });
    const leer = await p.evaluate(() => {
        const h = document.getElementById('cmQuickWahl');
        const k = [...document.querySelectorAll('#cmQuickWahl .cm-qw-btn')];
        const r = h ? h.getBoundingClientRect() : null;
        const t = {}; k.forEach((x) => { t[x.dataset.tier] = (t[x.dataset.tier] || 0) + 1; });
        const klein = k.filter((x) => { const q = x.getBoundingClientRect(); return q.width < 43.5 || q.height < 43.5; }).length;
        const ohneBild = k.filter((x) => !x.querySelector('img')).length;
        return { sichtbar: !!h && !h.hidden && r.height > 0, knoepfe: k.length, jeTier: t, hoehe: r ? Math.round(r.height) : 0,
                 klein, ohneBild, querscroll: document.documentElement.scrollWidth - innerWidth, namen: k.map((x) => x.getAttribute('aria-label')) };
    });
    if (bild1) { const el = await p.$('#current-analysis'); if (el) await el.screenshot({ path: bild1 }); }
    const ziel = await p.evaluate(() => { const k = document.querySelector('#cmQuickWahl .cm-qw-btn[data-archetype*="Sharpedo" i]') || document.querySelector('#cmQuickWahl .cm-qw-btn'); return k ? k.dataset.archetype : null; });
    let gewaehlt = null;
    if (ziel) {
        await p.click(`#cmQuickWahl .cm-qw-btn[data-archetype="${ziel.replace(/"/g, '\\"')}"]`);
        await p.waitForFunction((z) => (document.getElementById('currentMetaDeckSelect') || {}).value === z, ziel, { timeout: 8000 }).catch(() => {});
        await p.waitForTimeout(4000);
        gewaehlt = await p.evaluate(() => {
            const s = document.getElementById('currentMetaDeckSelect');
            const aktiv = [...document.querySelectorAll('#cmQuickWahl .cm-qw-btn[aria-pressed="true"]')].map((x) => x.dataset.archetype);
            const sec = document.getElementById('currentMetaTop256Section');
            const links = [...document.querySelectorAll('#currentMetaTop256List .top256-entry')].map((e) => {
                const a = e.querySelector('a.top256-labs-link'); return { name: (e.querySelector('.top256-tournament') || {}).textContent, href: a ? a.getAttribute('href') : null };
            });
            return { select: s.value, aktiv, karte: !!(document.getElementById('currentMetaArchetypeCard') && !document.getElementById('currentMetaArchetypeCard').classList.contains('d-none')),
                     day2Sichtbar: !!sec && !sec.classList.contains('d-none'), links, querscroll: document.documentElement.scrollWidth - innerWidth };
        });
    }
    if (bild2) { const el = await p.$('#current-analysis'); if (el) await el.screenshot({ path: bild2 }); }
    console.log(JSON.stringify({ breite: +breite, schema, zeiger, leer, ziel, gewaehlt }));
    await b.close();
})();
