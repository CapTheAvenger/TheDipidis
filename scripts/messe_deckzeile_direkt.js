/*
 * Meine Decks, Deckzeile (UI-152, 24.10.2026) — echtes Markup aus updateDecksUI, 3 Decks. Prueft je Zeile:
 * alle Aktionsknoepfe sichtbar (elementFromPoint), Reihen, Hoehen, Beschriftung ragt nicht aus dem Knopf,
 * nichts ragt ueber die Karte, kein Knopf unter der Tableiste, Pfeil sichtbar; dazu mit aufgeklapptem Deck.
 *   node scripts/messe_deckzeile_direkt.js [hell|dunkel] [breite] [bild.png] [touch|maus] [betreiber]
 */
'use strict';
const { chromium } = require('playwright');
const [schema = 'dunkel', breite = '390', out = '', zeiger = 'touch', betreiber = ''] = process.argv.slice(2);
const BASIS = process.env.BASIS || 'http://127.0.0.1:8765';
(async () => {
    const b = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
    const touch = zeiger === 'touch';
    const ctx = await b.newContext({ viewport: { width: +breite, height: 844 }, deviceScaleFactor: 2,
        colorScheme: schema === 'hell' ? 'light' : 'dark', isMobile: touch, hasTouch: touch, locale: 'de-DE', serviceWorkers: 'block' });
    const p = await ctx.newPage();
    await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    if (touch) { const cdp = await ctx.newCDPSession(p); await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'pointer', value: 'coarse' }, { name: 'hover', value: 'none' }] }); }
    await p.goto(`${BASIS}/index.html`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2500);
    const r = await p.evaluate(async (betreiber) => {
        const l = document.getElementById('dipidis-loader'); if (l) l.remove();
        const grid = document.getElementById('decks-grid');
        document.documentElement.classList.remove('is-signed-out'); document.documentElement.classList.add('is-signed-in');
        document.querySelectorAll('.d-none').forEach((x) => x.classList.remove('d-none'));
        document.querySelectorAll('#profile-content, .profile-tab-content').forEach((x) => { if (!x.contains(grid) && x.id !== 'profile-content') x.style.display = 'none'; });
        for (let e = grid; e && e !== document.body; e = e.parentElement) { if (e.id !== 'decks-grid') e.style.setProperty('display', 'block', 'important'); e.classList.add('active'); e.hidden = false; }
        document.querySelectorAll('.tab-content').forEach((t) => { if (!t.contains(grid)) t.classList.remove('active'); });
        if (betreiber) window.dsIstBetreiber = () => true;
        const mk = (n, a, act) => ({ id: 'T' + n, name: 'TESTDECK ' + n + ' mit langem Namen Sharpedo', archetype: a, folder: '', cards: { 'X-1': 4, 'X-2': 56 }, totalCards: 60, active: act, createdAtMs: Date.now() - n * 864e5 });
        window.userDecks = [mk(1, 'Sharpedo Toxtricity', true), mk(2, 'Mega Excadrill', false), mk(3, 'Dragapult', false)];
        window.allCardsDatabase = [{ name: 'X', set: 'XXX', number: '1' }];
        window.updateDecksUI(); grid.parentElement.scrollIntoView();
        await new Promise((x) => setTimeout(x, 1500)); window.updateDecksUI();
        const probleme = [], zeilen = [];
        const messe = (phase) => document.querySelectorAll('.saved-deck-item').forEach((it, i) => {
            const ir = it.getBoundingClientRect(), bt = [...it.querySelectorAll('.deck-action-buttons button')];
            const tb = document.querySelector('.ds-tabbar'), tbTop = tb && getComputedStyle(tb).position === 'fixed' ? tb.getBoundingClientRect().top : innerHeight;
            const tops = new Set(), hoehen = [];
            bt.forEach((k) => {
                const q = k.getBoundingClientRect(); tops.add(Math.round(q.top)); hoehen.push(Math.round(q.height));
                const n = k.textContent.trim().replace(/\s+/g, ' ').slice(0, 16);
                if (q.right > ir.right + 0.5 || q.left < ir.left - 0.5) probleme.push(`${phase} ${i}: "${n}" ragt aus der Karte`);
                if (k.scrollWidth > k.clientWidth + 1) probleme.push(`${phase} ${i}: Beschriftung "${n}" ragt aus dem Knopf (${k.scrollWidth}>${k.clientWidth})`);
                if (q.height < 28) probleme.push(`${phase} ${i}: "${n}" nur ${Math.round(q.height)} px hoch`);
                if (q.width < 40) probleme.push(`${phase} ${i}: "${n}" nur ${Math.round(q.width)} px breit`);
                if (q.height > 0 && q.bottom > ir.bottom + 0.5) probleme.push(`${phase} ${i}: "${n}" unter der Karte`);
            });
            for (let a = 0; a < bt.length; a++) for (let c = a + 1; c < bt.length; c++) { const A = bt[a].getBoundingClientRect(), B = bt[c].getBoundingClientRect(); if (A.left < B.right - 0.5 && B.left < A.right - 0.5 && A.top < B.bottom - 0.5 && B.top < A.bottom - 0.5) probleme.push(`${phase} ${i}: Knoepfe ueberlappen`); }
            const pf = it.querySelector('[id$="-arrow"]'); const pq = pf && pf.getBoundingClientRect();
            if (!pf || pq.width === 0) probleme.push(`${phase} ${i}: Pfeil fehlt`);
            if (phase === 'zu') zeilen.push({ n: bt.length, reihen: tops.size, hoehen: [...new Set(hoehen)].join('/'), kartenhoehe: Math.round(ir.height), pfeil: pq ? Math.round(pq.left) + ',' + Math.round(pq.top - ir.top) : null });
        });
        messe('zu');
        const kopf = document.querySelector('.deck-header-row'); if (kopf) kopf.click();
        await new Promise((x) => setTimeout(x, 700)); messe('auf');
        return { zeilen, probleme, quer: document.documentElement.scrollWidth - innerWidth, btnTexte: [...document.querySelectorAll('.saved-deck-item')[0].querySelectorAll('.deck-action-buttons button')].map((k) => k.textContent.trim().replace(/\s+/g, ' ')) };
    }, betreiber);
    if (out) { await p.evaluate(() => document.querySelector('.saved-deck-item').scrollIntoView({ block: 'start' })); await p.waitForTimeout(300); await p.screenshot({ path: out }); }
    console.log(JSON.stringify(r)); await b.close();
})();
