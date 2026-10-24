/*
 * "Mehr"-Menue in Meine Decks am Telefon messen (UI-146/149, 24.10.2026) — echtes Markup aus updateDecksUI,
 * drei Decks, Menue am LETZTEN Deck geoeffnet, 390 px, mit Touch. Prueft, ob jeder Menuepunkt WIRKLICH
 * sichtbar und anklickbar ist (elementFromPoint), und nennt den abschneidenden Vorfahren.
 * Aufruf (Server: python3 -m http.server 8765):
 *   node scripts/messe_mehr_menue.js [hell|dunkel] [deck-nr 0..2] [bild.png]
 */
'use strict';
const { chromium } = require('playwright');
const [schema = 'dunkel', nr = '2', out = '', anzahl = '3', lage = 'ende', breite = '390'] = process.argv.slice(2);
const BASIS = process.env.BASIS || 'http://127.0.0.1:8765';
(async () => {
    const b = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
    const ctx = await b.newContext({ viewport: { width: +breite, height: 844 }, deviceScaleFactor: 2,
        colorScheme: schema === 'hell' ? 'light' : 'dark', isMobile: true, hasTouch: true, locale: 'de-DE', serviceWorkers: 'block' });
    const p = await ctx.newPage();
    await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'pointer', value: 'coarse' }, { name: 'hover', value: 'none' }] });
    await p.goto(`${BASIS}/index.html`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2500);
    const r = await p.evaluate(async ([nr, anzahl, lage]) => {
        const l = document.getElementById('dipidis-loader'); if (l) l.remove();
        const grid = document.getElementById('decks-grid');
        document.documentElement.classList.remove('is-signed-out'); document.documentElement.classList.add('is-signed-in');
        document.querySelectorAll('.d-none').forEach((x) => x.classList.remove('d-none'));
        document.querySelectorAll('#profile-content, .profile-tab-content').forEach((x) => { if (!x.contains(grid) && x.id !== 'profile-content') x.style.display = 'none'; });
        for (let e = grid; e && e !== document.body; e = e.parentElement) {
            if (e.id !== 'decks-grid') e.style.setProperty('display', 'block', 'important'); e.classList.add('active'); e.hidden = false;
        }
        document.querySelectorAll('.tab-content').forEach((t) => { if (!t.contains(grid)) t.classList.remove('active'); });
        const mk = (n, a, act) => ({ id: 'T' + n, name: 'TESTDECK ' + n, archetype: a, folder: '', cards: { 'X-1': 4, 'X-2': 56 }, totalCards: 60, active: act, createdAtMs: Date.now() - n * 864e5 });
        window.userDecks = Array.from({ length: +anzahl }, (_, i) => mk(i + 1, i % 2 ? 'Mega Excadrill' : 'Sharpedo Toxtricity', i === +anzahl - 1));
        window.allCardsDatabase = [{ name: 'X', set: 'XXX', number: '1' }];
        window.updateDecksUI();
        grid.parentElement.scrollIntoView();
        await new Promise((x) => setTimeout(x, 1500));
        window.updateDecksUI();
        const d = document.querySelectorAll('.saved-deck-item')[+nr].querySelector('details.deck-mehr');
        const ziel = document.querySelectorAll('.saved-deck-item')[+nr]; if (lage === 'ende') { document.body.scrollTop = 1e6; window.scrollTo({ top: 1e6, behavior: 'instant' }); } else if (lage === 'mitte') ziel.scrollIntoView({ block: 'center', behavior: 'instant' }); else ziel.scrollIntoView({ block: 'start', behavior: 'instant' });
        await new Promise((x) => setTimeout(x, 700));
        const sr = d.getBoundingClientRect(); window.__vor = { top: Math.round(sr.top), scrollY: Math.round(scrollY), max: document.documentElement.scrollHeight - innerHeight }; window.__unsichtbar = sr.bottom < 0 || sr.top > innerHeight;
        d.open = true; d.dispatchEvent(new Event('toggle'));
        await new Promise((x) => setTimeout(x, 900));
        const tbTop = (document.querySelector('.ds-tabbar') || { getBoundingClientRect: () => ({ top: innerHeight }) }).getBoundingClientRect().top;
        window.__diag = []; for (let e = d; e; e = e.parentElement) { const c = getComputedStyle(e); if (c.display === 'none' || e.getBoundingClientRect().height === 0) window.__diag.push((e.id || e.tagName) + '.' + String(e.className).split(' ')[0] + ' d=' + c.display); }
        const m = d.querySelector('.deck-mehr-menue'), q = m.getBoundingClientRect();
        const vh = innerHeight, sc = document.scrollingElement;
        const punkte = [...m.querySelectorAll('.deck-mehr-item')].map((it) => {
            const a = it.getBoundingClientRect(), x = a.left + a.width / 2, y = a.top + a.height / 2;
            const hit = y >= 0 && y <= vh ? document.elementFromPoint(x, y) : null;
            return { t: it.textContent.trim().slice(0, 14), y: Math.round(y), ok: !!(hit && it.contains(hit)) };
        });
        const klemmt = [];
        for (let e = m.parentElement; e; e = e.parentElement) {
            const cs = getComputedStyle(e);
            if (/hidden|auto|scroll|clip/.test(cs.overflowY + cs.overflowX)) {
                const r = e.getBoundingClientRect();
                if (r.bottom < q.bottom - 1 || r.top > q.top + 1) klemmt.push((e.id ? '#' + e.id : '') + '.' + String(e.className).split(' ')[0] + ' bottom=' + Math.round(r.bottom) + ' overflow=' + cs.overflowY);
            }
        }
        const bd = document.body, de = document.documentElement; window.__sc = { body: [bd.scrollTop, bd.scrollHeight, bd.clientHeight, getComputedStyle(bd).overflowY], html: [de.scrollTop, de.scrollHeight, de.clientHeight, getComputedStyle(de).overflowY], win: scrollY };
        const lb = document.querySelector('.ds-tabbar'); const ls = document.documentElement.scrollWidth - innerWidth; return { vor: window.__vor, nach: Math.round(scrollY), unsichtbar: window.__unsichtbar, quer: ls, sc: window.__sc, leiste: lb ? Math.round(lb.getBoundingClientRect().top) + ' ' + getComputedStyle(lb).position : 'fehlt', tabbar: Math.round(tbTop), coarse: matchMedia('(pointer: coarse)').matches, oben: d.classList.contains('deck-mehr--oben'), fenster: vh,
            menue: { top: Math.round(q.top), bottom: Math.round(q.bottom), h: Math.round(q.height) }, punkte, nichtKlickbar: punkte.filter((x) => !x.ok).map((x) => x.t), klemmt };
    }, [nr, anzahl, lage]);
    console.log(JSON.stringify(r));
    if (out) await p.screenshot({ path: out });
    await b.close();
})();
